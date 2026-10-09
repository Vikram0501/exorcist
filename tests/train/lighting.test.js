import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCarriageLights } from '../../src/levels/train/lighting.js'

test('carriage lighting uses every other authored fixture and no debug assets', () => {
  const group = new THREE.Group()
  const controller = createCarriageLights(group, '02', 0)
  assert.equal(controller.lights.length, 15)
  assert.equal(controller.helpers.length, 0)
  assert.equal(controller._debugLabels.length, 0)
  assert.ok(controller.lights.every(light => !light.castShadow))
  controller.dispose()
})

test('broken carriage fixtures do not create active lights', () => {
  const group = new THREE.Group()
  const controller = createCarriageLights(group, '02', 3)
  assert.equal(controller.lights.length, 7)
  assert.ok(controller.lights.every(light => light.intensity > 0))
  controller.dispose()
})
