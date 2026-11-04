# Telegram result multipliers

## Behaviour

The web application and Mini App offer ordinary matches (×1) and the Vietnamese-labelled "Ngôi sao tuyệt vọng" mode with ×2, ×3, ×5, ×8, or ×13. The factor is independent of random, manual, and four-player timeout selection. One playing match becomes exactly N finished records when confirmed, including the original. All records share teams, scores, tournament, timestamp, season, and the people sitting out. Standings count only the people playing.

## Contract and persistence

- Optional `resultMultiplier` defaults to 1. It is included in the immutable Mini App retry payload. Changing the factor or people after submission returns a conflict.
- The normalised factor lives in `result_factor`, exposed as `resultMultiplier`. The original `result_multiplier` column remains constrained to 1 or 10 for compatibility with older Workers and stored confirmation drafts. New readers use `result_factor`, falling back to the legacy value for existing rows and old draft snapshots.
- Migration 0012 adds a nullable factor without rebuilding the table or rewriting existing match IDs, results, counts, or revisions. A null factor reads the legacy value, which also preserves ×10 writes from older Workers during deployment.
- Expansion happens within the score transaction for both web and Telegram submissions. Copy IDs retain the `-x10-` convention for old ×10 matches; other factors use `-xN-`. Retries cannot add duplicates.
- Correcting the original synchronises its copies. Reopening or deleting it removes the copies. Generated copies cannot be edited or deleted individually.
- New controls offer the requested factors. Legacy ×10 matches and pending submissions remain supported.
- Existing group binding, membership, actor, ownership, revision, and confirmation checks remain in force.

## Verification and delivery

Run `npm run lint`, `npm --prefix worker run lint`, `npm --prefix worker test`, frontend lint and tests, and the frontend build. Verify every factor, both winners, retries, invalid factors, corrections, reopening, deletion, outside-player exclusion, and migration of existing ×10 data in memory. Do not mutate real production matches for testing.

Apply migration 0012, deploy the Worker, and then deploy the current main-based frontend with the standalone Mini App entry preserved. The legacy Express backend is outside the approved production scope.
