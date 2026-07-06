---
name: run-app
description: How to launch gametuoitho.space locally, smoke-test endpoints, and clean-restart when port 3000 is occupied.
---

# Run & verify the app

## Launch

```bash
npm run dev
```

- Boots Express + Vite dev middleware on `:3000` (override via `PORT` env).
- Auto-seeds SQLite from `database.json` if DB is fresh.
- Reads `OPENAI_API_KEY`, `OPENAI_MODEL` from `.env.local`.

## Smoke-test core routes

```bash
# Home
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/

# Register/login (use unique username each run)
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"smk_'$RANDOM'","password":"P@ss1234","email":"smk@test.com","displayName":"Smk"}'

# Bi Lắc list (no auth needed)
curl -s http://localhost:3000/api/bilac/tournaments | head -c 300

# Bi Lắc create (requires x-user-id)
curl -s -X POST http://localhost:3000/api/bilac/tournaments \
  -H "Content-Type: application/json" -H "x-user-id: <USER_ID>" \
  -d '{"name":"Smoke Test","code":"abcd1234"}'

# AI roster
curl -s -X POST http://localhost:3000/api/ai/parse-roster \
  -H "Content-Type: application/json" \
  -d '{"summary":"Đội A: cầu thủ X,Y,Z"}'
```

Expected: HTTP 200 for happy paths, 400 for missing fields, 401 for missing `x-user-id`, 403 for wrong tournament code.

## Type-check

```bash
npm run lint   # tsc --noEmit
```

Runs in ~1–2 s. Must return exit 0 before declaring done.

## When port 3000 is stuck

```bash
pkill -f "tsx server.ts" 2>/dev/null
sleep 1
lsof -ti:3000 | xargs -r kill -9
```

Then `npm run dev` again.

## When env doesn't take effect

`tsx` does not auto-reload `.env.local`. After changing env vars:

```bash
pkill -f "tsx server.ts" && npm run dev
```

## Build prod

```bash
npm run build   # vite build + esbuild server.ts -> dist/
npm run start   # node dist/server.cjs
```
