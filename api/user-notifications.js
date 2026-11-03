import { db, auth } from 'hatchable';
export const access='user';
export const methods=['PUT'];
export default async function(req,res){const u=(await auth.getUser(req))||req.user;const id=String((req.body||{}).id||'');if(id){await db.query("UPDATE user_notifications SET is_read=true WHERE id=$1 AND user_id=$2",[id,u.id]);}else{await db.query("UPDATE user_notifications SET is_read=true WHERE user_id=$1",[req.user.id]);}return res.json({ok:true});}