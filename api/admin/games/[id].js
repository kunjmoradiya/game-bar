import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET','PUT','DELETE'];
const OWNER_HANDLE = 'moradiyakunj1';
function ownerOnly(req,res){ if(req.member?.handle !== OWNER_HANDLE){res.status(403).json({error:'Only the primary project owner can manage games.'});return false;} return true; }
export default async function(req,res){
 if(!ownerOnly(req,res)) return;
 const id=String(req.params.id||'');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({error:'Invalid game ID.'});
 if(req.method==='GET'){
  const {rows}=await db.query("SELECT id,slug,name,category,description,status,cover_emoji,source_code,original_filename,version_label,developer,aliases,tags,keywords,controls,instructions,updated_at FROM games WHERE id=$1",[id]);
  if(!rows.length)return res.status(404).json({error:'Game not found.'});
  return res.json({game:rows[0]});
 }
 if(req.method==='DELETE'){
  await db.query("DELETE FROM games WHERE id=$1",[id]);
  return res.json({ok:true});
 }
 const b=req.body||{};
 const slug=String(b.slug||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
 if(!String(b.name||'').trim()||!slug)return res.status(400).json({error:'Game name and URL slug are required.'});
 const {rows}=await db.query("UPDATE games SET name=$2,slug=$3,category=$4,description=$5,status=$6,cover_emoji=$7,version_label=$8,developer=$9,controls=$10,instructions=$11,aliases=$12,tags=$13,keywords=$14,source_code=CASE WHEN $15::text IS NULL THEN source_code ELSE $15 END,updated_at=NOW() WHERE id=$1 RETURNING id,slug,name,category,status,version_label,updated_at",
 [id,String(b.name).trim(),slug,['Puzzle','Arcade','Action','Adventure','Racing','Strategy','Sports','Casual','Educational','Other'].includes(b.category)?b.category:'Other',String(b.description||''),b.status==='draft'?'draft':'published',String(b.cover_emoji||'🎮').slice(0,12),String(b.version_label||'1.0.0'),String(b.developer||''),String(b.controls||''),String(b.instructions||''),String(b.aliases||''),String(b.tags||''),String(b.keywords||''),typeof b.source_code==='string'?b.source_code:null]);
 if(!rows.length)return res.status(404).json({error:'Game not found.'});
 return res.json({game:rows[0],play_url:'/api/play/'+slug});
}