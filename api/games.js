import { db } from 'hatchable';
import { searchGames } from 'lib/game-search.js';
export const access = 'public';
export const methods = ['GET'];
export default async function(req,res){
 const q=String(req.query?.q||'');
 if(q.trim()){
  try{const result=await searchGames({query:q,limit:req.query?.limit,offset:req.query?.offset});res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');return res.json(result);}
  catch(e){return res.status(500).json({error:'Game search is temporarily unavailable.'});}
 }
 const limit=Math.max(1,Math.min(Number(req.query?.limit)||24,50));
 const offset=Math.max(0,Math.min(Number(req.query?.offset)||0,100000));
 const {rows}=await db.query("SELECT g.id,g.slug,g.name,g.category,g.description,g.cover_emoji,g.version_label,g.developer,g.controls,g.instructions,g.engine_id,g.runtime_id,g.build_status,g.created_at,g.updated_at,(SELECT a.asset_path FROM game_assets a WHERE a.game_id=g.id AND split_part(a.asset_path,'/',1)='__thumbnail__' AND split_part(a.asset_path,'/',2) LIKE 'cover.%' ORDER BY a.created_at DESC LIMIT 1) AS thumbnail_path,(SELECT COUNT(*)::int FROM game_activity s WHERE s.game_id=g.id) AS play_count,(SELECT COUNT(DISTINCT s.user_id)::int FROM game_play_sessions s WHERE s.game_id=g.id AND s.user_id IS NOT NULL) AS unique_players FROM games g WHERE g.status='published' ORDER BY g.created_at DESC,g.id DESC LIMIT $1 OFFSET $2",[limit,offset]);
 for(const g of rows){g.thumbnail_url=g.thumbnail_path?'/api/game-assets/'+encodeURIComponent(g.slug)+'?path='+encodeURIComponent(g.thumbnail_path):null;delete g.thumbnail_path;}
 const count=await db.query("SELECT COUNT(*)::int AS total FROM games WHERE status='published'");
 const cats=await db.query("SELECT DISTINCT category FROM games WHERE status='published' AND category<>'' ORDER BY category");
 const total=count.rows[0].total;
 res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');return res.json({games:rows,total,categories:cats.rows.map(x=>x.category),offset,pageSize:limit,hasMore:offset+rows.length<total});
}