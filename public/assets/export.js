import {PAGE,paintPage} from './renderer.js';
// Snapshot plain data before awaiting fonts or image encoding.
export const snapshotDocument=(plan,note,settings)=>JSON.parse(JSON.stringify({plan,note,settings}));
const toBlob=(canvas,mime,quality=.93)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('浏览器无法生成图片')),mime,quality));
const ascii=(s)=>new TextEncoder().encode(s);
const u16=(view,pos,n)=>view.setUint16(pos,n,true);
const u32=(view,pos,n)=>view.setUint32(pos,n>>>0,true);
function crc32(data){let crc=-1;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^(-1))>>>0;}
/** Store-method ZIP avoids external JSZip and safely exports all pages in one user download. */
export function buildZip(items){
  const local=[],directory=[];let offset=0;
  for(const item of items){
    const name=ascii(item.name),data=item.bytes,crc=crc32(data);
    const head=new Uint8Array(30+name.length),hv=new DataView(head.buffer);
    u32(hv,0,0x04034b50);u16(hv,4,20);u16(hv,6,0x0800);u16(hv,8,0);u32(hv,14,crc);
    u32(hv,18,data.length);u32(hv,22,data.length);u16(hv,26,name.length);head.set(name,30);
    local.push(head,data);
    const dir=new Uint8Array(46+name.length),dv=new DataView(dir.buffer);
    u32(dv,0,0x02014b50);u16(dv,4,20);u16(dv,6,20);u16(dv,8,0x0800);u16(dv,10,0);
    u32(dv,16,crc);u32(dv,20,data.length);u32(dv,24,data.length);u16(dv,28,name.length);u32(dv,42,offset);dir.set(name,46);
    directory.push(dir);offset+=head.length+data.length;
  }
  const centralSize=directory.reduce((s,b)=>s+b.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  u32(ev,0,0x06054b50);u16(ev,8,items.length);u16(ev,10,items.length);u32(ev,12,centralSize);u32(ev,16,offset);
  return new Blob([...local,...directory,end],{type:'application/zip'});
}
export function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);
}
export function safeName(s){return (s||'inkscribe').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,70)||'inkscribe';}
async function renderImage(plan,note,settings,page,scale,mime){
  const canvas=document.createElement('canvas');paintPage(canvas,plan,note,settings,page,{scale});
  return toBlob(canvas,mime);
}
export async function exportPages(plan,note,settings,format='png',scale=2){
  if(!['png','jpeg'].includes(format)||![1,2,3].includes(scale))throw new Error('不支持的图片格式或清晰度');
  if(plan.pages.length>12 && scale===3)throw new Error('页数较多，请选择 1x 或 2x 导出，避免内存不足。');
  ({plan,note,settings}=snapshotDocument(plan,note,settings));
  await document.fonts?.ready;
  const mime=format==='png'?'image/png':'image/jpeg';const ext=format==='png'?'png':'jpg';const name=safeName(note.title);
  if(plan.pages.length===1){const blob=await renderImage(plan,note,settings,0,scale,mime);downloadBlob(blob,`${name}.${ext}`);return 1;}
  const items=[];
  for(let i=0;i<plan.pages.length;i++){
    const blob=await renderImage(plan,note,settings,i,scale,mime);
    items.push({name:`${name}-${String(i+1).padStart(2,'0')}.${ext}`,bytes:new Uint8Array(await blob.arrayBuffer())});
  }
  downloadBlob(buildZip(items),`${name}-${plan.pages.length}页.zip`);return plan.pages.length;
}
export async function copyPage(plan,note,settings,page=0){
  if(!navigator.clipboard?.write || typeof ClipboardItem==='undefined'||!window.isSecureContext){
    throw new Error('当前浏览器不支持复制图片，请使用下载按钮。');
  }
  ({plan,note,settings}=snapshotDocument(plan,note,settings));
  await document.fonts?.ready;
  const blob=await renderImage(plan,note,settings,page,2,'image/png');
  await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
}
