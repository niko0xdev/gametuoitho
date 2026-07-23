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

async function setupTournament(userId: string, name?: string) {
  // Ensure user exists before creating tournament (requireLoggedIn checks db).
  if (!db.getUser(userId)) {
    await makeUser(userId, userId);
  }
  const nm = name || uniq('bilac_t');
  const code = uniq('C').slice(0, 8);
  const res = await request(getApp())
    .post('/api/bilac/tournaments', { name: nm, code, description: 'd' }, { 'x-user-id': userId });
  return { id: res.body.tournament.id, code, name: nm };
}

describe('POST /api/bilac/tournaments', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).post('/api/bilac/tournaments', { name: 'x', code: 'y' });
    assert.equal(res.status, 401);
  });
  it('400s when name empty', async () => {
    const uid = uniq('b_empty1');
    await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/bilac/tournaments', { name: '', code: 'x' }, { 'x-user-id': uid });
    assert.equal(res.status, 400);
  });
  it('400s when code empty', async () => {
    const uid = uniq('b_empty2');
    await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/bilac/tournaments', { name: 'X', code: '' }, { 'x-user-id': uid });
    assert.equal(res.status, 400);
  });
  it('400s when name duplicates', async () => {
    const nm = uniq('dup');
    await setupTournament(uniq('b_ownerA'), nm);
    const otherOwner = uniq('b_ownerB');
    await makeUser(otherOwner, otherOwner);
    const res = await request(getApp()).post('/api/bilac/tournaments', {
      name: nm, code: uniq('C')
    }, { 'x-user-id': otherOwner });
    assert.equal(res.status, 400);
  });
  it('creates and auto-joins owner', async () => {
    const uid = uniq('u_b');
    const { id } = await setupTournament(uid);
    assert.ok(db.isBiLacTournamentMember(id, uid));
    assert.ok(db.isBiLacTournamentOwner(id, uid));
  });
});

describe('GET /api/bilac/tournaments', () => {
  it('401s without x-user-id', async () => {
    const res = await request(getApp()).get('/api/bilac/tournaments');
    assert.equal(res.status, 401);
  });
  it('returns all tournaments with isMember + memberCount and NO code leak', async () => {
    const uid = uniq('memlist');
    const { id } = await setupTournament(uid);
    const res = await request(getApp()).get('/api/bilac/tournaments', undefined, { 'x-user-id': uid });
    assert.equal(res.status, 200);
    const me = res.body.find((t: any) => t.id === id);
    assert.ok(me, "user's tournament is in the list");
    assert.equal(me.isMember, true);
    assert.equal(me.memberCount, 1);
    assert.equal(me.code, undefined, 'access code must never be exposed');
  });
  it('marks non-member tournaments with isMember=false', async () => {
    const owner = uniq('owner');
    const { id } = await setupTournament(owner);
    const other = uniq('other');
    await makeUser(other, other);
    const res = await request(getApp()).get('/api/bilac/tournaments', undefined, { 'x-user-id': other });
    assert.equal(res.status, 200);
    const t = res.body.find((x: any) => x.id === id);
    assert.ok(t);
    assert.equal(t.isMember, false);
    assert.equal(t.memberCount, 1);
  });
});

