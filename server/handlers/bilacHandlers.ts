import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { requireLoggedIn } from './_middleware.ts';

export function handleListBilacTournaments(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  res.json(db.getAllBiLacTournamentsWithMembership(uid));
}

export function handleAccessBilacTournament(req: Request, res: Response) {
  const uid = requireLoggedIn(req, res);
  if (!uid) return;
  const { tournamentId, code } = req.body;
  if (!tournamentId) {
    return res.status(400).json({ error: 'Thiếu mã giải đấu!' });
  }
  const tour = db.getBiLacTournament(tournamentId);
  if (!tour) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  }
  // Members enter without the code (logout may have cleared their cached code).
  // Return the code so the client can cache it for the gated routes' header check.
  if (db.isBiLacTournamentMember(tournamentId, uid)) {
    return res.json({ success: true, tournament: { id: tour.id, name: tour.name, description: tour.description }, code: tour.code });
  }
  if (!code) {
    return res.status(400).json({ error: 'Thiếu mã code truy cập!' });
  }
  if (tour.code !== code) {
    return res.status(403).json({ error: 'Mã truy cập không chính xác!' });
  }
  res.status(403).json({ error: 'Bạn chưa được mời vào giải đấu này. Vui lòng liên hệ chủ giải để được thêm vào!' });
}

export function handleCreateBilacTournament(req: Request, res: Response) {
  const userId = requireLoggedIn(req, res);
  if (!userId) return;
  const { name, code, description } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Tên giải đấu không được để trống!' });
  }
  if (!code || code.trim() === '') {
    return res.status(400).json({ error: 'Mã truy cập giải đấu không được để trống!' });
  }
  const nameTrimmed = name.trim();
  const existing = db.getAllBiLacTournaments().find(t => t.name.toLowerCase() === nameTrimmed.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Tên giải đấu này đã tồn tại!' });
  }
  const id = 'tour-' + Date.now();
  // Generate a unique 8-char base36 slug for the public /bilac/{slug} URL.
  // Retry up to 5 times on collision (collision probability ~ 1e-9 at 100K rows).
  let slug = db.generateBilacTournamentSlug();
  for (let i = 0; i < 5; i++) {
    if (!db.getBiLacTournamentBySlug(slug)) break;
    if (i === 4) {
      return res.status(500).json({ error: 'Không thể tạo slug, thử lại.' });
    }
    slug = db.generateBilacTournamentSlug();
  }
  const tournament = {
    id,
    slug,
    name: nameTrimmed,
    code: code.trim(),
    description: description ? description.trim() : '',
    createdAt: Date.now(),
    ownerUserId: userId,
  };
  db.saveBiLacTournament(tournament);

  const user = db.getUser(userId);
  db.saveBiLacTournamentMember({
    id: `mem-${id}-${userId}`,
    tournamentId: id,
    userId,
    username: user?.username || userId,
    displayName: user?.displayName || user?.username || userId,
    role: 'owner',
    joinedAt: Date.now(),
  });

  res.json({ success: true, tournament });
}

// Owner-only: rename a tournament and/or update its description. Code + slug
// + createdAt are preserved. Mounted with requireBiLacOwner.
export function handleUpdateBilacTournament(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const { name, description } = req.body;
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ error: 'Tên giải đấu không được để trống!' });
  }
  const tour = db.getBiLacTournament(tournamentId);
  if (!tour) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  }
  const updated = {
    ...tour,
    name: String(name).trim(),
    description: description != null ? String(description).trim() : tour.description,
  };
  db.saveBiLacTournament(updated);
  res.json({ success: true, tournament: { id: updated.id, slug: updated.slug, name: updated.name, description: updated.description || '', code: updated.code, createdAt: updated.createdAt } });
}

// Owner-only: cascade-delete the tournament and everything under it. Mounted
// with requireBiLacOwner (validates code + ownership via x-tournament-id header).
export function handleDeleteBilacTournament(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const tour = db.getBiLacTournament(tournamentId);
  if (!tour) {
    return res.status(404).json({ error: 'Không tìm thấy giải đấu!' });
  }
  db.deleteBiLacTournamentCascade(tournamentId);
  res.json({ success: true });
}

