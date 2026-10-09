import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  BOUNDARY_D,
  DRIFT_GRIP,
  DRIFT_RECOVERY_RATE,
  NORMAL_GRIP,
  MAX_FORWARD_SPEED,
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

function cruise(controller, seconds = 3) {
  controller.keys = { KeyW: true }
  const steps = Math.round(seconds * 60)
  for (let i = 0; i < steps; i++) controller.update(1 / 60)
}

function withWindow(fn) {
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
  }
}

function step(controller, dt, keys = {}) {
  controller.keys = { ...keys }
  controller.update(dt)
}

function finite(controller) {
  for (const v of [
    controller.car.position.x, controller.car.position.z,
    controller.heading, controller.yawRate, controller.speed,
    controller.slipAngle, controller.driftFactor,
  ]) {
    assert.ok(Number.isFinite(v), `finite state, got ${v}`)
  }
}

// 1. Space at standstill does not create lateral movement.
test('space at standstill creates no lateral movement', () => withWindow(() => {
  const c = makeController()
  const start = c.car.position.clone()
  step(c, 1.0, { Space: true })
  assert.ok(c.car.position.distanceTo(start) < 1e-6)
  assert.ok(Math.abs(c.driftFactor) < 1e-9)
  assert.ok(Math.abs(c.slipAngle) < 1e-9)
  c.dispose()
}))

// 2. Space straight at speed without steering: no large artificial drift.
test('space without steering stays near-straight', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  const heading = c.heading
  step(c, 0.8, { KeyW: true, Space: true })
  assert.ok(c.driftFactor > 0.5, 'drift state engages')
  assert.ok(Math.abs(c.slipAngle) < 0.1, `no fake slide, slip=${c.slipAngle}`)
  assert.ok(
    Math.abs(c.heading - heading) < 0.05, 'no phantom yaw without steering'
  )
  assert.ok(Math.abs(c.lateralOffset) < 4, 'stays on road')
  c.dispose()
}))

// 3. Space + steering raises driftFactor.
test('space plus steering engages drift state', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.5, { KeyW: true, KeyA: true, Space: true })
  assert.ok(c.driftFactor > 0.8, `factor ${c.driftFactor}`)
  assert.ok(c.isDrifting, 'telemetry reports drifting')
  c.dispose()
}))

// 4. Drift grip is lower than normal grip.
test('drift grip is lower than normal grip', () => withWindow(() => {
  assert.ok(DRIFT_GRIP < NORMAL_GRIP, `${DRIFT_GRIP} < ${NORMAL_GRIP}`)
  assert.ok(DRIFT_GRIP >= 1.5 && DRIFT_GRIP <= 3.5, `in range: ${DRIFT_GRIP}`)
}))

// 5. Lateral velocity persists longer while drifting.
test('lateral velocity persists longer during drift', () => withWindow(() => {
  const seedSlip = (c) => {
    c.placeAt(200, 0, Math.PI + 0.4)
    const dir = c.track.sampleAt(200).tangent
    c.velocity.set(dir.x * 25, 0, dir.z * 25)
  }
  const lateralAfter = (withSpace) => {
    const c = makeController()
    cruise(c)
    seedSlip(c)
    const before = Math.abs(c.velocity.dot(c.rightVector(new THREE.Vector3())))
    step(c, 0.3, withSpace ? { Space: true } : {})
    const after = Math.abs(c.velocity.dot(c.rightVector(new THREE.Vector3())))
    c.dispose()
    return { before, after }
  }
  const normal = lateralAfter(false)
  const drift = lateralAfter(true)
  assert.ok(normal.after < normal.before * 0.3, 'normal grip bites fast')
  assert.ok(
    drift.after > normal.after,
    `drift retains more slide (${drift.after.toFixed(2)} > ${normal.after.toFixed(2)})`
  )
}))

// 6. Heading and velocity diverge during drift.
test('heading and velocity diverge during drift', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.6, { KeyW: true, KeyA: true, Space: true })
  const v = c.velocity.clone().setY(0).normalize()
  const f = c.forwardVector(new THREE.Vector3())
  assert.ok(v.dot(f) < 0.98, `velocity off heading, dot=${v.dot(f)}`)
  c.dispose()
}))

// 7. slipAngle becomes meaningful during drift.
test('slip angle becomes meaningful during drift', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.6, { KeyW: true, KeyA: true, Space: true })
  assert.ok(
    Math.abs(c.slipAngle) > 0.12,
    `meaningful slip, got ${(c.slipAngle * 57.3).toFixed(1)}°`
  )
  assert.ok(
    Math.abs(c.slipAngle) < 1.0,
    `not spun out, got ${(c.slipAngle * 57.3).toFixed(1)}°`
  )
  c.dispose()
}))

