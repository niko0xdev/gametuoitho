import React, { useState, useEffect, useRef } from 'react';
import { Play, Trophy, Sparkles, History, Gamepad2, AlertCircle, Swords, Bell, X, Mail } from 'lucide-react';
import Header from './components/Header.tsx';
import Catalog from './components/Catalog.tsx';
import Leaderboards from './components/Leaderboards.tsx';
import TournamentsView from './components/TournamentsView.tsx';
import DailyChallengesView from './components/DailyChallengesView.tsx';
import ReplayView from './components/ReplayView.tsx';
import GameBoard from './components/GameBoard.tsx';
import BiLacArena from './components/BiLacArena.tsx';
import MyLeagueView from './components/MyLeagueView.tsx';
import { UserProfile, ToastNotification } from './types.ts';
import { playRetroBeep } from './components/games/CaroBoard.tsx';
import AuthModal from './components/AuthModal.tsx';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('auth_userId') || 'user_a');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'catalog' | 'tournaments' | 'daily' | 'replays' | 'leaderboards' | 'bilac' | 'myleague'>('catalog');

  const handleLoginSuccess = (userProfile: UserProfile) => {
    localStorage.setItem('auth_userId', userProfile.id);
    setUserId(userProfile.id);
    setProfile(userProfile);
    playRetroBeep(880, 'sine', 0.2);
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth_userId');
    setUserId('user_a');
    playRetroBeep(440, 'triangle', 0.25);
  };

  // Match / battle States
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [spectateMode, setSpectateMode] = useState<boolean>(false);
  const [matchmakingStatus, setMatchmakingStatus] = useState<{ gameId: string | null; status: 'IDLE' | 'SEARCHING' }>({
    gameId: null,
    status: 'IDLE'
  });
  const [privateRoomCode, setPrivateRoomCode] = useState<string | null>(null);
  const [privateRoomGameId, setPrivateRoomGameId] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const lobbyWsRef = useRef<WebSocket | null>(null);

  // Browser Notification & Toast States
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; displayName: string; avatar: string }[]>([]);

  const getGameName = (gameId: string) => {
    const gameMap: { [key: string]: string } = {
      caro: 'Cờ Caro',
      co_tuong: 'Cờ Tướng',
      co_vua: 'Cờ Vua',
      o_an_quan: 'Ô Ăn Quan',
      co_ca_ngua: 'Cờ Cá Ngựa',
      duoi_hinh_bat_chu: 'Đuổi Hình Bắt Chữ',
      noi_chu: 'Nối Chữ',
      doan_tu: 'Đoán Từ'
    };
    return gameMap[gameId] || gameId;
  };

  const addToast = (toast: Omit<ToastNotification, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    const newToast = { ...toast, id } as ToastNotification;
    setToasts(prev => [...prev, newToast]);

    const duration = toast.duration || 6000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const sendBrowserNotification = (title: string, body: string) => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          const notification = new Notification(title, {
            body,
            icon: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=gametuoitho'
          });
          notification.onclick = () => {
            window.focus();
          };
        } catch (err) {
          console.warn('Notification failed to show', err);
        }
      }
    }
  };

  // Request browser Notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Poll online users when hosting a private room
  useEffect(() => {
    if (!privateRoomCode) {
      setOnlineUsers([]);
      return;
    }

    const loadOnlineUsers = async () => {
      try {
        const res = await fetch(`/api/online-users?exclude=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setOnlineUsers(data);
        }
      } catch (err) {
        console.error('Failed to load online users', err);
      }
    };

    loadOnlineUsers();
    const interval = setInterval(loadOnlineUsers, 4000);
    return () => clearInterval(interval);
  }, [privateRoomCode, userId]);

  const handleInviteUser = (targetUserId: string, gameId: string, code: string) => {
    if (lobbyWsRef.current && lobbyWsRef.current.readyState === WebSocket.OPEN) {
      lobbyWsRef.current.send(JSON.stringify({
        type: 'SEND_INVITATION',
        payload: { targetUserId, gameId, code }
      }));
      addToast({
        title: '✉️ Lời mời đã gửi',
        message: `Đã gửi lời mời tham gia phòng game ${getGameName(gameId)}!`,
        type: 'info'
      });
    }
  };

  // 1. Fetch user profile on login/account switch
  const fetchProfile = async (uId: string, defaultName?: string) => {
    try {
      const res = await fetch('/api/auth/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uId, displayName: defaultName })
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error('Failed to quick-login profile', err);
    }
  };

  useEffect(() => {
    fetchProfile(userId);
  }, [userId]);

  // 2. Establish lobby WebSocket connection
  useEffect(() => {
    // Re-establish socket whenever userId changes
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    lobbyWsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'REGISTER_SOCKET',
        payload: { userId }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);

        switch (type) {
          case 'MATCH_FOUND':
          case 'MATCH_STARTED':
            playRetroBeep(987, 'sine', 0.2);
            setActiveMatchId(payload.matchId);
            setSpectateMode(false);
            setMatchmakingStatus({ gameId: null, status: 'IDLE' });
            setPrivateRoomCode(null);
            setErrorLocal(null);
            
            // Trigger both custom Toast and Browser Notification
            sendBrowserNotification('🎮 Trận đấu bắt đầu!', `Tìm thấy đối thủ! Trò chơi ${getGameName(payload.gameId || '')} đang được tải...`);
            addToast({
              title: '🎮 Ghép trận thành công!',
              message: `Tìm thấy đối thủ! Trò chơi ${getGameName(payload.gameId || '')} đang được tải...`,
              type: 'match'
            });
            break;

          case 'MATCH_STATE_UPDATE':
            if (payload && payload.id && payload.status === 'PLAYING') {
              playRetroBeep(987, 'sine', 0.2);
              setActiveMatchId(payload.id);
              setSpectateMode(false);
              setMatchmakingStatus({ gameId: null, status: 'IDLE' });
              setPrivateRoomCode(null);
              setErrorLocal(null);
            }
            break;

          case 'PRIVATE_ROOM_CREATED':
            setPrivateRoomCode(payload.code);
            addToast({
              title: '🔑 Phòng riêng sẵn sàng!',
              message: `Đã tạo phòng với mã: ${payload.code}. Bạn có thể mời người chơi online hoặc gửi mã này cho bạn bè!`,
              type: 'info'
            });
            break;

          case 'PRIVATE_ROOM_FAILED':
            setErrorLocal(payload.error || 'Vào phòng riêng thất bại!');
            playRetroBeep(150, 'sawtooth', 0.2);
            addToast({
              title: '❌ Thất bại',
              message: payload.error || 'Vào phòng riêng thất bại!',
              type: 'info'
            });
            break;

          case 'PRIVATE_ROOM_INVITATION':
            // Play retro ringer
            playRetroBeep(660, 'sine', 0.15);
            setTimeout(() => playRetroBeep(880, 'sine', 0.15), 150);

            // Trigger Browser Notification
            sendBrowserNotification(
              '✉️ Lời mời phòng riêng', 
              `${payload.fromUserName} mời bạn chơi game ${getGameName(payload.gameId)}! Nhấp để vào phòng.`
            );

            // Custom Toast with callback action to Join Private Room
            addToast({
              title: '✉️ Lời mời đấu trí!',
              message: `${payload.fromUserName} đang mời bạn chơi ${getGameName(payload.gameId)}. Bạn có muốn tham gia phòng ${payload.code}?`,
              type: 'invite',
              duration: 15000, // Show for 15 seconds to give time to respond
              action: {
                label: 'Chấp nhận',
                onClick: () => {
                  handleJoinPrivateRoom(payload.code);
                }
              }
            });
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Lobby WS parse error', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [userId]);

  // Re-register lobby socket when returning from a game to the main lobby
  useEffect(() => {
    if (!activeMatchId && lobbyWsRef.current && lobbyWsRef.current.readyState === WebSocket.OPEN) {
      lobbyWsRef.current.send(JSON.stringify({
        type: 'REGISTER_SOCKET',
        payload: { userId }
      }));
    }
  }, [activeMatchId, userId]);

  // 3. Matchmaking Operations
  const handleJoinMatchmaking = (gameId: string) => {
    setErrorLocal(null);
    if (lobbyWsRef.current && lobbyWsRef.current.readyState === WebSocket.OPEN) {
      lobbyWsRef.current.send(JSON.stringify({
        type: 'JOIN_MATCHMAKING',
        payload: { gameId }
      }));
      setMatchmakingStatus({ gameId, status: 'SEARCHING' });
    }
  };

  const handleCancelMatchmaking = () => {
    if (lobbyWsRef.current && lobbyWsRef.current.readyState === WebSocket.OPEN) {
      lobbyWsRef.current.send(JSON.stringify({
        type: 'LEAVE_MATCHMAKING'
      }));
      setMatchmakingStatus({ gameId: null, status: 'IDLE' });
    }
  };

  const handleCreatePrivateRoom = (gameId: string) => {
    setErrorLocal(null);
    setPrivateRoomGameId(gameId);
    if (lobbyWsRef.current && lobbyWsRef.current.readyState === WebSocket.OPEN) {
      lobbyWsRef.current.send(JSON.stringify({
        type: 'CREATE_PRIVATE_ROOM',
        payload: { gameId }
      }));
    }
  };

  const handleJoinPrivateRoom = (code: string) => {
    setErrorLocal(null);
    if (lobbyWsRef.current && lobbyWsRef.current.readyState === WebSocket.OPEN) {
      lobbyWsRef.current.send(JSON.stringify({
        type: 'JOIN_PRIVATE_ROOM',
        payload: { code }
      }));
    }
  };

  // 4. Edit display name and avatar
  const handleUpdateProfile = async (displayName: string, avatar?: string) => {
    try {
      const res = await fetch(`/api/profile/${userId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, avatar })
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetElo = async () => {
    try {
      const res = await fetch(`/api/profile/${userId}/reset-elo`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        playRetroBeep(300, 'sawtooth', 0.25);
      }
    } catch (err) {
      console.error('Failed to reset Elo', err);
    }
  };

  const handleSwitchUser = (newId: string, name: string) => {
    setUserId(newId);
    setErrorLocal(null);
    setMatchmakingStatus({ gameId: null, status: 'IDLE' });
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col font-sans select-none text-stone-800">
      
      {/* Retros Header bar with integrated responsive navigation and settings */}
      <Header
        profile={profile}
        onSwitchUser={handleSwitchUser}
        onUpdateProfile={handleUpdateProfile}
        onResetElo={handleResetElo}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Global Error Banner alerts */}
      {errorLocal && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 mt-4">
          <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>{errorLocal}</span>
          </div>
        </div>
      )}

      {/* Lobby Private Room Creation Alerts */}
      {privateRoomCode && !activeMatchId && (
        <div className="max-w-md mx-auto w-full px-4 mt-4">
          <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-4 rounded-2xl shadow-sm text-center">
            <span className="text-xs font-bold text-amber-800 uppercase block mb-1">🔑 Phòng riêng đã được khởi tạo</span>
            <div id="private-room-display-code" className="text-3xl font-mono font-extrabold text-stone-900 tracking-widest my-2 select-all bg-white py-1.5 px-4 rounded border border-amber-200 shadow-inner">
              {privateRoomCode}
            </div>
            <span className="text-[10px] text-stone-500 block leading-relaxed mb-3">
              Gửi mã phòng này cho bạn bè, hoặc chuyển sang tài khoản khác trên thanh điều khiển để gia nhập chiến trận đối kháng!
            </span>

            {/* Live Online Players to Invite */}
            <div className="mt-3 border-t border-amber-200 pt-3 text-left">
              <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block mb-2">
                🟢 GỬI LỜI MỜI TRỰC TUYẾN ({onlineUsers.length}):
              </span>
              {onlineUsers.length === 0 ? (
                <p className="text-[10px] text-stone-400 italic text-center py-2 bg-stone-50 rounded-xl border border-stone-200/40">
                  Không có kỳ thủ nào trực tuyến lúc này.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {onlineUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between bg-white p-2 rounded-xl border border-amber-200/60 shadow-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <img 
                          src={user.avatar} 
                          alt={user.displayName} 
                          className="w-6 h-6 rounded-full border border-stone-200 bg-stone-50 shrink-0" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-xs font-bold text-stone-700 truncate">
                          {user.displayName}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (privateRoomGameId) {
                            handleInviteUser(user.id, privateRoomGameId, privateRoomCode);
                          }
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[9px] uppercase rounded-lg transition-colors cursor-pointer shrink-0 shadow-sm"
                      >
                        Mời chơi
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Arena Route Selector */}
      {activeMatchId ? (
        <GameBoard
          matchId={activeMatchId}
          userId={userId}
          userProfile={profile!}
          onExit={() => {
            setActiveMatchId(null);
            setSpectateMode(false);
            playRetroBeep(400, 'triangle', 0.1);
          }}
          spectateMode={spectateMode}
        />
      ) : (
        <>
          {/* Render Active view content */}
          <main className="flex-1">
            {activeView === 'catalog' && (
              <Catalog
                onStartSolo={(gameId) => {
                  // Direct solo setup creates a local match session bypassing queue
                  playRetroBeep(880, 'sine', 0.1);
                  // Trigger direct solo game via mock match ID on local
                  setActiveMatchId(`match_solo_${gameId}_${Date.now()}`);
                  setSpectateMode(false);
                }}
                onJoinMatchmaking={handleJoinMatchmaking}
                onCreatePrivateRoom={handleCreatePrivateRoom}
                onJoinPrivateRoom={handleJoinPrivateRoom}
                matchmakingStatus={matchmakingStatus}
                onCancelMatchmaking={handleCancelMatchmaking}
              />
            )}
            {activeView === 'tournaments' && (
              <TournamentsView
                userId={userId}
                onJoinMatch={(matchId) => {
                  setActiveMatchId(matchId);
                  setSpectateMode(false);
                }}
                onSpectateMatch={(matchId) => {
                  setActiveMatchId(matchId);
                  setSpectateMode(true);
                }}
              />
            )}
            {activeView === 'myleague' && (
              <MyLeagueView userId={userId} userProfile={profile} />
            )}
            {activeView === 'daily' && (
              <DailyChallengesView
                userId={userId}
                displayName={profile?.displayName || `Kỳ thủ ${userId.substring(0, 5)}`}
                avatar={profile?.avatar || ''}
              />
            )}
            {activeView === 'replays' && (
              <ReplayView
                userId={userId}
              />
            )}
            {activeView === 'leaderboards' && (
              <Leaderboards />
            )}
            {activeView === 'bilac' && (
              <BiLacArena />
            )}
          </main>
        </>
      )}

      {/* Retro aesthetic platform footer */}
      <footer className="bg-stone-900 border-t-4 border-stone-800 py-6 text-center text-xs text-stone-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <span className="font-bold text-stone-300 block mb-0.5">gametuoitho.space</span>
            <span>Nostalgia Brain-Training Arena &copy; 2026. All rights reserved.</span>
          </div>
          <div className="text-right text-[10px] text-stone-600 font-mono">
            BUILD SUCCESSFUL // AGENTIC ENGINE ACTIVE
          </div>
        </div>
      </footer>

      {/* Full Authentication and Authorization Modal portal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Dynamic Floating Toast Overlay Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className={`p-4 rounded-2xl shadow-xl border-2 pointer-events-auto flex gap-3 items-start relative overflow-hidden backdrop-blur-md
                ${toast.type === 'match'
                  ? 'bg-orange-950/95 border-orange-500 text-orange-50'
                  : toast.type === 'invite'
                  ? 'bg-purple-950/95 border-purple-500 text-purple-50'
                  : 'bg-stone-900/95 border-stone-700 text-stone-100'
                }
              `}
            >
              {/* Background Accent glow */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full filter blur-2xl opacity-10 -mr-6 -mt-6
                ${toast.type === 'match'
                  ? 'bg-orange-400'
                  : toast.type === 'invite'
                  ? 'bg-purple-400'
                  : 'bg-stone-400'
                }
              `} />

              {/* Toast Icon */}
              <div className={`p-2 rounded-xl border shrink-0 mt-0.5
                ${toast.type === 'match'
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  : toast.type === 'invite'
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                  : 'bg-stone-800 border-stone-700 text-stone-400'
                }
              `}>
                {toast.type === 'match' ? (
                  <Swords className="w-5 h-5 animate-pulse" />
                ) : toast.type === 'invite' ? (
                  <Mail className="w-5 h-5 animate-bounce" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
              </div>

              {/* Toast Content */}
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="font-bold text-xs uppercase tracking-wider mb-0.5">
                  {toast.title}
                </h4>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {toast.message}
                </p>

                {/* Interactive Toast Action Button */}
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                      playRetroBeep(880, 'sine', 0.15);
                    }}
                    className="mt-2.5 px-3 py-1.5 bg-white text-stone-950 hover:bg-stone-100 font-bold text-[10px] uppercase rounded-xl shadow cursor-pointer transition-colors"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  removeToast(toast.id);
                  playRetroBeep(330, 'sine', 0.05);
                }}
                className="absolute top-2 right-2 p-1 text-stone-400 hover:text-stone-200 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
