import React, { useState, useEffect, useRef } from 'react';
import { Swords, LogOut, Users, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { MatchState, UserProfile } from '../types.ts';
import { GAMES } from '../gamesData.ts';
import { gameDisplayName } from '../lib/gameDisplayName.ts';

// Individual boards imports
import CaroBoard, { playRetroBeep } from './games/CaroBoard.tsx';
import ChineseChessBoard from './games/ChineseChessBoard.tsx';
import ChessBoard from './games/ChessBoard.tsx';
import OAnQuanBoard from './games/OAnQuanBoard.tsx';
import LudoBoard from './games/LudoBoard.tsx';
import QuizGames from './games/QuizGames.tsx';
import MathGames from './games/MathGames.tsx';
import MemoryGames from './games/MemoryGames.tsx';

interface GameBoardProps {
  matchId: string;
  userId: string;
  userProfile: UserProfile;
  onExit: () => void;
  spectateMode?: boolean;
}

export default function GameBoard({
  matchId,
  userId,
  userProfile,
  onExit,
  spectateMode = false
}: GameBoardProps) {
  const [match, setMatch] = useState<MatchState | null>(null);
  const [opponent, setOpponent] = useState<UserProfile | null>(null);
  const [connected, setConnected] = useState(false);
  const [disconnectAlert, setDisconnectAlert] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>(['Bắt đầu thiết lập kết nối trận đấu...']);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Dynamic self-referential WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatusLog(prev => [...prev, 'Kênh truyền tin đã được mở. Đăng ký ghế ngồi...']);
      // Register socket with current user profile
      ws.send(JSON.stringify({
        type: 'REGISTER_SOCKET',
        payload: { userId }
      }));

      if (spectateMode) {
        ws.send(JSON.stringify({
          type: 'SPECTATE_MATCH',
          payload: { matchId }
        }));
        setStatusLog(prev => [...prev, 'Gia nhập phòng đấu với vai trò Khán Giả...']);
      } else {
        // Just trigger standard move channels
        ws.send(JSON.stringify({
          type: 'SPECTATE_MATCH', // Spectate handles reading initial state snapshot too
          payload: { matchId }
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);

        switch (type) {
          case 'MATCH_STATE_UPDATE':
            setMatch(payload);
            setDisconnectAlert(null);
            fetchOpponent(payload);
            break;

          case 'PLAYER_DISCONNECTED':
            setDisconnectAlert(`Kỳ thủ đối diện mất kết nối! Đang chờ 60 giây gia hạn...`);
            setStatusLog(prev => [...prev, `Đối thủ mất kết nối mạng.`]);
            playRetroBeep(200, 'sawtooth', 0.25);
            break;

          case 'PLAYER_RECONNECTED':
            setDisconnectAlert(null);
            setStatusLog(prev => [...prev, `Đối thủ đã kết nối lại thành công.`]);
            playRetroBeep(600, 'sine', 0.1);
            break;

          case 'MOVE_REJECTED':
            setStatusLog(prev => [...prev, `Nước đi bị từ chối: ${payload.error}`]);
            break;

          case 'MATCH_ENDED':
            setMatch(payload);
            setStatusLog(prev => [...prev, `Trận đấu kết thúc.`]);
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Socket message parse error', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setStatusLog(prev => [...prev, 'Kết nối mạng bị đóng.']);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [matchId, userId, spectateMode]);

  // Query opponent details
  const fetchOpponent = async (mState: MatchState) => {
    if (spectateMode) return;
    const opponentId = mState.players.find(id => id !== userId);
    if (!opponentId) return;

    try {
      const res = await fetch(`/api/profile/${opponentId}`);
      if (res.ok) {
        const data = await res.json();
        setOpponent(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMoveSubmit = (move: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'MAKE_MOVE',
        payload: { matchId, move }
      }));
    }
  };

  const handleForfeit = () => {
    if (window.confirm('Bạn có thực sự muốn nhận thua cuộc đấu này?')) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'FORFEIT',
          payload: { matchId }
        }));
      }
    }
  };

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-stone-500 font-semibold animate-pulse">Đang nạp chiến trường đấu trí...</span>
      </div>
    );
  }

  const gameInfo = GAMES.find(g => g.id === match.gameId);
  const isMyTurn = match.turn === userId && !spectateMode;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 bg-white border border-stone-200 rounded-2xl shadow-sm my-6">
      
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-b border-stone-100 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 border border-orange-200">
            <Swords className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-serif font-bold text-stone-800">
              {gameDisplayName(gameInfo)} Arena
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-stone-400 font-mono">
              <span>Phòng: {matchId.substring(6, 12).toUpperCase()}</span>
              <span>&bull;</span>
              <span className="flex items-center gap-0.5">
                <Users className="w-3.5 h-3.5" /> {match.viewers?.length || 0} đang xem
              </span>
              <span>&bull;</span>
              <span className={`flex items-center gap-0.5 ${connected ? 'text-green-600' : 'text-red-500'}`}>
                {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />} {connected ? 'Trực Tuyến' : 'Mất Mạng'}
              </span>
            </div>
          </div>
        </div>

        {/* Exit Button */}
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer transition-all"
        >
          <LogOut className="w-4 h-4" /> Rời Chiến Trường
        </button>
      </div>

      {/* Disconnection Warning Banner */}
      {disconnectAlert && (
        <div role="alert" className="bg-amber-50 text-amber-800 p-3 rounded-lg text-xs font-semibold border border-amber-200 flex items-center gap-2 mb-4 animate-bounce">
          <ShieldAlert className="w-4 h-4 text-amber-600" /> {disconnectAlert}
        </div>
      )}

      {/* Grid battle splits */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left 3 cols: Active Game Renderer */}
        <div className="lg:col-span-3 bg-stone-50 border border-stone-200 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[360px]">
          {match.status === 'ENDED' && match.gameId !== 'co_tuong' ? (
            <div className="text-center py-12 flex flex-col items-center">
              <span className="text-5xl animate-bounce">🏆</span>
              <h3 className="text-lg sm:text-xl font-bold text-stone-800 mt-3">Trận Đấu Đã Kết Thúc!</h3>
              <p className="text-xs text-stone-500 mt-1">
                Người chiến thắng: <b className="text-orange-600 font-mono">
                  {match.winner === 'DRAW' ? 'HÒA CỜ' : match.winner === userId ? 'BẠN ĐÃ THẮNG' : 'ĐỐI THỦ THẮNG'}
                </b>
              </p>
              <button
                onClick={onExit}
                className="mt-6 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-lg text-xs cursor-pointer shadow"
              >
                Trở Về Đại Sảnh
              </button>
            </div>
          ) : (
            // DYNAMIC RENDER BOARD BASED ON GAME ID
            <>
              {match.gameId === 'caro' && (
                <CaroBoard
                  board={match.boardState.board}
                  lastMove={match.boardState.lastMove}
                  turn={match.turn}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                />
              )}
              {match.gameId === 'co_tuong' && (
                <ChineseChessBoard
                  board={match.boardState.board}
                  turn={match.turn}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                  players={match.players}
                  winner={match.winner}
                  status={match.status}
                  onExit={onExit}
                />
              )}
              {match.gameId === 'co_vua' && (
                <ChessBoard
                  board={match.boardState.board}
                  turn={match.turn}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                />
              )}
              {match.gameId === 'o_an_quan' && (
                <OAnQuanBoard
                  boxes={match.boardState.boxes}
                  scores={match.boardState.scores}
                  turn={match.turn}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                  players={match.players}
                />
              )}
              {match.gameId === 'co_ca_ngua' && (
                <LudoBoard
                  horses={match.boardState.horses}
                  diceRoll={match.boardState.diceRoll}
                  diceStatus={match.boardState.diceStatus}
                  turn={match.turn}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                  players={match.players}
                />
              )}
              {['duoi_hinh_bat_chu', 'noi_chu', 'doan_tu'].includes(match.gameId) && (
                <QuizGames
                  gameId={match.gameId}
                  state={match.boardState}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                  players={match.players}
                />
              )}
              {['speed_math', 'number_pattern'].includes(match.gameId) && (
                <MathGames
                  gameId={match.gameId}
                  state={match.boardState}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                  players={match.players}
                />
              )}
              {['memory_match', 'simon_says', 'reflex'].includes(match.gameId) && (
                <MemoryGames
                  gameId={match.gameId}
                  state={match.boardState}
                  userId={userId}
                  onMove={handleMoveSubmit}
                  isSpectator={spectateMode}
                  players={match.players}
                />
              )}
            </>
          )}
        </div>

        {/* Right 1 col: Opponent Card & Console History log */}
        <div className="flex flex-col gap-4">
          
          {/* Opponent Display card */}
          {!spectateMode && opponent && (
            <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex items-center gap-3">
              <img
                src={opponent.avatar}
                alt="Opponent"
                className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200"
              />
              <div className="flex flex-col">
                <span className="text-[10px] text-stone-400 font-bold uppercase">ĐỐI THỦ</span>
                <span className="text-xs sm:text-sm font-bold text-stone-800 leading-none">{opponent.displayName}</span>
                <span className="text-[10px] font-mono text-stone-500 mt-1.5">Elo: {opponent.elo?.[match.gameId] || 1500}</span>
              </div>
            </div>
          )}

          {/* Console logger details */}
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-xl flex-1 flex flex-col text-[10px] font-mono text-green-400 min-h-[160px] max-h-[220px] lg:max-h-none overflow-hidden">
            <span className="text-white font-bold border-b border-stone-800 pb-1 mb-2 uppercase tracking-wider text-[9px]">Lịch sử đấu trường</span>
            <div aria-live="polite" aria-atomic="false" className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
              {statusLog.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  &gt; {log}
                </div>
              ))}
            </div>
          </div>

          {/* Resign action */}
          {!spectateMode && match.status === 'PLAYING' && (
            <button
              id="resign-btn"
              onClick={handleForfeit}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg text-xs cursor-pointer shadow transition-all uppercase tracking-wider"
            >
              🏳️ Đầu Hàng / Xin Thua
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
