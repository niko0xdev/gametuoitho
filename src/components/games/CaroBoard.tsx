import React from 'react';

interface CaroBoardProps {
  board: (string | null)[][];
  turn: string;
  userId: string;
  onMove: (move: { r: number; c: number }) => void;
  isSpectator: boolean;
  lastMove?: { r: number; c: number; symbol: string } | null;
}

export const playRetroBeep = (freq = 800, type: OscillatorType = 'sine', duration = 0.08) => {
  try {
    if (localStorage.getItem('sound_enabled') === 'false') return;
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Ignore audio context lock or failures
  }
};

export default function CaroBoard({
  board,
  turn,
  userId,
  onMove,
  isSpectator,
  lastMove
}: CaroBoardProps) {
  const isMyTurn = turn === userId && !isSpectator;

  const handleClick = (r: number, c: number) => {
    if (!isMyTurn) return;
    if (board[r][c] !== null) return;
    playRetroBeep(900, 'sine', 0.1);
    onMove({ r, c });
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

      <div className="grid grid-cols-15 gap-[1px] p-2 bg-stone-400 rounded-lg shadow-inner overflow-auto max-w-full">
        {board.map((row, r) =>
          row.map((cell, c) => {
            const isLast = lastMove && lastMove.r === r && lastMove.c === c;
            return (
              <button
                key={`${r}-${c}`}
                id={`caro-cell-${r}-${c}`}
                disabled={!isMyTurn || cell !== null}
                onClick={() => handleClick(r, c)}
                className={`w-7 h-7 sm:w-9 sm:h-9 bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-lg cursor-pointer transition-colors relative
                  ${cell === null && isMyTurn ? 'hover:bg-green-50' : ''}
                  ${isLast ? 'bg-amber-100' : ''}
                `}
              >
                {cell === 'X' && (
                  <span className="text-red-500 animate-scaleIn select-none font-sans text-xl">X</span>
                )}
                {cell === 'O' && (
                  <span className="text-blue-500 animate-scaleIn select-none font-sans text-xl">O</span>
                )}

                {/* Highlight last move */}
                {isLast && (
                  <span className="absolute w-2 h-2 rounded-full bg-amber-500 -top-0.5 -right-0.5" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
