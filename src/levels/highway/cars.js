import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const PLAYER_MODEL_URL = '/models/player_car.glb'
export const GHOST_MODEL_URL = '/models/ghost_car.glb'
export const HIGHWAY_CAR_TARGET_LENGTH = 4
// Browser inspection of grille/headlights versus tail fins confirms +Z noses.
// The gameplay root also uses +Z as forward; no corrective yaw is needed.
export const PLAYER_MODEL_ROTATION = 0
export const GHOST_MODEL_ROTATION = 0
const GHOST_COLOR = 0x44dddd
const GHOST_EMISSIVE = 0x228888
const GHOST_EMISSIVE_INTENSITY = 1.5
const GHOST_OPACITY = 0.5

// Fresh resources per level instance: the existing level teardown owns them.
// Attach fulfilled loads immediately so teardown also covers a partial failure.
export async function loadHighwayCars(highway) {
  const loader = new GLTFLoader()
  const results = await Promise.allSettled([
    [PLAYER_MODEL_URL, false],
    [GHOST_MODEL_URL, true],
  ].map(async ([url, ghost]) => {
    const { scene } = await loader.loadAsync(url)
    const car = new THREE.Group()
    car.name = ghost ? 'ghostCar' : 'playerCar'
    car.add(scene)
    highway.add(car)
    prepareCarVisual(car, scene, ghost)
    return car
  }))
  const failed = results.find(result => result.status === 'rejected')
  if (failed) throw failed.reason
  return results.map(result => result.value)
}

function prepareCarVisual(car, scene, ghost) {
  // These assets include a separate baked ground shadow, not vehicle geometry.
  // Its material/texture are separate from the body and glass in both assets.
  const plane = scene.getObjectByName('Plane001')
  if (plane) {
    plane.removeFromParent()
    plane.traverse(object => {
      object.geometry?.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose()
        }
        material.dispose()
      }
    })
  }

  car.remove(scene)
  const visual = new THREE.Group()
  visual.name = ghost ? 'ghostCarVisual' : 'playerCarVisual'
  visual.rotation.y = ghost ? GHOST_MODEL_ROTATION : PLAYER_MODEL_ROTATION
  visual.add(scene)
  car.add(visual)
  visual.updateMatrixWorld(true)

  const bounds = new THREE.Box3()
  scene.traverseVisible(object => {
    if (!object.isMesh) return
    object.geometry.computeBoundingBox()
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld))
    object.castShadow = !ghost
    object.receiveShadow = true
    if (ghost) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        material.color.setHex(GHOST_COLOR)
        material.emissive.setHex(GHOST_EMISSIVE)
        material.emissiveIntensity = GHOST_EMISSIVE_INTENSITY
        material.transparent = true
        material.opacity = GHOST_OPACITY
      }
    }
  })
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = HIGHWAY_CAR_TARGET_LENGTH / size.z
  visual.scale.setScalar(scale)
  visual.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
}
