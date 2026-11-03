import { db, storage } from 'hatchable';
export const access='public';
export const methods=['GET'];
function safePath(s){const p=String(s||'').replace(/\\/g,'/').replace(/^\/+/, '');if(!p||p.split('/').some(x=>!x||x==='.'||x==='..')||p.length>500)return null;return p;}
export default async function(req,res){
 const slug=String(req.params.slug||''),path=safePath(req.query?.path);
 if(!path)return res.status(400).json({error:'Invalid asset path.'});
 const row=(await db.query("SELECT a.storage_key FROM game_assets a JOIN games g ON g.id=a.game_id WHERE g.slug=$1 AND g.status='published' AND a.asset_path=$2",[slug,path])).rows[0];
 if(!row)return res.status(404).json({error:'Game asset not found.'});
 return res.redirect(302,await storage.url(row.storage_key));
}