import { db } from 'hatchable';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 const {rows}=await db.query("SELECT g.id,g.slug,g.name,g.category,g.description,g.cover_emoji,g.created_at,(SELECT a.asset_path FROM game_assets a WHERE a.game_id=g.id AND split_part(a.asset_path,'/',1)='__thumbnail__' AND split_part(a.asset_path,'/',2) LIKE 'cover.%' ORDER BY a.created_at DESC LIMIT 1) AS thumbnail_path,COUNT(a.id)::int AS play_count,(SELECT COUNT(DISTINCT s.user_id)::int FROM game_play_sessions s WHERE s.game_id=g.id AND s.user_id IS NOT NULL AND s.started_at>=NOW()-INTERVAL '7 days') AS unique_players,(COUNT(a.id)*2+(SELECT COUNT(DISTINCT s.user_id)*3 FROM game_play_sessions s WHERE s.game_id=g.id AND s.user_id IS NOT NULL AND s.started_at>=NOW()-INTERVAL '7 days'))::int AS trending_score FROM games g JOIN game_activity a ON a.game_id=g.id AND a.started_at>=NOW()-INTERVAL '7 days' WHERE g.status='published' GROUP BY g.id ORDER BY trending_score DESC,play_count DESC LIMIT 100");
 for(const g of rows){g.thumbnail_url=g.thumbnail_path?'/api/game-assets/'+encodeURIComponent(g.slug)+'?path='+encodeURIComponent(g.thumbnail_path):null;delete g.thumbnail_path;}
 res.setHeader('Cache-Control','no-store');return res.json({games:rows,period_days:7});
}