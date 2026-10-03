import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  BRAKE_DECELERATION,
  CAMERA_DISTANCE,
  CAMERA_DRIFT_MAX_INFLUENCE,
  CAMERA_FOV_GAIN,
  CAMERA_HEIGHT,
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_HEIGHT,
  DRIFT_FORWARD_DRAG,
  DRIFT_ENTER_RATE,
  DRIFT_GRIP,
  DRIFT_RECOVERY_RATE,
  DRIFT_YAW_MULTIPLIER,
  ENGINE_ACCELERATION,
  MAX_DRIFT_YAW_RATE,
  MAX_FORWARD_SPEED,
  NORMAL_GRIP,
  HighwayCarController,
} from '../../src/levels/highway/car.js'

function straightRoad() {
  const roadPath = [
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, -940),
  ]
  return { roadPath, arcLengths: [0, 950] }
}

function makeController() {
  const { roadPath, arcLengths } = straightRoad()
  const camera = new THREE.PerspectiveCamera()
  const car = new THREE.Object3D()
  const controller = new HighwayCarController(
    car, camera, roadPath, arcLengths
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
  }
}

function step(controller, dt, keys = {}) {
  controller.keys = { ...keys }
  controller.update(dt)
}

function cruise(controller, seconds = 4) {
  const steps = Math.round(seconds * 60)
  for (let i = 0; i < steps; i++) {
    step(controller, 1 / 60, { KeyW: true })
  }
}

function settleCamera(controller, seconds = 2) {
  const steps = Math.round(seconds * 60)
  for (let i = 0; i < steps; i++) {
    controller.updateCamera(1 / 60)
  }
}

function cameraGap(controller) {
  return controller.camera.position.distanceTo(controller.car.position)
}

function assertFiniteCamera(controller, label) {
  for (const v of [
    controller.camera.position.x,
    controller.camera.position.y,
    controller.camera.position.z,
    controller.camera.fov,
    controller.currentCameraDistance,
    controller.cameraDriftInfluence,
  ]) {
    assert.ok(
      Number.isFinite(v),
      `${label}: finite camera state, got ${v}`
    )
  }
  assert.ok(
    !Number.isNaN(controller.camera.position.lengthSq()),
    `${label}: camera position valid`
  )
}

test('chase camera sits modestly closer and lower, still looking ahead', async () => {
  assert.equal(CAMERA_DISTANCE, 6.8)
  assert.equal(CAMERA_HEIGHT, 3.6)

  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    const { roadPath, arcLengths } = straightRoad()
    const camera = new THREE.PerspectiveCamera()
    const car = new THREE.Object3D()
    const controller = new HighwayCarController(
      car, camera, roadPath, arcLengths
    )

    controller.placeAt(200, 0)

    camera.position.set(999, 999, 999)
    for (let i = 0; i < 300; i++) {
      controller.updateCamera()
    }

    const gap = camera.position.distanceTo(car.position)
    const expected = Math.sqrt(
      CAMERA_DISTANCE * CAMERA_DISTANCE +
        CAMERA_HEIGHT * CAMERA_HEIGHT
    )
    assert.ok(
      Math.abs(gap - expected) < 0.3,
      `camera gap ${gap.toFixed(2)}, expected ~${expected.toFixed(2)}`
    )
    assert.ok(
      camera.position.z > car.position.z,
      'camera stays behind the car'
    )

    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    assert.ok(
      forward.z < -0.5,
      'camera still looks down-road'
    )

    controller.dispose()
  } finally {
    globalThis.window = originalWindow
  }
})

test('camera follows vehicle heading rather than track tangent', async () => {
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    const { roadPath, arcLengths } = straightRoad()
    const camera = new THREE.PerspectiveCamera()
    const car = new THREE.Object3D()
    const controller = new HighwayCarController(
      car, camera, roadPath, arcLengths
    )

    // Point the car ~0.5 rad across the lane; the camera must settle
    // behind the car's own heading, not behind the track direction.
    controller.placeAt(200, 0, Math.PI + 0.5)

    for (let i = 0; i < 300; i++) {
      controller.updateCamera()
    }

    const carForward = controller.forwardVector(new THREE.Vector3())
    const toCamera = new THREE.Vector3()
      .subVectors(camera.position, car.position)
      .setY(0)
      .normalize()
    // Camera sits opposite the heading: dot(toCamera, forward) ≈ -1.
    const behindness = toCamera.dot(carForward)
    assert.ok(
      behindness < -0.9,
      `camera behind heading, dot=${behindness.toFixed(3)}`
    )

    // And it looks along the heading, not down -Z.
    const look = new THREE.Vector3()
    camera.getWorldDirection(look)
    look.y = 0
    look.normalize()
    assert.ok(
      look.dot(carForward) > 0.9,
      `camera looks along heading, dot=${look.dot(carForward).toFixed(3)}`
    )

    controller.dispose()
  } finally {
    globalThis.window = originalWindow
  }
})

