import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db } from '../server/db.ts';

before(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

describe('GET /api/leagues', () => {
  it('returns leagues without auth', async () => {
    const res = await request(getApp()).get('/api/leagues');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
  it('403s when userId query has no permission', async () => {
    db.saveUser({
      id: 'lg_user_noperm', username: 'lgusernoperm', email: 'lgn@x.com',
      passwordHash: 'h', displayName: 'L', avatar: 'a', role: 'user'
    });
    const res = await request(getApp()).get('/api/leagues?userId=lg_user_noperm');
    assert.equal(res.status, 403);
  });
  it('200s when userId has permission', async () => {
    db.saveUser({
      id: 'lg_user_perm', username: 'lguserperm', email: 'lgp@x.com',
      passwordHash: 'h', displayName: 'L', avatar: 'a', role: 'user'
    });
    db.saveLeaguePermissions({ lg_user_perm: true });
    const res = await request(getApp()).get('/api/leagues?userId=lg_user_perm');
    assert.equal(res.status, 200);
  });
});

describe('POST /api/leagues', () => {
  before(() => {
    db.saveUser({ id: 'lg_write', username: 'lgwrite', email: 'lgw@x.com', passwordHash: 'h', displayName: 'L', avatar: 'a', role: 'user' });
    db.saveUser({ id: 'lg_nope', username: 'lgnope', email: 'lgn2@x.com', passwordHash: 'h', displayName: 'N', avatar: 'a', role: 'user' });
    db.saveLeaguePermissions({ lg_write: true });
  });
  it('401s without userId', async () => {
    const res = await request(getApp()).post('/api/leagues', { id: 'x', name: 'X' });
    assert.equal(res.status, 401);
  });
  it('403s without permission', async () => {
    const res = await request(getApp()).post('/api/leagues?userId=lg_nope', { id: 'x', name: 'X' });
    assert.equal(res.status, 403);
  });
  it('400s on invalid body (permitted caller)', async () => {
    const res = await request(getApp()).post('/api/leagues?userId=lg_write', {});
    assert.equal(res.status, 400);
  });
  it('200s creating (permitted caller)', async () => {
    const id = uniq('lg');
    const res = await request(getApp()).post('/api/leagues?userId=lg_write', {
      id, name: 'Test', sport: 'futsal', format: 'round_robin', status: 'ACTIVE',
      createdAt: new Date().toISOString(), teams: [], matches: []
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, id);
  });
});

describe('PUT /api/leagues/:id', () => {
  it('403s without permission', async () => {
    const res = await request(getApp()).put('/api/leagues/anything?userId=lg_nope', { id: 'a', name: 'A' });
    assert.equal(res.status, 403);
  });
  it('400s on invalid body (permitted caller)', async () => {
    const res = await request(getApp()).put('/api/leagues/anything?userId=lg_write', {});
    assert.equal(res.status, 400);
  });
  it('200s updating (permitted caller)', async () => {
    const id = uniq('lgp');
    await request(getApp()).post('/api/leagues?userId=lg_write', {
      id, name: 'Old', sport: 'futsal', format: 'knockout', status: 'ACTIVE',
      createdAt: new Date().toISOString(), teams: [], matches: []
    });
    const res = await request(getApp()).put(`/api/leagues/${id}?userId=lg_write`, {
      id, name: 'New', sport: 'futsal', format: 'knockout', status: 'ENDED',
      createdAt: new Date().toISOString(), teams: [], matches: []
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'New');
  });
});

describe('DELETE /api/leagues/:id', () => {
  it('403s without permission', async () => {
    const res = await request(getApp()).delete('/api/leagues/__nope__?userId=lg_nope');
    assert.equal(res.status, 403);
  });
  it('200s (idempotent) for permitted caller', async () => {
    const res = await request(getApp()).delete('/api/leagues/__nope__?userId=lg_write');
    assert.equal(res.status, 200);
  });
});

describe('GET /api/leagues-permissions', () => {
  it('returns permissions object', async () => {
    const res = await request(getApp()).get('/api/leagues-permissions');
    assert.equal(res.status, 200);
    assert.ok(res.body.permissions);
  });
});

describe('POST /api/leagues-permissions/toggle', () => {
  it('400s without targetUserId', async () => {
    const res = await request(getApp()).post('/api/leagues-permissions/toggle', {});
    assert.equal(res.status, 400);
  });
  it('toggles permission', async () => {
    const tgt = uniq('tgt');
    db.saveUser({
      id: tgt, username: tgt.toLowerCase(), email: `${tgt}@x.com`,
      passwordHash: 'h', displayName: tgt, avatar: 'a', role: 'user'
    });
    const r1 = await request(getApp()).post('/api/leagues-permissions/toggle', { targetUserId: tgt });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.permissions[tgt], true);
    const r2 = await request(getApp()).post('/api/leagues-permissions/toggle', { targetUserId: tgt });
    assert.equal(r2.body.permissions[tgt], false);
  });
});