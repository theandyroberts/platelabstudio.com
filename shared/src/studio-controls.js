// Stable control IDs are shared by the admin screen and both viewer builds.
export const STUDIO_CONTROL_GROUPS = [
  { id: 'footage', label: 'Footage', controls: [
    ['playPause', 'Play / pause', false, '#playPause'],
    ['videoFile', 'Load local footage', false, 'label[for="videoFile"]'],
    ['videoUrl', 'Load footage URL', false],
    ['footagePreset', 'Footage preset', false],
    ['sourceMode', 'Source format', false],
    ['footageYaw', 'Wall rotation', true],
    ['footageVertical', 'Vertical offset', false],
    ['cropTop', 'Crop top', false],
    ['cropBottom', 'Crop bottom', false],
    ['ceilingTop', 'Ceiling top', false],
    ['ceilingBottom', 'Ceiling bottom', false],
  ] },
  { id: 'wall', label: 'Wall replica', controls: [
    ['presetSelect', 'Stage preset', true],
    ['diameter', 'Stage diameter', false],
    ['height', 'Stage height', false],
    ['arc', 'Wall arc', false],
    ['ceilingToggle', 'Ceiling LEDs', true],
    ['gridToggle', 'Panel grid', false],
  ] },
  { id: 'camera', label: 'Camera framing', controls: [
    ['cameraOrbit', 'Orbit angle', false],
    ['cameraDistance', 'Camera distance', false],
    ['cameraHeight', 'Lens height', false],
    ['cameraAimHeight', 'Aim height', false],
    ['cameraFocal', 'Focal length', true],
    ['useCameraRig', 'Use custom rig', false, '#useCameraRig'],
    ['resetCameraRig', 'Reset to shot', true, '#resetCameraRig'],
    ['saveCameraView', 'Save camera view', false, '#saveCameraView'],
    ['clearCameraViews', 'Clear saved views', false, '#clearCameraViews'],
  ] },
  { id: 'vehicle', label: 'Vehicle appearance', controls: [
    ['resetView', 'Reset camera view', true, '#resetView'],
    ['finishSwatches', 'Paint finish', true, '#finishSwatches'],
    ['vehicleSelect', 'Vehicle model', true],
    ['vehicleYaw', 'Vehicle rotation', true],
    ['exposure', 'Screen brightness', true],
    ['rate', 'Playback speed', true],
    ['reflectionToggle', 'Footage reflections', false],
  ] },
  { id: 'export', label: 'Studio export', controls: [
    ['downloadScreenshot', 'Download branded screenshot', true, '#downloadScreenshot'],
  ] },
  { id: 'motion', label: 'Recorded motion (when available)', controls: [
    ['imu-enabled', 'Apply IMU motion', false],
    ['imu-level', 'Keep roll level', false],
    ['imu-smooth', 'Motion smoothing', false],
    ['imu-yaw', 'IMU yaw limit', false],
    ['imu-roll', 'IMU roll amount', false],
    ['imu-offset', 'IMU timing offset', false],
    ['imu-peak', 'Pitch / roll limit', false],
    ['imu-reset', 'Reset motion defaults', false, '#imu-reset'],
  ] },
].map(group => ({ ...group, controls: group.controls.map(([id, label, recommended, selector]) => ({
  id: String(id), label: String(label), recommended: Boolean(recommended), selector: selector ? String(selector) : null,
})) }))

export const STUDIO_CONTROLS = STUDIO_CONTROL_GROUPS.flatMap(group => group.controls)

/** @param {boolean | 'recommended'} mode @returns {Record<string, boolean>} */
export function studioControlPreset(mode = 'recommended') {
  return Object.fromEntries(STUDIO_CONTROLS.map(control => [control.id, mode === 'recommended' ? control.recommended : mode]))
}

/** @param {unknown} value @returns {Record<string, boolean>} */
export function validateStudioControls(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid control visibility settings')
  const entries = Object.entries(value)
  const ids = new Set(STUDIO_CONTROLS.map(control => control.id))
  if (entries.length !== ids.size || entries.some(([key, enabled]) => !ids.has(key) || typeof enabled !== 'boolean')) {
    throw new Error('Control visibility must include every known control as a boolean')
  }
  return Object.fromEntries(entries)
}
