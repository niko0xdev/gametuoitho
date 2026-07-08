import React, { useState, useEffect } from 'react';
import {
  Trophy, Users, Calendar, PlusCircle, Award, Trash2, Check, X, Plus,
  ChevronRight, Play, Save, Shield, Settings, Info, RefreshCw, Edit3, Dices,
  Lock, Unlock, Eye, EyeOff, ShieldAlert,
  Sparkles, Loader2
} from 'lucide-react';
import { playRetroBeep } from './games/CaroBoard.tsx';
import { UserProfile } from '../types.ts';
import { knockoutWinner } from '../lib/knockout.ts';

// TypeScript Interfaces
export type SportType = 'futsal' | 'pes' | 'pingpong' | 'badminton';
export type FormatType = 'round_robin' | 'knockout' | 'group_knockout';

export interface LeagueTeam {
  id: string;
  name: string;
  logoColor: string; // CSS color class
  players?: string[]; // Player roster for team
}

export interface MatchEvent {
  type: 'goal' | 'yellow' | 'red';
  teamId: string;
  playerName: string;
  minute?: number;
}

export interface LeagueMatch {
  id: string;
  round: number; // For round robin & group stage
  stage?: 'Group Stage' | 'Quarterfinals' | 'Semifinals' | 'Final';
  group?: 'A' | 'B';
  home: string; // Team ID or name
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  isPlayed: boolean;
  winner?: string | null;
  nextMatchId?: string | null;
  nextMatchPosition?: 'home' | 'away' | null;
  events?: MatchEvent[]; // Custom match events
}

export interface GroupStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface MyLeague {
  id: string;
  name: string;
  sport: SportType;
  format: FormatType;
  teams: LeagueTeam[];
  matches: LeagueMatch[];
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  createdAt: string;
}

// Pre-defined logo colors for style variation
const LOGO_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-sky-500', 'bg-rose-500', 'bg-lime-500'
];

// Helper to translate labels
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

// INITIAL MOCK DATA - To make the page instantly rich and interactive
const MOCK_LEAGUES: MyLeague[] = [
  {
    id: 'league-futsal-2026',
    name: 'Giải Futsal Doanh Nghiệp Cúp Hà Nội 2026',
    sport: 'futsal',
    format: 'round_robin',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    teams: [
      { id: 't1', name: 'FC Futsal UIT', logoColor: 'bg-blue-500' },
      { id: 't2', name: 'Văn Phòng FC', logoColor: 'bg-red-500' },
      { id: 't3', name: 'Đồng Đội Brotherhood', logoColor: 'bg-emerald-500' },
      { id: 't4', name: 'Tech Warriors FC', logoColor: 'bg-amber-500' }
    ],
    matches: [
      // Round 1
      { id: 'm-r1-1', round: 1, home: 't1', away: 't4', homeScore: 3, awayScore: 1, isPlayed: true },
      { id: 'm-r1-2', round: 1, home: 't2', away: 't3', homeScore: 2, awayScore: 2, isPlayed: true },
      // Round 2
      { id: 'm-r2-1', round: 2, home: 't1', away: 't3', homeScore: 1, awayScore: 4, isPlayed: true },
      { id: 'm-r2-2', round: 2, home: 't4', away: 't2', homeScore: null, awayScore: null, isPlayed: false },
      // Round 3
      { id: 'm-r3-1', round: 3, home: 't1', away: 't2', homeScore: null, awayScore: null, isPlayed: false },
      { id: 'm-r3-2', round: 3, home: 't3', away: 't4', homeScore: null, awayScore: null, isPlayed: false }
    ]
  },
  {
    id: 'league-pes-cup',
    name: 'PES eFootball Cyber Championship 2026',
    sport: 'pes',
    format: 'knockout',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    teams: [
      { id: 'p1', name: 'Gamer Hoàng UIT', logoColor: 'bg-purple-500' },
      { id: 'p2', name: 'PES Master Hải', logoColor: 'bg-pink-500' },
      { id: 'p3', name: 'Pro Player Thắng', logoColor: 'bg-indigo-500' },
      { id: 'p4', name: 'Sát Thủ Tay Cầm Duy', logoColor: 'bg-teal-500' }
    ],
    matches: [
      // Semifinals
      { 
        id: 'sf1', 
        round: 1, 
        stage: 'Semifinals', 
        home: 'p1', 
        away: 'p2', 
        homeScore: 4, 
        awayScore: 2, 
        isPlayed: true, 
        winner: 'p1',
        nextMatchId: 'f1',
        nextMatchPosition: 'home'
      },
      { 
        id: 'sf2', 
        round: 1, 
        stage: 'Semifinals', 
        home: 'p3', 
        away: 'p4', 
        homeScore: 1, 
        awayScore: 3, 
        isPlayed: true, 
        winner: 'p4',
        nextMatchId: 'f1',
        nextMatchPosition: 'away'
      },
      // Final
      { 
        id: 'f1', 
        round: 2, 
        stage: 'Final', 
        home: 'p1', 
        away: 'p4', 
        homeScore: null, 
        awayScore: null, 
        isPlayed: false, 
        winner: null 
      }
    ]
  }
];

interface MyLeagueViewProps {
  userId?: string;
  userProfile?: UserProfile | null;
}

