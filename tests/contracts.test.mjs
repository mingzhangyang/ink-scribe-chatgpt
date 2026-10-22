import test from 'node:test';
import assert from 'node:assert/strict';
import {ContractError, MAX_TEXT_LENGTH, NOTE_SCHEMA, normalizeNote, validateSticker, validateStructureRequest} from '../public/assets/contracts.js';
import {EXAMPLE, formatOffline} from '../public/assets/offline.js';
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
  assert.equal(validateSticker(s),true);
  for(const patch of [{x:-1},{scale:0},{page:-1},{page:64},{rotation:220},{type:'<img onerror=alert(1)>'},{y:Infinity}]) {
    assert.equal(validateSticker({...s,...patch}),false);
  }
});
test('offline text formatting stays explicitly non-AI and keeps facts',() => {
  const n=formatOffline('标题\n关键事实 123\n下一段保留');
  assert.equal(n.title,'标题');assert.match(n.sections[0].content,/关键事实 123/);
  assert.match(n.summary,/未进行 AI/);
  assert.throws(()=>formatOffline(''),/请先输入/);
});
