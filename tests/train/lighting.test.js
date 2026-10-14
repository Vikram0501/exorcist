import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCarriageLights, prewarmTrainLightStates } from '../../src/levels/train/lighting.js'

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

test('prewarm compiles every runtime light state and restores visibility', async () => {
  const group = new THREE.Group()
  const controller = createCarriageLights(group, '02', 0)
  const glowGroup = new THREE.Group()
  const glow = new THREE.PointLight(0xff0000, 2, 8, 2)
  glowGroup.add(glow)

  const states = []
  await prewarmTrainLightStates({
    controllers: [controller],
    glowGroup,
    compile: () => {
      states.push({
        lit: controller.lights.filter(light => light.visible).length,
        glow: glowGroup.visible && glow.visible,
      })
    },
  })

  assert.deepEqual(states, [
    { lit: 15, glow: false }, // spawn carriage lit, front carriage culled
    { lit: 0, glow: false },  // after the cut, still far from the front car
    { lit: 0, glow: true },   // cut lights plus the rite glow near the front
  ])
  assert.ok(controller.lights.every(light => light.visible), 'spawn lights restored')
  assert.ok(glowGroup.visible, 'front carriage visibility restored')

  controller.dispose()
})

test('prewarm restores state when compiling fails', async () => {
  const group = new THREE.Group()
  const controller = createCarriageLights(group, '02', 0)
  const glowGroup = new THREE.Group()

  await assert.rejects(() => prewarmTrainLightStates({
    controllers: [controller],
    glowGroup,
    compile: () => { throw new Error('compile failed') },
  }))

  assert.ok(controller.lights.every(light => light.visible), 'spawn lights restored')
  assert.ok(glowGroup.visible, 'front carriage visibility restored')
  controller.dispose()
})