export default function MyLeagueView({ userId = 'user_a', userProfile }: MyLeagueViewProps) {
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<MyLeague | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'standings' | 'teams'>('schedule');

  // Permissions State
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('league_permissions_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        // Fallback
      }
    }
    return {
      user_a: true,
      user_b: false,
      user_c: false
    };
  });

  const savePermissions = (newPermissions: Record<string, boolean>) => {
    setPermissions(newPermissions);
    localStorage.setItem('league_permissions_v1', JSON.stringify(newPermissions));
  };

  const handleTogglePermission = async (targetUserId: string) => {
    try {
      const r = await fetch('/api/leagues-permissions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId })
      });
      if (!r.ok) throw new Error('Lỗi đồng bộ quyền truy cập');
      const data = await r.json();
      if (data.permissions) {
        setPermissions(data.permissions);
      }
      playRetroBeep(440, 'sine', 0.08);
    } catch (err) {
      console.warn('Error toggling permission:', err);
      const next = { ...permissions, [targetUserId]: !permissions[targetUserId] };
      savePermissions(next);
      playRetroBeep(440, 'sine', 0.08);
    }
  };

  const hasPermission = permissions[userId] === true;

  // Clear selected league if permission is revoked
  useEffect(() => {
    if (!hasPermission && selectedLeague) {
      setSelectedLeague(null);
    }
  }, [hasPermission, selectedLeague]);

  // Form States
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newLeagueSport, setNewLeagueSport] = useState<SportType>('futsal');
  const [newLeagueFormat, setNewLeagueFormat] = useState<FormatType>('round_robin');
  const [numTeams, setNumTeams] = useState<number>(4);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<string[][]>([]);
  const [selectedTacticalTeamId, setSelectedTacticalTeamId] = useState<string>('');
  const [formError, setFormError] = useState('');

  // AI Quick Import States
  const [aiRosterText, setAiRosterText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');
  const [aiErrorMessage, setAiErrorMessage] = useState('');

  // Editing match states
  const [editingMatch, setEditingMatch] = useState<LeagueMatch | null>(null);
  const [editHomeScore, setEditHomeScore] = useState<string>('');
  const [editAwayScore, setEditAwayScore] = useState<string>('');

  // Editing team players (Futsal)
  const [editingTeamPlayers, setEditingTeamPlayers] = useState<{ teamId: string; players: string[] } | null>(null);

  // Futsal match event states
  const [editingMatchEvents, setEditingMatchEvents] = useState<MatchEvent[]>([]);
  const [newEventTeamId, setNewEventTeamId] = useState<string>('');
  const [newEventType, setNewEventType] = useState<'goal' | 'yellow' | 'red'>('goal');
  const [newEventPlayerName, setNewEventPlayerName] = useState<string>('');
  const [isCustomPlayer, setIsCustomPlayer] = useState<boolean>(false);
  const [newEventMinute, setNewEventMinute] = useState<string>('');

  // AI summary -> structured events (prefill only; user must Save manually)
  const [aiSummaryText, setAiSummaryText] = useState<string>('');
  const [isAiEventLoading, setIsAiEventLoading] = useState<boolean>(false);
  const [aiEventPreview, setAiEventPreview] = useState<Array<{ type: 'goal'|'yellow'|'red'; teamSide: 'home'|'away'|'unknown'; playerName: string; minute?: number; note?: string }> | null>(null);

  const saveTeamPlayers = () => {
    if (!selectedLeague || !editingTeamPlayers) return;
    const { teamId, players } = editingTeamPlayers;
    
    // Clean and filter empty names
    const playerNames = players
      .map(name => name.trim())
      .filter(name => name.length > 0);

    const updatedTeams = selectedLeague.teams.map(t => {
      if (t.id === teamId) {
        return { ...t, players: playerNames };
      }
      return t;
    });

    const updatedLeague = {
      ...selectedLeague,
      teams: updatedTeams
    };

    const updatedLeagues = leagues.map(l => l.id === selectedLeague.id ? updatedLeague : l);
    saveLeaguesToLocalStorage(updatedLeagues);
    setEditingTeamPlayers(null);
  };

  const generateRandomEventsForMatch = (
    homeTeamId: string, 
    awayTeamId: string, 
    hs: number, 
    as: number,
    teams: LeagueTeam[]
  ): MatchEvent[] => {
    const events: MatchEvent[] = [];
    
    const getPlayersList = (teamId: string) => {
      const team = teams.find(t => t.id === teamId);
      if (team?.players && team.players.length > 0) {
        return team.players;
      }
      return ['Đức Huy', 'Quang Hải', 'Công Phượng', 'Văn Toàn', 'Hùng Dũng', 'Duy Mạnh', 'Quế Hải', 'Tiến Linh', 'Tuấn Anh', 'Xuân Trường'];
    };

    const homePlayers = getPlayersList(homeTeamId);
    const awayPlayers = getPlayersList(awayTeamId);

    // Generate home goals
    for (let i = 0; i < hs; i++) {
      const player = homePlayers[Math.floor(Math.random() * homePlayers.length)];
      events.push({
        type: 'goal',
        teamId: homeTeamId,
        playerName: player,
        minute: Math.floor(Math.random() * 40) + 1
      });
    }

    // Generate away goals
    for (let i = 0; i < as; i++) {
      const player = awayPlayers[Math.floor(Math.random() * awayPlayers.length)];
      events.push({
        type: 'goal',
        teamId: awayTeamId,
        playerName: player,
        minute: Math.floor(Math.random() * 40) + 1
      });
    }

    // Maybe yellow cards (0-2)
    const yellowCount = Math.floor(Math.random() * 3);
    for (let i = 0; i < yellowCount; i++) {
      const isHome = Math.random() > 0.5;
      const teamId = isHome ? homeTeamId : awayTeamId;
      const players = isHome ? homePlayers : awayPlayers;
      const player = players[Math.floor(Math.random() * players.length)];
      events.push({
        type: 'yellow',
        teamId,
        playerName: player,
        minute: Math.floor(Math.random() * 40) + 1
      });
    }

    // Maybe red card (15% chance)
    if (Math.random() < 0.15) {
      const isHome = Math.random() > 0.5;
      const teamId = isHome ? homeTeamId : awayTeamId;
      const players = isHome ? homePlayers : awayPlayers;
      const player = players[Math.floor(Math.random() * players.length)];
      events.push({
        type: 'red',
        teamId,
        playerName: player,
        minute: Math.floor(Math.random() * 40) + 1
      });
    }

    return events.sort((a, b) => (a.minute || 0) - (b.minute || 0));
  };

  const computeFutsalStats = () => {
    if (!selectedLeague) return { scorers: [], redCards: [], yellowCards: [] };

    const scorerMap: Record<string, { playerName: string; teamId: string; goals: number }> = {};
    const redMap: Record<string, { playerName: string; teamId: string; redCards: number }> = {};
    const yellowMap: Record<string, { playerName: string; teamId: string; yellowCards: number }> = {};

    selectedLeague.matches.forEach(m => {
      if (!m.isPlayed || !m.events) return;
      m.events.forEach(ev => {
        const key = `${ev.playerName}_${ev.teamId}`;
        
        if (ev.type === 'goal') {
          if (!scorerMap[key]) {
            scorerMap[key] = { playerName: ev.playerName, teamId: ev.teamId, goals: 0 };
          }
          scorerMap[key].goals += 1;
        } else if (ev.type === 'red') {
          if (!redMap[key]) {
            redMap[key] = { playerName: ev.playerName, teamId: ev.teamId, redCards: 0 };
          }
          redMap[key].redCards += 1;
        } else if (ev.type === 'yellow') {
          if (!yellowMap[key]) {
            yellowMap[key] = { playerName: ev.playerName, teamId: ev.teamId, yellowCards: 0 };
          }
          yellowMap[key].yellowCards += 1;
        }
      });
    });

    const scorers = Object.values(scorerMap).sort((a, b) => b.goals - a.goals);
    const redCards = Object.values(redMap).sort((a, b) => b.redCards - a.redCards);
    const yellowCards = Object.values(yellowMap).sort((a, b) => b.yellowCards - a.yellowCards);

    return { scorers, redCards, yellowCards };
  };

  const renderTeamCardsSummary = (match: LeagueMatch, teamId: string) => {
    if (selectedLeague?.sport !== 'futsal' || !match.isPlayed || !match.events) return null;
    
    const teamEvents = match.events.filter(e => e.teamId === teamId);
    const yellows = teamEvents.filter(e => e.type === 'yellow');
    const reds = teamEvents.filter(e => e.type === 'red');

    if (yellows.length === 0 && reds.length === 0) return null;

    return (
      <div className="flex items-center gap-1 ml-1.5 shrink-0">
        {yellows.map((_, idx) => (
          <span key={`y-${idx}`} className="inline-block w-2 h-2.5 bg-amber-400 rounded-2xs" title="Thẻ vàng" />
        ))}
        {reds.map((_, idx) => (
          <span key={`r-${idx}`} className="inline-block w-2 h-2.5 bg-red-500 rounded-2xs" title="Thẻ đỏ" />
        ))}
      </div>
    );
  };

  // Load permissions from server
  useEffect(() => {
    fetch('/api/leagues-permissions')
      .then(res => res.json())
      .then(data => {
        if (data.permissions) {
          setPermissions(data.permissions);
        }
      })
      .catch(err => console.warn('Error loading permissions:', err));
  }, []);

  // Load leagues from server
  useEffect(() => {
    if (hasPermission) {
      fetch(`/api/leagues?userId=${userId}`)
        .then(res => {
          if (!res.ok) throw new Error('Quyền hạn hạn chế hoặc lỗi tải giải đấu');
          return res.json();
        })
        .then(data => {
          if (Array.isArray(data)) {
            setLeagues(data);
          }
        })
        .catch(err => {
          console.warn('Error loading leagues from server:', err);
          const saved = localStorage.getItem('my_leagues_v1');
          if (saved) {
            try {
              setLeagues(JSON.parse(saved));
            } catch (e) {}
          }
        });
    } else {
      setLeagues([]);
    }
  }, [userId, hasPermission]);

  // Save changes helper syncing with server API contract
  const saveLeaguesToLocalStorage = async (updatedLeagues: MyLeague[]) => {
    // Keep local cache for offline resiliency
    setLeagues(updatedLeagues);
    localStorage.setItem('my_leagues_v1', JSON.stringify(updatedLeagues));
    
    if (selectedLeague) {
      const freshSelected = updatedLeagues.find(l => l.id === selectedLeague.id);
      if (freshSelected) {
        setSelectedLeague(freshSelected);
      }
    }

    try {
      if (updatedLeagues.length > leagues.length) {
        // Created new league
        const newLeague = updatedLeagues[0];
        await fetch('/api/leagues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newLeague)
        });
      } else if (updatedLeagues.length === leagues.length) {
        // Updated league
        // We find the modified league from updatedLeagues compared with current leagues array
        const changedLeague = updatedLeagues.find((ul, idx) => JSON.stringify(ul) !== JSON.stringify(leagues[idx]));
        if (changedLeague) {
          await fetch(`/api/leagues/${changedLeague.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changedLeague)
          });
        }
      } else if (updatedLeagues.length < leagues.length) {
        // Deleted league
        const deletedLeague = leagues.find(l => !updatedLeagues.some(ul => ul.id === l.id));
        if (deletedLeague) {
          await fetch(`/api/leagues/${deletedLeague.id}`, {
            method: 'DELETE'
          });
        }
      }
    } catch (err) {
      console.error('Error syncing league state to server:', err);
    }
  };

  // Resize name/roster arrays when team count changes. Preserve any names/rosters
  // already present (typed by the user or filled by AI) and only default the new
  // slots — so a sport change or AI import no longer wipes what was entered.
  useEffect(() => {
    setTeamNames(prev =>
      Array.from({ length: numTeams }, (_, i) => prev[i] || `Đội tuyển ${i + 1}`)
    );
    setTeamPlayers(prev =>
      Array.from({ length: numTeams }, (_, i) => prev[i] || [])
    );
  }, [numTeams, newLeagueSport]);

  const handleTeamNameChange = (index: number, val: string) => {
    const next = [...teamNames];
    next[index] = val;
    setTeamNames(next);
  };

  const handlePlayerNameChange = (teamIdx: number, playerIdx: number, val: string) => {
    const next = [...teamPlayers];
    const teamP = [...(next[teamIdx] || [])];
    teamP[playerIdx] = val;
    next[teamIdx] = teamP;
    setTeamPlayers(next);
  };

  const addPlayerField = (teamIdx: number) => {
    const next = [...teamPlayers];
    const teamP = [...(next[teamIdx] || [])];
    teamP.push('');
    next[teamIdx] = teamP;
    setTeamPlayers(next);
  };

  const removePlayerField = (teamIdx: number, playerIdx: number) => {
    const next = [...teamPlayers];
    const teamP = [...(next[teamIdx] || [])];
    teamP.splice(playerIdx, 1);
    next[teamIdx] = teamP;
    setTeamPlayers(next);
  };

  // Core Scheduling Engine
  const SAMPLE_ROSTER_SUMMARY = `GIẢI FUTSAL TOÀN QUỐC 2026 - TÓM TẮT ĐỘI HÌNH CHÍNH THỨC:

1. Đội tuyển Đại Học Bách Khoa (BKU FC):
- Cầu thủ: Nguyễn Huy Hoàng, Trần Chí Thanh, Đặng Quốc Bảo, Lê Hoài Nam, Phạm Minh Quân.

2. Đội tuyển Đại Học Công Nghệ Thông Tin (UIT FC):
- Cầu thủ: Huỳnh Ngọc Sang, Phan Văn Tài, Nguyễn Lâm Duy, Đỗ Duy Khánh, Trương Quang Minh.

3. Đội tuyển Đại Học Khoa Học Tự Nhiên (HCMUS FC):
- Cầu thủ: Võ Quốc Anh, Nguyễn Thanh Sơn, Trần Minh Huy, Lâm Thế Phong, Bùi Quang Huy.

4. Đội tuyển Đại Học Sư Phạm Kỹ Thuật (UTE FC):
- Cầu thủ: Đỗ Tuấn Kiệt, Nguyễn Trường Giang, Hoàng Văn Phong, Phan Thành Đạt, Vương Quốc Bảo.`;

  const handleAiParse = async () => {
    if (!aiRosterText.trim()) {
      setAiErrorMessage('Vui lòng điền thông tin tóm tắt giải đấu!');
      return;
    }

    setIsAiLoading(true);
    setAiErrorMessage('');
    setAiSuccessMessage('');

    try {
      const response = await fetch('/api/ai/parse-roster', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summary: aiRosterText }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Yêu cầu phân tích bằng AI thất bại.');
      }

      const data = await response.json();
      if (data && data.teams && Array.isArray(data.teams)) {
        const parsedTeams = data.teams;
        const totalTeams = parsedTeams.length;

        if (totalTeams === 0) {
          throw new Error('AI không nhận diện được đội bóng hoặc cầu thủ nào từ văn bản của bạn. Vui lòng viết rõ ràng hơn!');
        }

        // Adjust team counts
        let targetNumTeams = totalTeams;
        if (newLeagueFormat === 'group_knockout') {
          targetNumTeams = 8;
        } else if (newLeagueFormat === 'knockout') {
          if (totalTeams > 4) targetNumTeams = 8;
          else targetNumTeams = 4;
        } else {
          // round robin
          if (totalTeams <= 3) targetNumTeams = 3;
          else if (totalTeams === 4) targetNumTeams = 4;
          else if (totalTeams === 5) targetNumTeams = 5;
          else if (totalTeams === 6) targetNumTeams = 6;
          else targetNumTeams = 8;
        }

        setNumTeams(targetNumTeams);

        // Pre-populate names and rosters
        const newNames = Array.from({ length: targetNumTeams }, (_, idx) => {
          if (parsedTeams[idx]) {
            return parsedTeams[idx].name;
          }
          return `Đội tuyển ${idx + 1}`;
        });

        const newPlayersList = Array.from({ length: targetNumTeams }, (_, idx) => {
          if (parsedTeams[idx] && Array.isArray(parsedTeams[idx].players)) {
            return parsedTeams[idx].players;
          }
          return [];
        });

        setTeamNames(newNames);
        setTeamPlayers(newPlayersList);
        setAiSuccessMessage(`✨ Đã phân tích thành công ${totalTeams} đội bằng AI và tự động điền danh sách vào form bên dưới!`);
        playRetroBeep(880, 'sine', 0.1);
      } else {
        throw new Error('Định dạng dữ liệu trả về từ AI không hợp lệ.');
      }
    } catch (err: any) {
      setAiErrorMessage(err.message || 'Có lỗi xảy ra khi liên kết với AI.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const createNewLeague = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newLeagueName.trim()) {
      setFormError('Hãy điền tên giải đấu!');
      return;
    }

    const uniqueTeams = teamNames.filter(t => t.trim() !== '');
    if (uniqueTeams.length < 2) {
      setFormError('Cần ít nhất 2 đội để tổ chức giải!');
      return;
    }

    // Build teams array
    const teamsList: LeagueTeam[] = uniqueTeams.map((name, idx) => {
      let playersList: string[] = [];
      if (newLeagueSport === 'futsal') {
        playersList = (teamPlayers[idx] || [])
          .map(p => p.trim())
          .filter(p => p.length > 0);
      }
      return {
        id: `team-${Date.now()}-${idx}`,
        name: name.trim(),
        logoColor: LOGO_COLORS[idx % LOGO_COLORS.length],
        players: playersList
      };
    });

    let generatedMatches: LeagueMatch[] = [];

    // 1. ROUND ROBIN
    if (newLeagueFormat === 'round_robin') {
      const list = [...teamsList];
      const odd = list.length % 2 !== 0;
      if (odd) {
        // We'll pad with a null or rest team
        list.push({ id: 'BYE', name: 'Nghỉ (BYE)', logoColor: 'bg-stone-300' });
      }

      const n = list.length;
      const rounds = n - 1;
      let matchIdx = 1;

      for (let r = 0; r < rounds; r++) {
        for (let i = 0; i < n / 2; i++) {
          const homeTeam = list[i];
          const awayTeam = list[n - 1 - i];

          if (homeTeam.id !== 'BYE' && awayTeam.id !== 'BYE') {
            generatedMatches.push({
              id: `match-${Date.now()}-${matchIdx++}`,
              round: r + 1,
              stage: 'Group Stage',
              home: homeTeam.id,
              away: awayTeam.id,
              homeScore: null,
              awayScore: null,
              isPlayed: false
            });
          }
        }
        // Round robin list rotation
        list.splice(1, 0, list.pop()!);
      }
    } 
    // 2. SINGLE ELIMINATION (KNOCKOUT)
    else if (newLeagueFormat === 'knockout') {
      // Must be 4, 8, or 16 teams. Let's clamp to closest lower power of 2 or just fill with defaults.
      // We will structure them visually.
      const size = teamsList.length;
      if (size === 4) {
        // 2 Semifinals, 1 Final
        generatedMatches = [
          { id: 'ko-sf1', round: 1, stage: 'Semifinals', home: teamsList[0].id, away: teamsList[3].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'home' },
          { id: 'ko-sf2', round: 1, stage: 'Semifinals', home: teamsList[1].id, away: teamsList[2].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'away' },
          { id: 'ko-f1', round: 2, stage: 'Final', home: 'Thắng Bán Kết 1', away: 'Thắng Bán Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null }
        ];
      } else if (size === 8) {
        // 4 Quarterfinals, 2 Semifinals, 1 Final
        generatedMatches = [
          { id: 'ko-qf1', round: 1, stage: 'Quarterfinals', home: teamsList[0].id, away: teamsList[7].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf1', nextMatchPosition: 'home' },
          { id: 'ko-qf2', round: 1, stage: 'Quarterfinals', home: teamsList[3].id, away: teamsList[4].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf1', nextMatchPosition: 'away' },
          { id: 'ko-qf3', round: 1, stage: 'Quarterfinals', home: teamsList[1].id, away: teamsList[6].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf2', nextMatchPosition: 'home' },
          { id: 'ko-qf4', round: 1, stage: 'Quarterfinals', home: teamsList[2].id, away: teamsList[5].id, homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-sf2', nextMatchPosition: 'away' },
          
          { id: 'ko-sf1', round: 2, stage: 'Semifinals', home: 'Thắng Tứ Kết 1', away: 'Thắng Tứ Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'home' },
          { id: 'ko-sf2', round: 2, stage: 'Semifinals', home: 'Thắng Tứ Kết 3', away: 'Thắng Tứ Kết 4', homeScore: null, awayScore: null, isPlayed: false, winner: null, nextMatchId: 'ko-f1', nextMatchPosition: 'away' },
          
          { id: 'ko-f1', round: 3, stage: 'Final', home: 'Thắng Bán Kết 1', away: 'Thắng Bán Kết 2', homeScore: null, awayScore: null, isPlayed: false, winner: null }
        ];
      } else {
        // Standardize simple size knockout
        setFormError('Vui lòng chọn 4 hoặc 8 đội cho thể thức loại trực tiếp!');
        return;
      }
    }
    // 3. GROUP STAGE + KNOCKOUT (CHIA BẢNG)
    else {
      if (teamsList.length !== 8) {
        setFormError('Thể thức chia bảng hiện tại hỗ trợ chính xác 8 đội (chia 2 bảng A & B)!');
        return;
      }

      // Group A (first 4), Group B (last 4)
      const groupA = teamsList.slice(0, 4);
      const groupB = teamsList.slice(4, 8);

      // Generate Group A Round Robin (6 matches)
      const genGroupMatches = (groupTeams: LeagueTeam[], grp: 'A' | 'B') => {
        const matches: LeagueMatch[] = [];
        const n = groupTeams.length;
        const list = [...groupTeams];
        let mIdx = 1;

        for (let r = 0; r < n - 1; r++) {
          for (let i = 0; i < n / 2; i++) {
            matches.push({
              id: `match-grp${grp}-${r}-${i}`,
              round: r + 1,
              stage: 'Group Stage',
              group: grp,
              home: list[i].id,
              away: list[n - 1 - i].id,
              homeScore: null,
              awayScore: null,
              isPlayed: false
            });
          }
          list.splice(1, 0, list.pop()!);
        }
        return matches;
      };

      const matchesA = genGroupMatches(groupA, 'A');
      const matchesB = genGroupMatches(groupB, 'B');

      // Semifinals placeholders (Round 4)
      const sf1: LeagueMatch = {
        id: 'grpko-sf1',
        round: 4,
        stage: 'Semifinals',
        home: 'Nhất Bảng A',
        away: 'Nhì Bảng B',
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        winner: null,
        nextMatchId: 'grpko-f1',
        nextMatchPosition: 'home'
      };
      const sf2: LeagueMatch = {
        id: 'grpko-sf2',
        round: 4,
        stage: 'Semifinals',
        home: 'Nhất Bảng B',
        away: 'Nhì Bảng A',
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        winner: null,
        nextMatchId: 'grpko-f1',
        nextMatchPosition: 'away'
      };

      // Final (Round 5)
      const f1: LeagueMatch = {
        id: 'grpko-f1',
        round: 5,
        stage: 'Final',
        home: 'Thắng Bán Kết 1',
        away: 'Thắng Bán Kết 2',
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        winner: null
      };

      generatedMatches = [...matchesA, ...matchesB, sf1, sf2, f1];
    }

    const brandNewLeague: MyLeague = {
      id: `league-${Date.now()}`,
      name: newLeagueName.trim(),
      sport: newLeagueSport,
      format: newLeagueFormat,
      teams: teamsList,
      matches: generatedMatches,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    const nextLeagues = [brandNewLeague, ...leagues];
    saveLeaguesToLocalStorage(nextLeagues);
    setSelectedLeague(brandNewLeague);
    setShowCreateForm(false);
    setNewLeagueName('');
    setActiveTab('schedule');
    playRetroBeep(900, 'sine', 0.2);
  };

  const deleteLeague = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa giải đấu này?')) return;

    const filtered = leagues.filter(l => l.id !== id);
    saveLeaguesToLocalStorage(filtered);
    if (selectedLeague?.id === id) {
      setSelectedLeague(null);
    }
    playRetroBeep(180, 'sawtooth', 0.15);
  };

  // COMPUTE STANDINGS FOR ROUND ROBIN / GROUP STAGE
  const computeStandings = (teams: LeagueTeam[], matches: LeagueMatch[], targetGroup?: 'A' | 'B'): GroupStanding[] => {
    const map: Record<string, GroupStanding> = {};
    
    // Filter teams by group if required
    let activeTeams = teams;
    if (targetGroup) {
      // Group A is first 4 teams, Group B is last 4 teams
      activeTeams = targetGroup === 'A' ? teams.slice(0, 4) : teams.slice(4, 8);
    }

    // Initialize map
    activeTeams.forEach(t => {
      map[t.id] = {
        teamId: t.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      };
    });

    // Compute played matches
    matches.forEach(m => {
      if (!m.isPlayed) return;
      if (selectedLeague?.format === 'group_knockout' && m.stage !== 'Group Stage') return; // Only group stage matches go to standings in group_knockout
      if (targetGroup && m.group !== targetGroup) return;

      const homeId = m.home;
      const awayId = m.away;
      const hScore = m.homeScore ?? 0;
      const aScore = m.awayScore ?? 0;

      if (!map[homeId] || !map[awayId]) return;

      map[homeId].played++;
      map[awayId].played++;

      map[homeId].goalsFor += hScore;
      map[homeId].goalsAgainst += aScore;
      map[awayId].goalsFor += aScore;
      map[awayId].goalsAgainst += hScore;

      if (hScore > aScore) {
        map[homeId].won++;
        map[homeId].points += 3;
        map[awayId].lost++;
      } else if (hScore < aScore) {
        map[awayId].won++;
        map[awayId].points += 3;
        map[homeId].lost++;
      } else {
        map[homeId].drawn++;
        map[homeId].points += 1;
        map[awayId].drawn++;
        map[awayId].points += 1;
      }
    });

    // Resolve goal difference & convert to array
    return Object.values(map).map(st => {
      st.goalDifference = st.goalsFor - st.goalsAgainst;
      return st;
    }).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });
  };

  // Open Score Input modal
  const startEditScore = (match: LeagueMatch) => {
    // If teams are placeholder names, don't allow score edit unless we have active names (for knockout next stages)
    setEditingMatch(match);
    setEditHomeScore(match.homeScore !== null ? String(match.homeScore) : '0');
    setEditAwayScore(match.awayScore !== null ? String(match.awayScore) : '0');
    setEditingMatchEvents(match.events || []);
    setNewEventTeamId(match.home);
    setNewEventType('goal');
    setNewEventPlayerName('');
    setNewEventMinute('');
  };

  // Save score and progress the tournament logic
  // AI: parse tóm tắt -> danh sách events prefill (không tự submit; user bấm áp dụng để fill vào editingMatchEvents rồi Save bình thường).
  const handleAiPrefillEvents = async () => {
    if (!editingMatch || !selectedLeague) {
      alert('Vui lòng mở trận đấu cần chỉnh sửa trước!');
      return;
    }
    if (!aiSummaryText.trim()) {
      alert('Vui lòng nhập tóm tắt diễn biến trận đấu trước!');
      return;
    }
    setIsAiEventLoading(true);
    setAiEventPreview(null);
    try {
      const homeTeam = selectedLeague.teams.find(t => t.id === editingMatch.home);
      const awayTeam = selectedLeague.teams.find(t => t.id === editingMatch.away);
      const res = await fetch('/api/ai/parse-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: aiSummaryText,
          homeTeamName: homeTeam?.name || 'đội nhà',
          awayTeamName: awayTeam?.name || 'đội khách',
          homePlayers: homeTeam?.players || [],
          awayPlayers: awayTeam?.players || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'AI không tách được diễn biến.');
        playRetroBeep(220, 'sawtooth', 0.25);
        return;
      }
      const events: any[] = Array.isArray(data?.events) ? data.events : [];
      setAiEventPreview(events);
      if (events.length === 0) {
        alert('AI không nhận diện được sự kiện nào. Vui lòng bổ sung thêm ngữ cảnh (ghi rõ tên cầu thủ, phút, loại thẻ/bàn thắng).');
        playRetroBeep(220, 'sawtooth', 0.25);
      } else {
        playRetroBeep(659, 'sine', 0.12);
      }
    } catch (e) {
      console.error(e);
      alert('Lỗi kết nối máy chủ khi gọi AI!');
    } finally {
      setIsAiEventLoading(false);
    }
  };

  const handleAiApplyEvents = () => {
    if (!editingMatch || !aiEventPreview || aiEventPreview.length === 0) return;
    const mapped: MatchEvent[] = aiEventPreview
      .filter(e => e.teamSide === 'home' || e.teamSide === 'away')
      .map(e => {
        const teamId = e.teamSide === 'home' ? editingMatch.home : editingMatch.away;
        return {
          type: e.type,
          teamId,
          playerName: e.playerName || '',
          minute: typeof e.minute === 'number' ? e.minute : undefined,
        };
      });

    if (mapped.length === 0) {
      alert('Không có sự kiện nào hợp lệ để áp dụng (thiếu thông tin đội).');
      return;
    }

    // Trộn với editingMatchEvents hiện có, tránh trùng (cùng type+teamId+playerName+minute).
    const existing = new Set(editingMatchEvents.map(p => `${p.type}|${p.teamId}|${p.playerName}|${p.minute ?? ''}`));
    const merged = [...editingMatchEvents];
    for (const ev of mapped) {
      const k = `${ev.type}|${ev.teamId}|${ev.playerName}|${ev.minute ?? ''}`;
      if (!existing.has(k)) {
        merged.push(ev);
        existing.add(k);
      }
    }
    merged.sort((a, b) => (a.minute || 0) - (b.minute || 0));
    setEditingMatchEvents(merged);

    // Score = tổng bàn thắng suy ra từ TOÀN BỘ danh sách sự kiện đã trộn (idempotent).
    // Dùng giá trị tuyệt đối thay vì cộng dồn lên score hiện tại để không bị đếm kép
    // khi người dùng đã tự nhập tỉ số trước đó.
    const homeGoals = merged.filter(e => e.type === 'goal' && e.teamId === editingMatch.home).length;
    const awayGoals = merged.filter(e => e.type === 'goal' && e.teamId === editingMatch.away).length;
    if (homeGoals > 0) setEditHomeScore(String(homeGoals));
    if (awayGoals > 0) setEditAwayScore(String(awayGoals));

    setAiEventPreview(null);
    setAiSummaryText('');
    playRetroBeep(880, 'sine', 0.2);
    alert(`Đã điền ${mapped.length} sự kiện vào danh sách. Nhấn "Lưu kết quả" bên dưới để lưu trận đấu.`);
  };

  const handleAiCancelEvents = () => setAiEventPreview(null);

  const saveMatchScore = () => {
    if (!editingMatch || !selectedLeague) return;

    const hs = editHomeScore.trim() === '' ? 0 : parseInt(editHomeScore);
    const as = editAwayScore.trim() === '' ? 0 : parseInt(editAwayScore);

    if (isNaN(hs) || isNaN(as)) {
      alert('Vui lòng nhập tỉ số hợp lệ!');
      return;
    }

    playRetroBeep(700, 'sine', 0.1);

    // Update match score
    const updatedMatches = selectedLeague.matches.map(m => {
      if (m.id !== editingMatch.id) return m;

      let winner: string | null = null;
      if (hs > as) {
        winner = m.home;
      } else if (as > hs) {
        winner = m.away;
      } else {
        winner = 'DRAW';
      }

      return {
        ...m,
        homeScore: hs,
        awayScore: as,
        isPlayed: true,
        winner,
        events: selectedLeague.sport === 'futsal' ? editingMatchEvents : m.events
      };
    });

    // CLONE LEAGUE TO RECALCULATE PROPAGATIONS
    let nextLeague = {
      ...selectedLeague,
      matches: updatedMatches
    };

    // Auto advancement for Single Elimination Bracket or Group advancements
    if (selectedLeague.format === 'knockout') {
      // Find the match we just edited
      const match = updatedMatches.find(m => m.id === editingMatch.id)!;
      if (match.nextMatchId) {
        // Draws are not allowed to advance in a bracket — the user must enter a decisive score.
        const winnerId = knockoutWinner(match.home, match.away, hs, as);
        if (!winnerId) {
          alert('Trận đấu hoà! Vui lòng nhập tỉ số phân thắng bại để đội thắng đi tiếp.');
          return;
        }

        // Push winner to the home or away slot of the next match
        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === match.nextMatchId) {
            if (match.nextMatchPosition === 'home') {
              return { ...nm, home: winnerId };
            } else {
              return { ...nm, away: winnerId };
            }
          }
          return nm;
        });
      }
    } 
    // Group stage + knockout auto progression
    else if (selectedLeague.format === 'group_knockout') {
      const match = updatedMatches.find(m => m.id === editingMatch.id)!;

      // If group stage finishes, auto promote top 2 of Group A and Group B to SF
      const allGroupMatchesPlayed = updatedMatches
        .filter(m => m.stage === 'Group Stage')
        .every(m => m.isPlayed);

      if (allGroupMatchesPlayed && match.stage === 'Group Stage') {
        const standA = computeStandings(selectedLeague.teams, updatedMatches, 'A');
        const standB = computeStandings(selectedLeague.teams, updatedMatches, 'B');

        const firstA = standA[0].teamId;
        const secondA = standA[1].teamId;
        const firstB = standB[0].teamId;
        const secondB = standB[1].teamId;

        // Semifinals mapping
        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === 'grpko-sf1') {
            return { ...nm, home: firstA, away: secondB };
          }
          if (nm.id === 'grpko-sf2') {
            return { ...nm, home: firstB, away: secondA };
          }
          return nm;
        });
      }

      // Progression inside the SF/Final stages of group+knockout
      if (match.stage !== 'Group Stage' && match.nextMatchId) {
        const winnerId = knockoutWinner(match.home, match.away, hs, as);
        if (!winnerId) {
          alert('Trận đấu hoà! Vui lòng nhập tỉ số phân thắng bại để đội thắng đi tiếp.');
          return;
        }
        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === match.nextMatchId) {
            if (match.nextMatchPosition === 'home') {
              return { ...nm, home: winnerId };
            } else {
              return { ...nm, away: winnerId };
            }
          }
          return nm;
        });
      }
    }

    // Check if tournament has ended (all matches played)
    const allPlayed = nextLeague.matches.every(m => m.isPlayed);
    if (allPlayed) {
      nextLeague.status = 'ENDED';
    }

    const updatedLeagues = leagues.map(l => l.id === selectedLeague.id ? nextLeague : l);
    saveLeaguesToLocalStorage(updatedLeagues);
    setEditingMatch(null);

    // Read team names & results out loud in Vietnamese!
    const homeName = getTeamName(editingMatch.home, selectedLeague.teams);
    const awayName = getTeamName(editingMatch.away, selectedLeague.teams);
    speakMatchResult(homeName, awayName, hs, as);
  };

  // Helper to read out results using Vietnamese Web Speech Synthesis API
  const speakMatchResult = (homeTeamName: string, awayTeamName: string, hs: number, as: number) => {
    if (!('speechSynthesis' in window)) return;
    
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    let text = `Trận đấu giữa ${homeTeamName} và ${awayTeamName} đã kết thúc. `;
    if (hs > as) {
      text += `Chiến thắng thuộc về ${homeTeamName} với tỷ số ${hs} ${as}.`;
    } else if (as > hs) {
      text += `Chiến thắng thuộc về ${awayTeamName} với tỷ số ${as} ${hs}.`;
    } else {
      text += `Hai đội hòa nhau với tỷ số ${hs} đều.`;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    
    // Attempt to locate a Vietnamese speaking voice
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.startsWith('vi'));
    if (viVoice) {
      utterance.voice = viVoice;
    }
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    
    window.speechSynthesis.speak(utterance);
  };

  // Simulate a random score for the active match and speak the names of teams/scores in Vietnamese
  const handleRandomizeScore = () => {
    if (!editingMatch || !selectedLeague) return;

    let hs = 0;
    let as = 0;

    if (selectedLeague.sport === 'pingpong') {
      // Best of 5, winner needs 3 sets
      const isHomeWinner = Math.random() > 0.5;
      hs = isHomeWinner ? 3 : Math.floor(Math.random() * 3);
      as = isHomeWinner ? Math.floor(Math.random() * 3) : 3;
    } else if (selectedLeague.sport === 'badminton') {
      // Best of 3, winner needs 2 sets
      const isHomeWinner = Math.random() > 0.5;
      hs = isHomeWinner ? 2 : Math.floor(Math.random() * 2);
      as = isHomeWinner ? Math.floor(Math.random() * 2) : 2;
    } else if (selectedLeague.sport === 'futsal') {
      hs = Math.floor(Math.random() * 6);
      as = Math.floor(Math.random() * 6);
    } else {
      // PES / other
      hs = Math.floor(Math.random() * 5);
      as = Math.floor(Math.random() * 5);
    }

    // Bracket matches cannot have draws
    const isKnockout = selectedLeague.format === 'knockout' || 
                       (selectedLeague.format === 'group_knockout' && editingMatch.stage !== 'Group Stage');
    
    if (isKnockout && hs === as) {
      if (selectedLeague.sport === 'badminton' || selectedLeague.sport === 'pingpong') {
        // Best-of score systems naturally do not draw
      } else {
        if (Math.random() > 0.5) {
          hs += 1;
        } else {
          as += 1;
        }
      }
    }

    // Update state fields visually
    setEditHomeScore(String(hs));
    setEditAwayScore(String(as));

    playRetroBeep(800, 'sine', 0.15);

    const randomEvents = selectedLeague.sport === 'futsal' 
      ? generateRandomEventsForMatch(editingMatch.home, editingMatch.away, hs, as, selectedLeague.teams)
      : [];

    // Save score and progress
    const updatedMatches = selectedLeague.matches.map(m => {
      if (m.id !== editingMatch.id) return m;

      let winner: string | null = null;
      if (hs > as) {
        winner = m.home;
      } else if (as > hs) {
        winner = m.away;
      } else {
        winner = 'DRAW';
      }

      return {
        ...m,
        homeScore: hs,
        awayScore: as,
        isPlayed: true,
        winner,
        events: selectedLeague.sport === 'futsal' ? randomEvents : m.events
      };
    });

    let nextLeague = {
      ...selectedLeague,
      matches: updatedMatches
    };

    if (selectedLeague.format === 'knockout') {
      const match = updatedMatches.find(m => m.id === editingMatch.id)!;
      if (match.nextMatchId) {
        const winnerId = knockoutWinner(match.home, match.away, hs, as);
        if (!winnerId) {
          alert('Trận đấu hoà! Vui lòng nhập tỉ số phân thắng bại để đội thắng đi tiếp.');
          return;
        }
        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === match.nextMatchId) {
            if (match.nextMatchPosition === 'home') {
              return { ...nm, home: winnerId };
            } else {
              return { ...nm, away: winnerId };
            }
          }
          return nm;
        });
      }
    } 
    else if (selectedLeague.format === 'group_knockout') {
      const match = updatedMatches.find(m => m.id === editingMatch.id)!;

      const allGroupMatchesPlayed = updatedMatches
        .filter(m => m.stage === 'Group Stage')
        .every(m => m.isPlayed);

      if (allGroupMatchesPlayed && match.stage === 'Group Stage') {
        const standA = computeStandings(selectedLeague.teams, updatedMatches, 'A');
        const standB = computeStandings(selectedLeague.teams, updatedMatches, 'B');

        const firstA = standA[0].teamId;
        const secondA = standA[1].teamId;
        const firstB = standB[0].teamId;
        const secondB = standB[1].teamId;

        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === 'grpko-sf1') {
            return { ...nm, home: firstA, away: secondB };
          }
          if (nm.id === 'grpko-sf2') {
            return { ...nm, home: firstB, away: secondA };
          }
          return nm;
        });
      }

      if (match.stage !== 'Group Stage' && match.nextMatchId) {
        const winnerId = knockoutWinner(match.home, match.away, hs, as);
        if (!winnerId) {
          alert('Trận đấu hoà! Vui lòng nhập tỉ số phân thắng bại để đội thắng đi tiếp.');
          return;
        }
        nextLeague.matches = nextLeague.matches.map(nm => {
          if (nm.id === match.nextMatchId) {
            if (match.nextMatchPosition === 'home') {
              return { ...nm, home: winnerId };
            } else {
              return { ...nm, away: winnerId };
            }
          }
          return nm;
        });
      }
    }

    const allPlayed = nextLeague.matches.every(m => m.isPlayed);
    if (allPlayed) {
      nextLeague.status = 'ENDED';
    }

    const updatedLeagues = leagues.map(l => l.id === selectedLeague.id ? nextLeague : l);
    saveLeaguesToLocalStorage(updatedLeagues);
    setEditingMatch(null);

    // Read team names & results out loud in Vietnamese!
    const homeName = getTeamName(editingMatch.home, selectedLeague.teams);
    const awayName = getTeamName(editingMatch.away, selectedLeague.teams);
    speakMatchResult(homeName, awayName, hs, as);
  };

  const getTeamName = (teamIdOrPlaceholder: string, teams: LeagueTeam[]) => {
    const t = teams.find(team => team.id === teamIdOrPlaceholder);
    return t ? t.name : teamIdOrPlaceholder;
  };

  const getTeamColor = (teamIdOrPlaceholder: string, teams: LeagueTeam[]) => {
    const t = teams.find(team => team.id === teamIdOrPlaceholder);
    return t ? t.logoColor : 'bg-stone-300';
  };

  const getDisplayNameForTesting = (id: string, defaultName: string) => {
    if (id === userId && userProfile?.displayName) {
      return userProfile.displayName;
    }
    return defaultName;
  };

  const renderTestingAvatar = (id: string, defaultName: string) => {
    const isSelf = id === userId;
    const finalName = getDisplayNameForTesting(id, defaultName);
    const initial = finalName.substring(0, 2);
    
    if (isSelf && userProfile?.avatar) {
      return (
        <img 
          src={userProfile.avatar} 
          alt={finalName} 
          referrerPolicy="no-referrer"
          className="w-8 h-8 rounded-full border border-stone-200 object-cover" 
        />
      );
    }
    
    const colors: Record<string, string> = {
      user_a: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      user_b: 'bg-rose-100 text-rose-700 border-rose-200',
      user_c: 'bg-emerald-100 text-emerald-700 border-emerald-200'
    };
    
    return (
      <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-extrabold text-xs uppercase ${colors[id] || 'bg-stone-100 text-stone-600'}`}>
        {initial}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-lg sm:text-2xl font-serif font-black text-stone-900 flex flex-wrap items-center gap-1.5 sm:gap-2 leading-tight">
            <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-amber-500 fill-amber-100 shrink-0" /> 
            <span>Giải Đấu Thể Thao</span>
            <span className="text-[10px] sm:text-xs bg-orange-100 text-orange-700 py-0.5 sm:py-1 px-2 sm:px-2.5 rounded-full font-sans font-bold whitespace-nowrap">Quản lý Chuyên Nghiệp</span>
          </h1>
          <p className="text-xs text-stone-500 mt-1">Hệ thống tạo giải đấu chuyên nghiệp tự động sắp lịch và bảng xếp hạng cho Futsal, PES, Bóng bàn & Cầu lông</p>
        </div>

        {!selectedLeague && hasPermission && (
          <button
            onClick={() => { setShowCreateForm(true); playRetroBeep(440, 'sine', 0.1); }}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow hover:shadow-md"
          >
            <PlusCircle className="w-4 h-4" /> Tổ Chức Giải Đấu Mới
          </button>
        )}
      </div>

      {/* 2. CREATE LEAGUE FORM MODAL / PANEL */}
      {showCreateForm && (
        <div className="bg-white border-2 border-orange-200 shadow-xl rounded-2xl p-6 mb-8 animate-fade-in relative">
          <button 
            onClick={() => setShowCreateForm(false)} 
            className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <form onSubmit={createNewLeague} className="flex flex-col gap-6">
            <h2 className="text-base font-bold text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2">
              🏆 Thiết lập thông số Giải Đấu Mới
            </h2>

            {formError && (
              <div className="bg-red-50 text-red-600 border border-red-200 p-3 rounded-lg text-xs font-semibold animate-pulse">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* League general configuration */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-name" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Tên giải đấu</label>
                  <input
                    type="text"
                    id="form-league-name"
                    required
                    placeholder="Ví dụ: Futsal UIT Championship 2026"
                    value={newLeagueName}
                    onChange={(e) => setNewLeagueName(e.target.value)}
                    className="bg-stone-50 border border-stone-300 focus:border-orange-500 focus:bg-white rounded-xl text-xs py-2.5 px-3.5 transition-colors font-semibold"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-sport" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Bộ môn thi đấu</label>
                  <select
                    id="form-league-sport"
                    value={newLeagueSport}
                    onChange={(e) => setNewLeagueSport(e.target.value as SportType)}
                    className="bg-white border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 cursor-pointer font-semibold"
                  >
                    <option value="futsal">⚽ Futsal Football (Bóng đá trong nhà)</option>
                    <option value="pes">🎮 Đá PES eFootball (Điện tử đối kháng)</option>
                    <option value="pingpong">🏓 Bóng bàn (Đơn/Đôi)</option>
                    <option value="badminton">🏸 Cầu lông (Đơn/Đôi)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-format" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Thể thức giải đấu</label>
                  <select
                    id="form-league-format"
                    value={newLeagueFormat}
                    onChange={(e) => {
                      const fmt = e.target.value as FormatType;
                      setNewLeagueFormat(fmt);
                      // Auto adjust default team counts
                      if (fmt === 'group_knockout') {
                        setNumTeams(8);
                      } else if (fmt === 'knockout') {
                        setNumTeams(4);
                      } else {
                        setNumTeams(4);
                      }
                    }}
                    className="bg-white border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 cursor-pointer font-semibold"
                  >
                    <option value="round_robin">🔄 Vòng tròn tính điểm (Đá vòng tròn lượt đi)</option>
                    <option value="knockout">⚡ Loại trực tiếp (Knockout tranh cúp)</option>
                    <option value="group_knockout">⚜️ Chia bảng đấu + Loại trực tiếp (Group & Playoffs)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="form-league-teams-count" className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">Số đội tham gia</label>
                  <select
                    id="form-league-teams-count"
                    value={numTeams}
                    disabled={newLeagueFormat === 'group_knockout'} // fixed at 8
                    onChange={(e) => setNumTeams(parseInt(e.target.value))}
                    className="bg-white border border-stone-300 focus:border-orange-500 rounded-xl text-xs py-2.5 px-3.5 cursor-pointer font-semibold disabled:opacity-50"
                  >
                    {newLeagueFormat === 'knockout' ? (
                      <>
                        <option value="4">4 Đội (Từ Bán Kết)</option>
                        <option value="8">8 Đội (Từ Tứ Kết)</option>
                      </>
                    ) : newLeagueFormat === 'group_knockout' ? (
                      <option value="8">8 Đội (2 Bảng A & B)</option>
                    ) : (
                      <>
                        <option value="3">3 Đội</option>
                        <option value="4">4 Đội</option>
                        <option value="5">5 Đội</option>
                        <option value="6">6 Đội</option>
                        <option value="8">8 Đội</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Team list configuration */}
              <div className="md:col-span-2 flex flex-col gap-2.5">
                {/* AI Roster Importer */}
                <div className="bg-orange-50/40 border border-orange-150 rounded-xl p-4 flex flex-col gap-3 shadow-xs mb-2">
                  <div className="flex items-center gap-2 text-stone-800 font-bold text-xs border-b border-orange-200/50 pb-2">
                    <span className="p-1 bg-orange-100 text-orange-600 rounded-lg">🤖</span>
                    <span>AI Quick Import Assistant (Hỗ trợ nhập nhanh bằng AI)</span>
                  </div>

                  <p className="text-[11px] text-stone-600 font-medium leading-relaxed">
                    Dán tóm tắt đội hình giải đấu của bạn dưới đây. AI sẽ tự động phân tích số lượng đội, tên đội và danh sách cầu thủ tương ứng để điền vào form bên dưới tức thì!
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-stone-600 font-extrabold uppercase tracking-wider">Văn bản tóm tắt đội hình & cầu thủ</label>
                    <textarea
                      rows={5}
                      value={aiRosterText}
                      onChange={(e) => setAiRosterText(e.target.value)}
                      className="w-full bg-white border border-stone-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 rounded-lg p-2.5 text-xs font-semibold leading-relaxed text-stone-800 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAiRosterText(SAMPLE_ROSTER_SUMMARY);
                        setAiSuccessMessage('📋 Đã điền bản tóm tắt mẫu vào khung nhập liệu! Hãy nhấn nút "Phân tích bằng AI" bên cạnh.');
                        playRetroBeep(520, 'sine', 0.05);
                      }}
                      className="bg-orange-100 hover:bg-orange-200 text-orange-800 text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer"
                    >
                      📋 Dùng bản tóm tắt mẫu
                    </button>

                    <button
                      type="button"
                      disabled={isAiLoading}
                      onClick={handleAiParse}
                      className="bg-stone-800 hover:bg-stone-900 text-white text-[10px] font-bold py-1.5 px-4 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isAiLoading ? '⏳ Đang phân tích...' : '⚡ Phân tích bằng AI'}
                    </button>
                  </div>

                  {aiSuccessMessage && (
                    <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 p-2.5 rounded-lg text-[10px] font-bold leading-relaxed">
                      {aiSuccessMessage}
                    </div>
                  )}

                  {aiErrorMessage && (
                    <div className="bg-rose-50 text-rose-700 border border-rose-200 p-2.5 rounded-lg text-[10px] font-bold leading-relaxed">
                      ❌ {aiErrorMessage}
                    </div>
                  )}
                </div>

                <span className="text-xs font-extrabold text-stone-600 uppercase tracking-wider">
                  Điền tên các Đội bóng / Vận động viên & Danh sách cầu thủ ({numTeams} slots)
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[350px] overflow-y-auto p-2 border border-stone-200 rounded-xl bg-stone-50 shadow-inner">
                  {Array.from({ length: numTeams }).map((_, idx) => (
                    <div key={idx} className="flex flex-col gap-2 bg-white border border-stone-200 p-3 rounded-xl shadow-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full ${LOGO_COLORS[idx % LOGO_COLORS.length]} shrink-0`} />
                        <input
                          type="text"
                          required
                          placeholder={`Tên đội / VĐV thứ ${idx + 1}`}
                          value={teamNames[idx] || ''}
                          onChange={(e) => handleTeamNameChange(idx, e.target.value)}
                          className="flex-1 bg-transparent border-b border-stone-100 focus:border-orange-500 focus:outline-hidden p-0.5 text-xs font-bold text-stone-800"
                        />
                      </div>
                      
                      {newLeagueSport === 'futsal' && (
                        <div className="flex flex-col gap-1.5 pl-5.5">
                          <label className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Danh sách cầu thủ:</label>
                          
                          <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                            {(teamPlayers[idx] || []).map((player, pIdx) => (
                              <div key={pIdx} className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono text-stone-400 w-3 shrink-0">{pIdx + 1}.</span>
                                <input
                                  type="text"
                                  value={player}
                                  onChange={(e) => handlePlayerNameChange(idx, pIdx, e.target.value)}
                                  className="flex-1 bg-stone-50 border border-stone-200 focus:border-orange-400 focus:bg-white rounded-lg text-[10px] py-1 px-2 font-medium"
                                />
                                <button
                                  type="button"
                                  onClick={() => removePlayerField(idx, pIdx)}
                                  className="text-stone-400 hover:text-red-500 cursor-pointer p-0.5 shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addPlayerField(idx)}
                            className="mt-1 flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 py-1 px-2 rounded-lg self-start transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Thêm cầu thủ
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <p className="text-[10px] text-stone-400 mt-1">
                  💡 *Bấm "Thêm cầu thủ" dưới mỗi đội bóng để điền danh sách cầu thủ ra sân của đội đó!
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-stone-150 hover:bg-stone-200 text-stone-700 font-bold py-2 px-5 rounded-lg text-xs cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg text-xs cursor-pointer flex items-center gap-1 shadow"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Khởi Tạo & Lập Lịch
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. MAIN WORKSPACE CONTENT */}
      {selectedLeague ? (
        // LEAGUE WORKSPACE INTERFACE
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden animate-scaleIn">
          
          {/* League title dashboard header */}
          <div className="bg-stone-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-stone-800 rounded-xl text-2xl border border-stone-700">
                {SPORT_LABELS[selectedLeague.sport].icon}
              </div>
              <div>
                <button
                  onClick={() => setSelectedLeague(null)}
                  className="text-[10px] text-stone-400 hover:text-stone-200 underline cursor-pointer block mb-0.5"
                >
                  &larr; Quay lại danh sách giải
                </button>
                <h2 className="text-lg font-bold tracking-tight">{selectedLeague.name}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-300 mt-1">
                  <span>Môn: <b>{SPORT_LABELS[selectedLeague.sport].name}</b></span>
                  <span className="text-stone-600">|</span>
                  <span>Thể thức: <b>{FORMAT_LABELS[selectedLeague.format]}</b></span>
                  <span className="text-stone-600">|</span>
                  <span>Đội: <b>{selectedLeague.teams.length}</b></span>
                </div>
              </div>
            </div>

            {/* Status pill & Actions */}
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
                ${selectedLeague.status === 'ACTIVE' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 animate-pulse' 
                  : 'bg-stone-800 border-stone-700 text-stone-400'
                }
              `}>
                {selectedLeague.status === 'ACTIVE' ? 'Đang tranh tài' : 'Đã hạ màn'}
              </span>

              <button
                onClick={(e) => deleteLeague(selectedLeague.id, e)}
                className="p-2 bg-stone-800 hover:bg-red-900 border border-stone-700 rounded-lg text-stone-400 hover:text-white transition-all cursor-pointer"
                title="Xóa giải đấu"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation sub-tabs */}
          <div className="bg-stone-50 border-b border-stone-200 px-6 py-2 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveTab('schedule'); playRetroBeep(330, 'sine', 0.05); }}
                className={`py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer
                  ${activeTab === 'schedule' ? 'bg-orange-500 text-white' : 'text-stone-500 hover:text-stone-800'}
                `}
              >
                🗓️ Lịch Thi Đấu & Tỉ Số
              </button>
              
              {selectedLeague.format !== 'knockout' && (
                <button
                  onClick={() => { setActiveTab('standings'); playRetroBeep(330, 'sine', 0.05); }}
                  className={`py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer
                    ${activeTab === 'standings' ? 'bg-orange-500 text-white' : 'text-stone-500 hover:text-stone-800'}
                  `}
                >
                  📊 Bảng Xếp Hạng (Standings)
                </button>
              )}

              <button
                onClick={() => { setActiveTab('teams'); playRetroBeep(330, 'sine', 0.05); }}
                className={`py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer
                  ${activeTab === 'teams' ? 'bg-orange-500 text-white' : 'text-stone-500 hover:text-stone-800'}
                `}
              >
                🛡️ Danh Sách Các Đội
              </button>

              {selectedLeague.sport === 'futsal' && (
                <button
                  onClick={() => { setActiveTab('stats'); playRetroBeep(330, 'sine', 0.05); }}
                  className={`py-2 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer
                    ${activeTab === 'stats' ? 'bg-orange-500 text-white' : 'text-stone-500 hover:text-stone-800'}
                  `}
                >
                  🏆 Thống Kê Cá Nhân (Stats)
                </button>
              )}
            </div>
          </div>

          {/* TAB CONTENTS PANELS */}
          <div className="p-6 bg-white min-h-[400px]">
            
            {/* TAB A: MATCH SCHEDULE & RESULTS INPUT */}
            {activeTab === 'schedule' && (
              <div className="flex flex-col gap-6">
                
                {/* 1. ROUND ROBIN & GROUP STAGE SCHEDULE VISUALIZATION */}
                {['round_robin', 'group_knockout'].includes(selectedLeague.format) && (
                  <div className="flex flex-col gap-6">
                    {/* If Group Stage + Knockout, show split by stage */}
                    {Array.from(new Set(selectedLeague.matches.map(m => m.stage || 'Group Stage'))).map(stage => {
                      const stageMatches = selectedLeague.matches.filter(m => (m.stage || 'Group Stage') === stage);
                      
                      return (
                        <div key={stage} className="border border-stone-200 rounded-xl p-4 bg-stone-50/55">
                          <h3 className="text-xs font-extrabold uppercase text-orange-600 tracking-wider mb-4 flex items-center gap-1">
                            🔹 Giai Đoạn: {stage === 'Group Stage' ? 'Vòng Bảng (Group Stage)' : stage}
                          </h3>

                          {/* Group split if group stage */}
                          {stage === 'Group Stage' && selectedLeague.format === 'group_knockout' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Group A */}
                              <div className="bg-white p-4 border border-stone-200 rounded-xl">
                                <h4 className="text-xs font-bold text-blue-700 border-b border-stone-100 pb-2 mb-3">
                                  BẢNG A MATCHES
                                </h4>
                                <div className="flex flex-col gap-3">
                                  {stageMatches.filter(m => m.group === 'A').map(m => renderMatchCard(m))}
                                </div>
                              </div>

                              {/* Group B */}
                              <div className="bg-white p-4 border border-stone-200 rounded-xl">
                                <h4 className="text-xs font-bold text-red-700 border-b border-stone-100 pb-2 mb-3">
                                  BẢNG B MATCHES
                                </h4>
                                <div className="flex flex-col gap-3">
                                  {stageMatches.filter(m => m.group === 'B').map(m => renderMatchCard(m))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Pure simple list or playoffs
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {stageMatches.map(m => renderMatchCard(m))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. KNOCKOUT MATCHES TREE (Loại trực tiếp) */}
                {selectedLeague.format === 'knockout' && (
                  <div className="flex flex-col gap-8">
                    <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-500 border border-stone-200 max-w-xl">
                      💡 <b>Mẹo quản lý:</b> Nhấp chuột vào từng trận đấu để nhập tỉ số. Khi cập nhật xong, đội chiến thắng sẽ tự động được đưa vào nhánh đấu tiếp theo ở vòng trong!
                    </div>

                    <div className="flex flex-col lg:flex-row items-center justify-between gap-8 py-6 overflow-x-auto min-w-[600px] w-full">
                      {/* Round 1: Quarterfinals (if exists) */}
                      {selectedLeague.matches.some(m => m.stage === 'Quarterfinals') && (
                        <div className="flex flex-col gap-6 flex-1 min-w-[200px]">
                          <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-widest text-center border-b pb-1">Tứ Kết</span>
                          {selectedLeague.matches.filter(m => m.stage === 'Quarterfinals').map(m => renderKnockoutMatchCard(m))}
                        </div>
                      )}

                      {/* Line connector */}
                      {selectedLeague.matches.some(m => m.stage === 'Quarterfinals') && <ChevronRight className="text-stone-300 hidden lg:block" />}

                      {/* Round 2: Semifinals */}
                      <div className="flex flex-col gap-16 flex-1 min-w-[200px]">
                        <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-widest text-center border-b pb-1">Bán Kết</span>
                        {selectedLeague.matches.filter(m => m.stage === 'Semifinals').map(m => renderKnockoutMatchCard(m))}
                      </div>

                      {/* Line connector */}
                      <ChevronRight className="text-stone-300 hidden lg:block" />

                      {/* Round 3: Final */}
                      <div className="flex flex-col gap-6 flex-1 min-w-[200px] justify-center h-full">
                        <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-widest text-center border-b pb-1">Chung Kết</span>
                        {selectedLeague.matches.filter(m => m.stage === 'Final').map(m => (
                          <div key={m.id} className="flex flex-col gap-2">
                            {renderKnockoutMatchCard(m)}
                            {m.isPlayed && m.winner && m.winner !== 'DRAW' && (
                              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs font-semibold text-center flex flex-col items-center gap-1 animate-scaleIn">
                                <Trophy className="w-5 h-5 text-amber-500 fill-amber-200" />
                                <span>Nhà vô địch giải đấu:</span>
                                <span className="font-bold text-sm text-stone-800">{getTeamName(m.winner, selectedLeague.teams)}</span>
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

            {/* TAB B: STANDINGS (Bảng xếp hạng) */}
            {activeTab === 'standings' && selectedLeague.format !== 'knockout' && (
              <div className="flex flex-col gap-8 animate-fade-in">
                {selectedLeague.format === 'group_knockout' ? (
                  // GROUP STAGE SPLIT TABLES
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Group A table */}
                    <div className="flex flex-col gap-3">
                      <h3 className="text-sm font-bold text-blue-700 bg-blue-50/70 border border-blue-100 py-1.5 px-3.5 rounded-lg w-max">
                        BẢNG A
                      </h3>
                      {renderStandingsTable(computeStandings(selectedLeague.teams, selectedLeague.matches, 'A'))}
                    </div>

                    {/* Group B table */}
                    <div className="flex flex-col gap-3">
                      <h3 className="text-sm font-bold text-red-700 bg-red-50/70 border border-red-100 py-1.5 px-3.5 rounded-lg w-max">
                        BẢNG B
                      </h3>
                      {renderStandingsTable(computeStandings(selectedLeague.teams, selectedLeague.matches, 'B'))}
                    </div>
                  </div>
                ) : (
                  // SINGLE MAIN LEAGUE ROUND ROBIN STANDING
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-stone-800 bg-stone-100 py-1.5 px-3.5 rounded-lg w-max">
                      BẢNG XẾP HẠNG TỔNG SẮP
                    </h3>
                    {renderStandingsTable(computeStandings(selectedLeague.teams, selectedLeague.matches))}
                  </div>
                )}
                
                <div className="bg-stone-50 p-4 border border-stone-200 rounded-xl text-xs text-stone-500 max-w-2xl flex items-start gap-2 leading-relaxed">
                  <Info className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <b>Quy tắc xếp hạng:</b> Thắng +3 điểm, Hòa +1 điểm, Thua 0 điểm. 
                    Chỉ số phụ ưu tiên lần lượt là: <b>Hiệu số bàn thắng thua (GD)</b> &rarr; <b>Tổng số bàn thắng (GF)</b>.
                  </div>
                </div>
              </div>
            )}

            {/* TAB C: TEAMS DIRECTORY */}
            {activeTab === 'teams' && (() => {
              const currentTacticalTeamId = selectedTacticalTeamId || selectedLeague.teams[0]?.id || '';
              const currentTacticalTeam = selectedLeague.teams.find(t => t.id === currentTacticalTeamId) || selectedLeague.teams[0];

              const renderPlayerIcon = (index: number, roleName: string, roleCode: string) => {
                if (!currentTacticalTeam) return null;
                const pName = currentTacticalTeam.players && currentTacticalTeam.players[index] 
                  ? currentTacticalTeam.players[index] 
                  : `Cầu thủ #${index + 1}`;
                
                return (
                  <div className="flex flex-col items-center select-none group">
                    <div className={`w-9 h-9 rounded-full ${currentTacticalTeam.logoColor} border-2 border-white shadow-md flex items-center justify-center text-[9px] font-black text-white relative hover:scale-110 transition-transform cursor-help`}>
                      {roleCode}
                      <span className="absolute -top-1 -right-1 bg-white text-stone-800 text-[8px] font-bold px-1 py-0.2 rounded-full border border-stone-200 leading-none scale-90">
                        {index === 0 ? '1' : index === 1 ? '3' : index === 2 ? '7' : index === 3 ? '11' : '9'}
                      </span>
                    </div>
                    <div className="mt-1 bg-stone-900/95 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md text-center max-w-[85px] truncate shadow-sm border border-stone-700/60 leading-none">
                      {pName}
                    </div>
                    <div className="text-[7px] text-emerald-100 font-bold tracking-wide uppercase mt-0.5 bg-emerald-950/40 px-1 rounded-sm">
                      {roleName}
                    </div>
                  </div>
                );
              };

              return (
                <div className="flex flex-col gap-6 animate-fade-in">
                  {editingTeamPlayers && (
                    <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl max-w-md flex flex-col gap-3 shadow-xs">
                      <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                        <h4 className="text-xs font-black text-stone-800 uppercase">
                          Cập nhật đội hình: {getTeamName(editingTeamPlayers.teamId, selectedLeague.teams)}
                        </h4>
                        <button 
                          onClick={() => setEditingTeamPlayers(null)}
                          className="text-stone-400 hover:text-stone-700 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-stone-500 uppercase">Danh sách cầu thủ</label>
                        
                        <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                          {editingTeamPlayers.players.map((player, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-stone-400 w-4 shrink-0 text-right">{pIdx + 1}.</span>
                              <input
                                type="text"
                                value={player}
                                onChange={(e) => {
                                  const updatedP = [...editingTeamPlayers.players];
                                  updatedP[pIdx] = e.target.value;
                                  setEditingTeamPlayers({ ...editingTeamPlayers, players: updatedP });
                                }}
                                className="flex-1 bg-white border border-stone-200 focus:border-orange-500 p-1.5 rounded-lg text-xs font-bold text-stone-800"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedP = [...editingTeamPlayers.players];
                                  updatedP.splice(pIdx, 1);
                                  setEditingTeamPlayers({ ...editingTeamPlayers, players: updatedP });
                                }}
                                className="text-stone-400 hover:text-red-500 cursor-pointer p-1 shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingTeamPlayers({
                              ...editingTeamPlayers,
                              players: [...editingTeamPlayers.players, '']
                            });
                          }}
                          className="mt-1 flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 py-1.5 px-3 rounded-lg self-start transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm cầu thủ
                        </button>
                      </div>
                      
                      <div className="flex justify-end gap-2 text-xs border-t border-stone-100 pt-3">
                        <button
                          onClick={() => setEditingTeamPlayers(null)}
                          className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={saveTeamPlayers}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" /> Lưu Đội Hình
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={`grid grid-cols-1 ${selectedLeague.sport === 'futsal' ? 'lg:grid-cols-12' : 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'} gap-6 items-start`}>
                    {/* LEFT COLUMN: TEAM DIRECTORY */}
                    <div className={`${selectedLeague.sport === 'futsal' ? 'lg:col-span-7' : 'col-span-full'} flex flex-col gap-4`}>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-xs font-black uppercase text-stone-400 tracking-wider">Danh sách các đội bóng</h3>
                        {selectedLeague.sport === 'futsal' && (
                          <p className="text-[11px] text-stone-500 leading-relaxed">
                            💡 Click vào một đội bóng bất kỳ dưới đây để hiển thị mô phỏng sơ đồ chiến thuật 1-2-1 ra sân tương ứng ngay bên cạnh!
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedLeague.teams.map((team, idx) => {
                          const isSelected = team.id === currentTacticalTeamId;
                          return (
                            <div 
                              key={team.id} 
                              onClick={() => {
                                if (selectedLeague.sport === 'futsal') {
                                  setSelectedTacticalTeamId(team.id);
                                  playRetroBeep(523, 'sine', 0.05);
                                }
                              }}
                              className={`border p-4 rounded-2xl shadow-3xs bg-white flex flex-col gap-3 justify-between transition-all relative
                                ${selectedLeague.sport === 'futsal' ? 'cursor-pointer hover:border-orange-300 hover:shadow-xs' : ''}
                                ${isSelected ? 'border-orange-500 ring-2 ring-orange-500/10 shadow-xs' : 'border-stone-200'}
                              `}
                            >
                              {isSelected && selectedLeague.sport === 'futsal' && (
                                <span className="absolute top-3 right-3 bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                  Đang xem sơ đồ ⚽
                                </span>
                              )}
                              
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full ${team.logoColor} text-white flex items-center justify-center font-bold text-base shadow-xs uppercase font-serif shrink-0`}>
                                  {team.name.substring(0, 2)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-xs font-bold text-stone-800 tracking-tight truncate leading-tight">{team.name}</h4>
                                  <span className="text-[10px] text-stone-400 font-mono block">Đội hình #{idx + 1}</span>
                                </div>
                              </div>

                              {selectedLeague.sport === 'futsal' && (
                                <div className="bg-stone-50/50 p-2.5 rounded-xl border border-stone-150 flex flex-col gap-1.5 mt-2">
                                  <span className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Danh sách cầu thủ ({team.players?.length || 0}):</span>
                                  {team.players && team.players.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                      {team.players.map(p => (
                                        <span key={p} className="text-[9px] font-bold bg-white border border-stone-200/60 text-stone-700 px-1.5 py-0.5 rounded-sm">
                                          {p}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[9px] text-stone-400 italic">Chưa nhập danh sách cầu thủ</span>
                                  )}
                                  
                                  {hasPermission && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation(); // prevent setting tactical team while opening editor
                                        setEditingTeamPlayers({
                                          teamId: team.id,
                                          players: team.players ? [...team.players] : []
                                        });
                                        playRetroBeep(440, 'sine', 0.05);
                                      }}
                                      className="mt-1.5 text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer w-max self-end"
                                    >
                                      Sửa đội hình &rarr;
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: FUTSAL TACTICAL COURT MOCKUP */}
                    {selectedLeague.sport === 'futsal' && currentTacticalTeam && (
                      <div className="lg:col-span-5 bg-white border border-stone-200 rounded-3xl p-5 shadow-xs flex flex-col gap-4">
                        <div className="border-b border-stone-100 pb-3">
                          <h3 className="text-xs font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
                            <span>📋</span> Sơ Đồ Ra Sân Futsal (Y-FORMATION)
                          </h3>
                          <p className="text-[11px] text-stone-400 font-medium mt-0.5">
                            Chiến thuật 1-2-1 của đội: <strong className="text-orange-600 font-bold">{currentTacticalTeam.name}</strong>
                          </p>
                        </div>

                        {/* Futsal Court Visualization */}
                        <div className="relative w-full aspect-[4/5] max-w-[340px] mx-auto bg-emerald-700 border-4 border-white rounded-3xl overflow-hidden shadow-lg flex flex-col justify-between">
                          {/* Grass Stripes Pattern */}
                          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between opacity-15 z-0">
                            {Array.from({ length: 10 }).map((_, i) => (
                              <div key={i} className={`h-[10%] w-full ${i % 2 === 0 ? 'bg-emerald-800' : 'bg-transparent'}`} />
                            ))}
                          </div>

                          {/* Field Markings */}
                          {/* Halfway line */}
                          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/50 -translate-y-1/2 z-0" />
                          
                          {/* Center Circle */}
                          <div className="absolute top-1/2 left-1/2 w-20 h-20 border-2 border-white/50 rounded-full -translate-x-1/2 -translate-y-1/2 z-0" />
                          <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 z-0" />
                          
                          {/* Penalty Area Top */}
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-44 h-18 border-b-2 border-x-2 border-white/50 rounded-b-full z-0" />
                          <div className="absolute top-12 left-1/2 w-1.5 h-1.5 bg-white rounded-full -translate-x-1/2 z-0" /> {/* Penalty Spot Top */}
                          
                          {/* Penalty Area Bottom */}
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-44 h-18 border-t-2 border-x-2 border-white/50 rounded-t-full z-0" />
                          <div className="absolute bottom-12 left-1/2 w-1.5 h-1.5 bg-white rounded-full -translate-x-1/2 z-0" /> {/* Penalty Spot Bottom */}

                          {/* Goals */}
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-16 h-1 bg-stone-800 border-x-2 border-b border-white z-10" />
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-16 h-1 bg-stone-800 border-x-2 border-t border-white z-10" />

                          {/* RENDER THE 5 STARTING PLAYERS IN Y-FORMATION (1-2-1) */}
                          <div className="absolute inset-0 p-4 flex flex-col justify-between z-10">
                            {/* Row 1: Pivot (Tiền đạo) - Top Center */}
                            <div className="flex justify-center mt-3">
                              {renderPlayerIcon(4, 'Tiền Đạo (Pivot)', 'FW')}
                            </div>

                            {/* Row 2: Wingers (Ala Trái & Ala Phải) - Left & Right Middle */}
                            <div className="flex justify-between px-2">
                              {renderPlayerIcon(2, 'Ala Trái', 'AL')}
                              {renderPlayerIcon(3, 'Ala Phải', 'AR')}
                            </div>

                            {/* Row 3: Defender (Fixo) - Bottom Center */}
                            <div className="flex justify-center mb-1">
                              {renderPlayerIcon(1, 'Hậu Vệ (Fixo)', 'DF')}
                            </div>

                            {/* Row 4: Goalkeeper (Thủ môn) - Deep Bottom Center */}
                            <div className="flex justify-center mb-1">
                              {renderPlayerIcon(0, 'Thủ Môn', 'GK')}
                            </div>
                          </div>
                        </div>

                        {/* Reserve players list below court */}
                        <div className="flex flex-col gap-1.5 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                          <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider flex items-center gap-1">
                            <span>📋</span> Đội dự bị (Reserves)
                          </span>
                          {currentTacticalTeam.players && currentTacticalTeam.players.length > 5 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto mt-1">
                              {currentTacticalTeam.players.slice(5).map((p, pIdx) => (
                                <span key={pIdx} className="text-[9px] font-extrabold bg-white border border-stone-200/60 text-stone-700 px-2.5 py-1 rounded-md shadow-3xs flex items-center gap-1">
                                  <span className="text-stone-400">🏃‍♂️</span> {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-400 italic">Không có cầu thủ dự bị (Đội hình tối thiểu 5 người)</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* TAB D: FUTSAL STATS (Vua pha luoi, Vua the do) */}
            {activeTab === 'stats' && selectedLeague.sport === 'futsal' && (() => {
              const { scorers, redCards, yellowCards } = computeFutsalStats();
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                  {/* BẢNG VUA PHÁ LƯỚI */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-widest text-orange-600 border-b border-stone-100 pb-3 flex items-center gap-2">
                      <span>⚽</span> Vua Phá Lưới (Top Scorers)
                    </h3>
                    
                    {scorers.length > 0 ? (
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-stone-100 text-[10px] text-stone-400 font-extrabold uppercase">
                              <th className="pb-2 w-12 text-center">Hạng</th>
                              <th className="pb-2">Cầu thủ</th>
                              <th className="pb-2">Đội bóng</th>
                              <th className="pb-2 text-right">Bàn thắng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50">
                            {scorers.map((st, index) => (
                              <tr key={index} className="text-xs hover:bg-stone-50/50 transition-colors">
                                <td className="py-2.5 font-bold text-stone-400 text-center">
                                  {index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                                </td>
                                <td className="py-2.5 font-black text-stone-800">{st.playerName}</td>
                                <td className="py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${getTeamColor(st.teamId, selectedLeague.teams)}`} />
                                    <span className="text-stone-600 font-medium">{getTeamName(st.teamId, selectedLeague.teams)}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 font-mono font-black text-orange-600 text-right text-sm">{st.goals}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-stone-400 text-xs italic">
                        Chưa có bàn thắng nào được ghi
                      </div>
                    )}
                  </div>

                  {/* BẢNG THẺ PHẠT */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col gap-6">
                    {/* BẢNG THẺ ĐỎ */}
                    <div className="flex flex-col gap-4">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-red-600 border-b border-stone-100 pb-3 flex items-center gap-2">
                        <span className="inline-block w-3 h-4 bg-red-500 rounded-xs" /> Vua Thẻ Đỏ (Top Red Cards)
                      </h3>
                      
                      {redCards.length > 0 ? (
                        <div className="overflow-x-auto max-h-[220px]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-stone-100 text-[10px] text-stone-400 font-extrabold uppercase">
                                <th className="pb-2 w-12 text-center">Hạng</th>
                                <th className="pb-2">Cầu thủ</th>
                                <th className="pb-2">Đội bóng</th>
                                <th className="pb-2 text-right">Thẻ đỏ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                              {redCards.map((st, index) => (
                                <tr key={index} className="text-xs hover:bg-stone-50/50 transition-colors">
                                  <td className="py-2.5 font-bold text-stone-400 text-center">{index + 1}</td>
                                  <td className="py-2.5 font-black text-stone-800">{st.playerName}</td>
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${getTeamColor(st.teamId, selectedLeague.teams)}`} />
                                      <span className="text-stone-600 font-medium">{getTeamName(st.teamId, selectedLeague.teams)}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 font-mono font-black text-red-600 text-right text-sm">🟥 {st.redCards}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-stone-400 text-xs italic">
                          Chưa có thẻ đỏ nào
                        </div>
                      )}
                    </div>

                    {/* BẢNG THẺ VÀNG */}
                    <div className="flex flex-col gap-4 border-t border-stone-100 pt-5">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-500 border-b border-stone-100 pb-3 flex items-center gap-2">
                        <span className="inline-block w-3 h-4 bg-amber-400 rounded-xs" /> Vua Thẻ Vàng (Top Yellow Cards)
                      </h3>
                      
                      {yellowCards.length > 0 ? (
                        <div className="overflow-x-auto max-h-[220px]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-stone-100 text-[10px] text-stone-400 font-extrabold uppercase">
                                <th className="pb-2 w-12 text-center">Hạng</th>
                                <th className="pb-2">Cầu thủ</th>
                                <th className="pb-2">Đội bóng</th>
                                <th className="pb-2 text-right">Thẻ vàng</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                              {yellowCards.map((st, index) => (
                                <tr key={index} className="text-xs hover:bg-stone-50/50 transition-colors">
                                  <td className="py-2.5 font-bold text-stone-400 text-center">{index + 1}</td>
                                  <td className="py-2.5 font-black text-stone-800">{st.playerName}</td>
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${getTeamColor(st.teamId, selectedLeague.teams)}`} />
                                      <span className="text-stone-600 font-medium">{getTeamName(st.teamId, selectedLeague.teams)}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 font-mono font-black text-amber-600 text-right text-sm">🟨 {st.yellowCards}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-stone-400 text-xs italic">
                          Chưa có thẻ vàng nào
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        // LIST OF ALL ACTIVE/PAST LEAGUES
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 animate-fade-in">

          {/* Sidebar Area: Quick-start and Permission Management */}
          <div className="md:col-span-1 flex flex-col gap-6">
            
            {/* 1. Quick Start Guide */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-stone-400 border-b border-stone-200/60 pb-2 flex items-center gap-1">
                <span>💡</span> Hướng Dẫn Nhanh
              </h3>
              
              <div className="flex flex-col gap-2.5 text-xs text-stone-600 leading-relaxed">
                <p>Mô phỏng <b>Quản lý Giải Đấu Thể Thao</b> giúp lập lịch thi đấu vòng tròn hoặc knockout tự động.</p>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px]">
                  <li>Lập lịch thi đấu tự động.</li>
                  <li>Tự động tính điểm xếp hạng & hiệu số.</li>
                  <li>Phân nhánh Playoffs loại trực tiếp trực quan.</li>
                </ul>
              </div>

              {hasPermission && (
                <button
                  onClick={() => { setShowCreateForm(true); playRetroBeep(523, 'sine', 0.1); }}
                  className="mt-2 bg-stone-900 hover:bg-stone-800 text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1 shadow-xs transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Tạo Giải Đấu Ngay
                </button>
              )}
            </div>

            {/* 2. Permission Management Panel */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
              <div className="border-b border-stone-100 pb-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-stone-800 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-orange-500 fill-orange-50" />
                  <span>Quản lý Quyền Truy Cập</span>
                </h3>
                <p className="text-[10px] text-stone-400 mt-1 leading-tight">Cấp hoặc thu hồi quyền truy cập danh sách giải đấu của các tài khoản thử nghiệm.</p>
              </div>

              <div className="flex flex-col gap-2.5">
                {[
                  { id: 'user_a', name: 'Kỳ thủ Sơn' },
                  { id: 'user_b', name: 'Kỳ thủ Thủy' },
                  { id: 'user_c', name: 'Kỳ thủ Long' }
                ].map(acc => {
                  const isCurrent = acc.id === userId;
                  const finalName = getDisplayNameForTesting(acc.id, acc.name);
                  const isAllowed = permissions[acc.id] === true;
                  
                  return (
                    <div 
                      key={acc.id} 
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200
                        ${isCurrent ? 'bg-orange-50/40 border-orange-200' : 'bg-stone-50/50 border-stone-100'}
                      `}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderTestingAvatar(acc.id, acc.name)}
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-stone-800 truncate flex items-center gap-1.5">
                            {finalName}
                            {isCurrent && (
                              <span className="text-[9px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full uppercase scale-90 whitespace-nowrap">bạn</span>
                            )}
                          </span>
                          <span className="text-[9px] text-stone-400 font-mono flex items-center gap-1 mt-0.5">
                            {isAllowed ? (
                              <span className="text-emerald-600 font-bold flex items-center gap-0.5"><Unlock className="w-2.5 h-2.5" /> Có quyền</span>
                            ) : (
                              <span className="text-stone-400 font-bold flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Bị khóa</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* iOS-Style Toggle Slider */}
                      <button
                        onClick={() => handleTogglePermission(acc.id)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden
                          ${isAllowed ? 'bg-emerald-500' : 'bg-stone-300'}
                        `}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out
                            ${isAllowed ? 'translate-x-4' : 'translate-x-0'}
                          `}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="bg-stone-50 border border-stone-150 p-2.5 rounded-xl text-[10px] text-stone-500 leading-normal">
                💡 <b>Mẹo thử nghiệm:</b> Bạn có thể chuyển đổi tài khoản bằng menu góc phải trên thanh tiêu đề chính, rồi quay lại đây để xem quyền hoạt động của từng người!
              </div>
            </div>

          </div>

          {/* Main Content Area: Conditional League List or Lock screen */}
          <div className="md:col-span-2 flex flex-col gap-4">
            {hasPermission ? (
              // USER HAS PERMISSION -> SHOW LEAGUES LIST
              <>
                <h3 className="text-sm font-bold text-stone-800 border-b border-stone-200 pb-2 flex items-center justify-between">
                  <span>Các Giải Đấu Đang Hoạt Động ({leagues.length})</span>
                  <span className="text-xs text-stone-400 font-mono font-medium">Bảo mật bởi Hệ thống Phân quyền</span>
                </h3>

                {leagues.length === 0 ? (
                  <div className="text-center py-16 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50 animate-scaleIn">
                    <Trophy className="w-12 h-12 text-stone-300 mx-auto" />
                    <span className="text-xs font-bold text-stone-500 block mt-3">Chưa có giải đấu nào được lưu!</span>
                    <span className="text-[10px] text-stone-400 block mt-1">Hãy nhấp nút "Tổ Chức Giải Đấu Mới" phía trên để bắt đầu tổ chức giải đấu đầu tiên.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {leagues.map(league => (
                      <div
                        key={league.id}
                        onClick={() => { setSelectedLeague(league); playRetroBeep(440, 'sine', 0.05); }}
                        className="bg-white border border-stone-200 hover:border-orange-300 p-5 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-stone-100 text-2xl flex items-center justify-center rounded-xl border border-stone-200 group-hover:bg-orange-50 group-hover:border-orange-200 transition-colors">
                            {SPORT_LABELS[league.sport].icon}
                          </div>

                          <div>
                            <h4 className="font-extrabold text-stone-800 group-hover:text-orange-500 transition-colors text-xs sm:text-sm">
                              {league.name}
                            </h4>
                            
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-stone-400 font-mono mt-1">
                              <span className="text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded uppercase">{SPORT_LABELS[league.sport].name}</span>
                              <span>&bull;</span>
                              <span>{FORMAT_LABELS[league.format]}</span>
                              <span>&bull;</span>
                              <span className="text-orange-600">{league.teams.length} Đội</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                            ${league.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 animate-pulse' : 'bg-stone-150 text-stone-600'}
                          `}>
                            {league.status === 'ACTIVE' ? 'Kịch Chiến' : 'Hạ Màn'}
                          </span>

                          <button
                            onClick={(e) => deleteLeague(league.id, e)}
                            className="text-stone-400 hover:text-red-500 p-1.5 hover:bg-stone-50 rounded-lg cursor-pointer transition-colors"
                            title="Xóa giải đấu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // USER DOES NOT HAVE PERMISSION -> SHOW LOCK COMPONENT
              <div className="flex flex-col items-center justify-center py-16 px-6 border border-red-100 rounded-3xl bg-red-50/10 text-center animate-scaleIn shadow-xs">
                <div className="w-16 h-16 bg-red-50 border border-red-100 flex items-center justify-center rounded-2xl shadow-sm text-red-500 mb-5 relative">
                  <Lock className="w-7 h-7" />
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white"></span>
                  </span>
                </div>
                
                <h3 className="text-sm font-black text-stone-800 uppercase tracking-widest mb-2">
                  Quyền Truy Cập Bị Hạn Chế
                </h3>
                
                <p className="text-xs text-stone-500 max-w-sm mb-6 leading-relaxed">
                  Tài khoản hiện tại của bạn (<span className="font-bold text-stone-700">{getDisplayNameForTesting(userId, 'Tài khoản ẩn danh')}</span>) 
                  chưa được cấp quyền truy cập danh sách giải đấu thể thao này.
                </p>

                <div className="bg-white border border-stone-200 p-4 rounded-xl max-w-md text-left shadow-xs flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-[11px] font-bold text-stone-800 uppercase tracking-wider mb-1">Hướng Dẫn Kiểm Thử</h5>
                    <p className="text-[10px] text-stone-500 leading-normal">
                      Hãy bật cần gạt bên cạnh phần tên của bạn trên bảng <b>"Quản lý Quyền truy cập"</b> bên trái để cấp quyền và mở khóa danh sách giải đấu ngay lập tức!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MODAL: EDIT/UPDATE MATCH SCORE */}
      {editingMatch && selectedLeague && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`bg-white border border-stone-200 shadow-2xl rounded-2xl w-full p-6 animate-scaleIn transition-all ${selectedLeague.sport === 'futsal' ? 'max-w-lg' : 'max-w-md'}`}>
            <div className="flex justify-between items-center border-b border-stone-100 pb-3 mb-4">
              <h3 className="text-sm font-black text-stone-800 uppercase tracking-wide">
                Cập nhật kết quả thi đấu
              </h3>
              <button 
                onClick={() => setEditingMatch(null)} 
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[10px] text-stone-400 font-bold mb-4 uppercase tracking-wider">
              {editingMatch.stage === 'Group Stage' ? `VÒNG BẢNG - ROUND ${editingMatch.round}` : `${editingMatch.stage || 'PLAYOFFS'}`}
            </p>

            {/* Versus Scores inputs */}
            <div className="flex items-center justify-between gap-4 py-4 px-2 bg-stone-50 rounded-2xl border border-stone-200">
              {/* Home Team */}
              <div className="flex flex-col items-center gap-2 flex-1 text-center">
                <div className={`w-8 h-8 rounded-full ${getTeamColor(editingMatch.home, selectedLeague.teams)} text-white flex items-center justify-center font-bold text-xs uppercase shadow-inner`}>
                  {getTeamName(editingMatch.home, selectedLeague.teams).substring(0, 2)}
                </div>
                <span className="text-xs font-bold text-stone-700 line-clamp-1">
                  {getTeamName(editingMatch.home, selectedLeague.teams)}
                </span>
                <input
                  type="number"
                  min="0"
                  required
                  id="score-input-home"
                  placeholder="0"
                  value={editHomeScore}
                  onChange={(e) => setEditHomeScore(e.target.value)}
                  className="w-16 bg-white border-2 border-stone-200 focus:border-orange-500 text-center font-mono font-extrabold text-lg py-1 rounded-lg"
                />
              </div>

              {/* VS Divider */}
              <span className="font-bold text-stone-400 italic text-sm">VS</span>

              {/* Away Team */}
              <div className="flex flex-col items-center gap-2 flex-1 text-center">
                <div className={`w-8 h-8 rounded-full ${getTeamColor(editingMatch.away, selectedLeague.teams)} text-white flex items-center justify-center font-bold text-xs uppercase shadow-inner`}>
                  {getTeamName(editingMatch.away, selectedLeague.teams).substring(0, 2)}
                </div>
                <span className="text-xs font-bold text-stone-700 line-clamp-1">
                  {getTeamName(editingMatch.away, selectedLeague.teams)}
                </span>
                <input
                  type="number"
                  min="0"
                  required
                  id="score-input-away"
                  placeholder="0"
                  value={editAwayScore}
                  onChange={(e) => setEditAwayScore(e.target.value)}
                  className="w-16 bg-white border-2 border-stone-200 focus:border-orange-500 text-center font-mono font-extrabold text-lg py-1 rounded-lg"
                />
              </div>
            </div>

            {/* Futsal match events form */}
            {selectedLeague.sport === 'futsal' && (
              <div className="mt-5 pt-4 border-t border-stone-100 flex flex-col gap-3">
                <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5 uppercase tracking-wide">
                  <span>⚽</span> Diễn biến & Sự kiện Futsal
                </h4>

                {/* AI summary -> prefill events panel */}
                <div id="ai_summary_panel" className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3 flex flex-col gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-orange-700">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI tóm tắt diễn biến (chỉ điền, không tự lưu)</span>
                  </div>
                  <textarea
                    id="ai_summary_textarea"
                    value={aiSummaryText}
                    onChange={(e) => setAiSummaryText(e.target.value)}
                    placeholder={'Ví dụ: Phút 12 Hoàng ghi bàn mở tỉ số cho Hà Nội. Phút 30 Duy nhận thẻ vàng. Phút 35 Long gỡ hoà 1-1...'}
                    rows={3}
                    disabled={isAiEventLoading}
                    className="w-full bg-white border border-orange-200 rounded-lg text-xs p-2 focus:outline-hidden focus:border-orange-500 resize-y min-h-[70px] disabled:bg-stone-100"
                  />
                  {aiEventPreview === null ? (
                    <button
                      id="btn_ai_event_preview"
                      type="button"
                      onClick={handleAiPrefillEvents}
                      disabled={isAiEventLoading || !aiSummaryText.trim()}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                    >
                      {isAiEventLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Đang tách...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          AI điền sự kiện
                        </>
                      )}
                    </button>
                  ) : (
                    <div id="ai_event_preview_list" className="flex flex-col gap-2 p-2 bg-white border border-orange-200 rounded-lg">
                      <p className="text-[10px] font-bold text-stone-700 uppercase tracking-wider">
                        Xem trước: {aiEventPreview.length} sự kiện nhận diện được
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {aiEventPreview.map((ev, i) => {
                          const teamLabel = ev.teamSide === 'home' ? 'Nhà' : ev.teamSide === 'away' ? 'Khách' : '?';
                          const icon = ev.type === 'goal' ? '⚽' : ev.type === 'yellow' ? '🟨' : '🟥';
                          return (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-md text-[10px] font-bold text-stone-700">
                              <span>{icon}</span>
                              {ev.minute ? `${ev.minute}'` : '-'}
                              <span className="text-stone-400">·</span>
                              {ev.playerName || '(không rõ)'}
                              <span className="text-stone-400">·</span>
                              <span className="text-orange-600">{teamLabel}</span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          id="btn_ai_event_apply"
                          type="button"
                          onClick={handleAiApplyEvents}
                          disabled={isAiEventLoading}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Điền vào danh sách
                        </button>
                        <button
                          id="btn_ai_event_cancel"
                          type="button"
                          onClick={handleAiCancelEvents}
                          disabled={isAiEventLoading}
                          className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-lg text-[11px] cursor-pointer disabled:opacity-50"
                        >
                          Hủy
                        </button>
                      </div>
                      <p className="text-[10px] text-stone-500 italic">
                        Sau khi điền, bấm "Lưu kết quả" bên dưới để hoàn tất.
                      </p>
                    </div>
                  )}
                </div>

                {/* List of current events */}
                {editingMatchEvents.length > 0 ? (
                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                    {editingMatchEvents.map((ev, index) => {
                      const isHome = ev.teamId === editingMatch.home;
                      return (
                        <div key={index} className="flex items-center justify-between text-xs py-1 px-2 bg-white rounded-md border border-stone-100 shadow-3xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-stone-400">
                              {ev.minute ? `${ev.minute}'` : '--'}
                            </span>
                            {ev.type === 'goal' && <span title="Bàn thắng">⚽</span>}
                            {ev.type === 'yellow' && <span className="inline-block w-2 h-3 bg-amber-400 rounded-2xs" title="Thẻ vàng" />}
                            {ev.type === 'red' && <span className="inline-block w-2 h-3 bg-red-500 rounded-2xs" title="Thẻ đỏ" />}
                            <span className="font-bold text-stone-800">{ev.playerName}</span>
                            <span className="text-[10px] text-stone-400">
                              ({isHome ? 'Nhà' : 'Khách'})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMatchEvents(editingMatchEvents.filter((_, idx) => idx !== index));
                              playRetroBeep(300, 'sawtooth', 0.05);
                            }}
                            className="text-stone-400 hover:text-red-500 cursor-pointer p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-400 italic text-center py-2 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                    Chưa ghi nhận sự kiện nào (bàn thắng, thẻ phạt)
                  </p>
                )}

                {/* Form to add a new event */}
                <div className="bg-stone-50/50 p-3 rounded-xl border border-stone-200 flex flex-col gap-2.5">
                  <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider">Thêm sự kiện mới</span>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Team selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-500 font-bold">Đội bóng</label>
                      <select
                        value={newEventTeamId}
                        onChange={(e) => {
                          setNewEventTeamId(e.target.value);
                          setNewEventPlayerName('');
                          setIsCustomPlayer(false);
                        }}
                        className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold"
                      >
                        <option value={editingMatch.home}>{getTeamName(editingMatch.home, selectedLeague.teams)} (Nhà)</option>
                        <option value={editingMatch.away}>{getTeamName(editingMatch.away, selectedLeague.teams)} (Khách)</option>
                      </select>
                    </div>

                    {/* Event Type selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-500 font-bold">Loại sự kiện</label>
                      <select
                        value={newEventType}
                        onChange={(e) => setNewEventType(e.target.value as 'goal' | 'yellow' | 'red')}
                        className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold"
                      >
                        <option value="goal">⚽ Bàn thắng</option>
                        <option value="yellow">🟨 Thẻ vàng</option>
                        <option value="red">🟥 Thẻ đỏ</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end">
                    {/* Player Name */}
                    <div className="col-span-2 flex flex-col gap-1">
                      <label className="text-[10px] text-stone-500 font-bold">Cầu thủ thực hiện</label>
                      {!isCustomPlayer ? (
                        <select
                          value={newEventPlayerName}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setIsCustomPlayer(true);
                              setNewEventPlayerName('');
                            } else {
                              setNewEventPlayerName(val);
                            }
                          }}
                          className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold focus:border-orange-500 focus:outline-hidden cursor-pointer"
                        >
                          <option value="">-- Chọn cầu thủ --</option>
                          {(() => {
                            const activeTeam = selectedLeague.teams.find(t => t.id === newEventTeamId);
                            return (activeTeam?.players || []).map(p => (
                              <option key={p} value={p}>{p}</option>
                            ));
                          })()}
                          <option value="__custom__">✍️ Tự nhập tên khác...</option>
                        </select>
                      ) : (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={newEventPlayerName}
                            onChange={(e) => setNewEventPlayerName(e.target.value)}
                            placeholder="Nhập tên cầu thủ"
                            className="flex-1 bg-white border border-stone-200 rounded-lg text-xs p-1.5 font-bold focus:border-orange-500 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomPlayer(false);
                              setNewEventPlayerName('');
                            }}
                            className="bg-stone-150 hover:bg-stone-200 text-stone-600 px-2.5 py-1.5 rounded-lg text-[9px] font-bold border border-stone-250 shrink-0 cursor-pointer"
                            title="Quay lại danh sách"
                          >
                            Hủy
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Minute */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-stone-500 font-bold">Phút (1-40)</label>
                      <input
                        type="number"
                        min="1"
                        max="40"
                        value={newEventMinute}
                        onChange={(e) => setNewEventMinute(e.target.value)}
                        placeholder="--"
                        className="bg-white border border-stone-200 rounded-lg text-xs p-1.5 text-center font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Add Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!newEventPlayerName.trim()) {
                        alert('Vui lòng nhập hoặc chọn tên cầu thủ!');
                        return;
                      }
                      const min = newEventMinute ? parseInt(newEventMinute) : undefined;
                      const newEv: MatchEvent = {
                        type: newEventType,
                        teamId: newEventTeamId,
                        playerName: newEventPlayerName.trim(),
                        minute: min
                      };
                      
                      // Auto update scores if it's a Goal! This makes it incredibly easy for them.
                      if (newEventType === 'goal') {
                        if (newEventTeamId === editingMatch.home) {
                          setEditHomeScore(prev => String(parseInt(prev || '0') + 1));
                        } else {
                          setEditAwayScore(prev => String(parseInt(prev || '0') + 1));
                        }
                      }

                      setEditingMatchEvents(prev => [...prev, newEv].sort((a, b) => (a.minute || 0) - (b.minute || 0)));
                      setNewEventPlayerName('');
                      setNewEventMinute('');
                      setIsCustomPlayer(false);
                      playRetroBeep(600, 'sine', 0.05);
                    }}
                    className="w-full bg-stone-800 hover:bg-stone-900 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer text-center"
                  >
                    + Thêm vào diễn biến trận đấu
                  </button>
                </div>
              </div>
            )}

            {/* Control buttons */}
            <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-stone-100">
              <button
                type="button"
                id="random-match-score-btn"
                onClick={handleRandomizeScore}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shadow-xs hover:shadow-sm"
              >
                <Dices className="w-3.5 h-3.5" /> Giả lập Ngẫu nhiên
              </button>
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-2 px-4 rounded-lg text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                id="save-match-score-btn"
                onClick={saveMatchScore}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-5 rounded-lg text-xs cursor-pointer flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Ghi Nhận Kết Quả
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // LOCAL RENDERING HELPERS FOR MATCHES & STANDINGS TO AVOID CODE CUTOFFS
  function renderMatchCard(match: LeagueMatch) {
    if (!selectedLeague) return null;
    const isEditingAllowed = selectedLeague.status === 'ACTIVE';

    return (
      <div 
        key={match.id}
        onClick={() => isEditingAllowed && startEditScore(match)}
        className={`p-3.5 border rounded-xl flex flex-col text-xs transition-all bg-white hover:scale-[1.01]
          ${isEditingAllowed ? 'cursor-pointer hover:border-orange-300 hover:shadow-xs' : ''}
          ${match.isPlayed ? 'border-stone-150 bg-stone-50/20' : 'border-stone-200 shadow-2xs'}
        `}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 w-[80%]">
            <span className="font-mono text-[9px] text-stone-400 font-extrabold bg-stone-100 px-1.5 py-0.5 rounded">
              R{match.round}
            </span>
            
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {/* Home team row */}
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${getTeamColor(match.home, selectedLeague.teams)}`} />
                <span className={`font-semibold text-stone-800 truncate ${match.isPlayed && match.homeScore! < match.awayScore! ? 'opacity-55' : ''}`}>
                  {getTeamName(match.home, selectedLeague.teams)}
                </span>
                {renderTeamCardsSummary(match, match.home)}
              </div>
              {/* Away team row */}
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${getTeamColor(match.away, selectedLeague.teams)}`} />
                <span className={`font-semibold text-stone-800 truncate ${match.isPlayed && match.awayScore! < match.homeScore! ? 'opacity-55' : ''}`}>
                  {getTeamName(match.away, selectedLeague.teams)}
                </span>
                {renderTeamCardsSummary(match, match.away)}
              </div>
            </div>
          </div>

          {/* Scores rendering */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 font-mono font-extrabold text-sm w-12 text-center">
            {match.isPlayed ? (
              <>
                <span className={match.homeScore! > match.awayScore! ? 'text-orange-600' : 'text-stone-700'}>{match.homeScore}</span>
                <span className={match.awayScore! > match.homeScore! ? 'text-orange-600' : 'text-stone-700'}>{match.awayScore}</span>
              </>
            ) : (
              <>
                <span className="text-stone-300 text-xs">-</span>
                <span className="text-stone-300 text-xs">-</span>
              </>
            )}
          </div>
        </div>

        {/* Futsal match events list inside the card */}
        {selectedLeague.sport === 'futsal' && match.isPlayed && match.events && match.events.length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-stone-100/60 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-stone-500">
            {match.events.map((ev, idx) => (
              <span key={idx} className="flex items-center gap-0.5 bg-stone-100/40 px-1.5 py-0.5 rounded-sm border border-stone-200/40">
                {ev.type === 'goal' && <span className="mr-0.5">⚽</span>}
                {ev.type === 'yellow' && <span className="inline-block w-1.5 h-2.5 bg-amber-400 rounded-3xs mr-0.5" />}
                {ev.type === 'red' && <span className="inline-block w-1.5 h-2.5 bg-red-500 rounded-3xs mr-0.5" />}
                <span className="font-medium text-stone-600">{ev.playerName}</span>
                {ev.minute && <span className="text-stone-400 font-mono font-bold text-[9px] ml-0.5">{ev.minute}'</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderKnockoutMatchCard(match: LeagueMatch) {
    if (!selectedLeague) return null;
    
    // Disable score editing if it's a placeholder match with no real teams yet promoted!
    const homeIsPlaceholder = match.home.startsWith('Thắng');
    const awayIsPlaceholder = match.away.startsWith('Thắng');
    const isEditingAllowed = selectedLeague.status === 'ACTIVE' && !homeIsPlaceholder && !awayIsPlaceholder;

    return (
      <div
        key={match.id}
        onClick={() => isEditingAllowed && startEditScore(match)}
        className={`w-[220px] bg-white border border-stone-200 rounded-xl p-3 shadow-xs hover:shadow-md transition-all flex flex-col gap-2.5 relative
          ${isEditingAllowed ? 'cursor-pointer hover:border-orange-300' : 'opacity-70'}
        `}
      >
        <span className="text-[8px] font-extrabold uppercase text-stone-400 font-mono tracking-wider">
          {match.id.toUpperCase()}
        </span>

        <div className="flex flex-col gap-1.5">
          {/* Home slot */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full ${getTeamColor(match.home, selectedLeague.teams)} shrink-0`} />
              <span className={`text-xs font-bold truncate text-stone-700 ${homeIsPlaceholder ? 'text-stone-400 italic' : ''}`}>
                {getTeamName(match.home, selectedLeague.teams)}
              </span>
              {renderTeamCardsSummary(match, match.home)}
            </div>
            {match.isPlayed && (
              <span className={`text-xs font-mono font-extrabold ${match.homeScore! > match.awayScore! ? 'text-orange-600' : 'text-stone-400'}`}>
                {match.homeScore}
              </span>
            )}
          </div>

          <div className="border-t border-stone-100 my-0.5" />

          {/* Away slot */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full ${getTeamColor(match.away, selectedLeague.teams)} shrink-0`} />
              <span className={`text-xs font-bold truncate text-stone-700 ${awayIsPlaceholder ? 'text-stone-400 italic' : ''}`}>
                {getTeamName(match.away, selectedLeague.teams)}
              </span>
              {renderTeamCardsSummary(match, match.away)}
            </div>
            {match.isPlayed && (
              <span className={`text-xs font-mono font-extrabold ${match.awayScore! > match.homeScore! ? 'text-orange-600' : 'text-stone-400'}`}>
                {match.awayScore}
              </span>
            )}
          </div>
        </div>

        {/* Futsal match events list inside knockout card */}
        {selectedLeague.sport === 'futsal' && match.isPlayed && match.events && match.events.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-stone-100 flex flex-wrap gap-1 text-[9px] text-stone-500">
            {match.events.map((ev, idx) => (
              <span key={idx} className="flex items-center gap-0.5 bg-stone-50 px-1 py-0.5 rounded-sm border border-stone-150">
                {ev.type === 'goal' && <span>⚽</span>}
                {ev.type === 'yellow' && <span className="inline-block w-1.5 h-2 bg-amber-400 rounded-3xs" />}
                {ev.type === 'red' && <span className="inline-block w-1.5 h-2 bg-red-500 rounded-3xs" />}
                <span className="font-semibold text-stone-600 truncate max-w-[50px]">{ev.playerName}</span>
                {ev.minute && <span className="text-stone-400 font-mono">{ev.minute}'</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderStandingsTable(standings: GroupStanding[]) {
    if (!selectedLeague) return null;

    return (
      <div className="overflow-x-auto border border-stone-200 rounded-xl">
        <table className="w-full text-left border-collapse bg-white text-xs">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold">
              <th className="p-3 text-center w-12">#</th>
              <th className="p-3">Đội bóng</th>
              <th className="p-3 text-center">Trận</th>
              <th className="p-3 text-center">T</th>
              <th className="p-3 text-center">H</th>
              <th className="p-3 text-center">B</th>
              <th className="p-3 text-center">Hiệu số</th>
              <th className="p-3 text-center font-bold text-orange-600">Điểm</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((st, idx) => {
              const isPromoted = idx < 2 && selectedLeague.format === 'group_knockout';
              return (
                <tr 
                  key={st.teamId} 
                  className={`border-b border-stone-100 font-semibold text-stone-700 hover:bg-stone-50/50 last:border-0
                    ${isPromoted ? 'bg-emerald-50/20' : ''}
                  `}
                >
                  <td className="p-3 text-center font-mono">
                    {idx + 1 <= 3 ? (
                      <span className={`inline-block w-5 h-5 rounded-full text-[10px] text-white leading-5 font-black text-center shadow-xs
                        ${idx === 0 ? 'bg-amber-500' : ''}
                        ${idx === 1 ? 'bg-stone-400' : ''}
                        ${idx === 2 ? 'bg-amber-700' : ''}
                      `}>
                        {idx + 1}
                      </span>
                    ) : (
                      idx + 1
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full ${getTeamColor(st.teamId, selectedLeague.teams)}`} />
                      <span className="font-bold text-stone-900">{getTeamName(st.teamId, selectedLeague.teams)}</span>
                      
                      {/* Thẻ phạt (Thẻ đỏ & Thẻ vàng) của đội bóng */}
                      {(() => {
                        let yellow = 0;
                        let red = 0;
                        selectedLeague.matches.forEach(match => {
                          if (match.events) {
                            match.events.forEach(ev => {
                              if (ev.teamId === st.teamId) {
                                if (ev.type === 'yellow') yellow++;
                                if (ev.type === 'red') red++;
                              }
                            });
                          }
                        });

                        if (yellow === 0 && red === 0) return null;
                        return (
                          <div className="flex items-center gap-1 shrink-0 ml-1.5 bg-stone-100/50 px-1.5 py-0.5 rounded-md">
                            {Array.from({ length: yellow }).map((_, i) => (
                              <span
                                key={`y-${i}`}
                                className="inline-block w-2 h-3 bg-amber-400 border border-amber-500/30 rounded-[1px] shadow-2xs animate-fade-in hover:scale-110 transition-transform cursor-help"
                                title="Thẻ vàng"
                              />
                            ))}
                            {Array.from({ length: red }).map((_, i) => (
                              <span
                                key={`r-${i}`}
                                className="inline-block w-2 h-3 bg-red-500 border border-red-600/30 rounded-[1px] shadow-2xs animate-fade-in hover:scale-110 transition-transform cursor-help"
                                title="Thẻ đỏ"
                              />
                            ))}
                          </div>
                        );
                      })()}

                      {isPromoted && (
                        <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-sans uppercase font-extrabold tracking-wider animate-pulse shrink-0">
                          Vé Playoff
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-center font-mono">{st.played}</td>
                  <td className="p-3 text-center font-mono text-emerald-600">{st.won}</td>
                  <td className="p-3 text-center font-mono text-stone-400">{st.drawn}</td>
                  <td className="p-3 text-center font-mono text-rose-500">{st.lost}</td>
                  <td className="p-3 text-center font-mono">
                    {st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-base text-orange-600">
                    {st.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}
