import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createCarriageLights, setupTrainLighting } from './lighting.js'
import { createTrainTerrain } from './terrain.js'
import { createTrainCollision } from './collision.js'

const TRAIN_SCALE = 0.1

const CARRIAGE_01_PATH = '/models/Train_Carriage_New_01.glb'
const CARRIAGE_02_PATH = '/models/Train_Carriage_New_02.glb'

const cachedGltf = {}
const pendingGltf = {}

function loadModel(path) {
  if (cachedGltf[path]) return Promise.resolve(cachedGltf[path])
  if (pendingGltf[path]) return pendingGltf[path]
  const loader = new GLTFLoader()
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

function placeCarriage(gltf, z, level, carriages, carriageType, instanceIndex) {
  const model = cloneCarriage(gltf)
  const group = new THREE.Group()
  group.name = 'carriage'
  group.add(model)
  const controller = createCarriageLights(group, carriageType, instanceIndex)
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

export function loadTrain(level) {
  return Promise.all([loadModel(CARRIAGE_01_PATH), loadModel(CARRIAGE_02_PATH)]).then(async () => {
    const carriages = []

    // [01] at z=0
    placeCarriage(cachedGltf[CARRIAGE_01_PATH], 0, level, carriages, '01', 0)
    placeCarriage(cachedGltf[CARRIAGE_02_PATH], 0, level, carriages, '02', 0)
    const carriage02Size = carriages[1].bounds.getSize(new THREE.Vector3())

    // 4x [02] going negative Z, each with unique lighting preset
    for (let i = 1; i < 4; i++) {
      placeCarriage(cachedGltf[CARRIAGE_02_PATH], -i * carriage02Size.z, level, carriages, '02', i)
    }

    const controllers = carriages.map(c => c.controller)

    const colliders = await createTrainCollision(carriages)

    setupTrainLighting(level, carriages[carriages.length - 1].model, carriage02Size)
    const trainTerrain = createTrainTerrain(level)

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
    }
  })
}
