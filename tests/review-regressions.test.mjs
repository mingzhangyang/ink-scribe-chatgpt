import test from 'node:test';
import assert from 'node:assert/strict';
import {fitTitle} from '../public/assets/renderer.js';
import {ContractError, MAX_TEXT_LENGTH, normalizeNote, validateStructureRequest} from '../public/assets/contracts.js';
import {EXAMPLE, formatOffline} from '../public/assets/offline.js';
import {handleRequest} from '../worker/router.js';

const request = text => ({text,template:'reading-notes',language:'auto',style:'hybrid-cornell'});
const req = () => new Request('https://inkscribe.test/api/structure', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request('叶子把光能变为化学能。'))});
const env = AI => ({AI,STRUCTURE_LIMITER:{async limit(){return {success:true};}}});

test('long Unicode titles are fitted with logarithmic measurements and never truncate source',()=>{
  const title='🪶'.repeat(15000)+'TITLE_END';
  let calls=0,maxMeasured=0;
  const countingCtx={font:'',measureText(s){calls++;maxMeasured=Math.max(maxMeasured,[...s].length);return {width:[...s].length*10};}};
  const displayed=fitTitle(countingCtx,title,'bold 46px serif',680);
  assert.equal(displayed,'🪶'.repeat(67)+'…');
  assert.equal([...displayed].length,68);
  assert.ok(calls<=20,`title fitting should be logarithmic, got ${calls} measurements`);
  assert.ok(maxMeasured<=256,`must not measure the entire ${[...title].length}-code-point title: ${maxMeasured}`);
  assert.equal(title.endsWith('TITLE_END'),true,'source title is unchanged');
  for(const codepoint of displayed){
    const n=codepoint.codePointAt(0);
    assert.ok(n<0xD800||n>0xDFFF,'title has an orphaned surrogate');
  }
  calls=0;
  assert.equal(fitTitle(countingCtx,'短标题','bold 46px serif',680),'短标题');
  assert.equal(calls,1,'already fitting titles should take one measurement');
  assert.equal(fitTitle(countingCtx,'i'.repeat(300),'bold 46px serif',4000),'i'.repeat(300));
});

test('AI JSON Schema limits use Unicode code points, including astral CJK and emoji',()=>{
  const u='𠀀', emoji='🧪';
  const note={
    title:emoji.repeat(110),date:u.repeat(40),doodlePrompt:emoji.repeat(180),
    cues:[{keyword:u.repeat(45),note:emoji.repeat(200)}],
    sections:[{heading:emoji.repeat(90),content:u.repeat(1600),highlights:[u.repeat(70)]}],
    summary:emoji.repeat(700)
  };
  const result=normalizeNote(note,{forAI:true});
  assert.equal([...result.sections[0].content].length,1600);
  assert.equal([...result.summary].length,700);
  for(const [path,one] of [
    [['title'],emoji],[['date'],u],[['doodlePrompt'],emoji],
    [['cues',0,'keyword'],u],[['cues',0,'note'],emoji],
    [['sections',0,'heading'],emoji],[['sections',0,'content'],u],
    [['sections',0,'highlights',0],u],[['summary'],emoji]
  ]){
    const tooLong=structuredClone(note);
    let cursor=tooLong;
    for(const key of path.slice(0,-1))cursor=cursor[key];
    cursor[path.at(-1)]+=one;
    assert.throws(()=>normalizeNote(tooLong,{forAI:true}),ContractError,`should reject oversized ${path.join('.')}`);
  }
  assert.equal(validateStructureRequest(request(emoji.repeat(MAX_TEXT_LENGTH))),null);
  assert.equal(validateStructureRequest(request(emoji.repeat(MAX_TEXT_LENGTH+1))),'TEXT_TOO_LONG');
});

test('offline formatting merges pure-whitespace boundaries without losing any input',()=>{
  const cases=[
    'A'.repeat(1300)+'\n',
    '\n'.repeat(1300)+'A',
    '\n'.repeat(2600)+'A'+'\n'.repeat(1400),
    'A'.repeat(1300)+'\n'.repeat(1300)+'B',
    'A'.repeat(1298)+'\n'.repeat(5)+'B',
    'A'.repeat(1300)+'\n'+'B',
    '\t'.repeat(1500)+'汉🪶',
    '汉🪶'.repeat(1200)+'\n'
  ];
  for(const text of cases){
    const note=normalizeNote(formatOffline(text));
    assert.equal(note.sections.map(s=>s.content).join(''),text,`lost content: ${text.length} UTF-16 units`);
    assert.ok(note.sections.every(s=>s.content.trim()),'must not emit whitespace-only sections');
  }
});

test('supplementary Unicode accepted through Worker JSON endpoint without a retry',async()=>{
  const valid={...EXAMPLE,sections:[{heading:'🧪'.repeat(90),content:'𠀀'.repeat(1600),highlights:[]}],summary:'实验总结'};
  let calls=0;
  const response=await handleRequest(req(),env({run:async()=>{calls++;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(valid)}}]};}}));
  assert.equal(response.status,200);
  assert.equal(calls,1,'a schema-valid model reply must not be retried');
  const json=await response.json();
  assert.equal([...json.structure.sections[0].content].length,1600);
  assert.equal(json.structure.sections[0].content,valid.sections[0].content);
});
