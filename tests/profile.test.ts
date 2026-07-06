import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db } from '../server/db.ts';

before(() => { getApp(); });

describe('GET /api/profile/:userId', () => {
  it('returns profile for existing user', async () => {
    db.saveProfile({ id: 'prof_a', displayName: 'PA', avatar: 'a', elo: {} as any, honorScore: 100, badges: [] });
    db.saveUser({ id: 'prof_a', username: 'pa_user', email: 'pa@x.com', passwordHash: 'h', displayName: 'PA', avatar: 'a', role: 'user' });
    const res = await request(getApp()).get('/api/profile/prof_a');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 'prof_a');
    assert.equal(res.body.role, 'user');
  });
  it('returns default profile for missing user', async () => {
    const res = await request(getApp()).get('/api/profile/__nonexistent__');
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'user');
  });
  it('returns admin role for user_a', async () => {
    const res = await request(getApp()).get('/api/profile/user_a');
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
  });
});

describe('GET /api/online-users', () => {
  it('returns list (empty when no sockets)', async () => {
    const res = await request(getApp()).get('/api/online-users');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
  it('handles exclude query param', async () => {
    const res = await request(getApp()).get('/api/online-users?exclude=user_a');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('POST /api/profile/:userId/update', () => {
  it('updates displayName and avatar', async () => {
    db.saveUser({ id: 'upd', username: 'upduser', email: 'u@x.com', passwordHash: 'h', displayName: 'Old', avatar: 'old.png', role: 'user' });
    db.saveProfile({ id: 'upd', displayName: 'Old', avatar: 'old.png', elo: {} as any, honorScore: 100, badges: [] });
    const res = await request(getApp()).post('/api/profile/upd/update', { displayName: 'New', avatar: 'new.png' });
    assert.equal(res.status, 200);
    assert.equal(res.body.displayName, 'New');
    assert.equal(res.body.avatar, 'new.png');
  });
  it('handles missing user (lazy-init)', async () => {
    const res = await request(getApp()).post('/api/profile/__nonexistent_user__/update', { displayName: 'Lazy' });
    assert.equal(res.status, 200);
    assert.equal(res.body.displayName, 'Lazy');
  });
});

describe('POST /api/profile/:userId/reset-elo', () => {
  it('resets all elo to 1500', async () => {
    db.saveProfile({
      id: 'reset_u', displayName: 'R', avatar: 'a',
      elo: { caro: 2000, co_tuong: 2000, co_vua: 2000, o_an_quan: 2000, co_ca_ngua: 2000, duoi_hinh_bat_chu: 2000, noi_chu: 2000, doan_tu: 2000 } as any,
      honorScore: 100, badges: []
    });
    const res = await request(getApp()).post('/api/profile/reset_u/reset-elo');
    assert.equal(res.status, 200);
    assert.equal(res.body.elo.caro, 1500);
    assert.equal(res.body.elo.co_tuong, 1500);
  });
});