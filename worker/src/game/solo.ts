// worker/src/game/solo.ts
// Local solo-match engine for the legacy /api/ws (GameServerDO) path: when a
// client opens a `match_solo_<gameId>_<ts>` match, there is no D1 row and no
// opponent — the DO synthesizes the match in memory and drives a local bot.
// Faithful port of server/roomManager.ts (getMatchState / handlePlayerMove /
// makeBotMove + the per-game bot generators). Pure functions of state — no I/O,
// no `this` — so the DO is just glue.
import { RULE_ENGINES, getChineseChessLegalMoves } from './rules';

export interface SoloMatch {
  id: string;
  gameId: string;
  status: 'PLAYING' | 'ENDED';
  players: string[];
  boardState: any;
  turn: string;
  moves: any[];
  viewers: string[];
  winner?: string;
  createdAt: number;
  updatedAt: number;
}

export const SOLO_PREFIX = 'match_solo_';
export const BOT_ID = 'bot_computer';

export function parseSoloGameId(matchId: string): string | null {
  if (!matchId.startsWith(SOLO_PREFIX)) return null;
  const lastUnderscore = matchId.lastIndexOf('_');
  if (lastUnderscore <= SOLO_PREFIX.length) return null;
  return matchId.slice(SOLO_PREFIX.length, lastUnderscore);
}

// Synthesize a fresh solo match vs the bot. Returns null for games with no
// engine (catalog stubs that were never built) — caller treats that as a miss.
export function synthesizeSoloMatch(matchId: string, userId: string): SoloMatch | null {
  const gameId = parseSoloGameId(matchId);
  if (!gameId) return null;
  const engine = RULE_ENGINES[gameId];
  if (!engine) return null;
  const players = [userId, BOT_ID];
  return {
    id: matchId,
    gameId,
    status: 'PLAYING',
    players,
    boardState: engine.getInitialState(players),
    turn: userId, // human goes first
    moves: [],
    viewers: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export interface ApplyMoveResult {
  match: SoloMatch;
  accepted: boolean;
  error?: string;
}

// Validate + apply one move to a solo match. Mirrors roomManager.handlePlayerMove
// minus the broadcast/bot scheduling (the DO owns those). Not terminal-aware
// beyond what the engine reports.
export function applySoloMove(match: SoloMatch, userId: string, move: any): ApplyMoveResult {
  if (match.status !== 'PLAYING') return { match, accepted: false };
  const engine = RULE_ENGINES[match.gameId];
  if (!engine) return { match, accepted: false };

  const result = engine.validateMove(match.boardState, move, userId, match.players);
  if (!result.valid) {
    return { match, accepted: false, error: result.error };
  }

  match.boardState = result.newState;
  match.turn =
    result.newState && result.newState.turnIndex !== undefined
      ? match.players[result.newState.turnIndex]
      : match.turn;
  match.moves.push({ player: userId, move, timestamp: Date.now(), sequence: match.moves.length + 1 });
  match.updatedAt = Date.now();

  if (result.isTerminal) {
    match.status = 'ENDED';
    match.winner = result.winner;
  }
  return { match, accepted: true };
}

// Dispatch table for bot move generation. Returns a move object the engine can
// validate, or null if it's not the bot's turn / no bot is defined for the game.
export function generateBotMove(match: SoloMatch): any | null {
  if (match.status !== 'PLAYING') return null;
  const state = match.boardState;
  // speed_math is simultaneous — bot answers as soon as its slot is empty,
  // independent of whose "turn" it is (mirrors roomManager).
  try {
    if (match.gameId === 'speed_math' && state.answers && state.answers[BOT_ID] === null) {
      return { action: 'ANSWER', answer: speedMathBotAnswer(state) };
    }
  } catch {
    return null;
  }
  if (match.turn !== BOT_ID) return null;
  try {
    switch (match.gameId) {
      case 'caro':
        return caroBotMove(state);
      case 'co_tuong':
        return chineseChessBotMove(state);
      case 'co_vua':
        return chessBotMove(state);
      case 'o_an_quan':
        return oAnQuanBotMove(state);
      case 'co_ca_ngua':
        return ludoBotMove(state);
      case 'duoi_hinh_bat_chu':
      case 'noi_chu':
      case 'doan_tu':
        return quizBotMove(state, match.gameId);
      case 'memory_match':
        return memoryMatchBotMove(state);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// speed_math bot: 75% correct true/false answer, mirrors roomManager inline logic.
export function speedMathBotAnswer(state: any): boolean {
  const isCorrect = Math.random() > 0.25;
  return isCorrect ? state.equation.isCorrect : !state.equation.isCorrect;
}

// === Per-game bot generators (verbatim from server/roomManager.ts) ===

function memoryMatchBotMove(state: any): { action: 'FLIP'; index: number } | null {
  const unflipped = state.cards.filter((c: any) => !c.isMatched && !c.isFlipped);
  if (unflipped.length === 0) return null;

  if (state.selectedIndices.length === 0) {
    const choice = unflipped[Math.floor(Math.random() * unflipped.length)];
    return { action: 'FLIP', index: choice.id };
  } else if (state.selectedIndices.length === 1) {
    const firstCardIdx = state.selectedIndices[0];
    const firstCard = state.cards[firstCardIdx];
    const potentialMatches = unflipped.filter((c: any) => c.id !== firstCardIdx);
    if (potentialMatches.length === 0) return null;
    const exactMatch = potentialMatches.find((c: any) => c.symbol === firstCard.symbol);
    if (exactMatch && Math.random() < 0.55) {
      return { action: 'FLIP', index: exactMatch.id };
    }
    const choice = potentialMatches[Math.floor(Math.random() * potentialMatches.length)];
    return { action: 'FLIP', index: choice.id };
  }
  return null;
}

function caroBotMove(state: any): { r: number; c: number } {
  const board = state.board;
  let bestR = 7;
  let bestC = 7;
  let maxScore = -1;

  const countLine = (r: number, c: number, dr: number, dc: number, symbol: string) => {
    let count = 0;
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === symbol) {
      count++;
      nr += dr;
      nc += dc;
    }
    return count;
  };

  const evaluateSpot = (r: number, c: number) => {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    let botMaxChain = 0;
    let playerMaxChain = 0;
    let proximityScore = 0;

    for (const [dr, dc] of directions) {
      const botCount = countLine(r, c, dr, dc, 'O') + countLine(r, c, -dr, -dc, 'O');
      const playerCount = countLine(r, c, dr, dc, 'X') + countLine(r, c, -dr, -dc, 'X');
      botMaxChain = Math.max(botMaxChain, botCount);
      playerMaxChain = Math.max(playerMaxChain, playerCount);
    }

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] !== null) {
          proximityScore += (3 - Math.max(Math.abs(dr), Math.abs(dc)));
        }
      }
    }

    let score = proximityScore;
    if (botMaxChain >= 4) score += 100000;
    else if (playerMaxChain >= 4) score += 50000;
    else if (botMaxChain === 3) score += 10000;
    else if (playerMaxChain === 3) score += 5000;
    else if (botMaxChain === 2) score += 1000;
    else if (playerMaxChain === 2) score += 500;

    score += (15 - Math.abs(r - 7) - Math.abs(c - 7)) * 2;
    return score;
  };

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (board[r][c] === null) {
        const score = evaluateSpot(r, c);
        if (score > maxScore) {
          maxScore = score;
          bestR = r;
          bestC = c;
        }
      }
    }
  }

  return { r: bestR, c: bestC };
}