// 8. Releasing Space decays driftFactor progressively (not instantly).
test('drift factor recovers progressively', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.5, { KeyW: true, KeyA: true, Space: true })
  assert.ok(c.driftFactor > 0.8)
  step(c, 1 / 60, { KeyW: true })
  // One frame at recovery rate 2.5: factor drops ~0.04, never to zero.
  assert.ok(c.driftFactor > 0.5, `progressive, got ${c.driftFactor}`)
  assert.ok(c.driftFactor < 1, 'already falling')
  const expected = 1 / DRIFT_RECOVERY_RATE
  assert.ok(expected >= 0.25 && expected <= 1.0, `recovery window ${expected}s`)
  c.dispose()
}))

// 9+10. Lateral velocity decays and heading/velocity stabilize on recovery.
test('recovery bites progressively with countersteer', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.5, { KeyW: true, KeyA: true, Space: true })
  const peakSlip = Math.abs(c.slipAngle)
  assert.ok(peakSlip > 0.12)
  // Real recovery: release Space, briefly countersteer, then straighten.
  step(c, 0.4, { KeyW: true, KeyD: true })
  step(c, 1.5, { KeyW: true })
  assert.ok(c.driftFactor < 0.05, `factor settled, got ${c.driftFactor}`)
  assert.ok(
    Math.abs(c.slipAngle) < 0.15, `slide absorbed, got ${c.slipAngle}`
  )
  assert.ok(c.speed > 10, 'still rolling after recovery')
  finite(c)
  c.dispose()
}))

// 11. Drift yaw authority exceeds normal steering.
test('drift yaw authority exceeds normal steering', () => withWindow(() => {
  const measureYaw = (withSpace) => {
    const c = makeController()
    cruise(c)
    step(c, 0.4, withSpace
      ? { KeyW: true, KeyA: true, Space: true }
      : { KeyW: true, KeyA: true })
    const yaw = Math.abs(c.yawRate)
    c.dispose()
    return yaw
  }
  const normal = measureYaw(false)
  const drift = measureYaw(true)
  assert.ok(drift > normal, `oversteer ${drift.toFixed(2)} > ${normal.toFixed(2)}`)
}))

// 12. Countersteering controls the slide.
test('countersteering checks the slide', () => withWindow(() => {
  const runToSlip = (counter) => {
    const c = makeController()
    cruise(c)
    step(c, 0.5, { KeyW: true, KeyA: true, Space: true })
    step(c, 0.5, counter
      ? { KeyW: true, KeyD: true, Space: true }
      : { KeyW: true, KeyA: true, Space: true })
    const slip = Math.abs(c.slipAngle)
    const yaw = c.yawRate
    c.dispose()
    return { slip, yaw }
  }
  const held = runToSlip(false)
  const countered = runToSlip(true)
  assert.ok(
    countered.slip < held.slip,
    `countersteer checks slide ${countered.slip.toFixed(2)} < ${held.slip.toFixed(2)}`
  )
  assert.ok(countered.yaw < held.yaw, 'yaw responds to opposite lock')
}))

// 13. Sustained abuse stays bounded and recoverable.
test('full-lock handbrake abuse stays bounded', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  for (let i = 0; i < 300; i++) step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  finite(c)
  assert.ok(Math.abs(c.speed) <= 36, `bounded speed ${c.speed}`)
  assert.ok(Math.abs(c.lateralOffset) <= BOUNDARY_D + 0.6, 'contained')
  // Release everything: the car must settle, not spin forever.
  for (let i = 0; i < 240; i++) step(c, 1 / 60, { KeyW: true })
  finite(c)
  assert.ok(Math.abs(c.yawRate) < 1.0, `yaw settles, got ${c.yawRate}`)
  c.dispose()
}))

// 14. Long drifts cost speed.
test('holding a drift bleeds speed', () => withWindow(() => {
  const driftRun = () => {
    const c = makeController()
    cruise(c)
    const entry = c.speed
    // Feather steering to stay off the walls while sliding.
    for (let i = 0; i < 180; i++) {
      step(c, 1 / 60, i % 20 < 10
        ? { KeyW: true, KeyA: true, Space: true }
        : { KeyW: true, Space: true })
    }
    const exit = c.speed
    c.dispose()
    return { entry, exit }
  }
  const { entry, exit } = driftRun()
  assert.ok(exit < entry - 3, `drift costs pace ${entry.toFixed(0)} -> ${exit.toFixed(0)}`)
}))

// 15. Reverse does not trigger forward-drift behaviour.
test('reverse plus space only drags', () => withWindow(() => {
  const c = makeController()
  step(c, 4.0, { KeyS: true })
  assert.ok(c.speed < 0, 'reversing')
  step(c, 0.5, { KeyS: true, Space: true })
  assert.ok(c.driftFactor < 0.05, `no drift state in reverse, got ${c.driftFactor}`)
  assert.ok(!c.isDrifting, 'telemetry quiet in reverse')
  assert.ok(Math.abs(c.slipAngle) < 0.2, 'no slide in reverse')
  c.dispose()
}))

