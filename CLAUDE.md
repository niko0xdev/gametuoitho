
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
