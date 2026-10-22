import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest,parseModelResponse} from '../worker/router.js';
import {EXAMPLE} from '../public/assets/offline.js';
import {ContractError} from '../public/assets/contracts.js';
const url='https://inkscribe.test/api/structure';
const body={text:'叶子把光能变为化学能。',template:'reading-notes',language:'auto',style:'hybrid-cornell'};
const req=(data=body,options={})=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),...options});
function env(options={}){
  return {AI:{async run(){return {response:JSON.stringify(EXAMPLE)};}},STRUCTURE_LIMITER:{async limit(){return {success:true};}},...options};
}
async function errorCode(response){const json=await response.json();return [response.status,json.error?.code];}

test('successful response has normalized structure and no-store headers',async()=>{
  const response=await handleRequest(req(),env());
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await response.json()).structure.title,EXAMPLE.title);
});
test('non-API path uses static asset binding',async()=>{
  const response=await handleRequest(new Request('https://inkscribe.test/'),{ASSETS:{fetch:()=>new Response('hello')}});
  assert.equal(await response.text(),'hello');
});
test('unsupported route and methods get stable status and code',async()=>{
  assert.deepEqual(await errorCode(await handleRequest(new Request('https://inkscribe.test/api/doodle'),env())),[404,'NOT_FOUND']);
  const response=await handleRequest(new Request(url),env());
  assert.deepEqual(await errorCode(response),[405,'INVALID_METHOD']);
  assert.equal(response.headers.get('allow'),'POST');
});
test('content type and JSON validation',async()=>{
  assert.deepEqual(await errorCode(await handleRequest(req(body,{headers:{'content-type':'text/plain'}}),env())),[415,'INVALID_CONTENT_TYPE']);
  assert.deepEqual(await errorCode(await handleRequest(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:'{' }),env())),[400,'INVALID_BODY']);
  assert.deepEqual(await errorCode(await handleRequest(req({...body,text:''}),env())),[400,'TEXT_REQUIRED']);
  assert.deepEqual(await errorCode(await handleRequest(req({...body,style:'alien'}),env())),[400,'INVALID_OPTIONS']);
});
test('body limit enforced even when content-length is absent',async()=>{
  assert.deepEqual(await errorCode(await handleRequest(req({...body,text:'字'.repeat(15000)}),env())),[413,'BODY_TOO_LARGE']);
});
test('AI or limiter binding missing causes unavailable, not unauthenticated fallback',async()=>{
  assert.deepEqual(await errorCode(await handleRequest(req(),{})),[503,'AI_UNAVAILABLE']);
  assert.deepEqual(await errorCode(await handleRequest(req(),{AI:env().AI})),[503,'AI_UNAVAILABLE']);
});
test('rate limiter rejection does not call AI',async()=>{
  let called=false;
  const response=await handleRequest(req(),env({STRUCTURE_LIMITER:{limit:async()=>({success:false})},AI:{run:async()=>{called=true;}}}));
  assert.deepEqual(await errorCode(response),[429,'RATE_LIMITED']);assert.equal(called,false);
  assert.equal(response.headers.get('retry-after'),'60');
});
test('malformed AI JSON gets only one bounded retry',async()=>{
  let called=0;
  const response=await handleRequest(req(),env({AI:{run:async()=>{called++;return {response:'not valid JSON'};}}}));
  assert.deepEqual(await errorCode(response),[502,'AI_OUTPUT_INVALID']);assert.equal(called,2);
});
test('invalid AI JSON followed by valid JSON is accepted',async()=>{
  let called=0;
  const response=await handleRequest(req(),env({AI:{run:async()=>({response:++called===1?'invalid':JSON.stringify(EXAMPLE)})}}));
  assert.equal(response.status,200);assert.equal(called,2);
});
test('rate-limit provider errors mapped to stable code',async()=>{
  let called=0;
  const response=await handleRequest(req(),env({AI:{run:async()=>{called++;throw Object.assign(new Error('rate limited'),{status:429});}}}));
  assert.deepEqual(await errorCode(response),[429,'RATE_LIMITED']);assert.equal(called,1);
});
test('Workers AI OpenAI-compatible messages produce a note, not invalid JSON',async()=>{
  let call;
  const response=await handleRequest(req(),env({AI:{run:async(model,args)=>{
    call={model,args};
    return {choices:[{message:{role:'assistant',content:JSON.stringify(EXAMPLE),reasoning:null},finish_reason:'stop'}]};
  }}}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).structure.title,EXAMPLE.title);
  assert.equal(call.model,'@cf/zai-org/glm-4.7-flash');
  assert.equal(call.args.response_format.type,'json_schema');
  assert.equal(call.args.response_format.json_schema.name,'NoteStructure');
  assert.equal(call.args.response_format.json_schema.schema.additionalProperties,false);
});
test('model reasoning without assistant content never becomes user-facing structure',()=>{
  assert.throws(()=>parseModelResponse({choices:[{message:{role:'assistant',content:null,reasoning:JSON.stringify(EXAMPLE)}}]}),ContractError);
});
test('model JSON parser accepts fenced response and rejects arbitrary strings',()=>{ 
  assert.equal(parseModelResponse({response:'```json\n'+JSON.stringify(EXAMPLE)+'\n```'}).title,EXAMPLE.title);
  assert.throws(()=>parseModelResponse('just a story'));
});
