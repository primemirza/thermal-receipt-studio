import { deflateRawSync, inflateRawSync } from 'node:zlib';
const MAX_ARCHIVE = 25 * 1024 * 1024, MAX_ENTRIES = 100, MAX_ENTRY = 10 * 1024 * 1024;
const decode = new TextDecoder('utf-8', { fatal: true });
const crc32 = data => { let c=0xffffffff; for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));} return (c^0xffffffff)>>>0; };
const w16=(b,o,v)=>b.writeUInt16LE(v,o), w32=(b,o,v)=>b.writeUInt32LE(v>>>0,o);
function safeName(n){return typeof n==='string'&&n.length>0&&!n.startsWith('/')&&!n.includes('\\')&&!/^[a-z]:/i.test(n)&&n.split('/').every(p=>p&&p!=='.'&&p!=='..');}
export function createZip(entries){
 const names=Object.keys(entries); if(!names.length||names.length>MAX_ENTRIES)throw Error('Jumlah entri arsip tidak valid.');
 const local=[],central=[];let offset=0;
 for(const name of names){if(!safeName(name))throw Error('Nama entri arsip tidak aman.');const data=Buffer.isBuffer(entries[name])?entries[name]:Buffer.from(entries[name]);if(data.length>MAX_ENTRY)throw Error('Ukuran entri terlalu besar.');
 const packed=deflateRawSync(data),nb=Buffer.from(name),crc=crc32(data),lh=Buffer.alloc(30+nb.length);
 w32(lh,0,0x04034b50);w16(lh,4,20);w16(lh,6,0x800);w16(lh,8,8);w32(lh,14,crc);w32(lh,18,packed.length);w32(lh,22,data.length);w16(lh,26,nb.length);nb.copy(lh,30);local.push(lh,packed);
 const ch=Buffer.alloc(46+nb.length);w32(ch,0,0x02014b50);w16(ch,4,20);w16(ch,6,20);w16(ch,8,0x800);w16(ch,10,8);w32(ch,16,crc);w32(ch,20,packed.length);w32(ch,24,data.length);w16(ch,28,nb.length);w32(ch,42,offset);nb.copy(ch,46);central.push(ch);offset+=lh.length+packed.length;}
 const cs=central.reduce((s,b)=>s+b.length,0),end=Buffer.alloc(22);w32(end,0,0x06054b50);w16(end,8,names.length);w16(end,10,names.length);w32(end,12,cs);w32(end,16,offset);
 const out=Buffer.concat([...local,...central,end]);if(out.length>MAX_ARCHIVE)throw Error('Ukuran arsip terlalu besar.');return out;
}
export function readZip(buf){
 if(!Buffer.isBuffer(buf)||buf.length<22||buf.length>MAX_ARCHIVE)throw Error('Ukuran arsip tidak valid.');
 let e=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){e=i;break;}if(e<0)throw Error('Struktur ZIP tidak lengkap.');
 const count=buf.readUInt16LE(e+10),size=buf.readUInt32LE(e+12),start=buf.readUInt32LE(e+16);if(!count||count>MAX_ENTRIES||start+size>e)throw Error('Direktori ZIP tidak valid.');
 const entries=Object.create(null);let p=start;
 for(let i=0;i<count;i++){if(p+46>buf.length||buf.readUInt32LE(p)!==0x02014b50)throw Error('Entri ZIP rusak.');
 const flags=buf.readUInt16LE(p+8),method=buf.readUInt16LE(p+10),crc=buf.readUInt32LE(p+16),packed=buf.readUInt32LE(p+20),raw=buf.readUInt32LE(p+24),nl=buf.readUInt16LE(p+28),el=buf.readUInt16LE(p+30),cl=buf.readUInt16LE(p+32),lo=buf.readUInt32LE(p+42),next=p+46+nl+el+cl;
 if(next>buf.length||(flags&1)||![0,8].includes(method)||raw>MAX_ENTRY)throw Error('Entri ZIP tidak didukung atau terlalu besar.');
 const name=decode.decode(buf.subarray(p+46,p+46+nl));if(!safeName(name)||Object.hasOwn(entries,name))throw Error('Nama entri ZIP tidak aman atau duplikat.');
 if(lo+30>buf.length||buf.readUInt32LE(lo)!==0x04034b50)throw Error('Header lokal ZIP rusak.');
 const ds=lo+30+buf.readUInt16LE(lo+26)+buf.readUInt16LE(lo+28);if(ds+packed>start)throw Error('Rentang data ZIP tidak valid.');
 const data=method===0?Buffer.from(buf.subarray(ds,ds+packed)):inflateRawSync(buf.subarray(ds,ds+packed),{maxOutputLength:MAX_ENTRY});if(data.length!==raw||crc32(data)!==crc)throw Error('Checksum atau ukuran entri ZIP tidak cocok.');
 entries[name]=data;p=next;}
 if(p!==start+size)throw Error('Ukuran direktori ZIP tidak cocok.');return entries;
}
export function serializeTrstudio(doc,now=new Date()){const iso=now.toISOString();const manifest={app:'thermal-receipt-studio',formatVersion:1,createdAt:iso,modifiedAt:iso,document:'document.json',assets:[],preview:null};return createZip({'manifest.json':JSON.stringify(manifest,null,2),'document.json':JSON.stringify(doc,null,2)});}
export function parseTrstudio(buf,validate){const entries=readZip(buf);if(!entries['manifest.json']||!entries['document.json'])throw Error('Arsip tidak memuat manifest.json dan document.json.');
 if(Object.keys(entries).some(n=>!['manifest.json','document.json','preview.png'].includes(n)&&!n.startsWith('assets/images/')))throw Error('Arsip memuat entri yang tidak dikenal.');
 const manifest=JSON.parse(decode.decode(entries['manifest.json']));if(manifest.app!=='thermal-receipt-studio'||manifest.formatVersion!==1||manifest.document!=='document.json'||!Array.isArray(manifest.assets))throw Error('Manifest .trstudio tidak didukung.');
 if(manifest.assets.length||Object.keys(entries).some(n=>n.startsWith('assets/images/')))throw Error('Aset gambar belum didukung pada Fase 4.');
 const document=JSON.parse(decode.decode(entries['document.json']));validate(document);return {document,manifest};}
