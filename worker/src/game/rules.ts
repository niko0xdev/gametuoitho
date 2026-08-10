
export interface RuleEngine {
  getInitialState(players: string[]): any;
  validateMove(
    state: any,
    move: any,
    player: string,
    players: string[]
  ): { valid: boolean; newState?: any; error?: string; isTerminal?: boolean; winner?: string };
}

// 1. CARO RULE ENGINE
export const caroEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const board = Array(15).fill(null).map(() => Array(15).fill(null));
    return {
      board,
      turnIndex: 0,
      winner: null,
      lastMove: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }
    const { r, c } = move;
    if (r < 0 || r >= 15 || c < 0 || c >= 15) {
      return { valid: false, error: 'Vị trí cờ nằm ngoài bàn đấu!' };
    }
    if (state.board[r][c] !== null) {
      return { valid: false, error: 'Ô cờ đã được đánh!' };
    }

    const symbol = playerIndex === 0 ? 'X' : 'O';
    const newBoard = state.board.map((row: any) => [...row]);
    newBoard[r][c] = symbol;

    // Check winner
    const checkWinner = (row: number, col: number, sym: string): boolean => {
      const directions = [
        [0, 1],   // horizontal
        [1, 0],   // vertical
        [1, 1],   // diagonal \
        [1, -1]   // diagonal /
      ];
      for (const [dr, dc] of directions) {
        let count = 1;
        // Positive direction
        let nr = row + dr;
        let nc = col + dc;
        while (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && newBoard[nr][nc] === sym) {
          count++;
          nr += dr;
          nc += dc;
        }
        // Negative direction
        nr = row - dr;
        nc = col - dc;
        while (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && newBoard[nr][nc] === sym) {
          count++;
          nr -= dr;
          nc -= dc;
        }
        if (count >= 5) return true;
      }
      return false;
    };

    const hasWon = checkWinner(r, c, symbol);
    const nextTurnIndex = (state.turnIndex + 1) % players.length;

    const newState = {
      ...state,
      board: newBoard,
      turnIndex: hasWon ? state.turnIndex : nextTurnIndex,
      winner: hasWon ? player : null,
      lastMove: { r, c, symbol }
    };

    return {
      valid: true,
      newState,
      isTerminal: hasWon,
      winner: hasWon ? player : undefined
    };
  }
};

// 2. CHINESE CHESS ENGINE (CO TUONG)
export function getChineseChessLegalMoves(
  r: number,
  c: number,
  board: any[][]
): { r: number; c: number }[] {
  const piece = board[r][c];
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
          if (board[mr][mc] === null) {
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
        if (board[br][bc] === null) {
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

// 2. CHINESE CHESS ENGINE (CO TUONG)

// Does any piece of `attackerColor` attack the square (r, c)?
// Mirrors standard xiangqi attack rules (see https://play.xiangqi.com/).
export function isChineseChessSquareAttacked(
  board: any[][],
  r: number,
  c: number,
  attackerColor: 'R' | 'B'
): boolean {
  const inBounds = (rr: number, cc: number) => rr >= 0 && rr < 10 && cc >= 0 && cc < 9;

  // 1) Ju (chariot) — straight lines
  const lineDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of lineDirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === attackerColor && p.type === 'ju') return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // 2) Pao (cannon) — straight lines with exactly 1 screen
  for (const [dr, dc] of lineDirs) {
    let nr = r + dr;
    let nc = c + dc;
    let jumped = false;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (!jumped) {
        if (p) jumped = true;
      } else {
        if (p) {
          if (p.color === attackerColor && p.type === 'pao') return true;
          break;
        }
      }
      nr += dr;
      nc += dc;
    }
  }

  // 3) Ma (horse) — L-shape, blocked by adjacent piece
  const horseAttacks = [
    { dr: -2, dc: -1, br: -1, bc: 0 },
    { dr: -2, dc: 1, br: -1, bc: 0 },
    { dr: 2, dc: -1, br: 1, bc: 0 },
    { dr: 2, dc: 1, br: 1, bc: 0 },
    { dr: -1, dc: -2, br: 0, bc: -1 },
    { dr: -1, dc: 2, br: 0, bc: 1 },
    { dr: 1, dc: -2, br: 0, bc: -1 },
    { dr: 1, dc: 2, br: 0, bc: 1 }
  ];
  for (const m of horseAttacks) {
    const nr = r + m.dr;
    const nc = c + m.dc;
    const br = r + m.br;
    const bc = c + m.bc;
    if (inBounds(nr, nc) && inBounds(br, bc)) {
      if (board[br][bc] === null) {
        const p = board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'ma') return true;
      }
    }
  }

  // 4) Xiang (elephant) — diagonal 2, can't cross river, blocked by center
  const elephantAttacks = [
    { dr: -2, dc: -2, mr: -1, mc: -1 },
    { dr: -2, dc: 2, mr: -1, mc: 1 },
    { dr: 2, dc: -2, mr: 1, mc: -1 },
    { dr: 2, dc: 2, mr: 1, mc: 1 }
  ];
  for (const e of elephantAttacks) {
    const nr = r + e.dr;
    const nc = c + e.dc;
    const mr = r + e.mr;
    const mc = c + e.mc;
    if (inBounds(nr, nc) && inBounds(mr, mc)) {
      const sameSide = attackerColor === 'B' ? (nr <= 4) : (nr >= 5);
      if (sameSide && board[mr][mc] === null) {
        const p = board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'xiang') return true;
      }
    }
  }

  // 5) Shi (advisor) — 1 diagonal step inside palace
  const shiDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of shiDirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) {
      const inPalace = (nc >= 3 && nc <= 5) && ((nr >= 0 && nr <= 2) || (nr >= 7 && nr <= 9));
      if (inPalace) {
        const p = board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'shi') return true;
      }
    }
  }

  // 6) Jiang (general) — 1 orthogonal step inside palace OR flying general
  const jiangDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of jiangDirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) {
      const inPalace = (nc >= 3 && nc <= 5) && ((nr >= 0 && nr <= 2) || (nr >= 7 && nr <= 9));
      if (inPalace) {
        const p = board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'jiang') return true;
      }
    }
  }
  for (let row = 0; row < 10; row++) {
    const p = board[row][c];
    if (p && p.type === 'jiang' && p.color === attackerColor) {
      const startRow = Math.min(r, row) + 1;
      const endRow = Math.max(r, row);
      let blocked = false;
      for (let rr = startRow; rr < endRow; rr++) {
        if (board[rr][c] !== null) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return true;
      break;
    }
  }

  // 7) Zu (pawn) — 1 step forward, sideways after crossing river
  const forwardDr = attackerColor === 'R' ? -1 : 1;
  const fr = r + forwardDr;
  if (inBounds(fr, c)) {
    const p = board[fr][c];
    if (p && p.color === attackerColor && p.type === 'zu') return true;
  }
  const crossedRiver = attackerColor === 'R' ? (r <= 4) : (r >= 5);
  if (crossedRiver) {
    for (const dc of [-1, 1]) {
      const nc = c + dc;
      if (inBounds(r, nc)) {
        const p = board[r][nc];
        if (p && p.color === attackerColor && p.type === 'zu') return true;
      }
    }
  }

  return false;
}

