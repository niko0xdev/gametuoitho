---
name: db-migrations
description: How to add a new table or column to the SQLite database in gametuoitho.space. Use when the user asks to add a new persistent entity.
---

# Add or change a SQLite table

The DB is SQLite via `better-sqlite3` + `drizzle-orm`. Both the raw SQL and the drizzle schema must stay in sync.

## Files to update

1. **`server/db.ts#initDb`** — Add `CREATE TABLE IF NOT EXISTS ...` inside the `sqliteDb.exec(\`...\`)` block. Also add `CREATE INDEX IF NOT EXISTS` if you'll query by non-PK columns.
2. **`server/schema.ts`** — Add a drizzle table declaration so the rest of the codebase can use the typed helper.
3. **`server/db.ts` (CRUD)** — Add `get…`, `save…`, `getAll…` methods on the `Database` class. Use `drizzleDb.insert(...).onConflictDoUpdate({target: ...})` for upserts.
4. **`server.ts` (routes)** — Wire up the new endpoints.

## Schema example

```ts
// server/schema.ts
export const bilacTournamentMembersTable = sqliteTable('bilac_tournament_members', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  joinedAt: integer('joined_at').notNull(),
});
```

Don't forget to:
- Import the new table in `server/db.ts`.
- Add the helper method on `Database` (class definition starts near line 53).

## Adding a column to an existing table

Inside `initDb()`:

```ts
ALTER TABLE my_table ADD COLUMN new_col TEXT;
```

This is idempotent only because the SQLite ALTER is forgiving for re-runs in some providers — but **better to guard with a name check** if you're on a strictly compatible engine. Current stack (`better-sqlite3`) silently fails on duplicate ADD COLUMN, so production code uses `CREATE TABLE IF NOT EXISTS` for fresh tables and migrations-as-SQL for upgrade paths.

## CRUD method template

```ts
saveX(x: { id: string; ...fields }): void {
  drizzleDb.insert(xTable)
    .values({ ... })
    .onConflictDoUpdate({
      target: xTable.id,
      set: { /* same fields */ },
    })
    .run();
}

getAllX(filter?: ...): X[] {
  const rows = drizzleDb.select().from(xTable).all();
  return rows.map(r => ({ ... }));
}
```

## After schema change

```bash
npm run lint   # tsc checks
```

If the change touches seed/migration, restart `npm run dev` and:

```bash
sqlite3 database.db ".tables"   # verify table exists
```

(`sqlite3` CLI may not be installed; use the Node REPL otherwise — `node -e "const Db=require('./server/db.ts')..."`.)
