import { db } from 'hatchable';
export async function touchPresence({userId,playerId,status,gameId=null,sessionKey=null}){
 const r=await db.query(`
 WITH prev AS MATERIALIZED (
  SELECT status,last_seen_at FROM player_presence WHERE user_id=$1 FOR UPDATE
 ), delta AS (
  SELECT NOW() AS now_ts,last_seen_at,
   CASE WHEN status IN ('online','playing','idle') AND last_seen_at>NOW()-INTERVAL '90 seconds'
    THEN LEAST(45,GREATEST(0,EXTRACT(EPOCH FROM (NOW()-last_seen_at))::int)) ELSE 0 END AS seconds
  FROM prev
 ), parts AS (
  SELECT (last_seen_at AT TIME ZONE 'UTC')::date AS activity_date,
   LEAST(seconds,GREATEST(0,EXTRACT(EPOCH FROM (date_trunc('day',now_ts AT TIME ZONE 'UTC')-(last_seen_at AT TIME ZONE 'UTC')))::int)) AS seconds
  FROM delta WHERE seconds>0
  UNION ALL
  SELECT (now_ts AT TIME ZONE 'UTC')::date AS activity_date,
   seconds-LEAST(seconds,GREATEST(0,EXTRACT(EPOCH FROM (date_trunc('day',now_ts AT TIME ZONE 'UTC')-(last_seen_at AT TIME ZONE 'UTC')))::int))
  FROM delta WHERE seconds>0
 ), saved AS (
  INSERT INTO player_presence_daily_activity(user_id,player_id,activity_date,online_seconds)
  SELECT $1,$2,activity_date,seconds FROM parts WHERE seconds>0
  ON CONFLICT(user_id,activity_date) DO UPDATE SET online_seconds=player_presence_daily_activity.online_seconds+EXCLUDED.online_seconds,updated_at=NOW()
  RETURNING user_id
 )
 INSERT INTO player_presence(user_id,player_id,status,current_game_id,active_session_id,last_seen_at,updated_at)
 VALUES($1,$2,$3,$4,$5,NOW(),NOW())
 ON CONFLICT(user_id) DO UPDATE SET player_id=EXCLUDED.player_id,status=EXCLUDED.status,current_game_id=EXCLUDED.current_game_id,active_session_id=EXCLUDED.active_session_id,last_seen_at=NOW(),updated_at=NOW()
 RETURNING user_id,status,last_seen_at
 `,[userId,playerId,status,gameId,sessionKey]);
 return r.rows[0]||null;
}