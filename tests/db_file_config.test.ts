// Regression test for DB_FILE / DB_FILE_JSON configurable SQLite path.
// Contract: server/db.ts must respect env overrides and initDb must create
// the expected tables regardless of the underlying file path.
// See server/db.ts:35-36, CLAUDE.md Project Snapshot DB bullet, .env.example.
import { describe, it, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getApp } from './_bootstrap.ts';

beforeAll(() => { getApp(); });

describe('DB_FILE configurable path', () => {
  it('bootstrap wired process.env.DB_FILE to a temp file', () => {
    const v = process.env.DB_FILE;
    assert.ok(v, 'process.env.DB_FILE must be set by tests/_bootstrap.ts');
    // bootstrap uses /tmp/gt-<pid>-<rand>.db
    assert.match(v, /gt-.*\.db$/);
    assert.ok(v.length > 10);
  });

  it('bootstrap wired process.env.DB_FILE_JSON to a nonexistent sentinel', () => {
    const v = process.env.DB_FILE_JSON;
    assert.ok(v, 'process.env.DB_FILE_JSON must be set by tests/_bootstrap.ts');
    assert.equal(v, '/tmp/__nonexistent_legacy_seed__.json');
  });

  it('server/db.ts exports SQLITE_FILE and DB_FILE matching env plumbing', async () => {
    const mod: any = await import('../server/db.ts');
    assert.ok('SQLITE_FILE' in mod, 'server/db.ts must export SQLITE_FILE');
    assert.ok('DB_FILE' in mod, 'server/db.ts must export DB_FILE');
    // In the test process these must equal the env the bootstrap set
    // (or the cwd-joined defaults when the env is absent).
    const expectedSqlite = process.env.DB_FILE || path.join(process.cwd(), 'database.db');
    const expectedJson = process.env.DB_FILE_JSON || path.join(process.cwd(), 'database.json');
    assert.equal(mod.SQLITE_FILE, expectedSqlite);
    assert.equal(mod.DB_FILE, expectedJson);
  });

  it('drizzle schema + initDb created core tables regardless of path', async () => {
    const { drizzleDb } = await import('../server/db.ts');
    // Query sqlite_master directly — proves initDb ran against the temp file.
    const rows = (drizzleDb as any).$client
      ? undefined
      : undefined;
    // Use the underlying better-sqlite3 handle via drizzleDb if available,
    // otherwise fall back to opening the temp file ourselves.
    // drizzle exposes the client via drizzleDb._client or via sqliteDb export;
    // the simplest stable probe is to ask the DB itself through the db helper.
    const { db } = await import('../server/db.ts');
    // db helpers touching each table prove the tables exist; if any table were
    // missing the driver would throw "no such table".
    assert.doesNotThrow(() => db.getAllUsers());
    assert.doesNotThrow(() => db.getAllProfiles());
    assert.doesNotThrow(() => db.getAllMatches());
    assert.doesNotThrow(() => db.getAllBiLacPlayers());
    assert.doesNotThrow(() => db.getAllMyLeagues());
    // Direct sqlite_master check: open the temp file read-only and inspect.
    const tmpFile = process.env.DB_FILE!;
    // Use better-sqlite3 directly to avoid coupling to drizzle internals.
    const Database = (await import('better-sqlite3')).default;
    const ro = new Database(tmpFile, { readonly: true });
    try {
      const names = ro.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
      const set = new Set(names.map(r => r.name));
      for (const t of ['users', 'daily_counters', 'profiles', 'matches', 'tournaments', 'daily_challenges', 'bilac_players', 'bilac_matches', 'bilac_tournaments', 'bilac_tournament_members', 'my_leagues', 'league_permissions', 'my_league_members']) {
        assert.ok(set.has(t), `expected table "${t}" to exist (got: ${[...set].join(', ')})`);
      }
    } finally {
      ro.close();
    }
    // Silence unused variable warning
    void rows;
  });

  it('.env.example documents DB_FILE and DB_FILE_JSON', () => {
    const p = path.join(process.cwd(), '.env.example');
    const text = fs.readFileSync(p, 'utf-8');
    assert.match(text, /DB_FILE/);
    assert.match(text, /DB_FILE_JSON/);
    // Each must have a one-line comment describing its purpose/default
    assert.match(text, /DB_FILE.*SQLite|SQLite.*DB_FILE/i);
    assert.match(text, /DB_FILE_JSON.*seed|seed.*DB_FILE_JSON/i);
  });

  it('CLAUDE.md roadmap checkbox is [x] and DB bullet mentions env vars', () => {
    const text = fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf-8');
    assert.match(text, /\[x\].*DB_FILE/);
    assert.match(text, /DB_FILE_JSON/);
    // Project Snapshot DB bullet must mention the env vars
    assert.match(text, /DB.*DB_FILE/);
  });
});
