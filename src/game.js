import * as THREE from 'three'
import { Input } from './input.js'
import { Player } from './player.js'
import { loadHouse } from './levels/house.js'

export class Game {
  constructor(container) {
    this.container = container

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)
    this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 50)

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

    this.colliders = loadHouse(this.scene)

    this.clock = new THREE.Clock()
    this.fpsSamples = []
    this.started = false

    window.addEventListener('resize', () => this.onResize())
  }

  start() {
    this.started = true
    this.input.lock()
    this.animate()
  }

  animate() {
    if (!this.started) return
    requestAnimationFrame(() => this.animate())

    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.player.update(dt, this.colliders)
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
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }
}