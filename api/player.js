import { db } from 'hatchable';
import { ensureWallet } from 'lib/supercoin.js';
export const access='user';
export const methods=['GET','POST','PUT'];
function baseFromEmail(email){
 const local=String(email||'').split('@')[0]||'player';
 const clean=local.normalize('NFKD').replace(/[^a-zA-Z0-9_.-]/g,'').replace(/^[._-]+|[._-]+$/g,'').slice(0,24);
 return (clean||'player').toLowerCase();
}
async function suggestions(base,uid){
 const candidates=[base+'01',base+'_1',base+'.1',base+'_player',base+'2026',base+'x',base+'_pro'];
 const out=[];
 for(const name of candidates){
  if(name.length>32)continue;
  const q=await db.query("SELECT 1 FROM player_profiles WHERE LOWER(username)=LOWER($1) AND user_id<>$2 LIMIT 1",[name,uid]);
  if(!q.rows.length)out.push(name);
  if(out.length===5)break;
 }
 return out;
}
async function ensurePlayerId(uid){
 for(let attempt=0;attempt<6;attempt++){
  const existing=await db.query("SELECT player_id FROM player_id_registry WHERE user_id=$1 LIMIT 1",[uid]);
  if(existing.rows[0]?.player_id)return {player_id:existing.rows[0].player_id,created:false};
  const created=await db.query("INSERT INTO player_id_registry(user_id,player_id) VALUES($1,'GH-'||upper(gen_random_uuid()::text)) ON CONFLICT DO NOTHING RETURNING player_id",[uid]);
  if(created.rows[0]?.player_id)return {player_id:created.rows[0].player_id,created:true};
 }
 throw new Error('Could not allocate a unique Player ID. Please retry.');
}
export default async function(req,res){
 const u=req.user||{},uid=String(u.id||''),email=String(u.email||'').trim().toLowerCase();
 if(!uid)return res.status(401).json({error:'Sign in required.'});
 const base=baseFromEmail(email);
 if(req.method==='GET'){
  const identity=await ensurePlayerId(uid),playerId=identity.player_id;
  try{await db.query("INSERT INTO player_profiles(user_id,username,player_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET player_id=COALESCE(player_profiles.player_id,EXCLUDED.player_id)",[uid,base,playerId]);}catch(e){await db.query("INSERT INTO player_profiles(user_id,username,player_id) VALUES($1,'',$2) ON CONFLICT(user_id) DO UPDATE SET player_id=COALESCE(player_profiles.player_id,EXCLUDED.player_id)",[uid,playerId]);}
  await ensureWallet(uid,playerId);
  await Promise.all([
   db.query("UPDATE game_play_sessions SET player_id=$2 WHERE user_id=$1 AND player_id IS NULL",[uid,playerId]),
   db.query("UPDATE game_favorites SET player_id=$2 WHERE user_id=$1 AND player_id IS NULL",[uid,playerId]),
   db.query("UPDATE user_requests SET player_id=$2 WHERE user_id=$1 AND player_id IS NULL",[uid,playerId])
  ]);
  try{await db.query("UPDATE player_profiles SET username=$2,updated_at=NOW() WHERE user_id=$1 AND LOWER(username)=LOWER($3)",[uid,base,email]);}catch(e){/* Keep the existing name and offer alternatives in the profile editor. */}
  const [account,p,f,h,stats]=await Promise.all([
   db.query("SELECT created_at,email_verified_at FROM users WHERE id=$1 LIMIT 1",[uid]),
   db.query("SELECT username,avatar_url,settings,created_at,player_id FROM player_profiles WHERE user_id=$1",[uid]),
   db.query("SELECT g.id,g.slug,g.name,g.category,g.description,g.cover_emoji,g.created_at,(SELECT a.asset_path FROM game_assets a WHERE a.game_id=g.id AND split_part(a.asset_path,'/',1)='__thumbnail__' AND split_part(a.asset_path,'/',2) LIKE 'cover.%' ORDER BY a.created_at DESC LIMIT 1) AS thumbnail_path FROM game_favorites f JOIN games g ON g.id=f.game_id WHERE f.user_id=$1 AND g.status='published' ORDER BY f.created_at DESC",[uid]),
   db.query("SELECT g.id,g.slug,g.name,g.category,g.cover_emoji,MAX(s.started_at) AS last_played,COUNT(s.id)::int AS sessions,(SELECT a.asset_path FROM game_assets a WHERE a.game_id=g.id AND split_part(a.asset_path,'/',1)='__thumbnail__' AND split_part(a.asset_path,'/',2) LIKE 'cover.%' ORDER BY a.created_at DESC LIMIT 1) AS thumbnail_path FROM game_play_sessions s JOIN games g ON g.id=s.game_id WHERE s.user_id=$1 AND g.status='published' GROUP BY g.id ORDER BY last_played DESC LIMIT 100",[uid]),
   db.query("SELECT COUNT(DISTINCT game_id) FILTER(WHERE completion_status='completed')::int AS games_played,COUNT(*) FILTER(WHERE completion_status='completed')::int AS sessions,COALESCE(SUM(active_duration_seconds),0)::bigint AS play_seconds FROM game_play_sessions WHERE user_id=$1 AND verified_at IS NOT NULL AND suspicious_reason IS NULL AND NOT EXISTS(SELECT 1 FROM player_session_moderation sm WHERE sm.session_key=game_play_sessions.session_key AND sm.excluded=true)",[uid])
  ]);
  await db.query("UPDATE player_profiles SET games_played=$2,total_sessions=$3,play_seconds=$4,last_active_at=NOW(),updated_at=NOW() WHERE user_id=$1",[uid,stats.rows[0]?.games_played||0,stats.rows[0]?.sessions||0,stats.rows[0]?.play_seconds||0]);
  for(const g of f.rows.concat(h.rows)){g.thumbnail_url=g.thumbnail_path?'/api/game-assets/'+encodeURIComponent(g.slug)+'?path='+encodeURIComponent(g.thumbnail_path):null;delete g.thumbnail_path;}
  const favIds=f.rows.map(x=>x.id),profile=p.rows[0]||null;
  return res.json({profile,email,username_base:base,username_suggestions:profile?[]:await suggestions(base,uid),account_created_at:account.rows[0]?.created_at||u.created_at||null,verified:!!account.rows[0]?.email_verified_at,player_id:profile?.player_id||playerId,player_id_created:identity.created,favorites:f.rows,history:h.rows,favorite_ids:favIds,stats:{games_played:stats.rows[0]?.games_played||0,play_sessions:stats.rows[0]?.sessions||0,play_seconds:stats.rows[0]?.play_seconds||0}});
 }
 const b=req.body||{},action=String(b.action||'');
 if(req.method==='PUT'){
  if(action==='profile'){
   const username=String(b.username||'').trim(),avatar=String(b.avatar_url||'').trim();
   if(username.length<2||username.length>32||!/^[a-zA-Z0-9_.-]+$/.test(username))return res.status(400).json({error:'Username must be 2–32 characters using letters, numbers, dots, underscores or hyphens.'});
   if(avatar&&!/^https:\/\//i.test(avatar))return res.status(400).json({error:'Avatar must be an HTTPS image URL.'});
   const taken=await db.query("SELECT user_id FROM player_profiles WHERE LOWER(username)=LOWER($1) AND user_id<>$2 LIMIT 1",[username,uid]);
   if(taken.rows.length)return res.status(409).json({error:'This username is already taken. Choose a unique username.',suggestions:await suggestions(baseFromEmail(email),uid)});
   try{
    await db.query("INSERT INTO player_profiles(user_id,username,avatar_url) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET username=$2,avatar_url=$3,updated_at=NOW()",[uid,username,avatar]);
   }catch(e){
    const picks=await suggestions(baseFromEmail(email),uid);
    return res.status(409).json({error:'This username was just claimed by another player. Please choose another.',suggestions:picks});
   }
   return res.json({ok:true,username});
  }
  if(action==='settings'){
   const settings=b.settings;if(!settings||typeof settings!=='object'||Array.isArray(settings))return res.status(400).json({error:'Invalid settings.'});
   await db.query("INSERT INTO player_profiles(user_id,settings) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=$2::jsonb,updated_at=NOW()",[uid,JSON.stringify(settings)]);
   return res.json({ok:true});
  }
  return res.status(400).json({error:'Unknown update action.'});
 }
 if(action==='favorite'){
  const gameId=String(b.game_id||''),enabled=!!b.enabled;
  const identity=await db.query("SELECT player_id FROM player_id_registry WHERE user_id=$1 LIMIT 1",[uid]),playerId=identity.rows[0]?.player_id||null;
  if(!/^[0-9a-f-]{36}$/i.test(gameId))return res.status(400).json({error:'Invalid game.'});
  if(enabled)await db.query("INSERT INTO game_favorites(user_id,game_id,player_id) SELECT $1,id,$3 FROM games WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING",[uid,gameId,playerId]);
  else await db.query("DELETE FROM game_favorites WHERE user_id=$1 AND game_id=$2",[uid,gameId]);
  return res.json({ok:true});
 }
 if(action==='remove_history'){const gameId=String(b.game_id||'');await db.query("DELETE FROM game_play_sessions WHERE user_id=$1 AND game_id=$2",[uid,gameId]);return res.json({ok:true});}
 if(action==='clear_history'){await db.query("DELETE FROM game_play_sessions WHERE user_id=$1",[uid]);return res.json({ok:true});}
 return res.status(400).json({error:'Unknown action.'});
}