import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['POST'];
const OWNER_HANDLE='moradiyakunj1';
function slugify(s){return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);}
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Only the primary project owner can import games.'});
 const b=req.body||{}, f=(req.files||[]).find(x=>x.field==='entry');
 if(!f)return res.status(400).json({error:'Missing browser entry HTML file.'});
 const filename=String(f.filename||'index.html').split(/[\\/]/).pop();
 if(!/\.html?$/i.test(filename))return res.status(415).json({error:'The selected entry point must be an HTML file.'});
 if(!f.buffer||f.buffer.length>5*1024*1024)return res.status(413).json({error:'Entry HTML must be under 5 MB.'});
 let html=f.buffer.toString('utf8').replace(/^\uFEFF/,'').replace(/\0/g,'');
 if(!/<\s*(?:!doctype\s+html|html\b|head\b|body\b|script\b|canvas\b|div\b)/i.test(html))return res.status(400).json({error:'The selected entry file does not contain recognizable HTML.'});
 const name=String(b.name||'').trim(),slug=slugify(b.slug||name);
 if(!name||!slug)return res.status(400).json({error:'Game name and URL slug are required.'});
 const category=['Puzzle','Arcade','Action','Adventure','Racing','Strategy','Sports','Casual','Educational','Other'].includes(b.category)?b.category:'Other';
 const engine=String(b.engine_id||'html5').slice(0,40),runtime=String(b.runtime_id||'iframe').slice(0,40);
 const report={detected_engine:engine,entry_file:String(b.entry_path||filename).slice(0,500),checks:{html_entry:true,entry_size:true,engine_detected:true},notes:String(b.report_notes||'').slice(0,3000)};
 try{
 const q=await db.query("INSERT INTO games(slug,name,category,description,status,cover_emoji,source_code,original_filename,version_label,developer,controls,instructions,engine_id,runtime_id,build_status,build_report) VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,'ready',$14::jsonb) RETURNING id,slug,name,engine_id,runtime_id,build_status,status",
 [slug,name,category,String(b.description||''),String(b.cover_emoji||'🎮').slice(0,12),html,String(b.entry_path||filename).slice(0,500),String(b.version_label||'1.0.0'),String(b.developer||''),String(b.controls||''),String(b.instructions||''),engine,runtime,JSON.stringify(report)]);
 return res.status(201).json({game:q.rows[0],asset_upload_url:'/api/admin/games/'+q.rows[0].id+'/assets',preview_url:'/api/admin/games/'+q.rows[0].id+'/preview'});
 }catch(e){return res.status(400).json({error:e.message.includes('games_slug_key')?'That game URL slug is already in use.':e.message});}
}