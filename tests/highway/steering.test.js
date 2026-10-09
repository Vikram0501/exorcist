import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  BOUNDARY_D,
  ENGINE_ACCELERATION,
  HIGH_SPEED_STEER_FACTOR,
  MAX_FORWARD_SPEED,
  MAX_REVERSE_SPEED,
  NORMAL_GRIP,
  HighwayCarController,
} from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { createDefaultTrack } from '../../src/levels/highway/track.js'

function straightTrack() {
  return [
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, -940),
  ]
}

function makeController(trackPoints = straightTrack()) {
  const car = new THREE.Object3D()
  const camera = new THREE.PerspectiveCamera()
  const controller = new HighwayCarController(
    car, camera, trackPoints, null
  )
  controller.setDrivingEnabled(true)
  return controller
}

function withWindow(fn) {
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
    // Controllers created inside register real listeners on the stub;
    // dispose them to avoid cross-test leakage.
  }
}

function step(controller, dt, keys = {}) {
  controller.keys = { ...keys }
  controller.update(dt)
}

test('W accelerates the vehicle forward', () => withWindow(() => {
  const c = makeController()
  const start = c.car.position.clone()
  step(c, 1.0, { KeyW: true })
  assert.ok(c.speed > 5, `speed ${c.speed}`)
  assert.ok(c.car.position.distanceTo(start) > 1)
  // Forward along the straight: -Z.
  assert.ok(c.car.position.z < start.z)
  c.dispose()
}))

for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
  test(`full throttle reaches the increased cap naturally at dt=${dt}`, () => withWindow(() => {
    const c = makeController()
    try {
      assert.ok(MAX_FORWARD_SPEED / 35 >= 1.10 && MAX_FORWARD_SPEED / 35 <= 1.15)
      assert.equal(ENGINE_ACCELERATION, 18)
      let previous = c.pathProgress
      for (let i = 1; i <= Math.round(4 / dt); i++) {
        step(c, dt, { KeyW: true })
        const expected = Math.min(18 * i * dt, MAX_FORWARD_SPEED)
        assert.ok(Math.abs(c.speed - expected) < 1e-8, `natural speed ${c.speed} vs ${expected}`)
        const distance = c.pathProgress - previous
        // Nearest-track search refines to 0.05 m, rather than exact arithmetic.
        assert.ok(distance >= 0 && distance <= MAX_FORWARD_SPEED * dt + 0.1)
        assert.ok(Math.abs(c.pathProgress - (10 - c.car.position.z)) < 0.05)
        previous = c.pathProgress
      }
      assert.equal(c.speed, MAX_FORWARD_SPEED)
      assert.equal(c.steeringAuthority(c.speed), HIGH_SPEED_STEER_FACTOR)
    } finally {
      c.dispose()
    }
  }))
}

test('top-speed obstacle sweep catches a thin obstacle during a hitch and allows a clear lane', () => withWindow(() => {
  for (const lane of [0, 4]) {
    const c = makeController()
    try {
      c.placeAt(40, lane)
      c.velocity.copy(c.forwardVector()).multiplyScalar(MAX_FORWARD_SPEED)
      const obstacle = { progress: 40.3, lateralOffset: 0, halfWidth: 0.1, halfDepth: 0.1 }
      c.obstacles = [obstacle]
      let crashes = 0
      c.onCrash = hit => { assert.equal(hit, obstacle); crashes++ }
      step(c, 0.2, { KeyW: true })
      assert.equal(c.canDrive, lane !== 0)
      assert.equal(crashes, lane === 0 ? 1 : 0)
      if (lane === 0) {
        assert.equal(c.speed, 0)
        assert.equal(c.velocity.length(), 0)
      } else {
        assert.ok(Math.abs(c.pathProgress - 48) < 1e-8)
      }
    } finally {
      c.dispose()
    }
  }
}))

test('releasing W causes drag deceleration without going negative', () => withWindow(() => {
  const c = makeController()
  step(c, 2.0, { KeyW: true })
  const peak = c.speed
  assert.ok(peak > 10)
  step(c, 1.0, {})
  assert.ok(c.speed < peak, `coasting ${c.speed} < ${peak}`)
  assert.ok(c.speed >= 0)
  step(c, 10.0, {})
  assert.ok(Math.abs(c.speed) < 1e-6, `stops, got ${c.speed}`)
  c.dispose()
}))

