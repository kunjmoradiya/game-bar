import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET'];
const OWNER_HANDLE='moradiyakunj1';
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Owner access required.'});
 const q=String(req.query?.q||'').trim().slice(0,120);
 if(!q)return res.json({players:[],total:0});
 const {rows}=await db.query(`
  SELECT p.player_id,p.user_id,u.email,u.name,u.email_verified_at,u.created_at,
   p.username,p.avatar_url,p.settings,
   (SELECT COUNT(DISTINCT game_id)::int FROM game_play_sessions WHERE user_id=p.user_id) AS games_played,
   (SELECT COUNT(*)::int FROM game_play_sessions WHERE user_id=p.user_id) AS total_sessions,
   (SELECT COALESCE(SUM(duration_seconds),0)::bigint FROM game_play_sessions WHERE user_id=p.user_id) AS play_seconds,
   (SELECT COALESCE(SUM(points),0)::bigint FROM verified_game_scores WHERE user_id=p.user_id AND verified=true) AS ranking_points,
   (SELECT COUNT(*)::int FROM game_activity WHERE player_id=p.player_id) AS activity_events,
   (SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE (SELECT COUNT(*)::int+1 FROM (SELECT user_id,SUM(points) AS total_points FROM verified_game_scores WHERE verified=true GROUP BY user_id) ranked WHERE ranked.total_points>(SELECT SUM(points) FROM verified_game_scores WHERE user_id=p.user_id AND verified=true)) END FROM verified_game_scores WHERE user_id=p.user_id AND verified=true) AS global_rank,
   (SELECT COUNT(*)::int FROM game_play_sessions WHERE user_id=p.user_id AND started_at>NOW()-INTERVAL '24 hours') AS sessions_24h,
   (SELECT COUNT(*)::int FROM verified_game_scores WHERE user_id=p.user_id AND created_at>NOW()-INTERVAL '24 hours') AS scores_24h,
   (SELECT json_agg(json_build_object('game',g.name,'started_at',s.started_at,'duration_seconds',s.duration_seconds) ORDER BY s.started_at DESC)
    FROM (SELECT game_id,started_at,duration_seconds FROM game_play_sessions WHERE user_id=p.user_id ORDER BY started_at DESC LIMIT 5) s
    JOIN games g ON g.id=s.game_id) AS recent_sessions
  FROM player_profiles p
  LEFT JOIN users u ON u.id=p.user_id
  WHERE p.player_id ILIKE '%'||$1||'%' OR COALESCE(p.username,'') ILIKE '%'||$1||'%' OR COALESCE(u.email,'') ILIKE '%'||$1||'%'
  ORDER BY u.created_at DESC LIMIT 100
 `,[q]);
 const players=rows.map(p=>({player_id:p.player_id,internal_user_id:p.user_id,email:p.email||'',name:p.name||'',email_verified:!!p.email_verified_at,username:p.username||'',avatar_url:p.avatar_url||'',account_created_at:p.created_at,account_status:p.email?'active':'deleted_or_unlinked',games_played:Number(p.games_played)||0,total_sessions:Number(p.total_sessions)||0,total_playing_hours:Math.round((Number(p.play_seconds)||0)/3600*10)/10,ranking_points:Number(p.ranking_points)||0,global_rank:p.global_rank===null?null:Number(p.global_rank),activity_events:Number(p.activity_events)||0,sessions_24h:Number(p.sessions_24h)||0,scores_24h:Number(p.scores_24h)||0,recent_sessions:p.recent_sessions||[],public_profile:(p.settings||{}).public_profile!==false}));
 return res.json({players,total:players.length});
}