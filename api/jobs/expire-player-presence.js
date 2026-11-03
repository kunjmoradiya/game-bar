import { db } from 'hatchable';
export const access='scheduler';
export const methods=['POST'];
export default async function(req,res){
 const expired=await db.query("UPDATE game_play_sessions SET session_status='timed_out',completion_status='incomplete',ended_at=COALESCE(ended_at,NOW()) WHERE session_status IN ('playing','idle') AND last_heartbeat_at<NOW()-INTERVAL '90 seconds' RETURNING user_id,session_key");
 await db.query("UPDATE player_presence SET status='offline',current_game_id=NULL,active_session_id=NULL,updated_at=NOW() WHERE last_seen_at<NOW()-INTERVAL '90 seconds' OR (active_session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM game_play_sessions s WHERE s.session_key=player_presence.active_session_id AND s.session_status IN ('playing','idle') AND s.last_heartbeat_at>NOW()-INTERVAL '90 seconds'))");
 await db.query("DELETE FROM player_search_rate_limits WHERE window_started_at<NOW()-INTERVAL '2 days'");
 return res.json({ok:true,expired_sessions:expired.rows.length});
}