ALTER TABLE games ADD COLUMN IF NOT EXISTS aliases text NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS tags text NOT NULL DEFAULT '';
ALTER TABLE games ADD COLUMN IF NOT EXISTS keywords text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS games_search_metadata_trgm_idx
ON games USING gin (
  lower(COALESCE(aliases,'') || ' ' || COALESCE(tags,'') || ' ' || COALESCE(keywords,'')) gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS games_search_all_trgm_idx
ON games USING gin (
  lower(COALESCE(name,'') || ' ' || COALESCE(slug,'') || ' ' || COALESCE(id::text,'') || ' ' || COALESCE(category,'') || ' ' || COALESCE(aliases,'') || ' ' || COALESCE(tags,'') || ' ' || COALESCE(keywords,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(developer,'') || ' ' || COALESCE(controls,'') || ' ' || COALESCE(instructions,'') || ' ' || COALESCE(version_label,'') || ' ' || COALESCE(engine_id,'') || ' ' || COALESCE(runtime_id,'') || ' ' || COALESCE(game_type,'')) gin_trgm_ops
);