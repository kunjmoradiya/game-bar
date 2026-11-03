import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET'];
const OWNER_HANDLE = 'moradiyakunj1';
const enc = new TextEncoder();
function u16(n){return [n&255,(n>>>8)&255];}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function cat(parts){let size=0;for(const p of parts)size+=p.length;const out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(files){const local=[],central=[];let offset=0;const date=0x5a63,time=0;for(const f of files){const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);const lh=cat([new Uint8Array([0x50,0x4b,0x03,0x04,...u16(20),...u16(0),...u16(0),...u16(time),...u16(date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]),name,data]);local.push(lh);const ch=cat([new Uint8Array([0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0),...u16(0),...u16(time),...u16(date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name]);central.push(ch);offset+=lh.length;}const cdir=cat(central);const end=new Uint8Array([0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cdir.length),...u32(offset),...u16(0)]);return cat([...local,cdir,end]);}
export default async function(req,res){
 if(req.member?.handle!==OWNER_HANDLE)return res.status(403).json({error:'Only the primary project owner can export source code.'});
 const {rows}=await db.query("SELECT slug,name,category,description,status,version_label,developer,controls,instructions,source_code,original_filename,updated_at FROM games ORDER BY slug");
 const files=[{name:'README.txt',data:'GameHub source export'+String.fromCharCode(10)+'Each folder contains the latest uploaded standalone HTML game source. Open index.html in a browser or host the folder on a static web host.'}];
 const manifest=[];
 for(const g of rows){const base='games/'+g.slug+'/';files.push({name:base+'index.html',data:g.source_code||''});const meta={name:g.name,slug:g.slug,category:g.category,description:g.description,status:g.status,version:g.version_label,developer:g.developer,controls:g.controls,instructions:g.instructions,original_filename:g.original_filename,updated_at:g.updated_at};files.push({name:base+'game.json',data:JSON.stringify(meta,null,2)});manifest.push(meta);}
 files.push({name:'manifest.json',data:JSON.stringify({exported_at:new Date().toISOString(),game_count:rows.length,games:manifest},null,2)});
 const bytes=zip(files);res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition','attachment; filename="gamehub-source-export.zip"');res.setHeader('Cache-Control','no-store');return res.send(bytes);
}