// Public read-only endpoint keyed by slug. No login required. Mutations stay
// gated by checkBiLacTournamentAccess + member check elsewhere.
export function handleGetBilacTournamentBySlug(req: Request, res: Response) {
  const { slug } = req.params;
  if (!slug || !/^[0-9a-z]{8}$/.test(slug)) {
    return res.status(400).json({ error: 'Slug không hợp lệ.' });
  }
  const tour = db.getBiLacTournamentBySlug(slug);
  if (!tour) {
    return res.status(404).json({ error: 'Giải đấu không tồn tại hoặc đã bị xoá.' });
  }

  const players = db
    .getAllBiLacPlayers()
    .filter((p: any) => p.tournamentId === tour.id)
    .map((p: any) => ({ id: p.id, name: p.name, avatar: p.avatar }));

  const matches = db
    .getAllBiLacMatches()
    .filter((m: any) => m.tournamentId === tour.id)
    .map((m: any) => ({
      id: m.id,
      timestamp: m.timestamp,
      team1: m.team1,
      team2: m.team2,
      score1: m.score1,
      score2: m.score2,
      status: m.status,
    }));

  const members = db.getBiLacTournamentMembers(tour.id);

  // Optional isMember flag if the caller is logged in.
  const uid = req.headers['x-user-id'];
  let isMember = false;
  if (typeof uid === 'string' && uid) {
    isMember = members.some((m: any) => m.userId === uid);
  }

  res.json({
    id: tour.id,
    slug: tour.slug,
    name: tour.name,
    description: tour.description,
    createdAt: tour.createdAt,
    memberCount: members.length,
    isMember,
    players,
    matches,
  });
}

export function handleListBilacMembers(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const members = db.getBiLacTournamentMembers(tournamentId).map(m => ({
    id: m.id,
    userId: m.userId,
    username: m.username,
    displayName: m.displayName,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
  res.json({ success: true, members });
}

export function handleInviteBilacMember(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const { username } = req.body;
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập username!' });
  }
  const trimmed = String(username).trim().toLowerCase();
  const targetUser = db.getUserByUsername(trimmed);
  if (!targetUser) {
    return res.status(404).json({ error: 'Không tìm thấy user có username này!' });
  }
  if (db.isBiLacTournamentMember(tournamentId, targetUser.id)) {
    return res.status(400).json({ error: 'User này đã là thành viên của giải!' });
  }
  db.saveBiLacTournamentMember({
    id: `mem-${tournamentId}-${targetUser.id}-${Date.now()}`,
    tournamentId,
    userId: targetUser.id,
    username: targetUser.username,
    displayName: targetUser.displayName,
    role: 'member',
    joinedAt: Date.now(),
  });
  res.json({ success: true, member: { userId: targetUser.id, username: targetUser.username, displayName: targetUser.displayName, role: 'member' } });
}

export function handleRemoveBilacMember(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const reqUserId = (req as any).userId;
  const targetUserId = req.params.userId;
  if (targetUserId === reqUserId) {
    return res.status(400).json({ error: 'Không thể tự xoá chủ giải!' });
  }
  if (!db.isBiLacTournamentMember(tournamentId, targetUserId)) {
    return res.status(404).json({ error: 'User không phải thành viên của giải!' });
  }
  db.deleteBiLacTournamentMember(tournamentId, targetUserId);
  res.json({ success: true });
}

export function handleGetBilacPlayers(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const players = db.getAllBiLacPlayers().filter(p => p.tournamentId === tournamentId);
  res.json(players);
}

export function handleCreateBilacPlayer(req: Request, res: Response) {
  const { name } = req.body;
  const tournamentId = (req as any).tournamentId;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Tên người chơi không được để trống!' });
  }
  const nameTrimmed = name.trim();
  const existing = db.getAllBiLacPlayers().find(p => p.tournamentId === tournamentId && p.name.toLowerCase() === nameTrimmed.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Tên người chơi đã tồn tại trong giải đấu này!' });
  }
  const id = 'bl-' + Date.now();
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(nameTrimmed)}`;
  const player = { id, name: nameTrimmed, avatar, tournamentId };
  db.saveBiLacPlayer(player);
  res.json(player);
}

// Rename a player (regenerates the dicebear avatar from the new name). Any
// member may edit. Mounted with requireBiLacMember.
export function handleUpdateBilacPlayer(req: Request, res: Response) {
  const playerId = req.params.id;
  const tournamentId = (req as any).tournamentId;
  const { name } = req.body;
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ error: 'Tên người chơi không được để trống!' });
  }
  const nameTrimmed = String(name).trim();
  const existing = db.getAllBiLacPlayers().find(p => p.id === playerId && p.tournamentId === tournamentId);
  if (!existing) {
    return res.status(404).json({ error: 'Không tìm thấy người chơi trong giải đấu này!' });
  }
  const dup = db.getAllBiLacPlayers().find(p => p.tournamentId === tournamentId && p.id !== playerId && p.name.toLowerCase() === nameTrimmed.toLowerCase());
  if (dup) {
    return res.status(400).json({ error: 'Tên người chơi đã tồn tại trong giải đấu này!' });
  }
  const updated = { ...existing, name: nameTrimmed, avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(nameTrimmed)}` };
  db.saveBiLacPlayer(updated);
  res.json(updated);
}

