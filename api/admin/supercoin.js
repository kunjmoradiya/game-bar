import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','POST','PUT'];
const OWNER='moradiyakunj1';
const audit=async(actor,action,target,player,reason,prev,next)=>{return await db.query("INSERT INTO supercoin_admin_audit_logs(actor_id,action,target_user_id,player_id,reason,previous_values,new_values) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)",[actor,action,target,player,reason,JSON.stringify(prev||{}),JSON.stringify(next||{})]);};
export default async function(req,res){
 const actor=String(req.member?.handle||req.member?.id||'');
 if(actor!==OWNER)return res.status(403).json({error:'Primary GAME HUB owner access required.'});
 if(req.method==='GET'){
  const q=String(req.query?.q||'').trim().slice(0,100);
  const [metrics,rules,rewards,challenges,weights,top,auditRows,suspicious]=await Promise.all([
   db.query("SELECT (SELECT COUNT(*)::int FROM users WHERE email_verified_at IS NOT NULL) AS registered_players,(SELECT COUNT(*)::int FROM player_presence WHERE status IN ('online','playing','idle') AND last_seen_at>NOW()-INTERVAL '90 seconds') AS online_players,(SELECT COUNT(*)::int FROM player_presence WHERE status='playing' AND last_seen_at>NOW()-INTERVAL '90 seconds') AS playing_players,(SELECT COALESCE(SUM(active_duration_seconds),0)::bigint FROM game_play_sessions WHERE verified_at IS NOT NULL AND suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=game_play_sessions.session_key AND sm.excluded=true)) AS active_seconds,(SELECT COALESCE(SUM(online_seconds),0)::bigint FROM player_presence_daily_activity) AS online_seconds,(SELECT COALESCE(SUM(total_earned),0)::bigint FROM supercoin_wallets) AS coins_issued,(SELECT COALESCE(SUM(total_spent),0)::bigint FROM supercoin_wallets) AS coins_spent,(SELECT COALESCE(SUM(amount),0)::bigint FROM supercoin_transactions WHERE amount>0 AND created_at>=date_trunc('day',NOW())) AS coins_today,(SELECT COALESCE(SUM(amount),0)::bigint FROM supercoin_transactions WHERE amount>0 AND created_at>=date_trunc('month',NOW())) AS coins_month,(SELECT COUNT(*)::int FROM supercoin_transactions WHERE created_at>=NOW()-INTERVAL '24 hours') AS transactions_24h,(SELECT COUNT(*)::int FROM supercoin_transactions WHERE created_at>=NOW()-INTERVAL '24 hours' AND status='rejected') AS rejected_24h"),
   db.query("SELECT * FROM supercoin_rules ORDER BY rule_key"),
   db.query("SELECT * FROM supercoin_rewards ORDER BY created_at DESC"),
   db.query("SELECT * FROM supercoin_challenges ORDER BY period,title"),
   db.query("SELECT * FROM gamer_rank_settings WHERE id=1"),
   db.query("SELECT w.player_id,p.username,w.balance,w.total_earned,w.total_spent,p.gamer_level,COALESCE(p.play_seconds,0)::bigint AS active_seconds FROM supercoin_wallets w JOIN player_profiles p ON p.user_id=w.user_id ORDER BY w.total_earned DESC LIMIT 10"),
   db.query("SELECT actor_id,action,player_id,reason,previous_values,new_values,created_at FROM supercoin_admin_audit_logs ORDER BY created_at DESC LIMIT 30"),
   db.query("SELECT s.session_key,s.player_id,p.username,g.name AS game_name,s.started_at,s.active_duration_seconds,s.suspicious_reason,lc.reward_suspended FROM game_play_sessions s LEFT JOIN player_profiles p ON p.user_id=s.user_id JOIN games g ON g.id=s.game_id LEFT JOIN player_leaderboard_controls lc ON lc.user_id=s.user_id WHERE s.suspicious_reason IS NOT NULL OR lc.reward_suspended=true ORDER BY s.started_at DESC LIMIT 50")
  ]);
  let playerSearch=[];
  if(q){const r=await db.query("SELECT p.user_id,p.player_id,p.username,u.email,w.balance,w.total_earned,w.total_spent,p.gamer_level,COALESCE(lc.reward_suspended,false) AS reward_suspended,(SELECT json_agg(json_build_object('id',t.id,'amount',t.amount,'type',t.transaction_type,'reason',t.reason,'created_at',t.created_at,'status',t.status) ORDER BY t.created_at DESC) FROM (SELECT * FROM supercoin_transactions WHERE user_id=p.user_id ORDER BY created_at DESC LIMIT 25) t) AS transactions,(SELECT json_agg(json_build_object('game',g.name,'started_at',s.started_at,'active_seconds',s.active_duration_seconds,'status',s.session_status,'completion',s.completion_status) ORDER BY s.started_at DESC) FROM (SELECT * FROM game_play_sessions WHERE user_id=p.user_id ORDER BY started_at DESC LIMIT 15) s JOIN games g ON g.id=s.game_id) AS sessions FROM player_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN supercoin_wallets w ON w.user_id=p.user_id LEFT JOIN player_leaderboard_controls lc ON lc.user_id=p.user_id WHERE p.player_id ILIKE '%'||$1||'%' OR p.username ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%' ORDER BY u.created_at DESC LIMIT 25",[q]);playerSearch=r.rows}
  return res.json({metrics:metrics.rows[0],rules:rules.rows,rewards:rewards.rows,challenges:challenges.rows,weights:weights.rows[0],top_players:top.rows,audit_logs:auditRows.rows,suspicious:suspicious.rows,players:playerSearch});
 }
 const b=req.body||{},action=String(b.action||''),reason=String(b.reason||'').trim().slice(0,500);
 if(!reason)return res.status(400).json({error:'A reason is required for every SuperCoin admin action.'});
 if(action==='update_rule'){
  const key=String(b.rule_key||''),amount=Math.max(0,Math.min(100000,Math.floor(Number(b.amount)||0))),daily=Math.max(0,Math.min(100000,Math.floor(Number(b.daily_limit)||0)));
  const old=await db.query("SELECT * FROM supercoin_rules WHERE rule_key=$1",[key]);if(!old.rows.length)return res.status(404).json({error:'Earning rule not found.'});
  await db.query("UPDATE supercoin_rules SET amount=$2,daily_limit=$3,enabled=$4,updated_at=NOW() WHERE rule_key=$1",[key,amount,daily,b.enabled===true]);
  await audit(actor,'update_rule',null,null,reason,old.rows[0],{amount,daily_limit:daily,enabled:b.enabled===true});
  return res.json({ok:true});
 }
 if(action==='save_reward'){
  const key=String(b.reward_key||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,60),name=String(b.name||'').trim().slice(0,100),cost=Math.max(1,Math.min(1000000,Math.floor(Number(b.cost_sc)||0)));
  if(!key||!name||!cost)return res.status(400).json({error:'Reward key, name and positive SuperCoin cost are required.'});
  const stock=b.stock_remaining===''||b.stock_remaining===null||b.stock_remaining===undefined?null:Math.max(0,Math.floor(Number(b.stock_remaining)||0));
  const old=await db.query("SELECT * FROM supercoin_rewards WHERE reward_key=$1",[key]);
  const saved=await db.query("INSERT INTO supercoin_rewards(reward_key,name,description,image_url,reward_type,cost_sc,stock_remaining,max_per_user,min_level,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(reward_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,image_url=EXCLUDED.image_url,reward_type=EXCLUDED.reward_type,cost_sc=EXCLUDED.cost_sc,stock_remaining=EXCLUDED.stock_remaining,max_per_user=EXCLUDED.max_per_user,min_level=EXCLUDED.min_level,enabled=EXCLUDED.enabled,updated_at=NOW() RETURNING *",[key,name,String(b.description||'').slice(0,1000),String(b.image_url||'').slice(0,500),String(b.reward_type||'profile_badge'),cost,stock,Math.max(1,Math.floor(Number(b.max_per_user)||1)),Math.max(1,Math.min(10,Math.floor(Number(b.min_level)||1))),b.enabled!==false]);
  await audit(actor,'save_reward',null,null,reason,old.rows[0]||{},saved.rows[0]);return res.json({ok:true,reward:saved.rows[0]});
 }
 if(action==='save_challenge'){
  const key=String(b.challenge_key||'').trim().toLowerCase().replace(/[^a-z0-9:_-]/g,'-').slice(0,80),title=String(b.title||'').trim().slice(0,100),period=['daily','weekly','event'].includes(b.period)?b.period:'daily',metric=['active_minutes','completed_sessions','games_played','coins_earned','login_days'].includes(b.metric)?b.metric:'active_minutes',target=Math.max(1,Math.min(1000000,Math.floor(Number(b.target)||1))),reward=Math.max(0,Math.min(100000,Math.floor(Number(b.reward_sc)||0)));
  if(!key||!title)return res.status(400).json({error:'Challenge key and title are required.'});
  let startsAt=null,endsAt=null;try{if(b.starts_at)startsAt=new Date(b.starts_at).toISOString();if(b.ends_at)endsAt=new Date(b.ends_at).toISOString();}catch(_){return res.status(400).json({error:'Challenge start/end dates are invalid.'});}
  if(startsAt&&endsAt&&new Date(endsAt)<=new Date(startsAt))return res.status(400).json({error:'Challenge end must be after its start.'});
  const old=await db.query("SELECT * FROM supercoin_challenges WHERE challenge_key=$1",[key]);
  const saved=await db.query("INSERT INTO supercoin_challenges(challenge_key,period,title,description,metric,target,reward_sc,enabled,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz) ON CONFLICT(challenge_key) DO UPDATE SET period=EXCLUDED.period,title=EXCLUDED.title,description=EXCLUDED.description,metric=EXCLUDED.metric,target=EXCLUDED.target,reward_sc=EXCLUDED.reward_sc,enabled=EXCLUDED.enabled,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=NOW() RETURNING *",[key,period,title,String(b.description||'').slice(0,1000),metric,target,reward,b.enabled!==false,startsAt,endsAt]);
  await audit(actor,'save_challenge',null,null,reason,old.rows[0]||{},saved.rows[0]);return res.json({ok:true,challenge:saved.rows[0]});
 }
 if(action==='adjust_wallet'){
  const playerId=String(b.player_id||''),amount=Math.max(-100000,Math.min(100000,Math.trunc(Number(b.amount)||0)));
  if(!playerId||amount===0)return res.status(400).json({error:'Player ID and non-zero adjustment are required.'});
  const who=await db.query("SELECT r.user_id,r.player_id FROM player_id_registry r JOIN users u ON u.id=r.user_id WHERE r.player_id=$1",[playerId]);
  if(!who.rows.length)return res.status(404).json({error:'Player not found.'});
  const target=who.rows[0],before=await db.query("SELECT balance,total_earned,total_spent FROM supercoin_wallets WHERE user_id=$1",[target.user_id]);
  await db.query("INSERT INTO supercoin_wallets(user_id,player_id) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",[target.user_id,playerId]);
  const key='admin-adjust:'+crypto.randomUUID();
  const changed=await db.query("WITH ins AS (INSERT INTO supercoin_transactions(user_id,player_id,amount,transaction_type,reason,reference_key) SELECT $1,$2,$3,'adjustment',$4,$5 WHERE EXISTS(SELECT 1 FROM supercoin_wallets WHERE user_id=$1 AND balance+$3>=0) RETURNING amount), upd AS (UPDATE supercoin_wallets SET balance=balance+(SELECT amount FROM ins),total_earned=total_earned+GREATEST((SELECT amount FROM ins),0),total_spent=total_spent+GREATEST(-(SELECT amount FROM ins),0),updated_at=NOW() WHERE user_id=$1 AND EXISTS(SELECT 1 FROM ins) RETURNING balance) SELECT balance FROM upd",[target.user_id,playerId,amount,reason,key]);
  if(!changed.rows.length)return res.status(409).json({error:'Adjustment would make the wallet negative.'});
  await audit(actor,'adjust_wallet',target.user_id,playerId,reason,before.rows[0]||{balance:0},{amount,balance:changed.rows[0].balance,reference_key:key});
  return res.json({ok:true,balance:changed.rows[0].balance});
 }
 if(action==='suspend_rewards'){
  const playerId=String(b.player_id||''),suspend=b.suspended===true;
  const who=await db.query("SELECT user_id,player_id FROM player_id_registry WHERE player_id=$1",[playerId]);
  if(!who.rows.length)return res.status(404).json({error:'Player not found.'});
  const target=who.rows[0],old=await db.query("SELECT reward_suspended,reward_suspension_reason FROM player_leaderboard_controls WHERE user_id=$1",[target.user_id]);
  await db.query("INSERT INTO player_leaderboard_controls(user_id,player_id,reward_suspended,reward_suspension_reason,actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET reward_suspended=EXCLUDED.reward_suspended,reward_suspension_reason=EXCLUDED.reward_suspension_reason,actor_id=EXCLUDED.actor_id,updated_at=NOW()",[target.user_id,playerId,suspend,suspend?reason:'',actor]);
  await audit(actor,'suspend_rewards',target.user_id,playerId,reason,old.rows[0]||{}, {reward_suspended:suspend});
  return res.json({ok:true,reward_suspended:suspend});
 }
 if(action==='update_weights'){
  const fields=['coin_weight','hours_weight','sessions_weight','achievement_weight','consistency_weight'],v=fields.map(k=>Number(b[k]));
  if(v.some(x=>!Number.isFinite(x)||x<0||x>1)||Math.abs(v.reduce((a,x)=>a+x,0)-1)>.0001)return res.status(400).json({error:'Ranking weights must be between 0 and 1 and add up to exactly 1.0.'});
  const caps=[Math.max(1,Math.floor(Number(b.coin_cap)||10000)),Math.max(1,Math.floor(Number(b.hours_cap)||500)),Math.max(1,Math.floor(Number(b.sessions_cap)||500)),Math.max(1,Math.floor(Number(b.achievement_cap)||1000)),Math.max(1,Math.floor(Number(b.consistency_days)||30))];
  const old=await db.query("SELECT * FROM gamer_rank_settings WHERE id=1");
  const updated=await db.query("UPDATE gamer_rank_settings SET coin_weight=$1,hours_weight=$2,sessions_weight=$3,achievement_weight=$4,consistency_weight=$5,coin_cap=$6,hours_cap=$7,sessions_cap=$8,achievement_cap=$9,consistency_days=$10,updated_at=NOW() WHERE id=1 RETURNING *",[...v,...caps]);
  await audit(actor,'update_weights',null,null,reason,old.rows[0]||{},updated.rows[0]);return res.json({ok:true,weights:updated.rows[0]});
 }
 return res.status(400).json({error:'Unsupported admin action.'});
}