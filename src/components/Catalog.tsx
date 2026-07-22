import React, { useState } from 'react';
import { GAMES, SOLO_GAMES } from '../gamesData.ts';
import { Game } from '../types.ts';
import { Sparkles, Users, Award, Play, Swords, LogIn } from 'lucide-react';
import { playRetroBeep } from './games/CaroBoard.tsx';
import { isValidRoomCode, normalizeRoomCode } from '../lib/roomCode.ts';

interface CatalogProps {
  onStartSolo: (gameId: string) => void;
  onJoinMatchmaking: (gameId: string) => void;
  onCreatePrivateRoom: (gameId: string) => void;
  onJoinPrivateRoom: (code: string) => void;
  matchmakingStatus: { gameId: string | null; status: 'IDLE' | 'SEARCHING' };
  onCancelMatchmaking: () => void;
}

const CATEGORY_MAP: Record<string, string> = {
  strategy: 'Trí Tuệ & Chiến Thuật',
  quiz: 'Đố Vui Đấu Trí',
  puzzle: 'Câu Đố Logic',
  memory: 'Trí Nhớ & Phản Xạ',
  math: 'Toán Học Vui'
};

const CATEGORY_COLORS: Record<string, string> = {
  strategy: 'bg-red-500/10 text-red-700 border-red-200',
  quiz: 'bg-blue-500/10 text-blue-700 border-blue-200',
  puzzle: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  memory: 'bg-amber-500/10 text-amber-700 border-amber-200',
  math: 'bg-purple-500/10 text-purple-700 border-purple-200'
};

