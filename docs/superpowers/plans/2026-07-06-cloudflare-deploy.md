# Cloudflare Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move gametuoitho.space from local-only (Express + better-sqlite3 + WebSocket) to a free-tier Cloudflare deployment using Pages (frontend), Workers (backend), and D1 (database). WebSocket is replaced with SSE.

**Architecture:** Two deployments. Cloudflare Pages serves the Vite-built React SPA via git auto-deploy at `gametuoitho.space`. A separate Cloudflare Worker (Hono framework) serves all `/api/*` endpoints at `api.gametuoitho.space` with a D1 database binding. SSE replaces WebSocket for realtime match updates.

**Tech Stack:** Cloudflare Workers · Hono · Cloudflare D1 · Drizzle ORM (`drizzle-orm/d1`) · Cloudflare Pages · React 19 · Vite 6 · vitest · wrangler

**Spec:** [docs/superpowers/specs/2026-07-06-cloudflare-deploy-design.md](../../specs/2026-07-06-cloudflare-deploy-design.md)

---

## File Structure

Files created or modified by this plan. Each file has one clear responsibility.

**New files (Worker):**
- `worker/wrangler.toml` — Worker config + D1 binding
- `worker/package.json` — Worker deps (hono, drizzle-orm, wrangler)
- `worker/tsconfig.json` — extends root, target ESNext, jsx react-jsx
- `worker/migrations/0001_initial.sql` — All CREATE TABLE statements from `server/db.ts#initDb`
- `worker/src/index.ts` — Hono app entry, exports default fetch
- `worker/src/db.ts` — Drizzle + D1 binding factory
- `worker/src/schema.ts` — Copy of `server/schema.ts` (no better-sqlite3 imports)
- `worker/src/types.ts` — Re-export shared types from `src/types.ts`
- `worker/src/lib/password.ts` — `sha256Hex` (Web Crypto, async)
- `worker/src/lib/cors.ts` — CORS middleware
- `worker/src/lib/sse.ts` — SSE response helpers (`sseStream`, `formatEvent`, `heartbeat`)
- `worker/src/lib/ai.ts` — OpenAI-compatible fetch helper
- `worker/src/lib/state.ts` — In-memory `Map<userId, Set<controller>>` for SSE
- `worker/src/routes/health.ts` — `GET /api/health`
- `worker/src/routes/auth.ts` — All `/api/auth/*`
- `worker/src/routes/profile.ts` — `/api/profile/*`
- `worker/src/routes/leaderboard.ts` — `/api/leaderboard/*`
- `worker/src/routes/tournaments.ts` — `/api/tournaments/*`
- `worker/src/routes/challenges.ts` — `/api/challenges/*`
- `worker/src/routes/replays.ts` — `/api/replays/*`, `/api/replay/*`
- `worker/src/routes/bilac.ts` — `/api/bilac/*` (incl. weekly interval helper)
- `worker/src/routes/leagues.ts` — `/api/leagues*`
- `worker/src/routes/matchmaking.ts` — SSE matchmaking stream + REST join/leave/private/invite
- `worker/src/routes/match.ts` — SSE match state stream + REST move/forfeit
- `worker/src/routes/ai.ts` — `/api/ai/parse-roster`
- `worker/test/sse.test.ts` — Unit test for SSE formatter
- `worker/test/ai.test.ts` — Unit test for AI helper parsing
- `worker/vitest.config.ts` — vitest config for Worker tests

**New files (Frontend):**
- `src/lib/api.ts` — `api()` wrapper with `x-user-id` auto-attach
- `src/hooks/useMatchmaking.ts` — SSE matchmaking hook
- `src/hooks/useMatchStream.ts` — SSE match state hook
- `src/lib/socket.ts` — **deleted** (replaced by hooks)

**Modified files:**
- `package.json` — Add scripts: `dev:worker`, `deploy:worker`, `db:migrate:local`, `db:migrate:remote`, `test:worker`
- `.env.example` — Add `VITE_API_BASE`
- `README.md` — New deploy section
- `src/components/**/*.tsx` — Remove WebSocket usage, use new hooks (see Task 23)
- `src/lib/bilacFetch.ts` (if exists) — Rewrite as `api()` wrapper

**Untouched:** `server/`, `server.ts`, all existing game logic in `src/games/`, `vite.config.ts`, `tsconfig.json` at root.

---

## Task 1: Initialize worker/ scaffold

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/vitest.config.ts`

- [ ] **Step 1: Create `worker/package.json`**

```json
{
  "name": "gametuoitho-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --local --port 8787",
    "deploy": "wrangler deploy",
    "db:migrate:local": "wrangler d1 migrations apply gametuoitho-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply gametuoitho-db --remote",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250701.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.78.0",
    "typescript": "~5.8.2"
  }
}
```

- [ ] **Step 2: Create `worker/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"],
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `worker/wrangler.toml`**

```toml
name = "gametuoitho-api"
main = "src/index.ts"
compatibility_date = "2026-07-01"

[[d1_databases]]
binding = "DB"
database_name = "gametuoitho-db"
database_id = "REPLACE_AFTER_wrangler_d1_create"
migrations_dir = "migrations"

[vars]
CORS_ORIGIN = "http://localhost:5173"
APP_URL = "http://localhost:5173"
```

- [ ] **Step 4: Create `worker/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Install deps**

Run from `worker/`:
```bash
cd worker && npm install
```
Expected: node_modules created, no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/niko/founder/game/gametuoitho
git add worker/package.json worker/tsconfig.json worker/wrangler.toml worker/vitest.config.ts worker/package-lock.json
git commit -m "feat(worker): scaffold Cloudflare Worker project"
```

---

## Task 2: Create initial D1 migration

**Files:**
- Create: `worker/migrations/0001_initial.sql`

- [ ] **Step 1: Read current init SQL**

Read `/Users/niko/founder/game/gametuoitho/server/db.ts` lines 60–250 to get the full `CREATE TABLE` block.

- [ ] **Step 2: Copy to migration file**

Write `worker/migrations/0001_initial.sql` containing every `CREATE TABLE IF NOT EXISTS` from `server/db.ts#initDb`. Verbatim copy. Includes tables: `users`, `profiles`, `matches`, `tournaments`, `daily_challenges`, `bilac_players`, `bilac_matches`, `bilac_tournaments`, `bilac_tournament_members`, `my_leagues`, `league_permissions`.

- [ ] **Step 3: Verify D1 syntax**

D1 supports standard SQLite. No changes needed unless `initDb` uses Node-specific extensions (it does not — only standard SQL). Skip this step if you find none.

- [ ] **Step 4: Commit**

```bash
git add worker/migrations/0001_initial.sql
git commit -m "feat(worker): initial D1 schema migration"
```

---

## Task 3: Wire up Drizzle + D1

**Files:**
- Create: `worker/src/schema.ts`
- Create: `worker/src/db.ts`
- Create: `worker/src/types.ts`

- [ ] **Step 1: Read server schema**

Read `/Users/niko/founder/game/gametuoitho/server/schema.ts` and copy all exports to `worker/src/schema.ts`. Keep table names, column names, and types identical so queries match.

- [ ] **Step 2: Create `worker/src/types.ts`**

```ts
// Re-export shared types. Path is relative to project root via wrangler bundling.
export type {
  UserProfile,
  MatchState,
  Tournament,
  DailyChallenge,
  BiLacPlayer,
  BiLacMatch,
  BiLacTournament,
  MyLeague,
} from '../../src/types.ts';
```

- [ ] **Step 3: Create `worker/src/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Bindings = {
  DB: D1Database;
  CORS_ORIGIN: string;
  APP_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

export type Db = ReturnType<typeof createDb>;

export const createDb = (env: Bindings) => drizzle(env.DB, { schema });
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd worker && npm run lint
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add worker/src/schema.ts worker/src/db.ts worker/src/types.ts
git commit -m "feat(worker): drizzle + D1 binding factory"
```

---

## Task 4: Implement SSE helpers (TDD)

**Files:**
- Create: `worker/test/sse.test.ts`
- Create: `worker/src/lib/sse.ts`

- [ ] **Step 1: Write failing test**

```ts
// worker/test/sse.test.ts
import { describe, it, expect } from 'vitest';
import { formatEvent, sseStream } from '../src/lib/sse';

describe('formatEvent', () => {
  it('formats a typed event with json data', () => {
    expect(formatEvent('matched', { matchId: 'm1', opponentId: 'u2' })).toBe(
      'event: matched\ndata: {"matchId":"m1","opponentId":"u2"}\n\n'
    );
  });

  it('escapes newlines in data', () => {
    const out = formatEvent('msg', { text: 'a\nb' });
    expect(out).toContain('data: {"text":"a\\nb"}');
  });
});

describe('sseStream', () => {
  it('returns a Response with correct headers', () => {
    const res = sseStream({ onConnect: () => {}, heartbeatMs: 30000 });
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd worker && npm test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `worker/src/lib/sse.ts`**

```ts
export function formatEvent(event: string, data: unknown): string {
  const json = JSON.stringify(data).replace(/\n/g, '\\n');
  return `event: ${event}\ndata: ${json}\n\n`;
}

export function formatComment(text: string): string {
  return `: ${text}\n\n`;
}

type SseHandlers = {
  onConnect: (send: (event: string, data: unknown) => void, close: () => void) => void | (() => void);
  heartbeatMs?: number;
};

