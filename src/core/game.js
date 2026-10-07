import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'
import { HauntedHouseAudio } from '../levels/house/audio.js'
import { HighwayAudio } from '../levels/highway/audio.js'
import { HouseStory } from '../levels/house/story.js'
import { HouseStoryView, renderJournal } from '../levels/house/story-view.js'

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
  updateObstacles,
} from "../levels/highway/obstacles.js"

import {
  createRoadSigns,
  updateRoadSigns,
  disposeRoadSigns,
} from "../levels/highway/signs.js"

import {
  updateRacecraft,
} from "../levels/highway/racecraft.js"

import { HighwayCarController }
  from '../levels/highway/car.js'

import { HighwayRaceController }
  from '../levels/highway/race.js'

import { HighwayEnvironmentManager }
  from '../levels/highway/environment.js'

import {
  disposeHighwayAtmosphere,
  loadHighwayAtmosphere,
} from '../levels/highway/atmosphere.js'

import {
  getDoorColliders,
  loadHouse,
  toggleDoor,
  updateDoors,
} from '../levels/house/index.js'

import { loadTrain, updateTrainCarriageVisibility, updateTrainCarriageLights } from '../levels/train/index.js'
import { TrainZombie } from '../levels/train/zombie.js'
import { toggleCarriageLightDebug } from '../levels/train/lighting.js'
import { createFlashlight } from '../levels/shared/lighting.js'


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
    this.highwayAudio = new HighwayAudio()
    this.houseStory = null
    this.houseStoryView = null


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

    this.highwayAtmosphere = null

    this.ghostNameUI = null

    this.collectibles = []

    this.roadSigns = []

    this.racecraft = null

    this.roadSignTime = 0

    this.obstacles = null

    this.trainTerrain = null

    this.trainCarriages = null

    this.trainZombie = null

    this.trainCaught = false

    this.trainStory = null

    this.trainClues = null

    this.journalBuilder = null

    this.levelCaptionEl = document.getElementById('levelCaption')

    this.levelCaptionRemaining = 0

    this.holdProgressEl = document.getElementById('holdProgress')

    this.holdProgressFill = document.getElementById('holdProgressFill')

    this.carriageLightControllers = null

    this.carriageLightDebug = false

    this.debugPositionEl = null


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

    this.exorcismBgIntensityOriginal = null

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

    this.bedroomPhoneAnswered = false

    this.newspaperOpen = false

    this.newspaperInspectionObject = null

    this.newspaperDrag = null

    this.newspaperPreview =
      document.getElementById(
        'newspaperTexturePreview'
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
    this.houseAudioStartFrame = null

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

    // A click is required by browsers before Web Audio may play.
    this.houseAudio.unlock()
    this.highwayAudio.unlock()


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
      (this.currentLevel === 'house' || this.currentLevel === 'train') &&
      this.input.consumePressed('KeyI')
    ) {
      if (this.evidenceBookOpen) this.closeEvidenceBook()
      else if (this.input.isLocked) this.openEvidenceBook()
    }

    if (
      this.currentLevel === 'train' &&
      this.input.consumePressed('KeyT')
    ) {

      if (this.flashlight) {
        this.flashlight.intensity = this.flashlight.intensity > 0 ? 0 : 1.5
      }
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

      // Racing-dressing lamp flicker (shared materials only).

      if (
        this.racecraft
      ) {

        updateRacecraft(
          this.racecraft,
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

        if (
          this.obstacles &&
          this.obstacles.length > 0
        ) {

          updateObstacles(
            this.obstacles,
            dt
          )

        }

        // Player-only car sound: driven by the human player's
        // actual physical driving state (never the ghost's). Any drive
        // input while moving counts, including controlled reverse.
        if (this.highwayController) {
          const keys = this.highwayController.keys || {}
          const driving =
            this.input.isLocked &&
            this.highwayController.canDrive &&
            Boolean(keys['KeyW'] || keys['KeyS']) &&
            Math.abs(this.highwayController.speed) > 0.5

          this.highwayAudio?.setPlayerDriving(driving)
        } else {
          this.highwayAudio?.setPlayerDriving(false)
        }

      } else {

        // FINISH_CHECK, NAME_PUZZLE,
        // EXORCISM, GAME_OVER, COMPLETE

        this.updateLevelState(dt)
        this.highwayAudio?.setPlayerDriving(false)

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
    const active = this.input.isLocked && !this.newspaperOpen && !this.evidenceBookOpen && !this.houseStoryView?.open
    this.houseStoryView?.update(dt, active)
    if (this.levelCaptionRemaining > 0) {
      this.levelCaptionRemaining = Math.max(0, this.levelCaptionRemaining - dt)
      this.levelCaptionEl?.classList.toggle('hidden', this.levelCaptionRemaining <= 0)
    }
    if (this.currentLevel === 'house') this.houseAudio.setPaused(!active && !this.newspaperOpen && !this.houseStoryView?.open && !this.houseStory?.jumpScareTime)
    if (active) {
    if (this.houseStory && this.input.consumePressed('KeyT')) {
      this.houseStory.flashlight.visible = !this.houseStory.flashlight.visible
    }

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

    if (
      this.currentLevel === 'train' &&
      this.carriageLightControllers
    ) {

      for (const ctrl of this.carriageLightControllers) {
        ctrl.update(dt)
      }

    }

    if (
      this.currentLevel === 'train' &&
      this.carriageLightDebug &&
      this.debugPositionEl
    ) {
      const p = this.camera.position
      this.debugPositionEl.textContent =
        `Pos  X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`
    }


    const door =
      this.getLookedAtDoor()

    const investigationItem =
      this.currentLevel === 'house' || this.currentLevel === 'train'
        ? this.getLookedAtInvestigationItem()
        : null


    if (
      this.input.consumePressed('KeyE') && !(this.houseStory?.jumpScareTime > 0)
    ) {

      if (
        this.currentLevel === 'house' &&
        investigationItem &&
        investigationItem.story
      ) {
        if (this.houseStory.canInspect(investigationItem.id)) {
          if (investigationItem.id === 'evelyn-grave') {
            this.houseStoryView.openRite()
          } else {
            this.houseStory.inspect(investigationItem.id)
            this.openNewspaperReader(investigationItem)
          }
        }
      }
      else if (
        investigationItem &&
        investigationItem.id === 'newspaper'
      ) {

        this.openNewspaperReader(investigationItem)
      }

      else if (
        investigationItem &&
        investigationItem.id === 'vale-frame' &&
        this.newspaperRead
      ) {

        this.inspectValeFrame(investigationItem)
      }

      else if (
        investigationItem &&
        investigationItem.id === 'bedroom-phone' &&
        this.valeFrameInspected &&
        this.houseStory?.isPhoneRinging() &&
        !this.bedroomPhoneAnswered
      ) {

        this.answerBedroomPhone()
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


    // Toggle carriage light debug (train level)
    if (
      this.currentLevel === 'train' &&
      this.input.consumePressed('KeyK')
    ) {

      this.carriageLightDebug =
        !this.carriageLightDebug

      if (this.carriageLightControllers) {
        toggleCarriageLightDebug(
          this.carriageLightControllers,
          this.carriageLightDebug
        )
      }

      if (this.carriageLightDebug) {
        if (!this.debugPositionEl) {
          this.debugPositionEl = document.createElement('div')
          this.debugPositionEl.style.cssText =
            'position:fixed;top:10px;left:10px;color:#0f0;font:14px/1.4 monospace;' +
            'background:rgba(0,0,0,0.6);padding:6px 10px;border-radius:4px;z-index:9999;pointer-events:none;'
          document.body.appendChild(this.debugPositionEl)
        }
        this.debugPositionEl.style.display = 'block'
      } else if (this.debugPositionEl) {
        this.debugPositionEl.style.display = 'none'
      }

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


    if (this.currentLevel === 'train' && this.trainStory) {
      const storyItem = investigationItem && investigationItem.story ? investigationItem : null
      const reading = storyItem && this.input.isDown('KeyE') && !this.trainStory.found.has(storyItem.id)

      if (reading) {
        const finished = this.trainStory.hold(dt, storyItem)
        if (finished) this.trainStory.read(storyItem)
        if (this.holdProgressFill) {
          this.holdProgressFill.style.width = `${(this.trainStory.progress * 100).toFixed(1)}%`
        }
        this.holdProgressEl?.classList.remove('hidden')
      } else {
        this.trainStory.releaseHold()
        this.holdProgressEl?.classList.add('hidden')
      }

      this.trainStory.update(dt, this.player)
    }


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

    if (this.currentLevel === 'train' && this.trainCarriages) {
      updateTrainCarriageVisibility(this.trainCarriages, this.player.position.z)
      updateTrainCarriageLights(this.trainCarriages, this.player.position.z)
    }

    if (this.currentLevel === 'train' && this.trainZombie && !this.trainCaught) {
      const outcome = this.trainZombie.update(dt, {
        position: this.player.position,
        velocity: this.player.velocity,
        crouching: this.player.crouching,
        flashlightOn: (this.flashlight ? this.flashlight.intensity : 0) > 0,
      })

      if (outcome === 'caught') this.onPlayerCaught()
    }

    if (this.currentLevel === 'house') {
      this.houseAudio.update(this.player)
      if (!this.newspaperOpen && !this.houseStoryView?.open) {
        this.houseStory?.update(dt, this.player, this.valeFrameInspected && !this.bedroomPhoneAnswered)
      }
    }
    } else {
      this.player.velocity.set(0, 0, 0)
      this.interactionPrompt?.classList.add('hidden')
    }

  }

}



    if (this.currentLevel === 'house') this.houseStory?.updateJumpScare(dt, this.player)
    const scareTime = this.currentLevel === 'house'
      ? this.houseStory?.jumpScareTime || 0
      : 0
    if (scareTime > 0) {
      const strength = Math.min(1, scareTime * 4)
      const x = (Math.random() - 0.5) * 48 * strength
      const y = (Math.random() - 0.5) * 38 * strength
      const roll = (Math.random() - 0.5) * 3.5 * strength
      this.renderer.domElement.style.transform = `translate(${x}px, ${y}px) rotate(${roll}deg) scale(1.12)`
      this.renderer.domElement.style.filter = 'contrast(1.3) brightness(1.15)'
    } else {
      this.renderer.domElement.style.transform = ''
      this.renderer.domElement.style.filter = ''
    }

    // ----------------------------------------
    // RENDER
    // ----------------------------------------

    this.renderer.render(
      this.scene,
      this.camera
    )

    this.startHouseAudioAfterRender()

    this.updateHud(dt)
  }

  startHouseAudioAfterRender() {
    if (!this.loaded || this.currentLevel !== 'house' || !this.input.isLocked ||
        this.houseAudio.enabled || this.houseAudioStartFrame !== null) return

    const loadId = this.levelLoadId
    // Let the browser present the first rendered scene before starting audio.
    this.houseAudioStartFrame = requestAnimationFrame(() => {
      this.houseAudioStartFrame = null
      if (!this.loaded || loadId !== this.levelLoadId || this.currentLevel !== 'house' ||
          !this.input.isLocked || this.houseAudio.enabled) return
      this.houseAudio.setHouseActive(true, this.model)
    })
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

    const loadStarted = performance.now()


    // Remove old level.
    this.unloadCurrentLevel()


    this.currentLevel =
      levelName

    this.player.configureForLevel(levelName)


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
          async ({
            colliders,
            colliderHelpers,
            lightHelpers,
            doors,
            ramps,
            model,
            animations,
            spawn,
            spawnYaw,
            modelSize,
            playerCar,
            ghostCar,
            finishZ,
            ghostName,
            trainTerrain,
            carriages,
            controllers,
            zombie,
            investigationItems,
            trainStory,
            trainClues,
            moonLight,
            roadPath,
            arcLengths,
            totalRoadLength,
            track,
            obstacles,
            cityBuildings,
            streetlights,
            racecraft,
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

          this.bedroomPhoneAnswered = false

          this.ramps =
            ramps || []

          this.model =
            model

          if (levelName === 'house') {
            this.houseStoryView = new HouseStoryView(this)
            this.houseStory = new HouseStory({
              model, animations, level: levelRoot, items: this.investigationItems, doors: this.doors,
              camera: this.camera, audio: this.houseAudio,
              onMessage: (text, duration) => this.houseStoryView.message(text, duration),
            })
          }

          this.trainTerrain =
            trainTerrain || null

          this.trainCarriages =
            carriages || null

          this.carriageLightControllers =
            controllers || null

          this.trainCaught = false

          this.trainZombie = levelName === 'train' && zombie
            ? new TrainZombie({
                group: zombie.group,
                mixer: zombie.mixer,
                footOffset: zombie.footOffset,
                carriages: carriages || [],
                colliders: this.colliders,
              })
            : null

          this.trainStory = levelName === 'train' ? trainStory || null : null

          this.trainClues = levelName === 'train' ? trainClues || null : null

          this.journalBuilder = levelName === 'train' && this.trainStory
            ? (game) => game.trainStory.journalEntries()
            : null

          if (this.trainStory) {
            this.trainStory.onMessage = (text, duration) => this.showLevelCaption(text, duration)
            const boardName = this.trainStory.profile?.kana || this.trainStory.profile?.romaji || ''
            if (boardName) {
              this.ghostNameUI = createGhostNameUI(boardName)
              this.trainStory.nameBoard = this.ghostNameUI
            }
          }


          // ======================================
          // HIGHWAY
          // ======================================

          if (
            levelName === 'highway'
          ) {

            // Store level data for highway controllers.
            // `track` is authoritative; roadPath/arcLengths/totalRoadLength
            // are legacy compat mirrors of track.points/track.arcLengths.
          this.levelData = {
            track: track || null,
            roadPath,
            arcLengths,
            totalRoadLength,
          }

          this.obstacles = obstacles


          // Apocalyptic sky before any controller captures the background.
          this.highwayAtmosphere =
            await loadHighwayAtmosphere(
              this.scene,
              this.renderer
            )

          // A newer level was selected while the sky was loading: never
          // leak the red sky onto it.
          if (
            loadId !==
            this.levelLoadId
          ) {

            disposeHighwayAtmosphere(
              this.scene,
              this.highwayAtmosphere
            )

            this.highwayAtmosphere = null

            disposeLevel(
              levelRoot
            )

            return false

          }


          this.ghostNameUI =
              createGhostNameUI(
                ghostName
              )

            this.highwayController =
              new HighwayCarController(
                playerCar,
                this.camera,
                this.levelData.track ||
                  this.levelData.roadPath,
                this.levelData.arcLengths
              )

            this.highwayController.obstacles =
              obstacles
            
              this.highwayController.onCrash = 
              () => {
                this.showGameOver(
                  ghostName,
                  false,
                  true
                )
              }

            this.highwayRace =
              new HighwayRaceController(
                this.highwayController,
                ghostCar,
                finishZ,
                ghostName,
                this.ghostNameUI,
                this.scene,
                this.levelData.track ||
                  this.levelData.roadPath,
                this.levelData.arcLengths,
                this.levelData.totalRoadLength
              )

            this.highwayRace.obstacles =
              obstacles

            this.highwayRace.highwayAudio =
              this.highwayAudio

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
                this.levelData.track ||
                  this.levelData.roadPath,
                this.levelData.arcLengths,
                this.levelData.totalRoadLength
              )

            this.roadSigns =
              createRoadSigns(
                ghostName,
                model,
                this.levelData.track
              )

            // Procedural racing dressing (already built into the level
            // model by createHighwayLevel); only the flicker handle is
            // kept here. Geometry disposal rides level disposal.
            this.racecraft = racecraft || null

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
                cityBuildings: cityBuildings,
                streetlights: streetlights,
                track: this.levelData.track,
                roadPath:
                  this.levelData.roadPath,
                arcLengths:
                  this.levelData.arcLengths,
              })

            // Level 3 background music: single looping instance,
            // started once per activation (never per frame).
            this.highwayAudio.setHighwayActive(true)

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

          // Train level: attach flashlight to camera.
          if (levelName === 'train') {
            this.flashlight = createFlashlight(this.camera)
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


          // Warm shaders while the overlay still shows LOADING so their
          // first compilation does not interrupt the first playable frame.
          const warmupStarted = performance.now()
          try {
            if (this.renderer.compileAsync) {
              await this.renderer.compileAsync(this.scene, this.camera)
            } else {
              this.renderer.compile(this.scene, this.camera)
            }
          } catch (err) {
            console.warn('Shader warmup failed:', err)
          }
          console.debug(
            `[load:${levelName}] shader warmup: ${(performance.now() - warmupStarted).toFixed(0)}ms`,
          )

          // A newer level was selected during warmup.
          if (loadId !== this.levelLoadId) {
            disposeLevel(levelRoot)
            return false
          }


          this.loaded = true

          window.dispatchEvent(
            new CustomEvent('levelloaded', { detail: { levelName } })
          )

          console.debug(
            `[load:${levelName}] total: ${(performance.now() - loadStarted).toFixed(0)}ms`,
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
    if (this.houseAudioStartFrame !== null) {
      cancelAnimationFrame(this.houseAudioStartFrame)
      this.houseAudioStartFrame = null
    }
    this.houseStory?.dispose()
    this.houseStoryView?.dispose()
    this.houseStory = null
    this.houseStoryView = null

    this.houseAudio.setHouseActive(false)
    this.highwayAudio?.setHighwayActive(false)

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

    this.bedroomPhoneAnswered = false

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

    // Level 3 sky lives on the shared scene, so dispose it explicitly here;
    // the generic background reset below must never leak the texture.
    if (this.highwayAtmosphere) {

      disposeHighwayAtmosphere(
        this.scene,
        this.highwayAtmosphere
      )

      this.highwayAtmosphere = null

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

    this.racecraft = null

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

    this.trainCarriages = null

    this.trainZombie?.dispose()
    this.trainZombie = null
    this.trainCaught = false

    this.trainStory?.dispose()
    this.trainStory = null

    this.trainClues?.dispose()
    this.trainClues = null

    this.journalBuilder = null

    this.levelCaptionRemaining = 0
    this.levelCaptionEl?.classList.add('hidden')
    this.holdProgressEl?.classList.add('hidden')

    this.carriageLightControllers = null

    this.carriageLightDebug = false

    if (this.debugPositionEl) {
      this.debugPositionEl.remove()
      this.debugPositionEl = null
    }

    if (this.flashlight) {
      this.camera.remove(this.flashlight)
      this.camera.remove(this.flashlight.target)
      this.flashlight.dispose()
      this.flashlight = null
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

    this.carriageLightControllers = null

    this.carriageLightDebug = false

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
          ? this.player.flying
            ? 'UNNATURAL ELEVATION'
            : this.trainZombie?.hidden ? 'UNSEEN' : 'ON FOOT'
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
        isHouse || this.currentLevel === 'train' ? '' : 'none'

      if (this.currentLevel === 'train') {

        hudObjective.textContent =
          this.trainZombie && this.trainZombie.state !== 'dormant'
            ? 'IT WALKS THE CARRIAGES … CROUCH BETWEEN THE SEATS … TORCH OFF'
            : 'CROSS INTO THE NEXT CARRIAGE'

        if (this.trainStory) hudObjective.textContent = this.trainStory.objective()
      }

      if (isHouse) {

        hudObjective.textContent =
          this.newspaperRead
            ? 'ENTRY 01 — NEWSPAPER CLIPPING LOGGED'
            : 'FIND THE NEWSPAPER ON THE PORCH'

        if (this.newspaperRead) {
          if (!this.valeFrameInspected) {
            hudObjective.textContent =
              'ENTER THE HOUSE AND INSPECT THE FAMILY FRAME'
          } else if (!this.bedroomPhoneAnswered) {
            hudObjective.textContent =
              this.houseStory?.isPhoneRinging()
                ? 'UPSTAIRS · ANSWER THE RINGING MAIN BEDROOM PHONE'
                : 'UPSTAIRS · FIND THE MAIN BEDROOM PHONE'
          } else {
            hudObjective.textContent =
              'FIND EVELYN’S DIARY BESIDE HER BED'
          }
        }
      }
    }

    if (hudObjective && this.houseStory?.objective()) {
      hudObjective.textContent = this.houseStory.objective()
    }

    const evidenceButton =
      document.getElementById('evidenceBtn')

    if (evidenceButton) {

      evidenceButton.classList.toggle(
        'hidden',
        this.currentLevel !== 'house' && this.currentLevel !== 'train'
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

    const targets = [this.model, ...(this.houseStory ? [this.houseStory.root] : [])]
    if (this.currentLevel === 'train' && this.trainCarriages) {
      for (const carriage of this.trainCarriages) targets.push(carriage.group)
    }

    const hits = this.raycaster.intersectObjects(
      targets, true,
    ).filter(hit => isEffectivelyVisible(hit.object))

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
      if (hit.object.isMesh && hit.object.material?.transparent !== true) break
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
      investigationItem.inspectionMesh || (investigationItem.object.isMesh
        ? investigationItem.object
        : investigationItem.object.getObjectByProperty(
            'isMesh',
            true,
          ))

    if (!sourceMesh) {

      this.hideNewspaperReader()
      return
    }

    this.currentInspectionItemId = investigationItem.id

    const inspectAsObject = investigationItem.inspectionMode === 'object'
    const inspectionObject = inspectAsObject
      ? investigationItem.object.clone(true)
      : new THREE.Mesh(
          sourceMesh.geometry,
          Array.isArray(sourceMesh.material)
            ? sourceMesh.material.map((material) => createInspectionMaterial(material))
            : createInspectionMaterial(sourceMesh.material),
        )

    if (inspectAsObject) {
      investigationItem.object.updateWorldMatrix(true, true)
      investigationItem.object.matrixWorld.decompose(
        inspectionObject.position, inspectionObject.quaternion, inspectionObject.scale,
      )
      inspectionObject.traverse(child => {
        if (!child.isMesh) return
        child.material = Array.isArray(child.material)
          ? child.material.map(material => createInspectionMaterial(material, true))
          : createInspectionMaterial(child.material, true)
      })
    } else {
      inspectionObject.position.set(0, 0, 0)
      // The porch plane is horizontal in the GLB, so turn it toward the camera.
      inspectionObject.rotation.set(investigationItem.story ? 0 : Math.PI / 2, 0, 0)
      inspectionObject.scale.set(1, 1, 1)
    }
    inspectionObject.updateMatrixWorld(true)

    inspectionObject.visible = true
    inspectionObject.frustumCulled = false

    const inspectionMaterials = []
    inspectionObject.traverse(child => {
      if (child.isMesh) inspectionMaterials.push(...(Array.isArray(child.material) ? child.material : [child.material]))
    })

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

    if (!inspectAsObject && this.newspaperPreview && sourceMaterial?.map?.image) {

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
    if (!inspectAsObject) inspectionObject.scale.setScalar(1.35 / largestDimension)
    inspectionGroup.add(inspectionObject)
    inspectionGroup.position.set(inspectAsObject ? 0.65 : 0, -0.1, -2.15)
    inspectionGroup.rotation.set(0.12, -0.16, -0.08)
    inspectionGroup.scale.setScalar(inspectAsObject ? 1.35 / largestDimension : 1)
    this.camera.add(inspectionGroup)
    this.newspaperInspectionObject = inspectionGroup

    this.newspaperReader.classList.remove('hidden')

    this.newspaperReader.classList.add('inspect-mode')
    this.newspaperReader.classList.toggle('object-mode', inspectAsObject)

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

    this.openNewspaperReader(investigationItem)
  }


  answerBedroomPhone() {

    this.bedroomPhoneAnswered = true

    // A short ghost vocal accompanies Evelyn's captioned telephone message.
    this.houseStory?.answerPhone()
  }


  closeNewspaperReader() {

    if (!this.newspaperOpen) {

      return
    }

    const inspectionId = this.currentInspectionItemId
    this.hideNewspaperReader()
    this.currentInspectionItemId = null

    this.input.lock()

    if (inspectionId === 'vale-frame' && !this.bedroomPhoneAnswered &&
        this.houseStory?.phoneRingStartsAt === Infinity) this.houseStory.schedulePhoneRing(3)
    this.houseStory?.finishInspection(inspectionId)
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

    const supportsEvidence = this.currentLevel === 'house' || this.currentLevel === 'train'
    if (!supportsEvidence || this.evidenceBookOpen || this.newspaperOpen || this.houseStoryView?.outcome) {

      return
    }

    const evidenceBook =
      document.getElementById('evidenceBook')

    if (!evidenceBook) {

      return
    }

    this.evidenceBookOpen = true
    this.houseStoryView?.updateJournal()
    this.updateJournalEntries()

    evidenceBook.classList.remove('hidden')
    evidenceBook.style.zIndex = this.houseStoryView?.open ? '111' : ''

    this.input.release()
    document.getElementById('closeEvidenceNotepadBtn')?.focus()
  }


  updateJournalEntries() {
    if (!this.journalBuilder) return
    renderJournal(document.querySelector('.evidence-notepad'), this.journalBuilder(this))
  }


  showLevelCaption(text, duration = 6) {
    if (!this.levelCaptionEl) return
    this.levelCaptionEl.textContent = text
    this.levelCaptionRemaining = duration
    this.levelCaptionEl.classList.remove('hidden')
  }


  closeEvidenceBook(fromLevelUnload = false) {

    const evidenceBook =
      document.getElementById('evidenceBook')

    this.evidenceBookOpen = false

    evidenceBook?.classList.add('hidden')
    if (evidenceBook) evidenceBook.style.zIndex = ''

    if (!fromLevelUnload && this.loaded && !this.houseStoryView?.open) {

      this.input.lock()
    } else if (!fromLevelUnload && this.houseStoryView?.open) {
      this.houseStoryView.dialog.querySelector('button')?.focus()
    }
  }


  hideNewspaperReader() {

    this.newspaperOpen = false

    this.newspaperReader?.classList.add('hidden')
    this.newspaperReader?.classList.remove('object-mode')
    this.newspaperPreview?.classList.add('hidden')
    this.newspaperPreview?.removeAttribute('src')

    if (this.newspaperInspectionObject) {

      this.newspaperInspectionObject.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material?.dispose())
      })
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
    if (this.currentLevel === 'train' && this.trainStory) {
      return this.trainStory.prompt(investigationItem)
    }

    if (investigationItem.story) return this.houseStory.prompt(investigationItem)

    switch (investigationItem.id) {
      case 'newspaper':
        return this.newspaperRead
          ? 'Press E to reread the newspaper'
          : investigationItem.prompt

      case 'vale-frame':
        if (!this.newspaperRead) {
          return 'Log the porch newspaper first'
        }

        return this.valeFrameInspected
          ? 'Press E to inspect the scratched family portrait again'
          : investigationItem.prompt

      case 'bedroom-phone':
        if (this.bedroomPhoneAnswered) {
          return 'Evelyn warned you about the voice that imitates Margaret.'
        }
        if (!this.valeFrameInspected || !this.houseStory?.isPhoneRinging()) {
          return 'The telephone is silent'
        }
        return 'Press E to answer the ringing telephone'

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


    if (isGhostNameCorrect(raw, this.pendingGhostName)) {

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
    wrongName,
    crashed = false
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

    const message = crashed
      ? 'YOU CRASHED ON THE HIGHWAY.'
      : wrongName
        ? 'WRONG NAME.'
        : ghostName + ' REACHED THE FINISH FIRST.'

    this.showRetryScreen({
      message,
      subMessage: 'THE RACE WAS NEVER YOURS.',
      onRetry: () => this.restartHighway(),
    })

  }


  onPlayerCaught() {

    if (this.trainCaught) return

    this.trainCaught = true

    this.input.release()

    this.showRetryScreen({
      title: 'CAUGHT',
      message: 'THE UNDEAD FOUND YOU IN THE CARRIAGE.',
      subMessage: 'CROUCH BETWEEN THE SEATS WITH THE TORCH OFF.',
      onRetry: () => this.restartTrain(),
    })

  }


  restartTrain() {

    if (this.currentLevel !== 'train') {
      return
    }

    this.hideGameOver()

    document.getElementById('overlay')?.classList.add('hidden')

    this.trainCaught = false

    this.loaded = false

    this.loadLevel('train')

    this.input.lock()

  }


  showRetryScreen({
    title = 'GAME OVER',
    message,
    subMessage,
    onRetry,
  }) {

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
      title

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

    goMsg.textContent =
      message

    goMsg.style.color = '#cc2222'

    goMsg.style.fontSize = '18px'

    goMsg.style.marginBottom = '8px'

    goMsg.style.textShadow =
      '0 0 10px #440000'

    el.appendChild(goMsg)


    const goMsg2 =
      document.createElement('div')

    goMsg2.textContent =
      subMessage

    goMsg2.style.color = '#aa1111'

    goMsg2.style.fontSize = '16px'

    goMsg2.style.marginBottom = '36px'

    goMsg2.style.textShadow =
      '0 0 8px #330000'

    el.appendChild(goMsg2)


    const restartBtn =
      document.createElement('button')

    restartBtn.textContent =
      'TRY AGAIN'

    restartBtn.style.padding =
      '12px 32px'

    restartBtn.style.fontSize =
      '16px'

    restartBtn.style.fontFamily =
      'monospace'

    restartBtn.style.fontWeight =
      'bold'

    restartBtn.style.background =
      '#aa1111'

    restartBtn.style.color =
      '#ffffff'

    restartBtn.style.border =
      '2px solid #ff3333'

    restartBtn.style.borderRadius =
      '6px'

    restartBtn.style.cursor =
      'pointer'

    restartBtn.style.letterSpacing =
      '2px'

    restartBtn.addEventListener(
      'click',
      onRetry
    )

    el.appendChild(restartBtn)


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
  
  restartHighway() {

    if (this.currentLevel !== 'highway') {
      return
    }

    this.hideGameOver()

    // Force loadLevel() to actually reload the highway.
    this.loaded = false

    this.loadLevel('highway')

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


    // Save original scene values.
    // A Level 3 sky texture is kept by reference (never mutated); colors
    // are cloned as before.

    if (this.scene.background?.isTexture) {
      this.exorcismBgOriginal =
        this.scene.background
    } else {
      this.exorcismBgOriginal =
        this.scene.background.clone()
    }

    this.exorcismBgIntensityOriginal =
      this.scene.backgroundIntensity ?? 1


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


    // Scene background → warm dawn.
    // A sky texture cannot be lerped per-channel, so it dims in place
    // while the fog transition below carries the mood shift.

    if (t > 2 && t < 7) {

      const p =
        Math.min(
          1,
          (t - 2) / 5
        )

      const orig =
        this.exorcismBgOriginal

      let r = 0.12
      let g = 0.08
      let b = 0.04

      if (orig?.isTexture) {

        this.scene.backgroundIntensity =
          (this.exorcismBgIntensityOriginal ?? 1) *
          (1 - p * 0.85)

      } else if (orig) {

        r = orig.r + (0.12 - orig.r) * p
        g = orig.g + (0.08 - orig.g) * p
        b = orig.b + (0.04 - orig.b) * p

        this.scene.background =
          new THREE.Color(r, g, b)

      }


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

      if (this.exorcismBgOriginal.isTexture) {
        this.scene.background =
          this.exorcismBgOriginal
      } else {
        this.scene.background =
          this.exorcismBgOriginal.clone()
      }

    }

    if (
      this.exorcismBgIntensityOriginal !==
        null &&
      this.exorcismBgIntensityOriginal !==
        undefined
    ) {

      this.scene.backgroundIntensity =
        this.exorcismBgIntensityOriginal

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

    this.exorcismBgIntensityOriginal = null

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
// LEVEL 3 — GHOST NAME ANSWER COMPARISON
// ============================================

// Normalizes a typed ghost-name answer: outer whitespace trimmed,
// interior whitespace runs collapsed to single spaces, uppercased.
// Interior single spaces are MEANINGFUL and preserved, so "owen grave"
// stays "OWEN GRAVE" and never becomes "OWENGRAVE".
export function normalizeGhostNameAnswer(raw) {
  return (raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

// True when the player's typed answer names the ghost. Both sides go
// through the same normalization, so case and outer/extra whitespace
// never punish a correct multi-word name.
export function isGhostNameCorrect(rawAnswer, ghostName) {
  return normalizeGhostNameAnswer(rawAnswer) ===
    normalizeGhostNameAnswer(ghostName)
}


// ============================================
// CLEAN UP LEVEL
// ============================================

function isEffectivelyVisible(object) {
  while (object) {
    if (!object.visible) return false
    object = object.parent
  }
  return true
}

function createInspectionMaterial(source, solid = false) {

  return new THREE.MeshBasicMaterial({
    map: source?.map || null,
    color: source?.color || 0xffffff,
    transparent: source?.transparent || false,
    opacity: source?.opacity ?? 1,
    alphaTest: source?.alphaTest || 0,
    side: THREE.DoubleSide,
    depthTest: solid,
    depthWrite: solid,
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

      if (object.userData.sharedAsset) return

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
