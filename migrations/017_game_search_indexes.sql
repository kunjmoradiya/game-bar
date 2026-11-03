CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS games_search_document_trgm_idx
ON games USING gin (
  lower(COALESCE(name,'') || ' ' || COALESCE(slug,'') || ' ' || COALESCE(id::text,'') || ' ' || COALESCE(category,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(developer,'') || ' ' || COALESCE(controls,'') || ' ' || COALESCE(instructions,'') || ' ' || COALESCE(version_label,'') || ' ' || COALESCE(engine_id,'') || ' ' || COALESCE(runtime_id,'')) gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS games_status_updated_idx
ON games (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS games_lower_name_idx
ON games (lower(name));