export function handleDeleteBilacPlayer(req: Request, res: Response) {
  const playerId = req.params.id;
  const tournamentId = (req as any).tournamentId;

  const hasMatches = db.getAllBiLacMatches().some(m =>
    m.tournamentId === tournamentId && (
      (m.team1 && m.team1.includes(playerId)) ||
      (m.team2 && m.team2.includes(playerId)) ||
      m.benched === playerId
    )
  );

  if (hasMatches) {
    return res.status(400).json({ error: 'Không thể xóa người chơi này vì họ đã tham gia ít nhất một trận đấu!' });
  }

  db.deleteBiLacPlayer(playerId);
  res.json({ success: true });
}

export function handleGetBilacMatches(req: Request, res: Response) {
  const tournamentId = (req as any).tournamentId;
  const matches = db.getAllBiLacMatches().filter(m => m.tournamentId === tournamentId);
  res.json(matches);
}

function getBiLacWeeklyInterval(date: Date) {
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const d = new Date(utcMs + (7 * 3600000));

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

  const formatDate = (dateObj: Date) => {
    const dayStr = String(dateObj.getDate()).padStart(2, '0');
    const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yearStr = dateObj.getFullYear();
    return `${dayStr}/${monthStr}/${yearStr}`;
  };

  const label = `Tuần từ ${formatDate(start)} đến ${formatDate(end)}`;
  return { start, end, label };
}

export { getBiLacWeeklyInterval };

