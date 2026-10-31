import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {billingHoldActive,BILLING_RECHECK_MS} from '../src/composite/billing-hold.mjs';
import {json,writeJSON} from '../src/composite/core.mjs';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-billing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('billing cooldown avoids repeated requests; restored credits release the queue',async t=>{
 const root=await fixture(t),old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-placeholder';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 const file=path.join(root,'queue-hold.json'),now=Date.now();await writeJSON(file,{reason:'api_billing',nextCheckAt:new Date(now+1000).toISOString()});
 assert.equal(await billingHoldActive(root,{now,fetchImpl:async()=>assert.fail('Do not poll early')}),true);
 assert.equal(await billingHoldActive(root,{now:now+2000,fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{code:'credit_balance_exhausted'}})})}),true);
 const hold=await json(file);assert.equal(Date.parse(hold.nextCheckAt),now+2000+BILLING_RECHECK_MS);
 assert.equal(await billingHoldActive(root,{now:now+2000+BILLING_RECHECK_MS,fetchImpl:async()=>({ok:true,status:200,json:async()=>({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})})}),false);
 await assert.rejects(fs.access(file));assert.ok((await fs.readdir(root)).some(f=>f.startsWith('queue-hold-resolved-')));
});
test('nonbilling manual hold is not automatically released',async t=>{
 const root=await fixture(t);await writeJSON(path.join(root,'queue-hold.json'),{reason:'maintenance'});assert.equal(await billingHoldActive(root,{fetchImpl:async()=>assert.fail('Do not poll')}),true);
});
