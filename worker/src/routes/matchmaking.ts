// worker/src/routes/matchmaking.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { matchesTable } from '../schema';
import { sseStream } from '../lib/sse';
import { addMatchmaking, sendToMatchmaking } from '../lib/state';

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
        createdAt: Date.now(), updatedAt: Date.now(),
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
  const db = createDb(c.env);
  const id = 'pr_' + Date.now();
  await db.insert(matchesTable).values({
    id, gameId, status: 'WAITING',
    players: JSON.stringify([userId]),
    turn: userId, moves: '[]', viewers: '[]',
    createdAt: Date.now(), updatedAt: Date.now(), privateCode: code,
  } as any);
  return c.json({ code, matchId: id });
});

matchmakingRoute.post('/private-room/join', async (c) => {
  const { userId, code } = await c.req.json();
  const db = createDb(c.env);
  const all = await db.select().from(matchesTable).all();
  const m = all.find((x: any) => x.privateCode === code);
  if (!m) return c.json({ error: 'Không tìm thấy phòng!' }, 404);
  if ((m as any).status !== 'WAITING') return c.json({ error: 'Phòng đã đầy!' }, 400);
  await db.update(matchesTable).set({
    players: JSON.stringify([JSON.parse((m as any).players)[0], userId]),
    status: 'PLAYING',
    updatedAt: Date.now(),
  } as any).where(eq(matchesTable.id, (m as any).id));
  return c.json({ matchId: (m as any).id });
});

matchmakingRoute.post('/match/invite', async (c) => {
  const { fromUserId, targetUserId, gameId, code } = await c.req.json();
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
