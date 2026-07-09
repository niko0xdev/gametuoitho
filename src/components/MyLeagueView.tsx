import React, { useState, useEffect } from 'react';
import {
  Trophy, PlusCircle, Trash2, Check, X, Plus,
  ChevronRight, Play, Save, Info, Edit3, Link2, Copy, UserPlus, Users,
  Sparkles, Loader2, KeyRound, LogIn
} from 'lucide-react';
import { playRetroBeep } from './games/CaroBoard.tsx';
import {
  UserProfile, MyLeague, LeagueTeam, MatchEvent, LeagueMatch,
  GroupStanding, SportType, FormatType, LeagueMember, LeagueMemberRole
} from '../types.ts';
import { knockoutWinner } from '../lib/knockout.ts';
import { UserSearchInput, type UserSearchResult } from './UserSearchInput.tsx';

// Re-export so any historical `import { MyLeague } from './MyLeagueView'` still resolves.
export type {
  MyLeague, LeagueTeam, MatchEvent, LeagueMatch, GroupStanding,
  SportType, FormatType, LeagueMember, LeagueMemberRole
};

const LOGO_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-sky-500', 'bg-rose-500', 'bg-lime-500'
];

export const SPORT_LABELS: Record<SportType, { name: string; icon: string; scoreUnit: string }> = {
  futsal: { name: 'Bóng đá Futsal', icon: '⚽', scoreUnit: 'Bàn thắng' },
  pes: { name: 'Đá PES (eFootball)', icon: '🎮', scoreUnit: 'Bàn thắng' },
  pingpong: { name: 'Bóng bàn', icon: '🏓', scoreUnit: 'Điểm số' },
  badminton: { name: 'Cầu lông', icon: '🏸', scoreUnit: 'Điểm số' }
};

export const FORMAT_LABELS: Record<FormatType, string> = {
  round_robin: 'Vòng tròn tính điểm',
  knockout: 'Loại trực tiếp (Knockout)',
  group_knockout: 'Chia bảng + Loại trực tiếp'
};

type LeagueListItem = MyLeague & { memberCount: number; role: LeagueMemberRole | null; isMember: boolean };

interface MyLeagueViewProps {
  userId?: string;
  userProfile?: UserProfile | null;
  viewMode?: 'member' | 'view-only';
  slug?: string | null;
  accessCode?: string | null;
  onOpenAuthModal?: () => void;
  onNavigate?: (view: string, slug?: string, code?: string) => void;
}

