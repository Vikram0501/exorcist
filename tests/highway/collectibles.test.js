import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { asTrack, createDefaultTrack } from '../../src/levels/highway/track.js'
import { BOUNDARY_D } from '../../src/levels/highway/car.js'
import {
  CAR_HALF_DEPTH, CAR_HALF_WIDTH, checkObstacleCollision, createObstacles,
} from '../../src/levels/highway/obstacles.js'
import {
  PICKUP_RADIUS, LETTER_FRONT_BACK_CLEARANCE, LETTER_SIDE_CLEARANCE,
  LETTER_LATERAL_LIMIT, LETTER_MIN_SPACING,
  isLetterPositionSafe, planLetterPositions,
} from '../../src/levels/highway/collectible-placement.js'
import {
  createCollectibles, updateCollectibles, disposeCollectibles,
} from '../../src/levels/highway/collectibles.js'

function straight(length = 1000) {
  return asTrack([new THREE.Vector3(), new THREE.Vector3(0, 0, -length)])
}

function obstacle(progress, lateralOffset = 0, halfWidth = 2, halfDepth = 0.8) {
  return { progress, lateralOffset, halfWidth, halfDepth }
}

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

test('rejects obstacle footprints and reserves symmetric front/back and pickup clearance', () => {
  const track = straight()
  const obs = obstacle(200)
  const depth = obs.halfDepth + CAR_HALF_DEPTH + PICKUP_RADIUS + LETTER_FRONT_BACK_CLEARANCE
  assert.equal(isLetterPositionSafe(track, 200, 0, [obs]), false)
  for (const side of [-1, 1]) {
    for (const offset of [obs.halfDepth, obs.halfDepth + CAR_HALF_DEPTH, depth - 0.1]) {
      assert.equal(isLetterPositionSafe(track, 200 + side * offset, 0, [obs]), false)
    }
    assert.equal(isLetterPositionSafe(track, 200 + side * (depth + 0.1), 0, [obs]), true)
  }
  // A car can fit beside this obstacle, but the pickup zone plus margin cannot.
  const edgeObstacle = obstacle(200, -3.5, 0.7)
  assert.equal(checkObstacleCollision([edgeObstacle], 200, -1, CAR_HALF_DEPTH, CAR_HALF_WIDTH), null)
  assert.equal(isLetterPositionSafe(track, 200, -1, [edgeObstacle]), false)
  assert.equal(isLetterPositionSafe(track, 200, LETTER_LATERAL_LIMIT, [edgeObstacle]), true)
})

test('keeps the pickup zone within the drivable corridor and before the finish', () => {
  const track = straight()
  const positions = planLetterPositions(track, 12, [], seededRandom(2))
  for (const { progress, lateralOffset } of positions) {
    assert.ok(Math.abs(lateralOffset) + PICKUP_RADIUS < BOUNDARY_D)
    // Nearest dressing is the curb at |d|=6.2; wall feet start at 7.
    assert.ok(Math.abs(lateralOffset) + PICKUP_RADIUS + CAR_HALF_WIDTH < 6.2)
    assert.ok(progress - PICKUP_RADIUS - CAR_HALF_DEPTH > 0)
    assert.ok(progress + PICKUP_RADIUS + CAR_HALF_DEPTH < track.getFinishDistance())
  }
  assert.equal(isLetterPositionSafe(track, 200, BOUNDARY_D, []), false)
  assert.equal(isLetterPositionSafe(track, track.getFinishDistance(), 0, []), false)
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i].progress - positions[i - 1].progress >= LETTER_MIN_SPACING - 1e-8)
  }
  assert.ok(positions[0].progress < track.totalLength * 0.15)
  assert.ok(positions.at(-1).progress > track.totalLength * 0.75)
})

test('curved and banked track placements clear obstacle footprints across randomized layouts', () => {
  const track = createDefaultTrack()
  for (let seed = 1; seed <= 20; seed++) {
    const random = seededRandom(seed)
    const obstacles = []
    for (let s = 170; s < track.getFinishDistance() - 30; s += 90 + random() * 40) {
      obstacles.push(obstacle(s, -3.5 + random() * 7, 0.7 + random() * 1.3))
    }
    const positions = planLetterPositions(track, 12, obstacles, random)
    assert.equal(positions.length, 12)
    for (const { progress, lateralOffset } of positions) {
      assert.ok(isLetterPositionSafe(track, progress, lateralOffset, obstacles))
      const world = track.toWorld(progress, lateralOffset, 0.2)
      const recovered = track.toTrack(world)
      assert.ok(Math.abs(recovered.s - progress) < 0.2)
      assert.ok(Math.abs(recovered.d - lateralOffset) < 0.2)
      // Independently test the car-sized pickup zone at its centre and edges.
      for (const [ds, dd] of [[0, 0], [-PICKUP_RADIUS, 0], [PICKUP_RADIUS, 0], [0, -PICKUP_RADIUS], [0, PICKUP_RADIUS]]) {
        assert.equal(checkObstacleCollision(obstacles, progress + ds, lateralOffset + dd,
          CAR_HALF_DEPTH + LETTER_FRONT_BACK_CLEARANCE, CAR_HALF_WIDTH + LETTER_SIDE_CLEARANCE), null)
      }
    }
  }
})

