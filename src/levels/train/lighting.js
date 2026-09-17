import * as THREE from 'three'
import { addLevelLights } from '../shared/lighting.js'


// Per-carriage ceiling lights.
// Positions are local offsets within a carriage group.
const CARRIAGE_LIGHT_CONFIG = [
  { offset: { x: 0.4, y: 4.3, z: -1.5 } },
  { offset: { x: 0.3, y: 4.3, z: -3.8 } },
  { offset: { x: 0.4, y: 4.3, z: -6.0 } },
  { offset: { x: 0.0, y: 4.5, z: -8.0 } },
  { offset: { x: 0.0, y: 4.5, z: -10.5 } },
]

const LIGHT_COLOR = 0xffcc88
const LIGHT_INTENSITY = 0.4
const LIGHT_DISTANCE = 3.5
const LIGHT_DECAY = 1.8


export function createCarriageLights(carriageGroup) {
  const lights = []
  const helpers = []

  for (let i = 0; i < CARRIAGE_LIGHT_CONFIG.length; i++) {
    const cfg = CARRIAGE_LIGHT_CONFIG[i]
    const light = new THREE.PointLight(
      LIGHT_COLOR,
      LIGHT_INTENSITY,
      LIGHT_DISTANCE,
      LIGHT_DECAY
    )
    light.position.set(cfg.offset.x, cfg.offset.y, cfg.offset.z)
    light.castShadow = false
    light.name = `carriage_light_${i}`
    carriageGroup.add(light)
    lights.push(light)

    const helper = new THREE.PointLightHelper(light, 0.3)
    helper.visible = false
    carriageGroup.add(helper)
    helpers.push(helper)
  }

  return { lights, helpers }
}


export function disposeCarriageLights(carriageGroup) {
  const toRemove = []
  carriageGroup.traverse((child) => {
    if (child.isLight) {
      toRemove.push(child)
    }
  })
  for (const light of toRemove) {
    carriageGroup.remove(light)
    if (light.dispose) light.dispose()
  }
}


export function setupTrainLighting(level, model, size) {
  addLevelLights(level, size)
  return { lightHelpers: [] }
}
