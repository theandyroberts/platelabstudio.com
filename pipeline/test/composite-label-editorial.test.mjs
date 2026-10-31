import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLabelEditorial} from '../../shared/composite/label-editorial.mjs';
const label={id:'a',category:'scene',label:'Old scene',detail:'A lit tunnel',start:2,end:5,evidenceIds:['f'],evidence:'visual',confidence:.9,regions:[{evidenceId:'f',x:.1,y:.1,width:.3,height:.3,confidence:.9}],regionScope:'localized'};
const record={sourceFingerprint:'one',media:{duration:10},frames:[{id:'f',t:3}],labels:[label],tags:['tunnel']};
const edit={schema:'tpl.label-editorial.v1',sourceFingerprint:'one',patches:[{id:'a',expected:{label:'Old scene',category:'scene'},changes:{label:'Graffiti-lined tunnel'}}],moods:[{id:'mood-a',sourceLabelId:'a',category:'mood',label:'Mounting dread',detail:'Enclosure and diminishing light feel foreboding.',start:2,end:5,evidenceIds:['f']}]};
test('editorial scenes preserve the latest localization and add timed, unboxed moods',()=>{
  const live=structuredClone(record);live.labels[0].regions[0].x=.2;
  const result=applyLabelEditorial(live,edit);
  assert.equal(result.labels[0].label,'Graffiti-lined tunnel');
  assert.equal(result.labels[0].regions[0].x,.2);
  assert.equal(result.labels[1].category,'mood');assert.equal(result.labels[1].evidence,'inference');
  assert.deepEqual(result.labels[1].regions,[]);assert.equal(result.labels[1].regionScope,'whole_frame');
  assert.equal(live.labels.length,1);assert.equal(live.labels[0].label,'Old scene');
});
test('editorial changes fail closed for changed sources, stale wording, missing frames or invalid timing',()=>{
  for(const mutate of [e=>e.sourceFingerprint='other',e=>e.patches[0].expected.label='Other',e=>e.moods[0].evidenceIds=['missing'],e=>e.moods[0].end=20,e=>e.moods[0].start=4,e=>e.moods[0].id='a',e=>e.patches[0].changes.regions=[]]){
    const e=structuredClone(edit);mutate(e);assert.throws(()=>applyLabelEditorial(record,e));
  }
});
test('mood language does not become factual search tags',()=>{
  const e=structuredClone(edit);e.moods[0].label='Bridge nostalgia';
  assert.ok(!applyLabelEditorial(record,e).tags.includes('bridge'));
  assert.equal(applyLabelEditorial(record,null),record);
});
