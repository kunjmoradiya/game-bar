import { db } from 'hatchable';
export const access='admin';
export const methods=['GET'];
const OWNER_HANDLE='moradiyakunj1';
function resolvePath(base,ref){try{const clean=decodeURIComponent(String(ref).split(/[?#]/)[0]);if(!clean||/^(data:|https?:|\/\/|#|blob:|javascript:)/i.test(clean)||clean.startsWith('/'))return null;const parts=(base+clean).split('/'),out=[];for(const p of parts){if(!p||p==='.')continue;if(p==='..')out.pop();else out.push(p);}return out.join('/');}catch{return null;}}
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).send('Owner access required.');
 const id=String(req.params.id||'');
 const row=(await db.query("SELECT source_code,original_filename,name,build_status FROM games WHERE id=$1",[id])).rows[0];
 if(!row)return res.status(404).send('Game not found.');
 if(row.build_status!=='ready')return res.status(409).send('This project needs a browser build before preview.');
 const entry=String(row.original_filename||'index.html'),base=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'';
 const asset='/api/admin/games/'+id+'/assets?path=';
 let html=String(row.source_code||'');
 html=html.replace(/\b(src|href|poster|data)\s*=\s*(["'])(.*?)\2/gi,(all,attr,q,ref)=>{const path=resolvePath(base,ref);return path?attr+'='+q+asset+encodeURIComponent(path)+q:all;});
 html=html.replace(/url\(\s*(["']?)([^)'"]+)\1\s*\)/gi,(all,q,ref)=>{const path=resolvePath(base,ref);return path?'url("'+asset+encodeURIComponent(path)+'")':all;});
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"sandbox allow-scripts allow-forms allow-pointer-lock allow-presentation; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:; connect-src *; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval' blob: data:");
 return res.send(html);
}