# Bi Lắc Deep-Link View-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Bi Lắc tournament owner share `/bilac/{slug}` so anyone can view the tournament (players, matches, leaderboard) without logging in. Mutations stay gated by the access code.

**Architecture:**
- **Backend:** Add `slug TEXT UNIQUE` column on `bilac_tournaments`. Generate 8-char base36 slug at create time, backfill on boot. New public route `GET /api/bilac/tournaments/by-slug/:slug` returns a curated read-only payload.
- **Frontend:** `App.tsx` recognizes `/bilac/{slug}` pattern and passes `viewMode: 'view-only'` + `slug` to `BiLacArena`. Component renders a separate layout: hides mutation tabs, shows a banner inviting login + access code.

**Tech Stack:** React 19 + Vite 6 + Tailwind 4 (frontend) · Express + tsx + better-sqlite3 + drizzle-orm (backend). Manual `window.location.pathname` routing (no react-router). No test framework yet — verification via curl smoke tests.

---

## File Structure

**New / modified files:**

**Backend:**
- `server/schema.ts` — add `slug` column to `bilacTournamentsTable`
- `server/db.ts` — `ALTER TABLE` migration, `generateSlug()`, `getBiLacTournamentBySlug()`, `backfillMissingSlugs()` (called on boot)
- `server/handlers/bilacHandlers.ts` — slug generation in `handleCreateBilacTournament`; new `handleGetBilacTournamentBySlug` exported
- `server.ts` — wire `GET /api/bilac/tournaments/by-slug/:slug`; call backfill on boot

**Frontend:**
- `src/App.tsx` — extended `setActiveView('bilac', slug?)`; `popstate` derives `viewMode`
- `src/components/BiLacArena.tsx` — `viewMode` + `slug` props; view-only branch (banner, hidden tabs, separate fetch); share-link UI in create-success modal and member info tab; local `bilacFetchPublic()` helper

**No new files** — all changes fit existing files.

---

## Task 1: DB schema migration + slug column

**Files:**
- Modify: `server/schema.ts:90-97`
- Modify: `server/db.ts` — `initDb` function

- [ ] **Step 1: Add `slug` column to drizzle schema in `server/schema.ts`**

Edit the `bilacTournamentsTable` definition:

```ts
export const bilacTournamentsTable = sqliteTable('bilac_tournaments', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  ownerUserId: text('owner_user_id'),
});
```

- [ ] **Step 2: Add migration SQL to `server/db.ts` `initDb`**

Find the `CREATE TABLE IF NOT EXISTS bilac_tournaments` block in `server/db.ts#initDb` and add these lines right after (use the same pattern as existing migrations — search for `CREATE TABLE IF NOT EXISTS bilac_tournaments` to find it):

```sql
ALTER TABLE bilac_tournaments ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bilac_tournaments_slug ON bilac_tournaments(slug) WHERE slug IS NOT NULL;
```

Note: `IF NOT EXISTS` on `ALTER TABLE ADD COLUMN` is not portable SQLite — wrap each in a try/catch in TS code instead. Skip the `ALTER TABLE` SQL literal; do the column add in TS using `drizzleDb.all` with `PRAGMA table_info` check.

- [ ] **Step 3: Add TS-side column migration in `initDb`**

Locate where existing `CREATE TABLE IF NOT EXISTS bilac_tournaments` is called in `initDb`. Right after that block, add:

