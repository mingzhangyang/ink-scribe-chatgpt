import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE,wrapText,planPages,hitSticker,defaultSettings} from '../public/assets/renderer.js';
import {EXAMPLE} from '../public/assets/offline.js';
const ctx = {font:'', measureText(s) {return {width:[...s].reduce((a,ch)=>a+(ch.codePointAt(0)>255?23:11),0)};}};

test('wrapText preserves Chinese and emoji and hard wraps long tokens',()=>{
  const lines=wrapText(ctx,'天气很好🍊我们出发',72,'23px sans');
  assert.equal(lines.join(''),'天气很好🍊我们出发');assert.ok(lines.length>1);
  const spaced=wrapText(ctx,'First paragraph\nSecond paragraph',150,'22px sans');
  assert.equal(spaced.join(' ').includes('Second'),true);
});
test('plan does not omit body lines and makes additional pages for long text',()=>{
  const text='关于生态学的长期观察与记录。'.repeat(190);
  const note={...EXAMPLE,cues:[],sections:[{heading:'连续记录',content:text,highlights:[]}],summary:'事实回顾'};
  const plan=planPages(ctx,note,defaultSettings());
  const drawn=plan.pages.flatMap(p=>p.placements.filter(e=>e.kind==='body').map(e=>e.text)).join('');
  assert.equal(drawn,text);assert.ok(plan.pages.length>2);
  for(const page of plan.pages){
    assert.ok(page.placements.every(p=>p.y>=PAGE.top && p.y<=PAGE.bottom));
  }
});
test('summary lines spill into continuation pages rather than truncation',()=>{
  const settings=defaultSettings();
  const summary='这一段总结需要保留每一处内容和每一个细节。'.repeat(45);
  const note={...EXAMPLE,cues:[],sections:[{heading:'题',content:'一点内容',highlights:[]}],summary};
  const plan=planPages(ctx,note,settings);
  const sum=plan.pages.flatMap(p=>p.placements.filter(x=>x.kind==='summary').flatMap(x=>x.lines)).join('');
  assert.equal(sum,summary);assert.ok(plan.pages.some(p=>p.placements.some(e=>e.continued)));
});
test('many long cue descriptions paginate without skipping entries',()=>{
  const note={...EXAMPLE,cues:Array.from({length:12},(_,i)=>({keyword:`知识 ${i}`,note:'每天需要反复记录，解释关键点。'.repeat(8)})),sections:[{heading:'说明',content:'笔记内容',highlights:[]}],summary:'总结'};
  const plan=planPages(ctx,note,defaultSettings());
  assert.equal(plan.cuePages.flat().length,12);assert.ok(plan.cuePages.length>1);
  assert.ok(plan.pages.length>=plan.cuePages.length);
});
test('sticker hit test honors page, scale, rotation and stacking',()=>{
  const items=[{id:'one',type:'star',x:100,y:100,page:0,rotation:0,scale:1},
    {id:'top',type:'paperclip',x:110,y:100,page:0,rotation:45,scale:1},
    {id:'elsewhere',type:'star',x:300,y:400,page:1,rotation:0,scale:1}];
  assert.equal(hitSticker(items,0,110,100),'top');assert.equal(hitSticker(items,1,300,400),'elsewhere');
  assert.equal(hitSticker(items,0,700,800),null);
});
