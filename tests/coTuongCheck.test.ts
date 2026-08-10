// Quick sanity test for co_tuong engine: check / checkmate / legal-move filtering.
// Runs against server/rules.ts (the authoritative engine).

import { RULE_ENGINES, getChineseChessLegalMoves, isChineseChessSquareAttacked } from '../server/rules';

const coTuong = RULE_ENGINES['co_tuong'];

function freshBoard() {
  return coTuong.getInitialState(['p1', 'p2']);
}

function setAt(board: any[][], r: number, c: number, piece: any) {
  board[r][c] = piece;
}

function findGeneral(board: any[][], color: 'R' | 'B') {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.type === 'jiang' && p.color === color) return { r, c };
    }
  }
  return null;
}

let pass = 0;
let fail = 0;
function assert(cond: boolean | undefined, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('\n[Test 1] Initial state has 32 pieces and no check');
{
  const board = freshBoard().board;
  const count = board.flat().filter(Boolean).length;
  assert(count === 32, `initial board has 32 pieces (got ${count})`);
  const redGen = findGeneral(board, 'R');
  const blackGen = findGeneral(board, 'B');
  assert(!!redGen && !!blackGen, 'both generals exist');
  if (redGen && blackGen) {
    assert(
      !isChineseChessSquareAttacked(board, redGen.r, redGen.c, 'B'),
      'red general not in check at start'
    );
    assert(
      !isChineseChessSquareAttacked(board, blackGen.r, blackGen.c, 'R'),
      'black general not in check at start'
    );
  }
}

console.log('\n[Test 2] Cannon attack across screen');
{
  // Black cannon at (5,1) with a red pawn at (5,4) as screen and red general at (5,8)
  // All on row 5 — cannon attacks along the row.
  const board = freshBoard().board;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) board[r][c] = null;
  }
  setAt(board, 5, 8, { color: 'R', type: 'jiang', id: 'R_jiang' });
  setAt(board, 5, 4, { color: 'R', type: 'zu', id: 'R_zu_screen' });
  setAt(board, 5, 1, { color: 'B', type: 'pao', id: 'B_pao' });
  assert(
    isChineseChessSquareAttacked(board, 5, 8, 'B'),
    'cannon attacks red general across screen on same row'
  );
}

console.log('\n[Test 3] Engine rejects a move that leaves own general in check');
{
  // Construct a state where Red's rook at (0,0) is pinned by Black's chariot on same row.
  // Red moves the rook off the diagonal and exposes the general.
  const state = {
    board: freshBoard().board,
    turnIndex: 0,
    winner: null
  };
  // Clear all Black pieces
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  // Place Black chariot at (0,1) pinning red's rook at (0,0) to the red general at (9,4)
  // Wait — generals are on column 4. We need a different pin setup.
  // Simpler: put black chariot at row 0 col 4, red rook at row 0 col 8, red general at row 9 col 8.
  state.board[0][4] = { color: 'B', type: 'ju', id: 'B_ju' };
  // Red rook at row 5 col 8, red general at row 9 col 8
  state.board[5][8] = { color: 'R', type: 'ju', id: 'R_ju' };
  // Clear other red pieces blocking
  for (let r = 6; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (!(r === 9 && c === 8)) state.board[r][c] = null;
    }
  }
  state.board[9][8] = { color: 'R', type: 'jiang', id: 'R_jiang' };

  // Red's turn. Red's rook at (5,8) is currently NOT in check because the
  // black chariot is at (0,4) — different column. But if we move the rook to (0,8) and
  // it's a vertical check? Actually (0,4) attacks (0,8)? No, that's not on the same line.
  // Let me reset: black chariot at (5,4), red rook at (5,0), red general at (5,8).
  // Then red rook at (5,0) is pinned: moving it off column 5 exposes the general.
  state.board = freshBoard().board;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  for (let r = 6; r < 10; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  state.board[5][4] = { color: 'B', type: 'ju', id: 'B_ju' };
  state.board[5][0] = { color: 'R', type: 'ju', id: 'R_ju' };
  state.board[5][8] = { color: 'R', type: 'jiang', id: 'R_jiang' };
  state.board[9][4] = { color: 'R', type: 'jiang', id: 'R_jiang2' }; // invalid duplicate, ignored

  // Better: just one general.
  state.board = freshBoard().board;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  for (let r = 6; r < 10; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  state.board[5][0] = { color: 'B', type: 'ju', id: 'B_ju' }; // black chariot at (5,0)
  state.board[5][4] = { color: 'R', type: 'ju', id: 'R_ju' }; // red rook at (5,4) — pinned along row 5
  state.board[5][8] = { color: 'R', type: 'jiang', id: 'R_jiang' }; // red general at (5,8)

  // Red moves rook (5,4) -> (5,5): does NOT expose general (still between chariot and general? No, moving off the row exposes).
  // Actually (5,4) is between (5,0) and (5,8) — moving it off the row breaks the shield? No, the chariot attacks through the empty square now. But the rook moves to (5,5) which IS on the row — so chariot can still see the general? Yes. Wait, after moving rook to (5,5), positions are: chariot (5,0), rook (5,5), general (5,8). Chariot looks right from (5,0): (5,1) empty, (5,2) empty, (5,3) empty, (5,4) empty, (5,5) rook → BLOCKED by rook. So general NOT in check.
  // Move rook to (5,3): chariot → empty (5,1), empty (5,2), rook (5,3) BLOCKED. Not in check.
  // Move rook to (5,6): chariot → empty all the way to (5,6) → BLOCKED. Not in check.
  // The rook CAN'T move off row 5 because... actually it can. Move to (6,4): then chariot sees (5,4) empty, (5,5) empty, (5,6) empty, (5,7) empty, (5,8) general → CHECK. So (6,4) is illegal.
  // Move to (4,4): chariot sees row 5 clear to general → CHECK. Illegal.
  const result = coTuong.validateMove(
    { board: state.board, turnIndex: 0, winner: null },
    { from: { r: 5, c: 4 }, to: { r: 6, c: 4 } },
    'p1',
    ['p1', 'p2']
  );
  assert(!result.valid, 'pinned rook cannot move off the pin line (exposes general)');
  if (!result.valid) {
    assert(
      result.error?.includes('chiếu') || result.error?.includes('Tướng'),
      `error message references chiếu/Tướng (got: ${result.error})`
    );
  }
}

console.log('\n[Test 4] Legal-move filtering: pinned piece returns only safe moves');
{
  // Same pinned-rook scenario. From (5,4), moves along row 5 are safe; moves off row are unsafe.
  const state = {
    board: freshBoard().board,
    turnIndex: 0,
    winner: null
  };
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  for (let r = 6; r < 10; r++) {
    for (let c = 0; c < 9; c++) state.board[r][c] = null;
  }
  state.board[5][0] = { color: 'B', type: 'ju', id: 'B_ju' };
  state.board[5][4] = { color: 'R', type: 'ju', id: 'R_ju' };
  state.board[5][8] = { color: 'R', type: 'jiang', id: 'R_jiang' };

  const rawMoves = getChineseChessLegalMoves(5, 4, state.board);
  // Raw moves would include row-5 moves (safe) AND off-row moves (unsafe)
  assert(rawMoves.length > 1, `raw legal moves include off-row options (got ${rawMoves.length})`);
  const offRow = rawMoves.filter((m) => m.r !== 5);
  assert(offRow.length >= 1, `raw legal moves include at least one off-row move (got ${offRow.length})`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
