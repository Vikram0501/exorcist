import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

const PLAYER_RADIUS = 0.35

function extractColliders(model) {
  const colliders = []

  model.traverse((child) => {
    if (!child.isMesh) return

    child.castShadow = true
    child.receiveShadow = true

    const box = new THREE.Box3().setFromObject(child)
    const size = box.getSize(new THREE.Vector3())

    if (size.x < 0.01 && size.z < 0.01) return

    colliders.push({
      minX: box.min.x - PLAYER_RADIUS,
      maxX: box.max.x + PLAYER_RADIUS,
      minZ: box.min.z - PLAYER_RADIUS,
      maxZ: box.max.z + PLAYER_RADIUS,
      top: box.max.y,
      floor: 0,
    })
  })

  return colliders
}

function addLights(scene, size) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)

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
  scene.add(dir)
}

export function loadHouse(scene) {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader()

    loader.load(
      '/house.fbx',
      (model) => {
        const preBox = new THREE.Box3().setFromObject(model)
        const preSize = preBox.getSize(new THREE.Vector3())
        const preCenter = preBox.getCenter(new THREE.Vector3())
        console.log('Raw model:', { min: preBox.min, max: preBox.max, size: preSize })

        const maxDim = Math.max(preSize.x, preSize.y, preSize.z)
        if (maxDim > 100) {
          const s = 10 / maxDim
          model.scale.setScalar(s)
          console.log('Auto-scaled by', s)
        }

        model.rotation.x = Math.PI / 2
        model.updateMatrixWorld(true)

        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        console.log('After scale:', { size, center })

        model.position.x -= center.x
        model.position.z -= center.z
        model.position.y -= box.min.y
        model.updateMatrixWorld(true)

        scene.add(model)

        const colliders = extractColliders(model)
        addLights(scene, size)

        const finalBox = new THREE.Box3().setFromObject(model)
        const finalCenter = finalBox.getCenter(new THREE.Vector3())
        console.log('Final bounds:', { min: finalBox.min, max: finalBox.max, center: finalCenter })

        resolve({
          colliders,
          spawn: new THREE.Vector3(0, 1.7, 0),
          modelSize: size,
        })
      },
      undefined,
      (err) => {
        console.error('Failed to load house.fbx:', err)
        reject(err)
      }
    )
  })
}
