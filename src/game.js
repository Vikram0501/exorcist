import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'
import { getDoorColliders, loadHouse, toggleDoor, updateDoors } from './levels/house.js'
import { loadTrain } from './levels/train.js'

const DOOR_INTERACTION_RANGE = 2
const LEVELS = {
  house: { load: loadHouse, yaw: 0 },
  train: { load: loadTrain, yaw: -Math.PI / 2 },
}

export class Game {
  constructor(container) {
    this.container = container

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      300
    )

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.container.appendChild(this.renderer.domElement)

    this.input = new Input(this.renderer.domElement)
    this.player = new Player(this.camera, this.input)

    this.colliders = []
    this.doors = []
    this.ramps = []
    this.colliderHelpers = []
    this.model = null
    this.currentLevel = null
    this.levelRoot = null
    this.levelLoadId = 0
    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = DOOR_INTERACTION_RANGE
    this.interactionPrompt = document.getElementById('interactionPrompt')
    this.loaded = false

    this.clock = new THREE.Clock()
    this.fpsSamples = []
    this.started = false

    window.addEventListener('resize', () => this.onResize())
    this.loadLevel('house')
  }

  start() {
    if (!this.loaded) {
      console.warn('Model still loading...')
      return
    }
    this.started = true
    this.input.lock()
    this.animate()
  }

  animate() {
    if (!this.started) return
    requestAnimationFrame(() => this.animate())

    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.input.consumePressed('Digit1')) this.loadLevel('house')
    if (this.input.consumePressed('Digit2')) this.loadLevel('train')

    if (this.loaded) {
      updateDoors(this.doors, dt)
      this.model.updateMatrixWorld(true)
      const door = this.getLookedAtDoor()
      if (this.input.consumePressed('KeyE') && door) toggleDoor(door)
      if (this.input.consumePressed('KeyH')) {
        this.colliderHelpers.forEach((helper) => { helper.visible = !helper.visible })
      }
      if (this.input.consumePressed('KeyJ')) this.logNearbyWallColliders()
      this.updateInteractionPrompt(door)
      const doorColliders = getDoorColliders(this.doors)
      this.player.update(dt, [...this.colliders, ...this.ramps, ...doorColliders])
    }

    this.renderer.render(this.scene, this.camera)

    this.updateHud(dt)
  }

  loadLevel(levelName) {
    const level = LEVELS[levelName]
    if (!level) {
      console.warn(`Unknown level: ${levelName}`)
      return
    }
    if (this.currentLevel === levelName) return

    const loadId = ++this.levelLoadId
    this.unloadCurrentLevel()
    this.currentLevel = levelName
    this.levelRoot = new THREE.Group()
    this.scene.add(this.levelRoot)
    console.log(`Loading level: ${levelName}`)

    const levelRoot = this.levelRoot
    level.load(levelRoot)
      .then(({ colliders, colliderHelpers, doors, ramps, model, spawn, modelSize }) => {
        if (loadId !== this.levelLoadId) {
          disposeLevel(levelRoot)
          return
        }

        this.colliders = colliders
        this.colliderHelpers = colliderHelpers
        this.doors = doors
        this.ramps = ramps
        this.model = model
        this.player.reset(spawn, level.yaw)

        const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z)
        this.camera.far = Math.max(maxDim * 2, 300)
        this.camera.updateProjectionMatrix()

        this.loaded = true
        console.log(`${levelName} loaded`)
      })
      .catch((err) => {
        if (loadId !== this.levelLoadId) return
        console.error('Level load failed:', err)
        this.unloadCurrentLevel()
        this.currentLevel = null
      })
  }

  unloadCurrentLevel() {
    if (this.levelRoot) disposeLevel(this.levelRoot)
    this.levelRoot = null
    this.colliders = []
    this.colliderHelpers = []
    this.doors = []
    this.ramps = []
    this.model = null
    this.loaded = false
    this.input.clear()
    this.interactionPrompt.classList.add('hidden')
  }

  updateHud(dt) {
    this.fpsSamples.push(1 / dt)
    if (this.fpsSamples.length > 20) this.fpsSamples.shift()
    const avg =
      this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length

    const pos = this.player.position
    document.getElementById('hudPos').textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(
      1
    )}, ${pos.z.toFixed(1)}`
    document.getElementById('hudFps').textContent = avg.toFixed(0)
    document.getElementById('hudMode').textContent = this.player.flying ? 'FLY' : 'WALK'
  }

  getLookedAtDoor() {
    if (!this.input.isLocked || !this.model) return null

    this.raycaster.setFromCamera(new THREE.Vector2(), this.camera)
    const [hit] = this.raycaster.intersectObject(this.model, true)
    if (!hit) return null

    let object = hit.object
    while (object) {
      const door = this.doors.find(({ object: controller }) => controller === object)
      if (door) return door
      object = object.parent
    }
    return null
  }

  updateInteractionPrompt(door) {
    if (!door) {
      this.interactionPrompt.classList.add('hidden')
      return
    }
    this.interactionPrompt.textContent = door.isOpen ? 'Press E to close' : 'Press E to open'
    this.interactionPrompt.classList.remove('hidden')
  }

  logNearbyWallColliders() {
    const position = this.player.position
    const nearby = this.colliders
      .filter((collider) => collider.type === 'wall')
      .filter((collider) => {
        const nearestX = THREE.MathUtils.clamp(position.x, collider.minX, collider.maxX)
        const nearestZ = THREE.MathUtils.clamp(position.z, collider.minZ, collider.maxZ)
        return Math.hypot(position.x - nearestX, position.z - nearestZ) <= 1.5
      })
      .map((collider) => ({
        axis: collider.maxX - collider.minX >= collider.maxZ - collider.minZ ? 'x' : 'z',
        minX: collider.minX.toFixed(2),
        maxX: collider.maxX.toFixed(2),
        minZ: collider.minZ.toFixed(2),
        maxZ: collider.maxZ.toFixed(2),
        minY: collider.minY.toFixed(2),
        maxY: collider.maxY.toFixed(2),
      }))
    console.log('Nearby wall colliders:', position)
    console.table(nearby)
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }
}

function disposeLevel(levelRoot) {
  if (levelRoot.parent) levelRoot.parent.remove(levelRoot)

  const geometries = new Set()
  const materials = new Set()
  levelRoot.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material))
    else if (object.material) materials.add(object.material)
  })

  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) value.dispose()
    })
    material.dispose()
  })
  levelRoot.clear()
}
