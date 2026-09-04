import * as THREE from 'three'
import { addLevelLights } from './lighting.js'


const TRAIN_INTERIOR_LIGHTS = [
  { type: 'point', name: 'ceiling_light_front', position: { x: 0.4, y: 4.3, z: -15.7 }, color: 0xffcc88, intensity: 0.4, distance: 3.5, decay: 1.8 },
  { type: 'point', name: 'ceiling_light_mid_front', position: { x: 0.3, y: 4.3, z: -13.8 }, color: 0xffcc88, intensity: 0.4, distance: 3.5, decay: 1.8 },
  { type: 'point', name: 'ceiling_light_mid', position: { x: 0.4, y: 4.3, z: -12 }, color: 0xffcc88, intensity: 0.4, distance: 3.5, decay: 1.8 },
  { type: 'point', name: 'ceiling_light_mid_back', position: { x: 0, y: 4.5, z: -4 }, color: 0xffcc88, intensity: 0.25, distance: 3.5, decay: 1.8 },
  { type: 'point', name: 'ceiling_light_back', position: { x: 0, y: 4.5, z: -8 }, color: 0xffcc88, intensity: 0.3, distance: 4, decay: 1.8 },
]


function addInteriorLights(level, config = []) {

  const lights = []
  const helpers = []
  const merged = [...TRAIN_INTERIOR_LIGHTS, ...config]

  for (const def of merged) {
    let light
    if (def.type === 'point') {
      light = new THREE.PointLight(def.color, def.intensity, def.distance, def.decay)
      light.position.set(def.position.x, def.position.y, def.position.z)
      const helper = new THREE.PointLightHelper(light, 0.3)
      helper.visible = false
      level.add(helper)
      helpers.push(helper)
    } else if (def.type === 'spot') {
      light = new THREE.SpotLight(def.color, def.intensity, def.distance, def.angle, def.penumbra, 1)
      light.position.set(def.position.x, def.position.y, def.position.z)
      light.target.position.set(def.target.x, def.target.y, def.target.z)
      level.add(light.target)
      const helper = new THREE.SpotLightHelper(light)
      helper.visible = false
      level.add(helper)
      helpers.push(helper)
    }
    light.castShadow = false
    light.name = def.name
    level.add(light)
    lights.push(light)
  }

  return { lights, helpers }
}


export function setupTrainLighting(level, model, size) {

  addLevelLights(level, size)

  const { helpers: lightHelpers } =
    addInteriorLights(level)

  return { lightHelpers }
}