function chineseChessBotMove(state: any): { from: { r: number; c: number }; to: { r: number; c: number } } {
  const board = state.board;

  const evaluateBoard = (b: any[][]): number => {
    let score = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = b[r][c];
        if (piece) {
          let pieceVal = 0;
          switch (piece.type) {
            case 'jiang': pieceVal = 100000; break;
            case 'ju': pieceVal = 950; break;
            case 'pao': pieceVal = 470; break;
            case 'ma': pieceVal = 420; break;
            case 'xiang': pieceVal = 220; break;
            case 'shi': pieceVal = 220; break;
            case 'zu':
              if (piece.color === 'B') {
                pieceVal = r > 4 ? 200 + (r - 4) * 15 : 100;
              } else {
                pieceVal = r < 5 ? 200 + (5 - r) * 15 : 100;
              }
              break;
          }

          let positionalBonus = 0;
          if (piece.type === 'ma' || piece.type === 'ju' || piece.type === 'pao') {
            positionalBonus += (4 - Math.abs(c - 4)) * 12;
            if (piece.color === 'B') {
              positionalBonus += r * 8;
            } else {
              positionalBonus += (9 - r) * 8;
            }
          }

          if (piece.color === 'B') {
            score += (pieceVal + positionalBonus);
          } else {
            score -= (pieceVal + positionalBonus);
          }
        }
      }
    }
    return score;
  };

  const cloneBoard = (b: any[][]): any[][] => {
    const next = [];
    for (let r = 0; r < b.length; r++) {
      next.push([...b[r]]);
    }
    return next;
  };

  const makeSimulatedMove = (b: any[][], from: { r: number; c: number }, to: { r: number; c: number }): any[][] => {
    const next = cloneBoard(b);
    const piece = next[from.r][from.c];
    next[from.r][from.c] = null;
    next[to.r][to.c] = piece;
    return next;
  };

  const alphaBeta = (
    b: any[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): { score: number; move: { from: { r: number; c: number }; to: { r: number; c: number } } | null } => {
    if (depth === 0) {
      const noise = (Math.random() - 0.5) * 8;
      return { score: evaluateBoard(b) + noise, move: null };
    }

    let blackKingFound = false;
    let redKingFound = false;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (p && p.type === 'jiang') {
          if (p.color === 'B') blackKingFound = true;
          else redKingFound = true;
        }
      }
    }
    if (!blackKingFound) return { score: -100000 - depth, move: null };
    if (!redKingFound) return { score: 100000 + depth, move: null };

    let bestMove: { from: { r: number; c: number }; to: { r: number; c: number } } | null = null;

    if (isMaximizing) {
      let maxEval = -Infinity;
      const movesList: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          const piece = b[r][c];
          if (piece && piece.color === 'B') {
            const targets = getChineseChessLegalMoves(r, c, b);
            for (const t of targets) {
              movesList.push({ from: { r, c }, to: t });
            }
          }
        }
      }

      movesList.sort((a, m) => {
        const targetA = m.to ? b[a.to.r]?.[a.to.c] : null;
        const targetB = m.to ? b[m.to.r]?.[m.to.c] : null;
        const valA = targetA ? 100 : 0;
        const valB = targetB ? 100 : 0;
        return valB - valA;
      });

      for (const m of movesList) {
        const nextBoard = makeSimulatedMove(b, m.from, m.to);
        const ev = alphaBeta(nextBoard, depth - 1, alpha, beta, false).score;
        if (ev > maxEval) {
          maxEval = ev;
          bestMove = m;
        }
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) {
          break;
        }
      }
      return { score: maxEval, move: bestMove };
    } else {
      let minEval = Infinity;
      const movesList: { from: { r: number; c: number }; to: { r: number; c: number } }[] = [];
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
          const piece = b[r][c];
          if (piece && piece.color === 'R') {
            const targets = getChineseChessLegalMoves(r, c, b);
            for (const t of targets) {
              movesList.push({ from: { r, c }, to: t });
            }
          }
        }
      }

      movesList.sort((a, m) => {
        const targetA = m.to ? b[a.to.r]?.[a.to.c] : null;
        const targetB = m.to ? b[m.to.r]?.[m.to.c] : null;
        const valA = targetA ? 100 : 0;
        const valB = targetB ? 100 : 0;
        return valB - valA;
      });

      for (const m of movesList) {
        const nextBoard = makeSimulatedMove(b, m.from, m.to);
        const ev = alphaBeta(nextBoard, depth - 1, alpha, beta, true).score;
        if (ev < minEval) {
          minEval = ev;
          bestMove = m;
        }
        beta = Math.min(beta, ev);
        if (beta <= alpha) {
          break;
        }
      }
      return { score: minEval, move: bestMove };
    }
  };

  // Depth 2 (not 3) on the Worker path: depth 3's ~10⁴–10⁵ leaf evals risked
  // blowing the free-tier 10ms CPU/req cap, which would silently drop the bot
  // turn and deadlock the arena — the bug this module exists to prevent. Depth
  // 2 is still a competent opponent and stays well under budget; the DO also
  // has a turn-fallback safety net for when a move still can't be applied.
  const result = alphaBeta(board, 2, -Infinity, Infinity, true);
  if (result.move) {
    return result.move;
  }

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece && piece.color === 'B') {
        const moves = getChineseChessLegalMoves(r, c, board);
        if (moves.length > 0) {
          return { from: { r, c }, to: moves[0] };
        }
      }
    }
  }

  return { from: { r: 0, c: 4 }, to: { r: 0, c: 4 } };
}

