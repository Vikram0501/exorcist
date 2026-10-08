import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDefaultTrack } from '../../src/levels/highway/track.js'
import {
  DRIFT_SMOKE_MAX,
  EFFECT_EMITTERS,
  EMBER_MAX,
  WISP_MAX,
  createDriftSmoke,
  createLandmarkAtmosphere,
  updateDriftSmoke,
  updateLandmarkAtmosphere,
} from '../../src/levels/highway/circuit-effects.js'
import { createCircuitScenery } from '../../src/levels/highway/circuit-scenery.js'
import { HighwayEnvironmentManager } from '../../src/levels/highway/environment.js'

function carState(overrides = {}) {
  return {
    position: new THREE.Vector3(0, 0.2, 0),
    forward: new THREE.Vector3(0, 0, -1),
    driftFactor: 0,
    slipAngle: 0,
    speed: 0,
    ...overrides,
  }
}

function alivePoints(handle, max, pointsKey = 'points') {
  const alphas = handle[pointsKey].geometry.getAttribute('aAlpha')
  let alive = 0
  for (let i = 0; i < max; i++) {
    if (alphas.getX(i) > 0.004) alive++
  }
  return alive
}

test('drift smoke stays off when parked and scales with drift intensity', () => {
  const parent = new THREE.Group()
  const handle = createDriftSmoke(parent)
  updateDriftSmoke(handle, 1 / 60, carState())
  assert.equal(alivePoints(handle, DRIFT_SMOKE_MAX), 0, 'no smoke while parked')
  // Straight-line speed alone must not produce tire smoke.
  updateDriftSmoke(handle, 1, carState({ speed: 20 }))
  assert.equal(alivePoints(handle, DRIFT_SMOKE_MAX), 0, 'no smoke without slide')
  // Full slide at speed emits strongly.
  for (let i = 0; i < 60; i++) {
    updateDriftSmoke(handle, 1 / 60, carState({ driftFactor: 1, slipAngle: 0.35, speed: 30 }))
  }
  const full = alivePoints(handle, DRIFT_SMOKE_MAX)
  assert.ok(full > 20, `dense smoke in a full drift (${full})`)
  // Gentle slide emits less.
  const gentle = createDriftSmoke(new THREE.Group())
  for (let i = 0; i < 60; i++) {
    updateDriftSmoke(gentle, 1 / 60, carState({ driftFactor: 0.4, slipAngle: 0.15, speed: 30 }))
  }
  const soft = alivePoints(gentle, DRIFT_SMOKE_MAX)
  assert.ok(soft < full, `softer slide, less smoke (${soft} < ${full})`)
})

test('smoke is capped, recycled, finite and safe on bad clocks', () => {
  const handle = createDriftSmoke(new THREE.Group())
  for (let i = 0; i < 600; i++) {
    updateDriftSmoke(handle, 1 / 60, carState({ driftFactor: 1, slipAngle: 0.4, speed: 35 }))
  }
  assert.ok(alivePoints(handle, DRIFT_SMOKE_MAX) <= DRIFT_SMOKE_MAX, 'pool never grows')
  // Particles die out once the slide ends.
  for (let i = 0; i < 120; i++) updateDriftSmoke(handle, 1 / 60, carState())
  assert.equal(alivePoints(handle, DRIFT_SMOKE_MAX), 0, 'smoke clears after the drift')
  for (const dt of [0, -1, NaN, 10]) {
    updateDriftSmoke(handle, dt, carState({ driftFactor: 1, slipAngle: 0.4, speed: 30 }))
  }
  const positions = handle.points.geometry.getAttribute('position')
  for (let i = 0; i < DRIFT_SMOKE_MAX; i += 7) {
    assert.ok(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i)), 'finite after bad clocks')
  }
})

