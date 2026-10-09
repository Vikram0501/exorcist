import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries }
  from 'three/addons/utils/BufferGeometryUtils.js'

export const CITY_MODEL_URL =
  '/models/street_city_buildings_8.glb'

// The asset ships its own concrete ground slab. The highway already owns the
// Level 3 ground, so only the buildings are kept. GLTFLoader strips dots from
// imported node names, which is why the reference has none.
const CITY_GROUND_SLAB_NAME =
  'Plane002_Material010_0'
const CITY_KEEP_GROUND_SLAB = false


export async function loadCityBuildings() {

  const gltf =
    await new GLTFLoader().loadAsync(CITY_MODEL_URL)

  try {

    return prepareCityTemplate(gltf.scene)

  } catch (error) {

    // A rejected level never hands these resources to the game's disposer.
    disposeCitySource(gltf.scene)
    throw error

  }
}


// The source scene is discarded: every kept primitive is baked into world
// space once and merged per material, so a section is a handful of shared
// meshes instead of 73 nodes of repeated draw state.
function prepareCityTemplate(root) {

  root.updateMatrixWorld(true)

  let slab = null
  const sourceMeshes = []

  root.traverse((object) => {

    if (!object.isMesh) return

    if (
      !CITY_KEEP_GROUND_SLAB &&
      object.name === CITY_GROUND_SLAB_NAME
    ) {

      slab = object
      return

    }

    sourceMeshes.push(object)

  })

  if (sourceMeshes.length === 0) {
    throw new Error('City GLB contains no building meshes')
  }

  const batches = new Map()

  for (const mesh of sourceMeshes) {

    if (Array.isArray(mesh.material)) {
      throw new Error(
        'City GLB must not use multi-material meshes'
      )
    }

    const geometry = mesh.geometry

    if (
      !geometry.getAttribute('position') ||
      !geometry.getAttribute('normal') ||
      !geometry.getAttribute('uv') ||
      !geometry.index
    ) {
      throw new Error(
        'City GLB meshes must expose position, normal, uv and indices'
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
  template.name = 'cityBuildingsTemplate'

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
        throw new Error('City GLB meshes could not be merged')
      }

    }

    merged.computeBoundingBox()
    box.union(merged.boundingBox)

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

  if (slab) {

    const geometry = slab.geometry
    const material = slab.material

    if (slab.parent) {
      slab.parent.remove(slab)
    }

    geometry.dispose()

    if (!batches.has(material)) {
      disposeMaterial(material)
    }

  }

  template.userData.cityBox = box

  return template
}


function disposeCitySource(root) {

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
