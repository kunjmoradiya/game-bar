-- GAME HUB SuperCoin economy and ranking extension. Existing identities and sessions are reused.
CREATE TABLE IF NOT EXISTS player_session_daily_activity (
 session_key text NOT NULL REFERENCES game_play_sessions(session_key) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL,
 activity_date date NOT NULL,
 active_seconds integer NOT NULL DEFAULT 0 CHECK(active_seconds>=0),
 completed_sessions integer NOT NULL DEFAULT 0 CHECK(completed_sessions>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_key,activity_date)
);
CREATE INDEX IF NOT EXISTS player_session_daily_activity_user_date_idx ON player_session_daily_activity(user_id,activity_date DESC);
DO $$ BEGIN ALTER TABLE player_session_daily_activity ADD CONSTRAINT player_session_daily_activity_session_fk FOREIGN KEY(session_key) REFERENCES game_play_sessions(session_key) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE player_session_daily_activity ADD CONSTRAINT player_session_daily_activity_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE player_session_daily_activity ADD CONSTRAINT player_session_daily_activity_player_fk FOREIGN KEY(player_id) REFERENCES player_id_registry(player_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS player_presence_daily_activity (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL REFERENCES player_id_registry(player_id),
 activity_date date NOT NULL,
 online_seconds integer NOT NULL DEFAULT 0 CHECK(online_seconds>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,activity_date)
);
CREATE INDEX IF NOT EXISTS player_presence_daily_user_date_idx ON player_presence_daily_activity(user_id,activity_date DESC);

ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS gamer_xp bigint NOT NULL DEFAULT 0 CHECK(gamer_xp>=0);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS gamer_level integer NOT NULL DEFAULT 1 CHECK(gamer_level BETWEEN 1 AND 10);
ALTER TABLE player_achievements ADD COLUMN IF NOT EXISTS reward_sc integer NOT NULL DEFAULT 0 CHECK(reward_sc>=0);
ALTER TABLE player_achievements ADD COLUMN IF NOT EXISTS xp_awarded integer NOT NULL DEFAULT 0 CHECK(xp_awarded>=0);
ALTER TABLE player_challenge_completions ADD COLUMN IF NOT EXISTS reward_sc integer NOT NULL DEFAULT 0 CHECK(reward_sc>=0);
ALTER TABLE player_leaderboard_controls ADD COLUMN IF NOT EXISTS reward_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE player_leaderboard_controls ADD COLUMN IF NOT EXISTS reward_suspension_reason text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS supercoin_wallets (
 user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL UNIQUE REFERENCES player_id_registry(player_id),
 balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0),
 total_earned bigint NOT NULL DEFAULT 0 CHECK(total_earned>=0),
 total_spent bigint NOT NULL DEFAULT 0 CHECK(total_spent>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO supercoin_wallets(user_id,player_id) SELECT user_id,player_id FROM player_id_registry ON CONFLICT(user_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS supercoin_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL,
 amount integer NOT NULL CHECK(amount<>0),
 transaction_type text NOT NULL CHECK(transaction_type IN ('earn','spend','adjustment','reversal')),
 reason text NOT NULL,
 reference_key text NOT NULL UNIQUE,
 rule_key text,
 session_key text,
 related_game_id uuid REFERENCES games(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercoin_tx_user_date_idx ON supercoin_transactions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS supercoin_tx_type_date_idx ON supercoin_transactions(transaction_type,created_at DESC);
CREATE INDEX IF NOT EXISTS supercoin_tx_rule_daily_idx ON supercoin_transactions(user_id,rule_key,created_at DESC) WHERE transaction_type='earn';
CREATE INDEX IF NOT EXISTS supercoin_tx_player_idx ON supercoin_transactions(player_id,created_at DESC);
CREATE TABLE IF NOT EXISTS supercoin_rules (
 rule_key text PRIMARY KEY,
 title text NOT NULL,
 amount integer NOT NULL CHECK(amount>=0),
 daily_limit integer NOT NULL DEFAULT 0 CHECK(daily_limit>=0),
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO supercoin_rules(rule_key,title,amount,daily_limit) VALUES
 ('active_10m','10 minutes verified active gameplay',5,12),
 ('completed_session','Complete an eligible game session',5,10),
 ('first_game_daily','First game played each day',5,1),
 ('daily_login','Daily login',2,1),
 ('daily_challenge','Complete a daily challenge',10,4),
 ('weekly_challenge','Complete a weekly challenge',50,2),
 ('achievement','Unlock an achievement',10,0)
ON CONFLICT(rule_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS supercoin_rewards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reward_key text NOT NULL UNIQUE,
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 image_url text NOT NULL DEFAULT '',
 reward_type text NOT NULL DEFAULT 'profile_badge',
 cost_sc integer NOT NULL CHECK(cost_sc>0),
 stock_remaining integer CHECK(stock_remaining IS NULL OR stock_remaining>=0),
 max_per_user integer NOT NULL DEFAULT 1 CHECK(max_per_user>0),
 min_level integer NOT NULL DEFAULT 1 CHECK(min_level BETWEEN 1 AND 10),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS supercoin_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL,
 reward_id uuid NOT NULL REFERENCES supercoin_rewards(id),
 reward_name text NOT NULL,
 cost_sc integer NOT NULL CHECK(cost_sc>0),
 idempotency_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'fulfilled' CHECK(status IN ('fulfilled','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercoin_redemptions_user_idx ON supercoin_redemptions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS player_equipped_rewards (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL REFERENCES player_id_registry(player_id),
 reward_type text NOT NULL,
 redemption_id uuid NOT NULL UNIQUE REFERENCES supercoin_redemptions(id) ON DELETE CASCADE,
 reward_id uuid NOT NULL REFERENCES supercoin_rewards(id),
 equipped_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,reward_type)
);

CREATE TABLE IF NOT EXISTS supercoin_challenges (
 challenge_key text PRIMARY KEY,
 period text NOT NULL CHECK(period IN ('daily','weekly','event')),
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 metric text NOT NULL CHECK(metric IN ('active_minutes','completed_sessions','games_played','coins_earned','login_days')),
 target integer NOT NULL CHECK(target>0),
 reward_sc integer NOT NULL CHECK(reward_sc>=0),
 enabled boolean NOT NULL DEFAULT true,
 starts_at timestamptz,
 ends_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO supercoin_challenges(challenge_key,period,title,description,metric,target,reward_sc) VALUES
 ('daily:active-20','daily','Warm-up 20','Play actively for 20 verified minutes','active_minutes',20,10),
 ('daily:session-2','daily','Double Match','Complete 2 eligible game sessions','completed_sessions',2,10),
 ('weekly:active-180','weekly','Weekly Grinder','Reach 180 verified active minutes this week','active_minutes',180,50),
 ('weekly:session-10','weekly','Ten Game Week','Complete 10 eligible sessions this week','completed_sessions',10,50)
ON CONFLICT(challenge_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS gamer_rank_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
 coin_weight numeric(5,4) NOT NULL DEFAULT 0.35 CHECK(coin_weight>=0 AND coin_weight<=1),
 hours_weight numeric(5,4) NOT NULL DEFAULT 0.25 CHECK(hours_weight>=0 AND hours_weight<=1),
 sessions_weight numeric(5,4) NOT NULL DEFAULT 0.15 CHECK(sessions_weight>=0 AND sessions_weight<=1),
 achievement_weight numeric(5,4) NOT NULL DEFAULT 0.15 CHECK(achievement_weight>=0 AND achievement_weight<=1),
 consistency_weight numeric(5,4) NOT NULL DEFAULT 0.10 CHECK(consistency_weight>=0 AND consistency_weight<=1),
 coin_cap bigint NOT NULL DEFAULT 10000 CHECK(coin_cap>0),
 hours_cap integer NOT NULL DEFAULT 500 CHECK(hours_cap>0),
 sessions_cap integer NOT NULL DEFAULT 500 CHECK(sessions_cap>0),
 achievement_cap integer NOT NULL DEFAULT 1000 CHECK(achievement_cap>0),
 consistency_days integer NOT NULL DEFAULT 30 CHECK(consistency_days>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(abs(coin_weight+hours_weight+sessions_weight+achievement_weight+consistency_weight-1.0)<0.0001)
);
INSERT INTO gamer_rank_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gamer_ranking_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 snapshot_date date NOT NULL,
 period text NOT NULL CHECK(period IN ('daily','weekly','monthly','all')),
 category text NOT NULL DEFAULT '',
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 player_id text NOT NULL,
 score numeric(8,3) NOT NULL,
 rank integer NOT NULL CHECK(rank>0),
 active_seconds bigint NOT NULL DEFAULT 0,
 completed_sessions integer NOT NULL DEFAULT 0,
 coin_earned bigint NOT NULL DEFAULT 0,
 achievement_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(snapshot_date,period,category,user_id)
);
CREATE INDEX IF NOT EXISTS gamer_rank_snapshot_lookup_idx ON gamer_ranking_snapshots(period,category,snapshot_date DESC,rank);

CREATE TABLE IF NOT EXISTS supercoin_admin_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id text NOT NULL,
 action text NOT NULL,
 target_user_id text,
 player_id text,
 reason text NOT NULL,
 previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supercoin_admin_audit_date_idx ON supercoin_admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS supercoin_admin_audit_user_idx ON supercoin_admin_audit_logs(target_user_id,created_at DESC);

CREATE OR REPLACE FUNCTION supercoin_ledger_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'SuperCoin transactions are immutable; use a new audited adjustment'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS supercoin_transactions_immutable ON supercoin_transactions;
CREATE TRIGGER supercoin_transactions_immutable BEFORE UPDATE OR DELETE ON supercoin_transactions FOR EACH ROW EXECUTE FUNCTION supercoin_ledger_immutable();

CREATE OR REPLACE FUNCTION supercoin_wallet_guard() RETURNS trigger AS $$
BEGIN
 IF NEW.balance<0 OR NEW.total_earned<0 OR NEW.total_spent<0 THEN RAISE EXCEPTION 'Invalid SuperCoin wallet totals'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS supercoin_wallet_guard_trigger ON supercoin_wallets;
CREATE TRIGGER supercoin_wallet_guard_trigger BEFORE INSERT OR UPDATE ON supercoin_wallets FOR EACH ROW EXECUTE FUNCTION supercoin_wallet_guard();