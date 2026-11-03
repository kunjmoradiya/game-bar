import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','PUT'];
const OWNER_HANDLE='moradiyakunj1';
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Owner access required.'});
 if(req.method==='GET'){const {rows}=await db.query("SELECT id,requester_name,requester_email,mobile_number,city,game_title,game_category,game_link,message,status,created_at,reviewed_at FROM access_requests ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC");return res.json({requests:rows,total:rows.length,pending:rows.filter(x=>x.status==='pending').length});}
 const b=req.body||{},id=String(b.id||''),status=String(b.status||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['approved','rejected','pending'].includes(status))return res.status(400).json({error:'A valid request ID and status are required.'});
 const {rows}=await db.query("UPDATE access_requests SET status=$2,reviewed_at=CASE WHEN $2='pending' THEN NULL ELSE NOW() END WHERE id=$1 RETURNING id,status,reviewed_at",[id,status]);
 if(!rows.length)return res.status(404).json({error:'Request not found.'});
 return res.json({request:rows[0]});
}