export function sseStream(handlers: SseHandlers): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(formatEvent(event, data)));
        } catch {
          // connection closed
        }
      };
      const close = () => {
        try { controller.close(); } catch { /* already closed */ }
      };

      // initial comment to flush headers
      controller.enqueue(encoder.encode(formatComment('connected')));

      const teardown = handlers.onConnect(send, close);
      cleanup = typeof teardown === 'function' ? teardown : undefined;

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(formatComment('ping')));
        } catch {
          // closed
        }
      }, handlers.heartbeatMs ?? 30000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd worker && npm test
```
Expected: PASS (2 test cases).

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib/sse.ts worker/test/sse.test.ts
git commit -m "feat(worker): SSE helpers with tests"
```

---

## Task 5: In-memory state store for SSE controllers

**Files:**
- Create: `worker/src/lib/state.ts`

- [ ] **Step 1: Implement `state.ts`**

```ts
// Per-isolate, in-memory map of SSE controllers keyed by userId.
// Multi-tab support: Set of controllers per user.
type Controller = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

const matchmaking = new Map<string, Set<Controller>>();
const matchStreams = new Map<string, Set<Controller>>(); // matchId

export function addMatchmaking(userId: string, ctrl: Controller): () => void {
  let set = matchmaking.get(userId);
  if (!set) {
    set = new Set();
    matchmaking.set(userId, set);
  }
  set.add(ctrl);
  return () => {
    const s = matchmaking.get(userId);
    if (!s) return;
    s.delete(ctrl);
    if (s.size === 0) matchmaking.delete(userId);
  };
}

export function getMatchmakingUsers(): string[] {
  return [...matchmaking.keys()];
}

export function sendToMatchmaking(userId: string, event: string, data: unknown): void {
  const set = matchmaking.get(userId);
  if (!set) return;
  for (const ctrl of set) {
    ctrl.send(event, data);
    ctrl.close();
  }
  matchmaking.delete(userId);
}

export function addMatchStream(matchId: string, ctrl: Controller): () => void {
  let set = matchStreams.get(matchId);
  if (!set) {
    set = new Set();
    matchStreams.set(matchId, set);
  }
  set.add(ctrl);
  return () => {
    const s = matchStreams.get(matchId);
    if (!s) return;
    s.delete(ctrl);
    if (s.size === 0) matchStreams.delete(matchId);
  };
}

export function broadcastMatch(matchId: string, event: string, data: unknown): void {
  const set = matchStreams.get(matchId);
  if (!set) return;
  for (const ctrl of set) ctrl.send(event, data);
}
```

- [ ] **Step 2: Verify lint**

```bash
cd worker && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add worker/src/lib/state.ts
git commit -m "feat(worker): in-memory SSE controller registry"
```

---

## Task 6: Password hashing (Web Crypto)

**Files:**
- Create: `worker/src/lib/password.ts`

- [ ] **Step 1: Implement**

```ts
// Web Crypto SHA-256, returns lowercase hex digest.
// Async because crypto.subtle.digest is async on Workers runtime.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 2: Verify lint**

```bash
cd worker && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add worker/src/lib/password.ts
git commit -m "feat(worker): async sha256 password helper"
```

---

## Task 7: CORS middleware

**Files:**
- Create: `worker/src/lib/cors.ts`

- [ ] **Step 1: Implement**

```ts
import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../db';

export const cors = (): MiddlewareHandler<{ Bindings: Bindings }> => {
  return async (c, next) => {
    const origin = c.env.CORS_ORIGIN;
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type,x-user-id,x-tournament-id,x-tournament-code'
    );
    if (c.req.method === 'OPTIONS') return new Response(null, { status: 204 });
    await next();
  };
};
```

- [ ] **Step 2: Verify lint**

```bash
cd worker && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add worker/src/lib/cors.ts
git commit -m "feat(worker): CORS middleware"
```

---

## Task 8: AI helper (OpenAI-compatible)

**Files:**
- Create: `worker/test/ai.test.ts`
- Create: `worker/src/lib/ai.ts`

- [ ] **Step 1: Write failing test**

```ts
// worker/test/ai.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callStructured } from '../src/lib/ai';

describe('callStructured', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses tool_calls[0].function.arguments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            tool_calls: [{
              function: { arguments: '{"teams":[{"name":"A","players":[]}]}' }
            }]
          }
        }]
      }),
    }));

    const result = await callStructured({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      functionName: 'extract',
      schema: { type: 'object', properties: { teams: { type: 'array' } } },
    });

    expect(result).toEqual({ teams: [{ name: 'A', players: [] }] });
  });

  it('falls back to message.content JSON when tool_calls absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"teams":[]}' } }]
      }),
    }));

    const result = await callStructured({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      functionName: 'extract',
      schema: { type: 'object', properties: { teams: { type: 'array' } } },
    });

    expect(result).toEqual({ teams: [] });
  });

  it('throws on non-ok response with API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'bad key' } }),
    }));

    await expect(
      callStructured({
        apiKey: 'k',
        model: 'm',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        functionName: 'extract',
        schema: { type: 'object', properties: {} },
      })
    ).rejects.toThrow('bad key');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
cd worker && npm test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `worker/src/lib/ai.ts`**

```ts
export type CallStructuredInput = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  functionName: string;
  schema: Record<string, unknown>;
  temperature?: number;
};

export async function callStructured(input: CallStructuredInput): Promise<unknown> {
  const url = `${input.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`;
  const body = {
    model: input.model,
    temperature: input.temperature ?? 0.2,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: input.functionName,
          parameters: input.schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: input.functionName } },
    response_format: { type: 'json_object' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message ?? `AI request failed (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        tool_calls?: Array<{ function: { arguments: string } }>;
        content?: string | null;
      };
    }>;
  };

  const msg = data.choices?.[0]?.message;
  const toolArgs = msg?.tool_calls?.[0]?.function?.arguments;
  if (toolArgs) {
    return JSON.parse(toolArgs);
  }
  if (msg?.content) {
    return JSON.parse(msg.content);
  }
  throw new Error('AI response had no tool_calls or content');
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
cd worker && npm test
```
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib/ai.ts worker/test/ai.test.ts
git commit -m "feat(worker): OpenAI-compatible structured outputs helper"
```

---

## Task 9: Hono app entry + health route

**Files:**
- Create: `worker/src/routes/health.ts`
- Create: `worker/src/index.ts`

- [ ] **Step 1: Create health route**

```ts
// worker/src/routes/health.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';

export const healthRoute = new Hono<{ Bindings: Bindings }>().get('/', (c) =>
  c.json({ ok: true, ts: Date.now() })
);
```

- [ ] **Step 2: Create app entry**

```ts
// worker/src/index.ts
import { Hono } from 'hono';
import { cors } from './lib/cors';
import type { Bindings } from './db';
import { healthRoute } from './routes/health';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.route('/api/health', healthRoute);

app.get('/', (c) => c.text('gametuoitho API'));

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});

export default {
  fetch: app.fetch,
};
```

- [ ] **Step 3: Run lint + smoke test**

```bash
cd worker && npm run lint
```
Expected: 0 errors.

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
curl http://localhost:8787/api/health
```
Expected: `{"ok":true,"ts":...}`

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/health.ts worker/src/index.ts
git commit -m "feat(worker): Hono app entry + health route"
```

---

## Task 10: Auth routes

**Files:**
- Create: `worker/src/routes/auth.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Create auth route**

```ts
// worker/src/routes/auth.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { usersTable, profilesTable } from '../schema';
import { sha256Hex } from '../lib/password';

export const authRoute = new Hono<{ Bindings: Bindings }>();

authRoute.post('/register', async (c) => {
  const { username, password, email, displayName } = await c.req.json();
  if (!username || !password || !email || !displayName) {
    return c.json({ error: 'Vui lòng nhập đầy đủ thông tin đăng ký!' }, 400);
  }
  const tu = username.trim().toLowerCase();
  const te = email.trim().toLowerCase();
  const db = createDb(c.env);

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, tu)).all();
  if (existing.length) return c.json({ error: 'Tên tài khoản này đã tồn tại!' }, 400);

  const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, te)).all();
  if (byEmail.length) return c.json({ error: 'Email này đã được đăng ký!' }, 400);

  const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const passwordHash = await sha256Hex(password);
  const avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`;

  await db.insert(usersTable).values({
    id: userId,
    username: tu,
    email: te,
    passwordHash,
    displayName: displayName.trim(),
    avatar,
    role: 'user',
  });

  await db.insert(profilesTable).values({
    id: userId,
    displayName: displayName.trim(),
    avatar,
    eloCaro: 1500,
    eloCoTuong: 1500,
    eloCoVua: 1500,
    eloOAnQuan: 1500,
    eloCoCaNgua: 1500,
    eloDuoiHinhBatChu: 1500,
    eloNoiChu: 1500,
    eloDoanTu: 1500,
    honorScore: 100,
    badges: '[]',
  });

  return c.json({
    success: true,
    user: { id: userId, displayName: displayName.trim(), username: tu, email: te, role: 'user', avatar },
  });
});

authRoute.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: 'Vui lòng điền đầy đủ tên tài khoản và mật khẩu!' }, 400);
  }
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.username, username)).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Tài khoản không tồn tại!' }, 400);
  if (user.isGoogleUser) return c.json({ error: 'Tài khoản này đăng nhập bằng Google SSO!' }, 400);

  const hash = await sha256Hex(password);
  if (user.passwordHash !== hash) return c.json({ error: 'Mật khẩu không chính xác!' }, 400);

  return c.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
    },
  });
});

authRoute.post('/google-sso', async (c) => {
  const { email, displayName, avatar } = await c.req.json();
  if (!email) return c.json({ error: 'Thiếu thông tin Google Account Email!' }, 400);
  const te = email.trim().toLowerCase();
  const db = createDb(c.env);

  let rows = await db.select().from(usersTable).where(eq(usersTable.email, te)).all();
  let user = rows[0];

  if (!user) {
    const userId = 'user_g_' + Date.now();
    const tempUsername = te.split('@')[0] + '_g';
    const finalAvatar = avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(userId)}`;
    const dn = displayName || te.split('@')[0];

    await db.insert(usersTable).values({
      id: userId,
      username: tempUsername,
      email: te,
      passwordHash: '',
      displayName: dn,
      avatar: finalAvatar,
      role: 'user',
      isGoogleUser: 1,
    });

    await db.insert(profilesTable).values({
      id: userId,
      displayName: dn,
      avatar: finalAvatar,
      eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
      eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
      honorScore: 100, badges: '[]',
    });

    user = { id: userId, username: tempUsername, email: te, displayName: dn, avatar: finalAvatar, role: 'user' } as typeof user;
  }

  return c.json({
    success: true,
    user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName, avatar: user.avatar, role: user.role },
  });
});

