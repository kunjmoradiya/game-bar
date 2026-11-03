ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS games_played integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS play_seconds bigint NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
CREATE OR REPLACE FUNCTION generate_server_player_id() RETURNS trigger AS $$
BEGIN
  NEW.player_id := 'GH-' || upper(gen_random_uuid()::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS player_id_registry_generate ON player_id_registry;
CREATE TRIGGER player_id_registry_generate
BEFORE INSERT ON player_id_registry
FOR EACH ROW EXECUTE FUNCTION generate_server_player_id();