// 16. Boundary contact during drift stays stable and escapable.
test('drifting into the edge stays stable and escapable', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  // Slide toward the +d edge.
  for (let i = 0; i < 90; i++) {
    step(c, 1 / 60, { KeyW: true, KeyD: true, Space: true })
  }
  finite(c)
  assert.ok(Math.abs(c.lateralOffset) <= BOUNDARY_D + 0.6, 'contained')
  // Steer away and drive off: no permanent stuck state.
  const stuckSpeed = Math.abs(c.speed)
  for (let i = 0; i < 180; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true })
    if (Math.abs(c.lateralOffset) < BOUNDARY_D - 1 && c.speed > 15) break
  }
  assert.ok(
    Math.abs(c.lateralOffset) < BOUNDARY_D - 1 || c.speed > stuckSpeed,
    'escapes the edge or rebuilds speed'
  )
  finite(c)
  c.dispose()
}))

// 17. Obstacle collision still fires while drifting.
test('obstacle collision fires mid-drift', () => withWindow(() => {
  // Straight run with drift state active: Space held at speed.
  {
    const c = makeController()
    c.obstacles = [{
      mesh: null, progress: 120, lateralOffset: 2,
      halfWidth: 1.0, halfDepth: 1.0, hit: false,
    }]
    let crashed = null
    c.onCrash = (hit) => { crashed = hit }
    c.placeAt(60, 2)
    cruise(c, 1.0) // rolling first: Space from standstill only drags
    for (let i = 0; i < 400 && c.canDrive; i++) {
      step(c, 1 / 60, { KeyW: true, Space: true })
    }
    assert.equal(c.canDrive, false, 'drift-state crash stops the car')
    assert.ok(crashed, 'onCrash fired with drift active')
    assert.ok(c.driftFactor < 0.05, 'crash clears drift state')
    assert.equal(c.speed, 0)
    finite(c)
    c.dispose()
  }
  // Genuine slide into a half-road barrier: the leftward drift from d=2
  // must cross the covered band [-5.5, 0] while passing s=120.
  {
    const c = makeController()
    c.obstacles = [{
      mesh: null, progress: 120, lateralOffset: -2.75,
      halfWidth: 2.75, halfDepth: 0.8, hit: false,
    }]
    let crashed = null
    c.onCrash = (hit) => { crashed = hit }
    c.placeAt(100, 2)
    cruise(c, 1.0) // rolling first: Space from standstill only drags
    for (let i = 0; i < 400 && c.canDrive; i++) {
      step(c, 1 / 60, i % 20 < 10
        ? { KeyW: true, KeyA: true, Space: true }
        : { KeyW: true, Space: true })
    }
    assert.equal(c.canDrive, false, 'sliding drift crash stops the car')
    assert.ok(crashed, 'onCrash fired mid-slide')
    finite(c)
    c.dispose()
  }
}))

// 18. Ghost ignores Space entirely.
test('ghost is unaffected by space', () => withWindow(() => {
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
    for (let i = 0; i < 5; i++) race.update(1.0)
    assert.ok(race.raceStarted)
    // Player holds Space the whole run; ghost must not slide.
    for (let i = 0; i < 120; i++) {
      player.keys = { KeyW: true, KeyA: true, Space: true }
      player.update(1 / 60)
      race.updateGhost(1 / 60)
    }
    const ghostD = race.track.toTrack(ghostCar.position).d
    assert.ok(Math.abs(ghostD - -2) < 0.6, `ghost holds lane, d=${ghostD}`)
    assert.ok(!('driftFactor' in ghostCar), 'no drift state leaks to ghost')
    player.dispose()
    race.dispose()
  } finally {
    globalThis.document = originalDocument
  }
}))

// 19. Brake-cut: no Space brake loophole, sliding preserved.
test('handbrake cannot bypass failed brakes', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  c.brakesWorking = false
  const rolling = c.speed
  // Space must not brake like S would with working brakes.
  step(c, 0.5, { Space: true })
  assert.ok(
    c.speed > rolling - 2,
    `no substitute brake, ${rolling.toFixed(1)} -> ${c.speed.toFixed(1)}`
  )
  // But sliding gameplay remains: Space + steering still builds angle.
  step(c, 0.6, { KeyW: true, KeyA: true, Space: true })
  assert.ok(c.driftFactor > 0.5, 'drift state available after cut')
  assert.ok(Math.abs(c.slipAngle) > 0.08, 'slide available after cut')
  c.dispose()
}))

