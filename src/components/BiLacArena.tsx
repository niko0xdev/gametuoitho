import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  UserPlus,
  Swords,
  Trophy,
  Calendar,
  History,
  Plus,
  Minus,
  Trash2,
  Check,
  AlertCircle,
  Shuffle,
  Timer,
  RefreshCw,
  RotateCcw,
  UserCheck,
  Heart,
  QrCode,
  Copy,
  X,
  Sparkles,
  Loader2,
  Shield,
  LogIn
} from 'lucide-react';
import { BiLacPlayer, BiLacMatch, UserProfile } from '../types';

// Simple sound synthesizer for retro beep effects
const playBeep = (freq: number, type: OscillatorType = 'sine', duration = 0.1) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Audio contexts can fail or be blocked by browser autoplay policies
  }
};

export default function BiLacArena({
  userProfile,
  onOpenAuthModal,
}: {
  userProfile?: UserProfile | null;
  onOpenAuthModal?: () => void;
} = {}) {
  const loggedInUserId = userProfile?.id ?? null;
  const [players, setPlayers] = useState<BiLacPlayer[]>([]);
  const [matches, setMatches] = useState<BiLacMatch[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // AI bulk-add players
  const [aiBulkText, setAiBulkText] = useState('');
  const [isAiBulkLoading, setIsAiBulkLoading] = useState(false);
  const [aiBulkPreview, setAiBulkPreview] = useState<string[] | null>(null);
  const [activeTab, setActiveTab] = useState<'matchmaking' | 'leaderboards' | 'history' | 'members'>('matchmaking');
  const [leaderboardTab, setLeaderboardTab] = useState<'weekly' | 'alltime'>('weekly');

  // Donate States
  const [isDonateModalOpen, setIsDonateModalOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<number | ''>(20000);
  const [copiedField, setCopiedField] = useState<'account' | 'content' | null>(null);

  // Tournament States
  // Không auto-restore currentTournament từ localStorage — reload trang sẽ đưa user
  // về portal list (luồng rõ ràng) thay vì tự động vào lại tour cũ.
  const [currentTournament, setCurrentTournament] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [lastVisitedTournament, setLastVisitedTournament] = useState<{ id: string; name: string } | null>(() => {
    try {
      const raw = localStorage.getItem('bilac_tournament');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [myTournaments, setMyTournaments] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('bilac_my_tournaments');
      const parsed = cached ? JSON.parse(cached) : [];
      // Strip any cached default-seed tours so the list only contains entries
      // that the server actually granted this user membership to.
      return Array.isArray(parsed)
        ? parsed.filter((t: any) => t && t.id !== 'default-tour')
        : [];
    } catch {
      return [];
    }
  });
  const [allTournaments, setAllTournaments] = useState<any[]>([]);
  const [accessCodeInput, setAccessCodeInput] = useState<string>('');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [isCreatingTournament, setIsCreatingTournament] = useState<boolean>(false);
  const [newTournamentName, setNewTournamentName] = useState<string>('');
  const [newTournamentCode, setNewTournamentCode] = useState<string>('');
  const [newTournamentDesc, setNewTournamentDesc] = useState<string>('');

  // Members state (fetched for owner when on members tab)
  const [members, setMembers] = useState<Array<{ userId: string; username: string; displayName: string; role: 'owner' | 'member'; joinedAt: number }>>([]);
  const [inviteUsername, setInviteUsername] = useState<string>('');
  const [myMemberRole, setMyMemberRole] = useState<'owner' | 'member' | null>(null);

  // Portal tabs: 'all' = default; 'joined' = chỉ giải user là thành viên.
  const [portalTab, setPortalTab] = useState<'all' | 'joined'>('all');
  // Modal state — 2 quick-action buttons (Tạo / Tham gia) open these.
  const [joinModalOpen, setJoinModalOpen] = useState<boolean>(false);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  // When a tournament card is clicked, preselect it in the Join modal.
  const [preselectJoinTournamentId, setPreselectJoinTournamentId] = useState<string>('');

  // List shape from /api/bilac/tournaments. Includes memberCount + isMember.
  type PortalTournament = {
    id: string; name: string; description?: string; createdAt: number;
    memberCount: number; isMember: boolean;
  };

  // Sort + filter the portal grid. Members first (across both tabs), then createdAt desc.
  const visibleTournaments = useMemo<PortalTournament[]>(() => {
    const filtered = portalTab === 'joined'
      ? allTournaments.filter((t: any) => t.isMember)
      : allTournaments;
    return [...filtered].sort((a: any, b: any) =>
      Number(b.isMember) - Number(a.isMember) || b.createdAt - a.createdAt
    );
  }, [allTournaments, portalTab]);

  // Custom fetch function with tournament credentials + current user id in headers.
  // Always attaches x-user-id when logged in (covers /api/bilac/* AND other backend routes
  // that need to identify the caller).
  //
  // Race-condition fix: on first render after deeplink/refresh, `userProfile` is still
  // null (App.tsx's `fetchProfile` resolves async). The userId IS already in
  // localStorage.auth_userId (single source of truth — see src/lib/api.ts#3-6).
  // Fall back to it so we don't 401 on the very first fetch.
  const bilacFetch = async (url: string, options: RequestInit = {}) => {
    const tid = currentTournament?.id || localStorage.getItem('bilac_tournament') || '';
    const code = localStorage.getItem('bilac_tournament_code') || '';
    const effectiveUserId = loggedInUserId || localStorage.getItem('auth_userId') || '';
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
      'x-tournament-id': tid,
      'x-tournament-code': code,
    };
    if (effectiveUserId) headers['x-user-id'] = effectiveUserId;
    return fetch(url, { ...options, headers });
  };

  // Fetch all tournaments for the portal
  const fetchTournaments = async () => {
    try {
      const res = await bilacFetch('/api/bilac/tournaments');
      if (res.ok) {
        const data = await res.json();
        setAllTournaments(data);
        // Cross-check cached myTournaments against the API result so cards for tours
        // the current user no longer has access to (removed by owner, or never a member)
        // don't leak from localStorage.
        setMyTournaments(prev => {
          const allowedIds = new Set(data.map((d: any) => d.id));
          const filtered = prev.filter(t => allowedIds.has(t.id));
          if (filtered.length !== prev.length) {
            localStorage.setItem('bilac_my_tournaments', JSON.stringify(filtered));
          }
          return filtered;
        });
        if (data.length > 0 && !selectedTournamentId) {
          setSelectedTournamentId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching tournaments:', e);
    }
  };

  // Load players and matches on mount
  const fetchData = async () => {
    if (!currentTournament) return;
    setLoading(true);
    setError(null);
    try {
      const [resPlayers, resMatches] = await Promise.all([
        bilacFetch('/api/bilac/players'),
        bilacFetch('/api/bilac/matches')
      ]);
      if (resPlayers.ok && resMatches.ok) {
        const pData = await resPlayers.json();
        const mData = await resMatches.json();
        setPlayers(pData);
        setMatches(mData.sort((a: BiLacMatch, b: BiLacMatch) => b.timestamp - a.timestamp));
      } else {
        const errPlayers = await resPlayers.json().catch(() => ({}));
        const errMatches = await resMatches.json().catch(() => ({}));
        setError(errPlayers.error || errMatches.error || 'Mã truy cập giải đấu đã hết hạn hoặc không chính xác!');
        if (resPlayers.status === 401 || resPlayers.status === 403) {
          handleLogoutTournament();
        }
      }
    } catch (e) {
      console.error('Lỗi khi tải dữ liệu Bi Lắc:', e);
      setError('Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  // Fetch members of the current tournament (any member can read).
  const fetchMembers = async () => {
    if (!currentTournament) return;
    try {
      const res = await bilacFetch('/api/bilac/tournaments/members');
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        const me = (data.members || []).find((m: any) => m.userId === loggedInUserId);
        setMyMemberRole(me?.role ?? null);
      }
    } catch (e) {
      console.error('Lỗi tải members:', e);
    }
  };

  // Owner: mời user mới qua username.
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) {
      setError('Vui lòng nhập username!');
      return;
    }
    setLoading(true);
    try {
      const res = await bilacFetch('/api/bilac/tournaments/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inviteUsername.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể thêm thành viên!');
        return;
      }
      setSuccessMsg(`Đã thêm @${data.member.username} vào giải đấu!`);
      setInviteUsername('');
      await fetchMembers();
    } catch (err) {
      setError('Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  // Owner: xoá member khỏi giải.
  const handleRemoveMember = async (userId: string, username: string) => {
    if (!confirm(`Xoá @${username} khỏi giải đấu?`)) return;
    setLoading(true);
    try {
      const res = await bilacFetch(`/api/bilac/tournaments/members/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg(`Đã xoá @${username} khỏi giải!`);
        await fetchMembers();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Không thể xoá thành viên!');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentTournament) {
      fetchTournaments();
    } else {
      fetchData();
      fetchMembers();
    }
    if (currentTournament && activeTab === 'members') {
      fetchMembers();
    }
  }, [currentTournament, activeTab]);

  // Logout/switch tournament
  const handleLogoutTournament = () => {
    localStorage.removeItem('bilac_tournament');
    localStorage.removeItem('bilac_tournament_code');
    setCurrentTournament(null);
    setPlayers([]);
    setMatches([]);
    playBeep(220, 'sawtooth', 0.2);
  };

  // Handle copy to clipboard
  const handleCopyText = (text: string, field: 'account' | 'content') => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      playBeep(987, 'sine', 0.08);
      setTimeout(() => {
        setCopiedField(null);
      }, 2000);
    } catch (err) {
      console.error('Không thể sao chép:', err);
    }
  };

  // Access an existing tournament with code
  const handleAccessTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!selectedTournamentId) {
      setError('Vui lòng chọn một giải đấu!');
      return;
    }
    if (!accessCodeInput.trim()) {
      setError('Vui lòng nhập mã truy cập giải đấu!');
      return;
    }

    setLoading(true);
    try {
      const res = await bilacFetch('/api/bilac/tournaments/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: selectedTournamentId,
          code: accessCodeInput.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Mã truy cập không đúng!');
        playBeep(180, 'sawtooth', 0.3);
      } else {
        // KHÔNG auto-set currentTournament ở đây: set khi user thực sự vào trận.
        // Chỉ track "last visited" để hiện nút resume ở portal.
        const trimmedCode = accessCodeInput.trim();
        localStorage.setItem('bilac_tournament_code', trimmedCode);
        localStorage.setItem(`bilac_tournament_code_${data.tournament.id}`, trimmedCode);
        localStorage.setItem('bilac_tournament', JSON.stringify(data.tournament));
        setLastVisitedTournament({ id: data.tournament.id, name: data.tournament.name });
        setCurrentTournament(data.tournament);

        // Update personal list — KHÔNG lưu code vào cache để tránh rò rỉ access code qua localStorage.
        const newTour = {
          id: data.tournament.id,
          name: data.tournament.name,
          description: data.tournament.description || '',
          lastAccessed: Date.now()
        };
        const updated = [newTour, ...myTournaments.filter(t => t.id !== newTour.id)];
        localStorage.setItem('bilac_my_tournaments', JSON.stringify(updated));
        setMyTournaments(updated);

        setCurrentTournament(data.tournament);
        setAccessCodeInput('');
        playBeep(880, 'sine', 0.2);
        // Refresh portal list so the just-accessed card flips isMember=true
        // (powers the "Đang tham gia" badge on reload / when navigating back).
        fetchTournaments();
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  // Quick resume last-visited tournament from the explicit "Vào lại" card.
  const handleResumeLastTournament = async () => {
    if (!lastVisitedTournament) return;
    const persistedCode = localStorage.getItem(`bilac_tournament_code_${lastVisitedTournament.id}`);
    if (!persistedCode) {
      // Cache cleared (logout) — đưa user vào form để nhập lại code.
      setSelectedTournamentId(lastVisitedTournament.id);
      setError('Vui lòng nhập lại mã code truy cập để vào giải đấu này.');
      return;
    }
    await handleQuickAccessTournament({ id: lastVisitedTournament.id, name: lastVisitedTournament.name, code: persistedCode });
  };

  // Quick access a previously entered tournament
  const handleQuickAccessTournament = async (tour: any) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    // Cache không lưu code nữa — nếu tour trong cache chưa có code, lấy code đã lưu riêng
    // cho tour này (nếu có) hoặc yêu cầu nhập lại.
    const code = tour.code || localStorage.getItem(`bilac_tournament_code_${tour.id}`) || '';
    if (!code) {
      setLoading(false);
      setError('Vui lòng nhập mã code truy cập ở form bên dưới để vào giải đấu này.');
      setSelectedTournamentId(tour.id);
      return;
    }
    try {
      const res = await bilacFetch('/api/bilac/tournaments/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: tour.id,
          code
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Không thể truy cập giải đấu "${tour.name}". Có thể mã truy cập đã bị đổi hoặc giải đấu không còn tồn tại!`);
        playBeep(180, 'sawtooth', 0.3);
      } else {
        localStorage.setItem('bilac_tournament', JSON.stringify(data.tournament));
        localStorage.setItem('bilac_tournament_code', code);
        localStorage.setItem(`bilac_tournament_code_${tour.id}`, code);

        // Update timestamp — KHÔNG lưu access code vào cache để tránh rò rỉ qua localStorage.
        const { code: _omit, ...tourNoCode } = tour;
        const updated = [
          { ...tourNoCode, lastAccessed: Date.now() },
          ...myTournaments.filter(t => t.id !== tour.id)
        ];
        localStorage.setItem('bilac_my_tournaments', JSON.stringify(updated));
        setMyTournaments(updated);

        setCurrentTournament(data.tournament);
        playBeep(880, 'sine', 0.2);
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  // Remove a tournament from the saved/participating list
  const handleRemoveFromMyTournaments = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering click
    const updated = myTournaments.filter(t => t.id !== id);
    localStorage.setItem('bilac_my_tournaments', JSON.stringify(updated));
    setMyTournaments(updated);
    playBeep(300, 'sine', 0.1);
  };

  // Create a new private tournament
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!newTournamentName.trim()) {
      setError('Tên giải đấu không được bỏ trống!');
      return;
    }
    if (!newTournamentCode.trim()) {
      setError('Mã truy cập giải đấu không được bỏ trống!');
      return;
    }

    setLoading(true);
    try {
      const res = await bilacFetch('/api/bilac/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTournamentName.trim(),
          code: newTournamentCode.trim(),
          description: newTournamentDesc.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không thể tạo giải đấu!');
        playBeep(180, 'sawtooth', 0.3);
      } else {
        setSuccessMsg(`Đã tạo thành công giải đấu "${data.tournament.name}"!`);
        localStorage.setItem('bilac_tournament', JSON.stringify(data.tournament));
        const trimmedNewCode = newTournamentCode.trim();
        localStorage.setItem('bilac_tournament_code', trimmedNewCode);
        localStorage.setItem(`bilac_tournament_code_${data.tournament.id}`, trimmedNewCode);

        // Save to myTournaments list (không cache access code).
        const newTour = {
          id: data.tournament.id,
          name: data.tournament.name,
          description: data.tournament.description || '',
          lastAccessed: Date.now()
        };
        const updated = [newTour, ...myTournaments.filter(t => t.id !== newTour.id)];
        localStorage.setItem('bilac_my_tournaments', JSON.stringify(updated));
        setMyTournaments(updated);

        setCurrentTournament(data.tournament);
        
        setNewTournamentName('');
        setNewTournamentCode('');
        setNewTournamentDesc('');
        setIsCreatingTournament(false);
        setCreateModalOpen(false);
        playBeep(880, 'sine', 0.25);
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ!');
    } finally {
      setLoading(false);
    }
  };

  // Format date helper
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${timeStr} - ${dateStr}`;
  };

  // 1. Manage Players
  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!newPlayerName.trim()) return;

    try {
      const res = await bilacFetch('/api/bilac/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlayerName.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Lỗi thêm người chơi!');
        playBeep(220, 'sawtooth', 0.2);
      } else {
        setPlayers(prev => [...prev, data]);
        setNewPlayerName('');
        setSuccessMsg(`Đã thêm thành viên "${data.name}" thành công!`);
        playBeep(659, 'sine', 0.15);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (e) {
      setError('Lỗi kết nối máy chủ!');
    }
  };

  // AI bulk-add: tách danh sách tên từ text tự do qua API, preview, xác nhận thêm.
  const handleAiBulkPreview = async () => {
    setError(null);
    setSuccessMsg(null);
    setAiBulkPreview(null);
    if (!aiBulkText.trim()) {
      setError('Vui lòng dán danh sách tên cần tách!');
      return;
    }
    setIsAiBulkLoading(true);
    try {
      const res = await fetch('/api/ai/parse-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiBulkText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'AI tách tên thất bại!');
        playBeep(220, 'sawtooth', 0.25);
        return;
      }
      const names: string[] = Array.isArray(data?.names) ? data.names : [];
      if (names.length === 0) {
        setError('AI không nhận diện được tên nào. Vui lòng thêm chút ngữ cảnh!');
        playBeep(220, 'sawtooth', 0.25);
        return;
      }
      const existing = new Set(players.map(p => p.name.trim().toLowerCase()));
      const fresh = names.filter(n => !existing.has(n.trim().toLowerCase()));
      setAiBulkPreview(fresh);
      if (fresh.length === 0) {
        setSuccessMsg(`AI tách được ${names.length} tên — tất cả đã có trong danh sách, không cần thêm.`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setSuccessMsg(`AI tách được ${names.length} tên — sẽ thêm ${fresh.length} tên mới (bỏ qua ${names.length - fresh.length} tên trùng).`);
        playBeep(587, 'sine', 0.12);
      }
    } catch (e) {
      setError('Lỗi kết nối máy chủ khi gọi AI!');
    } finally {
      setIsAiBulkLoading(false);
    }
  };

  const handleAiBulkConfirm = async () => {
    if (!aiBulkPreview || aiBulkPreview.length === 0) return;
    setError(null);
    setSuccessMsg(null);
    setIsAiBulkLoading(true);
    let added = 0;
    let failed = 0;
    try {
      for (const name of aiBulkPreview) {
        try {
          const res = await bilacFetch('/api/bilac/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          const data = await res.json();
          if (res.ok) {
            added++;
            setPlayers(prev => [...prev, data]);
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
        }
      }
      setSuccessMsg(`Đã thêm ${added} thành viên mới${failed ? ` (${failed} lỗi)` : ''}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      if (added > 0) playBeep(880, 'sine', 0.3);
      setAiBulkText('');
      setAiBulkPreview(null);
    } finally {
      setIsAiBulkLoading(false);
    }
  };

  const handleAiBulkCancel = () => {
    setAiBulkPreview(null);
  };

  const handleDeletePlayer = async (id: string, name: string) => {
    setError(null);
    const hasMatches = matches.some(m =>
      (m.team1 && m.team1.includes(id)) ||
      (m.team2 && m.team2.includes(id)) ||
      m.benched === id
    );

    if (hasMatches) {
      setError(`Không thể xóa "${name}" vì người chơi này đã tham gia ít nhất 1 trận đấu!`);
      playBeep(220, 'sawtooth', 0.3);
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa thành viên "${name}" khỏi đội?`)) return;

    try {
      const res = await bilacFetch(`/api/bilac/players/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPlayers(prev => prev.filter(p => p.id !== id));
        setSelectedPlayerIds(prev => prev.filter(pid => pid !== id));
        playBeep(293, 'triangle', 0.15);
        setSuccessMsg(`Đã xóa người chơi "${name}" khỏi đội.`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Không thể xóa người chơi!');
        playBeep(220, 'sawtooth', 0.3);
      }
    } catch (e) {
      console.error(e);
      setError('Lỗi kết nối máy chủ!');
    }
  };

  // 2. Select/Toggle Player for Matchmaking
  const togglePlayerSelect = (id: string) => {
    setError(null);
    setSelectedPlayerIds(prev => {
      if (prev.includes(id)) {
        playBeep(440, 'sine', 0.05);
        return prev.filter(pid => pid !== id);
      } else {
        playBeep(554, 'sine', 0.05);
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedPlayerIds.length === players.length) {
      setSelectedPlayerIds([]);
      playBeep(330, 'sine', 0.1);
    } else {
      setSelectedPlayerIds(players.map(p => p.id));
      playBeep(660, 'sine', 0.1);
    }
  };

  // 3. Matchmaking & Start Match
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find(v => v.lang.startsWith('vi') || v.lang.includes('vi'));
      if (viVoice) {
        utterance.voice = viVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech error:', e);
    }
  };

  const handleStartMatchmaking = async () => {
    setError(null);
    if (selectedPlayerIds.length < 2) {
      setError('Vui lòng chọn ít nhất 2 người chơi để tiến hành chia đội đấu trí!');
      playBeep(180, 'sawtooth', 0.2);
      return;
    }

    try {
      const res = await bilacFetch('/api/bilac/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds: selectedPlayerIds })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Chia đội thất bại!');
        playBeep(220, 'sawtooth', 0.2);
      } else {
        setMatches(prev => [data, ...prev]);
        playBeep(880, 'triangle', 0.3);
        setSuccessMsg('Chia đội thành công! Bắt đầu ghi điểm trận đấu.');
        setTimeout(() => setSuccessMsg(null), 3000);

        // Read out the teams in Vietnamese
        const pNames1 = data.team1.map((pId: string) => players.find(p => p.id === pId)?.name || 'Vô danh').join(', ');
        const pNames2 = data.team2.map((pId: string) => players.find(p => p.id === pId)?.name || 'Vô danh').join(', ');
        speakText(`Đấu trường bi lắc sẵn sàng! Đội Xanh gồm có ${pNames1} đối đầu với Đội Đỏ gồm có ${pNames2}. Trận đấu bắt đầu!`);
      }
    } catch (e) {
      setError('Lỗi kết nối máy chủ!');
    }
  };

  // 4. Update Ongoing Match Scores / Finish
  const handleUpdateScore = async (matchId: string, teamNum: 1 | 2, diff: number) => {
    const match = matches.find(m => m.id === matchId);
    if (!match || match.status !== 'PLAYING') return;

    let score1 = match.score1;
    let score2 = match.score2;

    if (teamNum === 1) {
      score1 = Math.max(0, score1 + diff);
    } else {
      score2 = Math.max(0, score2 + diff);
    }

    if (diff > 0) {
      playBeep(523, 'sine', 0.12);
      const teamLabel = teamNum === 1 ? 'Đội Xanh' : 'Đội Đỏ';
      speakText(`Vào! ${teamLabel} ghi bàn! Tỷ số hiện tại là Đội Xanh ${score1}, Đội Đỏ ${score2}.`);
    } else {
      playBeep(349, 'sine', 0.1);
      speakText(`Hủy bàn thắng. Tỷ số quay lại Đội Xanh ${score1}, Đội Đỏ ${score2}.`);
    }

    try {
      const res = await bilacFetch(`/api/bilac/matches/${matchId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score1, score2 })
      });
      if (res.ok) {
        const updated = await res.json();
        setMatches(prev => prev.map(m => m.id === matchId ? updated : m));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinishMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    try {
      const res = await bilacFetch(`/api/bilac/matches/${matchId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FINISHED' })
      });
      if (res.ok) {
        const updated = await res.json();
        setMatches(prev => prev.map(m => m.id === matchId ? updated : m));
        playBeep(1046, 'sine', 0.4);
        setSuccessMsg(`Trận đấu đã kết thúc & tỷ số ${match.score1} - ${match.score2} đã được cộng vào bảng xếp hạng!`);
        setTimeout(() => setSuccessMsg(null), 4000);

        // Announce result in Vietnamese
        const pNames1 = match.team1.map(pId => players.find(p => p.id === pId)?.name || 'Vô danh').join(', ');
        const pNames2 = match.team2.map(pId => players.find(p => p.id === pId)?.name || 'Vô danh').join(', ');
        let resultText = `Trận đấu bi lắc kịch tính đã kết thúc! `;
        if (match.score1 > match.score2) {
          resultText += `Chiến thắng chung cuộc thuộc về Đội Xanh gồm có ${pNames1} với tỷ số ${match.score1} ${match.score2}. Xin chúc mừng!`;
        } else if (match.score2 > match.score1) {
          resultText += `Chiến thắng chung cuộc thuộc về Đội Đỏ gồm có ${pNames2} với tỷ số ${match.score2} ${match.score1}. Xin chúc mừng!`;
        } else {
          resultText += `Kết quả chung cuộc, hai đội hòa nhau với tỷ số ${match.score1} đều.`;
        }
        speakText(resultText);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickFinish = async (matchId: string, winnerTeam: 1 | 2) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const score1 = winnerTeam === 1 ? 7 : 6;
    const score2 = winnerTeam === 2 ? 7 : 6;
    const winnerLabel = winnerTeam === 1 ? 'Đội Xanh' : 'Đội Đỏ';

    try {
      const res = await bilacFetch(`/api/bilac/matches/${matchId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score1, score2, status: 'FINISHED' })
      });
      if (res.ok) {
        const updated = await res.json();
        setMatches(prev => prev.map(m => m.id === matchId ? updated : m));
        playBeep(1046, 'sine', 0.4);
        setSuccessMsg(`Trận đấu đã kết thúc nhanh! Phần thắng thuộc về ${winnerLabel} với tỷ số 7 - 6.`);
        setTimeout(() => setSuccessMsg(null), 4000);

        // Announce quick finish result in Vietnamese
        const pNames1 = match.team1.map(pId => players.find(p => p.id === pId)?.name || 'Vô danh').join(', ');
        const pNames2 = match.team2.map(pId => players.find(p => p.id === pId)?.name || 'Vô danh').join(', ');
        let resultText = `Kết thúc nhanh trận đấu bi lắc! `;
        if (winnerTeam === 1) {
          resultText += `Chiến thắng thuộc về Đội Xanh gồm có ${pNames1} với tỷ số 7 - 6. Xin chúc mừng!`;
        } else {
          resultText += `Chiến thắng thuộc về Đội Đỏ gồm có ${pNames2} với tỷ số 7 - 6. Xin chúc mừng!`;
        }
        speakText(resultText);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelMatch = async (matchId: string) => {
    try {
      const res = await bilacFetch(`/api/bilac/matches/${matchId}`, { method: 'DELETE' });
      if (res.ok) {
        setMatches(prev => prev.filter(m => m.id !== matchId));
        playBeep(196, 'sawtooth', 0.25);
        setSuccessMsg('Đã hủy bỏ trận đấu.');
        setTimeout(() => setSuccessMsg(null), 3000);
        speakText('Trận đấu đã bị hủy bỏ.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Compute Weekly Interval label for display
  const getWeeklyTimeframe = () => {
    const rawDate = new Date();
    const utcMs = rawDate.getTime() + (rawDate.getTimezoneOffset() * 60000);
    const d = new Date(utcMs + (7 * 3600000)); // Adjusted to Vietnam Time (UTC+7)

    const day = d.getDay();
    const wedThisWeekBoundary = new Date(d);
    const diff = 3 - day;
    wedThisWeekBoundary.setDate(d.getDate() + diff);
    wedThisWeekBoundary.setHours(11, 30, 0, 0);

    let start: Date;
    let end: Date;

    if (d.getTime() < wedThisWeekBoundary.getTime()) {
      start = new Date(wedThisWeekBoundary);
      start.setDate(wedThisWeekBoundary.getDate() - 7);
      start.setHours(12, 0, 0, 0);
      end = new Date(wedThisWeekBoundary);
    } else {
      start = new Date(wedThisWeekBoundary);
      start.setHours(12, 0, 0, 0);
      end = new Date(wedThisWeekBoundary);
      end.setDate(wedThisWeekBoundary.getDate() + 7);
    }

    const formatHour = (dateObj: Date) => {
      const dayStr = String(dateObj.getDate()).padStart(2, '0');
      const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
      return `${dayStr}/${monthStr}`;
    };

    return `Tuần hiện tại: Thứ 4 ${formatHour(start)} (12:00) ➔ Thứ 4 ${formatHour(end)} (11:30)`;
  };

  // 5. Leaderboard Calculation
  const calculateLeaderboards = () => {
    // Current Week Label
    const rawDate = new Date();
    const utcMs = rawDate.getTime() + (rawDate.getTimezoneOffset() * 60000);
    const now = new Date(utcMs + (7 * 3600000)); // Adjusted to Vietnam Time (UTC+7)

    const day = now.getDay();
    const wedThisWeekBoundary = new Date(now);
    const diff = 3 - day;
    wedThisWeekBoundary.setDate(now.getDate() + diff);
    wedThisWeekBoundary.setHours(11, 30, 0, 0);

    let start: Date;
    let end: Date;

    if (now.getTime() < wedThisWeekBoundary.getTime()) {
      start = new Date(wedThisWeekBoundary);
      start.setDate(wedThisWeekBoundary.getDate() - 7);
      start.setHours(12, 0, 0, 0);
      end = new Date(wedThisWeekBoundary);
    } else {
      start = new Date(wedThisWeekBoundary);
      start.setHours(12, 0, 0, 0);
      end = new Date(wedThisWeekBoundary);
      end.setDate(wedThisWeekBoundary.getDate() + 7);
    }

    const formatDate = (dateObj: Date) => {
      const dayStr = String(dateObj.getDate()).padStart(2, '0');
      const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
      const yearStr = dateObj.getFullYear();
      return `${dayStr}/${monthStr}/${yearStr}`;
    };

    const currentWeekLabel = `Tuần từ ${formatDate(start)} đến ${formatDate(end)}`;

    // Filter matches based on the selected type
    const finishedMatches = matches.filter(m => m.status === 'FINISHED');
    const filteredMatches = leaderboardTab === 'weekly' 
      ? finishedMatches.filter(m => m.weekLabel === currentWeekLabel)
      : finishedMatches;

    // Initialize map
    const statsMap: Record<string, {
      player: BiLacPlayer;
      matchesPlayed: number;
      wins: number;
      losses: number;
      goalsScored: number;
      goalsConceded: number;
      gd: number;
      points: number;
    }> = {};

    players.forEach(p => {
      statsMap[p.id] = {
        player: p,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        goalsScored: 0,
        goalsConceded: 0,
        gd: 0,
        points: 0
      };
    });

    // Populate stats
    filteredMatches.forEach(m => {
      const score1 = m.score1;
      const score2 = m.score2;

      // Update team 1
      m.team1.forEach(pId => {
        const stats = statsMap[pId];
        if (stats) {
          stats.matchesPlayed += 1;
          stats.goalsScored += score1;
          stats.goalsConceded += score2;
          if (score1 > score2) {
            stats.wins += 1;
            stats.points += 3;
          } else if (score1 === score2) {
            stats.points += 1;
          } else {
            stats.losses += 1;
          }
        }
      });

      // Update team 2
      m.team2.forEach(pId => {
        const stats = statsMap[pId];
        if (stats) {
          stats.matchesPlayed += 1;
          stats.goalsScored += score2;
          stats.goalsConceded += score1;
          if (score2 > score1) {
            stats.wins += 1;
            stats.points += 3;
          } else if (score1 === score2) {
            stats.points += 1;
          } else {
            stats.losses += 1;
          }
        }
      });
    });

    // Compute gd as wins - losses
    players.forEach(p => {
      const stats = statsMap[p.id];
      if (stats) {
        stats.gd = stats.wins - stats.losses;
      }
    });

    // Convert map to array and sort
    return Object.values(statsMap).sort((a, b) => {
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return 0;
    });
  };

  const currentLeaderboard = calculateLeaderboards();
  const ongoingMatch = matches.find(m => m.status === 'PLAYING');

  if (!currentTournament) {
    if (!loggedInUserId) {
      // Bắt buộc đăng nhập trước khi truy cập Bi Lắc Arena.
      return (
        <div className="w-full max-w-3xl mx-auto px-4 py-16 animate-fade-in" id="bilac_login_required">
          <div className="bg-white p-8 sm:p-10 rounded-2xl border-2 border-orange-300 shadow-xl text-center">
            <div className="flex justify-center mb-5">
              <span className="p-4 bg-orange-100 text-orange-600 rounded-2xl shadow-sm">
                <Swords className="w-12 h-12" />
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 mb-2">
              Vui lòng đăng nhập để vào Đấu Trường Bi Lắc
            </h2>
            <p className="text-stone-600 text-sm sm:text-base max-w-xl mx-auto mb-7 leading-relaxed">
              Đấu trường Bi Lắc yêu cầu tài khoản để đảm bảo quyền quản lý (thêm thành viên, tạo trận, ghi điểm, hủy trận).
              Sau khi đăng nhập bạn có thể tạo giải mới hoặc tham gia giải có sẵn bằng mã code.
            </p>
            <button
              id="btn_login_for_bilac"
              onClick={() => onOpenAuthModal?.()}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold px-7 py-3 rounded-2xl shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <Shield className="w-5 h-5" />
              🔑 Đăng nhập / Đăng ký ngay
            </button>
          </div>
        </div>
      );
    }
    return (
    <>
      <div className="w-full max-w-4xl mx-auto px-4 py-12 animate-fade-in" id="bilac_portal_root">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <span className="p-4 bg-orange-100 text-orange-600 rounded-2xl shadow-sm">
              <Swords className="w-12 h-12" />
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-stone-900 font-sans mb-2">
            Đấu Trường Bi Lắc
          </h1>
          <p className="text-stone-500 max-w-xl mx-auto text-sm sm:text-base">
            Chào mừng bạn đến với Đấu Trường Bi Lắc! Khám phá các giải đấu đang diễn ra, tham gia bằng mã code, hoặc tạo giải mới cho văn phòng của bạn.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3 text-sm animate-shake" id="portal_error">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-3 text-sm animate-fade-in" id="portal_success">
            <Check className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* RESUME LAST VISITED */}
        {lastVisitedTournament && !currentTournament && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3" id="resume_last_tournament_card">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-blue-700 uppercase tracking-widest">Giải vừa truy cập</div>
                <div className="font-bold text-blue-950 truncate">{lastVisitedTournament.name}</div>
              </div>
            </div>
            <button
              id="btn_resume_last_tournament"
              onClick={() => handleResumeLastTournament()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              Vào lại
            </button>
          </div>
        )}

        {/* TAB FILTER + CREATE BUTTON (small, on the same row) */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="inline-flex bg-stone-200/60 p-1 rounded-xl" role="tablist">
            <button
              id="tab_all_tournaments"
              onClick={() => setPortalTab('all')}
              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                portalTab === 'all'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
              role="tab"
              aria-selected={portalTab === 'all'}
            >
              Tất cả giải ({allTournaments.length})
            </button>
            <button
              id="tab_my_tournaments"
              onClick={() => setPortalTab('joined')}
              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                portalTab === 'joined'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
              role="tab"
              aria-selected={portalTab === 'joined'}
            >
              Giải tham gia ({allTournaments.filter((t: any) => t.isMember).length})
            </button>
          </div>
          <button
            id="btn_quick_create"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-colors shrink-0"
            aria-label="Tạo giải đấu mới"
          >
            <Plus className="w-4 h-4" />
            Tạo giải đấu mới
          </button>
        </div>

        {/* TOURNAMENT CARD GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="tournaments_grid">
          {visibleTournaments.length === 0 ? (
            <div className="col-span-full bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center text-stone-500 text-sm">
              {portalTab === 'joined'
                ? 'Bạn chưa tham gia giải đấu nào. Hãy tạo mới hoặc tham gia bằng mã code.'
                : 'Chưa có giải đấu nào. Hãy là người đầu tiên tạo một giải!'}
            </div>
          ) : (
            visibleTournaments.map((tour: any) => (
              <div
                key={tour.id}
                onClick={() => {
                  if (tour.isMember) {
                    handleQuickAccessTournament(tour);
                  } else {
                    setPreselectJoinTournamentId(tour.id);
                    setSelectedTournamentId(tour.id);
                    setJoinModalOpen(true);
                  }
                }}
                className={`relative bg-white p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-2 ${
                  tour.isMember ? 'border-orange-300 ring-1 ring-orange-200' : 'border-stone-200 hover:border-orange-400'
                }`}
                id={`portal_tour_${tour.id}`}
              >
                {tour.isMember && (
                  <span
                    id={`portal_tour_${tour.id}_member_badge`}
                    className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Đang tham gia
                  </span>
                )}
                <h3 className="font-bold text-stone-900 text-base pr-24 truncate">{tour.name}</h3>
                {tour.description && (
                  <p className="text-xs text-stone-500 line-clamp-2">{tour.description}</p>
                )}
                <div className="flex items-center gap-2 mt-auto pt-2 text-[10px] text-stone-400 font-mono">
                  <Users className="w-3 h-3" />
                  <span>{tour.memberCount} thành viên</span>
                  <span>•</span>
                  <span>Tạo: {formatDate(tour.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* JOIN MODAL */}
      <AnimatePresence>
        {joinModalOpen && (
          <JoinTournamentModal
            tournaments={allTournaments}
            preselectedId={preselectJoinTournamentId}
            accessCodeInput={accessCodeInput}
            setAccessCodeInput={setAccessCodeInput}
            selectedTournamentId={selectedTournamentId}
            setSelectedTournamentId={setSelectedTournamentId}
            loading={loading}
            onClose={() => setJoinModalOpen(false)}
            onSubmit={(e) => { handleAccessTournament(e); setJoinModalOpen(false); }}
          />
        )}
      </AnimatePresence>

      {/* CREATE MODAL */}
      <AnimatePresence>
        {createModalOpen && (
          <CreateTournamentModal
            name={newTournamentName}
            setName={setNewTournamentName}
            code={newTournamentCode}
            setCode={setNewTournamentCode}
            desc={newTournamentDesc}
            setDesc={setNewTournamentDesc}
            loading={loading}
            onClose={() => setCreateModalOpen(false)}
            onSubmit={(e) => { handleCreateTournament(e); }}
          />
        )}
      </AnimatePresence>
    </>
  );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 animate-fade-in" id="bilac_arena_root">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-stone-200 pb-6 mb-8 gap-4" id="bilac_header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-orange-100 text-orange-600 rounded-lg">
              <Swords className="w-6 h-6 animate-pulse" />
            </span>
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-stone-900 font-sans">
              Đấu Trường Bi Lắc
            </h1>
          </div>
          <p className="text-stone-500 text-xs sm:text-sm font-medium">
            Hệ thống quản lý giải đấu tuần chuyên nghiệp cho tập thể Bi Lắc văn phòng
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-orange-800 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-200 font-medium w-fit shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            <span>Giải đấu đang chơi: <strong className="font-bold">{currentTournament.name}</strong></span>
            {currentTournament.description && <span className="text-orange-600">({currentTournament.description})</span>}
            <button 
              onClick={handleLogoutTournament}
              className="ml-3 text-[10px] text-stone-500 hover:text-stone-900 underline font-semibold transition-colors cursor-pointer uppercase tracking-wider"
            >
              Đổi giải đấu ➔
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto" id="bilac_top_controls">
          <div className="flex bg-stone-100 p-0.5 sm:p-1 rounded-xl border border-stone-200 text-[10px] sm:text-xs font-bold w-full sm:w-auto justify-between sm:justify-start">
            <button
              id="tab_matchmaking"
              onClick={() => { playBeep(523, 'sine', 0.08); setActiveTab('matchmaking'); }}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg cursor-pointer transition-all flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                activeTab === 'matchmaking' 
                  ? 'bg-white text-stone-950 shadow-xs' 
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Ghi Điểm &amp; Đội</span>
            </button>
            <button
              id="tab_leaderboards"
              onClick={() => { playBeep(523, 'sine', 0.08); setActiveTab('leaderboards'); }}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg cursor-pointer transition-all flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                activeTab === 'leaderboards' 
                  ? 'bg-white text-stone-950 shadow-xs' 
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Xếp Hạng</span>
            </button>
            <button
              id="tab_history"
              onClick={() => { playBeep(523, 'sine', 0.08); setActiveTab('history'); }}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg cursor-pointer transition-all flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                activeTab === 'history' 
                  ? 'bg-white text-stone-950 shadow-xs' 
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Lịch Sử</span>
            </button>
            <button
              id="tab_members"
              onClick={() => { playBeep(523, 'sine', 0.08); setActiveTab('members'); }}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 rounded-lg cursor-pointer transition-all flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                activeTab === 'members'
                  ? 'bg-white text-stone-950 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Thành viên</span>
            </button>
          </div>

          <button
            id="btn_refresh_data"
            onClick={() => { playBeep(587, 'sine', 0.1); fetchData(); }}
            disabled={loading}
            className="px-3 py-2 border border-stone-200 bg-white hover:bg-stone-50 rounded-xl text-stone-600 hover:text-stone-950 flex items-center justify-center gap-1 sm:gap-1.5 text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-all active:scale-95"
            title="Đồng bộ dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Tải lại</span>
          </button>


        </div>
      </div>

      {/* FEEDBACK SYSTEM */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm animate-bounce" id="bilac_error_banner">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm" id="bilac_success_banner">
          <Check className="w-5 h-5 shrink-0 text-emerald-500" />
          <p className="font-semibold">{successMsg}</p>
        </div>
      )}

      {/* WEEK TIMER INFO */}
      <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-stone-600 mb-8 text-xs sm:text-sm" id="bilac_weekly_info">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-orange-500" />
          <span className="font-semibold text-stone-800">Thông tin vòng đấu</span>
        </div>
        <div className="bg-orange-50 text-orange-800 border border-orange-200/50 px-3 py-1 rounded-full text-xs font-bold tracking-tight font-mono">
          {getWeeklyTimeframe()}
        </div>
      </div>

      {/* 1. MATCHMAKING & ACTIVE SCOREBOARD TAB */}
      {activeTab === 'matchmaking' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8" id="bilac_tab_matchmaking_content">
          
          {/* LEFT PANEL: CURRENT MATCH (ONGOING) OR MATCH SETUP */}
          <div className="md:col-span-7 lg:col-span-8 flex flex-col gap-8">
            
            {/* ACTIVE PLAYING SCOREBOARD */}
            {ongoingMatch ? (
              <div className="bg-stone-900 text-stone-100 p-6 sm:p-8 rounded-2xl border-4 border-orange-500 shadow-2xl relative overflow-hidden" id="ongoing_match_panel">
                {/* Decorative retro stripes */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500" />
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                    <span className="text-[10px] sm:text-xs font-bold text-red-400 uppercase tracking-widest font-mono">
                      Trận Đấu Đang Diễn Ra
                    </span>
                  </div>
                  <div className="text-[10px] sm:text-xs font-bold text-stone-400 font-mono bg-stone-800/80 px-2.5 py-1 rounded-lg border border-stone-700">
                    Bàn Thể Thức {ongoingMatch.team1.length}v{ongoingMatch.team2.length}
                  </div>
                </div>

                {/* Score Area */}
                <div className="grid grid-cols-7 items-center gap-2 sm:gap-4 my-8" id="score_display_area">
                  {/* TEAM 1 */}
                  <div className="col-span-3 text-center">
                    <button
                      id="btn_quick_win_blue"
                      onClick={() => handleQuickFinish(ongoingMatch.id, 1)}
                      className="w-full mb-3 px-2 py-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center block"
                    >
                      🏆 Xanh Thắng (7-6)
                    </button>
                    <h3 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wide mb-1">Đội Xanh</h3>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleUpdateScore(ongoingMatch.id, 1, -1)}
                        className="w-8 h-8 rounded-full border border-stone-700 bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 font-bold hover:text-white cursor-pointer transition-all"
                        title="Giảm 1 bàn"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-4xl sm:text-6xl font-black font-mono tracking-tight text-white px-2">
                        {ongoingMatch.score1}
                      </span>
                      <button
                        onClick={() => handleUpdateScore(ongoingMatch.id, 1, 1)}
                        className="w-8 h-8 rounded-full border border-stone-700 bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 font-bold hover:text-white cursor-pointer transition-all"
                        title="Tăng 1 bàn"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Players in Team 1 */}
                    <div className="mt-6 space-y-2.5 text-left">
                      {ongoingMatch.team1.map(pId => {
                        const player = players.find(p => p.id === pId);
                        return (
                          <div key={pId} className="flex items-center gap-2 bg-stone-800/60 p-2 rounded-xl border border-stone-700/50">
                            <img src={player?.avatar} className="w-7 h-7 rounded-full bg-stone-700 border border-stone-600" alt="Avatar" />
                            <span className="text-xs font-semibold truncate text-stone-200">{player?.name || 'Vô danh'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* VS DIVIDER */}
                  <div className="col-span-1 text-center font-extrabold text-stone-600 text-sm italic flex flex-col justify-end pb-3 sm:pb-4">
                    <div className="h-[34px] mb-3 hidden sm:block" />
                    <span>VS</span>
                  </div>

                  {/* TEAM 2 */}
                  <div className="col-span-3 text-center">
                    <button
                      id="btn_quick_win_red"
                      onClick={() => handleQuickFinish(ongoingMatch.id, 2)}
                      className="w-full mb-3 px-2 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center block"
                    >
                      🏆 Đỏ Thắng (7-6)
                    </button>
                    <h3 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-wide mb-1">Đội Đỏ</h3>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleUpdateScore(ongoingMatch.id, 2, -1)}
                        className="w-8 h-8 rounded-full border border-stone-700 bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 font-bold hover:text-white cursor-pointer transition-all"
                        title="Giảm 1 bàn"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-4xl sm:text-6xl font-black font-mono tracking-tight text-white px-2">
                        {ongoingMatch.score2}
                      </span>
                      <button
                        onClick={() => handleUpdateScore(ongoingMatch.id, 2, 1)}
                        className="w-8 h-8 rounded-full border border-stone-700 bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 font-bold hover:text-white cursor-pointer transition-all"
                        title="Tăng 1 bàn"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Players in Team 2 */}
                    <div className="mt-6 space-y-2.5 text-left">
                      {ongoingMatch.team2.map(pId => {
                        const player = players.find(p => p.id === pId);
                        return (
                          <div key={pId} className="flex items-center gap-2 bg-stone-800/60 p-2 rounded-xl border border-stone-700/50">
                            <img src={player?.avatar} className="w-7 h-7 rounded-full bg-stone-700 border border-stone-600" alt="Avatar" />
                            <span className="text-xs font-semibold truncate text-stone-200">{player?.name || 'Vô danh'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>



                {/* Benched Player (if odd) */}
                {ongoingMatch.benched && (
                  <div className="mt-6 bg-stone-800/50 p-3 rounded-xl border border-stone-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-stone-700 text-stone-300 text-[10px] font-bold rounded">
                        NGƯỜI LẺ DỰ BỊ
                      </span>
                      <span className="text-xs text-stone-300 font-medium">
                        {players.find(p => p.id === ongoingMatch.benched)?.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-stone-400 italic">
                      Tự động ngồi dự bị trận này để đảm bảo cân bằng
                    </span>
                  </div>
                )}

                {/* Score Controls / End Match */}
                <div className="mt-8 pt-6 border-t border-stone-800 flex flex-wrap items-center justify-between gap-4">
                  <button
                    onClick={() => handleCancelMatch(ongoingMatch.id)}
                    className="px-4 py-2 bg-transparent hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-red-500/20 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Hủy bỏ trận đấu
                  </button>

                  <button
                    onClick={() => handleFinishMatch(ongoingMatch.id)}
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold tracking-wider uppercase flex items-center gap-2 cursor-pointer shadow-lg hover:shadow-xl hover:scale-102 transform active:scale-98 transition-all"
                  >
                    <Check className="w-5 h-5 font-bold" />
                    Xác nhận kết thúc đấu trí
                  </button>
                </div>
              </div>
            ) : (
              /* MATCH SETUP & MATCHMAKING WINDOW */
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-md">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-stone-900 flex items-center gap-1.5">
                      <Swords className="w-5 h-5 text-orange-500" />
                      Thiết lập trận đấu mới
                    </h2>
                    <p className="text-stone-500 text-xs mt-0.5">
                      Chọn các thành viên có mặt tại bàn đấu để thuật toán tự động chia đội hạt giống.
                    </p>
                  </div>

                  <button
                    onClick={handleSelectAll}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer hover:underline transition-all"
                  >
                    {selectedPlayerIds.length === players.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                  </button>
                </div>

                {/* Interactive Player Grid for Match Selection */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-6" id="matchmaker_player_selection_grid">
                  {players.map(player => {
                    const isSelected = selectedPlayerIds.includes(player.id);
                    return (
                      <div
                        key={player.id}
                        onClick={() => togglePlayerSelect(player.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all ${
                          isSelected 
                            ? 'bg-orange-50/70 border-orange-300 text-orange-950 shadow-xs' 
                            : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <img src={player.avatar} className="w-8 h-8 rounded-full bg-stone-200" alt="Avatar" />
                          <span className="text-xs font-bold truncate">{player.name}</span>
                        </div>
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                          isSelected ? 'bg-orange-500 text-white' : 'border border-stone-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Count Indicator & Algorithms Rule Info */}
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/80 mb-6 text-xs text-stone-600 leading-relaxed space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-800">
                    <UserCheck className="w-4 h-4 text-orange-500" />
                    <span>Đã chọn: {selectedPlayerIds.length} người chơi</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-[11px] text-stone-500">
                    <li>Nếu số người lẻ (ví dụ 7), hệ thống sẽ chọn ngẫu nhiên 1 người ngồi dự bị trận này.</li>
                    <li>
                      <strong>Cơ chế hạt giống:</strong> Hệ thống chia người tham gia làm 2 nhóm (hạt giống cao và thấp dựa trên bảng xếp hạng tuần), sau đó phân phối đều vào 2 đội để đảm bảo tính công bằng cao nhất.
                    </li>
                  </ul>
                </div>

                {/* Matchmaking trigger */}
                <button
                  id="btn_launch_matchmaking"
                  onClick={handleStartMatchmaking}
                  disabled={selectedPlayerIds.length < 2}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-3.5 px-6 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider cursor-pointer shadow-md hover:shadow-lg hover:scale-[1.01] transform active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Shuffle className="w-4 h-4 animate-spin-slow" />
                  Bắt đầu ghép đội & Đấu trí
                </button>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: ADD MEMBERS & QUICK STATS */}
          <div className="md:col-span-5 lg:col-span-4 space-y-6">
            
            {/* ADD PLAYER BOX */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm" id="add_player_panel">
              <h2 className="text-sm font-bold text-stone-900 mb-1 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-orange-500" />
                Thành viên mới
              </h2>
              <p className="text-stone-500 text-[11px] mb-4">
                Thêm đồng nghiệp vào danh sách chiến hữu thi đấu Bi Lắc của văn phòng.
              </p>

              <form onSubmit={handleAddPlayer} className="flex gap-2">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Nhập tên thành viên..."
                  className="flex-1 px-3 py-2 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs cursor-pointer transition-all"
                >
                  Thêm
                </button>
              </form>
            </div>

            {/* AI BULK ADD PLAYERS */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm" id="ai_bulk_add_panel">
              <h2 className="text-sm font-bold text-stone-900 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-orange-500" />
                Thêm nhanh bằng AI
              </h2>
              <p className="text-stone-500 text-[11px] mb-3">
                Dán danh sách tên (nhiều dòng, có team, có số thứ tự đều được) — AI sẽ tự tách thành từng tên đầy đủ.
              </p>

              <textarea
                id="ai_bulk_textarea"
                value={aiBulkText}
                onChange={(e) => setAiBulkText(e.target.value)}
                placeholder={'Ví dụ:\n1. Đội UTE FC:\n- Nguyễn Văn A\n- Trần Văn B\n\n2. Team BK Stars: Lê Văn C, Phạm Văn D'}
                rows={5}
                disabled={isAiBulkLoading}
                className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-orange-500 outline-none resize-y min-h-[100px] disabled:bg-stone-100"
              />

              <div className="flex gap-2 mt-3">
                {aiBulkPreview === null ? (
                  <button
                    id="btn_ai_bulk_preview"
                    type="button"
                    onClick={handleAiBulkPreview}
                    disabled={isAiBulkLoading || !aiBulkText.trim()}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isAiBulkLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Đang tách...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        AI tách tên
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      id="btn_ai_bulk_confirm"
                      type="button"
                      onClick={handleAiBulkConfirm}
                      disabled={isAiBulkLoading || aiBulkPreview.length === 0}
                      className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAiBulkLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Đang thêm...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Thêm {aiBulkPreview.length} tên
                        </>
                      )}
                    </button>
                    <button
                      id="btn_ai_bulk_cancel"
                      type="button"
                      onClick={handleAiBulkCancel}
                      disabled={isAiBulkLoading}
                      className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-xl text-xs cursor-pointer transition-all disabled:opacity-50"
                    >
                      Hủy
                    </button>
                  </>
                )}
              </div>

              {aiBulkPreview !== null && (
                <div id="ai_bulk_preview_list" className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl max-h-[160px] overflow-y-auto">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5">
                    Xác nhận {aiBulkPreview.length} tên sẽ thêm:
                  </p>
                  {aiBulkPreview.length === 0 ? (
                    <p className="text-xs text-stone-500 italic">Không có tên mới nào để thêm.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {aiBulkPreview.map((n, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-emerald-200 text-[11px] font-semibold text-emerald-800 rounded-lg">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TEAM PLAYERS DIRECTORY LIST */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm" id="players_directory_panel">
              <h2 className="text-sm font-bold text-stone-900 mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-orange-500" />
                  Thành viên ({players.length})
                </span>
              </h2>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {players.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-xl border border-stone-100 hover:border-stone-200 transition-all">
                    <div className="flex items-center gap-2 truncate">
                      <img src={p.avatar} className="w-7 h-7 rounded-full bg-stone-200 border border-stone-300" alt="Avatar" />
                      <span className="text-xs font-bold text-stone-800 truncate">{p.name}</span>
                    </div>
                    {/* Only allow deleting if it's not a seed id or if they want to clean up */}
                    <button
                      onClick={() => handleDeletePlayer(p.id, p.name)}
                      className="text-stone-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 cursor-pointer transition-all"
                      title="Xóa người chơi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. LEADERBOARDS TAB */}
      {activeTab === 'leaderboards' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-sm" id="bilac_tab_leaderboards_content">
          
          {/* Subtabs for Weekly vs All-Time */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-100 pb-4 mb-6 gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-1.5">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Vinh Danh Cao Thủ Bi Lắc
              </h2>
              <p className="text-stone-500 text-xs mt-0.5">
                Xếp hạng phân loại theo điểm số và hiệu số thắng thua.
              </p>
            </div>

            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-semibold">
              <button
                id="btn_weekly_leaderboard"
                onClick={() => { playBeep(523, 'sine', 0.05); setLeaderboardTab('weekly'); }}
                className={`px-4 py-1.5 rounded-lg cursor-pointer transition-all ${
                  leaderboardTab === 'weekly' 
                    ? 'bg-white text-stone-950 shadow-xs font-bold' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Giải Hàng Tuần
              </button>
              <button
                id="btn_alltime_leaderboard"
                onClick={() => { playBeep(523, 'sine', 0.05); setLeaderboardTab('alltime'); }}
                className={`px-4 py-1.5 rounded-lg cursor-pointer transition-all ${
                  leaderboardTab === 'alltime' 
                    ? 'bg-white text-stone-950 shadow-xs font-bold' 
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Tất Cả Các Mùa
              </button>
            </div>
          </div>

          {/* LEADERBOARD TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 font-bold">
                  <th className="py-3 px-4 text-center w-12">Hạng</th>
                  <th className="py-3 px-4">Đấu thủ</th>
                  <th className="py-3 px-4 text-center">Trận</th>
                  <th className="py-3 px-4 text-center">Thắng</th>
                  <th className="py-3 px-4 text-center">Thua</th>
                  <th className="py-3 px-4 text-center">Hiệu số (HS)</th>
                  <th className="py-3 px-4 text-center">Tỷ lệ thắng (%)</th>
                </tr>
              </thead>
              <tbody>
                {currentLeaderboard.map((item, index) => {
                  let rankStyle = "bg-stone-100 text-stone-700";
                  if (index === 0) rankStyle = "bg-yellow-500 text-white font-extrabold";
                  if (index === 1) rankStyle = "bg-slate-300 text-slate-800 font-bold";
                  if (index === 2) rankStyle = "bg-amber-600 text-white font-bold";

                  const winRate = item.matchesPlayed > 0 ? Math.round((item.wins / item.matchesPlayed) * 100) : 0;

                  return (
                    <tr key={item.player.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                      <td className="py-3 px-4 text-center font-bold">
                        <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs ${rankStyle}`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img src={item.player.avatar} className="w-8 h-8 rounded-full border border-stone-200 bg-stone-100" alt="Avatar" />
                          <span className="font-bold text-stone-900">{item.player.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">{item.matchesPlayed}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">{item.wins}</td>
                      <td className="py-3 px-4 text-center font-mono text-stone-400">{item.losses}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <span className={item.gd > 0 ? 'text-emerald-600' : item.gd < 0 ? 'text-red-600' : 'text-stone-400'}>
                          {item.gd > 0 ? `+${item.gd}` : item.gd}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-blue-600">
                        {winRate}%
                      </td>
                    </tr>
                  );
                })}

                {currentLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-stone-400 font-semibold italic bg-stone-50 rounded-xl">
                      Chưa có trận đấu nào được ghi nhận cho bảng xếp hạng này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-sm" id="bilac_tab_history_content">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-stone-900 flex items-center gap-1.5">
              <History className="w-5 h-5 text-orange-500" />
              Lịch Sử Thi Đấu
            </h2>
            <p className="text-stone-500 text-xs mt-0.5">
              Danh sách chi tiết tất cả các trận đấu Bi Lắc đã hoàn thành hoặc đang mở.
            </p>
          </div>

          <div className="space-y-4" id="history_matches_list">
            {matches.map(m => {
              const isFinished = m.status === 'FINISHED';
              return (
                <div 
                  key={m.id} 
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isFinished 
                      ? 'bg-stone-50 border-stone-200' 
                      : 'bg-orange-50/50 border-orange-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/60 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isFinished ? 'bg-stone-200 text-stone-700' : 'bg-red-100 text-red-800 animate-pulse'
                      }`}>
                        {isFinished ? 'ĐÃ KẾT THÚC' : 'ĐANG CHƠI'}
                      </span>
                      <span className="text-xs text-stone-500 font-semibold font-mono">
                        {formatDate(m.timestamp)}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200/50 px-2.5 py-0.5 rounded-full uppercase font-mono">
                      {m.weekLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-7 items-center gap-2">
                    {/* Team 1 */}
                    <div className="col-span-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1 mb-2">
                        {m.team1.map(pId => (
                          <span key={pId} className="px-2 py-1 bg-white border border-stone-200 text-[11px] font-semibold rounded-lg shadow-2xs">
                            {players.find(p => p.id === pId)?.name || 'Vô danh'}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">ĐỘI XANH</span>
                    </div>

                    {/* Score Center */}
                    <div className="col-span-1 text-center">
                      <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-stone-900">
                        {m.score1} : {m.score2}
                      </span>
                    </div>

                    {/* Team 2 */}
                    <div className="col-span-3 text-left">
                      <div className="flex flex-wrap justify-start gap-1 mb-2">
                        {m.team2.map(pId => (
                          <span key={pId} className="px-2 py-1 bg-white border border-stone-200 text-[11px] font-semibold rounded-lg shadow-2xs">
                            {players.find(p => p.id === pId)?.name || 'Vô danh'}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">ĐỘI ĐỎ</span>
                    </div>
                  </div>

                  {m.benched && (
                    <div className="mt-3 text-[11px] text-stone-500 bg-stone-100/60 p-2 rounded-lg border border-stone-200/40">
                      <strong>Dự bị:</strong> {players.find(p => p.id === m.benched)?.name}
                    </div>
                  )}

                  {/* Option to delete match (Admin feature for cleanup) */}
                  <div className="mt-4 pt-3 border-t border-stone-200/50 flex justify-end">
                    <button
                      onClick={async () => {
                        try {
                          const res = await bilacFetch(`/api/bilac/matches/${m.id}`, { method: 'DELETE' });
                          if (res.ok) {
                            setMatches(prev => prev.filter(item => item.id !== m.id));
                            playBeep(150, 'sawtooth', 0.2);
                            setSuccessMsg('Đã xóa trận đấu thành công.');
                            setTimeout(() => setSuccessMsg(null), 3000);
                          }
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="text-stone-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer border border-transparent hover:border-red-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa kết quả
                    </button>
                  </div>
                </div>
              );
            })}

            {matches.length === 0 && (
              <div className="py-12 text-center text-stone-400 font-semibold italic bg-stone-50 rounded-xl border border-stone-200">
                Chưa có dữ liệu lịch sử thi đấu nào.
              </div>
            )}
          </div>
        </div>
      )}

      {/* DONATE MODAL */}
      {isDonateModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="donate_modal_overlay">
          <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl overflow-hidden flex flex-col relative animate-scale-up" id="donate_modal_card">
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-500 to-orange-500 p-5 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-white/20 rounded-lg">
                  <Heart className="w-5 h-5 fill-white text-white" />
                </span>
                <div>
                  <h3 className="font-bold text-base">Donate Mua Server</h3>
                  <p className="text-[11px] text-white/80 font-medium">Duy trì đấu trường bi lắc văn phòng luôn mượt mà</p>
                </div>
              </div>
              <button 
                onClick={() => { playBeep(440, 'sine', 0.1); setIsDonateModalOpen(false); }}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 max-h-[80vh]">
              {/* Info text */}
              <p className="text-stone-600 text-xs text-center leading-relaxed">
                Hệ thống chạy trên Cloud để lưu trữ bảng xếp hạng thời gian thực. Mọi sự ủng hộ của anh em là động lực to lớn giúp duy trì server! 🚀
              </p>

              {/* QR and Bank Details */}
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col items-center">
                <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-xs mb-4 relative group">
                  <img 
                    src={`https://img.vietqr.io/image/mbbank-999912345678-compact2.png?amount=${donateAmount || ''}&addInfo=Donate%20mua%20server&accountName=ADMIN%20BILAC%20ARENA`}
                    alt="VietQR Bank Donate"
                    className="w-48 h-48 object-contain transition-transform group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-stone-900/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none flex items-center justify-center">
                    <span className="bg-white/90 text-stone-700 text-[10px] font-bold px-2 py-1 rounded-md shadow-xs">Mở App Ngân Hàng Để Quét</span>
                  </div>
                </div>

                {/* Bank Fields */}
                <div className="w-full space-y-2 text-xs">
                  <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-stone-200">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">Ngân Hàng</span>
                      <strong className="text-stone-800 font-bold">MB Bank (Quân Đội)</strong>
                    </div>
                    <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-sm">24/7 Fast</span>
                  </div>

                  <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-stone-200">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">Số Tài Khoản</span>
                      <strong className="text-stone-800 font-mono text-sm font-bold">999912345678</strong>
                    </div>
                    <button 
                      onClick={() => handleCopyText('999912345678', 'account')}
                      className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      title="Sao chép"
                    >
                      {copiedField === 'account' ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-stone-200">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">Nội Dung Chuyển Khoản</span>
                      <strong className="text-stone-800 font-medium">Donate mua server</strong>
                    </div>
                    <button 
                      onClick={() => handleCopyText('Donate mua server', 'content')}
                      className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      title="Sao chép"
                    >
                      {copiedField === 'content' ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Amount Presets */}
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2.5">Chọn Số Tiền Ủng Hộ</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 10000, label: '10K ☕' },
                    { val: 20000, label: '20K 🥤' },
                    { val: 50000, label: '50K 🍜' },
                    { val: 100000, label: '100K 🔥' },
                    { val: 200000, label: '200K 👑' },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      onClick={() => { playBeep(523, 'sine', 0.05); setDonateAmount(preset.val); }}
                      className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        donateAmount === preset.val
                          ? 'bg-rose-50 border-rose-500 text-rose-600 shadow-xs'
                          : 'bg-white border-stone-200 hover:border-stone-400 text-stone-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    onClick={() => { playBeep(523, 'sine', 0.05); setDonateAmount(''); }}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      donateAmount === ''
                        ? 'bg-rose-50 border-rose-500 text-rose-600 shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-400 text-stone-600'
                    }`}
                  >
                    Tự nhập 📝
                  </button>
                </div>

                {donateAmount === '' && (
                  <div className="mt-3 animate-fade-in">
                    <input
                      type="number"
                      placeholder="Nhập số tiền ủng hộ khác..."
                      value={donateAmount}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setDonateAmount(val);
                      }}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-800 text-sm font-semibold font-mono"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-stone-50 p-4 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
              <span className="flex items-center gap-1 font-medium">
                <QrCode className="w-3.5 h-3.5 text-stone-400" />
                Quét QR bằng app ngân hàng bất kỳ
              </span>
              <button 
                onClick={() => setIsDonateModalOpen(false)}
                className="text-stone-500 hover:text-stone-800 font-bold uppercase tracking-wider cursor-pointer"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STICKY FLOATING DONATE WIDGET */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 group" id="sticky_donate_widget">
        {/* Tooltip / Label on Hover */}
        <div className="bg-stone-950 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-lg opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 absolute right-14 whitespace-nowrap pointer-events-none border border-stone-800 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span>Donate mua server ☕</span>
        </div>

        <button
          onClick={() => { playBeep(659, 'sine', 0.15); setIsDonateModalOpen(true); }}
          className="w-12 h-12 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 relative cursor-pointer border border-rose-400/20"
          title="Donate mua server"
        >
          <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping pointer-events-none"></span>
          <Heart className="w-5 h-5 fill-white text-white relative z-10 animate-pulse" />
        </button>
      </div>

      {activeTab === 'members' && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-stone-200 shadow-sm" id="bilac_tab_members_content">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-stone-900 flex items-center gap-1.5">
              <UserPlus className="w-5 h-5 text-orange-500" />
              Thành Viên Giải Đấu
            </h2>
            <p className="text-stone-500 text-xs mt-0.5">
              {myMemberRole === 'owner'
                ? 'Bạn là chủ giải. Mời thành viên qua username và quản lý quyền truy cập.'
                : 'Danh sách thành viên được mời vào giải đấu này.'}
            </p>
          </div>

          {myMemberRole === 'owner' && (
            <form
              onSubmit={handleInviteMember}
              className="mb-6 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-stone-50 p-3 rounded-xl border border-stone-200"
              id="form_invite_member"
            >
              <input
                id="input_invite_username"
                type="text"
                placeholder="username của người cần mời"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                autoComplete="off"
              />
              <button
                id="btn_invite_member"
                type="submit"
                disabled={loading || !inviteUsername.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold shadow-sm transition-colors disabled:bg-stone-200 disabled:text-stone-400 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                Mời vào giải
              </button>
            </form>
          )}

          <div className="space-y-2" id="members_list">
            {members.length === 0 && (
              <p className="text-xs text-stone-500 italic">Chưa có thành viên nào.</p>
            )}
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-orange-500 text-white font-bold flex items-center justify-center shrink-0">
                    {m.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-stone-900 truncate">{m.displayName}</div>
                    <div className="text-xs text-stone-500 font-mono truncate">@{m.username}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                      m.role === 'owner'
                        ? 'bg-orange-500/20 text-orange-700'
                        : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {m.role === 'owner' ? 'Chủ giải' : 'Thành viên'}
                  </span>
                  {myMemberRole === 'owner' && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.userId, m.username)}
                      disabled={loading}
                      className="text-[10px] text-red-500 hover:text-red-700 underline font-mono cursor-pointer"
                      title="Xoá khỏi giải"
                    >
                      Xoá
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-stone-400 mt-6 italic">
            Mã truy cập hiện tại không tự động thêm thành viên — chỉ chủ giải mới có quyền mời.
          </p>
        </div>
      )}

      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => { playBeep(659, 'sine', 0.15); setIsDonateModalOpen(true); }}
          className="w-12 h-12 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 relative cursor-pointer border border-rose-400/20"
          title="Donate mua server"
        >
          <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping pointer-events-none"></span>
          <Heart className="w-5 h-5 fill-white text-white relative z-10 animate-pulse" />
        </button>
      </div>
    </div>
  );
}

// ---------- Modals (inline; no new files — YAGNI) ----------

function PortalModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // Esc to close + click-outside dismiss.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
      className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function JoinTournamentModal({
  tournaments, preselectedId, accessCodeInput, setAccessCodeInput,
  selectedTournamentId, setSelectedTournamentId, loading, onClose, onSubmit,
}: {
  tournaments: any[];
  preselectedId: string;
  accessCodeInput: string;
  setAccessCodeInput: (v: string) => void;
  selectedTournamentId: string;
  setSelectedTournamentId: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  // Local select state: prefer preselect, else fallback to first tournament or current.
  const initialId = preselectedId || selectedTournamentId || (tournaments[0]?.id ?? '');
  const [localId, setLocalId] = React.useState<string>(initialId);

  const handleSubmit = (e: React.FormEvent) => {
    setSelectedTournamentId(localId);
    onSubmit(e);
  };

  return (
    <PortalModalBackdrop onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-orange-500" /> Tham gia giải đấu
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg cursor-pointer" aria-label="Đóng">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">Chọn giải đấu</label>
            {tournaments.length === 0 ? (
              <div className="text-sm text-stone-400 py-2 italic">Chưa có giải đấu nào.</div>
            ) : (
              <select
                id="select_tournament"
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-stone-800 font-medium"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">Mã code truy cập</label>
            <input
              id="input_access_code"
              type="password"
              placeholder="Nhập mã code..."
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-stone-800 placeholder-stone-400 font-mono tracking-widest text-center"
            />
          </div>
          <button
            id="btn_join_tournament"
            type="submit"
            disabled={loading || tournaments.length === 0 || !accessCodeInput.trim()}
            className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold cursor-pointer transition-colors flex justify-center items-center gap-2 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
          >
            <UserCheck className="w-5 h-5" />
            Tham gia
          </button>
        </form>
      </div>
    </PortalModalBackdrop>
  );
}

function CreateTournamentModal({
  name, setName, code, setCode, desc, setDesc, loading, onClose, onSubmit,
}: {
  name: string; setName: (v: string) => void;
  code: string; setCode: (v: string) => void;
  desc: string; setDesc: (v: string) => void;
  loading: boolean; onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    onSubmit(e);
  };
  return (
    <PortalModalBackdrop onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-500" /> Tạo giải đấu mới
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg cursor-pointer" aria-label="Đóng">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">Tên giải đấu</label>
            <input
              id="input_new_tour_name"
              type="text"
              placeholder="Ví dụ: Giải Bi Lắc Văn Phòng Q3..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-stone-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">Mã code bảo mật</label>
            <input
              id="input_new_tour_code"
              type="text"
              placeholder="Ví dụ: 9999..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-stone-800 font-mono tracking-widest text-center"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2">Mô tả ngắn</label>
            <input
              id="input_new_tour_desc"
              type="text"
              placeholder="Ví dụ: Khối kỹ thuật và vận hành..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-stone-800"
            />
          </div>
          <button
            id="btn_create_tournament"
            type="submit"
            disabled={loading || !name.trim() || !code.trim()}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold cursor-pointer transition-colors flex justify-center items-center gap-2 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            Khởi tạo & tham gia
          </button>
        </form>
      </div>
    </PortalModalBackdrop>
  );
}