test('camera distance increases modestly with speed', () => withWindow(() => {
  const c = makeController()
  settleCamera(c, 2)
  const slowGap = cameraGap(c)
  const slowDistance = c.currentCameraDistance
  cruise(c, 5)
  settleCamera(c, 2)
  const fastGap = cameraGap(c)
  assert.ok(
    fastGap > slowGap + 0.3,
    `pulls back with speed ${slowGap.toFixed(2)} -> ${fastGap.toFixed(2)}`
  )
  assert.ok(
    fastGap - slowGap < 2.5,
    `car never goes tiny, delta=${(fastGap - slowGap).toFixed(2)}`
  )
  assert.ok(
    slowDistance >= 6.4 && slowDistance <= 6.9,
    `low-speed distance ~6.5-6.8, got ${slowDistance.toFixed(2)}`
  )
  assert.ok(
    c.currentCameraDistance >= 7.4 && c.currentCameraDistance <= 8.6,
    `max-speed distance ~7.5-8.5, got ${c.currentCameraDistance.toFixed(2)}`
  )
  assert.ok(
    c.currentCameraDistance <= CAMERA_MAX_DISTANCE + 1e-9,
    'respects the named maximum'
  )
  assertFiniteCamera(c, 'speed distance')
  c.dispose()
}))

test('camera height remains within chase bounds', () => withWindow(() => {
  const c = makeController()
  settleCamera(c, 2)
  const slowHeight = c.camera.position.y - c.car.position.y
  cruise(c, 5)
  settleCamera(c, 2)
  const fastHeight = c.camera.position.y - c.car.position.y
  for (const [label, h] of [['slow', slowHeight], ['fast', fastHeight]]) {
    assert.ok(
      h >= 3.3 && h <= 4.3,
      `${label} height stays a chase view, got ${h.toFixed(2)}`
    )
  }
  assert.ok(
    fastHeight >= slowHeight - 0.05,
    'height never drops with speed'
  )
  assert.ok(
    c.currentCameraHeight <= CAMERA_MAX_HEIGHT + 1e-9,
    'respects the named height maximum'
  )
  c.dispose()
}))

test('FOV increases with speed from the camera baseline', () => withWindow(() => {
  const c = makeController()
  const baseline = c.camera.fov
  settleCamera(c, 1)
  const slowFov = c.camera.fov
  cruise(c, 5)
  settleCamera(c, 1)
  const fastFov = c.camera.fov
  assert.ok(
    Math.abs(slowFov - baseline) < 1.5,
    `slow FOV near baseline ${baseline} -> ${slowFov.toFixed(2)}`
  )
  assert.ok(
    fastFov > slowFov + 3,
    `FOV grows with speed ${slowFov.toFixed(1)} -> ${fastFov.toFixed(1)}`
  )
  assert.ok(
    fastFov <= baseline + CAMERA_FOV_GAIN + 1.0,
    `no speed-tunnel distortion, got +${(fastFov - baseline).toFixed(1)}°`
  )
  assertFiniteCamera(c, 'speed fov')
  c.dispose()
}))

test('FOV returns smoothly when slowing', () => withWindow(() => {
  const c = makeController()
  const baseline = c.baseCameraFov ?? c.camera.fov
  cruise(c, 5)
  settleCamera(c, 1)
  const peak = c.camera.fov
  assert.ok(peak > baseline + 3, 'precondition: FOV rose at speed')
  // Brake to a stop (then hands off so reverse never engages) and watch
  // every frame: progressive, never a snap.
  let prev = peak
  let maxStep = 0
  for (let i = 0; i < 90; i++) {
    step(c, 1 / 60, { KeyS: true })
    maxStep = Math.max(maxStep, Math.abs(c.camera.fov - prev))
    prev = c.camera.fov
  }
  for (let i = 0; i < 150; i++) {
    step(c, 1 / 60, {})
    maxStep = Math.max(maxStep, Math.abs(c.camera.fov - prev))
    prev = c.camera.fov
  }
  settleCamera(c, 1)
  assert.ok(
    maxStep < 1.0,
    `FOV settles progressively, max frame step ${maxStep.toFixed(3)}°`
  )
  assert.ok(
    c.camera.fov < peak - 2,
    `FOV falls back ${peak.toFixed(1)} -> ${c.camera.fov.toFixed(1)}`
  )
  assert.ok(
    Math.abs(c.camera.fov - baseline) < 1.5,
    `FOV returns near baseline, got ${c.camera.fov.toFixed(2)}`
  )
  c.dispose()
}))