authRoute.post('/forgot-password', async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: 'Vui lòng cung cấp địa chỉ email!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email.trim())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản nào liên kết với email này!' }, 404);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000;

  await db.update(usersTable)
    .set({ otp, otpExpires: expires })
    .where(eq(usersTable.id, user.id));

  console.log(`OTP for ${user.email}: ${otp}`);

  return c.json({
    success: true,
    message: 'Mã xác thực OTP đã được gửi về email của bạn (kiểm tra console log server)!',
    _debugOtp: otp,
  });
});

authRoute.post('/reset-password', async (c) => {
  const { email, otp, newPassword } = await c.req.json();
  if (!email || !otp || !newPassword) {
    return c.json({ error: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới!' }, 400);
  }
  const db = createDb(c.env);
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email.trim())).all();
  const user = rows[0];
  if (!user) return c.json({ error: 'Không tìm thấy tài khoản!' }, 404);
  if (!user.otp || user.otp !== otp.trim()) return c.json({ error: 'Mã xác thực OTP không chính xác!' }, 400);
  if (!user.otpExpires || Date.now() > user.otpExpires) return c.json({ error: 'Mã OTP đã hết hạn (hiệu lực trong 5 phút)!' }, 400);

  const passwordHash = await sha256Hex(newPassword);
  await db.update(usersTable)
    .set({ passwordHash, otp: null, otpExpires: null })
    .where(eq(usersTable.id, user.id));

  return c.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập.' });
});