// 20. Large dt with drift stays stable.
test('drift physics survives hitches', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.2, { KeyW: true, KeyA: true, Space: true })
  finite(c)
  assert.ok(c.canDrive, 'no phantom crash from a hitch')
  assert.ok(Math.abs(c.speed) <= MAX_FORWARD_SPEED + 1)
  c.dispose()
}))

// Scenario A: normal-driving baseline on the full curved track (no Space).
test('scenario A: normal baseline completes the track', () => withWindow(() => {
  const track = createDefaultTrack()
  const c = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  c.setDrivingEnabled(true)
  c.obstacles = []
  const finish = track.getFinishDistance()
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }
  let maxD = 0
  let steps = 0
  for (steps = 0; steps < 12000 && c.pathProgress < finish; steps++) {
    const look = track.sampleAt(Math.min(finish, c.pathProgress + 20)).position
    const err = wrap(Math.atan2(
      look.x - c.car.position.x, look.z - c.car.position.z
    ) - c.heading)
    c.keys = { KeyW: true }
    if (err > 0.02) c.keys.KeyA = true
    else if (err < -0.02) c.keys.KeyD = true
    c.update(1 / 60)
    maxD = Math.max(maxD, Math.abs(c.lateralOffset))
    finite(c)
  }
  assert.ok(c.pathProgress >= finish, `finished, s=${c.pathProgress}`)
  assert.ok(maxD <= BOUNDARY_D + 1.0, `no regression, max|d|=${maxD}`)
  c.dispose()
}), { timeout: 120000 })

// Scenario B: drift corner — steer in, Space, hold, release, recover.
test('scenario B: drift corner entry, slide and recovery', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  const entry = c.speed
  let peak = 0
  for (let i = 0; i < 30; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
    peak = Math.max(peak, Math.abs(c.slipAngle))
  }
  assert.ok(peak > 0.17 && peak < 0.8, `controlled slide ${(peak * 57.3).toFixed(0)}°`)
  const exit = c.speed
  assert.ok(exit < entry, 'drift scrubs some speed')
  // Recover with a brief countersteer then straight running.
  step(c, 0.4, { KeyW: true, KeyD: true })
  let t = 0.4
  let settled = false
  for (let i = 0; i < 150; i++) {
    step(c, 1 / 60, { KeyW: true })
    t += 1 / 60
    if (c.driftFactor < 0.05 && Math.abs(c.slipAngle) < 0.12) {
      settled = true
      break
    }
  }
  assert.ok(settled, `recovered in ${t.toFixed(2)}s`)
  assert.ok(t < 2.5, 'recovery is quick')
  finite(c)
  c.dispose()
}))

// Scenario C: countersteer mid-drift.
test('scenario C: countersteer mid-drift', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  step(c, 0.5, { KeyW: true, KeyA: true, Space: true })
  const slipBefore = c.slipAngle
  assert.ok(Math.abs(slipBefore) > 0.1)
  step(c, 0.5, { KeyW: true, KeyD: true, Space: true })
  // Opposite lock while Space stays held must check the slide.
  assert.ok(
    Math.abs(c.slipAngle) < Math.abs(slipBefore) + 0.15,
    'countersteer contains the slide instead of amplifying it'
  )
  finite(c)
  c.dispose()
}))

// Scenario D: abuse — full lock plus Space for seconds.
test('scenario D: sustained abuse stays recoverable', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  for (let i = 0; i < 240; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  }
  finite(c)
  // Hands off the drift (keep rolling): factor must fall, yaw must settle.
  for (let i = 0; i < 180; i++) step(c, 1 / 60, { KeyW: true })
  assert.ok(c.driftFactor < 0.05, 'drift state clears after abuse')
  assert.ok(Math.abs(c.yawRate) < 1.2, 'yaw settles after abuse')
  finite(c)
  c.dispose()
}))

// Scenario E: drift initiated at the road edge.
test('scenario E: edge drift does not stick or teleport', () => withWindow(() => {
  const c = makeController()
  cruise(c)
  c.placeAt(300, 4)
  c.keys = { KeyW: true }
  for (let i = 0; i < 60; i++) c.update(1 / 60) // back to speed
  const sBefore = c.pathProgress
  for (let i = 0; i < 45; i++) {
    step(c, 1 / 60, { KeyW: true, KeyD: true, Space: true })
  }
  finite(c)
  assert.ok(Math.abs(c.lateralOffset) <= BOUNDARY_D + 0.6, 'contained')
  // Drive away from the edge: progress must advance, speed must rebuild.
  for (let i = 0; i < 180; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true })
    if (c.pathProgress > sBefore + 30) break
  }
  assert.ok(c.pathProgress > sBefore, 'keeps racing after edge contact')
  finite(c)
  c.dispose()
}))
