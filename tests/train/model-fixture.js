import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Load the shipped geometry with its real hierarchy/transforms. Textures are
// irrelevant for these tests and require browser image APIs, so omit them here.
async function parseWithoutImages(file) {
  const path = new URL(`../../public/models/${file}`, import.meta.url)
  const source = await readFile(path)
  const jsonLength = source.readUInt32LE(12)
  const metadata = JSON.parse(source.subarray(20, 20 + jsonLength).toString())
  metadata.materials = metadata.materials.map(() => ({ doubleSided: true }))
  delete metadata.images
  delete metadata.textures
  const json = Buffer.from(JSON.stringify(metadata))
  const paddedLength = Math.ceil(json.length / 4) * 4
  const binary = source.subarray(20 + jsonLength)
  const buffer = Buffer.alloc(20 + paddedLength + binary.length, 0x20)
  buffer.write('glTF', 0)
  buffer.writeUInt32LE(2, 4)
  buffer.writeUInt32LE(buffer.length, 8)
  buffer.writeUInt32LE(paddedLength, 12)
  buffer.write('JSON', 16)
  json.copy(buffer, 20)
  binary.copy(buffer, 20 + paddedLength)
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '')
}

export async function loadTrainGeometry(type) {
  const gltf = await parseWithoutImages(`Train_Carriage_New_${type}.glb`)
  gltf.scene.scale.setScalar(0.1)
  gltf.scene.updateWorldMatrix(true, true)
  return gltf.scene
}

export async function loadZombieGeometry() {
  const gltf = await parseWithoutImages('zombie_the_burnt.glb')
  return gltf.scene
}
