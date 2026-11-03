-- Repair the presence rollup that was added to the already-applied
-- SuperCoin migration after its first deployment. This table stores online
-- time separately from verified gameplay time.
CREATE TABLE IF NOT EXISTS player_presence_daily_activity (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES player_id_registry(player_id),
  activity_date date NOT NULL,
  online_seconds integer NOT NULL DEFAULT 0 CHECK (online_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date)
);
CREATE INDEX IF NOT EXISTS player_presence_daily_user_date_idx
  ON player_presence_daily_activity(user_id, activity_date DESC);