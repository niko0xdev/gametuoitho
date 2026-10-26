# Bi Lac Telegram integration

## Local test

Run `npm run dev:telegram`, then open http://localhost:3310/telegram-test.

The simulator uses the actual Worker command handlers, settings component, pairing service, standings helper, SQL migrations, and an in-memory SQLite fixture. Telegram HTTP calls are intercepted only inside this loopback-only development process. It does not read the application database, use a real bot token, or send messages to a real group. Restarting the process clears the fixture. The local owner account is signed in automatically; its fixed fixture credentials are never installed in production.

Try this sequence:

1. Send `/addplayer Dũng` and confirm. The player appears in the stored roster.
2. Send `/random`, select present players, and confirm. Odd rosters include one reserve.
3. Reply to the match message with `/score 10 7`; select live save or finish.
4. Send `/bxh` and compare with the standings beside the chat.
5. Trigger 13:20 twice and 21:00 once. There should be one scheduled post per slot for that date.
6. Enable the unlinked-person checkbox and try a write command or another person's buttons. It must be rejected.

The group starts connected for convenience. The settings panel can pause scheduled posts, send a test table, or disconnect it. Real account/group linking is covered by integration tests, since the simulator's bot username is a fixture.

## Production setup

The global `TELEGRAM_ENABLED` Worker ENV flag is an explicit opt-in; absent or false values disable the integration. Production was enabled for `@gtt_bilac_bot` on 26 October 2026 after credential provisioning and webhook registration. Telegram is available only when it is exactly `true` and all three bot ENV values below exist. With the flag off, the settings panel is hidden, configuration/webhook routes reject requests, and command processing, recovery, outbound delivery, and scheduled posts do no work. `GET /api/telegram/capabilities` returns only the effective enabled boolean and is never cached. Provision bot credentials through Worker secrets only; no frontend/API field accepts bot credentials. Change the flag in Worker environment configuration and redeploy to enable the integration after provisioning.

Group configuration belongs exclusively to the verified tournament owner. Ordinary members can link their own account, but cannot issue group tokens, bind, rebind, pause, test-post, or disconnect groups, and do not receive group configuration details. Membership and identity always come from the verified session and database, never from a claimed owner role or tournament access code.

Every group binding and Telegram account link has an independent generation ID. The webhook stamps the current generations from database state, overriding any supplied association. Drafts retain their original tournament, group, application user, and link generation. Subsequent processing and SQL mutations require the same live association. Rebinding even to the same group, or unlinking/relinking the same Telegram ID, invalidates old work. Outbox jobs also carry binding generations; stale jobs are cancelled and an old migration response cannot change a replacement binding. The database enforces unique tournament and group bindings.

Runtime support is implemented in the Cloudflare Worker/D1 backend. Legacy Express retains its existing game routes and shares the season helper; it does not host the Telegram webhook or scheduler. Use the Worker or the isolated simulator to test this feature.

Before release, apply `worker/migrations/0008_telegram.sql` and `worker/migrations/0009_telegram_binding_isolation.sql` through the normal D1 migration command. It adds session, integration, draft, inbox, outbox, and audit tables, plus match revisions. Deploy the Worker and frontend together: the Worker now requires a verified login session for existing gated Bi Lac mutations. Existing logged-in users must sign out and sign in again. Anonymous public views remain available. No auth provider or password-hashing algorithm is changed.

Provide these Worker secrets interactively, without placing values in source, chat, shell history, or a checked-in file:

```sh
cd worker
npx wrangler@3.114.17 secret put TELEGRAM_BOT_TOKEN
npx wrangler@3.114.17 secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler@3.114.17 secret put TELEGRAM_BOT_USERNAME
```

The username has no leading `@`. Generate the webhook secret from a cryptographically secure source; use 1–256 characters from letters, digits, `_`, and `-`. The setup process and Worker must use the same bot token and webhook secret. Provision them through your secret manager into the setup process environment, then explicitly run `node scripts/configure-telegram-webhook.mjs` from the repository root. The script registers the webhook and command menu; it does not deploy the application. Default webhook URL: `https://gametuoitho.space/api/telegram/webhook`. Override it with `TELEGRAM_WEBHOOK_URL` only for a separately configured HTTPS test endpoint.