export function handleCreateBilacMatch(req: Request, res: Response) {
  const { playerIds } = req.body;
  const tournamentId = (req as any).tournamentId;
  if (!playerIds || !Array.isArray(playerIds) || playerIds.length < 2) {
    return res.status(400).json({ error: 'Cần ít nhất 2 người chơi để chia đội!' });
  }

  const allPlayers = db.getAllBiLacPlayers().filter(p => p.tournamentId === tournamentId);
  const selectedPlayers = allPlayers.filter(p => playerIds.includes(p.id));

  if (selectedPlayers.length < 2) {
    return res.status(400).json({ error: 'Không tìm thấy người chơi hợp lệ trong hệ thống!' });
  }

  const now = new Date();
  const interval = getBiLacWeeklyInterval(now);
  const weekLabel = interval.label;

  const allMatches = db.getAllBiLacMatches().filter(m => m.tournamentId === tournamentId);

  const playerStatsWeekly: Record<string, { points: number; gd: number; wins: number; goals: number }> = {};
  const playerStatsAllTime: Record<string, { points: number; gd: number; wins: number; goals: number }> = {};

  allPlayers.forEach(p => {
    playerStatsWeekly[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 };
    playerStatsAllTime[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 };
  });

  allMatches.filter(m => m.status === 'FINISHED').forEach(m => {
    const s1 = m.score1;
    const s2 = m.score2;
    const t1 = m.team1;
    const t2 = m.team2;
    const isWeekly = m.weekLabel === weekLabel;

    t1.forEach(pid => {
      if (playerStatsAllTime[pid]) {
        playerStatsAllTime[pid].goals += s1;
        playerStatsAllTime[pid].gd += (s1 - s2);
        if (s1 > s2) {
          playerStatsAllTime[pid].points += 3;
          playerStatsAllTime[pid].wins += 1;
        } else if (s1 === s2) {
          playerStatsAllTime[pid].points += 1;
        }
      }
      if (isWeekly && playerStatsWeekly[pid]) {
        playerStatsWeekly[pid].goals += s1;
        playerStatsWeekly[pid].gd += (s1 - s2);
        if (s1 > s2) {
          playerStatsWeekly[pid].points += 3;
          playerStatsWeekly[pid].wins += 1;
        } else if (s1 === s2) {
          playerStatsWeekly[pid].points += 1;
        }
      }
    });

    t2.forEach(pid => {
      if (playerStatsAllTime[pid]) {
        playerStatsAllTime[pid].goals += s2;
        playerStatsAllTime[pid].gd += (s2 - s1);
        if (s2 > s1) {
          playerStatsAllTime[pid].points += 3;
          playerStatsAllTime[pid].wins += 1;
        } else if (s1 === s2) {
          playerStatsAllTime[pid].points += 1;
        }
      }
      if (isWeekly && playerStatsWeekly[pid]) {
        playerStatsWeekly[pid].goals += s2;
        playerStatsWeekly[pid].gd += (s2 - s1);
        if (s2 > s1) {
          playerStatsWeekly[pid].points += 3;
          playerStatsWeekly[pid].wins += 1;
        } else if (s1 === s2) {
          playerStatsWeekly[pid].points += 1;
        }
      }
    });
  });

  const sortedSelected = [...selectedPlayers].sort((a, b) => {
    const wA = playerStatsWeekly[a.id] || { points: 0, gd: 0, wins: 0, goals: 0 };
    const wB = playerStatsWeekly[b.id] || { points: 0, gd: 0, wins: 0, goals: 0 };

    if (wB.points !== wA.points) return wB.points - wA.points;
    if (wB.gd !== wA.gd) return wB.gd - wA.gd;
    if (wB.wins !== wA.wins) return wB.wins - wA.wins;
    if (wB.goals !== wA.goals) return wB.goals - wA.goals;

    const aA = playerStatsAllTime[a.id] || { points: 0, gd: 0, wins: 0, goals: 0 };
    const aB = playerStatsAllTime[b.id] || { points: 0, gd: 0, wins: 0, goals: 0 };

    if (aB.points !== aA.points) return aB.points - aA.points;
    if (aB.gd !== aA.gd) return aB.gd - aA.gd;
    if (aB.wins !== aA.wins) return aB.wins - aA.wins;
    if (aB.goals !== aA.goals) return aB.goals - aA.goals;

    return b.id.localeCompare(a.id);
  });

  let participatingIds = sortedSelected.map(p => p.id);
  let benchedPlayerId: string | undefined = undefined;

  if (participatingIds.length % 2 !== 0) {
    const benchedIndex = Math.floor(Math.random() * participatingIds.length);
    benchedPlayerId = participatingIds[benchedIndex];
    participatingIds.splice(benchedIndex, 1);
  }

  const teamSize = participatingIds.length / 2;
  const highSeeds = participatingIds.slice(0, teamSize);
  const lowSeeds = participatingIds.slice(teamSize);

  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const shuffledHigh = shuffle(highSeeds);
  const shuffledLow = shuffle(lowSeeds);

  const team1: string[] = [];
  const team2: string[] = [];

  const halfHigh = Math.floor(teamSize / 2);
  for (let i = 0; i < shuffledHigh.length; i++) {
    if (i < halfHigh) {
      team1.push(shuffledHigh[i]);
    } else {
      team2.push(shuffledHigh[i]);
    }
  }

  const neededLowForTeam1 = teamSize - team1.length;
  for (let i = 0; i < shuffledLow.length; i++) {
    if (i < neededLowForTeam1) {
      team1.push(shuffledLow[i]);
    } else {
      team2.push(shuffledLow[i]);
    }
  }

  const match = {
    id: 'match-' + Date.now(),
    timestamp: Date.now(),
    weekLabel,
    team1: shuffle(team1),
    team2: shuffle(team2),
    score1: 0,
    score2: 0,
    status: 'PLAYING' as const,
    benched: benchedPlayerId,
    tournamentId
  };

  db.saveBiLacMatch(match);
  res.json(match);
}

