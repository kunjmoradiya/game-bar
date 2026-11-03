import { db } from 'hatchable';
export const access = 'public';
export const methods = ['GET'];
function resolvePath(base,ref){try{const clean=decodeURIComponent(String(ref).split(/[?#]/)[0]);if(!clean||/^(data:|https?:|\/\/|#|blob:|javascript:)/i.test(clean)||clean.startsWith('/'))return null;const parts=(base+clean).split('/'),out=[];for(const p of parts){if(!p||p==='.')continue;if(p==='..')out.pop();else out.push(p);}return out.join('/');}catch{return null;}}
export default async function(req,res){
 const slug=String(req.params.slug||'');
 const {rows}=await db.query("SELECT name,source_code,original_filename,engine_id,build_status FROM games WHERE slug=$1 AND status='published'",[slug]);
 if(!rows.length)return res.status(404).send('Game not found or not published.');
 const game=rows[0];if(game.build_status!=='ready')return res.status(409).send('This game build is not ready.');
 const entry=String(game.original_filename||'index.html'),base=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'';
 const asset='/api/game-assets/'+encodeURIComponent(slug)+'?path=';
 let html=String(game.source_code||'');
 html=html.replace(/\b(src|href|poster|data)\s*=\s*(["'])(.*?)\2/gi,(all,attr,q,ref)=>{const path=resolvePath(base,ref);return path?attr+'='+q+asset+encodeURIComponent(path)+q:all;});
 html=html.replace(/url\(\s*(["']?)([^)'"]+)\1\s*\)/gi,(all,q,ref)=>{const path=resolvePath(base,ref);return path?'url("'+asset+encodeURIComponent(path)+'")':all;});
 const activityProbe="<script>(()=>{const ping=()=>{try{parent.postMessage({type:'gh-game-input'},'*')}catch(e){}};['pointerdown','keydown','touchstart','mousedown'].forEach(k=>addEventListener(k,ping,{passive:true}));})();</script>";
 const bodyEnd=html.toLowerCase().lastIndexOf('</body>');
 if(bodyEnd>=0)html=html.slice(0,bodyEnd)+activityProbe+html.slice(bodyEnd);else html+=activityProbe;
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"sandbox allow-scripts allow-pointer-lock allow-forms allow-presentation; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:; connect-src *; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval' blob: data:");
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Cache-Control','no-store');
 return res.send(html);
}