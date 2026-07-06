// worker/src/index.ts
import { Hono } from 'hono';
import { cors } from './lib/cors';
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

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors());
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
app.get('/', (c) => c.text('gametuoitho API'));
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});
export default { fetch: app.fetch };
