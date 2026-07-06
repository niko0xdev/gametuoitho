---
name: port-conflict
description: Debug "address already in use" / "EADDRINUSE" on port 3000 when running gametuoitho.space. Use when `npm run dev` fails to start.
---

# Port 3000 is stuck

## Symptom

```
Error: listen EADDRINUSE: address already in use :::3000
```

or "port 3000 is already in use" — despite no other terminal showing a `tsx server.ts` process.

## Most-common cause

An earlier `npm run dev` session was killed (the foreground tool's harness or `Ctrl+C`) but the child `node`/`tsx` process kept the socket in `TIME_WAIT` for ~30 seconds.

## Quick fix

```bash
pkill -f "tsx server.ts" 2>/dev/null
sleep 1
lsof -ti:3000 | xargs -r kill -9
sleep 1
lsof -ti:3000 || echo "port 3000 free"
```

Then `npm run dev` again.

## If port 3000 is occupied by something else

If `lsof -ti:3000` returns a non-`tsx` PID, it's likely a different app. Override the port:

```bash
PORT=4000 npm run dev
```

The env override works for both Vite middleware and the explicit `server.listen(PORT, ...)` call.

## Long-term guard

The dev server uses `listen(PORT, '0.0.0.0', ...)` — binding to all interfaces. If you need multiple instances (rare), use `PORT=4000 npm run dev`.

## Verify it's actually your server

```bash
curl -s http://localhost:3000/ | head -c 200
# expected: <!doctype html>... Vite dev HTML
```

If you see HTML from a *different* app, the wrong process holds 3000 — kill by PID.
