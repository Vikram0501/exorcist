import * as THREE from 'three'

export function addLevelLights(level, size) {
  const hemi = new THREE.HemisphereLight(0x1a1a2e, 0x0a0a12, 0.15)
  level.add(hemi)

  const half = Math.max(size.x, size.z) / 2 + 5
  const moon = new THREE.DirectionalLight(0x88aaff, 0.3)
  moon.position.set(half, size.y + 20, -half * 0.5)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048)
  moon.shadow.camera.near = 0.5
  moon.shadow.camera.far = size.y + size.x + 40
  moon.shadow.camera.left = -half
  moon.shadow.camera.right = half
  moon.shadow.camera.top = half
  moon.shadow.camera.bottom = -half
  moon.shadow.bias = -0.0005
  level.add(moon)

  level.fog = new THREE.FogExp2(0x0a0a12, 0.012)

  return { hemi, moon }
}

export function createFlashlight(camera) {
  const flashlight = new THREE.SpotLight(0xffffff, 1.5, 25, Math.PI / 6, 0.3, 1)
  flashlight.castShadow = true
  flashlight.shadow.mapSize.set(1024, 1024)
  flashlight.shadow.camera.near = 0.5
  flashlight.shadow.camera.far = 25
  flashlight.shadow.bias = -0.0002
  flashlight.name = 'flashlight'
  camera.add(flashlight)
  camera.add(flashlight.target)
  flashlight.target.position.set(0, 0, -1)
  return flashlight
}
