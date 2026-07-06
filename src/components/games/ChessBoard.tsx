import React, { useState } from 'react';
import { playRetroBeep } from './CaroBoard.tsx';

interface ChessBoardProps {
  board: any[][];
  turn: string;
  userId: string;
  onMove: (move: { from: { r: number; c: number }; to: { r: number; c: number } }) => void;
  isSpectator: boolean;
}

const CHESS_UNICODE: Record<string, Record<string, string>> = {
  W: {
    K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟'
  },
  B: {
    K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟'
  }
};

const CHESS_NAMES_VN: Record<string, string> = {
  K: 'Vua', Q: 'Hậu', R: 'Xe', B: 'Tượng', N: 'Mã', P: 'Tốt'
};

export default function ChessBoard({
  board,
  turn,
  userId,
  onMove,
  isSpectator
}: ChessBoardProps) {
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const isMyTurn = turn === userId && !isSpectator;

  const handleCellClick = (r: number, c: number) => {
    if (!isMyTurn) return;

    const piece = board[r][c];

    if (selected) {
      if (selected.r === r && selected.c === c) {
        setSelected(null);
        return;
      }

      // If clicked on own piece, change selection
      if (piece && piece.color === board[selected.r][selected.c]?.color) {
        setSelected({ r, c });
        return;
      }

      // Execute move
      playRetroBeep(750, 'sawtooth', 0.08);
      onMove({ from: selected, to: { r, c } });
      setSelected(null);
    } else {
      if (piece) {
        setSelected({ r, c });
      }
    }
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
            Lượt đi của bạn
          </span>
        ) : (
          <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full uppercase tracking-wider">
            Chờ đối thủ đi cờ
          </span>
        )}
      </div>

      <div className="p-3 sm:p-5 bg-emerald-950 rounded-2xl shadow-2xl max-w-full overflow-auto">
        <div className="flex flex-col items-center">
          {/* Top coordinate labels */}
          <div className="flex w-[240px] sm:w-[360px] md:w-[400px] h-6 items-center pl-6 pr-6">
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((col) => (
              <span key={col} className="w-full text-center text-[10px] sm:text-xs font-mono font-bold text-emerald-300 uppercase">
                {col}
              </span>
            ))}
          </div>

          <div className="flex items-center">
            {/* Left coordinate labels (8-1) */}
            <div className="flex flex-col h-[240px] sm:h-[360px] md:h-[400px] w-6 justify-around items-center">
              {[8, 7, 6, 5, 4, 3, 2, 1].map((row) => (
                <span key={row} className="text-[10px] sm:text-xs font-mono font-bold text-emerald-300">
                  {row}
                </span>
              ))}
            </div>

            {/* The main 8x8 Board Grid */}
            <div className="grid grid-cols-8 grid-rows-8 border-4 border-emerald-900 w-[240px] h-[240px] sm:w-[360px] sm:h-[360px] md:w-[400px] md:h-[400px] shadow-inner">
              {board.map((row, r) =>
                row.map((cell, c) => {
                  const isDark = (r + c) % 2 === 1;
                  const isSelected = selected && selected.r === r && selected.c === c;
                  const glyph = cell ? CHESS_UNICODE[cell.color][cell.type] : '';

                  return (
                    <button
                      key={`${r}-${c}`}
                      id={`chess-cell-${r}-${c}`}
                      onClick={() => handleCellClick(r, c)}
                      className={`w-full h-full flex flex-col items-center justify-center cursor-pointer transition-all relative
                        ${isDark ? 'bg-emerald-800 hover:bg-emerald-700' : 'bg-stone-100 hover:bg-stone-200'}
                        ${isSelected ? 'ring-4 ring-amber-500 scale-105 z-10' : ''}
                      `}
                    >
                      {cell && (
                        <span
                          className={`text-3.5xl sm:text-5xl select-none leading-none transition-transform duration-200 hover:scale-115 active:scale-95
                            ${cell.color === 'W' 
                              ? 'text-[#faf8f5] drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)]' 
                              : 'text-[#1c1917] drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.5)]'
                            }
                          `}
                          style={{
                            WebkitTextStroke: cell.color === 'W' ? '1.5px #1c1917' : '1.5px #faf8f5',
                            paintOrder: 'stroke fill'
                          }}
                        >
                          {glyph}
                        </span>
                      )}

                      {/* Accessible Hover helper */}
                      {cell && (
                        <span className="absolute bottom-0 text-[7px] sm:text-[9px] font-mono leading-none opacity-0 hover:opacity-100 bg-black text-white px-0.5 rounded pointer-events-none z-20">
                          {cell.color === 'W' ? 'Trắng' : 'Đen'} {CHESS_NAMES_VN[cell.type]}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Right coordinate labels (8-1) */}
            <div className="flex flex-col h-[240px] sm:h-[360px] md:h-[400px] w-6 justify-around items-center">
              {[8, 7, 6, 5, 4, 3, 2, 1].map((row) => (
                <span key={row} className="text-[10px] sm:text-xs font-mono font-bold text-emerald-300">
                  {row}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom coordinate labels */}
          <div className="flex w-[240px] sm:w-[360px] md:w-[400px] h-6 items-center pl-6 pr-6">
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((col) => (
              <span key={col} className="w-full text-center text-[10px] sm:text-xs font-mono font-bold text-emerald-300 uppercase">
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