export default function Catalog({
  onStartSolo,
  onJoinMatchmaking,
  onCreatePrivateRoom,
  onJoinPrivateRoom,
  matchmakingStatus,
  onCancelMatchmaking
}: CatalogProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [roomCodeInput, setRoomCodeInput] = useState('');

  const filteredGames = activeCategory === 'all'
    ? GAMES
    : GAMES.filter(g => g.category === activeCategory);

  const handleQuickMatch = (gameId: string) => {
    playRetroBeep(880, 'sine', 0.1);
    onJoinMatchmaking(gameId);
  };

  const handleJoinPrivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRoomCode(roomCodeInput)) return;
    onJoinPrivateRoom(roomCodeInput);
    setRoomCodeInput('');
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-4 sm:p-6">
      
      {/* Category Tabs / Filter select box */}
      <div className="border-b border-stone-200 pb-4 flex flex-col items-center gap-2">
        {/* Mobile Select Box */}
        <div className="w-full sm:hidden px-2">
          <label htmlFor="category-select" className="block text-[11px] font-mono text-stone-500 uppercase tracking-widest mb-1.5 text-center">
            Chọn Thể Loại Trò Chơi
          </label>
          <select
            id="category-select"
            value={activeCategory}
            onChange={(e) => {
              setActiveCategory(e.target.value);
              playRetroBeep(400, 'sine', 0.05);
            }}
            className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
          >
            <option value="all">Tất cả trò chơi ({GAMES.length})</option>
            {Object.entries(CATEGORY_MAP).map(([key, label]) => {
              const count = GAMES.filter(g => g.category === key).length;
              return (
                <option key={key} value={key}>
                  {label} ({count})
                </option>
              );
            })}
          </select>
        </div>

        {/* Desktop Buttons Filter */}
        <div className="hidden sm:flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => { setActiveCategory('all'); playRetroBeep(400); }}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-full cursor-pointer border transition-all
              ${activeCategory === 'all'
                ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
              }
            `}
          >
            Tất cả trò chơi
          </button>
          {Object.entries(CATEGORY_MAP).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setActiveCategory(key); playRetroBeep(400); }}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-full cursor-pointer border transition-all
                ${activeCategory === key
                  ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Private Room Quick Join Input */}
      <div className="w-full sm:max-w-md mx-auto bg-stone-50 border border-stone-200 p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 flex flex-col gap-0.5">
          <label htmlFor="room-code-direct" className="text-xs font-bold text-stone-700 flex items-center gap-1">
            <LogIn className="w-3.5 h-3.5 text-orange-500" /> VÀO PHÒNG BẰNG MÃ
          </label>
          <span id="room-code-help" className="text-[10px] sm:text-[9px] text-stone-500 leading-tight">Nhập hoặc dán mã phòng đấu 6 ký tự để vào chơi đấu trí</span>
        </div>
        <form onSubmit={handleJoinPrivate} className="flex gap-2 w-full sm:w-auto items-stretch">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              id="room-code-direct"
              maxLength={12}
              placeholder="MÃ PHÒNG"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(normalizeRoomCode(e.target.value))}
              required
              pattern="[A-Z0-9]{6}"
              autoCapitalize="characters"
              aria-describedby="room-code-help"
              className="bg-white border border-stone-300 rounded-xl text-xs py-2.5 px-3.5 text-center uppercase tracking-widest font-extrabold w-full sm:w-36 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold py-2.5 px-5 rounded-xl text-xs cursor-pointer transition-colors whitespace-nowrap active:scale-95"
          >
            Vào
          </button>
        </form>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGames.map((game: Game) => {
          const isSearchingThis = matchmakingStatus.status === 'SEARCHING' && matchmakingStatus.gameId === game.id;

          return (
            <div
              key={game.id}
              id={`game-card-${game.id}`}
              className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group"
            >
              {/* Category banner */}
              <div className="p-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[game.category]}`}>
                  {CATEGORY_MAP[game.category]}
                </span>
                <span className="text-[10px] text-stone-400 font-mono flex items-center gap-1">
                  <Users className="w-3 h-3" /> {game.minPlayers === game.maxPlayers ? `${game.minPlayers} Người` : `${game.minPlayers}-${game.maxPlayers} Người`}
                </span>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 flex flex-col gap-3">
                <h3 className="text-base sm:text-lg font-bold text-stone-800 tracking-tight flex items-center gap-1.5 group-hover:text-orange-500 transition-colors">
                  {game.name}
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed flex-1">
                  {game.description}
                </p>
              </div>

              {/* Actions footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-100 flex flex-col gap-2">
                {game.isRealTime ? (
                  <>
                    {isSearchingThis ? (
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] sm:text-xs text-orange-600 font-bold animate-pulse uppercase tracking-wider">
                          Đang tìm kiếm kỳ thủ đối kháng...
                        </span>
                        <button
                          onClick={onCancelMatchmaking}
                          className="w-full bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold py-2.5 md:py-2 rounded-xl text-xs cursor-pointer transition-all"
                        >
                          Hủy tìm kiếm
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            id={`quick-match-${game.id}`}
                            onClick={() => handleQuickMatch(game.id)}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 md:py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Swords className="w-4 h-4" /> Tìm Trận
                          </button>
                          <button
                            id={`create-room-${game.id}`}
                            onClick={() => {
                              playRetroBeep(440, 'triangle');
                              onCreatePrivateRoom(game.id);
                            }}
                            className="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold py-2.5 md:py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Play className="w-4 h-4" /> Tạo Phòng
                          </button>
                        </div>
                        <button
                          id={`play-solo-${game.id}`}
                          onClick={() => {
                            playRetroBeep(523, 'sine', 0.12);
                            onStartSolo(game.id);
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 md:py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Play className="w-4 h-4" /> Đấu Máy (Solo)
                        </button>
                      </div>
                    )}
                  </>
                ) : SOLO_GAMES.has(game.id) ? (
                  <button
                    id={`play-solo-${game.id}`}
                    onClick={() => {
                      playRetroBeep(523, 'sine', 0.12);
                      onStartSolo(game.id);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 md:py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Play className="w-4 h-4" /> Chơi Ngay (Solo)
                  </button>
                ) : (
                  <span className="block w-full text-center bg-stone-100 text-stone-400 font-bold py-2.5 md:py-2 rounded-xl text-[10px] uppercase tracking-wider">
                    Sắp ra mắt
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
