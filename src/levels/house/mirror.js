import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'

const MIRROR_NAME = 'BathroomMirror'

export function installBathroomMirror(model, avatar) {
  const surface = model.getObjectByName(MIRROR_NAME)
  if (!surface?.isMesh || !surface.geometry?.getAttribute('position')) return null

  const geometry = surface.geometry.clone()
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const vertex = (i) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i)
  const a = vertex(0)
  const b = vertex(1)
  const c = vertex(2)
  const normal = b.sub(a).cross(c.sub(a)).normalize()
  if (normal.lengthSq() < 0.5) {
    geometry.dispose()
    console.warn('BathroomMirror needs a flat plane with a front-facing normal')
    return null
  }

  // Reflector assumes local +Z is the front. Rotate its geometry and object
  // in opposite directions, preserving the authored plane's world position.
  const frontRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  geometry.applyQuaternion(frontRotation.clone().invert())
  const mount = new THREE.Group()
  mount.name = 'Bathroom Mirror Reflection'
  mount.position.copy(surface.position)
  mount.quaternion.copy(surface.quaternion)
  mount.scale.copy(surface.scale)
  const mirror = new Reflector(geometry, {
    textureWidth: 512,
    textureHeight: 512,
    clipBias: 0.003,
    color: 0xbdbdbd,
  })
  mirror.name = 'Bathroom Mirror Surface'
  mirror.quaternion.copy(frontRotation)
  mount.add(mirror)
  surface.parent.add(mount)
  surface.visible = false

  // The avatar is hidden from the main first-person camera. Reveal it only
  // while the reflector renders its own view, then restore the normal view.
  const renderReflection = mirror.onBeforeRender
  mirror.onBeforeRender = function (renderer, scene, camera) {
    const wasVisible = avatar.root.visible
    avatar.root.visible = true
    try {
      renderReflection.call(this, renderer, scene, camera)
    } finally {
      avatar.root.visible = wasVisible
    }
  }

  return {
    mirror,
    dispose() {
      mirror.getRenderTarget().dispose()
    },
  }
}
