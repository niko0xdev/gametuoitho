import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
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

const tmpFile = path.join(os.tmpdir(), `gtt-auth-test-${process.pid}-${Date.now()}-r.db`);
process.env.DB_FILE = tmpFile;
process.on('exit', () => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmpFile + ext); } catch {}
  }
});

const { openDb, initDb } = await import('@/server/db');
const db = openDb();
initDb(db);

const expect = (actual: unknown) => ({
  toBe(expected: unknown) { assert.equal(actual, expected); },
  toMatch(re: RegExp) { assert.match(String(actual), re); },
});

beforeEach(() => {
  db.exec('DELETE FROM users');
});

async function POST(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/auth/register/route');
  const req = new Request('http://t/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('POST /api/auth/register', () => {
  it('400s without username', async () => {
    expect((await POST({ password: 'x' })).status).toBe(400);
  });
  it('409s on duplicate username', async () => {
    const first = await POST({ username: 'dup', password: 'a' });
    expect(first.status).toBe(200);
    const second = await POST({ username: 'dup', password: 'b' });
    expect(second.status).toBe(409);
  });
  it('200s on new user', async () => {
    const res = await POST({ username: 'fresh', password: 'secret', displayName: 'Fresh' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toMatch(/^u_[0-9a-f]+$/);
  });
});
