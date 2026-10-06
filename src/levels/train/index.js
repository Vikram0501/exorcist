import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadingManager } from '../../core/loading.js'
import { createTrainCollision } from './collision.js'
import { createCarriageLights, setupTrainLighting } from './lighting.js'
import { createTrainTerrain, preloadTrainTerrain } from './terrain.js'

const TRAIN_SCALE = 0.1

const CARRIAGE_01_PATH = '/models/Train_Carriage_New_01.glb'
const CARRIAGE_02_PATH = '/models/Train_Carriage_New_02.glb'
const ZOMBIE_PATH = '/models/zombie_the_burnt.glb'
const ZOMBIE_TARGET_HEIGHT = 1.8
const ZOMBIE_POSITION = new THREE.Vector3(9, 0, -118)
const ZOMBIE_YAW = -Math.PI / 2

const cachedGltf = {}
const pendingGltf = {}

function loadModel(path) {
  if (cachedGltf[path]) return Promise.resolve(cachedGltf[path])
  if (pendingGltf[path]) return pendingGltf[path]

  const loader = new GLTFLoader(loadingManager)
  const fetchStarted = performance.now()
  pendingGltf[path] = new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        console.debug(
          `[load:train] fetch + parse ${path.split('/').pop()}: ${(performance.now() - fetchStarted).toFixed(0)}ms`,
        )
        resolve(gltf)
      },
      undefined,
      reject,
    )
  }).then(
    (gltf) => {
      cachedGltf[path] = gltf
      delete pendingGltf[path]
      return gltf
    },
    (err) => {
      delete pendingGltf[path]
      throw err
    },
  )

  return pendingGltf[path]
}

function cloneCarriage(gltf) {
  const model = gltf.scene.clone(true)
  model.scale.setScalar(TRAIN_SCALE)
  model.traverse((child) => {
    if (!child.isMesh) return
    // Level 1 parity: the big environment meshes never cast shadows. The
    // moon light still shades them (receiveShadow), but ~800k triangles
    // stay out of the shadow pass and its depth-material programs.
    child.castShadow = false
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
  carriages.push({ group, model, controller, carriageType, instanceIndex })
  level.add(group)
}


async function placeBurntZombie(level, trainTerrain) {
  let gltf

  try {
    gltf = await loadModel(ZOMBIE_PATH)
  } catch (err) {
    console.warn('Failed to load zombie_the_burnt.glb:', err)
    return null
  }

  const model = gltf.scene.clone(true)
  model.name = 'zombie_the_burnt'
  model.rotation.set(0, 0, 0)
  model.scale.setScalar(1)
  model.position.set(0, 0, 0)

  let bounds = new THREE.Box3().setFromObject(model)
  let size = bounds.getSize(new THREE.Vector3())

  if (size.y < Math.max(size.x, size.z) * 0.7) {
    model.rotation.x = -Math.PI / 2
    bounds = new THREE.Box3().setFromObject(model)
    size = bounds.getSize(new THREE.Vector3())
  }

  const scale = ZOMBIE_TARGET_HEIGHT / Math.max(size.y, 0.001)
  model.scale.setScalar(scale)

  model.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
    child.frustumCulled = false
  })

  let groundY = 0

  if (trainTerrain.terrain) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(ZOMBIE_POSITION.x, 100, ZOMBIE_POSITION.z),
      new THREE.Vector3(0, -1, 0)
    )
    const hits = ray.intersectObject(trainTerrain.terrain, true)
    if (hits.length > 0) groundY = hits[0].point.y
  }

  const group = new THREE.Group()
  group.name = 'zombie_the_burnt_group'
  group.position.set(ZOMBIE_POSITION.x, groundY - bounds.min.y * scale, ZOMBIE_POSITION.z)
  group.rotation.y = ZOMBIE_YAW
  group.add(model)
  level.add(group)
}


export function loadTrain(level) {
  const started = performance.now()
  const mark = (label) =>
    console.debug(`[load:train] ${label}: ${(performance.now() - started).toFixed(0)}ms`)

  // Start every download at once: terrain and the zombie stream in
  // parallel with the carriages instead of after them. Both are awaited
  // again later (createTrainTerrain / placeBurntZombie) via the same
  // cached promises. The .catch guard only prevents an early
  // unhandled-rejection warning.
  preloadTrainTerrain()
  loadModel(ZOMBIE_PATH).catch(() => null)

  return Promise.all([
    loadModel(CARRIAGE_01_PATH),
    loadModel(CARRIAGE_02_PATH),
  ]).then(async () => {
    mark('carriages downloaded + parsed')

    const measureStarted = performance.now()
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
    console.debug(`[load:train] measure + place carriages: ${(performance.now() - measureStarted).toFixed(0)}ms`)

    const collisionStarted = performance.now()
    const controllers = carriages.map(c => c.controller)
    const trainCollision = createTrainCollision(level, carriages)
    console.debug(`[load:train] BVH collision: ${(performance.now() - collisionStarted).toFixed(0)}ms`)

    const lightingStarted = performance.now()
    const carriage02Size = (() => {
      const m = cloneCarriage(cachedGltf[CARRIAGE_02_PATH])
      return new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
    })()

    setupTrainLighting(level, carriages[carriages.length - 1].model, carriage02Size)
    console.debug(`[load:train] lighting setup: ${(performance.now() - lightingStarted).toFixed(0)}ms`)

    const sceneryStarted = performance.now()
    const trainTerrain = await createTrainTerrain(level)
    await placeBurntZombie(level, trainTerrain)
    console.debug(`[load:train] terrain + zombie: ${(performance.now() - sceneryStarted).toFixed(0)}ms`)
    mark('loadTrain total')

    // Player spawns at the far end, facing back toward carriage 01.
    const spawn = new THREE.Vector3(2.8, 2, -127)
    const spawnYaw = Math.PI

    return {
      colliders: [trainCollision],
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
