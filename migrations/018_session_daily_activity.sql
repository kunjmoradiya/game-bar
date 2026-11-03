CREATE TABLE IF NOT EXISTS player_session_daily_activity (
  session_key text NOT NULL REFERENCES game_play_sessions(session_key) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id text NOT NULL REFERENCES player_id_registry(player_id),
  activity_date date NOT NULL,
  active_seconds integer NOT NULL DEFAULT 0 CHECK(active_seconds >= 0),
  completed_sessions integer NOT NULL DEFAULT 0 CHECK(completed_sessions >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_key,activity_date)
);
CREATE INDEX IF NOT EXISTS player_session_daily_activity_user_date_idx
  ON player_session_daily_activity(user_id,activity_date DESC);