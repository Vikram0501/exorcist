import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js'
import { loadingManager } from '../../core/loading.js'
import { createCarriageLights, setupTrainLighting } from './lighting.js'
import { createTrainTerrain, preloadTrainTerrain } from './terrain.js'
import { createTrainCollision } from './collision.js'

const TRAIN_SCALE = 0.1

const CARRIAGE_01_PATH = '/models/Train_Carriage_New_01.glb'
const CARRIAGE_02_PATH = '/models/Train_Carriage_New_02.glb'

const ZOMBIE_PATH = '/models/zombie_the_burnt.glb'
const ZOMBIE_TARGET_HEIGHT = 1.3


const cachedGltf = {}
const pendingGltf = {}

function loadModel(path) {
  if (cachedGltf[path]) return Promise.resolve(cachedGltf[path])
  if (pendingGltf[path]) return pendingGltf[path]
  const loader = new GLTFLoader(loadingManager)
  pendingGltf[path] = loader.loadAsync(path).then(gltf => {
    cachedGltf[path] = gltf
    delete pendingGltf[path]
    return gltf
  }, error => {
    delete pendingGltf[path]
    throw error
  })
  return pendingGltf[path]
}

function cloneCarriage(gltf) {
  const model = gltf.scene.clone(true)
  model.scale.setScalar(TRAIN_SCALE)
  model.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = false
    child.receiveShadow = true
    // GLTFLoader resources are shared by all carriage instances and retained
    // for quick re-entry to the level.
    child.userData.sharedAsset = true
  })
  model.updateMatrixWorld(true)
  return model
}

function placeCarriage(gltf, z, level, carriages, carriageType, instanceIndex, options = {}) {
  const model = cloneCarriage(gltf)
  const group = new THREE.Group()
  group.name = 'carriage'
  group.add(model)
  const controller = createCarriageLights(group, carriageType, instanceIndex, options)
  group.position.z = z
  level.add(group)
  // Refresh the parent transform before measuring the child model. Otherwise
  // every carriage gets bounds at z=0, hiding the train and misplacing floors.
  group.updateWorldMatrix(true, true)
  carriages.push({ group, model, controller, collisionSource: gltf.scene, bounds: new THREE.Box3().setFromObject(model) })
}

export function updateTrainCarriageVisibility(carriages, playerZ) {
  for (const carriage of carriages) {
    const { min, max } = carriage.bounds
    carriage.group.visible = playerZ >= min.z - 40 && playerZ <= max.z + 40
  }
}

// Cut a carriage's lights for good once the player crosses its far boundary
// into the next carriage. Latching: walking back never restores them.
export function updateTrainCarriageLights(carriages, playerZ) {
  for (const carriage of carriages) {
    const controller = carriage.controller
    if (!controller || controller.cutOut) continue
    if (playerZ > carriage.bounds.max.z) controller.cut()
  }
}

export function measureBounds(root) {
  root.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3()
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld))
  })
  return bounds
}

export function fitZombieModel(model) {
  let bounds = measureBounds(model)
  let size = bounds.getSize(new THREE.Vector3())

  if (size.y < Math.max(size.x, size.z) * 0.7) {
    model.rotateX(-Math.PI / 2)
    bounds = measureBounds(model)
    size = bounds.getSize(new THREE.Vector3())
  }

  const scale = ZOMBIE_TARGET_HEIGHT / Math.max(size.y, 0.001)
  model.scale.setScalar(scale)

  return Number.isFinite(bounds.min.y) ? -bounds.min.y * scale : 0
}

async function placeBurntZombie(level) {
  let gltf

  try {
    gltf = await loadModel(ZOMBIE_PATH)
  } catch (err) {
    console.warn('Failed to load zombie_the_burnt.glb:', err)
    return null
  }

  const model = cloneSkinnedModel(gltf.scene)
  model.name = 'zombie_the_burnt'

  const footOffset = fitZombieModel(model)

  model.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
    child.frustumCulled = false
    child.userData.sharedAsset = true
  })

  const group = new THREE.Group()
  group.name = 'zombie_the_burnt_group'
  group.add(model)
  level.add(group)

  let mixer = null

  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model)
    mixer.clipAction(gltf.animations[0]).play()
  }

  return { group, mixer, footOffset }
}


export function loadTrain(level) {
  preloadTrainTerrain()
  loadModel(ZOMBIE_PATH).catch(() => null)
  return Promise.all([loadModel(CARRIAGE_01_PATH), loadModel(CARRIAGE_02_PATH)]).then(async () => {
    const carriages = []

    // Only the starting carriage — the type 02 furthest from carriage 01 —
    // is lit, and it uses the warm/normal preset so the player can see on
    // arrival. Every other carriage stays dark.
    placeCarriage(cachedGltf[CARRIAGE_01_PATH], 0, level, carriages, '01', 0, { lit: false })
    placeCarriage(cachedGltf[CARRIAGE_02_PATH], 0, level, carriages, '02', 0, { lit: false })
    const carriage02Size = carriages[1].bounds.getSize(new THREE.Vector3())

    // 4x [02] going negative Z. i === 3 is the spawn carriage at the far end.
    for (let i = 1; i < 4; i++) {
      const spawnCarriage = i === 3
      placeCarriage(cachedGltf[CARRIAGE_02_PATH], -i * carriage02Size.z, level, carriages, '02', i, {
        lit: spawnCarriage,
        presetIndex: spawnCarriage ? 0 : i,
      })
    }

    const controllers = carriages.map(c => c.controller)

    const colliders = await createTrainCollision(carriages)

    setupTrainLighting(level, carriages[carriages.length - 1].model, carriage02Size)
    const trainTerrain = await createTrainTerrain(level)
    const zombie = await placeBurntZombie(level)

    // Player spawns at the far end, facing back toward carriage 01.
    const spawn = new THREE.Vector3(2.8, 2, -127)
    const spawnYaw = Math.PI
    updateTrainCarriageVisibility(carriages, spawn.z)

    return {
      colliders,
      colliderHelpers: [],
      lightHelpers: [],
      doors: [],
      ramps: [],
      model: carriages[0].model,
      spawn,
      spawnYaw,
      modelSize: carriage02Size,
      trainTerrain,
      carriages,
      controllers,
      zombie,
    }
  })
}
