// Tests for db.ts API surface.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getApp } from './_bootstrap.ts';
import { db, hashPassword } from '../server/db.ts';

before(() => { getApp(); });

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

describe('hashPassword', () => {
  it('produces deterministic sha256 hash', () => {
    assert.equal(hashPassword('hello'), hashPassword('hello'));
    assert.notEqual(hashPassword('hello'), hashPassword('world'));
    assert.equal(hashPassword('hello').length, 64);
  });
});

describe('users CRUD', () => {
  it('saveUser then getUser round-trips', () => {
    const id = uniq('u');
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: 'h', displayName: 'D', avatar: 'a', role: 'user' });
    const u = db.getUser(id)!;
    assert.equal(u.id, id);
    assert.equal(u.username, id);
    assert.equal(u.email, `${id}@x.com`);
  });
  it('getUserByUsername', () => {
    const id = uniq('u');
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: 'h', displayName: 'D', avatar: 'a', role: 'user' });
    assert.ok(db.getUserByUsername(id));
    assert.equal(db.getUserByUsername('nope'), undefined);
  });
  it('getUserByEmail', () => {
    const id = uniq('u');
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: 'h', displayName: 'D', avatar: 'a', role: 'user' });
    assert.ok(db.getUserByEmail(`${id}@x.com`));
    assert.equal(db.getUserByEmail('nope@x.com'), undefined);
  });
  it('saveUser with otp + otpExpires round-trips', () => {
    const id = uniq('u');
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: 'h', displayName: 'D', avatar: 'a', role: 'user', otp: '123456', otpExpires: Date.now() + 100000 });
    const u = db.getUser(id)!;
    assert.equal(u.otp, '123456');
    assert.ok(u.otpExpires! > Date.now());
  });
  it('saveUser with isGoogleUser round-trips', () => {
    const id = uniq('u');
    db.saveUser({ id, username: id, email: `${id}@x.com`, passwordHash: 'h', displayName: 'D', avatar: 'a', role: 'user', isGoogleUser: true });
    const u = db.getUser(id)!;
    assert.equal(u.isGoogleUser, true);
  });
  it('getAllUsers returns array', () => {
    const arr = db.getAllUsers();
    assert.ok(Array.isArray(arr));
    assert.ok(arr.length > 0);
  });
});

describe('profiles CRUD', () => {
  it('saveProfile then getProfile round-trips', () => {
    const id = uniq('p');
    db.saveProfile({ id, displayName: 'P', avatar: 'a', elo: { caro: 1600 } as any, honorScore: 200, badges: ['b1'] });
    const p = db.getProfile(id)!;
    assert.equal(p.displayName, 'P');
    assert.equal(p.honorScore, 200);
    assert.deepEqual(p.badges, ['b1']);
  });
  it('saveProfile without elo uses defaults (via getProfile)', () => {
    const id = uniq('p');
    db.saveProfile({ id, displayName: 'P', avatar: 'a', elo: {} as any, honorScore: 100, badges: [] });
    const p = db.getProfile(id)!;
    assert.ok(p.elo);
  });
  it('getAllProfiles returns array', () => {
    assert.ok(Array.isArray(db.getAllProfiles()));
  });
});

describe('matches CRUD', () => {
  it('saveMatch then getMatch round-trips', () => {
    const id = uniq('m');
    db.saveMatch({
      id, gameId: 'caro', status: 'PLAYING', players: ['p1', 'p2'],
      boardState: {}, turn: 'p1', moves: [], viewers: [], createdAt: Date.now(), updatedAt: Date.now()
    });
    const m = db.getMatch(id)!;
    assert.equal(m.gameId, 'caro');
    assert.deepEqual(m.players, ['p1', 'p2']);
  });
  it('saveMatch with boardState and winner round-trips', () => {
    const id = uniq('m');
    db.saveMatch({
      id, gameId: 'caro', status: 'ENDED', players: ['p1'],
      boardState: { foo: 1 }, turn: 'p1', moves: [{ player: 'p1', move: { r: 0, c: 0 }, timestamp: Date.now(), sequence: 1 }], viewers: [],
      winner: 'p1', createdAt: Date.now(), updatedAt: Date.now(), privateCode: 'PC'
    });
    const m = db.getMatch(id)!;
    assert.equal(m.winner, 'p1');
    assert.equal(m.privateCode, 'PC');
  });
  it('getAllMatches returns array', () => {
    assert.ok(Array.isArray(db.getAllMatches()));
  });
});

describe('tournaments CRUD', () => {
  it('saveTournament then getTournament round-trips', () => {
    const id = uniq('t');
    db.saveTournament({
      id, name: 'T', gameId: 'caro', status: 'REGISTRATION', organizer: 'o',
      players: ['o'], maxPlayers: 4, deadline: Date.now() + 10000,
      schedule: [{ matchId: 'm1', player1: 'p1', player2: 'p2', status: 'WAITING' }],
      standings: { o: 0 }, createdAt: Date.now()
    });
    const t = db.getTournament(id)!;
    assert.equal(t.name, 'T');
    assert.equal(t.maxPlayers, 4);
    assert.equal(t.schedule.length, 1);
  });
});

