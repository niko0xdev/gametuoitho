import React, { useState, useEffect } from 'react';
import { playRetroBeep } from './games/CaroBoard.tsx';
import { History, Eye, Play, ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { GAMES } from '../gamesData.ts';
import { gameDisplayName } from '../lib/gameDisplayName.ts';

// Dynamic board imports to render exact states
import CaroBoard from './games/CaroBoard.tsx';
import ChineseChessBoard from './games/ChineseChessBoard.tsx';
import ChessBoard from './games/ChessBoard.tsx';
import OAnQuanBoard from './games/OAnQuanBoard.tsx';
import LudoBoard from './games/LudoBoard.tsx';
import { RULE_ENGINES } from '../../server/rules.ts';

interface ReplayViewProps {
  userId: string;
}

export default function ReplayView({ userId }: ReplayViewProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Replayer control states
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500); // ms per autoplay tick

  const fetchHistory = async () => {
    if (!userId) { setHistory([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/replays/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  // Handle autoplay loop
  useEffect(() => {
    if (!isPlaying || !selectedMatch) return;

    const timer = setInterval(() => {
      if (currentStep < selectedMatch.moves.length) {
        setCurrentStep(prev => prev + 1);
        playRetroBeep(600, 'sine', 0.05);
      } else {
        setIsPlaying(false);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [isPlaying, currentStep, selectedMatch, speed]);

  const startReplaying = (match: any) => {
    setSelectedMatch(match);
    setCurrentStep(0);
    setIsPlaying(false);
    playRetroBeep(700, 'triangle', 0.1);
  };

  // Recompute board state dynamically up to `currentStep` using the actual server RuleEngines!
  // This is extremely modular, avoids duplication, and guarantees 100% mathematical accuracy of boards!
  const getReplayedState = () => {
    if (!selectedMatch) return null;
    const engine = RULE_ENGINES[selectedMatch.gameId];
    if (!engine) return null;

    let state = engine.getInitialState(selectedMatch.players);
    // Apply moves sequentially
    for (let i = 0; i < currentStep; i++) {
      const log = selectedMatch.moves[i];
      const result = engine.validateMove(state, log.move, log.player, selectedMatch.players);
      if (result.valid) {
        state = result.newState;
      }
    }
    return state;
  };

  const replayedState = getReplayedState();

  const renderActiveBoard = () => {
    if (!selectedMatch || !replayedState) return null;

    const props = {
      turn: replayedState.turnIndex !== undefined ? selectedMatch.players[replayedState.turnIndex] : '',
      userId: userId,
      isSpectator: true, // Replay behaves like a spectator (no moves allowed)
      onMove: () => {}
    };

    switch (selectedMatch.gameId) {
      case 'caro':
        return (
          <CaroBoard
            board={replayedState.board}
            lastMove={replayedState.lastMove}
            {...props}
          />
        );
      case 'co_tuong':
        return (
          <ChineseChessBoard
            board={replayedState.board}
            {...props}
          />
        );
      case 'co_vua':
        return (
          <ChessBoard
            board={replayedState.board}
            {...props}
          />
        );
      case 'o_an_quan':
        return (
          <OAnQuanBoard
            boxes={replayedState.boxes}
            scores={replayedState.scores}
            players={selectedMatch.players}
            {...props}
          />
        );
      case 'co_ca_ngua':
        return (
          <LudoBoard
            horses={replayedState.horses}
            diceRoll={replayedState.diceRoll}
            diceStatus={replayedState.diceStatus}
            players={selectedMatch.players}
            {...props}
          />
        );
      default:
        return (
          <div className="text-center p-6 text-stone-500">
            Nội dung đấu trí này không hỗ trợ hiển thị dưới dạng bàn cờ 2D.
          </div>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 bg-white border border-stone-200 rounded-2xl shadow-sm my-6">
      
      {selectedMatch ? (
        // REPLAYER DASHBOARD VIEW
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <button
                onClick={() => { setSelectedMatch(null); setIsPlaying(false); }}
                className="text-xs text-stone-500 hover:text-stone-800 underline cursor-pointer mb-1 block"
              >
                &larr; Trở về lịch sử đấu
              </button>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-stone-800 flex items-center gap-1">
                <History className="w-5 h-5 text-orange-500" /> Phát Lại Trận Đấu
              </h2>
              <span className="text-xs text-stone-500 font-mono">
                Bộ môn: <b>{gameDisplayName(GAMES.find(g => g.id === selectedMatch.gameId))}</b>
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono text-stone-500 block">Trận đấu ngày: {new Date(selectedMatch.createdAt).toLocaleDateString()}</span>
              <span className="text-xs font-bold text-green-600">Thắng cuộc: Kỳ thủ {selectedMatch.winner === 'DRAW' ? 'Hòa' : selectedMatch.winner?.substring(0, 5)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Play board rendering */}
            <div className="lg:col-span-2 bg-stone-50 border border-stone-200 p-4 rounded-2xl flex flex-col items-center">
              {renderActiveBoard()}

              {/* Step deck controllers */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 bg-stone-100 p-3 rounded-xl border border-stone-200 shadow-inner w-full">
                <button
                  id="replay-reset"
                  onClick={() => { setCurrentStep(0); setIsPlaying(false); }}
                  className="bg-white hover:bg-stone-50 border border-stone-300 p-2 rounded-lg cursor-pointer text-stone-700"
                  title="Về ban đầu"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  id="replay-prev"
                  disabled={currentStep <= 0}
                  onClick={() => { setCurrentStep(prev => prev - 1); setIsPlaying(false); }}
                  className="bg-white hover:bg-stone-50 border border-stone-300 disabled:opacity-50 p-2 rounded-lg cursor-pointer text-stone-700"
                >
                  <ChevronLeft className="w-4 h-4" /> Trước
                </button>

                <span className="font-mono text-xs font-bold px-4 text-stone-600 bg-white border border-stone-200 py-1.5 rounded-lg shadow-inner">
                  Nước: {currentStep} / {selectedMatch.moves.length}
                </span>

                <button
                  id="replay-next"
                  disabled={currentStep >= selectedMatch.moves.length}
                  onClick={() => { setCurrentStep(prev => prev + 1); setIsPlaying(false); }}
                  className="bg-white hover:bg-stone-50 border border-stone-300 disabled:opacity-50 p-2 rounded-lg cursor-pointer text-stone-700"
                >
                  Kế Tiếp <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  id="replay-autoplay"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-all
                    ${isPlaying
                      ? 'bg-amber-500 text-white shadow-md animate-pulse'
                      : 'bg-stone-900 text-white hover:bg-stone-800'
                    }
                  `}
                >
                  <Play className="w-3.5 h-3.5 fill-white" /> {isPlaying ? 'Dừng Tự Động' : 'Tự Động Chạy'}
                </button>
              </div>
            </div>

            {/* Move logs list timeline */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col h-[380px]">
              <h3 className="text-xs font-bold text-stone-800 border-b border-stone-200 pb-2 mb-3 uppercase tracking-wider">
                Nhật Ký Từng Nước Đi
              </h3>
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
                {selectedMatch.moves.length === 0 ? (
                  <div className="text-center py-12 text-stone-400 font-semibold italic text-xs">Trận đấu không ghi lại nước đi.</div>
                ) : (
                  selectedMatch.moves.map((log: any, idx: number) => {
                    const isActive = currentStep === idx + 1;
                    return (
                      <button
                        key={idx}
                        id={`move-log-${idx}`}
                        onClick={() => { setCurrentStep(idx + 1); setIsPlaying(false); }}
                        className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all cursor-pointer
                          ${isActive
                            ? 'bg-orange-500 text-white border-orange-500 font-bold shadow'
                            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                          }
                        `}
                      >
                        <span className="font-mono">Nước #{log.sequence}</span>
                        <span className="truncate max-w-[120px]">Kỳ thủ {log.player.substring(0, 5)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // TIMELINE DIRECTORY LISTINGS
        <div className="flex flex-col gap-6">
          <div className="border-b border-stone-100 pb-4">
            <h2 className="text-base sm:text-xl font-serif font-bold text-stone-800 flex items-center gap-1.5 leading-tight">
              <History className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" /> Nhật Ký Đấu Trí (Replays)
            </h2>
            <p className="text-xs text-stone-500">Xem lại từng nước đi, nghiên cứu chiến thuật của chính mình và đối thủ trong các trận đấu đã hoàn thành</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
              <span className="text-xs text-stone-500 font-semibold">Đang truy tìm lịch sử chiến tích...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 bg-stone-50 border border-stone-200 rounded-xl">
              <History className="w-12 h-12 text-stone-300 mx-auto" />
              <span className="text-xs text-stone-500 font-semibold block mt-2">Bạn chưa có trận đấu xếp hạng nào!</span>
              <span className="text-[10px] text-stone-400 block mt-1">Hãy bắt đầu chinh phục đấu trường ngay.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.map((match) => (
                <div
                  key={match.id}
                  onClick={() => startReplaying(match)}
                  className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-stone-800 tracking-tight group-hover:text-orange-500 transition-colors">
                        Trận cờ {GAMES.find(g => g.id === match.gameId)?.name}
                      </h4>
                      <span className="text-[10px] text-stone-400 font-mono">Thời gian: {new Date(match.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span className="px-2.5 py-0.5 bg-stone-100 text-stone-700 rounded-full text-[9px] font-bold uppercase tracking-wider">
                      Hoàn thành
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-[10px] font-mono">
                    <span className="text-stone-500 font-bold">Thắng: Kỳ thủ {match.winner === 'DRAW' ? 'Hòa' : match.winner?.substring(0, 5)}</span>
                    <button className="text-orange-500 font-extrabold flex items-center gap-0.5 group-hover:underline">
                      <Eye className="w-3.5 h-3.5" /> Xem lại
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
