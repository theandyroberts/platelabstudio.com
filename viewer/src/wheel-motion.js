// Media time, not a wall clock, owns the wheel pose. Seeking, pausing, playback
// rate changes and selection loops therefore cannot accumulate animation drift.
export function buildWheelTravel(segments = []) {
  const intervals = []
  let distance = 0, lastEnd = -Infinity
  const valid = p => p && Number.isFinite(p.t) && p.t >= 0 && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      const a = segment[i - 1], b = segment[i]
      if (!valid(a) || !valid(b) || b.t <= a.t || a.t < lastEnd || b.t - a.t > 5) continue
      const rad = Math.PI / 180
      const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2
      const meters = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
      // Reject corrupt jumps; don't invent motion across missing GPS segments.
      if (meters / (b.t - a.t) > 100) continue
      intervals.push({ start: a.t, end: b.t, from: distance, to: distance + meters })
      distance += meters
      lastEnd = b.t
    }
  }
  return intervals
}

export function sampleWheelTravel(intervals, time) {
  if (!Number.isFinite(time) || !intervals.length) return 0
  let low = 0, high = intervals.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (intervals[mid].start <= time) low = mid + 1
    else high = mid
  }
  if (!low) return 0
  const interval = intervals[low - 1]
  const fraction = Math.min(1, Math.max(0, (time - interval.start) / (interval.end - interval.start)))
  return interval.from + (interval.to - interval.from) * fraction
}

export function wheelAngle(distanceMeters, radiusMeters) {
  // Canonical vehicle forward is +X, up is +Y, axle is Z. Forward rolling is -Z.
  return radiusMeters > 0 && Number.isFinite(distanceMeters) ? -(distanceMeters / radiusMeters) % (2 * Math.PI) : 0
}
