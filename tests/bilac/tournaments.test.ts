import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ponytail: bun 1.3.x does not yet support the better-sqlite3 native module
// (https://github.com/oven-sh/bun/issues/4290). We use node:test via
// `npx tsx --test`. upgrade path: switch to bun:test once the issue lands.
//
// ponytail: the route handlers use the memoized openDb() singleton. Tests
// share that singleton by pointing DB_FILE at a per-run temp file BEFORE any
// import that touches db.

const tmpFile = path.join(os.tmpdir(), `gtt-bilac-test-${process.pid}-${Date.now()}.db`);
process.env.DB_FILE = tmpFile;
process.on('exit', () => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmpFile + ext); } catch {}
  }
});

const { openDb, initDb } = await import('@/server/db');
const db = openDb();
initDb(db);

// Seed: 1 tournament, 1 owner user, 1 member user, 1 non-member user.
function seed() {
  db.exec(`
    DELETE FROM bilac_tournament_members;
    DELETE FROM bilac_tournaments;
    DELETE FROM users;
  `);
  const sha = (pw: string) => `sha256:${crypto.createHash('sha256').update(pw).digest('hex')}`;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, avatar, role) VALUES (?, ?, ?, ?, ?, ?)`).run('owner', 'owner1', sha('x'), 'Owner', 'a', 'user');
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, avatar, role) VALUES (?, ?, ?, ?, ?, ?)`).run('mem',  'mem1',   sha('x'), 'Mem',   'b', 'user');
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, avatar, role) VALUES (?, ?, ?, ?, ?, ?)`).run('out',  'out1',   sha('x'), 'Out',   'c', 'user');
  db.prepare(`INSERT INTO bilac_tournaments (id, name, code, description, created_at, owner_user_id) VALUES (?, ?, ?, ?, ?, ?)`).run('t1', 'Cup', 'SECRET', 'desc', Date.now(), 'owner');
  db.prepare(`INSERT INTO bilac_tournament_members (id, tournament_id, user_id, username, display_name, role, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('m-owner', 't1', 'owner', 'owner1', 'Owner', 'owner', Date.now());
  db.prepare(`INSERT INTO bilac_tournament_members (id, tournament_id, user_id, username, display_name, role, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('m-mem', 't1', 'mem', 'mem1', 'Mem', 'member', Date.now());
}

beforeEach(seed);

async function call(method: 'GET' | 'POST' | 'DELETE', pathStr: string, headers: Record<string, string> = {}, body?: unknown) {
  const { GET, POST, DELETE } = await import('@/app/api/bilac/tournaments/route');
  const { GET: GET_ONE, DELETE: DELETE_ONE } = await import('@/app/api/bilac/tournaments/[id]/route');
  const { GET: GET_M, POST: POST_M } = await import('@/app/api/bilac/tournaments/[id]/members/route');
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new Request(`http://t${pathStr}`, init);

  if (pathStr === '/api/bilac/tournaments' && method === 'GET') return GET(req);
  if (pathStr === '/api/bilac/tournaments' && method === 'POST') return POST(req);
  const oneMatch = pathStr.match(/^\/api\/bilac\/tournaments\/([^/]+)$/);
  if (oneMatch) {
    const ctx = { params: { id: oneMatch[1] } };
    if (method === 'GET') return GET_ONE(req, ctx);
    if (method === 'DELETE') return DELETE_ONE(req, ctx);
  }
  const memMatch = pathStr.match(/^\/api\/bilac\/tournaments\/([^/]+)\/members$/);
  if (memMatch) {
    const ctx = { params: { id: memMatch[1] } };
    if (method === 'GET') return GET_M(req, ctx);
    if (method === 'POST') return POST_M(req, ctx);
  }
  throw new Error(`no handler matched ${method} ${pathStr}`);
}

describe('GET /api/bilac/tournaments', () => {
  it('401s when unauthenticated', async () => {
    const res = await call('GET', '/api/bilac/tournaments');
    assert.equal(res.status, 401);
  });

  it('200s and lists only tournaments the user is a member of', async () => {
    const res = await call('GET', '/api/bilac/tournaments', { 'x-user-id': 'mem' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].id, 't1');
  });

  it('returns empty list for user with no memberships', async () => {
    const res = await call('GET', '/api/bilac/tournaments', { 'x-user-id': 'out' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 0);
  });
});

describe('GET /api/bilac/tournaments/:id', () => {
  it('403s when tournament headers missing', async () => {
    const res = await call('GET', '/api/bilac/tournaments/t1', { 'x-user-id': 'mem' });
    assert.equal(res.status, 403);
  });

  it('403s when access code is wrong', async () => {
    const res = await call('GET', '/api/bilac/tournaments/t1', {
      'x-user-id': 'mem',
      'x-tournament-id': 't1',
      'x-tournament-code': 'WRONG',
    });
    assert.equal(res.status, 403);
  });

  it('403s when user is not a member', async () => {
    const res = await call('GET', '/api/bilac/tournaments/t1', {
      'x-user-id': 'out',
      'x-tournament-id': 't1',
      'x-tournament-code': 'SECRET',
    });
    assert.equal(res.status, 403);
  });

  it('200s for a member with correct headers', async () => {
    const res = await call('GET', '/api/bilac/tournaments/t1', {
      'x-user-id': 'mem',
      'x-tournament-id': 't1',
      'x-tournament-code': 'SECRET',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, 't1');
    assert.equal(body.name, 'Cup');
  });
});

describe('GET /api/bilac/tournaments/:id/members', () => {
  it('200s for member and lists owner + self', async () => {
    const res = await call('GET', '/api/bilac/tournaments/t1/members', {
      'x-user-id': 'mem',
      'x-tournament-id': 't1',
      'x-tournament-code': 'SECRET',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.members.length, 2);
  });
});

describe('POST /api/bilac/tournaments/:id/members (invite)', () => {
  it('403s when caller is not the owner', async () => {
    const res = await call('POST', '/api/bilac/tournaments/t1/members', {
      'x-user-id': 'mem',
      'x-tournament-id': 't1',
      'x-tournament-code': 'SECRET',
    }, { username: 'out1' });
    assert.equal(res.status, 403);
  });

  it('200s when owner invites a non-member by username', async () => {
    const res = await call('POST', '/api/bilac/tournaments/t1/members', {
      'x-user-id': 'owner',
      'x-tournament-id': 't1',
      'x-tournament-code': 'SECRET',
    }, { username: 'out1' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.member.username, 'out1');
    assert.equal(body.member.role, 'member');
  });

  it('404s when target username does not exist', async () => {
    const res = await call('POST', '/api/bilac/tournaments/t1/members', {
      'x-user-id': 'owner',
      'x-tournament-id': 't1',
      'x-tournament-code': 'SECRET',
    }, { username: 'ghost' });
    assert.equal(res.status, 404);
  });
});