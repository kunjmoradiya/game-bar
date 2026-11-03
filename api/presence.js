import { db, auth, events } from 'hatchable';
import { touchPresence } from 'lib/player-presence.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
 const user=req.user?.id?req.user:await auth.getUser(req).catch(()=>null);
 if(!user?.id)return res.json({ok:true,signed_in:false});
 const body=req.body||{},state=['idle','offline'].includes(body.state)?body.state:'online';
 const identity=await db.query("SELECT p.player_id,u.email_verified_at FROM player_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND p.player_id IS NOT NULL LIMIT 1",[user.id]);
 if(!identity.rows[0]||!identity.rows[0].email_verified_at)return res.json({ok:true,signed_in:true,verified:false});
 const active=await db.query("SELECT session_key,game_id,session_status FROM game_play_sessions WHERE user_id=$1 AND session_status IN ('playing','idle') AND last_heartbeat_at>NOW()-INTERVAL '90 seconds' LIMIT 1",[user.id]);
 const actual=active.rows.length?active.rows[0].session_status:state;
 await touchPresence({userId:user.id,playerId:identity.rows[0].player_id,status:actual,gameId:active.rows[0]?.game_id||null,sessionKey:active.rows[0]?.session_key||null});
 try{await events.publish('leaderboard','presence_changed',{player_id:identity.rows[0].player_id,status:actual});}catch(_){}
 return res.json({ok:true,signed_in:true,verified:true,status:actual});
}