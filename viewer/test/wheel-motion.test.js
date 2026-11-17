import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildWheelTravel, sampleWheelTravel, wheelAngle } from '../src/wheel-motion.js'
import { rigVehicleWheels } from '../src/vehicle-wheels.js'
import { orientVehicleModel } from '../src/vehicle-orientation.js'
import { scaleModelToLength } from '../src/scene-scale.js'
import { VEHICLE_PHYSICAL_LENGTHS_FT } from '../src/vehicle-specs.js'
import { loadVehicleAsset } from './helpers/load-vehicle.js'
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)
const fix = (t, meters) => ({ t, lat: meters / 6371000 * 180 / Math.PI, lon: 0 })

test('10 m/s GPS travel gives exact physical wheel speed and deterministic seek/pause/loop poses', () => {
  const track = buildWheelTravel([[fix(0, 0), fix(1, 10), fix(2, 20), fix(3, 20)]])
  near(sampleWheelTravel(track, 0.5), 5)
  near(sampleWheelTravel(track, 2.5), 20) // stopped car
  near(wheelAngle(2 * Math.PI * 0.35, 0.35), 0)
  near(wheelAngle(0.35 * Math.PI / 2, 0.35), -Math.PI / 2)
  for (const time of [1, 1, 0, 2, 0.5]) near(sampleWheelTravel(track, time), time <= 2 ? time * 10 : 20)
  near(sampleWheelTravel(track, 100), 20) // no extrapolation beyond GPS
})

test('GPS gaps, corrupt fixes and missing telemetry never create invented wheel motion', () => {
  const track = buildWheelTravel([[fix(0, 0), fix(1, 10)], [fix(4, 1000), fix(5, 1010)]])
  near(sampleWheelTravel(track, 3), 10)
  near(sampleWheelTravel(track, 4.5), 15)
  assert.deepEqual(buildWheelTravel([[fix(0, 0), fix(10, 100)], [fix(11, 0), fix(12, 10000)]]), [])
  assert.deepEqual(buildWheelTravel([[fix(0, 0), { t: 1, lat: NaN, lon: 0 }]]), [])
  assert.equal(sampleWheelTravel([], 10), 0)
})

for (const [key, file] of Object.entries({ ferrari: 'ferrari.glb', bmwM5: 'bmw_m5.glb', escalade: 'escalade.glb' })) {
  test(`${key}: all four actual asset wheels roll around their hubs; body and calipers stay fixed`, async () => {
    const model = orientVehicleModel(await loadVehicleAsset(file), key)
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3())
    model.scale.setScalar(scaleModelToLength(Math.max(size.x, size.z), VEHICLE_PHYSICAL_LENGTHS_FT[key]))
    box.setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.set(-center.x, -box.min.y, -center.z)
    model.updateMatrixWorld(true)
    const before = new THREE.Box3().setFromObject(model, true)
    const rig = rigVehicleWheels(model, key)
    assert.equal(rig.wheels.length, 4)
    const after = new THREE.Box3().setFromObject(rig.model, true)
    near(before.min.distanceTo(after.min), 0)
    near(before.max.distanceTo(after.max), 0)
    const fixed = []
    model.traverse(mesh => { if (mesh.isMesh) fixed.push({ mesh, matrix: mesh.matrixWorld.clone() }) })
    for (const { pivot, radiusMeters } of rig.wheels) {
      assert.ok(radiusMeters > 0.28 && radiusMeters < 0.50, `credible tire radius: ${radiusMeters}`)
      assert.ok(pivot.children.length >= 2)
      assert.ok(pivot.children.some(mesh => mesh.geometry.getAttribute('uv')), 'texture UVs preserved')
      const center = pivot.getWorldPosition(new THREE.Vector3())
      rig.update(radiusMeters * Math.PI / 2)
      rig.model.updateMatrixWorld(true)
      near(pivot.rotation.z, -Math.PI / 2)
      near(pivot.getWorldPosition(new THREE.Vector3()).distanceTo(center), 0)
      for (const { mesh, matrix } of fixed) assert.deepEqual(mesh.matrixWorld.elements, matrix.elements)
    }
    rig.update(0)
    rig.model.updateMatrixWorld(true)
    const reset = new THREE.Box3().setFromObject(rig.model, true)
    near(before.min.distanceTo(reset.min), 0)
    near(before.max.distanceTo(reset.max), 0)
  })
}
