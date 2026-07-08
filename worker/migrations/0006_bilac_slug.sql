-- Add slug column for public /bilac/{slug} deep-link view-only access.
ALTER TABLE bilac_tournaments ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bilac_tournaments_slug ON bilac_tournaments(slug) WHERE slug IS NOT NULL;
