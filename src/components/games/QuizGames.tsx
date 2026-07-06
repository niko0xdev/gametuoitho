import React, { useState } from 'react';
import { playRetroBeep } from './CaroBoard.tsx';
import { HelpCircle, AlertCircle } from 'lucide-react';

interface QuizGamesProps {
  gameId: string;
  state: any;
  userId: string;
  onMove: (move: any) => void;
  isSpectator: boolean;
  players: string[];
}

export default function QuizGames({
  gameId,
  state,
  userId,
  onMove,
  isSpectator,
  players
}: QuizGamesProps) {
  const [guessInput, setGuessInput] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  const isMyTurn = state.turnIndex !== undefined ? players[state.turnIndex] === userId && !isSpectator : true;

  // 1. ĐUỔI HÌNH BẮT CHỮ HANDLERS
  const handleBuzz = () => {
    if (isSpectator) return;
    playRetroBeep(400, 'sawtooth', 0.2);
    onMove({ action: 'BUZZ' });
  };

  const handleQuizSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    onMove({ action: 'SUBMIT', guess: guessInput.trim().toUpperCase() });
    setGuessInput('');
  };

  // 2. NỐI CHỮ HANDLERS
  const handleNoiChuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal('');

    const text = guessInput.trim();
    if (!text) return;

    if (text.split(/\s+/).length !== 2) {
      setErrorLocal('Từ nối phải có đúng 2 từ đơn (ví dụ: "sinh nhật")!');
      return;
    }

    onMove({ word: text });
    setGuessInput('');
  };

  // 3. ĐOÁN TỪ HANDLERS
  const handleDoanTuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal('');

    const text = guessInput.trim().toUpperCase();
    if (text.length !== 6) {
      setErrorLocal('Từ đoán phải có đúng 6 chữ cái!');
      return;
    }

    onMove({ guess: text });
    setGuessInput('');
  };

  // RENDER SVGS GỢI Ý CHO ĐUỔI HÌNH BẮT CHỮ
  const renderQuizImage = (imgClue: string) => {
    switch (imgClue) {
      case 'BA_HOA':
        return (
          <svg className="w-48 h-48 sm:w-64 sm:h-64 bg-amber-50 rounded-xl border border-amber-200" viewBox="0 0 100 100">
            {/* Spearker face */}
            <circle cx="35" cy="50" r="12" className="fill-peach-100 stroke-amber-800 stroke-[1.5]" />
            <circle cx="32" cy="46" r="1.5" className="fill-amber-900" />
            <path d="M 33 55 Q 38 58 35 50" className="fill-none stroke-amber-800 stroke-[1.5]" />
            {/* Speak bubbles with 3 flowers */}
            <path d="M 48 45 Q 65 30 85 45 Q 85 70 65 65 Z" className="fill-white stroke-stone-600 stroke-[1]" />
            {/* Flower 1 */}
            <circle cx="58" cy="45" r="3" className="fill-yellow-400 stroke-amber-800 stroke-[0.8]" />
            <circle cx="58" cy="45" r="1" className="fill-orange-500" />
            {/* Flower 2 */}
            <circle cx="68" cy="43" r="3" className="fill-yellow-400 stroke-amber-800 stroke-[0.8]" />
            <circle cx="68" cy="43" r="1" className="fill-orange-500" />
            {/* Flower 3 */}
            <circle cx="78" cy="47" r="3" className="fill-yellow-400 stroke-amber-800 stroke-[0.8]" />
            <circle cx="78" cy="47" r="1" className="fill-orange-500" />
            <text x="50" y="90" className="text-[6px] fill-stone-600 font-sans font-bold" textAnchor="middle">Gợi ý: Nói năng ba hoa khoác lác</text>
          </svg>
        );
      case 'CAT_TUONG':
        return (
          <svg className="w-48 h-48 sm:w-64 sm:h-64 bg-amber-50 rounded-xl border border-amber-200" viewBox="0 0 100 100">
            {/* Sand pile */}
            <path d="M 15 80 L 35 45 L 55 80 Z" className="fill-yellow-200 stroke-amber-800 stroke-[1.5]" />
            <text x="35" y="75" className="text-[6px] fill-amber-900 font-sans font-bold" textAnchor="middle">CÁT</text>
            {/* Wall */}
            <rect x="58" y="40" width="30" height="40" className="fill-red-400 stroke-red-800 stroke-[1.5]" />
            <line x1="58" y1="50" x2="88" y2="50" className="stroke-red-800" />
            <line x1="58" y1="60" x2="88" y2="60" className="stroke-red-800" />
            <line x1="58" y1="70" x2="88" y2="70" className="stroke-red-800" />
            <line x1="68" y1="40" x2="68" y2="80" className="stroke-red-800" />
            <line x1="78" y1="40" x2="78" y2="80" className="stroke-red-800" />
            <text x="73" y="62" className="text-[6px] fill-white font-sans font-bold" textAnchor="middle">TƯỜNG</text>
            <text x="50" y="90" className="text-[6px] fill-stone-600 font-sans font-bold" textAnchor="middle">Gợi ý: Điềm lành, vạn sự tốt lành</text>
          </svg>
        );
      case 'TAU_HOA':
        return (
          <svg className="w-48 h-48 sm:w-64 sm:h-64 bg-amber-50 rounded-xl border border-amber-200" viewBox="0 0 100 100">
            {/* Boat */}
            <path d="M 15 50 L 55 50 L 48 65 L 22 65 Z" className="fill-blue-200 stroke-blue-800 stroke-[1.5]" />
            <rect x="30" y="35" width="10" height="15" className="fill-stone-300 stroke-stone-800 stroke-[1]" />
            <text x="35" y="60" className="text-[6px] fill-stone-800 font-sans font-bold" textAnchor="middle">TÀU</text>
            {/* Fire */}
            <path d="M 62 70 Q 75 35 68 55 Q 85 40 78 70 Z" className="fill-orange-500 stroke-red-600 stroke-[1]" />
            <text x="73" y="80" className="text-[6px] fill-red-800 font-sans font-bold" textAnchor="middle">HỎA</text>
            <text x="50" y="90" className="text-[6px] fill-stone-600 font-sans font-bold" textAnchor="middle">Gợi ý: Xe lửa chạy bằng hơi nước cổ</text>
          </svg>
        );
      default:
        return (
          <div className="w-48 h-48 sm:w-64 sm:h-64 bg-amber-50 rounded-xl border border-amber-200 flex flex-col items-center justify-center">
            <HelpCircle className="w-12 h-12 text-amber-500 animate-bounce" />
            <span className="text-xs text-stone-500 font-semibold mt-2">Đang tải câu đố...</span>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-lg">
      
      {/* 1. DUOI HINH BAT CHU INTERFACE */}
      {gameId === 'duoi_hinh_bat_chu' && (
        <div className="flex flex-col items-center w-full bg-white p-6 rounded-xl border border-stone-200 shadow-lg">
          <div className="mb-4">
            {renderQuizImage(state.clue?.imgClue)}
          </div>

          {/* Buzzer controls */}
          <div className="flex flex-col items-center gap-4 w-full border-t border-stone-100 pt-4">
            {state.buzzerActive ? (
              <div className="text-center">
                <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full uppercase tracking-wider animate-pulse block mb-2">
                  Kỳ thủ {state.buzzerActive.substring(0, 5)} giành được quyền trả lời!
                </span>
                {state.buzzerActive === userId ? (
                  <form onSubmit={handleQuizSubmit} className="flex gap-2 w-full max-w-xs mt-2">
                    <input
                      type="text"
                      id="quiz-answer-input"
                      placeholder="Nhập câu trả lời viết liền..."
                      value={guessInput}
                      onChange={(e) => setGuessInput(e.target.value)}
                      className="flex-1 bg-stone-50 border border-stone-300 py-2 px-3 rounded-lg text-sm font-semibold uppercase tracking-widest text-center"
                      autoFocus
                    />
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer">
                      Gửi
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-stone-500">Đang chờ đối phương trả lời...</span>
                )}
              </div>
            ) : (
              <div className="text-center w-full">
                <button
                  id="buzz-btn"
                  disabled={isSpectator}
                  onClick={handleBuzz}
                  className="w-24 h-24 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-full shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1 border-4 border-red-200"
                >
                  🔔
                  <span>BẤM CHUÔNG</span>
                </button>
                <span className="text-[10px] text-stone-500 block mt-2">Bấm chuông thật nhanh để giành quyền trả lời câu đố!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. NỐI CHỮ INTERFACE */}
      {gameId === 'noi_chu' && (
        <div className="flex flex-col w-full bg-white p-6 rounded-xl border border-stone-200 shadow-lg">
          <div className="text-center mb-4">
            <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider">Từ nối hiện tại:</span>
            <div className="text-2xl font-extrabold text-blue-600 tracking-wide mt-1 animate-scaleIn">
              "{state.currentWord}"
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Từ nối tiếp theo bắt đầu bằng chữ "{state.currentWord?.trim().split(/\s+/).pop()}"</p>
          </div>

          {/* Word list history */}
          <div className="bg-stone-50 border border-stone-200 p-3 rounded-lg h-36 overflow-y-auto flex flex-col gap-2 mb-4">
            {state.history?.map((word: string, i: number) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs
                  ${i % 2 === 0 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}
                `}>
                  {word}
                </span>
              </div>
            ))}
          </div>

          {/* Word form */}
          {isMyTurn ? (
            <form onSubmit={handleNoiChuSubmit} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  id="noichu-word-input"
                  placeholder="Nhập 2 chữ từ nối tiếng Việt..."
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  className="flex-1 bg-stone-50 border border-stone-300 py-2 px-3 rounded-lg text-sm font-semibold"
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer">
                  Nối Từ
                </button>
              </div>
              {errorLocal && (
                <div className="text-red-600 text-xs flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errorLocal}
                </div>
              )}
            </form>
          ) : (
            <div className="text-center py-2 text-xs text-stone-500 italic bg-stone-50 rounded-lg">
              Chờ đối phương nối chữ...
            </div>
          )}
        </div>
      )}

      {/* 3. ĐOÁN TỪ INTERFACE (WORDLE) */}
      {gameId === 'doan_tu' && (
        <div className="flex flex-col items-center w-full bg-white p-6 rounded-xl border border-stone-200 shadow-lg">
          
          {/* Wordle grids */}
          <div className="flex flex-col gap-1.5 mb-6">
            {(state.guesses?.[userId] || []).map((item: any, gIdx: number) => (
              <div key={gIdx} className="flex gap-1.5">
                {item.guess.split('').map((letter: string, lIdx: number) => {
                  const color = item.feedback[lIdx];
                  const colorClass = color === 'green' ? 'bg-green-500 text-white border-green-500' :
                                     color === 'yellow' ? 'bg-yellow-500 text-white border-yellow-500' :
                                     'bg-stone-500 text-white border-stone-500';

                  return (
                    <div key={lIdx} className={`w-8 h-8 sm:w-10 sm:h-10 border border-stone-300 rounded-lg flex items-center justify-center text-sm sm:text-base font-bold uppercase select-none shadow-xs ${colorClass}`}>
                      {letter}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Pad remaining guesses */}
            {Array(Math.max(0, 6 - (state.guesses?.[userId] || []).length)).fill(null).map((_, i) => (
              <div key={i} className="flex gap-1.5">
                {Array(6).fill(null).map((_, j) => (
                  <div key={j} className="w-8 h-8 sm:w-10 sm:h-10 border border-stone-200 bg-stone-50 rounded-lg flex items-center justify-center text-sm sm:text-base font-bold select-none" />
                ))}
              </div>
            ))}
          </div>

          {/* Input Guess Box */}
          {isMyTurn ? (
            <form onSubmit={handleDoanTuSubmit} className="flex flex-col gap-2 w-full max-w-xs">
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  id="doantu-word-input"
                  placeholder="Nhập 6 ký tự viết liền..."
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-stone-50 border border-stone-300 py-2 px-3 rounded-lg text-sm font-semibold uppercase tracking-widest text-center"
                />
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer">
                  Đoán
                </button>
              </div>
              {errorLocal && (
                <div className="text-red-600 text-xs flex items-center gap-1 justify-center mt-1">
                  <AlertCircle className="w-3 h-3" /> {errorLocal}
                </div>
              )}
            </form>
          ) : (
            <div className="text-center py-2 text-xs text-stone-500 italic bg-stone-50 rounded-lg w-full">
              Chờ đối phương suy luận...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
