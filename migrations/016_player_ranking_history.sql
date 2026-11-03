CREATE TABLE IF NOT EXISTS player_ranking_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  player_id text NOT NULL,
  snapshot_date date NOT NULL,
  global_rank integer NOT NULL CHECK (global_rank > 0),
  total_points bigint NOT NULL DEFAULT 0,
  active_seconds bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,snapshot_date)
);
CREATE INDEX IF NOT EXISTS player_ranking_history_user_date_idx
  ON player_ranking_history(user_id,snapshot_date DESC);