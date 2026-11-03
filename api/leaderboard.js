import { db, auth } from 'hatchable';
export const access='public';
export const methods=['GET'];
const boundary = "CASE WHEN $1='season' THEN COALESCE((SELECT starts_at FROM leaderboard_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1),'epoch'::timestamptz) WHEN $1='daily' THEN date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN $1='weekly' THEN date_trunc('week',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHEN $1='monthly' THEN date_trunc('month',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ELSE 'epoch'::timestamptz END";
export default async function(req,res){
 const period=String(req.query?.period||'all');
 const type=String(req.query?.type||'score');
 const category=String(req.query?.category||'').trim().slice(0,80);
 const limit=Math.max(10,Math.min(100,Number(req.query?.limit)||50)),offset=Math.max(0,Number(req.query?.offset)||0);
 if(!['season','daily','weekly','monthly','all'].includes(period))return res.status(400).json({error:'Invalid ranking period.'});
 if(!['score','hours','games','achievements','active'].includes(type))return res.status(400).json({error:'Invalid ranking category.'});
 const cfg=await db.query("SELECT * FROM leaderboard_settings WHERE id=1");
 const settings=cfg.rows[0]||{enabled:true,points_per_active_minute:1,daily_time_cap_minutes:120,points_per_completed_session:10,daily_session_cap_points:50,daily_challenge_cap_points:40};
 const user=await auth.getUser(req).catch(()=>null);
 const stats=await db.query(`
  SELECT
   (SELECT COUNT(*)::int FROM users WHERE email_verified_at IS NOT NULL AND email NOT LIKE '%@test.invalid') AS registered_players,
   (SELECT COUNT(*)::int FROM player_presence pp JOIN users u ON u.id=pp.user_id WHERE u.email NOT LIKE '%@test.invalid' AND pp.status IN ('online','playing','idle') AND pp.last_seen_at>NOW()-INTERVAL '90 seconds') AS online_players,
   (SELECT COUNT(*)::int FROM player_presence pp JOIN users u ON u.id=pp.user_id WHERE u.email NOT LIKE '%@test.invalid' AND pp.status='playing' AND pp.last_seen_at>NOW()-INTERVAL '90 seconds') AS playing_players,
   (SELECT COUNT(*)::int FROM player_presence pp JOIN users u ON u.id=pp.user_id WHERE u.email NOT LIKE '%@test.invalid' AND pp.status='idle' AND pp.last_seen_at>NOW()-INTERVAL '90 seconds') AS idle_players,
   (SELECT COUNT(*)::int FROM game_play_sessions s JOIN users u ON u.id=s.user_id WHERE u.email NOT LIKE '%@test.invalid' AND s.session_status IN ('playing','idle') AND s.last_heartbeat_at>NOW()-INTERVAL '90 seconds') AS active_sessions,
   (SELECT COALESCE(SUM(s.active_duration_seconds),0)::bigint FROM game_play_sessions s JOIN users u ON u.id=s.user_id WHERE u.email NOT LIKE '%@test.invalid' AND s.verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS total_active_seconds,
   (SELECT g.name FROM player_presence pp JOIN users u ON u.id=pp.user_id AND u.email NOT LIKE '%@test.invalid' JOIN games g ON g.id=pp.current_game_id WHERE pp.status='playing' AND pp.last_seen_at>NOW()-INTERVAL '90 seconds' GROUP BY g.name ORDER BY COUNT(*) DESC LIMIT 1) AS most_played_game,
   (SELECT name FROM leaderboard_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1) AS active_season
 `);
 if(!settings.enabled)return res.json({enabled:false,period,players:[],stats:stats.rows[0],current_user_rank:null,settings});
 const rows=await db.query(`
 WITH base AS (
   SELECT s.user_id,s.player_id,s.game_id,s.session_key,a.activity_date,a.active_seconds,a.completed_sessions
   FROM player_session_daily_activity a
   JOIN game_play_sessions s ON s.session_key=a.session_key
   JOIN games g ON g.id=s.game_id
   JOIN users u ON u.id=s.user_id AND u.email_verified_at IS NOT NULL AND u.email NOT LIKE '%@test.invalid'
   JOIN player_profiles p ON p.user_id=s.user_id
   LEFT JOIN player_leaderboard_controls lc ON lc.user_id=s.user_id
   WHERE s.verified_at IS NOT NULL AND s.session_status IN ('completed','playing','idle','timed_out')
     AND COALESCE((p.settings->>'leaderboard_visible')::boolean,true)=true
     AND COALESCE(lc.leaderboard_suspended,false)=false
     AND NOT EXISTS (SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)
     AND a.activity_date >= (${boundary} AT TIME ZONE 'UTC')::date
     AND ($11='' OR g.category=$11)
 ),
 per_day AS (
   SELECT user_id,player_id,activity_date AS day,
     SUM(active_seconds)::bigint AS seconds,
     SUM(completed_sessions)::int AS completed_sessions
   FROM base GROUP BY user_id,player_id,activity_date
 ),
 session_points AS (
   SELECT user_id,MAX(player_id) AS player_id,
     SUM(FLOOR(LEAST(seconds,$2*60)::numeric/60)*$3 + LEAST(completed_sessions*$4,$5))::bigint AS points,
     SUM(seconds)::bigint AS period_seconds,
     SUM(completed_sessions)::int AS period_sessions
   FROM per_day GROUP BY user_id
 ),
 achievement_points AS (
   SELECT a.user_id,SUM(a.reward_points)::bigint AS points,COUNT(*)::int AS achievement_count
   FROM player_achievements a WHERE a.unlocked_at >= ${boundary} GROUP BY a.user_id
 ),
 daily_challenges AS (
   SELECT c.user_id,date_trunc('day',c.completed_at AT TIME ZONE 'UTC') AS period_key,
     LEAST(SUM(c.reward_points),$6)::bigint AS points
   FROM player_challenge_completions c WHERE c.completed_at >= ${boundary} AND c.challenge_key LIKE 'daily:%'
   GROUP BY c.user_id,date_trunc('day',c.completed_at AT TIME ZONE 'UTC')
 ),
 weekly_challenges AS (
   SELECT c.user_id,date_trunc('week',c.completed_at AT TIME ZONE 'UTC') AS period_key,
     LEAST(SUM(c.reward_points),$7)::bigint AS points
   FROM player_challenge_completions c WHERE c.completed_at >= ${boundary} AND c.challenge_key LIKE 'weekly:%'
   GROUP BY c.user_id,date_trunc('week',c.completed_at AT TIME ZONE 'UTC')
 ),
 challenge_points AS (
   SELECT user_id,SUM(points)::bigint AS points FROM (SELECT user_id,points FROM daily_challenges UNION ALL SELECT user_id,points FROM weekly_challenges) challenge_totals GROUP BY user_id
 ),
 totals AS (
   SELECT sp.user_id,sp.player_id,
     (sp.points+COALESCE(ap.points,0)+COALESCE(cp.points,0))::bigint AS total_points,
     sp.period_seconds,sp.period_sessions,COALESCE(ap.points,0)::bigint AS achievement_points,COALESCE(ap.achievement_count,0)::int AS achievement_count
   FROM session_points sp LEFT JOIN achievement_points ap ON ap.user_id=sp.user_id
   LEFT JOIN challenge_points cp ON cp.user_id=sp.user_id
   WHERE sp.points+COALESCE(ap.points,0)+COALESCE(cp.points,0)>0
 )
 SELECT t.user_id,t.player_id,COALESCE(NULLIF(p.username,''),u.name,'Player') AS username,
   COALESCE(p.avatar_url,'') AS avatar_url,t.total_points,
   (SELECT COUNT(DISTINCT s.game_id)::int FROM game_play_sessions s WHERE s.user_id=t.user_id AND s.verified_at IS NOT NULL AND s.completion_status='completed' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS games_played,
   (SELECT COUNT(*)::int FROM game_play_sessions s WHERE s.user_id=t.user_id AND s.verified_at IS NOT NULL AND s.completion_status='completed' AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS total_sessions,
   (SELECT COALESCE(SUM(s.active_duration_seconds),0)::bigint FROM game_play_sessions s WHERE s.user_id=t.user_id AND s.verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS lifetime_seconds,
   t.period_seconds,t.period_sessions,t.achievement_points,t.achievement_count,
   COALESCE(pp.status,'offline') AS online_status
 FROM totals t JOIN player_profiles p ON p.user_id=t.user_id JOIN users u ON u.id=t.user_id
 LEFT JOIN player_presence pp ON pp.user_id=t.user_id
 ORDER BY
   CASE WHEN $8='hours' THEN t.period_seconds
        WHEN $8='games' THEN t.period_sessions
        WHEN $8='achievements' THEN t.achievement_points
        WHEN $8='active' THEN t.period_sessions ELSE t.total_points END DESC,
   CASE WHEN $8='active' THEN t.period_seconds ELSE t.total_points END DESC,username ASC LIMIT $9 OFFSET $10
 `,[period,Number(settings.daily_time_cap_minutes)||120,Number(settings.points_per_active_minute)||1,Number(settings.points_per_completed_session)||10,Number(settings.daily_session_cap_points)||50,Number(settings.daily_challenge_cap_points)||40,Number(settings.weekly_challenge_reward_points)||100,type,limit,offset,category]);
 const categories=await db.query("SELECT DISTINCT category FROM games WHERE COALESCE(category,'')<>'' ORDER BY category");
 const currentIndex=user?.id?rows.rows.findIndex(x=>x.user_id===user.id):-1;
 const players=rows.rows.map((p,i)=>({rank:offset+i+1,player_id:p.player_id,username:p.username,avatar_url:p.avatar_url,total_points:Number(p.total_points)||0,games_played:Number(p.games_played)||0,total_sessions:Number(p.total_sessions)||0,total_playing_hours:Math.round((Number(p.lifetime_seconds)||0)/3600*100)/100,period_active_seconds:Number(p.period_seconds)||0,period_sessions:Number(p.period_sessions)||0,achievement_points:Number(p.achievement_points)||0,achievement_count:Number(p.achievement_count)||0,online_status:p.online_status==='playing'?'playing':p.online_status==='idle'?'idle':p.online_status==='online'?'online':'offline'}));
 const rank=currentIndex>=0?offset+currentIndex+1:null;
 return res.json({enabled:true,period,type,category,players,categories:categories.rows.map(x=>x.category),stats:stats.rows[0]||{},current_user_rank:rank,verified_only:true,timezone:'UTC',settings:{points_per_active_minute:settings.points_per_active_minute,daily_time_cap_minutes:settings.daily_time_cap_minutes,points_per_completed_session:settings.points_per_completed_session,daily_session_cap_points:settings.daily_session_cap_points}});
}