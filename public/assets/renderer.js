/** Canvas is the single drawing engine for the preview and exported images. */
export const PAGE = Object.freeze({ width: 820, height: 1160, top: 210, bottom: 1040 });
export const PAPERS = {
  ivory: {label:'象牙白',bg:'#fdfbf5',line:'#d6ccbd'},
  ruled: {label:'横线纸',bg:'#fffdf6',line:'#a9c8d0'},
  grid: {label:'方格纸',bg:'#f9f8f1',line:'#c5d6cd'},
  dots: {label:'点阵纸',bg:'#f9f6ed',line:'#b6b5a8'},
  kraft: {label:'牛皮纸',bg:'#dfc8a4',line:'#a98c63'},
  parchment: {label:'复古羊皮纸',bg:'#f0dfbd',line:'#ceb48b'}
};
export const INKS = {black:'#28251f',blue:'#334a71',brown:'#654934',green:'#3f6056',wine:'#784653'};
export const HIGHLIGHTS = ['#f5dda0','#d5e4b7','#e9c2b8'];
export const FONT_STACKS = {
  graceful:'"Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC",serif',
  journal:'"Segoe Print","Comic Sans MS","Kaiti SC","STKaiti",cursive',
  classic:'"Palatino Linotype","Songti SC","Noto Serif CJK SC",serif'
};

const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const rnd=n=>{let x=Math.sin(n*78.233+81.73)*43758.5453;return x-Math.floor(x);};
const density = settings => (settings.fontSize||25)*(settings.lineHeight||1.65);
const bodyStyle = settings => `${settings.fontSize||25}px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`;
const titleStyle = settings => `bold 46px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`;
const measure=(ctx,string,font)=>{ctx.font=font;return ctx.measureText(string).width;};

/** Fit only the painted heading; the editor retains the full original title.
 * Exponential bracketing + binary search avoids measuring arbitrarily long
 * strings when the visible heading can only hold a short prefix.
 */
export function fitTitle(ctx,title,font,maxWidth){
  const full=String(title);
  if(full.length<=128 && measure(ctx,full,font)<=maxWidth)return full;
  const chars=Array.from(full); // Never cut UTF-16 surrogate pairs in half.
  const fits=count=>measure(ctx,chars.slice(0,count).join('')+'…',font)<=maxWidth;
  let low=0,high=1;
  while(high<chars.length && fits(high)){
    low=high;
    high=Math.min(high*2,chars.length);
  }
  // A long but unusually narrow title could still fit in full.
  if(high===chars.length && measure(ctx,full,font)<=maxWidth)return full;
  while(low<high){
    const mid=Math.ceil((low+high)/2);
    if(fits(mid))low=mid;
    else high=mid-1;
  }
  return chars.slice(0,low).join('')+'…';
}

/** Keep Unicode code points intact (including emoji), and respect authored newlines. */
export function wrapText(ctx,text,width,font){
  const output=[]; const paragraphs=String(text??'').replace(/\r/g,'').split('\n');
  for(const p of paragraphs){
    if(!p){output.push('');continue;}
    const chunks=p.match(/\S+\s*|\s+/gu)||[];
    let line='';
    const fit=part=>measure(ctx,line+part,font)<=width;
    for(let chunk of chunks){
      if(!line && /^\s+$/.test(chunk))continue;
      if(fit(chunk)){line+=chunk;continue;}
      if(line.trim()){output.push(line.trimEnd());line='';}
      if(measure(ctx,chunk,font)<=width){line=chunk.trimStart();continue;}
      for(const symbol of Array.from(chunk)){
        if(line && measure(ctx,line+symbol,font)>width){output.push(line.trimEnd());line='';}
        line+=symbol;
      }
    }
    if(line.trim())output.push(line.trimEnd());
  }
  return output.length?output:[''];
}

