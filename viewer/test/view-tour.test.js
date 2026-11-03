import test from 'node:test'
import assert from 'node:assert/strict'
import { createViewTour, sampleViewTour, TOUR_SHOTS, TOUR_DURATION } from '../src/view-tour.js'

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

const views = Object.fromEntries(TOUR_SHOTS.map(shot => [shot.view, {
  position: [3, 0.8, 1], target: [0, 0.6, 0], fov: 50,
}]))

test('tour moves within shots, cuts at boundaries, loops, and honors reduced motion', () => {
  const start = sampleViewTour(0, views)
  assert.notDeepEqual(sampleViewTour(3, views).position, start.position)
  assert.equal(sampleViewTour(5.99, views).index, 0)
  assert.equal(sampleViewTour(6, views).index, 1)
  assert.deepEqual(sampleViewTour(TOUR_DURATION, views), start)
  assert.deepEqual(sampleViewTour(3, views, { reducedMotion: true }), start)
  assert.equal(sampleViewTour(6, views, { reducedMotion: true }).index, 1)
  for (let time = 0; time < TOUR_DURATION; time += 0.25) {
    const pose = sampleViewTour(time, views)
    assert.ok([...pose.position, ...pose.target, pose.fov].every(Number.isFinite))
  }
})

test('camera adapts to vehicle dimensions and keeps enclosed cabin views under the roof', () => {
  const open = sampleViewTour(18, views, { heightScale: 1.5, lengthScale: 1.25 })
  const closed = sampleViewTour(18, views, { heightScale: 1.5, lengthScale: 1.25, enclosed: true })
  assert.equal(open.position[0], 3.75)
  assert.ok(closed.position[1] < open.position[1])
  assert.deepEqual(sampleViewTour(0, views, { enclosed: true }), sampleViewTour(0, views))
})
