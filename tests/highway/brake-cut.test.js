import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  BRAKE_CUT_WARNING_DURATION,
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

// 2. Failed brakes AND coasting cannot slow the car: a cut car keeps rolling.
test('disabled brakes block S, reverse, coasting drag and Space substitute braking', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  driveTo(race, player, race.brakeCutWarningProgress + 1)
  race.updateBrakeCut(BRAKE_CUT_WARNING_DURATION)
  assert.equal(race.brakeCutPhase, 'cut')
  assert.equal(player.brakesWorking, false)
  const rolling = player.velocity.dot(player.forwardVector(new THREE.Vector3()))
  assert.ok(rolling > 15)
  // Compare the same start speed with S held and without input.
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(rolling))
  player.keys = { KeyS: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  const failedBrakeSpeed = player.speed
  assert.equal(player.brakeInput, false, 'S is ignored in the physics input')
  assert.ok(player.speed > 0, 'no reverse bypass')
  assert.ok(Math.abs(player.speed - rolling) < 0.05, `S cannot slow a cut car ${rolling} -> ${player.speed}`)
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(rolling))
  player.keys = {}
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.speed - failedBrakeSpeed) < 1e-6, 'holding S is identical to coasting')
  assert.ok(Math.abs(player.speed - rolling) < 0.05, `no coasting drag while cut holds ${rolling} -> ${player.speed}`)
  // Space: no substitute-brake drag.
  const coastingSpeed = player.speed
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(rolling))
  player.keys = { Space: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.speed - coastingSpeed) < 1e-6, 'Space does not add braking force')
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
  assert.ok(Math.abs(player.speed - rolling) < 1e-9, 'cut car keeps rolling: no passive slowdown')
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

// 4. Space is fully neutered during the cut: no drift state, no slide,
// no scrubbed speed. Steering without Space still works.
test('Space cannot engage drift or scrub speed during brake failure', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  player.brakesWorking = false
  const rolling = player.speed
  // Space alone: nothing happens.
  player.keys = { Space: true }
  for (let i = 0; i < 36; i++) player.update(1 / 60)
  assert.equal(player.driftInput, false, 'Space ignored in the physics input')
  assert.ok(Math.abs(player.driftFactor) < 1e-9, 'no drift state builds')
  assert.ok(Math.abs(player.speed - rolling) < 1e-9, `no slowdown ${rolling} -> ${player.speed}`)
  // Space plus steering behaves exactly like steering alone.
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(rolling))
  player.keys = { KeyA: true, Space: true }
  for (let i = 0; i < 36; i++) player.update(1 / 60)
  const withSpace = player.speed
  const withSpaceYaw = player.yawRate
  assert.ok(Math.abs(player.driftFactor) < 1e-9, 'steering with Space builds no drift')
  assert.ok(Math.abs(withSpaceYaw) > 0.05, 'steering still yaws the car')
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(rolling))
  player.keys = { KeyA: true }
  for (let i = 0; i < 36; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.speed - withSpace) < 1e-9, 'Space adds nothing to steering')
  player.dispose()
  race.dispose()
}))

