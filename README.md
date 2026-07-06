<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c72337ba-d869-431b-9103-3776cddb45ac

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in [.env.local](.env.local). Optionally set `OPENAI_BASE_URL` to use any OpenAI-compatible provider (Ollama, Groq, Together, OpenRouter, ...).
3. Run the app:
   `npm run dev`

---

## Cloudflare deploy (free tier)

Architecture: **Pages** (frontend, git auto-deploy) + **Workers** (API) + **D1** (DB) + **SSE** (realtime, no WebSocket).

### First-time setup

```bash
# 1. Create D1
cd worker
npx wrangler d1 create gametuoitho-db
# paste the database_id into wrangler.toml (replace REPLACE_AFTER_wrangler_d1_create)

# 2. Apply migrations
npx wrangler d1 migrations apply gametuoitho-db --remote

# 3. Set secrets (OpenAI-compatible endpoint)
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL    # e.g. gpt-4o-mini

# 4. Deploy worker
npx wrangler deploy

# 5. Cloudflare dashboard → Pages → Connect to Git
#    Build command: npm run build
#    Output: dist
#    Env var: VITE_API_BASE=https://api.gametuoitho.space
```

### Local dev

- `npm run dev` — legacy Express + SQLite (offline mode, includes WebSocket).
- `npm run dev:worker` — Vite + wrangler dev with local D1.
- `npm run test:worker` — Worker unit tests (SSE + AI helpers).

### Notes

- D1 starts empty — no legacy `database.json` migration.
- WebSocket is replaced with Server-Sent Events. See `src/hooks/useMatchmaking.ts` and `useMatchStream.ts`.
- AI calls use any OpenAI-compatible endpoint (`OPENAI_BASE_URL` env var for Ollama/Groq/Together).
