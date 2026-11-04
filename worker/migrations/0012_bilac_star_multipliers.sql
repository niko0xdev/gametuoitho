-- A null factor reads the legacy value without rewriting match revisions.
ALTER TABLE bilac_matches ADD COLUMN result_factor INTEGER CHECK (result_factor IN (1,2,3,5,8,10,13));
DROP TRIGGER bilac_matches_expand_results;
DROP TRIGGER bilac_matches_delete_results;

-- Expand within the score transaction, including results submitted on the web.
CREATE TRIGGER bilac_matches_expand_results
AFTER UPDATE OF status,score1,score2,team1,team2,benched,timestamp,week_label,sitting_out,match_mode,result_factor ON bilac_matches
WHEN COALESCE(NEW.result_factor,NEW.result_multiplier)>1 AND NEW.source_match_id IS NULL
BEGIN
  DELETE FROM bilac_matches WHERE source_match_id=NEW.id AND tournament_id=NEW.tournament_id AND NEW.status!='FINISHED';
  UPDATE bilac_matches SET score1=NEW.score1,score2=NEW.score2,status=NEW.status,
    team1=NEW.team1,team2=NEW.team2,benched=NEW.benched,timestamp=NEW.timestamp,week_label=NEW.week_label,sitting_out=NEW.sitting_out,match_mode=NEW.match_mode,revision=revision+1
    WHERE source_match_id=NEW.id AND tournament_id=NEW.tournament_id AND NEW.status='FINISHED';
  INSERT INTO bilac_matches (id,tournament_id,timestamp,week_label,team1,team2,benched,score1,score2,status,revision,result_multiplier,source_match_id,match_mode,sitting_out,result_factor)
    SELECT NEW.id||'-x'||COALESCE(NEW.result_factor,NEW.result_multiplier)||'-'||n.value,NEW.tournament_id,NEW.timestamp,NEW.week_label,NEW.team1,NEW.team2,NEW.benched,NEW.score1,NEW.score2,'FINISHED',0,1,NEW.id,NEW.match_mode,NEW.sitting_out,1
    FROM json_each('[2,3,4,5,6,7,8,9,10,11,12,13]') n
    WHERE NEW.status='FINISHED' AND n.value<=COALESCE(NEW.result_factor,NEW.result_multiplier) AND NOT EXISTS (
      SELECT 1 FROM bilac_matches m WHERE m.id=NEW.id||'-x'||COALESCE(NEW.result_factor,NEW.result_multiplier)||'-'||n.value AND m.source_match_id=NEW.id AND m.tournament_id=NEW.tournament_id
    );
END;

CREATE TRIGGER bilac_matches_delete_results AFTER DELETE ON bilac_matches
WHEN OLD.source_match_id IS NULL AND COALESCE(OLD.result_factor,OLD.result_multiplier)>1
BEGIN
  DELETE FROM bilac_matches WHERE source_match_id=OLD.id AND tournament_id=OLD.tournament_id;
END;
