import { db, auth } from 'hatchable';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
 const b=req.body||{},slug=String(b.slug||''),key=String(b.session_key||''),action=String(b.action||'start');
 if(!/^[a-z0-9-]{1,70}$/.test(slug)||!/^[a-zA-Z0-9-]{12,80}$/.test(key))return res.status(400).json({error:'A valid game and play session are required.'});
 if(action==='finish'){const seconds=Math.max(0,Math.min(14400,Math.floor(Number(b.duration_seconds)||0)));await db.query("UPDATE game_activity SET ended_at=NOW(),duration_seconds=$2 WHERE session_key=$1",[key,seconds]);await db.query("UPDATE game_play_sessions SET ended_at=NOW(),duration_seconds=$2 WHERE session_key=$1",[key,seconds]);return res.json({ok:true});}
 const g=await db.query("SELECT id FROM games WHERE slug=$1 AND status='published'",[slug]);if(!g.rows.length)return res.status(404).json({error:'Published game not found.'});
 let user=null;try{user=(await auth.getUser(req))||req.user}catch(e){user=req.user||null}
 let playerId=null;if(user?.id){const identity=await db.query("SELECT player_id FROM player_profiles WHERE user_id=$1 LIMIT 1",[user.id]);playerId=identity.rows[0]?.player_id||null;}
 await db.query("INSERT INTO game_activity(session_key,game_id,player_id) VALUES($1,$2,$3) ON CONFLICT(session_key) DO NOTHING",[key,g.rows[0].id,playerId]);
 if(user?.id)await db.query("INSERT INTO game_play_sessions(session_key,game_id,user_id,player_id) VALUES($1,$2,$3,$4) ON CONFLICT(session_key) DO NOTHING",[key,g.rows[0].id,user.id,playerId]);
 return res.json({ok:true,recorded:true});
}