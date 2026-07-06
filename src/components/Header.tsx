import React, { useState } from 'react';
import { UserProfile } from '../types.ts';
import { 
  Award, Shield, UserCheck, Menu, X, 
  Gamepad2, Trophy, Swords, Sparkles, History, Edit3,
  Volume2, VolumeX, RefreshCw, ChevronDown, User, LogOut
} from 'lucide-react';
import { playRetroBeep } from './games/CaroBoard.tsx';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  profile: UserProfile | null;
  onSwitchUser: (userId: string, displayName: string) => void;
  onUpdateProfile: (displayName: string, avatar?: string) => void;
  onResetElo?: () => void;
  activeView: 'catalog' | 'tournaments' | 'daily' | 'replays' | 'leaderboards' | 'bilac' | 'myleague';
  onViewChange: (view: 'catalog' | 'tournaments' | 'daily' | 'replays' | 'leaderboards' | 'bilac' | 'myleague') => void;
  onOpenAuthModal?: () => void;
  onSignOut?: () => void;
}

const AVATAR_SEEDS = [
  'arcade', 'pacman', 'mario', 'sonic', 'retro', 'zelda', 'gamer', 'vintage', 'pixels', 'tetris', 'cyber', 'robot', 'cyberpunk', 'neon', 'space', 'ufo', 'ghost', 'invader'
];

const NAVIGATION_ITEMS = [
  { id: 'catalog', label: 'Trò Chơi', icon: Gamepad2, color: 'text-stone-500' },
  { id: 'tournaments', label: 'Trí Tuệ', icon: Trophy, color: 'text-stone-500' },
  { id: 'myleague', label: 'Giải Thể Thao', icon: Trophy, color: 'text-amber-500' },
  { id: 'bilac', label: 'Đấu Trường Bi Lắc', icon: Swords, color: 'text-orange-500' },
  { id: 'daily', label: 'Thử Thách Ngày', icon: Sparkles, color: 'text-stone-500' },
  { id: 'replays', label: 'Nhật Ký', icon: History, color: 'text-stone-500' },
  { id: 'leaderboards', label: 'Xếp Hạng', icon: Trophy, color: 'text-stone-500' },
] as const;

