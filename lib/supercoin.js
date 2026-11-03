import { db } from 'hatchable';

export async function ensureWallet(userId, playerId) {
 await db.query("INSERT INTO supercoin_wallets(user_id,player_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET player_id=EXCLUDED.player_id,updated_at=NOW()",[userId,playerId]);
}
export async function awardSuperCoins({userId,playerId,ruleKey,referenceKey,reason,sessionKey=null,gameId=null,amountOverride=null}) {
 const rule=await db.query("SELECT amount,daily_limit,enabled FROM supercoin_rules WHERE rule_key=$1",[ruleKey]);
 if(!rule.rows[0] || !rule.rows[0].enabled) return {awarded:0,duplicate:false,disabled:true};
 const amount=amountOverride===null?Number(rule.rows[0].amount):Math.max(0,Math.floor(Number(amountOverride)||0));
 if(!amount)return {awarded:0,duplicate:false};
 await ensureWallet(userId,playerId);
 const inserted=await db.query(`
  WITH lock_key AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext($1||$6))),
  ins AS (
   INSERT INTO supercoin_transactions(user_id,player_id,amount,transaction_type,reason,reference_key,rule_key,session_key,related_game_id)
   SELECT $1,$2,$3,'earn',$4,$5,$6,$7,$8 FROM lock_key
   WHERE NOT EXISTS(SELECT 1 FROM player_leaderboard_controls WHERE user_id=$1 AND reward_suspended=true)
    AND ($7::text IS NULL OR NOT EXISTS(SELECT 1 FROM game_play_sessions s WHERE s.session_key=$7 AND s.suspicious_reason IS NOT NULL))
    AND ($9::int=0 OR (SELECT COUNT(*) FROM supercoin_transactions WHERE user_id=$1 AND rule_key=$6 AND transaction_type='earn' AND created_at >= date_trunc('day',NOW())) < $9)
   ON CONFLICT(reference_key) DO NOTHING RETURNING id,amount
  ), wallet_update AS (
   UPDATE supercoin_wallets w SET balance=w.balance+i.amount,total_earned=w.total_earned+i.amount,updated_at=NOW()
   FROM ins i WHERE w.user_id=$1 RETURNING w.balance
  ), profile_update AS (
   UPDATE player_profiles p SET gamer_xp=p.gamer_xp+i.amount,gamer_level=LEAST(10,GREATEST(1,1+FLOOR((p.gamer_xp+i.amount)::numeric/100)::int)),updated_at=NOW()
   FROM ins i WHERE p.user_id=$1 RETURNING p.user_id
  )
  SELECT i.id,i.amount,w.balance FROM ins i JOIN wallet_update w ON true
 `,[userId,playerId,amount,reason,referenceKey,ruleKey,sessionKey,gameId,Number(rule.rows[0].daily_limit)||0]);
 if(!inserted.rows.length)return {awarded:0,duplicate:true};
 return {awarded:Number(inserted.rows[0].amount),transaction_id:inserted.rows[0].id,balance:Number(inserted.rows[0].balance),duplicate:false};
}
export async function getLevel(xp) {
 const names=['Beginner','Rookie','Explorer','Pro Gamer','Expert','Elite','Champion','Legend','Master','Super Legend'];
 const level=Math.min(10,Math.max(1,Math.floor((Number(xp)||0)/100)+1));
 return {level,name:names[level-1],xp:Number(xp)||0,next_level_xp:level===10?null:level*100};
}