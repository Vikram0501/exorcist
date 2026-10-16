import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'

export function installBathroomMirror(model, avatar) {
  let surface = null
  model.traverse(object => {
    if (!surface && object.isMesh && object.name.toLowerCase().replace(/[^a-z0-9]/g, '') === 'bathroommirror') {
      surface = object
    }
  })
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
  geometry.computeBoundingBox()
  const pane = geometry.boundingBox
  const width = pane.max.x - pane.min.x
  const height = pane.max.y - pane.min.y
  const centerX = (pane.min.x + pane.max.x) / 2
  const centerY = (pane.min.y + pane.max.y) / 2
  const paneZ = (pane.min.z + pane.max.z) / 2
  const trimWidth = Math.max(0.025, Math.min(width, height) * 0.075)
  const mount = new THREE.Group()
  mount.name = 'Bathroom Mirror Reflection'
  mount.position.copy(surface.position)
  mount.quaternion.copy(surface.quaternion)
  mount.scale.copy(surface.scale)
  const mirror = new Reflector(geometry, {
    textureWidth: 384,
    textureHeight: 384,
    clipBias: 0.003,
    color: 0xffffff,
  })
  mirror.name = 'Bathroom Mirror Surface'
  mirror.quaternion.copy(frontRotation)
  mount.add(mirror)
  const frame = new THREE.Group()
  frame.name = 'Bathroom Mirror Frame'
  frame.quaternion.copy(frontRotation)
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x332620, metalness: 0.62, roughness: 0.36,
  })
  for (const [barWidth, barHeight, x, y] of [
    [width + trimWidth * 2, trimWidth, centerX, pane.max.y + trimWidth / 2],
    [width + trimWidth * 2, trimWidth, centerX, pane.min.y - trimWidth / 2],
    [trimWidth, height, pane.min.x - trimWidth / 2, centerY],
    [trimWidth, height, pane.max.x + trimWidth / 2, centerY],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(barWidth, barHeight, trimWidth * 0.6), frameMaterial)
    bar.position.set(x, y, paneZ + 0.012)
    frame.add(bar)
  }
  const faceLight = new THREE.PointLight(0xffdec2, 3, 3.4, 2)
  faceLight.name = 'Bathroom Mirror Face Light'
  faceLight.position.set(centerX, centerY + height * 0.15, paneZ + 0.35)
  frame.add(faceLight)
  mount.add(frame)
  surface.parent.add(mount)
  surface.visible = false
  const mirrorWorldPosition = new THREE.Vector3()
  const mirrorNormal = new THREE.Vector3()
  const cameraDirection = new THREE.Vector3()
  const towardMirror = new THREE.Vector3()
  let lastReflectionAt = -Infinity

  // The avatar is hidden from the main first-person camera. Reveal it only
  // while the reflector renders its own view, then restore the normal view.
  const renderReflection = mirror.onBeforeRender
  mirror.onBeforeRender = function (renderer, scene, camera) {
    const now = performance.now()
    if (now - lastReflectionAt < 140) return
    lastReflectionAt = now
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
    frame,
    faceLight,
    update(camera) {
      mirror.getWorldPosition(mirrorWorldPosition)
      mirror.getWorldDirection(mirrorNormal)
      camera.getWorldDirection(cameraDirection)
      towardMirror.copy(mirrorWorldPosition).sub(camera.position)
      // A nearby stairwell can put the camera within 2.5 m of the mirror
      // through a floor or wall. Rendering a second view there causes a hitch
      // even though the glass cannot be seen from that position.
      const sameFloor = Math.abs(towardMirror.y) < 1.2
      const inFront = mirrorNormal.dot(towardMirror) < -0.05
      const near = sameFloor && inFront && towardMirror.lengthSq() < 6.25 &&
        cameraDirection.dot(towardMirror.normalize()) > 0.25
      mirror.visible = near
      surface.visible = !near
      faceLight.visible = near
    },
    dispose() {
      mount.removeFromParent()
      surface.visible = true
      mirror.getRenderTarget().dispose()
      geometry.dispose()
      for (const bar of frame.children) if (bar.isMesh) bar.geometry.dispose()
      frameMaterial.dispose()
    },
  }
}
