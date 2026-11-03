ALTER TABLE game_play_sessions ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE game_play_sessions ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;