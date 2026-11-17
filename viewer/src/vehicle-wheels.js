import * as THREE from 'three'
import { FEET_TO_SCENE_UNITS } from './scene-scale.js'
import { wheelAngle } from './wheel-motion.js'

function meshPath(mesh) {
  const names = []
  for (let node = mesh; node; node = node.parent) names.push(node.name)
  return names.join('/').toLowerCase()
}

function wheelPart(mesh, key) {
  const path = meshPath(mesh)
  if (key === 'ferrari') return /\/wheel_(fl|fr|rl|rr)(\/|$)/.test(path) ? (/^tire/.test(mesh.name) ? 'tire' : 'rotating') : null
  if (key === 'bmwM5') {
    if (/\/tire[._0-9]/.test(path)) return 'tire'
    // The aftermarket ESR rims and brake discs are separate from the calipers.
    if (/esr.?cs1.?gloss.?black|wheel1a|mat_wheels/.test(path)) return 'rotating'
  }
  if (key === 'escalade') {
    if (/m_tire_high/.test(path)) return 'tire'
    if (/m_rim_high|m_brakedisc_high/.test(path)) return 'rotating'
  }
  return null
}

const cornerOf = point => (point.x >= 0 ? 2 : 0) + (point.z >= 0 ? 1 : 0)

// Extract triangles into compact geometries, preserving UVs, normals, and material
// groups. Escalade stores all four tires/rims in single meshes; they must be split.
export function splitWheelMesh(mesh) {
  const source = mesh.geometry, position = source.getAttribute('position')
  const index = source.index, count = index ? index.count : position.count
  const triangles = [[], [], [], []], point = new THREE.Vector3(), center = new THREE.Vector3()
  for (let offset = 0; offset < count; offset += 3) {
    center.set(0, 0, 0)
    const ids = [0, 1, 2].map(i => index ? index.getX(offset + i) : offset + i)
    for (const id of ids) center.add(point.fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld))
    const materialIndex = source.groups.find(group => offset >= group.start && offset < group.start + group.count)?.materialIndex ?? 0
    triangles[cornerOf(center)].push({ ids, materialIndex })
  }
  return triangles.map((faces, corner) => {
    if (!faces.length) return null
    const geometry = new THREE.BufferGeometry(), remap = new Map(), ids = [], indices = []
    for (const face of faces) {
      const start = indices.length
      for (const old of face.ids) {
        if (!remap.has(old)) { remap.set(old, ids.length); ids.push(old) }
        indices.push(remap.get(old))
      }
      const last = geometry.groups.at(-1)
      if (last?.materialIndex === face.materialIndex) last.count += 3
      else geometry.addGroup(start, 3, face.materialIndex)
    }
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const values = new attribute.array.constructor(ids.length * attribute.itemSize)
      for (let i = 0; i < ids.length; i++) {
        for (let c = 0; c < attribute.itemSize; c++) {
          // Copy raw components to preserve normalized integer attributes as well.
          values[i * attribute.itemSize + c] = attribute.isInterleavedBufferAttribute
            ? attribute.data.array[ids[i] * attribute.data.stride + attribute.offset + c]
            : attribute.array[ids[i] * attribute.itemSize + c]
        }
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized))
    }
    // Bake the authored transform exactly: BMW includes nonuniformly scaled,
    // rotated parents (shear), which cannot survive matrix decomposition.
    if (mesh.matrixWorld.determinant() < 0) {
      for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
    }
    geometry.setIndex(indices)
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const part = mesh.clone(false)
    part.name = `${mesh.name}_roadWheel_${corner}`
    part.geometry = geometry
    part.position.set(0, 0, 0)
    part.quaternion.identity()
    part.scale.set(1, 1, 1)
    return { mesh: part, corner }
  }).filter(Boolean)
}

/** Install before the model is placed under the stage's vehicle-yaw group. */
export function rigVehicleWheels(model, key) {
  const root = new THREE.Group()
  root.name = model.name
  root.add(model)
  root.updateMatrixWorld(true)
  const selected = []
  model.traverse(mesh => { if (mesh.isMesh) { const type = wheelPart(mesh, key); if (type) selected.push({ mesh, type }) } })
  const parts = selected.flatMap(({ mesh, type }) => splitWheelMesh(mesh).map(part => ({ ...part, type })))
  const tireBounds = Array.from({ length: 4 }, () => new THREE.Box3())
  for (const part of parts) {
    if (part.type !== 'tire') continue
    part.mesh.updateMatrixWorld(true)
    tireBounds[part.corner].union(new THREE.Box3().setFromObject(part.mesh))
  }
  // Fail closed if an asset changes: a rigid model is preferable to exploding wheels.
  if (tireBounds.some(box => box.isEmpty() || box.max.y - box.min.y <= 0)) {
    for (const part of parts) part.mesh.geometry.dispose()
    return { model: root, wheels: [], update() {} }
  }
  const wheels = tireBounds.map((bounds, corner) => {
    const pivot = new THREE.Group()
    pivot.name = `roadWheel_${corner}`
    bounds.getCenter(pivot.position)
    root.add(pivot)
    const radiusMeters = (bounds.max.y - bounds.min.y) / 2 / FEET_TO_SCENE_UNITS * 0.3048
    return { pivot, radiusMeters }
  })
  root.updateMatrixWorld(true)
  for (const part of parts) {
    root.add(part.mesh)
    wheels[part.corner].pivot.attach(part.mesh)
  }
  const removed = new Set()
  for (const { mesh } of selected) { mesh.removeFromParent(); removed.add(mesh.geometry) }
  // Some assets share geometry between meshes. Dispose only if no retained mesh uses it.
  root.traverse(mesh => { if (mesh.geometry) removed.delete(mesh.geometry) })
  for (const geometry of removed) geometry.dispose()
  return {
    model: root, wheels,
    update(distanceMeters) {
      for (const wheel of wheels) wheel.pivot.rotation.z = wheelAngle(distanceMeters, wheel.radiusMeters)
    },
  }
}