// 5. Permanent failure: no restore after the old five-second window, no
// restore ever until the race ends or restarts. Finish and dispose still
// restore for controller reuse.
test('brakes stay disabled until the race ends or restarts', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  cruise(player)
  driveTo(race, player, race.brakeCutWarningProgress + 1)
  race.updateBrakeCut(BRAKE_CUT_WARNING_DURATION)
  assert.equal(race.brakeCutPhase, 'cut')
  assert.equal(player.brakesWorking, false)
  player.keys = {}
  player.update(1 / 60)
  const rolling = player.speed
  assert.ok(rolling > 15, `rolling into the failure, got ${rolling}`)
  // Well past the old five-second window: still cut, still disabled,
  // message still shown, S still cannot slow the car.
  race.updateBrakeCut(5)
  assert.equal(race.brakeCutPhase, 'cut', 'no timed restore')
  assert.equal(player.brakesWorking, false, 'still disabled')
  assert.equal(race.brakeCutAftermathEl.style.display, 'block', 'message stays up')
  race.updateBrakeCut(30)
  assert.equal(race.brakeCutPhase, 'cut', 'never restores on its own')
  assert.equal(player.brakesWorking, false)
  player.placeAt(200, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(rolling))
  player.keys = { KeyS: true }
  for (let i = 0; i < 30; i++) player.update(1 / 60)
  assert.ok(Math.abs(player.speed - rolling) < 0.05, `S still dead ${rolling} -> ${player.speed}`)
  // Extra updates never restore either.
  race.updateBrakeCut(60)
  assert.equal(player.brakesWorking, false)
  assert.equal(race.brakeCutPhase, 'cut')
  // Finish and dispose are safe even mid-cut and restore for reuse.
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

// 6. Full gameplay order (controller.update then race.update, as in
// game.js): brakes bite during the warning, nothing slows the car while
// "BRAKES FAILED" is up, and the failure never lifts until race end.
test('live race loop: warning brakes, cut keeps rolling permanently', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  // Harness controls: never finish, ghost parked far behind, no
  // scripted bumps, so speed changes come only from player physics.
  race.finishDistance = 1e9
  race.ghostPathProgress = 0
  race.ghostSpeed = 5
  race.ghostBumpCooldown = 1e9
  const liveFrame = () => {
    player.update(1 / 60)
    race.update(1 / 60)
  }
  const fwdSpeed = () => player.velocity.dot(player.forwardVector(new THREE.Vector3()))

  // Drive into the warning with W held, exactly like gameplay.
  player.placeAt(race.brakeCutWarningProgress + 1, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(30))
  player.keys = { KeyW: true }
  liveFrame()
  assert.equal(race.brakeCutPhase, 'warning')
  assert.equal(player.brakesWorking, true)

  // Warning period: S brakes hard (intended).
  player.keys = { KeyS: true }
  const warnStart = fwdSpeed()
  for (let i = 0; i < 30; i++) liveFrame()
  assert.ok(warnStart - fwdSpeed() > 10, `warning brakes bite ${warnStart} -> ${fwdSpeed()}`)

  // Reach the cut through live frames.
  let guard = 0
  while (race.brakeCutPhase === 'warning' && guard++ < 300) liveFrame()
  assert.equal(race.brakeCutPhase, 'cut')
  assert.equal(player.brakesWorking, false)
  assert.equal(race.brakeCutAftermathEl.style.display, 'block')

  // Same station and speed for every input: S, coasting, Space.
  const measure = (keys, seconds = 1) => {
    player.placeAt(race.brakeCutWarningProgress + 50, 0)
    player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(30))
    race.ghostPathProgress = 0
    player.keys = keys
    const start = fwdSpeed()
    const frames = Math.round(seconds * 60)
    for (let i = 0; i < frames; i++) liveFrame()
    return { start, end: fwdSpeed(), phase: race.brakeCutPhase, brakes: player.brakesWorking }
  }
  const sHeld = measure({ KeyS: true })
  assert.equal(sHeld.phase, 'cut')
  assert.equal(sHeld.brakes, false)
  assert.ok(Math.abs(sHeld.end - sHeld.start) < 0.05, `S cannot slow a cut car ${sHeld.start} -> ${sHeld.end}`)
  const coast = measure({})
  assert.ok(Math.abs(coast.end - sHeld.end) < 1e-6, 'S is identical to coasting')
  assert.ok(Math.abs(coast.end - coast.start) < 0.05, `cut car keeps rolling ${coast.start} -> ${coast.end}`)
  const space = measure({ Space: true })
  assert.ok(Math.abs(space.end - coast.end) < 1e-6, 'Space adds no braking force')
  // Throttle still works during the cut.
  const both = measure({ KeyW: true, KeyS: true })
  assert.ok(both.end > both.start, `accelerator preserved ${both.start} -> ${both.end}`)

  // brakesWorking stays false far past the old five-second window.
  player.keys = { KeyS: true }
  for (let i = 0; i < 600; i++) liveFrame()
  assert.equal(race.brakeCutPhase, 'cut', 'no timed restore')
  assert.equal(player.brakesWorking, false, 'still disabled')
  assert.equal(race.brakeCutAftermathEl.style.display, 'block', 'message stays up')

  // Race end restores for controller reuse.
  race.finishRace('player')
  assert.equal(player.brakesWorking, true, 'finish restores')
  assert.equal(race.brakeCutAftermathEl.style.display, 'none')

  // Restart re-arms the whole sequence with normal braking.
  race.reset()
  assert.equal(race.brakeCutPhase, 'none')
  assert.equal(race.brakeCutTriggered, false)
  assert.equal(player.brakesWorking, true, 'restart restores brakes')
  race.time = 4
  race.finishedCountdown = true
  race.raceStarted = true
  player.setDrivingEnabled(true)
  player.placeAt(10, 0)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(30))
  player.keys = { KeyS: true }
  const freshStart = fwdSpeed()
  for (let i = 0; i < 30; i++) liveFrame()
  assert.ok(freshStart - fwdSpeed() > 5, `S brakes in the new race ${freshStart} -> ${fwdSpeed()}`)
  player.dispose()
  race.dispose()
}))