export default function MyLeagueView({
  userId = '',
  userProfile,
  viewMode = 'member',
  slug,
  accessCode,
  onOpenAuthModal,
  onNavigate,
}: MyLeagueViewProps) {
  // ── Portal state ───────────────────────────────────────────────────────
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);
  const [portalTab, setPortalTab] = useState<'all' | 'mine'>('all');
  const [selectedLeague, setSelectedLeague] = useState<MyLeague | null>(null);
  const [myRole, setMyRole] = useState<LeagueMemberRole | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [cachedCode, setCachedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'standings' | 'teams' | 'stats' | 'members'>('schedule');

  // View-only (share-link) state
  const [viewLeague, setViewLeague] = useState<MyLeague | null>(null);
  const [viewError, setViewError] = useState('');

  // Access-by-code prompt (non-member clicks a league in the list)
  const [accessTarget, setAccessTarget] = useState<LeagueListItem | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newLeagueSport, setNewLeagueSport] = useState<SportType>('futsal');
  const [newLeagueFormat, setNewLeagueFormat] = useState<FormatType>('round_robin');
  const [newLeagueCode, setNewLeagueCode] = useState('');
  const [newLeagueDescription, setNewLeagueDescription] = useState('');
  const [numTeams, setNumTeams] = useState<number>(4);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<string[][]>([]);
  const [formError, setFormError] = useState('');
  const [syncError, setSyncError] = useState('');

  // AI roster import
  const [aiRosterText, setAiRosterText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');
  const [aiErrorMessage, setAiErrorMessage] = useState('');

  // Editing match
  const [editingMatch, setEditingMatch] = useState<LeagueMatch | null>(null);
  const [editHomeScore, setEditHomeScore] = useState<string>('');
  const [editAwayScore, setEditAwayScore] = useState<string>('');
  const [editingTeamPlayers, setEditingTeamPlayers] = useState<{ teamId: string; players: string[] } | null>(null);

  // Futsal match events
  const [editingMatchEvents, setEditingMatchEvents] = useState<MatchEvent[]>([]);
  const [newEventTeamId, setNewEventTeamId] = useState<string>('');
  const [newEventType, setNewEventType] = useState<'goal' | 'yellow' | 'red'>('goal');
  const [newEventPlayerName, setNewEventPlayerName] = useState<string>('');
  const [isCustomPlayer, setIsCustomPlayer] = useState<boolean>(false);
  const [newEventMinute, setNewEventMinute] = useState<string>('');

  // AI summary -> structured events (prefill only)
  const [aiSummaryText, setAiSummaryText] = useState<string>('');
  const [isAiEventLoading, setIsAiEventLoading] = useState<boolean>(false);
  const [aiEventPreview, setAiEventPreview] = useState<Array<{ type: 'goal'|'yellow'|'red'; teamSide: 'home'|'away'|'unknown'; playerName: string; minute?: number; note?: string }> | null>(null);

  // Invite member
  const [inviteUsername, setInviteUsername] = useState('');

  const canEdit = viewMode === 'member' && (myRole === 'owner' || myRole === 'admin');
  const canManage = viewMode === 'member' && myRole === 'owner';

  // ── API helpers ────────────────────────────────────────────────────────
  const authHeaders = (extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
    if (userId) h['x-user-id'] = userId;
    return h;
  };
  const leagueHeaders = (id?: string, code?: string) => {
    const h: Record<string, string> = {};
    if (userId) h['x-user-id'] = userId;
    if (id || selectedLeague?.id) h['x-league-id'] = (id || selectedLeague?.id) as string;
    const c = code || cachedCode || '';
    if (c) h['x-league-code'] = c;
    return h;
  };

  const fetchLeagues = async () => {
    if (!userId) { setLeagues([]); return; }
    try {
      const res = await fetch('/api/leagues', { headers: authHeaders() });
      if (!res.ok) { setLeagues([]); return; }
      const data = await res.json();
      setLeagues(Array.isArray(data) ? data : []);
    } catch {
      setLeagues([]);
    }
  };

  const fetchMembers = async (leagueId: string, code: string) => {
    try {
      const res = await fetch('/api/leagues/members', { headers: leagueHeaders(leagueId, code) });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch { /* ignore */ }
  };

  // Load portal list on login.
  useEffect(() => { fetchLeagues(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  // Open a league from the portal list.
  const openLeague = async (item: LeagueListItem) => {
    if (!userId) { onOpenAuthModal?.(); return; }
    if (item.role) {
      // Member — retrieve the code (cached client-side after first access).
      let code = localStorage.getItem(`myleague_code_${item.id}`);
      if (!code) {
        try {
          const res = await fetch('/api/leagues/access', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ leagueId: item.id }),
          });
          if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Không thể mở giải'); return; }
          const data = await res.json();
          code = data.code;
          if (code) localStorage.setItem(`myleague_code_${item.id}`, code);
        } catch { alert('Lỗi kết nối'); return; }
      }
      setCachedCode(code);
      setSelectedLeague({ ...item, code });
      setMyRole(item.role);
      setActiveTab('schedule');
      fetchMembers(item.id, code || '');
    } else {
      // Non-member — prompt for the access code, then view via share link.
      setAccessTarget(item);
      setAccessCodeInput('');
    }
  };

  // View-only: fetch by slug + code.
  useEffect(() => {
    if (viewMode !== 'view-only' || !slug) return;
    setViewLeague(null);
    setViewError('');
    const q = new URLSearchParams();
    if (accessCode) q.set('code', accessCode);
    fetch(`/api/leagues/by-slug/${slug}?${q.toString()}`, { headers: userId ? { 'x-user-id': userId } : {} })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setViewError(data.error || 'Không tải được giải đấu'); return; }
        setViewLeague(data as MyLeague);
        setMyRole((data as any).role ?? null);
      })
      .catch(() => setViewError('Lỗi kết nối máy chủ'));
  }, [viewMode, slug, accessCode, userId]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const persistLeague = async (updated: MyLeague) => {
    if (!selectedLeague) return;
    const prev = selectedLeague;
    setSelectedLeague(updated);
    try {
      const res = await fetch(`/api/leagues/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders(updated.id) },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setSelectedLeague(prev);
        setSyncError(e.error || 'Lưu thất bại — đã hoàn tác.');
        return;
      }
      setSyncError('');
      fetchLeagues();
    } catch {
      setSelectedLeague(prev);
      setSyncError('Mất kết nối máy chủ — đã hoàn tác.');
    }
  };

  const deleteLeague = async (id: string) => {
    if (!window.confirm('Xoá giải đấu này? Toàn bộ lịch thi đấu + kết quả sẽ bị xoá.')) return;
    const ok = await (async () => {
      try {
        const res = await fetch(`/api/leagues/${id}`, { method: 'DELETE', headers: leagueHeaders(id) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Xoá thất bại'); return false; }
        return true;
      } catch { alert('Mất kết nối'); return false; }
    })();
    if (!ok) return;
    setSelectedLeague(null);
    setMyRole(null);
    setMembers([]);
    setCachedCode(null);
    playRetroBeep(180, 'sawtooth', 0.15);
    fetchLeagues();
  };

  const inviteMember = async (overrideUsername?: string) => {
    const uname = (overrideUsername ?? inviteUsername).trim();
    if (!selectedLeague || !uname) return;
    try {
      const res = await fetch('/api/leagues/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders() },
        body: JSON.stringify({ username: uname }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Mời thất bại'); return; }
      setInviteUsername('');
      fetchMembers(selectedLeague.id, cachedCode || '');
      fetchLeagues();
      playRetroBeep(700, 'sine', 0.1);
    } catch { alert('Mất kết nối'); }
  };

  // Picked from the search dropdown → fill + invite in one step.
  const onSelectUser = (u: UserSearchResult) => {
    setInviteUsername(u.username);
    inviteMember(u.username);
  };

  const removeMember = async (memberUserId: string) => {
    if (!selectedLeague) return;
    if (!window.confirm('Xoá quản trị viên này khỏi giải?')) return;
    try {
      const res = await fetch(`/api/leagues/members/${memberUserId}`, {
        method: 'DELETE', headers: leagueHeaders(),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error || 'Xoá thất bại'); return; }
      fetchMembers(selectedLeague.id, cachedCode || '');
    } catch { alert('Mất kết nối'); }
  };

  const shareLink = selectedLeague?.slug && cachedCode
    ? `${window.location.origin}/the-thao/${selectedLeague.slug}?code=${encodeURIComponent(cachedCode)}`
    : '';
  const copyShareLink = () => {
    if (!shareLink) return;
    navigator.clipboard?.writeText(shareLink).then(() => {
      playRetroBeep(880, 'sine', 0.1);
      setSyncError(''); // reuse as transient toast-free signal
    }).catch(() => alert(shareLink));
  };

  // ── Create form helpers ────────────────────────────────────────────────
  useEffect(() => {
    setTeamNames(prev => Array.from({ length: numTeams }, (_, i) => prev[i] || `Đội tuyển ${i + 1}`));
    setTeamPlayers(prev => Array.from({ length: numTeams }, (_, i) => prev[i] || []));
  }, [numTeams, newLeagueSport]);

  const handleTeamNameChange = (index: number, val: string) => {
    const next = [...teamNames]; next[index] = val; setTeamNames(next);
  };
  const handlePlayerNameChange = (teamIdx: number, playerIdx: number, val: string) => {
    const next = [...teamPlayers]; const tp = [...(next[teamIdx] || [])]; tp[playerIdx] = val; next[teamIdx] = tp; setTeamPlayers(next);
  };
  const addPlayerField = (teamIdx: number) => {
    const next = [...teamPlayers]; const tp = [...(next[teamIdx] || [])]; tp.push(''); next[teamIdx] = tp; setTeamPlayers(next);
  };
  const removePlayerField = (teamIdx: number, playerIdx: number) => {
    const next = [...teamPlayers]; const tp = [...(next[teamIdx] || [])]; tp.splice(playerIdx, 1); next[teamIdx] = tp; setTeamPlayers(next);
  };

  const handleAiParse = async () => {
    if (!aiRosterText.trim()) { setAiErrorMessage('Vui lòng điền thông tin tóm tắt giải đấu!'); return; }
    setIsAiLoading(true); setAiErrorMessage(''); setAiSuccessMessage('');
    try {
      const response = await fetch('/api/ai/parse-roster', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ summary: aiRosterText }),
      });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || 'AI thất bại.'); }
      const data = await response.json();
      if (data?.teams && Array.isArray(data.teams)) {
        const parsedTeams = data.teams;
        if (parsedTeams.length === 0) throw new Error('AI không nhận diện được đội bóng nào.');
        let target = parsedTeams.length;
        if (newLeagueFormat === 'group_knockout') target = 8;
        else if (newLeagueFormat === 'knockout') target = parsedTeams.length > 4 ? 8 : 4;
        else target = parsedTeams.length <= 3 ? 3 : parsedTeams.length <= 6 ? parsedTeams.length : 8;
        setNumTeams(target);
        setTeamNames(Array.from({ length: target }, (_, i) => parsedTeams[i]?.name || `Đội tuyển ${i + 1}`));
        setTeamPlayers(Array.from({ length: target }, (_, i) => Array.isArray(parsedTeams[i]?.players) ? parsedTeams[i].players : []));
        setAiSuccessMessage(`✨ Đã phân tích ${parsedTeams.length} đội bằng AI và điền vào form!`);
        playRetroBeep(880, 'sine', 0.1);
      } else throw new Error('Định dạng AI không hợp lệ.');
    } catch (err: any) {
      setAiErrorMessage(err.message || 'Có lỗi xảy ra khi liên kết AI.');
    } finally { setIsAiLoading(false); }
  };

  const buildMatches = (teams: LeagueTeam[]): LeagueMatch[] => {
    const matches: LeagueMatch[] = [];
    if (newLeagueFormat === 'round_robin') {
      const list = [...teams];
      if (list.length % 2 !== 0) list.push({ id: 'BYE', name: 'Nghỉ (BYE)', logoColor: 'bg-stone-300' });
      const n = list.length; let mIdx = 1;
      for (let r = 0; r < n - 1; r++) {
        for (let i = 0; i < n / 2; i++) {
          const home = list[i], away = list[n - 1 - i];
          if (home.id !== 'BYE' && away.id !== 'BYE') {
            matches.push({ id: `match-${Date.now()}-${mIdx++}`, round: r + 1, stage: 'Group Stage', home: home.id, away: away.id, homeScore: null, awayScore: null, isPlayed: false });
          }
        }
        list.splice(1, 0, list.pop()!);
      }
    } else if (newLeagueFormat === 'knockout') {
      const size = teams.length;
      if (size === 4) {
        matches.push(
          { id: 'ko-sf1', round: 1, stage: 'Semifinals', home: teams[0].id, away: teams[3].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'home' },
          { id: 'ko-sf2', round: 1, stage: 'Semifinals', home: teams[1].id, away: teams[2].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'away' },
          { id: 'ko-f1', round: 2, stage: 'Final', home: 'Thắng Bán Kết 1', away: 'Thắng Bán Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null },
        );
      } else if (size === 8) {
        matches.push(
          { id: 'ko-qf1', round: 1, stage: 'Quarterfinals', home: teams[0].id, away: teams[7].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf1', nextMatchPosition: 'home' },
          { id: 'ko-qf2', round: 1, stage: 'Quarterfinals', home: teams[3].id, away: teams[4].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf1', nextMatchPosition: 'away' },
          { id: 'ko-qf3', round: 1, stage: 'Quarterfinals', home: teams[1].id, away: teams[6].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf2', nextMatchPosition: 'home' },
          { id: 'ko-qf4', round: 1, stage: 'Quarterfinals', home: teams[2].id, away: teams[5].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf2', nextMatchPosition: 'away' },
          { id: 'ko-sf1', round: 2, stage: 'Semifinals', home: 'Thắng Tứ Kết 1', away: 'Thắng Tứ Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'home' },
          { id: 'ko-sf2', round: 2, stage: 'Semifinals', home: 'Thắng Tứ Kết 3', away: 'Thắng Tứ Kết 4', homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'away' },
          { id: 'ko-f1', round: 3, stage: 'Final', home: 'Thắng Bán Kết 1', away: 'Thắng Bán Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null },
        );
      } else {
        setFormError('Vui lòng chọn 4 hoặc 8 đội cho thể thức loại trực tiếp!');
        return matches;
      }
    } else {
      // group_knockout — requires exactly 8 teams
      if (teams.length !== 8) { setFormError('Thể thức chia bảng cần đúng 8 đội!'); return matches; }
      const groupA = teams.slice(0, 4), groupB = teams.slice(4, 8);
      const genGroup = (grp: LeagueTeam[], label: 'A' | 'B') => {
        const list = [...grp]; const out: LeagueMatch[] = []; const n = list.length; let mIdx = 1;
        for (let r = 0; r < n - 1; r++) {
          for (let i = 0; i < n / 2; i++) {
            out.push({ id: `match-grp${label}-${r}-${i}`, round: r + 1, stage: 'Group Stage', group: label, home: list[i].id, away: list[n - 1 - i].id, homeScore: null, awayScore: null, isPlayed: false });
          }
          list.splice(1, 0, list.pop()!);
        }
        return out;
      };
      matches.push(...genGroup(groupA, 'A'), ...genGroup(groupB, 'B'));
      matches.push(
        { id: 'grpko-sf1', round: 4, stage: 'Semifinals', home: 'Nhất Bảng A', away: 'Nhì Bảng B', homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'grpko-f1', nextMatchPosition: 'home' },
        { id: 'grpko-sf2', round: 4, stage: 'Semifinals', home: 'Nhất Bảng B', away: 'Nhì Bảng A', homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'grpko-f1', nextMatchPosition: 'away' },
        { id: 'grpko-f1', round: 5, stage: 'Final', home: 'Thắng Bán Kết 1', away: 'Thắng Bán Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null },
      );
    }
    return matches;
  };

  const createNewLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!userId) { onOpenAuthModal?.(); return; }
    if (!newLeagueName.trim()) { setFormError('Hãy điền tên giải đấu!'); return; }
    if (!newLeagueCode.trim()) { setFormError('Hãy đặt mã truy cập (passcode) để chia sẻ!'); return; }
    const uniqueTeams = teamNames.filter(t => t.trim() !== '');
    if (uniqueTeams.length < 2) { setFormError('Cần ít nhất 2 đội!'); return; }
    if (newLeagueFormat === 'knockout' && uniqueTeams.length !== 4 && uniqueTeams.length !== 8) {
      setFormError('Knockout cần 4 hoặc 8 đội!'); return;
    }
    if (newLeagueFormat === 'group_knockout' && uniqueTeams.length !== 8) {
      setFormError('Chia bảng cần đúng 8 đội!'); return;
    }

    const teamsList: LeagueTeam[] = uniqueTeams.map((name, idx) => ({
      id: `team-${Date.now()}-${idx}`,
      name: name.trim(),
      logoColor: LOGO_COLORS[idx % LOGO_COLORS.length],
      players: newLeagueSport === 'futsal' ? (teamPlayers[idx] || []).map(p => p.trim()).filter(p => p.length > 0) : [],
    }));

    const matches = buildMatches(teamsList);
    if (formError) return;

    const league: MyLeague = {
      id: `league-${Date.now()}`,
      name: newLeagueName.trim(),
      sport: newLeagueSport,
      format: newLeagueFormat,
      teams: teamsList,
      matches,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      code: newLeagueCode.trim(),
      description: newLeagueDescription.trim(),
    };

    try {
      const res = await fetch('/api/leagues', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(league),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setFormError(e.error || 'Tạo giải thất bại'); return; }
      const data = await res.json();
      const created: MyLeague = data.league;
      localStorage.setItem(`myleague_code_${created.id}`, created.code || '');
      setCachedCode(created.code || null);
      setSelectedLeague(created);
      setMyRole('owner');
      setActiveTab('schedule');
      setShowCreateForm(false);
      setNewLeagueName(''); setNewLeagueCode(''); setNewLeagueDescription(''); setAiRosterText('');
      fetchLeagues();
      playRetroBeep(900, 'sine', 0.2);
    } catch {
      setFormError('Mất kết nối máy chủ.');
    }
  };

  // ── Standings + stats ──────────────────────────────────────────────────
  const computeStandings = (teams: LeagueTeam[], matches: LeagueMatch[], targetGroup?: 'A' | 'B'): GroupStanding[] => {
    const map: Record<string, GroupStanding> = {};
    let activeTeams = teams;
    if (targetGroup) activeTeams = targetGroup === 'A' ? teams.slice(0, 4) : teams.slice(4, 8);
    activeTeams.forEach(t => {
      map[t.id] = { teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
    });
    matches.forEach(m => {
      if (!m.isPlayed) return;
      if (selectedLeague?.format === 'group_knockout' && m.stage !== 'Group Stage') return;
      if (targetGroup && m.group !== targetGroup) return;
      const hScore = m.homeScore ?? 0, aScore = m.awayScore ?? 0;
      if (!map[m.home] || !map[m.away]) return;
      map[m.home].played++; map[m.away].played++;
      map[m.home].goalsFor += hScore; map[m.home].goalsAgainst += aScore;
      map[m.away].goalsFor += aScore; map[m.away].goalsAgainst += hScore;
      if (hScore > aScore) { map[m.home].won++; map[m.home].points += 3; map[m.away].lost++; }
      else if (hScore < aScore) { map[m.away].won++; map[m.away].points += 3; map[m.home].lost++; }
      else { map[m.home].drawn++; map[m.home].points += 1; map[m.away].drawn++; map[m.away].points += 1; }
    });
    return Object.values(map).map(st => { st.goalDifference = st.goalsFor - st.goalsAgainst; return st; })
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  };

  const computeFutsalStats = () => {
    if (!selectedLeague && !viewLeague) return { scorers: [], redCards: [], yellowCards: [] };
    const league = selectedLeague || viewLeague!;
    const scorerMap: Record<string, { playerName: string; teamId: string; goals: number }> = {};
    const redMap: Record<string, { playerName: string; teamId: string; redCards: number }> = {};
    const yellowMap: Record<string, { playerName: string; teamId: string; yellowCards: number }> = {};
    league.matches.forEach(m => {
      if (!m.isPlayed || !m.events) return;
      m.events.forEach(ev => {
        const key = `${ev.playerName}_${ev.teamId}`;
        if (ev.type === 'goal') { if (!scorerMap[key]) scorerMap[key] = { playerName: ev.playerName, teamId: ev.teamId, goals: 0 }; scorerMap[key].goals += 1; }
        else if (ev.type === 'red') { if (!redMap[key]) redMap[key] = { playerName: ev.playerName, teamId: ev.teamId, redCards: 0 }; redMap[key].redCards += 1; }
        else if (ev.type === 'yellow') { if (!yellowMap[key]) yellowMap[key] = { playerName: ev.playerName, teamId: ev.teamId, yellowCards: 0 }; yellowMap[key].yellowCards += 1; }
      });
    });
    return {
      scorers: Object.values(scorerMap).sort((a, b) => b.goals - a.goals),
      redCards: Object.values(redMap).sort((a, b) => b.redCards - a.redCards),
      yellowCards: Object.values(yellowMap).sort((a, b) => b.yellowCards - a.yellowCards),
    };
  };

  const renderTeamCardsSummary = (match: LeagueMatch, teamId: string) => {
    const league = selectedLeague || viewLeague;
    if (league?.sport !== 'futsal' || !match.isPlayed || !match.events) return null;
    const teamEvents = match.events.filter(e => e.teamId === teamId);
    const yellows = teamEvents.filter(e => e.type === 'yellow');
    const reds = teamEvents.filter(e => e.type === 'red');
    if (yellows.length === 0 && reds.length === 0) return null;
    return (
      <div className="flex items-center gap-1 ml-1.5 shrink-0">
        {yellows.map((_, idx) => <span key={`y-${idx}`} className="inline-block w-2 h-2.5 bg-amber-400 rounded-2xs" title="Thẻ vàng" />)}
        {reds.map((_, idx) => <span key={`r-${idx}`} className="inline-block w-2 h-2.5 bg-red-500 rounded-2xs" title="Thẻ đỏ" />)}
      </div>
    );
  };

  // ── Score edit + AI event prefill ──────────────────────────────────────
  const startEditScore = (match: LeagueMatch) => {
    setEditingMatch(match);
    setEditHomeScore(match.homeScore !== null ? String(match.homeScore) : '0');
    setEditAwayScore(match.awayScore !== null ? String(match.awayScore) : '0');
    setEditingMatchEvents(match.events || []);
    setNewEventTeamId(match.home);
    setNewEventType('goal');
    setNewEventPlayerName('');
    setNewEventMinute('');
  };

  const handleAiPrefillEvents = async () => {
    if (!editingMatch || !selectedLeague) { alert('Vui lòng mở trận đấu cần chỉnh sửa trước!'); return; }
    if (!aiSummaryText.trim()) { alert('Vui lòng nhập tóm tắt diễn biến!'); return; }
    setIsAiEventLoading(true); setAiEventPreview(null);
    try {
      const homeTeam = selectedLeague.teams.find(t => t.id === editingMatch.home);
      const awayTeam = selectedLeague.teams.find(t => t.id === editingMatch.away);
      const res = await fetch('/api/ai/parse-events', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          summary: aiSummaryText,
          homeTeamName: homeTeam?.name || 'đội nhà',
          awayTeamName: awayTeam?.name || 'đội khách',
          homePlayers: homeTeam?.players || [],
          awayPlayers: awayTeam?.players || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'AI không tách được diễn biến.'); playRetroBeep(220, 'sawtooth', 0.25); return; }
      const events: any[] = Array.isArray(data?.events) ? data.events : [];
      setAiEventPreview(events);
      if (events.length === 0) { alert('AI không nhận diện được sự kiện nào.'); playRetroBeep(220, 'sawtooth', 0.25); }
      else playRetroBeep(659, 'sine', 0.12);
    } catch { alert('Lỗi kết nối máy chủ khi gọi AI!'); }
    finally { setIsAiEventLoading(false); }
  };

  const handleAiApplyEvents = () => {
    if (!editingMatch || !aiEventPreview || aiEventPreview.length === 0) return;
    const mapped: MatchEvent[] = aiEventPreview
      .filter(e => e.teamSide === 'home' || e.teamSide === 'away')
      .map(e => ({
        type: e.type,
        teamId: e.teamSide === 'home' ? editingMatch.home : editingMatch.away,
        playerName: e.playerName || '',
        minute: typeof e.minute === 'number' ? e.minute : undefined,
      }));
    if (mapped.length === 0) { alert('Không có sự kiện hợp lệ.'); return; }
    const existing = new Set(editingMatchEvents.map(p => `${p.type}|${p.teamId}|${p.playerName}|${p.minute ?? ''}`));
    const merged = [...editingMatchEvents];
    for (const ev of mapped) {
      const k = `${ev.type}|${ev.teamId}|${ev.playerName}|${ev.minute ?? ''}`;
      if (!existing.has(k)) { merged.push(ev); existing.add(k); }
    }
    merged.sort((a, b) => (a.minute || 0) - (b.minute || 0));
    setEditingMatchEvents(merged);
    const homeGoals = merged.filter(e => e.type === 'goal' && e.teamId === editingMatch.home).length;
    const awayGoals = merged.filter(e => e.type === 'goal' && e.teamId === editingMatch.away).length;
    if (homeGoals > 0) setEditHomeScore(String(homeGoals));
    if (awayGoals > 0) setEditAwayScore(String(awayGoals));
    setAiEventPreview(null);
    setAiSummaryText('');
    playRetroBeep(880, 'sine', 0.2);
    alert(`Đã điền ${mapped.length} sự kiện. Nhấn "Ghi Nhận Kết Quả" để lưu.`);
  };

  const saveMatchScore = () => {
    if (!editingMatch || !selectedLeague) return;
    const hs = editHomeScore.trim() === '' ? 0 : parseInt(editHomeScore);
    const as = editAwayScore.trim() === '' ? 0 : parseInt(editAwayScore);
    if (isNaN(hs) || isNaN(as)) { alert('Tỉ số không hợp lệ!'); return; }
    playRetroBeep(700, 'sine', 0.1);

    const updatedMatches = selectedLeague.matches.map(m => {
      if (m.id !== editingMatch.id) return m;
      let winner: string | null = null;
      if (hs > as) winner = m.home;
      else if (as > hs) winner = m.away;
      else winner = 'DRAW';
      return { ...m, homeScore: hs, awayScore: as, isPlayed: true, winner, events: selectedLeague.sport === 'futsal' ? editingMatchEvents : m.events };
    });

    let nextLeague: MyLeague = { ...selectedLeague, matches: updatedMatches };

    if (selectedLeague.format === 'knockout') {
      const match = updatedMatches.find(m => m.id === editingMatch.id)!;
      if (match.nextMatchId) {
        const winnerId = knockoutWinner(match.home, match.away, hs, as);
        if (!winnerId) { alert('Trận hoà! Nhập tỉ số phân thắng bại.'); return; }
        nextLeague.matches = nextLeague.matches.map(nm => nm.id === match.nextMatchId
          ? (match.nextMatchPosition === 'home' ? { ...nm, home: winnerId } : { ...nm, away: winnerId })
          : nm);
      }
    } else if (selectedLeague.format === 'group_knockout') {
      const match = updatedMatches.find(m => m.id === editingMatch.id)!;
      const allGroupPlayed = updatedMatches.filter(m => m.stage === 'Group Stage').every(m => m.isPlayed);
      if (allGroupPlayed && match.stage === 'Group Stage') {
        const standA = computeStandings(selectedLeague.teams, updatedMatches, 'A');
        const standB = computeStandings(selectedLeague.teams, updatedMatches, 'B');
        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === 'grpko-sf1') return { ...nm, home: standA[0].teamId, away: standB[1].teamId };
          if (nm.id === 'grpko-sf2') return { ...nm, home: standB[0].teamId, away: standA[1].teamId };
          return nm;
        });
      }
      if (match.stage !== 'Group Stage' && match.nextMatchId) {
        const winnerId = knockoutWinner(match.home, match.away, hs, as);
        if (!winnerId) { alert('Trận hoà! Nhập tỉ số phân thắng bại.'); return; }
        nextLeague.matches = nextLeague.matches.map(nm => nm.id === match.nextMatchId
          ? (match.nextMatchPosition === 'home' ? { ...nm, home: winnerId } : { ...nm, away: winnerId })
          : nm);
      }
    }

    if (nextLeague.matches.every(m => m.isPlayed)) nextLeague.status = 'ENDED';

    setEditingMatch(null);
    persistLeague(nextLeague);
  };

  const saveTeamPlayers = () => {
    if (!selectedLeague || !editingTeamPlayers) return;
    const { teamId, players } = editingTeamPlayers;
    const playerNames = players.map(n => n.trim()).filter(n => n.length > 0);
    const updatedTeams = selectedLeague.teams.map(t => t.id === teamId ? { ...t, players: playerNames } : t);
    persistLeague({ ...selectedLeague, teams: updatedTeams });
    setEditingTeamPlayers(null);
  };

  const getTeamName = (id: string, teams: LeagueTeam[]) => teams.find(t => t.id === id)?.name || id;
  const getTeamColor = (id: string, teams: LeagueTeam[]) => teams.find(t => t.id === id)?.logoColor || 'bg-stone-300';

  // Close edit modal on Escape.
  useEffect(() => {
    if (!editingMatch) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditingMatch(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingMatch]);

  // ── Render ─────────────────────────────────────────────────────────────

  // View-only share-link landing.
  if (viewMode === 'view-only') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {viewError ? (
          <div className="text-center py-20 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50">
            <Trophy className="w-12 h-12 text-stone-300 mx-auto" />
            <p className="text-sm font-bold text-stone-600 mt-3">{viewError}</p>
            <p className="text-xs text-stone-400 mt-1">Kiểm tra lại link chia sẻ hoặc mã truy cập.</p>
            <button onClick={() => onNavigate?.('myleague')} className="mt-4 bg-stone-900 hover:bg-stone-800 text-white font-bold py-2 px-4 rounded-xl text-xs">
              Về danh sách giải
            </button>
          </div>
        ) : !viewLeague ? (
          <div className="text-center py-20 text-stone-400 text-xs">Đang tải giải đấu…</div>
        ) : (
          <LeagueDetail
            league={viewLeague}
            canEdit={false}
            canManage={false}
            myRole={myRole}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onBack={() => onNavigate?.('myleague')}
            onEditMatch={() => {}}
            onEditTeamPlayers={() => {}}
            onShareCopy={() => {}}
            shareLink=''
            members={[]}
            computeStandings={computeStandings}
            computeFutsalStats={computeFutsalStats}
            getTeamName={getTeamName}
            getTeamColor={getTeamColor}
            renderTeamCardsSummary={renderTeamCardsSummary}
            viewOnlyBanner={
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs flex items-center justify-between gap-2 mb-4">
                <span>👁️ Chế độ xem — bạn chỉ có thể xem kết quả. {myRole ? 'Bạn là ' + (myRole === 'owner' ? 'chủ giải' : 'quản trị viên') + '.' : ''}</span>
                {myRole && userId && (
                  <button onClick={() => onNavigate?.('myleague')} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-3 rounded-lg text-[10px]">
                    Mở quản trị
                  </button>
                )}
              </div>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {syncError && (
        <div className="mb-4 bg-red-50 text-red-700 border border-red-200 p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <span>⚠️ {syncError}</span>
          <button onClick={() => setSyncError('')} className="text-red-500 hover:text-red-700 font-bold">Đóng</button>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-lg sm:text-2xl font-serif font-black text-stone-900 flex flex-wrap items-center gap-1.5 sm:gap-2 leading-tight">
            <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-amber-500 fill-amber-100 shrink-0" />
            <span>Giải Đấu Thể Thao</span>
            <span className="text-[10px] sm:text-xs bg-orange-100 text-orange-700 py-0.5 sm:py-1 px-2 rounded-full font-sans font-bold whitespace-nowrap">Chia sẻ &amp; Quản lý</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">Tạo giải, chia sẻ link + passcode cho người xem. Chỉ chủ giải &amp; quản trị viên được sửa kết quả.</p>
        </div>
        {!selectedLeague && (
          <button
            onClick={() => { if (!userId) { onOpenAuthModal?.(); return; } setShowCreateForm(true); playRetroBeep(440, 'sine', 0.1); }}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow hover:shadow-md"
          >
            <PlusCircle className="w-4 h-4" /> Tổ Chức Giải Đấu Mới
          </button>
        )}
      </div>

      {/* CREATE FORM */}
      {showCreateForm && (
        <div className="bg-white border-2 border-orange-200 shadow-xl rounded-2xl p-6 mb-8 animate-fade-in relative">
          <button onClick={() => setShowCreateForm(false)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <form onSubmit={createNewLeague} className="flex flex-col gap-6">
            <h2 className="text-base font-bold text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2">
              🏆 Thiết lập Giải Đấu Mới
            </h2>
            {formError && <div className="bg-red-50 text-red-600 border border-red-200 p-3 rounded-lg text-xs font-semibold">{formError}</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-name" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Tên giải đấu</label>
                  <input id="form-league-name" type="text" required placeholder="Futsal UIT Championship 2026" value={newLeagueName} onChange={e => setNewLeagueName(e.target.value)} className="bg-stone-50 border border-stone-300 focus:border-orange-500 focus:bg-white rounded-xl text-xs py-2.5 px-3.5 font-semibold" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-code" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider flex items-center gap-1"><KeyRound className="w-3 h-3" /> Mã truy cập (passcode)</label>
                  <input id="form-league-code" type="text" required placeholder="VD: 1234 hoặc futsal2026" value={newLeagueCode} onChange={e => setNewLeagueCode(e.target.value)} className="bg-stone-50 border border-stone-300 focus:border-orange-500 focus:bg-white rounded-xl text-xs py-2.5 px-3.5 font-semibold" />
                  <span className="text-[10px] text-stone-400">Người xem cần link + mã này để xem giải.</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-desc" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Mô tả (tuỳ chọn)</label>
                  <input id="form-league-desc" type="text" placeholder="Giới thiệu ngắn về giải" value={newLeagueDescription} onChange={e => setNewLeagueDescription(e.target.value)} className="bg-stone-50 border border-stone-300 focus:border-orange-500 focus:bg-white rounded-xl text-xs py-2.5 px-3.5 font-semibold" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-sport" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Bộ môn</label>
                  <select id="form-league-sport" value={newLeagueSport} onChange={e => setNewLeagueSport(e.target.value as SportType)} className="bg-white border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 cursor-pointer font-semibold">
                    <option value="futsal">⚽ Futsal</option>
                    <option value="pes">🎮 PES eFootball</option>
                    <option value="pingpong">🏓 Bóng bàn</option>
                    <option value="badminton">🏸 Cầu lông</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-format" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Thể thức</label>
                  <select id="form-league-format" value={newLeagueFormat} onChange={e => { const fmt = e.target.value as FormatType; setNewLeagueFormat(fmt); setNumTeams(fmt === 'group_knockout' ? 8 : fmt === 'knockout' ? 4 : 4); }} className="bg-white border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 cursor-pointer font-semibold">
                    <option value="round_robin">🔄 Vòng tròn tính điểm</option>
                    <option value="knockout">⚡ Loại trực tiếp</option>
                    <option value="group_knockout">⚜️ Chia bảng + Loại trực tiếp</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-teams-count" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Số đội</label>
                  <select id="form-league-teams-count" value={numTeams} disabled={newLeagueFormat === 'group_knockout'} onChange={e => setNumTeams(parseInt(e.target.value))} className="bg-white border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 cursor-pointer font-semibold disabled:opacity-50">
                    {newLeagueFormat === 'knockout' ? (<><option value="4">4 Đội</option><option value="8">8 Đội</option></>) : newLeagueFormat === 'group_knockout' ? (<option value="8">8 Đội (2 bảng)</option>) : (<><option value="3">3 Đội</option><option value="4">4 Đội</option><option value="5">5 Đội</option><option value="6">6 Đội</option><option value="8">8 Đội</option></>)}
                  </select>
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col gap-2.5">
                <div className="bg-orange-50/40 border border-orange-150 rounded-xl p-4 flex flex-col gap-3 mb-2">
                  <div className="flex items-center gap-2 text-stone-800 font-bold text-xs border-b border-orange-200/50 pb-2">
                    <span className="p-1 bg-orange-100 text-orange-600 rounded-lg">🤖</span> AI Quick Import (nhập nhanh đội hình)
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">Dán tóm tắt đội hình — AI tự động phân tích tên đội + cầu thủ để điền vào form.</p>
                  <textarea rows={4} value={aiRosterText} onChange={e => setAiRosterText(e.target.value)} className="w-full bg-white border border-stone-300 focus:border-orange-500 rounded-lg p-2.5 text-xs font-semibold leading-relaxed" />
                  <button type="button" disabled={isAiLoading} onClick={handleAiParse} className="bg-stone-800 hover:bg-stone-900 text-white text-[10px] font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer self-start">
                    {isAiLoading ? '⏳ Đang phân tích...' : '⚡ Phân tích bằng AI'}
                  </button>
                  {aiSuccessMessage && <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 p-2.5 rounded-lg text-[10px] font-bold">{aiSuccessMessage}</div>}
                  {aiErrorMessage && <div className="bg-rose-50 text-rose-700 border border-rose-200 p-2.5 rounded-lg text-[10px] font-bold">❌ {aiErrorMessage}</div>}
                </div>

                <span className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Tên các đội / VĐV ({numTeams})</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[350px] overflow-y-auto p-2 border border-stone-200 rounded-xl bg-stone-50">
                  {Array.from({ length: numTeams }).map((_, idx) => (
                    <div key={idx} className="flex flex-col gap-2 bg-white border border-stone-200 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full ${LOGO_COLORS[idx % LOGO_COLORS.length]} shrink-0`} />
                        <input type="text" required placeholder={`Đội / VĐV thứ ${idx + 1}`} value={teamNames[idx] || ''} onChange={e => handleTeamNameChange(idx, e.target.value)} className="flex-1 bg-transparent border-b border-stone-100 focus:border-orange-500 p-0.5 text-xs font-bold text-stone-800" />
                      </div>
                      {newLeagueSport === 'futsal' && (
                        <div className="flex flex-col gap-1.5 pl-5.5">
                          <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                            {(teamPlayers[idx] || []).map((player, pIdx) => (
                              <div key={pIdx} className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono text-stone-400 w-3 shrink-0">{pIdx + 1}.</span>
                                <input type="text" value={player} onChange={e => handlePlayerNameChange(idx, pIdx, e.target.value)} className="flex-1 bg-stone-50 border border-stone-200 focus:border-orange-400 rounded-lg text-[10px] py-1 px-2 font-medium" />
                                <button type="button" onClick={() => removePlayerField(idx, pIdx)} className="text-stone-400 hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => addPlayerField(idx)} className="mt-1 flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 py-1 px-2 rounded-lg self-start cursor-pointer"><Plus className="w-3 h-3" /> Thêm cầu thủ</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-100">
              <button type="button" onClick={() => setShowCreateForm(false)} className="bg-stone-150 hover:bg-stone-200 text-stone-700 font-bold py-2 px-5 rounded-lg text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow"><Play className="w-3.5 h-3.5 fill-white" /> Khởi Tạo &amp; Lập Lịch</button>
            </div>
          </form>
        </div>
      )}

      {/* DETAIL or PORTAL */}
      {selectedLeague ? (
        <LeagueDetail
          league={selectedLeague}
          canEdit={canEdit}
          canManage={canManage}
          myRole={myRole}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onBack={() => { setSelectedLeague(null); setMyRole(null); setMembers([]); setCachedCode(null); }}
          onEditMatch={canEdit ? startEditScore : () => {}}
          onEditTeamPlayers={canEdit ? (t) => setEditingTeamPlayers({ teamId: t, players: selectedLeague.teams.find(x => x.id === t)?.players ? [...(selectedLeague.teams.find(x => x.id === t)!.players!)] : [] }) : () => {}}
          onShareCopy={copyShareLink}
          shareLink={shareLink}
          onDelete={canManage ? () => deleteLeague(selectedLeague.id) : undefined}
          members={members}
          onInvite={canManage ? inviteMember : undefined}
          onRemoveMember={canManage ? removeMember : undefined}
          onSelectUser={canManage ? onSelectUser : undefined}
          currentUserId={userId}
          inviteUsername={inviteUsername}
          setInviteUsername={setInviteUsername}
          computeStandings={computeStandings}
          computeFutsalStats={computeFutsalStats}
          getTeamName={getTeamName}
          getTeamColor={getTeamColor}
          renderTeamCardsSummary={renderTeamCardsSummary}
          editingTeamPlayers={editingTeamPlayers}
          setEditingTeamPlayers={setEditingTeamPlayers}
          saveTeamPlayers={saveTeamPlayers}
        />
      ) : (
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Portal tabs */}
          <div className="flex items-center gap-2 border-b border-stone-200">
            <button onClick={() => { setPortalTab('all'); playRetroBeep(330, 'sine', 0.05); }} className={`py-2 px-4 -mb-px border-b-2 text-xs font-bold transition-all cursor-pointer ${portalTab === 'all' ? 'border-orange-500 text-orange-600' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
              Tất cả giải ({leagues.length})
            </button>
            <button onClick={() => { setPortalTab('mine'); playRetroBeep(330, 'sine', 0.05); }} className={`py-2 px-4 -mb-px border-b-2 text-xs font-bold transition-all cursor-pointer ${portalTab === 'mine' ? 'border-orange-500 text-orange-600' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
              Giải của tôi ({leagues.filter(l => l.role).length})
            </button>
          </div>

          {!userId ? (
            <div className="text-center py-16 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50">
              <Trophy className="w-12 h-12 text-stone-300 mx-auto" />
              <p className="text-xs font-bold text-stone-500 mt-3">Đăng nhập để tạo và quản lý giải đấu</p>
              <button onClick={() => onOpenAuthModal?.()} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 mx-auto cursor-pointer"><LogIn className="w-4 h-4" /> Đăng nhập</button>
            </div>
          ) : leagues.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50">
              <Trophy className="w-12 h-12 text-stone-300 mx-auto" />
              <span className="text-xs font-bold text-stone-500 block mt-3">Chưa có giải đấu nào!</span>
              <span className="text-[10px] text-stone-400 block mt-1">Nhấp "Tổ Chức Giải Đấu Mới" để bắt đầu.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {(portalTab === 'all' ? leagues : leagues.filter(l => l.role)).map(league => (
                <div
                  key={league.id}
                  onClick={() => openLeague(league)}
                  className="bg-white border border-stone-200 hover:border-orange-300 p-5 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-stone-100 text-2xl flex items-center justify-center rounded-xl border border-stone-200 group-hover:bg-orange-50 group-hover:border-orange-200 transition-colors">{SPORT_LABELS[league.sport].icon}</div>
                    <div>
                      <h4 className="font-extrabold text-stone-800 group-hover:text-orange-500 transition-colors text-xs sm:text-sm">{league.name}</h4>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-stone-400 font-mono mt-1">
                        <span className="text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded uppercase">{SPORT_LABELS[league.sport].name}</span>
                        <span>•</span>
                        <span>{FORMAT_LABELS[league.format]}</span>
                        <span>•</span>
                        <span className="text-orange-600">{league.teams.length} Đội</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" /> {league.memberCount}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {league.role && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${league.role === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                        {league.role === 'owner' ? 'Chủ giải' : 'Quản trị'}
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${league.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
                      {league.status === 'ACTIVE' ? 'Đang tranh tài' : 'Hạ màn'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACCESS-BY-CODE MODAL (non-member clicks a league) */}
      {accessTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setAccessTarget(null); }}>
          <div className="bg-white border border-stone-200 shadow-2xl rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-stone-100 pb-3 mb-4">
              <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-orange-500" /> Nhập mã truy cập</h3>
              <button onClick={() => setAccessTarget(null)} className="text-stone-400 hover:text-stone-700 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-stone-500 mb-3">Nhập mã passcode để xem giải <b className="text-stone-700">{accessTarget.name}</b>.</p>
            <input
              type="text"
              autoFocus
              value={accessCodeInput}
              onChange={e => setAccessCodeInput(e.target.value)}
              placeholder="Mã truy cập"
              onKeyDown={e => { if (e.key === 'Enter' && accessCodeInput.trim()) { onNavigate?.('myleague', accessTarget.slug, accessCodeInput.trim()); setAccessTarget(null); } }}
              className="w-full bg-stone-50 border border-stone-300 focus:border-orange-500 rounded-xl text-sm py-2.5 px-3.5 font-semibold mb-4"
            />
            <button
              onClick={() => { if (accessCodeInput.trim()) { onNavigate?.('myleague', accessTarget.slug, accessCodeInput.trim()); setAccessTarget(null); } }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-xs cursor-pointer"
            >
              Xem giải đấu
            </button>
          </div>
        </div>
      )}

      {/* EDIT MATCH MODAL */}
      {editingMatch && selectedLeague && (
        <EditMatchModal
          match={editingMatch}
          league={selectedLeague}
          editHomeScore={editHomeScore}
          setEditHomeScore={setEditHomeScore}
          editAwayScore={editAwayScore}
          setEditAwayScore={setEditAwayScore}
          editingMatchEvents={editingMatchEvents}
          setEditingMatchEvents={setEditingMatchEvents}
          newEventTeamId={newEventTeamId}
          setNewEventTeamId={setNewEventTeamId}
          newEventType={newEventType}
          setNewEventType={setNewEventType}
          newEventPlayerName={newEventPlayerName}
          setNewEventPlayerName={setNewEventPlayerName}
          isCustomPlayer={isCustomPlayer}
          setIsCustomPlayer={setIsCustomPlayer}
          newEventMinute={newEventMinute}
          setNewEventMinute={setNewEventMinute}
          aiSummaryText={aiSummaryText}
          setAiSummaryText={setAiSummaryText}
          isAiEventLoading={isAiEventLoading}
          aiEventPreview={aiEventPreview}
          onAiPrefill={handleAiPrefillEvents}
          onAiApply={handleAiApplyEvents}
          onAiCancel={() => setAiEventPreview(null)}
          onClose={() => setEditingMatch(null)}
          onSave={saveMatchScore}
          getTeamName={getTeamName}
          getTeamColor={getTeamColor}
          renderTeamCardsSummary={renderTeamCardsSummary}
        />
      )}
    </div>
  );
}

// ── LeagueDetail (shared by member + view-only) ────────────────────────────
interface LeagueDetailProps {
  league: MyLeague;
  canEdit: boolean;
  canManage: boolean;
  myRole: LeagueMemberRole | null;
  activeTab: 'schedule' | 'standings' | 'teams' | 'stats' | 'members';
  setActiveTab: (t: 'schedule' | 'standings' | 'teams' | 'stats' | 'members') => void;
  onBack: () => void;
  onEditMatch: (m: LeagueMatch) => void;
  onEditTeamPlayers: (teamId: string) => void;
  onShareCopy: () => void;
  shareLink: string;
  onDelete?: () => void;
  members: LeagueMember[];
  onInvite?: () => void;
  onRemoveMember?: (userId: string) => void;
  onSelectUser?: (u: UserSearchResult) => void;
  currentUserId?: string;
  inviteUsername?: string;
  setInviteUsername?: (v: string) => void;
  computeStandings: (teams: LeagueTeam[], matches: LeagueMatch[], g?: 'A' | 'B') => GroupStanding[];
  computeFutsalStats: () => { scorers: any[]; redCards: any[]; yellowCards: any[] };
  getTeamName: (id: string, teams: LeagueTeam[]) => string;
  getTeamColor: (id: string, teams: LeagueTeam[]) => string;
  renderTeamCardsSummary: (m: LeagueMatch, teamId: string) => React.ReactNode;
  viewOnlyBanner?: React.ReactNode;
  editingTeamPlayers?: { teamId: string; players: string[] } | null;
  setEditingTeamPlayers?: (v: { teamId: string; players: string[] } | null) => void;
  saveTeamPlayers?: () => void;
}

function LeagueDetail(p: LeagueDetailProps) {
  const { league } = p;
  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden animate-scaleIn">
      <div className="bg-stone-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-stone-800 rounded-xl text-2xl border border-stone-700">{SPORT_LABELS[league.sport].icon}</div>
          <div>
            <button onClick={p.onBack} className="text-[10px] text-stone-400 hover:text-stone-200 underline cursor-pointer block mb-0.5">&larr; Quay lại danh sách giải</button>
            <h2 className="text-lg font-bold tracking-tight">{league.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-300 mt-1">
              <span>Môn: <b>{SPORT_LABELS[league.sport].name}</b></span>
              <span className="text-stone-600">|</span>
              <span>Thể thức: <b>{FORMAT_LABELS[league.format]}</b></span>
              <span className="text-stone-600">|</span>
              <span>Đội: <b>{league.teams.length}</b></span>
              {p.myRole && (<><span className="text-stone-600">|</span><span className="text-amber-400">{p.myRole === 'owner' ? 'Chủ giải' : 'Quản trị viên'}</span></>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${league.status === 'ACTIVE' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-stone-800 border-stone-700 text-stone-400'}`}>
            {league.status === 'ACTIVE' ? 'Đang tranh tài' : 'Đã hạ màn'}
          </span>
          {p.canManage && p.shareLink && (
            <button onClick={p.onShareCopy} className="p-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-300 hover:text-white transition-all cursor-pointer" title="Sao chép link chia sẻ"><Link2 className="w-4 h-4" /></button>
          )}
          {p.onDelete && (
            <button onClick={p.onDelete} className="p-2 bg-stone-800 hover:bg-red-900 border border-stone-700 rounded-lg text-stone-400 hover:text-white transition-all cursor-pointer" title="Xoá giải đấu"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {p.viewOnlyBanner}

      {p.shareLink && p.canManage && (
        <div className="bg-stone-50 border-b border-stone-200 px-6 py-2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider shrink-0">🔗 Link chia sẻ (xem):</span>
          <input readOnly value={p.shareLink} className="flex-1 bg-white border border-stone-200 rounded-lg text-[10px] font-mono py-1 px-2 text-stone-600 truncate" />
          <button onClick={p.onShareCopy} className="bg-stone-800 hover:bg-stone-900 text-white text-[10px] font-bold py-1 px-2 rounded-lg flex items-center gap-1 cursor-pointer"><Copy className="w-3 h-3" /> Sao chép</button>
        </div>
      )}

      <div className="bg-stone-50 border-b border-stone-200 px-6 py-2 flex items-center gap-2 overflow-x-auto">
        <TabButton active={p.activeTab === 'schedule'} onClick={() => p.setActiveTab('schedule')}>🗓️ Lịch &amp; Tỉ Số</TabButton>
        {league.format !== 'knockout' && <TabButton active={p.activeTab === 'standings'} onClick={() => p.setActiveTab('standings')}>📊 Xếp Hạng</TabButton>}
        <TabButton active={p.activeTab === 'teams'} onClick={() => p.setActiveTab('teams')}>🛡️ Các Đội</TabButton>
        {league.sport === 'futsal' && <TabButton active={p.activeTab === 'stats'} onClick={() => p.setActiveTab('stats')}>🏆 Thống Kê</TabButton>}
        {p.canManage && <TabButton active={p.activeTab === 'members'} onClick={() => p.setActiveTab('members')}>👥 Quản trị</TabButton>}
      </div>

      <div className="p-6 bg-white min-h-[400px]">
        {p.activeTab === 'schedule' && (
          <div className="flex flex-col gap-6">
            {['round_robin', 'group_knockout'].includes(league.format) && (
              <div className="flex flex-col gap-6">
                {Array.from(new Set(league.matches.map(m => m.stage || 'Group Stage'))).map(stage => {
                  const stageMatches = league.matches.filter(m => (m.stage || 'Group Stage') === stage);
                  return (
                    <div key={stage} className="border border-stone-200 rounded-xl p-4 bg-stone-50/55">
                      <h3 className="text-xs font-extrabold uppercase text-orange-600 tracking-wider mb-4">🔹 {stage === 'Group Stage' ? 'Vòng Bảng' : stage}</h3>
                      {stage === 'Group Stage' && league.format === 'group_knockout' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-white p-4 border border-stone-200 rounded-xl">
                            <h4 className="text-xs font-bold text-blue-700 border-b border-stone-100 pb-2 mb-3">BẢNG A</h4>
                            <div className="flex flex-col gap-3">{stageMatches.filter(m => m.group === 'A').map(m => renderMatchCard({ match: m, league, canEdit: p.canEdit, onEdit: p.onEditMatch, getTeamName: p.getTeamName, getTeamColor: p.getTeamColor, renderTeamCardsSummary: p.renderTeamCardsSummary }))}</div>
                          </div>
                          <div className="bg-white p-4 border border-stone-200 rounded-xl">
                            <h4 className="text-xs font-bold text-red-700 border-b border-stone-100 pb-2 mb-3">BẢNG B</h4>
                            <div className="flex flex-col gap-3">{stageMatches.filter(m => m.group === 'B').map(m => renderMatchCard({ match: m, league, canEdit: p.canEdit, onEdit: p.onEditMatch, getTeamName: p.getTeamName, getTeamColor: p.getTeamColor, renderTeamCardsSummary: p.renderTeamCardsSummary }))}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{stageMatches.map(m => renderMatchCard({ match: m, league, canEdit: p.canEdit, onEdit: p.onEditMatch, getTeamName: p.getTeamName, getTeamColor: p.getTeamColor, renderTeamCardsSummary: p.renderTeamCardsSummary }))}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {league.format === 'knockout' && (
              <div className="flex flex-col gap-8">
                <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-500 border border-stone-200 max-w-xl">
                  💡 Nhấp trận đấu để nhập tỉ số. Đội thắng tự động đi tiếp.
                </div>
                <div className="flex flex-col lg:flex-row items-center justify-between gap-8 py-6 overflow-x-auto min-w-[600px] w-full">
                  {league.matches.some(m => m.stage === 'Quarterfinals') && (
                    <div className="flex flex-col gap-6 flex-1 min-w-[200px]">
                      <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-widest text-center border-b pb-1">Tứ Kết</span>
                      {league.matches.filter(m => m.stage === 'Quarterfinals').map(m => renderKnockoutCard({ match: m, league, canEdit: p.canEdit, onEdit: p.onEditMatch, getTeamName: p.getTeamName, getTeamColor: p.getTeamColor, renderTeamCardsSummary: p.renderTeamCardsSummary }))}
                    </div>
                  )}
                  {league.matches.some(m => m.stage === 'Quarterfinals') && <ChevronRight className="text-stone-300 hidden lg:block" />}
                  <div className="flex flex-col gap-16 flex-1 min-w-[200px]">
                    <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-widest text-center border-b pb-1">Bán Kết</span>
                    {league.matches.filter(m => m.stage === 'Semifinals').map(m => renderKnockoutCard({ match: m, league, canEdit: p.canEdit, onEdit: p.onEditMatch, getTeamName: p.getTeamName, getTeamColor: p.getTeamColor, renderTeamCardsSummary: p.renderTeamCardsSummary }))}
                  </div>
                  <ChevronRight className="text-stone-300 hidden lg:block" />
                  <div className="flex flex-col gap-6 flex-1 min-w-[200px] justify-center">
                    <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-widest text-center border-b pb-1">Chung Kết</span>
                    {league.matches.filter(m => m.stage === 'Final').map(m => (
                      <div key={m.id} className="flex flex-col gap-2">
                        {renderKnockoutCard({ match: m, league, canEdit: p.canEdit, onEdit: p.onEditMatch, getTeamName: p.getTeamName, getTeamColor: p.getTeamColor, renderTeamCardsSummary: p.renderTeamCardsSummary })}
                        {m.isPlayed && m.winner && m.winner !== 'DRAW' && (
                          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs font-semibold text-center flex flex-col items-center gap-1">
                            <Trophy className="w-5 h-5 text-amber-500 fill-amber-200" />
                            <span>Nhà vô địch:</span>
                            <span className="font-bold text-sm text-stone-800">{p.getTeamName(m.winner, league.teams)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {p.activeTab === 'standings' && league.format !== 'knockout' && (
          <div className="flex flex-col gap-8 animate-fade-in">
            {league.format === 'group_knockout' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-3"><h3 className="text-sm font-bold text-blue-700 bg-blue-50/70 border border-blue-100 py-1.5 px-3.5 rounded-lg w-max">BẢNG A</h3><StandingsTable standings={p.computeStandings(league.teams, league.matches, 'A')} league={league} getTeamName={p.getTeamName} getTeamColor={p.getTeamColor} /></div>
                <div className="flex flex-col gap-3"><h3 className="text-sm font-bold text-red-700 bg-red-50/70 border border-red-100 py-1.5 px-3.5 rounded-lg w-max">BẢNG B</h3><StandingsTable standings={p.computeStandings(league.teams, league.matches, 'B')} league={league} getTeamName={p.getTeamName} getTeamColor={p.getTeamColor} /></div>
              </div>
            ) : (
              <div className="flex flex-col gap-3"><h3 className="text-sm font-bold text-stone-800 bg-stone-100 py-1.5 px-3.5 rounded-lg w-max">BẢNG XẾP HẠNG</h3><StandingsTable standings={p.computeStandings(league.teams, league.matches)} league={league} getTeamName={p.getTeamName} getTeamColor={p.getTeamColor} /></div>
            )}
            <div className="bg-stone-50 p-4 border border-stone-200 rounded-xl text-xs text-stone-500 max-w-2xl flex items-start gap-2">
              <Info className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div><b>Quy tắc:</b> Thắng +3, Hoà +1, Thua 0. Chỉ số phụ: <b>Hiệu số (GD)</b> → <b>Tổng bàn thắng (GF)</b>.</div>
            </div>
          </div>
        )}

        {p.activeTab === 'teams' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {p.editingTeamPlayers && p.setEditingTeamPlayers && p.saveTeamPlayers && (
              <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl max-w-md flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                  <h4 className="text-xs font-black text-stone-800 uppercase">Cập nhật đội hình: {p.getTeamName(p.editingTeamPlayers.teamId, league.teams)}</h4>
                  <button onClick={() => p.setEditingTeamPlayers?.(null)} className="text-stone-400 hover:text-stone-700 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {p.editingTeamPlayers.players.map((player, pIdx) => (
                    <div key={pIdx} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-stone-400 w-4 shrink-0 text-right">{pIdx + 1}.</span>
                      <input type="text" value={player} onChange={e => { const up = [...p.editingTeamPlayers!.players]; up[pIdx] = e.target.value; p.setEditingTeamPlayers!({ ...p.editingTeamPlayers!, players: up }); }} className="flex-1 bg-white border border-stone-200 focus:border-orange-500 p-1.5 rounded-lg text-xs font-bold text-stone-800" />
                      <button type="button" onClick={() => { const up = [...p.editingTeamPlayers!.players]; up.splice(pIdx, 1); p.setEditingTeamPlayers!({ ...p.editingTeamPlayers!, players: up }); }} className="text-stone-400 hover:text-red-500 cursor-pointer p-1"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => p.setEditingTeamPlayers?.({ ...p.editingTeamPlayers, players: [...p.editingTeamPlayers.players, ''] })} className="mt-1 flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 py-1.5 px-3 rounded-lg self-start cursor-pointer"><Plus className="w-3.5 h-3.5" /> Thêm cầu thủ</button>
                <div className="flex justify-end gap-2 text-xs border-t border-stone-100 pt-3">
                  <button onClick={() => p.setEditingTeamPlayers?.(null)} className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg cursor-pointer">Hủy</button>
                  <button onClick={p.saveTeamPlayers} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer"><Check className="w-3.5 h-3.5" /> Lưu</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {league.teams.map((team, idx) => (
                <div key={team.id} className="border border-stone-200 p-4 rounded-2xl bg-white flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${team.logoColor} text-white flex items-center justify-center font-bold text-base uppercase font-serif shrink-0`}>{team.name.substring(0, 2)}</div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-stone-800 truncate">{team.name}</h4>
                      <span className="text-[10px] text-stone-400 font-mono">#{idx + 1}</span>
                    </div>
                  </div>
                  {league.sport === 'futsal' && (
                    <div className="bg-stone-50/50 p-2.5 rounded-xl border border-stone-150 flex flex-col gap-1.5">
                      <span className="text-[9px] font-black uppercase text-stone-400">Cầu thủ ({team.players?.length || 0}):</span>
                      {team.players && team.players.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">{team.players.map((pl, i) => <span key={i} className="text-[9px] font-bold bg-white border border-stone-200/60 text-stone-700 px-1.5 py-0.5 rounded-sm">{pl}</span>)}</div>
                      ) : <span className="text-[9px] text-stone-400 italic">Chưa nhập</span>}
                      {p.canEdit && <button onClick={() => p.onEditTeamPlayers(team.id)} className="mt-1.5 text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer self-end"><Edit3 className="w-3 h-3" /> Sửa đội hình</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {p.activeTab === 'stats' && league.sport === 'futsal' && (() => {
          const { scorers, redCards, yellowCards } = p.computeFutsalStats();
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
              <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-orange-600 border-b border-stone-100 pb-3">⚽ Vua Phá Lưới</h3>
                {scorers.length > 0 ? (
                  <table className="w-full text-left text-xs"><thead><tr className="border-b border-stone-100 text-[10px] text-stone-400 font-extrabold uppercase"><th className="pb-2 w-12 text-center">#</th><th className="pb-2">Cầu thủ</th><th className="pb-2">Đội</th><th className="pb-2 text-right">Bàn</th></tr></thead><tbody className="divide-y divide-stone-50">{scorers.map((st, i) => <tr key={i} className="hover:bg-stone-50/50"><td className="py-2.5 text-center font-bold text-stone-400">{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td className="py-2.5 font-black text-stone-800">{st.playerName}</td><td className="py-2.5"><span className={`inline-block w-2 h-2 rounded-full ${p.getTeamColor(st.teamId, league.teams)} mr-1.5`} />{p.getTeamName(st.teamId, league.teams)}</td><td className="py-2.5 font-mono font-black text-orange-600 text-right">{st.goals}</td></tr>)}</tbody></table>
                ) : <div className="text-center py-8 text-stone-400 text-xs italic">Chưa có bàn thắng</div>}
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-red-600 border-b border-stone-100 pb-3">🟥 Thẻ Đỏ</h3>
                  {redCards.length > 0 ? <table className="w-full text-left text-xs"><tbody className="divide-y divide-stone-50">{redCards.map((st, i) => <tr key={i}><td className="py-2 font-black text-stone-800">{st.playerName}</td><td className="py-2 text-stone-500">{p.getTeamName(st.teamId, league.teams)}</td><td className="py-2 text-right font-mono font-black text-red-600">{st.redCards}</td></tr>)}</tbody></table> : <div className="text-center py-4 text-stone-400 text-xs italic">Chưa có</div>}
                </div>
                <div className="flex flex-col gap-4 border-t border-stone-100 pt-5">
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-500 border-b border-stone-100 pb-3">🟨 Thẻ Vàng</h3>
                  {yellowCards.length > 0 ? <table className="w-full text-left text-xs"><tbody className="divide-y divide-stone-50">{yellowCards.map((st, i) => <tr key={i}><td className="py-2 font-black text-stone-800">{st.playerName}</td><td className="py-2 text-stone-500">{p.getTeamName(st.teamId, league.teams)}</td><td className="py-2 text-right font-mono font-black text-amber-600">{st.yellowCards}</td></tr>)}</tbody></table> : <div className="text-center py-4 text-stone-400 text-xs italic">Chưa có</div>}
                </div>
              </div>
            </div>
          );
        })()}

        {p.activeTab === 'members' && p.canManage && (
          <div className="flex flex-col gap-6 animate-fade-in max-w-2xl">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-stone-800 border-b border-stone-100 pb-2 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-orange-500" /> Thêm quản trị viên</h3>
              <p className="text-[11px] text-stone-500">Nhập username của thành viên đã đăng ký. Quản trị viên có thể cập nhật kết quả (không xoá được giải).</p>
              <div className="flex gap-2">
                <UserSearchInput
                  value={p.inviteUsername || ''}
                  onChange={(v) => p.setInviteUsername?.(v)}
                  onSelect={(u) => p.onSelectUser?.(u)}
                  userId={p.currentUserId ?? null}
                  placeholder="username"
                  excludeUsernames={p.members.map((m) => m.username)}
                />
                <button onClick={p.onInvite} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Mời</button>
              </div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-stone-800 border-b border-stone-100 pb-2 flex items-center gap-1.5"><Users className="w-4 h-4 text-orange-500" /> Danh sách ({p.members.length})</h3>
              <div className="flex flex-col gap-2">
                {p.members.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-xl border border-stone-100 bg-stone-50/50">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${m.role === 'owner' ? 'bg-amber-500' : 'bg-sky-500'}`}>{m.displayName.substring(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="text-xs font-bold text-stone-800">{m.displayName} <span className="text-[10px] text-stone-400 font-mono">@{m.username}</span></div>
                        <span className={`text-[9px] font-bold uppercase ${m.role === 'owner' ? 'text-amber-600' : 'text-sky-600'}`}>{m.role === 'owner' ? 'Chủ giải' : 'Quản trị viên'}</span>
                      </div>
                    </div>
                    {m.role !== 'owner' && p.onRemoveMember && (
                      <button onClick={() => p.onRemoveMember?.(m.userId)} className="text-stone-400 hover:text-red-500 p-1.5 hover:bg-white rounded-lg cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${active ? 'bg-orange-500 text-white' : 'text-stone-500 hover:text-stone-800'}`}>{children}</button>
  );
}

interface MatchCardProps {
  match: LeagueMatch; league: MyLeague; canEdit: boolean;
  onEdit: (m: LeagueMatch) => void;
  getTeamName: (id: string, teams: LeagueTeam[]) => string;
  getTeamColor: (id: string, teams: LeagueTeam[]) => string;
  renderTeamCardsSummary: (m: LeagueMatch, teamId: string) => React.ReactNode;
}
function renderMatchCard({ match, league, canEdit, onEdit, getTeamName, getTeamColor, renderTeamCardsSummary }: MatchCardProps) {
  const isEditingAllowed = canEdit && league.status === 'ACTIVE';
  return (
    <div key={match.id} onClick={() => isEditingAllowed && onEdit(match)} className={`p-3.5 border rounded-xl flex flex-col text-xs transition-all bg-white ${isEditingAllowed ? 'cursor-pointer hover:border-orange-300 hover:shadow-xs' : ''} ${match.isPlayed ? 'border-stone-150 bg-stone-50/20' : 'border-stone-200'}`}>
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3 w-[80%]">
          <span className="font-mono text-[9px] text-stone-400 font-extrabold bg-stone-100 px-1.5 py-0.5 rounded">R{match.round}</span>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${getTeamColor(match.home, league.teams)}`} /><span className={`font-semibold text-stone-800 truncate ${match.isPlayed && match.homeScore! < match.awayScore! ? 'opacity-55' : ''}`}>{getTeamName(match.home, league.teams)}</span>{renderTeamCardsSummary(match, match.home)}</div>
            <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${getTeamColor(match.away, league.teams)}`} /><span className={`font-semibold text-stone-800 truncate ${match.isPlayed && match.awayScore! < match.homeScore! ? 'opacity-55' : ''}`}>{getTeamName(match.away, league.teams)}</span>{renderTeamCardsSummary(match, match.away)}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 font-mono font-extrabold text-sm w-12 text-center">
          {match.isPlayed ? (<><span className={match.homeScore! > match.awayScore! ? 'text-orange-600' : 'text-stone-700'}>{match.homeScore}</span><span className={match.awayScore! > match.homeScore! ? 'text-orange-600' : 'text-stone-700'}>{match.awayScore}</span></>) : (<><span className="text-stone-300 text-xs">-</span><span className="text-stone-300 text-xs">-</span></>)}
        </div>
      </div>
      {league.sport === 'futsal' && match.isPlayed && match.events && match.events.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-stone-100/60 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-stone-500">
          {match.events.map((ev, i) => <span key={i} className="flex items-center gap-0.5 bg-stone-100/40 px-1.5 py-0.5 rounded-sm">{ev.type === 'goal' && '⚽'}{ev.type === 'yellow' && <span className="inline-block w-1.5 h-2.5 bg-amber-400" />}{ev.type === 'red' && <span className="inline-block w-1.5 h-2.5 bg-red-500" />}<span className="font-medium text-stone-600">{ev.playerName}</span>{ev.minute && <span className="text-stone-400 font-mono text-[9px]">{ev.minute}'</span>}</span>)}
        </div>
      )}
    </div>
  );
}

function renderKnockoutCard({ match, league, canEdit, onEdit, getTeamName, getTeamColor, renderTeamCardsSummary }: MatchCardProps) {
  const homePlaceholder = match.home.startsWith('Thắng');
  const awayPlaceholder = match.away.startsWith('Thắng');
  const isEditingAllowed = canEdit && league.status === 'ACTIVE' && !homePlaceholder && !awayPlaceholder;
  return (
    <div key={match.id} onClick={() => isEditingAllowed && onEdit(match)} className={`w-[220px] bg-white border border-stone-200 rounded-xl p-3 shadow-xs hover:shadow-md transition-all flex flex-col gap-2.5 ${isEditingAllowed ? 'cursor-pointer hover:border-orange-300' : 'opacity-70'}`}>
      <span className="text-[8px] font-extrabold uppercase text-stone-400 font-mono tracking-wider">{match.id.toUpperCase()}</span>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0"><span className={`w-2 h-2 rounded-full ${getTeamColor(match.home, league.teams)} shrink-0`} /><span className={`text-xs font-bold truncate ${homePlaceholder ? 'text-stone-400 italic' : 'text-stone-700'}`}>{getTeamName(match.home, league.teams)}</span>{renderTeamCardsSummary(match, match.home)}</div>
          {match.isPlayed && <span className={`text-xs font-mono font-extrabold ${match.homeScore! > match.awayScore! ? 'text-orange-600' : 'text-stone-400'}`}>{match.homeScore}</span>}
        </div>
        <div className="border-t border-stone-100 my-0.5" />
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0"><span className={`w-2 h-2 rounded-full ${getTeamColor(match.away, league.teams)} shrink-0`} /><span className={`text-xs font-bold truncate ${awayPlaceholder ? 'text-stone-400 italic' : 'text-stone-700'}`}>{getTeamName(match.away, league.teams)}</span>{renderTeamCardsSummary(match, match.away)}</div>
          {match.isPlayed && <span className={`text-xs font-mono font-extrabold ${match.awayScore! > match.homeScore! ? 'text-orange-600' : 'text-stone-400'}`}>{match.awayScore}</span>}
        </div>
      </div>
    </div>
  );
}

function StandingsTable({ standings, league, getTeamName, getTeamColor }: { standings: GroupStanding[]; league: MyLeague; getTeamName: (id: string, t: LeagueTeam[]) => string; getTeamColor: (id: string, t: LeagueTeam[]) => string }) {
  return (
    <div className="overflow-x-auto border border-stone-200 rounded-xl">
      <table className="w-full text-left border-collapse bg-white text-xs">
        <thead>
          <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
            <th className="p-3 text-center w-12">#</th><th className="p-3">Đội</th><th className="p-3 text-center">Trận</th><th className="p-3 text-center">T</th><th className="p-3 text-center">H</th><th className="p-3 text-center">B</th><th className="p-3 text-center">HS</th><th className="p-3 text-center font-bold text-orange-600">Điểm</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((st, idx) => {
            const isPromoted = idx < 2 && league.format === 'group_knockout';
            return (
              <tr key={st.teamId} className={`border-b border-stone-100 font-semibold text-stone-700 hover:bg-stone-50/50 last:border-0 ${isPromoted ? 'bg-emerald-50/20' : ''}`}>
                <td className="p-3 text-center font-mono">{idx + 1 <= 3 ? <span className={`inline-block w-5 h-5 rounded-full text-[10px] text-white leading-5 font-black text-center ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-stone-400' : 'bg-amber-700'}`}>{idx + 1}</span> : idx + 1}</td>
                <td className="p-3"><div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${getTeamColor(st.teamId, league.teams)}`} /><span className="font-bold text-stone-900">{getTeamName(st.teamId, league.teams)}</span>{isPromoted && <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-sans uppercase font-extrabold">Playoff</span>}</div></td>
                <td className="p-3 text-center font-mono">{st.played}</td>
                <td className="p-3 text-center font-mono text-emerald-600">{st.won}</td>
                <td className="p-3 text-center font-mono text-stone-400">{st.drawn}</td>
                <td className="p-3 text-center font-mono text-rose-500">{st.lost}</td>
                <td className="p-3 text-center font-mono">{st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}</td>
                <td className="p-3 text-center font-mono font-bold text-base text-orange-600">{st.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── EditMatchModal (extracted for clarity) ─────────────────────────────────
interface EditMatchModalProps {
  match: LeagueMatch; league: MyLeague;
  editHomeScore: string; setEditHomeScore: (v: string) => void;
  editAwayScore: string; setEditAwayScore: (v: string) => void;
  editingMatchEvents: MatchEvent[]; setEditingMatchEvents: (v: MatchEvent[]) => void;
  newEventTeamId: string; setNewEventTeamId: (v: string) => void;
  newEventType: 'goal' | 'yellow' | 'red'; setNewEventType: (v: 'goal' | 'yellow' | 'red') => void;
  newEventPlayerName: string; setNewEventPlayerName: (v: string) => void;
  isCustomPlayer: boolean; setIsCustomPlayer: (v: boolean) => void;
  newEventMinute: string; setNewEventMinute: (v: string) => void;
  aiSummaryText: string; setAiSummaryText: (v: string) => void;
  isAiEventLoading: boolean; aiEventPreview: any[] | null;
  onAiPrefill: () => void; onAiApply: () => void; onAiCancel: () => void;
  onClose: () => void; onSave: () => void;
  getTeamName: (id: string, t: LeagueTeam[]) => string;
  getTeamColor: (id: string, t: LeagueTeam[]) => string;
  renderTeamCardsSummary: (m: LeagueMatch, teamId: string) => React.ReactNode;
}
function EditMatchModal(p: EditMatchModalProps) {
  const { match, league } = p;
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className={`bg-white border border-stone-200 shadow-2xl rounded-2xl w-full p-6 animate-scaleIn ${league.sport === 'futsal' ? 'max-w-lg' : 'max-w-md'}`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b border-stone-100 pb-3 mb-4">
          <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide">Cập nhật kết quả</h3>
          <button onClick={p.onClose} className="text-stone-400 hover:text-stone-700 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[10px] text-stone-400 font-bold mb-4 uppercase tracking-wider">{match.stage === 'Group Stage' ? `VÒNG BẢNG - R${match.round}` : (match.stage || 'PLAYOFFS')}</p>
        <div className="flex items-center justify-between gap-4 py-4 px-2 bg-stone-50 rounded-2xl border border-stone-200">
          <div className="flex flex-col items-center gap-2 flex-1 text-center">
            <div className={`w-8 h-8 rounded-full ${p.getTeamColor(match.home, league.teams)} text-white flex items-center justify-center font-bold text-xs uppercase`}>{p.getTeamName(match.home, league.teams).substring(0, 2)}</div>
            <span className="text-xs font-bold text-stone-700 line-clamp-1">{p.getTeamName(match.home, league.teams)}</span>
            <input type="number" min="0" value={p.editHomeScore} onChange={e => p.setEditHomeScore(e.target.value)} className="w-16 bg-white border-2 border-stone-200 focus:border-orange-500 text-center font-mono font-extrabold text-lg py-1 rounded-lg" />
          </div>
          <span className="font-bold text-stone-400 italic text-sm">VS</span>
          <div className="flex flex-col items-center gap-2 flex-1 text-center">
            <div className={`w-8 h-8 rounded-full ${p.getTeamColor(match.away, league.teams)} text-white flex items-center justify-center font-bold text-xs uppercase`}>{p.getTeamName(match.away, league.teams).substring(0, 2)}</div>
            <span className="text-xs font-bold text-stone-700 line-clamp-1">{p.getTeamName(match.away, league.teams)}</span>
            <input type="number" min="0" value={p.editAwayScore} onChange={e => p.setEditAwayScore(e.target.value)} className="w-16 bg-white border-2 border-stone-200 focus:border-orange-500 text-center font-mono font-extrabold text-lg py-1 rounded-lg" />
          </div>
        </div>

        {league.sport === 'futsal' && (
          <div className="mt-5 pt-4 border-t border-stone-100 flex flex-col gap-3">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">⚽ Diễn biến &amp; Sự kiện</h4>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3 flex flex-col gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-orange-700"><Sparkles className="w-3.5 h-3.5" /> AI tóm tắt diễn biến (chỉ điền, không tự lưu)</div>
              <textarea value={p.aiSummaryText} onChange={e => p.setAiSummaryText(e.target.value)} placeholder="Phút 12 Hoàng ghi bàn. Phút 30 Duy thẻ vàng..." rows={3} disabled={p.isAiEventLoading} className="w-full bg-white border border-orange-200 rounded-lg text-xs p-2 focus:outline-hidden focus:border-orange-500 resize-y min-h-[70px] disabled:bg-stone-100" />
              {p.aiEventPreview === null ? (
                <button type="button" onClick={p.onAiPrefill} disabled={p.isAiEventLoading || !p.aiSummaryText.trim()} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {p.isAiEventLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tách...</> : <><Sparkles className="w-3.5 h-3.5" /> AI điền sự kiện</>}
                </button>
              ) : (
                <div className="flex flex-col gap-2 p-2 bg-white border border-orange-200 rounded-lg">
                  <p className="text-[10px] font-bold text-stone-700 uppercase">Xem trước: {p.aiEventPreview.length} sự kiện</p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {p.aiEventPreview.map((ev, i) => <span key={i} className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-md text-[10px] font-bold">{ev.type === 'goal' ? '⚽' : ev.type === 'yellow' ? '🟨' : '🟥'} {ev.minute ? `${ev.minute}'` : '-'} {ev.playerName || '?'} <span className="text-orange-600">{ev.teamSide === 'home' ? 'Nhà' : ev.teamSide === 'away' ? 'Khách' : '?'}</span></span>)}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={p.onAiApply} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" /> Điền vào danh sách</button>
                    <button type="button" onClick={p.onAiCancel} className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-lg text-[11px] cursor-pointer">Hủy</button>
                  </div>
                </div>
              )}
            </div>

            {p.editingMatchEvents.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                {p.editingMatchEvents.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded-md border border-stone-100">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-stone-400">{ev.minute ? `${ev.minute}'` : '--'}</span>
                      {ev.type === 'goal' && '⚽'}{ev.type === 'yellow' && <span className="inline-block w-2 h-3 bg-amber-400" />}{ev.type === 'red' && <span className="inline-block w-2 h-3 bg-red-500" />}
                      <span className="font-bold text-stone-800">{ev.playerName}</span>
                      <span className="text-[10px] text-stone-400">({ev.teamId === match.home ? 'Nhà' : 'Khách'})</span>
                    </div>
                    <button type="button" onClick={() => p.setEditingMatchEvents(p.editingMatchEvents.filter((_, idx) => idx !== i))} className="text-stone-400 hover:text-red-500 cursor-pointer p-0.5"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-stone-400 italic text-center py-2 bg-stone-50 rounded-xl border border-dashed border-stone-200">Chưa có sự kiện</p>}

            <div className="bg-stone-50/50 p-3 rounded-xl border border-stone-200 flex flex-col gap-2.5">
              <span className="text-[10px] font-black uppercase text-stone-500">Thêm sự kiện</span>
              <div className="grid grid-cols-2 gap-2">
                <select value={p.newEventTeamId} onChange={e => { p.setNewEventTeamId(e.target.value); p.setNewEventPlayerName(''); p.setIsCustomPlayer(false); }} className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold">
                  <option value={match.home}>{p.getTeamName(match.home, league.teams)} (Nhà)</option>
                  <option value={match.away}>{p.getTeamName(match.away, league.teams)} (Khách)</option>
                </select>
                <select value={p.newEventType} onChange={e => p.setNewEventType(e.target.value as any)} className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold">
                  <option value="goal">⚽ Bàn thắng</option><option value="yellow">🟨 Thẻ vàng</option><option value="red">🟥 Thẻ đỏ</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div className="col-span-2 flex flex-col gap-1">
                  {!p.isCustomPlayer ? (
                    <select value={p.newEventPlayerName} onChange={e => { const v = e.target.value; if (v === '__custom__') { p.setIsCustomPlayer(true); p.setNewEventPlayerName(''); } else p.setNewEventPlayerName(v); }} className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold">
                      <option value="">-- Chọn cầu thủ --</option>
                      {(league.teams.find(t => t.id === p.newEventTeamId)?.players || []).map(pl => <option key={pl} value={pl}>{pl}</option>)}
                      <option value="__custom__">✍️ Tự nhập...</option>
                    </select>
                  ) : (
                    <div className="flex gap-1.5">
                      <input type="text" value={p.newEventPlayerName} onChange={e => p.setNewEventPlayerName(e.target.value)} placeholder="Tên cầu thủ" className="flex-1 bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold" />
                      <button type="button" onClick={() => { p.setIsCustomPlayer(false); p.setNewEventPlayerName(''); }} className="bg-stone-150 hover:bg-stone-200 text-stone-600 px-2.5 py-1.5 rounded-lg text-[9px] font-bold cursor-pointer">Hủy</button>
                    </div>
                  )}
                </div>
                <input type="number" min="1" max="40" value={p.newEventMinute} onChange={e => p.setNewEventMinute(e.target.value)} placeholder="--" className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 text-center font-mono font-bold" />
              </div>
              <button type="button" onClick={() => {
                if (!p.newEventPlayerName.trim()) { alert('Chọn/nhập tên cầu thủ!'); return; }
                const min = p.newEventMinute ? parseInt(p.newEventMinute) : undefined;
                const ev: MatchEvent = { type: p.newEventType, teamId: p.newEventTeamId, playerName: p.newEventPlayerName.trim(), minute: min };
                if (p.newEventType === 'goal') { if (p.newEventTeamId === match.home) p.setEditHomeScore(String(parseInt(p.editHomeScore || '0') + 1)); else p.setEditAwayScore(String(parseInt(p.editAwayScore || '0') + 1)); }
                p.setEditingMatchEvents([...p.editingMatchEvents, ev].sort((a, b) => (a.minute || 0) - (b.minute || 0)));
                p.setNewEventPlayerName(''); p.setNewEventMinute(''); p.setIsCustomPlayer(false);
                playRetroBeep(600, 'sine', 0.05);
              }} className="w-full bg-stone-800 hover:bg-stone-900 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer">+ Thêm vào diễn biến</button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-stone-100">
          <button type="button" onClick={p.onClose} className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2 px-4 rounded-lg text-xs cursor-pointer">Hủy</button>
          <button type="button" onClick={p.onSave} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-lg text-xs cursor-pointer flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Ghi Nhận Kết Quả</button>
        </div>
      </div>
    </div>
  );
}