describe('POST /api/bilac/tournaments/access', () => {
  it('400s without tournamentId/code', async () => {
    const uid = uniq('accu1');
    await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/bilac/tournaments/access', {}, { 'x-user-id': uid });
    assert.equal(res.status, 400);
  });
  it('404s for unknown tournament', async () => {
    const uid = uniq('accu2');
    await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/bilac/tournaments/access', {
      tournamentId: 'nope', code: 'x'
    }, { 'x-user-id': uid });
    assert.equal(res.status, 404);
  });
  it('403s for wrong code (non-member)', async () => {
    const owner = uniq('wrcOwn');
    const other = uniq('wrcOther');
    await makeUser(other, other);
    const { id } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/tournaments/access', {
      tournamentId: id, code: 'wrong'
    }, { 'x-user-id': other });
    assert.equal(res.status, 403);
  });
  it('403s for non-member', async () => {
    const owner = uniq('ownAcc');
    const other = uniq('otherAcc');
    await makeUser(other, other);
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/tournaments/access', {
      tournamentId: id, code
    }, { 'x-user-id': other });
    assert.equal(res.status, 403);
  });
  it('200s for member with correct code', async () => {
    const owner = uniq('ownAccOK');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/tournaments/access', {
      tournamentId: id, code
    }, { 'x-user-id': owner });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('GET /api/bilac/tournaments/members', () => {
  it('401s without tournament header', async () => {
    const res = await request(getApp()).get('/api/bilac/tournaments/members');
    assert.equal(res.status, 401);
  });
  it('404s for unknown tournament', async () => {
    const uid = uniq('mem404');
    await makeUser(uid, uid);
    const res = await request(getApp()).get('/api/bilac/tournaments/members', undefined, {
      'x-user-id': uid, 'x-tournament-id': 'nope', 'x-tournament-code': 'x'
    });
    assert.equal(res.status, 404);
  });
  it('403s for non-member', async () => {
    const owner = uniq('memOwn');
    const other = uniq('memOther');
    await makeUser(other, other);
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).get('/api/bilac/tournaments/members', undefined, {
      'x-user-id': other, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
  });
  it('200s for member', async () => {
    const owner = uniq('memOwn2');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).get('/api/bilac/tournaments/members', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.members.some((m: any) => m.userId === owner));
  });
});

