# Cloudflare Deploy — Design Spec

**Date:** 2026-07-06
**Status:** Draft (pending review)
**Owner:** niko0xdev

## 1. Goal

Move the existing gametuoitho.space app from local-only (Express + better-sqlite3 + WebSocket, run via `npm run dev`) to a free-tier Cloudflare deployment:

- Static frontend on **Cloudflare Pages** (git auto-deploy).
- API on **Cloudflare Workers** (Hono framework, REST + SSE).
- Database on **Cloudflare D1** (SQLite-compatible, free tier).
- AI calls via an **OpenAI-compatible** endpoint (env-configurable).
- **No WebSocket** — replaced with SSE streaming.
- **No legacy `database.json` migration** — D1 starts empty.
- Local dev continues to work with the existing Express + SQLite stack.

## 2. Architecture

```
┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐
│ Cloudflare Pages (gametuoitho.space) │    │ Cloudflare Worker (api)             │
│  - React 19 + Vite SPA              │    │  - Hono framework                   │
│  - Auto-deploy from git             │    │  - /api/* routes                    │
│  - Env: VITE_API_BASE               │───▶│  - SSE streaming endpoints          │
│                                     │    │  - CORS for Pages origin            │
└─────────────────────────────────────┘    └──────────────────┬──────────────────┘
                                                              │ D1 binding
                                                              ▼
                                          ┌─────────────────────────────────────┐
                                          │ Cloudflare D1 (SQLite-compatible)    │
                                          │  - All tables from server/db.ts      │
                                          │  - Drizzle ORM (d1 driver)          │
                                          └─────────────────────────────────────┘
```

**Networking:**
- Pages custom domain: `gametuoitho.space`.
- Worker custom domain: `api.gametuoitho.space`.
- DNS: CNAME records (managed in Cloudflare dashboard, automatic for proxied domains).
- Frontend reads `VITE_API_BASE` at build time and calls `https://api.gametuoitho.space/api/*`.

**Why this split:**
- Pages gets free git auto-deploy, preview URLs per PR, edge-cached static assets.
- Worker gets D1 binding, Workers AI / OpenAI proxy, runtime env secrets.
- Two small deploys > one tangled deploy.

## 3. Backend (Worker) Structure

Framework: **Hono** (smallest Workers-native option, full type safety, SSE helpers).

### 3.1 File layout

```
worker/
├── src/
│   ├── index.ts           # Hono app, exports default fetch handler
│   ├── db.ts              # Drizzle + D1 binding initialization
│   ├── schema.ts          # Copy of server/schema.ts, D1-compatible
│   ├── routes/
│   │   ├── auth.ts        # register, login, google-sso, forgot/reset, quick-login
│   │   ├── profile.ts     # GET/POST /api/profile/:userId, reset-elo
│   │   ├── leaderboard.ts # global + per-game
│   │   ├── tournaments.ts # CRUD + start + launch
│   │   ├── challenges.ts  # daily challenge get/submit
│   │   ├── replays.ts     # list + fetch single
│   │   ├── bilac.ts       # tournaments, players, matches, weekly interval
│   │   ├── leagues.ts     # CRUD + permissions
│   │   ├── matchmaking.ts # SSE: join, poll stream, leave
│   │   ├── match.ts       # SSE: state stream, POST move, POST forfeit
│   │   ├── ai.ts          # POST /api/ai/parse-roster (OpenAI-compat)
│   │   └── health.ts      # GET /api/health
│   └── lib/
│       ├── password.ts    # SHA-256 (kept; bcrypt is a later roadmap item)
│       ├── ai.ts          # OpenAI-compatible fetch helper (structured outputs)
│       ├── cors.ts        # CORS middleware (allow Pages domain)
│       └── sse.ts         # SSE response helpers
├── migrations/
│   └── 0001_initial.sql   # All CREATE TABLE statements from server/db.ts#initDb
├── wrangler.toml          # Worker name, compatibility_date, d1_databases binding
└── tsconfig.json          # extends root, jsx=react-jsx, target=esnext
```

