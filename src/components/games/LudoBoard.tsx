import React, { useState } from 'react';
import { playRetroBeep } from './CaroBoard.tsx';

interface Horse {
  id: string;
  pos: string; // 'S', 0..47, 'H1'..'H6'
  stepCount: number;
}

interface LudoBoardProps {
  horses: Horse[][];
  turn: string;
  userId: string;
  diceRoll: number | null;
  diceStatus: 'NEED_ROLL' | 'NEED_MOVE';
  onMove: (move: { action: 'ROLL_DICE' | 'MOVE_HORSE'; horseIdx?: number }) => void;
  isSpectator: boolean;
  players: string[];
}

const PLAYER_COLORS = ['bg-red-500 text-white', 'bg-blue-500 text-white', 'bg-green-500 text-white', 'bg-yellow-500 text-stone-900'];
const PLAYER_NAMES_VN = ['Đỏ (Đông)', 'Xanh Dương (Tây)', 'Xanh Lá (Nam)', 'Vàng (Bắc)'];

export default function LudoBoard({
  horses,
  turn,
  userId,
  diceRoll,
  diceStatus,
  onMove,
  isSpectator,
  players
}: LudoBoardProps) {
  const [isRolling, setIsRolling] = useState(false);
  const playerIndex = players.indexOf(userId);
  const isMyTurn = turn === userId && !isSpectator;

  const handleRoll = () => {
    if (!isMyTurn || diceStatus !== 'NEED_ROLL') return;

    setIsRolling(true);
    playRetroBeep(300, 'sawtooth', 0.15);

    setTimeout(() => {
      onMove({ action: 'ROLL_DICE' });
      setIsRolling(false);
    }, 600);
  };

  const handleHorseClick = (horseIdx: number) => {
    if (!isMyTurn || diceStatus !== 'NEED_MOVE') return;
    playRetroBeep(500, 'sine', 0.1);
    onMove({ action: 'MOVE_HORSE', horseIdx });
  };

  // Coordinates helper to make a circular layout for the 48 track positions
  const getTrackCoords = (posStr: string) => {
    const pos = parseInt(posStr);
    if (isNaN(pos)) return { x: 50, y: 50 };

    // Arrange 48 spots in a square or circular loop
    const angle = (pos * (360 / 48)) * (Math.PI / 180);
    const radius = 38; // Radius percent
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    return { x, y };
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 text-center">
        {isSpectator ? (
          <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full uppercase tracking-wider">
            Bạn đang xem trực tiếp
          </span>
        ) : isMyTurn ? (
          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full animate-pulse uppercase tracking-wider">
            Lượt đi của bạn - {diceStatus === 'NEED_ROLL' ? 'Hãy gieo xúc xắc!' : 'Hãy đi một con ngựa!'}
          </span>
        ) : (
          <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full uppercase tracking-wider">
            Chờ đối thủ đua ngựa
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6 max-w-full">
        {/* Play board rendering using responsive SVG canvas */}
        <div className="relative w-72 h-72 sm:w-96 sm:h-96 bg-stone-100 border-4 border-stone-800 rounded-2xl shadow-xl overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {/* Draw 48 track loops */}
            {Array(48).fill(null).map((_, i) => {
              const { x, y } = getTrackCoords(String(i));
              // Player start markers colors
              let color = 'stroke-stone-400 fill-stone-100';
              if (i === 0) color = 'stroke-red-500 fill-red-100';
              if (i === 12) color = 'stroke-blue-500 fill-blue-100';
              if (i === 24) color = 'stroke-green-500 fill-green-100';
              if (i === 36) color = 'stroke-yellow-500 fill-yellow-100';

              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="2.5"
                  className={`${color} stroke-[0.8]`}
                />
              );
            })}

            {/* Render Home destinations (center box) */}
            <rect x="42" y="42" width="16" height="16" rx="2" className="fill-stone-200 stroke-stone-500 stroke-[0.5]" />
            <text x="50" y="51" className="text-[3px] font-sans font-bold fill-stone-600 text-center" textAnchor="middle">Chuồng Đích</text>

            {/* Player stables positions labels */}
            <text x="20" y="20" className="text-[2.5px] font-bold fill-red-600" textAnchor="middle">Chuồng Đỏ</text>
            <text x="80" y="20" className="text-[2.5px] font-bold fill-blue-600" textAnchor="middle">Chuồng Xanh Dương</text>
            <text x="80" y="80" className="text-[2.5px] font-bold fill-green-600" textAnchor="middle">Chuồng Xanh Lá</text>
            <text x="20" y="80" className="text-[2.5px] font-bold fill-yellow-600" textAnchor="middle">Chuồng Vàng</text>
          </svg>

          {/* Horse markers overlays */}
          {horses.map((pHorses, pIdx) =>
            pHorses.map((h, hIdx) => {
              let x = 50;
              let y = 50;

              if (h.pos === 'S') {
                // Stable positions
                const config = [
                  { x: 15, y: 15 },
                  { x: 75, y: 15 },
                  { x: 75, y: 75 },
                  { x: 15, y: 75 }
                ][pIdx];
                x = config.x + (hIdx % 2) * 8 - 4;
                y = config.y + Math.floor(hIdx / 2) * 8 - 4;
              } else if (h.pos.startsWith('H')) {
                // Home stretch positions (H1..H6 radial)
                const rank = parseInt(h.pos.substring(1));
                const angle = (pIdx * 90) * (Math.PI / 180);
                const radius = 10 + rank * 4.5;
                x = 50 + Math.cos(angle) * radius;
                y = 50 + Math.sin(angle) * radius;
              } else {
                // Track spots coords
                const coords = getTrackCoords(h.pos);
                x = coords.x;
                y = coords.y;
              }

              const isOwner = pIdx === playerIndex;

              return (
                <div
                  key={h.id}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-stone-800 flex items-center justify-center font-bold text-[7px] sm:text-[10px] select-none shadow-md z-20 transition-all duration-300
                    ${pIdx === 0 ? 'bg-red-500 text-white' : ''}
                    ${pIdx === 1 ? 'bg-blue-500 text-white' : ''}
                    ${pIdx === 2 ? 'bg-green-500 text-white' : ''}
                    ${pIdx === 3 ? 'bg-yellow-500 text-stone-900' : ''}
                    ${isMyTurn && isOwner && diceStatus === 'NEED_MOVE' ? 'cursor-pointer hover:scale-125 ring-2 ring-white animate-bounce' : ''}
                  `}
                  onClick={() => isOwner && handleHorseClick(hIdx)}
                >
                  ♘{hIdx + 1}
                </div>
              );
            })
          )}
        </div>

        {/* Dice control and instructions panel */}
        <div className="flex flex-col items-center gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200 shadow-inner w-56">
          <h4 className="text-stone-700 font-bold text-xs uppercase tracking-wider">Đổ xúc xắc</h4>

          <button
            id="ludo-roll-dice"
            disabled={!isMyTurn || diceStatus !== 'NEED_ROLL' || isRolling}
            onClick={handleRoll}
            className={`w-16 h-16 sm:w-20 sm:h-20 bg-white border-2 border-stone-800 rounded-xl flex items-center justify-center text-4xl shadow-md cursor-pointer transition-transform
              ${isMyTurn && diceStatus === 'NEED_ROLL' ? 'hover:scale-105 active:scale-95 border-green-600 ring-2 ring-green-100' : 'opacity-60'}
              ${isRolling ? 'animate-spin' : ''}
            `}
          >
            {diceRoll ? ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][diceRoll - 1] : '🎲'}
          </button>

          {diceRoll && (
            <div className="text-center">
              <span className="text-xs text-stone-500">Xúc xắc đã gieo</span>
              <div className="text-lg font-bold text-stone-800 font-mono">Điểm: {diceRoll}</div>
            </div>
          )}

          <div className="text-[10px] text-stone-500 leading-relaxed border-t border-stone-200 pt-2 w-full">
            <span className="font-bold text-stone-700 block mb-1">Gợi ý:</span>
            - Điểm 6 được ra quân từ chuồng.<br />
            - Điểm 6 được quyền đổ thêm lượt nữa.<br />
            - Điểm đá bay ngựa đối thủ nếu đậu trùng ô.
          </div>
        </div>
      </div>
    </div>
  );
}