test('embers and wisps rise from damaged structures outside the road', () => {
  const track = createDefaultTrack()
  const handle = createLandmarkAtmosphere(track, new THREE.Group())
  assert.ok(handle.stations.length >= 4, 'fires at several landmarks')
  for (const station of handle.stations) {
    assert.ok(
      track.distanceToPath(station.position.x, station.position.z) > 9.7,
      'ember source clears road, curbs and walls'
    )
  }
  for (let i = 0; i < 240; i++) updateLandmarkAtmosphere(handle, 1 / 60, i / 60, 0)
  const positions = handle.embers.geometry.getAttribute('position')
  let risen = 0
  let checked = 0
  for (let i = 0; i < EMBER_MAX; i++) {
    const y = positions.getY(i)
    if (y < -40) continue
    checked++
    assert.ok(Number.isFinite(positions.getX(i) + y + positions.getZ(i)), 'finite ember')
    if (y > handle.stations[0].position.y) risen++
  }
  assert.ok(checked > 5, 'embers actually emit')
  assert.ok(risen > 0, 'embers float upward')
  const wispAlphas = handle.wisps.geometry.getAttribute('aAlpha')
  let wispAlive = 0
  for (let i = 0; i < WISP_MAX; i++) {
    if (wispAlphas.getX(i) > 0.004) wispAlive++
  }
  assert.ok(wispAlive > 0 && wispAlive <= WISP_MAX, 'occasional wisps, capped')
})

test('environment update drives smoke and atmosphere from car telemetry', () => {
  const track = createDefaultTrack()
  const car = new THREE.Object3D()
  car.position.copy(track.toWorld(100, 0, 0.2))
  car.rotation.y = track.sampleAt(100).angle
  car.userData.driftFactor = 1
  car.userData.slipAngle = 0.35
  car.userData.speed = 30
  const environment = new HighwayEnvironmentManager({
    scene: new THREE.Scene(),
    highwayGroup: new THREE.Group(),
    playerCar: car,
    moonLight: null,
    cityBuildings: null,
    streetlights: null,
    track,
  })
  for (let i = 0; i < 60; i++) environment.update(1 / 60)
  const smokeAlphas = environment.driftSmoke.points.geometry.getAttribute('aAlpha')
  let alive = 0
  for (let i = 0; i < DRIFT_SMOKE_MAX; i++) {
    if (smokeAlphas.getX(i) > 0.004) alive++
  }
  assert.ok(alive > 10, `drift smoke follows the car through the environment pass (${alive})`)
  environment.dispose()
})

test('effects add no lights, shadows or post-processing and stay cheap', () => {
  const track = createDefaultTrack()
  const group = new THREE.Group()
  const smoke = createDriftSmoke(group)
  const atmosphere = createLandmarkAtmosphere(track, group)
  let draws = 0
  group.traverse((object) => {
    if (object.isPoints) {
      draws++
      assert.equal(object.material.transparent, true)
      assert.equal(object.material.depthWrite, false)
      assert.equal(object.castShadow ?? false, false)
    }
    assert.ok(!object.isLight, 'no new lights')
  })
  assert.equal(draws, 3, 'smoke + embers + wisps: three draw calls')
  assert.ok(smoke.points.geometry.getAttribute('position').count <= DRIFT_SMOKE_MAX)
  void atmosphere
})

test('landmark debris stays off the racing surface and reuses batches', () => {
  const track = createDefaultTrack()
  const scenery = createCircuitScenery(track)
  const point = new THREE.Vector3()
  let checked = 0
  scenery.traverse((mesh) => {
    if (!mesh.isMesh) return
    const positions = mesh.geometry.getAttribute('position')
    const instances = mesh.isInstancedMesh ? mesh.count : 1
    const matrix = new THREE.Matrix4()
    for (let instance = 0; instance < instances; instance++) {
      if (mesh.isInstancedMesh) mesh.getMatrixAt(instance, matrix)
      else matrix.identity()
      for (let i = 0; i < positions.count; i += 5) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix)
        assert.ok(
          track.distanceToPath(point.x, point.z) > 9.7,
          `${mesh.name} debris stays outside road, curbs and walls`
        )
        checked++
      }
    }
  })
  assert.ok(checked > 1000, 'checked actual landmark geometry')
  // No new materials or draw calls: props reuse the existing batches.
  const names = new Set()
  scenery.traverse((mesh) => { if (mesh.isMesh) names.add(mesh.name) })
  assert.ok(
    [...names].every((name) => /abandonedPits|leftCornerStand|driftCornerStand|Tires/.test(name)),
    'debris merged into existing landmark batches'
  )
})