test('S brakes a moving-forward vehicle strongly', () => withWindow(() => {
  const c = makeController()
  step(c, 2.0, { KeyW: true })
  const peak = c.speed
  step(c, 0.5, { KeyS: true })
  // Braking (28) beats drag (8): at least 10 m/s shed in 0.5 s.
  assert.ok(c.speed < peak - 10, `braked to ${c.speed} from ${peak}`)
  c.dispose()
}))

test('reverse is limited below forward top speed', () => withWindow(() => {
  const c = makeController()
  step(c, 6.0, { KeyS: true })
  assert.ok(c.speed < 0, `reversing, got ${c.speed}`)
  assert.ok(
    c.speed >= -MAX_REVERSE_SPEED - 0.5,
    `reverse capped, got ${c.speed}`
  )
  assert.ok(
    Math.abs(c.speed) < MAX_FORWARD_SPEED / 2,
    'reverse far below forward top speed'
  )
  c.dispose()
}))

test('A steers left and D steers right', () => withWindow(() => {
  const left = makeController()
  step(left, 1.0, { KeyW: true, KeyA: true })
  assert.ok(
    left.car.position.x < 1.9,
    `A moves toward driver-left (-X), x=${left.car.position.x}`
  )
  assert.ok(left.heading > Math.PI, `heading increases, h=${left.heading}`)
  left.dispose()

  const right = makeController()
  step(right, 1.0, { KeyW: true, KeyD: true })
  assert.ok(
    right.car.position.x > 2.1,
    `D moves toward driver-right (+X), x=${right.car.position.x}`
  )
  assert.ok(right.heading < Math.PI, `heading decreases, h=${right.heading}`)
  right.dispose()
}))

test('opposite steering inputs neutralize', () => withWindow(() => {
  const c = makeController()
  step(c, 1.0, { KeyW: true, KeyA: true, KeyD: true })
  assert.ok(Math.abs(c.yawRate) < 1e-9)
  assert.ok(Math.abs(c.car.position.x - 2) < 0.5)
  c.dispose()
}))

test('no steering input settles yawRate toward zero', () => withWindow(() => {
  const c = makeController()
  step(c, 0.5, { KeyW: true, KeyA: true })
  assert.ok(Math.abs(c.yawRate) > 0.1)
  step(c, 1.5, { KeyW: true })
  assert.ok(Math.abs(c.yawRate) < 0.05, `yawRate ${c.yawRate}`)
  c.dispose()
}))

test('world position follows heading, not the track', () => withWindow(() => {
  const c = makeController()
  // Aim ~0.3 rad across the lane with no steering input.
  c.placeAt(200, 0, Math.PI + 0.3)
  const start = c.car.position.clone()
  step(c, 1.0, { KeyW: true })
  const moved = new THREE.Vector3().subVectors(c.car.position, start)
  moved.y = 0
  moved.normalize()
  const expected = new THREE.Vector3(Math.sin(Math.PI + 0.3), 0, Math.cos(Math.PI + 0.3))
  assert.ok(moved.dot(expected) > 0.9, `moves along heading, dot=${moved.dot(expected)}`)
  c.dispose()
}))

test('heading is not snapped back to the track tangent', () => withWindow(() => {
  const c = makeController()
  step(c, 0.6, { KeyW: true, KeyA: true })
  const tangentNow = c.track.sampleAt(c.pathProgress).angle
  const offTangent = Math.abs(c.heading - tangentNow)
  assert.ok(offTangent > 0.05, `car points across the lane by ${offTangent}`)
  // Straighten out: residual yaw smoothing may bleed a little heading, but
  // nothing snaps the car back onto the tangent.
  step(c, 2.0, { KeyW: true })
  const laterTangent = c.track.sampleAt(c.pathProgress).angle
  assert.ok(
    Math.abs(c.heading - laterTangent) > 0.03,
    'still independent of the tangent after hands-off driving'
  )
  c.dispose()
}))

test('pathProgress and lateralOffset derive from world position', () => withWindow(() => {
  const c = makeController()
  c.placeAt(100, 0)
  assert.ok(Math.abs(c.pathProgress - 100) < 2, `s=${c.pathProgress}`)
  c.placeAt(100, 3)
  assert.ok(Math.abs(c.lateralOffset - 3) < 0.6, `d=${c.lateralOffset}`)
  const before = c.pathProgress
  step(c, 2.0, { KeyW: true })
  assert.ok(c.pathProgress > before + 5, 'progress advances with driving')
  c.dispose()
}))

