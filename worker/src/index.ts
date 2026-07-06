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
