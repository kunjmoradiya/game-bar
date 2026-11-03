ALTER TABLE game_play_sessions
  ADD COLUMN IF NOT EXISTS active_duration_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_status text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS device_session_id text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspicious_reason text;

CREATE INDEX IF NOT EXISTS game_play_sessions_verified_user_idx
  ON game_play_sessions(user_id, started_at DESC) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS game_play_sessions_heartbeat_idx
  ON game_play_sessions(last_heartbeat_at) WHERE session_status IN ('playing','idle');
CREATE UNIQUE INDEX IF NOT EXISTS game_play_sessions_one_active_user
  ON game_play_sessions(user_id) WHERE user_id IS NOT NULL AND session_status IN ('playing','idle');

CREATE TABLE IF NOT EXISTS player_presence (
  user_id text PRIMARY KEY,
  player_id text NOT NULL,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online','playing','idle','offline')),
  current_game_id uuid,
  active_session_id text,
  last_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_presence_status_idx ON player_presence(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  player_id text NOT NULL,
  achievement_key text NOT NULL,
  title text NOT NULL,
  reward_points integer NOT NULL DEFAULT 25 CHECK (reward_points >= 0),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS player_achievements_user_idx ON player_achievements(user_id, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS player_challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  player_id text NOT NULL,
  challenge_key text NOT NULL,
  period_start date NOT NULL,
  reward_points integer NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, challenge_key, period_start)
);
CREATE INDEX IF NOT EXISTS player_challenges_user_idx ON player_challenge_completions(user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  points_per_active_minute integer NOT NULL DEFAULT 1 CHECK (points_per_active_minute >= 0),
  daily_time_cap_minutes integer NOT NULL DEFAULT 120 CHECK (daily_time_cap_minutes >= 0),
  points_per_completed_session integer NOT NULL DEFAULT 10 CHECK (points_per_completed_session >= 0),
  daily_session_cap_points integer NOT NULL DEFAULT 50 CHECK (daily_session_cap_points >= 0),
  achievement_reward_points integer NOT NULL DEFAULT 25 CHECK (achievement_reward_points >= 0),
  special_achievement_reward_points integer NOT NULL DEFAULT 50 CHECK (special_achievement_reward_points >= 0),
  daily_challenge_reward_points integer NOT NULL DEFAULT 20 CHECK (daily_challenge_reward_points >= 0),
  daily_challenge_cap_points integer NOT NULL DEFAULT 40 CHECK (daily_challenge_cap_points >= 0),
  weekly_challenge_reward_points integer NOT NULL DEFAULT 100 CHECK (weekly_challenge_reward_points >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO leaderboard_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ranking_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  player_id text,
  actor_id text NOT NULL,
  action text NOT NULL,
  points_changed integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ranking_audit_user_idx ON ranking_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ranking_audit_created_idx ON ranking_audit_logs(created_at DESC);