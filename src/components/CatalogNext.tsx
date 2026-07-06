'use client';

import Link from 'next/link';
import { GAMES_MAP } from '../gamesData';

export function CatalogNext() {
  const games = Object.values(GAMES_MAP);
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
      {games.map((g) => (
        <Link
          key={g.id}
          href={`/match/new?gameId=${g.id}`}
          className="rounded-2xl border border-slate-800 p-4 bg-slate-900 hover:bg-slate-800"
        >
          <div className="font-semibold">{g.name}</div>
          <div className="text-xs text-slate-400 mt-1 line-clamp-2">{g.description}</div>
        </Link>
      ))}
    </section>
  );
}

export default CatalogNext;
