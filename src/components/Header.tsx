'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PATH_VIEW, VIEW_PATH, type ViewKey } from '../lib/nav';
import { playRetroBeep } from './games/CaroBoard.tsx';
import { Gamepad2, Trophy, Swords, Sparkles, History } from 'lucide-react';

const NAV: { key: ViewKey; label: string; icon: typeof Gamepad2; color: string }[] = [
  { key: 'catalog', label: 'Trò Chơi', icon: Gamepad2, color: 'text-stone-500' },
  { key: 'tournaments', label: 'Trí Tuệ', icon: Trophy, color: 'text-stone-500' },
  { key: 'myleague', label: 'Giải Thể Thao', icon: Trophy, color: 'text-amber-500' },
  { key: 'bilac', label: 'Đấu Trường Bi Lắc', icon: Swords, color: 'text-orange-500' },
  { key: 'daily', label: 'Thử Thách Ngày', icon: Sparkles, color: 'text-stone-500' },
  { key: 'replays', label: 'Nhật Ký', icon: History, color: 'text-stone-500' },
  { key: 'leaderboards', label: 'Xếp Hạng', icon: Trophy, color: 'text-stone-500' },
];

export function Header() {
  const pathname = usePathname() ?? '/';
  const active: ViewKey = PATH_VIEW[pathname] ?? 'catalog';

  const handleNav = () => {
    try { playRetroBeep(330, 'sine', 0.05); } catch { /* sound not ready */ }
  };

  const handleSignOut = () => {
    try { playRetroBeep(440, 'sine', 0.05); } catch { /* sound not ready */ }
    localStorage.removeItem('userId');
    window.location.href = '/';
  };

  return (
    <header className="bg-stone-900 text-stone-100 border-b-4 border-stone-800 shadow-md">
      {/* Upper row: logo + auth */}
      <div className="max-w-7xl mx-auto py-3.5 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500 border-2 border-white flex items-center justify-center font-bold text-xl text-white shadow-inner relative">
            🎮
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-serif tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-200 to-yellow-400 font-extrabold select-none">
              gametuoitho.space
            </h1>
            <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block -mt-1">Nostalgia Brain Arena</span>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="text-xs sm:text-sm font-extrabold text-orange-400 hover:text-orange-300 underline"
        >
          Đăng xuất
        </button>
      </div>

      {/* Sticky nav tab rail */}
      <nav className="flex justify-center bg-white border-t border-stone-200 py-2 px-4 gap-1 sm:gap-2 lg:gap-4 overflow-x-auto sticky top-0 z-40">
        {NAV.map((n) => {
          const isActive = active === n.key;
          const Icon = n.icon;
          return (
            <Link
              key={n.key}
              href={VIEW_PATH[n.key]}
              onClick={handleNav}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap
                ${isActive
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }
              `}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : n.color}`} />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export default Header;
