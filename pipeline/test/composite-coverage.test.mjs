import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedCoverage} from '../src/composite/media.mjs';
const review={sourceFingerprint:'same-source',decision:'dark-scene-false-positive',reason:'Road under an overpass is captured below the crop boundary.',frames:[309,310]};
test('coverage exceptions are specific to reviewed frames and unchanged source bytes',()=>{
 assert.equal(reviewedCoverage([],null,'same-source',977),null);
 assert.deepEqual(reviewedCoverage([309,310],review,'same-source',977).frames,[309,310]);
 for(const r of [null,{...review,sourceFingerprint:'different'},{...review,frames:[309]},{...review,frames:[309,310,1000]},{...review,decision:'skip'},{...review,reason:''}])assert.throws(()=>reviewedCoverage([309,310],r,'same-source',977));
 assert.throws(()=>reviewedCoverage([309,310,400],review,'same-source',977));
});
