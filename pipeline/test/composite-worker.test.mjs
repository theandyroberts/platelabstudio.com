import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialize,tick,clipIdFor,publishReview,publicRecord,requiredProcessingSpace} from '../src/composite/worker.mjs';
import {writeJSON,json} from '../src/composite/core.mjs';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-worker-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await initialize(root);return root;}
async function upload(root,dir='ready',name='test-transfer'){await writeJSON(path.join(root,dir,name,'07-Delivery/website_package.json'),{stock_clip_id:'JOB_A/CLIP_1',assets:[{role:'stitched_composite'}]});}
async function fakeRun(root,source,id){const manifest=await json(path.join(source,'07-Delivery/website_package.json'));const out=path.join(root,'build',id);await fs.mkdir(out,{recursive:true});for(const file of ['composite.mp4','poster.jpg','motion.json','map.svg'])await fs.writeFile(path.join(out,file),'fixture');for(const dir of ['frames','views'])await fs.mkdir(path.join(out,dir),{recursive:true});await writeJSON(path.join(out,'clip.json'),{id,stockId:manifest.stock_clip_id,sourceFingerprint:'verified',baseURL:`/media/composite/${id}`,videoURL:`/media/composite/${id}/composite.mp4`,posterURL:`/media/composite/${id}/poster.jpg`,motionURL:`/media/composite/${id}/motion.json`,title:'Test drive',media:{fps:24,duration:2},tags:['bridge'],overrides:{notes:'private'},enrichment:{passes:[{name:'timeline',responseId:'private',requestHash:'private',model:'test'}]},publication:{warnings:[{code:'missing_source_watermark',blocking:false}]}});}
const options={inspect:async()=>({fingerprint:'verified'}),run:fakeRun};
test('label recovery reserves publication space only when all matching prepared media exists',async t=>{
 const root=await fixture(t),id='cached-clip',sourceBytes=11*1024**3;
 assert.equal(await requiredProcessingSpace(root,id,'verified',sourceBytes),sourceBytes*2);
 await fs.mkdir(path.join(root,'build',id,'frames'),{recursive:true});
 await fs.writeFile(path.join(root,'build',id,'composite.mp4'),'video');
 await fs.writeFile(path.join(root,'build',id,'frames/0.jpg'),'image');
 await writeJSON(path.join(root,'work',id,'media.json'),{fingerprint:'verified',frames:[{file:'frames/0.jpg'}],views:[]});
 assert.equal(await requiredProcessingSpace(root,id,'verified',sourceBytes),2*1024**3+20);
 assert.equal(await requiredProcessingSpace(root,id,'changed',sourceBytes),sourceBytes*2);
 await fs.rm(path.join(root,'build',id,'frames/0.jpg'));
 assert.equal(await requiredProcessingSpace(root,id,'verified',sourceBytes),sourceBytes*2);
});
test('partial uploads are ignored; committed packages publish with nonblocking watermark alert',async t=>{const root=await fixture(t);await upload(root,'uploading');assert.equal(await tick(root,options),undefined);await fs.rename(path.join(root,'uploading/test-transfer'),path.join(root,'ready/test-transfer'));const result=await tick(root,options);assert.equal(result.state,'published');assert.equal(result.warnings[0].blocking,false);assert.equal((await json(path.join(root,'public/catalog.json'))).length,1);const clip=await json(path.join(root,'public/media/composite',result.id,'clip.json'));assert.equal(clip.enrichment.passes[0].responseId,undefined);assert.deepEqual(clip.overrides,{});await fs.access(path.join(root,'archive/test-transfer'));});
test('invalid packages fail privately without running analysis or entering the catalog',async t=>{const root=await fixture(t);await upload(root);let ran=false;const result=await tick(root,{inspect:async()=>{throw new Error('Checksum mismatch');},run:async()=>{ran=true;}});assert.equal(result.state,'failed');assert.equal(ran,false);await fs.access(path.join(root,'failed/test-transfer'));await assert.rejects(fs.access(path.join(root,'public/catalog.json')));});
test('interrupted processing resumes and catalog publication is idempotent',async t=>{const root=await fixture(t);await upload(root,'processing');const result=await tick(root,options);await publishReview(root,result.id);assert.equal((await json(path.join(root,'public/catalog.json'))).length,1);});
test('same stock ID cannot silently replace different source bytes',async t=>{const root=await fixture(t);await upload(root);await tick(root,options);await upload(root,'ready','second-transfer');const result=await tick(root,{...options,inspect:async()=>({fingerprint:'changed'})});assert.equal(result.state,'failed');assert.match(result.error,/different source bytes/);assert.equal((await json(path.join(root,'public/catalog.json'))).length,1);});
test('clip identity is stable across take-folder naming and avoids normalization collisions',()=>{assert.equal(clipIdFor('Job/Clip'),clipIdFor('Job/Clip'));assert.notEqual(clipIdFor('Job/Clip'),clipIdFor('Job-Clip'));assert.throws(()=>clipIdFor(''));});
test('a duplicate transfer name cannot stall a later valid transfer',async t=>{const root=await fixture(t);await upload(root);await tick(root,options);await upload(root);await upload(root,'ready','z-next-transfer');const result=await tick(root,options);assert.equal(result.transfer,'z-next-transfer');assert.equal(result.state,'published');});

