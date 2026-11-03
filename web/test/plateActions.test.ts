import assert from 'node:assert/strict';
import test from 'node:test';
import {addPlateToScene,plateActionReturnPath} from '../lib/plateActions';
function api(replies:{status?:number;body:unknown}[]){
  const calls:{url:string;init?:RequestInit}[]=[];
  const request=async(url:RequestInfo|URL,init?:RequestInit)=>{
    calls.push({url:String(url),init});const reply=replies.shift();assert.ok(reply,'Unexpected request');
    return new Response(JSON.stringify(reply.body),{status:reply.status??200});
  };
  return {calls,request:request as typeof fetch};
}
test('Add to Project saves without selecting for order',async()=>{
  const {calls,request}=api([{body:{id:'saved'}}]);
  await addPlateToScene('scene','PL-123','project',request);
  assert.equal(calls.length,1);assert.deepEqual(JSON.parse(String(calls[0].init?.body)),{sceneId:'scene',sku:'PL-123'});
});
test('Add to Order uses current version and does not modify saved ranges',async()=>{
  const {calls,request}=api([{body:{id:'saved'}},{body:{authenticated:true,clips:[{id:'saved',status:'considering',version:7,inFrame:24,outFrame:48}]}},{body:{status:'selected',version:8}}]);
  await addPlateToScene('scene','PL-123','order',request);
  assert.equal(calls[2].url,'/api/scene-clips/saved/status');
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)),{status:'selected',expectedVersion:7});
});
test('existing order and submitted selections are not reset',async()=>{
  for(const status of ['selected','submitted']){
    const {calls,request}=api([{body:{id:'saved'}},{body:{authenticated:true,clips:[{id:'saved',status,version:3}]}}]);
    await addPlateToScene('scene','PL-123','order',request);assert.equal(calls.length,2);
  }
});
test('authentication, access denial and version conflicts never report success',async()=>{
  for(const status of [401,403]){
    const {calls,request}=api([{status,body:{error:'Access denied'}}]);
    await assert.rejects(addPlateToScene('scene','PL-123','order',request),{status});assert.equal(calls.length,1);
  }
  const {request}=api([{body:{id:'saved'}},{body:{authenticated:true,clips:[{id:'saved',status:'considering',version:7}]}},{status:409,body:{error:'Record changed. Retry.'}}]);
  await assert.rejects(addPlateToScene('scene','PL-123','order',request),/saved to your project, but was not added to the order/);
});
test('project creation accepts only local plate return paths',()=>{
  assert.equal(plateActionReturnPath('/plate/PL-123?action=order&from=%2Fbrowse'),'/plate/PL-123?action=order&from=%2Fbrowse');
  for(const path of ['https://evil.test/plate/PL-123','//evil.test','/projects','/plate/../../evil','/plate/PL-123/extra',null])assert.equal(plateActionReturnPath(path),null);
});
