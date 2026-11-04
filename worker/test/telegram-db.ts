import { URL } from 'node:url';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import type { Bindings } from '../src/db';

export function testDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    if (file.endsWith('.sql')) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const prepare = (sql: string) => {
    let values: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) { values = args; return stmt; },
      async raw() { return sqlite.prepare(sql).raw().all(...values); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values), success: true, meta: {} }; },
      async run() { const r = sqlite.prepare(sql).run(...values); return { success: true, results: [], meta: { changes: r.changes } }; },
      execute() { return sqlite.prepare(sql).run(...values); },
    };
    return stmt;
  };
  const env = { DB: { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    return sqlite.transaction(() => statements.map(s => ({ success: true, meta: { changes: s.execute().changes } })))();
  } }, APP_URL: 'http://localhost:5173' } as unknown as Bindings;
  sqlite.exec(`INSERT INTO users (id,username,password_hash,display_name,avatar,role,email_verified) VALUES ('owner','owner','hash','Owner','','user',1),('other','other','hash','Other','','user',1);
    INSERT INTO bilac_tournaments (id,name,code,created_at,slug) VALUES ('cup','Cup','private',0,'12345678');
    INSERT INTO bilac_tournament_members (id,tournament_id,user_id,username,display_name,role,joined_at) VALUES ('m','cup','owner','owner','Owner','owner',0);
    INSERT INTO bilac_players (id,name,avatar,tournament_id) VALUES ('a','An','','cup'),('b','Bình','','cup'),('c','Chi','','cup');`);
  return { env, sqlite };
}

// A persisted pre-Mini-App message must remain safe and usable after deployment.
export function seedLegacySelection(sqlite: ReturnType<typeof testDatabase>['sqlite'], id: string) {
  const players = sqlite.prepare("SELECT id,name FROM bilac_players WHERE tournament_id='cup'").all();
  sqlite.prepare(`INSERT INTO telegram_drafts (id,tournament_id,chat_id,telegram_id,kind,payload,expires_at,binding_id,user_id,link_id)
    SELECT ?,i.tournament_id,i.chat_id,l.telegram_id,'random',?,?,i.binding_id,l.user_id,l.link_id
    FROM bilac_telegram i JOIN telegram_links l ON l.user_id='owner' AND l.telegram_id='123' WHERE i.tournament_id='cup'`)
    .run(id, JSON.stringify({ players, selected: [], page: 0 }), Date.now() + 600000);
}
