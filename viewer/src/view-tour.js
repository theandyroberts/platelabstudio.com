// Reconstructed from the homepage Mustang showreel: establishing shot,
// front/side details, cabin, opposite front, windshield, driver, rear, profile.
// The hero is a rendered film, so these are live-camera equivalents. Cuts
// between shots avoid flying through the body when entering/leaving the cabin.
export const TOUR_SHOTS = [
  { view: 'wideFrontLeft', label: 'Front to side', exterior: { from: 0, to: 90, radius: 3.2 } },
  { view: 'mediumFrontLeft', label: 'Side to rear', exterior: { from: 90, to: 180, radius: 3.2, radiusTo: 2.9 } },
  { view: 'sideWindow', label: 'Rear to opposite side', exterior: { from: 180, to: 270, radius: 2.9, radiusTo: 3 } },
  { view: 'overShoulder', label: 'Over the shoulder', cabin: true, panFrom: -0.14, panTo: 0, fov: 58, fovTo: 54 },
  { view: 'overShoulder', label: 'Through the windshield', cabin: true, panFrom: 0, panTo: 0.14, fov: 54, fovTo: 50 },
  { view: 'passengerToDriver', label: 'Passenger to driver', cabin: true, panForward: 0.18 },
  { view: 'mediumFrontRight', label: 'Opposite side to front', exterior: { from: -90, to: 0, radius: 3 } },
  { view: 'mediumFrontLeft', label: 'Front to driver side', exterior: { from: 0, to: 90, radius: 3 } },
  { view: 'sideWindow', label: 'Side profile and skyline', exterior: { from: 90, to: 90, radius: 3, aimFrom: 0.65, aimTo: 0.85 } },
  { view: 'driverToPassenger', label: 'Driver to passenger', cabin: true, panForward: 0.18 },
  { view: 'mediumRear', label: 'Rear to side', exterior: { from: 180, to: 270, radius: 3 } },
  { view: 'wideFrontLeft', label: 'Side to front', exterior: { from: 270, to: 360, radius: 3, radiusTo: 3.2 } },
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
  // Continuous angular speed avoids the stop/start feel of easing every shot
  // to rest. Adjacent exterior arcs share their endpoints, including the loop.
  const lerp = (from, to) => from + (to - from) * phase
  if (shot.exterior) {
    const path = shot.exterior
    const yaw = lerp(path.from, path.to) * Math.PI / 180
    const radius = lerp(path.radius, path.radiusTo ?? path.radius) * lengthScale
    return {
      index, view: shot.view, label: shot.label,
      position: [Math.cos(yaw) * radius, heightScale, Math.sin(yaw) * radius],
      // Raising the aim lowers the car in frame, revealing buildings and sky.
      target: [0, lerp(path.aimFrom ?? 0.65, path.aimTo ?? 0.65) * heightScale, 0],
      fov: 50,
    }
  }
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
  target = [...target]
  if (shot.panFrom !== undefined) target[2] = lerp(shot.panFrom, shot.panTo)
  target[0] += (shot.panForward || 0) * phase
  return {
    index, view: shot.view, label: shot.label,
    position: [
      position[0] * lengthScale,
      position[1] * yScale,
      position[2] * lengthScale,
    ],
    target: [target[0] * lengthScale, target[1] * yScale, target[2] * lengthScale],
    fov: lerp(shot.fov || base.fov, shot.fovTo || shot.fov || base.fov),
  }
}
