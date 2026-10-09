import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js'
import { TrainZombie, trainFloorAt, trainFloorAlong } from '../../src/levels/train/zombie.js'
import { createTrainCollision } from '../../src/levels/train/collision.js'
import { fitZombieModel, measureBounds } from '../../src/levels/train/index.js'
import { loadTrainGeometry, loadZombieGeometry } from './model-fixture.js'

const AISLE_X = 2.9

function carriage(minZ, maxZ) {
  return { bounds: new THREE.Box3(new THREE.Vector3(0, 0, minZ), new THREE.Vector3(5, 3, maxZ)) }
}

function harness() {
  const group = new THREE.Group()
  const carriages = [carriage(0, 35), carriage(-35, 0), carriage(-70, -35)]
  const colliders = [{ type: 'mesh', world: { capsuleIntersect: () => false } }]
  const zombie = new TrainZombie({ group, carriages, colliders })
  return { zombie, group, carriages }
}

function playerAt(x, z, { crouching = false, flashlightOn = false, speed = 0 } = {}) {
  return {
    position: new THREE.Vector3(x, 1.4, z),
    velocity: new THREE.Vector3(0, 0, speed),
    crouching,
    flashlightOn,
  }
}

function step(zombie, player, frames, dt = 0.05) {
  let outcome = null
  for (let frame = 0; frame < frames; frame++) {
    const result = zombie.update(dt, player)
    if (result) outcome = result
  }
  return outcome
}

test('the zombie sleeps until the player leaves the spawn carriage', () => {
  const { zombie, group, carriages } = harness()
  const startZ = group.position.z

  assert.equal(zombie.state, 'dormant')
  assert.equal(carriages.at(-1).bounds.max.z, -35)

  step(zombie, playerAt(AISLE_X, 6), 1)
  assert.equal(zombie.state, 'patrol', 'crossing past the spawn carriage wakes it')
  assert.equal(group.visible, true)

  const other = harness()
  step(other.zombie, playerAt(AISLE_X, -67), 30)
  assert.equal(other.zombie.state, 'dormant')
  assert.equal(other.group.position.z, startZ)
  assert.equal(other.group.visible, false, 'kept out of sight until the player comes close')
})

test('it starts parked in the carriage after the spawn carriage', () => {
  const { group, carriages } = harness()
  const spawn = carriages[carriages.length - 1]
  const following = carriages[carriages.length - 2]

  assert.ok(group.position.z > spawn.bounds.max.z, 'ahead of the spawn carriage')
  assert.ok(
    group.position.z >= following.bounds.min.z && group.position.z <= following.bounds.max.z,
    'inside the carriage after it'
  )
  assert.ok(Math.abs(group.position.z - (following.bounds.max.z - 2)) < 1e-6, 'parked at its far end')
})

test('it stalks the aisle forwards and backwards between the carriage ends', () => {
  const { zombie, group } = harness()
  const observer = playerAt(AISLE_X, 6)

  step(zombie, observer, 2)

  const seen = new Set()
  let reversed = false
  let previous = zombie.direction
  for (let frame = 0; frame < 4000; frame++) {
    zombie.update(0.05, observer)
    seen.add(zombie.direction)
    if (zombie.direction !== previous) reversed = true
    previous = zombie.direction
    assert.ok(group.position.z >= zombie.minZ - 1e-6, 'never walks past the rear carriage')
    assert.ok(group.position.z <= zombie.maxZ + 1e-6, 'never walks past the front carriage')
  }

  assert.ok(reversed, 'it turns around at the ends of the train')
  assert.deepEqual([...seen].sort(), [-1, 1])
  assert.ok(Math.abs(group.position.x - AISLE_X) < 0.05, 'it holds the aisle line')
})

test('it turns back toward the player every twenty seconds instead of walking away forever', () => {
  const { zombie, group } = harness()
  const watcher = playerAt(AISLE_X, 6)

  step(zombie, watcher, 1)
  assert.equal(zombie.state, 'patrol')
  assert.equal(zombie.direction, -1, 'it starts out walking away from the player')

  step(zombie, watcher, 380)
  assert.equal(zombie.direction, -1, 'nothing turns it before the interval elapses')
  assert.ok(group.position.z < -15, `it kept walking the wrong way, reached ${group.position.z}`)

  step(zombie, watcher, 40)
  assert.equal(zombie.direction, 1, 'the timer swings it back toward the player')

  const turned = group.position.z
  step(zombie, watcher, 60)
  assert.ok(group.position.z > turned, 'it now closes the distance instead of drifting off')
})

