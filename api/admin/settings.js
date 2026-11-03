import { db } from 'hatchable';
export const access='admin';
export const methods=['GET','PUT'];
const OWNER_HANDLE='moradiyakunj1';
const defaults={hub_name:'GameHost',tagline:'Play More. Explore More.',default_status:'draft',maintenance_mode:false};
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Owner access required.'});
 if(req.method==='GET'){const {rows}=await db.query("SELECT setting_value FROM hub_settings WHERE setting_key='main'");return res.json({settings:{...defaults,...(rows[0]?.setting_value||{})}});}
 const b=req.body||{},settings={hub_name:String(b.hub_name||defaults.hub_name).trim().slice(0,60),tagline:String(b.tagline||defaults.tagline).trim().slice(0,120),default_status:b.default_status==='published'?'published':'draft',maintenance_mode:b.maintenance_mode===true};
 await db.query("INSERT INTO hub_settings(setting_key,setting_value,updated_at) VALUES('main',$1::jsonb,NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",[JSON.stringify(settings)]);
 return res.json({ok:true,settings});
}