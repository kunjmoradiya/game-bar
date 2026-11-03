import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','PUT'];
const OWNER='moradiyakunj1';
export default async function(req,res){
 if(req.member?.handle!==OWNER)return res.status(403).json({error:'Owner access required.'});
 if(req.method==='GET'){const q=await db.query("SELECT id,user_id,user_email,user_name,game_name,description,category,game_url,game_html,status,owner_response,created_at,updated_at FROM game_submissions ORDER BY created_at DESC LIMIT 300");return res.json({submissions:q.rows,total:q.rows.length});}
 const b=req.body||{},id=String(b.id||''),status=String(b.status||''),response=String(b.owner_response||'').slice(0,2000);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['pending','under_review','approved','rejected'].includes(status))return res.status(400).json({error:'Invalid submission or status.'});
 const old=await db.query("SELECT * FROM game_submissions WHERE id=$1",[id]);if(!old.rows.length)return res.status(404).json({error:'Submission not found.'});
 const s=old.rows[0];let createdGame=null;
 if(status==='approved'&&s.game_html){
  let base=String(s.game_name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'community-game',slug=base,n=2;
  while((await db.query("SELECT id FROM games WHERE slug=$1",[slug])).rows.length)slug=base+'-'+n++;
  const g=await db.query("INSERT INTO games(slug,name,category,description,status,cover_emoji,game_type,source_code,original_filename,developer,engine_id,runtime_id,build_status) VALUES($1,$2,$3,$4,'draft','🎮','community',$5,'index.html',$6,'html5','iframe','ready') RETURNING id,slug,name,status",[slug,s.game_name,s.category,s.description,s.game_html,s.user_name||'Community creator']);
  createdGame=g.rows[0];
 }
 const q=await db.query("UPDATE game_submissions SET status=$2,owner_response=$3,updated_at=NOW() WHERE id=$1 RETURNING id,game_name,status,owner_response,updated_at",[id,status,response]);
 return res.json({ok:true,submission:q.rows[0],created_game:createdGame});
}