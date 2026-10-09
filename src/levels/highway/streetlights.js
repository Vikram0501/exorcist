import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries }
  from 'three/addons/utils/BufferGeometryUtils.js'

export const STREETLIGHT_MODEL_URL =
  '/models/street_lamp.glb'


export async function loadStreetlightTemplate() {

  const gltf =
    await new GLTFLoader().loadAsync(STREETLIGHT_MODEL_URL)

  try {

    return prepareStreetlightTemplate(gltf.scene)

  } catch (error) {

    // A rejected level never hands these resources to the game's disposer.
    disposeStreetlightSource(gltf.scene)
    throw error

  }
}


// The source scene is discarded: every kept primitive is baked into world
// space once and merged per material, so each pole is a handful of shared
// meshes instead of the GLB's raw node tree. Clones share the merged
// geometry/materials, so one network load serves the whole corridor.
function prepareStreetlightTemplate(root) {

  root.updateMatrixWorld(true)

  const sourceMeshes = []

  root.traverse((object) => {

    if (!object.isMesh) return

    sourceMeshes.push(object)

  })

  if (sourceMeshes.length === 0) {
    throw new Error('Streetlight GLB contains no meshes')
  }

  const batches = new Map()

  for (const mesh of sourceMeshes) {

    if (Array.isArray(mesh.material)) {
      throw new Error(
        'Streetlight GLB must not use multi-material meshes'
      )
    }

    const geometry = mesh.geometry

    if (
      !geometry.getAttribute('position') ||
      !geometry.getAttribute('normal') ||
      !geometry.index
    ) {
      throw new Error(
        'Streetlight GLB meshes must expose position, normal and indices'
      )
    }

    const baked =
      geometry.clone().applyMatrix4(mesh.matrixWorld)

    let batch = batches.get(mesh.material)

    if (!batch) {

      batch = []
      batches.set(mesh.material, batch)

    }

    batch.push(baked)

  }

  const template = new THREE.Group()
  template.name = 'streetlightTemplate'

  const box = new THREE.Box3()

  for (const [material, batch] of batches) {

    let merged

    if (batch.length === 1) {

      merged = batch[0]

    } else {

      merged = mergeGeometries(batch, false)

      for (const geometry of batch) {
        geometry.dispose()
      }

      if (!merged) {
        throw new Error('Streetlight GLB meshes could not be merged')
      }

    }

    merged.computeBoundingBox()
    box.union(merged.boundingBox)

    // The lamp head stays visibly lit against the apocalyptic sky: a pure
    // emissive boost, no real lights, so the corridor costs nothing extra.
    if (
      material.name === 'light' &&
      material.emissive
    ) {
      material.emissiveIntensity = 2.2
    }

    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    template.add(mesh)

  }

  // Source geometry is private to the discarded scene; the merged copies are
  // independent buffers. Materials stay alive, shared with the template.
  for (const mesh of sourceMeshes) {
    mesh.geometry.dispose()
  }

  template.userData.streetlightBox = box

  return template
}


function disposeStreetlightSource(root) {

  root.traverse((object) => {

    if (object.isMesh) {
      object.geometry.dispose()
    }

    if (!object.isMaterial) return

    const materials = Array.isArray(object.material)
      ? object.material : [object.material]

    for (const material of materials) {
      if (material) disposeMaterial(material)
    }

  })

}


function disposeMaterial(material) {

  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose()
  }

  material.dispose()

}
