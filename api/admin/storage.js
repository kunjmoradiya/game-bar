import { db } from 'hatchable';
export const access='admin';
export const methods=['GET'];
const OWNER_HANDLE='moradiyakunj1';
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Owner access required.'});
 const {rows}=await db.query("SELECT a.id,a.asset_path,a.content_type,a.byte_size,a.created_at,g.id AS game_id,g.name AS game_name,g.slug,g.status FROM game_assets a JOIN games g ON g.id=a.game_id ORDER BY a.created_at DESC");
 const total=rows.reduce((n,r)=>n+Number(r.byte_size||0),0);
 const byGame={};for(const r of rows){const k=r.game_id;if(!byGame[k])byGame[k]={game_id:k,name:r.game_name,slug:r.slug,assets:0,bytes:0};byGame[k].assets++;byGame[k].bytes+=Number(r.byte_size||0);}
 return res.json({total_bytes:total,asset_count:rows.length,game_count:Object.keys(byGame).length,by_game:Object.values(byGame),assets:rows});
}