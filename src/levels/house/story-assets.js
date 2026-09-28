import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g, '')

export function findStoryAsset(model, names) {
  const wanted = new Set(names.map(normalize))
  let result = null
  model.traverse(object => {
    if (!result && wanted.has(normalize(object.name))) result = object
  })
  return result
}

export function darkenGraves(model) {
  const roots = [
    findStoryAsset(model, ['grave']),
    findStoryAsset(model, ['grave.001']),
  ]
  for (const root of new Set(roots.filter(Boolean))) {
    root.traverse(object => {
      if (!object.isMesh) return
      const darken = material => {
        const copy = material.clone()
        copy.color?.multiplyScalar(0.38)
        if (copy.emissive) copy.emissive.setRGB(0, 0, 0)
        if ('roughness' in copy) copy.roughness = Math.max(copy.roughness, 0.92)
        return copy
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(darken)
        : darken(object.material)
    })
  }
}

// Preserve the artist's world orientation and materials at a shorter height.
// Clone materials so the farewell fade never changes the environment asset.
export function createAuthoredGhost(source, height = 1.35) {
  source.updateWorldMatrix(true, true)
  const actor = new THREE.Group()
  const artwork = clone(source)
  artwork.matrix.copy(source.matrixWorld)
  artwork.matrix.decompose(artwork.position, artwork.quaternion, artwork.scale)
  actor.add(artwork)
  const bounds = new THREE.Box3().setFromObject(actor)
  const centre = bounds.getCenter(new THREE.Vector3())
  artwork.position.sub(new THREE.Vector3(centre.x, bounds.min.y, centre.z))
  const wrapper = new THREE.Group()
  actor.scale.setScalar(height / Math.max(bounds.max.y - bounds.min.y, 0.01))
  wrapper.add(actor)
  artwork.traverse(object => {
    if (!object.isMesh) return
    const copy = material => material.clone()
    object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material)
    object.castShadow = false
  })
  source.visible = false
  return wrapper
}

export function setGhostAppearance(ghost, opacity, color) {
  ghost.traverse(object => {
    if (!object.isMesh) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.opacity = opacity
      material.transparent = opacity < 1
      material.depthWrite = opacity >= 1
      // Keep the supplied textures and colours; use emissive tint where supported.
      if (material.emissive) {
        material.emissive.setHex(color)
        material.emissiveIntensity = 0.25
      } else material.color?.setHex(color)
    }
  })
}

// A separate camera child keeps the face centred even when the player looks
// up or turns. Its front surface stays beyond the camera's near plane.
export function createJumpScareGhost(source, camera) {
  const artwork = clone(source)
  artwork.visible = true
  artwork.position.set(0, 0, 0)
  artwork.quaternion.identity()
  artwork.scale.setScalar(1)
  artwork.traverse(object => {
    if (!object.isMesh) return
    const material = original => new THREE.MeshBasicMaterial({
      map: original.map || null,
      color: original.color || 0xffffff,
      alphaMap: original.alphaMap || null,
      alphaTest: original.alphaTest || 0,
      side: THREE.FrontSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    object.material = Array.isArray(object.material)
      ? object.material.map(material) : material(object.material)
    object.renderOrder = 10000
    object.frustumCulled = false
  })
  const bounds = new THREE.Box3().setFromObject(artwork)
  const height = Math.max(bounds.max.y - bounds.min.y, 0.01)
  const head = new THREE.Box3()
  const cutoff = bounds.min.y + height * 0.82
  const vertex = new THREE.Vector3()
  artwork.traverse(object => {
    if (!object.isMesh || !object.geometry.attributes.position) return
    for (let i = 0; i < object.geometry.attributes.position.count; i++) {
      object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld)
      if (vertex.y >= cutoff) head.expandByPoint(vertex)
    }
  })
  if (head.isEmpty()) head.copy(bounds)
  head.min.y = cutoff
  const face = new THREE.Vector3(
    (head.min.x + head.max.x) / 2,
    (head.min.y + head.max.y) / 2,
    head.max.z,
  )
  artwork.position.sub(face)
  const closeup = new THREE.Group()
  closeup.name = 'Ghost_JumpScare_Closeup'
  closeup.add(artwork)
  const distance = Math.max(camera.near + 0.15, 0.38)
  const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance
  closeup.scale.setScalar(visibleHeight * 1.8 / (height * 0.18))
  closeup.position.z = -distance
  closeup.visible = false
  camera.add(closeup)
  return closeup
}