test('normal grip damps lateral velocity without killing it instantly', () => withWindow(() => {
  assert.ok(NORMAL_GRIP >= 8 && NORMAL_GRIP <= 12, `grip ${NORMAL_GRIP}`)
  const c = makeController()
  c.placeAt(200, 0, Math.PI + 0.4)
  // Seed velocity along the TRACK tangent so the offset heading owns a
  // genuine sideslip component.
  const trackDir = c.track.sampleAt(200).tangent
  c.velocity.set(trackDir.x * 20, 0, trackDir.z * 20)
  const lateral = () => c.velocity.dot(c.rightVector(new THREE.Vector3()))
  const before = Math.abs(lateral())
  assert.ok(before > 1, `seeded sideslip ${before}`)
  step(c, 0.25, {})
  const after = Math.abs(lateral())
  assert.ok(after < before * 0.5, `grip damps ${before} -> ${after}`)
  c.dispose()
}))

test('road boundary contains the car without explosions', () => withWindow(() => {
  const c = makeController()
  // Aim straight at the +d edge and hold full throttle into it.
  c.placeAt(100, 0, Math.PI / 2)
  step(c, 4.0, { KeyW: true })
  assert.ok(
    Math.abs(c.lateralOffset) <= BOUNDARY_D + 0.5,
    `contained, d=${c.lateralOffset}`
  )
  for (const v of [c.car.position.x, c.car.position.z, c.speed]) {
    assert.ok(Number.isFinite(v))
  }
  assert.ok(Math.abs(c.speed) <= MAX_FORWARD_SPEED + 1)
  c.dispose()
}))

test('large dt steps stay bounded and finite', () => withWindow(() => {
  const c = makeController()
  const start = c.car.position.clone()
  step(c, 0.2, { KeyW: true, KeyA: true })
  const moved = c.car.position.distanceTo(start)
  assert.ok(moved < 15, `bounded hitch step, moved ${moved}`)
  assert.ok(c.canDrive, 'no phantom crash from a hitch')
  for (const v of [c.car.position.x, c.car.position.z, c.heading, c.yawRate, c.speed]) {
    assert.ok(Number.isFinite(v), 'finite after hitch')
  }
  c.dispose()
}))

test('brakesWorking=false preserves brake-cut behaviour', () => withWindow(() => {
  const c = makeController()
  step(c, 2.0, { KeyW: true })
  c.brakesWorking = false
  const rolling = c.speed
  step(c, 0.5, { KeyS: true })
  // Failed brakes: S neither brakes nor drags the car down.
  assert.ok(
    Math.abs(c.speed - rolling) < 1e-9,
    `brakes dead, ${rolling} -> ${c.speed}`
  )
  // Steering still works with failed brakes.
  step(c, 0.5, { KeyA: true })
  assert.ok(Math.abs(c.yawRate) > 0.05, 'steering survives brake-cut')
  c.dispose()
}))

test('camera stays behind the steered vehicle', () => withWindow(() => {
  const c = makeController()
  step(c, 1.0, { KeyW: true, KeyD: true })
  for (let i = 0; i < 300; i++) c.updateCamera()
  const carForward = c.forwardVector(new THREE.Vector3())
  const toCamera = new THREE.Vector3()
    .subVectors(c.camera.position, c.car.position)
  toCamera.y = 0
  toCamera.normalize()
  assert.ok(toCamera.dot(carForward) < -0.9, 'camera behind heading')
  c.dispose()
}))

test('player steering does not disturb the rubber-band ghost', () => withWindow(() => {
  const originalDocument = globalThis.document
  globalThis.document = {
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
  }
  try {
    const trackPoints = straightTrack()
    const player = makeController(trackPoints)
    const ghostCar = new THREE.Object3D()
    const scene = new THREE.Scene()
    const race = new HighwayRaceController(
      player, ghostCar, -880, 'TEST GHOST', null, scene,
      trackPoints, [0, 950], 950
    )
    race.obstacles = []
    // Step through the countdown in small increments so the GO window
    // (3-4 s) is actually visited.
    for (let i = 0; i < 5; i++) race.update(1.0)
    assert.ok(race.raceStarted)
    // Player weaves while the ghost runs its own model.
    for (let i = 0; i < 120; i++) {
      player.keys = { KeyW: true, KeyA: i % 2 === 0, KeyD: i % 2 === 1 }
      player.update(1 / 60)
      race.updateGhost(1 / 60)
    }
    assert.ok(race.ghostPathProgress > 10, 'ghost advanced independently')
    const ghostD = race.track.toTrack(ghostCar.position).d
    assert.ok(Math.abs(ghostD - -2) < 0.6, `ghost holds its lane, d=${ghostD}`)
    assert.ok(
      Math.abs(player.heading - Math.PI) > 0.01 || Math.abs(player.lateralOffset) > 0.1,
      'player actually moved independently'
    )
    player.dispose()
    race.dispose()
  } finally {
    globalThis.document = originalDocument
  }
}))

