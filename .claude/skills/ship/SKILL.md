---
name: ship
description: Ship a gametuoitho code change end-to-end. Use for ANY bug fix, feature add, or feature update that must reach prod. Runs the full pipeline — dispatch code-review agent on the implementation → branch/commit/push → open PR → dispatch code-review agent on the PR → apply fixes if needed → merge → deploy (frontend via deploy-frontend, worker via deploy-worker, skip if repo-only) → verify live → fetch main locally → cleanup. NEVER half-ship: merging without deploying is the #1 cause of "I merged it, why isn't it live?" (Pages is Direct Upload).
---

# Ship a change end-to-end

## When to use
Any code change heading to prod: **bug fix, feature add, feature update**. Also use when the user says "push và tạo pr", "ship it", "deploy", "lên prod", or invokes `/goal ... tạo pr ... merge`.

## Gate the run with /goal
Before starting, set a goal so the Stop hook blocks stopping until the whole chain holds:
```
/goal ship <branch>: review impl → PR → review PR → fix → merge → deploy → verify live → fetch → cleanup
```

## Pipeline

1. **Pre-flight** — `npm run lint` (tsc --noEmit) returns 0. Fix all errors first. Never commit red.

2. **Review implementation** — dispatch the `superpowers:code-reviewer` agent (Agent tool) on the working-tree diff. Fix every real finding before opening the PR. Do not skip "because it's small."

3. **Branch + commit + push** — if on `main`, branch first (`fix/...` or `feat/...`). Conventional commit prefix (`fix:`, `feat:`). End the message with `Co-Authored-By: Claude <noreply@anthropic.com>`. `git push -u origin <branch>`.

4. **Open PR** — `gh pr create --base main`. Body = what changed + why + root cause + verify proof. End PR body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

5. **Review PR** — dispatch `superpowers:code-reviewer` again on the pushed diff. If it returns real findings: fix locally → `git push` → confirm. **Merge without asking** (user preference; see memory `merge-without-asking`). Use `gh pr merge <n> --merge -d` to match the repo's merge-commit style and delete the branch.

6. **Deploy** — ONLY if runtime code changed. Skip for repo-only changes (`CLAUDE.md`, `.claude/**`, docs, tests-only).
   - **Frontend** (`src/**` changed) → invoke the `deploy-frontend` skill: `npm run build:fe` then `npx wrangler@3.114.17 pages deploy dist --project-name gametuoitho --branch main`. Pages is **Direct Upload** — merging the PR does NOT deploy it.
   - **Worker** (`worker/**` changed) → invoke the `deploy-worker` skill.
   - **Both** → deploy frontend first, then worker.

7. **Verify live** — prove the new build is serving, don't assume.
   - Frontend: `curl -s "https://gametuoitho.space/?cb=$RANDOM" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'` — hash MUST match `dist/assets/index-*.js`.
   - Worker: curl the prod `/api/*` endpoint and assert the new behavior/status.
   - Repo-only: skip (nothing to verify on a host).

8. **Fetch local** — sync the primary checkout (not the worktree) to merged `main`:
   `git -C /Users/niko/founder/game/gametuoitho fetch origin && git -C /Users/niko/founder/game/gametuoitho pull --ff-only origin main`

9. **Cleanup** — if working in a worktree, call `ExitWorktree({action: "remove"})` once merged + synced. Delete the local feature branch if it lingers.

## Red flags (stop and reconsider)
- Merging a `src/**` or `worker/**` change without deploying.
- Skipping the review agents.
- Trusting "merged = live" on the frontend.
- Leaving the feature branch / worktree dangling after merge.
- Committing when `npm run lint` is red.
