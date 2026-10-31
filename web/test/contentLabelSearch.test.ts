import assert from 'node:assert/strict';
import test from 'node:test';
import {matchesContentLabel} from '../lib/contentLabelSearch';

const mateo={label:'Mateo Street junction identified at the western landing',detail:'The junction is visible ahead in the 56-, 60- and 64-second samples. The camera reaches the near crosswalk around 66 seconds.'};
test('intersection queries find the existing Mateo junction observation',()=>{
  for(const query of ['intersection','intersections','junction','crossroads','  MATEO intersection  ','intersection Mateo'])assert.ok(matchesContentLabel(mateo,query),query);
});
test('junction queries also find labels written as intersections',()=>{
  assert.ok(matchesContentLabel({label:'Signalized intersection',detail:'Cars wait at the lights.'},'junctions'));
});
test('search respects all words and does not invent intersections from bridge crossings',()=>{
  assert.equal(matchesContentLabel(mateo,'intersection Kansas'),false);
  assert.equal(matchesContentLabel({label:'Bridge crossing',detail:'Crossing the river beneath concrete arches.'},'intersection'),false);
  assert.equal(matchesContentLabel({label:'Pedestrian crossing',detail:'Marked crosswalk.'},'intersection'),false);
});
test('common traffic signal and pedestrian crossing vocabulary is interchangeable',()=>{
  assert.ok(matchesContentLabel(mateo,'pedestrian crossing'));
  assert.ok(matchesContentLabel({label:'Operating junction signals',detail:'Green signal heads face the route.'},'traffic lights'));
});
test('punctuation, case, accents, and excess whitespace do not hide results',()=>{
  assert.ok(matchesContentLabel({label:'Café at Mateo Street',detail:'A junction-entry view.'},' CAFE   junction entry '));
  assert.ok(matchesContentLabel(mateo,'   '));
});
