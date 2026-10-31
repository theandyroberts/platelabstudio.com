import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createFeedbackServer, resendSender, loadFeedbackClip} from './server.mjs';

const origin = 'https://platelabstudio.com';
const labels = new Map([['scene-1','Bridge arches']]);
const payload = () => ({submissionId:randomUUID(),clipId:'roll-001-clip-020',name:'Review test',email:'reviewer@example.com',message:'Make the category names easier to scan.',website:'',posterTime:18,labelDecisions:{'scene-1':'accepted'}});
test('editorial mood decisions validate and retain the reviewed names in feedback',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-editorial-feedback-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'clip.json');
  await fs.writeFile(file,JSON.stringify({id:'roll-001-clip-020',sourceFingerprint:'source',title:'Bridge',media:{duration:68},labels:[{id:'scene-1',label:'Old bridge',category:'scene'}]}));
  const editorial={schema:'tpl.label-editorial.v1',sourceFingerprint:'source',patches:[{id:'scene-1',expected:{label:'Old bridge',category:'scene'},changes:{label:'Concrete-arch bridge'}}],moods:[{id:'mood-1',sourceLabelId:'scene-1',category:'mood',label:'Quiet awe'}]};
  await fs.writeFile(path.join(dir,'label-editorial.json'),JSON.stringify(editorial));
  const f=await fixture(t,{loadClip:()=>loadFeedbackClip(file)});
  assert.equal((await f.post({...payload(),labelDecisions:{'mood-1':'accepted','scene-1':'accepted'}})).status,200);
  assert.match(f.calls[0][0].text,/Quiet awe/);assert.match(f.calls[0][0].text,/Concrete-arch bridge/);
  editorial.sourceFingerprint='other';await fs.writeFile(path.join(dir,'label-editorial.json'),JSON.stringify(editorial));
  await assert.rejects(()=>loadFeedbackClip(file),/source mismatch/);
});
async function fixture(t, options={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-feedback-test-'));
  const calls=[];
  const server=createFeedbackServer({dataDir:dir,labels,from:'TPL <accounts@example.com>',send:async (...args)=>{calls.push(args);return 'provider-message-id';},...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/composite-review/api/feedback`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  return {dir,calls,url,post:(body,headers={})=>fetch(url,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)})};
}
test('emails only the fixed recipient with reply-to, context, and a durable receipt',async t=>{
  const f=await fixture(t); const body={...payload(),to:'unwanted@example.com'};
  assert.equal((await f.post(body)).status,200);
  const mail=f.calls[0][0];assert.deepEqual(mail.to,['andy@note15.com']);assert.equal(mail.reply_to,body.email);
  assert.match(mail.text,/Bridge arches/);assert.match(mail.text,/18.00 seconds/);assert.match(mail.text,/composite-review/);
  const receipt=JSON.parse(await fs.readFile(path.join(f.dir,`${body.submissionId}.json`)));
  assert.equal(receipt.status,'sent');assert.equal(receipt.feedback.message,body.message);
});
test('duplicate and simultaneous retries send once; changing a reused id is rejected',async t=>{
  const f=await fixture(t);const body=payload();
  const results=await Promise.all([f.post(body),f.post(body)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
  assert.equal((await f.post(body)).status,200);assert.equal(f.calls.length,1);
  assert.equal((await f.post({...body,message:'A changed message'})).status,409);
});
test('provider failure retains the record, reports failure, and retries with the same id',async t=>{
  let fails=true;const ids=[];
  const f=await fixture(t,{send:async(mail,id)=>{ids.push(id);if(fails)throw Error('offline');return 'success';}});const body=payload();
  assert.equal((await f.post(body)).status,502);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.dir,`${body.submissionId}.json`))).status,'pending');
  fails=false;assert.equal((await f.post(body)).status,200);assert.deepEqual(ids,[body.submissionId,body.submissionId]);
});
test('rejects invalid origin, method, body type, oversized input and malformed JSON before sending',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post(payload(),{origin:'https://unrelated.example'})).status,403);
  assert.equal((await fetch(f.url)).status,405);
  assert.equal((await f.post(payload(),{'content-type':'text/plain'})).status,415);
  assert.equal((await f.post('x'.repeat(33000))).status,413);
  assert.equal((await f.post('{broken')).status,400);assert.equal(f.calls.length,0);
});
test('rejects missing comments, honeypot, unknown labels and header injection',async t=>{
  const f=await fixture(t);
  for(const bad of [{message:' '},{website:'spam'},{labelDecisions:{unknown:'accepted'}},{email:'one@example.com\r\nBcc: other@example.com'},{name:'Test\r\nHeader'},{posterTime:100},{clipId:'unknown'}])assert.equal((await f.post({...payload(),...bad})).status,400);
  assert.equal(f.calls.length,0);
});
test('global rate limit rejects excess new sends while permitting confirmed retries',async t=>{
  const f=await fixture(t,{hourlyLimit:1});const body=payload();
  assert.equal((await f.post(body)).status,200);assert.equal((await f.post(payload())).status,429);assert.equal((await f.post(body)).status,200);assert.equal(f.calls.length,1);
});
test('old ambiguous receipts do not resend outside the provider idempotency window',async t=>{
  let clock=Date.now();const f=await fixture(t,{now:()=>clock,send:async()=>{throw Error('timeout');}});const body=payload();
  assert.equal((await f.post(body)).status,502);clock+=24*3600000;assert.equal((await f.post(body)).status,409);
});
test('email adapter uses server-only credentials and the stable provider idempotency key',async()=>{
  let request;
  const send=resendSender({apiKey:'test-secret',fetchImpl:async(url,options)=>{request={url,...options};return new Response(JSON.stringify({id:'email-id'}),{status:200});}});
  assert.equal(await send({to:['andy@note15.com'],text:'test'},'submission-id'),'email-id');
  assert.equal(request.headers.Authorization,'Bearer test-secret');assert.equal(request.headers['Idempotency-Key'],'tpl-review/submission-id');
  const rejected=resendSender({apiKey:'test',fetchImpl:async()=>new Response('{}',{status:503})});
  await assert.rejects(()=>rejected({},'id'));
});
test('new catalog clips use their own title, labels, duration and review URL',async t=>{
  const clip={id:'clip-new',title:'Desert road at sunset',media:{duration:120},labels:[{id:'desert-1',label:'Desert scrub'}]};
  const f=await fixture(t,{loadClip:async()=>clip});
  const body={...payload(),clipId:clip.id,posterTime:90,labelDecisions:{'desert-1':'accepted'}};
  assert.equal((await f.post(body)).status,200);
  assert.match(f.calls[0][0].subject,/Desert road/);assert.match(f.calls[0][0].text,/review\/clip-new/);assert.match(f.calls[0][0].text,/Desert scrub/);
  assert.equal((await f.post({...body,submissionId:randomUUID(),posterTime:120})).status,400);
});

test('allows the new domain, www and the legacy review origin',async t=>{
  const f=await fixture(t);
  for(const origin of ['https://platelabstudio.com','https://www.platelabstudio.com','https://theplatelab.studio'])assert.equal((await f.post(payload(),{origin})).status,200);
  assert.match(f.calls[0][0].text,/https:\/\/platelabstudio\.com\/composite-review\//);
});
