import { db, storage } from 'hatchable';
import crypto from 'node:crypto';
export const access='admin';
export const methods=['GET','POST'];
const OWNER_HANDLE='moradiyakunj1';
const MIME={html:'text/html',htm:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',json:'application/json',wasm:'application/wasm',pck:'application/octet-stream',data:'application/octet-stream',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',ico:'image/x-icon',txt:'text/plain',xml:'application/xml',bin:'application/octet-stream'};
function safePath(s){const p=String(s||'').replace(/\\/g,'/').replace(/^\/+/, '');if(!p||p.split('/').some(x=>!x||x==='.'||x==='..')||p.length>500||/[\x00-\x1f]/.test(p))return null;return p;}
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Owner access required.'});
 const id=String(req.params.id||'');
 const game=(await db.query("SELECT id FROM games WHERE id=$1",[id])).rows[0];if(!game)return res.status(404).json({error:'Game not found.'});
 if(req.method==='POST'){
  const f=(req.files||[]).find(x=>x.field==='asset'),path=safePath(req.body?.path);
  if(!f||!path)return res.status(400).json({error:'Asset file and safe relative path are required.'});
  if(!f.buffer||f.buffer.length>12*1024*1024)return res.status(413).json({error:'Each asset must be 12 MB or smaller.'});
  const ext=path.split('.').pop().toLowerCase(),type=MIME[ext]||'application/octet-stream';
  const key='gamehub/'+id+'/'+crypto.randomUUID()+'/'+path;
  await storage.put(key,f.buffer,type);
  await db.query("INSERT INTO game_assets(game_id,asset_path,storage_key,content_type,byte_size) VALUES($1,$2,$3,$4,$5) ON CONFLICT(game_id,asset_path) DO UPDATE SET storage_key=EXCLUDED.storage_key,content_type=EXCLUDED.content_type,byte_size=EXCLUDED.byte_size",[id,path,key,type,f.buffer.length]);
  return res.status(201).json({ok:true,path,bytes:f.buffer.length});
 }
 const path=safePath(req.query?.path);if(!path)return res.status(400).json({error:'A valid asset path is required.'});
 const row=(await db.query("SELECT storage_key FROM game_assets WHERE game_id=$1 AND asset_path=$2",[id,path])).rows[0];
 if(!row)return res.status(404).json({error:'Asset not found: '+path});
 return res.redirect(302,await storage.url(row.storage_key));
}