test('it hunts a moving player nearby and catches them', () => {
  const { zombie, group } = harness()

  step(zombie, playerAt(AISLE_X, 6), 1)
  assert.equal(zombie.state, 'patrol')

  const runner = playerAt(AISLE_X, group.position.z + 4, { speed: 2 })
  assert.equal(zombie.update(0.05, runner), null)
  assert.equal(zombie.state, 'hunt')

  const startDistance = Math.abs(group.position.z - runner.position.z)
  step(zombie, runner, 4)
  assert.ok(Math.abs(group.position.z - runner.position.z) < startDistance, 'it moves toward the player')

  assert.equal(step(zombie, runner, 300), 'caught')
})

test('a stationary player is found by touch, not by sight', () => {
  const { zombie, group } = harness()
  const still = playerAt(AISLE_X, 2)

  step(zombie, playerAt(AISLE_X, 6), 1)
  assert.equal(zombie.state, 'patrol')

  step(zombie, still, 60)
  assert.equal(zombie.state, 'patrol')
  assert.ok(Math.abs(group.position.z - still.position.z) > 1.5, 'it walks past without noticing')

  group.position.z = still.position.z
  group.position.x = AISLE_X
  assert.equal(zombie.update(0.05, still), 'caught')
})

function seatedHarness() {
  const group = new THREE.Group()
  const carriages = [carriage(0, 35), carriage(-35, 0), carriage(-70, -35)]
  const world = { capsuleIntersect: capsule => capsule.start.x < 2.5 || capsule.start.x > 3.3 }
  const colliders = [{ type: 'mesh', world }]
  const zombie = new TrainZombie({ group, carriages, colliders })
  return { zombie, group }
}

test('crouching anywhere off the zombie path with the torch off hides the player', () => {
  const { zombie, group } = seatedHarness()
  step(zombie, playerAt(AISLE_X, 6), 1)
  assert.equal(zombie.state, 'patrol')

  const inAisle = playerAt(AISLE_X, group.position.z + 4, { crouching: true, speed: 4 })
  assert.equal(zombie.update(0.05, inAisle), null)
  assert.equal(zombie.hidden, false, 'the aisle is the path, so a crouched player there is seen')
  assert.equal(zombie.state, 'hunt')

  const elsewhere = seatedHarness()
  step(elsewhere.zombie, playerAt(AISLE_X, 6), 1)
  const hidden = playerAt(AISLE_X - 1.5, elsewhere.group.position.z, { crouching: true, speed: 4 })
  assert.equal(elsewhere.zombie.update(0.05, hidden), null)
  assert.equal(elsewhere.zombie.hidden, true, 'anywhere off the path hides them')
  assert.equal(step(elsewhere.zombie, hidden, 120), null, 'it cannot find a hidden player')
  assert.equal(elsewhere.zombie.state, 'patrol')
})

test('it follows the corridor around the furniture at the carriage end', async () => {
  const model = await loadTrainGeometry('02')
  const colliders = await createTrainCollision([{ model }])
  const group = new THREE.Group()
  const bounds = new THREE.Box3(new THREE.Vector3(0, 0, -26.3), new THREE.Vector3(5, 3, 8.7))
  const zombie = new TrainZombie({ group, carriages: [{ bounds }], colliders })
  const world = colliders[0].world

  const clear = (x, z) => {
    const capsule = new Capsule(new THREE.Vector3(x, 0.72, z), new THREE.Vector3(x, 1.18, z), 0.2)
    return !world.capsuleIntersect(capsule)
  }

  const watcher = playerAt(AISLE_X, 9)
  assert.equal(step(zombie, watcher, 1), null)
  assert.equal(zombie.state, 'patrol')

  let blocked = 0
  let insideFurniture = 0
  let walkedThroughFurniture = 0
  for (let frame = 0; frame < 2400; frame++) {
    zombie.update(0.05, watcher)
    const { x, z } = group.position
    if (!clear(x, z)) blocked++
    if (z >= 3.7 && z <= 4.3) {
      insideFurniture++
      if (x >= 2.3 && x <= 3.4) walkedThroughFurniture++
    }
  }

  assert.equal(blocked, 0, 'everywhere it walks is clear of the carriage geometry')
  assert.ok(insideFurniture > 0, 'it walked past the blocked end section')
  assert.equal(walkedThroughFurniture, 0, 'it slid out of the aisle instead of through the furniture')
})

