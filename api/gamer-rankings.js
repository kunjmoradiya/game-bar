import { db, auth } from 'hatchable';
export const access='public';
export const methods=['GET'];
const boundary="CASE WHEN $1='daily' THEN (NOW() AT TIME ZONE 'UTC')::date WHEN $1='weekly' THEN date_trunc('week',NOW() AT TIME ZONE 'UTC')::date WHEN $1='monthly' THEN date_trunc('month',NOW() AT TIME ZONE 'UTC')::date WHEN $1='season' THEN COALESCE((SELECT starts_at::date FROM leaderboard_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1),'1970-01-01'::date) ELSE '1970-01-01'::date END";
export default async function(req,res){
 const period=String(req.query?.period||'all'),category=String(req.query?.category||'').trim().slice(0,80),type=String(req.query?.type||'score');
 const limit=Math.max(1,Math.min(100,Number(req.query?.limit)||100)),offset=Math.max(0,Math.min(100000,Number(req.query?.offset)||0));
 if(!['daily','weekly','monthly','all','season'].includes(period))return res.status(400).json({error:'Invalid period.'});
 if(!['score','coins','hours','games','achievements','rising','active'].includes(type))return res.status(400).json({error:'Invalid leaderboard category.'});
 const user=await auth.getUser(req).catch(()=>null),uid=user?.id||null;
 const [settings,categories,rows,metrics]=await Promise.all([
  db.query("SELECT * FROM gamer_rank_settings WHERE id=1"),
  db.query("SELECT DISTINCT category FROM games WHERE status='published' AND category<>'' ORDER BY category"),
  db.query(`
  WITH cfg AS (SELECT * FROM gamer_rank_settings WHERE id=1),
  activity AS (
   SELECT a.user_id,MAX(a.player_id) AS player_id,SUM(a.active_seconds)::bigint AS active_seconds,SUM(a.completed_sessions)::int AS completed_sessions,
    COUNT(DISTINCT a.activity_date)::int AS active_days,COUNT(DISTINCT s.game_id) FILTER(WHERE s.completion_status='completed')::int AS games_completed
   FROM player_session_daily_activity a JOIN game_play_sessions s ON s.session_key=a.session_key
   JOIN games g ON g.id=s.game_id
   WHERE s.verified_at IS NOT NULL AND s.suspicious_reason IS NULL AND a.activity_date>=(CASE WHEN $1='daily' THEN (NOW() AT TIME ZONE 'UTC')::date WHEN $1='weekly' THEN date_trunc('week',NOW() AT TIME ZONE 'UTC')::date WHEN $1='monthly' THEN date_trunc('month',NOW() AT TIME ZONE 'UTC')::date WHEN $1='season' THEN COALESCE((SELECT starts_at::date FROM leaderboard_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1),'1970-01-01'::date) ELSE '1970-01-01'::date END) AND ($2='' OR g.category=$2)
    AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)
   GROUP BY a.user_id
  ),
  coin_data AS (
   SELECT user_id,SUM(amount)::bigint AS coins_earned FROM supercoin_transactions
   WHERE amount>0 AND transaction_type='earn' AND created_at>=(CASE WHEN $1='daily' THEN (NOW() AT TIME ZONE 'UTC')::date WHEN $1='weekly' THEN date_trunc('week',NOW() AT TIME ZONE 'UTC')::date WHEN $1='monthly' THEN date_trunc('month',NOW() AT TIME ZONE 'UTC')::date WHEN $1='season' THEN COALESCE((SELECT starts_at::date FROM leaderboard_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1),'1970-01-01'::date) ELSE '1970-01-01'::date END::timestamptz)
    AND ($2='' OR EXISTS(SELECT 1 FROM games cg WHERE cg.id=supercoin_transactions.related_game_id AND cg.category=$2)) GROUP BY user_id
  ),
  achievements AS (
   SELECT user_id,COUNT(*)::int AS achievement_count,COALESCE(SUM(reward_sc),0)::bigint AS achievement_value
   FROM player_achievements WHERE unlocked_at>=(CASE WHEN $1='daily' THEN (NOW() AT TIME ZONE 'UTC')::date WHEN $1='weekly' THEN date_trunc('week',NOW() AT TIME ZONE 'UTC')::date WHEN $1='monthly' THEN date_trunc('month',NOW() AT TIME ZONE 'UTC')::date ELSE '1970-01-01'::date END::timestamptz) GROUP BY user_id
  ),
  consistency AS (
   SELECT user_id,COUNT(DISTINCT activity_date)::int AS active_days_30
   FROM player_session_daily_activity WHERE activity_date>=(NOW() AT TIME ZONE 'UTC')::date-29 GROUP BY user_id
  ),
  base AS (
   SELECT p.user_id,p.player_id,p.username,p.avatar_url,p.gamer_level,p.created_at,
    COALESCE(w.balance,0)::bigint AS coin_balance,COALESCE(w.total_earned,0)::bigint AS lifetime_coins,
    COALESCE(c.coins_earned,0)::bigint AS period_coins,
    COALESCE(a.active_seconds,0)::bigint AS active_seconds,
    COALESCE(a.completed_sessions,0)::int AS completed_sessions,
    COALESCE(a.games_completed,0)::int AS games_completed,
    COALESCE(a.active_days,0)::int AS active_days,
    COALESCE(h.achievement_count,0)::int AS achievement_count,
    COALESCE(h.achievement_value,0)::bigint AS achievement_value,
    COALESCE(k.active_days_30,0)::int AS active_days_30,
    COALESCE(pp.status,'offline') AS online_status
   FROM player_profiles p JOIN users u ON u.id=p.user_id AND u.email_verified_at IS NOT NULL AND u.email NOT LIKE '%@test.invalid'
   LEFT JOIN supercoin_wallets w ON w.user_id=p.user_id
   LEFT JOIN coin_data c ON c.user_id=p.user_id
   LEFT JOIN activity a ON a.user_id=p.user_id
   LEFT JOIN achievements h ON h.user_id=p.user_id
   LEFT JOIN consistency k ON k.user_id=p.user_id
   LEFT JOIN player_presence pp ON pp.user_id=p.user_id AND pp.last_seen_at>NOW()-INTERVAL '90 seconds'
   LEFT JOIN player_leaderboard_controls lc ON lc.user_id=p.user_id
   WHERE COALESCE((p.settings->>'leaderboard_visible')::boolean,true)=true
    AND COALESCE(lc.leaderboard_suspended,false)=false
  ),
  scored AS (
   SELECT b.*,
    ROUND((LEAST(b.period_coins::numeric/c.coin_cap,1)*100*c.coin_weight
     +LEAST((b.active_seconds::numeric/3600)/c.hours_cap,1)*100*c.hours_weight
     +LEAST(b.completed_sessions::numeric/c.sessions_cap,1)*100*c.sessions_weight
     +LEAST(b.achievement_value::numeric/c.achievement_cap,1)*100*c.achievement_weight
     +LEAST(b.active_days_30::numeric/c.consistency_days,1)*100*c.consistency_weight)::numeric,3) AS ranking_score,
    CASE WHEN $3='coins' THEN b.period_coins::numeric WHEN $3='hours' THEN b.active_seconds::numeric
     WHEN $3='games' THEN b.games_completed::numeric WHEN $3='achievements' THEN b.achievement_count::numeric
     WHEN $3='rising' THEN (b.active_days_30*100+b.active_seconds/60)::numeric WHEN $3='active' THEN b.active_seconds::numeric
     ELSE (LEAST(b.period_coins::numeric/c.coin_cap,1)*100*c.coin_weight
     +LEAST((b.active_seconds::numeric/3600)/c.hours_cap,1)*100*c.hours_weight
     +LEAST(b.completed_sessions::numeric/c.sessions_cap,1)*100*c.sessions_weight
     +LEAST(b.achievement_value::numeric/c.achievement_cap,1)*100*c.achievement_weight
     +LEAST(b.active_days_30::numeric/c.consistency_days,1)*100*c.consistency_weight) END AS order_value
   FROM base b CROSS JOIN cfg c
  ),
  ranked_base AS (
   SELECT s.*,COALESCE((SELECT MIN(snapshot_date)::timestamptz FROM gamer_ranking_snapshots rs WHERE $1='all' AND rs.user_id=s.user_id AND rs.period='all' AND rs.category='' AND rs.score>=s.ranking_score),s.created_at) AS score_reached_at
   FROM scored s WHERE s.period_coins>0 OR s.active_seconds>0 OR s.achievement_count>0
  ),
  ranked AS (
   SELECT rb.*,ROW_NUMBER() OVER(ORDER BY order_value DESC,active_seconds DESC,completed_sessions DESC,achievement_count DESC,score_reached_at ASC)::int AS rank
   FROM ranked_base rb
  )
  SELECT * FROM ranked WHERE (rank>$4::int AND rank<=$4::int+$5::int) OR user_id=$6 ORDER BY rank
  `,[period,category,type,offset,limit,uid]),
  db.query("SELECT (SELECT COUNT(*)::int FROM users WHERE email_verified_at IS NOT NULL) AS registered_players,(SELECT COUNT(*)::int FROM player_presence WHERE status IN ('online','playing','idle') AND last_seen_at>NOW()-INTERVAL '90 seconds') AS online_players,(SELECT COUNT(*)::int FROM player_presence WHERE status='playing' AND last_seen_at>NOW()-INTERVAL '90 seconds') AS playing_players,(SELECT COUNT(*)::int FROM player_presence WHERE status='idle' AND last_seen_at>NOW()-INTERVAL '90 seconds') AS idle_players,(SELECT COALESCE(SUM(active_duration_seconds),0)::bigint FROM game_play_sessions s WHERE verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=s.session_key AND sm.excluded=true)) AS total_active_seconds,(SELECT COUNT(*)::int FROM game_play_sessions WHERE session_status IN ('playing','idle') AND last_heartbeat_at>NOW()-INTERVAL '90 seconds') AS active_sessions,(SELECT g.name FROM player_presence pp JOIN games g ON g.id=pp.current_game_id WHERE pp.status='playing' AND pp.last_seen_at>NOW()-INTERVAL '90 seconds' GROUP BY g.name ORDER BY COUNT(*) DESC LIMIT 1) AS most_played_game")
 ]);
 const data=rows.rows,players=data.filter(x=>Number(x.rank)>offset&&Number(x.rank)<=offset+limit).map(x=>({
  rank:Number(x.rank),player_id:x.player_id,username:x.username||'Player',avatar_url:x.avatar_url||'',gamer_level:Number(x.gamer_level)||1,
  supercoin_balance:Number(x.coin_balance)||0,supercoins_earned:Number(x.period_coins)||0,total_supercoins_earned:Number(x.lifetime_coins)||0,
  verified_active_hours:Math.round((Number(x.active_seconds)||0)/3600*100)/100,completed_sessions:Number(x.completed_sessions)||0,
  games_completed:Number(x.games_completed)||0,achievement_count:Number(x.achievement_count)||0,ranking_score:Number(x.ranking_score)||0,
  online_status:x.online_status||'offline'
 }));
 const mine=uid?data.find(x=>x.user_id===uid):null;
 return res.json({period,category,type,metrics:metrics.rows[0]||{},players,my_rank:mine?{rank:Number(mine.rank),player_id:mine.player_id,username:mine.username,ranking_score:Number(mine.ranking_score)||0,supercoin_balance:Number(mine.coin_balance)||0,verified_active_hours:Math.round((Number(mine.active_seconds)||0)/3600*100)/100}:null,categories:categories.rows.map(x=>x.category),scoring:{weights:settings.rows[0]||{},normalization:'Coin cap, active-hour cap, completed-session cap, achievement-value cap and active-day cap each normalize to 0–100 before weighted sum. Default weights: 35%, 25%, 15%, 15%, 10%. Tie-breakers: active time, completed sessions, achievements, then earliest recorded all-time score snapshot at or above the current score (account creation time until a snapshot exists).'}});
}