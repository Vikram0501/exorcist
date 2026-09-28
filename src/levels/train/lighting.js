import * as THREE from 'three'
import { addLevelLights } from '../shared/lighting.js'


// ── Per-type light configs ──────────────────────────────

const CARRIAGE_01_CONFIG = {
  color: 0x8b0000,
  intensity: 0.65,
  distance: 3.5,
  decay: 1.8,
  positions: [
    { x: 2.84, y: 2.6, z: 10.88 },
    { x: 2.84, y: 2.6, z: 16.88 },
    { x: 2.84, y: 2.6, z: 19.88 },
  ],
}

const CARRIAGE_02_BASE = {
  distance: 3.5,
  decay: 1.8,
  positions: [
    { x: 3.98, y: 2.6, z: 7.60 },
    { x: 1.75, y: 2.6, z: 7.60 },
    { x: 1.75, y: 2.6, z: 5.60 },
    { x: 1.75, y: 2.6, z: 3.60 },
    { x: 1.75, y: 2.6, z: 1.60 },
    { x: 3.98, y: 2.6, z: 1.60 },
    { x: 3.98, y: 2.6, z: 0.60 },
    { x: 3.98, y: 2.6, z: -1.60 },
    { x: 3.98, y: 2.6, z: -2.60 },
    { x: 3.98, y: 2.6, z: -3.60 },
    { x: 3.98, y: 2.6, z: -5.60 },
    { x: 1.75, y: 2.6, z: -5.60 },
    { x: 2.84, y: 2.6, z: -9.60 },
    { x: 2.84, y: 2.6, z: -11.60 },
    { x: 2.84, y: 2.6, z: -13.60 },
    { x: 2.84, y: 2.6, z: -15.60 },
    { x: 2.84, y: 2.6, z: -17.60 },
    { x: 2.84, y: 2.6, z: -19.60 },
    { x: 2.84, y: 2.6, z: -21.60 },

    { x: 2.84, y: 5.51, z: -22.95 },
    { x: 3.93, y: 5.51, z: -21.83 },
    { x: 3.93, y: 5.51, z: -19.83 },
    { x: 3.93, y: 5.51, z: -17.83 },
    { x: 3.93, y: 5.51, z: -15.83 },
    { x: 1.54, y: 5.51, z: -15.83 },
    { x: 1.54, y: 5.51, z: -13.83 },
    { x: 1.54, y: 5.51, z: -11.83 },
    { x: 1.54, y: 5.51, z: -9.83 },
    { x: 3.58, y: 5.51, z: -9.83 },
  ],
}

// Per-instance presets for the 4 carriage 02 instances.
// Each overrides color/intensity for some or all of the 5 lights.
const CARRIAGE_02_PRESETS = [
  {
    // Instance 0: Warm / Normal — the "safe" carriage
    label: 'Warm/Normal',
    lights: [
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },

      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
      { color: 0xffcc88, intensity: 0.4 },
    ],
  },
  {
    // Instance 1: Cold / Dim — uneasy atmosphere
    label: 'Cold/Dim',
    lights: [
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.18 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.18 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.18 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },

      { color: 0x8899bb, intensity: 0.18 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.2 },
      { color: 0x8899bb, intensity: 0.18 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
      { color: 0x8899bb, intensity: 0.15 },
    ],
  },
  {
    // Instance 2: Flickering — unstable lighting
    label: 'Flickering',
    lights: [
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },

      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.35 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },
      { color: 0xffaa66, intensity: 0.25 },
      { color: 0xffaa66, intensity: 0.3 },
    ],
    flicker: [
      { speed: 6, minIntensity: 0.1, maxIntensity: 0.45 },
      { speed: 9, minIntensity: 0.05, maxIntensity: 0.4 },
      { speed: 6, minIntensity: 0.1, maxIntensity: 0.45 },
      { speed: 9, minIntensity: 0.05, maxIntensity: 0.4 },
      null,
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },
      { speed: 6, minIntensity: 0.1, maxIntensity: 0.45 },
      { speed: 9, minIntensity: 0.05, maxIntensity: 0.4 },
      null,
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },
      { speed: 6, minIntensity: 0.1, maxIntensity: 0.45 },
      { speed: 9, minIntensity: 0.05, maxIntensity: 0.4 },
      null,
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },

      null,
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },
      { speed: 6, minIntensity: 0.1, maxIntensity: 0.45 },
      { speed: 9, minIntensity: 0.05, maxIntensity: 0.4 },
      null,
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },
      { speed: 12, minIntensity: 0.0, maxIntensity: 0.35 },
      { speed: 7, minIntensity: 0.08, maxIntensity: 0.4 },
    ],
  },
  {
    // Instance 3: Dark / Broken — 2 lights dead from start
    label: 'Dark/Broken',
    lights: [
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken

      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken
      { color: 0x554433, intensity: 0.08 },
      null, // broken
    ],
  },
]


