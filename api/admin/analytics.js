import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','PUT'];
const OWNER_HANDLE='moradiyakunj1';
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Primary owner access required.'});
 const actor=String(req.member?.handle||req.member?.id||'owner');
 if(req.method==='GET'){
  const q=String(req.query?.q||'').trim().slice(0,100);
  if(q){
   const found=await db.query(`
    SELECT p.user_id,p.player_id,p.username,p.avatar_url,p.settings,u.email,u.email_verified_at,u.created_at,COALESCE(lc.leaderboard_suspended,false) AS leaderboard_suspended
    FROM player_profiles p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN player_leaderboard_controls lc ON lc.user_id=p.user_id
    WHERE (u.email IS NULL OR u.email NOT LIKE '%@test.invalid') AND (p.player_id ILIKE '%'||$1||'%' OR p.username ILIKE '%'||$1||'%')
    ORDER BY u.created_at DESC LIMIT 20
   `,[q]);
   const players=[];
   for(const p of found.rows){
    const [summary,sessions,achievements,logs]=await Promise.all([
     db.query("SELECT COUNT(*)::int AS total_sessions,COUNT(DISTINCT game_id)::int AS games,COALESCE(SUM(active_duration_seconds),0)::bigint AS seconds FROM game_play_sessions WHERE user_id=$1 AND verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=game_play_sessions.session_key AND sm.excluded=true)",[p.user_id]),
     db.query("SELECT s.session_key,s.started_at,s.ended_at,s.active_duration_seconds,s.session_status,s.completion_status,COALESCE(sm.reason,s.suspicious_reason) AS suspicious_reason,g.name AS game_name FROM game_play_sessions s JOIN games g ON g.id=s.game_id LEFT JOIN player_session_moderation sm ON sm.session_key=s.session_key WHERE s.user_id=$1 ORDER BY s.started_at DESC LIMIT 20",[p.user_id]),
     db.query("SELECT achievement_key,title,reward_points,unlocked_at FROM player_achievements WHERE user_id=$1 ORDER BY unlocked_at DESC LIMIT 30",[p.user_id]),
     db.query("SELECT action,points_changed,reason,created_at FROM ranking_audit_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",[p.user_id])
    ]);
    players.push({player_id:p.player_id,username:p.username,email:p.email||'',verified:!!p.email_verified_at,created_at:p.created_at,settings:{...(p.settings||{}),leaderboard_suspended:!!p.leaderboard_suspended},stats:summary.rows[0],sessions:sessions.rows,achievements:achievements.rows,audit_logs:logs.rows});
   }
   return res.json({players,total:players.length});
  }
  const [metrics,topGames,topPlayers,activity,suspicious,audit,cfg,seasons]=await Promise.all([
   db.query("SELECT (SELECT COUNT(*)::int FROM users WHERE email_verified_at IS NOT NULL AND email NOT LIKE '%@test.invalid') AS registered_players,(SELECT COUNT(*)::int FROM player_presence pp JOIN users u ON u.id=pp.user_id WHERE u.email NOT LIKE '%@test.invalid' AND pp.status IN ('online','playing','idle') AND last_seen_at>NOW()-INTERVAL '90 seconds') AS online_players,(SELECT COUNT(*)::int FROM player_presence pp JOIN users u ON u.id=pp.user_id WHERE u.email NOT LIKE '%@test.invalid' AND pp.status='playing' AND last_seen_at>NOW()-INTERVAL '90 seconds') AS playing_players,(SELECT COALESCE(SUM(active_duration_seconds),0)::bigint FROM game_play_sessions s JOIN users u ON u.id=s.user_id WHERE u.email NOT LIKE '%@test.invalid' AND s.verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS total_active_seconds,(SELECT COUNT(*)::int FROM game_play_sessions s JOIN users u ON u.id=s.user_id WHERE u.email NOT LIKE '%@test.invalid' AND s.verified_at IS NOT NULL AND s.completion_status='completed' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS total_sessions,(SELECT COUNT(DISTINCT a.user_id)::int FROM player_session_daily_activity a JOIN users u ON u.id=a.user_id WHERE u.email NOT LIKE '%@test.invalid' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=a.session_key AND sm.excluded=true) AND a.activity_date>=(NOW() AT TIME ZONE 'UTC')::date) AS daily_active_users,(SELECT COUNT(DISTINCT a.user_id)::int FROM player_session_daily_activity a JOIN users u ON u.id=a.user_id WHERE u.email NOT LIKE '%@test.invalid' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=a.session_key AND sm.excluded=true) AND a.activity_date>=date_trunc('week',NOW() AT TIME ZONE 'UTC')::date) AS weekly_active_users,(SELECT COUNT(DISTINCT a.user_id)::int FROM player_session_daily_activity a JOIN users u ON u.id=a.user_id WHERE u.email NOT LIKE '%@test.invalid' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=a.session_key AND sm.excluded=true) AND a.activity_date>=date_trunc('month',NOW() AT TIME ZONE 'UTC')::date) AS monthly_active_users,(SELECT COUNT(*)::int FROM game_play_sessions s JOIN users u ON u.id=s.user_id WHERE u.email NOT LIKE '%@test.invalid' AND (s.suspicious_reason IS NOT NULL OR EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true))) AS suspicious_sessions"),
   db.query("SELECT g.name,COUNT(*)::int AS sessions,COALESCE(SUM(s.active_duration_seconds),0)::bigint AS seconds FROM game_play_sessions s JOIN users u ON u.id=s.user_id AND u.email NOT LIKE '%@test.invalid' JOIN games g ON g.id=s.game_id WHERE s.verified_at IS NOT NULL AND s.completion_status='completed' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) GROUP BY g.id,g.name ORDER BY sessions DESC LIMIT 10"),
   db.query("SELECT p.player_id,p.username,COUNT(s.id)::int AS sessions,COALESCE(SUM(s.active_duration_seconds),0)::bigint AS seconds FROM player_profiles p JOIN users u ON u.id=p.user_id AND u.email NOT LIKE '%@test.invalid' JOIN game_play_sessions s ON s.user_id=p.user_id AND s.verified_at IS NOT NULL AND s.completion_status='completed' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) GROUP BY p.user_id,p.player_id,p.username ORDER BY seconds DESC LIMIT 10"),
   db.query("SELECT activity_date AS day,COUNT(DISTINCT user_id)::int AS active_users,COALESCE(SUM(active_seconds),0)::bigint AS active_seconds FROM player_session_daily_activity a JOIN users u ON u.id=a.user_id AND u.email NOT LIKE '%@test.invalid' WHERE NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=a.session_key AND sm.excluded=true) AND activity_date>=(NOW() AT TIME ZONE 'UTC')::date-7 GROUP BY activity_date ORDER BY day"),
   db.query("SELECT s.session_key,s.player_id,p.username,g.name AS game_name,s.started_at,s.active_duration_seconds,COALESCE(sm.reason,s.suspicious_reason) AS suspicious_reason FROM game_play_sessions s JOIN users u ON u.id=s.user_id AND u.email NOT LIKE '%@test.invalid' LEFT JOIN player_profiles p ON p.user_id=s.user_id JOIN games g ON g.id=s.game_id LEFT JOIN player_session_moderation sm ON sm.session_key=s.session_key WHERE sm.excluded=true OR s.suspicious_reason IS NOT NULL ORDER BY s.started_at DESC LIMIT 50"),
   db.query("SELECT l.player_id,p.username,l.action,l.points_changed,l.reason,l.actor_id,l.created_at FROM ranking_audit_logs l LEFT JOIN player_profiles p ON p.user_id=l.user_id LEFT JOIN users u ON u.id=l.user_id WHERE u.email IS NULL OR u.email NOT LIKE '%@test.invalid' ORDER BY l.created_at DESC LIMIT 30"),
   db.query("SELECT * FROM leaderboard_settings WHERE id=1"),
   db.query("SELECT id,name,starts_at,ends_at,status,created_at FROM leaderboard_seasons ORDER BY created_at DESC LIMIT 20")
  ]);
  return res.json({metrics:metrics.rows[0],top_games:topGames.rows,top_players:topPlayers.rows,daily_activity:activity.rows,suspicious:suspicious.rows,audit_logs:audit.rows,settings:cfg.rows[0]||{},seasons:seasons.rows});
 }
 const b=req.body||{},action=String(b.action||'');
 if(action==='reset_season'||action==='create_season'){
  const name=String(b.name||'New Season').trim().slice(0,80);if(!name)return res.status(400).json({error:'Season name is required.'});
  await db.query("UPDATE leaderboard_seasons SET status='completed',ends_at=NOW() WHERE status='active'");
  const season=await db.query("INSERT INTO leaderboard_seasons(name,starts_at,status,created_by) VALUES($1,(date_trunc('day',NOW() AT TIME ZONE 'UTC')+INTERVAL '1 day') AT TIME ZONE 'UTC','active',$2) RETURNING id,name,starts_at,status",[name,actor]);
  await db.query("INSERT INTO ranking_audit_logs(actor_id,action,reason,metadata) VALUES($1,'season_reset',$2,$3::jsonb)",[actor,'Owner started a new leaderboard season',JSON.stringify({season_id:season.rows[0].id,name})]);
  return res.json({ok:true,season:season.rows[0]});
 }
 if(action==='close_season'){
  const closed=await db.query("UPDATE leaderboard_seasons SET status='completed',ends_at=NOW() WHERE status='active' RETURNING id,name");
  await db.query("INSERT INTO ranking_audit_logs(actor_id,action,reason,metadata) VALUES($1,'season_closed','Owner closed the active leaderboard season',$2::jsonb)",[actor,JSON.stringify({seasons:closed.rows})]);
  return res.json({ok:true,closed:closed.rows.length});
 }
 if(action==='settings'){
  const n=(v,def,min,max)=>{const x=Number(v);return Number.isInteger(x)?Math.max(min,Math.min(max,x)):def;};
  const enabled=typeof b.enabled==='boolean'?b.enabled:true;
  const values=[n(b.points_per_active_minute,1,0,100),n(b.daily_time_cap_minutes,120,0,1440),n(b.points_per_completed_session,10,0,1000),n(b.daily_session_cap_points,50,0,10000),n(b.achievement_reward_points,25,0,10000),n(b.special_achievement_reward_points,50,0,10000),n(b.daily_challenge_reward_points,20,0,10000),n(b.daily_challenge_cap_points,40,0,10000),n(b.weekly_challenge_reward_points,100,0,50000),enabled];
  await db.query("UPDATE leaderboard_settings SET points_per_active_minute=$1,daily_time_cap_minutes=$2,points_per_completed_session=$3,daily_session_cap_points=$4,achievement_reward_points=$5,special_achievement_reward_points=$6,daily_challenge_reward_points=$7,daily_challenge_cap_points=$8,weekly_challenge_reward_points=$9,enabled=$10,updated_at=NOW() WHERE id=1",values);
  await db.query("INSERT INTO ranking_audit_logs(actor_id,action,reason,metadata) VALUES($1,'settings_updated','Owner updated leaderboard scoring settings',$2::jsonb)",[actor,JSON.stringify({enabled,values:values.slice(0,9)})]);
  return res.json({ok:true});
 }
 if(action==='suspend'||action==='restore'){
  const key=String(b.player_id||'').trim();if(!key)return res.status(400).json({error:'Player ID is required.'});
  const p=await db.query("SELECT user_id,player_id,username FROM player_profiles WHERE upper(player_id)=upper($1) LIMIT 1",[key]);
  if(!p.rows.length)return res.status(404).json({error:'Player not found.'});
  const suspended=action==='suspend';
  await db.query("INSERT INTO player_leaderboard_controls(user_id,player_id,leaderboard_suspended,moderation_reason,actor_id,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET player_id=EXCLUDED.player_id,leaderboard_suspended=EXCLUDED.leaderboard_suspended,moderation_reason=EXCLUDED.moderation_reason,actor_id=EXCLUDED.actor_id,updated_at=NOW()",[p.rows[0].user_id,p.rows[0].player_id,suspended,String(b.reason||'Owner moderation').slice(0,500),actor]);
  await db.query("INSERT INTO ranking_audit_logs(user_id,player_id,actor_id,action,reason,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[p.rows[0].user_id,p.rows[0].player_id,actor,action,String(b.reason||'Owner moderation').slice(0,500),JSON.stringify({username:p.rows[0].username})]);
  return res.json({ok:true,suspended,player_id:p.rows[0].player_id});
 }
 if(action==='flag_session'){
  const session=String(b.session_id||''),reason=String(b.reason||'Suspicious activity review').trim().slice(0,500);
  if(!session||!reason)return res.status(400).json({error:'Session ID and reason are required.'});
  const s=await db.query("SELECT user_id,player_id,active_duration_seconds FROM game_play_sessions WHERE session_key=$1 LIMIT 1",[session]);
  if(!s.rows.length)return res.status(404).json({error:'Session not found.'});
  await db.query("INSERT INTO player_session_moderation(session_key,user_id,player_id,excluded,reason,actor_id,updated_at) VALUES($1,$2,$3,true,$4,$5,NOW()) ON CONFLICT(session_key) DO UPDATE SET excluded=true,reason=EXCLUDED.reason,actor_id=EXCLUDED.actor_id,updated_at=NOW()",[session,s.rows[0].user_id,s.rows[0].player_id,reason,actor]);
  await db.query("INSERT INTO ranking_audit_logs(user_id,player_id,actor_id,action,reason,metadata) VALUES($1,$2,$3,'session_flagged',$4,$5::jsonb)",[s.rows[0].user_id,s.rows[0].player_id,actor,reason,JSON.stringify({session_id:session,active_seconds:s.rows[0].active_duration_seconds})]);
  return res.json({ok:true});
 }
 if(action==='award_challenge'){
  const playerId=String(b.player_id||''),kind=b.kind==='weekly'?'weekly':'daily';
  const p=await db.query("SELECT user_id,player_id FROM player_profiles WHERE upper(player_id)=upper($1) LIMIT 1",[playerId]);
  if(!p.rows.length)return res.status(404).json({error:'Player not found.'});
  const cfg=await db.query("SELECT daily_challenge_reward_points,weekly_challenge_reward_points FROM leaderboard_settings WHERE id=1");
  const reward=kind==='weekly'?Number(cfg.rows[0]?.weekly_challenge_reward_points)||100:Number(cfg.rows[0]?.daily_challenge_reward_points)||20;
  const key=kind+':'+String(b.challenge_key||'owner-award').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50);
  const period=kind==='weekly'?"date_trunc('week',NOW() AT TIME ZONE 'UTC')::date":"(NOW() AT TIME ZONE 'UTC')::date";
  const ins=await db.query("INSERT INTO player_challenge_completions(user_id,player_id,challenge_key,period_start,reward_points) VALUES($1,$2,$3,"+period+",$4) ON CONFLICT(user_id,challenge_key,period_start) DO NOTHING RETURNING id",[p.rows[0].user_id,p.rows[0].player_id,key,reward]);
  if(!ins.rows.length)return res.status(409).json({error:'This challenge reward was already granted for the current period.'});
  await db.query("INSERT INTO ranking_audit_logs(user_id,player_id,actor_id,action,points_changed,reason,metadata) VALUES($1,$2,$3,'challenge_awarded',$4,$5,$6::jsonb)",[p.rows[0].user_id,p.rows[0].player_id,actor,reward,'Owner awarded '+kind+' challenge: '+key,JSON.stringify({challenge_key:key,kind})]);
  return res.json({ok:true,reward_points:reward});
 }
 return res.status(400).json({error:'Unknown moderation action.'});
}