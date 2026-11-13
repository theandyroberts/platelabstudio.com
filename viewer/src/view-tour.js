// Modelled on the homepage Mustang showreel. Its camera rides within about a
// metre of the body at belt-line height, drifts steadily instead of orbiting,
// and goes into the cabin for the angles an in-car dialogue scene uses. Shots
// cut rather than fly between set-ups, as the film does, so the camera never
// passes through the body on its way into or out of the cabin.
//
// Coordinates are the reference convertible's: +X forward, -Z the driver's
// side, origin on the road under the middle of the car, one unit = 5.56 ft.
const BELT = 0.52
export const TOUR_SHOTS = [
  { view: 'paintReflection', label: 'Front fender', fov: 50,
    from: { position: [1.92, 0.4, -0.98], target: [-0.3, 0.5, -0.3] },
    to: { position: [1.58, 0.48, -1.04], target: [-0.5, 0.52, -0.22] } },
  { view: 'sideWindow', label: 'Belt-line profile', fov: 46,
    from: { position: [-0.95, BELT + 0.04, -1.08], target: [0.1, BELT, -0.1] },
    to: { position: [0.3, BELT + 0.04, -1.08], target: [1.0, BELT, -0.1] } },
  { view: 'mediumRear', label: 'Over the rear deck', fov: 52,
    from: { position: [-1.95, 0.62, 0.22], target: [0.6, 0.6, 0] },
    to: { position: [-1.5, 0.86, 0.06], target: [0.9, 0.56, 0] } },
  { view: 'overShoulder', label: 'Over the shoulder', cabin: true, panFrom: -0.14, panTo: 0, fov: 58, fovTo: 54 },
  { view: 'overShoulder', label: 'Through the windshield', cabin: true, panFrom: 0, panTo: 0.14, fov: 54, fovTo: 50 },
  // Dialogue singles from each front seat across to the other, as the film
  // does. These reuse the Interior presets, placed per vehicle to stay inside
  // its glass, and drift toward the windshield.
  { view: 'passengerToDriver', label: 'Passenger to driver', cabin: true, panForward: 0.18 },
  { view: 'driverToPassenger', label: 'Driver to passenger', cabin: true, panForward: 0.18 },
  { view: 'sideWindow', label: 'In through the driver window', fov: 48,
    from: { position: [0.85, 0.6, -1.0], target: [-0.05, 0.55, 0.2] },
    to: { position: [0.3, 0.62, -1.06], target: [-0.1, 0.55, 0.3] } },
  { view: 'wideFrontLeft', label: 'Across the hood', fov: 54,
    from: { position: [1.95, 0.52, -0.5], target: [0, 0.56, 0.05] },
    to: { position: [1.95, 0.52, 0.5], target: [0, 0.56, -0.05] } },
  { view: 'mediumFrontLeft', label: 'Passenger side three-quarter', fov: 48,
    arc: { from: 22, to: 72, forward: 1.9, side: 1.12, height: BELT, heightTo: BELT + 0.06 }, target: [0.1, BELT, 0] },
  { view: 'mediumRearLeft', label: 'Around the tail', fov: 50,
    arc: { from: 118, to: 188, forward: 1.92, side: 1.2, height: 0.62 }, target: [-0.2, BELT, 0] },
  { view: 'mediumRearRight', label: 'Rear quarter pull-out', fov: 46,
    from: { position: [-1.7, 0.36, -1.05], target: [0.1, 0.46, 0] },
    to: { position: [-0.9, 0.42, -1.3], target: [0.15, 0.46, 0] } },
]
export const TOUR_SHOT_SECONDS = 6
export const TOUR_DURATION = TOUR_SHOTS.length * TOUR_SHOT_SECONDS

// Reference convertible half-extents in scene units, width over the mirrors.
const HALF_LENGTH = 1.34
const HALF_WIDTH = 0.67

export function createViewTour() {
  let enabled = false, elapsed = 0, previousTime = null
  return {
    get enabled() { return enabled },
    get elapsed() { return elapsed },
    start() { enabled = true; elapsed = 0; previousTime = null },
    stop() { enabled = false; previousTime = null },
    suspend() { previousTime = null },
    advance(time, playing) {
      if (!enabled || !playing || !Number.isFinite(time)) { previousTime = null; return elapsed }
      // Media time, never wall time: stalls/pause cannot keep the camera moving.
      // Seeks and loop boundaries re-anchor rather than skipping through shots.
      const delta = previousTime === null ? 0 : time - previousTime
      if (delta > 0 && delta < 0.75) elapsed = (elapsed + delta) % TOUR_DURATION
      previousTime = time
      return elapsed
    },
  }
}

export function sampleViewTour(elapsed, views, { reducedMotion = false, lengthScale = 1, widthScale = lengthScale, heightScale = 1 } = {}) {
  const time = ((elapsed % TOUR_DURATION) + TOUR_DURATION) % TOUR_DURATION
  const index = Math.floor(time / TOUR_SHOT_SECONDS)
  const shot = TOUR_SHOTS[index]
  const base = views[shot.view]
  const phase = reducedMotion ? 0 : (time % TOUR_SHOT_SECONDS) / TOUR_SHOT_SECONDS
  // Steady drifts, as in the film: no easing to rest inside a shot.
  const lerp = (from, to) => from + (to - from) * phase
  if (!shot.cabin) {
    // A bigger vehicle pushes the camera out by its extra size, so the lens
    // stays the same distance off the sheet metal instead of scaling away.
    const outside = (value, half, scale) => Math.abs(value) > half
      ? Math.sign(value) * (Math.abs(value) + half * (scale - 1))
      : value * scale
    let position, target
    if (shot.arc) {
      const yaw = lerp(shot.arc.from, shot.arc.to) * Math.PI / 180
      position = [Math.cos(yaw) * shot.arc.forward, lerp(shot.arc.height, shot.arc.heightTo ?? shot.arc.height), Math.sin(yaw) * shot.arc.side]
      target = shot.target
      // Scale the ellipse itself so the path stays clear of the corners.
      position = [
        position[0] * (shot.arc.forward + HALF_LENGTH * (lengthScale - 1)) / shot.arc.forward,
        position[1],
        position[2] * (shot.arc.side + HALF_WIDTH * (widthScale - 1)) / shot.arc.side,
      ]
    } else {
      position = shot.from.position.map((value, axis) => lerp(value, shot.to.position[axis]))
      target = shot.from.target.map((value, axis) => lerp(value, shot.to.target[axis]))
      position = [outside(position[0], HALF_LENGTH, lengthScale), position[1], outside(position[2], HALF_WIDTH, widthScale)]
    }
    return {
      index, view: shot.view, label: shot.label,
      position: [position[0], position[1] * heightScale, position[2]],
      target: [target[0] * lengthScale, target[1] * heightScale, target[2] * widthScale],
      fov: lerp(shot.fov, shot.fovTo ?? shot.fov),
    }
  }
  // Cabin shots use the vehicle's own interior cameras as given: they are
  // placed per model, so nothing here rescales them out through the glass.
  const target = [...base.target]
  if (shot.panFrom !== undefined) target[2] = lerp(shot.panFrom, shot.panTo)
  target[0] += (shot.panForward || 0) * phase
  return {
    index, view: shot.view, label: shot.label,
    position: [...base.position],
    target,
    fov: lerp(shot.fov || base.fov, shot.fovTo || shot.fov || base.fov),
  }
}