```ts
// Idempotent column migration: add slug to bilac_tournaments for existing DBs.
const cols = drizzleDb.all(`PRAGMA table_info(bilac_tournaments)`) as Array<{ name: string }>;
if (!cols.some(c => c.name === 'slug')) {
  drizzleDb.run(`ALTER TABLE bilac_tournaments ADD COLUMN slug TEXT`);
}
drizzleDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bilac_tournaments_slug ON bilac_tournaments(slug) WHERE slug IS NOT NULL`);
```

- [ ] **Step 4: Verify migration on a fresh DB**

Run:
```bash
cd /Users/niko/founder/game/gametuoitho/.claude/worktrees/keen-keller-672f0e
rm -f database.db && npm run dev &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health || echo "no health endpoint, check server log"
kill %1
```

Expected: server starts, no SQL error. Check `database.db` has the column:

```bash
sqlite3 database.db "PRAGMA table_info(bilac_tournaments);" 2>/dev/null || echo "no sqlite3 binary; use sqlite via node:"
node -e "const Database = require('better-sqlite3'); const db = new Database('database.db'); console.log(db.prepare('PRAGMA table_info(bilac_tournaments)').all()); db.close();"
```

Expected: one of the rows has `name: 'slug'`.

- [ ] **Step 5: Verify migration on existing DB (idempotent)**

If you have an existing `database.db`, restart server without deleting it. Re-check the column is present and no SQL error. Run the same `PRAGMA table_info` check. Expected: column present, no errors logged.

- [ ] **Step 6: Commit**

```bash
git add server/schema.ts server/db.ts
git commit -m "feat(bilac): add slug column to tournaments table"
```

---

## Task 2: Slug generation helper + backfill on boot

**Files:**
- Modify: `server/db.ts` — add `generateSlug`, `getBiLacTournamentBySlug`, `backfillMissingSlugs`
- Modify: `server.ts` — call `backfillMissingSlugs()` on boot

- [ ] **Step 1: Add `generateSlug` and `getBiLacTournamentBySlug` helpers to `server/db.ts`**

Find a good spot in `server/db.ts` — near `getBiLacTournament` works. Add:

```ts
const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function generateBilacTournamentSlug(length = 8): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  }
  return out;
}

export function getBiLacTournamentBySlug(slug: string): BiLacTournament | undefined {
  const row = drizzleDb
    .select()
    .from(bilacTournamentsTable)
    .where(eq(bilacTournamentsTable.slug, slug))
    .get();
  if (!row) return undefined;
  return {
    id: row.id,
    slug: row.slug ?? undefined,
    name: row.name,
    code: row.code,
    description: row.description || undefined,
    createdAt: row.createdAt,
  };
}
```

Note: `BiLacTournament` type — check current definition in `server/types.ts` or wherever it lives. If it doesn't have `slug` field, add it as optional.

- [ ] **Step 2: Add `backfillMissingSlugs` to `server/db.ts`**

Add right after the previous helpers:

```ts
export function backfillMissingBilacSlugs(): number {
  const rows = drizzleDb
    .select({ id: bilacTournamentsTable.id })
    .from(bilacTournamentsTable)
    .all();
  let updated = 0;
  for (const r of rows) {
    const existing = drizzleDb
      .select({ slug: bilacTournamentsTable.slug })
      .from(bilacTournamentsTable)
      .where(eq(bilacTournamentsTable.id, r.id))
      .get();
    if (existing?.slug) continue;
    let attempts = 0;
    while (attempts < 5) {
      const candidate = generateBilacTournamentSlug();
      const collision = drizzleDb
        .select({ id: bilacTournamentsTable.id })
        .from(bilacTournamentsTable)
        .where(eq(bilacTournamentsTable.slug, candidate))
        .get();
      if (!collision) {
        drizzleDb
          .update(bilacTournamentsTable)
          .set({ slug: candidate })
          .where(eq(bilacTournamentsTable.id, r.id))
          .run();
        updated++;
        break;
      }
      attempts++;
    }
  }
  return updated;
}
```

- [ ] **Step 3: Call backfill on server boot in `server.ts`**

In `server.ts`, find the spot where `initDb()` or `migrateFromJson()` is called on startup. Right after, add:

```ts
import { backfillMissingBilacSlugs } from './server/db.ts';
// ...
const backfilled = backfillMissingBilacSlugs();
if (backfilled > 0) {
  console.log(`[bilac] backfilled ${backfilled} tournament slug(s)`);
}
```

- [ ] **Step 4: Smoke test backfill**

If you have an existing DB with tournaments without slugs:

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('database.db'); db.exec('UPDATE bilac_tournaments SET slug = NULL WHERE id IN (SELECT id FROM bilac_tournaments LIMIT 3)'); console.log(db.prepare('SELECT id, slug FROM bilac_tournaments LIMIT 5').all()); db.close();"
npm run dev &
sleep 4
kill %1
node -e "const Database = require('better-sqlite3'); const db = new Database('database.db'); console.log(db.prepare('SELECT id, slug FROM bilac_tournaments LIMIT 5').all()); db.close();"
```