test('it keeps moving toward a player it cannot reach', async () => {
  const model = await loadTrainGeometry('02')
  const colliders = await createTrainCollision([{ model }])
  const group = new THREE.Group()
  const bounds = new THREE.Box3(new THREE.Vector3(0, 0, -26.3), new THREE.Vector3(5, 3, 8.7))
  const zombie = new TrainZombie({ group, carriages: [{ bounds }], colliders })

  const seated = playerAt(0.8, -15, { flashlightOn: true })
  step(zombie, playerAt(AISLE_X, 9), 1)
  assert.equal(zombie.state, 'patrol')
  group.position.set(AISLE_X, group.position.y, -8)

  let outcome = null
  let still = 0
  let longestStill = 0
  let hunted = 0
  let previous = group.position.clone()
  for (let frame = 0; frame < 400; frame++) {
    const result = zombie.update(0.05, seated)
    if (result) outcome = result
    if (zombie.state === 'hunt') {
      hunted++
      if (group.position.distanceTo(previous) < 1e-9) {
        still++
        longestStill = Math.max(longestStill, still)
      } else {
        still = 0
      }
    } else {
      still = 0
    }
    previous.copy(group.position)
  }

  assert.equal(zombie.state, 'hunt', 'it noticed the lit player')
  assert.ok(hunted > 200, `it kept hunting for ${hunted} frames`)
  assert.equal(outcome, null, 'the seat backs keep the player out of reach')
  assert.ok(longestStill < 3, `it never stands still, longest pause was ${longestStill} frames`)
})

test('standing, staying lit, or lingering in the aisle gives the player away', () => {
  const exposed = [
    ['standing', AISLE_X - 1.5, { speed: 4 }],
    ['torch lit', AISLE_X - 1.5, { crouching: true, flashlightOn: true }],
    ['aisle', AISLE_X, { crouching: true, speed: 4 }],
  ]

  for (const [label, x, options] of exposed) {
    const { zombie, group } = harness()
    step(zombie, playerAt(AISLE_X, 6), 1)
    const player = playerAt(x, group.position.z + 4, options)
    assert.equal(step(zombie, player, 300), 'caught', label)
  }
})

test('the floor probe falls back to ground level without collision data', () => {
  assert.equal(trainFloorAt(undefined, AISLE_X, 0), 0)
  assert.equal(trainFloorAt([], AISLE_X, 0), 0)
  assert.equal(trainFloorAt([{ type: 'octree' }], AISLE_X, 0), 0)
  assert.equal(trainFloorAlong([], AISLE_X, -10, 10), 0)
})

test('the floor probe reads the real carriage deck wherever it walks', async () => {
  const model = await loadTrainGeometry('02')
  const colliders = await createTrainCollision([{ model }])

  const floor = trainFloorAlong(colliders, AISLE_X, -26, 8.7)
  assert.ok(floor > 0.3 && floor < 0.6, `the deck sits under the aisle, got ${floor}`)

  const clearColumn = trainFloorAt(colliders, AISLE_X, -22)
  assert.ok(Math.abs(clearColumn - floor) < 0.1, 'a clear aisle column reads the same deck')

  const group = new THREE.Group()
  const bounds = new THREE.Box3(new THREE.Vector3(0, 0, -26.3), new THREE.Vector3(5, 3, 8.7))
  const zombie = new TrainZombie({ group, carriages: [{ bounds }], colliders })
  assert.ok(zombie.floorY > 0.3 && zombie.floorY < 0.6, 'the stalker starts standing on the floor')
  assert.ok(Math.abs(group.position.y - zombie.floorY) < 1e-6)
})

test('the stalker is fitted to stand just above the player', async () => {
  const heights = []

  for (let load = 0; load < 2; load++) {
    const model = cloneSkinnedModel(await loadZombieGeometry())
    const footOffset = fitZombieModel(model)

    const bounds = measureBounds(model)
    heights.push(bounds.getSize(new THREE.Vector3()).y)

    assert.ok(Number.isFinite(footOffset))
    assert.ok(Math.abs(bounds.min.y) < 0.05, 'its feet sit on the floor line')
    assert.ok(Math.abs(footOffset) < 0.05, 'the feet stay under the body')
  }

  assert.ok(Math.abs(heights[0] - 1.3) < 0.001, `the stalker stands 1.3 units tall, got ${heights[0]}`)
  assert.ok(Math.abs(heights[0] - heights[1]) < 1e-6, 'the fit does not depend on skeleton state')
  assert.ok(heights[0] > 1, 'it is a little taller than the player capsule')
})
