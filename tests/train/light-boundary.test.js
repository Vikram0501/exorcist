import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCarriageLights } from '../../src/levels/train/lighting.js'
import { updateTrainCarriageLights } from '../../src/levels/train/index.js'

function makeCarriage(minZ, maxZ, lit) {
  const group = new THREE.Group()
  const controller = createCarriageLights(group, '02', 0, { lit })
  return {
    group,
    controller,
    bounds: new THREE.Box3(
      new THREE.Vector3(0, 0, minZ),
      new THREE.Vector3(4, 5, maxZ),
    ),
  }
}

test('dark carriages are created without any lights', () => {
  const start = makeCarriage(-131, -96, true)
  const dark = makeCarriage(-96, -61, false)
  assert.equal(start.controller.lights.length, 15)
  assert.equal(dark.controller.lights.length, 0)
  assert.equal(dark.group.children.length, 0)
  start.controller.dispose()
  dark.controller.dispose()
})

test('the lit carriage can use the warm/normal preset regardless of instance', () => {
  const group = new THREE.Group()
  const controller = createCarriageLights(group, '02', 3, { lit: true, presetIndex: 0 })
  assert.equal(controller.lights.length, 15)
  assert.ok(controller.lights.every(light => light.color.getHex() === 0xffcc88))
  assert.ok(controller.lights.every(light => light.intensity > 0.4))
  controller.dispose()
})

test('crossing the boundary cuts the starting carriage lights for good', () => {
  const start = makeCarriage(-131, -96, true)
  const next = makeCarriage(-96, -61, false)
  const carriages = [next, start]
  start.controller.setFlicker(0, { speed: 6, minIntensity: 0.1, maxIntensity: 0.45 })

  updateTrainCarriageLights(carriages, -127)
  assert.equal(start.controller.cutOut, false)
  assert.ok(start.controller.lights.every(light => light.visible))

  updateTrainCarriageLights(carriages, -90)
  assert.equal(start.controller.cutOut, true)
  assert.ok(start.controller.lights.every(light => !light.visible && light.intensity === 0))

  start.controller.update(1 / 60)
  assert.equal(start.controller.lights[0].intensity, 0, 'flicker must not revive cut lights')

  updateTrainCarriageLights(carriages, -127)
  assert.ok(start.controller.lights.every(light => !light.visible), 'walking back must not restore lights')

  start.controller.dispose()
  next.controller.dispose()
})
