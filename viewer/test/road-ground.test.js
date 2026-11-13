import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPTURE_HEIGHT, ROAD_DOME_RADIUS, ROAD_PLANE_RADIUS, coverageBottomFromPixels, refineCoverageBottom, uncoveredRoadRadius } from '../src/road-ground.js'
import { feetToSceneUnits } from '../src/scene-scale.js'
import { VEHICLE_PHYSICAL_LENGTHS_FT } from '../src/vehicle-specs.js'

const metres = value => feetToSceneUnits(value / 0.3048)

test('capture point sits at lens height and the dome meets the road plane', () => {
  assert.ok(Math.abs(CAPTURE_HEIGHT - metres(1.45)) < 1e-9)
  assert.ok(Math.abs(Math.hypot(ROAD_PLANE_RADIUS, CAPTURE_HEIGHT) - ROAD_DOME_RADIUS) < 1e-9)
})

test('uncovered road under the rig follows from the lowest stitched row', () => {
  // Catalog stitches end 18-24 degrees below the horizon.
  const shallow = uncoveredRoadRadius(0.6015625), deep = uncoveredRoadRadius(0.6328125)
  assert.ok(shallow > deep)
  // About 3.7 m and 5.1 m of road around the rig respectively.
  assert.ok(Math.abs(deep - metres(3.68)) < metres(0.05))
  assert.ok(Math.abs(shallow - metres(5.13)) < metres(0.05))
  // Every vehicle's footprint lies inside it, so the road there is always inferred.
  for (const feet of Object.values(VEHICLE_PHYSICAL_LENGTHS_FT)) assert.ok(feetToSceneUnits(feet) / 2 < deep)
  assert.ok(shallow < ROAD_PLANE_RADIUS)
})

test('a full sphere leaves nothing uncovered and a horizon-only strip has no road', () => {
  assert.ok(uncoveredRoadRadius(1) < metres(0.1))
  assert.equal(uncoveredRoadRadius(1.02), 0)
  assert.equal(uncoveredRoadRadius(0.5), Infinity)
})

test('coverage is read from the frame and only ever tightens the declared edge', () => {
  const width = 32, height = 20, data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < 12; row++) for (let column = 0; column < width; column++) data.set([90, 90, 90, 255], (row * width + column) * 4)
  data.set([40, 0, 0, 255], (15 * width) * 4 - 4) // one ringing pixel below the edge is not picture
  assert.equal(coverageBottomFromPixels(data, width, height), 0.6)
  assert.equal(coverageBottomFromPixels(new Uint8ClampedArray(width * height * 4), width, height), 0)

  assert.equal(refineCoverageBottom(0.633, 0.598), 0.598)
  assert.equal(refineCoverageBottom(0.6, 0.7), 0.6)
  assert.equal(refineCoverageBottom(0.633, 0), 0.633) // faded-out frame
  assert.equal(refineCoverageBottom(0.633, 0.3, 0.598), 0.598)
  assert.equal(refineCoverageBottom(0.633, 0.58, 0.598), 0.598) // dark road in one frame
  assert.equal(refineCoverageBottom(0.633, 0.61, 0.598), 0.61)
})
