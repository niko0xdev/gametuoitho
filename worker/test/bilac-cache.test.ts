import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { bilacNoStore } from '../src/lib/bilac-cache';

const app = new Hono();
app.use('/api/bilac/*', bilacNoStore);
app.get('/api/bilac/matches', c => c.json({ error: 'Missing tournament' }, 401));
app.get('/', c => c.text('OK'));

describe('Bi Lac HTTP cache policy', () => {
  it('marks even rejected API responses no-store', async () => {
    // No tournament headers: authentication rejects before any D1 query.
    const response = await app.request('/api/bilac/matches');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('does not apply tournament cache policy to unrelated routes', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});