export function handleUpdateBilacMatch(req: Request, res: Response) {
  const { score1, score2, status, team1, team2 } = req.body;
  const match = db.getBiLacMatch(req.params.id);
  if (!match) {
    return res.status(404).json({ error: 'Không tìm thấy trận đấu!' });
  }

  if (match.tournamentId !== (req as any).tournamentId) {
    return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa trận đấu của giải đấu này!' });
  }

  // Capture play-state BEFORE applying any status change: swapping team rosters is
  // only allowed mid-match — never on a FINISHED match (would rewrite ranking history).
  const wasPlaying = match.status === 'PLAYING';
  if (typeof score1 === 'number') match.score1 = score1;
  if (typeof score2 === 'number') match.score2 = score2;
  if (status) match.status = status;

  // Drag-and-drop team swap: both arrays must be present and contain only strings.
  const isStrArray = (v: any) => Array.isArray(v) && v.every((x: any) => typeof x === 'string');
  if (isStrArray(team1) && isStrArray(team2)) {
    if (!wasPlaying) {
      return res.status(400).json({ error: 'Chỉ có thể đổi đội khi trận đang diễn ra!' });
    }
    // Must be a pure rearrangement of the existing roster — same multiset of ids,
    // no add/drop/phantom — so a code-holder can't wipe or corrupt the teams.
    const oldSorted = [...match.team1, ...match.team2].sort();
    const newSorted = [...team1, ...team2].sort();
    if (oldSorted.length !== newSorted.length || oldSorted.some((id: string, i: number) => id !== newSorted[i])) {
      return res.status(400).json({ error: 'Đội hình chỉ được hoán đổi thành viên hiện có — không thêm, bớt hay đặt người lạ!' });
    }
    match.team1 = team1;
    match.team2 = team2;
  }

  db.saveBiLacMatch(match);
  res.json(match);
}

export function handleDeleteBilacMatch(req: Request, res: Response) {
  const match = db.getBiLacMatch(req.params.id);
  if (!match) {
    return res.status(404).json({ error: 'Không tìm thấy trận đấu!' });
  }

  const tournamentId = (req as any).tournamentId;
  const uid = (req as any).userId;
  if (match.tournamentId !== tournamentId) {
    return res.status(403).json({ error: 'Bạn không có quyền xóa trận đấu của giải đấu này!' });
  }

  // Finished results are ranking-authoritative — only the owner may delete them.
  // In-progress matches may be cancelled by any member (the creator abandons).
  if (match.status === 'FINISHED' && !db.isBiLacTournamentOwner(tournamentId, uid)) {
    return res.status(403).json({ error: 'Chỉ chủ giải đấu mới được xoá kết quả trận đã ghi. Hãy nhờ chủ giải xoá giúp.' });
  }

  db.deleteBiLacMatch(req.params.id);
  res.json({ success: true });
}