### 3.2 Route mapping

| Old (Express + WS)                                          | New (Hono + SSE)                                       |
|-------------------------------------------------------------|--------------------------------------------------------|
| `POST /api/auth/register`                                   | `POST /api/auth/register`                              |
| `POST /api/auth/login`                                      | `POST /api/auth/login`                                 |
| `POST /api/auth/google-sso`                                 | `POST /api/auth/google-sso`                            |
| `POST /api/auth/forgot-password`                            | `POST /api/auth/forgot-password`                       |
| `POST /api/auth/reset-password`                             | `POST /api/auth/reset-password`                        |
| `POST /api/auth/quick-login`                                | `POST /api/auth/quick-login`                           |
| `GET  /api/profile/:userId`                                 | `GET  /api/profile/:userId`                            |
| `POST /api/profile/:userId/update`                          | `POST /api/profile/:userId/update`                     |
| `POST /api/profile/:userId/reset-elo`                       | `POST /api/profile/:userId/reset-elo`                  |
| `GET  /api/leaderboard/global`                              | `GET  /api/leaderboard/global`                         |
| `GET  /api/leaderboard/:gameId`                             | `GET  /api/leaderboard/:gameId`                        |
| `GET  /api/tournaments`                                     | `GET  /api/tournaments`                                |
| `POST /api/tournaments/create`                              | `POST /api/tournaments/create`                         |
| `POST /api/tournaments/join`                                | `POST /api/tournaments/join`                           |
| `GET  /api/tournaments/code/:code`                          | `GET  /api/tournaments/code/:code`                     |
| `GET  /api/tournaments/:id`                                 | `GET  /api/tournaments/:id`                            |
| `POST /api/tournaments/:id/start`                           | `POST /api/tournaments/:id/start`                      |
| `POST /api/tournaments/:id/launch/:matchIndex`              | `POST /api/tournaments/:id/launch/:matchIndex`         |
| `GET  /api/challenges/:gameId/:date`                        | `GET  /api/challenges/:gameId/:date`                   |
| `POST /api/challenges/:gameId/:date/submit`                 | `POST /api/challenges/:gameId/:date/submit`            |
| `GET  /api/replays/:userId`                                 | `GET  /api/replays/:userId`                            |
| `GET  /api/replay/:matchId`                                 | `GET  /api/replay/:matchId`                            |
| `GET  /api/bilac/tournaments`                               | `GET  /api/bilac/tournaments`                          |
| `POST /api/bilac/tournaments/access`                        | `POST /api/bilac/tournaments/access`                   |
| `POST /api/bilac/tournaments`                               | `POST /api/bilac/tournaments`                          |
| `GET  /api/bilac/players`                                   | `GET  /api/bilac/players`                              |
| `POST /api/bilac/players`                                   | `POST /api/bilac/players`                              |
| `DELETE /api/bilac/players/:id`                             | `DELETE /api/bilac/players/:id`                        |
| `GET  /api/bilac/matches`                                   | `GET  /api/bilac/matches`                              |
| `POST /api/bilac/matches`                                   | `POST /api/bilac/matches`                              |
| `POST /api/bilac/matches/:id/update`                        | `POST /api/bilac/matches/:id/update`                   |
| `DELETE /api/bilac/matches/:id`                             | `DELETE /api/bilac/matches/:id`                        |
| `GET  /api/leagues`                                         | `GET  /api/leagues`                                    |
| `POST /api/leagues`                                         | `POST /api/leagues`                                    |
| `PUT  /api/leagues/:id`                                     | `PUT  /api/leagues/:id`                                |
| `DELETE /api/leagues/:id`                                   | `DELETE /api/leagues/:id`                              |
| `GET  /api/leagues-permissions`                             | `GET  /api/leagues-permissions`                        |
| `POST /api/leagues-permissions/toggle`                      | `POST /api/leagues-permissions/toggle`                 |
| `POST /api/gemini/parse-roster`                             | `POST /api/ai/parse-roster` (renamed, OpenAI-compat)   |
| **WS** `REGISTER_SOCKET`                                    | `POST /api/matchmaking/register` (returns session token)|
| **WS** `JOIN_MATCHMAKING`                                   | `POST /api/matchmaking/join` + SSE `GET /api/matchmaking/stream` |
| **WS** `LEAVE_MATCHMAKING`                                  | `POST /api/matchmaking/leave`                          |
| **WS** `CREATE_PRIVATE_ROOM`                                | `POST /api/private-room` (returns `{code}`)            |
| **WS** `JOIN_PRIVATE_ROOM`                                  | `POST /api/private-room/join` (body: `{code}`)         |
| **WS** `SEND_INVITATION`                                    | `POST /api/match/invite` (body: `{targetUserId, gameId, code}`) |
| **WS** `MAKE_MOVE`                                          | `POST /api/match/:id/move`                             |
| **WS** `FORFEIT`                                            | `POST /api/match/:id/forfeit`                          |
| **WS** `SPECTATE_MATCH`                                     | `GET  /api/match/:id/stream` (SSE)                     |
| `GET  /api/online-users`                                    | **Removed** (no global presence; per-match SSE only)  |

