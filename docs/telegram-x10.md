# Telegram ten-result matches

## Approved behaviour

The Mini App offers ordinary and ×10 matches for both random and manually assigned teams. Ordinary matches remain the default. Choosing ×10 creates one playing match; confirming its result produces ten finished records in total, including the original. Teams, scores, tournament, timestamp, and season are identical. The standings therefore count ten results. Selecting the mode or players remains local until submission.

## Implementation

- The form accepts optional `resultMultiplier: 1 | 10`, defaulting to 1. The submitted multiplier is part of its immutable retry payload.
- D1 stores `result_multiplier` on the original and `source_match_id` on the nine copies. Existing matches default to ordinary mode.
- An update trigger expands the result inside the existing score transaction. It covers both Telegram and web submissions without additional network round trips. Deterministic copy IDs prevent duplication.
- Correcting the original synchronises its copies. Reopening or deleting the original removes its copies. The original remains the place to manage the complete series.
- Existing group, tournament, actor, ownership, revision, and confirmation checks remain in force. A cancelled playing match generates no copies.

## Delivery and verification

Apply migration 0010 before deploying the Worker; deploy the Mini App from the frontend branch that preserves the current main application and its separate Telegram entry. No new dependencies, credentials, or permission changes are required.

Run `npm run lint`, `npm --prefix worker run lint`, `npm --prefix worker test`, and `npm run build:fe`. Use the in-memory Telegram preview for browser checks and route smoke tests. Verify ordinary mode, both winners, retries, invalid multipliers, corrections, cancellation, and transaction rollback. Do not mutate production matches for testing.