// Simulate a move and return whether the moving side's general is in check afterwards.
function wouldLeaveGeneralInCheck(
  board: any[][],
  fromR: number,
  fromC: number,
  toR: number,
  toC: number,
  movingColor: 'R' | 'B'
): boolean {
  const newBoard = board.map((row: any[]) => [...row]);
  newBoard[fromR][fromC] = null;
  newBoard[toR][toC] = { type: board[fromR][fromC].type, color: movingColor };
  let genPos: { r: number; c: number } | null = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = newBoard[r]?.[c];
      if (p && p.type === 'jiang' && p.color === movingColor) {
        genPos = { r, c };
        break;
      }
    }
    if (genPos) break;
  }
  if (!genPos) return true;
  const opponentColor = movingColor === 'R' ? 'B' : 'R';
  return isChineseChessSquareAttacked(newBoard, genPos.r, genPos.c, opponentColor);
}

function findGeneralPos(board: any[][], color: 'R' | 'B'): { r: number; c: number } | null {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r]?.[c];
      if (p && p.type === 'jiang' && p.color === color) {
        return { r, c };
      }
    }
  }
  return null;
}

// Does the given side have any safe move on the board?
function hasAnySafeMove(board: any[][], color: 'R' | 'B'): boolean {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r]?.[c];
      if (piece && piece.color === color) {
        const moves = getChineseChessLegalMoves(r, c, board);
        for (const m of moves) {
          if (!wouldLeaveGeneralInCheck(board, r, c, m.r, m.c, color)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export const coTuongEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const board = Array(10).fill(null).map(() => Array(9).fill(null));
    const setupRow = (row: number, color: 'R' | 'B') => {
      board[row][0] = { color, type: 'ju', id: `${color}_ju1` };
      board[row][1] = { color, type: 'ma', id: `${color}_ma1` };
      board[row][2] = { color, type: 'xiang', id: `${color}_xiang1` };
      board[row][3] = { color, type: 'shi', id: `${color}_shi1` };
      board[row][4] = { color, type: 'jiang', id: `${color}_jiang` };
      board[row][5] = { color, type: 'shi', id: `${color}_shi2` };
      board[row][6] = { color, type: 'xiang', id: `${color}_xiang2` };
      board[row][7] = { color, type: 'ma', id: `${color}_ma2` };
      board[row][8] = { color, type: 'ju', id: `${color}_ju2` };
    };

    const setupPawnsAndCannons = (cannonRow: number, pawnRow: number, color: 'R' | 'B') => {
      board[cannonRow][1] = { color, type: 'pao', id: `${color}_pao1` };
      board[cannonRow][7] = { color, type: 'pao', id: `${color}_pao2` };

      for (let i = 0; i < 9; i += 2) {
        board[pawnRow][i] = { color, type: 'zu', id: `${color}_zu${i}` };
      }
    };

    setupRow(0, 'B');
    setupPawnsAndCannons(2, 3, 'B');
    setupRow(9, 'R');
    setupPawnsAndCannons(7, 6, 'R');

    return {
      board,
      turnIndex: 0,
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }
    const { from, to } = move;
    if (!from || !to) {
      return { valid: false, error: 'Thiếu vị trí quân cờ!' };
    }

    const piece = state.board[from.r][from.c];
    if (!piece) {
      return { valid: false, error: 'Không có quân cờ ở vị trí xuất phát!' };
    }

    const correctColor = playerIndex === 0 ? 'R' : 'B';
    if (piece.color !== correctColor) {
      return { valid: false, error: 'Bạn không thể đi quân cờ của đối thủ!' };
    }

    // Check legality of move
    const legalMoves = getChineseChessLegalMoves(from.r, from.c, state.board);
    const isLegal = legalMoves.some(m => m.r === to.r && m.c === to.c);
    if (!isLegal) {
      return { valid: false, error: 'Nước đi không đúng luật cờ tướng!' };
    }

    const targetPiece = state.board[to.r][to.c];
    if (targetPiece && targetPiece.color === correctColor) {
      return { valid: false, error: 'Bạn không thể ăn quân của chính mình!' };
    }

    // Build new board
    const newBoard = state.board.map((row: any) => [...row]);
    newBoard[from.r][from.c] = null;
    newBoard[to.r][to.c] = piece;

    // Reject moves that leave your own general in check (xiangqi rule)
    if (wouldLeaveGeneralInCheck(state.board, from.r, from.c, to.r, to.c, correctColor)) {
      return { valid: false, error: 'Nước đi này khiến Tướng bị chiếu — không hợp lệ!' };
    }

    // If opponent's general is captured, game ends
    let isTerminal = false;
    let winner = undefined;
    if (targetPiece && targetPiece.type === 'jiang') {
      isTerminal = true;
      winner = player;
    }

    // Alternatively, verify if the general still exists on the board
    let opponentGeneralFound = false;
    const opponentColor = correctColor === 'R' ? 'B' : 'R';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 9; col++) {
        const p = newBoard[row][col];
        if (p && p.type === 'jiang' && p.color === opponentColor) {
          opponentGeneralFound = true;
          break;
        }
      }
      if (opponentGeneralFound) break;
    }

    if (!opponentGeneralFound) {
      isTerminal = true;
      winner = player;
    }

    // Checkmate detection
    if (!isTerminal) {
      const opponentHasSafeMove = hasAnySafeMove(newBoard, opponentColor);
      if (!opponentHasSafeMove) {
        isTerminal = true;
        winner = player;
      }
    }

    // Compute inCheck flag for the opponent's general on the new board
    const oppGenPos = findGeneralPos(newBoard, opponentColor);
    const opponentInCheck = oppGenPos
      ? isChineseChessSquareAttacked(newBoard, oppGenPos.r, oppGenPos.c, correctColor)
      : false;

    const nextTurnIndex = (state.turnIndex + 1) % players.length;

    return {
      valid: true,
      newState: {
        ...state,
        board: newBoard,
        turnIndex: isTerminal ? state.turnIndex : nextTurnIndex,
        winner: isTerminal ? player : null,
        inCheck: opponentInCheck
      },
      isTerminal,
      winner
    };
  }
};