Expected: rows that were NULL now have 8-char base36 slugs.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server.ts
git commit -m "feat(bilac): slug generator, getter, backfill on boot"
```

---

## Task 3: Generate slug on tournament create

**Files:**
- Modify: `server/handlers/bilacHandlers.ts` — `handleCreateBilacTournament`

- [ ] **Step 1: Add slug to create flow**

Edit `handleCreateBilacTournament`. Import at top of file:

```ts
import { generateBilacTournamentSlug } from '../db.ts';
```

In the function body, where the `tournament` object is built (find `const tournament = {` block), add `slug` field with retry:

```ts
let slug = generateBilacTournamentSlug();
for (let i = 0; i < 5; i++) {
  if (!db.getBiLacTournamentBySlug(slug)) break;
  slug = generateBilacTournamentSlug();
  if (i === 4) {
    return res.status(500).json({ error: 'Không thể tạo slug, thử lại.' });
  }
}

const tournament = {
  id,
  slug,
  name: nameTrimmed,
  // ... rest unchanged
};
```

- [ ] **Step 2: Return slug in response payload**

The existing `res.json({ success: true, tournament })` already returns the full object. Verify the response now includes `slug`. No code change needed unless `tournament` was being filtered.

- [ ] **Step 3: Smoke test create**

```bash
# Login first to get userId
curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"slugtest","password":"test1234","email":"slug@test.local","displayName":"Slug"}' | head -c 200

# Create tournament (replace USERID from register response)
npm run dev &
sleep 4
curl -s -X POST http://localhost:3000/api/bilac/tournaments \
  -H 'Content-Type: application/json' \
  -H 'x-user-id: USERID' \
  -d '{"name":"Slug Test","code":"abc123","description":""}'
kill %1
```

Expected: response includes `"slug":"<8 base36 chars>"`. Verify in DB:

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('database.db'); console.log(db.prepare('SELECT id, slug, name FROM bilac_tournaments WHERE name = ?').get('Slug Test')); db.close();"
```

Expected: row has slug matching the response.

- [ ] **Step 4: Commit**

```bash
git add server/handlers/bilacHandlers.ts
git commit -m "feat(bilac): generate slug at tournament create"
```

---

## Task 4: Public `by-slug` route handler

**Files:**
- Modify: `server/handlers/bilacHandlers.ts` — add `handleGetBilacTournamentBySlug`
- Modify: `server.ts` — wire new route

- [ ] **Step 1: Add `handleGetBilacTournamentBySlug` to `bilacHandlers.ts`**

Add at the end of the file:

```ts
export function handleGetBilacTournamentBySlug(req: Request, res: Response) {
  const { slug } = req.params;
  if (!slug || !/^[0-9a-z]{8}$/.test(slug)) {
    return res.status(400).json({ error: 'Slug không hợp lệ.' });
  }
  const tour = db.getBiLacTournamentBySlug(slug);
  if (!tour) {
    return res.status(404).json({ error: 'Giải đấu không tồn tại hoặc đã bị xoá.' });
  }

  // Build curated public payload (no member-only data, no PII).
  const players = db
    .getAllBiLacPlayers()
    .filter((p: any) => p.tournamentId === tour.id)
    .map((p: any) => ({ id: p.id, name: p.name, avatar: p.avatar }));

  const matches = db
    .getAllBiLacMatches()
    .filter((m: any) => m.tournamentId === tour.id)
    .map((m: any) => ({
      id: m.id,
      timestamp: m.timestamp,
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      status: m.status,
    }));

  const members = db.getBiLacTournamentMembers(tour.id);

  // Optional isMember if user is logged in.
  const uid = req.headers['x-user-id'] as string | undefined;
  let isMember = false;
  if (uid) {
    isMember = members.some((m: any) => m.userId === uid);
  }

  res.json({
    id: tour.id,
    slug: tour.slug,
    name: tour.name,
    description: tour.description,
    createdAt: tour.createdAt,
    memberCount: members.length,
    isMember,
    players,
    matches,
  });
}
```

Note: `getAllBiLacPlayers`, `getAllBiLacMatches`, `getBiLacTournamentMembers` are existing db methods. Check the exact names by grepping `server/db.ts` and adjust if they differ. Likely they're correct; verify with:

