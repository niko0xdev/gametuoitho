# Telegram integration delivery checklist

Deployed to production on 23 October 2026; Telegram enabled for @gtt_bilac_bot on 26 October 2026. Design: `tasks/plan.md`. Setup and test instructions: `docs/telegram-bilac.md`.

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
- [x] Root and Worker type-checks, 365 application tests, 49 Worker tests, nine standalone chess assertions, production build, and Worker dry-run bundle.
- [x] Independent code review and regression fixes for logout, keyboard-edit failure, premature confirmation, and group-confirmation replay cleanup.
- [x] Browser walkthrough: add player, select four players, create match, reply with score, finish, view standings, and trigger both deduplicated posting slots.

## Deployment hardening

- [x] Strict, default-off `TELEGRAM_ENABLED` ENV gate covering UI capability, configuration, webhook, processing, recovery, schedule, and delivery.
- [x] Bot credentials supplied only through ENV; group controls restricted to the verified tournament owner.
- [x] Binding and account-link generations propagated through ingress, drafts, SQL mutation guards, and delivery.
- [x] Regression tests for two tournaments/groups, foreign match references, callback forwarding, rebind/relink races, owner revocation, and late migration responses.

## Required before real-group testing

- [x] Supply the real bot username and provision bot token/webhook secret through Worker secrets.
- [x] Apply both D1 migrations and deploy matching frontend/Worker builds through the approved release flow.
- [x] Explicitly register the real webhook and command menu using the setup script.
- [ ] Verify real bot/group permissions, webhook delivery, and both scheduled slots in an opted-in test group.
No push or merge was performed. The user authorised direct deployment; local commits remain on `feat/bilac-telegram`, in accordance with the separate AGENTS.md push/merge confirmation rule.

## Recorded scope adjustment

Telegram runtime, session enforcement, and new persistence target Worker/D1. Legacy Express retains its existing game routes and member checks and now shares the season-label helper; full Telegram hosting and session/schema parity on Express are not included in this delivery. The isolated simulator tests the Worker implementation without production credentials. Initial plan statements about full legacy schema/service alignment should be read with this adjustment.

## Production verification

- Initial disabled Worker version: `efe48ae8-d9e4-4df4-913c-df50312f86d2`.
- Frontend bundle: `/assets/index-FuRJQvrs.js`, confirmed against the production HTML.
- Health endpoint: HTTP 200; capabilities: `{ "enabled": false }`.
- Disabled Telegram settings and webhook: HTTP 404 with the feature-disabled response.
- Anonymous tournament list: HTTP 401; both migrations applied with none pending.
- Enabled-group smoke tests remain pending until the owner connects a group.

## Production activation, 26 October 2026

- Bot identity verified as `@gtt_bilac_bot` before provisioning.
- Bot token and generated webhook secret supplied through process memory/stdin to Worker secrets; no credential values recorded in repository files.
- `TELEGRAM_ENABLED=true`; Worker version `aa2a4f6f-0015-4fe8-a207-f83d0b036db6`.
- Webhook registered at `https://gametuoitho.space/api/telegram/webhook`, with the command menu installed.
- Telegram reports zero pending updates and no webhook error.
- Owner must still link their account and explicitly bind their group through the verified web session.
