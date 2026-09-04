import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'

import {
  getDoorColliders,
  loadHouse,
  toggleDoor,
  updateDoors,
} from './levels/house.js'

import { loadTrain } from './levels/train.js'


const DOOR_INTERACTION_RANGE = 3


const LEVELS = {
  house: {
    load: loadHouse,
    yaw: 0,
  },

  train: {
    load: loadTrain,
    yaw: 0,
  },
}


export class Game {
  constructor(container) {
    this.container = container


    // SCENE
    this.scene = new THREE.Scene()

    this.scene.background = new THREE.Color(0x1a1a2e)


    // CAMERA
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    )


    // RENDERER
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    })

    this.renderer.setSize(
      window.innerWidth,
      window.innerHeight
    )

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    )

    this.renderer.shadowMap.enabled = true

    this.renderer.shadowMap.type =
      THREE.PCFSoftShadowMap

    this.container.appendChild(
      this.renderer.domElement
    )


    // INPUT / PLAYER
    this.input = new Input(
      this.renderer.domElement
    )

    this.player = new Player(
      this.camera,
      this.input
    )


    // LEVEL DATA
    this.colliders = []
    this.doors = []
    this.ramps = []

    this.colliderHelpers = []

    this.model = null

    this.currentLevel = null

    this.levelRoot = null

    this.levelLoadId = 0


    // DOOR INTERACTION
    this.raycaster = new THREE.Raycaster()

    this.raycaster.far =
      DOOR_INTERACTION_RANGE


    this.interactionPrompt =
      document.getElementById(
        'interactionPrompt'
      )


    // GAME STATE
    this.loaded = false

    this.started = false

    this.animationRunning = false


    this.clock =
      new THREE.Clock()


    this.fpsSamples = []


    window.addEventListener(
      'resize',
      () => this.onResize()
    )
  }



  // ============================================
  // START GAME
  // ============================================

  start(levelName = 'house') {

    this.started = true


    // Lock mouse immediately from the button click.
    this.input.lock()


    // Only start animation loop once.
    if (!this.animationRunning) {

      this.animationRunning = true

      this.clock.start()

      this.animate()
    }


    // Load selected level.
    return this.loadLevel(levelName)
  }



  // ============================================
  // GAME LOOP
  // ============================================

  animate() {

    if (!this.animationRunning) return


    requestAnimationFrame(
      () => this.animate()
    )


    const dt = Math.min(
      this.clock.getDelta(),
      0.05
    )


    // ----------------------------------------
    // LEVEL HOTKEYS
    // ----------------------------------------

    if (
      this.input.consumePressed('Digit1')
    ) {

      this.loadLevel('house')
    }


    if (
      this.input.consumePressed('Digit2')
    ) {

      this.loadLevel('train')
    }



    // ----------------------------------------
    // LEVEL UPDATE
    // ----------------------------------------

    if (this.loaded) {

      updateDoors(
        this.doors,
        dt
      )


      if (this.model) {

        this.model.updateMatrixWorld(true)
      }


      const door =
        this.getLookedAtDoor()


      if (
        this.input.consumePressed('KeyE') &&
        door
      ) {

        toggleDoor(door)
      }


      // Toggle collider helpers.
      if (
        this.input.consumePressed('KeyH')
      ) {

        this.colliderHelpers.forEach(
          (helper) => {

            helper.visible =
              !helper.visible
          }
        )
      }


      // Debug wall colliders.
      if (
        this.input.consumePressed('KeyJ')
      ) {

        this.logNearbyWallColliders()
      }


      this.updateInteractionPrompt(
        door
      )


      const doorColliders =
        getDoorColliders(
          this.doors
        )


      this.player.update(
        dt,
        [
          ...this.colliders,
          ...this.ramps,
          ...doorColliders,
        ]
      )
    }



    // ----------------------------------------
    // RENDER
    // ----------------------------------------

    this.renderer.render(
      this.scene,
      this.camera
    )


    this.updateHud(dt)
  }



  // ============================================
  // LOAD LEVEL
  // ============================================

  loadLevel(levelName) {

    const level =
      LEVELS[levelName]


    if (!level) {

      console.warn(
        `Unknown level: ${levelName}`
      )

      return Promise.resolve(false)
    }


    // Already loaded.
    if (
      this.currentLevel === levelName &&
      this.loaded
    ) {

      return Promise.resolve(true)
    }


    const loadId =
      ++this.levelLoadId


    // Remove old level.
    this.unloadCurrentLevel()


    this.currentLevel =
      levelName


    this.levelRoot =
      new THREE.Group()


    this.scene.add(
      this.levelRoot
    )


    console.log(
      `Loading level: ${levelName}`
    )


    const levelRoot =
      this.levelRoot


    return level
      .load(levelRoot)

      .then(
        ({
          colliders,
          colliderHelpers,
          doors,
          ramps,
          model,
          spawn,
          modelSize,
        }) => {

          // A newer level was selected
          // while this one was loading.
          if (
            loadId !==
            this.levelLoadId
          ) {

            disposeLevel(
              levelRoot
            )

            return false
          }


          this.colliders =
            colliders || []

          this.colliderHelpers =
            colliderHelpers || []

          this.doors =
            doors || []

          this.ramps =
            ramps || []

          this.model =
            model


          // Put player at level spawn.
          this.player.reset(
            spawn,
            level.yaw
          )


          // Increase camera range for large models.
          const maxDim =
            Math.max(
              modelSize.x,
              modelSize.y,
              modelSize.z
            )


          this.camera.far =
            Math.max(
              maxDim * 3,
              500
            )


          this.camera.updateProjectionMatrix()


          this.loaded = true


          console.log(
            `${levelName} loaded`
          )


          return true
        }
      )

      .catch((err) => {

        if (
          loadId !==
          this.levelLoadId
        ) {

          return false
        }


        console.error(
          'Level load failed:',
          err
        )


        this.unloadCurrentLevel()


        this.currentLevel = null


        return false
      })
  }



  // ============================================
  // REMOVE CURRENT LEVEL
  // ============================================

  unloadCurrentLevel() {

    if (this.levelRoot) {

      disposeLevel(
        this.levelRoot
      )
    }


    this.levelRoot = null


    this.colliders = []

    this.colliderHelpers = []

    this.doors = []

    this.ramps = []

    this.model = null

    this.loaded = false


    this.input.clear()


    if (this.interactionPrompt) {

      this.interactionPrompt
        .classList
        .add('hidden')
    }
  }



  // ============================================
  // HUD
  // ============================================

  updateHud(dt) {

    if (dt <= 0) return


    this.fpsSamples.push(
      1 / dt
    )


    if (
      this.fpsSamples.length > 20
    ) {

      this.fpsSamples.shift()
    }


    const avg =
      this.fpsSamples.reduce(
        (a, b) => a + b,
        0
      ) /
      this.fpsSamples.length


    const pos =
      this.player.position


    const hudPos =
      document.getElementById(
        'hudPos'
      )


    if (hudPos) {

      hudPos.textContent =
        `${pos.x.toFixed(1)}, ` +
        `${pos.y.toFixed(1)}, ` +
        `${pos.z.toFixed(1)}`
    }


    const hudFps =
      document.getElementById(
        'hudFps'
      )


    if (hudFps) {

      hudFps.textContent =
        avg.toFixed(0)
    }


    const hudMode =
      document.getElementById(
        'hudMode'
      )


    if (hudMode) {

      hudMode.textContent =
        this.player.flying
          ? 'FLY'
          : 'WALK'
    }
  }



  // ============================================
  // DOOR INTERACTION
  // ============================================

  getLookedAtDoor() {

    if (
      !this.input.isLocked ||
      !this.model
    ) {

      return null
    }


    this.raycaster.setFromCamera(
      new THREE.Vector2(0, 0),
      this.camera
    )


    const hits =
      this.raycaster.intersectObject(
        this.model,
        true
      )


    // Check every object hit by the ray,
    // not only the first one.
    for (const hit of hits) {

      let object =
        hit.object


      while (object) {

        const door =
          this.doors.find(
            (door) =>
              door.object === object
          )


        if (door) {

          return door

        }


        object =
          object.parent
      }

    }


    return null
  }



  updateInteractionPrompt(door) {

    if (!this.interactionPrompt) {

      return
    }


    if (!door) {

      this.interactionPrompt
        .classList
        .add('hidden')

      return
    }


    this.interactionPrompt.textContent =
      door.isOpen
        ? 'Press E to close'
        : 'Press E to open'


    this.interactionPrompt
      .classList
      .remove('hidden')
  }



  // ============================================
  // DEBUG COLLIDERS
  // ============================================

  logNearbyWallColliders() {

    const position =
      this.player.position


    const nearby =
      this.colliders

        .filter(
          (collider) =>
            collider.type === 'wall'
        )

        .filter(
          (collider) => {

            const nearestX =
              THREE.MathUtils.clamp(
                position.x,
                collider.minX,
                collider.maxX
              )


            const nearestZ =
              THREE.MathUtils.clamp(
                position.z,
                collider.minZ,
                collider.maxZ
              )


            return (
              Math.hypot(
                position.x - nearestX,
                position.z - nearestZ
              ) <= 1.5
            )
          }
        )


    console.log(
      'Nearby wall colliders:',
      nearby
    )
  }



  // ============================================
  // WINDOW RESIZE
  // ============================================

  onResize() {

    this.camera.aspect =
      window.innerWidth /
      window.innerHeight


    this.camera.updateProjectionMatrix()


    this.renderer.setSize(
      window.innerWidth,
      window.innerHeight
    )
  }
}



// ============================================
// CLEAN UP LEVEL
// ============================================

function disposeLevel(levelRoot) {

  if (levelRoot.parent) {

    levelRoot.parent.remove(
      levelRoot
    )
  }


  const geometries =
    new Set()


  const materials =
    new Set()


  levelRoot.traverse(
    (object) => {

      if (object.geometry) {

        geometries.add(
          object.geometry
        )
      }


      if (
        Array.isArray(
          object.material
        )
      ) {

        object.material.forEach(
          (material) =>
            materials.add(
              material
            )
        )
      }

      else if (
        object.material
      ) {

        materials.add(
          object.material
        )
      }
    }
  )


  geometries.forEach(
    (geometry) => {

      geometry.dispose()
    }
  )


  materials.forEach(
    (material) => {

      Object.values(
        material
      ).forEach(
        (value) => {

          if (
            value?.isTexture
          ) {

            value.dispose()
          }
        }
      )


      material.dispose()
    }
  )


  levelRoot.clear()
}