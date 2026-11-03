CREATE TABLE IF NOT EXISTS game_play_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL UNIQUE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id text,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_play_sessions_started_idx ON game_play_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS game_play_sessions_user_idx ON game_play_sessions(user_id, started_at DESC);
CREATE TABLE IF NOT EXISTS game_favorites (
  user_id text NOT NULL,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, game_id)
);
CREATE TABLE IF NOT EXISTS player_profiles (
  user_id text PRIMARY KEY,
  username text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  game_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  game_url text NOT NULL DEFAULT '',
  game_html text NOT NULL DEFAULT '',
  thumbnail_key text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  owner_response text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_submissions_status_idx ON game_submissions(status, created_at DESC);
CREATE TABLE IF NOT EXISTS verified_game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  username text NOT NULL DEFAULT '',
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  score bigint NOT NULL,
  points bigint NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verified_scores_period_idx ON verified_game_scores(verified, created_at DESC, points DESC);