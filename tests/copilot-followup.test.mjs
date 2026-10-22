import test from 'node:test';
import assert from 'node:assert/strict';
import {ContractError, normalizeNote} from '../public/assets/contracts.js';
import {EXAMPLE} from '../public/assets/offline.js';
import {PAGE, defaultSettings, planPages} from '../public/assets/renderer.js';
import {handleRequest} from '../worker/router.js';

const clone = value => structuredClone(value);
const valid = () => clone(EXAMPLE);
const setField = (obj,path,value) => {
  let cursor=obj;
  for(const segment of path.slice(0,-1)) cursor=cursor[segment];
  cursor[path.at(-1)]=value;
  return obj;
};

// Validate raw AI JSON before cleaning; otherwise malformed values may disappear.
test('AI validation rejects raw type mismatches and pre-cleaning oversized fields',()=>{
  const malformed = [
    [['date'],20261021],
    [['doodlePrompt'],{text:'draw something'}],
    [['sections',0,'heading'],{text:'Lost heading fact'}],
    [['cues',0,'note'],42],
    [['title'],' '.repeat(110)+'T'],
    [['date'],' '.repeat(40)+'D'],
    [['sections',0,'heading'],' '.repeat(90)+'H'],
    [['cues',0,'keyword'],' '.repeat(45)+'K'],
    [['cues',0,'note'],' '.repeat(200)+'N'],
    [['sections',0,'highlights',0],' '.repeat(70)+'X'],
    [['doodlePrompt'],' '.repeat(180)+'X'],
    [['unexpected'], 'unrecognized field'],
    [['sections',0,'unknown'], 'unrecognized field']
  ];
  for(const [path,value] of malformed){
    const note=setField(valid(),path,value);
    assert.throws(() => normalizeNote(note,{forAI:true}),ContractError,'AI field '+path.join('.')+' should be rejected');
  }
});

test('AI accepts genuinely valid optional omissions and Unicode code-point limits',()=>{
  const bare={title:'ok',cues:[{keyword:'key',note:''}],sections:[{content:'body',highlights:[]}],summary:'done'};
  const result=normalizeNote(bare,{forAI:true});
  assert.equal(result.date,'');
  assert.equal(result.sections[0].heading,'');
  assert.equal(result.doodlePrompt,'');
  const unicode={...bare,title:'\u{1F4DD}'.repeat(110),sections:[{content:'\u{20000}'.repeat(1600),highlights:[]}]};
  assert.equal([...normalizeNote(unicode,{forAI:true}).sections[0].content].length,1600);
});

test('local edits remain permissive, independent of strict AI validation',()=>{
  const local={...valid(),title:' '.repeat(120)+'Note',date:20261021,sections:[{heading:{text:'draft'},content:'text',highlights:[]}]};
  const result=normalizeNote(local);
  assert.equal(result.title,'Note');
  assert.equal(result.date,'');
  assert.equal(result.sections[0].heading,'');
});

test('invalid raw model fields are retried but never published',async()=>{
  let calls=0;
  const modelResult={...valid(),sections:[{heading:{text:'fact lost'},content:'valid body',highlights:[]}]};
  const url='https://inkscribe.test/api/structure';
  const request=new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'example',template:'reading-notes',language:'auto',style:'hybrid-cornell'})});
  const response=await handleRequest(request,{AI:{run:async()=>{calls++;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(modelResult)}}]};}},STRUCTURE_LIMITER:{limit:async()=>({success:true})}});
  assert.equal(response.status,502);
  assert.equal((await response.json()).error.code,'AI_OUTPUT_INVALID');
  assert.equal(calls,2);
});

test('long first heading starts on first page without blanks or lost text',()=>{
  const ctx={font:'',measureText(v){return {width:[...String(v)].reduce((n,ch)=>n+(ch.codePointAt(0)>255?23:11),0)};}};
  const heading='\u957f\u6807\u9898'.repeat(850);
  const note={...valid(),cues:[],sections:[{heading,content:'BODY_PRESENT',highlights:[]}],summary:'SUMMARY_PRESENT'};
  for(const layout of ['free-journal','minimal','hybrid-cornell','classic-cornell']){
    const settings={...defaultSettings(),layout};
    const plan=planPages(ctx,note,settings);
    assert.ok(plan.pages.length>1,layout+' should paginate oversized first heading');
    assert.ok(plan.pages[0].placements.some(p=>p.kind==='heading'),layout+' first page must contain heading text');
    assert.ok(plan.pages.every(p=>p.placements.some(x=>x.kind==='heading'||x.kind==='body'||x.kind==='summary')),layout+' has a blank content page');
    const headings=plan.pages.flatMap(p=>p.placements.filter(x=>x.kind==='heading').map(x=>x.text)).join('');
    assert.equal(headings,heading,layout+' lost heading characters');
    const body=plan.pages.flatMap(p=>p.placements.filter(x=>x.kind==='body').map(x=>x.text)).join('');
    assert.equal(body,'BODY_PRESENT');
    for(const page of plan.pages){
      assert.ok(page.placements.every(p=>p.y<=PAGE.bottom),layout+' has content outside page');
    }
  }
});