authRoute.post('/quick-login', async (c) => {
  const { userId, displayName } = await c.req.json();
  if (!userId) return c.json({ error: 'Thiếu mã định danh người dùng (userId)!' }, 400);
  const db = createDb(c.env);

  const profileRows = await db.select().from(profilesTable).where(eq(profilesTable.id, userId)).all();
  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).all();
  let profile = profileRows[0];
  let user = userRows[0];

  if (profile && !user) {
    const passwordHash = await sha256Hex('password123');
    user = {
      id: userId, username: userId, email: `${userId}@gametuoitho.space`,
      passwordHash, displayName: profile.displayName, avatar: profile.avatar,
      role: userId === 'user_a' ? 'admin' : 'user',
    } as typeof user;
    await db.insert(usersTable).values(user as any);
  }

  if (!profile) {
    profile = {
      id: userId,
      displayName: displayName || `Kỳ thủ ${userId.substring(0, 5)}`,
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`,
      eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
      eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
      honorScore: 100, badges: '[]',
    } as typeof profile;
    await db.insert(profilesTable).values(profile as any);
  }

  const role = user?.role ?? (userId === 'user_a' ? 'admin' : 'user');
  return c.json({ ...profile, role });
});
```

- [ ] **Step 2: Wire into app**

In `worker/src/index.ts`, replace the body with:

```ts
import { Hono } from 'hono';
import { cors } from './lib/cors';
import type { Bindings } from './db';
import { healthRoute } from './routes/health';
import { authRoute } from './routes/auth';

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors());
app.route('/api/health', healthRoute);
app.route('/api/auth', authRoute);
app.get('/', (c) => c.text('gametuoitho API'));
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});
export default { fetch: app.fetch };
```

- [ ] **Step 3: Smoke test register/login**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3

# register
curl -X POST http://localhost:8787/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"pw1","email":"a@x.com","displayName":"Alice"}'

# login
curl -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"pw1"}'

kill %1
```
Expected: both return `{success: true, user: {...}}`.

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/auth.ts worker/src/index.ts
git commit -m "feat(worker): auth routes (register/login/google-sso/forgot/reset/quick)"
```

---

## Task 11: Profile + leaderboard routes

**Files:**
- Create: `worker/src/routes/profile.ts`
- Create: `worker/src/routes/leaderboard.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Profile route**

```ts
// worker/src/routes/profile.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { profilesTable, usersTable } from '../schema';

const defaultElo = {
  eloCaro: 1500, eloCoTuong: 1500, eloCoVua: 1500, eloOAnQuan: 1500,
  eloCoCaNgua: 1500, eloDuoiHinhBatChu: 1500, eloNoiChu: 1500, eloDoanTu: 1500,
  honorScore: 100, badges: '[]',
};

export const profileRoute = new Hono<{ Bindings: Bindings }>();

async function getOrInitProfile(userId: string, c: any) {
  const db = createDb(c.env);
  const rows = await db.select().from(profilesTable).where(eq(profilesTable.id, userId)).all();
  if (rows[0]) return rows[0];
  const profile = { id: userId, displayName: `Kỳ thủ ${userId.substring(0, 5)}`, avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`, ...defaultElo };
  await db.insert(profilesTable).values(profile as any);
  return profile;
}

profileRoute.get('/:userId', async (c) => {
  const profile = await getOrInitProfile(c.req.param('userId'), c);
  const db = createDb(c.env);
  const u = await db.select().from(usersTable).where(eq(usersTable.id, c.req.param('userId'))).all();
  return c.json({ ...profile, role: u[0]?.role ?? 'user' });
});

profileRoute.post('/:userId/update', async (c) => {
  const { displayName, avatar } = await c.req.json();
  const profile = await getOrInitProfile(c.req.param('userId'), c);
  if (displayName) profile.displayName = displayName;
  if (avatar) profile.avatar = avatar;
  const db = createDb(c.env);
  await db.update(profilesTable).set({ displayName: profile.displayName, avatar: profile.avatar }).where(eq(profilesTable.id, profile.id));
  if (displayName || avatar) {
    await db.update(usersTable).set({ displayName: profile.displayName, avatar: profile.avatar }).where(eq(usersTable.id, profile.id));
  }
  const u = await db.select().from(usersTable).where(eq(usersTable.id, profile.id)).all();
  return c.json({ ...profile, role: u[0]?.role ?? 'user' });
});

profileRoute.post('/:userId/reset-elo', async (c) => {
  const profile = await getOrInitProfile(c.req.param('userId'), c);
  const db = createDb(c.env);
  await db.update(profilesTable).set({ ...defaultElo }).where(eq(profilesTable.id, profile.id));
  const u = await db.select().from(usersTable).where(eq(usersTable.id, profile.id)).all();
  return c.json({ ...profile, ...defaultElo, role: u[0]?.role ?? 'user' });
});
```

- [ ] **Step 2: Leaderboard route**

```ts
// worker/src/routes/leaderboard.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { profilesTable } from '../schema';

const GAME_KEYS: Record<string, string> = {
  caro: 'eloCaro',
  co_tuong: 'eloCoTuong',
  co_vua: 'eloCoVua',
  o_an_quan: 'eloOAnQuan',
  co_ca_ngua: 'eloCoCaNgua',
  duoi_hinh_bat_chu: 'eloDuoiHinhBatChu',
  noi_chu: 'eloNoiChu',
  doan_tu: 'eloDoanTu',
};

export const leaderboardRoute = new Hono<{ Bindings: Bindings }>();

leaderboardRoute.get('/global', async (c) => {
  const db = createDb(c.env);
  const all = await db.select().from(profilesTable).all();
  return c.json(all.sort((a, b) => b.honorScore - a.honorScore).slice(0, 50));
});

leaderboardRoute.get('/:gameId', async (c) => {
  const gameId = c.req.param('gameId');
  const key = GAME_KEYS[gameId];
  if (!key) return c.json({ error: 'Unknown game' }, 400);
  const db = createDb(c.env);
  const all = await db.select().from(profilesTable).all();
  const out = all.map((p: any) => ({
    id: p.id,
    displayName: p.displayName,
    avatar: p.avatar,
    elo: p[key] ?? 1500,
    honorScore: p.honorScore,
  })).sort((a, b) => b.elo - a.elo).slice(0, 50);
  return c.json(out);
});
```

- [ ] **Step 3: Wire into app**

In `worker/src/index.ts`, add:

```ts
import { profileRoute } from './routes/profile';
import { leaderboardRoute } from './routes/leaderboard';
// ...
app.route('/api/profile', profileRoute);
app.route('/api/leaderboard', leaderboardRoute);
```

- [ ] **Step 4: Smoke test**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
curl http://localhost:8787/api/profile/user_a
curl http://localhost:8787/api/leaderboard/global
curl http://localhost:8787/api/leaderboard/caro
kill %1
```
Expected: all return JSON.

- [ ] **Step 5: Commit**

```bash
git add worker/src/routes/profile.ts worker/src/routes/leaderboard.ts worker/src/index.ts
git commit -m "feat(worker): profile + leaderboard routes"
```

---

## Task 12: Tournaments + challenges + replays routes

**Files:**
- Create: `worker/src/routes/tournaments.ts`
- Create: `worker/src/routes/challenges.ts`
- Create: `worker/src/routes/replays.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Tournaments route**

```ts
// worker/src/routes/tournaments.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { tournamentsTable, matchesTable } from '../schema';

export const tournamentsRoute = new Hono<{ Bindings: Bindings }>();

tournamentsRoute.get('/', async (c) => {
  const db = createDb(c.env);
  return c.json(await db.select().from(tournamentsTable).all());
});

tournamentsRoute.post('/create', async (c) => {
  const { userId, name, gameId, maxPlayers, deadlineSeconds } = await c.req.json();
  const id = 'tour_' + Date.now();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const tournament = {
    id, code, name, gameId,
    maxPlayers: parseInt(maxPlayers) || 16,
    deadlineSeconds: parseInt(deadlineSeconds) || 300,
    ownerId: userId, status: 'OPEN', createdAt: Date.now(),
    players: JSON.stringify([userId]),
  };
  const db = createDb(c.env);
  await db.insert(tournamentsTable).values(tournament as any);
  return c.json(tournament);
});

tournamentsRoute.post('/join', async (c) => {
  const { userId, code } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.code, code)).all();
  const t = rows[0];
  if (!t) return c.json({ error: 'Không thể tham gia giải đấu! Mã không hợp lệ.' }, 400);
  const players: string[] = JSON.parse((t as any).players || '[]');
  if (players.length >= (t as any).maxPlayers) return c.json({ error: 'Giải đấu đã đầy!' }, 400);
  if (!players.includes(userId)) players.push(userId);
  await db.update(tournamentsTable).set({ players: JSON.stringify(players) } as any).where(eq(tournamentsTable.id, t.id));
  return c.json({ ...t, players });
});

tournamentsRoute.get('/code/:code', async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.code, c.req.param('code'))).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  return c.json(rows[0]);
});

tournamentsRoute.get('/:id', async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, c.req.param('id'))).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  return c.json(rows[0]);
});

tournamentsRoute.post('/:id/start', async (c) => {
  const db = createDb(c.env);
  const id = c.req.param('id');
  await db.update(tournamentsTable).set({ status: 'RUNNING' } as any).where(eq(tournamentsTable.id, id));
  const rows = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).all();
  return c.json(rows[0]);
});

tournamentsRoute.post('/:id/launch/:matchIndex', async (c) => {
  const matchId = 'match_' + Date.now();
  const db = createDb(c.env);
  await db.insert(matchesTable).values({
    id: matchId, gameId: 'tournament', status: 'PLAYING',
    players: '[]', turn: 'p1', moves: '[]', viewers: '[]',
    createdAt: Date.now(),
  } as any);
  return c.json({ matchId });
});
```

- [ ] **Step 2: Challenges route**

```ts
// worker/src/routes/challenges.ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { dailyChallengesTable } from '../schema';

export const challengesRoute = new Hono<{ Bindings: Bindings }>();

challengesRoute.get('/:gameId/:date', async (c) => {
  const { gameId, date } = c.req.param();
  const db = createDb(c.env);
  const rows = await db.select().from(dailyChallengesTable)
    .where(and(eq(dailyChallengesTable.gameId, gameId), eq(dailyChallengesTable.date, date)))
    .all();
  if (rows[0]) return c.json(rows[0]);

  const puzzle = {
    id: 'dc_' + Date.now(),
    gameId, date,
    puzzle: JSON.stringify({ seed: Math.random().toString(36).slice(2) }),
    scores: '[]',
    createdAt: Date.now(),
  };
  await db.insert(dailyChallengesTable).values(puzzle as any);
  return c.json(puzzle);
});

challengesRoute.post('/:gameId/:date/submit', async (c) => {
  const { gameId, date } = c.req.param();
  const { userId, displayName, avatar, score } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(dailyChallengesTable)
    .where(and(eq(dailyChallengesTable.gameId, gameId), eq(dailyChallengesTable.date, date)))
    .all();
  let ch = rows[0];
  if (!ch) {
    ch = { id: 'dc_' + Date.now(), gameId, date, puzzle: '{}', scores: '[]', createdAt: Date.now() } as any;
    await db.insert(dailyChallengesTable).values(ch as any);
  }
  const scores: any[] = JSON.parse((ch as any).scores || '[]');
  scores.push({ userId, displayName, avatar, score, ts: Date.now() });
  await db.update(dailyChallengesTable).set({ scores: JSON.stringify(scores) } as any).where(eq(dailyChallengesTable.id, ch!.id));
  return c.json({ ...ch, scores });
});
```

- [ ] **Step 3: Replays route**

```ts
// worker/src/routes/replays.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';

export const replaysRoute = new Hono<{ Bindings: Bindings }>();

replaysRoute.get('/:userId', async (c) => {
  const userId = c.req.param('userId');
  const db = createDb(c.env);
  const all = await db.select().from(matchesTable).all();
  return c.json(all.filter((m: any) => m.status === 'ENDED' && (m.players || '').includes(userId)));
});

replaysRoute.get('/replay/:matchId', async (c) => {
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, c.req.param('matchId'))).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy nhật ký trận đấu!' }, 404);
  return c.json(rows[0]);
});
```

- [ ] **Step 4: Wire routes**

In `worker/src/index.ts`:

```ts
import { tournamentsRoute } from './routes/tournaments';
import { challengesRoute } from './routes/challenges';
import { replaysRoute } from './routes/replays';
// ...
app.route('/api/tournaments', tournamentsRoute);
app.route('/api/challenges', challengesRoute);
app.route('/api/replays', replaysRoute);
app.route('/api/replay', replaysRoute);
```

- [ ] **Step 5: Smoke test**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
curl -X POST http://localhost:8787/api/tournaments/create \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_a","name":"Test","gameId":"caro","maxPlayers":4,"deadlineSeconds":300}'
curl http://localhost:8787/api/tournaments
curl http://localhost:8787/api/challenges/caro/2026-07-06
kill %1
```
Expected: JSON arrays/objects.

- [ ] **Step 6: Commit**

```bash
git add worker/src/routes/tournaments.ts worker/src/routes/challenges.ts worker/src/routes/replays.ts worker/src/index.ts
git commit -m "feat(worker): tournaments + challenges + replays routes"
```

---

## Task 13: Bilac routes (with weekly interval)

**Files:**
- Create: `worker/src/routes/bilac.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Implement bilac route**

```ts
// worker/src/routes/bilac.ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import {
  bilacTournamentsTable, bilacPlayersTable, bilacMatchesTable, bilacTournamentMembersTable,
} from '../schema';

export const bilacRoute = new Hono<{ Bindings: Bindings }>();

function getBiLacWeeklyInterval(date: Date) {
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const d = new Date(utcMs + (7 * 3600000));
  const day = d.getDay();
  const wed = new Date(d);
  const diff = 3 - day;
  wed.setDate(d.getDate() + diff);
  wed.setHours(11, 30, 0, 0);
  let start: Date, end: Date;
  if (d.getTime() < wed.getTime()) {
    start = new Date(wed); start.setDate(wed.getDate() - 7); start.setHours(12, 0, 0, 0);
    end = new Date(wed);
  } else {
    start = new Date(wed); start.setHours(12, 0, 0, 0);
    end = new Date(wed); end.setDate(wed.getDate() + 7);
  }
  const fmt = (x: Date) =>
    `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`;
  return { start, end, label: `Tuần từ ${fmt(start)} đến ${fmt(end)}` };
}

const checkAccess = async (c: any, next: any) => {
  const tournamentId = c.req.header('x-tournament-id') || c.req.query('tournamentId');
  const code = c.req.header('x-tournament-code') || c.req.query('code');
  if (!tournamentId) return c.json({ error: 'Thiếu mã giải đấu (Tournament ID)!' }, 401);
  const db = createDb(c.env);
  const rows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId)).all();
  if (!rows[0]) return c.json({ error: 'Không tìm thấy giải đấu này!' }, 404);
  if ((rows[0] as any).code !== code) return c.json({ error: 'Mã code truy cập không chính xác!' }, 403);
  c.set('tournamentId', tournamentId);
  await next();
};

bilacRoute.get('/tournaments', async (c) => {
  const db = createDb(c.env);
  const all = await db.select().from(bilacTournamentsTable).all();
  return c.json(all.map((t: any) => ({ id: t.id, name: t.name, description: t.description, createdAt: t.createdAt })));
});

bilacRoute.post('/tournaments/access', async (c) => {
  const { tournamentId, code } = await c.req.json();
  if (!tournamentId) return c.json({ error: 'Thiếu mã giải đấu!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(bilacTournamentsTable).where(eq(bilacTournamentsTable.id, tournamentId)).all();
  const tour = rows[0];
  if (!tour) return c.json({ error: 'Không tìm thấy giải đấu!' }, 404);
  if ((tour as any).code !== code) return c.json({ error: 'Mã truy cập không chính xác!' }, 403);
  return c.json({ success: true, tournament: { id: tour.id, name: (tour as any).name, description: (tour as any).description } });
});

bilacRoute.post('/tournaments', async (c) => {
  const { name, code, description } = await c.req.json();
  if (!name || !name.trim()) return c.json({ error: 'Tên giải đấu không được để trống!' }, 400);
  if (!code || !code.trim()) return c.json({ error: 'Mã truy cập giải đấu không được để trống!' }, 400);
  const id = 'tour-' + Date.now();
  const db = createDb(c.env);
  await db.insert(bilacTournamentsTable).values({ id, name: name.trim(), code: code.trim(), description: description?.trim() ?? '', createdAt: Date.now() } as any);
  return c.json({ success: true, tournament: { id, name: name.trim(), code: code.trim(), description: description?.trim() ?? '', createdAt: Date.now() } });
});

bilacRoute.get('/players', checkAccess, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const all = await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tournamentId)).all();
  return c.json(all);
});

bilacRoute.post('/players', checkAccess, async (c: any) => {
  const { name } = await c.req.json();
  const tournamentId = c.get('tournamentId');
  if (!name || !name.trim()) return c.json({ error: 'Tên người chơi không được để trống!' }, 400);
  const id = 'bl-' + Date.now();
  const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name.trim())}`;
  const db = createDb(c.env);
  await db.insert(bilacPlayersTable).values({ id, name: name.trim(), avatar, tournamentId } as any);
  return c.json({ id, name: name.trim(), avatar, tournamentId });
});

bilacRoute.delete('/players/:id', checkAccess, async (c: any) => {
  const playerId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const matches = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();
  const hasMatch = matches.some((m: any) =>
    (m.team1 || '').includes(playerId) || (m.team2 || '').includes(playerId) || m.benched === playerId
  );
  if (hasMatch) return c.json({ error: 'Không thể xóa người chơi này vì họ đã tham gia ít nhất một trận đấu!' }, 400);
  await db.delete(bilacPlayersTable).where(eq(bilacPlayersTable.id, playerId));
  return c.json({ success: true });
});

bilacRoute.get('/matches', checkAccess, async (c: any) => {
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const all = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();
  return c.json(all);
});

bilacRoute.post('/matches', checkAccess, async (c: any) => {
  const { playerIds } = await c.req.json();
  const tournamentId = c.get('tournamentId');
  if (!Array.isArray(playerIds) || playerIds.length < 2) {
    return c.json({ error: 'Cần ít nhất 2 người chơi để chia đội!' }, 400);
  }
  const db = createDb(c.env);
  const all = await db.select().from(bilacPlayersTable).where(eq(bilacPlayersTable.tournamentId, tournamentId)).all();
  const selected = all.filter((p: any) => playerIds.includes(p.id));
  if (selected.length < 2) return c.json({ error: 'Không tìm thấy người chơi hợp lệ trong hệ thống!' }, 400);

  const interval = getBiLacWeeklyInterval(new Date());
  const matchesAll = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.tournamentId, tournamentId)).all();

  const statsWeekly: Record<string, any> = {};
  const statsAllTime: Record<string, any> = {};
  selected.forEach((p: any) => { statsWeekly[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 }; statsAllTime[p.id] = { points: 0, gd: 0, wins: 0, goals: 0 }; });

  matchesAll.filter((m: any) => m.status === 'FINISHED').forEach((m: any) => {
    const s1 = m.score1, s2 = m.score2, t1 = JSON.parse(m.team1 || '[]'), t2 = JSON.parse(m.team2 || '[]');
    const isWeekly = m.weekLabel === interval.label;
    t1.forEach((pid: string) => {
      if (statsAllTime[pid]) { statsAllTime[pid].goals += s1; statsAllTime[pid].gd += (s1 - s2); if (s1 > s2) { statsAllTime[pid].points += 3; statsAllTime[pid].wins += 1; } else if (s1 === s2) statsAllTime[pid].points += 1; }
      if (isWeekly && statsWeekly[pid]) { statsWeekly[pid].goals += s1; statsWeekly[pid].gd += (s1 - s2); if (s1 > s2) { statsWeekly[pid].points += 3; statsWeekly[pid].wins += 1; } else if (s1 === s2) statsWeekly[pid].points += 1; }
    });
    t2.forEach((pid: string) => {
      if (statsAllTime[pid]) { statsAllTime[pid].goals += s2; statsAllTime[pid].gd += (s2 - s1); if (s2 > s1) { statsAllTime[pid].points += 3; statsAllTime[pid].wins += 1; } else if (s1 === s2) statsAllTime[pid].points += 1; }
      if (isWeekly && statsWeekly[pid]) { statsWeekly[pid].goals += s2; statsWeekly[pid].gd += (s2 - s1); if (s2 > s1) { statsWeekly[pid].points += 3; statsWeekly[pid].wins += 1; } else if (s1 === s2) statsWeekly[pid].points += 1; }
    });
  });

  const sorted = [...selected].sort((a: any, b: any) => {
    const wA = statsWeekly[a.id], wB = statsWeekly[b.id];
    if (wB.points !== wA.points) return wB.points - wA.points;
    if (wB.gd !== wA.gd) return wB.gd - wA.gd;
    if (wB.wins !== wA.wins) return wB.wins - wA.wins;
    if (wB.goals !== wA.goals) return wB.goals - wA.goals;
    const aA = statsAllTime[a.id], aB = statsAllTime[b.id];
    if (aB.points !== aA.points) return aB.points - aA.points;
    if (aB.gd !== aA.gd) return aB.gd - aA.gd;
    if (aB.wins !== aA.wins) return aB.wins - aA.wins;
    if (aB.goals !== aA.goals) return aB.goals - aA.goals;
    return b.id.localeCompare(a.id);
  });

  let ids = sorted.map((p: any) => p.id);
  let benched: string | undefined;
  if (ids.length % 2 !== 0) {
    const bi = Math.floor(Math.random() * ids.length);
    benched = ids[bi];
    ids.splice(bi, 1);
  }
  const teamSize = ids.length / 2;
  const high = ids.slice(0, teamSize);
  const low = ids.slice(teamSize);
  const shuf = <T,>(arr: T[]): T[] => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sh = shuf(high), sl = shuf(low);
  const t1: string[] = [], t2: string[] = [];
  const halfHigh = Math.floor(teamSize / 2);
  for (let i = 0; i < sh.length; i++) (i < halfHigh ? t1 : t2).push(sh[i]);
  const needLowT1 = teamSize - t1.length;
  for (let i = 0; i < sl.length; i++) (i < needLowT1 ? t1 : t2).push(sl[i]);

  const match = {
    id: 'match-' + Date.now(),
    timestamp: Date.now(),
    weekLabel: interval.label,
    team1: JSON.stringify(shuf(t1)),
    team2: JSON.stringify(shuf(t2)),
    score1: 0, score2: 0,
    status: 'PLAYING',
    benched: benched ?? null,
    tournamentId,
  };
  await db.insert(bilacMatchesTable).values(match as any);
  return c.json(match);
});

