import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, request } from './_bootstrap.ts';
import { db } from '../server/db.ts';

before(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function makeUser(id: string, username: string) {
  db.saveUser({
    id, username: username.toLowerCase(), email: `${username}@x.com`,
    passwordHash: 'h', displayName: username, avatar: 'a', role: 'user'
  });
}

// Create a user + league and return the league id/code/slug + owner id.
async function setupLeague(ownerId?: string) {
  const uid = ownerId || uniq('lg_owner');
  if (!db.getUser(uid)) await makeUser(uid, uid);
  const code = uniq('C').slice(0, 8);
  const res = await request(getApp()).post('/api/leagues', {
    name: uniq('lg_t'), sport: 'futsal', format: 'round_robin', status: 'ACTIVE',
    createdAt: new Date().toISOString(), code, description: 'd',
    teams: [{ id: 't1', name: 'A', logoColor: 'bg-red-500' }, { id: 't2', name: 'B', logoColor: 'bg-blue-500' }],
    matches: [{ id: 'm1', round: 1, home: 't1', away: 't2', homeScore: null, awayScore: null, isPlayed: false }],
  }, { 'x-user-id': uid });
  return { id: res.body.league.id, code, slug: res.body.league.slug, ownerId: uid };
}

function leagueHeaders(id: string, code: string, uid: string) {
  return { 'x-user-id': uid, 'x-league-id': id, 'x-league-code': code };
}

describe('POST /api/leagues', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).post('/api/leagues', { name: 'X', code: 'Y' });
    assert.equal(res.status, 401);
  });
  it('400s when name empty', async () => {
    const uid = uniq('lg_n1'); await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/leagues', { name: '', code: 'x' }, { 'x-user-id': uid });
    assert.equal(res.status, 400);
  });
  it('400s when code empty', async () => {
    const uid = uniq('lg_n2'); await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/leagues', { name: 'X', code: '' }, { 'x-user-id': uid });
    assert.equal(res.status, 400);
  });
  it('creates with slug + auto-joins owner', async () => {
    const { id, slug, ownerId } = await setupLeague();
    assert.ok(slug, 'slug generated');
    assert.ok(/^[0-9a-z]{8}$/.test(slug), 'slug is 8-char base36');
    assert.ok(db.isMyLeagueOwner(id, ownerId));
    assert.ok(db.isMyLeagueMember(id, ownerId));
  });
  it('ignores body.id — never overwrites an existing league', async () => {
    const first = await setupLeague();
    const uid = uniq('lg_col'); await makeUser(uid, uid);
    // Attacker POSTs with the existing league's id, trying to hijack it.
    const res = await request(getApp()).post('/api/leagues', {
      id: first.id, name: 'Hijacked', sport: 'futsal', format: 'round_robin', status: 'ACTIVE',
      createdAt: new Date().toISOString(), code: 'stolen', teams: [], matches: []
    }, { 'x-user-id': uid });
    assert.equal(res.status, 200);
    assert.notEqual(res.body.league.id, first.id, 'server generated a fresh id');
    // Original league is untouched.
    const original = db.getMyLeague(first.id)!;
    assert.equal(original.name.startsWith('lg_t'), true);
    assert.equal(original.code, first.code);
    assert.equal(db.isMyLeagueOwner(first.id, first.ownerId), true);
    assert.equal(db.isMyLeagueMember(first.id, uid), false, 'attacker did not become a member of the original');
  });
});

describe('GET /api/leagues', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).get('/api/leagues');
    assert.equal(res.status, 401);
  });
  it('returns list with role/isMember and NO code leak', async () => {
    const { id, ownerId } = await setupLeague();
    const res = await request(getApp()).get('/api/leagues', undefined, { 'x-user-id': ownerId });
    assert.equal(res.status, 200);
    const me = res.body.find((l: any) => l.id === id);
    assert.ok(me, 'league is in the list');
    assert.equal(me.isMember, true);
    assert.equal(me.role, 'owner');
    assert.equal(me.code, undefined, 'access code must never be exposed');
  });
});

