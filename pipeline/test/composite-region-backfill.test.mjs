import test from 'node:test';import assert from 'node:assert/strict';
import {mergeRegions} from '../src/composite/backfill-regions.mjs';
const label={id:'a',label:'Sign',detail:'Visible sign',evidenceIds:['frame-1'],editorialStatus:'accepted'};
const original={sourceFingerprint:'fp',title:'Preserve title',tags:['sign'],frames:[{id:'frame-1'}],labels:[label]};
const marked={...original,title:'Do not replace',labels:[{...label,editorialStatus:'changed',regionScope:'localized',regionNote:'Approximate',regions:[{evidenceId:'frame-1',x:.1,y:.2,width:.3,height:.1,confidence:.9}]}],localization:{status:'complete'}};
test('backfill patches only region fields while preserving editorial data',()=>{const result=mergeRegions(original,marked);assert.equal(result.title,original.title);assert.equal(result.labels[0].editorialStatus,'accepted');assert.equal(result.labels[0].regions.length,1);assert.equal(original.labels[0].regions,undefined);});
test('backfill rejects changed source, descriptions and unsupported frame geometry',()=>{
 assert.throws(()=>mergeRegions(original,{...marked,sourceFingerprint:'wrong'}));
 for(const patch of [{detail:'Changed'},{evidenceIds:['other']},{regions:[{...marked.labels[0].regions[0],evidenceId:'other'}]},{regions:[{...marked.labels[0].regions[0],width:5}]}])assert.throws(()=>mergeRegions(original,{...marked,labels:[{...marked.labels[0],...patch}]}));
});
