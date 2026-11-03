import assert from 'node:assert/strict';
import test from 'node:test';
import {routeSpeeds} from '../lib/routeStats';
const degreesPerMeter=180/(Math.PI*6371000);
const fix=(t:number,meters:number)=>({t,lat:0,lon:meters*degreesPerMeter});

test('speeds use elapsed time weighting and retain stationary fixes',()=>{
  const result=routeSpeeds([[fix(0,0),fix(1,10),fix(3,20),fix(4,20)]]);
  assert.ok(result);
  assert.ok(Math.abs(result.average-18)<1e-8);
  assert.ok(Math.abs(result.max-36)<1e-8);
  assert.equal(result.min,0);
});
test('route boundaries, long gaps and invalid fixes do not create speeds',()=>{
  assert.equal(routeSpeeds([[fix(0,0)],[fix(1,1000)]]),null);
  assert.equal(routeSpeeds([[fix(0,0),fix(10,1000)]]),null);
  assert.equal(routeSpeeds([[fix(0,0),fix(0,1000),{t:1,lat:NaN,lon:0}]]),null);
  assert.equal(routeSpeeds([]),null);
});
test('GPS logger timestamps take precedence over video sampling intervals',()=>{
  const result=routeSpeeds([[{...fix(0,0),clock:'2024-01-04T00:00:00Z'},{...fix(.25,10),clock:'2024-01-04T00:00:01Z'}]]);
  assert.ok(result);
  assert.ok(Math.abs(result.average-36)<1e-8);
});
