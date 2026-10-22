import test from 'node:test';
import assert from 'node:assert/strict';
import {planPages, defaultSettings, PAGE} from '../public/assets/renderer.js';

// Deliberately fixed widths make the reported boundaries deterministic.
const ctx = {font: '', measureText(text) {
  return {width: [...text].reduce((width, ch) => width + (ch.codePointAt(0) > 255 ? 23 : 11), 0)};
}};
const layouts = ['minimal', 'free-journal', 'hybrid-cornell', 'classic-cornell'];
const baseNote = () => ({title: 'Cue pagination', date: '2026-10-22', cues: [],
  sections: [{heading: '', content: 'BODY_PRESENT', highlights: []}], summary: 'SUMMARY_PRESENT'});
const visible = text => typeof text === 'string' && text.trim().length > 0;
function hasNoteContent(plan, index) {
  return plan.pages[index].placements.some(p => visible(p.text) || p.lines?.some(visible)) ||
    (plan.cuePages[index] || []).some(cue => [...cue.keyLines, ...cue.noteLines].some(visible));
}
function assertContentPages(plan, label) {
  assert.ok(plan.pages.length, label);
  plan.pages.forEach((page, index) => {
    assert.equal(page.index, index, label + ': page index');
    assert.ok(hasNoteContent(plan, index), label + ': page ' + index + ' contains only decorations or blank text');
    assert.ok(page.placements.every(p => p.y >= PAGE.top && p.y <= PAGE.bottom), label + ': placement bounds');
  });
}
function mainText(plan, kind) {
  return plan.pages.flatMap(p => p.placements.filter(x => x.kind === kind).map(x => x.text)).join('');
}
function sideText(plan, field) {
  return plan.cuePages.flat().flatMap(cue => cue[field]).join('');
}

for (const [layout, count] of [['minimal', 28], ['free-journal', 26]]) {
  test(layout + ': cue overflow followed by an oversized heading never creates a divider-only page', () => {
    const note = baseNote();
    note.cues = [{keyword: 'KEY', note: Array(count).fill('Fact').join('\n')}];
    note.sections[0].heading = 'LONG_HEADING'.repeat(200);
    const plan = planPages(ctx, note, {...defaultSettings(), layout});
    assertContentPages(plan, layout);
    assert.equal(mainText(plan, 'heading'), note.sections[0].heading);
    assert.equal(mainText(plan, 'body'), 'BODY_PRESENT');
    assert.equal(mainText(plan, 'cue-body'), 'KEY  /  ' + 'Fact'.repeat(count));
    assert.equal(plan.pages.flatMap(p => p.placements).filter(p => p.kind === 'cue-divider').length, 0);
  });
}

test('classic Cornell: empty descriptions do not add a phantom cue continuation page', () => {
  for (const empty of ['', '\n', ' \t\n ']) {
    const note = baseNote();
    note.cues = [...Array.from({length: 5}, (_, i) => ({keyword: 'K' + i, note: empty})),
      {keyword: 'LONGKEYWORD'.repeat(2), note: empty}];
    const plan = planPages(ctx, note, {...defaultSettings(), layout: 'classic-cornell'});
    assert.equal(plan.pages.length, 1);
    assert.equal(plan.cuePages.length, 1);
    assertContentPages(plan, JSON.stringify(empty));
    assert.equal(sideText(plan, 'keyLines'), note.cues.map(cue => cue.keyword).join(''));
    assert.deepEqual(plan.cuePages.flat().flatMap(cue => cue.noteLines), []);
    assert.ok(plan.pages[0].placements.some(p => p.kind === 'summary'));
  }
});

test('decorative dividers still render when there is room on a content page', () => {
  for (const layout of ['minimal', 'free-journal']) {
    const note = baseNote();
    note.cues = [{keyword: 'KEY', note: 'Fact'}];
    note.sections.push({heading: '', content: 'SECOND_BODY', highlights: []});
    const plan = planPages(ctx, note, {...defaultSettings(), layout});
    assertContentPages(plan, layout);
    const all = plan.pages.flatMap(p => p.placements);
    assert.equal(all.filter(p => p.kind === 'cue-divider').length, 1);
    assert.equal(all.filter(p => p.kind === 'separator').length, 1);
    assert.equal(mainText(plan, 'body'), 'BODY_PRESENTSECOND_BODY');
  }
});

test('blank editable cues do not allocate inline or sidebar content pages', () => {
  for (const layout of layouts) {
    const note = baseNote();
    const settings = {...defaultSettings(), layout};
    const without = planPages(ctx, note, settings);
    note.cues = Array.from({length: 36}, () => ({keyword: ' \t', note: '\n '}));
    const before = structuredClone(note);
    const plan = planPages(ctx, note, settings);
    assertContentPages(plan, layout);
    assert.equal(plan.pages.length, without.pages.length, layout);
    assert.equal(plan.cuePages.flat().length, 0, layout);
    assert.equal(mainText(plan, 'body'), 'BODY_PRESENT');
    assert.deepEqual(note, before, 'rendering may not rewrite editable cue data');
  }
});

test('blank lines inside a nonempty description remain in its wrapped content', () => {
  const note = baseNote();
  note.cues = [{keyword: 'KEY', note: 'FIRST\n\nLAST'}];
  for (const layout of ['hybrid-cornell', 'classic-cornell']) {
    const plan = planPages(ctx, note, {...defaultSettings(), layout});
    assert.deepEqual(plan.cuePages.flat().flatMap(cue => cue.noteLines), ['FIRST', '', 'LAST']);
    assertContentPages(plan, layout);
  }
});

test('cue/heading boundary sweep preserves facts without contentless pages', () => {
  for (const layout of layouts) {
    for (const lineCount of [0, 1, 24, 25, 26, 27, 28, 29, 30, 54, 56, 58]) {
      for (const heading of ['', 'HEADING', 'LONG_HEADING'.repeat(200)]) {
        const note = baseNote();
        note.cues = [{keyword: 'KEY', note: Array(lineCount).fill('Fact').join('\n')}];
        note.sections[0].heading = heading;
        const plan = planPages(ctx, note, {...defaultSettings(), layout});
        const label = `${layout}/${lineCount}/${heading.length}`;
        assertContentPages(plan, label);
        assert.equal(mainText(plan, 'heading'), heading, label);
        assert.equal(mainText(plan, 'body'), 'BODY_PRESENT', label);
        if (plan.side) {
          assert.equal(sideText(plan, 'keyLines'), 'KEY', label);
          assert.equal(sideText(plan, 'noteLines'), 'Fact'.repeat(lineCount), label);
        } else {
          assert.equal(mainText(plan, 'cue-body'), 'KEY' + (lineCount ? '  /  ' + 'Fact'.repeat(lineCount) : ''), label);
        }
      }
    }
  }
});

test('empty-description sweep retains every keyword across sidebar continuations', () => {
  for (const layout of ['hybrid-cornell', 'classic-cornell']) {
    for (let count = 1; count <= 30; count++) {
      for (const keyLines of [1, 2, 4]) {
        const note = baseNote();
        note.cues = Array.from({length: count}, (_, index) => ({
          keyword: String(index).padStart(2, '0') + 'K'.repeat(keyLines * 12), note: index % 2 ? '' : ' \t\n '
        }));
        const plan = planPages(ctx, note, {...defaultSettings(), layout});
        assertContentPages(plan, `${layout}/${count}/${keyLines}`);
        assert.equal(sideText(plan, 'keyLines'), note.cues.map(cue => cue.keyword).join(''));
        assert.deepEqual(plan.cuePages.flat().flatMap(cue => cue.noteLines), []);
      }
    }
  }
});
