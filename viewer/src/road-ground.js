import { FEET_TO_SCENE_UNITS } from './scene-scale.js'

const METRES_TO_SCENE_UNITS = FEET_TO_SCENE_UNITS / 0.3048

// Height of the capture array's optical centre above the road. Measured from
// the catalog stitches: adjacent lane lines 3.6 m apart meet the lowest
// covered row at azimuths that only fit a lens about 1.45 m above the road.
export const CAPTURE_HEIGHT_M = 1.45
export const CAPTURE_HEIGHT = CAPTURE_HEIGHT_M * METRES_TO_SCENE_UNITS

// Beyond this distance the road is drawn on a dome instead of a flat plane.
// Larger keeps more road flat but smears nearby traffic and kerbs further
// along the ground; smaller stands them up but bends the road sooner.
export const ROAD_PLANE_RADIUS = 22 * METRES_TO_SCENE_UNITS
export const ROAD_DOME_RADIUS = Math.hypot(ROAD_PLANE_RADIUS, CAPTURE_HEIGHT)

// Rows trimmed above the stitch's lower edge, which is ragged and often
// carries a sliver of the capture vehicle.
export const COVERAGE_EDGE_MARGIN = 0.014

/**
 * Radius on the road, around the capture point, that the stitch never saw.
 * `validBottom` is the lowest covered row as a 0..1 fraction of an
 * equirectangular frame (0.5 is the horizon).
 */
export function uncoveredRoadRadius(validBottom, captureHeight = CAPTURE_HEIGHT) {
  const depression = (validBottom - COVERAGE_EDGE_MARGIN - 0.5) * Math.PI
  if (!(depression > 0)) return Infinity
  if (depression >= Math.PI / 2) return 0
  return captureHeight / Math.tan(depression)
}

/**
 * Lowest row of an RGBA frame that holds picture, as a 0..1 fraction of its
 * height. Catalog metadata can describe an earlier stitch of the same clip, so
 * the footage itself is the authority on where its coverage ends.
 */
export function coverageBottomFromPixels(data, width, height, blackLevel = 10) {
  for (let row = height - 1; row >= 0; row--) {
    let lit = 0
    for (let column = 0; column < width; column++) {
      const offset = (row * width + column) * 4
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > blackLevel) lit++
    }
    // A few stray bright pixels are compression ringing, not picture.
    if (lit > width * 0.04) return (row + 1) / height
  }
  return 0
}

/**
 * Combine the declared coverage with what frames have shown so far. Frames
 * only ever lower the declared edge, and a dark or faded frame cannot raise it
 * above the horizon band.
 */
export function refineCoverageBottom(declared, measured, previous) {
  if (!(measured > 0.52)) return previous ?? declared
  return Math.min(declared, Math.max(measured, previous && previous < declared ? previous : 0))
}
