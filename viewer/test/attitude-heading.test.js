import test from 'node:test'
import assert from 'node:assert/strict'
import {Euler,Quaternion,Vector3} from 'three'
import {initialRouteHeading,mapAlignedAttitude} from '../src/attitude-heading.js'
const forward=q=>new Vector3(1,0,0).applyQuaternion(new Quaternion().fromArray(q))
test('GPS establishes southwest heading and ignores stationary jitter and gaps',()=>{
  const heading=initialRouteHeading([[{lat:34.05672,lon:-118.252884},{lat:34.056683,lon:-118.252975}]])
  assert.ok(heading>240&&heading<250)
  const nose=forward(mapAlignedAttitude([0,0,0,1],heading))
  assert.ok(nose.x<0&&nose.z>0,'nose points west and south')
  assert.equal(initialRouteHeading([[{lat:34,lon:-118},{lat:34.000001,lon:-118}],[{lat:35,lon:-117}]]),undefined)
})
test('north reference preserves tilt and IMU turn direction',()=>{
  const pose=new Quaternion().setFromEuler(new Euler(.08,80*Math.PI/180,.04,'YXZ')).toArray()
  const raw=forward(pose),aligned=forward(mapAlignedAttitude(pose,244))
  assert.ok(Math.abs(raw.y-aligned.y)<1e-12,'world yaw does not change tilt')
  assert.ok(aligned.x>0&&aligned.z>0,'left turn from southwest ends southeast')
  const north=forward(mapAlignedAttitude([0,0,0,1],0))
  assert.ok(Math.abs(north.x)<1e-12&&north.z<-.999)
})
