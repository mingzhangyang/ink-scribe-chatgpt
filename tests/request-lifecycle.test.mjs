import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationGate} from '../public/assets/request-lifecycle.js';

test('editing a note invalidates late AI content before it can be applied',()=>{
  const gate=createGenerationGate();
  const first=gate.begin();
  assert.equal(gate.isCurrent(first),true);
  gate.invalidate();
  assert.equal(first.signal.aborted,true);
  assert.equal(gate.isCurrent(first),false);
  assert.equal(gate.finish(first),false);
  const second=gate.begin();
  assert.equal(gate.isCurrent(second),true);
  assert.equal(gate.finish(second),true);
});

test('starting a newer AI generation invalidates a previously pending response',()=>{
  const gate=createGenerationGate();
  const first=gate.begin();
  const second=gate.begin();
  assert.equal(first.signal.aborted,true);
  assert.equal(gate.isCurrent(first),false);
  assert.equal(gate.isCurrent(second),true);
});