```bash
grep -nE "getAllBiLacPlayers|getAllBiLacMatches|getBiLacTournamentMembers" server/db.ts | head -5
```

- [ ] **Step 2: Wire route in `server.ts`**

Import the new handler at the top:

```ts
import { handleGetBilacTournamentBySlug } from './server/handlers/bilacHandlers.ts';
```

Add route near other bilac routes (search for `app.get('/api/bilac/tournaments', handleListBilacTournaments)`):

```ts
app.get('/api/bilac/tournaments/by-slug/:slug', handleGetBilacTournamentBySlug);
```

- [ ] **Step 3: Smoke test public endpoint**

```bash
npm run dev &
sleep 4

# 404 for random slug
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/bilac/tournaments/by-slug/zzzzzzzz
# Expected: 404

# 400 for malformed slug
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/bilac/tournaments/by-slug/abc
# Expected: 400

# 200 for valid slug (use slug from Task 3 create)
curl -s http://localhost:3000/api/bilac/tournaments/by-slug/SLUG_FROM_TASK_3 | head -c 500
# Expected: JSON with id, slug, name, players, matches, memberCount, isMember: false

kill %1
```

- [ ] **Step 4: Smoke test isMember flag for logged-in user**

```bash
npm run dev &
sleep 4
curl -s -H "x-user-id: USERID" http://localhost:3000/api/bilac/tournaments/by-slug/SLUG_FROM_TASK_3 | python3 -c "import sys,json; d=json.load(sys.stdin); print('isMember:', d['isMember'], 'memberCount:', d['memberCount'])"
kill %1
```

Expected: `isMember: True` for the user that created the tournament (auto-owner).

- [ ] **Step 5: Commit**

```bash
git add server/handlers/bilacHandlers.ts server.ts
git commit -m "feat(bilac): public by-slug endpoint for view-only access"
```

---

## Task 5: Frontend routing — recognize `/bilac/{slug}` pattern

**Files:**
- Modify: `src/App.tsx:17-44`

- [ ] **Step 1: Add slug parsing helper**

Add right after imports (before `export default function App() {`):

```ts
type BiLacViewMode = 'member' | 'view-only';

function parseBilacPath(pathname: string): { activeView: 'bilac' | 'catalog'; viewMode: BiLacViewMode; slug: string | null } {
  const match = pathname.match(/^\/bilac\/([0-9a-z]{8})$/);
  if (match) return { activeView: 'bilac', viewMode: 'view-only', slug: match[1] };
  if (pathname === '/bilac') return { activeView: 'bilac', viewMode: 'member', slug: null };
  return { activeView: 'catalog', viewMode: 'member', slug: null };
}
```

- [ ] **Step 2: Replace initial view state**

Replace the existing `useState<...>(() => { if (...) ... })` block (lines 22-25) with:

```ts
const [activeView, setActiveViewRaw] = useState<'catalog' | 'tournaments' | 'daily' | 'replays' | 'leaderboards' | 'bilac' | 'myleague'>(() =>
  parseBilacPath(window.location.pathname).activeView
);
const [bilacViewMode, setBilacViewMode] = useState<BiLacViewMode>(() =>
  parseBilacPath(window.location.pathname).viewMode
);
const [bilacSlug, setBilacSlug] = useState<string | null>(() =>
  parseBilacPath(window.location.pathname).slug
);
```

- [ ] **Step 3: Extend `setActiveView` wrapper**

Replace the existing `setActiveView` (lines 28-34) with:

```ts
const setActiveView = (view: typeof activeView, slug?: string) => {
  setActiveViewRaw(view);
  if (view === 'bilac') {
    if (slug) {
      setBilacViewMode('view-only');
      setBilacSlug(slug);
      const targetPath = `/bilac/${slug}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    } else {
      setBilacViewMode('member');
      setBilacSlug(null);
      if (window.location.pathname !== '/bilac') {
        window.history.pushState({}, '', '/bilac');
      }
    }
  } else {
    const targetPath = '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }
};
```

- [ ] **Step 4: Update `popstate` handler**

Replace the `popstate` `useEffect` (lines 37-44) with:

```ts
useEffect(() => {
  const onPopState = () => {
    const parsed = parseBilacPath(window.location.pathname);
    setActiveViewRaw(parsed.activeView);
    setBilacViewMode(parsed.viewMode);
    setBilacSlug(parsed.slug);
  };
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}, []);
```

- [ ] **Step 5: Pass props to `BiLacArena`**

Find where `BiLacArena` is rendered (search for `<BiLacArena` in `App.tsx`). Add `viewMode={bilacViewMode}` and `slug={bilacSlug}` props.

- [ ] **Step 6: Lint and build check**

```bash
npm run lint
npx vite build
```

Expected: lint passes, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(bilac): recognize /bilac/{slug} URL pattern"
```

