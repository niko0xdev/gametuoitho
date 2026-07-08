---
name: deploy-worker
description: Build and deploy the gametuoitho backend (Cloudflare Worker API on Hono, D1, Durable Objects) to Cloudflare. Use whenever the user asks to deploy the API, backend, worker, server, ship /api changes to prod, push backend to gametuoitho.space, or apply D1 database migrations. Critical gotcha: pin wrangler to 3.114.17 — unpinned npx wrangler (4.x) misreads worker/wrangler.toml and deploy fails with "Missing entry-point".
---

# Deploy Worker (API) → Cloudflare

## Commands (run from `worker/`)
```bash
cd worker && npx wrangler@3.114.17 deploy
```
This uploads + deploys `gametuoitho-api` to `gametuoitho.space/api/*` (and `www.*/api/*`).

## When the DB schema changed: migrate D1 FIRST
If `worker/migrations/` has a new `.sql` file (new table/column), apply it to remote D1 **before** deploying:
```bash
cd worker && npx wrangler@3.114.17 d1 migrations apply gametuoitho-db --remote
```
Order matters: **migrate → deploy**. Deploying code that queries a not-yet-migrated column causes 500s.

## Secrets (one-time, not part of every deploy)
Set with stdin so no trailing newline sneaks in:
```bash
cd worker && printf '%s' '<value>' | npx wrangler@3.114.17 secret put <NAME>
```
Current secrets: `OPENAI_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET`. List existing: `npx wrangler@3.114.17 secret list`. Secrets take effect immediately — no redeploy needed after `secret put`.

## Verify
```bash
curl -s https://gametuoitho.space/api/health        # health
npx wrangler@3.114.17 tail gametuoitho-api --format pretty   # live logs
```

## Gotchas (each one bit us once)
- **Pin wrangler to 3.114.17.** Unpinned `npx wrangler` fetches 4.x, which misreads `worker/wrangler.toml`: it warns "looks like a Pages project" and fails with *"Missing entry-point to Worker script"*. Always `npx wrangler@3.114.17`. (Long-term: migrating to `wrangler.jsonc` + wrangler 4 may fix this, but pin for now.)
- **cwd must be `worker/`.** `wrangler deploy` reads `worker/wrangler.toml`. The Bash tool's working directory persists between calls — if you see *"Required Worker name missing"* or *"no such file: worker"*, check `pwd` and `cd worker` first.
- **`wrangler.toml [vars]` changes need a redeploy.** Non-secret config (e.g. `OTP_DAILY_CAP`, `MAIL_FROM_EMAIL`) is baked in at deploy time. Secrets (via `secret put`) are live immediately.
- **D1 free-tier write budget.** ~2 writes/match (create + end). Do NOT add per-move D1 writes (see CLAUDE.md realtime notes) — would blow the daily quota.
- **Frontend is separate.** This skill does NOT update the SPA. For UI changes use the `deploy-frontend` skill.

## Architecture
- Worker name `gametuoitho-api`, entry `worker/src/index.ts` (Hono app).
- D1 `gametuoitho-db` (database_id in `worker/wrangler.toml`); migrations in `worker/migrations/`.
- Durable Objects: `MATCH_DO`, `MATCHMAKING_DO`, `GAMESERVER_DO` (hibernatable WebSockets).
- Rate limit binding `RATE_LIMITER` (10 req/60s per IP on auth endpoints).
