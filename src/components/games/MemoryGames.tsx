import React, { useEffect, useState, useRef } from 'react';
import { playRetroBeep } from './CaroBoard.tsx';
import { Brain, HelpCircle, Eye, RefreshCw, Zap, Play } from 'lucide-react';

interface MemoryGamesProps {
  gameId: string;
  state: any;
  userId: string;
  onMove: (move: any) => void;
  isSpectator: boolean;
  players: string[];
}

export default function MemoryGames({
  gameId,
  state,
  userId,
  onMove,
  isSpectator,
  players
}: MemoryGamesProps) {
  // --- Simon Says specific hooks ---
  const [activeButton, setActiveButton] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const simonTimerRef = useRef<any>(null);

  // --- Reflex specific hooks ---
  const [reflexReadyTimer, setReflexReadyTimer] = useState<any>(null);

  // Clear Simon timers on unmount
  useEffect(() => {
    return () => {
      if (simonTimerRef.current) clearTimeout(simonTimerRef.current);
      if (reflexReadyTimer) clearTimeout(reflexReadyTimer);
    };
  }, [reflexReadyTimer]);

  // Audio mapping for Simon Says
  const playSimonTone = (index: number) => {
    const tones = [261.63, 329.63, 392.00, 440.00]; // C4, E4, G4, A4
    const waveTypes: OscillatorType[] = ['sine', 'triangle', 'sawtooth', 'square'];
    playRetroBeep(tones[index] || 300, 'sine', 0.15);
  };

  // Run the sequence replay for Simon Says
  useEffect(() => {
    if (gameId === 'simon_says' && state.status === 'PLAYING_SEQUENCE' && !isFlashing) {
      setIsFlashing(true);
      let step = 0;
      const seq = state.sequence;

      const flashNext = () => {
        if (step < seq.length) {
          const colorIdx = seq[step];
          setActiveButton(colorIdx);
          playSimonTone(colorIdx);

          simonTimerRef.current = setTimeout(() => {
            setActiveButton(null);
            step++;
            simonTimerRef.current = setTimeout(flashNext, 200);
          }, 450);
        } else {
          // Finished flashing, let server know we can accept input
          setIsFlashing(false);
          onMove({ action: 'START_INPUT' });
        }
      };

      // Delay sequence start slightly
      simonTimerRef.current = setTimeout(flashNext, 800);
    }
  }, [gameId, state.round, state.status]);

  // Handle reflex game auto-transitions
  useEffect(() => {
    if (gameId === 'reflex' && state.screenState === 'WAITING' && !reflexReadyTimer) {
      const delay = 1500 + Math.random() * 2500; // 1.5s - 4.0s
      const timer = setTimeout(() => {
        if (state.screenState === 'WAITING') {
          playRetroBeep(880, 'sine', 0.2); // Green signal sound
          onMove({ action: 'TRIGGER_GREEN', timestamp: Date.now() });
        }
      }, delay);
      setReflexReadyTimer(timer);
    } else if (gameId === 'reflex' && state.screenState !== 'WAITING' && reflexReadyTimer) {
      clearTimeout(reflexReadyTimer);
      setReflexReadyTimer(null);
    }
  }, [gameId, state.round, state.screenState]);

  // 1. LẬT BÀI TRÙNG KHỚP (memory_match)
  if (gameId === 'memory_match') {
    const isMyTurn = players[state.turnIndex] === userId && !isSpectator;
    const myScore = state.scores[userId] || 0;
    const opponentId = players.find(p => p !== userId) || 'bot_computer';
    const opponentScore = state.scores[opponentId] || 0;

    const handleCardFlip = (index: number) => {
      if (isSpectator) return;
      if (!isMyTurn) return;
      if (state.cards[index].isFlipped || state.cards[index].isMatched) return;

      playRetroBeep(523, 'sine', 0.08); // C5 flip beep
      onMove({ action: 'FLIP', index });
    };

    return (
      <div className="w-full max-w-xl mx-auto p-4 flex flex-col items-center gap-6">
        {/* Header display */}
        <div className="flex items-center justify-between w-full border-b border-stone-200 pb-3 mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isMyTurn ? 'bg-green-500 animate-ping' : 'bg-stone-300'}`} />
            <span className="text-xs font-extrabold uppercase text-stone-600 font-mono">
              {isMyTurn ? 'Lượt của bạn' : `Lượt của ${opponentId === 'bot_computer' ? '🤖 Máy' : 'Đối thủ'}`}
            </span>
          </div>
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

        {/* 4x4 Grid of Cards */}
        <div className="grid grid-cols-4 gap-3 p-4 bg-stone-100 rounded-2xl border-2 border-stone-200 shadow-inner w-full aspect-square max-w-[340px]">
          {state.cards.map((card: any, idx: number) => {
            const isFlipped = card.isFlipped || card.isMatched;
            const isSelected = state.selectedIndices.includes(idx);

            return (
              <button
                key={card.id}
                onClick={() => handleCardFlip(idx)}
                disabled={isSpectator || !isMyTurn || isFlipped}
                className={`w-full aspect-square rounded-xl text-2xl flex items-center justify-center cursor-pointer border-2 transition-all duration-300 transform select-none
                  ${card.isMatched 
                    ? 'bg-emerald-50 border-emerald-200 opacity-60 scale-95 cursor-default' 
                    : isFlipped 
                      ? 'bg-white border-orange-400 rotate-y-180 scale-102 shadow-sm' 
                      : 'bg-stone-800 border-stone-700 hover:bg-stone-700 text-stone-400 hover:scale-102 active:scale-95 shadow-md'
                  }
                `}
              >
                {isFlipped ? (
                  <span className="animate-fade-in">{card.symbol}</span>
                ) : (
                  <span className="text-base font-bold font-serif opacity-35">?</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Subtext info */}
        <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider text-center">
          Nhớ vị trí biểu tượng để lật các cặp trùng nhau. Match được đi tiếp!
        </div>
      </div>
    );
  }

  // 2. TRÍ NHỚ ÂM THANH (simon_says)
  if (gameId === 'simon_says') {
    const myScore = state.scores[userId] || 0;
    const isInputMode = state.status === 'PLAYER_INPUT';

    const handleSimonTap = (index: number) => {
      if (isSpectator) return;
      if (!isInputMode) return;

      playSimonTone(index);
      onMove({ action: 'TAP', colorIndex: index });
    };

    // Color definitions
    const colors = [
      { name: 'Xanh Lá', bg: 'bg-green-600', activeBg: 'bg-green-400 border-green-200 shadow-green-500/50' },
      { name: 'Đỏ', bg: 'bg-red-600', activeBg: 'bg-red-400 border-red-200 shadow-red-500/50' },
      { name: 'Vàng', bg: 'bg-yellow-500', activeBg: 'bg-yellow-300 border-yellow-200 shadow-yellow-500/50' },
      { name: 'Xanh Dương', bg: 'bg-blue-600', activeBg: 'bg-blue-400 border-blue-200 shadow-blue-500/50' }
    ];

    return (
      <div className="w-full max-w-xl mx-auto p-4 flex flex-col items-center gap-6">
        {/* Header bar */}
        <div className="flex items-center justify-between w-full border-b border-stone-200 pb-3 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-orange-600 font-mono">
            <Brain className="w-4 h-4" /> TRÍ NHỚ ÂM THANH
          </div>
          <div className="text-xs font-bold text-stone-700">
            Cấp độ đạt được: <b className="text-orange-600 text-sm font-mono">{myScore}</b>
          </div>
        </div>

        {/* Central Display Console */}
        <div className="text-center font-extrabold text-sm uppercase tracking-widest text-stone-500 py-1 px-4 bg-stone-100 rounded-full border border-stone-200 mb-2">
          {state.status === 'GAME_OVER' ? (
            <span className="text-red-500 animate-pulse">TRÒ CHƠI KẾT THÚC!</span>
          ) : isInputMode ? (
            <span className="text-green-600 animate-pulse">HÃY LẶP LẠI CHUỖI ({state.playerSequence.length}/{state.sequence.length})</span>
          ) : (
            <span className="text-orange-500">ĐANG PHÁT QUY LUẬT CHUỖI...</span>
          )}
        </div>

        {/* 2x2 Colorful Simon Board */}
        <div className="grid grid-cols-2 gap-4 p-5 bg-stone-950 rounded-full border-8 border-stone-800 shadow-xl w-full aspect-square max-w-[280px]">
          {colors.map((color, idx) => {
            const isActive = activeButton === idx;
            return (
              <button
                key={idx}
                onClick={() => handleSimonTap(idx)}
                disabled={isSpectator || !isInputMode || state.status === 'GAME_OVER'}
                className={`w-full aspect-square rounded-tl-full rounded-br-full rounded-bl-3xl rounded-tr-3xl cursor-pointer border-4 border-stone-900 transition-all duration-150 transform active:scale-95 hover:brightness-110
                  ${idx === 1 ? 'rounded-tr-full rounded-bl-full rounded-tl-3xl rounded-br-3xl' : ''}
                  ${idx === 2 ? 'rounded-bl-full rounded-tr-full rounded-tl-3xl rounded-br-3xl' : ''}
                  ${idx === 3 ? 'rounded-br-full rounded-tl-full rounded-tr-3xl rounded-bl-3xl' : ''}
                  ${isActive 
                    ? `${color.activeBg} brightness-125 scale-102 border-white shadow-lg` 
                    : `${color.bg} opacity-75`
                  }
                  ${!isInputMode ? 'cursor-default pointer-events-none' : ''}
                `}
                aria-label={`Gõ ${color.name}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // 3. PHẢN XẠ SIÊU TỐC (reflex)
  if (gameId === 'reflex') {
    const roundScores = state.reactionTimes || [];
    const myScore = state.scores[userId] || 0;

    const handleClickTrigger = () => {
      if (isSpectator) return;
      if (state.screenState === 'RESULT' || state.screenState === 'TOO_EARLY') return;

      if (state.screenState === 'WAITING') {
        playRetroBeep(220, 'sawtooth', 0.25); // Buzz error
      } else {
        playRetroBeep(659, 'sine', 0.1); // High pitch click beep
      }
      onMove({ action: 'CLICK' });
    };

    const handleNextRound = () => {
      playRetroBeep(440, 'sine', 0.05);
      onMove({ action: 'NEXT_ROUND' });
    };

    return (
      <div className="w-full max-w-xl mx-auto p-4 flex flex-col items-center gap-6">
        {/* Header display */}
        <div className="flex items-center justify-between w-full border-b border-stone-200 pb-3 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-orange-600 font-mono">
            <Zap className="w-4 h-4 text-orange-500 animate-pulse" /> PHẢN XẠ SIÊU TỐC
          </div>
          <div className="text-xs font-bold text-stone-700">
            Vòng: <b className="font-mono text-stone-900">{state.round} / 5</b>
          </div>
        </div>

        {/* Reflex Clicking Area stage */}
        {(state.screenState === 'WAITING' || state.screenState === 'READY') ? (
          <button
            onClick={handleClickTrigger}
            disabled={isSpectator}
            className={`w-full min-h-[220px] rounded-2xl flex flex-col items-center justify-center p-6 border-4 shadow-md transition-colors cursor-pointer select-none active:scale-99
              ${state.screenState === 'READY'
                ? 'bg-emerald-500 border-emerald-600 text-white'
                : 'bg-rose-500 border-rose-600 text-white'
              }
            `}
          >
            {state.screenState === 'READY' ? (
              <span className="text-2xl sm:text-3xl font-extrabold tracking-widest animate-bounce">BẤM NGAY !!!</span>
            ) : (
              <span className="text-lg font-bold tracking-wider animate-pulse text-rose-100">ĐỢI MÀU XANH...</span>
            )}
          </button>
        ) : (
          <div className="w-full min-h-[220px] bg-stone-50 border-2 border-stone-200 rounded-2xl flex flex-col items-center justify-center p-6 text-center shadow-inner">
            {state.screenState === 'TOO_EARLY' ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl animate-bounce">⚠️</span>
                <h4 className="text-base font-extrabold text-amber-600 uppercase">BẤM QUÁ SỚM!</h4>
                <p className="text-xs text-stone-500 max-w-xs">Bạn đã nhấn chuột trước khi màu xanh xuất hiện. Bị phạt +1500 ms cho vòng này!</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl animate-bounce">⚡</span>
                <h4 className="text-base font-extrabold text-emerald-600 uppercase">THÀNH TÍCH VÒNG NÀY</h4>
                <div className="text-3xl font-mono font-extrabold text-stone-800 tracking-wider">
                  {roundScores[roundScores.length - 1]} <span className="text-sm font-sans text-stone-500 font-normal">ms</span>
                </div>
              </div>
            )}

            <button
              onClick={handleNextRound}
              className="mt-6 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-lg text-xs cursor-pointer shadow flex items-center gap-1.5"
            >
              Tiếp Tục <Play className="w-3.5 h-3.5 fill-white" />
            </button>
          </div>
        )}

        {/* Reaction logs stats */}
        <div className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs font-mono">
          <span className="text-[10px] text-stone-400 font-bold block mb-1 uppercase">Nhật ký phản xạ</span>
          <div className="flex flex-col gap-1">
            {roundScores.map((time: number, idx: number) => (
              <div key={idx} className="flex justify-between border-b border-dashed border-stone-200 pb-0.5 last:border-0 text-[10px]">
                <span>Vòng {idx + 1}:</span>
                <span className={time === 1500 ? 'text-rose-500 font-bold' : 'text-emerald-600'}>
                  {time === 1500 ? 'QUÁ SỚM (1500ms)' : `${time}ms`}
                </span>
              </div>
            ))}
          </div>
          {roundScores.length > 0 && (
            <div className="flex justify-between font-bold text-stone-700 mt-2 pt-1 border-t border-stone-200">
              <span>Độ trễ trung bình:</span>
              <span className="text-orange-600">{myScore} ms</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