test('normal driving has negligible drift-camera influence', () => withWindow(() => {
  const c = makeController()
  cruise(c, 2)
  // Normal cornering without Space: steer, brake, correct rapidly.
  const keysSequence = [
    { KeyW: true, KeyA: true },
    { KeyW: true, KeyD: true },
    { KeyW: true },
    { KeyS: true },
    { KeyW: true, KeyA: true, KeyD: true },
  ]
  let maxInfluence = 0
  for (let i = 0; i < 180; i++) {
    step(c, 1 / 60, keysSequence[i % keysSequence.length])
    maxInfluence = Math.max(maxInfluence, c.cameraDriftInfluence)
  }
  assert.ok(
    maxInfluence < 0.05,
    `heading-locked when planted, max influence=${maxInfluence.toFixed(3)}`
  )
  // Camera still sits behind the heading after corrections.
  settleCamera(c, 1)
  const carForward = c.forwardVector(new THREE.Vector3())
  const toCamera = new THREE.Vector3()
    .subVectors(c.camera.position, c.car.position)
    .setY(0)
    .normalize()
  assert.ok(
    toCamera.dot(carForward) < -0.9,
    'camera behind heading after corrections'
  )
  assertFiniteCamera(c, 'normal driving')
  c.dispose()
}))

test('meaningful drift creates velocity-direction influence', () => withWindow(() => {
  const c = makeController()
  cruise(c, 3)
  for (let i = 0; i < 40; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  }
  assert.ok(
    Math.abs(c.slipAngle) > 0.12,
    `precondition: real slide, slip=${(c.slipAngle * 57.3).toFixed(1)}°`
  )
  assert.ok(
    c.cameraDriftInfluence > 0.05,
    `drift bends the camera, influence=${c.cameraDriftInfluence.toFixed(3)}`
  )
  assert.ok(
    c.cameraDriftInfluence <= CAMERA_DRIFT_MAX_INFLUENCE + 1e-9,
    'influence stays capped'
  )
  // The lagged follow direction visibly leaves the heading toward travel.
  const headingDir = c.forwardVector(new THREE.Vector3())
  const camYaw = Math.atan2(c.cameraForward.x, c.cameraForward.z)
  const headYaw = Math.atan2(headingDir.x, headingDir.z)
  let yawDiff = Math.abs(camYaw - headYaw)
  if (yawDiff > Math.PI) yawDiff = 2 * Math.PI - yawDiff
  assert.ok(
    yawDiff > 0.01,
    `camera yaw separates from car yaw by ${(yawDiff * 57.3).toFixed(1)}°`
  )
  assertFiniteCamera(c, 'drift influence')
  c.dispose()
}))

test('drift camera never fully aligns with velocity', () => withWindow(() => {
  const c = makeController()
  cruise(c, 3)
  for (let i = 0; i < 60; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  }
  const headingDir = c.forwardVector(new THREE.Vector3())
  const camFwd = c.cameraForward.clone().setY(0).normalize()
  assert.ok(
    camFwd.dot(headingDir) > 0.9,
    `heading still dominates, dot=${camFwd.dot(headingDir).toFixed(3)}`
  )
  const velDir = c.velocity.clone().setY(0).normalize()
  const camToVel = camFwd.dot(velDir)
  assert.ok(
    camToVel < 0.999,
    `camera keeps an angle off pure travel, dot=${camToVel.toFixed(4)}`
  )
  assertFiniteCamera(c, 'drift cap')
  c.dispose()
}))

test('camera does not snap when Space is released', () => withWindow(() => {
  const c = makeController()
  cruise(c, 3)
  for (let i = 0; i < 40; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  }
  const yawOf = (v) => Math.atan2(v.x, v.z)
  let maxYawStep = 0
  let maxPosStep = 0
  let prevYaw = yawOf(c.cameraForward)
  let prevPos = c.camera.position.clone()
  // Release Space and recover: every frame must be progressive.
  for (let i = 0; i < 60; i++) {
    step(c, 1 / 60, { KeyW: true })
    let d = Math.abs(yawOf(c.cameraForward) - prevYaw)
    if (d > Math.PI) d = 2 * Math.PI - d
    maxYawStep = Math.max(maxYawStep, d)
    maxPosStep = Math.max(
      maxPosStep, c.camera.position.distanceTo(prevPos)
    )
    prevYaw = yawOf(c.cameraForward)
    prevPos = c.camera.position.clone()
  }
  assert.ok(
    maxYawStep < 0.12,
    `no recovery snap, max yaw step=${(maxYawStep * 57.3).toFixed(2)}°`
  )
  assert.ok(
    maxPosStep < 1.0,
    `no position snap, max step=${maxPosStep.toFixed(3)}m`
  )
  // Influence decays back toward heading-locked chase behaviour.
  assert.ok(
    c.cameraDriftInfluence < 0.05,
    `camera settles back, influence=${c.cameraDriftInfluence.toFixed(3)}`
  )
  assertFiniteCamera(c, 'recovery')
  c.dispose()
}))

