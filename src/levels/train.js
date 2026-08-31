import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addLevelLights } from './lighting.js'

const TRAIN_SPAWN = new THREE.Vector3(9.7171, 1.7, -1.9217)

export function loadTrain(level) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(
      '/models/train.glb',
      (gltf) => {
        const model = gltf.scene
        model.scale.set(1, 1, 1)
        model.traverse((child) => {
          if (!child.isMesh) return
          child.castShadow = true
          child.receiveShadow = true
        })
        model.updateMatrixWorld(true)

        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        console.log('Train bounds:', { min: box.min, max: box.max, size })

        level.add(model)
        addLevelLights(level, size)

        resolve({
          colliders: [],
          colliderHelpers: [],
          doors: [],
          ramps: [],
          model,
          spawn: TRAIN_SPAWN,
          modelSize: size,
        })
      },
      undefined,
      (err) => {
        console.error('Failed to load train.glb:', err)
        reject(err)
      }
    )
  })
}
