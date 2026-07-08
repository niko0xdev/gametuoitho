# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 24 issues found in the page-by-page audit + parallel code review: production frontend bugs (P1/P2/P3), accessibility gaps, and dev-only Express drift vs the production Worker.

**Architecture:** Frontend fixes ship to production (Cloudflare Pages) and apply to both `npm run dev` and the Worker. Express-handler fixes close the dev/prod parity gap so `npm run dev` matches the Worker contract. Pure logic (knockout winner, standings, display-name, password rules) is extracted into testable functions; server routes/middleware are covered by the existing `node:test` + `request()` harness; React UI changes are implemented then verified in the browser preview (no React test framework exists yet — vitest migration is a separate roadmap item).

**Tech Stack:** React 19, Vite 6, Tailwind 4, Express + better-sqlite3 + drizzle, `node:test` + `tsx --test`. Cloudflare Worker is the production backend (reference-correct; this plan ports its behavior into the legacy Express handlers).

**Branch:** `fix/audit-pass` (worktree `keen-keller-672f0e`).

**Verification gates (every task):** `npm run lint` (tsc --noEmit) + `npm run test:fast` must be green before commit. UI tasks additionally verified via preview browser MCP.

---

## Conventions for this plan

- **TDD-able** = there is a unit/integration test. Steps: write failing test → run (RED) → implement → run (GREEN) → commit.
- **UI-verify** = no test framework for React; implement, then verify in the preview browser (load page, exercise flow, check `window.__errs` collector + DOM). These still get `npm run lint`.
- Each task ends with `git add -p` + a focused commit using the existing Conventional Commits style (`fix(bilac): …`).

---

## Task 1: Fix `Cờ {name}` double-prefix (P2, browser-confirmed) — TDD-able

**Root cause:** `gamesData.ts` `name` is already the full display name ("Caro", "Cờ Tướng", "Đuổi Hình Bắt Chữ"). Four files hardcode a `Cờ ` prefix on top → "Cờ Cờ Tướng", and wrongly prefix non-chess games.

**Files:**
- Create: `src/lib/gameDisplayName.ts`
- Test: `tests/gameDisplayName.test.ts`
- Modify: `src/components/Leaderboards.tsx:60`, `src/components/GameBoard.tsx:182`, `src/components/ReplayView.tsx:171`, `src/components/TournamentsView.tsx:174,394,459`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gameDisplayName.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameDisplayName } from '../src/lib/gameDisplayName.ts';
import { GAMES } from '../src/gamesData.ts';

test('returns the raw name unchanged', () => {
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'caro')!), 'Caro');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'co_tuong')!), 'Cờ Tướng');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'co_vua')!), 'Cờ Vua');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'co_ca_ngua')!), 'Cờ Cá Ngựa');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'o_an_quan')!), 'Ô Ăn Quan');
  assert.equal(gameDisplayName(GAMES.find(g => g.id === 'duoi_hinh_bat_chu')!), 'Đuổi Hình Bắt Chữ');
});

test('never doubles the Cờ prefix', () => {
  for (const g of GAMES) {
    assert.ok(!gameDisplayName(g).startsWith('Cờ Cờ'), `doubled prefix for ${g.id}`);
  }
});

