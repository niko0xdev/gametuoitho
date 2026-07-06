import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { playRetroBeep } from './CaroBoard.tsx';

interface OAnQuanBoardProps {
  boxes: number[];
  scores: number[];
  turn: string;
  userId: string;
  onMove: (move: { boxIndex: number; direction: 'cw' | 'ccw' }) => void;
  isSpectator: boolean;
  players: string[];
}

export default function OAnQuanBoard({
  boxes,
  scores,
  turn,
  userId,
  onMove,
  isSpectator,
  players
}: OAnQuanBoardProps) {
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const isMyTurn = turn === userId && !isSpectator;
  const playerIndex = players.indexOf(userId);

  const handleBoxSelect = (idx: number) => {
    if (!isMyTurn) return;
    if (idx === 10 || idx === 11) return; // Cannot pick mandarin boxes

    // Validate box owns to correct player side
    const isPlayer1Box = idx >= 0 && idx <= 4;
    const isCorrectSide = playerIndex === 0 ? isPlayer1Box : !isPlayer1Box;

    if (!isCorrectSide) return;
    if (boxes[idx] === 0) return;

    playRetroBeep(440, 'triangle', 0.05);
    setSelectedBox(idx);
  };

  const handleDirectionSelect = (direction: 'cw' | 'ccw') => {
    if (selectedBox === null) return;
    playRetroBeep(600, 'sine', 0.1);
    onMove({ boxIndex: selectedBox, direction });
    setSelectedBox(null);
  };

  // Render tiny dots to simulate actual cờ stones!
  const renderStones = (count: number, isMandarin = false) => {
    const dots = [];
    // Render up to 10 dots max to avoid crowding, otherwise add text
    const displayCount = Math.min(count, 12);
    for (let i = 0; i < displayCount; i++) {
      const offsetTheta = (i * (360 / displayCount)) * (Math.PI / 180);
      const radius = isMandarin ? 20 : 10;
      const x = Math.cos(offsetTheta) * radius;
      const y = Math.sin(offsetTheta) * radius;
      dots.push(
        <span
          key={i}
          style={{ transform: `translate(${x}px, ${y}px)` }}
          className={`absolute w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full shadow-sm border-[0.5px] border-stone-500
            ${isMandarin ? 'bg-amber-600' : 'bg-stone-300'}
          `}
        />
      );
    }
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {dots}
        <span className="absolute z-20 bg-white/80 text-black px-1 rounded text-[10px] sm:text-xs font-bold font-mono">
          {count}
        </span>
      </div>
    );
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
            Lượt đi của bạn - Chọn một ô dân
          </span>
        ) : (
          <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full uppercase tracking-wider">
            Chờ đối thủ rải sỏi
          </span>
        )}
      </div>

      {/* Scores dashboard */}
      <div className="flex justify-between w-full max-w-lg mb-6 bg-stone-100 p-3 rounded-lg border border-stone-200 shadow-sm">
        <div className="text-center">
          <span className="text-xs text-stone-500 font-semibold block">Đối thủ (Điểm quan/dân)</span>
          <span className="text-lg font-bold text-red-600 font-mono">{scores[playerIndex === 0 ? 1 : 0] || 0}</span>
        </div>
        <div className="text-center border-l border-stone-200 pl-6">
          <span className="text-xs text-stone-500 font-semibold block">Điểm của bạn</span>
          <span className="text-lg font-bold text-green-600 font-mono">{scores[playerIndex === 0 ? 0 : 1] || 0}</span>
        </div>
      </div>

      {/* Actual Ô Ăn Quan Board */}
      <div className="bg-amber-100 p-6 rounded-2xl border-4 border-amber-800 shadow-2xl w-[320px] sm:w-[540px] flex items-center justify-center relative">
        <div className="flex items-center justify-center border-2 border-amber-900 rounded-xl relative overflow-hidden bg-amber-50">
          
          {/* LEFT MANDARIN BOX (Index 10) */}
          <div className="w-12 h-24 sm:w-20 sm:h-36 border-r border-amber-900 bg-amber-200/50 flex items-center justify-center relative">
            <span className="absolute top-1 text-[8px] sm:text-xs font-serif font-bold text-amber-900/60 uppercase">QUAN TẢ</span>
            {renderStones(boxes[10], true)}
          </div>

          {/* MIDDLE DÂN GRID */}
          <div className="flex flex-col w-[200px] sm:w-[320px]">
            {/* Top row: index 9 to 5 (Left to Right) */}
            <div className="flex border-b border-amber-900">
              {[9, 8, 7, 6, 5].map((idx) => {
                const isSelected = selectedBox === idx;
                const isMySide = playerIndex === 1;
                return (
                  <button
                    key={idx}
                    id={`oaq-cell-${idx}`}
                    disabled={!isMyTurn || !isMySide || boxes[idx] === 0}
                    onClick={() => handleBoxSelect(idx)}
                    className={`w-10 h-12 sm:w-16 sm:h-18 border-r border-amber-900 last:border-r-0 flex items-center justify-center relative cursor-pointer transition-colors
                      ${isMyTurn && isMySide && boxes[idx] > 0 ? 'hover:bg-amber-200' : ''}
                      ${isSelected ? 'bg-amber-300 ring-2 ring-amber-600' : ''}
                    `}
                  >
                    {renderStones(boxes[idx])}
                  </button>
                );
              })}
            </div>

            {/* Bottom row: index 0 to 4 (Left to Right) */}
            <div className="flex">
              {[0, 1, 2, 3, 4].map((idx) => {
                const isSelected = selectedBox === idx;
                const isMySide = playerIndex === 0;
                return (
                  <button
                    key={idx}
                    id={`oaq-cell-${idx}`}
                    disabled={!isMyTurn || !isMySide || boxes[idx] === 0}
                    onClick={() => handleBoxSelect(idx)}
                    className={`w-10 h-12 sm:w-16 sm:h-18 border-r border-amber-900 last:border-r-0 flex items-center justify-center relative cursor-pointer transition-colors
                      ${isMyTurn && isMySide && boxes[idx] > 0 ? 'hover:bg-amber-200' : ''}
                      ${isSelected ? 'bg-amber-300 ring-2 ring-amber-600' : ''}
                    `}
                  >
                    {renderStones(boxes[idx])}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT MANDARIN BOX (Index 11) */}
          <div className="w-12 h-24 sm:w-20 sm:h-36 border-l border-amber-900 bg-amber-200/50 flex items-center justify-center relative">
            <span className="absolute top-1 text-[8px] sm:text-xs font-serif font-bold text-amber-900/60 uppercase">QUAN HỮU</span>
            {renderStones(boxes[11], true)}
          </div>
        </div>

        {/* Direction controllers (appear when a box is selected) */}
        {selectedBox !== null && (
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center gap-4 z-30">
            <h4 className="text-white text-sm sm:text-base font-bold">Rải sỏi theo hướng nào?</h4>
            <div className="flex gap-4">
              <button
                id="oaq-dir-cw"
                onClick={() => handleDirectionSelect('cw')}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow-lg cursor-pointer text-xs sm:text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> Cùng Chiều
              </button>
              <button
                id="oaq-dir-ccw"
                onClick={() => handleDirectionSelect('ccw')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-lg cursor-pointer text-xs sm:text-sm"
              >
                Ngược Chiều <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setSelectedBox(null)}
              className="text-white/80 hover:text-white text-xs underline cursor-pointer"
            >
              Hủy bỏ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
