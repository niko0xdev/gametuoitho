import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ponytail: bun 1.3.x does not yet support the better-sqlite3 native module
// (https://github.com/oven-sh/bun/issues/4290). The route handlers use
// better-sqlite3, so these tests cannot run under bun's runtime. We use
// node:test via `npx tsx --test`. The `expect()` shim below is a thin
// pass-through to node:assert/strict so the spec's expectations stay
// readable. upgrade path: switch imports to `bun:test` and the body runs
// unchanged once Bun issue #4290 lands.

// ponytail: the route handlers use the memoized openDb() singleton. Tests
// must share the same singleton, so we point DB_FILE at a per-run temp
// file BEFORE importing the db module.

const tmpFile = path.join(os.tmpdir(), `gtt-auth-test-${process.pid}-${Date.now()}.db`);
process.env.DB_FILE = tmpFile;
teardownTmp();

const { openDb, initDb } = await import('@/server/db');
const db = openDb(); // returns the singleton
initDb(db);

function teardownTmp() {
  process.on('exit', () => {
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(tmpFile + ext); } catch {}
    }
  });
}

const expect = (actual: unknown) => ({
  toBe(expected: unknown) { assert.equal(actual, expected); },
  toMatch(re: RegExp) { assert.match(String(actual), re); },
});

beforeEach(() => {
  db.exec('DELETE FROM users');
  const hash = `sha256:${crypto.createHash('sha256').update('correctpw').digest('hex')}`;
  db.prepare('INSERT INTO users (id, username, password_hash, display_name, avatar, role) VALUES (?, ?, ?, ?, ?, ?)').run('u1', 'niko', hash, 'Niko', 'https://example.com/a.png', 'user');
});

async function POST(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/auth/login/route');
  const req = new Request('http://t/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('POST /api/auth/login', () => {
  it('400s on missing body', async () => {
    const res = await POST({});
    expect(res.status).toBe(400);
  });
  it('404s on unknown user', async () => {
    const res = await POST({ username: 'nope', password: 'x' });
    expect(res.status).toBe(404);
  });
  it('200s on correct password', async () => {
    const res = await POST({ username: 'niko', password: 'correctpw' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('u1');
  });
  it('401s on wrong password', async () => {
    const res = await POST({ username: 'niko', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
