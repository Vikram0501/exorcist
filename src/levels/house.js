import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addLevelLights } from './lighting.js'

// The new house is very large in its original coordinate space.
// Scale it down so it works properly with the existing player controller.
const HOUSE_SCALE = 0.1
const EYE_HEIGHT = 1.7
const SPAWN_DISTANCE = 5

// Keep these exports so game.js can stay unchanged.
// Door and collision support can be added later.
export function updateDoors() {}

export function toggleDoor() {}

export function getDoorColliders() {
  return []
}

export function loadHouse(level) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(
      '/models/House.glb',

      (gltf) => {
        const model = gltf.scene

        // Scale the new house down.
        model.scale.setScalar(HOUSE_SCALE)

        // Enable shadows on all meshes.
        model.traverse((child) => {
          if (!child.isMesh) return

          child.castShadow = true
          child.receiveShadow = true
        })

        model.updateMatrixWorld(true)

        // Get the model bounds after scaling.
        const initialBox = new THREE.Box3().setFromObject(model)
        const initialCenter = initialBox.getCenter(new THREE.Vector3())

        // Centre the house around world position 0,0,0.
        model.position.x -= initialCenter.x
        model.position.z -= initialCenter.z

        // Put the lowest part of the house on ground level.
        model.position.y -= initialBox.min.y

        model.updateMatrixWorld(true)

        // Get final bounds after positioning.
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())

        // Add house to the level.
        level.add(model)

        // Add lighting based on the size of the house.
        addLevelLights(level, size)

        // Spawn the player just outside one end of the house.
        const spawn = new THREE.Vector3(
          0,
          EYE_HEIGHT,
          box.max.z + SPAWN_DISTANCE
        )

        console.log('New House.glb loaded', {
          bounds: {
            min: box.min,
            max: box.max,
          },
          size,
          spawn,
        })

        resolve({
          // No collision system for now.
          colliders: [],

          // No collider debug boxes.
          colliderHelpers: [],

          // No interactive doors for now.
          doors: [],

          // No stair/ramp collision for now.
          ramps: [],

          model,

          spawn,

          modelSize: size,
        })
      },

      undefined,

      (err) => {
        console.error('Failed to load House.glb:', err)
        reject(err)
      }
    )
  })
}