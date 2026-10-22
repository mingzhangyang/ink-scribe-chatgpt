/** Public, versioned contracts shared by Worker and studio. No runtime dependencies. */
export const TEMPLATES = Object.freeze(['reading-notes','meeting-minutes','course-summary','thoughts']);
export const LANGUAGES = Object.freeze(['auto','zh','en']);
export const LAYOUTS = Object.freeze(['hybrid-cornell','classic-cornell','free-journal','minimal']);
export const MAX_TEXT_LENGTH = 8000;
export const MAX_BODY_BYTES = 36 * 1024;

export const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 110 },
    date: { type: 'string', maxLength: 40 },
    cues: {
      type: 'array', maxItems: 12,
      items: { type: 'object', additionalProperties: false,
        properties: { keyword: { type: 'string', maxLength: 45 }, note: { type: 'string', maxLength: 200 } },
        required: ['keyword','note'] }
    },
    sections: {
      type: 'array', minItems: 1, maxItems: 14,
      items: { type: 'object', additionalProperties: false,
        properties: { heading: { type: 'string', maxLength: 90 }, content: { type: 'string', minLength: 1, maxLength: 1600 },
          highlights: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 70 } } },
        required: ['content','highlights'] }
    },
    doodlePrompt: { type: 'string', maxLength: 180 },
    summary: { type: 'string', minLength: 1, maxLength: 700 }
  },
  required: ['title','cues','sections','summary']
};

const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clean = (v, trim=true) => typeof v === 'string'
  ? (trim ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
    : v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ''))
  : '';
const assert = (ok, field) => { if (!ok) throw new ContractError(`Invalid note structure: ${field}`); };
export class ContractError extends Error { constructor(message){ super(message); this.name='ContractError'; } }

/**
 * AI has a deliberately small JSON schema; an editable document does not.
 * Never silently truncate text when switching from generated to editable data.
 * `forAI` validates the generated output independently of the editor model.
 */
export function normalizeNote(raw,{forAI=false}={}) {
  assert(isRecord(raw), 'root');
  assert(typeof raw.title === 'string' && raw.title.trim().length > 0, 'title');
  assert(Array.isArray(raw.cues) && raw.cues.length <= (forAI ? 12 : 100), 'cues');
  assert(Array.isArray(raw.sections) && raw.sections.length > 0 && raw.sections.length <= (forAI ? 14 : 200), 'sections');
  assert(typeof raw.summary === 'string' && raw.summary.trim().length > 0, 'summary');
  const bound=(s,max,field)=>{if(forAI)assert(s.length<=max,field);return s;};
  const cues=raw.cues.map((cue,i)=>{
    assert(isRecord(cue) && typeof cue.keyword==='string' && typeof cue.note==='string',`cues[${i}]`);
    const keyword=bound(clean(cue.keyword),45,`cues[${i}].keyword`);
    const note=bound(clean(cue.note),200,`cues[${i}].note`);
    assert(keyword.length>0,`cues[${i}].keyword`);
    return {keyword,note};
  });
  const sections=raw.sections.map((section,i)=>{
    assert(isRecord(section) && typeof section.content==='string' && section.content.trim(),`sections[${i}]`);
    assert(Array.isArray(section.highlights) && section.highlights.length<=8 && section.highlights.every(v=>typeof v==='string'),`sections[${i}].highlights`);
    const content=bound(clean(section.content,false),1600,`sections[${i}].content`);
    const heading=bound(clean(section.heading),90,`sections[${i}].heading`);
    return {
      heading,content,
      // Only actual substrings can be highlighted; model content is never HTML.
      highlights:[...new Set(section.highlights.map((v,j)=>bound(clean(v),70,`sections[${i}].highlights[${j}]`)).filter(v=>v && content.includes(v)))]
    };
  });
  const note={title:bound(clean(raw.title),110,'title'),date:bound(clean(raw.date),40,'date'),cues,sections,
    summary:bound(clean(raw.summary,false),700,'summary'), doodlePrompt:bound(clean(raw.doodlePrompt),180,'doodlePrompt')};
  assert(note.title.length>0 && note.summary.trim().length>0,'empty required fields');
  return note;
}

export function validateStructureRequest(value) {
  if(!isRecord(value)) return 'INVALID_BODY';
  if(typeof value.text!=='string' || !value.text.trim()) return 'TEXT_REQUIRED';
  if([...value.text].length > MAX_TEXT_LENGTH) return 'TEXT_TOO_LONG';
  if(!TEMPLATES.includes(value.template) || !LANGUAGES.includes(value.language) || !LAYOUTS.includes(value.style)) return 'INVALID_OPTIONS';
  return null;
}

export function validateSticker(s) {
  return isRecord(s) && typeof s.id==='string' && s.id.length<60 &&
    ['tape','sticky-note','paperclip','star','coffee-stain','custom-doodle'].includes(s.type) &&
    ['x','y','rotation','scale','page'].every(k=>Number.isFinite(s[k])) &&
    s.x>=0 && s.x<=820 && s.y>=0 && s.y<=1160 && s.scale>=0.35 && s.scale<=2.5 &&
    s.rotation>=-180 && s.rotation<=180 && Number.isSafeInteger(s.page) && s.page>=0 && s.page<64;
}
