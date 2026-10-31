import test from 'node:test'
import assert from 'node:assert/strict'
import {buildImuTrack,phoneToVehicle,MLS_DEFAULTS} from '../src/imu-motion.js'
const fixture=(rate=[0,0,0])=>({fps:30,frameCount:121,mounting:'upright-screen-rear',samples:Array.from({length:121},(_,frame)=>({frame,accel:[0,9.80665,0],gyro:rate}))})
test('documented phone mounting maps forward, right and up independently',()=>{assert.deepEqual(phoneToVehicle([0,0,-1]).toArray(),[1,0,0]);assert.deepEqual(phoneToVehicle([1,0,0]).toArray(),[-0,0,1]);assert.deepEqual(phoneToVehicle([0,1,0]).toArray(),[-0,1,0]);})
test('stationary recording stays neutral and a seek returns the same pose',()=>{const track=buildImuTrack(fixture());const a=track.sample(1).quaternion.toArray();track.sample(3);assert.deepEqual(track.sample(1).quaternion.toArray(),a);assert.ok(a.slice(0,3).every(v=>Math.abs(v)<1e-10));})
test('yaw is bounded, timing offset selects later samples, and roll amount does not cap pitch',()=>{const track=buildImuTrack(fixture([.1,.2,0]),{gravityTimeConstant:Infinity});const settings={...MLS_DEFAULTS,smoothingMs:0,keepRollLevel:false};assert.ok(Math.abs(track.sample(3,settings).yawDeg)<=5);assert.deepEqual(track.sample(1,{...settings,offsetFrames:15}).quaternion.toArray(),track.sample(1.5,settings).quaternion.toArray());assert.equal(Math.abs(track.sample(2,{...settings,rollAmount:0}).rollDeg),0);assert.notEqual(track.sample(2,{...settings,rollAmount:0}).pitchDeg,0);})
test('duplicate samples at a frame do not integrate time twice',()=>{const data=fixture([0,.1,0]),baseline=buildImuTrack(data);data.samples=data.samples.flatMap(s=>[s,structuredClone(s)]);const duplicate=buildImuTrack(data);assert.deepEqual(baseline.sample(2).quaternion.toArray(),duplicate.sample(2).quaternion.toArray());})
test('half-second gaps, missing mount and nonfinite sensor values fail closed',()=>{for(const mutate of [d=>d.samples.splice(20,20),d=>d.mounting='unknown',d=>d.samples[0].gyro[0]=NaN]){const d=fixture();mutate(d);assert.throws(()=>buildImuTrack(d));}})
test('smoothing is deterministic across changed slider settings and backwards seeking',()=>{const d=fixture();d.samples.forEach((s,i)=>s.gyro=[Math.sin(i)*.1,.01,0]);const track=buildImuTrack(d),settings={...MLS_DEFAULTS,smoothingMs:150};const a=track.sample(2,settings).quaternion.toArray();track.sample(.1,{smoothingMs:0});track.sample(3,{smoothingMs:300});assert.deepEqual(track.sample(2,settings).quaternion.toArray(),a);})
test('map attitude preserves uncapped yaw and bank instead of Lab creative leveling',()=>{
 const track=buildImuTrack(fixture([0,.2,0]),{gravityTimeConstant:Infinity});
 const pose=track.sampleAttitude(3);
 assert.ok(pose.yawDeg>30);assert.ok(Math.abs(track.sample(3).yawDeg)<=5);
 const saved=pose.quaternion.toArray();track.sampleAttitude(.2);assert.deepEqual(track.sampleAttitude(3).quaternion.toArray(),saved);
 assert.equal(track.sampleAttitude(-1),null);assert.equal(track.sampleAttitude(5),null);assert.equal(track.sampleAttitude(NaN),null);
});
test('map vehicle roll, pitch and yaw respond to their own sensor axes',()=>{
 for(const [rate,axis] of [[[0,0,-.1],'rollDeg'],[[.1,0,0],'pitchDeg'],[[0,.1,0],'yawDeg']]){
  const track=buildImuTrack(fixture(rate),{gravityTimeConstant:Infinity}),pose=track.sampleAttitude(2);
  assert.ok(pose[axis]>10);for(const other of ['rollDeg','pitchDeg','yawDeg'].filter(a=>a!==axis))assert.ok(Math.abs(pose[other])<1e-9);
 }
});
