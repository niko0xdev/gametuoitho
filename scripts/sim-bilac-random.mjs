// Replicates the EXACT production team-creation algorithm (worker/src/routes/bilac.ts:408-436)
// to empirically measure bench distribution + team balance bias.
// Throwaway evidence-gathering script (systematic-debugging Phase 1).

function shuf(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ids already sorted best->worst: rank 0 is best. Lower rankSum = stronger team.

// OLD (production): high/low split + halfHigh distribution.
function createTeamsOld(sortedIds) {
  let ids = [...sortedIds];
  let benched;
  if (ids.length % 2 !== 0) {
    const bi = Math.floor(Math.random() * ids.length);
    benched = ids[bi];
    ids.splice(bi, 1);
  }
  const teamSize = ids.length / 2;
  const high = ids.slice(0, teamSize);
  const low = ids.slice(teamSize);
  const sh = shuf(high), sl = shuf(low);
  const t1 = [], t2 = [];
  const halfHigh = Math.floor(teamSize / 2);
  for (let i = 0; i < sh.length; i++) (i < halfHigh ? t1 : t2).push(sh[i]);
  const needLowT1 = teamSize - t1.length;
  for (let i = 0; i < sl.length; i++) (i < needLowT1 ? t1 : t2).push(sl[i]);
  return { t1: shuf(t1), t2: shuf(t2), benched };
}

// NEW (fix): adjacent-pair random split.
function createTeamsNew(sortedIds) {
  let ids = [...sortedIds];
  let benched;
  if (ids.length % 2 !== 0) {
    const bi = Math.floor(Math.random() * ids.length);
    benched = ids[bi];
    ids.splice(bi, 1);
  }
  const t1 = [], t2 = [];
  for (let i = 0; i < ids.length; i += 2) {
    if (Math.random() < 0.5) { t1.push(ids[i]); t2.push(ids[i + 1]); }
    else { t1.push(ids[i + 1]); t2.push(ids[i]); }
  }
  return { t1: shuf(t1), t2: shuf(t2), benched };
}

const rankOf = (id) => id; // id === rank (0=best)
const RUNS = 100000;

for (const n of [4, 5, 6, 7, 8, 10]) {
  const ids = Array.from({ length: n }, (_, i) => i);
  for (const [label, fn] of [['OLD', createTeamsOld], ['NEW', createTeamsNew]]) {
    let t1RankSum = 0, t2RankSum = 0;
    const benchCount = Array(n).fill(0);
    const t2Stronger = { yes: 0, no: 0 };
    for (let r = 0; r < RUNS; r++) {
      const { t1, t2, benched } = fn(ids);
      const s1 = t1.reduce((s, x) => s + rankOf(x), 0);
      const s2 = t2.reduce((s, x) => s + rankOf(x), 0);
      t1RankSum += s1; t2RankSum += s2;
      if (benched !== undefined) benchCount[benched]++;
      if (s2 < s1) t2Stronger.yes++; else t2Stronger.no++;
    }
    const odd = n % 2 !== 0;
    console.log(`\n=== n=${n} (${odd ? 'ODD->benched' : 'even'}) [${label}] ===`);
    console.log(`  avg rankSum: t1=${(t1RankSum / RUNS).toFixed(3)}  t2=${(t2RankSum / RUNS).toFixed(3)}   (lower=stronger)`);
    console.log(`  t2 stronger than t1: ${(100 * t2Stronger.yes / RUNS).toFixed(2)}% of matches`);
    if (odd && label === 'NEW') {
      console.log(`  bench freq by rank: ` + benchCount.map(c => `${(100 * c / RUNS).toFixed(1)}%`).join('  '));
    }
  }
}