// 3. CHESS ENGINE (CO VUA)
export const coVuaEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    const setupRow = (row: number, color: 'W' | 'B') => {
      board[row][0] = { color, type: 'R', id: `${color}_R1` }; // Rook
      board[row][1] = { color, type: 'N', id: `${color}_N1` }; // Knight
      board[row][2] = { color, type: 'B', id: `${color}_B1` }; // Bishop
      board[row][3] = { color, type: 'Q', id: `${color}_Q` };  // Queen
      board[row][4] = { color, type: 'K', id: `${color}_K` };  // King
      board[row][5] = { color, type: 'B', id: `${color}_B2` };
      board[row][6] = { color, type: 'N', id: `${color}_N2` };
      board[row][7] = { color, type: 'R', id: `${color}_R2` };
    };

    setupRow(0, 'B');
    for (let i = 0; i < 8; i++) {
      board[1][i] = { color: 'B', type: 'P', id: `B_P${i}` }; // Pawn
    }

    setupRow(7, 'W');
    for (let i = 0; i < 8; i++) {
      board[6][i] = { color: 'W', type: 'P', id: `W_P${i}` };
    }

    return {
      board,
      turnIndex: 0, // White moves first (White is player index 0, Black is 1)
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }
    const { from, to } = move;
    if (!from || !to) {
      return { valid: false, error: 'Thiếu vị trí di chuyển!' };
    }

    const piece = state.board[from.r][from.c];
    if (!piece) {
      return { valid: false, error: 'Không có quân cờ!' };
    }

    const correctColor = playerIndex === 0 ? 'W' : 'B';
    if (piece.color !== correctColor) {
      return { valid: false, error: 'Bạn không thể di chuyển quân của đối thủ!' };
    }

    const targetPiece = state.board[to.r][to.c];
    if (targetPiece && targetPiece.color === correctColor) {
      return { valid: false, error: 'Không thể di chuyển đè lên quân mình!' };
    }

    const newBoard = state.board.map((row: any) => [...row]);
    newBoard[from.r][from.c] = null;
    newBoard[to.r][to.c] = piece;

    // Check King capture
    let isTerminal = false;
    let winner = undefined;
    if (targetPiece && targetPiece.type === 'K') {
      isTerminal = true;
      winner = player;
    }

    const nextTurnIndex = (state.turnIndex + 1) % players.length;

    return {
      valid: true,
      newState: {
        ...state,
        board: newBoard,
        turnIndex: isTerminal ? state.turnIndex : nextTurnIndex,
        winner: isTerminal ? player : null
      },
      isTerminal,
      winner
    };
  }
};

