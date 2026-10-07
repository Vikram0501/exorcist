import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { createTrainCollision } from '../../src/levels/train/collision.js'
import { Player } from '../../src/core/player.js'
import { loadTrainGeometry } from './model-fixture.js'

function room() {
  const group = new THREE.Group()
  const box = (size, position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial())
    mesh.position.set(...position)
    group.add(mesh)
  }
  box([4, 0.1, 10], [2, -0.05, 0])
  box([0.1, 3, 10], [0, 1.5, 0])
  box([0.1, 3, 10], [4, 1.5, 0])
  box([1, 1, 0.8], [1, 0.5, 0]) // chair
  box([0.03, 3, 3], [2.5, 1.5, 2]) // thin partition
  box([4, 0.1, 10], [2, 3, 0])
  return group
}

function capsule(x, eyeY, z) {
  return new Capsule(new THREE.Vector3(x, eyeY - 0.8, z), new THREE.Vector3(x, eyeY - 0.2, z), 0.2)
}

function playerWithKeys(keys, start, colliders, frames = 120) {
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener() {} }
  try {
    const input = { yaw: 0, pitch: 0, isDown: code => keys.includes(code) }
    const player = new Player(new THREE.PerspectiveCamera(), input)
    player.reset(start)
    for (let frame = 0; frame < frames; frame++) player.update(0.05, colliders)
    return player
  } finally {
    globalThis.window = previousWindow
  }
}

test('chairs, thin partitions on both sides, and ceilings have collision', async () => {
  const colliders = await createTrainCollision([{ model: room() }])
  const world = colliders[0].world
  assert.ok(world.capsuleIntersect(capsule(1.6, 1.1, 0)).normal.x > 0.5)
  assert.ok(world.capsuleIntersect(capsule(2.35, 1.1, 2)).normal.x < -0.5)
  assert.ok(world.capsuleIntersect(capsule(2.65, 1.1, 2)).normal.x > 0.5)
  assert.ok(world.capsuleIntersect(capsule(2, 3, -2)).normal.y < -0.5)
  assert.equal(world.capsuleIntersect(capsule(2, 1.2, -2)), false)
  const sprinting = playerWithKeys(['KeyD', 'ShiftLeft'], new THREE.Vector3(2, 1.2, 2), colliders)
  assert.ok(sprinting.position.x < 2.3, 'sprinting during slow frames cannot cross a thin wall')
  const chair = playerWithKeys(['KeyA'], new THREE.Vector3(2, 1.2, 0), colliders)
  assert.ok(chair.position.x >= 1.69, 'the player cannot walk through a chair')
})

test('repeated carriages share collision data at their own offsets and leave the aisle open', async () => {
  const source = room()
  const carriages = [0, -10].map(z => {
    const group = new THREE.Group()
    const model = source.clone(true)
    group.add(model)
    group.position.z = z
    return { group, model, collisionSource: source }
  })
  const [{ world }] = await createTrainCollision(carriages)
  assert.equal(world.instances[0].tree, world.instances[1].tree)
  assert.ok(world.capsuleIntersect(capsule(1.6, 1.1, -10)))
  assert.equal(world.capsuleIntersect(capsule(2, 1.2, -5)), false)
})

test('shipped train geometry stops the player at furniture and walls but allows aisle movement', async () => {
  const model = await loadTrainGeometry('02')
  const colliders = await createTrainCollision([{ model }])
  const [{ world }] = colliders
  const chair = playerWithKeys(['KeyA'], new THREE.Vector3(2.8, 2, -22), colliders)
  assert.ok(chair.position.x > 2.2 && chair.position.x < 2.6, 'the authored chair blocks the left side of the aisle')
  const wall = playerWithKeys(['KeyD', 'ShiftLeft'], new THREE.Vector3(2.8, 2, -22), colliders)
  assert.ok(wall.position.x < 4.6, 'the authored carriage side remains solid')
  const aisle = playerWithKeys(['KeyS'], new THREE.Vector3(2.8, 2, -22), colliders, 45)
  assert.ok(aisle.position.z > -16, 'the centre aisle remains walkable')
  assert.ok(aisle.isGrounded)
  assert.ok(aisle.position.y > 1.35)
  assert.ok(world.lastTriangleTests < 2000, 'each movement query examines only nearby triangles')
  assert.ok(world.instances[0].tree.triangles.length / 9 > 100000, 'the whole authored interior participates')
})
