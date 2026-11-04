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
  const top = rows.slice(0, 20);
  if (!top.length) return [`🏆 ${name.slice(0, 120)}`, season, '', 'Chưa có người tham gia tuần này.', '', url].join('\n');
  const widths = [2, 14, ...(['wins', 'draws', 'losses', 'diff'] as const).map(key => Math.max(key === 'diff' ? 3 : 2, ...top.map(p => String(p[key] > 0 && key === 'diff' ? '+' + p[key] : p[key]).length)))];
  const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });
  const cell = (value: string | number, width: number, right = true) => {
    const parts = [...segmenter.segment(String(value).normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ''))].map(s => s.segment);
    const size = (v: string) => /[\p{Extended_Pictographic}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff]/u.test(v) ? 2 : 1;
    const total = parts.reduce((sum, v) => sum + size(v), 0);
    let text = '', used = 0;
    for (const part of parts) {
      if (used + size(part) > width - (total > width ? 1 : 0)) break;
      text += part; used += size(part);
    }
    if (total > width) { text += '…'; used++; }
    return right ? ' '.repeat(width - used) + text : text + ' '.repeat(width - used);
  };
  const border = (left: string, middle: string, right: string) => left + widths.map(w => '─'.repeat(w)).join(middle) + right;
  const line = (values: Array<string | number>) => '│' + values.map((v, i) => cell(v, widths[i], i !== 1)).join('│') + '│';
  const table = [border('┌', '┬', '┐'), line(['#', 'Tên', 'T', 'H', 'B', 'HS']), border('├', '┼', '┤'),
    ...top.map((p, i) => line([i + 1, p.name, p.wins, p.draws, p.losses, p.diff > 0 ? '+' + p.diff : p.diff])), border('└', '┴', '┘')];
  return [`🏆 ${name.slice(0, 120)}`, season, '', '```', ...table, '```', '', 'T/H/B: Thắng/Hoà/Bại · HS = Thắng − Bại', rows.length > 20 ? `Hiện 20/${rows.length} người. Xem đầy đủ:` : 'Xem đầy đủ:', url].join('\n');
}

export function scoreInput(a: string, b: string): [number, number] {
  if (![a, b].every(v => /^\d{1,3}$/.test(v))) throw new Error('Điểm phải là số nguyên từ 0 đến 999.');
  return [Number(a), Number(b)];
}

export function scheduledSlot(cron: string): string | null {
  return cron === '20 6 * * *' ? '13:20' : cron === '0 14 * * *' ? '21:00' : null;
}