test('swept obstacle collision still crashes, and dodging still passes', () => withWindow(() => {
  const mkObstacle = (s, d) => ({
    mesh: null, progress: s, lateralOffset: d,
    halfWidth: 1.0, halfDepth: 1.0, hit: false,
  })
  // Head-on: crash.
  {
    const c = makeController()
    c.obstacles = [mkObstacle(60, 0)]
    let crashed = null
    c.onCrash = (hit) => { crashed = hit }
    c.placeAt(40, 0)
    for (let i = 0; i < 300 && c.canDrive; i++) step(c, 1 / 60, { KeyW: true })
    assert.equal(c.canDrive, false, 'crashed')
    assert.ok(crashed, 'onCrash fired')
    assert.equal(c.speed, 0)
    c.dispose()
  }
  // Offset line: passes the same obstacle.
  {
    const c = makeController()
    c.obstacles = [mkObstacle(60, 0)]
    c.placeAt(40, 4)
    for (let i = 0; i < 300 && c.canDrive; i++) step(c, 1 / 60, { KeyW: true })
    assert.equal(c.canDrive, true, 'dodged')
    assert.ok(c.pathProgress > 70, `passed, s=${c.pathProgress}`)
    c.dispose()
  }
}))

for (const throttle of [true, false]) {
  test(`straight race finishes correctly with throttle=${throttle}`, () => withWindow(() => {
    const originalDocument = globalThis.document
    globalThis.document = {
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} },
    }
    const player = makeController()
    let race
    try {
      race = new HighwayRaceController(
        player, new THREE.Object3D(), -880, 'TEST GHOST', null,
        new THREE.Scene(), player.track, null, player.track.totalLength
      )
      let finishes = 0
      race.onFinish = () => { finishes++ }
      let peakSpeed = 0
      for (let i = 0; i < 3000 && !race.raceFinished; i++) {
        player.keys = { KeyW: throttle }
        player.update(1 / 30)
        peakSpeed = Math.max(peakSpeed, player.speed)
        race.update(1 / 30)
      }
      assert.equal(race.winner, throttle ? 'player' : 'ghost')
      assert.equal(finishes, 1)
      assert.equal(player.canDrive, false)
      assert.equal(player.speed, 0)
      assert.equal(race.ghostSpeed, 0)
      if (throttle) {
        assert.equal(peakSpeed, MAX_FORWARD_SPEED)
        assert.ok(player.pathProgress >= race.finishDistance)
        assert.ok(player.pathProgress - race.finishDistance < MAX_FORWARD_SPEED / 30)
        assert.equal(race.brakeCutPhase, 'done')
        assert.equal(player.brakesWorking, true)
      } else {
        assert.ok(race.ghostPathProgress >= race.finishDistance)
      }
      race.update(1 / 30)
      assert.equal(finishes, 1, 'finish callback is one-shot')
    } finally {
      player.dispose()
      race?.dispose()
      globalThis.document = originalDocument
    }
  }))
}

test('deterministic pursuit completes the curved highway', () => withWindow(() => {
  const track = createDefaultTrack()
  const c = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  c.setDrivingEnabled(true)
  c.obstacles = []
  const finish = track.getFinishDistance()
  const dt = 1 / 60
  let maxD = 0
  let steps = 0
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }
  for (steps = 0; steps < 12000 && c.pathProgress < finish; steps++) {
    // Pure pursuit toward a lookahead point on the centre line.
    const look = track.sampleAt(Math.min(finish, c.pathProgress + 20)).position
    const dx = look.x - c.car.position.x
    const dz = look.z - c.car.position.z
    const err = wrap(Math.atan2(dx, dz) - c.heading)
    c.keys = { KeyW: true }
    if (err > 0.02) c.keys.KeyA = true
    else if (err < -0.02) c.keys.KeyD = true
    c.update(dt)
    maxD = Math.max(maxD, Math.abs(c.lateralOffset))
    for (const v of [c.car.position.x, c.car.position.z, c.heading, c.speed]) {
      assert.ok(Number.isFinite(v), `finite at step ${steps}`)
    }
  }
  assert.ok(c.pathProgress >= finish, `finished, s=${c.pathProgress}`)
  assert.ok(maxD <= BOUNDARY_D + 1.0, `stayed on road, max|d|=${maxD}`)
  assert.ok(steps < 12000, `in good time (${steps} steps)`)
  c.dispose()
}), { timeout: 120000 })