test('rejects an obstacle on a nearby return section even with distant track progress', () => {
  // Two antiparallel straights, 3 m apart, joined by a return bend.
  const track = asTrack([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -100),
    new THREE.Vector3(0, 0, -200), new THREE.Vector3(3, 0, -200),
    new THREE.Vector3(3, 0, -100), new THREE.Vector3(3, 0, 0),
  ])
  const s = track.toTrack(new THREE.Vector3(0, 0, -100)).s
  const otherS = track.toTrack(new THREE.Vector3(3, 0, -100)).s
  assert.ok(Math.abs(s - otherS) > 100)
  assert.equal(isLetterPositionSafe(track, s, 0, [obstacle(otherS)]), false)
})

test('finds all letters when only a narrow safe pocket remains, without random retries', () => {
  const track = straight(300)
  // The only available interval is (92.5, 107.5), enough for two pickups.
  const obstacles = [obstacle(0, 0, 20, 80), obstacle(240, 0, 20, 120)]
  const positions = planLetterPositions(track, 2, obstacles, () => 0)
  assert.equal(positions.length, 2)
  for (const p of positions) {
    assert.ok(p.progress > 92.5 && p.progress < 107.5)
    assert.ok(isLetterPositionSafe(track, p.progress, p.lateralOffset, obstacles))
  }
  assert.ok(positions[1].progress - positions[0].progress >= LETTER_MIN_SPACING)
  assert.throws(() => planLetterPositions(track, 3, obstacles), /only 2 safe stations/)
})

test('borrows safe positions from other sections instead of dropping letters', () => {
  const track = straight()
  const obstacles = [obstacle(400, 0, 20, 200)]
  const positions = planLetterPositions(track, 12, obstacles, () => 0.5)
  assert.equal(positions.length, 12)
  assert.ok(positions.some(p => p.progress < 180))
  assert.ok(positions.some(p => p.progress > 620))
  assert.ok(positions.every(p => isLetterPositionSafe(track, p.progress, p.lateralOffset, obstacles)))
})

function withCanvas(fn) {
  const previous = globalThis.document
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
  }
  try { fn() } finally { globalThis.document = previous }
}

test('production obstacle density still leaves every letter safe and collectible', () => withCanvas(() => {
  // End-to-end production path with the real spawner (stub visuals only):
  // default track + createObstacles distribution + createCollectibles.
  // Guards against the obstacle list being dropped or the density
  // overwhelming the planner in the shipped configuration.
  const track = createDefaultTrack()
  const highway = new THREE.Group()
  const stubTemplate = (key, halfWidth, halfDepth) => ({
    key,
    def: { key, yaw: 0, animate: false, halfWidth, halfDepth },
    scene: new THREE.Group(),
    scale: 1,
    yOffset: 0,
    clips: [],
  })
  const templates = [
    stubTemplate('zombie', 0.7, 0.7),
    stubTemplate('scientist', 1.0, 0.6),
    stubTemplate('barbed', 2.0, 0.8),
  ]
  const originalRandom = Math.random
  Math.random = seededRandom(7)
  let obstacles
  try {
    obstacles = createObstacles(templates, track, null, track.totalLength, highway)
  } finally {
    Math.random = originalRandom
  }
  assert.ok(obstacles.length >= 8, `production-like density, got ${obstacles.length}`)
  for (const child of [...highway.children]) highway.remove(child)
  const ui = { revealLetter() {} }
  const letters = createCollectibles('OWEN GRAVE', highway, ui, track, null, track.totalLength, obstacles)
  try {
    assert.equal(letters.length, 9)
    const player = new THREE.Object3D()
    for (const pickup of letters) {
      assert.ok(isLetterPositionSafe(track, pickup.progress, pickup.lateralOffset, obstacles),
        `letter '${pickup.letter}' safe at s=${pickup.progress.toFixed(1)}`)
      player.position.copy(track.toWorld(pickup.progress, pickup.lateralOffset, 0.2))
      updateCollectibles(letters, player, ui, 1 / 60)
      assert.equal(pickup.collected, true)
    }
  } finally {
    disposeCollectibles(letters)
  }
}))

test('generation validates before creating meshes, and every generated letter can be collected', () => withCanvas(() => {
  const track = createDefaultTrack()
  const highway = new THREE.Group()
  const obstacles = [obstacle(200), obstacle(600), obstacle(1000)]
  const revealed = []
  const ui = { revealLetter: index => revealed.push(index) }
  const letters = createCollectibles('OWEN GRAVE', highway, ui, track, null, track.totalLength, obstacles)
  try {
    assert.equal(letters.length, 9)
    assert.equal(letters.map(p => p.letter).join(''), 'OWENGRAVE')
    const player = new THREE.Object3D()
    for (const pickup of letters) {
      const { progress, lateralOffset } = pickup
      assert.ok(isLetterPositionSafe(track, progress, lateralOffset, obstacles))
      player.position.copy(track.toWorld(progress, lateralOffset, 0.2))
      assert.ok(Math.hypot(player.position.x - pickup.mesh.position.x,
        player.position.z - pickup.mesh.position.z) < 1e-8)
      assert.equal(player.position.y, pickup.baseY)
      updateCollectibles(letters, player, ui, 1 / 60)
      assert.equal(pickup.collected, true)
      assert.equal(pickup.mesh.visible, false)
    }
    assert.deepEqual(revealed.sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8])
  } finally {
    disposeCollectibles(letters)
  }
  assert.equal(highway.children.length, 0)
  const blocked = [obstacle(track.totalLength / 2, 0, 100, track.totalLength)]
  assert.throws(() => createCollectibles('OWEN GRAVE', highway, ui, track, null,
    track.totalLength, blocked), /Cannot place 9 collectible letters safely/)
  assert.equal(highway.children.length, 0, 'no partially generated letters on failure')
  assert.deepEqual(planLetterPositions(track, 0, blocked), [])
}))
