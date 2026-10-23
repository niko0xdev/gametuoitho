# Telegram integration delivery checklist

Implementation is available locally. Design: `tasks/plan.md`. Setup and test instructions: `docs/telegram-bilac.md`.

## Implemented and verified

- [x] Verified Worker login sessions for password login, email verification, and Google SSO; session revocation on logout and password change.
- [x] Worker Bi Lac mutation membership gates, one active match on creation, and revision checks for competing web/bot score updates.
- [x] Shared weekly standings and timezone-independent season labels, used by the web and Telegram.
- [x] D1 integration, token, link, draft, inbox, outbox, audit, and session migration.
- [x] Secret-checked webhook, update replay suppression, recovery leases, and completed-payload scrubbing.
- [x] Private account linking and owner/admin group binding, both confirmed from the verified web session.
- [x] Tournament members-tab settings: connection status, linking, explicit test post, pause, and disconnect.
- [x] `/bxh`, actor-bound `/random`, score preview/live save/finish, and owner-only finished-result correction.
- [x] Added requirement: `/addplayer` with confirmation, name validation, duplicate detection, and persistent replay protection.
- [x] Durable outbound delivery, per-chat pacing, retry-after handling, uncertain-delivery state, destination migration, and disconnected-job cancellation.
- [x] Two daily posting triggers, recovery trigger, and preserved independent account-pruning dispatch.
- [x] Loopback-only, in-memory simulator with real command handlers and interactive buttons.
- [x] Root and Worker type-checks, 365 application tests, 37 Worker tests, nine standalone chess assertions, production build, and Worker dry-run bundle.
- [x] Independent code review and regression fixes for logout, keyboard-edit failure, premature confirmation, and group-confirmation replay cleanup.
- [x] Browser walkthrough: add player, select four players, create match, reply with score, finish, view standings, and trigger both deduplicated posting slots.

## Required before real-group testing

- [ ] Supply the real bot username and provision bot token/webhook secret through Worker secrets.
- [ ] Apply the D1 migration and deploy matching frontend/Worker builds through the approved release flow.
- [ ] Explicitly register the real webhook and command menu using the setup script.
- [ ] Verify real bot/group permissions, webhook delivery, and both scheduled slots in an opted-in test group.
- [ ] Obtain explicit confirmation before pushing or merging, as required by AGENTS.md.

## Recorded scope adjustment

Telegram runtime, session enforcement, and new persistence target Worker/D1. Legacy Express retains its existing game routes and member checks and now shares the season-label helper; full Telegram hosting and session/schema parity on Express are not included in this delivery. The isolated simulator tests the Worker implementation without production credentials. Initial plan statements about full legacy schema/service alignment should be read with this adjustment.
