import test from 'node:test';
import assert from 'node:assert/strict';
import {buildZip,safeName} from '../public/assets/export.js';
const utf8=new TextDecoder();
test('filename sanitizes path escapes and invalid chars',()=>{
  assert.equal(safeName('../title:a*?'), '..-title-a--');
  assert.equal(safeName(''), 'inkscribe');
  assert.ok(safeName('x'.repeat(100)).length<=70);
});
test('ZIP central directory and file entries match bytes',async()=>{
  const items=[{name:'笔记-01.png',bytes:new Uint8Array([137,80,78,71])},{name:'note-02.jpg',bytes:new Uint8Array([255,216,255,217])}];
  const buffer=await buildZip(items).arrayBuffer();const view=new DataView(buffer);const bytes=new Uint8Array(buffer);
  let offset=0;
  for(const item of items){
    assert.equal(view.getUint32(offset,true),0x04034b50);
    assert.equal(view.getUint32(offset+18,true),item.bytes.length);
    const len=view.getUint16(offset+26,true);
    assert.equal(utf8.decode(bytes.slice(offset+30,offset+30+len)),item.name);
    assert.deepEqual(bytes.slice(offset+30+len,offset+30+len+item.bytes.length),item.bytes);
    offset+=30+len+item.bytes.length;
  }
  assert.equal(view.getUint32(buffer.byteLength-22,true),0x06054b50);
  assert.equal(view.getUint16(buffer.byteLength-22+10,true),2);
});