test('countersteering does not cause a camera flip', () => withWindow(() => {
  const c = makeController()
  cruise(c, 3)
  for (let i = 0; i < 30; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  }
  const yawOf = (v) => Math.atan2(v.x, v.z)
  let maxYawStep = 0
  let prevYaw = yawOf(c.cameraForward)
  for (let i = 0; i < 60; i++) {
    step(c, 1 / 60, { KeyW: true, KeyD: true, Space: true })
    let d = Math.abs(yawOf(c.cameraForward) - prevYaw)
    if (d > Math.PI) d = 2 * Math.PI - d
    maxYawStep = Math.max(maxYawStep, d)
    prevYaw = yawOf(c.cameraForward)
  }
  assert.ok(
    maxYawStep < 0.15,
    `countersteer stays smooth, max step=${(maxYawStep * 57.3).toFixed(2)}°`
  )
  assertFiniteCamera(c, 'countersteer')
  c.dispose()
}))

test('reverse does not trigger drift-camera behaviour', () => withWindow(() => {
  const c = makeController()
  for (let i = 0; i < 240; i++) {
    step(c, 1 / 60, { KeyS: true })
  }
  assert.ok(c.speed < 0, `precondition: reversing, speed=${c.speed}`)
  for (let i = 0; i < 60; i++) {
    step(c, 1 / 60, { KeyS: true, Space: true })
  }
  assert.ok(
    Math.abs(c.cameraDriftInfluence) < 1e-9,
    `no velocity blend in reverse, got ${c.cameraDriftInfluence}`
  )
  settleCamera(c, 2)
  assertFiniteCamera(c, 'reverse')
  // Still parked behind the heading, never flipped by opposite travel.
  const carForward = c.forwardVector(new THREE.Vector3())
  const toCamera = new THREE.Vector3()
    .subVectors(c.camera.position, c.car.position)
    .setY(0)
    .normalize()
  assert.ok(
    toCamera.dot(carForward) < -0.9,
    'reverse camera stays behind heading'
  )
  c.dispose()
}))

test('camera survives frame hitches without teleporting', () => withWindow(() => {
  const c = makeController()
  cruise(c, 2)
  for (let i = 0; i < 20; i++) {
    step(c, 1 / 60, { KeyW: true, KeyA: true, Space: true })
  }
  const before = c.camera.position.clone()
  step(c, 0.5, { KeyW: true, KeyA: true, Space: true })
  c.updateCamera(0.5)
  assertFiniteCamera(c, 'hitch')
  assert.ok(
    c.camera.position.distanceTo(before) < 15,
    'hitch never teleports the camera'
  )
  assert.ok(
    c.camera.position.distanceTo(c.car.position) < 25,
    'camera stays near the car after a hitch'
  )
  c.dispose()
}))

test('camera never generates NaN or Infinity', () => withWindow(() => {
  const c = makeController()
  cruise(c, 1)
  for (const dt of [0, -0.016, NaN, 1, 1 / 30, 1 / 120]) {
    c.updateCamera(dt)
    assertFiniteCamera(c, `dt=${dt}`)
  }
  // Degenerate states: zero velocity, extreme slip, teleport.
  c.velocity.set(0, 0, 0)
  c.slipAngle = 3.1
  c.driftFactor = 1
  c.updateCamera(1 / 60)
  assertFiniteCamera(c, 'degenerate slide')
  c.placeAt(500, -4, 0.7)
  c.updateCamera(1 / 60)
  assertFiniteCamera(c, 'teleport')
  c.dispose()
}))

test('driving physics constants are unchanged by the camera phase', () => withWindow(() => {
  assert.equal(NORMAL_GRIP, 10)
  assert.equal(DRIFT_GRIP, 2.8)
  assert.equal(DRIFT_ENTER_RATE, 6)
  assert.equal(DRIFT_RECOVERY_RATE, 2.5)
  assert.equal(DRIFT_YAW_MULTIPLIER, 1.15)
  assert.equal(MAX_DRIFT_YAW_RATE, 2.2)
  assert.equal(DRIFT_FORWARD_DRAG, 22)
  assert.equal(MAX_FORWARD_SPEED, 35)
  assert.equal(ENGINE_ACCELERATION, 18)
  assert.equal(BRAKE_DECELERATION, 28)
}))
