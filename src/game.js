import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'
import { getDoorColliders, loadHouse, toggleDoor, updateDoors } from './levels/house.js'

const DOOR_INTERACTION_RANGE = 2

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
    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = DOOR_INTERACTION_RANGE
    this.interactionPrompt = document.getElementById('interactionPrompt')
    this.loaded = false

    loadHouse(this.scene)
      .then(({ colliders, colliderHelpers, doors, ramps, model, spawn, modelSize }) => {
        this.colliders = colliders
        this.colliderHelpers = colliderHelpers
        this.doors = doors
        this.ramps = ramps
        this.model = model
        this.player.position.set(spawn.x, 1.7, spawn.z)

        const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z)
        this.camera.far = Math.max(maxDim * 2, 300)
        this.camera.updateProjectionMatrix()

        this.loaded = true
      })
      .catch((err) => {
        console.error('Level load failed:', err)
      })

    this.clock = new THREE.Clock()
    this.fpsSamples = []
    this.started = false

    window.addEventListener('resize', () => this.onResize())
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
    this.renderer.render(this.scene, this.camera)

    this.updateHud(dt)
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
