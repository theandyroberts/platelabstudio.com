// Load the actual shipped GLBs in Node without fetching browser-only textures.
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
let decoderPromise
async function decoderModule() {
  if (!decoderPromise) {
    const module = { exports: {} }
    const dir = new URL('../../public/draco/gltf/', import.meta.url)
    vm.runInNewContext(fs.readFileSync(new URL('draco_wasm_wrapper.js', dir), 'utf8'), {
      module, exports: module.exports, require: createRequire(import.meta.url), __dirname: dir.pathname,
      process, console, WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout,
    })
    decoderPromise = module.exports({ wasmBinary: fs.readFileSync(new URL('draco_decoder.wasm', dir)) })
  }
  return decoderPromise
}
export async function loadVehicleAsset(file) {
  const loader = new GLTFLoader()
  loader.register(parser => { parser.loadTexture = () => Promise.resolve(null); return { name: 'HEADLESS_TEXTURES' } })
  loader.setDRACOLoader({
    preload() {},
    async decodeDracoFile(buffer, callback, ids, _types, _colorSpace, onError) {
      try {
        const draco = await decoderModule(), decoder = new draco.Decoder(), decoded = new draco.Mesh()
        const bytes = new Int8Array(buffer)
        const status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, decoded)
        if (!status.ok()) throw new Error(status.error_msg())
        const geometry = new THREE.BufferGeometry()
        for (const [name, id] of Object.entries(ids)) {
          const attribute = decoder.GetAttributeByUniqueId(decoded, id), size = attribute.num_components()
          const count = decoded.num_points() * size, ptr = draco._malloc(count * 4)
          decoder.GetAttributeDataArrayForAllPoints(decoded, attribute, draco.DT_FLOAT32, count * 4, ptr)
          geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(draco.HEAPF32.buffer, ptr, count).slice(), size))
          draco._free(ptr)
        }
        const count = decoded.num_faces() * 3, ptr = draco._malloc(count * 4)
        decoder.GetTrianglesUInt32Array(decoded, count * 4, ptr)
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(draco.HEAPF32.buffer, ptr, count).slice(), 1))
        draco._free(ptr); draco.destroy(decoded); draco.destroy(decoder)
        callback(geometry)
      } catch (error) { onError(error) }
    },
  })
  const bytes = fs.readFileSync(new URL(`../../public/models/${file}`, import.meta.url))
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