export function planPages(ctx,note,settings){
  const layout=settings.layout||'hybrid-cornell';
  const side=['hybrid-cornell','classic-cornell'].includes(layout);
  const classic=layout==='classic-cornell';
  const mainX=side?307:92;
  const mainWidth=side?438:635;
  const bodyBottom=classic?832:PAGE.bottom;
  const lineHeight=density(settings);
  const font=bodyStyle(settings);
  const pages=[{placements:[],index:0}];
  let page=pages[0],y=layout==='free-journal'?255:PAGE.top;
  const next=()=>{page={placements:[],index:pages.length};pages.push(page);y=PAGE.top;};
  const ensure=(height)=>{if(y+height>bodyBottom && page.placements.length>0)next();};
  const add=(entry,height)=>{ensure(height);page.placements.push({...entry,y});y+=height;};

  // Free and minimal layouts preserve each cue AND its description as real lines.
  // No decorative chips or fixed item slices stand in for the full cue content.
  if(!side && note.cues.length){
    add({kind:'cues-header'},37);
    const cueFont=`18px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`;
    for(const cue of note.cues){
      const text=cue.note?`${cue.keyword}  /  ${cue.note}`:cue.keyword;
      for(const line of wrapText(ctx,text,mainWidth-22,cueFont))add({kind:'cue-body',text:line},28);
      add({kind:'section-gap'},11);
    }
    add({kind:'cue-divider'},12);
  }
  for(const [sectionIndex,section] of note.sections.entries()){
    if(section.heading){
      const headings=wrapText(ctx,section.heading,mainWidth-15,'bold 26px '+(FONT_STACKS[settings.font]||FONT_STACKS.graceful));
      ensure(headings.length*37+lineHeight*2);
      for(const line of headings)add({kind:'heading',text:line,sectionIndex},36);
    }else if(sectionIndex!==0)add({kind:'separator'},18);
    const lines=wrapText(ctx,section.content,mainWidth,font);
    for(const line of lines)add({kind:'body',text:line,highlights:section.highlights||[],sectionIndex},lineHeight);
    add({kind:'section-gap'},20);
  }
  const summaryFont=`${Math.max(19,(settings.fontSize||25)-2)}px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`;
  const summaryLines=wrapText(ctx,note.summary,classic?590:mainWidth-44,summaryFont);
  let offset=0;
  while(offset<summaryLines.length){
    if(classic){
      // Reserve a real full-width bottom summary band in classic Cornell.
      const take=Math.min(3,summaryLines.length-offset);
      if(offset)next();
      page.placements.push({kind:'summary',lines:summaryLines.slice(offset,offset+take),continued:offset>0,wide:true,y:873});
      offset+=take;
      continue;
    }
    const room=PAGE.bottom-y;
    if(room<90){next();continue;}
    const take=Math.max(1,Math.min(summaryLines.length-offset,Math.floor((room-60)/29)));
    const lines=summaryLines.slice(offset,offset+take);
    add({kind:'summary',lines,continued:offset>0},60+lines.length*29);
    offset+=take;
  }

  const cuePages=[];
  if(side){
    const cueBottom=classic?820:1005;
    let cuePage=[],cursor=270;
    const pushPage=()=>{cuePages.push(cuePage);cuePage=[];cursor=270;};
    for(const cue of note.cues||[]){
      const keyLines=wrapText(ctx,cue.keyword,168,`bold 21px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`);
      const noteLines=wrapText(ctx,cue.note,169,`16px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`);
      let item={keyLines:[],noteLines:[]},height=0;
      const flush=()=>{if(height){cuePage.push(item);cursor+=height+38;item={keyLines:[],noteLines:[]};height=0;}};
      for(const [type,lines,step] of [['keyLines',keyLines,27],['noteLines',noteLines,25]]){
        for(const line of lines){
          if(cursor+height+step+38>cueBottom && (cursor>270 || height)){
            flush();pushPage();
          }
          item[type].push(line);height+=step;
        }
      }
      flush();
    }
    cuePages.push(cuePage);
    while(pages.length<cuePages.length)next();
  }
  return {pages,side,classic,mainX,mainWidth,cuePages};
}

