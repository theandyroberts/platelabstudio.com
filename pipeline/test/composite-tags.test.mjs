import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCompositeTags,hasCompositeTag,canonicalTag} from '../../shared/composite/tags.mjs';
const observation=(label,extras={})=>({id:'label-1',label,category:'entities',confidence:.99,evidence:'visual',evidenceIds:['frame-1'],...extras});
test('encampment tags require an affirmative scene label, not a tarp alone',()=>{
  const scene=deriveCompositeTags([observation('Homeless encampment — sidewalk tents and tarps')]);
  assert.deepEqual(scene.tags,['homeless encampment','tent','tarp']);
  assert.equal(canonicalTag('homeless encampments'),'homeless encampment');
  assert.equal(hasCompositeTag(scene,'encampment'),true);
  assert.ok(!deriveCompositeTags([observation('Tarp-covered construction materials')]).tags.includes('homeless encampment'));
  assert.ok(!deriveCompositeTags([observation('Possible homeless encampment')]).tags.includes('homeless encampment'));
});
test('creates normalized tags with their supporting observations and frames',()=>{
  const data=deriveCompositeTags([observation('Concrete arches on the viaduct'),observation('Mateo Street junction',{id:'label-2',evidenceIds:['frame-2']})]);
  for(const tag of ['bridge','viaduct','arch','intersection','Mateo Street'])assert.ok(data.tags.includes(tag),tag);
  assert.deepEqual(data.tagEvidence.find(item=>item.tag==='intersection'),{tag:'intersection',labelIds:['label-2'],evidenceIds:['frame-2']});
});
test('ignores hypothetical, negated, uncertain, dismissed and unsupported content',()=>{
  const result=deriveCompositeTags([
    observation('Possible billboard'),observation('No billboard visible'),observation('Billboard',{evidence:'inference'}),
    observation('Kansas bridge double',{category:'location_comp'}),observation('Billboard',{confidence:.6}),
    observation('Billboard',{editorialStatus:'dismissed'}),observation('Billboard',{evidenceIds:[]}),
    observation('Trees',{detail:'No intersection or billboard is visible.'}),
  ]);
  assert.deepEqual(result.tags,['trees']);
});
test('billboard identity can be unknown without losing the observed billboard tag',()=>{
  assert.ok(deriveCompositeTags([observation('Unidentified approach billboard artwork',{category:'brands'})]).tags.includes('billboard'));
});
test('deduplicates tags and frames while retaining every supporting label',()=>{
  const result=deriveCompositeTags([observation('Bridge'),observation('Bridge arches',{id:'label-2'})]);
  assert.equal(result.tags.filter(tag=>tag==='bridge').length,1);
  assert.deepEqual(result.tagEvidence[0].labelIds,['label-1','label-2']);
  assert.deepEqual(result.tagEvidence[0].evidenceIds,['frame-1']);
});
test('tag results span clips, normalize aliases, and avoid substring false positives',()=>{
  const clips=[{id:'a',tags:['bridge','viaduct','arch']},{id:'b',tags:['bridge','intersection']},{id:'c',tags:['billboard']}];
  assert.deepEqual(clips.filter(clip=>hasCompositeTag(clip,'bridges')).map(clip=>clip.id),['a','b']);
  assert.deepEqual(clips.filter(clip=>hasCompositeTag(clip,'junction')).map(clip=>clip.id),['b']);
  assert.equal(canonicalTag('ARCHES'),'arch');
  assert.equal(hasCompositeTag({tags:['warehouse']},'house'),false);
  assert.equal(hasCompositeTag({},'billboard'),false);
  assert.equal(hasCompositeTag({},''),true);
});
