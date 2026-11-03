CREATE TABLE IF NOT EXISTS player_leaderboard_controls (
  user_id text PRIMARY KEY,
  player_id text NOT NULL UNIQUE,
  leaderboard_suspended boolean NOT NULL DEFAULT false,
  moderation_reason text NOT NULL DEFAULT '',
  actor_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_leaderboard_controls_suspended_idx
  ON player_leaderboard_controls(leaderboard_suspended) WHERE leaderboard_suspended=true;