import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validRegion,regionsFor,preferredEvidence,validateRegionReport,applyRegionOverrides} from '../../shared/composite/regions.mjs';
import {localize,localizeBatch,localizeForPublish} from '../src/composite/localize.mjs';
const region={evidenceId:'detail-1',x:.1,y:.2,width:.3,height:.4,confidence:.9};
const frame={id:'detail-1'},other={id:'frame-2'};
const label={id:'a',label:'Billboard',evidenceIds:['frame-2','detail-1']};
const item={label,frame};
const report={labels:[{id:'a',scope:'localized',note:'Visible billboard',regions:[region]}]};
test('normalized boxes reject invalid geometry, nonfinite values and low confidence',()=>{
  assert.ok(validRegion(region));
  for(const patch of [{x:-.1},{width:0},{height:-1},{x:.8},{y:.9},{confidence:.79},{confidence:2},{width:NaN},{height:Infinity}])assert.equal(validRegion({...region,...patch}),false);
  assert.ok(validRegion({...region,x:0,y:0,width:1,height:1}));
});
test('regions are frame-specific and preferred evidence follows the valid marked image',()=>{
  const marked={...label,regions:[region,{...region,evidenceId:'unknown',confidence:1}]};
  const index=new Map([[frame.id,frame],[other.id,other]]);
  assert.deepEqual(regionsFor(marked,'frame-2'),[]);
  assert.equal(regionsFor(marked,'detail-1').length,1);
  assert.equal(preferredEvidence(marked,index),frame);
  assert.equal(preferredEvidence(label,index),frame);
});
test('reports require complete unique labels, consistent scopes and assigned evidence',()=>{
  assert.equal(validateRegionReport(report,[item]),report);
  assert.throws(()=>validateRegionReport({labels:[]},[item]));
  assert.throws(()=>validateRegionReport({labels:[report.labels[0],report.labels[0]]},[item,{label:{...label,id:'b'},frame}]));
  for(const patch of [{id:'wrong'},{scope:'whole_frame'},{regions:[]},{regions:[{...region,evidenceId:'frame-2'}]},{regions:[region,region,region,region]}])assert.throws(()=>validateRegionReport({labels:[{...report.labels[0],...patch}]},[item]));
  for(const scope of ['whole_frame','unresolved'])assert.doesNotThrow(()=>validateRegionReport({labels:[{id:'a',scope,note:'No specific subject',regions:[]}]},[item]));
});
const record={sourceFingerprint:'source1',labels:[label],evidence:[frame,other]};
const overrides={sourceFingerprint:'source1',labels:[{id:'a',regions:[region],regionScope:'localized',regionNote:'Visually checked approximate area'}]};
test('reviewed rectangles cannot attach to a different source, unknown label or unsupported frame',()=>{
  const updated=applyRegionOverrides(record,overrides);
  assert.equal(updated.labels[0].label,'Billboard');
  assert.equal(updated.labels[0].regionMethod,'assistant-visual-review');
  assert.equal(record.labels[0].regions,undefined);
  assert.throws(()=>applyRegionOverrides(record,{...overrides,sourceFingerprint:'another'}));
  assert.throws(()=>applyRegionOverrides(record,{...overrides,labels:[{...overrides.labels[0],id:'another'}]}));
  assert.throws(()=>applyRegionOverrides(record,{...overrides,labels:[{...overrides.labels[0],regions:[{...region,evidenceId:'unknown'}]}]}));
});
test('optional analysis failure preserves labels and reviewed boxes for publication with pending status',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-regions-'));
  try{
    await fs.writeFile(path.join(dir,'region-overrides.json'),JSON.stringify(overrides));
    const result=await localizeForPublish(record,dir,dir,async()=>{throw new Error('credit_balance_exhausted');});
    assert.equal(result.localization.status,'partial');
    assert.equal(result.localization.localizedLabels,1);
    assert.equal(result.labels[0].label,'Billboard');
    assert.deepEqual(result.labels[0].regions,[region]);
    assert.ok((await fs.readFile(path.join(dir,'localization-error.json'),'utf8')).includes('credit_balance_exhausted'));
    assert.ok(!JSON.stringify(result).includes('credit_balance_exhausted'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('region requests retain maximum effort with sufficient output space and reuse completed receipts',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-regions-'));
 try{
  await fs.writeFile(path.join(dir,'frame.jpg'),'test image');
  const items=[{label,frame:{...frame,file:'frame.jpg'}}];let count=0;
  const respond=async({request})=>{count++;assert.equal(request.max_output_tokens,80000);assert.equal(request.reasoning.effort,'max');return {report,createdAt:'now'};};
  await localizeBatch(items,dir,dir,1,respond);await localizeBatch(items,dir,dir,1,async()=>assert.fail('Must reuse validated receipt'));assert.equal(count,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a failed parallel batch does not discard its successful partner',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tpl-regions-'));
 try{
  const labels=Array.from({length:11},(_,i)=>({...label,id:`label-${i}`}));
  const source={...record,labels};
  await assert.rejects(localize(source,dir,dir,{runBatch:async(items,out,work,n)=>{
   if(n===2)throw new Error('Truncated second batch');
   return {report:{labels:items.map(item=>({id:item.label.id,scope:'localized',note:'Visible',regions:[region]}))}};
  }}),/Truncated/);
  const partial=JSON.parse(await fs.readFile(path.join(dir,'localization-progress.json')));
  assert.equal(partial.localization.localizedLabels,10);assert.equal(partial.localization.processedLabels,10);
  const result=await localizeForPublish(source,dir,dir,async()=>{throw Error('Retry needed');});
  assert.equal(result.localization.status,'partial');assert.equal(result.labels.filter(l=>l.regions?.length).length,10);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
