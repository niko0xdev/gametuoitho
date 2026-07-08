# Plan: Port live gameplay to a Worker Durable Object

## Goal
Make live multiplayer games (caro, cờ tướng, cờ vua, ô ăn quan, cờ cá ngựa, đuổi hình bắt chữ, nối chữ, đoán từ) work on the Cloudflare Worker. Currently `GameBoard.tsx` + `App.tsx` lobby open `wss://gametuoitho.space/` (root) against a legacy WS protocol the Worker never implemented — so no live game works on the deployed site.

## Root cause (already diagnosed)
- Frontend (`GameBoard`) expects authoritative `MATCH_STATE_UPDATE` after each move → server must run game logic (not a thin relay).
- Logic lives server-only: `server/rules.ts` (~10 rule engines) + `server/roomManager.ts` (state, matchmaking, private rooms, spectators, bots, badge awarding).
- Worker has no root-WS handler; the DO hooks migrated earlier aren't used by any component.

## Architecture
- **One global `GameServerDO`** (Durable Object, SQLite-backed, hibernatable WS) — the faithful equivalent of the legacy single-process `roomManager`. Holds: sockets (hibernatable WS w/ userId attachment), matches (DO SQLite), matchmaking queues, private rooms, spectators.
- Speaks the **existing legacy message protocol unchanged** so `GameBoard.tsx` / `App.tsx` need zero protocol changes:
  - In: `REGISTER_SOCKET`, `JOIN_MATCHMAKING`, `LEAVE_MATCHMAKING`, `CREATE_PRIVATE_ROOM`, `JOIN_PRIVATE_ROOM`, `SEND_INVITATION`, `MAKE_MOVE`, `FORFEIT`, `SPECTATE_MATCH`, `UNSPECTATE_MATCH`.
  - Out: `REGISTERED`, `MATCHMAKING_STATUS`, `MATCH_STATE_UPDATE`, `PRIVATE_ROOM_CREATED/FAILED/INVITATION`, `MOVE_REJECTED`, `MATCH_ENDED`, `PLAYER_DISCONNECTED/RECONNECTED`, `ONLINE_USERS`.
- **One frontend change**: WS URL `wss://host/` → `wss://host/api/ws` (so the existing `/api/*` Worker route catches it; root stays with Pages). Touches `GameBoard.tsx` + `App.tsx`.
- Rule engines ported as a pure module into `worker/src/game/` (shared logic, no Node deps).
- Match state persisted to D1 (`matchesTable`) on each move + on end (as the legacy `db.saveMatch` did).
- Tournament reporting: call the worker tournament route on `MATCH_ENDED` (port `tournamentManager.reportMatchResult`).

## Anti-pattern note
One global DO is a bottleneck at scale (DO skill warns against it). Acceptable for now (faithful to legacy single-process; small site; free-tier). Future: shard GameServerDO per match.

## Steps (each = one PR you review)

### Step 1 — Port rule engines (pure logic, no runtime wiring)
- Copy `server/rules.ts` + its `GAMES_MAP` dep (`src/gamesData.ts`) into `worker/src/game/` (adjust imports).
- Add a vitest unit test (caro win, off-turn rejection, one more game).
- Verify: `npm run test:worker` + `tsc`. No runtime effect yet.

### Step 2 — GameServerDO scaffold + WS route + frontend URL + presence
- New `worker/src/do/gameserver.ts`: hibernatable WS upgrade + `REGISTER_SOCKET` (attach userId) + presence list (`ONLINE_USERS`) + `SEND_INVITATION` (relay). State in DO SQLite.
- Add DO binding + `new_sqlite_classes` migration in `wrangler.toml`.
- Hono route `app.get('/api/ws', ...)` → `GameServerDO` (worker route `gametuoitho.space/api/ws` already covered by `/api/*`).
- Frontend: change WS URL to `/api/ws` in `GameBoard.tsx` + `App.tsx`.
- Verify: 2 browsers connect → online-users reflects; lobby WS no longer 404s.

### Step 3 — Matchmaking + private rooms
- Port `joinMatchmaking`/`tickMatchmaker`/`leaveMatchmaking`/`createPrivateRoom`/`joinPrivateRoom` into the DO.
- Verify: 2 browsers "Tìm Trận" caro → paired → `MATCH_STATE_UPDATE` with initial board.

### Step 4 — Live moves (the core)
- Port `handlePlayerMove`: rule-engine validate → update state → broadcast `MATCH_STATE_UPDATE` → detect terminal → `MATCH_ENDED`. Persist to D1.
- Port `addSpectator`/`removeSpectator`/`forfeitMatch`.
- Verify: 2 browsers play a full caro game; move appears on opponent; win detected; spectator sees updates.

### Step 5 — Bots + disconnect grace + badges
- Port bot move generators (per-game) for "Đấu Máy (Solo)" + disconnect/reconnect grace windows + badge awarding.
- Verify: solo vs bot plays; disconnect alert fires.

### Step 6 — Tournament reporting + cleanup
- Wire `MATCH_ENDED` → worker tournament route. Remove now-dead `useMatchStream`/`useMatchmaking` hooks + the unused `MatchmakingDO`/`MatchDO` if superseded (or keep for the share/replay path). Final 2-browser e2e across 2-3 games.

## Per-step verification
- `npm run test:worker` (unit) + `npx tsc --noEmit` (worker) + `npm run lint` (frontend).
- Runtime: `wrangler dev` + a node WS script (like the earlier matchmaking e2e) for protocol steps; 2 real browsers for play steps.

## Free-tier notes
- One global DO: requests 100k/day, duration 13k GB-s/day (hibernatable idle ≈ 0). Fine for small site.
- D1 writes: one `saveMatch` per move — watch the 100k rows-written/day. (Legacy did the same; acceptable. Could batch later.)
- CPU 10ms/req: rule engines are light; OK.