### 3.3 SSE endpoints (replace WebSocket)

All SSE endpoints return `Content-Type: text/event-stream`. Client opens `EventSource`; server pushes events when state changes. Client closes stream on unmount.

- **`GET /api/matchmaking/stream?gameId=...&userId=...`**
  - Server keeps an in-memory `Map<userId, Set<{controller: ReadableStreamDefaultController, lastPingAt}>>` (set supports multiple tabs per user).
  - When another user joins the same `gameId` matchmaking queue, server creates a `matchId`, writes match record to D1, then pushes `event: matched\ndata: {matchId, opponentId}\n\n` to every controller in both users' sets and closes them.
  - 30s heartbeat ping to keep connection alive (Cloudflare idle timeout = 100s).

- **`GET /api/match/:id/stream?userId=...&since=<ts>`**
  - On connect: send current snapshot, then stream subsequent moves.
  - Server compares `lastSeenMoveTs` from D1 vs `since`; only pushes deltas.
  - Heartbeat every 30s.

- **`GET /api/match/:id/stream` (spectator)** — same as above, read-only.

### 3.4 Drizzle / D1

`worker/src/db.ts`:

```ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Bindings = { DB: D1Database; CORS_ORIGIN: string; OPENAI_API_KEY: string; OPENAI_MODEL: string; OPENAI_BASE_URL?: string; APP_URL: string };

export const createDb = (env: Bindings) => drizzle(env.DB, { schema });
```