// ── CarriageLightController ─────────────────────────────

class CarriageLightController {
  constructor(carriageGroup, lights, helpers, presets) {
    this.group = carriageGroup
    this.lights = lights
    this.helpers = helpers
    this.presets = presets

    // Per-light state
    this.states = lights.map((light, i) => {
      const p = presets[i]
      return {
        baseColor: light.color.clone(),
        baseIntensity: light.intensity,
        flicker: null,
        broken: light.intensity === 0,
      }
    })

    this._time = 0
  }

  update(dt) {
    this._time += dt
    for (let i = 0; i < this.lights.length; i++) {
      const state = this.states[i]
      if (state.broken) continue
      if (state.flicker) {
        const f = state.flicker
        const t = this._time * f.speed
        const range = f.maxIntensity - f.minIntensity
        const flick = Math.sin(t) * 0.5 + 0.5
        const noise = Math.random() * 0.1
        this.lights[i].intensity = f.minIntensity + (flick + noise) * range
      }
    }
  }

  setFlicker(lightIndex, config) {
    if (lightIndex < 0 || lightIndex >= this.lights.length) return
    this.states[lightIndex].flicker = config
    this.states[lightIndex].broken = false
  }

  breakLight(lightIndex) {
    if (lightIndex < 0 || lightIndex >= this.lights.length) return
    this.lights[lightIndex].intensity = 0
    this.states[lightIndex].broken = true
    this.states[lightIndex].flicker = null
  }

  repairLight(lightIndex) {
    if (lightIndex < 0 || lightIndex >= this.lights.length) return
    const state = this.states[lightIndex]
    state.broken = false
    this.lights[lightIndex].intensity = state.baseIntensity
  }

  setColor(lightIndex, hex) {
    if (lightIndex < 0 || lightIndex >= this.lights.length) return
    this.lights[lightIndex].color.set(hex)
  }

  setIntensity(lightIndex, value) {
    if (lightIndex < 0 || lightIndex >= this.lights.length) return
    this.lights[lightIndex].intensity = value
    this.states[lightIndex].baseIntensity = value
    this.states[lightIndex].broken = value === 0
  }

  resetAll() {
    for (let i = 0; i < this.lights.length; i++) {
      const state = this.states[i]
      this.lights[i].color.copy(state.baseColor)
      this.lights[i].intensity = state.baseIntensity
      state.flicker = null
      state.broken = state.baseIntensity === 0
    }
  }

  dispose() {
    for (const light of this.lights) {
      this.group.remove(light)
      if (light.dispose) light.dispose()
    }
    for (const helper of this.helpers) {
      this.group.remove(helper)
      if (helper.dispose) helper.dispose()
    }
  }
}


// ── Debug helpers ───────────────────────────────────────

function createDebugLabel(light, text) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, 256, 64)
  ctx.fillStyle = '#ffffff'
  ctx.font = '16px monospace'
  ctx.fillText(text, 8, 24)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2, 0.5, 1)
  sprite.position.copy(light.position)
  sprite.position.y += 0.4
  sprite.renderOrder = 999
  return sprite
}


// ── Procedural night sky ────────────────────────────────

const SKY_RADIUS = 200
const STAR_COUNT = 600

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function addTrainNightSky(level) {
  const sky = new THREE.Group()
  sky.name = 'train-night-sky'

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 32, 20),
    new THREE.MeshBasicMaterial({
      color: 0x040810,
      side: THREE.BackSide,
      fog: false,
    }),
  )
  dome.name = 'sky-dome'
  sky.add(dome)

  const starPositions = []
  const starColors = []

  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = seededRandom(i * 5 + 1) * Math.PI * 2
    const y = 0.2 + seededRandom(i * 5 + 2) * 0.8
    const horizontal = Math.sqrt(1 - y * y)
    const r = SKY_RADIUS - 2 - seededRandom(i * 5 + 3) * 8
    const brightness = 0.4 + seededRandom(i * 5 + 4) * 0.6

    starPositions.push(
      Math.cos(theta) * horizontal * r,
      y * r,
      Math.sin(theta) * horizontal * r,
    )
    starColors.push(
      brightness * 0.6,
      brightness * 0.75,
      brightness,
    )
  }

  const stars = new THREE.Points(
    new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
      .setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3)),
    new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    }),
  )
  stars.name = 'star-field'
  sky.add(stars)

  const moonTexture = new THREE.TextureLoader().load('/textures/haunted-moon.png')
  moonTexture.colorSpace = THREE.SRGBColorSpace

  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: moonTexture,
      color: 0xb7c0d1,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      fog: false,
    }),
  )
  moon.name = 'moon'
  moon.position.set(50, 60, -80)
  moon.scale.set(18, 18, 1)
  sky.add(moon)

  level.add(sky)
  return sky
}


