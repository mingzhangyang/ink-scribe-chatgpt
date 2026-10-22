import { INKS, PAPERS, PAGE, defaultSettings, hitSticker, makePlan, paintPage } from './renderer.js';
import { EXAMPLE, formatOffline } from './offline.js';
import { exportPages, copyPage } from './export.js';
import { normalizeNote, validateSticker } from './contracts.js';

const $ = (id) => document.getElementById(id);
const canvas = $('note-canvas');
const settings = defaultSettings();
let note = normalizeNote(EXAMPLE);
let plan;
let currentPage = 0;
let selectedSticker = null;
let draftChanged = false;
let dragging = null;
let toastTimer;
let pendingPaint = false;
let mode = '示例作品';

const STICKERS = [
  ['tape', '胶带', '▰'], ['sticky-note', '便签', '▤'], ['paperclip', '回形针', '♧'],
  ['star', '星星', '★'], ['coffee-stain', '咖啡渍', '◌'], ['custom-doodle', '枝叶涂鸦', '❧']
];
function toast(message, isError = false) {
  const el = $('toast');
  window.clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('visible');
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), 4000);
}
function displayPage() {
  currentPage = Math.max(0, Math.min(plan.pages.length - 1, currentPage));
  $('page-counter').textContent = `${String(currentPage + 1).padStart(2,'0')} / ${String(plan.pages.length).padStart(2,'0')}`;
  $('prev-page').disabled = currentPage === 0;
  $('next-page').disabled = currentPage === plan.pages.length - 1;
  $('preview-mode').textContent = mode;
  paintPage(canvas, plan, note, settings, currentPage, { selected: selectedSticker });
}
function schedulePaint(reflow = true) {
  if (reflow) plan = null;
  if (pendingPaint) return;
  pendingPaint = true;
  requestAnimationFrame(() => {
    pendingPaint = false;
    try {
      if (!plan) plan = makePlan(note, settings);
      if (!settings.stickers.some(s => s.id === selectedSticker)) selectedSticker = null;
      updateStickerTools();
      displayPage();
    } catch (err) { console.error('Cannot draw page', err?.name); toast('笔记排版失败，请尝试减小字号。', true); }
  });
}
function selectSticker(id) {
  selectedSticker = id;
  updateStickerTools();
  schedulePaint(false);
}
function updateStickerTools() {
  const s = settings.stickers.find(item => item.id === selectedSticker);
  $('sticker-tools').hidden = !s;
  if (!s) return;
  $('selected-type').textContent = STICKERS.find(([type]) => type === s.type)?.[1] || '';
  $('sticker-scale').value = String(Math.round(s.scale * 100));
  $('sticker-rotation').value = String(s.rotation);
  $('sticker-scale-value').textContent = `${Math.round(s.scale * 100)}%`;
  $('sticker-rotation-value').textContent = `${s.rotation}°`;
}
function installOptions() {
  for (const [id, paper] of Object.entries(PAPERS)) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'paper-choice'; button.title = paper.label; button.setAttribute('aria-label', `纸张：${paper.label}`);
    button.dataset.paper = id;
    const swatch = document.createElement('span'); swatch.className = 'paper-swatch'; swatch.style.backgroundColor = paper.bg;
    if (id === 'grid') swatch.style.backgroundImage = 'linear-gradient(#8d9c893f 1px,transparent 1px),linear-gradient(90deg,#8d9c893f 1px,transparent 1px)';
    if (id === 'ruled') swatch.style.backgroundImage = 'repeating-linear-gradient(0deg,transparent,transparent 11px,#829eac40 12px)';
    if (id === 'dots') swatch.style.backgroundImage = 'radial-gradient(#88866e5b 1px,transparent 1px)';
    if (id === 'parchment' || id === 'kraft') swatch.style.backgroundImage = 'radial-gradient(#fff5,transparent)';
    if (swatch.style.backgroundImage) swatch.style.backgroundSize = '12px 12px';
    const label = document.createElement('span'); label.textContent = paper.label.replace('复古', '');
    button.append(swatch, label);
    button.addEventListener('click', () => { settings.paper = id; syncOptions(); schedulePaint(false); });
    $('papers').append(button);
  }
  const inkNames = { black: '碳素黑', blue: '钢笔蓝', brown: '复古棕', green: '黛绿', wine: '波尔多红' };
  for (const [id, color] of Object.entries(INKS)) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'ink-choice'; button.title = inkNames[id];
    button.setAttribute('aria-label', `墨水：${inkNames[id]}`);button.dataset.ink = id;
    const swatch = document.createElement('span'); swatch.style.backgroundColor = color;
    button.append(swatch);
    button.addEventListener('click', () => {settings.ink = id;syncOptions();schedulePaint(false);});
    $('inks').append(button);
  }
  for (const [type, label, glyph] of STICKERS) {
    const button = document.createElement('button');button.type = 'button';button.className = 'sticker-choice';
    button.textContent = glyph;button.title = `添加${label}`;button.setAttribute('aria-label', `添加${label}`);
    button.addEventListener('click', () => {
      if (settings.stickers.length >= 36) {toast('最多可以添加 36 个贴纸。', true); return;}
      const item = {id: (globalThis.crypto?.randomUUID?.() || `sticker-${Date.now()}-${Math.random().toString(36).slice(2)}`), type, x: Math.min(690, 425 + Math.random() * 80), y: Math.min(950, 380 + Math.random() * 90), rotation: 0, scale: 1, page: currentPage};
      if (!validateSticker(item)) {toast('无法创建贴纸。', true);return;}
      settings.stickers.push(item); selectSticker(item.id); draftChanged = true;
      toast(`已添加${label}，可在纸上拖动位置。`);
    });
    $('stickers').append(button);
  }
  syncOptions();
}
function syncOptions() {
  $('layout').value = settings.layout;
  $('font').value = settings.font;
  $('font-size').value = String(settings.fontSize);
  $('line-height').value = String(settings.lineHeight);
  $('font-size-value').textContent = `${settings.fontSize}px`;
  $('line-height-value').textContent = `${settings.lineHeight.toFixed(2)}×`;
  document.querySelectorAll('[data-paper]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.paper === settings.paper)));
  document.querySelectorAll('[data-ink]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ink === settings.ink)));
}
function textField(parent, labelText, value, change, multiline = false) {
  const box = document.createElement('div');box.className = 'edit-field';
  const id = `field-${parent.childElementCount}`;
  const label = document.createElement('label'); label.htmlFor = id;label.textContent = labelText;
  const el = document.createElement(multiline ? 'textarea' : 'input');
  el.id = id;el.value = value;
  el.addEventListener('input', () => {change(el.value);draftChanged = true;mode = '已手动编辑';schedulePaint();});
  box.append(label, el);parent.append(box);
}
function refreshEditor() {
  const root = $('editor-fields');root.replaceChildren();
  textField(root, '标题', note.title, value => note.title = value.slice(0,110));
  for (const [i, section] of note.sections.entries()) {
    textField(root, `第 ${i + 1} 节 · 小标题`, section.heading, value => section.heading = value.slice(0,90));
    textField(root, `第 ${i + 1} 节 · 正文`, section.content, value => section.content = value.slice(0,1600), true);
  }
  textField(root, '结尾总结', note.summary, value => note.summary = value.slice(0,700), true);
  for (const [i, cue] of note.cues.entries()) {
    textField(root, `关键词 ${i+1}`, cue.keyword, value => cue.keyword = value.slice(0,45));
    textField(root, `关键词 ${i+1} · 说明`, cue.note, value => cue.note = value.slice(0,200), true);
  }
}
function setNote(nextNote, label) {
  note = normalizeNote(nextNote);currentPage = 0;selectedSticker = null;
  settings.stickers = [];plan = null;mode = label;draftChanged = true;
  refreshEditor();schedulePaint();
}
function updateCharCount() {
  const length = [...$('source-text').value].length;
  $('char-count').textContent = `${length} / 8000`;
  $('char-count').style.color = length > 7600 ? '#efba94' : '';
}
async function generateAI() {
  const text = $('source-text').value.trim();
  if (!text) { toast('请先粘贴需要整理的内容。', true);$('source-text').focus();return; }
  if ([...text].length > 8000) {toast('文本超过 8000 字，请缩短后重试。', true);return;}
  $('generate').disabled = true;$('generate-label').textContent = 'AI 正在整理文字…';
  try {
    const response = await fetch('/api/structure', {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({text,template:$('source-template').value,language:$('source-language').value,style:settings.layout})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.structure) throw new Error(data.error?.message || `整理失败（HTTP ${response.status}）`);
    setNote(data.structure,'AI 整理完成');
    toast('整理完成！现在可以调整样式、修改正文或加入贴纸。');
  } catch (error) {toast(error.message || '暂时无法连接 AI 服务，请稍后重试。',true);}
  finally {$('generate').disabled = false;$('generate-label').textContent = 'AI 转化为手写笔记';}
}
function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {x: Math.max(0, Math.min(PAGE.width, (event.clientX - rect.left) * PAGE.width / rect.width)),
    y: Math.max(0, Math.min(PAGE.height,(event.clientY - rect.top) * PAGE.height / rect.height))};
}
function installDrag() {
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    const pt = getPoint(event);
    const id = hitSticker(settings.stickers,currentPage,pt.x,pt.y);
    selectSticker(id);
    if (!id) return;
    const sticker = settings.stickers.find(s => s.id === id);
    dragging = {id, pointerId:event.pointerId,dx:pt.x-sticker.x,dy:pt.y-sticker.y};
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('sticker-drag');event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    const pt = getPoint(event);
    if (!dragging || dragging.pointerId !== event.pointerId) {
      canvas.classList.toggle('sticker-hover', !!hitSticker(settings.stickers,currentPage,pt.x,pt.y));return;
    }
    const sticker = settings.stickers.find(s => s.id === dragging.id);
    if (!sticker) return;
    sticker.x = Math.max(76, Math.min(PAGE.width-76, pt.x-dragging.dx));
    sticker.y = Math.max(72, Math.min(PAGE.height-72, pt.y-dragging.dy));
    draftChanged = true;mode = '已手动编辑';schedulePaint(false);
  });
  const end = event => {
    if (dragging && dragging.pointerId === event.pointerId) {
      dragging = null;canvas.classList.remove('sticker-drag');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('keydown', event => {
    if (!selectedSticker) return;
    const sticker = settings.stickers.find(s => s.id === selectedSticker);if (!sticker) return;
    const directions = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const dir = directions[event.key];if (!dir) return;
    event.preventDefault(); const step = event.shiftKey ? 15 : 3;
    sticker.x = Math.max(76,Math.min(PAGE.width-76,sticker.x+dir[0]*step));
    sticker.y = Math.max(72,Math.min(PAGE.height-72,sticker.y+dir[1]*step));
    schedulePaint(false);
  });
}
async function handleExport() {
  if (!plan) return;
  const format = $('export-format').value;const scale = Number($('export-scale').value);
  const button=$('export');button.disabled=true;button.textContent='正在制作高清图片…';
  try { const pages = await exportPages(plan,note,settings,format,scale);toast(`已导出 ${pages} 页${pages > 1 ? '（ZIP 打包）' : ''}。`); }
  catch (e) {toast(e.message||'无法导出图片',true);}finally{button.disabled=false;button.textContent='⇩ 下载笔记图片';}
}
function init() {
  installOptions();installDrag();refreshEditor();schedulePaint();
  $('source-text').addEventListener('input',updateCharCount);
  $('generate').addEventListener('click',generateAI);
  $('offline').addEventListener('click',() => {
    try {setNote(formatOffline($('source-text').value,$('source-template').value),'本地排版 · 未使用 AI');toast('已本地排版，未调用 AI 或上传文字。');}
    catch(e){toast(e.message,true);$('source-text').focus();}
  });
  $('load-example').addEventListener('click',() => {setNote(EXAMPLE,'示例作品');$('source-text').value='光合作用：植物利用光能，将水和二氧化碳转化为有机物，同时释放氧气。\n光反应吸收光能并提供能量载体，碳固定利用这些载体将碳构建为有机物。\n光照、水分、温度和二氧化碳浓度是影响光合作用的限制因素。';updateCharCount();toast('已载入示例；可直接体验纸张与贴纸工具。');});
  $('new-note').addEventListener('click', () => {
    if (draftChanged && !window.confirm('新建笔记会丢弃当前页面中的编辑内容。确认继续吗？')) return;
    $('source-text').value = '';updateCharCount();setNote({title:'我的新笔记',date:new Date().toISOString().slice(0,10),cues:[],sections:[{heading:'新的开始',content:'在左侧粘贴文字，让想法在这里慢慢生长。',highlights:[]}],summary:'每一个灵感，都值得被认真记下。'},'新笔记');draftChanged = false;
  });
  $('layout').addEventListener('change',e => {settings.layout=e.target.value;draftChanged=true;schedulePaint();});
  $('font').addEventListener('change',e => {settings.font=e.target.value;draftChanged=true;schedulePaint();});
  $('font-size').addEventListener('input',e => {settings.fontSize=Number(e.target.value);syncOptions();schedulePaint();});
  $('line-height').addEventListener('input',e => {settings.lineHeight=Number(e.target.value);syncOptions();schedulePaint();});
  $('sticker-scale').addEventListener('input',e => {const s=settings.stickers.find(s=>s.id===selectedSticker);if(s){s.scale=Number(e.target.value)/100;updateStickerTools();schedulePaint(false);}});
  $('sticker-rotation').addEventListener('input',e => {const s=settings.stickers.find(s=>s.id===selectedSticker);if(s){s.rotation=Number(e.target.value);updateStickerTools();schedulePaint(false);}});
  $('delete-sticker').addEventListener('click',() => {settings.stickers=settings.stickers.filter(s=>s.id!==selectedSticker);selectSticker(null);draftChanged=true;});
  $('bring-forward').addEventListener('click',() => {const i=settings.stickers.findIndex(s=>s.id===selectedSticker);if(i>=0){settings.stickers.push(...settings.stickers.splice(i,1));schedulePaint(false);}});
  $('prev-page').addEventListener('click',() => {if(currentPage>0){currentPage--;selectedSticker=null;updateStickerTools();schedulePaint(false);}});
  $('next-page').addEventListener('click',() => {if(currentPage<plan.pages.length-1){currentPage++;selectedSticker=null;updateStickerTools();schedulePaint(false);}});
  $('export').addEventListener('click',handleExport);$('header-export').addEventListener('click',handleExport);
  $('copy').addEventListener('click',async() => {
    if(!plan)return;
    const b=$('copy');b.disabled=true;
    try {await copyPage(plan,note,settings,currentPage);toast('已将当前页图片复制到剪贴板。');}
    catch(e){toast(e.message||'复制失败，请尝试下载',true);}finally{b.disabled=false;}
  });
  if(document.fonts?.ready)document.fonts.ready.then(() => schedulePaint());
}
init();