for(const number of ['0011','0019'])test(`existing MMM rough_stitch package for arbitrary clip ${number} reaches publication unchanged`,async t=>{
 const root=await fixture(t),transfer=`mmm-clip-${number}`;
 const manifest={schema:'spheris.stock.website_package.v1',stock_clip_id:`COMPAT-TEST-ROLL-1-CLIP-${number}`,selected_publish_asset_type:'rebuilt_nine_camera_proxies',assets:[{role:'rough_stitch',path:'06-Rough-Stitch/existing.mov'},{role:'camera_4_proxy',path:'04-Proxies/existing.mp4'}]};
 await writeJSON(path.join(root,'ready',transfer,'07-Delivery/website_package.json'),manifest);
 let inspected=false,ran=false;
 const result=await tick(root,{inspect:async(source,options)=>{assert.equal(options.compositeRole,'rough_stitch');assert.deepEqual(await json(path.join(source,'07-Delivery/website_package.json')),manifest);inspected=true;return{fingerprint:'verified'};},run:async(root,source,id,role)=>{assert.equal(role,'rough_stitch');ran=true;await fakeRun(root,source,id);}});
 assert.equal(result.state,'published');assert.ok(inspected&&ran);
 assert.deepEqual(await json(path.join(root,'archive',transfer,'07-Delivery/website_package.json')),manifest);
});
test('rough_stitch does not bypass checksum rejection for a new clip',async t=>{
 const root=await fixture(t);await writeJSON(path.join(root,'ready','rough-bad','07-Delivery/website_package.json'),{stock_clip_id:'NEW-MMM-CLIP',assets:[{role:'rough_stitch'}]});
 const result=await tick(root,{inspect:async()=>{throw new Error('Checksum mismatch: rough_stitch');},run:async()=>{assert.fail('Invalid source must not reach processing');}});
 assert.equal(result.state,'failed');assert.match(result.error,/Checksum mismatch/);
});

test('billing failure holds remaining uploads and retains the affected transfer for retry',async t=>{
 const root=await fixture(t);await upload(root);await upload(root,'ready','z-next-transfer');
 const result=await tick(root,{...options,run:async()=>{throw Object.assign(new Error('No credits'),{code:'credit_balance_exhausted'});}});
 assert.equal(result.state,'waiting_for_billing');await fs.access(path.join(root,'ready/test-transfer'));await fs.access(path.join(root,'queue-hold.json'));
 assert.equal(await tick(root,{...options,run:async()=>assert.fail('Held queue must not run')}),undefined);
 await fs.rm(path.join(root,'queue-hold.json'));
 assert.equal((await tick(root,options)).state,'published');assert.equal((await tick(root,options)).state,'published');
});