function chessBotMoves(r: number, c: number, board: any[][]): { r: number; c: number }[] {
  const piece = board[r][c];
  if (!piece || piece.color !== 'B') return [];
  const moves: { r: number; c: number }[] = [];

  const isOOB = (row: number, col: number) => row < 0 || row >= 8 || col < 0 || col >= 8;

  const addMoveIfValid = (row: number, col: number) => {
    if (isOOB(row, col)) return false;
    const target = board[row][col];
    if (!target) {
      moves.push({ r: row, c: col });
      return true;
    } else {
      if (target.color === 'W') {
        moves.push({ r: row, c: col });
      }
      return false;
    }
  };

  if (piece.type === 'P') {
    const nextR = r + 1;
    if (!isOOB(nextR, c) && board[nextR][c] === null) {
      moves.push({ r: nextR, c });
      if (r === 1 && board[r + 2][c] === null) {
        moves.push({ r: r + 2, c });
      }
    }
    const diagCols = [c - 1, c + 1];
    for (const dc of diagCols) {
      if (!isOOB(nextR, dc)) {
        const target = board[nextR][dc];
        if (target && target.color === 'W') {
          moves.push({ r: nextR, c: dc });
        }
      }
    }
  } else if (piece.type === 'N') {
    const knightOffsets = [
      [-2, -1], [-2, 1], [2, -1], [2, 1],
      [-1, -2], [-1, 2], [1, -2], [1, 2]
    ];
    for (const [dr, dc] of knightOffsets) {
      addMoveIfValid(r + dr, c + dc);
    }
  } else if (piece.type === 'B' || piece.type === 'Q') {
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (!isOOB(nr, nc)) {
        const keepGoing = addMoveIfValid(nr, nc);
        if (!keepGoing) break;
        nr += dr;
        nc += dc;
      }
    }
  }

  if (piece.type === 'R' || piece.type === 'Q') {
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthoDirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (!isOOB(nr, nc)) {
        const keepGoing = addMoveIfValid(nr, nc);
        if (!keepGoing) break;
        nr += dr;
        nc += dc;
      }
    }
  } else if (piece.type === 'K') {
    const kingDirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],          [0, 1],
      [1, -1],  [1, 0], [1, 1]
    ];
    for (const [dr, dc] of kingDirs) {
      addMoveIfValid(r + dr, c + dc);
    }
  }

  return moves;
}