describe('POST /api/bilac/tournaments/members (invite)', () => {
  it('400s without username', async () => {
    const owner = uniq('invOwn');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/tournaments/members', {}, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('403s for non-owner', async () => {
    const owner = uniq('invOwn3');
    const member = uniq('invMem');
    await makeUser(member, member);
    const { id, code } = await setupTournament(owner);
    // Make a second user a member manually
    db.saveBiLacTournamentMember({
      id: `mem-${id}-${member}`, tournamentId: id, userId: member,
      username: member, displayName: member, role: 'member', joinedAt: Date.now()
    });
    const targetUserId = uniq('invTgt');
    await makeUser(targetUserId, targetUserId.toLowerCase());
    const res = await request(getApp()).post('/api/bilac/tournaments/members', { username: targetUserId.toLowerCase() }, {
      'x-user-id': member, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
  });
  it('404s for unknown username', async () => {
    const owner = uniq('invOwn4');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/tournaments/members', { username: '__nouser__' }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 404);
  });
  it('400s when target is already member', async () => {
    const owner = uniq('invOwn5');
    const target = uniq('invTgt2');
    const { id, code } = await setupTournament(owner);
    await makeUser(target, target.toLowerCase());
    // Invite twice
    await request(getApp()).post('/api/bilac/tournaments/members', { username: target.toLowerCase() }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    const res = await request(getApp()).post('/api/bilac/tournaments/members', { username: target.toLowerCase() }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('200s for owner inviting new user', async () => {
    const owner = uniq('invOwn6');
    const target = uniq('invTgt3');
    const { id, code } = await setupTournament(owner);
    await makeUser(target, target.toLowerCase());
    const res = await request(getApp()).post('/api/bilac/tournaments/members', { username: target.toLowerCase() }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.ok(db.isBiLacTournamentMember(id, target));
  });
});

describe('DELETE /api/bilac/tournaments/members/:userId', () => {
  it('400s removing self (owner)', async () => {
    const owner = uniq('rmSelf');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).delete(`/api/bilac/tournaments/members/${owner}`, undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('404s for non-member target', async () => {
    const owner = uniq('rm404');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).delete('/api/bilac/tournaments/members/__nobody__', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 404);
  });
  it('200s for owner removing member', async () => {
    const owner = uniq('rmOK');
    const target = uniq('rmTgt');
    const { id, code } = await setupTournament(owner);
    await makeUser(target, target.toLowerCase());
    db.saveBiLacTournamentMember({
      id: `mem-${id}-${target}`, tournamentId: id, userId: target,
      username: target.toLowerCase(), displayName: target, role: 'member', joinedAt: Date.now()
    });
    const res = await request(getApp()).delete(`/api/bilac/tournaments/members/${target}`, undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
  });
});

describe('GET /api/bilac/players', () => {
  it('200s for member, filtered by tournament', async () => {
    const owner = uniq('plOwn');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'pl_x1', name: 'X1', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'pl_x2', name: 'X2', avatar: 'b', tournamentId: 'other-tour' });
    const res = await request(getApp()).get('/api/bilac/players', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((p: any) => p.id === 'pl_x1'));
    assert.ok(!res.body.some((p: any) => p.id === 'pl_x2'));
  });
});

describe('POST /api/bilac/players', () => {
  it('400s without name', async () => {
    const owner = uniq('plNew1');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/players', { name: '' }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('400s when name duplicates in tournament', async () => {
    const owner = uniq('plDup');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'pl_d1', name: 'Same', avatar: 'a', tournamentId: id });
    const res = await request(getApp()).post('/api/bilac/players', { name: 'Same' }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('200s creating new player', async () => {
    const owner = uniq('plNew');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/players', { name: 'NewPlayer' }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'NewPlayer');
    assert.ok(res.body.id.startsWith('bl-'));
  });
});

describe('DELETE /api/bilac/players/:id', () => {
  it('400s when player has matches', async () => {
    const owner = uniq('plHasMatch');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'pl_hm', name: 'HM', avatar: 'a', tournamentId: id });
    db.saveBiLacMatch({
      id: 'm_pl_hm', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['pl_hm'], team2: ['other'], score1: 1, score2: 0, status: 'FINISHED', benched: undefined
    });
    const res = await request(getApp()).delete('/api/bilac/players/pl_hm', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('400s when player is benched in a match', async () => {
    const owner = uniq('plBenched');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'pl_b', name: 'PB', avatar: 'a', tournamentId: id });
    db.saveBiLacMatch({
      id: 'm_pl_b', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['a'], team2: ['b'], score1: 1, score2: 0, status: 'FINISHED', benched: 'pl_b'
    });
    const res = await request(getApp()).delete('/api/bilac/players/pl_b', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('200s deleting free player', async () => {
    const owner = uniq('plDel');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'pl_free', name: 'FR', avatar: 'a', tournamentId: id });
    const res = await request(getApp()).delete('/api/bilac/players/pl_free', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
  });
});

describe('GET /api/bilac/matches', () => {
  it('200s filtered by tournament', async () => {
    const owner = uniq('gmOwn');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'gm_1', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['a'], team2: ['b'], score1: 1, score2: 0, status: 'FINISHED'
    });
    db.saveBiLacMatch({
      id: 'gm_2', timestamp: Date.now(), weekLabel: 'w', tournamentId: 'other',
      team1: ['c'], team2: ['d'], score1: 1, score2: 0, status: 'FINISHED'
    });
    const res = await request(getApp()).get('/api/bilac/matches', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.some((m: any) => m.id === 'gm_1'));
    assert.ok(!res.body.some((m: any) => m.id === 'gm_2'));
  });
});

describe('POST /api/bilac/matches (auto team balancing)', () => {
  it('400s when playerIds < 2', async () => {
    const owner = uniq('cmOwn');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/matches', { playerIds: ['a'] }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('400s when playerIds not array', async () => {
    const owner = uniq('cmNoArr');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/matches', { playerIds: 'bad' }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('400s when selected players not in db', async () => {
    const owner = uniq('cmMiss');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/matches', { playerIds: ['nope1', 'nope2'] }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 400);
  });
  it('creates match with 4 players (2v2)', async () => {
    const owner = uniq('cmOK4');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'cm4_a', name: 'A', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'cm4_b', name: 'B', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'cm4_c', name: 'C', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'cm4_d', name: 'D', avatar: 'a', tournamentId: id });
    const res = await request(getApp()).post('/api/bilac/matches', {
      playerIds: ['cm4_a', 'cm4_b', 'cm4_c', 'cm4_d']
    }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 200);
    assert.equal(res.body.team1.length + res.body.team2.length, 4);
    assert.equal(res.body.status, 'PLAYING');
  });
  it('handles 5 players (one benched)', async () => {
    const owner = uniq('cmOK5');
    const { id, code } = await setupTournament(owner);
    for (let i = 0; i < 5; i++) {
      db.saveBiLacPlayer({ id: `cm5_p${i}`, name: `P${i}`, avatar: 'a', tournamentId: id });
    }
    const res = await request(getApp()).post('/api/bilac/matches', {
      playerIds: ['cm5_p0', 'cm5_p1', 'cm5_p2', 'cm5_p3', 'cm5_p4']
    }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 200);
    assert.ok(res.body.benched);
    assert.equal(res.body.team1.length + res.body.team2.length, 4);
  });
  it('handles description undefined', async () => {
    const uid = uniq('bDesc');
    await makeUser(uid, uid);
    const res = await request(getApp()).post('/api/bilac/tournaments', {
      name: uniq('D'), code: uniq('C')
    }, { 'x-user-id': uid });
    assert.equal(res.status, 200);
    assert.equal(res.body.tournament.description, '');
  });

  it('sort comparator falls through to all-time stats and id', async () => {
    const owner = uniq('cmSort');
    const { id, code } = await setupTournament(owner);
    // 4 players, no history → tied on points/gd/wins/goals → falls to id sort
    db.saveBiLacPlayer({ id: 'sa', name: 'SA', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'sb', name: 'SB', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'sc', name: 'SC', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'sd', name: 'SD', avatar: 'a', tournamentId: id });
    const res = await request(getApp()).post('/api/bilac/matches', {
      playerIds: ['sa', 'sb', 'sc', 'sd']
    }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 200);
  });

  it('creates match during the post-Wednesday window (alternate weekly branch)', async () => {
    const fakeNow = new Date('2024-03-13T07:00:00Z').getTime();
    const RealDate = Date;
    function FakeDate(this: any, ...args: any[]) {
      return new (RealDate as any)(...(args.length ? args : [fakeNow]));
    }
    (FakeDate as any).now = () => fakeNow;
    (FakeDate as any).prototype = RealDate.prototype;
    Object.setPrototypeOf(FakeDate, RealDate);
    globalThis.Date = FakeDate as any;
    try {
      const owner = uniq('cmAlt');
      const { id, code } = await setupTournament(owner);
      db.saveBiLacPlayer({ id: 'ca_a', name: 'A', avatar: 'a', tournamentId: id });
      db.saveBiLacPlayer({ id: 'ca_b', name: 'B', avatar: 'a', tournamentId: id });
      db.saveBiLacPlayer({ id: 'ca_c', name: 'C', avatar: 'a', tournamentId: id });
      db.saveBiLacPlayer({ id: 'ca_d', name: 'D', avatar: 'a', tournamentId: id });
      const res = await request(getApp()).post('/api/bilac/matches', {
        playerIds: ['ca_a', 'ca_b', 'ca_c', 'ca_d']
      }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
      assert.equal(res.status, 200);
    } finally {
      globalThis.Date = RealDate;
    }
  });

  it('uses weekly/all-time stats to seed teams', async () => {
    const owner = uniq('cmStats');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacPlayer({ id: 'cs_a', name: 'A', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'cs_b', name: 'B', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'cs_c', name: 'C', avatar: 'a', tournamentId: id });
    db.saveBiLacPlayer({ id: 'cs_d', name: 'D', avatar: 'a', tournamentId: id });
    // Use the same weekLabel that handleCreateBilacMatch will compute for the new match.
    // Force a deterministic date so the weekly interval is predictable.
    const RealDate = Date;
    const fakeNow = new Date('2024-03-13T08:00:00').getTime();
    function FakeDate2(this: any, ...args: any[]) {
      return new (RealDate as any)(...(args.length ? args : [fakeNow]));
    }
    (FakeDate2 as any).now = () => fakeNow;
    (FakeDate2 as any).prototype = RealDate.prototype;
    Object.setPrototypeOf(FakeDate2, RealDate);
    globalThis.Date = FakeDate2 as any;
    try {
      // Need to compute the same weekLabel. Use the function exported from bilacHandlers.
      const { getBiLacWeeklyInterval } = await import('../server/handlers/bilacHandlers.ts');
      const wl = getBiLacWeeklyInterval(new Date(fakeNow)).label;
      db.saveBiLacMatch({
        id: 'cs_past', timestamp: Date.now(), weekLabel: wl, tournamentId: id,
        team1: ['cs_a', 'cs_b'], team2: ['cs_c', 'cs_d'], score1: 5, score2: 1, status: 'FINISHED'
      });
      db.saveBiLacMatch({
        id: 'cs_past2', timestamp: Date.now(), weekLabel: wl, tournamentId: id,
        team1: ['cs_a', 'cs_b'], team2: ['cs_c', 'cs_d'], score1: 0, score2: 3, status: 'FINISHED'
      });
      db.saveBiLacMatch({
        id: 'cs_past3', timestamp: Date.now(), weekLabel: wl, tournamentId: id,
        team1: ['cs_a', 'cs_b'], team2: ['cs_c', 'cs_d'], score1: 2, score2: 2, status: 'FINISHED'
      });
      const res = await request(getApp()).post('/api/bilac/matches', {
        playerIds: ['cs_a', 'cs_b', 'cs_c', 'cs_d']
      }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
      assert.equal(res.status, 200);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});

describe('POST /api/bilac/matches/:id/update', () => {
  it('404s for unknown match', async () => {
    const owner = uniq('upOwn');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).post('/api/bilac/matches/__nope__/update', { score1: 1 }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 404);
  });
  it('403s when match belongs to other tournament', async () => {
    const owner = uniq('upOwn2');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'up_other', timestamp: Date.now(), weekLabel: 'w', tournamentId: 'other',
      team1: ['x'], team2: ['y'], score1: 0, score2: 0, status: 'PLAYING'
    });
    const res = await request(getApp()).post('/api/bilac/matches/up_other/update', { score1: 1 }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
  });
  it('200s updating valid match', async () => {
    const owner = uniq('upOwn3');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'up_ok', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 0, score2: 0, status: 'PLAYING'
    });
    const res = await request(getApp()).post('/api/bilac/matches/up_ok/update', { score1: 3, score2: 2, status: 'FINISHED' }, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.score1, 3);
    assert.equal(res.body.status, 'FINISHED');
  });
});

describe('DELETE /api/bilac/matches/:id', () => {
  it('404s unknown', async () => {
    const owner = uniq('dmOwn');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).delete('/api/bilac/matches/__nope__', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 404);
  });
  it('403s cross-tournament', async () => {
    const owner = uniq('dmOwn2');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'dm_other', timestamp: Date.now(), weekLabel: 'w', tournamentId: 'other',
      team1: ['x'], team2: ['y'], score1: 0, score2: 0, status: 'PLAYING'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/dm_other', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
  });
  it('200s delete', async () => {
    const owner = uniq('dmOwn3');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'dm_ok', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 0, score2: 0, status: 'PLAYING'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/dm_ok', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
  });
  it('403s for non-owner member deleting a finished match', async () => {
    const owner = uniq('delOwn');
    const member = uniq('delMem');
    await makeUser(member, member);
    const { id, code } = await setupTournament(owner);
    db.saveBiLacTournamentMember({
      id: `mem-${id}-${member}`, tournamentId: id, userId: member,
      username: member, displayName: member, role: 'member', joinedAt: Date.now()
    });
    db.saveBiLacMatch({
      id: 'del_fin', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 1, score2: 0, status: 'FINISHED'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/del_fin', undefined, {
      'x-user-id': member, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
  });
  it('200s for owner deleting a finished match', async () => {
    const owner = uniq('delOwn2');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'del_fin2', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 1, score2: 0, status: 'FINISHED'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/del_fin2', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
  });
  it('403s for non-owner member cancelling (deleting) a PLAYING match', async () => {
    const owner = uniq('delOwn3');
    const member = uniq('delMem3');
    await makeUser(member, member);
    const { id, code } = await setupTournament(owner);
    db.saveBiLacTournamentMember({
      id: `mem-${id}-${member}`, tournamentId: id, userId: member,
      username: member, displayName: member, role: 'member', joinedAt: Date.now()
    });
    db.saveBiLacMatch({
      id: 'del_play', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['x'], team2: ['y'], score1: 0, score2: 0, status: 'PLAYING'
    });
    const res = await request(getApp()).delete('/api/bilac/matches/del_play', undefined, {
      'x-user-id': member, 'x-tournament-id': id, 'x-tournament-code': code
    });
    // Owner-only: member (kể cả với trận PLAYING) bị từ chối 403.
    assert.equal(res.status, 403);
  });
});

describe('PUT /api/bilac/tournaments', () => {
  it('401s without x-user-id', async () => {
    const { id, code } = await setupTournament(uniq('put_owner0'));
    const res = await request(getApp()).put('/api/bilac/tournaments', { name: 'X' }, { 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 401);
  });
  it('400s when name empty', async () => {
    const owner = uniq('put_owner1');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).put('/api/bilac/tournaments', { name: '' }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 400);
  });
  it('owner renames + preserves description when omitted', async () => {
    const owner = uniq('put_owner2');
    const { id, code } = await setupTournament(owner);
    const res = await request(getApp()).put('/api/bilac/tournaments', { name: 'Renamed Cup' }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 200);
    assert.equal(res.body.tournament.name, 'Renamed Cup');
    const tour = db.getBiLacTournament(id);
    assert.equal(tour.name, 'Renamed Cup');
    assert.equal(tour.description, 'd'); // preserved from setupTournament
  });
  it('403s for non-owner', async () => {
    const owner = uniq('put_owner3');
    const { id, code } = await setupTournament(owner);
    const other = uniq('put_other3');
    await makeUser(other, other);
    const res = await request(getApp()).put('/api/bilac/tournaments', { name: 'HACK' }, { 'x-user-id': other, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 403);
  });
});

describe('DELETE /api/bilac/tournaments/:id', () => {
  it('403s for non-owner', async () => {
    const owner = uniq('del_owner1');
    const { id, code } = await setupTournament(owner);
    const other = uniq('del_other1');
    await makeUser(other, other);
    const res = await request(getApp()).delete(`/api/bilac/tournaments/${id}`, undefined, { 'x-user-id': other, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 403);
    assert.ok(db.getBiLacTournament(id)); // still exists
  });
  it('owner cascade-deletes tournament + players', async () => {
    const owner = uniq('del_owner2');
    const { id, code } = await setupTournament(owner);
    const p = await request(getApp()).post('/api/bilac/players', { name: 'Plink' }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(p.status, 200);
    const res = await request(getApp()).delete(`/api/bilac/tournaments/${id}`, undefined, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 200);
    assert.ok(!db.getBiLacTournament(id));
    const remaining = db.getAllBiLacPlayers().filter((x: any) => x.tournamentId === id);
    assert.equal(remaining.length, 0);
  });
});

describe('PUT /api/bilac/players/:id', () => {
  async function makePlayer(owner: string, tid: string, code: string, name: string) {
    const p = await request(getApp()).post('/api/bilac/players', { name }, { 'x-user-id': owner, 'x-tournament-id': tid, 'x-tournament-code': code });
    return p.body.id;
  }
  it('401s without x-user-id', async () => {
    const owner = uniq('plr_owner0');
    const { id, code } = await setupTournament(owner);
    const pid = await makePlayer(owner, id, code, 'A');
    const res = await request(getApp()).put(`/api/bilac/players/${pid}`, { name: 'B' }, { 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 401);
  });
  it('renames a player (regenerates avatar)', async () => {
    const owner = uniq('plr_owner1');
    const { id, code } = await setupTournament(owner);
    const pid = await makePlayer(owner, id, code, 'Ace');
    const res = await request(getApp()).put(`/api/bilac/players/${pid}`, { name: 'KingAce' }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'KingAce');
    assert.ok(res.body.avatar.includes('KingAce'));
  });
  it('400s on empty name', async () => {
    const owner = uniq('plr_owner2');
    const { id, code } = await setupTournament(owner);
    const pid = await makePlayer(owner, id, code, 'A');
    const res = await request(getApp()).put(`/api/bilac/players/${pid}`, { name: '' }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 400);
  });
  it('400s on duplicate name', async () => {
    const owner = uniq('plr_owner3');
    const { id, code } = await setupTournament(owner);
    await makePlayer(owner, id, code, 'Dup');
    const pid2 = await makePlayer(owner, id, code, 'Other');
    const res = await request(getApp()).put(`/api/bilac/players/${pid2}`, { name: 'Dup' }, { 'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code });
    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/bilac/matches/:id (owner-only)', () => {
  // Add a non-owner member to the tournament so we can test the 403 path.
  async function addMemberHelper(tournamentId: string, memberId: string) {
    await makeUser(memberId, memberId);
    db.saveBiLacTournamentMember({
      id: `mem-${tournamentId}-${memberId}`, tournamentId, userId: memberId,
      username: memberId, displayName: memberId, role: 'member', joinedAt: Date.now()
    });
  }

  it('200s when owner deletes a FINISHED match', async () => {
    const owner = uniq('delOwnFin');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'm_own_fin', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['a'], team2: ['b'], score1: 7, score2: 6, status: 'FINISHED', benched: undefined
    });
    const res = await request(getApp()).delete('/api/bilac/matches/m_own_fin', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.equal(db.getBiLacMatch('m_own_fin'), undefined);
  });

  it('403s when non-owner member tries to delete a FINISHED match', async () => {
    const owner = uniq('delMemFin');
    const member = uniq('delMemFin_m');
    const { id, code } = await setupTournament(owner);
    await addMemberHelper(id, member);
    db.saveBiLacMatch({
      id: 'm_mem_fin', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['a'], team2: ['b'], score1: 7, score2: 6, status: 'FINISHED', benched: undefined
    });
    const res = await request(getApp()).delete('/api/bilac/matches/m_mem_fin', undefined, {
      'x-user-id': member, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
    // Match vẫn còn — không bị xoá
    assert.ok(db.getBiLacMatch('m_mem_fin'));
  });

  it('200s when owner cancels (delete) a PLAYING match', async () => {
    const owner = uniq('delOwnPlay');
    const { id, code } = await setupTournament(owner);
    db.saveBiLacMatch({
      id: 'm_own_play', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['a'], team2: ['b'], score1: 2, score2: 3, status: 'PLAYING', benched: undefined
    });
    const res = await request(getApp()).delete('/api/bilac/matches/m_own_play', undefined, {
      'x-user-id': owner, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 200);
    assert.equal(db.getBiLacMatch('m_own_play'), undefined);
  });

  it('403s when non-owner member tries to cancel a PLAYING match', async () => {
    const owner = uniq('delMemPlay');
    const member = uniq('delMemPlay_m');
    const { id, code } = await setupTournament(owner);
    await addMemberHelper(id, member);
    db.saveBiLacMatch({
      id: 'm_mem_play', timestamp: Date.now(), weekLabel: 'w', tournamentId: id,
      team1: ['a'], team2: ['b'], score1: 2, score2: 3, status: 'PLAYING', benched: undefined
    });
    const res = await request(getApp()).delete('/api/bilac/matches/m_mem_play', undefined, {
      'x-user-id': member, 'x-tournament-id': id, 'x-tournament-code': code
    });
    assert.equal(res.status, 403);
    assert.ok(db.getBiLacMatch('m_mem_play'));
  });
});