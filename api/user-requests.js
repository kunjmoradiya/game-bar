import { db, storage, auth } from 'hatchable';
export const access = 'user';
export const methods = ['GET','POST'];
const categories=['Request a New Game','Request a New Game Category','Request a New Feature','Report a Game Problem','Report a Website Problem','Account Support','Suggestion or Feedback','Other'];
export default async function(req,res){
 const verified=await auth.getUser(req),u=verified||req.user;
 if(req.method==='GET'){
  const {rows}=await db.query("SELECT id,player_id,request_title,request_category,request_description,status,owner_response,created_at,updated_at,reviewed_at,attachment_name,attachment_type,attachment_size FROM user_requests WHERE user_id=$1 ORDER BY created_at DESC",[u.id]);
  const n=await db.query("SELECT id,request_id,title,body,is_read,created_at FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",[u.id]);
  return res.json({requests:rows,notifications:n.rows,unread_count:n.rows.filter(x=>!x.is_read).length});
 }
 const identity=await db.query("INSERT INTO player_id_registry(user_id,player_id) VALUES($1,'GH-'||upper(gen_random_uuid()::text)) ON CONFLICT DO NOTHING RETURNING player_id",[u.id]);
 const known=identity.rows[0]?.player_id||(await db.query("SELECT player_id FROM player_id_registry WHERE user_id=$1",[u.id])).rows[0]?.player_id||null;
 const b=req.body||{},title=String(b.title||'').trim(),category=String(b.category||''),description=String(b.description||'').trim();
 if(title.length<3||title.length>120)return res.status(400).json({error:'Request title must be 3–120 characters.'});
 if(!categories.includes(category))return res.status(400).json({error:'Choose a valid request category.'});
 if(description.length<10||description.length>3000)return res.status(400).json({error:'Description must be 10–3,000 characters.'});
 let attachment={key:'',name:'',type:'',size:0};
 const f=(req.files||[]).find(x=>x.field==='attachment');
 if(f){const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(f.contentType))return res.status(400).json({error:'Attachment must be JPG, PNG, WebP or PDF.'});const bytes=f.buffer;if(bytes.length>5*1024*1024)return res.status(400).json({error:'Attachment must be 5 MB or smaller.'});const sig=bytes.toString('hex',0,12).toLowerCase(),valid=f.contentType==='image/jpeg'?sig.startsWith('ffd8ff'):f.contentType==='image/png'?sig.startsWith('89504e470d0a1a0a'):f.contentType==='image/webp'?sig.startsWith('52494646')&&bytes.toString('ascii',8,12)==='WEBP':bytes.toString('ascii',0,5)==='%PDF-';if(!valid)return res.status(400).json({error:'The attachment contents do not match the selected file type.'});const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'})[f.contentType];attachment={key:'user-requests/'+u.id+'/'+crypto.randomUUID()+'.'+ext,name:String(f.filename||('attachment.'+ext)).slice(0,180),type:f.contentType,size:f.buffer.length};await storage.put(attachment.key,f.buffer,f.contentType);}
 const {rows}=await db.query("INSERT INTO user_requests(user_id,player_id,user_email,user_name,request_title,request_category,request_description,attachment_key,attachment_name,attachment_type,attachment_size) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,player_id,request_title,request_category,status,created_at,updated_at",[u.id,known,u.email||'',u.name||'',title,category,description,attachment.key,attachment.name,attachment.type,attachment.size]);
 const r=rows[0];
 await db.query("INSERT INTO user_request_events(request_id,actor_type,actor_id,actor_name,event_type,message) VALUES($1,'user',$2,$3,'submitted','Request submitted')",[r.id,u.id,u.name||u.email||'User']);
 await db.query("INSERT INTO user_notifications(user_id,request_id,title,body) VALUES($1,$2,$3,$4)",[u.id,r.id,'Request submitted','Your request has been received by the GAME HUB owner.']);
 return res.status(201).json({ok:true,request:r,message:'Your request was submitted successfully.'});
}