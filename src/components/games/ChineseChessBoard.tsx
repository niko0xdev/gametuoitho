import React, { useState, useEffect } from 'react';
import { playRetroBeep } from './CaroBoard.tsx';
import { Trophy, Swords, Zap } from 'lucide-react';

interface ChineseChessBoardProps {
  board: any[][];
  turn: string;
  userId: string;
  onMove: (move: { from: { r: number; c: number }; to: { r: number; c: number } }) => void;
  isSpectator: boolean;
  players?: string[];
  winner?: string | null;
  status?: string;
  onExit?: () => void;
}

const PIECE_NAMES: Record<string, { label: string; full: string }> = {
  jiang: { label: 'Tướng', full: 'Tướng' },
  shi: { label: 'Sĩ', full: 'Sĩ' },
  xiang: { label: 'Tượng', full: 'Tượng' },
  ma: { label: 'Mã', full: 'Mã' },
  ju: { label: 'Xe', full: 'Xe' },
  pao: { label: 'Pháo', full: 'Pháo' },
  zu: { label: 'Tốt', full: 'Tốt' }
};

const RED_CHARS: Record<string, string> = {
  jiang: '帥',
  shi: '仕',
  xiang: '相',
  ma: '傌',
  ju: '車',
  pao: '炮',
  zu: '兵'
};

const BLACK_CHARS: Record<string, string> = {
  jiang: '將',
  shi: '士',
  xiang: '象',
  ma: '馬',
  ju: '車',
  pao: '砲',
  zu: '卒'
};

// Client-side legal moves generator matching the server logic exactly
export function getChineseChessLegalMoves(
  r: number,
  c: number,
  board: any[][]
): { r: number; c: number }[] {
  const piece = board[r]?.[c];
  if (!piece) return [];
  const moves: { r: number; c: number }[] = [];
  const color = piece.color; // 'R' or 'B'
  const type = piece.type;   // 'jiang', 'shi', 'xiang', 'ma', 'ju', 'pao', 'zu'

  const isOOB = (row: number, col: number) => row < 0 || row >= 10 || col < 0 || col >= 9;

  if (type === 'jiang') {
    // 1 step orthogonally within Palace
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1]
    ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isOOB(nr, nc)) {
        const inPalace = (nc >= 3 && nc <= 5) && (color === 'B' ? (nr >= 0 && nr <= 2) : (nr >= 7 && nr <= 9));
        if (inPalace) {
          const target = board[nr][nc];
          if (!target || target.color !== color) {
            moves.push({ r: nr, c: nc });
          }
        }
      }
    }

    // Flying General check (Generals facing each other in same column)
    let otherGeneralPos: { r: number; c: number } | null = null;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const p = board[row][col];
        if (p && p.type === 'jiang' && p.color !== color) {
          otherGeneralPos = { r: row, c: col };
          break;
        }
      }
      if (otherGeneralPos) break;
    }

    if (otherGeneralPos && otherGeneralPos.c === c) {
      const startRow = Math.min(r, otherGeneralPos.r) + 1;
      const endRow = Math.max(r, otherGeneralPos.r);
      let blocked = false;
      for (let row = startRow; row < endRow; row++) {
        if (board[row][c] !== null) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        moves.push({ r: otherGeneralPos.r, c: otherGeneralPos.c });
      }
    }

  } else if (type === 'shi') {
    // 1 step diagonally within Palace
    const dirs = [
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isOOB(nr, nc)) {
        const inPalace = (nc >= 3 && nc <= 5) && (color === 'B' ? (nr >= 0 && nr <= 2) : (nr >= 7 && nr <= 9));
        if (inPalace) {
          const target = board[nr][nc];
          if (!target || target.color !== color) {
            moves.push({ r: nr, c: nc });
          }
        }
      }
    }

  } else if (type === 'xiang') {
    // 2 steps diagonally, cannot cross river, blocked in center ("cản mắt tượng")
    const dirs = [
      [-2, -2], [-2, 2], [2, -2], [2, 2]
    ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isOOB(nr, nc)) {
        const sameSide = color === 'B' ? (nr <= 4) : (nr >= 5);
        if (sameSide) {
          const mr = r + dr / 2;
          const mc = c + dc / 2;
          if (board[mr]?.[mc] === null) {
            const target = board[nr][nc];
            if (!target || target.color !== color) {
              moves.push({ r: nr, c: nc });
            }
          }
        }
      }
    }

  } else if (type === 'ma') {
    // L-shape, blocked by adjacent piece ("cản chân mã")
    const horseMoves = [
      { dr: -2, dc: -1, br: -1, bc: 0 },
      { dr: -2, dc: 1, br: -1, bc: 0 },
      { dr: 2, dc: -1, br: 1, bc: 0 },
      { dr: 2, dc: 1, br: 1, bc: 0 },
      { dr: -1, dc: -2, br: 0, bc: -1 },
      { dr: -1, dc: 2, br: 0, bc: 1 },
      { dr: 1, dc: -2, br: 0, bc: -1 },
      { dr: 1, dc: 2, br: 0, bc: 1 }
    ];
    for (const m of horseMoves) {
      const nr = r + m.dr;
      const nc = c + m.dc;
      if (!isOOB(nr, nc)) {
        const br = r + m.br;
        const bc = c + m.bc;
        if (board[br]?.[bc] === null) {
          const target = board[nr][nc];
          if (!target || target.color !== color) {
            moves.push({ r: nr, c: nc });
          }
        }
      }
    }

  } else if (type === 'ju') {
    // Straight lines
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1]
    ];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (!isOOB(nr, nc)) {
        const target = board[nr][nc];
        if (target === null) {
          moves.push({ r: nr, c: nc });
        } else {
          if (target.color !== color) {
            moves.push({ r: nr, c: nc });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }

  } else if (type === 'pao') {
    // Straight lines, captures by jumping exactly 1 piece
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1]
    ];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      let jumped = false;
      while (!isOOB(nr, nc)) {
        const target = board[nr][nc];
        if (!jumped) {
          if (target === null) {
            moves.push({ r: nr, c: nc });
          } else {
            jumped = true;
          }
        } else {
          if (target !== null) {
            if (target.color !== color) {
              moves.push({ r: nr, c: nc });
            }
            break;
          }
        }
        nr += dr;
        nc += dc;
      }
    }

  } else if (type === 'zu') {
    // 1 step forward, sideways after crossing river
    const forwardDr = color === 'R' ? -1 : 1;
    const nr = r + forwardDr;
    if (!isOOB(nr, c)) {
      const target = board[nr][c];
      if (!target || target.color !== color) {
        moves.push({ r: nr, c: c });
      }
    }

    const crossedRiver = color === 'R' ? (r <= 4) : (r >= 5);
    if (crossedRiver) {
      const sideways = [-1, 1];
      for (const dc of sideways) {
        const nc = c + dc;
        if (!isOOB(r, nc)) {
          const target = board[r][nc];
          if (!target || target.color !== color) {
            moves.push({ r, c: nc });
          }
        }
      }
    }
  }

  return moves;
}

