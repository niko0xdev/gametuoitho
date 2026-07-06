# AGENTS.md — Working Agreement for AI Agents on gametuoitho.space

This file defines **what an AI agent (Claude, Cursor, Copilot, etc.) may and may not do** in this repo. Read `CLAUDE.md` for technical conventions; this file is the social contract.

## Mission

Operate the gametuoitho.space codebase — a Vietnamese-language retro brain-training arcade (Caro, Cờ Tướng, Cờ Vua, Bi Lắc, Futsal, puzzles...) — with minimum disruption and maximum verifiability.

## Hard Rules (violations = stop and ask)

1. **Never edit secrets**, `.env.local`, `.env`, or anything containing real API keys. Read env through `process.env.X` only.
2. **Never run `npm run clean`** without explicit user permission — it deletes the legacy seed JSON.
3. **Never push, force-push, or merge** without explicit user confirmation. We commit locally; the human pushes.
4. **Never run `rm -rf` outside `dist/`** or delete any file you didn't write without confirming.
5. **Never skip `npm run lint`** before claiming "done" on a code change.
6. **Never call destructive curl actions** (`POST/DELETE` on real tournaments, real matches, real users in SQLite) without confirmation. `database.db` contains real data.

## Soft Rules (preferred defaults)

1. **Diff minimization**. When asked to "add feature X", do not refactor unrelated files. When something must change, list the rationale in the response.
2. **Vietnamese error messages**. This is a VN-first product. New user-facing strings in `server.ts` are Vietnamese. Match the tone (polite, slightly playful).
3. **Preserve existing icon imports**. `lucide-react` is imported as one grouped block per component. Add new icons to that block — don't break it up.
4. **Use the `bilacFetch` helper** for any Bi Lắc API call from frontend. Don't bypass it with raw `fetch`.
5. **Inject `x-user-id` only when `userProfile` is set.** The server checks `db.getUser(userId)` and returns 401 otherwise. Test the gate from anonymous context too.

## Workflow

### Before writing code
- If the task is unclear, ask one short clarifying question with 2–4 options. Do not pre-survey the whole codebase unless scope warrants it.
- If the task implies 5+ files or >400 lines of churn, propose a short plan and confirm before editing.

### While editing
- Edit in place; do not duplicate files or create `*.v2.ts` siblings.
- Match existing comment density. This codebase has minimal comments — keep yours at the same level unless explaining a non-obvious decision.
- Group related state (e.g. all AI states together) rather than scattering them.

### Before saying "done"
1. `npm run lint` — return 0 errors.
2. Smoke-test the changed route with `curl` (template in `.claude/skills/run-app.md`).
3. Restart server if backend changed (see `CLAUDE.md` "Known Gotchas" — `tsx` doesn't HMR).
4. Report: what you changed, what you verified, anything you didn't verify.

### When the user asks "why was X like that"
- Trace through code first, then explain. Don't speculate.

## Scope Boundaries (out of scope without escalation)

- **Auth provider swap** (e.g. to Auth0 / NextAuth / Firebase). The current SHA-256 hashing is a known weakness — flagged in roadmap but not in scope to replace.
- **Adding new game boards** (chess variants, sudoku sizes, ...) — implementation starts in `src/components/games/` and touches lots of UI; confirm scope.
- **Mobile-app packaging** (Capacitor / React Native) — not a target.
- **Production deployment scripts** beyond what `npm run build` / `npm run start` already does.

## Communication Style

- Ultra-terse by default. Match the technical depth of the question.
- Use **Vietnamese** when the user uses Vietnamese.
- When you must be verbose (security warning, destructive action, multi-step sequence), do so fully; otherwise stay compressed.
- Always show file paths as `[relative/path.ts](src/path.ts:42)` so they're clickable.

## Feedback Loop

After completing any task, the user may:
- Ask for additional verification → do it, don't argue.
- Point out a missed edge case → fix it; save the lesson to `.claude/skills/` if it's a recurring trap.
- Reject the approach → revert cleanly. Don't keep partial work.

## Available Skills (in this repo)

See `.claude/skills/`:
- `run-app.md` — how to launch, smoke-test, and clean-restart.
- `ai-routes.md` — recipe for adding new AI endpoints.
- `db-migrations.md` — recipe for new tables.
- `port-conflict.md` — debug port-in-use errors.
