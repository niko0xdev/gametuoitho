# PR body — gametuoitho.space

> Copy this body into the PR description on GitHub when you push.

## Summary

Six independent changes that together harden the Bi Lắc arena and add AI-assisted data entry across the app. Designed to be merged as a single coherent release:

1. **Switch LLM provider from Gemini to OpenAI-compatible**. One endpoint for roster parsing; NewTool Structured Outputs via `tool_choice` with `response_format: json_object` fallback for non-conforming providers (older Ollama, etc.).
2. **Environment file support**. `server.ts` now loads `.env.local` (was previously ignored — `tsx` does not auto-load it). Updated `.env.example` and `.env.local` schemas.
3. **AI bulk-add players** into Bi Lắc tournaments. New `/api/ai/parse-players` endpoint; new "Thêm nhanh bằng AI" panel in the BiLacArena right-column with two-step UX (preview chips → confirm).
4. **AI summary → events prefill in futsal MyLeague matches**. New `/api/ai/parse-events` endpoint accepting `{summary, homeTeamName, awayTeamName, homePlayers[], awayPlayers[]}`. Frontend panel previews events as chips; **never auto-saves** (hard convention).
5. **Bi Lắc permission gate**: `bilac_tournament_members` table + `requireLoggedIn` / `requireBiLacMember` middlewares. Login is mandatory to even open the Bi Lắc portal. Owner is auto-joined as `role=owner` at tournament creation. All write actions (player add/remove, match create/update/delete) now require membership. Read-only endpoints unchanged.
6. **Sidebar width fix in MyLeagueView**: `grid-cols-3` → `grid-cols-[1fr_360px]` (sidebar from ≈ 1/3 ≈ 280 px to fixed 360 px on desktop).

## Repo docs added

- `CLAUDE.md` — runtime codegen conventions + roadmap + gotchas
- `AGENTS.md` — agent contract (what AI may do here, hard rules, soft rules, workflow)
- `.claude/skills/` — reusable recipes:
  - `run-app.md` — launch, smoke-test, clean-restart
  - `ai-routes.md` — template for adding new AI endpoints
  - `db-migrations.md` — recipe for new tables
  - `port-conflict.md` — debug `EADDRINUSE`

## How to verify

```bash
npm install
npm run lint                            # must return 0 errors
npm run dev                             # listens on :3000

# Auth gate
curl -s -X POST http://localhost:3000/api/bilac/tournaments \
  -H "Content-Type: application/json" -d '{"name":"x","code":"1"}'
# -> {"error":"Vui lòng đăng nhập để tiếp tục!"}  (HTTP 401)

# AI bulk-add
curl -s -X POST http://localhost:3000/api/ai/parse-players \
  -H "Content-Type: application/json" \
  -d '{"text":"1. Đội UTE: A,B\n2. Team SGU: C,D (lặp A)"}'
# -> {"names":["A","B","C","D"]}

# AI events
curl -s -X POST http://localhost:3000/api/ai/parse-events \
  -H "Content-Type: application/json" \
  -d '{"summary":"Phút 12 Hoàng ghi bàn. Phút 30 Duy thẻ vàng.","homeTeamName":"HN","awayTeamName":"SG","homePlayers":["Hoàng","Duy"],"awayPlayers":["Long"]}'
# -> {"events":[{"type":"goal","teamSide":"home","playerName":"Hoàng","minute":12,...}]}
```

Open `http://localhost:3000/`, log in, navigate to **Đấu Trường Bi Lắc** to see the new gate and AI panel. Navigate to **Giải Thể Thao → futsal → open a match** for the AI events panel.

## DB schema changes

```sql
-- new table
CREATE TABLE bilac_tournament_members (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX idx_bilac_members_tournament ON bilac_tournament_members(tournament_id);
CREATE INDEX idx_bilac_members_user ON bilac_tournament_members(user_id);

-- new column (idempotent due to ALTER TABLE behavior on better-sqlite3)
ALTER TABLE bilac_tournaments ADD COLUMN owner_user_id TEXT;
```

`initDb()` runs at server boot — no separate migration step needed.

## Risk / breaking changes

- `POST /api/bilac/tournaments` now **requires `x-user-id` header** (401 otherwise). Previously anonymous. Frontend updated to inject via `bilacFetch`.
- Bi Lắc portal now **requires login**. Users without an account see a login-required card instead of the portal.
- All mutations inside a tournament now check membership. Anyone with a valid tournament code but no membership gets 403.
- Removed route: `/api/gemini/parse-roster` replaced by `/api/ai/parse-roster`. (The MyLeagueView was updated.)

## Out of scope (not in this PR)

- Replacing SHA-256 password hashing with bcrypt.
- Member-invite-by-username flow (planned; flagged in `CLAUDE.md` roadmap).
- Test suite (currently smoke tests via curl).

## Checklist

- [x] `tsc --noEmit` returns 0 errors.
- [x] All new routes tested with `curl`.
- [x] Frontend gate tested via UI flow.
- [x] `database.db` is gitignored (no DB files in diff).
- [x] No real `.env.local` keys included in diff.
