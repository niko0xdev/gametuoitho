# gametuoitho.space — Claude Code Rules

## Project Snapshot

- **Stack**: React 19 + Vite 6 + Tailwind 4 (frontend) · Express + WebSocket + tsx (backend) · SQLite (via better-sqlite3 + drizzle-orm).
- **Entry**: `server.ts` at repo root. Single command serves both API and SPA (`npm run dev`).
- **Default port**: `3000` (override via `PORT` env var). Server boots a Vite dev server in middleware mode.
- **DB**: SQLite file auto-created at `database.db` on first boot. Tables: `users`, `profiles`, `matches`, `tournaments`, `daily_challenges`, `bilac_players`, `bilac_matches`, `bilac_tournaments`, `bilac_tournament_members`, `my_leagues`, `league_permissions`.
- **Seed**: Migration from legacy `database.json` runs on boot via `migrateFromJson()` in `server/db.ts`. Don't delete that JSON — keep as first-run seed.
- **LLM**: All AI routes call an OpenAI-compatible endpoint. Required env: `OPENAI_API_KEY`, `OPENAI_MODEL`. Optional `OPENAI_BASE_URL` (use for Ollama/Groq/Together). Default base URL is `https://api.openai.com/v1`.

## Runtime Conventions

### Commands
- `npm run dev` — Start full app (server + Vite client) on port 3000.
- `npm run lint` — `tsc --noEmit` strict type-check. **Always run before committing.**
- `npm run build` — Production bundle to `dist/`.
- `npm run start` — Run built server (`dist/server.cjs`) on the same port.
- `npm run clean` — Remove `dist/` and `database.json`. **Do not run unless intentionally nuking state.**

### Env Loading
- `server.ts` calls `dotenv.config({ path: '.env.local' })` then `dotenv.config()` fallback to `.env`. Both must keep existing keys.
- Keep `.env.example` in sync with all documented vars (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `APP_URL`).
- **Never** commit real keys. `.env.local` is gitignored.

### Folder Layout
- `server.ts` — Express + Vite entrypoint at root.
- `server/` — All backend code (db, schema, room/tournament/daily manager).
- `src/` — All frontend code (App.tsx + components/ + games/ + types.ts).
- `database.db` — SQLite file (gitignored).
- `database.json` — Legacy seed data (gitignored).

### API Contract Patterns
- All routes live in `server.ts`. New routes go near related ones.
- Authentication headers convention:
  - `x-user-id` — required for any protected route (gate by `requireLoggedIn`).
  - `x-tournament-id` + `x-tournament-code` — required by `checkBiLacTournamentAccess` middleware.
  - Combine with `requireBiLacMember` for write actions on a specific tournament.
- Body is JSON. Validate required fields, then business logic, then DB write.
- Return shape: errors use `{ error: 'message tiếng Việt' }`. Successes use `{ success: true, ... }` or raw data.

### LLM Route Pattern
- Routes under `/api/ai/*` accept a single text or two-sided payload.
- Use **Structured Outputs** via `tools: [{function: {name, parameters: <json-schema>}}]` + `tool_choice`.
- Add `response_format: { type: 'json_object' }` as a fallback for providers that ignore tool_choice.
- Two-step parse: prefer `msg.tool_calls[0].function.arguments`; fall back to `msg.content` JSON.
- Always write a **Vietnamese** error fallback.
- Always include the system prompt in Vietnamese; refuse to lowercase.

### Frontend Patterns
- Components in `src/components/` use Tailwind utility classes only (no CSS modules).
- Use `lucide-react` for icons. Add new imports to the existing grouped import block.
- Bi Lắc arena routes all API calls through `bilacFetch(url, options)` which auto-attaches `x-tournament-id`, `x-tournament-code`, and (if logged in) `x-user-id`.
- Pre-existing patterns to keep: `playBeep` for UI feedback, `playRetroBeep` for header/global, `speakText` for VI speech synthesis.

## Roadmap (active)

### Implemented
- [x] SQLite as primary store.
- [x] OpenAI-compatible LLM gateway with structured outputs.
- [x] AI bulk-add players into Bi Lắc tournament (`/api/ai/parse-players`).
- [x] AI summary → events prefill in futsal MyLeague matches (`/api/ai/parse-events`). **Does NOT auto-save**; user reviews then clicks Save.
- [x] Bi Lắc permission gate: require login; mutations require tournament membership. Auto-join owner on create.

### Planned
- [ ] Bi Lắc invite members by `username`.
- [ ] Replace SHA-256 password hashing with bcrypt + per-user salt.
- [ ] Move `database.db` to a configurable path (`DB_FILE` env).
- [ ] Migration to vitest for backend tests (currently smoke via curl).

## Code Quality Gates

Before every commit:
1. `npm run lint` returns 0 errors. No `any` in new server-side middleware unless the existing pattern requires it.
2. Smoke-test the modified routes with `curl` (see `.claude/skills/run-app.md`).
3. New tables require a corresponding `CREATE TABLE IF NOT EXISTS` in `server/db.ts#initDb` AND the matching drizzle schema in `server/schema.ts`.

Don't commit:
- `database.db` (gitignored).
- `dist/` build output.
- Any real `.env.local` keys.

## Known Gotchas

- **Port collision**: If `tsx server.ts` was previously killed ungracefully, port 3000 may still be in `TIME_WAIT`. Run `lsof -ti:3000 | xargs -r kill -9` before `npm run dev`.
- **Env reload**: `tsx` does NOT auto-reload `.env.local`. After changing env vars, restart the dev server.
- **Vite HMR vs server HMR**: Frontend code (src/**) auto-reloads. Backend changes (server.ts, server/**) require a full server restart because `tsx` doesn't watch.
- **dotenv log noise**: `dotenv@17` prints banner lines on each call. This is informational, not an error.
- **OpenAI tool_choice fallback**: Some local providers (older Ollama) ignore `tool_choice`. The handler already parses both `msg.tool_calls` and `msg.content` — keep both code paths.

## Cloudflare deploy

- Frontend: Cloudflare Pages, custom domain `gametuoitho.space`. Git auto-deploy.
- Backend: Cloudflare Worker, custom domain `api.gametuoitho.space`. Code in `worker/`.
- Database: Cloudflare D1 (SQLite-compatible), bound to Worker. `worker/migrations/` holds schema.
- Realtime: SSE (Workers native streaming), not WebSocket. See `worker/src/routes/matchmaking.ts` + `match.ts`.
- AI: OpenAI-compatible via `OPENAI_API_KEY` / `OPENAI_MODEL` Worker secrets.
- Local D1 lives at `.wrangler/state/v3/d1/` (gitignored).
- Local dev modes:
  - `npm run dev` — legacy Express + better-sqlite3 (offline).
  - `npm run dev:worker` — Vite frontend + wrangler dev with local D1 (production-like).
- Migrate data manually if moving from SQLite to D1 — `migrateFromJson` is not ported.

## Per-isolate caveat (CRITICAL)

Workers routes requests across many isolates. The matchmaking queue + SSE controller map live in a single isolate's memory. Two peers landing on different isolates will not see each other's state — matchmaking join may match locally but the opponent's SSE stream (on a different isolate) will never receive the `matched` event. Free-tier acceptable with **client reconnect + polling fallback** (see `src/hooks/useMatchmaking.ts`). Production-grade fix: migrate matchmaking/match broadcast to **Durable Objects**.
