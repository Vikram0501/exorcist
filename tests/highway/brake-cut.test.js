import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  BRAKE_CUT_WARNING_DURATION,
  BRAKE_CUT_DISABLED_DURATION,
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

function makeLiveRace() {
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

function cruise(player, seconds = 2) {
  player.keys = { KeyW: true }
  for (let i = 0; i < Math.round(seconds * 60); i++) player.update(1 / 60)
}

function driveTo(race, player, progress) {
  player.placeAt(progress, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(30))
  race.updateBrakeCut(1 / 60)
}

// 1. Trigger point: warning at ~24.1%, cut 1.5 s later.
test('brake failure triggers at the scripted progress with warning then cut', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  assert.equal(BRAKE_CUT_WARNING_DURATION, 1.5)
  assert.ok(BRAKE_CUT_DISABLED_DURATION >= 4 && BRAKE_CUT_DISABLED_DURATION <= 6)
  const total = race.track.totalLength
  const warnAt = race.brakeCutWarningProgress
  const triggerAt = race.brakeCutTriggerProgress
  assert.ok(Math.abs(warnAt / total - 230 / 952.6585091144439) < 1e-9)
  assert.ok(Math.abs(triggerAt / total - 250 / 952.6585091144439) < 1e-9)
  driveTo(race, player, warnAt - 5)
  assert.equal(race.brakeCutPhase, 'none')
  assert.equal(player.brakesWorking, true)
  driveTo(race, player, warnAt + 1)
  assert.equal(race.brakeCutPhase, 'warning')
  assert.equal(race.brakeCutWarningEl.style.display, 'block')
  assert.equal(player.brakesWorking, true, 'warning only, brakes still work')
  race.updateBrakeCut(BRAKE_CUT_WARNING_DURATION)
  assert.equal(race.brakeCutPhase, 'cut')
  assert.equal(player.brakesWorking, false, 'cut disables brakes')
  assert.equal(race.brakeCutAftermathEl.style.display, 'block', 'failure message for whole disabled window')
  player.dispose()
  race.dispose()
}))

// 2. While disabled, S / coasting / Space cannot slow the car.
test('disabled brakes block S, coasting drag and Space substitute braking', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  race.brakeCutPhase = 'cut'
  race.brakeCutTimer = 0
  player.brakesWorking = false
  race.brakeCutAftermathEl.style.display = 'block'
  const rolling = player.speed
  assert.ok(rolling > 15)
  // Holding S at speed: no braking, no reverse.
  player.keys = { KeyS: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.speed - rolling) < 1e-9, `S dead ${rolling} -> ${player.speed}`)
  assert.ok(player.speed > 0, 'no reverse bypass')
  // Releasing everything: no natural drag while cut holds.
  player.keys = {}
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.speed - rolling) < 1e-9, `no coasting drag ${rolling} -> ${player.speed}`)
  // Space: no substitute-brake drag.
  player.keys = { Space: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(player.speed > rolling - 2, `Space no loophole ${rolling} -> ${player.speed}`)
  player.dispose()
  race.dispose()
}))

// 3. Steering, throttle and collisions still work during the cut.
test('steering, acceleration and collisions survive brake failure', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  player.brakesWorking = false
  // Steering responds.
  player.keys = { KeyA: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.yawRate) > 0.05, 'can still steer')
  // Throttle still accelerates but is capped, never forced.
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(20))
  player.keys = {}
  player.update(1 / 60)
  const before = player.speed
  player.keys = { KeyW: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(player.speed >= before, 'accelerator preserved')
  assert.ok(player.speed <= player.maxSpeed + 1e-9, 'no indefinite acceleration')
  player.keys = {}
  const rolling = player.speed
  player.update(1 / 60)
  assert.ok(Math.abs(player.speed - rolling) < 1e-9, 'no phantom drag or drive')
  // Obstacle collision still crashes through the normal path.
  player.placeAt(40, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(30))
  player.obstacles = [{ mesh: null, progress: 60, lateralOffset: 0, halfWidth: 1, halfDepth: 1, hit: false }]
  let crashed = null
  player.onCrash = (hit) => { crashed = hit }
  for (let i = 0; i < 300 && player.canDrive; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
  }
  assert.equal(player.canDrive, false, 'collision physics intact')
  assert.ok(crashed, 'onCrash fired')
  player.dispose()
  race.dispose()
}))

// 4. Drift state stays available but costs no pace while cut holds.
test('drift slides but does not scrub speed during brake failure', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  player.brakesWorking = false
  const rolling = player.speed
  player.keys = { KeyW: true, KeyA: true, Space: true }
  for (let i = 0; i < 36; i++) player.update(1 / 60)
  assert.ok(player.driftFactor > 0.5, 'drift engages')
  assert.ok(Math.abs(player.slipAngle) > 0.08, 'slide available')
  assert.ok(player.speed > rolling - 3, `drift drag suspended ${rolling} -> ${player.speed}`)
  player.dispose()
  race.dispose()
}))

// 5. Automatic recovery after 5 s, idempotent and permanent-safe.
test('brakes restore automatically and stay restored', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  driveTo(race, player, race.brakeCutWarningProgress + 1)
  race.updateBrakeCut(BRAKE_CUT_WARNING_DURATION)
  assert.equal(player.brakesWorking, false)
  player.keys = {}
  player.update(1 / 60)
  const rolling = player.speed
  assert.ok(rolling > 15, `rolling into recovery, got ${rolling}`)
  race.updateBrakeCut(BRAKE_CUT_DISABLED_DURATION)
  assert.equal(race.brakeCutPhase, 'done')
  assert.equal(player.brakesWorking, true, 'restored')
  assert.equal(race.brakeCutAftermathEl.style.display, 'none')
  // S brakes again after recovery.
  player.keys = { KeyS: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(player.speed < rolling - 5, `S works again ${rolling} -> ${player.speed}`)
  // Extra updates never re-disable.
  race.updateBrakeCut(5)
  assert.equal(player.brakesWorking, true)
  assert.equal(race.brakeCutPhase, 'done')
  // Finish and dispose are also safe even mid-cut.
  const { player: p2, race: r2 } = makeLiveRace()
  cruise(p2)
  driveTo(r2, p2, r2.brakeCutWarningProgress + 1)
  r2.updateBrakeCut(BRAKE_CUT_WARNING_DURATION)
  assert.equal(p2.brakesWorking, false)
  r2.finishRace('player')
  assert.equal(p2.brakesWorking, true, 'finish restores')
  p2.brakesWorking = false
  r2.dispose()
  assert.equal(p2.brakesWorking, true, 'dispose restores')
  player.dispose()
  race.dispose()
  p2.dispose()
}))
