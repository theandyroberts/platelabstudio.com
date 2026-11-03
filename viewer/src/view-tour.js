// Reconstructed from the homepage Mustang showreel: establishing shot,
// front/side details, cabin, opposite front, windshield, driver, rear, profile.
// The hero is a rendered film, so these are live-camera equivalents. Cuts
// between shots avoid flying through the body when entering/leaving the cabin.
export const TOUR_SHOTS = [
  { view: 'wideFrontLeft', label: 'Front three-quarter', orbit: -8, dolly: 0.88 },
  { view: 'mediumFrontLeft', label: 'Front detail', orbit: 12, dolly: 0.94 },
  { view: 'sideWindow', label: 'Side window', orbit: -8, cabin: true },
  { view: 'overShoulder', label: 'Over the shoulder', cabin: true },
  { view: 'overShoulder', label: 'Through the windshield', cabin: true, fov: 50 },
  { view: 'passengerToDriver', label: 'Passenger to driver', cabin: true },
  { view: 'mediumFrontRight', label: 'Opposite three-quarter', orbit: -12 },
  { view: 'mediumFrontLeft', label: 'Windshield and hood', position: [2.75, 0.85, 0], target: [0, 0.65, 0], dolly: 0.92 },
  { view: 'sideWindow', label: 'Driver window', orbit: 8, cabin: true },
  { view: 'driverToPassenger', label: 'Driver to passenger', cabin: true },
  { view: 'mediumRear', label: 'Rear detail', dolly: 1.12 },
  { view: 'wideFrontLeft', label: 'Side profile', position: [0, 1, 3.3], target: [0, 0.65, 0], orbit: 12 },
]
export const TOUR_SHOT_SECONDS = 6
export const TOUR_DURATION = TOUR_SHOTS.length * TOUR_SHOT_SECONDS

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

export function sampleViewTour(elapsed, views, { reducedMotion = false, lengthScale = 1, heightScale = 1, enclosed = false } = {}) {
  const time = ((elapsed % TOUR_DURATION) + TOUR_DURATION) % TOUR_DURATION
  const index = Math.floor(time / TOUR_SHOT_SECONDS)
  const shot = TOUR_SHOTS[index]
  const base = views[shot.view]
  const phase = reducedMotion ? 0 : (time % TOUR_SHOT_SECONDS) / TOUR_SHOT_SECONDS
  const eased = phase * phase * (3 - 2 * phase)
  const yaw = (shot.orbit || 0) * Math.PI / 180 * eased
  const radiusScale = 1 + ((shot.dolly || 1) - 1) * eased
  let position = shot.position || base.position
  let target = shot.target || base.target
  // The sedan/SUV cabins sit farther forward than the convertible's cockpit.
  // Avoid putting the over-shoulder camera behind their rear-seat headrests.
  if (enclosed && shot.view === 'overShoulder') {
    position = [0.15, 0.76, 0.24]
    target = [1.2, 0.65, -0.14]
  } else if (enclosed && ['passengerToDriver', 'driverToPassenger'].includes(shot.view)) {
    position = [0.4, position[1], position[2]]
    target = [0.4, target[1], target[2]]
  }
  // Closed vehicles need the cabin camera beneath the roof. Preserve the
  // same framing across physical vehicle sizes without changing vehicle yaw.
  const yScale = heightScale * (shot.cabin && enclosed ? 0.8 : 1)
  return {
    index, view: shot.view, label: shot.label,
    position: [
      (position[0] * Math.cos(yaw) - position[2] * Math.sin(yaw)) * radiusScale * lengthScale,
      position[1] * yScale,
      (position[0] * Math.sin(yaw) + position[2] * Math.cos(yaw)) * radiusScale * lengthScale,
    ],
    target: [target[0] * lengthScale, target[1] * yScale, target[2] * lengthScale],
    fov: shot.fov || base.fov,
  }
}
