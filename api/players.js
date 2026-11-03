import { db, auth } from 'hatchable';
export const access='public';
export const methods=['GET'];
const boundary="CASE WHEN $1='season' THEN COALESCE((SELECT starts_at FROM leaderboard_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1),'epoch'::timestamptz) WHEN $1='daily' THEN date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN $1='weekly' THEN date_trunc('week',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN $1='monthly' THEN date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE 'epoch'::timestamptz END";
async function rankFor(userId,period,cfg){
 const r=await db.query(`
 WITH per_day AS (
  SELECT a.user_id,a.activity_date AS day,SUM(a.active_seconds)::bigint AS seconds,SUM(a.completed_sessions)::int AS sessions
  FROM player_session_daily_activity a
  JOIN game_play_sessions s ON s.session_key=a.session_key
  JOIN users u ON u.id=s.user_id AND u.email_verified_at IS NOT NULL AND u.email NOT LIKE '%@test.invalid'
  JOIN player_profiles p ON p.user_id=s.user_id
  LEFT JOIN player_leaderboard_controls lc ON lc.user_id=s.user_id
  WHERE s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL AND s.session_status IN ('completed','playing','idle','timed_out')
   AND COALESCE((p.settings->>'leaderboard_visible')::boolean,true)=true
   AND COALESCE(lc.leaderboard_suspended,false)=false
   AND NOT EXISTS (SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)
   AND a.activity_date >= (${boundary} AT TIME ZONE 'UTC')::date
  GROUP BY a.user_id,a.activity_date
 ),
 totals AS (
  SELECT d.user_id,
   (SUM(FLOOR(LEAST(d.seconds,$2*60)::numeric/60)*$3 + LEAST(d.sessions*$4,$5))
    + COALESCE((SELECT SUM(a.reward_points) FROM player_achievements a WHERE a.user_id=d.user_id AND a.unlocked_at>=${boundary}),0)
    + COALESCE((SELECT SUM(x.points) FROM (SELECT date_trunc('day',c.completed_at AT TIME ZONE 'UTC') AS day,LEAST(SUM(c.reward_points),$6) AS points FROM player_challenge_completions c WHERE c.user_id=d.user_id AND c.challenge_key LIKE 'daily:%' AND c.completed_at>=${boundary} GROUP BY date_trunc('day',c.completed_at AT TIME ZONE 'UTC')) x),0)
    + COALESCE((SELECT SUM(x.points) FROM (SELECT date_trunc('week',c.completed_at AT TIME ZONE 'UTC') AS week,LEAST(SUM(c.reward_points),$8) AS points FROM player_challenge_completions c WHERE c.user_id=d.user_id AND c.challenge_key LIKE 'weekly:%' AND c.completed_at>=${boundary} GROUP BY date_trunc('week',c.completed_at AT TIME ZONE 'UTC')) x),0)
   )::bigint AS points
  FROM per_day d GROUP BY d.user_id
 )
 SELECT (SELECT points FROM totals WHERE user_id=$7 AND points>0) AS points,
 CASE WHEN NOT EXISTS(SELECT 1 FROM totals WHERE user_id=$7 AND points>0) THEN NULL
 ELSE (SELECT COUNT(*)::int+1 FROM totals WHERE points>0 AND points>(SELECT points FROM totals WHERE user_id=$7 AND points>0)) END AS rank
 `,[period,Number(cfg.daily_time_cap_minutes)||120,Number(cfg.points_per_active_minute)||1,Number(cfg.points_per_completed_session)||10,Number(cfg.daily_session_cap_points)||50,Number(cfg.daily_challenge_cap_points)||40,userId,Number(cfg.weekly_challenge_reward_points)||100]);
 return {rank:r.rows[0]?.rank===null||r.rows[0]?.rank===undefined?null:Number(r.rows[0].rank),points:r.rows[0]?.points===null||r.rows[0]?.points===undefined?0:Number(r.rows[0].points)};
}
export default async function(req,res){
 const q=String(req.query?.q||'').trim().slice(0,80);
 if(!q)return res.status(400).json({error:'Enter a GAME HUB Player ID or username.'});
 const clean=q.replace(/[%_]/g,'');
 const user=await auth.getUser(req).catch(()=>null);
 const ip=String(req.ip||req.headers?.['x-real-ip']||req.headers?.['x-forwarded-for']||'unknown').split(',')[0].slice(0,100);
 const actor=user?.id?'user:'+user.id:'ip:'+ip;
 const rate=await db.query("INSERT INTO player_search_rate_limits(actor_key,window_started_at,request_count) VALUES($1,NOW(),1) ON CONFLICT(actor_key) DO UPDATE SET request_count=CASE WHEN player_search_rate_limits.window_started_at<NOW()-INTERVAL '1 minute' THEN 1 ELSE player_search_rate_limits.request_count+1 END,window_started_at=CASE WHEN player_search_rate_limits.window_started_at<NOW()-INTERVAL '1 minute' THEN NOW() ELSE player_search_rate_limits.window_started_at END RETURNING request_count",[actor]);
 if(Number(rate.rows[0]?.request_count)>(user?.id?30:12))return res.status(429).json({error:'Too many player searches. Please wait a minute and try again.'});
 const exact=await db.query(`
  SELECT p.user_id,p.player_id,p.username,p.avatar_url,p.settings,u.name,u.email_verified_at,u.created_at,
   (SELECT COUNT(DISTINCT s.game_id)::int FROM game_play_sessions s WHERE s.user_id=p.user_id AND s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) AND s.completion_status='completed') AS games_played,
   (SELECT COUNT(*)::int FROM game_play_sessions s WHERE s.user_id=p.user_id AND s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true) AND s.completion_status='completed') AS total_sessions,
   (SELECT COALESCE(SUM(s.active_duration_seconds),0)::bigint FROM game_play_sessions s WHERE s.user_id=p.user_id AND s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS play_seconds,pp.status AS presence_status,pp.last_seen_at,
   (SELECT COALESCE(SUM(reward_points),0)::bigint FROM player_achievements a WHERE a.user_id=p.user_id) AS achievement_points,(SELECT COALESCE(balance,0)::bigint FROM supercoin_wallets w WHERE w.user_id=p.user_id) AS supercoin_balance,(SELECT COALESCE(total_earned,0)::bigint FROM supercoin_wallets w WHERE w.user_id=p.user_id) AS total_supercoins_earned,p.gamer_level
  FROM player_profiles p JOIN users u ON u.id=p.user_id
  LEFT JOIN player_presence pp ON pp.user_id=p.user_id
  WHERE p.player_id IS NOT NULL AND u.email_verified_at IS NOT NULL AND u.email NOT LIKE '%@test.invalid' AND (upper(p.player_id)=upper($1) OR lower(COALESCE(p.username,''))=lower($1))
  LIMIT 1
 `,[clean]);
 if(!exact.rows.length){
  const suggestions=clean.length>=2?await db.query("SELECT p.player_id,p.username,p.avatar_url FROM player_profiles p JOIN users u ON u.id=p.user_id AND u.email_verified_at IS NOT NULL AND u.email NOT LIKE '%@test.invalid' WHERE p.player_id IS NOT NULL AND COALESCE((p.settings->>'public_profile')::boolean,true)=true AND p.username ILIKE '%'||$1||'%' ORDER BY p.username LIMIT 8",[clean]):{rows:[]};
  if(suggestions.rows.length)return res.json({found:false,suggestions:suggestions.rows.map(x=>({player_id:x.player_id,username:x.username,avatar_url:x.avatar_url||''}))});
  return res.status(404).json({error:'Player not found.'});
 }
 const p=exact.rows[0],settings=p.settings||{};
 if(settings.public_profile===false)return res.status(404).json({error:'This player profile is private.'});
 const cfgResult=await db.query("SELECT * FROM leaderboard_settings WHERE id=1");
 const cfg=cfgResult.rows[0]||{};
 const rankData={season:await rankFor(p.user_id,'season',cfg),daily:await rankFor(p.user_id,'daily',cfg),weekly:await rankFor(p.user_id,'weekly',cfg),monthly:await rankFor(p.user_id,'monthly',cfg),global:await rankFor(p.user_id,'all',cfg)};
 const ranks={season:rankData.season.rank,daily:rankData.daily.rank,weekly:rankData.weekly.rank,monthly:rankData.monthly.rank,global:rankData.global.rank};
 const achievementRows=await db.query("SELECT achievement_key,title,reward_points,reward_sc,unlocked_at FROM player_achievements WHERE user_id=$1 ORDER BY unlocked_at DESC LIMIT 50",[p.user_id]);
 const games=Number(p.games_played)||0,seconds=Number(p.play_seconds)||0;
 const visible=settings.activity_visible!==false,leaderVisible=settings.leaderboard_visible!==false&&cfg.enabled!==false;
 return res.json({found:true,player:{
  player_id:p.player_id,username:p.username||p.name||'Player',avatar_url:p.avatar_url||'',verified:!!p.email_verified_at,
  account_created_at:p.created_at,ranks:leaderVisible?ranks:{daily:null,weekly:null,monthly:null,global:null},
  games_played:visible?games:null,total_playing_hours:visible?Math.floor(seconds/3600):null,
  total_playing_minutes:visible?Math.floor((seconds%3600)/60):null,total_sessions:visible?(Number(p.total_sessions)||0):null,
  ranking_points:leaderVisible?(Number(rankData.global.points)||0):null,supercoin_balance:Number(p.supercoin_balance)||0,total_supercoins_earned:Number(p.total_supercoins_earned)||0,gamer_level:Number(p.gamer_level)||1,
  achievements:visible?achievementRows.rows.map(x=>({key:x.achievement_key,title:x.title,reward_points:Number(x.reward_points)||0,unlocked_at:x.unlocked_at})):[],
  online_status:visible&&p.last_seen_at&&Date.now()-new Date(p.last_seen_at).getTime()<90000?(p.presence_status||'online'):'offline',
  activity_visible:visible
 }});
}