import { db, storage } from 'hatchable';
export const access='user';
export const methods=['GET','POST'];
const categories=['Puzzle','Arcade','Action','Adventure','Racing','Strategy','Sports','Casual','Educational','Other'];
export default async function(req,res){
 const u=req.user||{},uid=String(u.id||'');if(!uid)return res.status(401).json({error:'Sign in required.'});
 if(req.method==='GET'){const q=await db.query("SELECT id,game_name,category,status,owner_response,created_at,updated_at FROM game_submissions WHERE user_id=$1 ORDER BY created_at DESC",[uid]);return res.json({submissions:q.rows});}
 const b=req.body||{},name=String(b.game_name||'').trim(),description=String(b.description||'').trim(),category=String(b.category||''),url=String(b.game_url||'').trim(),html=String(b.game_html||'');
 if(name.length<3||name.length>90||description.length>2000||!categories.includes(category))return res.status(400).json({error:'Enter a valid game name, description and category.'});
 if((url&&!/^https:\/\//i.test(url))||(!url&&!html))return res.status(400).json({error:'Provide an HTTPS game URL or an HTML5 game file.'});
 if(html.length>2*1024*1024||(/<script[^>]+src\s*=\s*["']https?:/i.test(html)))return res.status(400).json({error:'HTML file is too large or contains a blocked external script reference.'});
 let thumbKey='';const f=(req.files||[]).find(x=>x.field==='thumbnail');
 if(f){if(!['image/jpeg','image/png','image/webp'].includes(f.contentType)||f.buffer.length>5*1024*1024)return res.status(400).json({error:'Thumbnail must be JPG, PNG or WebP up to 5 MB.'});const sig=f.buffer.toString('hex',0,12).toLowerCase(),ok=f.contentType==='image/jpeg'?sig.startsWith('ffd8ff'):f.contentType==='image/png'?sig.startsWith('89504e470d0a1a0a'):sig.startsWith('52494646')&&f.buffer.toString('ascii',8,12)==='WEBP';if(!ok)return res.status(400).json({error:'Thumbnail content does not match its image type.'});const ext=f.contentType==='image/png'?'png':f.contentType==='image/webp'?'webp':'jpg';thumbKey='submissions/'+uid+'/'+crypto.randomUUID()+'.'+ext;await storage.put(thumbKey,f.buffer,f.contentType);}
 const q=await db.query("INSERT INTO game_submissions(user_id,user_email,user_name,game_name,description,category,game_url,game_html,thumbnail_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,game_name,status,created_at",[uid,u.email||'',u.name||'',name,description,category,url,html,thumbKey]);
 return res.status(201).json({ok:true,submission:q.rows[0]});
}