test('falls back gracefully for unknown game', () => {
  assert.equal(gameDisplayName(undefined), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/gameDisplayName.test.ts`
Expected: FAIL — `gameDisplayName` is not defined / module not found.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/gameDisplayName.ts
import type { Game } from '../types.ts';

/**
 * Canonical display name for a game. gamesData names are already complete
 * ("Caro", "Cờ Tướng", "Đuổi Hình Bắt Chữ") — never auto-prefix with "Cờ".
 */
export function gameDisplayName(game: Game | undefined): string {
  return game?.name ?? '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/gameDisplayName.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace the 6 hardcoded prefix sites**

For each site, import `gameDisplayName` and replace `Cờ {…?.name}` / `Cờ {g.name}` with `{gameDisplayName(…)}`:
- `src/components/Leaderboards.tsx:60` → `<option key={g.id} value={g.id}>{gameDisplayName(g)}</option>` (add `import { gameDisplayName } from '../lib/gameDisplayName.ts';`)
- `src/components/GameBoard.tsx:182` → `Cờ {gameInfo?.name} Arena` becomes `{gameDisplayName(gameInfo)} Arena` (the literal "Cờ " is dropped; add import)
- `src/components/ReplayView.tsx:171` → `Bộ môn: <b>{gameDisplayName(GAMES.find(g => g.id === selectedMatch.gameId))}</b>`
- `src/components/TournamentsView.tsx:174` → `Bộ môn: <b>{gameDisplayName(GAMES.find(g => g.id === selectedT.gameId))}</b>`
- `src/components/TournamentsView.tsx:394` → `<option …>{gameDisplayName(g)}</option>`
- `src/components/TournamentsView.tsx:459` → `Bộ môn: {gameDisplayName(GAMES.find(g => g.id === tour.gameId))}`

- [ ] **Step 6: Lint + commit**

```bash
npm run lint
git add src/lib/gameDisplayName.ts src/components/Leaderboards.tsx src/components/GameBoard.tsx src/components/ReplayView.tsx src/components/TournamentsView.tsx tests/gameDisplayName.test.ts
git commit -m "fix(ui): stop double-prefixing game names with Cờ

gamesData names already include Cờ where appropriate (Cờ Tướng, Cờ Vua,
Cờ Cá Ngựa). Hardcoded 'Cờ {name}' produced 'Cờ Cờ Tướng Arena' and wrongly
prefixed non-chess games (Cờ Đuổi Hình Bắt Chữ). Add gameDisplayName()
helper and use it in Leaderboards, GameBoard, ReplayView, TournamentsView."
```

---

## Task 2: MyLeague knockout tie-handling + H2H tiebreaker (P1 #6, P2 #6) — TDD-able

**Root cause:** `winnerId = hs > as ? match.home : match.away` falls through to away on a draw; `winner` set to literal `'DRAW'` → champion banner shows "Nhà vô địch: DRAW". Also the info box advertises a head-to-head tiebreaker that `computeStandings` doesn't implement.

**Files:**
- Create: `src/lib/knockout.ts`
- Test: `tests/knockout.test.ts`
- Modify: `src/components/MyLeagueView.tsx` (lines ~1079, 1103, 1150, 1294, 1335, 1869 champion banner, 932-936 standings, 1917 info-box text)

- [ ] **Step 1: Write the failing test**

```ts
// tests/knockout.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knockoutWinner } from '../src/lib/knockout.ts';

test('home wins when ahead', () => {
  assert.equal(knockoutWinner('home1', 'away1', 3, 1), 'home1');
});
test('away wins when ahead', () => {
  assert.equal(knockoutWinner('home1', 'away1', 0, 2), 'away1');
});
test('draw returns null sentinel, never the away team', () => {
  assert.equal(knockoutWinner('home1', 'away1', 1, 1), null);
});
```

- [ ] **Step 2: Run test → RED** (`npx tsx --test tests/knockout.test.ts`).

- [ ] **Step 3: Implement**

```ts
// src/lib/knockout.ts
/** Returns the winner of a knockout fixture, or null for a draw (must be replayed / handled by caller). */
export function knockoutWinner(homeId: string, awayId: string, homeScore: number, awayScore: number): string | null {
  if (homeScore > awayScore) return homeId;
  if (awayScore > homeScore) return awayId;
  return null;
}
```

- [ ] **Step 4: Run test → GREEN.**

- [ ] **Step 5: Wire into MyLeagueView**

Read `src/components/MyLeagueView.tsx` around the flagged lines. Replace the inline `hs > as ? home : away` ternaries at ~1103, ~1150, ~1294, ~1335 with `knockoutWinner(match.home, match.away, hs, as)`. Where `winner` was set to `'DRAW'`, set it to `null`/omit, and where a winner is required downstream (advancing a slot), **skip advancement** on a draw (leave the slot empty) rather than pushing the away team. At the champion banner (~1869), only render "Nhà vô địch: …" when `m.winner` is a real team id; if null, render "Chưa xác định — cần đá lại trận hòa" (or hide the banner).

- [ ] **Step 6: H2H tiebreaker — align text with behavior**

Decision: the advertised "Kết quả đối đầu trực tiếp" is not implemented and full H2H is a larger change. For this pass, **fix the info-box text** (~1917) to match the real sort order (points → GD → GF) so the UI stops lying. Replace "…→ Kết quả đối đầu trực tiếp" with "…→ Số bàn thắng (GF)". (Implementing real H2H is tracked as a follow-up; do not leave the misleading label.)

- [ ] **Step 7: Lint + browser-verify (open a knockout MyLeague, enter a drawn semifinal score → away team is NOT promoted; champion banner does not say "DRAW") + commit**

```bash
npm run lint && npx tsx --test tests/knockout.test.ts
git commit -m "fix(myleague): stop advancing away team on knockout draws

knockoutWinner() returns null on a tie instead of falling through to the
away side; champion banner no longer crowns 'DRAW'. Align the standings
tiebreaker label with the actual sort (Pts > GD > GF)."
```

---

## Task 3: MyLeague AI import wipe + AI goal double-count (P1 #4, P2 #4) — UI-verify (pure logic where possible)

**Root cause #4:** the `numTeams` effect (519-523) unconditionally resets `teamNames` to `Đội tuyển 1..N` whenever `numTeams` changes, so `handleAiParse`'s `setTeamNames(parsed)` is overwritten on the next commit. **Root cause double-count:** `handleAiApplyEvents` (1040-1046) does `parseInt(prev) + delta` unconditionally instead of "only if user hasn't entered".

**Files:** Modify `src/components/MyLeagueView.tsx` (effect ~519-523, ~619/636; apply ~1040-1046).

- [ ] **Step 1: Fix the AI-import wipe**

Read the effect. Guard it so it only auto-fills defaults when the names are empty / not freshly parsed. Concretely: track an `aiImportNonce` ref (or a `didAiImport` flag) that `handleAiParse` sets; in the `numTeams` effect, if that flag is set, consume it and skip the reset. Alternatively (simpler, preferred): move the default-name seeding out of a `numTeams`-watching effect into the explicit handlers that change team count (sport dropdown, +/- team), so changing `numTeams` via AI parse no longer triggers a wipe. Verify the success toast count still matches the rendered rows.

- [ ] **Step 2: Fix the double-count**

At ~1040-1046, change the apply logic so an AI event delta is applied **only to a score the user has not manually edited**. Track per-side "userEdited" flags in the modal state; once the user typed a score, AI deltas skip that side. If simpler: when applying, set the score to the AI's **absolute** derived value rather than adding to the current value (the AI knows the full event set). Pick the absolute-replace approach — it cannot double-count.

- [ ] **Step 3: Lint + browser-verify**

In preview: open MyLeague, create a league, set 4 teams, paste a roster that AI-detects 8 → names must populate as parsed (not "Đội tuyển 1..8"); enter a 2-1 score, run AI prefill for 2 home + 1 away → final stays 2-1, not 4-2.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(myleague): preserve AI-parsed team names and stop double-counting goals

numTeams effect no longer clobbers freshly-parsed roster names; AI event
apply now sets absolute scores instead of adding deltas on top of user
input."
```

---

## Task 4: MyLeague silent save failure (P1 #5) — UI-verify

**Root cause:** `saveLeaguesToLocalStorage` (484-516) and delete (853-863) never check `r.ok`; 4xx/5xx silently treated as success; optimistic update not rolled back.

**Files:** Modify `src/components/MyLeagueView.tsx` (~452-516, ~853-863).

- [ ] **Step 1: Add a `assertOk`-style guard + rollback**

For POST/PUT/DELETE: capture a snapshot of the relevant state before the optimistic update; after `fetch`, `if (!res.ok) { restore snapshot; setSuccessMsg(null); setError('Lưu thất bại: ' + (await res.text())); return; }`. Mirror for delete. Surface a Vietnamese toast on failure. Do not change the happy path.

- [ ] **Step 2: Lint + browser-verify (kill the dev server mid-save to force a failure → error toast appears, state restored) + commit**

```bash
git commit -m "fix(myleague): surface save/delete failures and roll back optimistic state

fetch result is now checked; a 4xx/5xx restores the pre-mutation state and
shows a Vietnamese error instead of silently looking saved."
```

---

## Task 5: MyLeague a11y + React keys (P2/P3) — UI-verify

**Files:** Modify `src/components/MyLeagueView.tsx` (~2082 keys, ~2420 toggle, ~2917/2462/2046 click-to-edit, ~2544 modal).

- [ ] **Step 1:** Player chips (~2082): change `key={p}` to a stable key (player id, fallback to `index`).
- [ ] **Step 2:** Permission toggle (~2420-2431): add `role="switch"`, `aria-checked={enabled}`, `aria-label`.
- [ ] **Step 3:** Click-to-edit surfaces (match cards ~2917, league rows ~2462, team cards ~2046): add `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space → activate).
- [ ] **Step 4:** Edit-score modal (~2544): wrap in `role="dialog" aria-modal="true"`, add Escape handler + click-outside (backdrop) close.
- [ ] **Step 5: Lint + browser-verify (Tab through league list / open modal / press Esc) + commit**

```bash
git commit -m "fix(myleague): keyboard access, switch role, dialog semantics, stable keys"
```

---

## Task 6: BiLac join-modal wrong tournament (P1 #1) — UI-verify

**Root cause:** `JoinTournamentModal` calls `setSelectedTournamentId(localId)` then synchronously `onSubmit(e)`; `handleAccessTournament` reads the stale `selectedTournamentId` from closure.

**Files:** Modify `src/components/BiLacArena.tsx` (~379-396 handler, ~1364 modal submit, ~2557-2563).

- [ ] **Step 1:** Change the modal's `onSubmit` to pass the local selected id through: `onSubmit={(e, id) => handleAccessTournament(e, id)}`. Update `JoinTournamentModal` to call `onSubmit(e, localId)`. Update `handleAccessTournament(e, explicitId?)` to use `explicitId ?? selectedTournamentId`. Remove the reliance on the stale state value.
- [ ] **Step 2: Lint + browser-verify (open join modal, change dropdown to a different tournament, enter its code → request targets the dropdown tournament, not the preselected one) + commit**

```bash
git commit -m "fix(bilac): submit the dropdown-selected tournament, not the stale preselect

Pass the modal's local selection through onSubmit so changing the dropdown
after opening the modal no longer routes the access request to the
originally preselected tournament."
```

---

## Task 7: BiLac destructive-action confirms (P1 #2, #3) — UI-verify

**Files:** Modify `src/components/BiLacArena.tsx` (cancel ~918-931, history delete ~2147-2165).

- [ ] **Step 1:** `handleCancelMatch` (~918): gate the DELETE behind `if (!window.confirm('Hủy trận đấu này? Điểm số hiện tại sẽ bị xoá.')) return;` — matches the existing `confirm()` pattern in `handleDeletePlayer`/`handleRemoveMember`.
- [ ] **Step 2:** History-tab inline delete (~2147-2165): wrap the DELETE in the same `confirm('Xoá trận đấu đã ghi? Bảng xếp hạng sẽ được tính lại.')` guard.
- [ ] **Step 3: Lint + browser-verify (both buttons show a confirm; Cancel=dismiss keeps the match) + commit**

```bash
git commit -m "fix(bilac): confirm before cancelling/deleting a match

Cancel-match and history-tab delete now prompt, matching the existing
confirm pattern for player/member deletion."
```

---

## Task 8: BiLac match-delete requires owner (P1 #3 server) — TDD-able

**Root cause:** `server.ts:92` gates match DELETE with `requireBiLacMember`; any member can delete any finished match.

**Files:** Modify `server.ts:92`; Test: `tests/bilac.test.ts` (extend the `DELETE /api/bilac/matches/:id` block).

- [ ] **Step 1: Write the failing test** (append to the existing `describe('DELETE /api/bilac/matches/:id', …)` in `tests/bilac.test.ts`):

```ts
  it('403s for non-owner member deleting a finished match', async () => {
    const owner = uniq('delOwn');
    const member = uniq('delMem');
    await makeUser(member, member);
    const { id, code } = await setupTournament(owner);
    db.saveBiLacTournamentMember({
      id: `mem-${id}-${member}`, tournamentId: id, userId: member,
      username: member, displayName: member, role: 'member', joinedAt: Date.now()
    });
    db.saveBiLacMatch({
      id: 'del_fin', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 1, score2: 0, status: 'FINISHED'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/del_fin', undefined, {
      'x-user-id': member, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
  });
  it('200s for owner deleting a finished match', async () => {
    const owner = uniq('delOwn2');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'del_fin2', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 1, score2: 0, status: 'FINISHED'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/del_fin2', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
  });
```

- [ ] **Step 2: Run → RED** (current code returns 200 for the member case). `npx tsx --test tests/bilac.test.ts`.

- [ ] **Step 3: Implement** — in `server.ts:92` change `requireBiLacMember` → `requireBiLacOwner` for the match DELETE route. If `requireBiLacOwner` does not exist in `server/handlers/_middleware.ts`, add it mirroring `requireBiLacMember` but also asserting `db.isBiLacTournamentOwner(tournamentId, uid)` → 403 "Chỉ chủ giải đấu mới được xoá trận đấu." Verify the **create-match** route (`POST /api/bilac/matches`) stays `requireBiLacMember` (members can still record matches); only DELETE is owner-only.

- [ ] **Step 4: Run → GREEN.** `npx tsx --test tests/bilac.test.ts`.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(bilac): restrict match deletion to tournament owner

Members can still create/record matches, but only the owner can delete,
so a finished result can no longer be wiped by any member."
```

---

## Task 9: BiLac view-only "Tham gia" no-op + score-update feedback (P2 #4, #5) — UI-verify

**Files:** Modify `src/components/BiLacArena.tsx` (view-only branch ~1099-1147, modal render ~1354; `handleUpdateScore` ~809-844).

- [ ] **Step 1 (view-only Tham gia):** render `<JoinTournamentModal>` inside the view-only branch too (or lift it to a level both branches share), so the `joinModalOpen` flag actually opens it. Verify a logged-out visitor on `/bilac/{slug}` can open the modal and request access.
- [ ] **Step 2 (score-update feedback):** in `handleUpdateScore`, on `!res.ok` add `else { setError('Không ghi được bàn — mã giải đấu có thể đã đổi. Vui lòng vào lại giải.'); return; }` and do **not** play the success beep/speech until the request succeeds (move the beep/speech after the `res.ok` check). Keep optimistic update but roll back on failure.
- [ ] **Step 3: Lint + browser-verify (view-only: open Tham gia → modal appears; score: simulate a 403 by rotating the code → error toast, no false "ghi bàn!") + commit**

```bash
git commit -m "fix(bilac): make view-only Tham gia open the modal; gate score-updates on res.ok"
```

---

## Task 10: BiLac keyboard a11y + P3 polish (P2 #6, P3 #7-12) — UI-verify

**Files:** Modify `src/components/BiLacArena.tsx`.

- [ ] **Step 1 (a11y):** tournament cards (~1310-1346) and player-selection grid (~1746-1771): add `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space).
- [ ] **Step 2 (P3):** remove the duplicate floating donate button (~2449-2459 z-50 OR ~2341-2357 z-40 — keep one).
- [ ] **Step 3 (P3):** `handleLogoutTournament` (~351-358): clear `error` + `successMsg` so banners don't leak across tournament switches.
- [ ] **Step 4 (P3):** `handleFinishMatch`/`handleQuickFinish` (~846-860): read the latest score from a ref or functional `setMatches` updater so the banner/speech cite the committed score, not the stale closure value.
- [ ] **Step 5 (P3 — HS label):** the standings "HS" column (~2010, computed ~1083 `gd = wins - losses`). Either (a) rename the column header to "Hiệu số (W-L)" to match the math, or (b) recompute GD as `goalsScored - goalsConceded`. Choose (b) to match user expectation, since both fields are already tracked (~1047-1048, ~1063-1064).
- [ ] **Step 6 (P3):** view-only auto-promote (~336-339): when `data.isMember`, navigate directly into the known tournament (`viewOnlyData.id`) instead of dropping at the portal.
- [ ] **Step 7: Lint + browser-verify + commit**

```bash
git commit -m "fix(bilac): keyboard a11y, dedupe donate btn, clear banners on switch, real GD, direct member promote"
```

---

## Task 11: Auth Turnstile reset (P1 #7) — UI-verify

**Root cause:** `AuthModal.tsx` never calls `turnstile.reset()` after a failed register → token reused → `timeout-or-duplicate` on retry.

**Files:** Modify `src/components/AuthModal.tsx` (~134-160 widget, ~203-257 submit).

- [ ] **Step 1:** On any register submission failure, call `window.turnstile?.reset(turnstileWidgetIdRef.current)` and `setTurnstileToken(null)`. Also reset on mode switch (login↔register↔forgot) so a stale token never carries over.
- [ ] **Step 2:** Guard the Turnstile render with the documented Turnstile callback that sets the token; keep the existing `data-sitekey`.
- [ ] **Step 3: Lint + browser-verify (the live app uses the Worker; verify locally that a failed register frees the token — if Turnstile can't run locally, at minimum confirm the reset call is wired in the success/failure branches) + commit**

```bash
git commit -m "fix(auth): reset Turnstile token after failed register / mode switch

Reusing the consumed token produced timeout-or-duplicate on the next retry,
blocking the whole signup funnel until page reload."
```

---

## Task 12: AuthModal reset-on-open + a11y (P2 #4, #5) — UI-verify

**Files:** Modify `src/components/AuthModal.tsx`.

- [ ] **Step 1:** Add a `useEffect` on `isOpen`: when transitioning to true, reset `mode='login'`, clear all field/error/success state (and clear `loginPassword`/`resetNewPassword`). This also fixes the plaintext-password-left-in-state issue.
- [ ] **Step 2:** Overlay (~373): add `role="dialog" aria-modal="true" aria-label="Đăng nhập / Đăng ký"`, `onKeyDown` Escape→onClose, backdrop `onClick`→onClose (stopPropagation on the panel). Add a basic focus trap (focus first input on open; restore focus to the trigger on close).
- [ ] **Step 3: Lint + browser-verify (open modal, go to Register, type, close, reopen → login mode, empty fields; Esc + backdrop click close) + commit**

```bash
git commit -m "fix(auth): reset modal state on open, add Esc/backdrop/focus-trap dialog a11y"
```

---

## Task 13: Auth password-rules display + avatar-cycle guard (P3 #9, #10) — UI-verify

**Files:** Modify `src/components/AuthModal.tsx` (~290-326 reset), `src/components/Header.tsx` (~69-78 cycle).

- [ ] **Step 1:** In the reset-password form, render `PASSWORD_HINT` from `src/lib/passwordRules.ts` and call `validatePassword` pre-submit; show the same inline rule UI the register form uses.
- [ ] **Step 2:** `handleCycleAvatar`: only cycle when the current avatar is a dicebear URL (contains `dicebear` / `seed=`). If it's an external photo (e.g. `lh3.googleusercontent.com`), do nothing (or show a toast "Ảnh Google không thể thay bằng avatar mặc định").
- [ ] **Step 3: Lint + browser-verify + commit**

```bash
git commit -m "fix(auth): show password rules on reset; protect Google photo from avatar-cycle"
```

---

## Task 14: Express auth parity — verify-email, resend-otp, google-sso, password validation (P1 #2 dev, P2 #3/#7 dev) — TDD-able

**Goal:** Make `npm run dev` auth match the Worker (`worker/src/routes/auth.ts`). Reference file: `worker/src/routes/auth.ts`.

**Files:** Modify `server/handlers/authHandlers.ts`, `server.ts` (route registration ~45-50). Test: `tests/auth.test.ts`.

- [ ] **Step 1: Write failing tests** in `tests/auth.test.ts`:
  - `POST /api/auth/verify-email` 400s on wrong OTP, 200s on correct (dev: OTP stored in memory/DB with `email_verified` flag).
  - `POST /api/auth/resend-otp` 200 and regenerates.
  - `POST /api/auth/google-sso` accepts `{ credential }` (not `{ email, displayName, avatar }`) and returns a user when the credential verifies; 400 when missing.
  - `POST /api/auth/register` 400s on a weak password (e.g. `"a1"`) — proving `validatePassword` is wired.
- [ ] **Step 2: Run → RED.**
- [ ] **Step 3: Implement** in `server/handlers/authHandlers.ts`:
  - Add OTP generation on register (6-digit, stored hashed or in a dev lookup table keyed by userId/email with TTL), mark user `email_verified=0`, add `handleVerifyEmail` + `handleResendOtp`. Register both routes in `server.ts`.
  - Fix `handleGoogleSso` to read `credential`, verify it (mirror Worker's `jwtVerify`; for dev without the Google JWTH, allow a relaxed dev check but DO NOT ship a bypass — reuse the Worker's verifier shape).
  - Call `validatePassword(body.password)` in `handleRegister` and `handleResetPassword`; 400 "Mật khẩu không đủ mạnh" on failure, reusing `src/lib/passwordRules.ts`.
  - Remove the `_debugOtp` echo and the distinct 404 on unknown email (return the Worker's generic message to avoid enumeration).
- [ ] **Step 4: Run → GREEN.** `npx tsx --test tests/auth.test.ts`.
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(auth): bring Express handlers to Worker parity

Add /verify-email + /resend-otp, fix Google SSO to read {credential},
enforce password rules on register/reset, and stop leaking OTP/unknown-email.
npm run dev now matches the Worker auth contract."
```

---

## Task 15: Express profile + league permission gates (P2 #6 dev, #5 dev) — TDD-able

**Root cause:** `server.ts:54-55` registers profile update/reset Elo bare (no ownership check); league write routes (`handleCreateLeague`/`handlePutLeague`/`handleDeleteLeague`) don't check `db.getLeaguePermissions`.

**Files:** Modify `server/handlers/profileHandlers.ts` (17, 34), `server/handlers/leagueHandlers.ts` (create/put/delete), `server.ts` wiring. Tests: `tests/profile.test.ts`, `tests/leagues.test.ts`.

- [ ] **Step 1: Write failing tests:**
  - `POST /api/profile/userA/update` with `x-user-id: userB` → 403.
  - `POST /api/profile/userA/reset-elo` with `x-user-id: userB` → 403.
  - A league the caller lacks permission for: create/put/delete → 403 (mirror the existing `handleListLeagues` permission check).
- [ ] **Step 2: Run → RED.**
- [ ] **Step 3: Implement:** in `handleUpdateProfile`/`handleResetElo`, resolve the uid via `requireLoggedIn`, then `if (uid !== req.params.userId) return res.status(403).json({ error: 'Bạn không có quyền sửa profile người khác.' })`. In the league create/put/delete handlers, reuse the same `db.getLeaguePermissions(uid)` gate `handleListLeagues` uses; deny empty.
- [ ] **Step 4: Run → GREEN.** `npx tsx --test tests/profile.test.ts tests/leagues.test.ts`.
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(server): gate profile mutations by ownership and league writes by permission

Closes the dev-only IDOR where any logged-in user could edit another user's
profile/Elo or mutate leagues they lack permission for."
```

---

## Task 16: Full-suite green + PR

- [ ] **Step 1:** `npm run lint` → 0 errors.
- [ ] **Step 2:** `npm run test:fast` → all green.
- [ ] **Step 3:** Push the branch and open a PR against `main` with a summary grouped by area (BiLac / MyLeague / Auth / prefix / Express parity), the audit context, and the prod-vs-dev split.
- [ ] **Step 4:** Run `/code-review --fix` on the diff; address findings; commit.
- [ ] **Step 5:** Merge (per user preference: autonomous merge, no "review first?" prompt).
- [ ] **Step 6:** Deploy — frontend auto-deploys via Cloudflare Pages on merge; worker unchanged this PR (no `worker/` edits) so no worker deploy needed.
- [ ] **Step 7:** Verify on `gametuoitho.space` (leaderboard dropdown, a Cờ Tướng solo title, register retry flow).
- [ ] **Step 8:** Cleanup local — exit worktree (`keep`), delete the merged branch locally.
- [ ] **Step 9:** Compact session.

---

## Self-review notes

- **Spec coverage:** all 24 audit findings map to a task — P1 BiLac (T6/T7/T8), P1 MyLeague (T2/T3/T4), P1 Auth (T11), P2 prefix (T1), P2 BiLac (T9/T10), P2 MyLeague a11y (T5), P2 Auth modal/a11y (T12), P2 dev-drift auth (T14), P2 dev-drift profile/league (T15), P3 (T10/T13). ✅
- **Testability:** 6 of 16 tasks are full TDD (T1 helper, T2 knockout, T8 owner-gate, T14 auth routes, T15 permission gates) plus knockout/displayName unit tests; the rest are UI-verify (no React test framework) — explicitly noted, not silently skipped.
- **Type consistency:** `gameDisplayName(game: Game | undefined)`, `knockoutWinner(homeId, awayId, homeScore, awayScore) → string | null`, `requireBiLacOwner` mirrors existing `requireBiLacMember`. Names match across tasks.
- **Scope risk:** T14 (Google SSO `credential` verify) is the one piece that needs the Worker's JWT verifier ported — if that proves large in dev, scope it to "send `{credential}` shape + 400 on missing" and leave full JWT verify to the Worker, with a `TODO` referencing `worker/src/routes/auth.ts:222`.
