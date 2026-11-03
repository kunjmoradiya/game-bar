import { db } from 'hatchable';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 if(req.method==='GET'){
  const identifier=String(req.query?.identifier||'').trim();
  if(!identifier||identifier.length>180)return res.status(400).json({error:'Enter your mobile number, email address, or request reference ID.'});
  let rows=[];
  if(/^[0-9a-f-]{36}$/i.test(identifier)){
   ({rows}=await db.query("SELECT id,game_title,status,reviewed_at FROM access_requests WHERE id=$1 LIMIT 1",[identifier]));
  }else if(identifier.includes('@')){
   ({rows}=await db.query("SELECT id,game_title,status,reviewed_at FROM access_requests WHERE LOWER(requester_email)=$1 ORDER BY created_at DESC LIMIT 1",[identifier.toLowerCase()]));
  }else{
   const digits=identifier.replace(/\\D/g,'');
   if(digits.length<7||digits.length>15)return res.status(400).json({error:'Enter a valid mobile number, email address, or reference ID.'});
   ({rows}=await db.query("SELECT id,game_title,status,reviewed_at FROM access_requests WHERE regexp_replace(mobile_number,'\\\\D','','g')=$1 ORDER BY created_at DESC LIMIT 1",[digits]));
  }
  if(!rows.length)return res.status(404).json({error:'No request found for that detail. Please check and try again.'});
  return res.json({request:rows[0]});
 }
 const b=req.body||{};
 const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),mobile=String(b.mobile_number||'').trim(),city=String(b.city||'').trim(),game=String(b.game_title||'').trim(),category=String(b.game_category||'').trim(),link=String(b.game_link||'').trim(),message=String(b.message||'').trim();
 if(name.length<2||name.length>100)return res.status(400).json({error:'Enter your full name (2–100 characters).'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180)return res.status(400).json({error:'Enter a valid email address.'});
 if(!/^[+0-9()\s.-]{7,20}$/.test(mobile))return res.status(400).json({error:'Enter a valid mobile number.'});
 if(city.length<2||city.length>100)return res.status(400).json({error:'Enter your city.'});
 if(!game||game.length>140)return res.status(400).json({error:'Enter your game title.'});
 const categories=['Puzzle','Arcade','Action','Adventure','Racing','Strategy','Sports','Casual','Educational','Other'];
 if(!categories.includes(category))return res.status(400).json({error:'Select a valid game category.'});
 if(link&&(link.length>500||!/^https?:\/\//i.test(link)))return res.status(400).json({error:'Enter a valid http or https game link.'});
 if(message.length<10||message.length>1500)return res.status(400).json({error:'Describe your game in 10–1,500 characters.'});
 const {rows}=await db.query("INSERT INTO access_requests(requester_name,requester_email,mobile_number,city,game_title,game_category,game_link,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,created_at",[name,email,mobile,city,game,category,link,message]);
 return res.status(201).json({ok:true,request:rows[0],message:'Your game submission access request has been sent to the GameHost owner.'});
}