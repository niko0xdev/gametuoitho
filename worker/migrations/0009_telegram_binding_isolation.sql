ALTER TABLE bilac_telegram ADD COLUMN binding_id TEXT;
UPDATE bilac_telegram SET binding_id = lower(hex(randomblob(16)));
CREATE UNIQUE INDEX bilac_telegram_binding_id ON bilac_telegram(binding_id);
CREATE TRIGGER bilac_telegram_assign_binding AFTER INSERT ON bilac_telegram
WHEN NEW.binding_id IS NULL
BEGIN
  UPDATE bilac_telegram SET binding_id = lower(hex(randomblob(16))) WHERE tournament_id = NEW.tournament_id;
END;
ALTER TABLE telegram_drafts ADD COLUMN binding_id TEXT;
ALTER TABLE telegram_outbox ADD COLUMN binding_id TEXT;
-- Old pending work has no verified binding generation and must fail closed.
DELETE FROM telegram_drafts;
UPDATE telegram_outbox SET status = 'cancelled' WHERE status = 'pending';
UPDATE telegram_updates SET status = 'done', payload = '{}' WHERE status = 'pending';
ALTER TABLE telegram_links ADD COLUMN link_id TEXT;
UPDATE telegram_links SET link_id = lower(hex(randomblob(16)));
CREATE UNIQUE INDEX telegram_link_generation ON telegram_links(link_id);
CREATE TRIGGER telegram_assign_link AFTER INSERT ON telegram_links
WHEN NEW.link_id IS NULL
BEGIN
  UPDATE telegram_links SET link_id = lower(hex(randomblob(16))) WHERE telegram_id = NEW.telegram_id;
END;
ALTER TABLE telegram_drafts ADD COLUMN user_id TEXT;
ALTER TABLE telegram_drafts ADD COLUMN link_id TEXT;
ALTER TABLE telegram_tokens ADD COLUMN link_id TEXT;
DELETE FROM telegram_tokens WHERE purpose = 'group';
