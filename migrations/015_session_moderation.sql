CREATE TABLE IF NOT EXISTS player_session_moderation (
  session_key text PRIMARY KEY,
  user_id text NOT NULL,
  player_id text NOT NULL,
  excluded boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  actor_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_session_moderation_user_idx
  ON player_session_moderation(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS player_session_moderation_excluded_idx
  ON player_session_moderation(excluded) WHERE excluded=true;