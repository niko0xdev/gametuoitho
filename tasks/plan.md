# Telegram integration for Bi Lac tournaments

Status: deployed to production following user approval, with Telegram disabled by ENV; real-bot configuration and enabled-group verification remain pending. Research date: 23 October 2026. The initial design follows below; see `tasks/todo.md` for delivery status and the explicit Worker-only runtime scope adjustment. Production rollout details are recorded in `tasks/todo.md`.

## Scope and defaults

One shared Telegram bot serves multiple tournaments. Each tournament can connect one group or supergroup. Initially, a group connects to only one tournament, avoiding ambiguous commands. Tournament owners configure the integration on the web. Existing tournaments continue to work without Telegram.

Features: select present players and randomise teams, update and finish matches, request current weekly standings, and publish those standings daily at 13:20 and 21:00 in Asia/Ho_Chi_Minh. Publish a clear empty-state message when the current season has no completed matches. Scheduled posts remain enabled even when standings have not changed.

Added requirement: members can add a named player through `/addplayer`, review the name, and confirm before insertion. Validate length/control characters and detect duplicate names.

Non-goals: natural-language/AI parsing, automatic player creation from group members, separate bots per tournament, arbitrary posting schedules, automatic tagging of players, and historic match editing by ordinary members.

## Repository evidence

- Production: Hono Worker and D1, `worker/src/index.ts`, `worker/src/routes/bilac.ts`, and `worker/wrangler.toml`. Express/SQLite remains a supported local backend.
- Randomisation exists in `worker/src/lib/pairing.ts` and `server/lib/pairing.ts`: no skill weighting, avoid repeating the latest partition for the same roster, and protect the previous reserve where applicable. Preserve these semantics.
- Worker match creation and updates currently use `checkAccess`, which checks the tournament code and existence of the supplied user ID, but does not verify tournament membership. Documentation overstates the existing write gate.
- `worker/src/lib/auth.ts` trusts a supplied `x-user-id` after a database lookup. This is insufficient proof for securely issuing Telegram account-link or owner configuration credentials.
- Standings calculations are embedded in `src/components/BiLacArena.tsx`. Sort by wins minus losses, then wins. Draws affect draw/points counters but not the displayed played count. Preserve behaviour before any separately approved rule change.
- Season labels roll over on Wednesday at 11:30, although the displayed new start is 12:00. Resolve and test this interval explicitly; do not silently switch to Monday-based weeks or relabel historical matches.
- Existing Worker cron `13 */6 * * *` prunes unverified users. Its current handler runs pruning on every scheduled invocation.

## User journeys

### Connect a group

1. Owner opens tournament settings and enables Telegram.
2. A verified owner session issues a random, single-use binding token, stored hashed, expiring after ten minutes, scoped to that tournament and owner.
3. Owner adds the bot to the target group and sends `/connect@bot <token>` there. The numeric chat ID is captured automatically; the UI displays it for confirmation and troubleshooting. Manual chat-ID entry alone never grants a binding.
4. Require the same linked Telegram actor to be the tournament owner and a group administrator. Reject anonymous administrator identities. Bot administrator status is required for reliable checks of other members; request only necessary rights.
5. Save the binding atomically, invalidate the token, and show the connected group and health status. Owner can test delivery, pause automatic posts, disconnect, or rebind with fresh verification. Test delivery is an explicit user action.

Keep tokens out of logs; delete the connection command when permitted, without making deletion a security dependency. Do not place the tournament access code in group messages.

### Link a person

Link stable Telegram `from.id` to an application user through a single-use private bot deep link created from a verified web session. Require confirmation on the authenticated web session before finalising the binding, preventing a forwarded link from silently attaching another Telegram account. Never identify people by mutable Telegram usernames or display names. Player records remain independent of application users: an authorised operator can select existing players without every player linking an account.

### Randomise teams

`/random@bot` opens a paginated list of existing tournament players. The initiating linked member selects those present, then confirms. Other people cannot change that draft. The bot calls the same application service as the web, preserving pairing history and reserve rules. Post teams and match reference, with score/update controls.

Use expiring server-side draft IDs in callback data. A repeated update or confirmation cannot create another match. Proposed default: one active match per tournament, enforced atomically for both web and Telegram creation; confirm this product restriction before implementation because the existing database does not enforce it. If concurrent matches are required, every command must select a match explicitly.

### Record a result

Use `/score@bot <match-ref> <A> <B>` or reply to a bot match message with `/score@bot <A> <B>`. Show a preview with separate actions to save the live score or finish the match. Accept only bounded, non-negative integers; choose the maximum from existing game rules during implementation. Validate tournament, actor membership, match state, and expected revision at confirmation time.

Ordinary linked members can update a live match; only owners can correct a finished result, through an explicit correction preview with an audit entry. Conditional writes prevent stale callbacks or simultaneous web updates overwriting newer results. Update the bot's match message after committing; Telegram delivery failure must not roll back the saved result. Web updates should invalidate old Telegram controls using the same revision check.

### View and publish standings

`/bxh@bot` displays the connected tournament's current season, ranking, wins/draws/losses, ranking differential, and a public view-only web link. Allow group members to read without linking an account, subject to owner consent when connecting the group. Show a limited first page and a web link when the table is long. Use escaped plain text or HTML and respect Telegram message limits.

