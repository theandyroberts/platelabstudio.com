import { STUDIO_CONTROLS, studioControlPreset, validateStudioControls } from '../../shared/src/studio-controls.js'

export function applyControlVisibility(root, controls) {
  const panel = root.querySelector('#viewerControls')
  if (!panel) return
  const sections = new Map()
  for (const control of STUDIO_CONTROLS) {
    const input = panel.querySelector(`#${control.id}`)
    if (!input) continue
    const row = control.selector ? panel.querySelector(control.selector) : input.closest('label')
    if (!row) continue
    row.classList.toggle('visitor-control-hidden', !controls[control.id])
    const section = row.closest('.control-group, .imu-controls')
    if (section) sections.set(section, Boolean(sections.get(section) || controls[control.id]))
  }
  for (const [section, visible] of sections) section.classList.toggle('visitor-control-hidden', !visible)
  for (const grid of panel.querySelectorAll('.toggle-grid')) {
    grid.classList.toggle('visitor-control-hidden', [...grid.children].every(child => child.classList.contains('visitor-control-hidden')))
  }
  // Stage specifications accompany the stage selector, not hidden calibration fields.
  for (const element of panel.querySelectorAll('.metrics, #presetNotes, #panelCount')) element.classList.toggle('visitor-control-hidden', !controls.presetSelect)
  const anyVisible = [...sections.values()].some(Boolean)
  panel.classList.toggle('visitor-control-hidden', !anyVisible)
  root.querySelector('#panelToggle')?.classList.toggle('visitor-control-hidden', !anyVisible)
  root.querySelector('.workbench')?.classList.toggle('has-no-visitor-controls', !anyVisible)
  panel.scrollTop = 0
}

export function installControlVisibility(root = document) {
  let controls = studioControlPreset(false)
  const apply = () => applyControlVisibility(root, controls)
  apply()
  // Only new DOM nodes matter; attribute changes here must not trigger a loop.
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && node.matches('.control-group, .imu-controls')))) apply()
  })
  observer.observe(root.querySelector('#viewerControls'), { childList: true, subtree: true })
  let request = 0
  async function refresh() {
    const current = ++request
    let next = studioControlPreset(false)
    try {
      const response = await fetch('/api/studio-controls', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Studio configuration unavailable')
      const config = await response.json()
      if (config.version !== 1) throw new Error('Unsupported studio configuration')
      next = validateStudioControls(config.controls)
    } catch {
      // A configuration failure must never reveal controls an admin hid.
    }
    if (current === request && STUDIO_CONTROLS.some(control => next[control.id] !== controls[control.id])) {
      controls = next
      apply()
    }
  }
  void refresh()
  window.addEventListener('focus', () => { void refresh() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh() })
  return { refresh }
}
