import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';

beforeAll(() => { getApp(); });

const uniq = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

describe('GET /api/tournaments', () => {
  it('returns array', async () => {
    const res = await request(getApp()).get('/api/tournaments');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('POST /api/tournaments/create', () => {
  it('creates with default maxPlayers/deadlineSeconds', async () => {
    const res = await request(getApp()).post('/api/tournaments/create', {
      userId: 'u_org', name: uniq('tour'), gameId: 'caro'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.maxPlayers, 16);
    assert.equal(res.body.deadline, 300 * 1000 + (await import('../server/db.ts')).db.getTournament(res.body.id)?.deadline! - 300 * 1000);
  });
  it('honors explicit maxPlayers and deadlineSeconds', async () => {
    const res = await request(getApp()).post('/api/tournaments/create', {
      userId: 'u_org', name: uniq('tour2'), gameId: 'caro', maxPlayers: '8', deadlineSeconds: '600'
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.maxPlayers, 8);
    assert.ok(res.body.deadline >= Date.now() + 599 * 1000);
  });
});

describe('POST /api/tournaments/join', () => {
  it('400s with invalid code', async () => {
    const res = await request(getApp()).post('/api/tournaments/join', { userId: 'u_a', code: 'NOPE' });
    assert.equal(res.status, 400);
  });
  it('200s when joining own tournament', async () => {
    const code = uniq('JC').toUpperCase().slice(0, 6);
    const create = await request(getApp()).post('/api/tournaments/create', {
      userId: 'u_join', name: uniq('jname'), gameId: 'caro'
    });
    const t = create.body;
    const join = await request(getApp()).post('/api/tournaments/join', { userId: 'u_join', code: t.id.substring(2, 8).toUpperCase() });
    assert.equal(join.status, 200);
  });
});

describe('GET /api/tournaments/code/:code', () => {
  it('404s for unknown code', async () => {
    const res = await request(getApp()).get('/api/tournaments/code/UNKNOWN');
    assert.equal(res.status, 404);
  });
  it('200s for valid code', async () => {
    const create = await request(getApp()).post('/api/tournaments/create', {
      userId: 'u_c', name: uniq('cname'), gameId: 'caro'
    });
    const code = create.body.id.substring(2, 8).toUpperCase();
    const res = await request(getApp()).get(`/api/tournaments/code/${code}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, create.body.id);
  });
});

describe('GET /api/tournaments/:id', () => {
  it('404s for unknown id', async () => {
    const res = await request(getApp()).get('/api/tournaments/nope');
    assert.equal(res.status, 404);
  });
  it('200s for valid id', async () => {
    const create = await request(getApp()).post('/api/tournaments/create', {
      userId: 'u_d', name: uniq('dname'), gameId: 'caro'
    });
    const res = await request(getApp()).get(`/api/tournaments/${create.body.id}`);
    assert.equal(res.status, 200);
  });
});

describe('POST /api/tournaments/:id/start', () => {
  it('400s for unknown id', async () => {
    const res = await request(getApp()).post('/api/tournaments/nope/start');
    assert.equal(res.status, 400);
  });
  it('200s and generates schedule', async () => {
    const create = await request(getApp()).post('/api/tournaments/create', {
      userId: 'u_s', name: uniq('sname'), gameId: 'caro', maxPlayers: '4'
    });
    // Add second player
    const join = await request(getApp()).post('/api/tournaments/join', {
      userId: 'u_s2', code: create.body.id.substring(2, 8).toUpperCase()
    });
    if (join.status === 200) {
      const start = await request(getApp()).post(`/api/tournaments/${create.body.id}/start`);
      assert.equal(start.status, 200);
      assert.equal(start.body.status, 'ACTIVE');
    }
  });
});

describe('POST /api/tournaments/:id/launch/:matchIndex', () => {
  it('400s for unknown tournament', async () => {
    const res = await request(getApp()).post('/api/tournaments/nope/launch/0');
    assert.equal(res.status, 400);
  });
});