Use a separate development bot for real end-to-end testing. A bot has one active webhook, so never point the production bot at a temporary local tunnel. The setup script preserves pending updates.

## Connect and use

1. Sign in on the web, open the tournament's members tab, and find Telegram settings.
2. Generate an account link, open the bot privately, and press Start. Return to the web, refresh, check the numeric Telegram ID, and confirm.
3. The tournament owner adds the bot as a group administrator and generates a group code on the web. The linked owner must also be a group administrator and must send the code as themselves, not as an anonymous administrator.
4. Send the connection command in the group. Return to the web, refresh, check the group title/ID, and confirm sharing standings with that group.
5. Use the explicit test-post button, then try one disposable match before enabling the integration for an established tournament.

One group maps to one tournament, and each tournament maps to one group. A tournament can have only one active match when creating new matches through the Worker. Existing historical data is retained. People operating the bot must link an existing application account and retain tournament membership. Player records do not need individual Telegram accounts.

Commands in groups with several bots should include the username:

```text
/help@your_bot
/random@your_bot
/addplayer@your_bot Tên người chơi
/score@your_bot match-reference 10 7
/bxh@your_bot
```

When replying to the bot's match message, omit the match reference from `/score`. Scores must be integers from 0 to 999. This is an input bound, not a new winning-score rule. Finishing a match requires explicit confirmation. Only tournament owners can correct finished results. Selections and confirmations expire after ten minutes. A stale score preview cannot overwrite a newer web result.

## Schedule and operations

- `20 6 * * *`: 13:20 Asia/Ho_Chi_Minh.
- `0 14 * * *`: 21:00 Asia/Ho_Chi_Minh.
- `*/5 * * * *`: recover accepted updates and retry due outbound work; remove expired temporary data.
- `13 */6 * * *`: existing unverified-account pruning, dispatched independently.

Posts are fresh messages at both slots even when standings are unchanged. Empty seasons still produce a table/empty state. The configured slot is a target time, not a hard real-time guarantee. A scheduled post expires after 30 minutes to avoid stale-message floods. Table output includes at most 20 players and a public view-only link. Weekly ranking uses wins minus losses, then wins; season labels retain the existing Wednesday 11:30 transition and the displayed Wednesday 12:00 start convention.

The inbox deduplicates update IDs. Match creation and score confirmation use persistent operation IDs. Outbound jobs have unique logical keys and atomic claims. A Telegram timeout may still mean the message was delivered: such jobs become `unknown`, and are not retried automatically. Inspect the group before sending a replacement. Telegram 429 responses respect `retry_after`; bounded retries handle explicit transient errors. Owner settings show failed/uncertain jobs and destination health. Removing the bot disables the integration; reconnect after restoring access. Group migration updates the stored destination.

Retention: temporary tokens/drafts expire after ten minutes; sessions last seven days and are revoked on web logout or password change; accepted update payloads are scrubbed on completion and inbox rows expire after seven days; outbound jobs expire from storage after 30 days. Match audit history is retained. Account unlinking removes Telegram write access; disconnecting the group cancels pending deliveries and invalidates drafts.

Rollback: pause scheduled posts or disconnect the group first, then disable the webhook if required. Preserve additive tables, audit rows, and saved match results. Follow repository confirmation rules before pushing, merging, or changing production.

## Verification

Run `npm run lint`, `npm --prefix worker run lint`, `npm run test:fast`, `npm --prefix worker test`, `npm run test:co-tuong`, and `npm run build`. A Wrangler dry-run also checks the Worker bundle without deployment. The integration tests apply all real migration files to disposable SQLite, exercise verified login/account/group linking, reject forged headers, verify logout, add a player, recover failed keyboard edits, create and finish a match, detect stale revisions, and deduplicate scheduled posts.

Local simulation cannot verify the real bot's Telegram permissions, webhook delivery, Cloudflare scheduling latency, or production secret configuration. Complete those checks in an opted-in test group after configuration.
