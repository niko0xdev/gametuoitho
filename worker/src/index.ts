// worker/src/index.ts
import { Hono } from 'hono';
import { cors } from './lib/cors';
import { bilacNoStore } from './lib/bilac-cache';
import type { Bindings } from './db';
import { healthRoute } from './routes/health';
import { authRoute } from './routes/auth';
import { profileRoute } from './routes/profile';
import { leaderboardRoute } from './routes/leaderboard';
import { tournamentsRoute } from './routes/tournaments';
import { challengesRoute } from './routes/challenges';
import { replaysRoute } from './routes/replays';
import { bilacRoute } from './routes/bilac';
import { leaguesRoute } from './routes/leagues';
import { aiRoute } from './routes/ai';
import { matchmakingRoute } from './routes/matchmaking';
import { matchRoute } from './routes/match';
// Durable Object classes must be exported from the Worker entrypoint.
export { MatchDO } from './do/match';
export { MatchmakingDO } from './do/matchmaking';
export { GameServerDO } from './do/gameserver';

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors());
// Tournament/player/match responses are user-scoped and change during play.
// Never let a browser or intermediary reuse an old Bi Lac API response.
app.use('/api/bilac/*', bilacNoStore);
app.route('/api/health', healthRoute);
app.route('/api/auth', authRoute);
app.route('/api/profile', profileRoute);
app.route('/api/leaderboard', leaderboardRoute);
app.route('/api/tournaments', tournamentsRoute);
app.route('/api/challenges', challengesRoute);
app.route('/api/replays', replaysRoute);
app.route('/api/replay', replaysRoute);
app.route('/api/bilac', bilacRoute);
app.route('/api/ai', aiRoute);
app.route('/api', leaguesRoute);
app.route('/api', matchmakingRoute);
app.route('/api', matchRoute);

// Legacy WS game/lobby protocol -> GameServerDO (single global instance).
app.get('/api/ws', async (c) => {
  const id = c.env.GAMESERVER_DO.idFromName('global');
  return c.env.GAMESERVER_DO.get(id).fetch(c.req.raw);
});

// Who's online (lobby invite UI polls this).
app.get('/api/online-users', async (c) => {
  const stub = c.env.GAMESERVER_DO.get(c.env.GAMESERVER_DO.idFromName('global'));
  const ids = await stub.getOnlineUsers();
  const exclude = c.req.query('exclude');
  const filtered = exclude ? ids.filter((u: string) => u !== exclude) : ids;
  if (filtered.length === 0) return c.json([]);
  const placeholders = filtered.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT id, displayName, avatar FROM users WHERE id IN (${placeholders})`,
  ).bind(...filtered).all();
  return c.json(rows.results);
});

app.get('/', (c) => c.text('gametuoitho API'));
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  // F4: don't leak internal error details (D1 SQL, table names, etc.) to clients.
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}] Worker error:`, err);
  return c.json({ error: 'Internal error', requestId }, 500);
});
// Cron: prune unverified accounts older than 24h — anti D1 bloat from signup
// spam that cleared the rate limit but never verified. Runs every 6h (see
// wrangler.toml [triggers]).
async function pruneUnverified(env: Bindings) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    'DELETE FROM profiles WHERE id IN (SELECT id FROM users WHERE email_verified = 0 AND created_at < ?1)',
  ).bind(cutoff).run();
  await env.DB.prepare(
    'DELETE FROM users WHERE email_verified = 0 AND created_at < ?1',
  ).bind(cutoff).run();
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(pruneUnverified(env));
  },
};
