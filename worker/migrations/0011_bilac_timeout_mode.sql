ALTER TABLE bilac_matches ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'normal' CHECK (match_mode IN ('normal','timeout'));
ALTER TABLE bilac_matches ADD COLUMN sitting_out TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sitting_out) AND json_type(sitting_out)='array');
DROP TRIGGER bilac_matches_expand_results;

-- Expand within the score transaction, including results submitted on the web.
CREATE TRIGGER bilac_matches_expand_results
AFTER UPDATE OF status,score1,score2,team1,team2,benched,timestamp,week_label,sitting_out,match_mode ON bilac_matches
WHEN NEW.result_multiplier=10 AND NEW.source_match_id IS NULL
BEGIN
  DELETE FROM bilac_matches WHERE source_match_id=NEW.id AND tournament_id=NEW.tournament_id AND NEW.status!='FINISHED';
  UPDATE bilac_matches SET score1=NEW.score1,score2=NEW.score2,status=NEW.status,
    team1=NEW.team1,team2=NEW.team2,benched=NEW.benched,timestamp=NEW.timestamp,week_label=NEW.week_label,sitting_out=NEW.sitting_out,match_mode=NEW.match_mode,revision=revision+1
    WHERE source_match_id=NEW.id AND tournament_id=NEW.tournament_id AND NEW.status='FINISHED';
  INSERT INTO bilac_matches (id,tournament_id,timestamp,week_label,team1,team2,benched,score1,score2,status,revision,result_multiplier,source_match_id,match_mode,sitting_out)
    SELECT NEW.id||'-x10-'||n.value,NEW.tournament_id,NEW.timestamp,NEW.week_label,NEW.team1,NEW.team2,NEW.benched,NEW.score1,NEW.score2,'FINISHED',0,1,NEW.id,NEW.match_mode,NEW.sitting_out
    FROM json_each('[2,3,4,5,6,7,8,9,10]') n
    WHERE NEW.status='FINISHED' AND NOT EXISTS (
      SELECT 1 FROM bilac_matches m WHERE m.id=NEW.id||'-x10-'||n.value AND m.source_match_id=NEW.id AND m.tournament_id=NEW.tournament_id
    );
END;
