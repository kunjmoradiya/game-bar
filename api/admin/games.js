import { db } from 'hatchable';
import { searchGames } from 'lib/game-search.js';
export const access = 'admin';
export const methods = ['GET','POST'];
const OWNER_HANDLE = 'moradiyakunj1';
function ownerOnly(req,res){ if(req.member?.handle !== OWNER_HANDLE){res.status(403).json({error:'Only the primary project owner can manage games.'});return false;} return true; }
function slugify(s){return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);}
export default async function(req,res){
 if(!ownerOnly(req,res)) return;
 if(req.method==='GET'){
  const q=String(req.query?.q||'');
  if(q.trim()){
   try{const result=await searchGames({query:q,admin:true,limit:req.query?.limit,offset:req.query?.offset,status:req.query?.status||''});return res.json(result);}
   catch(e){return res.status(500).json({error:'Admin game search is temporarily unavailable.'});}
  }
  const limit=Math.max(1,Math.min(Number(req.query?.limit)||50,50));
  const offset=Math.max(0,Math.min(Number(req.query?.offset)||0,100000));
  const {rows}=await db.query("SELECT id,slug,name,category,description,status,cover_emoji,original_filename,version_label,developer,aliases,tags,keywords,controls,instructions,engine_id,runtime_id,game_type,build_status,updated_at,(SELECT COUNT(*)::int FROM games) AS total_count FROM games ORDER BY updated_at DESC,id DESC LIMIT $1 OFFSET $2",[limit,offset]);
  const total=rows.length?rows[0].total_count:0;
  for(const g of rows)delete g.total_count;
  const counts=await db.query("SELECT COUNT(*) FILTER (WHERE status='published')::int AS published,COUNT(*) FILTER (WHERE status='draft')::int AS drafts FROM games");
  return res.json({games:rows,total,published:counts.rows[0].published,drafts:counts.rows[0].drafts,offset,pageSize:limit,hasMore:offset+rows.length<total});
 }
 const b=req.body||{};
 const file=(req.files||[]).find(f=>f.field==='gamefile');
 let code=String(b.source_code||'');
 let filename='';
 if(file){
  filename=String(file.filename||'game.html').split(/[\\/]/).pop();
  if(!/\.html?$/i.test(filename)) return res.status(415).json({error:'Upload a standalone .html or .htm game file. ZIP packages are not supported in this version.'});
  const raw=file.buffer ?? file.data;
  let bytes;
  try {
   if(Buffer.isBuffer(raw)) bytes=raw;
   else if(raw instanceof ArrayBuffer) bytes=Buffer.from(raw);
   else if(ArrayBuffer.isView(raw)) bytes=Buffer.from(raw.buffer,raw.byteOffset,raw.byteLength);
   else if(Array.isArray(raw)) bytes=Buffer.from(raw);
   else throw new Error('Unsupported uploaded file data');
  } catch(e) { return res.status(400).json({error:'Could not read the uploaded file bytes. Please choose the HTML file again.'}); }
  if(bytes.length>2*1024*1024) return res.status(413).json({error:'Game HTML must be 2 MB or smaller.'});
  if(bytes.length>=2 && bytes[0]===0xff && bytes[1]===0xfe) code=bytes.subarray(2).toString('utf16le');
  else if(bytes.length>=2 && bytes[0]===0xfe && bytes[1]===0xff) { const swapped=Buffer.from(bytes.subarray(2)); for(let i=0;i+1<swapped.length;i+=2){const t=swapped[i];swapped[i]=swapped[i+1];swapped[i+1]=t;} code=swapped.toString('utf16le'); }
  else code=bytes.toString('utf8');
 }
 if(!code.trim()) return res.status(400).json({error:'Upload an HTML game file or paste the complete HTML source code.'});
 code=code.replace(/^\uFEFF/,'').replace(/\0/g,'').trimStart();
const looksLikeHtml=/<\s*(?:!doctype\s+html|html\b|head\b|body\b|meta\b|script\b|canvas\b|div\b|main\b|section\b|style\b|title\b|!--)/i.test(code);
 if(!looksLikeHtml) return res.status(400).json({error:'GameHub received the file but could not find HTML tags in it. Selected file: '+(filename||'pasted source')+'. Please upload the actual .html/.htm entry file (not a .js, .txt, or source-code archive).'});
 if(code.length>2*1024*1024) return res.status(413).json({error:'Game source must be 2 MB or smaller.'});
 const name=String(b.name||'').trim();
 const slug=slugify(b.slug||name);
 if(!name||!slug) return res.status(400).json({error:'Game name and a valid URL slug are required.'});
 const category=['Puzzle','Arcade','Action','Adventure','Racing','Strategy','Sports','Casual','Educational','Other'].includes(b.category)?b.category:'Other';
 const status=b.status==='draft'?'draft':'published';
 try{
  const {rows}=await db.query("INSERT INTO games(slug,name,category,description,status,cover_emoji,source_code,original_filename,version_label,developer,controls,instructions,aliases,tags,keywords) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id,slug,name,category,status,version_label,updated_at",
  [slug,name,category,String(b.description||''),status,String(b.cover_emoji||'🎮').slice(0,12),code,filename,String(b.version_label||'1.0.0'),String(b.developer||''),String(b.controls||''),String(b.instructions||''),String(b.aliases||''),String(b.tags||''),String(b.keywords||'')]);
  return res.status(201).json({game:rows[0],play_url:'/api/play/'+slug});
 }catch(e){return res.status(400).json({error:e.message.includes('games_slug_key')?'That game URL slug is already in use.':e.message});}
}