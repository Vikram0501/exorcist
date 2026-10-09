import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDefaultTrack } from '../../src/levels/highway/track.js'
import {
  CIRCUIT_FLOOD_INTENSITY,
  CIRCUIT_FLOOD_POOL_SIZE,
  createCircuitFloodlights,
  updateCircuitFloodlights,
} from '../../src/levels/highway/circuit-lighting.js'
import { HighwayEnvironmentManager } from '../../src/levels/highway/environment.js'

function makeManager(progress = 0) {
  const playerCar = new THREE.Object3D()
  const track = createDefaultTrack()
  playerCar.position.copy(track.toWorld(progress, 0, 0.2))
  // Headlight/rim/fill directions follow the car's heading, so align the
  // stub exactly as the game does when seating cars on the track.
  playerCar.rotation.y = track.sampleAt(progress).angle
  playerCar.updateMatrixWorld(true)
  const environment = new HighwayEnvironmentManager({
    scene: new THREE.Scene(),
    highwayGroup: new THREE.Group(),
    playerCar,
    moonLight: new THREE.DirectionalLight(0xffffff, 1),
    cityBuildings: null,
    streetlights: null,
    track,
  })
  return { environment, playerCar, track }
}

test('floodlight fixtures follow the track and clear the racing surface', () => {
  const track = createDefaultTrack()
  const parent = new THREE.Group()
  const handle = createCircuitFloodlights(track, parent)
  assert.equal(handle.stations.length, 5)
  assert.equal(handle.slots.length, CIRCUIT_FLOOD_POOL_SIZE)
  for (const station of handle.stations) {
    assert.ok(track.distanceToPath(station.position.x, station.position.z) > 9.7)
    const solved = track.toTrack(station.target)
    assert.ok(Math.abs(solved.d) < 6.5, 'aims at the drivable surface')
    assert.ok(station.position.y - station.target.y > 4, 'elevated fixture')
  }
  const poles = handle.group.getObjectByName('circuitFloodPoles')
  const heads = handle.group.getObjectByName('circuitFloodHeads')
  assert.ok(poles?.isInstancedMesh && heads?.isInstancedMesh)
  handle.group.traverse((object) => {
    if (object.isSpotLight) {
      assert.equal(object.castShadow, false)
      assert.ok(object.distance <= 70 && object.angle < Math.PI / 2)
    }
  })
})

test('two pooled floodlights fade between fixtures without popping', () => {
  const track = createDefaultTrack()
  const handle = createCircuitFloodlights(track, new THREE.Group())
  updateCircuitFloodlights(handle, 81, 1 / 60)
  for (let i = 0; i < 120; i++) updateCircuitFloodlights(handle, 81, 1 / 60)
  const lit = handle.slots.filter((slot) => slot.light.intensity > 1)
  assert.ok(lit.length >= 1, 'pit fixture lights up on approach')
  for (const slot of handle.slots) {
    assert.ok(slot.light.intensity >= 0 && slot.light.intensity <= CIRCUIT_FLOOD_INTENSITY + 1)
  }
  const before = handle.slots.map((slot) => slot.light.intensity)
  for (let i = 0; i < 30; i++) updateCircuitFloodlights(handle, 625, 1 / 60)
  const after = handle.slots.map((slot) => slot.light.intensity)
  assert.ok(after.some((v, i) => Math.abs(v - before[i]) > 1), 'handover retargets the pool')
  let maxStep = 0
  let prev = [...after]
  for (let i = 0; i < 60; i++) {
    updateCircuitFloodlights(handle, 625, 1 / 60)
    const current = handle.slots.map((slot) => slot.light.intensity)
    maxStep = Math.max(maxStep, ...current.map((v, j) => Math.abs(v - prev[j])))
    prev = current
  }
  assert.ok(maxStep < CIRCUIT_FLOOD_INTENSITY * 0.25, `fades progressively, max step ${maxStep.toFixed(1)}`)
  updateCircuitFloodlights(handle, 1300, 1 / 60)
  for (let i = 0; i < 120; i++) updateCircuitFloodlights(handle, 1300, 1 / 60)
  assert.ok(handle.slots.every((slot) => slot.light.intensity < 5), 'dark between fixtures')
})

test('headlights reach reaction distance and follow road elevation', () => {
  const { environment, track } = makeManager(600)
  environment.updateHeadlights(0, 600)
  for (const light of [environment.leftLight, environment.rightLight]) {
    assert.equal(light.castShadow, false)
    assert.ok(light.distance >= 65, 'sees obstacles early enough to react')
  }
  const target = environment.leftTarget.position
  const solved = track.toTrack(target)
  assert.ok(Math.abs(solved.s - 635) < 12, 'aims down-road, not at fixed world -Z')
  assert.ok(Math.abs(target.y - track.sampleAt(solved.s).position.y) < 3, 'follows elevation into corners')
  environment.dispose()
})

test('lighting stays dark-horror, bounded and performant', () => {
  const { environment } = makeManager(100)
  const lights = []
  environment.group.traverse((object) => { if (object.isLight) lights.push(object) })
  const shadowLights = lights.filter((light) => light.castShadow)
  assert.equal(shadowLights.length, 0, 'environment adds no shadow-casting lights (moon owns the only shadow map)')
  assert.ok(lights.length <= 10, `${lights.length} environment lights`)
  const hemi = environment.group.getObjectByName('crimsonSkyFill')
  assert.ok(hemi.intensity <= 0.7, 'ambient stays sombre, not washed out')
  assert.ok(environment.scene.fog.density <= 0.019, 'fog never hides the next corner')
  const floods = environment.circuitFloodlights
  assert.ok(floods.slots.length === CIRCUIT_FLOOD_POOL_SIZE)
  environment.dispose()
})