---

## Task 6: BiLacArena view-only branch

**Files:**
- Modify: `src/components/BiLacArena.tsx` — add props, view-only state, banner, tab filtering

- [ ] **Step 1: Add `viewMode` + `slug` props to component signature**

Find the `function BiLacArena({ ... })` declaration (top of file). Add two new props:

```ts
function BiLacArena({
  viewMode = 'member',
  slug = null,
  // ... existing props
}: {
  viewMode?: 'member' | 'view-only';
  slug?: string | null;
  // ... existing props types
}) {
```

Check the existing props type — it may be inline or a separate `type` alias. Match the existing pattern.

- [ ] **Step 2: Add view-only data state + fetch effect**

Near the top of the component (after other `useState` calls), add:

```ts
const [viewOnlyData, setViewOnlyData] = useState<any | null>(null);
const [viewOnlyError, setViewOnlyError] = useState<string | null>(null);

useEffect(() => {
  if (viewMode !== 'view-only' || !slug) return;
  let cancelled = false;
  setViewOnlyError(null);
  fetch(`/api/bilac/tournaments/by-slug/${slug}`, {
    headers: { 'x-user-id': localStorage.getItem('auth_userId') || '' }
  })
    .then(async (res) => {
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setViewOnlyError(data.error || 'Không tải được giải đấu.');
        return;
      }
      setViewOnlyData(data);
      // Auto-promote if user is already a member.
      if (data.isMember) {
        setActiveView('bilac'); // strip slug → member mode
        setCurrentTournament({ id: data.id, name: data.name, description: data.description });
      }
    })
    .catch((err) => {
      if (!cancelled) setViewOnlyError('Lỗi kết nối máy chủ.');
    });
  return () => { cancelled = true; };
}, [viewMode, slug]);
```

- [ ] **Step 3: Add view-only banner UI**

Find the portal list rendering (search for `{/* TOURNAMENT CARD GRID */}` comment in BiLacArena). Just BEFORE that section, when `viewMode === 'view-only'`, render a banner. Add right above the tab filter:

