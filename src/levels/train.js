import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addLevelLights } from './lighting.js'

// New train is very large in its original coordinates.
// This brings it into roughly the same world scale as the new house.
const TRAIN_SCALE = 0.1

const EYE_HEIGHT = 1.7
const SPAWN_DISTANCE = 8

export function loadTrain(level) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(
      '/models/Train.glb',

      (gltf) => {
        const model = gltf.scene

        // Scale train down.
        model.scale.setScalar(TRAIN_SCALE)

        // Enable shadows.
        model.traverse((child) => {
          if (!child.isMesh) return

          child.castShadow = true
          child.receiveShadow = true
        })

        model.updateMatrixWorld(true)

        // Find original scaled bounds.
        const initialBox = new THREE.Box3().setFromObject(model)
        const initialCenter = initialBox.getCenter(new THREE.Vector3())

        // Centre train on X/Z.
        model.position.x -= initialCenter.x
        model.position.z -= initialCenter.z

        // Put lowest part of train on ground level.
        model.position.y -= initialBox.min.y

        model.updateMatrixWorld(true)

        // Final bounds.
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())

        level.add(model)

        // Lighting.
        addLevelLights(level, size)

        // Spawn outside one end of the train.
        const spawn = new THREE.Vector3(
          0,
          EYE_HEIGHT,
          box.max.z + SPAWN_DISTANCE
        )

        console.log('New Train.glb loaded', {
          bounds: {
            min: box.min,
            max: box.max,
          },
          size,
          spawn,
        })

        resolve({
          // No collisions yet.
          colliders: [],

          colliderHelpers: [],

          doors: [],

          ramps: [],

          model,

          spawn,

          modelSize: size,
        })
      },

      undefined,

      (err) => {
        console.error('Failed to load Train.glb:', err)
        reject(err)
      }
    )
  })
}