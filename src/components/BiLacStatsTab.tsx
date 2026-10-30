import { useMemo, useState } from 'react';
import { Activity, TrendingDown, TrendingUp, Users } from 'lucide-react';
import type { BiLacMatch, BiLacPlayer } from '../types';

type PlayerStats = {
  player: BiLacPlayer;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
};

function getStats(players: BiLacPlayer[], matches: BiLacMatch[]) {
  const finished = matches.filter(match => match.status === 'FINISHED');
  const stats = new Map<string, PlayerStats>();
  players.forEach(player => stats.set(player.id, {
    player, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, winRate: 0,
  }));

  finished.forEach(match => {
    const apply = (team: string[], score: number, against: number) => team.forEach(id => {
      const row = stats.get(id);
      if (!row) return;
      row.played += 1;
      row.goalsFor += score;
      row.goalsAgainst += against;
      if (score > against) row.wins += 1;
      else if (score < against) row.losses += 1;
      else row.draws += 1;
    });
    apply(match.team1, match.score1, match.score2);
    apply(match.team2, match.score2, match.score1);
  });
  stats.forEach(row => { row.winRate = row.played ? row.wins / row.played : 0; });
  return { finished, stats: [...stats.values()].filter(row => row.played > 0) };
}

function monthKey(timestamp: number) {
  const date = new Date(timestamp + 7 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(key: string) {
  const [year, month] = key.split('-');
  return `${month}/${year}`;
}

function StatRows({ rows, metric }: { rows: PlayerStats[]; metric: 'strong' | 'carry' | 'improve' }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500">Chưa đủ dữ liệu để xếp hạng (cần tối thiểu 3 trận).</p>;
  return (
    <ol className="space-y-2">
      {rows.slice(0, 5).map((row, index) => (
        <li key={row.player.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2">
          <span className="w-5 text-center text-xs font-bold text-stone-400">{index + 1}</span>
          <img src={row.player.avatar} alt="" className="h-8 w-8 rounded-full border border-stone-200 bg-white object-cover" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{row.player.name}</span>
          <span className={`text-right font-mono text-xs font-bold ${metric === 'improve' ? 'text-rose-600' : 'text-emerald-700'}`}>
            {Math.round(row.winRate * 100)}%
            <span className="block font-normal text-stone-400">{row.played} trận</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function BiLacStatsTab({ players, matches }: { players: BiLacPlayer[]; matches: BiLacMatch[] }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const { finished, stats } = useMemo(() => getStats(players, matches), [players, matches]);
  const byId = new Map<string, PlayerStats>(stats.map(row => [row.player.id, row]));
  const eligible = stats.filter(row => row.played >= 3);
  const strongest = [...eligible].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
  const needsWork = [...eligible].sort((a, b) => a.winRate - b.winRate || a.wins - b.wins);

  const partnerThreshold = eligible.length ? [...eligible].sort((a, b) => a.winRate - b.winRate)[Math.floor((eligible.length - 1) / 2)].winRate : 0;
  const carryRows = new Map<string, { wins: number; played: number }>();
  finished.forEach(match => {
    const team1Stats = match.team1.map(id => byId.get(id)).filter((row): row is PlayerStats => Boolean(row));
    const team2Stats = match.team2.map(id => byId.get(id)).filter((row): row is PlayerStats => Boolean(row));
    const addCarryCandidate = (team: string[], partnerStats: PlayerStats[], won: boolean) => {
      const weakPartner = partnerStats.some(row => row.played >= 3 && row.winRate <= partnerThreshold);
      if (!weakPartner) return;
      team.forEach(id => {
        const ownStats = byId.get(id);
        if (!ownStats || ownStats.played < 3 || ownStats.winRate <= partnerThreshold) return;
        const row = carryRows.get(id) || { wins: 0, played: 0 };
        row.played += 1;
        if (won) row.wins += 1;
        carryRows.set(id, row);
      });
    };
    addCarryCandidate(match.team1, team1Stats, match.score1 > match.score2);
    addCarryCandidate(match.team2, team2Stats, match.score2 > match.score1);
  });
  const carries = [...carryRows.entries()]
    .filter(([, row]) => row.played >= 3)
    .map(([id, row]) => ({ ...byId.get(id)!, played: row.played, wins: row.wins, winRate: row.wins / row.played }))
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played);

  const playersWithMatches = [...stats].sort((a, b) => a.player.name.localeCompare(b.player.name, 'vi'));
  const selectedId = playersWithMatches.some(row => row.player.id === selectedPlayerId)
    ? selectedPlayerId
    : playersWithMatches[0]?.player.id || '';
  const selectedPlayer = playersWithMatches.find(row => row.player.id === selectedId);
  const monthly = new Map<string, { wins: number; played: number }>();
  finished.forEach(match => {
    const onTeam1 = match.team1.includes(selectedId);
    const onTeam2 = match.team2.includes(selectedId);
    if (!onTeam1 && !onTeam2) return;
    const key = monthKey(match.timestamp);
    const row = monthly.get(key) || { wins: 0, played: 0 };
    row.played += 1;
    if ((onTeam1 && match.score1 > match.score2) || (onTeam2 && match.score2 > match.score1)) row.wins += 1;
    monthly.set(key, row);
  });
  const months = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b));

  const width = 720;
  const height = 230;
  const left = 42;
  const right = 12;
  const top = 16;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const points = months.map(([key, row], index) => ({
    key,
    ...row,
    x: left + (months.length < 2 ? chartWidth / 2 : index / (months.length - 1) * chartWidth),
    y: top + (1 - row.wins / row.played) * chartHeight,
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="space-y-5" id="bilac_tab_stats_content">
      <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 text-orange-600" />
          <div>
            <h2 className="font-bold text-stone-900">Thống kê toàn thời gian</h2>
            <p className="mt-1 text-xs text-stone-500">{finished.length} trận đã kết thúc trong giải đấu này.</p>
          </div>
        </div>
        {finished.length === 0 ? (
          <p className="rounded-lg bg-stone-50 p-5 text-sm text-stone-500">Chưa có trận hoàn tất để thống kê.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-emerald-100 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-stone-900"><TrendingUp className="h-4 w-4 text-emerald-600" /> Đá hay nhất</h3>
              <p className="mb-3 text-[11px] text-stone-500">Tỷ lệ thắng all-time, tối thiểu 3 trận.</p>
              <StatRows rows={strongest} metric="strong" />
            </section>
            <section className="rounded-xl border border-orange-100 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-stone-900"><Users className="h-4 w-4 text-orange-600" /> Gánh đồng đội yếu</h3>
              <p className="mb-3 text-[11px] text-stone-500">Tỷ lệ thắng khi ghép với đồng đội thuộc nửa dưới, tối thiểu 3 trận.</p>
              <StatRows rows={carries} metric="carry" />
            </section>
            <section className="rounded-xl border border-rose-100 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-stone-900"><TrendingDown className="h-4 w-4 text-rose-600" /> Cần cải thiện</h3>
              <p className="mb-3 text-[11px] text-stone-500">Tỷ lệ thắng thấp nhất trong nhóm đã chơi ít nhất 3 trận.</p>
              <StatRows rows={needsWork} metric="improve" />
            </section>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-stone-900">Phong độ theo tháng</h3>
            <p className="mt-1 text-xs text-stone-500">Tỷ lệ thắng từng tháng, tính trên các trận đã kết thúc.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
            Người chơi
            <select value={selectedId} onChange={event => setSelectedPlayerId(event.target.value)} className="max-w-48 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800">
              {playersWithMatches.map(row => <option key={row.player.id} value={row.player.id}>{row.player.name}</option>)}
            </select>
          </label>
        </div>
        {!selectedPlayer || months.length === 0 ? (
          <p className="text-sm text-stone-500">Chưa có dữ liệu phong độ.</p>
        ) : (
          <>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-semibold text-stone-800">{selectedPlayer.player.name}</span>
              <span className="text-xs text-stone-500">{selectedPlayer.wins} thắng / {selectedPlayer.played} trận all-time</span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`Tỷ lệ thắng theo tháng của ${selectedPlayer.player.name}`}>
              {[0, 0.5, 1].map(value => {
                const y = top + (1 - value) * chartHeight;
                return <g key={value}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#e7e5e4" /><text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#78716c">{Math.round(value * 100)}%</text></g>;
              })}
              {path && <path d={path} fill="none" stroke="#ea580c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
              {points.map(point => <g key={point.key}><circle cx={point.x} cy={point.y} r="4" fill="white" stroke="#ea580c" strokeWidth="2" /><title>{`${formatMonth(point.key)}: ${Math.round(point.wins / point.played * 100)}% (${point.wins}/${point.played})`}</title></g>)}
              {points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0).map(point => <text key={`label-${point.key}`} x={point.x} y={height - 10} textAnchor="middle" fontSize="10" fill="#78716c">{formatMonth(point.key)}</text>)}
            </svg>
            <p className="mt-1 text-[11px] text-stone-400">Mỗi điểm ghi kèm số trận thắng/tổng trận khi rê chuột. Tháng không tham gia sẽ được bỏ qua.</p>
          </>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-stone-500">Lưu ý: dữ liệu hiện ghi tỉ số theo đội, chưa lưu bàn thắng riêng từng người. Các chỉ số cá nhân phản ánh kết quả của đội khi người đó tham gia.</p>
    </div>
  );
}
