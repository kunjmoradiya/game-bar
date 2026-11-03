import { db, events } from 'hatchable';
import { awardSuperCoins, ensureWallet, getLevel } from 'lib/supercoin.js';
export const access='user';
export const methods=['GET','POST'];
const publish=async(event,data)=>{try{await events.publish('leaderboard',event,data)}catch(_){}};
async function identity(uid){
 const r=await db.query("SELECT r.player_id,u.email_verified_at,p.username,p.gamer_xp,p.gamer_level FROM player_id_registry r JOIN users u ON u.id=r.user_id LEFT JOIN player_profiles p ON p.user_id=r.user_id WHERE r.user_id=$1 LIMIT 1",[uid]);
 if(!r.rows[0])return null;
 return {...r.rows[0],verified:!!r.rows[0].email_verified_at};
}
async function progress(uid,key,period,startDate=null){
 const now=new Date();
 let start;
 if(startDate){const d=new Date(startDate);start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()))}
 else if(period==='weekly'){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));start=new Date(d.getTime()-((d.getUTCDay()+6)%7)*86400000)}
 else start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 const date=start.toISOString().slice(0,10);
 const r=await db.query(`
 SELECT
  COALESCE((SELECT SUM(active_seconds) FROM player_session_daily_activity a JOIN game_play_sessions s ON s.session_key=a.session_key WHERE a.user_id=$1 AND s.suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) AND a.activity_date >= $2::date),0)::int AS active_seconds,
  COALESCE((SELECT SUM(completed_sessions) FROM player_session_daily_activity a JOIN game_play_sessions s ON s.session_key=a.session_key WHERE a.user_id=$1 AND s.suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) AND a.activity_date >= $2::date),0)::int AS completed_sessions,
  COALESCE((SELECT COUNT(DISTINCT s.game_id) FROM game_play_sessions s WHERE s.user_id=$1 AND s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL AND s.completion_status='completed' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) AND s.started_at >= $2::date),0)::int AS games_played,
  COALESCE((SELECT SUM(amount) FROM supercoin_transactions WHERE user_id=$1 AND transaction_type='earn' AND amount>0 AND created_at >= $2::date),0)::int AS coins_earned,
  COALESCE((SELECT COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date) FROM supercoin_transactions WHERE user_id=$1 AND rule_key='daily_login' AND created_at >= $2::date),0)::int AS login_days
 `,[uid,date]);
 const x=r.rows[0]||{};
 const map={active_minutes:Math.floor(Number(x.active_seconds||0)/60),completed_sessions:Number(x.completed_sessions||0),games_played:Number(x.games_played||0),coins_earned:Number(x.coins_earned||0),login_days:Number(x.login_days||0)};
 return {value:map[key]||0,period_start:date};
}
export default async function(req,res){
 const uid=String(req.user?.id||'');
 if(!uid)return res.status(401).json({error:'Sign in required.'});
 const who=await identity(uid);
 if(!who?.verified||!who.player_id)return res.status(403).json({error:'Verify your email and finish your GAME HUB player profile to use SuperCoin.'});
 const rewardSuspended=await db.query("SELECT 1 FROM player_leaderboard_controls WHERE user_id=$1 AND reward_suspended=true",[uid]).then(x=>x.rows.length>0);
 if(req.method==='POST'&&rewardSuspended)return res.status(403).json({error:'SuperCoin earning and redemption are currently suspended for this account. Contact GAME HUB support.'});
 await ensureWallet(uid,who.player_id);
 if(req.method==='GET'){
  const [wallet,tx,redemptions,rewards,challenges,completions,stats,achievements,equipped]=await Promise.all([
   db.query("SELECT balance,total_earned,total_spent,updated_at FROM supercoin_wallets WHERE user_id=$1",[uid]),
   db.query("SELECT id,user_id,player_id,amount,transaction_type,reason,reference_key,rule_key,session_key,related_game_id,status,created_at FROM supercoin_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[uid]),
   db.query("SELECT r.id,r.reward_id,r.reward_name,r.cost_sc,r.status,r.created_at,g.reward_type FROM supercoin_redemptions r JOIN supercoin_rewards g ON g.id=r.reward_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 20",[uid]),
   db.query("SELECT id,reward_key,name,description,image_url,reward_type,cost_sc,stock_remaining,min_level FROM supercoin_rewards WHERE enabled=true ORDER BY cost_sc,id LIMIT 50"),
   db.query("SELECT challenge_key,period,title,description,metric,target,reward_sc,starts_at,ends_at FROM supercoin_challenges WHERE enabled=true AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>NOW()) ORDER BY period,title"),
   db.query("SELECT challenge_key,period_start,reward_sc,completed_at FROM player_challenge_completions WHERE user_id=$1 ORDER BY completed_at DESC LIMIT 50",[uid]),
   db.query("SELECT COALESCE(SUM(active_duration_seconds),0)::bigint AS active_seconds,(SELECT COALESCE(SUM(active_seconds),0)::bigint FROM player_session_daily_activity WHERE user_id=$1 AND activity_date=(NOW() AT TIME ZONE 'UTC')::date) AS daily_active_seconds,(SELECT COALESCE(SUM(active_seconds),0)::bigint FROM player_session_daily_activity WHERE user_id=$1 AND activity_date>=date_trunc('week',NOW() AT TIME ZONE 'UTC')::date) AS weekly_active_seconds,(SELECT COALESCE(SUM(active_seconds),0)::bigint FROM player_session_daily_activity WHERE user_id=$1 AND activity_date>=date_trunc('month',NOW() AT TIME ZONE 'UTC')::date) AS monthly_active_seconds,(SELECT COALESCE(SUM(online_seconds),0)::bigint FROM player_presence_daily_activity WHERE user_id=$1) AS online_seconds,(SELECT COALESCE(SUM(online_seconds),0)::bigint FROM player_presence_daily_activity WHERE user_id=$1 AND activity_date=(NOW() AT TIME ZONE 'UTC')::date) AS daily_online_seconds,(SELECT COALESCE(SUM(online_seconds),0)::bigint FROM player_presence_daily_activity WHERE user_id=$1 AND activity_date>=date_trunc('week',NOW() AT TIME ZONE 'UTC')::date) AS weekly_online_seconds,(SELECT COALESCE(SUM(online_seconds),0)::bigint FROM player_presence_daily_activity WHERE user_id=$1 AND activity_date>=date_trunc('month',NOW() AT TIME ZONE 'UTC')::date) AS monthly_online_seconds,COUNT(*) FILTER(WHERE completion_status='completed')::int AS completed_sessions,COUNT(DISTINCT game_id) FILTER(WHERE completion_status='completed')::int AS games_played FROM game_play_sessions WHERE user_id=$1 AND verified_at IS NOT NULL AND suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=game_play_sessions.session_key AND sm.excluded=true)",[uid]),
   db.query("SELECT achievement_key,title,reward_sc,xp_awarded,unlocked_at FROM player_achievements WHERE user_id=$1 ORDER BY unlocked_at DESC LIMIT 100",[uid]),
   db.query("SELECT e.reward_type,e.redemption_id,e.reward_id,r.name,r.description,r.image_url FROM player_equipped_rewards e JOIN supercoin_rewards r ON r.id=e.reward_id WHERE e.user_id=$1 ORDER BY e.reward_type",[uid])
  ]);
  const level=await getLevel(who.gamer_xp);
  const done=new Set(completions.rows.map(x=>x.challenge_key+'|'+String(x.period_start).slice(0,10)));
  const challengeRows=[];
  for(const c of challenges.rows){const p=await progress(uid,c.metric,c.period==='weekly'?'weekly':c.period==='event'?'event':'daily',c.starts_at);challengeRows.push({...c,progress:p.value,completed:done.has(c.challenge_key+'|'+p.period_start),period_start:p.period_start});}
  return res.json({player_id:who.player_id,username:who.username||'',wallet:wallet.rows[0]||{balance:0,total_earned:0,total_spent:0},level,stats:stats.rows[0]||{},transactions:tx.rows,redemptions:redemptions.rows,rewards:rewards.rows,challenges:challengeRows,achievements:achievements.rows,equipped_rewards:equipped.rows,reward_suspended:rewardSuspended,virtual_currency:true,cash_withdrawal:false});
 }
 const body=req.body||{},action=String(body.action||'');
 if(action==='daily_login'){
  const r=await awardSuperCoins({userId:uid,playerId:who.player_id,ruleKey:'daily_login',referenceKey:'daily-login:'+uid+':'+new Date().toISOString().slice(0,10),reason:'Daily login reward'});
  if(r.awarded)await publish('supercoin_awarded',{player_id:who.player_id,amount:r.awarded,reason:'Daily login reward'});
  const earned=await db.query("SELECT COALESCE(total_earned,0)::bigint AS total_earned FROM supercoin_wallets WHERE user_id=$1",[uid]);
  const streak=await db.query("SELECT COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date) FILTER(WHERE (created_at AT TIME ZONE 'UTC')::date >= (NOW() AT TIME ZONE 'UTC')::date-6)::int AS days7,COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date) FILTER(WHERE (created_at AT TIME ZONE 'UTC')::date >= (NOW() AT TIME ZONE 'UTC')::date-29)::int AS days30 FROM supercoin_transactions WHERE user_id=$1 AND rule_key='daily_login' AND created_at >= NOW()-INTERVAL '30 days'",[uid]);
  const milestoneAchievements=[['first-100-coins','First 100 SuperCoins',Number(earned.rows[0]?.total_earned)>=100,10],['seven-day-streak','7-Day Login Streak',Number(streak.rows[0]?.days7)>=7,20],['thirty-day-streak','30-Day Login Streak',Number(streak.rows[0]?.days30)>=30,50]];
  const unlocked=[];
  for(const [key,title,reached,coins] of milestoneAchievements){if(!reached)continue;const ins=await db.query("INSERT INTO player_achievements(user_id,player_id,achievement_key,title,reward_points,reward_sc,xp_awarded) VALUES($1,$2,$3,$4,0,$5,$5) ON CONFLICT(user_id,achievement_key) DO NOTHING RETURNING achievement_key",[uid,who.player_id,key,title,coins]);if(ins.rows.length){const a=await awardSuperCoins({userId:uid,playerId:who.player_id,ruleKey:'achievement',referenceKey:'achievement:'+uid+':'+key,reason:'Achievement unlocked: '+title,amountOverride:coins});if(a.awarded)unlocked.push({title,coins:a.awarded});}}
  return res.json({ok:true,...r,achievements:unlocked});
 }
 if(action==='claim_challenge'){
  const key=String(body.challenge_key||'');
  const c=await db.query("SELECT * FROM supercoin_challenges WHERE challenge_key=$1 AND enabled=true AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>NOW())",[key]);
  if(!c.rows.length)return res.status(404).json({error:'Challenge not available.'});
  const challenge=c.rows[0],p=await progress(uid,challenge.metric,challenge.period==='weekly'?'weekly':challenge.period==='event'?'event':'daily',challenge.starts_at);
  if(p.value<Number(challenge.target))return res.status(409).json({error:'Challenge requirement not reached yet.',progress:p.value,target:challenge.target});
  const inserted=await db.query("INSERT INTO player_challenge_completions(user_id,player_id,challenge_key,period_start,reward_points,reward_sc,completed_at) VALUES($1,$2,$3,$4,0,$5,NOW()) ON CONFLICT(user_id,challenge_key,period_start) DO NOTHING RETURNING id",[uid,who.player_id,key,p.period_start,Number(challenge.reward_sc)]);
  if(!inserted.rows.length)return res.status(409).json({error:'You have already claimed this challenge.'});
  const rule=challenge.period==='weekly'?'weekly_challenge':'daily_challenge';
  const award=Number(challenge.reward_sc)>0?await awardSuperCoins({userId:uid,playerId:who.player_id,ruleKey:rule,referenceKey:'challenge:'+uid+':'+key+':'+p.period_start,reason:'Challenge reward: '+challenge.title,amountOverride:Number(challenge.reward_sc)}):{awarded:0};
  if(Number(challenge.reward_sc)>0&&!award.awarded){await db.query('DELETE FROM player_challenge_completions WHERE id=$1',[inserted.rows[0].id]);return res.status(429).json({error:'Challenge reward limit reached for this period. Try again in the next reward window.'});}
  if(award.awarded)await publish('supercoin_awarded',{player_id:who.player_id,amount:award.awarded,reason:challenge.title});
  return res.json({ok:true,award,challenge:key});
 }
 if(action==='redeem'){
  const rewardId=String(body.reward_id||''),requestKey=String(body.idempotency_key||'');
  if(!/^[0-9a-f-]{36}$/i.test(rewardId)||!/^[0-9a-f-]{36}$/i.test(requestKey))return res.status(400).json({error:'Invalid reward or redemption request ID.'});
  const prior=await db.query('SELECT id,cost_sc,reward_name,(SELECT balance FROM supercoin_wallets WHERE user_id=$1) AS balance FROM supercoin_redemptions WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1',[uid,requestKey]);
  if(prior.rows.length)return res.json({ok:true,already_processed:true,redemption:prior.rows[0]});
  const result=await db.query(`
  WITH reward_lock AS MATERIALIZED (
   SELECT r.* FROM supercoin_rewards r WHERE r.id=$2 AND r.enabled=true FOR UPDATE
  ), wallet_lock AS MATERIALIZED (
   SELECT w.* FROM supercoin_wallets w WHERE w.user_id=$1 FOR UPDATE
  ), profile AS MATERIALIZED (
   SELECT gamer_level FROM player_profiles WHERE user_id=$1
  ), redemption AS (
   INSERT INTO supercoin_redemptions(user_id,player_id,reward_id,reward_name,cost_sc,idempotency_key)
   SELECT $1,w.player_id,r.id,r.name,r.cost_sc,$3 FROM reward_lock r CROSS JOIN wallet_lock w CROSS JOIN profile p
   WHERE w.balance>=r.cost_sc AND p.gamer_level>=r.min_level AND (r.stock_remaining IS NULL OR r.stock_remaining>0)
    AND (SELECT COUNT(*) FROM supercoin_redemptions prior WHERE prior.user_id=$1 AND prior.reward_id=r.id AND prior.status='fulfilled')<r.max_per_user
   ON CONFLICT(idempotency_key) DO NOTHING RETURNING id,reward_id,cost_sc,reward_name
  ), ledger AS (
   INSERT INTO supercoin_transactions(user_id,player_id,amount,transaction_type,reason,reference_key)
   SELECT $1,$4,-d.cost_sc,'spend','Redeemed reward: '||d.reward_name,'redeem:'||$3 FROM redemption d
   ON CONFLICT(reference_key) DO NOTHING RETURNING amount
  ), debit AS (
   UPDATE supercoin_wallets SET balance=balance+(SELECT amount FROM ledger),total_spent=total_spent-(SELECT amount FROM ledger),updated_at=NOW()
   WHERE user_id=$1 AND EXISTS(SELECT 1 FROM ledger) RETURNING balance
  ), stock AS (
   UPDATE supercoin_rewards SET stock_remaining=CASE WHEN stock_remaining IS NULL THEN NULL ELSE stock_remaining-1 END,updated_at=NOW()
   WHERE id=$2 AND EXISTS(SELECT 1 FROM redemption) RETURNING id
  )
  SELECT d.id,d.cost_sc,d.reward_name,w.balance FROM redemption d CROSS JOIN debit w
  `,[uid,rewardId,requestKey,who.player_id]);
  if(!result.rows.length){const retry=await db.query('SELECT id,cost_sc,reward_name,(SELECT balance FROM supercoin_wallets WHERE user_id=$1) AS balance FROM supercoin_redemptions WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1',[uid,requestKey]);if(retry.rows.length)return res.json({ok:true,already_processed:true,redemption:retry.rows[0]});return res.status(409).json({error:'Redemption could not be completed. Check your balance, reward stock, level eligibility or request ID.'});}
  await publish('supercoin_spent',{player_id:who.player_id,amount:result.rows[0].cost_sc});
  return res.json({ok:true,redemption:result.rows[0]});
 }
 return res.status(400).json({error:'Unsupported SuperCoin action.'});
}