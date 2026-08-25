import * as THREE from 'three'

const colliders = []

function addBox(scene, { x, z, w, h, d, color }) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, h / 2, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
  colliders.push({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    top: h,
  })
}

export function createEnvironment(scene) {
  const groundGeo = new THREE.PlaneGeometry(200, 200)
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3fae5a,
    roughness: 0.9,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(200, 50, 0x2f7a41, 0x2f7a41)
  grid.position.y = 0.01
  scene.add(grid)

  const ambient = new THREE.AmbientLight(0xffffff, 0.45)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xfff4d6, 1.6)
  sun.position.set(30, 40, 20)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -40
  sun.shadow.camera.right = 40
  sun.shadow.camera.top = 40
  sun.shadow.camera.bottom = -40
  sun.shadow.camera.far = 100
  scene.add(sun)
  scene.add(sun.target)

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3fae5a, 0.5)
  scene.add(hemi)

  const layout = [
    { x: 8, z: 8, w: 3, h: 6, d: 3, color: 0xd97706 },
    { x: -10, z: 5, w: 3, h: 4, d: 3, color: 0x7c3aed },
    { x: 4, z: -12, w: 3, h: 8, d: 3, color: 0xdc2626 },
    { x: -14, z: -9, w: 3, h: 5, d: 3, color: 0x0891b2 },
    { x: 16, z: -4, w: 3, h: 7, d: 3, color: 0x16a34a },
    { x: -5, z: 14, w: 3, h: 4, d: 3, color: 0xca8a04 },
    { x: 22, z: 14, w: 4, h: 9, d: 4, color: 0x64748b },
    { x: -22, z: -16, w: 4, h: 6, d: 4, color: 0x64748b },
    { x: 12, z: -24, w: 4, h: 5, d: 4, color: 0x64748b },
    { x: -24, z: 18, w: 4, h: 8, d: 4, color: 0x64748b },
  ]

  layout.forEach((box) => addBox(scene, box))

  const pads = [
    { x: -18, z: -2 },
    { x: 0, z: -20 },
    { x: 18, z: 2 },
    { x: -2, z: 18 },
  ]
  pads.forEach(({ x, z }) => {
    const padGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.2, 24)
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 })
    const pad = new THREE.Mesh(padGeo, padMat)
    pad.position.set(x, 0.1, z)
    pad.receiveShadow = true
    scene.add(pad)
  })

  return scene
}

export { colliders as environmentColliders }