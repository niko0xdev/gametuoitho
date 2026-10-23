export interface RankingPlayer { id: string; name: string }
export interface RankingMatch {
  team1: string[]; team2: string[]; score1: number; score2: number;
  status: string; weekLabel: string; benched?: string | null;
}
export interface RankingRow extends RankingPlayer { wins: number; losses: number; draws: number; played: number; diff: number }

export function currentSeason(now = new Date()): string {
  const local = new Date(now.getTime() + 7 * 3600000);
  const wed = new Date(local);
  wed.setUTCDate(local.getUTCDate() + 3 - local.getUTCDay());
  wed.setUTCHours(11, 30, 0, 0);
  const start = new Date(wed), end = new Date(wed);
  if (local < wed) start.setUTCDate(start.getUTCDate() - 7);
  else end.setUTCDate(end.getUTCDate() + 7);
  const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  return `Tuần từ ${fmt(start)} đến ${fmt(end)}`;
}

export function standings(players: RankingPlayer[], matches: RankingMatch[], season: string): RankingRow[] {
  const participating = new Set<string>();
  for (const m of matches) {
    if (m.status === 'PLAYING' || (m.weekLabel === season && m.status === 'FINISHED')) {
      [...m.team1, ...m.team2, ...(m.benched ? [m.benched] : [])].forEach(id => participating.add(id));
    }
  }
  const rows = players.filter(p => participating.has(p.id)).map(p => ({ ...p, wins: 0, losses: 0, draws: 0, played: 0, diff: 0 }));
  const byId = new Map(rows.map(p => [p.id, p]));
  for (const m of matches.filter(m => m.status === 'FINISHED' && m.weekLabel === season)) {
    for (const [team, own, other] of [[m.team1, m.score1, m.score2], [m.team2, m.score2, m.score1]] as const) {
      for (const id of team) {
        const p = byId.get(id);
        if (!p) continue;
        if (own > other) p.wins++;
        else if (own < other) p.losses++;
        else p.draws++;
        p.played = p.wins + p.losses;
        p.diff = p.wins - p.losses;
      }
    }
  }
  return rows.sort((a, b) => b.diff - a.diff || b.wins - a.wins);
}

export function renderStandings(name: string, season: string, rows: RankingRow[], url: string): string {
  const lines = rows.slice(0, 20).map((p, i) => `${i + 1}. ${p.name.slice(0, 60)} | ${p.wins}T ${p.draws}H ${p.losses}B | HS ${p.diff > 0 ? '+' : ''}${p.diff}`);
  return [`🏆 ${name.slice(0, 120)}`, season, '', ...(lines.length ? lines : ['Chưa có người tham gia tuần này.']), '', 'HS = thắng − thua', url].join('\n');
}

export function scoreInput(a: string, b: string): [number, number] {
  if (![a, b].every(v => /^\d{1,3}$/.test(v))) throw new Error('Điểm phải là số nguyên từ 0 đến 999.');
  return [Number(a), Number(b)];
}

export function scheduledSlot(cron: string): string | null {
  return cron === '20 6 * * *' ? '13:20' : cron === '0 14 * * *' ? '21:00' : null;
}
