import test from 'node:test'
import assert from 'node:assert/strict'
import { createViewTour, sampleViewTour, TOUR_SHOTS, TOUR_DURATION, TOUR_SHOT_SECONDS } from '../src/view-tour.js'

test('tour defaults off, follows only progressing media, and restarts deliberately', () => {
  const tour = createViewTour()
  assert.equal(tour.enabled, false)
  tour.advance(5, true)
  assert.equal(tour.elapsed, 0)
  tour.start()
  tour.advance(5, true)
  tour.advance(5.25, true)
  assert.equal(tour.elapsed, 0.25)
  tour.advance(5.25, true) // stalled decoder
  tour.advance(5.25, false) // pause or not enough decoded data
  tour.advance(5.5, false)
  assert.equal(tour.elapsed, 0.25)
  tour.advance(5.5, true)
  tour.advance(5.75, true)
  assert.equal(tour.elapsed, 0.5)
  tour.stop()
  tour.advance(6, true)
  assert.equal(tour.elapsed, 0.5)
  tour.start()
  assert.equal(tour.elapsed, 0)
})

test('seeks, loop boundaries, hidden views and model loads never jump tour time', () => {
  const tour = createViewTour()
  tour.start()
  tour.advance(10, true)
  tour.advance(10.25, true)
  tour.advance(30, true)
  tour.advance(0, true)
  assert.equal(tour.elapsed, 0.25)
  tour.suspend() // seeking, hidden iframe, or waiting for a new vehicle
  tour.advance(0.5, true)
  assert.equal(tour.elapsed, 0.25)
  tour.advance(0.75, true)
  assert.equal(tour.elapsed, 0.5)
  // Short footage can loop repeatedly while the complete tour continues.
  for (let i = 0; i < 400; i++) tour.advance((i / 4) % 18, true)
  assert.ok(tour.elapsed >= 0 && tour.elapsed < TOUR_DURATION)
})

// Interior presets as the viewer supplies them for the reference convertible.
const views = {
  overShoulder: { position: [-0.48, 0.76, 0.24], target: [0.9, 0.58, -0.14], fov: 58 },
  passengerToDriver: { position: [0, 0.72, 0.32], target: [0, 0.58, -0.3], fov: 55 },
  driverToPassenger: { position: [0, 0.72, -0.32], target: [0, 0.58, 0.3], fov: 55 },
}
// Reference convertible body: half length, half width over the mirrors, height.
const BODY = { halfLength: 1.34, halfWidth: 0.67, height: 0.73 }
const at = (index, offset = 0, options) => sampleViewTour(index * TOUR_SHOT_SECONDS + offset, views, options)
const exterior = TOUR_SHOTS.map((shot, index) => [shot, index]).filter(([shot]) => !shot.cabin).map(([, index]) => index)
const cabin = TOUR_SHOTS.map((shot, index) => [shot, index]).filter(([shot]) => shot.cabin).map(([, index]) => index)

// Distance from a point to the body's footprint, in scene units (0.59 per metre).
function clearance([x, , z], { halfLength = BODY.halfLength, halfWidth = BODY.halfWidth } = {}) {
  return Math.hypot(Math.max(Math.abs(x) - halfLength, 0), Math.max(Math.abs(z) - halfWidth, 0))
}

test('tour selects the expected shots, loops, and honors reduced motion', () => {
  const start = at(0)
  assert.notDeepEqual(at(0, 3).position, start.position)
  assert.equal(at(0, 5.99).index, 0)
  assert.equal(at(1).index, 1)
  assert.deepEqual(sampleViewTour(TOUR_DURATION, views), start)
  assert.deepEqual(at(0, 3, { reducedMotion: true }), start)
  assert.equal(at(1, 0, { reducedMotion: true }).index, 1)
  for (let time = 0; time < TOUR_DURATION; time += 0.25) {
    const pose = sampleViewTour(time, views)
    assert.ok([...pose.position, ...pose.target, pose.fov].every(Number.isFinite))
  }
})