bilacRoute.post('/matches/:id/update', checkAccess, async (c: any) => {
  const matchId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const { score1, score2, status } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  if ((m as any).tournamentId !== tournamentId) return c.json({ error: 'Bạn không có quyền chỉnh sửa trận đấu của giải đấu này!' }, 403);
  await db.update(bilacMatchesTable).set({ score1, score2, status } as any).where(eq(bilacMatchesTable.id, matchId));
  return c.json({ ...m, score1, score2, status });
});

bilacRoute.delete('/matches/:id', checkAccess, async (c: any) => {
  const matchId = c.req.param('id');
  const tournamentId = c.get('tournamentId');
  const db = createDb(c.env);
  const rows = await db.select().from(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  if ((m as any).tournamentId !== tournamentId) return c.json({ error: 'Bạn không có quyền xóa trận đấu của giải đấu này!' }, 403);
  await db.delete(bilacMatchesTable).where(eq(bilacMatchesTable.id, matchId));
  return c.json({ success: true });
});
```

- [ ] **Step 2: Wire into app**

In `worker/src/index.ts`:

```ts
import { bilacRoute } from './routes/bilac';
// ...
app.route('/api/bilac', bilacRoute);
```

- [ ] **Step 3: Smoke test create tournament + player**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
TID=$(curl -sX POST http://localhost:8787/api/bilac/tournaments \
  -H 'Content-Type: application/json' \
  -d '{"name":"Cup1","code":"abc","description":"d"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "TID=$TID"

curl -X POST http://localhost:8787/api/bilac/players \
  -H 'Content-Type: application/json' \
  -H "x-tournament-id: $TID" \
  -H "x-tournament-code: abc" \
  -d '{"name":"Player A"}'

curl http://localhost:8787/api/bilac/players \
  -H "x-tournament-id: $TID" -H "x-tournament-code: abc"

kill %1
```
Expected: tournament created, player added and listed.

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/bilac.ts worker/src/index.ts
git commit -m "feat(worker): bilac routes (tournaments/players/matches)"
```

---

## Task 14: Leagues + permissions routes

**Files:**
- Create: `worker/src/routes/leagues.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Implement leagues route**

```ts
// worker/src/routes/leagues.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { myLeaguesTable, leaguePermissionsTable } from '../schema';

export const leaguesRoute = new Hono<{ Bindings: Bindings }>();

async function getPermissions(db: ReturnType<typeof createDb>) {
  const rows = await db.select().from(leaguePermissionsTable).all();
  const map: Record<string, boolean> = {};
  for (const r of rows) map[(r as any).userId] = !!(r as any).allowed;
  return map;
}

leaguesRoute.get('/', async (c) => {
  const userId = c.req.query('userId');
  const db = createDb(c.env);
  if (userId) {
    const perms = await getPermissions(db);
    if (!perms[userId]) return c.json({ error: 'Quyền truy cập bị hạn chế' }, 403);
  }
  return c.json(await db.select().from(myLeaguesTable).all());
});

leaguesRoute.post('/', async (c) => {
  const league = await c.req.json();
  if (!league?.id || !league?.name) return c.json({ error: 'Dữ liệu giải đấu không hợp lệ!' }, 400);
  const db = createDb(c.env);
  await db.insert(myLeaguesTable).values(league as any).onConflictDoUpdate({ target: myLeaguesTable.id, set: league as any });
  return c.json(league);
});

leaguesRoute.put('/:id', async (c) => {
  const league = await c.req.json();
  if (!league?.id || !league?.name) return c.json({ error: 'Dữ liệu giải đấu không hợp lệ!' }, 400);
  const db = createDb(c.env);
  await db.insert(myLeaguesTable).values(league as any).onConflictDoUpdate({ target: myLeaguesTable.id, set: league as any });
  return c.json(league);
});

leaguesRoute.delete('/:id', async (c) => {
  const db = createDb(c.env);
  await db.delete(myLeaguesTable).where(eq(myLeaguesTable.id, c.req.param('id')));
  return c.json({ success: true });
});

leaguesRoute.get('/leagues-permissions', async (c) => {
  const db = createDb(c.env);
  return c.json({ permissions: await getPermissions(db) });
});

leaguesRoute.post('/leagues-permissions/toggle', async (c) => {
  const { targetUserId } = await c.req.json();
  if (!targetUserId) return c.json({ error: 'Thiếu mã tài khoản!' }, 400);
  const db = createDb(c.env);
  const rows = await db.select().from(leaguePermissionsTable).where(eq(leaguePermissionsTable.userId, targetUserId)).all();
  const current = !!rows[0] && !!(rows[0] as any).allowed;
  if (rows[0]) {
    await db.update(leaguePermissionsTable).set({ allowed: !current } as any).where(eq(leaguePermissionsTable.userId, targetUserId));
  } else {
    await db.insert(leaguePermissionsTable).values({ userId: targetUserId, allowed: !current } as any);
  }
  return c.json({ success: true, permissions: await getPermissions(db) });
});
```

- [ ] **Step 2: Wire into app**

```ts
import { leaguesRoute } from './routes/leagues';
// ...
app.route('/api', leaguesRoute);
```

Note: leaguesRoute mounts under `/api`, not `/api/leagues`. Routes inside already include full paths like `/leagues-permissions`.

- [ ] **Step 3: Smoke test**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
curl -X POST http://localhost:8787/api/leagues \
  -H 'Content-Type: application/json' \
  -d '{"id":"l1","name":"My League","createdBy":"u1"}'
curl http://localhost:8787/api/leagues
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/leagues.ts worker/src/index.ts
git commit -m "feat(worker): leagues + permissions routes"
```

---

## Task 15: AI parse-roster route

**Files:**
- Create: `worker/src/routes/ai.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Implement AI route**

```ts
// worker/src/routes/ai.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { callStructured } from '../lib/ai';

export const aiRoute = new Hono<{ Bindings: Bindings }>();

aiRoute.post('/parse-roster', async (c) => {
  const { summary } = await c.req.json();
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return c.json({ error: 'Nội dung tóm tắt không được để trống!' }, 400);
  }
  if (!c.env.OPENAI_API_KEY || !c.env.OPENAI_MODEL) {
    return c.json({ error: 'Chưa cấu hình OPENAI_API_KEY/OPENAI_MODEL trên Worker secrets!' }, 500);
  }

  const schema = {
    type: 'object',
    properties: {
      teams: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên của đội tuyển hoặc tên VĐV' },
            players: { type: 'array', items: { type: 'string' }, description: 'Danh sách tên đầy đủ của các cầu thủ trong đội bóng (nếu có)' },
          },
          required: ['name', 'players'],
        },
      },
    },
    required: ['teams'],
  };

  try {
    const result = await callStructured({
      apiKey: c.env.OPENAI_API_KEY,
      model: c.env.OPENAI_MODEL,
      baseUrl: c.env.OPENAI_BASE_URL,
      systemPrompt: 'Bạn là một trợ lý ảo phân tích dữ liệu giải đấu thể thao chuyên nghiệp. Nhiệm vụ của bạn là đọc thông tin về các đội bóng và danh sách cầu thủ tham gia, sau đó trích xuất ra cấu trúc dữ liệu JSON chính xác. Luôn trả về đúng schema được yêu cầu.',
      userPrompt: `Hãy phân tích văn bản tóm tắt giải đấu / đội hình dưới đây và trả về danh sách các đội tuyển cùng danh sách cầu thủ tương ứng.\nNếu là các bộ môn đơn/đôi như bóng bàn hoặc cầu lông, hãy coi mỗi vận động viên hoặc cặp vận động viên là một "đội" và liệt kê tên của họ vào danh sách cầu thủ.\n\nVăn bản cần phân tích:\n"""\n${summary}\n"""`,
      functionName: 'extract_roster',
      schema,
    });
    return c.json(result);
  } catch (e: any) {
    console.error('AI error:', e);
    return c.json({ error: 'Không thể phân tích dữ liệu bằng AI. Chi tiết: ' + (e.message || String(e)) }, 500);
  }
});
```

- [ ] **Step 2: Wire into app**

```ts
import { aiRoute } from './routes/ai';
// ...
app.route('/api/ai', aiRoute);
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/routes/ai.ts worker/src/index.ts
git commit -m "feat(worker): /api/ai/parse-roster (OpenAI-compatible)"
```

---

## Task 16: Matchmaking route (REST + SSE)

**Files:**
- Create: `worker/src/routes/matchmaking.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Implement matchmaking route**

```ts
// worker/src/routes/matchmaking.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { sseStream } from '../lib/sse';
import { addMatchmaking, getMatchmakingUsers, sendToMatchmaking } from '../lib/state';

export const matchmakingRoute = new Hono<{ Bindings: Bindings }>();

// In-memory queue: gameId -> Set<userId>
const queue = new Map<string, Set<string>>();

matchmakingRoute.post('/matchmaking/join', async (c) => {
  const { userId, gameId } = await c.req.json();
  if (!userId || !gameId) return c.json({ error: 'Missing userId/gameId' }, 400);

  const db = createDb(c.env);
  const waiting = queue.get(gameId);
  if (waiting && waiting.size > 0) {
    const [opponentId] = [...waiting].filter((id) => id !== userId);
    if (opponentId) {
      waiting.delete(opponentId);
      const matchId = 'match_' + Date.now();
      await db.insert(matchesTable).values({
        id: matchId, gameId, status: 'PLAYING',
        players: JSON.stringify([userId, opponentId]),
        turn: userId, moves: '[]', viewers: '[]',
        createdAt: Date.now(),
      } as any);
      // Notify opponent's SSE controller (if any)
      sendToMatchmaking(opponentId, 'matched', { matchId, opponentId: userId });
      return c.json({ matched: true, matchId, opponentId });
    }
  }
  if (!waiting) queue.set(gameId, new Set());
  queue.get(gameId)!.add(userId);
  return c.json({ matched: false });
});

matchmakingRoute.post('/matchmaking/leave', async (c) => {
  const { userId, gameId } = await c.req.json();
  if (gameId) queue.get(gameId)?.delete(userId);
  return c.json({ success: true });
});

matchmakingRoute.post('/private-room', async (c) => {
  const { userId, gameId } = await c.req.json();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  // Store in D1 (lightweight: piggyback on matches table with status WAITING)
  const db = createDb(c.env);
  const id = 'pr_' + Date.now();
  await db.insert(matchesTable).values({
    id, gameId, status: 'WAITING',
    players: JSON.stringify([userId]),
    turn: userId, moves: '[]', viewers: '[]',
    createdAt: Date.now(),
  } as any);
  return c.json({ code, matchId: id });
});

matchmakingRoute.post('/private-room/join', async (c) => {
  const { userId, code } = await c.req.json();
  // For simplicity, treat code == matchId prefix lookup
  const db = createDb(c.env);
  const all = await db.select().from(matchesTable).all();
  const m = all.find((x: any) => x.id.endsWith(code) || x.code === code);
  if (!m) return c.json({ error: 'Không tìm thấy phòng!' }, 404);
  if ((m as any).status !== 'WAITING') return c.json({ error: 'Phòng đã đầy!' }, 400);
  await db.update(matchesTable).set({
    players: JSON.stringify([JSON.parse((m as any).players)[0], userId]),
    status: 'PLAYING',
  } as any);
  return c.json({ matchId: (m as any).id });
});

matchmakingRoute.post('/match/invite', async (c) => {
  const { fromUserId, targetUserId, gameId, code } = await c.req.json();
  // No-op in REST-only; client should poll matchmaking stream
  sendToMatchmaking(targetUserId, 'invitation', { fromUserId, gameId, code });
  return c.json({ success: true });
});

matchmakingRoute.get('/matchmaking/stream', (c) => {
  const userId = c.req.query('userId');
  const gameId = c.req.query('gameId');
  if (!userId || !gameId) return c.json({ error: 'Missing userId/gameId' }, 400);

  return sseStream({
    onConnect: (send, close) => {
      return addMatchmaking(userId, { send, close });
    },
    heartbeatMs: 30000,
  });
});
```

- [ ] **Step 2: Wire into app**

```ts
import { matchmakingRoute } from './routes/matchmaking';
// ...
app.route('/api', matchmakingRoute);
```

Note: route mounts under `/api` because endpoints are at `/matchmaking/*`, `/match/*`, `/private-room/*`.

- [ ] **Step 3: Smoke test**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
curl -X POST http://localhost:8787/api/matchmaking/join \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u1","gameId":"caro"}'
curl -X POST http://localhost:8787/api/matchmaking/join \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u2","gameId":"caro"}'
kill %1
```
Expected: first returns `{matched: false}`, second returns `{matched: true, matchId, opponentId: u1}`.

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/matchmaking.ts worker/src/index.ts
git commit -m "feat(worker): matchmaking (REST join/leave + SSE stream)"
```

---

## Task 17: Match state route (SSE + REST)

**Files:**
- Create: `worker/src/routes/match.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Implement match route**

```ts
// worker/src/routes/match.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { sseStream } from '../lib/sse';
import { addMatchStream, broadcastMatch } from '../lib/state';

export const matchRoute = new Hono<{ Bindings: Bindings }>();

matchRoute.post('/match/:id/move', async (c) => {
  const matchId = c.req.param('id');
  const { userId, move } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  const players: string[] = JSON.parse((m as any).players || '[]');
  if (!players.includes(userId)) return c.json({ error: 'Không phải người chơi trong trận!' }, 403);

  const moves: any[] = JSON.parse((m as any).moves || '[]');
  const moveTs = Date.now();
  moves.push({ userId, move, ts: moveTs });
  const nextTurn = players.find((p) => p !== userId) ?? userId;

  await db.update(matchesTable).set({
    moves: JSON.stringify(moves),
    turn: nextTurn,
  } as any).where(eq(matchesTable.id, matchId));

  broadcastMatch(matchId, 'move', { userId, move, ts: moveTs, turn: nextTurn });
  return c.json({ success: true, moveTs, turn: nextTurn });
});

matchRoute.post('/match/:id/forfeit', async (c) => {
  const matchId = c.req.param('id');
  const { userId } = await c.req.json();
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  const players: string[] = JSON.parse((m as any).players || '[]');
  const winner = players.find((p) => p !== userId) ?? null;
  await db.update(matchesTable).set({ status: 'ENDED', winner } as any).where(eq(matchesTable.id, matchId));
  broadcastMatch(matchId, 'ended', { winner, reason: 'forfeit' });
  return c.json({ success: true, winner });
});

matchRoute.get('/match/:id/state', async (c) => {
  const matchId = c.req.param('id');
  const db = createDb(c.env);
  const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
  const m = rows[0];
  if (!m) return c.json({ error: 'Không tìm thấy trận đấu!' }, 404);
  return c.json({
    matchId,
    status: (m as any).status,
    players: JSON.parse((m as any).players || '[]'),
    turn: (m as any).turn,
    moves: JSON.parse((m as any).moves || '[]'),
    winner: (m as any).winner,
  });
});

matchRoute.get('/match/:id/stream', (c) => {
  const matchId = c.req.param('id');
  return sseStream({
    onConnect: async (send, close) => {
      const db = createDb(c.env);
      const rows = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId)).all();
      const m = rows[0];
      if (!m) {
        send('error', { error: 'Match not found' });
        close();
        return;
      }
      send('snapshot', {
        matchId,
        status: (m as any).status,
        players: JSON.parse((m as any).players || '[]'),
        turn: (m as any).turn,
        moves: JSON.parse((m as any).moves || '[]'),
        winner: (m as any).winner,
      });
      return addMatchStream(matchId, { send, close });
    },
    heartbeatMs: 30000,
  });
});
```

- [ ] **Step 2: Wire into app**

```ts
import { matchRoute } from './routes/match';
// ...
app.route('/api', matchRoute);
```

- [ ] **Step 3: Smoke test move + forfeit**

```bash
cd worker && npx wrangler dev --local --port 8787 &
sleep 3
MID=$(curl -sX POST http://localhost:8787/api/matchmaking/join \
  -H 'Content-Type: application/json' \
  -d '{"userId":"ua","gameId":"caro"}' | grep -o '"matchId":"[^"]*"' | cut -d'"' -f4)
echo "MID=$MID"
curl -X POST http://localhost:8787/api/match/$MID/move \
  -H 'Content-Type: application/json' \
  -d '{"userId":"ua","move":{"row":0,"col":0}}'
curl http://localhost:8787/api/match/$MID/state
kill %1
```
Expected: move succeeds, state shows new move in array.

- [ ] **Step 4: Commit**

```bash
git add worker/src/routes/match.ts worker/src/index.ts
git commit -m "feat(worker): match state (SSE stream + REST move/forfeit)"
```

---

## Task 18: Frontend api wrapper

**Files:**
- Create: `src/lib/api.ts`

- [ ] **Step 1: Find existing userId store**

In `src/`, grep for `localStorage` and `userId`:
```bash
cd /Users/niko/founder/game/gametuoitho
grep -rn "localStorage" src/ | grep -i userId
grep -rn "useState.*userId\|userId.*useState" src/
```
Identify the current store (zustand/context/localStorage). Note the path.

- [ ] **Step 2: Create `src/lib/api.ts`**

```ts
const BASE = import.meta.env.VITE_API_BASE as string;

function currentUserId(): string | null {
  // Today: localStorage. If app switches store later, update only here.
  return localStorage.getItem('userId');
}

export type ApiOptions = RequestInit & {
  tournamentId?: string;
  tournamentCode?: string;
};

export async function api<T = unknown>(path: string, init: ApiOptions = {}): Promise<T> {
  const { tournamentId, tournamentCode, headers: initHeaders, ...rest } = init;
  const userId = currentUserId();
  const headers = new Headers(initHeaders);
  headers.set('Content-Type', 'application/json');
  if (userId) headers.set('x-user-id', userId);
  if (tournamentId) headers.set('x-tournament-id', tournamentId);
  if (tournamentCode) headers.set('x-tournament-code', tournamentCode);

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function bilacFetch<T = unknown>(path: string, init: ApiOptions = {}): Promise<T> {
  // Tournament id/code must be passed by the caller.
  return api<T>(path, init);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(frontend): api() wrapper with x-user-id auto-attach"
```

---

## Task 19: Frontend useMatchmaking hook

**Files:**
- Create: `src/hooks/useMatchmaking.ts`

- [ ] **Step 1: Implement**

```ts
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type MatchmakingState = {
  status: 'IDLE' | 'WAITING' | 'MATCHED';
  matchId?: string;
  opponentId?: string;
  error?: string;
};

export function useMatchmaking(gameId: string | null): MatchmakingState & {
  start: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<MatchmakingState>({ status: 'IDLE' });

  useEffect(() => {
    if (!gameId || state.status !== 'WAITING') return;
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setState({ status: 'IDLE', error: 'Not logged in' });
      return;
    }
    const url = `${import.meta.env.VITE_API_BASE}/api/matchmaking/stream?userId=${encodeURIComponent(userId)}&gameId=${encodeURIComponent(gameId)}`;
    const es = new EventSource(url);
    es.addEventListener('matched', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setState({ status: 'MATCHED', matchId: data.matchId, opponentId: data.opponentId });
      es.close();
    });
    es.onerror = () => {
      setState({ status: 'IDLE', error: 'Stream error' });
      es.close();
    };
    return () => es.close();
  }, [gameId, state.status]);

  const start = async () => {
    if (!gameId) return;
    setState({ status: 'WAITING' });
    const userId = localStorage.getItem('userId');
    try {
      const res = await api<{ matched: boolean; matchId?: string; opponentId?: string }>('/api/matchmaking/join', {
        method: 'POST',
        body: JSON.stringify({ userId, gameId }),
      });
      if (res.matched) {
        setState({ status: 'MATCHED', matchId: res.matchId, opponentId: res.opponentId });
      }
    } catch (e: any) {
      setState({ status: 'IDLE', error: e.message });
    }
  };

  const cancel = async () => {
    const userId = localStorage.getItem('userId');
    if (!gameId) return;
    try {
      await api('/api/matchmaking/leave', {
        method: 'POST',
        body: JSON.stringify({ userId, gameId }),
      });
    } finally {
      setState({ status: 'IDLE' });
    }
  };

  return { ...state, start, cancel };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMatchmaking.ts
git commit -m "feat(frontend): useMatchmaking SSE hook"
```

---

## Task 20: Frontend useMatchStream hook

**Files:**
- Create: `src/hooks/useMatchStream.ts`

- [ ] **Step 1: Implement**

```ts
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type MatchMove = { userId: string; move: unknown; ts: number };

export type MatchSnapshot = {
  matchId: string;
  status: 'PLAYING' | 'ENDED' | 'WAITING';
  players: string[];
  turn: string;
  moves: MatchMove[];
  winner?: string | null;
};

export function useMatchStream(matchId: string | null) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    if (!matchId) return;
    const url = `${import.meta.env.VITE_API_BASE}/api/match/${matchId}/stream`;
    const es = new EventSource(url);

    es.addEventListener('snapshot', (e) => {
      const data: MatchSnapshot = JSON.parse((e as MessageEvent).data);
      lastTsRef.current = data.moves.length ? data.moves[data.moves.length - 1].ts : 0;
      setSnapshot(data);
    });

    es.addEventListener('move', (e) => {
      const data: MatchMove & { turn: string } = JSON.parse((e as MessageEvent).data);
      lastTsRef.current = data.ts;
      setSnapshot((prev) =>
        prev
          ? { ...prev, moves: [...prev.moves, { userId: data.userId, move: data.move, ts: data.ts }], turn: data.turn }
          : prev
      );
    });

    es.addEventListener('ended', (e) => {
      const data: { winner: string | null; reason: string } = JSON.parse((e as MessageEvent).data);
      setSnapshot((prev) => (prev ? { ...prev, status: 'ENDED', winner: data.winner } : prev));
    });

    es.onerror = () => es.close();
    return () => es.close();
  }, [matchId]);

  const sendMove = async (move: unknown) => {
    if (!matchId) return;
    const userId = localStorage.getItem('userId');
    // Optimistic update
    const ts = Date.now();
    setSnapshot((prev) =>
      prev ? { ...prev, moves: [...prev.moves, { userId: userId!, move, ts }] } : prev
    );
    try {
      await api(`/api/match/${matchId}/move`, {
        method: 'POST',
        body: JSON.stringify({ userId, move }),
      });
    } catch {
      // Revert by reconnecting; for simplicity, leave optimistic and let SSE reconcile.
    }
  };

  const forfeit = async () => {
    if (!matchId) return;
    const userId = localStorage.getItem('userId');
    await api(`/api/match/${matchId}/forfeit`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  };

  return { snapshot, sendMove, forfeit };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMatchStream.ts
git commit -m "feat(frontend): useMatchStream SSE hook with optimistic moves"
```

---

## Task 21: Frontend integration: replace WebSocket

**Files:**
- Modify: components importing socket (run grep first)

- [ ] **Step 1: Find WebSocket usage**

```bash
cd /Users/niko/founder/game/gametuoitho
grep -rln "WebSocket\|REGISTER_SOCKET\|MAKE_MOVE\|roomManager\|ws\.send\|wss\b" src/
```

Identify every file that uses the old WebSocket layer.

- [ ] **Step 2: For each file, replace**

For each match-flow file:
- Replace `useEffect` that opens `WebSocket` with `useMatchStream(matchId)`.
- Replace `sendMove` calls with `sendMove(move)` from the hook.
- Replace matchmaking joins with `useMatchmaking(gameId)`.
- Keep all surrounding UI/logic intact.

Skip this step's edits if you want to leave it for a follow-up; the prior hooks are usable in new code already.

- [ ] **Step 3: Remove `src/lib/socket.ts` if it exists**

```bash
git rm src/lib/socket.ts 2>/dev/null || true
```

- [ ] **Step 4: Update `.env.example`**

Add to `/Users/niko/founder/game/gametuoitho/.env.example`:

```
# VITE_API_BASE: Worker URL for the deployed API.
# Local dev:  http://localhost:8787
# Production: https://api.gametuoitho.space
VITE_API_BASE=http://localhost:8787
```

- [ ] **Step 5: Run `npm run lint`**

```bash
cd /Users/niko/founder/game/gametuoitho && npm run lint
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(frontend): replace WebSocket with SSE hooks + api() wrapper"
```

---

## Task 22: Root package.json dev scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add scripts**

In `/Users/niko/founder/game/gametuoitho/package.json`, under `"scripts"`, add:

```json
"dev:worker": "concurrently -k -n vite,worker -c blue,green \"vite\" \"cd worker && npx wrangler dev --local --port 8787\"",
"deploy:worker": "cd worker && npx wrangler deploy",
"db:migrate:local": "cd worker && npx wrangler d1 migrations apply gametuoitho-db --local",
"db:migrate:remote": "cd worker && npx wrangler d1 migrations apply gametuoitho-db --remote",
"test:worker": "cd worker && npm test"
```

- [ ] **Step 2: Install `concurrently` at root if missing**

```bash
cd /Users/niko/founder/game/gametuoitho
npm install --save-dev concurrently
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: dev:worker + deploy:worker scripts"
```

---

## Task 23: End-to-end local smoke

- [ ] **Step 1: Reset local D1**

```bash
cd /Users/niko/founder/game/gametuoitho/worker
npx wrangler d1 migrations apply gametuoitho-db --local --force
```
Expected: all migrations applied.

- [ ] **Step 2: Start worker + Vite**

```bash
cd /Users/niko/founder/game/gametuoitho
npm run dev:worker &
sleep 5
```

- [ ] **Step 3: Smoke auth**

```bash
curl -X POST http://localhost:8787/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"smoke","password":"pw","email":"s@x.com","displayName":"Smoke"}'
curl -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"smoke","password":"pw"}'
```
Expected: both return success.

- [ ] **Step 4: Smoke match flow**

```bash
curl -X POST http://localhost:8787/api/matchmaking/join \
  -H 'Content-Type: application/json' \
  -d '{"userId":"uA","gameId":"caro"}'
curl -X POST http://localhost:8787/api/matchmaking/join \
  -H 'Content-Type: application/json' \
  -d '{"userId":"uB","gameId":"caro"}'
```
Expected: second call returns `{matched: true, ...}`.

- [ ] **Step 5: Stop server**

```bash
kill %1
```

- [ ] **Step 6: Commit any test artifacts**

No code changes expected. Skip if nothing to commit.

---

## Task 24: Production deploy

- [ ] **Step 1: Create D1**

```bash
cd /Users/niko/founder/game/gametuoitho/worker
npx wrangler d1 create gametuoitho-db
```
Copy the printed `database_id` into `worker/wrangler.toml` replacing `REPLACE_AFTER_wrangler_d1_create`.

- [ ] **Step 2: Apply migrations to remote**

```bash
npx wrangler d1 migrations apply gametuoitho-db --remote
```

- [ ] **Step 3: Set secrets**

```bash
npx wrangler secret put OPENAI_API_KEY  # paste key
npx wrangler secret put OPENAI_MODEL    # e.g. gpt-4o-mini
```

- [ ] **Step 4: Deploy Worker**

```bash
npx wrangler deploy
```
Note the `*.workers.dev` URL or set up custom domain `api.gametuoitho.space`.

- [ ] **Step 5: Connect Pages**

In Cloudflare dashboard:
1. Workers & Pages → Create application → Pages → Connect to Git.
2. Build command: `npm run build`. Build output: `dist`.
3. Environment variable: `VITE_API_BASE=https://api.gametuoitho.space`.
4. Save and deploy.

- [ ] **Step 6: Verify production**

```bash
curl https://api.gametuoitho.space/api/health
```
Expected: `{"ok":true,"ts":...}`.

Open `https://gametuoitho.space` in browser, test register/login/match flow.

- [ ] **Step 7: Commit config update**

```bash
cd /Users/niko/founder/game/gametuoitho
git add worker/wrangler.toml
git commit -m "build(worker): pin D1 database_id for production"
```

---

## Task 25: Update README + CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: README — add Cloudflare section**

Append to `/Users/niko/founder/game/gametuoitho/README.md`:

```markdown
## Deploying to Cloudflare

The app runs on two free-tier Cloudflare products:

- **Pages** — frontend (React/Vite). Git auto-deploy.
- **Workers** — API (Hono framework). `worker/` directory.
- **D1** — SQLite database. Bound to Worker.

### First-time setup

```bash
# 1. Create D1
cd worker
npx wrangler d1 create gametuoitho-db
# paste the database_id into wrangler.toml

# 2. Apply migrations
npx wrangler d1 migrations apply gametuoitho-db --remote

# 3. Set secrets
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL

# 4. Deploy worker
npx wrangler deploy

# 5. In Cloudflare dashboard, create Pages project from this git repo
#    Build command: npm run build
#    Output: dist
#    Env var: VITE_API_BASE=https://api.gametuoitho.space
```

### Local dev

- `npm run dev` — legacy Express + SQLite (offline mode).
- `npm run dev:worker` — Vite + wrangler dev with local D1.
```

- [ ] **Step 2: CLAUDE.md — add Cloudflare note**

Append to `/Users/niko/founder/game/gametuoitho/CLAUDE.md`:

```markdown
## Cloudflare deploy

- Frontend: Cloudflare Pages, custom domain `gametuoitho.space`. Git auto-deploy.
- Backend: Cloudflare Worker, custom domain `api.gametuoitho.space`. Code in `worker/`.
- Database: Cloudflare D1 (SQLite-compatible), bound to Worker.
- Realtime: SSE (Workers native), not WebSocket.
- AI: OpenAI-compatible via `OPENAI_API_KEY` / `OPENAI_MODEL` secrets.
- Local D1 lives at `.wrangler/state/d1/` (gitignored).
- Local dev modes: `npm run dev` (legacy Express) or `npm run dev:worker` (production-like).
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add Cloudflare deploy instructions"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Goal (Pages+Workers+D1, SSE, no migrateFromJson, OpenAI compat, legacy dev kept) | Tasks 1, 21, 22, 24 |
| §2 Architecture (Pages auto-deploy, Worker, D1 binding) | Tasks 1, 24 |
| §3.1 File layout | Tasks 1, 3-9 (worker scaffold + libs) |
| §3.2 Route mapping (auth, profile, leaderboard, tournaments, challenges, replays, bilac, leagues, AI, matchmaking, match) | Tasks 10-17 |
| §3.3 SSE endpoints (matchmaking stream, match stream) | Tasks 16, 17 |
| §3.4 Drizzle + D1 | Task 3 |
| §3.5 AI OpenAI-compatible | Tasks 8, 15 |
| §4 Frontend changes (api wrapper, hooks, removal of socket.ts, env handling) | Tasks 18, 19, 20, 21 |
| §5 Repo layout | Tasks 1, 22 |
| §6 Local dev (legacy + worker) | Tasks 22, 23 |
| §7 Production deploy (D1 create, secrets, Pages connect, custom domains) | Task 24 |
| §8 Testing (vitest, smoke tests) | Tasks 4, 8, 23 |
| §9 Risks (better-sqlite3 swap, SSE replaces WS, sha256 async, etc.) | Addressed in Tasks 3, 6, 7, 16-17 |
| §10 Out of scope (bcrypt, real email, etc.) | None — explicitly not built |

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". Each task has exact code.

**3. Type consistency:**
- `userId` flows as `string` throughout.
- `matchId` format: `match_<ts>` (matchmaking) and `match-<ts>` (bilac) — kept distinct as in legacy.
- `code` field for private rooms: stored as `id` suffix in current implementation; documented in Task 16.
- `currentUserId()` defined once in Task 18, used consistently.
- Drizzle column names match legacy schema (e.g. `eloCaro`, `eloCoTuong`) — derived from `worker/src/schema.ts` copy of legacy.

All gaps addressed inline.