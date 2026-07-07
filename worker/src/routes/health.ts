// worker/src/routes/health.ts
import { Hono } from 'hono';
import type { Bindings } from '../db';

export const healthRoute = new Hono<{ Bindings: Bindings }>().get('/', (c) =>
  c.json({ ok: true, ts: Date.now() })
);