export default function ChineseChessBoard({
  board,
  turn,
  userId,
  onMove,
  isSpectator,
  players = [],
  winner,
  status,
  onExit
}: ChineseChessBoardProps) {
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [legalTargets, setLegalTargets] = useState<{ r: number; c: number }[]>([]);
  const [lastMove, setLastMove] = useState<{ from: { r: number; c: number }; to: { r: number; c: number } } | null>(null);
  
  // Game Clocks
  const [redTime, setRedTime] = useState<number>(600);
  const [blackTime, setBlackTime] = useState<number>(600);

  // Sound play prevention state
  const [soundPlayed, setSoundPlayed] = useState(false);

  const playVictorySound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const notes = [
        { freq: 523.25, time: 0.0, type: 'triangle' as OscillatorType }, // C5
        { freq: 659.25, time: 0.1, type: 'triangle' as OscillatorType }, // E5
        { freq: 783.99, time: 0.2, type: 'triangle' as OscillatorType }, // G5
        { freq: 1046.50, time: 0.3, type: 'sine' as OscillatorType }, // C6
        { freq: 1318.51, time: 0.45, type: 'sine' as OscillatorType }, // E6
      ];

      notes.forEach(({ freq, time, type }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + 0.3);
        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + 0.3);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const playDefeatSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const notes = [
        { freq: 392.00, time: 0.0, dur: 0.18, type: 'sawtooth' as OscillatorType }, // G4
        { freq: 311.13, time: 0.18, dur: 0.18, type: 'sawtooth' as OscillatorType }, // Eb4
        { freq: 246.94, time: 0.36, dur: 0.22, type: 'sawtooth' as OscillatorType }, // B3
        { freq: 196.00, time: 0.58, dur: 0.7, type: 'sawtooth' as OscillatorType }, // G3
      ];

      notes.forEach(({ freq, time, dur, type }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);
        
        if (freq === 196.00) {
          osc.frequency.linearRampToValueAtTime(130.81, ctx.currentTime + time + dur); // slide down to C3
        }

        gain.gain.setValueAtTime(0.1, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + dur);
        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + dur);
      });
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => {
    if (status === 'ENDED' && !soundPlayed) {
      setSoundPlayed(true);
      if (winner === 'DRAW') {
        // Play draw sound - standard select clicks
        playChessSound('select');
      } else if (winner === userId) {
        playVictorySound();
      } else if (winner && winner !== userId) {
        playDefeatSound();
      }
    } else if (status !== 'ENDED') {
      setSoundPlayed(false);
    }
  }, [status, winner, userId, soundPlayed]);

  // Sound Synth Generator
  const playChessSound = (type: 'move' | 'capture' | 'select') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        // Deep wood thump click sound
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'capture') {
        // Stronger wood slam sound
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } else if (type === 'select') {
        // Short subtle click
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // Detect board changes & moves to play sounds + update visual trail
  const prevBoardRef = React.useRef<any[][] | null>(null);
  useEffect(() => {
    if (prevBoardRef.current && board) {
      let from: { r: number; c: number } | null = null;
      let to: { r: number; c: number } | null = null;
      let movedPiece: any = null;
      let isCapture = false;

      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          const prevPiece = prevBoardRef.current[r]?.[c];
          const newPiece = board[r]?.[c];

          if (prevPiece && !newPiece) {
            from = { r, c };
            movedPiece = prevPiece;
          } else if (!prevPiece && newPiece) {
            to = { r, c };
          } else if (prevPiece && newPiece && (prevPiece.color !== newPiece.color || prevPiece.type !== newPiece.type)) {
            to = { r, c };
            isCapture = true;
          }
        }
      }

      if (from && to && movedPiece) {
        setLastMove({ from, to });
        if (isCapture) {
          playChessSound('capture');
        } else {
          playChessSound('move');
        }
      }
    }
    prevBoardRef.current = JSON.parse(JSON.stringify(board));
  }, [board]);

  // Turn ticking clocks
  useEffect(() => {
    const timer = setInterval(() => {
      if (turn === players[0]) {
        setRedTime(prev => Math.max(0, prev - 1));
      } else if (turn === players[1]) {
        setBlackTime(prev => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [turn, players]);

  // Reset clocks to 10 mins when game restarts
  const activePieceCount = board.flat().filter(Boolean).length;
  useEffect(() => {
    if (activePieceCount === 32) {
      setRedTime(600);
      setBlackTime(600);
    }
  }, [activePieceCount]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clear selection if turn changes
  useEffect(() => {
    setSelected(null);
    setLegalTargets([]);
  }, [turn]);

  // Determine role color: index 0 is Red (R), index 1 is Black (B)
  const isPlayer0 = players[0] === userId;
  const isPlayer1 = players[1] === userId;
  const myColor = isPlayer0 ? 'R' : (isPlayer1 ? 'B' : null);
  const isMyTurn = turn === userId && !isSpectator;

  // Track captured pieces
  const expectedCount: Record<string, number> = {
    'R_jiang': 1, 'R_shi': 2, 'R_xiang': 2, 'R_ma': 2, 'R_ju': 2, 'R_pao': 2, 'R_zu': 5,
    'B_jiang': 1, 'B_shi': 2, 'B_xiang': 2, 'B_ma': 2, 'B_ju': 2, 'B_pao': 2, 'B_zu': 5,
  };

  const activeCount: Record<string, number> = {};
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r]?.[c];
      if (piece) {
        const key = `${piece.color}_${piece.type}`;
        activeCount[key] = (activeCount[key] || 0) + 1;
      }
    }
  }

  const redCaptured: string[] = [];
  const blackCaptured: string[] = [];

  for (const [key, expected] of Object.entries(expectedCount)) {
    const active = activeCount[key] || 0;
    const capturedCount = expected - active;
    const [color, type] = key.split('_');
    for (let i = 0; i < capturedCount; i++) {
      if (color === 'R') {
        redCaptured.push(type);
      } else {
        blackCaptured.push(type);
      }
    }
  }

  const handleCellClick = (r: number, c: number) => {
    if (isSpectator) return;
    if (!isMyTurn) {
      playRetroBeep(150, 'sawtooth', 0.1);
      return;
    }

    const piece = board[r]?.[c];

    if (selected) {
      // Double click to deselect
      if (selected.r === r && selected.c === c) {
        setSelected(null);
        setLegalTargets([]);
        playChessSound('select');
        return;
      }

      // If clicked on own color piece, switch selection
      if (piece && piece.color === myColor) {
        setSelected({ r, c });
        setLegalTargets(getChineseChessLegalMoves(r, c, board));
        playChessSound('select');
        return;
      }

      // Try executing move if clicked target is legal
      const isLegal = legalTargets.some(t => t.r === r && t.c === c);
      if (isLegal) {
        onMove({ from: selected, to: { r, c } });
        setSelected(null);
        setLegalTargets([]);
      } else {
        // Invalid destination
        playRetroBeep(200, 'square', 0.15);
      }
    } else {
      // Try to select
      if (piece) {
        if (piece.color !== myColor) {
          // Can't select opponent's pieces
          playRetroBeep(180, 'square', 0.1);
          return;
        }
        setSelected({ r, c });
        setLegalTargets(getChineseChessLegalMoves(r, c, board));
        playChessSound('select');
      }
    }
  };

  const isPalace = (r: number, c: number) => {
    return (c >= 3 && c <= 5) && ((r >= 0 && r <= 2) || (r >= 7 && r <= 9));
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      
      {/* Game Status Banner */}
      <div className="w-full max-w-lg mb-4 flex justify-between items-center bg-stone-100/80 border border-stone-200/80 p-3 rounded-xl shadow-inner gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-xs font-serif font-bold text-stone-700">Cờ Tướng Trí Tuệ</span>
        </div>
        <div>
          {isSpectator ? (
            <span className="px-3 py-1 bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Khán Giả Đang Xem
            </span>
          ) : isMyTurn ? (
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-[10px] font-bold rounded-full uppercase tracking-wider animate-pulse flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-600 fill-emerald-600" /> Đến lượt bạn đi cờ
            </span>
          ) : (
            <span className="px-3 py-1 bg-stone-200 text-stone-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Chờ nước đối thủ...
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 w-full max-w-4xl px-2">
        
        {/* Left Side: Opponent (Black) Card and Captured trophies */}
        <div className="md:col-span-1 flex md:flex-col justify-between md:justify-start gap-4 p-3 bg-stone-50 border border-stone-200 rounded-2xl shadow-sm">
          <div className="w-full">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-stone-800 border border-stone-600" />
              <span className="text-[10px] font-serif font-bold text-stone-700 uppercase tracking-wider leading-none">QUÂN ĐEN</span>
            </div>
            <p className="text-[11px] font-bold text-stone-800 truncate mb-1">
              {players[1] === userId ? 'Bạn (Đen)' : (players[1] ? 'Kỳ Thủ Đen' : 'Chờ...')}
            </p>
            <div className={`text-[10px] py-1 px-2 rounded font-mono ${turn === players[1] ? 'bg-orange-100 text-orange-800 font-bold' : 'bg-stone-200/50 text-stone-500'}`}>
              {turn === players[1] ? '● Đang đi cờ' : 'Chờ lượt'}
            </div>
            
            {/* Countdown timer for Black */}
            <div className={`mt-2 flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono font-bold border ${
              turn === players[1] 
                ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' 
                : 'bg-stone-100 text-stone-600 border-stone-200'
            }`}>
              <span className="text-[9px] uppercase text-stone-400">Thời gian:</span>
              <span>{formatTime(blackTime)}</span>
            </div>
          </div>

          <div className="w-full mt-2 md:mt-4">
            <span className="text-[9px] font-bold text-stone-400 block mb-1 uppercase tracking-wider">Tượng Đen captured Red:</span>
            <div className="flex flex-wrap gap-1">
              {redCaptured.length === 0 ? (
                <span className="text-[9px] text-stone-400 italic">Chưa ăn quân</span>
              ) : (
                redCaptured.map((type, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full bg-red-100 border border-red-400 flex items-center justify-center font-bold text-[9px] text-red-700 shadow-sm"
                    title={PIECE_NAMES[type]?.label}
                  >
                    {RED_CHARS[type]}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Side: Chinese Chess Board (9x10 layout) */}
        <div className="md:col-span-3 flex flex-col items-center justify-center bg-[#deae78] p-3 sm:p-5 rounded-3xl border-8 border-[#a06b3e] shadow-xl relative">
          
          {/* Wood texture layers & grid intersections design */}
          <div className="bg-[#ebd2a9] border-4 border-[#7b4d24] p-4 sm:p-6 relative w-[310px] h-[350px] sm:w-[460px] sm:h-[510px] shadow-inner">
            <div className="relative w-full h-full">
              
              {/* 10 horizontal lines */}
              {Array(10).fill(null).map((_, r) => (
                <div
                  key={r}
                  className="absolute left-0 right-0 h-0 border-t border-[#7b4d24]/50"
                  style={{ top: `${(r / 9) * 100}%` }}
                />
              ))}

              {/* 9 vertical lines with River gap */}
              {Array(9).fill(null).map((_, c) => {
                if (c === 0 || c === 8) {
                  return (
                    <div
                      key={c}
                      className="absolute top-0 bottom-0 w-0 border-l border-[#7b4d24]"
                      style={{ left: `${(c / 8) * 100}%` }}
                    />
                  );
                } else {
                  return (
                    <React.Fragment key={c}>
                      {/* Top half */}
                      <div
                        className="absolute top-0 w-0 border-l border-[#7b4d24]"
                        style={{
                          left: `${(c / 8) * 100}%`,
                          height: `${(4 / 9) * 100}%`
                        }}
                      />
                      {/* Bottom half */}
                      <div
                        className="absolute w-0 border-l border-[#7b4d24]"
                        style={{
                          left: `${(c / 8) * 100}%`,
                          top: `${(5 / 9) * 100}%`,
                          bottom: '0%'
                        }}
                      />
                    </React.Fragment>
                  );
                }
              })}

              {/* Palace Diagonals (X shapes) */}
              {/* Top Palace (Black) */}
              <svg 
                className="absolute pointer-events-none opacity-40" 
                style={{
                  left: `${(3 / 8) * 100}%`,
                  width: `${(2 / 8) * 100}%`,
                  top: '0%',
                  height: `${(2 / 9) * 100}%`
                }} 
                viewBox="0 0 100 100" 
                preserveAspectRatio="none"
              >
                <line x1="0" y1="0" x2="100" y2="100" stroke="#7b4d24" strokeWidth="2" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#7b4d24" strokeWidth="2" />
              </svg>
              
              {/* Bottom Palace (Red) */}
              <svg 
                className="absolute pointer-events-none opacity-40" 
                style={{
                  left: `${(3 / 8) * 100}%`,
                  width: `${(2 / 8) * 100}%`,
                  top: `${(7 / 9) * 100}%`,
                  height: `${(2 / 9) * 100}%`
                }} 
                viewBox="0 0 100 100" 
                preserveAspectRatio="none"
              >
                <line x1="0" y1="0" x2="100" y2="100" stroke="#7b4d24" strokeWidth="2" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#7b4d24" strokeWidth="2" />
              </svg>

              {/* SÔNG (THE RIVER MARKINGS) */}
              <div 
                className="absolute left-0 right-0 bg-[#f7e6cc]/85 border-y border-[#7b4d24] flex items-center justify-around pointer-events-none z-10 shadow-sm"
                style={{
                  top: `${(4 / 9) * 100}%`,
                  height: `${(1 / 9) * 100}%`
                }}
              >
                <span className="text-[#7b4d24] font-serif text-xs sm:text-sm tracking-widest font-extrabold rotate-180 md:rotate-0">
                  楚 河 <span className="hidden sm:inline">SỞ HÀ</span>
                </span>
                <span className="text-[#7b4d24] font-serif text-xs sm:text-sm tracking-widest font-extrabold">
                  漢 界 <span className="hidden sm:inline">HÁN GIỚI</span>
                </span>
              </div>

              {/* Interactive Grid Cell Nodes placement */}
              <div className="absolute inset-0 z-20">
                {board.map((row, r) => 
                  row.map((cell, c) => {
                    const isSelected = selected && selected.r === r && selected.c === c;
                    const isLegalTarget = legalTargets.some(t => t.r === r && t.c === c);
                    const character = cell ? (cell.color === 'R' ? RED_CHARS[cell.type] : BLACK_CHARS[cell.type]) : '';
                    
                    // Check if this node was part of the last move to show a visual trail
                    const isLastMoveFrom = lastMove && lastMove.from.r === r && lastMove.from.c === c;
                    const isLastMoveTo = lastMove && lastMove.to.r === r && lastMove.to.c === c;

                    return (
                      <button
                        key={`${r}-${c}`}
                        id={`cc-cell-${r}-${c}`}
                        onClick={() => handleCellClick(r, c)}
                        className={`absolute flex items-center justify-center cursor-pointer group outline-none rounded-full transition-all duration-300
                          ${isLastMoveFrom ? 'bg-amber-400/25 ring-2 ring-dashed ring-amber-400' : ''}
                          ${isLastMoveTo ? 'bg-amber-400/35 ring-2 ring-amber-500 animate-pulse' : ''}
                        `}
                        style={{
                          left: `${(c / 8) * 100}%`,
                          top: `${(r / 9) * 100}%`,
                          width: '12%',
                          height: '11%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        {cell ? (
                          <div
                            className={`w-8 h-8 sm:w-11 sm:h-11 rounded-full border-2 flex flex-col items-center justify-center font-serif font-extrabold select-none transition-all shadow-md transform hover:scale-105
                              ${cell.color === 'R'
                                ? 'bg-[#fdfbf7] border-red-800 text-red-700 shadow-red-900/30'
                                : 'bg-[#222222] border-stone-900 text-stone-100 shadow-black/60'
                              }
                              ${isSelected ? 'scale-110 ring-4 ring-amber-500 animate-bounce' : ''}
                            `}
                          >
                            {/* Wooden piece outer groove accent ring */}
                            <div className={`w-[85%] h-[85%] rounded-full border border-dashed flex flex-col items-center justify-center relative
                              ${cell.color === 'R' ? 'border-red-700/40' : 'border-stone-700/50'}
                            `}>
                              <span className="text-base sm:text-xl font-black leading-none">{character}</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Empty square but legal move indicator */}
                            {isLegalTarget ? (
                              <div className="relative flex items-center justify-center w-full h-full">
                                <div className="absolute w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500 opacity-80 animate-ping" />
                                <div className="absolute w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500 border border-emerald-400 shadow-md shadow-emerald-500/50" />
                              </div>
                            ) : (
                              // Micro dot indicators
                              <div className="w-1 h-1 rounded-full opacity-0 group-hover:opacity-40 bg-amber-900 transition-opacity" />
                            )}
                          </>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

            </div>
          </div>

          {/* End-Game Overlay */}
          {status === 'ENDED' && (
            <div className="absolute inset-0 bg-stone-950/85 backdrop-blur-md z-50 rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
              {isSpectator ? (
                <div className="flex flex-col items-center animate-pulse">
                  <div className="w-16 h-16 bg-amber-500/20 border border-amber-400 rounded-full flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/20">
                    <Trophy className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-serif font-extrabold text-amber-400 uppercase tracking-widest drop-shadow-md">
                    TRẬN ĐẤU KẾT THÚC
                  </h3>
                  <p className="text-xs text-stone-300 mt-2 max-w-xs leading-relaxed">
                    Kết quả chung cuộc: <br />
                    <b className="text-sm font-bold text-orange-500 mt-1 block">
                      {winner === 'DRAW' ? 'HÒA CỜ' : winner === players[0] ? 'KỲ THỦ ĐỎ THẮNG' : 'KỲ THỦ ĐEN THẮNG'}
                    </b>
                  </p>
                </div>
              ) : winner === userId ? (
                <div className="flex flex-col items-center animate-bounce">
                  <div className="w-16 h-16 bg-amber-500/20 border border-amber-400 rounded-full flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/20">
                    <Trophy className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif font-extrabold text-amber-400 uppercase tracking-widest drop-shadow-md">
                    CHIẾN THẮNG!
                  </h3>
                  <p className="text-xs text-stone-300 mt-2 max-w-xs leading-relaxed">
                    Xin chúc mừng! Bạn đã giành chiến thắng vinh quang bằng những nước cờ thần sầu! 🏆
                  </p>
                </div>
              ) : winner === 'DRAW' ? (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-stone-500/20 border border-stone-400 rounded-full flex items-center justify-center text-stone-400 mb-4">
                    <Swords className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif font-extrabold text-stone-300 uppercase tracking-widest">
                    HÒA CỜ!
                  </h3>
                  <p className="text-xs text-stone-300 mt-2 max-w-xs leading-relaxed">
                    Trận đấu kết thúc bất phân thắng bại! Hai bên kỳ phùng địch thủ, tài trí ngang nhau.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center animate-pulse">
                  <div className="w-16 h-16 bg-red-500/20 border border-red-400 rounded-full flex items-center justify-center text-red-400 mb-4 shadow-lg shadow-red-500/20">
                    <Swords className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif font-extrabold text-red-500 uppercase tracking-widest drop-shadow-md">
                    THẤT BẠI!
                  </h3>
                  <p className="text-xs text-stone-300 mt-2 max-w-xs leading-relaxed">
                    Không sao cả! Hãy đúc rút kinh nghiệm và sẵn sàng phục thù ở trận tiếp theo! 💪
                  </p>
                </div>
              )}

              <div className="mt-8 flex gap-3">
                {onExit && (
                  <button
                    onClick={onExit}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-serif font-bold text-xs py-2.5 px-6 rounded-xl transition-all cursor-pointer shadow-lg shadow-orange-900/30"
                  >
                    Trở Về Đại Sảnh
                  </button>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Side: Red Player Card and Captured trophies */}
        <div className="md:col-span-1 flex md:flex-col justify-between md:justify-start gap-4 p-3 bg-stone-50 border border-stone-200 rounded-2xl shadow-sm">
          <div className="w-full">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-red-600 border border-red-800" />
              <span className="text-[10px] font-serif font-bold text-stone-700 uppercase tracking-wider leading-none">QUÂN ĐỎ</span>
            </div>
            <p className="text-[11px] font-bold text-stone-800 truncate mb-1">
              {players[0] === userId ? 'Bạn (Đỏ)' : (players[0] ? 'Kỳ Thủ Đỏ' : 'Chờ...')}
            </p>
            <div className={`text-[10px] py-1 px-2 rounded font-mono ${turn === players[0] ? 'bg-orange-100 text-orange-800 font-bold' : 'bg-stone-200/50 text-stone-500'}`}>
              {turn === players[0] ? '● Đang đi cờ' : 'Chờ lượt'}
            </div>
            
            {/* Countdown timer for Red */}
            <div className={`mt-2 flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono font-bold border ${
              turn === players[0] 
                ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' 
                : 'bg-stone-100 text-stone-600 border-stone-200'
            }`}>
              <span className="text-[9px] uppercase text-stone-400">Thời gian:</span>
              <span>{formatTime(redTime)}</span>
            </div>
          </div>

          <div className="w-full mt-2 md:mt-4">
            <span className="text-[9px] font-bold text-stone-400 block mb-1 uppercase tracking-wider">Tượng Đỏ captured Black:</span>
            <div className="flex flex-wrap gap-1">
              {blackCaptured.length === 0 ? (
                <span className="text-[9px] text-stone-400 italic">Chưa ăn quân</span>
              ) : (
                blackCaptured.map((type, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full bg-stone-900 border border-stone-700 flex items-center justify-center font-bold text-[9px] text-stone-200 shadow-sm"
                    title={PIECE_NAMES[type]?.label}
                  >
                    {BLACK_CHARS[type]}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Rules Info Guide */}
      <div className="mt-6 p-4 max-w-2xl bg-stone-50 border border-stone-200 rounded-2xl text-[11px] leading-relaxed text-stone-600 shadow-sm">
        <h4 className="font-serif font-bold text-stone-800 text-xs mb-1.5 flex items-center gap-1.5 uppercase tracking-wider border-b border-stone-200 pb-1">
          <Trophy className="w-4 h-4 text-orange-500" /> Hướng dẫn chơi Cờ Tướng:
        </h4>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 list-disc list-inside">
          <li><b>Tướng (帥/將)</b>: Đi ngang dọc 1 ô trong cung điện.</li>
          <li><b>Sĩ (仕/士)</b>: Đi chéo 1 ô bên trong cung điện.</li>
          <li><b>Tượng (相/象)</b>: Đi chéo 2 ô, không qua sông, bị cản mắt.</li>
          <li><b>Mã (傌/馬)</b>: Đi hình chữ L (2-1), bị cản chân mã.</li>
          <li><b>Xe (車)</b>: Đi ngang dọc thẳng tắp, không nhảy qua quân.</li>
          <li><b>Pháo (炮/砲)</b>: Đi thẳng, muốn ăn quân phải nhảy qua 1 quân.</li>
          <li><b>Tốt (兵/卒)</b>: Đi thẳng 1 ô. Qua sông đi được cả ngang.</li>
        </ul>
      </div>

    </div>
  );
}
