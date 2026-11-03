CREATE TABLE IF NOT EXISTS player_id_registry (
  user_id text NOT NULL UNIQUE,
  player_id text NOT NULL PRIMARY KEY CHECK (player_id ~ '^GH-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  account_status text NOT NULL DEFAULT 'active'
);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS player_id text;
ALTER TABLE game_activity ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE game_activity ADD COLUMN IF NOT EXISTS player_id text;
ALTER TABLE game_play_sessions ADD COLUMN IF NOT EXISTS player_id text;
ALTER TABLE verified_game_scores ADD COLUMN IF NOT EXISTS player_id text;
ALTER TABLE game_favorites ADD COLUMN IF NOT EXISTS player_id text;
ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS player_id text;
INSERT INTO player_id_registry (user_id, player_id)
SELECT id, 'GH-' || upper(gen_random_uuid()::text)
FROM users
ON CONFLICT (user_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS game_activity_player_idx ON game_activity(player_id, started_at DESC);
CREATE INDEX IF NOT EXISTS game_play_sessions_player_idx ON game_play_sessions(player_id, started_at DESC);
CREATE INDEX IF NOT EXISTS verified_scores_player_idx ON verified_game_scores(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_requests_player_idx ON user_requests(player_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_player_id_unique
ON player_profiles(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS player_id_registry_user_idx ON player_id_registry(user_id);
CREATE OR REPLACE FUNCTION protect_player_id_registry_identity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Player IDs are permanent and cannot be deleted';
  END IF;
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'Player ID registry identities are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS player_id_registry_immutable ON player_id_registry;
CREATE TRIGGER player_id_registry_immutable
BEFORE UPDATE OR DELETE ON player_id_registry
FOR EACH ROW EXECUTE FUNCTION protect_player_id_registry_identity();
CREATE OR REPLACE FUNCTION protect_player_profile_id() RETURNS trigger AS $$
DECLARE registered_id text;
BEGIN
  IF NEW.player_id IS NOT NULL THEN
    SELECT player_id INTO registered_id FROM player_id_registry WHERE user_id=NEW.user_id;
    IF registered_id IS NULL OR registered_id IS DISTINCT FROM NEW.player_id THEN
      RAISE EXCEPTION 'Player ID must match the server-issued registry identity';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.player_id IS NOT NULL AND OLD.player_id IS DISTINCT FROM NEW.player_id THEN
      RAISE EXCEPTION 'Player ID is permanent and cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS player_profiles_player_id_immutable ON player_profiles;
CREATE TRIGGER player_profiles_player_id_immutable
BEFORE INSERT OR UPDATE OF player_id, user_id ON player_profiles
FOR EACH ROW EXECUTE FUNCTION protect_player_profile_id();