export default function Header({
  profile,
  onSwitchUser,
  onUpdateProfile,
  onResetElo,
  activeView,
  onViewChange,
  onOpenAuthModal,
  onSignOut
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile?.displayName || '');
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('sound_enabled') !== 'false');
  const [showEloResetConfirm, setShowEloResetConfirm] = useState(false);

  React.useEffect(() => {
    if (profile?.displayName) {
      setEditName(profile.displayName);
    }
  }, [profile?.displayName]);

  const handleToggleSound = () => {
    const nextSoundState = !soundEnabled;
    setSoundEnabled(nextSoundState);
    localStorage.setItem('sound_enabled', nextSoundState ? 'true' : 'false');
    if (nextSoundState) {
      setTimeout(() => playRetroBeep(600, 'sine', 0.1), 50);
    }
  };

  const handleCycleAvatar = () => {
    if (!profile) return;
    const currentSeed = profile.avatar ? (profile.avatar.split('seed=')[1] || 'retro') : 'retro';
    const currentIndex = AVATAR_SEEDS.indexOf(currentSeed);
    const nextIndex = (currentIndex + 1) % AVATAR_SEEDS.length;
    const nextSeed = AVATAR_SEEDS[nextIndex];
    const nextAvatarUrl = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${nextSeed}`;
    onUpdateProfile(profile.displayName, nextAvatarUrl);
    playRetroBeep(700, 'square', 0.08);
  };

  const handleConfirmResetElo = () => {
    onResetElo?.();
    setShowEloResetConfirm(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim()) {
      onUpdateProfile(editName.trim());
      setIsEditing(false);
      playRetroBeep(500, 'sine', 0.08);
    }
  };

  const handleTabClick = (view: typeof NAVIGATION_ITEMS[number]['id']) => {
    onViewChange(view);
    playRetroBeep(330, 'sine', 0.05);
    setIsMenuOpen(false); // Close menu on selection
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
    playRetroBeep(440, 'sine', 0.05);
  };

  return (
    <header className="bg-stone-900 text-stone-100 border-b-4 border-stone-800 shadow-md relative z-50">
      {/* Upper Navigation Row */}
      <div className="max-w-7xl mx-auto py-3.5 px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Title / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500 border-2 border-white flex items-center justify-center font-bold text-xl text-white shadow-inner animate-bounce relative">
            🎮
          </div>
          <div>
            <h1 id="app-logo-title" className="text-xl sm:text-2xl font-serif tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-200 to-yellow-400 font-extrabold select-none">
              gametuoitho.space
            </h1>
            <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block -mt-1">Nostalgia Brain Arena</span>
          </div>
        </div>

        {/* Desktop: Profile Card / Badges / Auth */}
        <div className="hidden md:flex items-center gap-2.5 relative">
          {profile && profile.username ? (
            /* Logged In Desktop: Clickable User Avatar + Name Trigger */
            <div className="relative">
              <button
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen);
                  playRetroBeep(550, 'sine', 0.05);
                }}
                className="flex items-center gap-2.5 bg-stone-950/60 hover:bg-stone-950/90 py-1.5 px-3 rounded-2xl border border-stone-800/80 cursor-pointer transition-all hover:border-orange-500/50 group select-none"
              >
                <img
                  src={profile.avatar}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full border border-stone-700 bg-stone-800 group-hover:border-orange-500 transition-colors"
                />
                <div className="text-left">
                  <div className="text-xs font-black text-stone-100 tracking-wide group-hover:text-orange-400 transition-colors flex items-center gap-1.5">
                    {profile.displayName}
                    <ChevronDown className="w-3 h-3 text-stone-400 group-hover:text-orange-400" />
                  </div>
                  <div className="text-[9px] font-mono text-stone-400 uppercase tracking-widest leading-none mt-0.5">
                    Elo: {Math.max(...Object.values(profile.elo || { default: 1500 }))} Max
                  </div>
                </div>
              </button>

              {/* Desktop Absolute Dropdown Settings Menu */}
              <AnimatePresence>
                {isDropdownOpen && (
                  <>
                    {/* Invisible clickaway backdrop */}
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-96 bg-stone-900 border-2 border-stone-800 rounded-2xl shadow-2xl z-50 p-4 text-stone-100 divide-y divide-stone-800 overflow-hidden"
                    >
                      {/* Section 1: Profile card with quick edits */}
                      <div className="pb-3.5 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative group">
                            <img
                              src={profile.avatar}
                              alt="Avatar"
                              className="w-14 h-14 rounded-full border-2 border-stone-700 bg-stone-800"
                            />
                            <button
                              onClick={handleCycleAvatar}
                              title="Đổi avatar ngẫu nhiên"
                              className="absolute -bottom-1 -right-1 bg-orange-500 hover:bg-orange-600 border border-white text-white p-1 rounded-full shadow-md cursor-pointer hover:scale-110 active:scale-95 transition-all"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <form 
                                onSubmit={(e) => {
                                  handleEditSubmit(e);
                                }} 
                                className="flex gap-1.5 items-center w-full"
                              >
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="bg-stone-800 border border-stone-600 rounded-lg text-xs py-1 px-2 text-stone-100 w-full focus:outline-none focus:border-orange-500 font-bold"
                                  maxLength={15}
                                  autoFocus
                                />
                                <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-xs font-bold px-2.5 py-1 rounded-md cursor-pointer transition-colors shrink-0">Lưu</button>
                              </form>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-black text-white truncate">{profile.displayName}</span>
                                {profile.role === 'admin' ? (
                                  <span className="text-[8px] font-mono font-black bg-red-600 text-white px-1.5 py-0.5 rounded leading-none uppercase tracking-wider">Admin</span>
                                ) : (
                                  <span className="text-[8px] font-mono font-black bg-stone-700 text-stone-300 px-1.5 py-0.5 rounded leading-none uppercase tracking-wider">Kỳ Thủ</span>
                                )}
                                <button
                                  onClick={() => {
                                    setEditName(profile.displayName);
                                    setIsEditing(true);
                                    playRetroBeep(440, 'sine', 0.05);
                                  }}
                                  className="text-[10px] text-orange-400 hover:text-orange-300 underline cursor-pointer"
                                >
                                  Sửa
                                </button>
                              </div>
                            )}
                            <div className="text-[11px] text-stone-400 font-mono mt-0.5">@{profile.username}</div>
                            
                            <div className="flex items-center gap-3.5 mt-1.5">
                              <span className="text-[10px] text-stone-300 flex items-center gap-0.5 font-mono bg-stone-950/40 px-2 py-0.5 rounded border border-stone-800">
                                <Shield className="w-3 h-3 text-yellow-400 animate-pulse" /> Danh Vọng: <b className="text-stone-100">{profile.honorScore}</b>
                              </span>
                              {profile.badges && profile.badges.length > 0 && (
                                <span className="text-[10px] text-stone-300 flex items-center gap-0.5 font-mono bg-stone-950/40 px-2 py-0.5 rounded border border-stone-800">
                                  <Award className="w-3 h-3 text-green-400" /> {profile.badges[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Game Elos Rating Table */}
                      <div className="py-3.5">
                        <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest block mb-2 font-black">⭐ ĐIỂM CHỈ SỐ ELO TRÒ CHƠI</span>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">🎮 Cờ Caro</span>
                            <span className="font-mono font-bold text-orange-400">{profile.elo?.caro ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">☖ Cờ Tướng</span>
                            <span className="font-mono font-bold text-red-400">{profile.elo?.co_tuong ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">☗ Cờ Vua</span>
                            <span className="font-mono font-bold text-blue-400">{profile.elo?.co_vua ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">🟡 Ô Ăn Quan</span>
                            <span className="font-mono font-bold text-yellow-400">{profile.elo?.o_an_quan ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">🎲 Cờ Cá Ngựa</span>
                            <span className="font-mono font-bold text-green-400">{profile.elo?.co_ca_ngua ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">🖼️ Đuổi Hình Bắt Chữ</span>
                            <span className="font-mono font-bold text-pink-400">{profile.elo?.duoi_hinh_bat_chu ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">🔗 Nối Chữ</span>
                            <span className="font-mono font-bold text-teal-400">{profile.elo?.noi_chu ?? 1500}</span>
                          </div>
                          <div className="flex items-center justify-between bg-stone-950/40 p-1.5 rounded-lg border border-stone-800">
                            <span className="text-stone-400">🔠 Đoán Từ</span>
                            <span className="font-mono font-bold text-amber-400">{profile.elo?.doan_tu ?? 1500}</span>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Interactive Sound Toggle & Reset Elo options */}
                      <div className="py-3.5 flex flex-col gap-2.5">
                        <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest block font-black">⚙️ THIẾT LẬP HỆ THỐNG</span>
                        
                        {/* Audio Toggle */}
                        <button
                          onClick={handleToggleSound}
                          className="flex items-center justify-between w-full bg-stone-950/40 hover:bg-stone-950/70 py-2 px-3 rounded-xl border border-stone-800 transition-all cursor-pointer text-left text-xs"
                        >
                          <span className="flex items-center gap-2 text-stone-300">
                            {soundEnabled ? <Volume2 className="w-4 h-4 text-green-400" /> : <VolumeX className="w-4 h-4 text-stone-500" />}
                            Âm thanh game Retro
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${soundEnabled ? 'bg-green-500/20 text-green-400' : 'bg-stone-800 text-stone-500'}`}>
                            {soundEnabled ? 'BẬT' : 'TẮT'}
                          </span>
                        </button>

                        {/* Elo Reset */}
                        <div className="bg-stone-950/40 p-2 rounded-xl border border-stone-800 text-xs">
                          {!showEloResetConfirm ? (
                            <button
                              onClick={() => {
                                setShowEloResetConfirm(true);
                                playRetroBeep(440, 'triangle', 0.15);
                              }}
                              className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors w-full text-left font-mono text-[11px] cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Khôi phục Elo ban đầu (1500)
                            </button>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-amber-400 font-bold block text-[10px]">⚠️ Đưa tất cả Elo game về 1500?</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleConfirmResetElo}
                                  className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-extrabold px-2.5 py-1 rounded cursor-pointer"
                                >
                                  Xác nhận xóa
                                </button>
                                <button
                                  onClick={() => {
                                    setShowEloResetConfirm(false);
                                    playRetroBeep(500, 'sine', 0.05);
                                  }}
                                  className="bg-stone-700 hover:bg-stone-600 text-stone-300 text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer"
                                >
                                  Hủy bỏ
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Section 4: Log Out */}
                      <div className="pt-3 flex justify-end">
                        <button
                          onClick={() => {
                            setIsDropdownOpen(false);
                            onSignOut?.();
                          }}
                          className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" /> Đăng xuất tài khoản
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            /* Not Logged In Desktop: Regular Button */
            <button
              onClick={() => onOpenAuthModal?.()}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.97] text-white text-[11px] font-black px-4.5 py-2.5 rounded-2xl border border-orange-400/30 cursor-pointer shadow-lg hover:shadow-orange-500/10 transition-all flex items-center gap-1.5 shrink-0 animate-pulse"
            >
              🔑 ĐĂNG NHẬP / ĐĂNG KÝ
            </button>
          )}
        </div>

        {/* Mobile: Hamburger + Avatar button */}
        <div className="flex md:hidden items-center gap-2.5">
          {profile && profile.username ? (
            /* Logged in on mobile: Clickable Avatar to toggle bottom sheet settings */
            <button
              onClick={() => {
                setIsDropdownOpen(true);
                playRetroBeep(550, 'sine', 0.05);
              }}
              className="w-8 h-8 rounded-full border-2 border-orange-500/50 hover:border-orange-500 bg-stone-800 shadow-md relative overflow-hidden transition-all focus:outline-none cursor-pointer"
            >
              <img
                src={profile.avatar}
                alt="Profile icon"
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            /* Not logged in on mobile: Simple Auth Trigger Button */
            <button
              onClick={() => {
                onOpenAuthModal?.();
                playRetroBeep(500, 'sine', 0.08);
              }}
              className="bg-orange-500 hover:bg-orange-600 active:scale-[0.97] text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg border border-orange-400/30 cursor-pointer transition-all shrink-0 uppercase tracking-wide"
            >
              🔑 Đăng Nhập
            </button>
          )}

          <button
            onClick={toggleMenu}
            id="mobile-menu-hamburger"
            className="p-2 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-xl transition-all border border-stone-700 focus:outline-none cursor-pointer"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Desktop & Tablet: Sticky Navigation Tab Rail */}
      <nav className="hidden md:flex justify-center bg-white border-t border-stone-200 py-2 px-4 gap-1 sm:gap-2 lg:gap-4 overflow-x-auto sticky top-0 z-40 shadow-xs">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              onClick={() => handleTabClick(item.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap
                ${isActive 
                  ? 'bg-orange-500 text-white shadow-sm' 
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }
              `}
            >
              <IconComponent className={`w-4 h-4 ${isActive ? 'text-white' : item.color}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile: Collapsible Drawer Menu Dropdown as an Overlay Sheet */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Dark Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { playRetroBeep(440, 'sine', 0.05); setIsMenuOpen(false); }}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
            />

            {/* Menu Card Overlay */}
            <motion.div
              initial={{ y: -15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="md:hidden absolute top-full left-0 w-full bg-stone-900 border-b-4 border-stone-800 shadow-2xl overflow-y-auto max-h-[80vh] z-50"
            >
              <div className="px-5 py-6 flex flex-col gap-6">
                {/* Part 1: Collapsible Menu Links */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-mono text-stone-400 uppercase tracking-widest block mb-1">Danh mục trò chơi</span>
                  {NAVIGATION_ITEMS.map((item) => {
                    const isActive = activeView === item.id;
                    const IconComponent = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer text-left
                          ${isActive 
                            ? 'bg-orange-500 text-white' 
                            : 'bg-stone-800/40 text-stone-300 hover:bg-stone-800 hover:text-white'
                          }
                        `}
                      >
                        <span className="flex items-center gap-2.5">
                          <IconComponent className={`w-4 h-4 ${isActive ? 'text-white' : item.color}`} />
                          {item.label}
                        </span>
                        {isActive && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                      </button>
                    );
                  })}
                </div>

                {/* Part 2: User Settings & Profile editing / Auth */}
                <div className="bg-stone-950/60 p-4 rounded-2xl border border-stone-800/80 flex flex-col gap-3.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-mono text-stone-400 uppercase tracking-widest block">Thiết lập tài khoản</span>
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (profile && profile.username) {
                          onSignOut?.();
                        } else {
                          onOpenAuthModal?.();
                        }
                      }}
                      className="text-xs font-extrabold text-orange-400 hover:text-orange-300 underline cursor-pointer"
                    >
                      {profile && profile.username ? 'Đăng xuất' : '🔑 Đăng nhập'}
                    </button>
                  </div>
                  
                  {profile && (
                    <div className="flex items-center gap-3">
                      <img
                        src={profile.avatar}
                        alt="Avatar"
                        className="w-12 h-12 rounded-full border border-stone-700 bg-stone-800"
                      />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <form onSubmit={handleEditSubmit} className="flex gap-1.5 items-center w-full">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="bg-stone-800 border border-stone-600 rounded-lg text-xs sm:text-sm py-1.5 px-3 text-stone-100 w-full focus:outline-none focus:border-orange-500"
                              maxLength={15}
                              autoFocus
                            />
                            <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors">Lưu</button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm sm:text-base font-extrabold text-white truncate">
                              {profile.displayName}
                            </span>
                            {profile.role === 'admin' ? (
                              <span className="text-[8px] font-mono font-black bg-red-600 text-white px-1.5 py-0.5 rounded tracking-wider uppercase">Admin</span>
                            ) : (
                              <span className="text-[8px] font-mono font-black bg-stone-700 text-stone-300 px-1.5 py-0.5 rounded tracking-wider uppercase">Kỳ Thủ</span>
                            )}
                            <button
                              onClick={() => {
                                setEditName(profile.displayName);
                                setIsEditing(true);
                              }}
                              className="text-xs text-stone-400 hover:text-white underline cursor-pointer"
                            >
                              Sửa
                            </button>
                          </div>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                          <span className="text-xs text-stone-300 flex items-center gap-1 font-mono">
                            <Shield className="w-3.5 h-3.5 text-yellow-400 animate-pulse" /> Danh Vọng: <b className="text-stone-100 font-extrabold">{profile.honorScore}</b>
                          </span>
                          {profile.badges && profile.badges.length > 0 && (
                            <span className="text-[11px] font-bold text-stone-300 flex items-center gap-1 bg-stone-800 px-2 py-0.5 rounded border border-stone-700">
                              <Award className="w-3.5 h-3.5 text-green-400" /> {profile.badges[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile: Bottom Sheet Profile & Settings Modal */}
      <AnimatePresence>
        {isDropdownOpen && (
          <div className="fixed inset-0 z-[100] md:hidden flex flex-col justify-end">
            {/* Backdrop blurred overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsDropdownOpen(false);
                playRetroBeep(440, 'sine', 0.05);
              }}
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
            />
            
            {/* Sliding sheet container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full bg-stone-900 border-t-4 border-stone-800 rounded-t-3xl max-h-[90vh] overflow-y-auto p-5 pb-8 text-stone-100 flex flex-col divide-y divide-stone-800 z-50 shadow-2xl"
            >
              {/* Drag line handle */}
              <div className="w-12 h-1.5 bg-stone-800 rounded-full mx-auto mb-5 shrink-0" />

              {/* Close Button top-right */}
              <button 
                onClick={() => {
                  setIsDropdownOpen(false);
                  playRetroBeep(440, 'sine', 0.05);
                }}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* SECTION 1: Profile & Avatar update */}
              {profile && (
                <div className="pb-4 flex flex-col gap-4">
                  <div className="flex items-center gap-4 mt-2">
                    <div className="relative">
                      <img
                        src={profile.avatar}
                        alt="Avatar"
                        className="w-16 h-16 rounded-full border-2 border-stone-700 bg-stone-800"
                      />
                      <button
                        onClick={handleCycleAvatar}
                        className="absolute -bottom-1 -right-1 bg-orange-500 border border-white text-white p-1.5 rounded-full shadow-md cursor-pointer transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <form 
                          onSubmit={handleEditSubmit} 
                          className="flex gap-1.5 items-center w-full"
                        >
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-stone-800 border border-stone-600 rounded-lg text-xs py-1.5 px-3 text-stone-100 w-full focus:outline-none focus:border-orange-500 font-bold"
                            maxLength={15}
                            autoFocus
                          />
                          <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-xs font-bold px-3 py-1.5 rounded-md cursor-pointer transition-colors">Lưu</button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-black text-white truncate">{profile.displayName}</span>
                          {profile.role === 'admin' ? (
                            <span className="text-[8px] font-mono font-black bg-red-600 text-white px-1.5 py-0.5 rounded leading-none uppercase">Admin</span>
                          ) : (
                            <span className="text-[8px] font-mono font-black bg-stone-700 text-stone-300 px-1.5 py-0.5 rounded leading-none uppercase">Kỳ Thủy</span>
                          )}
                          <button
                            onClick={() => {
                              setEditName(profile.displayName);
                              setIsEditing(true);
                              playRetroBeep(440, 'sine', 0.05);
                            }}
                            className="text-xs text-orange-400 hover:text-orange-300 underline cursor-pointer"
                          >
                            Sửa
                          </button>
                        </div>
                      )}
                      <div className="text-xs text-stone-400 font-mono mt-0.5">@{profile.username}</div>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[10px] text-stone-300 flex items-center gap-0.5 font-mono bg-stone-950/40 px-2 py-0.5 rounded border border-stone-800">
                          <Shield className="w-3 h-3 text-yellow-400 animate-pulse" /> Danh Vọng: <b className="text-stone-100">{profile.honorScore}</b>
                        </span>
                        {profile.badges && profile.badges.length > 0 && (
                          <span className="text-[10px] text-stone-300 flex items-center gap-0.5 font-mono bg-stone-950/40 px-2 py-0.5 rounded border border-stone-800">
                            <Award className="w-3 h-3 text-green-400" /> {profile.badges[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 2: Game Elos Rating Table */}
              {profile && (
                <div className="py-4">
                  <span className="text-[11px] font-mono text-stone-400 uppercase tracking-widest block mb-2.5 font-black">⭐ ĐIỂM CHỈ SỐ ELO TRÒ CHƠI</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">🎮 Cờ Caro</span>
                      <span className="font-mono font-bold text-orange-400">{profile.elo?.caro ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">☖ Cờ Tướng</span>
                      <span className="font-mono font-bold text-red-400">{profile.elo?.co_tuong ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">☗ Cờ Vua</span>
                      <span className="font-mono font-bold text-blue-400">{profile.elo?.co_vua ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">🟡 Ô Ăn Quan</span>
                      <span className="font-mono font-bold text-yellow-400">{profile.elo?.o_an_quan ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">🎲 Cờ Cá Ngựa</span>
                      <span className="font-mono font-bold text-green-400">{profile.elo?.co_ca_ngua ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">🖼️ Đuổi Hình Bắt Chữ</span>
                      <span className="font-mono font-bold text-pink-400">{profile.elo?.duoi_hinh_bat_chu ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">🔗 Nối Chữ</span>
                      <span className="font-mono font-bold text-teal-400">{profile.elo?.noi_chu ?? 1500}</span>
                    </div>
                    <div className="flex items-center justify-between bg-stone-950/40 p-2.5 rounded-xl border border-stone-800">
                      <span className="text-stone-400">🔠 Đoán Từ</span>
                      <span className="font-mono font-bold text-amber-400">{profile.elo?.doan_tu ?? 1500}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: System settings */}
              <div className="py-4 flex flex-col gap-3">
                <span className="text-[11px] font-mono text-stone-400 uppercase tracking-widest block font-black">⚙️ THIẾT LẬP HỆ THỐNG</span>
                
                {/* Audio Toggle */}
                <button
                  onClick={handleToggleSound}
                  className="flex items-center justify-between w-full bg-stone-950/40 hover:bg-stone-950/70 py-3 px-4 rounded-xl border border-stone-800 transition-all cursor-pointer text-sm"
                >
                  <span className="flex items-center gap-2 text-stone-300">
                    {soundEnabled ? <Volume2 className="w-4.5 h-4.5 text-green-400" /> : <VolumeX className="w-4.5 h-4.5 text-stone-500" />}
                    Âm thanh game Retro
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded font-mono ${soundEnabled ? 'bg-green-500/20 text-green-400' : 'bg-stone-800 text-stone-500'}`}>
                    {soundEnabled ? 'BẬT' : 'TẮT'}
                  </span>
                </button>

                {/* Elo Reset */}
                <div className="bg-stone-950/40 p-3 rounded-xl border border-stone-800 text-sm">
                  {!showEloResetConfirm ? (
                    <button
                      onClick={() => {
                        setShowEloResetConfirm(true);
                        playRetroBeep(440, 'triangle', 0.15);
                      }}
                      className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors w-full text-left font-mono text-xs cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" /> Khôi phục Elo ban đầu (1500)
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <span className="text-amber-400 font-bold block text-xs">⚠️ Đưa tất cả Elo game về 1500?</span>
                      <div className="flex gap-2.5">
                        <button
                          onClick={handleConfirmResetElo}
                          className="bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg cursor-pointer"
                        >
                          Xác nhận xóa
                        </button>
                        <button
                          onClick={() => {
                            setShowEloResetConfirm(false);
                            playRetroBeep(500, 'sine', 0.05);
                          }}
                          className="bg-stone-700 hover:bg-stone-600 text-stone-300 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                        >
                          Hủy bỏ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: Log Out */}
              <div className="pt-4 shrink-0">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onSignOut?.();
                  }}
                  className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4.5 h-4.5" /> Đăng xuất tài khoản
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}
