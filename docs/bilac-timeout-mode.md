# Four-player timeout mode

## Approved scope

Offer the Vietnamese-labelled `Hết giờ` selection mode in the production web application and Telegram Mini App. Require at least four selected players, choose exactly four uniformly at random, split them into two teams of two, and retain everyone else as sitting out. They receive no match, win, loss, or points from that result. Ordinary and ×10 result counting remain independent options. Existing manual teams and full-roster randomisation retain their behaviour.

## Contract and persistence

- Web creation: optional `matchMode: 'normal' | 'timeout'`, defaulting to `normal`.
- Mini App submission: `mode: 'random' | 'manual' | 'timeout'`; the mode is part of the immutable retry payload. Only submission sends the selected roster.
- Match responses: `matchMode` and `sittingOut: string[]`. Existing `benched` continues to describe the single reserve in ordinary odd-sized games.
- Migration 0011 adds `match_mode` and JSON `sitting_out`. The ×10 transaction trigger preserves both on all copies, including subsequent corrections. Existing matches remain in ordinary mode.
- Group membership, owner binding, tournament scope, actor generations, and revision checks remain unchanged. The two-hour presence cache retains all selected people, including those sitting out.
- Timeout mode changes selection, while the existing result controls still finish or cancel the match. This feature introduces no countdown or automatic result submission.

## Verification and delivery

Run `npm run lint`, `npm --prefix worker run lint`, and `npm --prefix worker test`. Run frontend lint and tests, then build the current main-based frontend with the existing Mini App entry preserved. Use in-memory fixtures for browser and API checks. Verify four-player cardinality, complete and disjoint rosters, insufficient and foreign players, retries, ordinary pairing, group members without web links, ×10 counting, and outside players receiving no results.

Apply migration 0011, deploy the Worker, and then deploy the frontend. The legacy Express backend is outside the approved production scope. Do not mutate real production matches for verification.
