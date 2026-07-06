import React, { useState, useEffect } from 'react';
import { Sparkles, Play, Award, CheckCircle, Clock, Zap, AlertCircle } from 'lucide-react';
import { playRetroBeep } from './games/CaroBoard.tsx';

interface DailyChallengesViewProps {
  userId: string;
  displayName: string;
  avatar: string;
}

const SUDOKU_BOARD_SOLVED = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9]
];

const SUDOKU_BOARD_START = [
  [5, 3, null, null, 7, null, null, null, null],
  [6, null, null, 1, 9, 5, null, null, null],
  [null, 9, 8, null, null, null, null, 6, null],
  [8, null, null, null, 6, null, null, null, 3],
  [4, null, null, 8, null, 3, null, null, 1],
  [7, null, null, null, 2, null, null, null, 6],
  [null, 6, null, null, null, null, 2, 8, null],
  [null, null, null, 4, 1, 9, null, null, 5],
  [null, null, null, null, 8, null, null, 7, 9]
];

export default function DailyChallengesView({ userId, displayName, avatar }: DailyChallengesViewProps) {
  const [activeGame, setActiveGame] = useState<'sudoku' | 'speed_math'>('sudoku');
  const [challengeData, setChallengeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [dateStr] = useState(() => {
    // Return deterministic YYYY-MM-DD
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Sudoku State
  const [sudokuBoard, setSudokuBoard] = useState<(number | null)[][]>([]);

  // Speed Math State
  const [mathRound, setMathRound] = useState(0);
  const [mathScore, setMathScore] = useState(0);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState({ q: '', a: 0, o: [0, 0, 0, 0] });

  const fetchChallenge = async () => {
    setLoading(true);
    setCompleted(false);
    setIsPlaying(false);
    try {
      const res = await fetch(`/api/challenges/${activeGame}/${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setChallengeData(data);
        // Check if user already completed it
        const alreadySubmitted = data.topScores.some((s: any) => s.userId === userId);
        if (alreadySubmitted) {
          setCompleted(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenge();
  }, [activeGame]);

  const handleStart = () => {
    setIsPlaying(true);
    playRetroBeep(800, 'sine', 0.15);

    if (activeGame === 'sudoku') {
      setSudokuBoard(SUDOKU_BOARD_START.map(row => [...row]));
    } else if (activeGame === 'speed_math') {
      setMathRound(0);
      setMathScore(0);
      setTimerStart(Date.now());
      generateMathQuestion(0);
    }
  };

  // SUDOKU GAME ENGINE
  const handleSudokuInput = (r: number, c: number, valStr: string) => {
    const val = parseInt(valStr);
    const newBoard = sudokuBoard.map(row => [...row]);
    if (isNaN(val) || val < 1 || val > 9) {
      newBoard[r][c] = null;
    } else {
      newBoard[r][c] = val;
    }
    setSudokuBoard(newBoard);

    // Play feedback tone
    playRetroBeep(440 + (val || 0) * 40, 'triangle', 0.05);
  };

  const checkSudokuSol = () => {
    let correct = true;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (sudokuBoard[r][c] !== SUDOKU_BOARD_SOLVED[r][c]) {
          correct = false;
        }
      }
    }

    if (correct) {
      playRetroBeep(1000, 'sine', 0.3);
      // Submit score! Score is static 100 points for completion
      submitChallengeScore(100);
    } else {
      playRetroBeep(200, 'sawtooth', 0.3);
      alert('Bảng Sudoku của bạn có những ô cờ sai lầm! Hãy rà soát kỹ lại.');
    }
  };

  // SPEED MATH GAME ENGINE
  const generateMathQuestion = (round: number) => {
    const ops = ['+', '-', '*'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let num1 = 0, num2 = 0, a = 0;

    if (op === '+') {
      num1 = Math.floor(Math.random() * 50) + 1;
      num2 = Math.floor(Math.random() * 50) + 1;
      a = num1 + num2;
    } else if (op === '-') {
      num1 = Math.floor(Math.random() * 50) + 20;
      num2 = Math.floor(Math.random() * 19) + 1;
      a = num1 - num2;
    } else {
      num1 = Math.floor(Math.random() * 10) + 2;
      num2 = Math.floor(Math.random() * 10) + 2;
      a = num1 * num2;
    }

    // Options
    const o = new Set<number>([a]);
    while (o.size < 4) {
      o.add(a + Math.floor(Math.random() * 10) - 5);
    }
    const options = Array.from(o).sort(() => Math.random() - 0.5);

    setCurrentQuestion({
      q: `${num1} ${op} ${num2} = ?`,
      a,
      o: options
    });
  };

  const handleMathAnswer = (ans: number) => {
    const isCorrect = ans === currentQuestion.a;
    let newScore = mathScore;

    if (isCorrect) {
      newScore += 10;
      setMathScore(newScore);
      playRetroBeep(1000, 'sine', 0.05);
    } else {
      playRetroBeep(150, 'triangle', 0.15);
    }

    const nextRound = mathRound + 1;
    if (nextRound >= 10) {
      // Finished math questions!
      const elapsedMs = Date.now() - (timerStart || Date.now());
      // Score calculation: higher accuracy, lower elapsed time. Max score 10000.
      const finalScore = Math.max(0, newScore * 100 - Math.floor(elapsedMs / 100));
      submitChallengeScore(finalScore);
    } else {
      setMathRound(nextRound);
      generateMathQuestion(nextRound);
    }
  };

  // POST SUBMIT
  const submitChallengeScore = async (score: number) => {
    try {
      const res = await fetch(`/api/challenges/${activeGame}/${dateStr}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, displayName, avatar, score })
      });
      if (res.ok) {
        const data = await res.json();
        setChallengeData(data);
        setCompleted(true);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 bg-white border border-stone-200 rounded-2xl shadow-sm my-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-stone-100 pb-4 mb-6">
        <div>
          <h2 className="text-base sm:text-xl font-serif font-bold text-stone-800 flex items-center gap-1.5 leading-tight">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" /> Thử Thách Mỗi Ngày (Daily Challenge)
          </h2>
          <p className="text-xs text-stone-500">Mỗi ngày một câu đố chung, so tài trí tuệ để tranh vị trí cao nhất trên bảng điểm</p>
        </div>

        {/* Toggle between Sudoku and Math */}
        <div className="flex gap-1.5 bg-stone-100 p-1.5 rounded-lg border border-stone-200">
          <button
            onClick={() => { setActiveGame('sudoku'); playRetroBeep(500); }}
            className={`px-3.5 py-1 rounded text-xs font-bold cursor-pointer transition-all
              ${activeGame === 'sudoku' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}
            `}
          >
            Sudoku Mỗi Ngày
          </button>
          <button
            onClick={() => { setActiveGame('speed_math'); playRetroBeep(500); }}
            className={`px-3.5 py-1 rounded text-xs font-bold cursor-pointer transition-all
              ${activeGame === 'speed_math' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}
            `}
          >
            Nhẩm Toán Nhanh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Play interface (left 2 cols) */}
        <div className="lg:col-span-2 bg-stone-50 border border-stone-200 rounded-xl p-5 flex flex-col items-center justify-center min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
              <span className="text-xs text-stone-500 font-semibold">Đang chuẩn bị câu đố...</span>
            </div>
          ) : completed ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
              <h3 className="text-base sm:text-lg font-bold text-stone-800">Bạn Đã Hoàn Thành Thử Thách Hôm Nay!</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">Quay trở lại vào ngày mai để mở khóa những câu đố trí tuệ mới kịch tính hơn.</p>
            </div>
          ) : isPlaying ? (
            <>
              {/* SUDOKU PLAYBOARD */}
              {activeGame === 'sudoku' && (
                <div className="flex flex-col items-center w-full max-w-sm">
                  <div className="grid grid-cols-9 gap-0.5 bg-stone-400 p-1 rounded-lg">
                    {sudokuBoard.map((row, r) =>
                      row.map((cell, c) => {
                        const isPreFilled = SUDOKU_BOARD_START[r][c] !== null;
                        return (
                          <input
                            key={`${r}-${c}`}
                            type="text"
                            maxLength={1}
                            disabled={isPreFilled}
                            value={cell || ''}
                            onChange={(e) => handleSudokuInput(r, c, e.target.value)}
                            className={`w-7 h-7 sm:w-10 sm:h-10 text-center text-xs sm:text-base font-bold font-mono focus:outline-none focus:ring-2 focus:ring-orange-500
                              ${isPreFilled ? 'bg-stone-200 text-stone-800' : 'bg-white text-blue-600'}
                              ${(Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1 ? 'brightness-95' : ''}
                            `}
                          />
                        );
                      })
                    )}
                  </div>
                  <button
                    id="sudoku-check-btn"
                    onClick={checkSudokuSol}
                    className="mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg text-xs cursor-pointer shadow"
                  >
                    Kiểm Tra Kết Quả
                  </button>
                </div>
              )}

              {/* SPEED MATH PLAYBOARD */}
              {activeGame === 'speed_math' && (
                <div className="flex flex-col items-center gap-6 w-full max-w-md">
                  <div className="flex justify-between items-center w-full bg-stone-200 p-3 rounded-lg text-xs font-bold">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-orange-500" /> Vòng: {mathRound + 1}/10</span>
                    <span className="flex items-center gap-1 text-green-600"><Zap className="w-4 h-4" /> Chính Xác: {mathScore}</span>
                  </div>

                  <div className="text-center py-6 bg-white border border-stone-200 w-full rounded-xl shadow-inner">
                    <span className="text-[10px] text-stone-400 font-bold block mb-1">CÂU HỎI</span>
                    <h3 className="text-3xl font-extrabold text-stone-800 font-mono tracking-wide">{currentQuestion.q}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full">
                    {currentQuestion.o.map((opt, idx) => (
                      <button
                        key={idx}
                        id={`math-opt-${idx}`}
                        onClick={() => handleMathAnswer(opt)}
                        className="bg-white hover:bg-orange-50 border border-stone-200 hover:border-orange-500 p-3 text-sm font-extrabold font-mono text-stone-800 rounded-xl cursor-pointer shadow-sm transition-all"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 flex flex-col items-center">
              <span className="text-4xl mb-2">🧠</span>
              <h3 className="text-sm sm:text-base font-bold text-stone-800">Sẵn Sàng Tham Gia Chiến Đấu?</h3>
              <p className="text-[10px] sm:text-xs text-stone-500 max-w-xs mt-1 mb-6 leading-relaxed">
                {activeGame === 'sudoku'
                  ? 'Một bảng Sudoku ngẫu nhiên và đặc biệt thách thức chỉ số IQ của bạn.'
                  : '10 câu hỏi tính toán siêu nhanh để đo đạc chỉ số phản xạ tư duy.'}
              </p>
              <button
                id="start-challenge-btn"
                onClick={handleStart}
                className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold py-2.5 px-6 rounded-full text-xs shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Bắt Đầu Chơi
              </button>
            </div>
          )}
        </div>

        {/* Challenge Leaderboard (right 1 col) */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-col h-[340px]">
          <h3 className="text-xs font-bold text-stone-800 flex items-center gap-1 border-b border-stone-200 pb-2 mb-3">
            <Award className="w-4 h-4 text-yellow-500" /> Kỳ Thủ Đạt Giải Ngày
          </h3>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {challengeData?.topScores.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                <AlertCircle className="w-8 h-8 text-stone-300" />
                <span className="text-[10px] text-stone-400 font-bold block mt-1">Chưa có ai chinh phục!</span>
                <span className="text-[8px] text-stone-400">Hãy là người tiên phong đạt vương miện hôm nay.</span>
              </div>
            ) : (
              challengeData?.topScores.map((score: any, index: number) => (
                <div key={score.userId} className="flex items-center justify-between p-2.5 bg-white border border-stone-200 rounded-lg text-[10px] sm:text-xs font-bold shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-stone-400">#{index + 1}</span>
                    <img src={score.avatar} className="w-6 h-6 rounded-full border border-stone-200" alt="Avatar" />
                    <span className="text-stone-700 truncate max-w-[80px]">{score.displayName}</span>
                  </div>
                  <span className="font-mono text-orange-600 font-extrabold">{score.score} Điểm</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
