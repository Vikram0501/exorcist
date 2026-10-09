import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadingManager } from '../../core/loading.js'

const TERRAIN_PATH = '/models/rocky_terrain_low_poly.glb'
const TERRAIN_SCALE = new THREE.Vector3(0.15, 0.15, 0.1)
const TERRAIN_POSITION = new THREE.Vector3(0, 0, -110)

let terrainGltfPromise = null

function loadTerrainGltf() {
  if (!terrainGltfPromise) {
    terrainGltfPromise = new GLTFLoader(loadingManager)
      .loadAsync(TERRAIN_PATH)
      .catch((err) => {
        console.warn('Failed to load rocky_terrain_low_poly.glb:', err)
        return null
      })
  }
  return terrainGltfPromise
}

// Start the terrain download before the carriages finish so it never
// adds to the critical path.
export function preloadTrainTerrain() {
  return loadTerrainGltf()
}

export async function createTrainTerrain(level) {
  const terrainGroup = new THREE.Group()
  terrainGroup.name = 'train_terrain'

  let terrain = null

  const gltf = await loadTerrainGltf()

  if (gltf) {
    terrain = gltf.scene.clone(true)
    terrain.name = 'rocky_terrain'
    terrain.rotation.y = Math.PI / 4
    terrain.scale.copy(TERRAIN_SCALE)
    terrain.position.copy(TERRAIN_POSITION)
    terrain.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true
        child.userData.sharedAsset = true
      }
    })

    terrainGroup.add(terrain)
  }

  level.add(terrainGroup)
  terrainGroup.updateMatrixWorld(true)

  function update() {}

  function dispose() {
    level.remove(terrainGroup)
  }

  return { terrainGroup, terrain, update, dispose }
}