describe('GET /api/leagues/by-slug/:slug', () => {
  it('400s on malformed slug', async () => {
    const res = await request(getApp()).get('/api/leagues/by-slug/UPPER!?code=x');
    assert.equal(res.status, 400);
  });
  it('404s when missing', async () => {
    const res = await request(getApp()).get('/api/leagues/by-slug/zzzzzzzz?code=x');
    assert.equal(res.status, 404);
  });
  it('403s with wrong code', async () => {
    const { slug } = await setupLeague();
    const res = await request(getApp()).get(`/api/leagues/by-slug/${slug}?code=wrong`);
    assert.equal(res.status, 403);
  });
  it('200s view-only with correct code, strips code, resolves role', async () => {
    const { id, slug, code, ownerId } = await setupLeague();
    // anonymous viewer
    const r1 = await request(getApp()).get(`/api/leagues/by-slug/${slug}?code=${code}`);
    assert.equal(r1.status, 200);
    assert.equal(r1.body.id, id);
    assert.equal(r1.body.code, undefined, 'code stripped from view-only response');
    assert.equal(r1.body.isMember, false);
    assert.equal(r1.body.role, null);
    // owner viewer -> role resolved
    const r2 = await request(getApp()).get(`/api/leagues/by-slug/${slug}?code=${code}`, undefined, { 'x-user-id': ownerId });
    assert.equal(r2.body.role, 'owner');
    assert.equal(r2.body.isMember, true);
  });
});

describe('POST /api/leagues/access', () => {
  it('401s without x-user-id', async () => {
    const { id } = await setupLeague();
    const res = await request(getApp()).post('/api/leagues/access', { leagueId: id });
    assert.equal(res.status, 401);
  });
  it('403s for non-member', async () => {
    const { id } = await setupLeague();
    const other = uniq('lg_other'); await makeUser(other, other);
    const res = await request(getApp()).post('/api/leagues/access', { leagueId: id }, { 'x-user-id': other });
    assert.equal(res.status, 403);
  });
  it('returns code + role for owner', async () => {
    const { id, code, ownerId } = await setupLeague();
    const res = await request(getApp()).post('/api/leagues/access', { leagueId: id }, { 'x-user-id': ownerId });
    assert.equal(res.status, 200);
    assert.equal(res.body.code, code);
    assert.equal(res.body.role, 'owner');
  });
});

describe('PUT /api/leagues/:id', () => {
  it('403s for non-member (no code header)', async () => {
    const { id } = await setupLeague();
    const other = uniq('lg_p1'); await makeUser(other, other);
    const res = await request(getApp()).put(`/api/leagues/${id}`, {
      id, name: 'New', sport: 'futsal', format: 'round_robin', status: 'ACTIVE',
      createdAt: new Date().toISOString(), teams: [], matches: []
    }, { 'x-user-id': other, 'x-league-id': id, 'x-league-code': 'wrong' });
    assert.equal(res.status, 403);
  });
  it('400s on URL/header id mismatch', async () => {
    const { id, code, ownerId } = await setupLeague();
    const res = await request(getApp()).put('/api/leagues/WRONG', {
      id, name: 'New', sport: 'futsal', format: 'round_robin', status: 'ACTIVE',
      createdAt: new Date().toISOString(), teams: [], matches: []
    }, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 400);
  });
  it('200s for owner and preserves slug + ownerUserId', async () => {
    const { id, slug, code, ownerId } = await setupLeague();
    const res = await request(getApp()).put(`/api/leagues/${id}`, {
      id, name: 'Renamed', sport: 'futsal', format: 'round_robin', status: 'ENDED',
      createdAt: new Date().toISOString(), teams: [], matches: []
    }, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 200);
    assert.equal(res.body.league.name, 'Renamed');
    assert.equal(res.body.league.slug, slug, 'slug preserved');
    assert.equal(res.body.league.code, undefined, 'code stripped from PUT response');
    // ownerUserId preserved server-side
    const row = db.getMyLeague(id);
    assert.equal(row?.ownerUserId, ownerId);
  });
  it('200s for admin (editor tier)', async () => {
    const { id, code, ownerId } = await setupLeague();
    const admin = uniq('lg_admin'); await makeUser(admin, admin);
    await db.saveMyLeagueMember({ id: `mem-${id}-${admin}`, leagueId: id, userId: admin, username: admin, displayName: admin, role: 'admin', joinedAt: Date.now() });
    const res = await request(getApp()).put(`/api/leagues/${id}`, {
      id, name: 'Admin Edit', sport: 'futsal', format: 'round_robin', status: 'ACTIVE',
      createdAt: new Date().toISOString(), teams: [], matches: []
    }, leagueHeaders(id, code, admin));
    assert.equal(res.status, 200);
    assert.equal(res.body.league.name, 'Admin Edit');
  });
});

