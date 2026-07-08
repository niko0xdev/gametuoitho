-- daily_challenges.date was the sole PRIMARY KEY, so only ONE game could have
-- a challenge per day — every other game's first request hit
-- "UNIQUE constraint failed: daily_challenges.date" (500). Recreate the table
-- with a composite (date, game_id) PK so each game gets its own daily row.
CREATE TABLE daily_challenges_new (
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  prompt TEXT NOT NULL,
  top_scores TEXT NOT NULL,
  PRIMARY KEY (date, game_id)
);

INSERT INTO daily_challenges_new (id, date, game_id, seed, prompt, top_scores)
SELECT id, date, game_id, seed, prompt, top_scores FROM daily_challenges;

DROP TABLE daily_challenges;
ALTER TABLE daily_challenges_new RENAME TO daily_challenges;
