import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {analysisResponse} from '../src/composite/analysis-response.mjs';
const request={model:'configured-model',reasoning:{effort:'max'},max_output_tokens:40000,input:'evidence',background:true};
const hash=r=>crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex');
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
const complete={id:'good',status:'completed',model:'configured-model',output:[{content:[{type:'output_text',text:JSON.stringify({labels:[{label:'Bridge'}]})}]}]};
async function fixture(t){const work=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-analysis-'));t.after(()=>fs.rm(work,{recursive:true,force:true}));return work;}
test('completed legacy passes are reused without a request',async t=>{
 const work=await fixture(t),saved={requestHash:hash(request),report:{labels:[{label:'Existing'}]}};
 await fs.writeFile(path.join(work,'ai-timeline.json'),JSON.stringify(saved));
 const result=await analysisResponse({name:'timeline',request,work,fetchImpl:async()=>assert.fail('Do not pay again')});assert.deepEqual(result,saved);
});
test('truncated pending response is archived and retried once at larger budget, preserving maximum effort',async t=>{
 const work=await fixture(t);await fs.writeFile(path.join(work,'ai-timeline-pending.json'),JSON.stringify({requestHash:hash(request),responseId:'old'}));
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});if(options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.max_output_tokens,80000);assert.equal(body.reasoning.effort,'max');return response(complete);}return response({id:'old',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{output_tokens:40000}});};
 const result=await analysisResponse({name:'timeline',request,work,fetchImpl});assert.equal(result.report.labels[0].label,'Bridge');assert.equal(calls.length,2);
 assert.ok((await fs.readdir(work)).some(f=>f.includes('-terminal-')));
 assert.equal((await analysisResponse({name:'timeline',request,work,fetchImpl:async()=>assert.fail('Cache miss')})).maxOutputTokens,80000);
});
test('billing failure clears a terminal response and next attempt can succeed',async t=>{
 const work=await fixture(t);await fs.writeFile(path.join(work,'ai-timeline-pending.json'),JSON.stringify({requestHash:hash(request),responseId:'failed'}));
 await assert.rejects(analysisResponse({name:'timeline',request,work,fetchImpl:async()=>response({id:'failed',status:'failed',error:{code:'credit_balance_exhausted',message:'No credits'}})}),{code:'credit_balance_exhausted'});
 await assert.rejects(fs.access(path.join(work,'ai-timeline-pending.json')));
 const result=await analysisResponse({name:'timeline',request,work,fetchImpl:async(url,o)=>{assert.equal(o.method,'POST');return response(complete);}});assert.equal(result.responseId,'good');
});
test('repeated truncation stops at the configured ceiling without accepting partial labels',async t=>{
 const work=await fixture(t);let count=0;
 await assert.rejects(analysisResponse({name:'timeline',request,work,fetchImpl:async()=>{count++;return response({id:`bad-${count}`,status:'incomplete',incomplete_details:{reason:'max_output_tokens'}});}}),{code:'max_output_tokens'});
 assert.equal(count,2);await assert.rejects(fs.access(path.join(work,'ai-timeline.json')));
});
test('temporary poll transport failure retains and resumes the same request',async t=>{
 const work=await fixture(t);let posts=0,gets=0;
 const result=await analysisResponse({name:'timeline',request,work,pollMs:0,fetchImpl:async(url,o)=>{if(o.method==='POST'){posts++;return response({id:'running',status:'queued'});}if(++gets===1)throw new Error('connection reset');return response(complete);}});
 assert.equal(result.report.labels.length,1);assert.equal(posts,1);assert.equal(gets,2);
});
test('HTTP quota errors are classified and never blindly retried',async t=>{
 const work=await fixture(t);let count=0;await assert.rejects(analysisResponse({name:'timeline',request,work,fetchImpl:async()=>{count++;return response({error:{code:'insufficient_quota',message:'Balance exhausted'}},429);}}),{code:'insufficient_quota'});assert.equal(count,1);
});