function chessBotMove(state: any): { from: { r: number; c: number }; to: { r: number; c: number } } {
  const board = state.board;
  const candidates: { from: { r: number; c: number }; to: { r: number; c: number }; score: number }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === 'B') {
        const legalMoves = chessBotMoves(r, c, board);
        for (const m of legalMoves) {
          const target = board[m.r][m.c];
          let score = 0;
          if (target) {
            const weights: Record<string, number> = {
              K: 10000,
              Q: 900,
              R: 500,
              B: 300,
              N: 300,
              P: 100
            };
            score += weights[target.type] || 100;
          }

          score += m.r * 1.5;
          score += Math.random() * 10;

          candidates.push({ from: { r, c }, to: m, score });
        }
      }
    }
  }

  if (candidates.length === 0) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === 'B') {
          for (let tr = 0; tr < 8; tr++) {
            for (let tc = 0; tc < 8; tc++) {
              if (board[tr][tc]?.color !== 'B') {
                return { from: { r, c }, to: { r: tr, c: tc } };
              }
            }
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { from: candidates[0].from, to: candidates[0].to };
}

function oAnQuanBotMove(state: any): { boxIndex: number; direction: 'cw' | 'ccw' } {
  const boxes = state.boxes;
  const candidates: { boxIndex: number; direction: 'cw' | 'ccw'; score: number }[] = [];

  const evaluateChoice = (boxIdx: number, direction: 'cw' | 'ccw') => {
    const bCopy = [...boxes];
    const stones = bCopy[boxIdx];
    bCopy[boxIdx] = 0;

    let curr = boxIdx;
    const nextIdx = (idx: number, dir: 'cw' | 'ccw') => {
      return dir === 'cw' ? (idx + 1) % 12 : (idx - 1 + 12) % 12;
    };

    let hand = stones;
    let pointsGained = 0;

    while (hand > 0) {
      curr = nextIdx(curr, direction);
      bCopy[curr]++;
      hand--;

      if (hand === 0) {
        const next = nextIdx(curr, direction);
        if (next === 10 || next === 11) {
          break;
        } else if (bCopy[next] > 0) {
          hand = bCopy[next];
          bCopy[next] = 0;
          curr = next;
        } else {
          let checkEmpty = next;
          while (true) {
            const target = nextIdx(checkEmpty, direction);
            if (bCopy[target] > 0) {
              pointsGained += bCopy[target];
              bCopy[target] = 0;
              const postTarget = nextIdx(target, direction);
              if (bCopy[postTarget] === 0) {
                checkEmpty = postTarget;
              } else {
                break;
              }
            } else {
              break;
            }
          }
          break;
        }
      }
    }
    return pointsGained;
  };

  for (let i = 5; i <= 9; i++) {
    if (boxes[i] > 0) {
      for (const dir of ['cw', 'ccw'] as const) {
        const captured = evaluateChoice(i, dir);
        let score = captured * 100;
        score += i * 2;
        score += Math.random() * 5;
        candidates.push({ boxIndex: i, direction: dir, score });
      }
    }
  }

  if (candidates.length === 0) {
    return { boxIndex: 5, direction: 'cw' };
  }

  candidates.sort((a, b) => b.score - a.score);
  return { boxIndex: candidates[0].boxIndex, direction: candidates[0].direction };
}

function ludoBotMove(state: any): { action: 'ROLL_DICE' | 'MOVE_HORSE'; horseIdx?: number } {
  if (state.diceStatus === 'NEED_ROLL') {
    return { action: 'ROLL_DICE' };
  }

  const roll = state.diceRoll;
  const playerHorses = state.horses[1];
  const candidates: { idx: number; score: number }[] = [];

  for (let i = 0; i < 4; i++) {
    const h = playerHorses[i];
    let score = -999;

    if (h.pos === 'S') {
      if (roll === 6) {
        score = 500;
      }
    } else if (h.pos.startsWith('H')) {
      const rank = parseInt(h.pos.substring(1));
      if (rank + 1 === roll) {
        score = 300 + rank * 50;
      }
    } else {
      const currPosInt = parseInt(h.pos);
      const nextStepCount = h.stepCount + roll;

      if (nextStepCount < 48) {
        score = 100 + nextStepCount;
        const nextPos = String((currPosInt + roll) % 48);
        const opponentHorses = state.horses[0];
        const canCapture = opponentHorses.some((oh: any) => oh.pos === nextPos);
        if (canCapture) {
          score += 1000;
        }
      } else if (nextStepCount === 48) {
        score = 600;
      }
    }

    if (score > -999) {
      score += Math.random() * 20;
      candidates.push({ idx: i, score });
    }
  }

  if (candidates.length === 0) {
    return { action: 'MOVE_HORSE', horseIdx: 0 };
  }

  candidates.sort((a, b) => b.score - a.score);
  return { action: 'MOVE_HORSE', horseIdx: candidates[0].idx };
}

function quizBotMove(state: any, gameId: string): any {
  if (gameId === 'duoi_hinh_bat_chu') {
    if (state.buzzerActive === BOT_ID) {
      const isCorrect = Math.random() > 0.4;
      const guess = isCorrect ? state.clue.word : 'SAI_ROI';
      return { action: 'SUBMIT', guess };
    } else if (state.buzzerActive === null) {
      if (Math.random() > 0.6) {
        return { action: 'BUZZ' };
      }
    }
  } else if (gameId === 'noi_chu') {
    return noiChuBotMove(state);
  } else if (gameId === 'doan_tu') {
    return doanTuBotMove(state);
  }
  return null;
}

function noiChuBotMove(state: any): { word: string } {
  const prevWordParts = state.currentWord.trim().split(/\s+/);
  const lastWord = prevWordParts[prevWordParts.length - 1].toLowerCase();

  const suffixes = NOI_CHU_DICT[lastWord] || ['mới', 'đẹp', 'tốt', 'mạnh', 'nhanh', 'cao', 'vui', 'học'];
  const usedWords = state.history.map((w: string) => w.toLowerCase());

  let chosenSuffix = suffixes[0];
  for (const suf of suffixes) {
    const candidate = `${lastWord} ${suf}`;
    if (!usedWords.includes(candidate.toLowerCase())) {
      chosenSuffix = suf;
      break;
    }
  }

  const firstCharCapitalized = lastWord.charAt(0).toUpperCase() + lastWord.slice(1);
  return { word: `${firstCharCapitalized} ${chosenSuffix}` };
}

function doanTuBotMove(state: any): { guess: string } {
  const usedGuesses = state.guesses[BOT_ID]?.map((g: any) => g.guess) || [];
  const available = DOAN_TU_WORDS.filter(w => !usedGuesses.includes(w));
  const guess = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : 'TRUYEN';
  return { guess };
}

const NOI_CHU_DICT: Record<string, string[]> = {
  'học': ['sinh', 'tập', 'đường', 'phí', 'bổng', 'giả', 'thuật', 'hành', 'vị'],
  'sinh': ['nhật', 'viên', 'hoạt', 'tồn', 'học', 'sản', 'lý', 'thái', 'mệnh'],
  'nhật': ['bản', 'trình', 'ký', 'báo', 'thực', 'nguyệt', 'dạ', 'quang'],
  'bản': ['đồ', 'tin', 'chất', 'thân', 'năng', 'sắc', 'quyền', 'vẽ', 'nhạc'],
  'đồ': ['chơi', 'dùng', 'thờ', 'án', 'thị', 'sứ', 'gỗ', 'gia', 'bản'],
  'chơi': ['bời', 'đùa', 'game', 'nhạc', 'thể', 'vui', 'gai', 'chữ', 'khăm'],
  'báo': ['chí', 'cáo', 'hiệu', 'thức', 'tin', 'thù', 'ân', 'động', 'giá'],
  'tin': ['tức', 'hiệu', 'lòng', 'cậy', 'yêu', 'tưởng', 'ngưỡng', 'buồn', 'vui'],
  'tức': ['khắc', 'giận', 'thời', 'ngực', 'tối', 'tốc', 'đoạt', 'trí', 'thì'],
  'khắc': ['ghi', 'khoải', 'khổ', 'họa', 'tinh', 'chế', 'bản', 'trùng'],
  'giận': ['hờn', 'dỗi', 'dữ', 'quá', 'đỏ', 'tím', 'sôi', 'lôi', 'đùng'],
  'hờn': ['ghen', 'giận', 'trách', 'tủi', 'mát', 'mưa', 'sóng', 'căm'],
  'ghen': ['tuông', 'ghét', 'tị', 'bóng', 'gió', 'tuông', 'hờn', 'ăn'],
  'tuông': ['trào', 'rơi', 'chảy', 'máu', 'lệ', 'suy', 'nghĩ', 'tính'],
  'trào': ['lưu', 'dâng', 'phúng', 'ngược', 'phúng', 'sôi', 'máu', 'lệ'],
  'lưu': ['hành', 'vong', 'niệm', 'bút', 'loát', 'trữ', 'thông', 'luyến'],
  'hành': ['trình', 'động', 'vi', 'lý', 'khách', 'quân', 'hạ', 'pháp'],
  'trình': ['bày', 'diễn', 'tự', 'báo', 'độ', 'thuật', 'diện', 'báo'],
  'bày': ['biện', 'tỏ', 'trò', 'vẽ', 'mưu', 'tiệc', 'đồ', 'ra'],
  'tỏ': ['tường', 'vẻ', 'ý', 'bày', 'rõ', 'lòng', 'tình', 'thái'],
  'tường': ['trình', 'vân', 'thuật', 'tận', 'vách', 'gạch', 'đá'],
  'máy': ['bay', 'tính', 'móc', 'ảnh', 'quay', 'khoan', 'bơm', 'nổ'],
  'bay': ['lượn', 'nhảy', 'mất', 'cao', 'xa', 'màu', 'hơi', 'bổng'],
  'tính': ['cách', 'toán', 'mạng', 'chất', 'tình', 'nết', 'nhẩm', 'năng'],
  'cách': ['mạng', 'điệu', 'trở', 'ly', 'biệt', 'nhìn', 'sống', 'dùng'],
  'mạng': ['lưới', 'nhện', 'mộc', 'hỏa', 'thủy', 'kim', 'thổ', 'sống'],
  'lưới': ['sắt', 'bóng', 'đánh', 'cá', 'nhện', 'điện', 'an', 'trời'],
  'nhện': ['độc', 'giăng', 'tơ', 'con', 'khổng', 'lồ', 'nước', 'đất'],
  'tơ': ['hồng', 'lụa', 'vương', 'lòng', 'duyên', 'kẽ', 'chỉ', 'tóc'],
  'hồng': ['hào', 'nhan', 'ngoại', 'hoa', 'sâm', 'ngọc', 'trà', 'quân'],
  'trà': ['sữa', 'xanh', 'đá', 'đào', 'gừng', 'hoa', 'cúc', 'bạc', 'hà'],
  'sữa': ['đậu', 'tươi', 'chua', 'bột', 'mẹ', 'tắm', 'rửa', 'mặt']
};

const DOAN_TU_WORDS = ['TRUYEN', 'NGUYEN', 'CHUYEN', 'THUYEN', 'THUONG', 'TRUONG', 'PHUONG', 'KHUYEN', 'DUONG', 'HOANG'];
