---
name: deploy-frontend
description: Build and deploy the gametuoitho frontend (React + Vite SPA) to Cloudflare Pages. Use whenever the user asks to deploy the frontend, ship/push UI changes to prod, publish the site, put changes on gametuoitho.space, or wonders why a merged frontend change isn't live. Critical: the gametuoitho Pages project is Direct Upload (NOT git-auto-deploy), so merging a PR does nothing — you must build + upload manually.
---

# Deploy Frontend → Cloudflare Pages

## Why this skill exists
The `gametuoitho` Pages project is **Direct Upload** (Git Provider: None). Pushing or merging to `main` does **not** deploy the frontend — nothing changes on `gametuoitho.space` until you build and upload. The most common confusion on this project is *"I merged the PR, why isn't my change live?"* → because Pages isn't git-connected. Always build + deploy manually.

## Commands (run from repo root)
```bash
npm run build:fe
npx wrangler@3.114.17 pages deploy dist --project-name gametuoitho --branch main
```
- `npm run build:fe` runs `vite build` → outputs to `dist/`.
- `--branch main` targets the **production** deployment (serves gametuoitho.space).

## Verify it went live
```bash
curl -s "https://gametuoitho.space/?cb=$RANDOM" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1
```
Compare the printed hash to the file in `dist/assets/`. They must match → prod is serving the new bundle. (Cache-bust `?cb=$RANDOM` so you don't see a CDN-cached HTML pointer.)

## Gotchas
- **Not git-auto-deploy.** Always run build + `pages deploy` after frontend changes. Merging a PR is never enough for the SPA on this project.
- **Build frontend only.** Use `npm run build:fe` (just `vite build`). Do NOT use `npm run build` — that also bundles the legacy Express `server.ts` which Pages doesn't need.
- **Vite env vars are build-time.** `VITE_*` vars (e.g. `VITE_TURNSTILE_SITEKEY`, `VITE_GOOGLE_CLIENT_ID`) are inlined into the JS at build. Changing one requires a rebuild + redeploy — Pages won't pick it up otherwise. They are NOT runtime-configurable.
- **Browser cache.** After deploying, a user may still see the old bundle until they hard-refresh / open incognito. The hash in `/assets/index-<hash>.js` changing is the proof of a new deploy.
- **Wrangler pin.** `npx wrangler@3.114.17` is pinned because unpinned `npx wrangler` (4.x) sometimes misreads the nearby `worker/wrangler.toml` and aborts. Safe to pin.
- **Backend is separate.** This skill does NOT touch the Worker API (`/api/*`). For API/server changes use the `deploy-worker` skill.

## Architecture (so you pick the right skill)
- **Frontend SPA** → Cloudflare Pages, apex `gametuoitho.space` and `www.` (everything that isn't `/api`). ← this skill.
- **Worker API** → Cloudflare Worker, serves only `gametuoitho.space/api/*`. → `deploy-worker` skill.