describe('bilac CRUD', () => {
  it('saveBiLacPlayer / getBiLacPlayer / getAllBiLacPlayers / deleteBiLacPlayer', () => {
    const id = uniq('blp');
    db.saveBiLacPlayer({ id, name: 'N', avatar: 'a', tournamentId: 't1' });
    assert.ok(db.getBiLacPlayer(id));
    assert.ok(db.getAllBiLacPlayers().some(p => p.id === id));
    db.deleteBiLacPlayer(id);
    assert.equal(db.getBiLacPlayer(id), undefined);
  });
  it('saveBiLacMatch / getBiLacMatch / getAllBiLacMatches / deleteBiLacMatch', () => {
    const id = uniq('blm');
    db.saveBiLacMatch({
      id, timestamp: Date.now(), weekLabel: 'w', tournamentId: 't1',
      team1: ['a'], team2: ['b'], score1: 0, score2: 0, status: 'PLAYING'
    });
    assert.ok(db.getBiLacMatch(id));
    assert.ok(db.getAllBiLacMatches().some(m => m.id === id));
    db.deleteBiLacMatch(id);
    assert.equal(db.getBiLacMatch(id), undefined);
  });
  it('saveBiLacMatch with benched and full scores', () => {
    const id = uniq('blmf');
    db.saveBiLacMatch({
      id, timestamp: Date.now(), weekLabel: 'w', tournamentId: 't1',
      team1: ['a', 'b'], team2: ['c', 'd'], score1: 5, score2: 3, status: 'FINISHED', benched: 'x'
    });
    const m = db.getBiLacMatch(id)!;
    assert.equal(m.benched, 'x');
    assert.equal(m.score1, 5);
  });
  it('saveBiLacTournament / getBiLacTournament / getAllBiLacTournaments / deleteBiLacTournament', () => {
    const id = uniq('blt');
    db.saveBiLacTournament({ id, name: 'N', code: 'C', description: 'd', createdAt: Date.now() });
    assert.ok(db.getBiLacTournament(id));
    assert.ok(db.getAllBiLacTournaments().some(t => t.id === id));
    db.deleteBiLacTournament(id);
    assert.equal(db.getBiLacTournament(id), undefined);
  });
  it('saveBiLacTournament with empty description', () => {
    const id = uniq('blt2');
    db.saveBiLacTournament({ id, name: 'N', code: 'C', description: undefined, createdAt: Date.now() });
    const t = db.getBiLacTournament(id)!;
    assert.equal(t.description, undefined);
  });
  it('BiLac tournament members CRUD', () => {
    const tid = uniq('bltm');
    db.saveBiLacTournament({ id: tid, name: 'N', code: 'C', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({
      id: 'm_1', tournamentId: tid, userId: 'u1', username: 'u1', displayName: 'U1', role: 'owner', joinedAt: Date.now()
    });
    assert.ok(db.isBiLacTournamentMember(tid, 'u1'));
    assert.ok(db.isBiLacTournamentOwner(tid, 'u1'));
    assert.ok(!db.isBiLacTournamentOwner(tid, 'u2'));
    assert.ok(db.getBiLacTournamentMember(tid, 'u1'));
    assert.equal(db.getBiLacTournamentMember(tid, 'nobody'), undefined);
    db.deleteBiLacTournamentMember(tid, 'u1');
    assert.ok(!db.isBiLacTournamentMember(tid, 'u1'));
  });
  it('getBiLacTournamentsForUser returns user memberships', () => {
    const uid = uniq('gtu');
    const tid = uniq('gtut');
    db.saveBiLacTournament({ id: tid, name: 'N', code: 'C', description: 'd', createdAt: Date.now() });
    db.saveBiLacTournamentMember({
      id: 'm_gtu', tournamentId: tid, userId: uid, username: uid, displayName: uid, role: 'owner', joinedAt: Date.now()
    });
    const list = db.getBiLacTournamentsForUser(uid);
    assert.ok(list.some(t => t.id === tid));
  });
});

describe('leagues CRUD', () => {
  it('saveMyLeague / getMyLeague / getAllMyLeagues / deleteMyLeague', () => {
    const id = uniq('lg');
    const league = {
      id, name: 'L', sport: 'futsal' as const, format: 'round_robin' as const, status: 'ACTIVE' as const,
      createdAt: new Date().toISOString(), teams: [], matches: []
    };
    db.saveMyLeague(league);
    const l = db.getMyLeague(id)!;
    assert.equal(l.name, 'L');
    assert.equal(l.sport, 'futsal');
    assert.ok(Array.isArray(db.getAllMyLeagues()));
    db.deleteMyLeague(id);
    assert.equal(db.getMyLeague(id), undefined);
  });
});

describe('league permissions', () => {
  it('saveLeaguePermissions and getLeaguePermissions', () => {
    db.saveLeaguePermissions({ a: true, b: false });
    const perms = db.getLeaguePermissions();
    assert.equal(perms['a'], true);
    assert.equal(perms['b'], false);
  });
  it('saveLeaguePermissions overwrites', () => {
    db.saveLeaguePermissions({ x: true });
    db.saveLeaguePermissions({ y: true });
    const perms = db.getLeaguePermissions();
    assert.equal(perms['x'], undefined);
    assert.equal(perms['y'], true);
  });
});

describe('dailyChallenges', () => {
  it('saveDailyChallenge / getDailyChallenge', () => {
    const date = uniq('dc');
    db.saveDailyChallenge({
      id: 'dc1', date, gameId: 'sudoku', seed: 's', prompt: 'p', topScores: []
    });
    const c = db.getDailyChallenge(date)!;
    assert.equal(c.gameId, 'sudoku');
  });
});

describe('user lookups edge cases', () => {
  it('getUser with missing user returns undefined', () => {
    assert.equal(db.getUser('__nope_user__'), undefined);
  });
});