test('exterior shots ride close to the body at belt-line height, like the hero film', () => {
  for (const index of exterior) {
    for (const offset of [0, 1.5, 3, 4.5, 5.99]) {
      const { position, label } = at(index, offset)
      const distance = clearance(position)
      // Off the sheet metal, never inside it, and within about 1.2 m of it.
      assert.ok(distance > 0.12 && distance < 0.72, `${label} is ${distance.toFixed(2)} units off the body`)
      // Between the sills and just over the roof line; no high orbiting.
      assert.ok(position[1] >= 0.34 && position[1] <= 0.9, `${label} lens height ${position[1]}`)
    }
  }
})

test('the tour goes into the cabin for over-shoulder and both dialogue angles', () => {
  const cabinViews = cabin.map(index => TOUR_SHOTS[index].view)
  for (const view of ['overShoulder', 'passengerToDriver', 'driverToPassenger']) assert.ok(cabinViews.includes(view))
  assert.ok(cabin.length >= 4)
  for (const index of cabin) {
    const pose = at(index, 3)
    assert.equal(clearance(pose.position), 0, `${pose.label} stays inside the body`)
    assert.deepEqual(pose.position, views[pose.view].position)
  }
  // Each dialogue single looks across the cabin at the named seat (driver at -Z).
  const toDriver = at(TOUR_SHOTS.findIndex(shot => shot.view === 'passengerToDriver'), 3)
  const toPassenger = at(TOUR_SHOTS.findIndex(shot => shot.view === 'driverToPassenger'), 3)
  assert.ok(toDriver.position[2] > 0 && toDriver.target[2] < 0)
  assert.ok(toPassenger.position[2] < 0 && toPassenger.target[2] > 0)
})

test('cabin cameras are taken from the vehicle as placed, never rescaled through the glass', () => {
  const sedan = { ...views, overShoulder: { position: [-0.3, 0.74, 0.15], target: [0.9, 0.6, -0.15], fov: 58 } }
  const index = TOUR_SHOTS.findIndex(shot => shot.view === 'overShoulder')
  const pose = sampleViewTour(index * TOUR_SHOT_SECONDS, sedan, { lengthScale: 1.27, widthScale: 1.13, heightScale: 1.67 })
  assert.deepEqual(pose.position, [-0.3, 0.74, 0.15])
})

test('a larger vehicle pushes exterior cameras out by its extra size, not proportionally', () => {
  const options = { lengthScale: 1.27, widthScale: 1.13, heightScale: 1.67 }
  const body = { halfLength: BODY.halfLength * 1.27, halfWidth: BODY.halfWidth * 1.13 }
  for (const index of exterior) {
    for (const offset of [0, 3, 5.99]) {
      const small = at(index, offset), large = at(index, offset, options)
      const distance = clearance(large.position, body)
      assert.ok(distance > 0.1 && distance < 0.8, `${large.label} is ${distance.toFixed(2)} units off the larger body`)
      assert.ok(Math.abs(large.position[1] - small.position[1] * 1.67) < 1e-9)
    }
  }
})

test('every shot drifts steadily and the windshield pans join without a jump', () => {
  for (let index = 0; index < TOUR_SHOTS.length; index++) {
    const step = offset => {
      const a = at(index, offset), b = at(index, offset + 1)
      return [...a.position, ...a.target].map((value, i) => [...b.position, ...b.target][i] - value)
    }
    const first = step(0)
    assert.ok(Math.hypot(...first) > 0.005, `${TOUR_SHOTS[index].label} moves`)
    if (TOUR_SHOTS[index].arc) continue
    for (const offset of [1, 2, 3, 4]) step(offset).forEach((value, i) => assert.ok(Math.abs(value - first[i]) < 1e-9))
  }
  const windshield = TOUR_SHOTS.findIndex(shot => shot.label === 'Through the windshield')
  const before = sampleViewTour(windshield * TOUR_SHOT_SECONDS - 0.000001, views), after = at(windshield)
  for (const field of ['position', 'target']) assert.ok(Math.hypot(...before[field].map((value, i) => value - after[field][i])) < 0.00001)
  assert.ok(Math.abs(before.fov - after.fov) < 0.00001)
})
