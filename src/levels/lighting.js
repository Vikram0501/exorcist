import * as THREE from 'three'

export function addLevelLights(level, size) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  level.add(ambient)

  const half = Math.max(size.x, size.z) / 2 + 5
  const dir = new THREE.DirectionalLight(0xffffff, 0.7)
  dir.position.set(half, size.y + 10, half)
  dir.castShadow = true
  dir.shadow.mapSize.set(2048, 2048)
  dir.shadow.camera.near = 0.5
  dir.shadow.camera.far = size.y + size.x + 20
  dir.shadow.camera.left = -half
  dir.shadow.camera.right = half
  dir.shadow.camera.top = half
  dir.shadow.camera.bottom = -half
  level.add(dir)
}