describe('DELETE /api/leagues/:id', () => {
  it('403s for admin (owner only)', async () => {
    const { id, code } = await setupLeague();
    const admin = uniq('lg_ad2'); await makeUser(admin, admin);
    await db.saveMyLeagueMember({ id: `mem-${id}-${admin}`, leagueId: id, userId: admin, username: admin, displayName: admin, role: 'admin', joinedAt: Date.now() });
    const res = await request(getApp()).delete(`/api/leagues/${id}`, undefined, leagueHeaders(id, code, admin));
    assert.equal(res.status, 403);
  });
  it('200s for owner and cascade-deletes members', async () => {
    const { id, code, ownerId } = await setupLeague();
    const res = await request(getApp()).delete(`/api/leagues/${id}`, undefined, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 200);
    assert.equal(db.getMyLeague(id), undefined);
    assert.equal(db.getMyLeagueMembers(id).length, 0);
  });
});

describe('POST /api/leagues/members', () => {
  it('403s for non-owner (admin)', async () => {
    const { id, code } = await setupLeague();
    const admin = uniq('lg_ad3'); await makeUser(admin, admin);
    await db.saveMyLeagueMember({ id: `mem-${id}-${admin}`, leagueId: id, userId: admin, username: admin, displayName: admin, role: 'admin', joinedAt: Date.now() });
    const target = uniq('lg_t1'); await makeUser(target, target);
    const res = await request(getApp()).post('/api/leagues/members', { username: target }, leagueHeaders(id, code, admin));
    assert.equal(res.status, 403);
  });
  it('404s on unknown username', async () => {
    const { id, code, ownerId } = await setupLeague();
    const res = await request(getApp()).post('/api/leagues/members', { username: 'nobody_here_xyz' }, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 404);
  });
  it('400s on duplicate member', async () => {
    const { id, code, ownerId } = await setupLeague();
    const res = await request(getApp()).post('/api/leagues/members', { username: ownerId }, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 400);
  });
  it('owner invites admin by username', async () => {
    const { id, code, ownerId } = await setupLeague();
    const target = uniq('lg_t2'); await makeUser(target, target);
    const res = await request(getApp()).post('/api/leagues/members', { username: target }, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 200);
    assert.equal(res.body.member.role, 'admin');
    assert.ok(db.isMyLeagueMember(id, target));
  });
});

describe('DELETE /api/leagues/members/:userId', () => {
  it('400s when removing the owner', async () => {
    const { id, code, ownerId } = await setupLeague();
    const res = await request(getApp()).delete(`/api/leagues/members/${ownerId}`, undefined, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 400);
  });
  it('owner removes an admin', async () => {
    const { id, code, ownerId } = await setupLeague();
    const admin = uniq('lg_ad4'); await makeUser(admin, admin);
    await db.saveMyLeagueMember({ id: `mem-${id}-${admin}`, leagueId: id, userId: admin, username: admin, displayName: admin, role: 'admin', joinedAt: Date.now() });
    const res = await request(getApp()).delete(`/api/leagues/members/${admin}`, undefined, leagueHeaders(id, code, ownerId));
    assert.equal(res.status, 200);
    assert.equal(db.isMyLeagueMember(id, admin), false);
  });
});
