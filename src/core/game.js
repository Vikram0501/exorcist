import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'
import { HauntedHouseAudio } from '../audio/hauntedHouseAudio.js'

import {
  createHighwayLevel,
  createGhostNameUI,
  removeGhostNameUI,
} from "../levels/highway/index.js"

import {
  createCollectibles,
  updateCollectibles,
  disposeCollectibles,
} from "../levels/highway/collectibles.js"

import {
  disposeObstacles,
} from "../levels/highway/obstacles.js"

import {
  createRoadSigns,
  updateRoadSigns,
  disposeRoadSigns,
} from "../levels/highway/signs.js"

import { HighwayCarController }
  from '../levels/highway/car.js'

import { HighwayRaceController }
  from '../levels/highway/race.js'

import { HighwayEnvironmentManager }
  from '../levels/highway/environment.js'

import { GLTFLoader }
  from 'three/addons/loaders/GLTFLoader.js'

import {
  getDoorColliders,
  loadHouse,
  toggleDoor,
  updateDoors,
} from '../levels/house/index.js'

import { loadTrain } from '../levels/train/index.js'


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

  highway: {
    load: createHighwayLevel,
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

    // Keep camera-attached gameplay visuals (flashlight and item inspection
    // meshes) inside the scene graph so the renderer traverses them.
    this.scene.add(this.camera)


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

    this.houseAudio = new HauntedHouseAudio()


    // LEVEL DATA
    this.colliders = []
    this.doors = []
    this.ramps = []

    this.colliderHelpers = []
    this.lightHelpers = []

    this.model = null

    this.currentLevel = null

    this.spawnPoint = null

    this.spawnYaw = 0

    this.levelRoot = null

    this.levelLoadId = 0

    this.highwayController = null

    this.highwayRace = null

    this.highwayEnvironment = null

    this.treeTemplates = null

    this.ghostNameUI = null

    this.collectibles = []

    this.roadSigns = []

    this.roadSignTime = 0

    this.obstacles = null

    this.trainTerrain = null


    // ============================================
    // LEVEL 3 STATE MACHINE
    // ============================================

    this.levelState = 'RACING'

    this.levelTimer = 0

    this.pendingGhostName = null


    // ============================================
    // NAME PUZZLE ELEMENTS
    // ============================================

    this.namePuzzleEl = null

    this.nameInput = null

    this.nameErrorEl = null

    this.onNameEntryKey = null


    // ============================================
    // GAME OVER ELEMENTS
    // ============================================

    this.gameOverEl = null


    // ============================================
    // EXORCISM ELEMENTS
    // ============================================

    this.exorcismEl = null

    this.exorcismParticles = []

    this.exorcismBgOriginal = null

    this.exorcismAmbientOriginal = null

    this.exorcismMoonOriginal = null

    this.exorcismLightRef = null

    this.ambientLightRef = null


    // DOOR INTERACTION
    this.raycaster = new THREE.Raycaster()

    this.raycaster.far =
      DOOR_INTERACTION_RANGE


    this.interactionPrompt =
      document.getElementById(
        'interactionPrompt'
      )

    this.investigationItems = []

    this.inspectedEvidence = new Set()

    this.newspaperRead = false

    this.valeFrameInspected = false

    this.kitchenPhoneAnswered = false

    this.newspaperOpen = false

    this.newspaperInspectionObject = null

    this.newspaperDrag = null

    this.newspaperPreview =
      document.getElementById(
        'newspaperTexturePreview'
      )

    this.evidenceNewspaperThumbnail =
      document.getElementById(
        'evidenceNewspaperThumbnail'
      )

    this.newspaperPreviewTransform = {
      x: 10,
      y: -14,
      z: -4,
      scale: 1,
    }

    this.evidenceBookOpen = false

    this.newspaperReader =
      document.getElementById(
        'newspaperReader'
      )

    const closeNewspaperButton =
      document.getElementById(
        'closeNewspaperInspectBtn'
      )

    const closeEvidenceButton =
      document.getElementById(
        'closeEvidenceNotepadBtn'
      )

    const evidenceButton =
      document.getElementById(
        'evidenceBtn'
      )

    closeNewspaperButton?.addEventListener(
      'click',
      () => this.closeNewspaperReader()
    )

    closeEvidenceButton?.addEventListener(
      'click',
      () => this.closeEvidenceBook()
    )

    evidenceButton?.addEventListener(
      'click',
      () => this.openEvidenceBook()
    )

    this.newspaperReader?.addEventListener(
      'pointerdown',
      (event) => this.startNewspaperDrag(event)
    )

    this.newspaperReader?.addEventListener(
      'pointermove',
      (event) => this.dragNewspaper(event)
    )

    this.newspaperReader?.addEventListener(
      'pointerup',
      () => this.stopNewspaperDrag()
    )

    this.newspaperReader?.addEventListener(
      'pointercancel',
      () => this.stopNewspaperDrag()
    )

    this.newspaperReader?.addEventListener(
      'wheel',
      (event) => this.zoomNewspaper(event),
      { passive: false },
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

    this.loadTreeAssets()
  }



  // ============================================
  // START GAME
  // ============================================

  start(levelName = 'house') {

    this.started = true

    // A click is required by browsers before Web Audio may play.
    this.houseAudio.unlock()


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


  respawn() {

    if (!this.loaded || this.currentLevel !== 'house' || !this.spawnPoint) {

      return false
    }

    this.player.reset(this.spawnPoint, this.spawnYaw)

    return true
  }



  // ============================================
  // TREE ASSET LOADING
  // ============================================

  async loadTreeAssets() {

    try {

      const loader = new GLTFLoader()

      const gltf =
        await loader.loadAsync(
          '/models/deadtrees.glb'
        )

      this.treeTemplates =
        this.prepareTreeTemplates(
          gltf.scene
        )

      console.log(
        'Loaded',
        this.treeTemplates.length,
        'tree variations from GLB'
      )

    } catch (err) {

      console.warn(
        'Failed to load deadtrees.glb, using fallback:',
        err
      )

      this.treeTemplates = []

    }
  }


  prepareTreeTemplates(root) {

    const templates = []

    root.traverse((child) => {

      if (!child.isMesh) return

      const geo =
        child.geometry.clone()

      const m = new THREE.Matrix4()
      m.compose(
        new THREE.Vector3(0, 0, 0),
        child.quaternion,
        child.scale
      )
      geo.applyMatrix4(m)

      geo.computeBoundingBox()
      const box = geo.boundingBox

      const cx =
        (box.max.x + box.min.x) / 2
      const cz =
        (box.max.z + box.min.z) / 2
      geo.translate(-cx, 0, -cz)
      geo.translate(0, -box.min.y, 0)

      const mat =
        child.material.clone()
      mat.roughness = 0.9
      mat.metalness = 0.1

      const mesh =
        new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true

      const height =
        box.max.y - box.min.y

      templates.push({
        mesh,
        height,
      })
    })

    return templates
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

    if (
      this.input.consumePressed('Digit3')
    ) {

      this.loadLevel('highway')
    }

    if (
      this.currentLevel === 'house' &&
      this.input.consumePressed('KeyR')
    ) {

      this.respawn()
    }

    if (
      this.currentLevel === 'house' &&
      this.input.consumePressed('KeyI')
    ) {

      this.openEvidenceBook()
    }



    // ----------------------------------------
    // LEVEL UPDATE
    // ----------------------------------------

if (this.loaded) {

  // ======================================
  // LEVEL 3 - HIGHWAY
  // ======================================

    if (
      this.currentLevel === 'highway'
    ) {

      // Update road signs (always decorative)

      if (
        this.roadSigns.length > 0
      ) {

        this.roadSignTime += dt

        updateRoadSigns(
          this.roadSigns,
          this.roadSignTime
        )

      }


      // State-dependent updates

      if (
        this.levelState === 'RACING'
      ) {

        if (this.highwayController) {

          this.highwayController.update(dt)

        }

        if (this.highwayRace) {

          this.highwayRace.update(dt)

        }

        if (
          this.collectibles.length > 0
        ) {

          const playerCar =
            this.highwayController
              ? this.highwayController.car
              : null

          if (playerCar) {

            updateCollectibles(
              this.collectibles,
              playerCar,
              this.ghostNameUI,
              dt
            )

          }

        }

      } else {

        // FINISH_CHECK, NAME_PUZZLE,
        // EXORCISM, GAME_OVER, COMPLETE

        this.updateLevelState(dt)

      }


      // ============================================
      // ENVIRONMENT UPDATE
      // ============================================

      if (
        this.highwayEnvironment &&
        this.highwayController
      ) {

        const playerPos =
          this.highwayController.car.position

        this.highwayEnvironment.update(
          dt,
          playerPos
        )


        // ============================================
        // GHOST VISUAL ENHANCEMENT
        // ============================================

        if (
          this.highwayRace &&
          this.highwayRace.ghostCar
        ) {

          const gc =
            this.highwayRace.ghostCar

          const time =
            performance.now() * 0.001

          const dist =
            gc.position.distanceTo(
              playerPos
            )

          const fogFade =
            dist < 40
              ? 1
              : Math.max(
                  0,
                  1 - (dist - 40) / 60
                )

          const flicker =
            0.5 +
            0.5 *
              Math.abs(
                Math.sin(
                  time * 3.7
                )
              ) *
              0.3

          const disturbance =
            this.highwayEnvironment
              .getDisturbance()

          let disturbanceMod = 1

          if (
            disturbance ===
              'ghostFlicker'
          ) {
            disturbanceMod =
              0.3 +
              0.7 *
                Math.abs(
                  Math.sin(
                    time * 12
                  )
                )
          }

          gc.traverse((child) => {
            if (
              child.material &&
              child.material.opacity !==
                undefined
            ) {
              child.material.opacity =
                0.5 *
                fogFade *
                flicker *
                disturbanceMod
            }
          })

        }

      }

    }


  // ======================================
  // LEVEL 1 + LEVEL 2
  // ======================================

  else {

    updateDoors(
      this.doors,
      dt
    )


    if (this.model) {

      this.model.updateMatrixWorld(true)

    }


    if (
      this.currentLevel === 'train' &&
      this.trainTerrain
    ) {

      this.trainTerrain.update(dt)

    }


    const door =
      this.getLookedAtDoor()

    const investigationItem =
      this.currentLevel === 'house'
        ? this.getLookedAtInvestigationItem()
        : null


    if (
      this.input.consumePressed('KeyE')
    ) {

      if (
        investigationItem &&
        investigationItem.id === 'newspaper' &&
        !this.newspaperRead
      ) {

        this.openNewspaperReader(investigationItem)
      }

      else if (
        investigationItem &&
        investigationItem.id === 'vale-frame' &&
        this.newspaperRead &&
        !this.valeFrameInspected
      ) {

        this.inspectValeFrame(investigationItem)
      }

      else if (
        investigationItem &&
        investigationItem.id === 'fourth-place-setting' &&
        this.newspaperRead &&
        !this.inspectedEvidence.has(
          investigationItem.id,
        )
      ) {

        this.openNewspaperReader(investigationItem)
      }

      else if (
        investigationItem &&
        investigationItem.id === 'kitchen-phone' &&
        this.valeFrameInspected &&
        !this.kitchenPhoneAnswered
      ) {

        this.answerKitchenPhone()
      }

      else if (door) {

        toggleDoor(door, this.player.position)

        if (this.currentLevel === 'house') {
          this.houseAudio.playDoor(door.isOpen)
        }
      }

    }


    // Toggle collider helpers
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


    // Toggle light helpers
    if (
      this.input.consumePressed('KeyL')
    ) {

      this.lightHelpers.forEach(
        (helper) => {

          helper.visible =
            !helper.visible

        }
      )

    }


    // Debug wall colliders
    if (
      this.input.consumePressed('KeyJ')
    ) {

      this.logNearbyWallColliders()

    }


    this.updateInteractionPrompt(
      door,
      investigationItem
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

    if (this.currentLevel === 'house') {
      this.houseAudio.update(this.player)
    }

  }

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
            lightHelpers,
            doors,
            ramps,
            model,
            spawn,
            spawnYaw,
            modelSize,
            playerCar,
            ghostCar,
            finishZ,
            ghostName,
            trainTerrain,
            investigationItems,
            moonLight,
            roadPath,
            arcLengths,
            totalRoadLength,
            obstacles,
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

          this.lightHelpers =
            lightHelpers || []

          this.doors =
            doors || []

          this.investigationItems =
            investigationItems || []

          this.inspectedEvidence = new Set()

          this.newspaperRead = false

          this.valeFrameInspected = false

          this.kitchenPhoneAnswered = false

          this.ramps =
            ramps || []

          this.model =
            model

          this.trainTerrain =
            trainTerrain || null


          // ======================================
          // HIGHWAY
          // ======================================

          if (
            levelName === 'highway'
          ) {

            // Store level data for highway controllers
          this.levelData = {
            roadPath,
            arcLengths,
            totalRoadLength,
          }

          this.obstacles = obstacles


          this.ghostNameUI =
              createGhostNameUI(
                ghostName
              )

            this.highwayController =
              new HighwayCarController(
                playerCar,
                this.camera,
                this.levelData.roadPath,
                this.levelData.arcLengths
              )

            this.highwayController.obstacles =
              obstacles

            this.highwayRace =
              new HighwayRaceController(
                this.highwayController,
                ghostCar,
                finishZ,
                ghostName,
                this.ghostNameUI,
                this.scene,
                this.levelData.roadPath,
                this.levelData.arcLengths,
                this.levelData.totalRoadLength
              )

            this.highwayRace.obstacles =
              obstacles

            this.highwayRace.onFinish =
              (winner, name) => {

                this.levelState =
                  'FINISH_CHECK'

                this.levelTimer = 0

                this.pendingGhostName =
                  name

                // Show race result

                if (
                  this.highwayRace
                    .countdownElement
                ) {

                  this.highwayRace
                    .countdownElement
                    .style.display =
                      'block'

                  this.highwayRace
                    .countdownElement
                    .style.fontSize =
                      '60px'

                  if (
                    winner === 'player'
                  ) {

                    this.highwayRace
                      .countdownElement
                      .textContent =
                        'YOU WON THE RACE'

                  } else {

                    this.highwayRace
                      .countdownElement
                      .textContent =
                        name +
                        ' WON'

                  }

                }

              }

            this.collectibles =
              createCollectibles(
                ghostName,
                model,
                this.ghostNameUI,
                this.levelData.roadPath,
                this.levelData.arcLengths,
                this.levelData.totalRoadLength
              )

            this.roadSigns =
              createRoadSigns(
                ghostName,
                model
              )

            this.roadSignTime = 0


            // ============================================
            // ENVIRONMENT
            // ============================================

            this.highwayEnvironment =
              new HighwayEnvironmentManager({
                scene: this.scene,
                highwayGroup: model,
                playerCar: playerCar,
                moonLight: moonLight,
                treeTemplates:
                  this.treeTemplates,
                roadPath:
                  this.levelData.roadPath,
                arcLengths:
                  this.levelData.arcLengths,
              })

          }


          // ======================================
          // HOUSE + TRAIN
          // ======================================

          else {

            this.spawnPoint = spawn.clone()

            this.spawnYaw = spawnYaw ?? level.yaw

            this.player.reset(
              this.spawnPoint,
              this.spawnYaw
            )

          }


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

          window.dispatchEvent(
            new CustomEvent('levelloaded', { detail: { levelName } })
          )

          this.houseAudio.setHouseActive(
            levelName === 'house',
            levelName === 'house' ? model : null,
          )


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

    this.houseAudio.setHouseActive(false)

    // Clean up finale state

    this.hideNamePuzzle()

    this.hideGameOver()

    this.hideExorcismEffects()

    this.levelState = 'RACING'

    this.levelTimer = 0

    this.pendingGhostName = null

    this.investigationItems = []

    this.inspectedEvidence = new Set()

    this.newspaperRead = false

    this.valeFrameInspected = false

    this.kitchenPhoneAnswered = false

    this.hideNewspaperReader()

    this.closeEvidenceBook(true)

    this.spawnPoint = null

    this.spawnYaw = 0


    if (
      this.highwayRace
    ) {

      this.highwayRace.dispose()

      this.highwayRace = null

    }

    if (this.highwayController) {

      this.highwayController.dispose()

      this.highwayController = null

    }

    if (this.highwayEnvironment) {

      this.highwayEnvironment.dispose()

      this.highwayEnvironment = null

    }

    if (this.ghostNameUI) {

      removeGhostNameUI(
        this.ghostNameUI
      )

      this.ghostNameUI = null

    }

    if (this.collectibles.length > 0) {

      disposeCollectibles(
        this.collectibles
      )

    }

    if (this.roadSigns.length > 0) {

      disposeRoadSigns(
        this.roadSigns
      )

    }

    if (this.obstacles) {

      disposeObstacles(
        this.obstacles
      )

      this.obstacles = null

    }

    if (this.trainTerrain) {

      this.trainTerrain.dispose()

      this.trainTerrain = null

    }

    if (this.levelRoot) {

      disposeLevel(
        this.levelRoot
      )
    }


    this.levelRoot = null

    this.scene.background =
      new THREE.Color(0x1a1a2e)

    this.colliders = []

    this.colliderHelpers = []

    this.lightHelpers = []

    this.doors = []

    this.ramps = []

    this.model = null

    this.levelData = null

    this.trainTerrain = null

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
        this.currentLevel
          ? this.player.flying ? 'UNNATURAL ELEVATION' : 'ON FOOT'
          : 'AWAITING ENTRY'
    }

    const hudLevel = document.getElementById('hudLevel')

    if (hudLevel) {

      const names = {
        house: 'VALE MANOR',
        train: 'NIGHT TRAIN',
        highway: 'OLD HIGHWAY',
      }

      hudLevel.textContent = names[this.currentLevel] || 'NO LOCATION'
    }

    const hudObjective =
      document.getElementById('hudObjective')

    if (hudObjective) {

      const isHouse = this.currentLevel === 'house'

      hudObjective.style.display =
        isHouse ? '' : 'none'

      if (isHouse) {

        hudObjective.textContent =
          this.newspaperRead
            ? 'ENTRY 01 — NEWSPAPER CLIPPING LOGGED'
            : 'FIND THE NEWSPAPER ON THE PORCH'

        if (this.newspaperRead) {
          if (!this.valeFrameInspected) {
            hudObjective.textContent =
              'ENTER THE HOUSE AND INSPECT THE FAMILY FRAME'
          } else if (!this.kitchenPhoneAnswered) {
            hudObjective.textContent =
              'ANSWER THE RINGING KITCHEN TELEPHONE'
          } else {
            hudObjective.textContent =
              'FOLLOW THE FOOTSTEPS UPSTAIRS'
          }
        }
      }
    }

    const evidenceButton =
      document.getElementById('evidenceBtn')

    if (evidenceButton) {

      evidenceButton.classList.toggle(
        'hidden',
        this.currentLevel !== 'house'
      )
    }
  }



  // ============================================
  // DOOR INTERACTION
  // ============================================

  getLookedAtInvestigationItem() {

    if (!this.input.isLocked || !this.model) {

      return null
    }

    this.raycaster.setFromCamera(
      new THREE.Vector2(0, 0),
      this.camera
    )

    const hits = this.raycaster.intersectObject(
      this.model,
      true
    )

    for (const hit of hits) {

      let object = hit.object

      while (object) {

        const item = this.investigationItems.find(
          (candidate) => candidate.object === object
        )

        if (item) {

          return item
        }

        object = object.parent
      }
    }

    return null
  }


  openNewspaperReader(investigationItem) {

    if (!this.newspaperReader || this.newspaperOpen) {

      return
    }

    this.newspaperOpen = true

    this.inspectedEvidence.add(
      investigationItem.id,
    )

    if (investigationItem.id === 'newspaper') {
      this.newspaperRead = true
    }

    this.setInspectionPanelContent(
      investigationItem,
    )

    this.newspaperPreviewTransform = {
      x: 10,
      y: -14,
      z: -4,
      scale: 1,
    }

    const inspectionGroup = new THREE.Group()
    inspectionGroup.name = 'newspaper-inspection-view'

    const sourceMesh =
      investigationItem.object.isMesh
        ? investigationItem.object
        : investigationItem.object.getObjectByProperty(
            'isMesh',
            true,
          )

    if (!sourceMesh) {

      this.hideNewspaperReader()
      return
    }

    const inspectionObject =
      new THREE.Mesh(
        sourceMesh.geometry,
        Array.isArray(sourceMesh.material)
          ? sourceMesh.material.map((material) => createInspectionMaterial(material))
          : createInspectionMaterial(sourceMesh.material),
      )

    if (investigationItem.removeOnInspect) {
      investigationItem.object.visible = false
    }

    inspectionObject.position.set(0, 0, 0)
    // The porch plane is horizontal in the GLB (its normal points upward),
    // so turn the picked-up copy toward the camera for inspection.
    inspectionObject.rotation.set(Math.PI / 2, 0, 0)
    inspectionObject.scale.set(1, 1, 1)
    inspectionObject.updateMatrixWorld(true)

    inspectionObject.visible = true
    inspectionObject.frustumCulled = false

    const inspectionMaterials =
      Array.isArray(inspectionObject.material)
        ? inspectionObject.material
        : [inspectionObject.material]

    for (const material of inspectionMaterials) {

      if (!material?.map) continue

      material.map.anisotropy =
        this.renderer.capabilities.getMaxAnisotropy()

      material.map.magFilter = THREE.LinearFilter
      material.map.minFilter = THREE.LinearMipmapLinearFilter
      material.map.needsUpdate = true
    }

    const sourceMaterial =
      Array.isArray(sourceMesh.material)
        ? sourceMesh.material[0]
        : sourceMesh.material

    if (this.newspaperPreview && sourceMaterial?.map?.image) {

      const image = sourceMaterial.map.image
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height

      const context = canvas.getContext('2d')

      if (context) {

        context.drawImage(image, 0, 0)
        const newspaperImageUrl = canvas.toDataURL('image/png')

        this.newspaperPreview.src = newspaperImageUrl
        this.newspaperPreview.classList.remove('hidden')

        if (investigationItem.id === 'newspaper') {
          this.evidenceNewspaperThumbnail.src =
            newspaperImageUrl
        }

        this.updateNewspaperPreviewTransform()
      }
    }

    const bounds = new THREE.Box3().setFromObject(
      inspectionObject,
    )
    const centre = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const largestDimension = Math.max(
      size.x,
      size.y,
      size.z,
      0.001,
    )

    inspectionObject.position.sub(centre)
    inspectionObject.scale.setScalar(1.35 / largestDimension)
    inspectionGroup.add(inspectionObject)
    inspectionGroup.position.set(0, -0.1, -2.15)
    inspectionGroup.rotation.set(0.12, -0.16, -0.08)
    inspectionGroup.scale.setScalar(1)
    this.camera.add(inspectionGroup)
    this.newspaperInspectionObject = inspectionGroup

    this.newspaperReader.classList.remove('hidden')

    this.newspaperReader.classList.add('inspect-mode')

    this.input.release()
  }

  setInspectionPanelContent(investigationItem) {

    const foundAt = document.getElementById(
      'inspectionFoundAt',
    )
    const title = document.getElementById(
      'newspaperInspectTitle',
    )
    const storyNote = document.getElementById(
      'inspectionStoryNote',
    )
    const riteNote = document.getElementById(
      'inspectionRiteNote',
    )

    if (foundAt) {
      foundAt.textContent =
        'FOUND: ' +
        (investigationItem.foundAt || 'Vale Manor')
    }

    if (title) {
      title.textContent =
        investigationItem.title || 'Evidence'
    }

    if (storyNote) {
      storyNote.textContent =
        investigationItem.storyNote ||
        'Inspect the evidence carefully.'
    }

    if (riteNote) {
      riteNote.textContent =
        investigationItem.riteNote
          ? 'EXORCISM NOTE — ' +
            investigationItem.riteNote
          : ''
    }

    if (this.newspaperPreview) {
      this.newspaperPreview.alt =
        investigationItem.title || 'Inspectable evidence'
    }
  }


  inspectValeFrame(investigationItem) {

    this.valeFrameInspected = true

    // The phone's changed prompt is the immediate, in-world instruction:
    // the player is not sent to a detached quest marker.
    this.houseAudio.playRandomGhostSound()

    this.openNewspaperReader(investigationItem)
  }


  answerKitchenPhone() {

    this.kitchenPhoneAnswered = true

    // A short ghost vocal is used as Evelyn's distorted message until a
    // dedicated telephone recording is supplied.
    this.houseAudio.playRandomGhostSound()
  }


  closeNewspaperReader() {

    if (!this.newspaperOpen) {

      return
    }

    this.hideNewspaperReader()

    this.input.lock()
  }


  startNewspaperDrag(event) {

    if (!this.newspaperOpen || event.target.closest('button')) {

      return
    }

    this.newspaperDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }

    this.newspaperReader?.setPointerCapture(event.pointerId)
  }


  dragNewspaper(event) {

    if (
      !this.newspaperDrag ||
      !this.newspaperInspectionObject ||
      event.pointerId !== this.newspaperDrag.pointerId
    ) {

      return
    }

    const dx = event.clientX - this.newspaperDrag.x
    const dy = event.clientY - this.newspaperDrag.y

    this.newspaperDrag.x = event.clientX
    this.newspaperDrag.y = event.clientY

    this.newspaperInspectionObject.rotation.y += dx * 0.01
    this.newspaperInspectionObject.rotation.x += dy * 0.01

    this.newspaperPreviewTransform.y += dx * 0.5
    this.newspaperPreviewTransform.x += dy * 0.5
    this.updateNewspaperPreviewTransform()
  }


  stopNewspaperDrag() {

    this.newspaperDrag = null
  }


  zoomNewspaper(event) {

    if (!this.newspaperOpen || !this.newspaperInspectionObject) {

      return
    }

    event.preventDefault()

    const zoom = event.deltaY > 0 ? 0.9 : 1.1
    const nextScale = THREE.MathUtils.clamp(
      this.newspaperInspectionObject.scale.x * zoom,
      0.55,
      3.2,
    )

    this.newspaperInspectionObject.scale.setScalar(nextScale)

    this.newspaperPreviewTransform.scale = THREE.MathUtils.clamp(
      this.newspaperPreviewTransform.scale * zoom,
      0.55,
      3.2,
    )
    this.updateNewspaperPreviewTransform()
  }


  updateNewspaperPreviewTransform() {

    if (!this.newspaperPreview) return

    const transform = this.newspaperPreviewTransform

    this.newspaperPreview.style.transform =
      `translate(-50%, -50%) perspective(900px) ` +
      `rotateX(${transform.x}deg) ` +
      `rotateY(${transform.y}deg) ` +
      `rotateZ(${transform.z}deg) ` +
      `scale(${transform.scale})`
  }


  openEvidenceBook() {

    if (this.currentLevel !== 'house' || this.evidenceBookOpen) {

      return
    }

    const evidenceBook =
      document.getElementById('evidenceBook')

    if (!evidenceBook) {

      return
    }

    this.evidenceBookOpen = true

    evidenceBook.classList.toggle(
      'has-evidence',
      this.inspectedEvidence.size > 0,
    )

    evidenceBook.classList.toggle(
      'has-newspaper-evidence',
      this.inspectedEvidence.has('newspaper'),
    )

    evidenceBook.classList.toggle(
      'has-frame-evidence',
      this.inspectedEvidence.has('vale-frame'),
    )

    evidenceBook.classList.toggle(
      'has-tableware-evidence',
      this.inspectedEvidence.has(
        'fourth-place-setting',
      ),
    )

    evidenceBook.classList.remove('hidden')

    this.input.release()
  }


  closeEvidenceBook(fromLevelUnload = false) {

    const evidenceBook =
      document.getElementById('evidenceBook')

    this.evidenceBookOpen = false

    evidenceBook?.classList.add('hidden')

    if (!fromLevelUnload && this.loaded) {

      this.input.lock()
    }
  }


  hideNewspaperReader() {

    this.newspaperOpen = false

    this.newspaperReader?.classList.add('hidden')
    this.newspaperPreview?.classList.add('hidden')
    this.newspaperPreview?.removeAttribute('src')

    if (this.newspaperInspectionObject) {

      this.camera.remove(this.newspaperInspectionObject)
      this.newspaperInspectionObject = null
    }
  }

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

  updateInteractionPrompt(door, investigationItem = null) {

    if (!this.interactionPrompt) {

      return

    }


    if (investigationItem) {

      this.interactionPrompt.textContent =
        this.getInvestigationPrompt(
          investigationItem,
        )

      this.interactionPrompt
        .classList
        .remove('hidden')

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

  getInvestigationPrompt(investigationItem) {

    switch (investigationItem.id) {
      case 'newspaper':
        return this.newspaperRead
          ? 'Newspaper evidence logged'
          : investigationItem.prompt

      case 'vale-frame':
        if (!this.newspaperRead) {
          return 'Log the porch newspaper first'
        }

        return this.valeFrameInspected
          ? 'The Vale family: Daniel, Margaret and Evelyn'
          : investigationItem.prompt

      case 'kitchen-phone':
        if (!this.valeFrameInspected) {
          return 'The telephone is silent'
        }

        return this.kitchenPhoneAnswered
          ? 'A child whispered: “Upstairs.”'
          : 'Press E to answer the ringing telephone'

      case 'fourth-place-setting':
        if (!this.newspaperRead) {
          return 'Log the porch newspaper first'
        }

        return this.inspectedEvidence.has(
          investigationItem.id,
        )
          ? 'Fourth place-setting evidence logged'
          : investigationItem.prompt

      default:
        return investigationItem.prompt
    }
  }



  // ============================================
  // LEVEL 3 — NAME PUZZLE
  // ============================================

  showNamePuzzle(ghostName) {

    this.pendingGhostName = ghostName

    this.levelState = 'NAME_PUZZLE'

    this.levelTimer = 0


    const el =
      document.createElement('div')

    el.style.position = 'fixed'

    el.style.inset = '0'

    el.style.zIndex = '150'

    el.style.display = 'flex'

    el.style.flexDirection = 'column'

    el.style.alignItems = 'center'

    el.style.justifyContent = 'center'

    el.style.background =
      'rgba(5, 5, 15, 0.92)'

    el.style.fontFamily =
      'monospace'


    const title =
      document.createElement('div')

    title.textContent =
      'YOU WON THE RACE.'

    title.style.color = '#22ff22'

    title.style.fontSize = '32px'

    title.style.fontWeight = 'bold'

    title.style.marginBottom = '8px'

    title.style.textShadow =
      '0 0 16px #006600'

    el.appendChild(title)


    const subtitle =
      document.createElement('div')

    subtitle.textContent =
      'NOW END IT.'

    subtitle.style.color = '#66ffff'

    subtitle.style.fontSize = '20px'

    subtitle.style.fontWeight = 'bold'

    subtitle.style.marginBottom = '28px'

    subtitle.style.textShadow =
      '0 0 12px #006666'

    el.appendChild(subtitle)


    const instr =
      document.createElement('div')

    instr.textContent =
      'ENTER THE DRIVER\'S FULL NAME:'

    instr.style.color = '#999999'

    instr.style.fontSize = '15px'

    instr.style.marginBottom = '16px'

    instr.style.letterSpacing = '1px'

    el.appendChild(instr)


    // Collected letter slots

    if (
      this.ghostNameUI &&
      this.ghostNameUI._slots
    ) {

      const slotsRow =
        document.createElement('div')

      slotsRow.style.fontSize = '26px'

      slotsRow.style.letterSpacing = '3px'

      slotsRow.style.marginBottom = '24px'

      slotsRow.style.textShadow =
        '0 0 10px #006666'

      const slots =
        this.ghostNameUI._slots

      const spaceIdx =
        ghostName.indexOf(' ')

      for (
        let i = 0;
        i < slots.length;
        i++
      ) {

        const span =
          document.createElement('span')

        span.style.display =
          'inline-block'

        span.style.width = '1ch'

        span.style.textAlign = 'center'

        if (slots[i].revealed) {

          span.textContent =
            slots[i].letter

          span.style.color = '#22ff22'

        } else {

          span.textContent = '_'

          span.style.color = '#66ffff'

        }

        slotsRow.appendChild(span)


        if (i === spaceIdx - 1) {

          const gap =
            document.createElement('span')

          gap.textContent = '\u00A0\u00A0\u00A0\u00A0'

          gap.style.display =
            'inline-block'

          gap.style.width = '4ch'

          slotsRow.appendChild(gap)

        }

      }

      el.appendChild(slotsRow)

    }


    // Input

    const input =
      document.createElement('input')

    input.type = 'text'

    input.placeholder =
      'Type full name...'

    input.style.width = '320px'

    input.style.padding =
      '12px 16px'

    input.style.fontSize = '20px'

    input.style.fontFamily =
      'monospace'

    input.style.textAlign = 'center'

    input.style.background =
      'rgba(0, 0, 0, 0.6)'

    input.style.color = '#ffffff'

    input.style.border =
      '2px solid #444444'

    input.style.borderRadius = '6px'

    input.style.outline = 'none'

    input.style.marginBottom = '16px'

    input.style.letterSpacing = '2px'

    el.appendChild(input)

    this.nameInput = input


    // Error message

    const errEl =
      document.createElement('div')

    errEl.style.color = '#ff4444'

    errEl.style.fontSize = '15px'

    errEl.style.marginBottom = '12px'

    errEl.style.minHeight = '20px'

    errEl.style.textShadow =
      '0 0 8px #660000'

    el.appendChild(errEl)

    this.nameErrorEl = errEl


    // Submit button

    const submitBtn =
      document.createElement('button')

    submitBtn.textContent =
      'SUBMIT NAME'

    submitBtn.style.padding =
      '12px 36px'

    submitBtn.style.fontSize = '16px'

    submitBtn.style.fontFamily =
      'monospace'

    submitBtn.style.fontWeight =
      'bold'

    submitBtn.style.background =
      '#22ff22'

    submitBtn.style.color =
      '#003300'

    submitBtn.style.border = 'none'

    submitBtn.style.borderRadius =
      '6px'

    submitBtn.style.cursor = 'pointer'

    submitBtn.style.letterSpacing =
      '1px'

    submitBtn.style.marginBottom =
      '18px'

    submitBtn.addEventListener(
      'click',
      () => this.submitNamePuzzle()
    )

    el.appendChild(submitBtn)


    // Attempt warning

    const warn =
      document.createElement('div')

    warn.textContent =
      'ONE ATTEMPT ONLY.'

    warn.style.color = '#ff3333'

    warn.style.fontSize = '13px'

    warn.style.letterSpacing = '2px'

    warn.style.textShadow =
      '0 0 8px #660000'

    el.appendChild(warn)


    document.body.appendChild(el)

    this.namePuzzleEl = el


    // Keyboard Enter handler

    this.onNameEntryKey = (e) => {

      if (e.code === 'Enter') {

        this.submitNamePuzzle()

      }

    }

    window.addEventListener(
      'keydown',
      this.onNameEntryKey
    )


    // Focus input

    setTimeout(() => {

      if (this.nameInput) {

        this.nameInput.focus()

      }

    }, 100)

  }


  hideNamePuzzle() {

    if (this.onNameEntryKey) {

      window.removeEventListener(
        'keydown',
        this.onNameEntryKey
      )

      this.onNameEntryKey = null

    }

    if (
      this.namePuzzleEl &&
      this.namePuzzleEl.parentNode
    ) {

      this.namePuzzleEl.parentNode
        .removeChild(
          this.namePuzzleEl
        )

    }

    this.namePuzzleEl = null

    this.nameInput = null

    this.nameErrorEl = null

  }


  submitNamePuzzle() {

    if (
      this.levelState !== 'NAME_PUZZLE'
    ) {

      return

    }

    if (!this.nameInput) {

      return

    }

    const raw =
      this.nameInput.value || ''

    const answer =
      raw
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase()


    const correct =
      this.pendingGhostName


    if (answer === correct) {

      this.hideNamePuzzle()

      this.startExorcism()

    } else {

      this.showGameOver(
        this.pendingGhostName,
        true
      )

    }

  }


  // ============================================
  // LEVEL 3 — GAME OVER
  // ============================================

  showGameOver(
    ghostName,
    wrongName
  ) {

    this.levelState = 'GAME_OVER'

    this.levelTimer = 0


    // Freeze cars

    if (this.highwayController) {

      this.highwayController
        .setDrivingEnabled(false)

    }

    if (this.highwayRace) {

      this.highwayRace.ghostSpeed = 0

    }


    this.hideNamePuzzle()


    // Hide ghost name UI

    if (this.ghostNameUI) {

      this.ghostNameUI.style.display =
        'none'

    }


    const el =
      document.createElement('div')

    el.style.position = 'fixed'

    el.style.inset = '0'

    el.style.zIndex = '150'

    el.style.display = 'flex'

    el.style.flexDirection = 'column'

    el.style.alignItems = 'center'

    el.style.justifyContent = 'center'

    el.style.background =
      'rgba(15, 0, 0, 0.92)'

    el.style.fontFamily =
      'monospace'


    const goTitle =
      document.createElement('div')

    goTitle.textContent =
      'GAME OVER'

    goTitle.style.color = '#ff3333'

    goTitle.style.fontSize = '48px'

    goTitle.style.fontWeight =
      'bold'

    goTitle.style.marginBottom =
      '20px'

    goTitle.style.textShadow =
      '0 0 24px #660000'

    el.appendChild(goTitle)


    const goMsg =
      document.createElement('div')

    if (wrongName) {

      goMsg.textContent =
        'WRONG NAME.'

    } else {

      goMsg.textContent =
        ghostName + ' REACHED THE FINISH FIRST.'

    }

    goMsg.style.color = '#cc2222'

    goMsg.style.fontSize = '18px'

    goMsg.style.marginBottom = '8px'

    goMsg.style.textShadow =
      '0 0 10px #440000'

    el.appendChild(goMsg)


    const goMsg2 =
      document.createElement('div')

    goMsg2.textContent =
      'THE RACE WAS NEVER YOURS.'

    goMsg2.style.color = '#aa1111'

    goMsg2.style.fontSize = '16px'

    goMsg2.style.marginBottom = '36px'

    goMsg2.style.textShadow =
      '0 0 8px #330000'

    el.appendChild(goMsg2)


    const goHint =
      document.createElement('div')

    goHint.textContent =
      'Press 3 to try again'

    goHint.style.color = '#666666'

    goHint.style.fontSize = '14px'

    goHint.style.letterSpacing = '1px'

    el.appendChild(goHint)


    document.body.appendChild(el)

    this.gameOverEl = el

  }


  hideGameOver() {

    if (
      this.gameOverEl &&
      this.gameOverEl.parentNode
    ) {

      this.gameOverEl.parentNode
        .removeChild(
          this.gameOverEl
        )

    }

    this.gameOverEl = null

  }


  // ============================================
  // LEVEL 3 — EXORCISM SEQUENCE
  // ============================================

  startExorcism() {

    this.levelState = 'EXORCISM'

    this.levelTimer = 0

    this.exorcismParticles = []


    // Freeze cars

    if (this.highwayController) {

      this.highwayController
        .setDrivingEnabled(false)

    }

    if (this.highwayRace) {

      this.highwayRace.ghostSpeed = 0

    }


    // Hide ghost name UI

    if (this.ghostNameUI) {

      this.ghostNameUI.style.display =
        'none'

    }


    // Save original scene values

    this.exorcismBgOriginal =
      this.scene.background.clone()


    // Find the directional light

    if (this.levelRoot) {

      this.levelRoot.traverse(
        (child) => {

          if (
            child.isDirectionalLight
          ) {

            this.exorcismLightRef =
              child

            this.exorcismMoonOriginal =
              child.color.clone()

          }

          if (
            child.isAmbientLight
          ) {

            this.ambientLightRef =
              child

            this.exorcismAmbientOriginal =
              child.color.clone()

          }

        }
      )

    }


    // Create exorcism overlay

    const el =
      document.createElement('div')

    el.style.position = 'fixed'

    el.style.inset = '0'

    el.style.zIndex = '140'

    el.style.display = 'flex'

    el.style.flexDirection = 'column'

    el.style.alignItems = 'center'

    el.style.justifyContent = 'center'

    el.style.pointerEvents = 'none'

    el.style.opacity = '0'

    el.style.transition =
      'opacity 2s ease'

    el.style.fontFamily =
      'monospace'


    const mainText =
      document.createElement('div')

    mainText.textContent =
      'THE LAST RIDE IS OVER.'

    mainText.style.color = '#ffffff'

    mainText.style.fontSize = '40px'

    mainText.style.fontWeight =
      'bold'

    mainText.style.marginBottom =
      '16px'

    mainText.style.textShadow =
      '0 0 30px #ffffff, 0 0 60px #66ffff'

    el.appendChild(mainText)


    const subText =
      document.createElement('div')

    subText.textContent =
      'THE SPIRIT HAS BEEN EXORCISED.'

    subText.style.color = '#66ffff'

    subText.style.fontSize = '20px'

    subText.style.fontWeight =
      'bold'

    subText.style.textShadow =
      '0 0 20px #006666'

    el.appendChild(subText)


    document.body.appendChild(el)

    this.exorcismEl = el


    // Fade in after short delay

    setTimeout(() => {

      if (this.exorcismEl) {

        this.exorcismEl.style.opacity =
          '1'

      }

    }, 200)

  }


  updateExorcism(dt) {

    this.levelTimer += dt

    const t =
      this.levelTimer


    // Ghost car flickering

    if (this.highwayRace) {

      const gc =
        this.highwayRace.ghostCar

      if (gc) {

        // Flicker visibility

        if (t < 3) {

          gc.visible =
            Math.sin(t * 12) > -0.3

        } else if (t < 5) {

          gc.visible =
            Math.sin(t * 20) > 0.0

        } else {

          gc.visible = false

        }


        // Fade transparency

        const opacity =
          t < 3
            ? 0.6
            : Math.max(
                0,
                0.6 - (t - 3) * 0.15
              )

        gc.traverse((child) => {

          if (child.material) {

            child.material.opacity =
              opacity

            child.material.transparent =
              true

          }

        })

      }

    }


    // Spawn particles

    if (t > 0.5 && t < 8) {

      const rate =
        t < 3 ? 3 : 8

      if (
        Math.random() < rate * dt
      ) {

        this.spawnExorcismParticle()

      }

    }


    // Update particles

    this.updateExorcismParticles(
      dt
    )


    // Scene background → warm dawn

    if (t > 2 && t < 7) {

      const p =
        Math.min(
          1,
          (t - 2) / 5
        )

      const orig =
        this.exorcismBgOriginal

      const r =
        orig.r +
        (0.12 - orig.r) * p

      const g =
        orig.g +
        (0.08 - orig.g) * p

      const b =
        orig.b +
        (0.04 - orig.b) * p

      this.scene.background =
        new THREE.Color(r, g, b)


      // Transition fog with background

      if (
        this.highwayEnvironment
      ) {

        this.highwayEnvironment
          .setFogColor(
            new THREE.Color(
              r * 0.7,
              g * 0.7,
              b * 0.8
            )
          )

        this.highwayEnvironment
          .setFogDensity(
            0.008 * (1 - p * 0.5)
          )

      }

    }


    // Lighting → warmer

    if (t > 3 && t < 8) {

      const p =
        Math.min(
          1,
          (t - 3) / 5
        )

      if (
        this.exorcismLightRef
      ) {

        const orig =
          this.exorcismMoonOriginal

        this.exorcismLightRef.color.setRGB(
          orig.r +
            (1.0 - orig.r) * p,
          orig.g +
            (0.85 - orig.g) * p,
          orig.b +
            (0.6 - orig.b) * p
        )

        this.exorcismLightRef.intensity =
          2 + p * 2

      }

      if (
        this.ambientLightRef
      ) {

        const orig =
          this.exorcismAmbientOriginal

        this.ambientLightRef.color.setRGB(
          orig.r +
            (1.0 - orig.r) * p,
          orig.g +
            (0.9 - orig.g) * p,
          orig.b +
            (0.7 - orig.b) * p
        )

      }

    }


    // Complete

    if (t >= 9) {

      this.levelState = 'COMPLETE'

    }

  }


  spawnExorcismParticle() {

    const el =
      document.createElement('div')

    el.style.position = 'fixed'

    el.style.width = '4px'

    el.style.height = '4px'

    el.style.borderRadius = '50%'

    el.style.background = '#66ffff'

    el.style.boxShadow =
      '0 0 8px #66ffff'

    el.style.pointerEvents = 'none'

    el.style.zIndex = '145'

    el.style.opacity = '0.8'


    const startX =
      Math.random() * window.innerWidth

    const startY =
      window.innerHeight * 0.5 +
      (Math.random() - 0.5) *
        200

    el.style.left = startX + 'px'

    el.style.top = startY + 'px'


    document.body.appendChild(el)


    this.exorcismParticles.push({
      el: el,
      x: startX,
      y: startY,
      vx:
        (Math.random() - 0.5) * 40,
      vy:
        -30 - Math.random() * 80,
      life: 0,
      maxLife:
        1.5 + Math.random() * 2,
    })

  }


  updateExorcismParticles(dt) {

    for (
      let i =
        this.exorcismParticles.length -
        1;
      i >= 0;
      i--
    ) {

      const p =
        this.exorcismParticles[i]

      p.life += dt

      p.x += p.vx * dt

      p.y += p.vy * dt

      p.x +=
        Math.sin(
          p.life * 4
        ) *
        30 *
        dt


      if (
        p.life >= p.maxLife
      ) {

        if (p.el.parentNode) {

          p.el.parentNode.removeChild(
            p.el
          )

        }

        this.exorcismParticles.splice(
          i,
          1
        )

      } else {

        const progress =
          p.life / p.maxLife

        p.el.style.left =
          p.x + 'px'

        p.el.style.top =
          p.y + 'px'

        p.el.style.opacity =
          (1 - progress) * 0.8

      }

    }

  }


  hideExorcismEffects() {

    if (
      this.exorcismEl &&
      this.exorcismEl.parentNode
    ) {

      this.exorcismEl.parentNode
        .removeChild(
          this.exorcismEl
        )

    }

    this.exorcismEl = null


    for (
      let i =
        this.exorcismParticles.length -
        1;
      i >= 0;
      i--
    ) {

      const p =
        this.exorcismParticles[i]

      if (p.el.parentNode) {

        p.el.parentNode.removeChild(
          p.el
        )

      }

    }

    this.exorcismParticles = []


    // Restore scene background

    if (this.exorcismBgOriginal) {

      this.scene.background =
        this.exorcismBgOriginal.clone()

    }


    // Restore lighting

    if (
      this.exorcismLightRef &&
      this.exorcismMoonOriginal
    ) {

      this.exorcismLightRef.color.copy(
        this.exorcismMoonOriginal
      )

      this.exorcismLightRef.intensity =
        2

    }

    if (
      this.ambientLightRef &&
      this.exorcismAmbientOriginal
    ) {

      this.ambientLightRef.color.copy(
        this.exorcismAmbientOriginal
      )

    }

    this.exorcismBgOriginal = null

    this.exorcismLightRef = null

    this.exorcismMoonOriginal = null

    this.ambientLightRef = null

    this.exorcismAmbientOriginal =
      null

  }


  // ============================================
  // LEVEL 3 — STATE UPDATE
  // ============================================

  updateLevelState(dt) {

    // ============================================
    // FINISH_CHECK — show race result, then branch
    // ============================================

    if (
      this.levelState === 'FINISH_CHECK'
    ) {

      this.levelTimer += dt


      // After 2.5s transition based on winner

      if (this.levelTimer >= 2.5) {

        if (
          this.highwayRace &&
          this.highwayRace.winner ===
            'player'
        ) {

          // Hide race result text

          if (
            this.highwayRace
              .countdownElement
          ) {

            this.highwayRace
              .countdownElement
              .style.display = 'none'

          }


          // Move to name puzzle

          this.levelState = 'NAME_PUZZLE'

          this.levelTimer = 0

        } else {

          // Ghost won — game over

          this.showGameOver(
            this.pendingGhostName,
            false
          )

        }

      }

    }


    // ============================================
    // NAME_PUZZLE — show puzzle after brief pause
    // ============================================

    if (
      this.levelState === 'NAME_PUZZLE'
    ) {

      this.levelTimer += dt


      // Show name puzzle UI after 1.5s

      if (
        this.levelTimer >= 1.5 &&
        !this.namePuzzleEl
      ) {

        this.showNamePuzzle(
          this.pendingGhostName
        )

      }

    }


    if (
      this.levelState === 'EXORCISM'
    ) {

      this.updateExorcism(dt)

    }

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

function createInspectionMaterial(source) {

  return new THREE.MeshBasicMaterial({
    map: source?.map || null,
    color: source?.color || 0xffffff,
    transparent: source?.transparent || false,
    opacity: source?.opacity ?? 1,
    alphaTest: source?.alphaTest || 0,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  })
}

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
