import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STUDIO_CONTROLS, studioControlPreset } from '../../shared/src/studio-controls.js'
import { applyControlVisibility } from '../src/control-visibility.js'

function classes() {
  const values = new Set()
  return { toggle(key, enabled) { if (enabled) values.add(key); else values.delete(key) }, contains(key) { return values.has(key) } }
}

test('every interactive flyout field is covered, including the URL load action', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').split('<aside class="control-panel"')[1].split('</aside>')[0]
  const ids = [...source.matchAll(/<(?:input|select|button)\b[^>]*\bid="([^"]+)"/g)].map(match => match[1])
  const registered = new Set(STUDIO_CONTROLS.map(control => control.id))
  for (const id of ids) assert.ok(registered.has(id) || id === 'loadUrl', `Unmanaged visitor control: ${id}`)
});

test('hidden sections and empty toggle groups collapse, and showing controls restores them', () => {
  const section = { classList: classes() }
  const row = { classList: classes(), closest: () => section }
  const grid = { children: [row], classList: classes() }
  const panel = { classList: classes(), scrollTop: 150, querySelector: selector => selector === '#vehicleSelect' ? { closest: () => row } : null, querySelectorAll: selector => selector === '.toggle-grid' ? [grid] : [] }
  const toggle = { classList: classes() }, workbench = { classList: classes() }
  const root = { querySelector: selector => ({ '#viewerControls': panel, '#panelToggle': toggle, '.workbench': workbench })[selector] }
  applyControlVisibility(root, studioControlPreset(false))
  assert.equal(section.classList.contains('visitor-control-hidden'), true)
  assert.equal(grid.classList.contains('visitor-control-hidden'), true)
  assert.equal(toggle.classList.contains('visitor-control-hidden'), true)
  assert.equal(workbench.classList.contains('has-no-visitor-controls'), true)
  assert.equal(panel.scrollTop, 0)
  applyControlVisibility(root, { ...studioControlPreset(false), vehicleSelect: true })
  assert.equal(section.classList.contains('visitor-control-hidden'), false)
  assert.equal(grid.classList.contains('visitor-control-hidden'), false)
  assert.equal(toggle.classList.contains('visitor-control-hidden'), false)
  assert.equal(workbench.classList.contains('has-no-visitor-controls'), false)
});
