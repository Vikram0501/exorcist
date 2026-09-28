import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createCarriageLights, setupTrainLighting } from './lighting.js'
import { createTrainTerrain } from './terrain.js'

const TRAIN_SCALE = 0.1

const CARRIAGE_01_PATH = '/models/Train_Carriage_New_01.glb'
const CARRIAGE_02_PATH = '/models/Train_Carriage_New_02.glb'

const cachedGltf = {}

function loadModel(path) {
  if (cachedGltf[path]) return Promise.resolve(cachedGltf[path])
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(path, (gltf) => { cachedGltf[path] = gltf; resolve(gltf) }, undefined, reject)
  })
}

function cloneCarriage(gltf) {
  const model = gltf.scene.clone(true)
  model.scale.setScalar(TRAIN_SCALE)
  model.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
  })
  model.updateMatrixWorld(true)
  return model
}

function measureZ(gltf) {
  const m = cloneCarriage(gltf)
  m.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).z
}

function placeCarriage(gltf, z, level, carriages, carriageType, instanceIndex) {
  const model = cloneCarriage(gltf)
  const group = new THREE.Group()
  group.name = 'carriage'
  group.add(model)
  const controller = createCarriageLights(group, carriageType, instanceIndex)
  group.position.z = z
  carriages.push({ group, model, controller })
  level.add(group)
}


export function loadTrain(level) {
  return Promise.all([loadModel(CARRIAGE_01_PATH), loadModel(CARRIAGE_02_PATH)]).then(() => {
    const L1 = measureZ(cachedGltf[CARRIAGE_01_PATH])
    const L2 = measureZ(cachedGltf[CARRIAGE_02_PATH])

    const carriages = []
    let z = 0
    let carriage02Instance = 0

    // [01] at z=0
    placeCarriage(cachedGltf[CARRIAGE_01_PATH], z, level, carriages, '01', 0)

    // 4x [02] going negative Z, each with unique lighting preset
    for (let i = 0; i < 4; i++) {
      placeCarriage(cachedGltf[CARRIAGE_02_PATH], z, level, carriages, '02', carriage02Instance)
      carriage02Instance++
      z -= L2
    }

    const controllers = carriages.map(c => c.controller)

    const carriage02Size = (() => {
      const m = cloneCarriage(cachedGltf[CARRIAGE_02_PATH])
      return new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
    })()

    setupTrainLighting(level, carriages[carriages.length - 1].model, carriage02Size)
    const trainTerrain = createTrainTerrain(level)

    // Player spawns at the far end, facing back toward carriage 01.
    const spawn = new THREE.Vector3(2.8, 2, -127)
    const spawnYaw = Math.PI

    return {
      colliders: [],
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
