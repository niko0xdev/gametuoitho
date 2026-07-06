import React, { useState, useEffect } from 'react';
import { Trophy, Users, PlusCircle, Award, Calendar, Link, Play } from 'lucide-react';
import { GAMES } from '../gamesData.ts';
import { Tournament } from '../types.ts';
import { playRetroBeep } from './games/CaroBoard.tsx';

interface TournamentsViewProps {
  userId: string;
  onJoinMatch: (matchId: string) => void;
  onSpectateMatch?: (matchId: string) => void;
}

export default function TournamentsView({ userId, onJoinMatch, onSpectateMatch }: TournamentsViewProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedT, setSelectedT] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showCreate, setShowCreate] = useState(false);
  const [tName, setTName] = useState('');
  const [tGame, setTGame] = useState('caro');
  const [tMax, setTMax] = useState('16');
  const [tCode, setTCode] = useState('');
  const [spectateMatchId, setSpectateMatchId] = useState('');
  const [error, setError] = useState('');

  const refreshList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tournaments');
      if (res.ok) {
        const data = await res.json();
        setTournaments(data);
        // Refresh active selected details if opened
        if (selectedT) {
          const updated = data.find((tour: Tournament) => tour.id === selectedT.id);
          if (updated) setSelectedT(updated);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch tournaments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
    const interval = setInterval(refreshList, 4000); // Poll brackets update
    return () => clearInterval(interval);
  }, [selectedT]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tName.trim()) {
      setError('Hãy nhập tên giải đấu!');
      return;
    }

    try {
      const res = await fetch('/api/tournaments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: tName.trim(),
          gameId: tGame,
          maxPlayers: parseInt(tMax),
          deadlineSeconds: 300 // 5 mins deadline
        })
      });

      if (res.ok) {
        const newT = await res.json();
        setSelectedT(newT);
        setShowCreate(false);
        setTName('');
        playRetroBeep(880, 'sine', 0.15);
        refreshList();
      }
    } catch (err) {
      setError('Lỗi tạo giải đấu!');
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tCode.trim()) return;

    try {
      const res = await fetch('/api/tournaments/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: tCode.trim().toUpperCase() })
      });

      if (res.ok) {
        const joinedT = await res.json();
        setSelectedT(joinedT);
        setTCode('');
        playRetroBeep(700, 'triangle', 0.1);
        refreshList();
      } else {
        const errData = await res.json();
        setError(errData.error || 'Mã không hợp lệ hoặc giải đấu đã bắt đầu!');
      }
    } catch (err) {
      setError('Lỗi tham gia giải đấu!');
    }
  };

  const handleStartTournament = async (tId: string) => {
    try {
      const res = await fetch(`/api/tournaments/${tId}/start`, { method: 'POST' });
      if (res.ok) {
        const started = await res.json();
        setSelectedT(started);
        playRetroBeep(900, 'sawtooth', 0.2);
        refreshList();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLaunchMatch = async (tId: string, index: number) => {
    try {
      const res = await fetch(`/api/tournaments/${tId}/launch/${index}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        onJoinMatch(data.matchId); // Redirect to active board!
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSpectateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spectateMatchId.trim()) return;

    playRetroBeep(600, 'sine', 0.1);
    if (onSpectateMatch) {
      onSpectateMatch(spectateMatchId.trim());
    } else {
      onJoinMatch(spectateMatchId.trim());
    }
  };

  const activeGameList = GAMES.filter(g => g.isRealTime);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 bg-white border border-stone-200 rounded-2xl shadow-sm my-6">
      
      {selectedT ? (
        // TOURNAMENT DETAILS MODULE
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <button
                onClick={() => setSelectedT(null)}
                className="text-xs text-stone-500 hover:text-stone-800 underline cursor-pointer mb-1 block"
              >
                &larr; Quay lại danh sách
              </button>
              <h2 className="text-base sm:text-xl font-serif font-bold text-stone-800 flex items-center gap-1.5 leading-tight">
                <Trophy className="text-yellow-500 w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> {selectedT.name}
              </h2>
              <span className="text-xs text-stone-500 font-mono">
                Bộ môn: <b>Cờ {GAMES.find(g => g.id === selectedT.gameId)?.name}</b>
              </span>
            </div>

            {/* Status indicator */}
            <div className="text-right">
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                ${selectedT.status === 'REGISTRATION' ? 'bg-blue-100 text-blue-800' : ''}
                ${selectedT.status === 'ACTIVE' ? 'bg-green-100 text-green-800 animate-pulse' : ''}
                ${selectedT.status === 'ENDED' ? 'bg-stone-100 text-stone-800' : ''}
              `}>
                {selectedT.status === 'REGISTRATION' ? 'Đang Đăng Ký' : selectedT.status === 'ACTIVE' ? 'Đang Diễn Ra' : 'Đã Kết Thúc'}
              </span>
              <div className="text-[10px] font-mono font-bold text-orange-500 mt-1.5 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                MÃ GIẢI: {selectedT.id.substring(2, 8).toUpperCase()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. STANDINGS (Leaderboard) */}
            <div className="lg:col-span-1 bg-stone-50 border border-stone-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1 border-b border-stone-200 pb-2 mb-3">
                <Award className="w-4 h-4 text-orange-500" /> Bảng Điểm Giải Đấu
              </h3>
              <div className="flex flex-col gap-2">
                {Object.entries(selectedT.standings)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([pId, score], index) => {
                    const isMe = pId === userId;
                    return (
                      <div
                        key={pId}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold
                          ${isMe ? 'bg-orange-50 border-orange-300 text-orange-900' : 'bg-white border-stone-200 text-stone-700'}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-stone-400">#{index + 1}</span>
                          <span>Kỳ thủ {pId.substring(0, 5)}</span>
                        </div>
                        <span className="font-mono font-bold text-orange-600">{score} Điểm</span>
                      </div>
                    );
                  })}
              </div>

              {/* Start bracket action button */}
              {selectedT.organizer === userId && selectedT.status === 'REGISTRATION' && (
                <button
                  id="start-tournament-btn"
                  onClick={() => handleStartTournament(selectedT.id)}
                  disabled={selectedT.players.length < 2}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs cursor-pointer mt-4 shadow"
                >
                  Khởi Chạy Giải Đấu ({selectedT.players.length} người)
                </button>
              )}
            </div>

            {/* 2. BRACKET MATCH PAIRINGS */}
            <div className="lg:col-span-2 bg-stone-50 border border-stone-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1 border-b border-stone-200 pb-2 mb-3">
                <Calendar className="w-4 h-4 text-blue-500" /> Vòng Đấu Cặp (Round-Robin)
              </h3>

              {selectedT.status === 'REGISTRATION' ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-stone-300 mx-auto" />
                  <span className="text-xs text-stone-500 font-semibold block mt-2">Đang chờ đủ danh sách đăng ký...</span>
                  <span className="text-[10px] text-stone-400 block mt-1">Chia sẻ mã giải để người khác cùng đấu trí</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
                  {selectedT.schedule.map((match, idx) => {
                    const isMyMatch = match.player1 === userId || match.player2 === userId;
                    return (
                      <div
                        key={idx}
                        className={`p-3 bg-white border rounded-xl flex items-center justify-between text-xs
                          ${isMyMatch ? 'border-orange-300 ring-2 ring-orange-50' : 'border-stone-200'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px] text-stone-400 font-bold bg-stone-100 px-2 py-0.5 rounded">
                            Trận {idx + 1}
                          </span>
                          <span className="font-semibold text-stone-800">
                            Kỳ thủ {match.player1.substring(0, 5)} vs Kỳ thủ {match.player2.substring(0, 5)}
                          </span>
                        </div>

                        <div>
                          {match.status === 'WAITING' ? (
                            isMyMatch ? (
                              <button
                                id={`launch-t-match-${idx}`}
                                onClick={() => handleLaunchMatch(selectedT.id, idx)}
                                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-1 px-3 rounded flex items-center gap-1 cursor-pointer"
                              >
                                <Play className="w-3 h-3" /> Thi đấu
                              </button>
                            ) : (
                              <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider bg-stone-100 px-2 py-0.5 rounded">Chưa Đấu</span>
                            )
                          ) : match.status === 'PLAYING' ? (
                            <button
                              onClick={() => {
                                playRetroBeep(600, 'sine', 0.1);
                                if (onSpectateMatch) {
                                  onSpectateMatch(match.matchId);
                                } else {
                                  onJoinMatch(match.matchId);
                                }
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded flex items-center gap-1 cursor-pointer animate-pulse"
                            >
                              🖥️ Xem Trận
                            </button>
                          ) : (
                            <span className="text-[10px] text-stone-500 font-bold bg-stone-200 px-2 py-0.5 rounded uppercase">
                              Xong (Thắng: {match.winner === 'DRAW' ? 'Hòa' : `Kỳ thủ ${match.winner?.substring(0, 5)}`})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // TOURNAMENT CATALOG LIST
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h2 className="text-base sm:text-xl font-serif font-bold text-stone-800 flex items-center gap-1.5 leading-tight">
                <Trophy className="text-yellow-500 w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Đấu Trường Giải Đấu (Tournaments)
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">Tự tạo hoặc tham gia các giải đấu vòng tròn tính điểm gay cấn để tranh ngôi vô địch</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <form onSubmit={handleJoinByCode} className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="MÃ GIẢI"
                  value={tCode}
                  onChange={(e) => setTCode(e.target.value.toUpperCase())}
                  className="bg-stone-50 border border-stone-300 rounded-lg text-xs py-1.5 px-3 text-center uppercase tracking-widest font-extrabold w-24"
                />
                <button
                  type="submit"
                  className="bg-stone-900 hover:bg-stone-800 text-white font-bold py-1.5 px-3.5 rounded-lg text-xs cursor-pointer flex items-center gap-1"
                >
                  <Link className="w-3.5 h-3.5" /> Tham Gia
                </button>
              </form>

              <form onSubmit={handleSpectateSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="MÃ TRẬN ĐẤU"
                  value={spectateMatchId}
                  onChange={(e) => setSpectateMatchId(e.target.value)}
                  className="bg-stone-50 border border-stone-300 rounded-lg text-xs py-1.5 px-3 text-center font-mono w-32"
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3.5 rounded-lg text-xs cursor-pointer flex items-center gap-1"
                >
                  👁️ Xem Trận
                </button>
              </form>

              <button
                id="create-t-btn"
                onClick={() => { setShowCreate(!showCreate); playRetroBeep(523, 'sine'); }}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Tạo Giải Đấu
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs font-semibold border border-red-100 animate-pulse">
              {error}
            </div>
          )}

          {/* Creation Modal Box */}
          {showCreate && (
            <form onSubmit={handleCreate} className="bg-stone-50 border border-stone-200 p-5 rounded-2xl flex flex-col gap-4 animate-scaleIn">
              <h3 className="text-sm font-bold text-stone-800 border-b border-stone-200 pb-1.5">Cài Đặt Giải Đấu Mới</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="t-name-input" className="text-xs font-semibold text-stone-600">Tên Giải Đấu</label>
                  <input
                    type="text"
                    id="t-name-input"
                    placeholder="Ví dụ: Đại Hội Cờ Caro 2026"
                    value={tName}
                    onChange={(e) => setTName(e.target.value)}
                    className="bg-white border border-stone-300 rounded-lg text-xs py-2 px-3"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="t-game-select" className="text-xs font-semibold text-stone-600">Môn Đấu Trí</label>
                  <select
                    id="t-game-select"
                    value={tGame}
                    onChange={(e) => setTGame(e.target.value)}
                    className="bg-white border border-stone-300 rounded-lg text-xs py-2 px-3 cursor-pointer"
                  >
                    {activeGameList.map(g => (
                      <option key={g.id} value={g.id}>Cờ {g.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="t-max-select" className="text-xs font-semibold text-stone-600">Số Kỳ Thủ Tối Đa</label>
                  <select
                    id="t-max-select"
                    value={tMax}
                    onChange={(e) => setTMax(e.target.value)}
                    className="bg-white border border-stone-300 rounded-lg text-xs py-2 px-3 cursor-pointer"
                  >
                    <option value="4">4 Kỳ thủ</option>
                    <option value="8">8 Kỳ thủ</option>
                    <option value="16">16 Kỳ thủ</option>
                    <option value="32">32 Kỳ thủ</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold py-2 px-4 rounded-lg text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  id="t-create-submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg text-xs cursor-pointer"
                >
                  Khởi Tạo Giải Đấu
                </button>
              </div>
            </form>
          )}

          {/* List display */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
              <span className="text-xs text-stone-500 font-semibold">Đang truy vấn đấu trường...</span>
            </div>
          ) : tournaments.length === 0 ? (
            <div className="text-center py-12 bg-stone-50 border border-stone-200 rounded-xl">
              <Trophy className="w-12 h-12 text-stone-300 mx-auto" />
              <span className="text-xs text-stone-500 font-semibold block mt-2">Chưa có giải đấu nào hoạt động!</span>
              <span className="text-[10px] text-stone-400 block mt-1">Hãy là người đầu tiên khơi mào giải đấu.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournaments.map((tour) => (
                <div
                  key={tour.id}
                  onClick={() => { setSelectedT(tour); playRetroBeep(600, 'sine', 0.08); }}
                  className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-stone-800 tracking-tight group-hover:text-orange-500 transition-colors">
                        {tour.name}
                      </h4>
                      <span className="text-[10px] text-stone-400 font-mono">Bộ môn: Cờ {GAMES.find(g => g.id === tour.gameId)?.name}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider
                      ${tour.status === 'REGISTRATION' ? 'bg-blue-100 text-blue-800' : ''}
                      ${tour.status === 'ACTIVE' ? 'bg-green-100 text-green-800 animate-pulse' : ''}
                      ${tour.status === 'ENDED' ? 'bg-stone-100 text-stone-800' : ''}
                    `}>
                      {tour.status === 'REGISTRATION' ? 'Tuyển Quân' : tour.status === 'ACTIVE' ? 'Kịch Chiến' : 'Hạ Màn'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-[10px] font-mono text-stone-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {tour.players.length}/{tour.maxPlayers} Kỳ thủ
                    </span>
                    <span className="font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                      MÃ: {tour.id.substring(2, 8).toUpperCase()}
                    </span>
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