The scheduled version uses the same query and renderer. Post a fresh message at each requested slot, including season label and snapshot time. A failed send to one group must not prevent other groups receiving theirs.

## Architecture

Telegram HTTPS webhook -> verified update inbox -> command adapter -> authorised Bi Lac services -> D1. Outbound messages use a durable delivery outbox. Web routes call the same services, with an explicit actor context rather than synthetic HTTP headers.

Start with the existing Worker and native fetch for the small Bot API surface. No separate always-on server is needed. Extract only pairing orchestration, score mutation, and standings/season logic needed by this integration. Keep legacy Express behaviour aligned using runtime-neutral helpers where practical; production Telegram ingress and scheduling belong to the Worker.

Webhook endpoint: `POST /api/telegram/webhook`. Check `X-Telegram-Bot-Api-Secret-Token`, validate payload shape, and persist the accepted update before returning success. Unique bot/update IDs suppress replays; processing state and leases permit recovery after crashes. Acknowledge callbacks promptly. Do not mark an update completed until its database action and outgoing intent are persisted.

Secrets: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in Worker secrets; never expose them to the browser or logs. Register only required update types, initially message, callback_query, and my_chat_member. Use a separate development bot or fixtures so local work cannot replace the production webhook.

### Persistence

- `bilac_telegram_integrations`: unique tournament ID, unique chat ID stored as text, optional future topic ID, enabled/auto-post flags, timezone, connected actor, and delivery health.
- `telegram_account_links`: unique Telegram user ID and application user mapping, with revocation metadata.
- `telegram_link_tokens`: hashed token, purpose, tournament/user scope, expiry, and consumed state.
- `telegram_updates`: bot/update ID unique key, processing status, lease, attempt count, and minimal retained payload.
- `telegram_drafts`: actor/chat/tournament-bound expiring selection or confirmation state.
- `telegram_outbox`: unique logical delivery key, destination snapshot, payload/snapshot reference, state, lease, next attempt, error, and returned message ID.
- Match revision and mutation audit records: actor, source, before/after scores, and timestamps.

Deliver migrations for D1 and matching legacy SQLite schemas for shared domain data. Retention must remove expired tokens, drafts, and old update payloads without deleting match audit history unexpectedly. Rebinding/disconnecting invalidates drafts and pending deliveries to the old destination.

### Schedule and reliability

Cloudflare cron uses UTC. Add `20 6 * * *` for 13:20 Vietnam time and `0 14 * * *` for 21:00, preserving `13 */6 * * *`. Dispatch by `event.cron`, keeping pruning on its original trigger. Use scheduled time, rather than actual start time, for the date/slot deduplication key.

Persist one delivery per tournament, local date, and slot. Atomic claim/lease prevents concurrent workers sending the same queued job. Persist the standings snapshot so retries do not change its contents. Retry transient errors with backoff; honour Telegram `retry_after`. Handle group migration, bot removal, and lost permissions explicitly. Disable automatic retries for permanent destination errors and surface them to the owner.

An outbox needs an actual recovery runner: add a lightweight periodic recovery trigger, initially every five minutes, with cron-specific dispatch, capped attempts, and expiry. Recover accepted updates and due outbox jobs; expire scheduled posts after 30 minutes rather than flooding the group with old tables. Normal posts are triggered at the requested slots; this is not a hard real-time delivery guarantee.

Telegram sendMessage offers no application idempotency key. A timeout after Telegram accepts a message can leave delivery uncertain. Record `unknown` separately and avoid blind retries in that state; surface it for owner inspection. Do not claim exactly-once external delivery. Committed match mutations can still be idempotent through database keys and conditional writes.

## Security prerequisite

Do not implement owner settings or account linking on bare `x-user-id` trust. First establish verifiable server-side session/token proof for the narrow configuration/linking flow, using an existing signed credential if one is found during implementation. This does not require swapping auth providers or changing password hashing. Enforce tournament membership inside shared mutation services for both channels. Revoke Telegram write access immediately when membership or an account link is removed.

## Delivery sequence

See `tasks/todo.md`. Each slice must be independently reviewable. Estimated total: approximately 6–9 engineering days including authentication prerequisite, both-backend alignment, concurrency, and end-to-end verification; revise after the first slice. This is an estimate, not a delivery commitment.

Acceptance: configuration and writes reject unauthorised actors; web and bot produce identical teams/ranking semantics; one confirmation makes one mutation; score races fail safely; both scheduled slots publish to the correct connected group; existing pruning and unrelated tournaments remain unaffected.

## Decisions for owner review

Proposed defaults: one group per tournament and one tournament per group; linked tournament members can randomise and score live matches; owners alone correct finished results; all connected group members can read standings; one active match per tournament; daily empty-state posts enabled. Confirm the Wednesday 11:30/12:00 transition before centralising season logic.

## Primary sources

- Telegram Bot API: https://core.telegram.org/bots/api (webhooks, callbacks, member checks, message limits, retries, and group migration).
- Telegram FAQ: https://core.telegram.org/bots/faq (privacy mode and command delivery). Keep privacy mode enabled and use explicitly addressed commands and callbacks; administrator bots may nevertheless receive broader group traffic, which should be ignored and not retained.
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/ (UTC scheduling and local testing).