// 4. O AN QUAN RULE ENGINE
export const oAnQuanEngine: RuleEngine = {
  getInitialState(players: string[]) {
    // 10 small boxes, 2 large mandarin boxes.
    // Index 0 to 4: Player 1 side (top/bottom)
    // Index 5 to 9: Player 2 side
    // Index 10: Left Mandarin (Quan)
    // Index 11: Right Mandarin (Quan)
    const boxes = Array(12).fill(0);
    for (let i = 0; i < 10; i++) {
      boxes[i] = 5; // 5 dân per box
    }
    boxes[10] = 10; // Left mandarin worth 10 stones
    boxes[11] = 10; // Right mandarin worth 10 stones

    return {
      boxes,
      scores: [0, 0], // Player 1, Player 2
      turnIndex: 0,
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }

    const { boxIndex, direction } = move; // direction: 'cw' or 'ccw'
    if (boxIndex < 0 || boxIndex >= 10) {
      return { valid: false, error: 'Vị trí ô dân không hợp lệ!' };
    }

    // Validate box owns to correct player side
    const isPlayer1Box = boxIndex >= 0 && boxIndex <= 4;
    const isCorrectSide = playerIndex === 0 ? isPlayer1Box : !isPlayer1Box;
    if (!isCorrectSide) {
      return { valid: false, error: 'Bạn chỉ được chọn ô dân bên phần sân của mình!' };
    }

    let boxes = [...state.boxes];
    let stones = boxes[boxIndex];
    if (stones === 0) {
      return { valid: false, error: 'Ô này không có sỏi!' };
    }

    boxes[boxIndex] = 0;
    let curr = boxIndex;
    const nextIdx = (idx: number, dir: 'cw' | 'ccw') => {
      if (dir === 'cw') {
        return (idx + 1) % 12;
      } else {
        return (idx - 1 + 12) % 12;
      }
    };

    let hand = stones;
    let scores = [...state.scores];

    while (hand > 0) {
      curr = nextIdx(curr, direction);
      boxes[curr]++;
      hand--;

      if (hand === 0) {
        // Look at the next box
        const next = nextIdx(curr, direction);
        if (next === 10 || next === 11) {
          // If followed by Mandarin, turn ends
          break;
        } else if (boxes[next] > 0) {
          // If followed by an occupied box, scoop and continue
          hand = boxes[next];
          boxes[next] = 0;
          curr = next;
        } else {
          // Followed by empty box! Can eat!
          let checkEmpty = next;
          while (true) {
            const target = nextIdx(checkEmpty, direction);
            if (boxes[target] > 0) {
              // Capture target box
              scores[playerIndex] += boxes[target];
              boxes[target] = 0;
              // Check if we can do chain capture (next one is empty, next after is occupied)
              const postTarget = nextIdx(target, direction);
              if (boxes[postTarget] === 0) {
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

    // Check game end: both mandarin boxes are empty (quantities are 0)
    const isGameOver = boxes[10] === 0 && boxes[11] === 0;

    // Distribute remaining side stones to respective players on game over
    if (isGameOver) {
      for (let i = 0; i < 5; i++) {
        scores[0] += boxes[i];
        boxes[i] = 0;
      }
      for (let i = 5; i < 10; i++) {
        scores[1] += boxes[i];
        boxes[i] = 0;
      }
    }

    // Auto replenishment: if side of next player is completely empty, they must deduct 5 points from score to buy stones (1 for each box)
    const nextPlayerIndex = (playerIndex + 1) % 2;
    const nextSideStart = nextPlayerIndex === 0 ? 0 : 5;
    const nextSideEnd = nextPlayerIndex === 0 ? 4 : 9;
    let nextSideCount = 0;
    for (let i = nextSideStart; i <= nextSideEnd; i++) {
      nextSideCount += boxes[i];
    }

    if (!isGameOver && nextSideCount === 0) {
      if (scores[nextPlayerIndex] >= 5) {
        scores[nextPlayerIndex] -= 5;
        for (let i = nextSideStart; i <= nextSideEnd; i++) {
          boxes[i] = 1;
        }
      } else {
        // If next player doesn't have enough points to buy, game ends instantly
        for (let i = 0; i < 5; i++) {
          scores[0] += boxes[i];
          boxes[i] = 0;
        }
        for (let i = 5; i < 10; i++) {
          scores[1] += boxes[i];
          boxes[i] = 0;
        }
        scores[10] = 0;
        scores[11] = 0;
      }
    }

    // Determine winner
    let isTerminal = isGameOver;
    let winner = undefined;
    if (isTerminal) {
      if (scores[0] > scores[1]) winner = players[0];
      else if (scores[1] > scores[0]) winner = players[1];
      else winner = 'DRAW';
    }

    return {
      valid: true,
      newState: {
        boxes,
        scores,
        turnIndex: isTerminal ? playerIndex : nextPlayerIndex,
        winner: isTerminal ? (winner === 'DRAW' ? 'DRAW' : winner) : null
      },
      isTerminal,
      winner: winner === 'DRAW' ? 'DRAW' : winner
    };
  }
};

// 5. CO CA NGUA RULE ENGINE (LUDO)
export const coCaNguaEngine: RuleEngine = {
  getInitialState(players: string[]) {
    // 4 horses per player. Track is 48 slots (0 to 47). Stables 'S', Home Stretch 'H1' - 'H6'.
    const horses = players.map((_, pIdx) => {
      return Array(4).fill(null).map((_, hIdx) => ({
        id: `P${pIdx}_H${hIdx}`,
        pos: 'S', // 'S' for stable, 0..47 for track, 'H1'..'H6' for home stretch
        stepCount: 0 // Track step counts to avoid infinite looping
      }));
    });

    return {
      horses,
      turnIndex: 0,
      diceRoll: null,
      diceStatus: 'NEED_ROLL', // 'NEED_ROLL' | 'NEED_MOVE'
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }

    const { action, horseIdx } = move;

    if (action === 'ROLL_DICE') {
      if (state.diceStatus !== 'NEED_ROLL') {
        return { valid: false, error: 'Bạn đã đổ xúc xắc rồi, hãy chọn ngựa để đi!' };
      }
      const roll = Math.floor(Math.random() * 6) + 1; // 1 to 6
      let hasValidMove = false;

      // Determine if player has any valid move with this roll
      const playerHorses = state.horses[playerIndex];
      for (let i = 0; i < 4; i++) {
        const h = playerHorses[i];
        if (h.pos === 'S' && roll === 6) {
          hasValidMove = true; // Can deploy
        } else if (h.pos !== 'S' && !h.pos.startsWith('H')) {
          hasValidMove = true; // Can move on track
        } else if (h.pos.startsWith('H')) {
          const currentRank = parseInt(h.pos.substring(1));
          if (currentRank + 1 === roll || (currentRank === 0 && roll === 1)) {
            hasValidMove = true; // Can go up home stretch
          }
        }
      }

      if (!hasValidMove) {
        // Force next turn since no move possible
        const nextTurnIndex = (state.turnIndex + 1) % players.length;
        return {
          valid: true,
          newState: {
            ...state,
            diceRoll: roll,
            diceStatus: 'NEED_ROLL',
            turnIndex: nextTurnIndex
          }
        };
      }

      return {
        valid: true,
        newState: {
          ...state,
          diceRoll: roll,
          diceStatus: 'NEED_MOVE'
        }
      };
    }

    if (action === 'MOVE_HORSE') {
      if (state.diceStatus !== 'NEED_MOVE') {
        return { valid: false, error: 'Bạn cần đổ xúc xắc trước!' };
      }
      if (horseIdx === undefined || horseIdx < 0 || horseIdx >= 4) {
        return { valid: false, error: 'Mã số ngựa không hợp lệ!' };
      }

      const roll = state.diceRoll;
      const playerHorses = [...state.horses[playerIndex]];
      const h = { ...playerHorses[horseIdx] };

      let nextPos = h.pos;
      let nextStepCount = h.stepCount;

      if (h.pos === 'S') {
        if (roll !== 6) {
          return { valid: false, error: 'Cần đổ được 6 để ra quân!' };
        }
        // Starting position on track for each player:
        // Player 0 starts at 0, Player 1 at 12, Player 2 at 24, Player 3 at 36
        nextPos = String(playerIndex * 12);
        nextStepCount = 0;
      } else if (h.pos.startsWith('H')) {
        const rank = parseInt(h.pos.substring(1));
        if (rank + 1 !== roll) {
          return { valid: false, error: `Phải xúc xắc đúng ${rank + 1} để leo bậc tiếp theo!` };
        }
        nextPos = `H${roll}`;
      } else {
        // Moving on track
        const currPosInt = parseInt(h.pos);
        const steps = roll;
        const finalPos = (currPosInt + steps) % 48;
        nextStepCount += steps;

        if (nextStepCount >= 48) {
          // Enters home stretch
          const remaining = nextStepCount - 48;
          if (remaining === 0) {
            nextPos = 'H1';
          } else {
            return { valid: false, error: 'Bạn đã đi quá cổng đích, không thể đi nước này!' };
          }
        } else {
          nextPos = String(finalPos);
        }
      }

      h.pos = nextPos;
      h.stepCount = nextStepCount;

      const newHorses = state.horses.map((pHorses: any, pIdx: number) => {
        if (pIdx === playerIndex) {
          const updated = [...pHorses];
          updated[horseIdx] = h;
          return updated;
        }
        // Capture other players' horses if they are at the same position
        if (nextPos !== 'S' && !nextPos.startsWith('H')) {
          return pHorses.map((otherH: any) => {
            if (otherH.pos === nextPos) {
              return { ...otherH, pos: 'S', stepCount: 0 }; // Send to stable
            }
            return otherH;
          });
        }
        return pHorses;
      });

      // Check win condition: 4 horses all at H6
      const allHome = newHorses[playerIndex].every((otherH: any) => otherH.pos === 'H6');
      let isTerminal = false;
      let winner = undefined;
      if (allHome) {
        isTerminal = true;
        winner = player;
      }

      // If player rolls a 6, they get another turn! Otherwise pass turn.
      const bonusTurn = roll === 6;
      const nextTurnIndex = bonusTurn ? playerIndex : (state.turnIndex + 1) % players.length;

      return {
        valid: true,
        newState: {
          ...state,
          horses: newHorses,
          diceStatus: 'NEED_ROLL',
          diceRoll: null,
          turnIndex: isTerminal ? playerIndex : nextTurnIndex,
          winner: isTerminal ? player : null
        },
        isTerminal,
        winner
      };
    }

    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

// 6. DUOI HINH BAT CHU ENGINE
const QUIZ_CHALLENGES = [
  { imgClue: 'BA_HOA', word: 'BA HOA', prompt: 'Một người đang nói chuyện bay bổng với 3 bông hoa vàng nở trên miệng.' },
  { imgClue: 'CAT_TUONG', word: 'CÁT TƯỜNG', prompt: 'Đống cát xây dựng bên cạnh một bức tường gạch đỏ.' },
  { imgClue: 'TAU_HOA', word: 'TÀU HỎA', prompt: 'Chiếc tàu lướt đi trên ngọn lửa bùng cháy dữ dội.' },
  { imgClue: 'DANH_TRONG_LANG', word: 'ĐÁNH TRỐNG LẢNG', prompt: 'Một cậu bé gõ trống bập bùng, bên cạnh là một đám mây trôi lững lờ.' },
  { imgClue: 'CHỈ TAY NĂM NGÓN', word: 'CHỈ TAY NĂM NGÓN', prompt: 'Bàn tay xòe rộng năm ngón tay, một ngón tay trỏ chỉ thẳng vào việc làm.' }
];

export const duoiHinhBatChuEngine: RuleEngine = {
  getInitialState(players: string[]) {
    return {
      scores: players.reduce((acc, p) => ({ ...acc, [p]: 0 }), {}),
      round: 0,
      buzzerActive: null, // User ID who buzzed
      clue: QUIZ_CHALLENGES[0],
      isOver: false,
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const { action, guess } = move;

    if (action === 'BUZZ') {
      if (state.buzzerActive) {
        return { valid: false, error: 'Đã có người giành quyền trả lời!' };
      }
      return {
        valid: true,
        newState: {
          ...state,
          buzzerActive: player
        }
      };
    }

    if (action === 'SUBMIT') {
      if (state.buzzerActive !== player) {
        return { valid: false, error: 'Bạn phải nhấn chuông giành quyền trước!' };
      }
      const isCorrect = guess.trim().toUpperCase() === state.clue.word.toUpperCase();
      let scores = { ...state.scores };

      if (isCorrect) {
        scores[player] += 10;
        const nextRound = state.round + 1;
        if (nextRound >= QUIZ_CHALLENGES.length) {
          // Game ends
          // Find max score player
          let maxScore = -1;
          let winner = 'DRAW';
          for (const p of players) {
            if (scores[p] > maxScore) {
              maxScore = scores[p];
              winner = p;
            } else if (scores[p] === maxScore) {
              winner = 'DRAW';
            }
          }
          return {
            valid: true,
            newState: {
              ...state,
              scores,
              buzzerActive: null,
              isOver: true,
              winner: winner === 'DRAW' ? 'DRAW' : winner
            },
            isTerminal: true,
            winner: winner === 'DRAW' ? 'DRAW' : winner
          };
        } else {
          return {
            valid: true,
            newState: {
              ...state,
              scores,
              round: nextRound,
              buzzerActive: null,
              clue: QUIZ_CHALLENGES[nextRound]
            }
          };
        }
      } else {
        // Wrong answer - lose buzzer, other players can buzz
        return {
          valid: true,
          newState: {
            ...state,
            buzzerActive: null
          },
          error: 'Sai rồi! Cơ hội dành cho người khác.'
        };
      }
    }

    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

// 7. NOI CHU ENGINE (WORD CHAIN)
export const noiChuEngine: RuleEngine = {
  getInitialState(players: string[]) {
    return {
      currentWord: 'Học sinh', // Initial word
      turnIndex: 0,
      scores: players.reduce((acc, p) => ({ ...acc, [p]: 0 }), {}),
      history: ['Học sinh'],
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }

    const { word } = move;
    if (!word || word.trim().split(/\s+/).length !== 2) {
      return { valid: false, error: 'Từ nối phải có đúng 2 từ đơn (ví dụ: "sinh nhật")!' };
    }

    const prevWordParts = state.currentWord.trim().split(/\s+/);
    const lastWordOfPrev = prevWordParts[prevWordParts.length - 1].toLowerCase();
    const firstWordOfGuess = word.trim().split(/\s+/)[0].toLowerCase();

    if (lastWordOfPrev !== firstWordOfGuess) {
      return { valid: false, error: `Từ bạn chọn phải bắt đầu bằng chữ "${lastWordOfPrev}"!` };
    }

    if (state.history.map((w: string) => w.toLowerCase()).includes(word.toLowerCase())) {
      return { valid: false, error: 'Từ này đã được sử dụng trước đó!' };
    }

    const nextTurnIndex = (state.turnIndex + 1) % players.length;
    const scores = { ...state.scores };
    scores[player] += 5; // Points for valid link

    return {
      valid: true,
      newState: {
        ...state,
        currentWord: word,
        turnIndex: nextTurnIndex,
        scores,
        history: [...state.history, word]
      }
    };
  }
};

// 8. DOAN TU ENGINE (WORDLE VN)
export const doanTuEngine: RuleEngine = {
  getInitialState(players: string[]) {
    return {
      secretWord: 'TRUYEN', // 6 letter word
      guesses: players.reduce((acc, p) => ({ ...acc, [p]: [] }), {}),
      turnIndex: 0,
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }

    const { guess } = move;
    if (!guess || guess.trim().length !== 6) {
      return { valid: false, error: 'Từ đoán phải có đúng 6 chữ cái!' };
    }

    const upperGuess = guess.toUpperCase();
    const secret = state.secretWord.toUpperCase();
    const feedback = Array(6).fill('gray');

    // Simple feedback calculations
    const secretLetters = secret.split('');
    const guessLetters = upperGuess.split('');

    for (let i = 0; i < 6; i++) {
      if (guessLetters[i] === secretLetters[i]) {
        feedback[i] = 'green';
        secretLetters[i] = '_';
        guessLetters[i] = '';
      }
    }

    for (let i = 0; i < 6; i++) {
      if (guessLetters[i] !== '') {
        const idx = secretLetters.indexOf(guessLetters[i]);
        if (idx !== -1) {
          feedback[i] = 'yellow';
          secretLetters[idx] = '_';
        }
      }
    }

    const userGuesses = [...state.guesses[player], { guess: upperGuess, feedback }];
    const hasWon = upperGuess === secret;
    const isOver = hasWon || userGuesses.length >= 6;

    let newState = {
      ...state,
      guesses: {
        ...state.guesses,
        [player]: userGuesses
      },
      turnIndex: isOver ? playerIndex : (state.turnIndex + 1) % players.length,
      winner: hasWon ? player : null
    };

    return {
      valid: true,
      newState,
      isTerminal: hasWon,
      winner: hasWon ? player : undefined
    };
  }
};

// 9. SPEED MATH ENGINE (TOÁN HỌC VUI)
function generateSpeedMathEquation() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = 0, b = 0, r = 0;
  if (op === '+') {
    a = Math.floor(Math.random() * 40) + 10;
    b = Math.floor(Math.random() * 40) + 10;
    r = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 40) + 20;
    b = Math.floor(Math.random() * a);
    r = a - b;
  } else {
    a = Math.floor(Math.random() * 10) + 2;
    b = Math.floor(Math.random() * 10) + 2;
    r = a * b;
  }
  const isCorrect = Math.random() > 0.5;
  let disp = r;
  if (!isCorrect) {
    const offset = (Math.floor(Math.random() * 5) + 1) * (Math.random() > 0.5 ? 1 : -1);
    disp = r + offset;
    if (disp < 0) disp = r + 3;
  }
  return {
    text: `${a} ${op === '*' ? 'x' : op} ${b} = ${disp}`,
    isCorrect: disp === r
  };
}

export const speedMathEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const scores: Record<string, number> = {};
    const answers: Record<string, boolean | null> = {};
    for (const p of players) {
      scores[p] = 0;
      answers[p] = null;
    }
    return {
      round: 1,
      scores,
      answers,
      equation: generateSpeedMathEquation(),
      status: 'PLAYING'
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    if (state.status === 'ENDED') {
      return { valid: false, error: 'Trận đấu đã kết thúc!' };
    }
    if (move.action === 'ANSWER') {
      if (state.answers[player] !== null) {
        return { valid: false, error: 'Bạn đã trả lời vòng này rồi!' };
      }
      const isCorrectAnswer = move.answer === state.equation.isCorrect;
      const newScores = { ...state.scores };
      if (isCorrectAnswer) {
        newScores[player] = (newScores[player] || 0) + 10;
      } else {
        newScores[player] = Math.max(0, (newScores[player] || 0) - 5);
      }

      const newAnswers = { ...state.answers, [player]: move.answer };
      
      // If everyone has answered, or if it's solo and everyone has answered
      const allAnswered = players.every(p => newAnswers[p] !== null);

      if (allAnswered) {
        const nextRound = state.round + 1;
        if (nextRound > 10) {
          let winner: string | null = 'DRAW';
          const p1 = players[0];
          const p2 = players[1];
          if (p2) {
            if (newScores[p1] > newScores[p2]) winner = p1;
            else if (newScores[p2] > newScores[p1]) winner = p2;
          } else {
            winner = p1;
          }
          return {
            valid: true,
            newState: {
              ...state,
              scores: newScores,
              answers: newAnswers,
              status: 'ENDED',
              winner
            },
            isTerminal: true,
            winner: winner || undefined
          };
        } else {
          // Move to next round
          const resetAnswers: Record<string, null> = {};
          for (const p of players) {
            resetAnswers[p] = null;
          }
          return {
            valid: true,
            newState: {
              ...state,
              round: nextRound,
              scores: newScores,
              answers: resetAnswers,
              equation: generateSpeedMathEquation()
            }
          };
        }
      } else {
        return {
          valid: true,
          newState: {
            ...state,
            scores: newScores,
            answers: newAnswers
          }
        };
      }
    }
    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

// 10. NUMBER PATTERN ENGINE (QUY LUẬT CON SỐ)
const NUMBER_PATTERNS = [
  { sequence: [2, 4, 6, 8, '?'], answer: 10, choices: [9, 10, 11, 12] },
  { sequence: [3, 9, 27, '?'], answer: 81, choices: [54, 72, 81, 90] },
  { sequence: [1, 4, 9, 16, '?'], answer: 25, choices: [20, 24, 25, 36] },
  { sequence: [1, 2, 3, 5, 8, '?'], answer: 13, choices: [10, 11, 12, 13] },
  { sequence: [10, 9, 7, 4, '?'], answer: 0, choices: [-1, 0, 1, 2] },
  { sequence: [5, 10, 20, 40, '?'], answer: 80, choices: [50, 60, 70, 80] },
  { sequence: [2, 3, 5, 7, 11, '?'], answer: 13, choices: [12, 13, 14, 15] },
  { sequence: [100, 90, 81, 73, '?'], answer: 66, choices: [65, 66, 67, 68] }
];

export const numberPatternEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const scores: Record<string, number> = {};
    for (const p of players) {
      scores[p] = 0;
    }
    const qIndex = Math.floor(Math.random() * NUMBER_PATTERNS.length);
    return {
      round: 1,
      scores,
      qIndex,
      pattern: NUMBER_PATTERNS[qIndex],
      status: 'PLAYING'
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    if (state.status === 'ENDED') {
      return { valid: false, error: 'Trận đấu đã kết thúc!' };
    }
    if (move.action === 'SUBMIT') {
      const correct = state.pattern.answer === move.answer;
      const newScores = { ...state.scores };
      if (correct) {
        newScores[player] = (newScores[player] || 0) + 20;
      }

      const nextRound = state.round + 1;
      if (nextRound > 5) {
        return {
          valid: true,
          newState: {
            ...state,
            scores: newScores,
            status: 'ENDED',
            winner: player
          },
          isTerminal: true,
          winner: player
        };
      } else {
        let newQIndex = (state.qIndex + 1) % NUMBER_PATTERNS.length;
        return {
          valid: true,
          newState: {
            ...state,
            round: nextRound,
            scores: newScores,
            qIndex: newQIndex,
            pattern: NUMBER_PATTERNS[newQIndex]
          }
        };
      }
    }
    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

// 11. MEMORY MATCH ENGINE (LẬT BÀI TRÙNG KHỚP)
export const memoryMatchEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const symbols = ['🍎', '🍌', '🍒', '🥑', '🍇', '🍉', '🍍', '🍑'];
    const cardsPool = [...symbols, ...symbols];
    
    // Shuffle cards
    for (let i = cardsPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardsPool[i], cardsPool[j]] = [cardsPool[j], cardsPool[i]];
    }

    const cards = cardsPool.map((sym, idx) => ({
      id: idx,
      symbol: sym,
      isFlipped: false,
      isMatched: false
    }));

    const scores: Record<string, number> = {};
    for (const p of players) {
      scores[p] = 0;
    }

    return {
      cards,
      selectedIndices: [],
      scores,
      movesCount: 0,
      turnIndex: 0,
      status: 'PLAYING'
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    const playerIndex = players.indexOf(player);
    if (playerIndex !== state.turnIndex) {
      return { valid: false, error: 'Không phải lượt của bạn!' };
    }
    if (state.status === 'ENDED') {
      return { valid: false, error: 'Trận đấu đã kết thúc!' };
    }

    if (move.action === 'FLIP') {
      const idx = move.index;
      if (idx < 0 || idx >= 16) {
        return { valid: false, error: 'Vị trí bài không hợp lệ!' };
      }
      if (state.cards[idx].isFlipped || state.cards[idx].isMatched) {
        return { valid: false, error: 'Lá bài đã được mở!' };
      }

      let newCards = state.cards.map((c: any) => ({ ...c }));
      let newSelected = [...state.selectedIndices];

      // If we already have 2 flipped cards that did not match, flip them back first
      if (newSelected.length === 2) {
        const [i1, i2] = newSelected;
        if (newCards[i1].symbol !== newCards[i2].symbol) {
          newCards[i1].isFlipped = false;
          newCards[i2].isFlipped = false;
        }
        newSelected = [];
      }

      // Flip the new card
      newCards[idx].isFlipped = true;
      newSelected.push(idx);

      let newScores = { ...state.scores };
      let nextTurnIndex = state.turnIndex;
      let isMatchedPair = false;

      if (newSelected.length === 2) {
        const [i1, i2] = newSelected;
        if (newCards[i1].symbol === newCards[i2].symbol) {
          newCards[i1].isMatched = true;
          newCards[i2].isMatched = true;
          newScores[player] = (newScores[player] || 0) + 1;
          newSelected = [];
          isMatchedPair = true;
          // Turn stays with matching player!
        } else {
          // No match, turn changes to next player
          nextTurnIndex = (state.turnIndex + 1) % players.length;
        }
      }

      const allMatched = newCards.every((c: any) => c.isMatched);
      if (allMatched) {
        let winner = players[0];
        const p1 = players[0];
        const p2 = players[1];
        if (p2) {
          if (newScores[p1] > newScores[p2]) winner = p1;
          else if (newScores[p2] > newScores[p1]) winner = p2;
          else winner = 'DRAW';
        }
        return {
          valid: true,
          newState: {
            ...state,
            cards: newCards,
            selectedIndices: newSelected,
            scores: newScores,
            status: 'ENDED',
            winner
          },
          isTerminal: true,
          winner
        };
      }

      return {
        valid: true,
        newState: {
          ...state,
          cards: newCards,
          selectedIndices: newSelected,
          scores: newScores,
          turnIndex: nextTurnIndex,
          movesCount: state.movesCount + 1
        }
      };
    }
    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

// 12. SIMON SAYS ENGINE (TRÍ NHỚ ÂM THANH)
export const simonSaysEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const scores: Record<string, number> = {};
    for (const p of players) {
      scores[p] = 0;
    }
    const sequence = [Math.floor(Math.random() * 4)];
    return {
      sequence,
      playerSequence: [],
      round: 1,
      scores,
      status: 'PLAYING_SEQUENCE',
      winner: null
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    if (state.winner) {
      return { valid: false, error: 'Trận đấu đã kết thúc!' };
    }

    if (move.action === 'START_INPUT') {
      return {
        valid: true,
        newState: {
          ...state,
          status: 'PLAYER_INPUT',
          playerSequence: []
        }
      };
    }

    if (move.action === 'TAP') {
      const idx = move.colorIndex;
      const expected = state.sequence[state.playerSequence.length];
      
      if (idx !== expected) {
        // Failed!
        const newScores = { ...state.scores };
        newScores[player] = state.round - 1;
        return {
          valid: true,
          newState: {
            ...state,
            scores: newScores,
            status: 'GAME_OVER',
            winner: 'bot_computer' // In solo, bot wins when user loses
          },
          isTerminal: true,
          winner: 'bot_computer'
        };
      }

      const newPlayerSeq = [...state.playerSequence, idx];
      const finished = newPlayerSeq.length === state.sequence.length;

      if (finished) {
        const nextRound = state.round + 1;
        const newSeq = [...state.sequence, Math.floor(Math.random() * 4)];
        const newScores = { ...state.scores };
        newScores[player] = state.round;

        return {
          valid: true,
          newState: {
            ...state,
            round: nextRound,
            sequence: newSeq,
            playerSequence: [],
            scores: newScores,
            status: 'PLAYING_SEQUENCE'
          }
        };
      } else {
        return {
          valid: true,
          newState: {
            ...state,
            playerSequence: newPlayerSeq
          }
        };
      }
    }
    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

// 13. REFLEX ENGINE (PHẢN XẠ SIÊU TỐC)
export const reflexEngine: RuleEngine = {
  getInitialState(players: string[]) {
    const scores: Record<string, number> = {};
    for (const p of players) {
      scores[p] = 0; // average reaction times (smaller is better)
    }
    return {
      round: 1,
      screenState: 'WAITING',
      greenTime: 0,
      reactionTimes: [],
      scores,
      status: 'PLAYING'
    };
  },
  validateMove(state: any, move: any, player: string, players: string[]) {
    if (state.status === 'ENDED') {
      return { valid: false, error: 'Trận đấu đã kết thúc!' };
    }

    if (move.action === 'TRIGGER_GREEN') {
      return {
        valid: true,
        newState: {
          ...state,
          screenState: 'READY',
          greenTime: move.timestamp || Date.now()
        }
      };
    }

    if (move.action === 'CLICK') {
      const now = Date.now();
      let newTimes = [...state.reactionTimes];
      let newScreen = state.screenState;

      if (state.screenState === 'WAITING') {
        newScreen = 'TOO_EARLY';
        newTimes.push(1500); // 1.5s penalty for jumping the gun
      } else if (state.screenState === 'READY') {
        const elapsed = now - state.greenTime;
        newTimes.push(elapsed);
        newScreen = 'RESULT';
      } else {
        return { valid: false, error: 'Trạng thái màn hình không đúng!' };
      }

      // Compute current average reaction
      const sum = newTimes.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / newTimes.length);
      const newScores = { ...state.scores, [player]: avg };

      return {
        valid: true,
        newState: {
          ...state,
          reactionTimes: newTimes,
          screenState: newScreen,
          scores: newScores
        }
      };
    }

    if (move.action === 'NEXT_ROUND') {
      const nextRound = state.round + 1;
      if (nextRound > 5) {
        return {
          valid: true,
          newState: {
            ...state,
            status: 'ENDED',
            winner: player
          },
          isTerminal: true,
          winner: player
        };
      } else {
        return {
          valid: true,
          newState: {
            ...state,
            round: nextRound,
            screenState: 'WAITING',
            greenTime: 0
          }
        };
      }
    }

    return { valid: false, error: 'Hành động không hợp lệ!' };
  }
};

export const RULE_ENGINES: Record<string, RuleEngine> = {
  caro: caroEngine,
  co_tuong: coTuongEngine,
  co_vua: coVuaEngine,
  o_an_quan: oAnQuanEngine,
  co_ca_ngua: coCaNguaEngine,
  duoi_hinh_bat_chu: duoiHinhBatChuEngine,
  noi_chu: noiChuEngine,
  doan_tu: doanTuEngine,
  speed_math: speedMathEngine,
  number_pattern: numberPatternEngine,
  memory_match: memoryMatchEngine,
  simon_says: simonSaysEngine,
  reflex: reflexEngine
};
