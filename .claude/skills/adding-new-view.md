# Adding a New View (URL segment)

Use when adding a new top-level page to gametuoitho.space that needs deep-linking / refresh-safe URL (e.g. `/bilac`, `/myleague`, `/leaderboards`). Single source-of-truth state in `App.tsx`, no router lib.

## Checklist (do all of them)

### 1. Backend (if the view calls its own API)

- Add handler(s) in `server/handlers/*.ts` (dev) AND mirror the route in `worker/src/routes/*.ts` (prod). Both must stay in sync — same shape, same status codes.
- If the view needs **list-type data** that's currently user-scoped, prefer the "all + `isMember`/`isXxx` flag" pattern over a separate "my" endpoint. One fetch drives multiple UI filters (tabs).
- **Never expose `code` / secrets in list responses.** Add at minimum a test asserting the field is `undefined`.
- Add the new endpoint(s) to the route tables in both `server.ts` and `worker/src/index.ts`.

### 2. SPA Routing (`/<segment>`)

- No router lib in `package.json` — sync state via History API.
- `src/App.tsx`:
  - Extend the `activeView` union type with the new view id.
  - Initialize from `window.location.pathname` (new segment → new view). Pattern in `App.tsx` around the `useState<...>(...)` for `activeView`.
  - In the wrapper around `setActiveView`, push `/<segment>` when target view matches, else push `/`. Guard with `pathname !== targetPath` to avoid the `useEffect ↔ popstate` loop.
  - Extend the `popstate` listener reverse-map to recognize the new segment.
- `src/components/Header.tsx`: if the new view goes in the nav bar, the click handler calls `onViewChange` — no Header-side push needed, App-level wrapper handles the URL.
- Cloudflare Pages SPA fallback (prod): add `/*    /index.html   200` to `public/_redirects` **only if not already present.** Vite copies `public/` → `dist/` → Pages reads it.

### 3. View Component

- New file `src/components/<Name>View.tsx` (or lowercase for multi-word like `BiLacArena.tsx`). Pattern: default-exported React component.
- Place at `id="<name>_root"` at the top wrapper for test hooks.

### 4. Wire Component into App.tsx

- Add `<Name>View />` (or portal) in the `main` block alongside the other view branches (`activeView === '<key>' && <... />`).

### 5. UI Pattern Library (choose what fits)

| Need | Pattern |
|---|---|
| Tabs to filter list (Tất cả vs. Joined) | Segmented control + `useMemo` for filtered+sorted array. Sort members/owner-first. |
| "Show all + sort user's by permission" | Single API returns all rows + per-row flag (`isMember`/`owner`/etc). UI sorts. |
| 2-3 actions that clutter the page | Move into 2 quick-action buttons → modals. Use inline `motion` + `AnimatePresence`. Match AuthModal's overlay pattern. |
| Preserve list cards grouped by user-relationship | Badge ("Đang tham gia") + sort to top within both tabs. |
| Cards clickable → enter OR pre-fill modal | `isMember ? quickAccess() : openModal(pre)` |

### 6. Tests

- `tests/*.test.ts`: update any endpoint contract tests to match the new shape. Assert no secret fields leak.
- `npm run lint` (`tsc --noEmit`) → 0 errors.
- `npm test` → all pass.

### 7. Pipeline (autonomous per project memory)

Per the user's "merge without asking" preference:

1. `git checkout -b feat/<scope>`
2. Commit with conventional message (`feat|fix|chore(scope): summary`).
3. `git push -u origin feat/<scope>`
4. `gh pr create` with summary body
5. `gh pr merge --merge --delete-branch`
6. `git checkout main && git reset --hard origin/main` (local main tends to diverge — origin is source of truth after the merge).
7. Deploy:
   - **Worker**: `cd worker && npx wrangler@3.114.17 deploy`
   - **Frontend**: `npm run build:fe && npx wrangler@3.114.17 pages deploy dist --project-name gametuoitho --branch main`
   - **D1 migrations**: only if schema changed — `cd worker && npx wrangler@3.114.17 d1 migrations apply gametuoitho-db --remote`
8. Verify (in order):
   - `curl https://gametuoitho.space/<segment>` → 200 + HTML (Pages SPA fallback works)
   - `curl https://gametuoitho.space/?cb=$RANDOM | grep index-` → bundle hash matches `dist/assets/`
   - `curl -H "x-user-id: <u>" https://gametuoitho.space/api/<route>` → new shape
   - Browser: log in, navigate to `/<segment>`, exercise the UI.

### 8. Post-deploy

- Loops: re-run smoke after each fix until dry.
- If browser test reveals a bug: file fix PR (same pipeline), merge, redeploy, retest.

## Gotchas

- **PID/sandbox**: under restricted bash, `UID=...` fails with `failed to change user ID`. Use `bash -c 'U=foo; curl ...'` or a non-reserved var name.
- **Wrangler pin**: `npx wrangler@3.114.17` — unvpuned 4.x fails on this repo's `worker/wrangler.toml`.
- **Vite HMR vs server HMR**: frontend changes auto-reload; backend changes (`server.ts`, `server/**`) require restart (tsx doesn't watch).
- **Test hook IDs**: preserve them when refactoring. Convention: `btn_<action>`, `<view>_<n>_<id>`, `portal_<card>_member_badge`.
- **Member-first sort across tabs**: even when user has 0 memberships, sort still applies (no-op). Don't conditionally branch the sort.
- **Don't change unrelated files** in the PR. If you spot a pre-existing drift (e.g. missing DB column on prod), note it — don't fix in this PR.

## Reference

- Plan template: `~/.claude/plans/*.md` — Context → Approach → Files → Verification → Out of scope.
- Deploy details: `.claude/skills/deploy-frontend/` and `deploy-worker/`.
- Realtime/D1 budget notes: `CLAUDE.md` (top of repo).