// ── Public API ──────────────────────────────────────────

/**
 * Create lights for a carriage.
 * @param {THREE.Group} carriageGroup
 * @param {'01'|'02'} carriageType
 * @param {number} instanceIndex  - 0-3, only used for type '02'
 * @returns {CarriageLightController}
 */
export function createCarriageLights(carriageGroup, carriageType = '02', instanceIndex = 0) {
  const lights = []
  const helpers = []

  let color, intensity, distance, decay, positions, presetOverrides, flickerOverrides

  if (carriageType === '01') {
    const cfg = CARRIAGE_01_CONFIG
    color = cfg.color
    intensity = cfg.intensity
    distance = cfg.distance
    decay = cfg.decay
    positions = cfg.positions
    presetOverrides = null
    flickerOverrides = null
  } else {
    const base = CARRIAGE_02_BASE
    const preset = CARRIAGE_02_PRESETS[instanceIndex % CARRIAGE_02_PRESETS.length]
    distance = base.distance
    decay = base.decay
    positions = base.positions
    presetOverrides = preset.lights
    flickerOverrides = preset.flicker || null
  }

  const presets = []

  for (let i = 0; i < positions.length; i++) {
    const cfg = positions[i]
    const lightColor = (presetOverrides && presetOverrides[i])
      ? presetOverrides[i].color
      : color
    const lightIntensity = (presetOverrides && presetOverrides[i])
      ? presetOverrides[i].intensity
      : intensity

    const light = new THREE.PointLight(lightColor, lightIntensity, distance, decay)
    light.position.set(cfg.x, cfg.y, cfg.z)
    light.castShadow = false
    light.name = `carriage_light_${i}`
    carriageGroup.add(light)
    lights.push(light)
    presets.push({ color: lightColor, intensity: lightIntensity })

    const helper = new THREE.PointLightHelper(light, 0.3)
    helper.visible = false
    carriageGroup.add(helper)
    helpers.push(helper)
  }

  const controller = new CarriageLightController(carriageGroup, lights, helpers, presets)

  // Apply flicker overrides from preset
  if (flickerOverrides) {
    for (let i = 0; i < flickerOverrides.length; i++) {
      if (flickerOverrides[i]) {
        controller.setFlicker(i, flickerOverrides[i])
      }
    }
  }

  // Store debug label sprites (hidden by default)
  controller._debugLabels = []
  for (let i = 0; i < lights.length; i++) {
    const pos = positions[i]
    const label = createDebugLabel(
      lights[i],
      `C${carriageType}-${instanceIndex} L${i}\n${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`
    )
    label.visible = false
    carriageGroup.add(label)
    controller._debugLabels.push(label)
  }

  return controller
}


export function disposeCarriageLights(carriageGroup) {
  const toRemove = []
  carriageGroup.traverse((child) => {
    if (child.isLight || child.isSprite) {
      toRemove.push(child)
    }
  })
  for (const obj of toRemove) {
    carriageGroup.remove(obj)
    if (obj.dispose) obj.dispose()
  }
}


/**
 * Toggle debug visibility for all carriage light helpers and labels.
 * @param {CarriageLightController[]} controllers
 * @param {boolean} visible
 */
export function toggleCarriageLightDebug(controllers, visible) {
  for (const ctrl of controllers) {
    for (const helper of ctrl.helpers) {
      helper.visible = visible
    }
    for (const label of ctrl._debugLabels) {
      label.visible = visible
    }
  }
}


export function setupTrainLighting(level, model, size) {
  addLevelLights(level, size)
  const sky = addTrainNightSky(level)
  return { lightHelpers: [], sky }
}
