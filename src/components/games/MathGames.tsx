import React, { useEffect, useState } from 'react';
import { playRetroBeep } from './CaroBoard.tsx';
import { HelpCircle, Check, X, Award, Brain } from 'lucide-react';

interface MathGamesProps {
  gameId: string;
  state: any;
  userId: string;
  onMove: (move: any) => void;
  isSpectator: boolean;
  players: string[];
}

export default function MathGames({
  gameId,
  state,
  userId,
  onMove,
  isSpectator,
  players
}: MathGamesProps) {
  const [localLastAnswer, setLocalLastAnswer] = useState<boolean | null>(null);
  const [prevRound, setPrevRound] = useState<number>(state.round);

  // Detect when the round advances to clear local states
  useEffect(() => {
    if (state.round !== prevRound) {
      setLocalLastAnswer(null);
      setPrevRound(state.round);
    }
  }, [state.round, prevRound]);

  // Retrieve player names/profiles
  const myScore = state.scores[userId] || 0;
  const opponentId = players.find(p => p !== userId) || 'bot_computer';
  const opponentScore = state.scores[opponentId] || 0;

  const handleSpeedMathAnswer = (answer: boolean) => {
    if (isSpectator) return;
    if (state.answers[userId] !== null) return;

    // Check if correct to play appropriate retro sound
    const isCorrectResult = answer === state.equation.isCorrect;
    if (isCorrectResult) {
      playRetroBeep(784, 'sine', 0.15); // High G note
    } else {
      playRetroBeep(196, 'sawtooth', 0.25); // Low G note
    }

    setLocalLastAnswer(isCorrectResult);
    onMove({ action: 'ANSWER', answer });
  };

  const handlePatternChoiceSubmit = (choice: number) => {
    if (isSpectator) return;

    const isCorrectChoice = choice === state.pattern.answer;
    if (isCorrectChoice) {
      playRetroBeep(880, 'sine', 0.15); // A5 note
    } else {
      playRetroBeep(220, 'sawtooth', 0.25); // A3 note
    }

    onMove({ action: 'SUBMIT', answer: choice });
  };

  // 1. TÍNH NHẨM SIÊU TỐC (speed_math)
  if (gameId === 'speed_math') {
    const hasAnswered = state.answers[userId] !== null;
    const opponentHasAnswered = state.answers[opponentId] !== null;

    return (
      <div className="w-full max-w-xl mx-auto p-4 flex flex-col items-center gap-6">
        {/* Info row */}
        <div className="flex items-center justify-between w-full border-b border-stone-200 pb-3 mb-2">
          <span className="text-xs font-extrabold uppercase text-orange-600 font-mono">
            VÒNG {state.round} / 10
          </span>
          <div className="flex gap-4 text-xs font-bold text-stone-700">
            <span className="flex items-center gap-1">
              Bạn: <b className="text-stone-900 text-sm font-mono">{myScore}</b>đ
            </span>
            <span className="text-stone-300">|</span>
            <span className="flex items-center gap-1">
              {opponentId === 'bot_computer' ? 'Máy' : 'Đối Thủ'}: <b className="text-stone-900 text-sm font-mono">{opponentScore}</b>đ
            </span>
          </div>
        </div>

        {/* Equation stage */}
        <div className="w-full bg-stone-900 text-green-400 font-mono py-10 px-6 rounded-2xl border-4 border-stone-800 shadow-inner flex flex-col items-center justify-center min-h-[160px] relative overflow-hidden">
          <div className="absolute top-2 left-3 text-[9px] text-stone-500 font-semibold tracking-wider">MATH_SOLVER_CRT</div>
          <span className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-widest animate-pulse">
            {state.equation.text}
          </span>
          
          {hasAnswered && (
            <div className="absolute inset-0 bg-stone-900/90 flex flex-col items-center justify-center animate-fade-in">
              {localLastAnswer === true ? (
                <div className="flex flex-col items-center text-emerald-500 gap-1">
                  <Check className="w-12 h-12 stroke-[3]" />
                  <span className="text-xs font-bold uppercase tracking-widest font-sans">Chính xác! (+10đ)</span>
                </div>
              ) : localLastAnswer === false ? (
                <div className="flex flex-col items-center text-red-500 gap-1">
                  <X className="w-12 h-12 stroke-[3]" />
                  <span className="text-xs font-bold uppercase tracking-widest font-sans">Sai rồi! (-5đ)</span>
                </div>
              ) : (
                <span className="text-xs text-stone-400 font-sans animate-pulse">Đã khóa câu trả lời...</span>
              )}
            </div>
          )}
        </div>

        {/* Status Prompt */}
        <div className="text-xs text-center font-bold text-stone-500 min-h-[20px]">
          {hasAnswered && !opponentHasAnswered && "Đang chờ máy tính đưa ra đáp án..."}
          {hasAnswered && opponentHasAnswered && "Tất cả đã trả lời. Vòng mới bắt đầu..."}
          {!hasAnswered && "Phép tính trên ĐÚNG hay SAI?"}
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            onClick={() => handleSpeedMathAnswer(true)}
            disabled={hasAnswered || isSpectator}
            className={`py-4 rounded-xl font-bold text-sm cursor-pointer transition-all border flex flex-col items-center justify-center gap-1
              ${hasAnswered 
                ? 'bg-stone-100 border-stone-200 text-stone-400' 
                : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 hover:scale-102 active:scale-98 shadow-sm hover:shadow-md'
              }
            `}
          >
            <Check className="w-5 h-5 stroke-[2.5]" />
            ĐÚNG
          </button>
          <button
            onClick={() => handleSpeedMathAnswer(false)}
            disabled={hasAnswered || isSpectator}
            className={`py-4 rounded-xl font-bold text-sm cursor-pointer transition-all border flex flex-col items-center justify-center gap-1
              ${hasAnswered 
                ? 'bg-stone-100 border-stone-200 text-stone-400' 
                : 'bg-rose-500 hover:bg-rose-600 text-white border-rose-600 hover:scale-102 active:scale-98 shadow-sm hover:shadow-md'
              }
            `}
          >
            <X className="w-5 h-5 stroke-[2.5]" />
            SAI
          </button>
        </div>
      </div>
    );
  }

  // 2. QUY LUẬT CON SỐ (number_pattern)
  if (gameId === 'number_pattern') {
    return (
      <div className="w-full max-w-xl mx-auto p-4 flex flex-col items-center gap-6">
        {/* Info row */}
        <div className="flex items-center justify-between w-full border-b border-stone-200 pb-3 mb-2">
          <div className="flex items-center gap-1 text-xs font-extrabold uppercase text-orange-600 font-mono">
            <Brain className="w-4 h-4" /> CẤP ĐỘ {state.round} / 5
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-stone-700">
            <Award className="w-4 h-4 text-amber-500" />
            Điểm số: <b className="text-stone-900 text-sm font-mono">{myScore}</b>đ
          </div>
        </div>

        {/* Question intro */}
        <div className="text-center">
          <h3 className="text-sm font-bold text-stone-700 mb-1">Tìm số thích hợp thay thế dấu chấm hỏi</h3>
          <p className="text-[10px] text-stone-400">Quan sát dãy số bên dưới và tìm ra logic tăng giảm</p>
        </div>

        {/* Display sequence */}
        <div className="w-full bg-white border-2 border-stone-200 rounded-2xl p-6 shadow-sm flex items-center justify-center gap-2 sm:gap-4 font-mono font-extrabold text-xl sm:text-2xl text-stone-800">
          {state.pattern.sequence.map((num: any, idx: number) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-stone-300 text-sm">&bull;</span>}
              <div 
                className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl border-2 shadow-xs transition-all
                  ${num === '?' 
                    ? 'bg-orange-50 border-orange-400 text-orange-600 scale-105 animate-pulse' 
                    : 'bg-stone-50 border-stone-200 text-stone-700'
                  }
                `}
              >
                {num}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Choices grid */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {state.pattern.choices.map((choice: number) => (
            <button
              key={choice}
              onClick={() => handlePatternChoiceSubmit(choice)}
              disabled={isSpectator}
              className="bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-orange-300 text-stone-700 font-mono font-extrabold py-3.5 rounded-xl text-base cursor-pointer transition-all hover:scale-102 active:scale-98 shadow-xs"
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
