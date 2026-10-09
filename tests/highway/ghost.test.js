import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  GHOST_ACCELERATION,
  GHOST_BRAKING,
  GHOST_CRUISE_SPEED,
  GHOST_MAX_SPEED,
  GHOST_MIN_SPEED,
  GHOST_PREFERRED_LANE,
  GHOST_RUBBER_BAND_GAIN,
  GHOST_TARGET_LEAD,
  HighwayRaceController,
} from '../../src/levels/highway/race.js'
import { createDefaultTrack } from '../../src/levels/highway/track.js'

function withStubs(fn) {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
  }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

function makeRace() {
  const track = createDefaultTrack()
  const player = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  player.obstacles = []
  const race = new HighwayRaceController(
    player, new THREE.Object3D(), -880, 'OWEN GRAVE', null,
    new THREE.Scene(), track, null, track.totalLength
  )
  race.obstacles = []
  race.time = 4
  race.finishedCountdown = true
  race.raceStarted = true
  player.setDrivingEnabled(true)
  return { track, player, race }
}

test('ghost tuning values pin the competitive configuration', () => withStubs(() => {
  assert.equal(GHOST_CRUISE_SPEED, 35)
  assert.equal(GHOST_MIN_SPEED, 23)
  assert.equal(GHOST_MAX_SPEED, 40)
  assert.equal(GHOST_ACCELERATION, 12)
  assert.equal(GHOST_BRAKING, 12)
  assert.equal(GHOST_TARGET_LEAD, 6)
  assert.equal(GHOST_RUBBER_BAND_GAIN, 0.9)
  assert.equal(GHOST_PREFERRED_LANE, -2)
}))

test('ghost chases when the player leads', () => withStubs(() => {
  const { player, race } = makeRace()
  // Player far ahead: the ghost must run at catch-up pace, not minimum.
  player.placeAt(400, 0)
  race.ghostPathProgress = 200
  race.ghostSpeed = 22
  for (let i = 0; i < 120; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.ok(
    race.ghostSpeed > 35,
    `ghost chases at ${race.ghostSpeed.toFixed(1)}, never loiters at min`
  )
  player.dispose()
  race.dispose()
}))

test('ghost eases off when it leads by more than its target', () => withStubs(() => {
  const { player, race } = makeRace()
  // Ghost far ahead: it must ease toward minimum, not sprint away.
  player.placeAt(200, 0)
  race.ghostPathProgress = 400
  race.ghostSpeed = 39
  for (let i = 0; i < 180; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.ok(
    race.ghostSpeed < 30,
    `ghost eases off to ${race.ghostSpeed.toFixed(1)}, never vanishes ahead`
  )
  player.dispose()
  race.dispose()
}))

test('ghost escapes an obstacle instead of sticking forever', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  // A zombie exactly in the ghost lane used to trap it in a re-hit loop.
  race.obstacles = [{
    mesh: null, progress: 150, lateralOffset: -2,
    halfWidth: 0.7, halfDepth: 0.7, hit: false,
  }]
  for (let i = 0; i < 1200; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.ok(
    race.ghostPathProgress > 200,
    `ghost escaped and races on s=${race.ghostPathProgress.toFixed(0)}`
  )
  assert.ok(race.ghostSpeed > 10, 'ghost recovered speed after the hit')
  player.dispose()
  race.dispose()
}))

test('ghost obstacle knockback is preserved (pushed back and slowed)', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  // A road-wide wall: no lane clears it, so avoidance correctly reports
  // blocked, slows, and the ghost physically hits it.
  const wall = {
    mesh: null, progress: 150, lateralOffset: 0,
    halfWidth: 6, halfDepth: 0.8, hit: false,
  }
  race.obstacles = [wall]
  let hitSeen = false
  for (let i = 0; i < 1200 && !hitSeen; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.ghostSpeed <= 5.01 && race.ghostPathProgress < 150) {
      hitSeen = true
    }
  }
  assert.ok(hitSeen, 'the ghost still collides with obstacles')
  assert.ok(
    race.ghostPathProgress < 150,
    `knockback puts the ghost behind the hit s=${race.ghostPathProgress.toFixed(1)}`
  )
  assert.ok(
    race.ghostAvoiding && race.ghostAvoidanceObstacle === wall,
    'impact forces avoidance around the same obstacle'
  )
  player.dispose()
  race.dispose()
}))

test('a hit obstacle is NOT permanently ignored', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  const wall = {
    mesh: null, progress: 150, lateralOffset: 0,
    halfWidth: 6, halfDepth: 0.8, hit: false,
  }
  race.obstacles = [wall]
  // Reach the first hit.
  let hitAt = -1
  for (let i = 0; i < 1200 && hitAt < 0; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.ghostSpeed <= 5.01 && race.ghostPathProgress < 150) hitAt = i
  }
  assert.ok(hitAt >= 0, 'precondition: ghost hit the wall')
  // The separation cooldown must expire on its own (nothing permanent).
  for (let i = 0; i < 60; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.equal(
    race.ghostObstacleCooldowns.size, 0,
    'cooldown expires; no permanent exclusion state remains'
  )
  // And the wall is solid again: the ghost re-hits it instead of
  // phasing through (second knockback, same response).
  let secondHit = false
  for (let i = 0; i < 600 && !secondHit; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.ghostSpeed <= 5.01 && race.ghostPathProgress < 150) {
      secondHit = true
    }
  }
  assert.ok(secondHit, 'the same obstacle collides again: still solid')
  player.dispose()
  race.dispose()
}))
