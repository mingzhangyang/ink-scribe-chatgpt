import test from 'node:test';
import assert from 'node:assert/strict';
import {ContractError, MAX_TEXT_LENGTH, NOTE_SCHEMA, normalizeNote, validateSticker, validateStructureRequest} from '../public/assets/contracts.js';
import {EXAMPLE, formatOffline} from '../public/assets/offline.js';
import {defaultSettings, planPages} from '../public/assets/renderer.js';
const request = (x = {}) => ({text:'读书笔记：观察和思考',template:'reading-notes',language:'auto',style:'hybrid-cornell',...x});

test('full sample normalizes to contract fields',() => {
  const n=normalizeNote(EXAMPLE);
  assert.equal(n.sections.length,3);assert.equal(n.cues.length,4);
  assert.equal(n.sections[0].highlights.length,3);
  assert.equal(NOTE_SCHEMA.additionalProperties,false);
});
test('malformed structures rejected',() => {
  for(const value of [undefined,null,[],{}, {title:'ok',cues:[],sections:[],summary:'ok'},
    {title:'ok',cues:[],sections:[{content:'hi',highlights:['good',3]}],summary:'ok'}]) {
    assert.throws(() => normalizeNote(value), ContractError);
  }
});
test('nonexistent highlights removed and raw control bytes sanitized',() => {
  const n=normalizeNote({title:' hello\u0001',cues:[],sections:[{content:'safe text\u0007',highlights:['safe','<script>','safe']}],summary:'done'});
  assert.equal(n.title,'hello');assert.equal(n.sections[0].content,'safe text');
  assert.deepEqual(n.sections[0].highlights,['safe']);
});
test('unknown request and text too long are declined',() => {
  assert.equal(validateStructureRequest(request()),null);
  assert.equal(validateStructureRequest(null),'INVALID_BODY');
  assert.equal(validateStructureRequest(request({text:' '})),'TEXT_REQUIRED');
  assert.equal(validateStructureRequest(request({text:'x'.repeat(MAX_TEXT_LENGTH+1)})),'TEXT_TOO_LONG');
  for(const key of ['template','language','style'])assert.equal(validateStructureRequest(request({[key]:'invalid'})),'INVALID_OPTIONS');
});
test('sticker position, pagination and transform bounds are checked',() => {
  const s={id:'s1',type:'star',x:380,y:380,scale:1,page:0,rotation:0};
  assert.equal(validateSticker(s,1),true);
  for(const patch of [{x:-1},{scale:0},{page:-1},{page:1},{rotation:220},{type:'<img onerror=alert(1)>'},{y:Infinity}]) {
    assert.equal(validateSticker({...s,...patch},1),false);
  }
});
test('offline text formatting stays explicitly non-AI and keeps facts',() => {
  const n=formatOffline('标题\n关键事实 123\n下一段保留');
  assert.equal(n.title,'标题');assert.match(n.sections[0].content,/关键事实 123/);
  assert.match(n.summary,/未进行 AI/);
  assert.throws(()=>formatOffline(''),/请先输入/);
});

test('local-only formatting retains the complete source, including long first lines',()=>{
  const first='A'.repeat(90)+'FIRST_LINE_TAIL';
  const input=first+'\n'+('B'.repeat(1900))+'LONG_PARAGRAPH_TAIL';
  const result=normalizeNote(formatOffline(input));
  assert.equal(result.sections.map(s=>s.content).join(''),input);
  assert.equal(result.sections.at(-1).content.endsWith('LONG_PARAGRAPH_TAIL'),true);
  assert.ok(result.sections.every(s=>s.content.length<=1300));
  assert.ok(result.sections.length>=2);
});

test('editor normalization never silently crops longer body, cue, or summary',()=>{
  const body='a'.repeat(1800)+'EDITOR_TAIL';
  const extra='b'.repeat(900)+'SUMMARY_TAIL';
  const note=normalizeNote({title:'hello',cues:[{keyword:'keyword',note:extra}],sections:[{content:body,highlights:[]}],summary:extra});
  assert.equal(note.sections[0].content,body);
  assert.equal(note.summary,extra);
  assert.equal(note.cues[0].note,extra);
  assert.throws(()=>normalizeNote(note,{forAI:true}),ContractError);
});

test('a model cannot silently replace oversized content with truncated data',()=>{
  const note={title:'short',cues:[],sections:[{heading:'',content:'x'.repeat(1601),highlights:[]}],summary:'short'};
  assert.throws(()=>normalizeNote(note,{forAI:true}),/sections\[0\].content/);
});

test('sticker page bounds come from the current document, not a fixed cap',()=>{
  const s={id:'late',type:'star',x:380,y:380,scale:1,page:64,rotation:0};
  assert.equal(validateSticker(s,65),true,'page 65 is valid in a 65-page document');
  assert.equal(validateSticker(s,64),false,'the same page is invalid after the document shrinks');
  assert.equal(validateSticker({...s,page:999},1000),true);
  assert.equal(validateSticker({...s,page:1000},1000),false);
  for(const page of [-1,0.5,NaN,Infinity,'64',Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(validateSticker({...s,page},1000),false);
  }
});

test('sticker validation requires an explicit positive safe-integer page count',()=>{
  const s={id:'first',type:'star',x:380,y:380,scale:1,page:0,rotation:0};
  assert.equal(validateSticker(s,1),true);
  for(const count of [undefined,null,0,-1,1.5,NaN,Infinity,'100',{},Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(validateSticker(s,count),false,'invalid page count: '+String(count));
  }
});

test('full local documents support stickers on later and final pages in every layout',()=>{
  const source='\u89c2\u5bdf\u8bb0\u5f55\u3002\n'.repeat(4000);
  const note=normalizeNote(formatOffline(source));
  assert.equal([...source].length,24000);
  assert.equal(note.sections.map(s=>s.content).join(''),source,'keep all authored text');
  const ctx={font:'',measureText:s=>({width:[...String(s)].length*11})};
  const sticker={id:'long-note',type:'sticky-note',x:380,y:380,scale:1,page:0,rotation:0};
  for(const layout of ['hybrid-cornell','classic-cornell','free-journal','minimal']) {
    const count=planPages(ctx,note,{...defaultSettings(),layout}).pages.length;
    assert.ok(count>64,layout+': fixture must exceed the old cap');
    for(const page of [0,63,64,count-1])assert.equal(validateSticker({...sticker,page},count),true);
    assert.equal(validateSticker({...sticker,page:count},count),false);
  }
});