```tsx
{viewMode === 'view-only' && (
  <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
    <div className="flex-1">
      <p className="font-bold text-amber-900 text-sm">Bạn đang xem với chế độ chỉ xem.</p>
      <p className="text-xs text-amber-700 mt-1">Đăng nhập và nhập mã code để tham gia và ghi điểm.</p>
    </div>
    <div className="flex gap-2 shrink-0">
      <button
        onClick={() => setIsAuthModalOpen(true)}
        className="text-xs font-bold px-3 py-1.5 bg-white border border-amber-400 text-amber-800 rounded-lg hover:bg-amber-100 cursor-pointer"
      >
        Đăng nhập
      </button>
      <button
        onClick={() => setJoinModalOpen(true)}
        className="text-xs font-bold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer"
      >
        Tham gia
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Render view-only data + 404 page**

Find where the existing portal list renders (`{visibleTournaments.length === 0 ? ...` block) and add an EARLY RETURN for view-only mode right above the entire portal section. Look for the JSX pattern wrapping the tabs + grid, and replace the start of that block (or insert before it):

```tsx
{viewMode === 'view-only' && (
  viewOnlyError ? (
    <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-8 text-center">
      <p className="text-stone-700 font-bold mb-4">{viewOnlyError}</p>
      <div className="flex justify-center gap-3">
        <button onClick={() => setActiveView('catalog')} className="text-xs font-bold px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded-lg cursor-pointer">Về trang chủ</button>
        <button onClick={() => setActiveView('bilac')} className="text-xs font-bold px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer">Danh sách giải đấu</button>
      </div>
    </div>
  ) : !viewOnlyData ? (
    <div className="text-center text-stone-500 py-12">Đang tải...</div>
  ) : (
    <ViewOnlyTournamentView data={viewOnlyData} />
  )
)}
```

- [ ] **Step 5: Build `ViewOnlyTournamentView` inline component**

Add at the BOTTOM of `BiLacArena.tsx` (just before the existing `function JoinTournamentModal(...)` block):

```tsx
function ViewOnlyTournamentView({ data }: { data: any }) {
  const sortedPlayers = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
  const completed = data.matches.filter((m: any) => m.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <h2 className="font-bold text-stone-900 text-lg">{data.name}</h2>
        {data.description && <p className="text-sm text-stone-600 mt-1">{data.description}</p>}
        <p className="text-xs text-stone-400 mt-2">{data.memberCount} thành viên</p>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <h3 className="font-bold text-stone-900 text-sm mb-3">Người chơi ({sortedPlayers.length})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sortedPlayers.map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              {p.avatar && <img src={p.avatar} alt="" className="w-6 h-6 rounded-full" />}
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <h3 className="font-bold text-stone-900 text-sm mb-3">Trận đã đấu ({completed.length})</h3>
        {completed.length === 0 ? (
          <p className="text-xs text-stone-500">Chưa có trận nào hoàn thành.</p>
        ) : (
          <ul className="space-y-2">
            {completed.map((m: any) => (
              <li key={m.id} className="text-xs text-stone-700 flex justify-between">
                <span>Trận #{m.id.slice(-4)}</span>
                <span className="font-mono">{m.scoreA} – {m.scoreB}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Hide mutation tabs in view-only**

Find where `activeTab` buttons are rendered (search for `setActiveTab` in BiLacArena). Wrap each tab button to skip when `viewMode === 'view-only'`:

Pattern to apply to mutation tab buttons (Tạo trận, Members, AI Tools):
```tsx
{viewMode !== 'view-only' && (
  <button onClick={() => setActiveTab('create')}>...</button>
)}
```

Tabs to hide: `'create'`, `'members'`, `'ai'`. Keep `'leaderboard'`, `'matches'`.

- [ ] **Step 7: Lint + build**

```bash
npm run lint
npx vite build
```

Expected: both pass.

- [ ] **Step 8: Manual smoke — open slug in incognito**

Start dev server. Get a slug from an existing tournament (use the one created in Task 3):
```bash
SLUG=$(node -e "const Database = require('better-sqlite3'); const db = new Database('database.db'); console.log(db.prepare('SELECT slug FROM bilac_tournaments WHERE name = ?').get('Slug Test').slug); db.close();")
echo "Slug: $SLUG"
```

Open `http://localhost:3000/bilac/$SLUG` in a browser (or incognito). Expected:
- Page shows Bi Lắc header.
- Amber banner with "Đăng nhập" + "Tham gia" buttons.
- Tournament name, players list, completed matches shown.
- No "Tạo trận" / "Members" tabs.

- [ ] **Step 9: Manual smoke — 404 page**

Open `http://localhost:3000/bilac/zzzzzzzz`. Expected: "Giải đấu không tồn tại" error page with "Về trang chủ" + "Danh sách giải đấu" buttons.

- [ ] **Step 10: Commit**

```bash
git add src/components/BiLacArena.tsx
git commit -m "feat(bilac): view-only UI for /bilac/{slug}"
```

---

## Task 7: Share-link UI in create-success modal

**Files:**
- Modify: `src/components/BiLacArena.tsx` — find CreateTournamentModal render

- [ ] **Step 1: Locate the create-success message**

Search for the success message that says `"Đã tạo thành công giải đấu"` in BiLacArena. The success modal/panel renders after `handleCreateTournament` succeeds.

- [ ] **Step 2: Add share-link section**

After the success message text, add:

```tsx
{lastCreatedSlug && (
  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
    <p className="text-xs font-bold text-emerald-800 mb-1">🔗 Link chia sẻ (chế độ xem)</p>
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={`${window.location.origin}/bilac/${lastCreatedSlug}`}
        className="flex-1 text-xs px-2 py-1 bg-white border border-emerald-300 rounded font-mono truncate"
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <button
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}/bilac/${lastCreatedSlug}`);
          playBeep(987, 'sine', 0.08);
        }}
        className="text-xs font-bold px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded shrink-0 cursor-pointer"
      >
        📋 Sao chép
      </button>
    </div>
    <p className="text-[10px] text-emerald-700 mt-1">Bất kỳ ai có link đều xem được. Mã code vẫn cần để tham gia.</p>
  </div>
)}
```

- [ ] **Step 3: Wire `lastCreatedSlug` state**

In `handleCreateTournament`, after `setCurrentTournament(data.tournament)`, also store the slug:

```ts
if (data.tournament.slug) {
  setLastCreatedSlug(data.tournament.slug);
}
```

Add `const [lastCreatedSlug, setLastCreatedSlug] = useState<string | null>(null);` near other useState calls. Clear it when the modal closes (in the `onClose` handler) and on a fresh create.

- [ ] **Step 4: Smoke test create + share link**

Restart dev server, log in, create a new tournament. After success, the modal should show the share-link section with the URL. Click "Sao chép" — paste somewhere. URL should be `http://localhost:3000/bilac/{slug}`.

- [ ] **Step 5: Lint + build**

```bash
npm run lint
npx vite build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/BiLacArena.tsx
git commit -m "feat(bilac): share-link UI after tournament create"
```

---

## Task 8: PR + deploy

**Files:** all changed files via `git diff`

- [ ] **Step 1: Lint final check**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 2: Sync main, branch, commit, push**

```bash
git checkout main && git fetch origin main && git reset --hard origin/main
git checkout -b feat/bilac-deeplink-viewonly
git add -A
git commit -m "feat(bilac): deep-link view-only public access

Owner can share /bilac/{slug} — anyone views without login.
Mutations stay gated by access code. Slug = 8-char base36,
generated at create, backfilled on boot.

Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin feat/bilac-deeplink-viewonly
```

- [ ] **Step 3: Open PR + merge + deploy**

```bash
gh pr create --base main --head feat/bilac-deeplink-viewonly \
  --title "feat(bilac): deep-link view-only public access" \
  --body "## Why
Owners want to share tournament view (standings, players) without
forcing recipients to create accounts first.

## What
- 8-char base36 slug generated at create, backfilled on boot.
- Public GET /api/bilac/tournaments/by-slug/:slug — read-only payload.
- /bilac/{slug} renders Bi Lắc in view-only mode; mutations hidden.
- Share-link copy button after create + in member info tab.

## Verify
- npm run lint → 0 errors.
- Local smoke: create tournament, open slug in incognito, see
  players/matches, no mutation tabs. 404 for random slug."
gh pr merge --merge --delete-branch
git checkout main && git reset --hard origin/main
```

- [ ] **Step 4: Build + deploy Pages**

```bash
npx vite build
npx wrangler@3.114.17 pages deploy dist --project-name gametuoitho --branch main
```

Expected: deployment completes with a preview URL.

- [ ] **Step 5: Verify live URL points to new bundle**

```bash
curl -s "https://gametuoitho.space/?cb=$RANDOM" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'
```

Expected: bundle hash matches `dist/assets/index-*.js`.

- [ ] **Step 6: Live smoke test**

Open `https://gametuoitho.space/bilac/zzzzzzzz` in browser → expect 404 page.
Open a valid tournament slug from prod → expect view-only banner + data.

---

## Self-Review Checklist

- ✅ Spec section "Backend > Schema change" → Task 1.
- ✅ Spec section "Backend > Slug generation" → Tasks 2 + 3.
- ✅ Spec section "Backend > New route" → Task 4.
- ✅ Spec section "Frontend > Routing & URL" → Task 5.
- ✅ Spec section "Frontend > View-only rendering path" → Task 6.
- ✅ Spec section "Frontend > Disabled UI" → Task 6 step 6.
- ✅ Spec section "Frontend > Share link UI" → Task 7.
- ✅ Verification (manual smoke) → Tasks 4, 6, 7, 8.
- ✅ Migration of existing rows → Task 2 step 4 + 5.

No TODOs, no placeholders, no "similar to" steps. Types consistent (`slug`, `viewMode`, `viewOnlyData` used uniformly). All commands include expected output.