function fillPaper(ctx,s){
  const paper=PAPERS[s.paper]||PAPERS.ivory;
  ctx.fillStyle=paper.bg;ctx.fillRect(0,0,PAGE.width,PAGE.height);
  // Subtle, deterministic grain; the same pattern appears in preview and export.
  for(let i=0;i<410;i++){
    ctx.fillStyle=i%3===0?'rgba(117,92,57,.035)':'rgba(255,255,255,.085)';
    ctx.fillRect(rnd(i*3+1)*PAGE.width,rnd(i*3+2)*PAGE.height,1.5+rnd(i)*2,1.1);
  }
  if(s.paper==='ruled' || s.paper==='grid'){
    ctx.lineWidth=1;ctx.strokeStyle=paper.line;ctx.globalAlpha=.31;
    for(let y=88;y<PAGE.height-35;y+=36){ctx.beginPath();ctx.moveTo(44,y);ctx.lineTo(PAGE.width-44,y);ctx.stroke();}
  }
  if(s.paper==='grid'){
    for(let x=44;x<PAGE.width-40;x+=36){ctx.beginPath();ctx.moveTo(x,42);ctx.lineTo(x,PAGE.height-40);ctx.stroke();}
  }
  if(s.paper==='dots'){
    ctx.fillStyle=paper.line;ctx.globalAlpha=.45;
    for(let y=60;y<PAGE.height-40;y+=26)for(let x=48;x<PAGE.width-34;x+=26){ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fill();}
  }
  if(s.paper==='kraft'||s.paper==='parchment'){
    const g=ctx.createRadialGradient(410,400,20,410,560,720);
    g.addColorStop(0,'rgba(255,255,255,.14)');g.addColorStop(1,'rgba(98,56,12,.10)');
    ctx.fillStyle=g;ctx.fillRect(0,0,PAGE.width,PAGE.height);
  }
  ctx.globalAlpha=1;
}
function label(ctx,t,x,y,s,color){ctx.fillStyle=color||INKS[s.ink]||INKS.black;ctx.font='600 14px ui-sans-serif,system-ui,sans-serif';ctx.fillText(t,x,y);}
function drawHeader(ctx,note,s,pageNumber,total,layout){
  ctx.fillStyle='rgba(110,85,54,.68)';ctx.font='600 15px ui-sans-serif,system-ui,sans-serif';
  ctx.fillText('INKSCRIBE   /   墨语笔记',68,66);
  ctx.textAlign='right';ctx.fillText(note.date||new Date().toLocaleDateString('en-CA'),748,66);ctx.textAlign='left';
  ctx.strokeStyle='rgba(111,91,66,.42)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(68,83);ctx.lineTo(752,83);ctx.stroke();
  ctx.fillStyle=INKS[s.ink]||INKS.black;ctx.font=titleStyle(s);
  const title=fitTitle(ctx,note.title||'未命名笔记',titleStyle(s),680);
  ctx.fillText(title,68,147);
  ctx.fillStyle='#a3764e';ctx.fillRect(68,167,42,4);
  label(ctx,layout==='classic-cornell'?'CORNELL NOTES':layout==='free-journal'?'FREE JOURNAL':layout==='minimal'?'STUDY NOTES':'LEARNING JOURNAL',126,173,s,'rgba(103,81,59,.62)');
  ctx.strokeStyle='rgba(111,91,66,.27)';ctx.beginPath();ctx.moveTo(68,1070);ctx.lineTo(752,1070);ctx.stroke();
  label(ctx,'整理知识，留下笔迹。',68,1103,s,'rgba(115,92,67,.62)');
  ctx.textAlign='right';label(ctx,`${String(pageNumber+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,752,1103,s,'rgba(115,92,67,.62)');ctx.textAlign='left';
}
function drawCues(ctx,s,items,classic=false){
  ctx.fillStyle='rgba(125,96,69,.065)';ctx.fillRect(69,209,212,classic?625:813);
  ctx.strokeStyle='rgba(124,94,60,.24)';ctx.beginPath();ctx.moveTo(284,209);ctx.lineTo(284,classic?834:1020);ctx.stroke();
  label(ctx,'KEY WORDS  /  关键词',85,235,s,'rgba(134,99,64,.80)');
  let y=271;
  for(const {keyLines,noteLines} of items||[]){
    ctx.fillStyle=INKS[s.ink]||INKS.black;
    ctx.font=`bold 21px ${FONT_STACKS[s.font]||FONT_STACKS.graceful}`;
    for(const line of keyLines){ctx.fillText(line,86,y);y+=27;}
    ctx.fillStyle='rgba(76,63,51,.78)';ctx.font='16px '+(FONT_STACKS[s.font]||FONT_STACKS.graceful);
    for(const line of noteLines){ctx.fillText(line,86,y+5);y+=25;}
    ctx.strokeStyle='rgba(151,117,79,.24)';ctx.beginPath();ctx.moveTo(86,y+13);ctx.lineTo(250,y+13);ctx.stroke();y+=38;
  }
}

function drawBodyLine(ctx,text,x,y,highlights,s){
  const ink=INKS[s.ink]||INKS.black;const font=bodyStyle(s);ctx.font=font;
  const visible=text||'';
  // Build non-overlapping highlights before painting text; model and editor cannot inject markup.
  const intervals=[];
  for(const term of highlights){let pos=0;while(term && (pos=visible.indexOf(term,pos))>=0){intervals.push([pos,pos+term.length]);pos+=term.length;}}
  intervals.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);let last=-1;
  for(const [a,b] of intervals){if(a<last)continue;
    const left=measure(ctx,visible.slice(0,a),font),width=measure(ctx,visible.slice(a,b),font);
    ctx.fillStyle=HIGHLIGHTS[(a+b)%HIGHLIGHTS.length];ctx.globalAlpha=.66;
    ctx.fillRect(x+left-1,y-(s.fontSize||25)*.78,Math.max(3,width+4),(s.fontSize||25)*.96);
    ctx.globalAlpha=1;last=b;
  }
  ctx.fillStyle=ink;ctx.fillText(visible,x,y);
}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawSummary(ctx,lines,s,y,side,continued,wide=false){
  const x=side&&!wide?307:92,w=side&&!wide?438:635;
  const font=`${Math.max(19,(s.fontSize||25)-2)}px ${FONT_STACKS[s.font]||FONT_STACKS.graceful}`;
  const height=60+lines.length*29;
  rounded(ctx,x,y,w,height-11,10);ctx.fillStyle='rgba(229,192,130,.21)';ctx.fill();
  ctx.fillStyle='#a3764e';ctx.fillRect(x,y,5,height-11);
  label(ctx,continued?'SUMMARY / 续':'SUMMARY  /  总结',x+22,y+25,s,'#98704f');
  ctx.font=font;ctx.fillStyle=INKS[s.ink]||INKS.black;
  lines.forEach((line,i)=>ctx.fillText(line,x+22,y+53+i*29));
}

function drawSmallDoodle(ctx,s,page){
  if(page!==0) return;
  ctx.save();ctx.translate(698,175);ctx.strokeStyle=INKS[s.ink]||INKS.black;ctx.globalAlpha=.4;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,11,Math.PI,2*Math.PI);ctx.lineTo(8,9);ctx.lineTo(-8,9);ctx.closePath();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-5,14);ctx.lineTo(5,14);ctx.moveTo(-4,19);ctx.lineTo(4,19);ctx.stroke();
  for(let a=0;a<8;a++){const t=a*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(t)*16,Math.sin(t)*16);ctx.lineTo(Math.cos(t)*21,Math.sin(t)*21);ctx.stroke();}
  ctx.restore();
}
function paintSticker(ctx,item,selected=false){
  ctx.save();ctx.translate(item.x,item.y);ctx.rotate(item.rotation*Math.PI/180);ctx.scale(item.scale,item.scale);
  switch(item.type){
    case 'tape':
      ctx.fillStyle='rgba(201,157,94,.39)';ctx.strokeStyle='rgba(148,104,59,.43)';
      ctx.beginPath();ctx.moveTo(-57,-14);ctx.lineTo(58,-16);ctx.lineTo(54,15);ctx.lineTo(-54,17);ctx.closePath();ctx.fill();ctx.stroke();break;
    case 'sticky-note':
      ctx.shadowColor='rgba(40,25,14,.16)';ctx.shadowBlur=8;ctx.shadowOffsetY=4;
      ctx.fillStyle='#f7e7ae';ctx.fillRect(-66,-53,132,106);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.font='bold 19px Georgia,serif';ctx.fillStyle='#8d7556';ctx.fillText('remember',-51,-19);
      ctx.strokeStyle='#b9a47b';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-50,0+i*17);ctx.lineTo(46,0+i*17);ctx.stroke();}break;
    case 'paperclip':
      ctx.strokeStyle='#748b95';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-11,32);ctx.lineTo(-11,-33);ctx.bezierCurveTo(-11,-55,21,-55,21,-33);ctx.lineTo(21,35);ctx.bezierCurveTo(21,57,-30,57,-30,31);ctx.lineTo(-30,-22);ctx.stroke();break;
    case 'star':
      ctx.beginPath();for(let i=0;i<10;i++){const a=(i*36-90)*Math.PI/180,r=i%2?17:37;let px=Math.cos(a)*r,py=Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle='#e6bb5a';ctx.fill();ctx.strokeStyle='#b38a41';ctx.lineWidth=1.6;ctx.stroke();break;
    case 'coffee-stain':
      ctx.strokeStyle='rgba(145,91,39,.29)';ctx.lineWidth=8;ctx.beginPath();ctx.arc(0,0,40,-.5,5.85);ctx.stroke();ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(2,0,45,1.3,3.8);ctx.stroke();break;
    case 'custom-doodle':
      ctx.strokeStyle='#688370';ctx.lineWidth=2.8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,37);ctx.bezierCurveTo(-8,0,-7,-24,12,-45);ctx.stroke();
      for(let i=0;i<3;i++){let yy=17-i*24;ctx.beginPath();ctx.ellipse(-13,yy,23,9,-.6,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(12,yy-10,22,9,.6,0,Math.PI*2);ctx.stroke();}break;
  }
  if(selected){ctx.strokeStyle='#426b9b';ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeRect(-74,-66,148,132);ctx.setLineDash([]);}
  ctx.restore();
}
export function hitSticker(stickers,page,x,y){
  for(let i=stickers.length-1;i>=0;i--){const item=stickers[i];if(item.page!==page)continue;
    const dx=x-item.x,dy=y-item.y,a=-item.rotation*Math.PI/180;
    const xx=(dx*Math.cos(a)-dy*Math.sin(a))/item.scale,yy=(dx*Math.sin(a)+dy*Math.cos(a))/item.scale;
    if(Math.abs(xx)<73 && Math.abs(yy)<65) return item.id;
  }return null;
}
export function paintPage(canvas,plan,note,settings,pageIndex,{scale=1,selected=null}={}){
  canvas.width=Math.round(PAGE.width*scale);canvas.height=Math.round(PAGE.height*scale);
  const ctx=canvas.getContext('2d',{alpha:false});ctx.setTransform(scale,0,0,scale,0,0);
  ctx.textBaseline='alphabetic';fillPaper(ctx,settings);
  const page=plan.pages[pageIndex],layout=settings.layout||'hybrid-cornell';
  drawHeader(ctx,note,settings,pageIndex,plan.pages.length,layout);drawSmallDoodle(ctx,settings,pageIndex);
  if(plan.side)drawCues(ctx,settings,plan.cuePages[pageIndex],plan.classic);
  if(plan.classic){
    ctx.strokeStyle='rgba(111,91,66,.31)';ctx.beginPath();ctx.moveTo(69,850);ctx.lineTo(751,850);ctx.stroke();
  }
  const font=bodyStyle(settings),ink=INKS[settings.ink]||INKS.black;
  for(const placement of page.placements){
    const x=plan.mainX,y=placement.y;
    if(placement.kind==='heading'){
      ctx.fillStyle='#ac7b4e';ctx.fillRect(x,y+5,4,23);
      ctx.fillStyle=ink;ctx.font=`bold 26px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`;
      ctx.fillText(placement.text,x+15,y+25);
    }
    if(placement.kind==='body')drawBodyLine(ctx,placement.text,x,y+(settings.fontSize||25),placement.highlights,settings);
    if(placement.kind==='cues-header')label(ctx,layout==='minimal'?'KEY IDEAS / NOTES':'FIELD NOTES / KEY IDEAS',x,y+23,settings,'#98704f');
    if(placement.kind==='cue-body'){
      ctx.fillStyle=ink;ctx.font=`18px ${FONT_STACKS[settings.font]||FONT_STACKS.graceful}`;
      ctx.fillText(placement.text,x+12,y+21);
    }
    if(placement.kind==='cue-divider'){
      ctx.strokeStyle='rgba(151,117,79,.3)';ctx.beginPath();ctx.moveTo(x,y+3);ctx.lineTo(x+plan.mainWidth,y+3);ctx.stroke();
    }
    if(placement.kind==='summary')drawSummary(ctx,placement.lines,settings,y,plan.side,placement.continued,placement.wide);
  }
  for(const item of (settings.stickers||[]).filter(it=>it.page===pageIndex))paintSticker(ctx,item,selected===item.id);
  return canvas;
}

export function makePlan(note,settings){
  const ctx=document.createElement('canvas').getContext('2d');
  return planPages(ctx,note,settings);
}
export const defaultSettings = () => ({layout:'hybrid-cornell',paper:'ivory',ink:'blue',font:'graceful',fontSize:25,lineHeight:1.65,stickers:[]});
