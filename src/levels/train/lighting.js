import * as THREE from 'three'
import { addLevelLights } from '../shared/lighting.js'

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

const CARRIAGE_02_PRESETS = [
  {
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
    label: 'Dark/Broken',
    lights: [
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
      { color: 0x554433, intensity: 0.12 },
      { color: 0x554433, intensity: 0.1 },
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
      { color: 0x554433, intensity: 0.08 },
      null,
    ],
  },
]

class CarriageLightController {
  constructor(carriageGroup, lights, helpers, presets) {
    this.group = carriageGroup
    this.lights = lights
    this.helpers = helpers
    this.presets = presets

    this.states = lights.map(light => ({
      baseColor: light.color.clone(),
      baseIntensity: light.intensity,
      flicker: null,
      broken: light.intensity === 0,
    }))

    this.cutOut = false
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

        this.lights[i].intensity =
          f.minIntensity + (flick + noise) * range
      }
    }
  }

  cut() {
    this.cutOut = true

    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i].visible = false
      this.lights[i].intensity = 0
      this.states[i].broken = true
      this.states[i].flicker = null
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

    for (const label of this._debugLabels || []) {
      this.group.remove(label)
      label.material.map?.dispose()
      label.material.dispose()
    }
  }
}

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

  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
  })

  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2, 0.5, 1)
  sprite.position.copy(light.position)
  sprite.position.y += 0.4
  sprite.renderOrder = 999

  return sprite
}

const SKY_RADIUS = 200

function addTrainNightSky(level) {
  const sky = new THREE.Group()
  sky.name = 'train-night-sky'

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,

    uniforms: {
      zenith: {
        value: new THREE.Color(0x070c16),
      },
      horizon: {
        value: new THREE.Color(0x1b222b),
      },
      moonDirection: {
        value: new THREE.Vector3(50, 60, -80).normalize(),
      },
    },

    vertexShader: `
      varying vec3 vDirection;

      void main() {
        vDirection = position;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 moonDirection;

      varying vec3 vDirection;

      float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);

        f = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(
            mix(
              hash(i),
              hash(i + vec3(1.0, 0.0, 0.0)),
              f.x
            ),
            mix(
              hash(i + vec3(0.0, 1.0, 0.0)),
              hash(i + vec3(1.0, 1.0, 0.0)),
              f.x
            ),
            f.y
          ),
          mix(
            mix(
              hash(i + vec3(0.0, 0.0, 1.0)),
              hash(i + vec3(1.0, 0.0, 1.0)),
              f.x
            ),
            mix(
              hash(i + vec3(0.0, 1.0, 1.0)),
              hash(i + vec3(1.0, 1.0, 1.0)),
              f.x
            ),
            f.y
          ),
          f.z
        );
      }

      float fbm(vec3 p) {
        float n = 0.0;
        float a = 0.5;

        for (int i = 0; i < 5; i++) {
          n += a * noise(p);
          p = p * 2.03 + vec3(7.1, 3.7, 1.9);
          a *= 0.5;
        }

        return n;
      }

      void main() {
        vec3 d = normalize(vDirection);
        float elevation = max(d.y, 0.0);

        vec3 color = mix(
          horizon,
          zenith,
          pow(smoothstep(0.0, 0.85, elevation), 0.55)
        );

        float moonDot = clamp(
          dot(d, moonDirection),
          -1.0,
          1.0
        );

        float halo = exp(-(1.0 - moonDot) * 240.0);
        color += vec3(0.011, 0.013, 0.017) * halo;

        vec3 grid = d * 390.0;
        vec3 cell = floor(grid);

        vec3 offset = vec3(
          hash(cell + 3.0),
          hash(cell + 17.0),
          hash(cell + 41.0)
        );

        float star = exp(
          -dot(
            fract(grid) - offset,
            fract(grid) - offset
          ) * 150.0
        );

        star *=
          step(0.986, hash(cell)) *
          smoothstep(0.06, 0.4, elevation);

        color +=
          vec3(0.46, 0.50, 0.57) *
          star *
          (0.25 + 0.75 * hash(cell + 8.0));

        vec3 right = normalize(
          cross(moonDirection, vec3(0.0, 1.0, 0.0))
        );

        vec3 up = cross(right, moonDirection);

        vec2 m = vec2(
          dot(d, right),
          dot(d, up)
        ) / 0.012;

        float r2 = dot(m, m);
        float disc = 1.0 - smoothstep(0.94, 1.0, r2);

        if (moonDot > 0.0 && r2 < 1.0) {
          vec3 normal = vec3(
            m,
            sqrt(max(0.0, 1.0 - r2))
          );

          float shade = max(
            0.0,
            dot(
              normal,
              normalize(vec3(-0.35, 0.2, 0.92))
            )
          );

          float maria = smoothstep(
            0.35,
            0.62,
            fbm(vec3(m * 4.2, 6.1))
          );

          float relief = fbm(vec3(m * 38.0, 9.0));

          vec3 lunar =
            vec3(0.53, 0.55, 0.57) *
            (0.55 + maria * 0.25 + relief * 0.2) *
            (0.12 + shade * 0.88);

          color = mix(color, lunar, disc);
        }

        vec3 cloudP =
          d * vec3(5.0, 15.0, 5.0) +
          vec3(12.0, 3.0, 7.0);

        float clouds = smoothstep(
          0.40,
          0.72,
          fbm(cloudP)
        );

        clouds *= smoothstep(-0.05, 0.18, d.y);

        vec3 cloudColor = mix(
          horizon * 0.58,
          vec3(0.023, 0.027, 0.033),
          halo * 0.6
        );

        color = mix(color, cloudColor, clouds * 0.88);

        gl_FragColor = vec4(color, 1.0);

        #include <colorspace_fragment>
      }
    `,
  })

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 48, 32),
    material,
  )

  dome.name = 'sky-dome'
  dome.renderOrder = -100

  sky.add(dome)
  level.add(sky)

  return sky
}

