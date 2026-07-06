// Direct middleware tests for uncovered branches.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db } from '../server/db.ts';
import { checkBiLacTournamentAccess, requireBiLacMember, requireBiLacOwner, requireLoggedIn, getRequestUserId } from '../server/handlers/_middleware.ts';

before(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeRes() {
  const r: any = {
    statusCode: 0,
    body: null,
    status(c: number) { r.statusCode = c; return r; },
    json(o: any) { r.body = o; return r; },
  };
  return r;
}

describe('getRequestUserId', () => {
  it('returns null for missing/empty header', () => {
    assert.equal(getRequestUserId({ headers: {}, body: {}, query: {} }), null);
    assert.equal(getRequestUserId({ headers: { 'x-user-id': '' }, body: {}, query: {} }), null);
    assert.equal(getRequestUserId({ headers: { 'x-user-id': 123 }, body: {}, query: {} }), null);
  });
  it('reads from header, body, query', () => {
    assert.equal(getRequestUserId({ headers: { 'x-user-id': 'a' }, body: {}, query: {} }), 'a');
    assert.equal(getRequestUserId({ headers: {}, body: { userId: 'b' }, query: {} }), 'b');
    assert.equal(getRequestUserId({ headers: {}, body: {}, query: { userId: 'c' } }), 'c');
  });
  it('trims whitespace', () => {
    assert.equal(getRequestUserId({ headers: { 'x-user-id': '  d  ' }, body: {}, query: {} }), 'd');
  });
});

describe('requireLoggedIn', () => {
  it('401s without uid', () => {
    const res = makeRes();
    const out = requireLoggedIn({ headers: {}, body: {}, query: {} }, res);
    assert.equal(out, null);
    assert.equal(res.statusCode, 401);
  });
  it('401s when user not in db', () => {
    db.saveUser({ id: 'rl_alive', username: 'rlalive', email: 'rl@x.com', passwordHash: 'h', displayName: 'R', avatar: 'a', role: 'user' });
    const res = makeRes();
    const out = requireLoggedIn({ headers: { 'x-user-id': '__nobody__' }, body: {}, query: {} }, res);
    assert.equal(out, null);
    assert.equal(res.statusCode, 401);
  });
  it('returns uid when user exists', () => {
    db.saveUser({ id: 'rl_ok', username: 'rlok', email: 'rlok@x.com', passwordHash: 'h', displayName: 'R', avatar: 'a', role: 'user' });
    const res = makeRes();
    const out = requireLoggedIn({ headers: { 'x-user-id': 'rl_ok' }, body: {}, query: {} }, res);
    assert.equal(out, 'rl_ok');
  });
});

describe('checkBiLacTournamentAccess', () => {
  it('401s without tournament id', () => {
    const res = makeRes();
    let nextCalled = false;
    checkBiLacTournamentAccess({ headers: {}, query: {} }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });
  it('404s for unknown tournament', () => {
    db.saveUser({ id: 'cb_user', username: 'cbuser', email: 'cb@x.com', passwordHash: 'h', displayName: 'C', avatar: 'a', role: 'user' });
    const res = makeRes();
    checkBiLacTournamentAccess({
      headers: { 'x-tournament-id': 'unknown', 'x-tournament-code': 'x', 'x-user-id': 'cb_user' },
      query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 404);
  });
  it('403s on wrong code', () => {
    const owner = uniq('cbOwn');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'cb_t', name: 'CBT', code: 'RIGHT', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'cb_m', tournamentId: 'cb_t', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    checkBiLacTournamentAccess({
      headers: { 'x-tournament-id': 'cb_t', 'x-tournament-code': 'WRONG', 'x-user-id': owner },
      query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 403);
  });
  it('403s when user is not a member', () => {
    const owner = uniq('cbOwner');
    const stranger = uniq('cbStr');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveUser({ id: stranger, username: stranger, email: `${stranger}@x.com`, passwordHash: 'h', displayName: stranger, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'cb_t2', name: 'CBT2', code: 'C2', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'cb_m2', tournamentId: 'cb_t2', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    checkBiLacTournamentAccess({
      headers: { 'x-tournament-id': 'cb_t2', 'x-tournament-code': 'C2', 'x-user-id': stranger },
      query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 403);
  });
  it('calls next() on success', () => {
    const owner = uniq('cbOk');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'cb_t3', name: 'CBT3', code: 'C3', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'cb_m3', tournamentId: 'cb_t3', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    let nextCalled = false;
    const req: any = {
      headers: { 'x-tournament-id': 'cb_t3', 'x-tournament-code': 'C3', 'x-user-id': owner },
      query: {}
    };
    checkBiLacTournamentAccess(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.tournamentId, 'cb_t3');
    assert.equal(req.userId, owner);
  });
  it('uses query.tournamentId fallback', () => {
    const owner = uniq('cbQ');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'cb_tq', name: 'CBTQ', code: 'CQ', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'cb_mq', tournamentId: 'cb_tq', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    let nextCalled = false;
    checkBiLacTournamentAccess({
      headers: { 'x-user-id': owner },
      query: { tournamentId: 'cb_tq', code: 'CQ' }
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

describe('requireBiLacMember', () => {
  it('400s without tournamentId', () => {
    const uid = uniq('rmbNoT');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    const res = makeRes();
    requireBiLacMember({ headers: { 'x-user-id': uid }, body: {}, query: {} }, res, () => {});
    assert.equal(res.statusCode, 400);
  });
  it('404s for unknown tournament', () => {
    const uid = uniq('rmb404');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    const res = makeRes();
    requireBiLacMember({
      headers: { 'x-user-id': uid, 'x-tournament-id': 'unknown', 'x-tournament-code': 'x' },
      body: {}, query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 404);
  });
  it('403s on wrong code', () => {
    const uid = uniq('rmbW');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'rmb_t', name: 'RMBT', code: 'A', description: 'd', createdAt: Date.now() });
    const res = makeRes();
    requireBiLacMember({
      headers: { 'x-user-id': uid, 'x-tournament-id': 'rmb_t', 'x-tournament-code': 'WRONG' },
      body: {}, query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 403);
  });
  it('403s when not member', () => {
    const owner = uniq('rmbOwn');
    const stranger = uniq('rmbStr');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveUser({ id: stranger, username: stranger, email: `${stranger}@x.com`, passwordHash: 'h', displayName: stranger, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'rmb_t2', name: 'RMBT2', code: 'A2', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'rmb_m', tournamentId: 'rmb_t2', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    requireBiLacMember({
      headers: { 'x-user-id': stranger, 'x-tournament-id': 'rmb_t2', 'x-tournament-code': 'A2' },
      body: {}, query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 403);
  });
  it('calls next() on success', () => {
    const uid = uniq('rmbOK');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'rmb_t3', name: 'RMBT3', code: 'A3', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'rmb_m3', tournamentId: 'rmb_t3', userId: uid, username: uid, displayName: uid, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    let nextCalled = false;
    requireBiLacMember({
      headers: { 'x-user-id': uid, 'x-tournament-id': 'rmb_t3', 'x-tournament-code': 'A3' },
      body: {}, query: {}
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

describe('requireBiLacOwner', () => {
  it('400s without tournamentId', () => {
    const uid = uniq('rboNoT');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    const res = makeRes();
    requireBiLacOwner({ headers: { 'x-user-id': uid }, body: {}, query: {} }, res, () => {});
    assert.equal(res.statusCode, 400);
  });
  it('404s for unknown tournament', () => {
    const uid = uniq('rbo404');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    const res = makeRes();
    requireBiLacOwner({
      headers: { 'x-user-id': uid, 'x-tournament-id': 'unknown', 'x-tournament-code': 'x' },
      body: {}, query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 404);
  });
  it('403s on wrong code', () => {
    const uid = uniq('rboW');
    db.saveUser({ id: uid, username: uid, email: `${uid}@x.com`, passwordHash: 'h', displayName: uid, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'rbo_t', name: 'RBOT', code: 'A', description: 'd', createdAt: Date.now() });
    const res = makeRes();
    requireBiLacOwner({
      headers: { 'x-user-id': uid, 'x-tournament-id': 'rbo_t', 'x-tournament-code': 'WRONG' },
      body: {}, query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 403);
  });
  it('403s when member (not owner)', () => {
    const owner = uniq('rboOwn');
    const member = uniq('rboMem');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveUser({ id: member, username: member, email: `${member}@x.com`, passwordHash: 'h', displayName: member, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'rbo_t2', name: 'RBOT2', code: 'A2', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'rbo_o', tournamentId: 'rbo_t2', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'rbo_m', tournamentId: 'rbo_t2', userId: member, username: member, displayName: member, role: 'member', joinedAt: Date.now() });
    const res = makeRes();
    requireBiLacOwner({
      headers: { 'x-user-id': member, 'x-tournament-id': 'rbo_t2', 'x-tournament-code': 'A2' },
      body: {}, query: {}
    }, res, () => {});
    assert.equal(res.statusCode, 403);
  });
  it('calls next() when owner', () => {
    const owner = uniq('rboOK');
    db.saveUser({ id: owner, username: owner, email: `${owner}@x.com`, passwordHash: 'h', displayName: owner, avatar: 'a', role: 'user' });
    db.saveBiLacTournament({ id: 'rbo_t3', name: 'RBOT3', code: 'A3', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({ id: 'rbo_o3', tournamentId: 'rbo_t3', userId: owner, username: owner, displayName: owner, role: 'owner', joinedAt: Date.now() });
    const res = makeRes();
    let nextCalled = false;
    requireBiLacOwner({
      headers: { 'x-user-id': owner, 'x-tournament-id': 'rbo_t3', 'x-tournament-code': 'A3' },
      body: {}, query: {}
    }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});