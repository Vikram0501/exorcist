import * as THREE from 'three'
import { addLevelLights } from './lighting.js'


const HOUSE_INTERIOR_LIGHTS = [
  { type: 'point', name: 'fireplace', position: { x: -1.6, y: 4, z: 2.3 }, color: 0xff6600, intensity: 0.4, distance: 5, decay: 1.5 },
  { type: 'point', name: 'lamp_hall_1', position: { x: -0.6, y: 5.1, z: 3.3 }, color: 0xffcc88, intensity: 0.35, distance: 4, decay: 1.8 },
  { type: 'point', name: 'lamp_hall_2', position: { x: -0.6, y: 5.1, z: 1.5 }, color: 0xffcc88, intensity: 0.35, distance: 4, decay: 1.8 },
  { type: 'point', name: 'tv_lamp_1', position: { x: 2.9, y: 4.5, z: 2.6 }, color: 0xffcc88, intensity: 0.25, distance: 4, decay: 1.8 },
  { type: 'point', name: 'lamp_upstairs', position: { x: 0.9, y: 7.4, z: -2.4 }, color: 0xffcc88, intensity: 0.18, distance: 3, decay: 1.8 },
  { type: 'point', name: 'kitchen_lamp_1', position: { x: 0.0, y: 4.7, z: -1.5 }, color: 0xffaa44, intensity: 0.12, distance: 2.5, decay: 2 },
  { type: 'point', name: 'kitchen_lamp_2', position: { x: 0.0, y: 4.7, z: -2.5 }, color: 0xffaa44, intensity: 0.12, distance: 2.5, decay: 2 },
  //{ type: 'spot', name: 'moonbeam_window_1', position: { x: 1.1, y: 7.6, z: -3.7 }, target: { x: 1.1, y: 6.3, z: -2.1 }, color: 0x6688cc, intensity: 0.4, angle: 0.35, penumbra: 0.5, distance: 2 },
  //{ type: 'spot', name: 'moonbeam_window_2', position: { x: 5.5, y: 5, z: -6 }, target: { x: 4, y: 0.5, z: -3 }, color: 0x6688cc, intensity: 0.4, angle: 0.35, penumbra: 0.5, distance: 15 },
  //{ type: 'spot', name: 'moonbeam_window_3', position: { x: 0, y: 6, z: 6 }, target: { x: 0, y: 1, z: 3 }, color: 0x6688cc, intensity: 0.3, angle: 0.4, penumbra: 0.6, distance: 12 },
]


function addInteriorLights(level, config = []) {

  const lights = []
  const helpers = []
  const merged = [...HOUSE_INTERIOR_LIGHTS, ...config]

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


export function setupHouseLighting(level, model, size) {

  addLevelLights(level, size)

  const { helpers: lightHelpers } =
    addInteriorLights(level)

  return { lightHelpers }
}
