import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshBVH } from 'three-mesh-bvh'
import { Player } from '../../src/core/player.js'
import { createTrainCollision } from '../../src/levels/train/collision.js'

const TRAIN_SCALE = 0.1
const CARRIAGE_01_PATH = '/models/Train_Carriage_New_01.glb'
const CARRIAGE_02_PATH = '/models/Train_Carriage_New_02.glb'

let assetsPromise

function loadAssets() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([
      loadAsset(CARRIAGE_01_PATH),
      loadAsset(CARRIAGE_02_PATH),
    ])
  }
  return assetsPromise
}

async function loadAsset(path) {
  const bytes = await readFile(new URL(`../../public${path}`, import.meta.url))
  const loader = new GLTFLoader()
  loader.register(() => ({
    name: 'TEST_IMAGE',
    loadTexture: async () => new THREE.Texture(),
  }))
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
}

function createCarriage(gltf, level, z, carriageType, instanceIndex) {
  const model = gltf.scene.clone(true)
  model.scale.setScalar(TRAIN_SCALE)
  const group = new THREE.Group()
  group.position.z = z
  group.add(model)
  level.add(group)
  return { group, model, carriageType, instanceIndex }
}

function measureZ(gltf) {
  const model = gltf.scene.clone(true)
  model.scale.setScalar(TRAIN_SCALE)
  model.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).z
}

async function createTrainCollider() {
  const [carriage01, carriage02] = await loadAssets()
  const level = new THREE.Group()
  const carriage02Length = measureZ(carriage02)
  const carriages = [
    createCarriage(carriage01, level, 0, '01', 0),
  ]

  for (let index = 0; index < 4; index++) {
    carriages.push(
      createCarriage(
        carriage02,
        level,
        -carriage02Length * index,
        '02',
        index,
      ),
    )
  }

  level.updateMatrixWorld(true)

  return {
    carriage02Length,
    collider: createTrainCollision(level, carriages),
    level,
  }
}

function createPlayer(position, keys = new Set()) {
  const camera = new THREE.PerspectiveCamera()
  camera.position.copy(position)
  return Object.assign(Object.create(Player.prototype), {
    camera,
    flying: false,
    input: {
      isDown: key => keys.has(key),
      pitch: 0,
      yaw: 0,
    },
    isGrounded: false,
    movement: { radius: 0.2, walk: 3, sprint: 5, acceleration: 20, jump: 5 },
    position: camera.position,
    velocity: new THREE.Vector3(),
  })
}

test('train collision retains every triangle in indexed meshes', () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -2, 0, 0,
    -1, 0, 0,
    -2, 1, 0,
    -1, 1, 0,
    0, 0, 0,
  ], 3))
  geometry.setIndex([0, 1, 2, 2, 1, 3, 1, 4, 3])

  const level = new THREE.Group()
  const group = new THREE.Group()
  const model = new THREE.Group()
  model.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
  group.add(model)
  level.add(group)
  level.updateMatrixWorld(true)

  const collider = createTrainCollision(level, [{
    carriageType: 'indexed',
    group,
    model,
  }])

  assert.equal(collider.instances[0].bvh.geometry.index.count, 9)
})

test('train collision reuses two exact GLB templates across all carriages', async () => {
  const { carriage02Length, collider, level } = await createTrainCollider()

  assert.equal(collider.type, 'meshBvh')
  assert.equal(collider.instances.length, 5)
  assert.equal(new Set(collider.instances.map(instance => instance.bvh)).size, 2)
  assert.equal(level.getObjectByName('trainCollisionResources').visible, false)
  assert.ok(Math.abs(collider.instances[1].bounds.max.z - 8.71) < 0.01)
  assert.ok(Math.abs(collider.instances[2].bounds.max.z - (8.71 - carriage02Length)) < 0.01)
  assert.ok(
    collider.instances[2].bounds.max.z >=
    collider.instances[1].bounds.min.z - 0.01,
  )
})

test('the exact type-02 collision template retains all eleven stair heights', async () => {
  const { collider } = await createTrainCollider()
  const position = collider.instances[1].bvh.geometry.getAttribute('position')
  const heights = new Set()

  for (let index = 0; index < position.count; index++) {
    heights.add(Math.round(position.getY(index) * 1000))
  }

  for (const height of [643, 885, 1138, 1391, 1642, 1892, 2152, 2404, 2658, 2900, 3153]) {
    assert.ok(heights.has(height), `missing stair height ${height}`)
  }
})

test('player lands on the train floor and cannot pass through its outer shell', async () => {
  const { collider } = await createTrainCollider()
  const keys = new Set()
  const player = createPlayer(new THREE.Vector3(2.84, 2, -120), keys)

  for (let frame = 0; frame < 90; frame++) {
    player.update(1 / 60, [collider])
  }

  assert.ok(
    Math.abs(player.position.y - 1.411) < 0.03,
    `landed at ${player.position.toArray().join(', ')}`,
  )
  assert.equal(player.isGrounded, true)

  keys.add('KeyD')
  for (let frame = 0; frame < 90; frame++) {
    player.update(1 / 60, [collider])
  }

  assert.ok(player.position.x <= 4.91)
})

test('player steps onto a quarter-unit BVH tread', () => {
  const floor = new THREE.BoxGeometry(4, 0.1, 4)
  floor.translate(0, -0.05, -1)
  floor.computeBoundingBox()
  const tread = new THREE.BoxGeometry(4, 0.25, 1)
  tread.translate(0, 0.125, -0.5)
  tread.computeBoundingBox()

  const matrixWorld = new THREE.Matrix4()
  const collider = {
    instances: [{
      bounds: floor.boundingBox.clone(),
      bvh: new MeshBVH(floor),
      inverseMatrix: matrixWorld.clone(),
      matrixWorld,
    }, {
      bounds: tread.boundingBox.clone(),
      bvh: new MeshBVH(tread),
      inverseMatrix: matrixWorld.clone(),
      matrixWorld,
    }],
    snapDistance: 0.32,
    stepHeight: 0.32,
    type: 'meshBvh',
  }
  const keys = new Set(['KeyW'])
  const player = createPlayer(new THREE.Vector3(0, 1, 0.3), keys)
  player.isGrounded = true

  for (let frame = 0; frame < 5; frame++) {
    player.update(0.05, [collider])
  }

  assert.ok(
    player.position.z < 0,
    `stopped at ${player.position.toArray().join(', ')} with ground ${player.findMeshBvhGround(collider, player.position.y - 1, 0.32)}`,
  )
  assert.ok(Math.abs(player.position.y - 1.25) < 0.03)
})
