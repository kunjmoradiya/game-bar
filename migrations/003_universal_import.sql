ALTER TABLE games
  ADD COLUMN IF NOT EXISTS engine_id TEXT NOT NULL DEFAULT 'html5',
  ADD COLUMN IF NOT EXISTS runtime_id TEXT NOT NULL DEFAULT 'iframe',
  ADD COLUMN IF NOT EXISTS build_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS build_report JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS game_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  asset_path TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  byte_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_id, asset_path)
);
CREATE INDEX IF NOT EXISTS game_assets_game_id_idx ON game_assets(game_id);