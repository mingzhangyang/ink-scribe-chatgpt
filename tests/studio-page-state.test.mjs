import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the real app entry point and event handlers with a paused animation
// frame. Only platform APIs are faked; makePlan(), paintPage() and copyPage()
// stay real, so an invalid index fails exactly as it does in the browser.
let instance = 0;
async function openStudio(t) {
  const elements = new Map(), frames = [], writes = [];
  function context() {
    const drawn = [];
    return new Proxy({
      drawn,
      measureText: text => ({width: [...String(text)].length * 11}),
      fillText: text => drawn.push(String(text)),
      createRadialGradient: () => ({addColorStop() {}})
    }, {get: (object, key) => key in object ? object[key] : () => {}});
  }
  class Element {
    constructor() {
      this.children = []; this.listeners = new Map(); this.dataset = {};
      this.style = {}; this.disabled = false; this.value = '';
      this.classList = {add() {}, remove() {}, toggle() {}};
      this.ctx = context();
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    get childElementCount() { return this.children.length; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    focus() {}
    getContext() { return this.ctx; }
    toBlob(callback, mime) { callback(new Blob([this.ctx.drawn.join('\n')], {type: mime})); }
    addEventListener(type, callback) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(callback); this.listeners.set(type, listeners);
    }
    async fire(type) {
      await Promise.all((this.listeners.get(type) || []).map(callback => callback({target: this})));
    }
  }
  const element = id => {
    if (!elements.has(id)) { const el = new Element(); el.id = id; }
    return elements.get(id);
  };
  const platform = {
    document: {getElementById: element, createElement: () => new Element(), querySelectorAll: () => []},
    window: {clearTimeout() {}, setTimeout() {}, isSecureContext: true},
    navigator: {clipboard: {async write(items) { writes.push(items); }}},
    ClipboardItem: class { constructor(data) { this.data = data; } },
    requestAnimationFrame: callback => frames.push(callback)
  };
  const originals = new Map(Object.keys(platform).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(platform)) Object.defineProperty(globalThis, key, {value, configurable: true});
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`../public/assets/app.js?studio-test=${instance++}`);
  const flush = () => { while (frames.length) frames.shift()(); };
  const edit = async (id, value) => { element(id).value = value; await element(id).fire('input'); };
  const pages = () => element('page-counter').textContent.split('/').map(Number);
  return {element, flush, edit, pages, writes, frames};
}

async function openLongNote(t) {
  const studio = await openStudio(t);
  studio.element('source-text').value = 'LONG_BODY '.repeat(100);
  await studio.element('offline').fire('click'); studio.flush();
  assert.ok(studio.pages()[1] > 1, 'fixture must have multiple pages');
  while (!studio.element('next-page').disabled) {
    await studio.element('next-page').fire('click'); studio.flush();
  }
  assert.ok(studio.pages()[0] > 1, 'fixture must be on a nonfirst page');
  return studio;
}

test('copy clamps a stale page after an edit, before the pending animation frame', async t => {
  const studio = await openLongNote(t);
  await studio.edit('field-2', 'SHORT_BODY');
  assert.ok(studio.frames.length, 'repaint must remain queued');
  await studio.element('copy').fire('click');
  assert.equal(studio.writes.length, 1, 'copy must write an image, not catch an invalid-page exception');
  const blob = studio.writes[0][0].data['image/png'];
  assert.match(await blob.text(), /SHORT_BODY/);
  assert.equal(studio.element('copy').disabled, false);
  studio.flush(); assert.deepEqual(studio.pages(), [1, 1]);
});

for (const direction of ['prev-page', 'next-page']) {
  test(`${direction} reads a rebuilt plan when content shrinks before repaint`, async t => {
    const studio = await openLongNote(t);
    await studio.edit('field-2', 'SHORT_BODY');
    await studio.element(direction).fire('click');
    studio.flush(); assert.deepEqual(studio.pages(), [1, 1]);
  });
}

test('copy can rebuild the initial plan before the first preview frame', async t => {
  const studio = await openStudio(t);
  await studio.element('copy').fire('click');
  assert.equal(studio.writes.length, 1);
  studio.flush(); assert.equal(studio.pages()[0], 1);
});
