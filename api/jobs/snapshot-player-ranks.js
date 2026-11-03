import { db } from 'hatchable';
export const access='scheduler';
export const methods=['POST'];
export default async function(req,res){
 const result=await db.query(`
 WITH per_day AS (
  SELECT a.user_id,MAX(a.player_id) AS player_id,a.activity_date AS day,
   SUM(a.active_seconds)::bigint AS seconds,SUM(a.completed_sessions)::int AS sessions
  FROM player_session_daily_activity a
  JOIN game_play_sessions s ON s.session_key=a.session_key
  JOIN users u ON u.id=s.user_id AND u.email_verified_at IS NOT NULL
  JOIN player_profiles p ON p.user_id=s.user_id
  LEFT JOIN player_leaderboard_controls lc ON lc.user_id=s.user_id
  WHERE s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL
   AND COALESCE((p.settings->>'leaderboard_visible')::boolean,true)=true
   AND COALESCE(lc.leaderboard_suspended,false)=false
   AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)
  GROUP BY a.user_id,a.activity_date
 ),
 point_totals AS (
  SELECT d.user_id,MAX(d.player_id) AS player_id,
   (SUM(FLOOR(LEAST(d.seconds,c.daily_time_cap_minutes*60)::numeric/60)*c.points_per_active_minute+LEAST(d.sessions*c.points_per_completed_session,c.daily_session_cap_points))
    +COALESCE((SELECT SUM(a.reward_points) FROM player_achievements a WHERE a.user_id=d.user_id),0)
    +COALESCE((SELECT SUM(x.points) FROM (SELECT date_trunc('day',ch.completed_at AT TIME ZONE 'UTC') AS day,LEAST(SUM(ch.reward_points),c.daily_challenge_cap_points) AS points FROM player_challenge_completions ch WHERE ch.user_id=d.user_id AND ch.challenge_key LIKE 'daily:%' GROUP BY date_trunc('day',ch.completed_at AT TIME ZONE 'UTC')) x),0)
    +COALESCE((SELECT SUM(x.points) FROM (SELECT date_trunc('week',ch.completed_at AT TIME ZONE 'UTC') AS week,LEAST(SUM(ch.reward_points),c.weekly_challenge_reward_points) AS points FROM player_challenge_completions ch WHERE ch.user_id=d.user_id AND ch.challenge_key LIKE 'weekly:%' GROUP BY date_trunc('week',ch.completed_at AT TIME ZONE 'UTC')) x),0)
   )::bigint AS points,SUM(d.seconds)::bigint AS seconds
  FROM per_day d CROSS JOIN leaderboard_settings c WHERE c.id=1 GROUP BY d.user_id,c.daily_time_cap_minutes,c.points_per_active_minute,c.points_per_completed_session,c.daily_session_cap_points,c.daily_challenge_cap_points,c.weekly_challenge_reward_points,c.daily_challenge_cap_points,c.weekly_challenge_reward_points
 ),
 ranked AS (
  SELECT user_id,player_id,points,seconds,ROW_NUMBER() OVER(ORDER BY points DESC,seconds DESC,player_id ASC)::int AS global_rank FROM point_totals WHERE points>0
 )
 INSERT INTO player_ranking_history(user_id,player_id,snapshot_date,global_rank,total_points,active_seconds)
 SELECT user_id,player_id,(NOW() AT TIME ZONE 'UTC')::date,global_rank,points,seconds FROM ranked
 ON CONFLICT(user_id,snapshot_date) DO UPDATE SET global_rank=EXCLUDED.global_rank,total_points=EXCLUDED.total_points,active_seconds=EXCLUDED.active_seconds,created_at=NOW()
 RETURNING user_id
 `);
 const weighted=await db.query(`
 WITH cfg AS (SELECT * FROM gamer_rank_settings WHERE id=1),
 activity AS (
  SELECT s.user_id,SUM(a.active_seconds)::bigint AS active_seconds,SUM(a.completed_sessions)::int AS completed_sessions
  FROM player_session_daily_activity a JOIN game_play_sessions s ON s.session_key=a.session_key
  WHERE s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL
   AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)
  GROUP BY s.user_id
 ),
 coins AS (SELECT user_id,SUM(amount)::bigint AS earned FROM supercoin_transactions WHERE transaction_type='earn' AND amount>0 GROUP BY user_id),
 achievements AS (SELECT user_id,COUNT(*)::int AS count,COALESCE(SUM(reward_sc),0)::bigint AS value FROM player_achievements GROUP BY user_id),
 consistency AS (SELECT user_id,COUNT(DISTINCT activity_date)::int AS days FROM player_session_daily_activity WHERE activity_date>=(NOW() AT TIME ZONE 'UTC')::date-29 GROUP BY user_id),
 scored AS (
  SELECT p.user_id,p.player_id,COALESCE(a.active_seconds,0)::bigint AS active_seconds,COALESCE(a.completed_sessions,0)::int AS completed_sessions,
   COALESCE(c.earned,0)::bigint AS coin_earned,COALESCE(h.count,0)::int AS achievement_count,
   ROUND((LEAST(COALESCE(c.earned,0)::numeric/r.coin_cap,1)*100*r.coin_weight
    +LEAST((COALESCE(a.active_seconds,0)::numeric/3600)/r.hours_cap,1)*100*r.hours_weight
    +LEAST(COALESCE(a.completed_sessions,0)::numeric/r.sessions_cap,1)*100*r.sessions_weight
    +LEAST(COALESCE(h.value,0)::numeric/r.achievement_cap,1)*100*r.achievement_weight
    +LEAST(COALESCE(k.days,0)::numeric/r.consistency_days,1)*100*r.consistency_weight)::numeric,3) AS score
  FROM player_profiles p JOIN users u ON u.id=p.user_id AND u.email_verified_at IS NOT NULL
  CROSS JOIN cfg r LEFT JOIN activity a ON a.user_id=p.user_id LEFT JOIN coins c ON c.user_id=p.user_id
  LEFT JOIN achievements h ON h.user_id=p.user_id LEFT JOIN consistency k ON k.user_id=p.user_id
  LEFT JOIN player_leaderboard_controls lc ON lc.user_id=p.user_id
  WHERE COALESCE(lc.leaderboard_suspended,false)=false AND (COALESCE(a.active_seconds,0)>0 OR COALESCE(c.earned,0)>0 OR COALESCE(h.count,0)>0)
 ),
 ranked AS (SELECT *,ROW_NUMBER() OVER(ORDER BY score DESC,active_seconds DESC,completed_sessions DESC,achievement_count DESC)::int AS rank FROM scored)
 INSERT INTO gamer_ranking_snapshots(snapshot_date,period,category,user_id,player_id,score,rank,active_seconds,completed_sessions,coin_earned,achievement_count)
 SELECT (NOW() AT TIME ZONE 'UTC')::date,'all','',user_id,player_id,score,rank,active_seconds,completed_sessions,coin_earned,achievement_count FROM ranked
 ON CONFLICT(snapshot_date,period,category,user_id) DO UPDATE SET score=EXCLUDED.score,rank=EXCLUDED.rank,active_seconds=EXCLUDED.active_seconds,completed_sessions=EXCLUDED.completed_sessions,coin_earned=EXCLUDED.coin_earned,achievement_count=EXCLUDED.achievement_count,created_at=NOW()
 RETURNING user_id
 `);
 return res.json({ok:true,legacy_snapshots:result.rows.length,weighted_snapshots:weighted.rows.length});
}