`worker/migrations/0001_initial.sql` = the SQL body of `server/db.ts#initDb` (verbatim copy, no SQLite-specific syntax like `AUTOINCREMENT` since D1 doesn't need it).

`wrangler.toml`:

```toml
name = "gametuoitho-api"
main = "src/index.ts"
compatibility_date = "2026-07-01"

[[d1_databases]]
binding = "DB"
database_name = "gametuoitho-db"
database_id = "<set-after-wrangler-d1-create>"
migrations_dir = "migrations"

[vars]
CORS_ORIGIN = "https://gametuoitho.space"
APP_URL = "https://gametuoitho.space"
```

Secrets (set with `wrangler secret put`):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (e.g. `gpt-4o-mini`)

### 3.5 AI route (OpenAI-compatible)

`worker/src/lib/ai.ts` mirrors the existing pattern but calls `https://api.openai.com/v1/chat/completions` (or `OPENAI_BASE_URL` if set) with:

- `tools: [{ type: 'function', function: { name, parameters: <jsonSchema> } }]`
- `tool_choice: { type: 'function', function: { name } }`
- Fallback: `response_format: { type: 'json_object' }` for providers that ignore `tool_choice`.
- Parse: prefer `choices[0].message.tool_calls[0].function.arguments`; fall back to `choices[0].message.content`.

Vietnamese system prompt preserved verbatim.

## 4. Frontend Changes

### 4.1 New module: `src/lib/api.ts`

Replaces direct fetch calls and auto-attaches `x-user-id`. The userId source is whatever the existing app uses today (currently read from `localStorage` after login; if a different store is used, the helper reads from there):

```ts
const BASE = import.meta.env.VITE_API_BASE as string;
function currentUserId(): string | null {
  // Mirrors whatever the current app uses (localStorage / zustand / context).
  // Today: localStorage.getItem('userId'). If app switches store later, change only here.
  return localStorage.getItem('userId');
}

export async function api(path: string, init: RequestInit = {}) {
  const userId = currentUserId();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (userId) headers.set('x-user-id', userId);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}
```

`bilacFetch` in current code is rewritten as a thin wrapper around `api()` that adds `x-tournament-id` + `x-tournament-code`.

### 4.2 Replaced: WebSocket hooks

- **`src/hooks/useMatchmaking.ts`** (new): `useMatchmaking(gameId)` opens `EventSource('/api/matchmaking/stream?gameId=...&userId=...')`, returns `{ status, matchId, opponentId }`. On unmount, calls `POST /api/matchmaking/leave` and closes the source.

- **`src/hooks/useMatchStream.ts`** (new): `useMatchStream(matchId)` opens SSE for game state. Returns `{ state, moves, turn, sendMove, forfeit }`. Internally:
  - Tracks `lastSeenMoveTs`.
  - `sendMove(move)` posts to `/api/match/:id/move` (optimistic update locally, reconciled on SSE event).
  - `forfeit()` posts to `/api/match/:id/forfeit`.

### 4.3 Removed

- `src/lib/socket.ts` (or wherever WebSocket client lives) — deleted.
- `ws.onmessage` handlers in any component — replaced with hook callbacks.
- Direct `WebSocket` usage — replaced with `EventSource`.

### 4.4 Env handling

- `VITE_API_BASE` is build-time only (Vite convention).
- Local dev: `VITE_API_BASE=http://localhost:8787`.
- Production: `VITE_API_BASE=https://api.gametuoitho.space`.
- Pages dashboard env var (Production + Preview): same value.
- `.env.example` updated to list both vars.

## 5. Repo Layout

```
gametuoitho/
├── src/                # Frontend (existing, untouched structure)
├── server/             # Legacy Express + better-sqlite3 (still works for local dev)
├── worker/             # NEW: Cloudflare Worker
├── public/             # existing static assets
├── vite.config.ts      # existing
├── wrangler.toml       # NEW (in worker/ for Worker config; root for Pages Pages is configured in dashboard)
├── package.json        # new scripts: dev:worker, deploy:worker, db:migrate:local
└── tsconfig.json       # existing
```

## 6. Local Development

Two dev modes, both work:

| Mode | Command | Frontend | Backend | DB |
|------|---------|----------|---------|-----|
| Legacy | `npm run dev` | Vite | Express + WS | better-sqlite3 (database.db) |
| Production-like | `npm run dev:worker` | Vite (`VITE_API_BASE=http://localhost:8787`) | `wrangler dev` | D1 local (Miniflare SQLite at `.wrangler/state/d1/`) |

`npm run dev:worker` script:

```json
"dev:worker": "concurrently -k -n vite,worker -c blue,green \"vite\" \"wrangler dev --local --port 8787\""
```

`npm run db:migrate:local`:

```json
"db:migrate:local": "wrangler d1 migrations apply gametuoitho-db --local"
```

## 7. Production Deploy

### 7.1 One-time setup

1. Create D1 DB: `wrangler d1 create gametuoitho-db` → paste `database_id` into `worker/wrangler.toml`.
2. Apply migrations: `wrangler d1 migrations apply gametuoitho-db --remote`.
3. Set Worker secrets: `wrangler secret put OPENAI_API_KEY`, `wrangler secret put OPENAI_MODEL`.
4. In Cloudflare dashboard:
   - Pages project: connect git repo, build cmd `npm run build`, output `dist/`, env `VITE_API_BASE=https://api.gametuoitho.space`.
   - Worker: deploy via `wrangler deploy` from `worker/` directory.
   - DNS: `gametuoitho.space` → Pages, `api.gametuoitho.space` → Worker (both proxied).
   - SSL: Cloudflare auto-issues.

### 7.2 Ongoing deploy

- **Frontend**: push to `main` → Pages auto-builds + deploys (with preview URL per PR).
- **Backend**: `cd worker && npm run deploy` (`wrangler deploy`).

## 8. Testing

### 8.1 Pre-commit (existing gates still apply)

- `npm run lint` (TypeScript strict).
- Curl smoke test of changed routes.

### 8.2 Worker-specific tests

- `worker/src/lib/sse.test.ts`: vitest unit test for SSE helper (formats event string correctly).
- `worker/src/lib/ai.test.ts`: vitest unit test that AI helper parses `tool_calls[0].function.arguments` and falls back to `content`.
- Manual smoke after deploy:
  - `curl https://api.gametuoitho.space/api/health` → `{ ok: true }`.
  - Register flow + login.
  - Create match → both clients receive SSE `matched` event → move exchange → forfeit.
  - Bilac create + add players + create match + update score.

## 9. Risks & Mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Better-sqlite3 doesn't run on Workers | Switch Drizzle driver to `drizzle-orm/d1`; only D1 calls in Worker. Legacy `server/db.ts` untouched. |
| 2 | WebSocket not available | Replaced with SSE (Workers native streaming). One client per match via `EventSource`. |
| 3 | Worker CPU limit (10ms free) blocks long-poll | Use SSE streaming response with `waitUntil` to free the request; never block. |
| 4 | D1 read latency for realtime | Acceptable for turn-based games (≤100ms p99). Optimize with batched reads if measured slow. |
| 5 | OTP email goes to server console (currently) | In dev: keep console log. In prod: log to a D1 `audit_log` table for debug access. (Real email service is a later roadmap item.) |
| 6 | `migrateFromJson` skipped → users re-register | Document in README. Acceptable per spec decision. |
| 7 | `bilacFetch` semantics lost if wrapper not careful | Tests cover both auth + bilac headers. Manual e2e check. |
| 8 | Cloudflare 100s idle timeout on SSE | 30s heartbeat ping in SSE helper to keep stream alive. |
| 9 | Frontend `import.meta.env.VITE_API_BASE` baked at build time | Document: rebuild required to change API URL. Acceptable. |
| 10 | `crypto.createHash('sha256')` works on Workers runtime | Yes — Web Crypto API exposed as `crypto.subtle.digest` (async). Use an `async sha256Hex(input)` helper; all `hashPassword` callers in Worker routes become `await`-prefixed. Legacy `server/db.ts` keeps the sync Node version. |

## 10. Out of Scope (explicit)

- bcrypt + per-user salt (already in roadmap, deferred).
- Real email service for OTP (roadmap).
- Domain move from current host to Cloudflare DNS (separate ops task).
- Custom auth (Google SSO stays as today).
- Migration of any pre-existing production data.

## 11. Rollout Plan

1. Land worker/ scaffold + wrangler.toml + migrations.
2. Add `dev:worker` script; smoke test locally.
3. Migrate routes one module at a time (auth → profile → leaderboard → tournaments → challenges → replays → bilac → leagues → matchmaking/match SSE → AI).
4. Update frontend hooks incrementally; keep `npm run dev` (legacy) working until frontend cutover.
5. Cut frontend to `VITE_API_BASE=...` pointing at deployed Worker.
6. Remove legacy WebSocket client files. **Keep `server/`** — it remains the offline dev path (`npm run dev`) for users without Cloudflare access or for testing changes locally.
7. Update README + CLAUDE.md with new deploy commands.