export function createCarriageLights(
  carriageGroup,
  carriageType = '02',
  instanceIndex = 0,
  { lit = true, presetIndex = instanceIndex } = {},
) {
  const lights = []
  const helpers = []

  let color
  let intensity
  let distance
  let decay
  let positions
  let presetOverrides
  let flickerOverrides

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

    const preset = CARRIAGE_02_PRESETS[
      presetIndex % CARRIAGE_02_PRESETS.length
    ]

    distance = base.distance
    decay = base.decay
    positions = base.positions
    presetOverrides = preset.lights
    flickerOverrides = preset.flicker || null
  }

  const presets = []

  const selected = !lit
    ? []
    : positions
      .map((_, index) => index)
      .filter(index =>
        index % 2 === 0 &&
        (!presetOverrides || presetOverrides[index] !== null),
      )

  for (const i of selected) {
    const cfg = positions[i]
    const override = presetOverrides?.[i]
    const lightColor = override?.color ?? color ?? 0xffcc88

    const lightIntensity =
      (override?.intensity ?? intensity) *
      (carriageType === '01' ? 1 : 1.35)

    const light = new THREE.PointLight(
      lightColor,
      lightIntensity,
      carriageType === '01' ? 16 : 26,
      carriageType === '01' ? decay : 1.4,
    )

    light.position.set(cfg.x, cfg.y, cfg.z)
    light.castShadow = false
    light.name = `carriage_light_${i}`

    carriageGroup.add(light)
    lights.push(light)

    presets.push({
      color: lightColor,
      intensity: lightIntensity,
    })
  }

  const controller = new CarriageLightController(
    carriageGroup,
    lights,
    helpers,
    presets,
  )

  if (flickerOverrides) {
    selected.forEach((sourceIndex, lightIndex) => {
      if (flickerOverrides[sourceIndex]) {
        controller.setFlicker(
          lightIndex,
          flickerOverrides[sourceIndex],
        )
      }
    })
  }

  controller._debugLabels = []

  controller._debugInfo = {
    carriageGroup,
    carriageType,
    instanceIndex,
    positions,
    selected,
  }

  return controller
}

export function disposeCarriageLights(carriageGroup) {
  const toRemove = []

  carriageGroup.traverse(child => {
    if (child.isLight || child.isSprite) {
      toRemove.push(child)
    }
  })

  for (const obj of toRemove) {
    carriageGroup.remove(obj)
    if (obj.dispose) obj.dispose()
  }
}

export function toggleCarriageLightDebug(controllers, visible) {
  for (const ctrl of controllers) {
    if (visible && ctrl.helpers.length === 0) {
      const {
        carriageGroup,
        carriageType,
        instanceIndex,
        positions,
        selected,
      } = ctrl._debugInfo

      ctrl.lights.forEach((light, index) => {
        const helper = new THREE.PointLightHelper(light, 0.3)
        carriageGroup.add(helper)
        ctrl.helpers.push(helper)

        const sourceIndex = selected[index]
        const pos = positions[sourceIndex]

        const label = createDebugLabel(
          light,
          `C${carriageType}-${instanceIndex} L${sourceIndex}\n${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
        )

        carriageGroup.add(label)
        ctrl._debugLabels.push(label)
      })
    }

    for (const helper of ctrl.helpers) {
      helper.visible = visible
    }

    for (const label of ctrl._debugLabels) {
      label.visible = visible
    }
  }
}


/**
 * Compile every light-count state the train reaches while playing, so the
 * carriage light cut and the front carriage cull are program-cache hits
 * instead of a synchronous recompile of every material mid-frame.
 *
 * Each pass changes exactly one thing from the previous pass, so a pass only
 * compiles the variant that is not in the cache yet.
 *
 * @param {object} opts
 * @param {CarriageLightController[]} [opts.controllers]
 * @param {THREE.Object3D|null} [opts.glowGroup] - group holding the rite glow, culled with the front carriage
 * @param {() => (void|Promise<void>)} opts.compile - run against the active render target
 */
export async function prewarmTrainLightStates({ controllers = [], glowGroup = null, compile }) {
  const lights = []
  for (const controller of controllers) {
    if (!controller?.lights) continue
    for (const light of controller.lights) lights.push(light)
  }
  const lightVisibility = lights.map(light => light.visible)
  const glowVisibility = glowGroup ? glowGroup.visible : null
  try {
    // Starting state: spawn carriage lit, front carriage culled.
    if (glowGroup) glowGroup.visible = false
    await compile()

    // State after crossing the first boundary: the cut removed every
    // carriage point light from the GPU light list.
    for (const light of lights) light.visible = false
    await compile()

    // State near the front of the train: cut lights plus the rite glow.
    if (glowGroup) {
      glowGroup.visible = true
      await compile()
    }
  } finally {
    for (let i = 0; i < lights.length; i++) lights[i].visible = lightVisibility[i]
    if (glowGroup) glowGroup.visible = glowVisibility
  }
}

export function setupTrainLighting(level, model, size) {
  const { moon } = addLevelLights(level, size)
  moon.castShadow = false

  const sky = addTrainNightSky(level)

  return {
    lightHelpers: [],
    sky,
  }
}