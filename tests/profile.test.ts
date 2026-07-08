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
  it('updates displayName and avatar for the owner', async () => {
    db.saveUser({ id: 'upd', username: 'upduser', email: 'u@x.com', passwordHash: 'h', displayName: 'Old', avatar: 'old.png', role: 'user' });
    db.saveProfile({ id: 'upd', displayName: 'Old', avatar: 'old.png', elo: {} as any, honorScore: 100, badges: [] });
    const res = await request(getApp()).post('/api/profile/upd/update', { displayName: 'New', avatar: 'new.png' }, { 'x-user-id': 'upd' });
    assert.equal(res.status, 200);
    assert.equal(res.body.displayName, 'New');
    assert.equal(res.body.avatar, 'new.png');
  });
  it('lazy-inits the profile for a real owner without one', async () => {
    db.saveUser({ id: 'upd_lazy', username: 'updlazy', email: 'ul@x.com', passwordHash: 'h', displayName: 'L', avatar: 'a', role: 'user' });
    const res = await request(getApp()).post('/api/profile/upd_lazy/update', { displayName: 'Lazy' }, { 'x-user-id': 'upd_lazy' });
    assert.equal(res.status, 200);
    assert.equal(res.body.displayName, 'Lazy');
  });
  it('403s when a different user edits someone else profile', async () => {
    db.saveUser({ id: 'upd_victim', username: 'updvd', email: 'vd@x.com', passwordHash: 'h', displayName: 'V', avatar: 'a', role: 'user' });
    db.saveUser({ id: 'upd_atk', username: 'updatk', email: 'at@x.com', passwordHash: 'h', displayName: 'A', avatar: 'a', role: 'user' });
    const res = await request(getApp()).post('/api/profile/upd_victim/update', { displayName: 'Hacked' }, { 'x-user-id': 'upd_atk' });
    assert.equal(res.status, 403);
  });
  it('401s without x-user-id', async () => {
    db.saveUser({ id: 'upd_noauth', username: 'updna', email: 'n@x.com', passwordHash: 'h', displayName: 'N', avatar: 'a', role: 'user' });
    const res = await request(getApp()).post('/api/profile/upd_noauth/update', { displayName: 'X' });
    assert.equal(res.status, 401);
  });
});

describe('POST /api/profile/:userId/reset-elo', () => {
  it('resets all elo to 1500 for the owner', async () => {
    db.saveUser({ id: 'reset_u', username: 'resetu', email: 'ru@x.com', passwordHash: 'h', displayName: 'R', avatar: 'a', role: 'user' });
    db.saveProfile({
      id: 'reset_u', displayName: 'R', avatar: 'a',
      elo: { caro: 2000, co_tuong: 2000, co_vua: 2000, o_an_quan: 2000, co_ca_ngua: 2000, duoi_hinh_bat_chu: 2000, noi_chu: 2000, doan_tu: 2000 } as any,
      honorScore: 100, badges: []
    });
    const res = await request(getApp()).post('/api/profile/reset_u/reset-elo', {}, { 'x-user-id': 'reset_u' });
    assert.equal(res.status, 200);
    assert.equal(res.body.elo.caro, 1500);
    assert.equal(res.body.elo.co_tuong, 1500);
  });
  it('403s when a different user resets someone else elo', async () => {
    db.saveUser({ id: 'reset_v', username: 'resetv', email: 'rv@x.com', passwordHash: 'h', displayName: 'R', avatar: 'a', role: 'user' });
    db.saveUser({ id: 'reset_a', username: 'reseta', email: 'ra@x.com', passwordHash: 'h', displayName: 'A', avatar: 'a', role: 'user' });
    const res = await request(getApp()).post('/api/profile/reset_v/reset-elo', {}, { 'x-user-id': 'reset_a' });
    assert.equal(res.status, 403);
  });
});