/** Purely local formatting. Every character stays in the editable note body. */
export function formatOffline(text,template='reading-notes'){
  const raw=String(text??'').replace(/\r\n/g,'\n');
  if(!raw.trim())throw new Error('请先输入文本');
  if([...raw].length>30000)throw new Error('The local editor supports at most 30,000 characters per document. Please shorten the input before continuing.');
  const first=raw.split('\n').find(x=>x.trim())||'';
  const title=Array.from(first.replace(/^[#*\d.\-\s]+/,'').trim()).slice(0,55).join('')||'InkScribe';
  const chars=Array.from(raw),sections=[];
  let cursor=0,leadingWhitespace='';
  while(cursor<chars.length){
    let end=Math.min(cursor+1300,chars.length);
    // Prefer paragraph boundaries, but split long single paragraphs as well.
    if(end<chars.length){
      for(let i=end;i>cursor+850;i--){if(chars[i-1]==='\n'){end=i;break;}}
    }
    const chunk=chars.slice(cursor,end).join('');
    // The note contract disallows blank sections. Attach all whitespace to a
    // neighboring substantive section instead of dropping or rejecting it.
    if(chunk.trim()){
      sections.push({heading:sections.length===0?'\u6b63\u6587':`\u7eed\u7bc7 ${sections.length+1}`,
        content:leadingWhitespace+chunk,highlights:[]});
      leadingWhitespace='';
    }else if(sections.length){
      sections[sections.length-1].content+=chunk;
    }else{
      leadingWhitespace+=chunk;
    }
    cursor=end;
  }
  return {title,date:new Date().toISOString().slice(0,10),cues:[],sections,
    summary:template==='meeting-minutes'?'仅排版整理，尚未由 AI 提取会议结论。':'仅排版整理，未进行 AI 摘要或重点提取。',
    doodlePrompt:''};
}
export const EXAMPLE={
  title:'光合作用 · 把阳光写进叶片',date:'2026-10-22',
  cues:[
    {keyword:'叶绿体',note:'光合作用发生的主要场所'},
    {keyword:'光反应',note:'吸收光能，并形成可用于后续反应的能量载体'},
    {keyword:'碳固定',note:'把二氧化碳中的碳转化为有机物'},
    {keyword:'限制因素',note:'光照、水分、温度与二氧化碳浓度'}
  ],
  sections:[
    {heading:'01 / 一片叶子的能量工厂',content:'植物利用阳光，将水和二氧化碳转化为有机物，并释放氧气。这不是简单的“吸收太阳”，而是一系列相互配合的化学过程。',highlights:['阳光','有机物','氧气']},
    {heading:'02 / 两个彼此衔接的阶段',content:'光反应利用光能产生能量载体；随后，碳固定过程利用这些载体，将二氧化碳中的碳构建到有机物中。两个阶段相互依存，构成完整的能量转化链条。',highlights:['光反应','碳固定','相互依存']},
    {heading:'03 / 值得记住的细节',content:'光照强度并非越大越好。水分、温度与二氧化碳浓度都可能成为限制因素。理解一条规律时，也要记住它成立的条件。',highlights:['限制因素','成立的条件']}
  ],summary:'光合作用把光能转化为化学能。学习时抓住“能量如何进入”和“碳如何固定”两条主线，更容易看清整体机制。',doodlePrompt:'在页边画一片小叶子'
};
