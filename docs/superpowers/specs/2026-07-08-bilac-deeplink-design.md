# Bi Lắc Deep-Link (View-Only Public Access)

## Purpose

Owner of a Bi Lắc tournament can share a public URL `/bilac/{slug}` that lets anyone view the tournament (players, matches, leaderboard) **without logging in or being a member**. The viewer is locked to read-only — all mutation UI is hidden. To participate, the viewer must log in and enter the access code.

This unlocks two real use cases:
1. Owner shares the link in a chat group so members can see standings without needing an account first.
2. Spectators (e.g. office bystanders) can follow a live tournament without creating noise in the members list.

## Constraints

- **No new dependency.** Project has no router library — use the existing manual `window.location.pathname` pattern in `App.tsx`.
- **Slug ≠ access code.** Slug is a public identifier; the existing access code stays the secret required for mutations.
- **Auth gates for write stay intact.** Slug does NOT bypass `checkBiLacTournamentAccess` or `requireBiLacMember`.
- **No rate limiting in MVP.** Defer to Phase 2 if abuse appears.
- **No real-time push to viewers.** Viewer reloads manually to see updates. (Real-time is the role of Durable Objects per `CLAUDE.md`, out of scope here.)

## Approach

**Approach A: Public read-only route + UI mutation gates.**

- Backend: new public route `GET /api/bilac/tournaments/by-slug/:slug`. Returns a curated payload (no internal IDs beyond tournament.id, no member-only stats).
- Frontend: `App.tsx` recognizes `/bilac/{slug}` pattern and passes a `viewMode: 'view-only'` flag + `slug` to `BiLacArena`. The component renders a separate read-only layout: hides mutate tabs (Tạo trận, Members, AI Parse Players), shows a banner inviting the user to log in + enter the access code.
- Mutations are double-gated: UI hides the buttons AND the server rejects unauthenticated requests.

Alternatives rejected:
- **B: Slug = magic code** (would expose write access to anyone with the link).
- **C: SSE real-time stream** (overkill; Durable Objects integration is a separate roadmap item).

## Routing & URL

`App.tsx` matches three path patterns (via the existing manual path check in `activeView` initialization + `popstate` handler):

| Path | `activeView` | `viewMode` | Description |
|---|---|---|---|
| `/` | `catalog` | n/a | Home (existing) |
| `/bilac` | `bilac` | `'member'` | Portal list (existing) |
| `/bilac/{slug}` | `bilac` | `'view-only'` | **NEW** — public tournament viewer |

`setActiveView` is extended to take an optional slug: `setActiveView('bilac', slug?)`. When a slug is provided, push URL to `/bilac/{slug}` and pass it down to `BiLacArena`.

`popstate` handler is updated to re-derive `viewMode` from pathname:
- `/bilac/{slug}` → `viewMode='view-only'`, read slug from pathname
- `/bilac` → `viewMode='member'`

## Backend

### Schema change

Add column to `bilac_tournaments_table` (drizzle) and DDL:

```sql
-- server/db.ts#initDb
ALTER TABLE bilac_tournaments ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bilac_tournaments_slug ON bilac_tournaments(slug);
```

`server/schema.ts` adds `slug: text('slug')` to `bilacTournamentsTable`.

### Slug generation

Helper in `server/db.ts`:

```ts
const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'; // base36
function generateSlug(length = 8): string {
  let out = '';
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  return out;
}
```

`handleCreateBilacTournament` retries slug generation up to 5 times on UNIQUE collision. If all 5 collide (astronomically unlikely: ~1e-12 at 100K rows × 5 attempts), returns 500 `{ error: 'Không thể tạo slug, thử lại.' }`.

### Migration of existing rows

On server boot, before serving requests, scan `bilac_tournaments` for rows where `slug IS NULL` and backfill each one. Idempotent — safe to run multiple times.

### New route

```
GET /api/bilac/tournaments/by-slug/:slug
```

- No auth (no `requireLoggedIn`).
- Validates `slug` matches `/^[0-9a-z]{8}$/` — else 400.
- Look up by slug; if not found → 404 `{ error: 'Giải đấu không tồn tại hoặc đã bị xoá.' }`.
- If found, build payload (see below). If a logged-in user happens to call this (`x-user-id` header present), also set `isMember` flag — otherwise `false`.
- Payload schema:

```ts
{
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: number;
  memberCount: number;
  isMember: boolean;       // false if unauthenticated or non-member
  players: Array<{ id: string; name: string; avatar: string }>;  // no stats/elo
  matches: Array<{
    id: string;
    timestamp: number;
    teamA: string[];        // player ids
    teamB: string[];
    scoreA: number;
    scoreB: number;
    status: 'scheduled' | 'in_progress' | 'completed';
  }>;
}
```

**Intentionally omitted from payload:** match notes, member list, elo history, donation totals, anything member-only. Public data only.

### Existing routes — unchanged

All write routes (`POST /api/bilac/tournaments`, `POST /api/bilac/tournaments/access`, `POST /api/bilac/players`, `POST /api/bilac/matches`, etc.) keep their existing auth gates. Slug is not accepted as an alternative to `x-tournament-code`.

## Frontend

### BiLacArena props

Add two props:
- `viewMode: 'member' | 'view-only'` (required)
- `slug?: string` (required when `viewMode === 'view-only'`)

### View-only rendering path

When `viewMode === 'view-only'`:

1. On mount (and on slug change), call `bilacFetchPublic('/api/bilac/tournaments/by-slug/' + slug)` — a new helper that does **NOT** attach `x-tournament-code` (no member context).
2. Skip `fetchTournaments()` (portal list not needed) and skip `fetchData()` (which calls member-gated endpoints).
3. Store result in new `viewOnlyData` state.
4. If `viewOnlyData.isMember === true`, auto-promote to `viewMode='member'`:
   - Push URL to `/bilac`
   - Set `currentTournament = { id, name, description }`
   - Fetch `x-tournament-code` from localStorage if present (it may already be there from a prior session), else show "Vui lòng nhập mã code" form
5. Render a banner at top: "Bạn đang xem với chế độ chỉ xem. Đăng nhập và nhập mã code để tham gia." + buttons "Đăng nhập" (opens AuthModal) + "Tham gia" (opens join modal).

### Tabs

Existing tabs in member mode: Bảng xếp hạng | Trận đấu | Tạo trận | Members | AI Tools.

View-only tabs: Bảng xếp hạng | Trận đấu (read-only).

### Disabled UI (defense-in-depth)

Even if a mutation tab were shown, the server rejects. But hide UI to avoid noise:

- Hide `handleCreateTournament` button (already moved to tab row).
- Hide "Tạo trận" tab.
- Hide "Members" tab.
- Hide "AI Parse Players" / "AI Parse Events" buttons.
- Hide donate form (already requires member).
- Disable match score edit / delete controls.
- Hide "Vào lại" / "Đăng xuất khỏi giải" buttons.

### Share link UI

**Modal "Đã tạo giải đấu" success** (in `CreateTournamentModal`):
- Add a section under the success message: "🔗 Link chia sẻ (chế độ xem)" + full URL `${window.location.origin}/bilac/${slug}` + nút "📋 Sao chép" → `navigator.clipboard.writeText(...)`.

**Member tab "Thông tin giải"** (or a new "Chia sẻ" sub-section in member view):
- Same share-link block, persistent, with copy button.

## Edge cases & errors

| Case | Behavior |
|---|---|
| Slug không tồn tại (404) | Frontend render full-page error: "Giải đấu không tồn tại hoặc đã bị xoá." + 2 buttons "Về trang chủ" + "Tạo giải đấu mới". |
| Slug bị xoá (owner delete) | Cùng 404 như trên. |
| Slug malformed (regex fail) | Server 400, frontend error toast. |
| Backend down (500) | Generic error UI + retry button. |
| User đã login + đã là member | Auto-promote to `viewMode='member'`. Rất hiếm — chỉ xảy ra khi user mở slug của giải mình đã tham gia. |
| User đã login + chưa là member | Vẫn `viewMode='view-only'`. Banner có nút "Tham gia" để nhập code. |
| User chưa login | `viewMode='view-only'`. Banner có nút "Đăng nhập" + "Tham gia". |
| Browser back từ `/bilac/{slug}` → `/bilac` | Nếu đã login, render portal list (current member flow). Nếu chưa, show login gate. |
| Refresh `/bilac/{slug}` | Reload fetch view-only data. localStorage không cache slug. |
| Owner xoá giải khi đang có viewer | Viewer refresh → 404 → error page. |

## Security

- **Slug ≠ secret.** Anyone with the link can view. Members see no extra info.
- **Access code still required for mutations.** Both UI hide + server gate.
- **No PII in view payload.** No member list, no elo, no notes, no donation totals.
- **No slug in localStorage for non-members.** Prevents accidental share from URL bar autocomplete leaking into other devices.
- **No slug in server access logs.** Add a logger filter or accept that proxy logs the URL — slug reveals no secret.

## Files changed

**Backend:**
- `server/schema.ts` — add `slug` column
- `server/db.ts` — `ALTER TABLE` migration + `generateSlug()` helper + `getBiLacTournamentBySlug()` getter + backfill on boot
- `server/handlers/bilacHandlers.ts` — slug generation in `handleCreateBilacTournament` + new `handleGetBilacTournamentBySlug` exported handler
- `server.ts` — wire new route + call backfill on boot

**Frontend:**
- `src/App.tsx` — extended `setActiveView('bilac', slug?)`, `popstate` derives `viewMode`
- `src/components/BiLacArena.tsx` — `viewMode` + `slug` props, view-only branch (banner, hidden tabs, separate fetch)
- `src/components/CreateTournamentModal.tsx` (or inline modal in BiLacArena) — share-link block on success
- `src/components/BiLacArena.tsx` — local `bilacFetchPublic()` helper (no `x-tournament-code` header); add near existing `bilacFetch`

## Verification

Manual smoke (localhost + prod):
1. Owner login → Create tournament → modal success shows share link with `/bilac/{slug}`.
2. Copy link → open in incognito (not logged in) → see tournament name, players, matches, leaderboard. Banner says "chế độ chỉ xem".
3. In incognito, click "Tạo trận" — tab does not exist. Try `curl -X POST /api/bilac/matches ...` directly → 401/403 from server.
4. Try a random slug → 404 page.
5. Log in incognito as a different user → still view-only (if not member). Banner now shows "Tham gia" button.
6. Enter access code in incognito → joins → full mode.
7. Browser back from `/bilac/{slug}` → `/bilac` → portal list (when logged in).

Automated:
- `npm run lint` → 0 errors.
- Migration runs on boot for fresh DBs (no slug column) and existing DBs (backfill rows).

## Out of scope (deferred)

- **Rate limit** view-only endpoint. Defer unless abuse appears.
- **Real-time updates** for view-only viewers. Durable Objects integration per `CLAUDE.md`.
- **Slug vanity URL** (owner-typed). Random 8-char sufficient for MVP.
- **OGP meta tags** for nice link previews in chat. Could be added later.
- **i18n** for the new banner / share text. Vietnamese only for MVP.