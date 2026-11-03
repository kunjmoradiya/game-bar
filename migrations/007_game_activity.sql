CREATE TABLE IF NOT EXISTS game_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL UNIQUE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS game_activity_started_idx ON game_activity(started_at DESC);
CREATE INDEX IF NOT EXISTS game_activity_game_idx ON game_activity(game_id, started_at DESC);