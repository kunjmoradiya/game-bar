CREATE TABLE IF NOT EXISTS player_search_rate_limits (
  actor_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS player_search_rate_window_idx ON player_search_rate_limits(window_started_at);