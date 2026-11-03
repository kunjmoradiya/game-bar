CREATE TABLE IF NOT EXISTS leaderboard_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_one_active_season
  ON leaderboard_seasons(status) WHERE status='active';
INSERT INTO leaderboard_seasons(name,starts_at,status,created_by)
SELECT 'Season 1',NOW(),'active','system'
WHERE NOT EXISTS(SELECT 1 FROM leaderboard_seasons WHERE status='active');