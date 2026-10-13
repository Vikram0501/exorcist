import { readFileSync } from 'node:fs'
import * as THREE from 'three'

globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
globalThis.self = globalThis
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
const { HouseAvatar } = await import('../src/levels/house/avatar.js')
const data = readFileSync(new URL('../public/levels/house/models/priest-player.glb', import.meta.url))
const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '')
const bounds = new THREE.Box3().setFromObject(gltf.scene)
console.log('Clips:', gltf.animations.map((clip) => clip.name).join(', '))
console.log('Bounds:', bounds.min.toArray(), bounds.max.toArray())
console.log('Skinned meshes:', gltf.scene.getObjectsByProperty('type', 'SkinnedMesh').length)
const walk = gltf.animations.find((clip) => clip.name.endsWith('HnH_Walk_F'))
console.log('Hips walk translation:', walk.tracks.filter((track) => track.name === 'Hunter_Hips_02.position').map((track) => ({
  name: track.name,
  first: Array.from(track.values.slice(0, 3)),
  last: Array.from(track.values.slice(-3)),
})))
const firstCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 500)
const avatar = new HouseAvatar(gltf, firstCamera)
const visualHeight = new THREE.Box3().setFromObject(avatar.visual).getSize(new THREE.Vector3()).y
if (Math.abs(visualHeight - 1) > 0.01) throw new Error(`Unexpected player height: ${visualHeight}`)
console.log('Gameplay height:', visualHeight.toFixed(2), 'm')
const player = {
  position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(0, 0, -2.5),
  eyeHeight: 1, crouching: false, input: { yaw: 0, pitch: 0 },
  getForward: () => new THREE.Vector3(0, 0, -1),
  getRight: () => new THREE.Vector3(1, 0, 0),
}
avatar.update(1 / 60, player, null)
if (avatar.action?.getClip().name !== 'Priest.ao|HnH_Walk_F') throw new Error('Forward walk did not play')
avatar.toggleView()
avatar.update(1 / 60, player, null)
if (!avatar.renderCamera.position.z || !avatar.root.visible) throw new Error('Third-person camera did not activate')
avatar.dispose()
console.log('Forward walk and third-person camera: OK')
