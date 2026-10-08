import * as THREE from 'three'

// Lightweight track-relative particle effects for Level 3. Two Points
// systems (one draw call each): drift/speed smoke and landmark embers,
// plus slow smoke wisps sharing the smoke material. No textures to load
// (procedural DataTexture sprites), no lights, no shadows, no
// post-processing. All motion is computed on the CPU into preallocated
// buffers; dead particles park underground with zero alpha.

export const DRIFT_SMOKE_MAX = 64
export const EMBER_MAX = 48
export const WISP_MAX = 24

// Ember/smoke columns rise from damaged structures, clear of the road,
// barriers (|d| ~7.8), tires (|d| 10.7) and lamp strip (|d| 9).
export const EFFECT_EMITTERS = [
  { s: 70, d: -11.5, h: 0.4 }, // barrel fire on the pit apron
  { s: 100, d: 24, h: 0.3 }, // debris fire behind the pits
  { s: 626, d: 22.5, h: 0.3 }, // damaged fencing behind the left stand
  { s: 1035, d: -22.5, h: 0.3 }, // wreckage behind the drift stand
  { s: 120, d: -20, h: 0.2 }, // abandoned equipment fire
]

function hash(n) {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

// Soft radial sprite baked numerically: no canvas, no document, no assets.
function radialSprite(size, hardness) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const r = Math.hypot(dx, dy) * 2
      const grain = 0.85 + hash(x * 3.1 + y * 17.7) * 0.15
      const alpha = Math.max(0, 1 - Math.pow(r, hardness)) * grain
      const i = (y * size + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(Math.min(1, alpha) * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.needsUpdate = true
  return texture
}

function pointsSystem(max, map, color, blending, name) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(max * 3)
  const sizes = new Float32Array(max)
  const alphas = new Float32Array(max)
  for (let i = 0; i < max; i++) positions[i * 3 + 1] = -50
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(map, gl_PointCoord);
        if (tex.a * vAlpha < 0.004) discard;
        gl_FragColor = vec4(uColor, tex.a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending,
  })
  const points = new THREE.Points(geometry, material)
  points.name = name
  points.frustumCulled = false
  points.renderOrder = 5
  return points
}

function particlePool(max) {
  return {
    cursor: 0,
    accumulator: 0,
    pos: new Float32Array(max * 3),
    vel: new Float32Array(max * 3),
    life: new Float32Array(max).fill(1),
    maxLife: new Float32Array(max).fill(1),
    size: new Float32Array(max),
    growth: new Float32Array(max),
    alpha: new Float32Array(max),
    seed: new Float32Array(max),
  }
}

function spawn(pool, max, x, y, z, vx, vy, vz, life, size, growth, alpha, seed) {
  const i = pool.cursor
  pool.cursor = (pool.cursor + 1) % max
  pool.pos[i * 3] = x
  pool.pos[i * 3 + 1] = y
  pool.pos[i * 3 + 2] = z
  pool.vel[i * 3] = vx
  pool.vel[i * 3 + 1] = vy
  pool.vel[i * 3 + 2] = vz
  pool.life[i] = 0
  pool.maxLife[i] = life
  pool.size[i] = size
  pool.growth[i] = growth
  pool.alpha[i] = alpha
  pool.seed[i] = seed
}

function integrate(pool, max, dt, drag, buoyancy) {
  for (let i = 0; i < max; i++) {
    if (pool.life[i] >= pool.maxLife[i]) continue
    pool.life[i] += dt
    const damp = Math.max(0, 1 - drag * dt)
    pool.vel[i * 3] *= damp
    pool.vel[i * 3 + 2] *= damp
    pool.vel[i * 3 + 1] = pool.vel[i * 3 + 1] * damp + buoyancy * dt
    pool.pos[i * 3] += pool.vel[i * 3] * dt
    pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * dt
    pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt
    pool.size[i] += pool.growth[i] * dt
  }
}

function writeBuffers(pool, max, points) {
  const positions = points.geometry.getAttribute('position')
  const sizes = points.geometry.getAttribute('aSize')
  const alphas = points.geometry.getAttribute('aAlpha')
  for (let i = 0; i < max; i++) {
    if (pool.life[i] >= pool.maxLife[i]) {
      positions.setY(i, -50)
      alphas.setX(i, 0)
      continue
    }
    const t = pool.life[i] / pool.maxLife[i]
    positions.setXYZ(i, pool.pos[i * 3], pool.pos[i * 3 + 1], pool.pos[i * 3 + 2])
    sizes.setX(i, Math.max(0.01, pool.size[i]))
    // Fast fade-in, smooth fade-out.
    const envelope = Math.min(1, t * 6) * (1 - t * t)
    alphas.setX(i, Math.max(0, pool.alpha[i] * envelope))
  }
  positions.needsUpdate = true
  sizes.needsUpdate = true
  alphas.needsUpdate = true
}

function safeDt(dt) {
  return Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0
}

// ---- Drift + speed smoke (follows the player car) ----

export function createDriftSmoke(parent) {
  const points = pointsSystem(
    DRIFT_SMOKE_MAX,
    radialSprite(64, 2.2),
    0x6b5a55,
    THREE.NormalBlending,
    'driftSmoke'
  )
  parent.add(points)
  return { points, pool: particlePool(DRIFT_SMOKE_MAX) }
}

export function updateDriftSmoke(handle, dt, car) {
  const step = safeDt(dt)
  const { points, pool } = handle
  if (step > 0) {
    const intensity = THREE.MathUtils.clamp(car.driftFactor ?? 0, 0, 1) *
      THREE.MathUtils.clamp(Math.abs(car.slipAngle ?? 0) / 0.35, 0, 1)
    const speed = Math.abs(car.speed ?? 0)
    // Tire smoke while sliding; faint dust at very high speed.
    let rate = 0
    if (speed > 8) rate += intensity * 42
    if (speed > 26) rate += ((speed - 26) / 9) * 5 * (1 - intensity * 0.5)
    pool.accumulator += rate * step
    const forward = car.forward ?? new THREE.Vector3(0, 0, -1)
    const right = new THREE.Vector3(-forward.z, 0, forward.x)
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
    right.normalize()
    let guard = 0
    while (pool.accumulator >= 1 && guard++ < 8) {
      pool.accumulator -= 1
      const side = hash(pool.cursor * 13.7) > 0.5 ? 1 : -1
      const px = car.position.x - forward.x * 2.1 + right.x * side * 0.85
      const pz = car.position.z - forward.z * 2.1 + right.z * side * 0.85
      spawn(pool, DRIFT_SMOKE_MAX,
        px, car.position.y + 0.15, pz,
        -forward.x * (1 + speed * 0.04) + (hash(pool.cursor * 7.3) - 0.5) * 1.6,
        0.7 + hash(pool.cursor * 3.1) * 0.8,
        -forward.z * (1 + speed * 0.04) + (hash(pool.cursor * 9.7) - 0.5) * 1.6,
        0.5 + hash(pool.cursor * 5.9) * 0.4,
        0.7, 2.2, 0.16 + intensity * 0.2, pool.cursor)
    }
    if (pool.accumulator > 4) pool.accumulator = 4
    integrate(pool, DRIFT_SMOKE_MAX, step, 1.6, 0.5)
  }
  writeBuffers(pool, DRIFT_SMOKE_MAX, points)
}

// ---- Landmark embers + occasional smoke wisps (track-relative) ----

export function createLandmarkAtmosphere(track, parent) {
  const embers = pointsSystem(
    EMBER_MAX, radialSprite(32, 1.4), 0xff7a2a, THREE.AdditiveBlending, 'landmarkEmbers'
  )
  const wisps = pointsSystem(
    WISP_MAX, radialSprite(64, 2.6), 0x4a4442, THREE.NormalBlending, 'landmarkWisps'
  )
  parent.add(embers, wisps)
  const stations = EFFECT_EMITTERS
    .filter((emitter) => emitter.s < track.totalLength)
    .map((emitter) => ({
      ...emitter,
      position: track.toWorld(emitter.s, emitter.d, emitter.h),
    }))
  return {
    embers,
    wisps,
    stations,
    emberPool: particlePool(EMBER_MAX),
    wispPool: particlePool(WISP_MAX),
  }
}

export function updateLandmarkAtmosphere(handle, dt, time, playerS) {
  void playerS
  const step = safeDt(dt)
  if (step > 0) {
    // Steady low burn everywhere: near emitters read clearly, far ones
    // smoulder without popping when the player arrives.
    handle.emberPool.accumulator += step * 7
    let guard = 0
    while (handle.emberPool.accumulator >= 1 && guard++ < 4) {
      handle.emberPool.accumulator -= 1
      const station = handle.stations[Math.floor(hash(time * 13.7 + guard * 7.1) * handle.stations.length) % handle.stations.length]
      if (!station) continue
      spawn(handle.emberPool, EMBER_MAX,
        station.position.x + (hash(guard * 3.3 + time) - 0.5) * 1.2,
        station.position.y,
        station.position.z + (hash(guard * 5.1 + time) - 0.5) * 1.2,
        (hash(guard * 7.7) - 0.5) * 0.6,
        1.1 + hash(guard * 9.2) * 1.1,
        (hash(guard * 11.3) - 0.5) * 0.6,
        1.6 + hash(guard * 13.9) * 1.4,
        0.14, 0.02, 0.85, guard + time % 1)
    }
    if (handle.emberPool.accumulator > 4) handle.emberPool.accumulator = 4
    handle.wispPool.accumulator += step * 1.6
    guard = 0
    while (handle.wispPool.accumulator >= 1 && guard++ < 2) {
      handle.wispPool.accumulator -= 1
      const station = handle.stations[Math.floor(hash(time * 7.3 + guard * 3.7) * handle.stations.length) % handle.stations.length]
      if (!station) continue
      spawn(handle.wispPool, WISP_MAX,
        station.position.x, station.position.y + 0.5, station.position.z,
        (hash(guard * 17.1) - 0.5) * 0.4, 0.45 + hash(guard * 19.3) * 0.3, (hash(guard * 23.7) - 0.5) * 0.4,
        4 + hash(guard * 29.1) * 2, 1.4, 0.55, 0.10, guard)
    }
    if (handle.wispPool.accumulator > 2) handle.wispPool.accumulator = 2
    integrate(handle.emberPool, EMBER_MAX, step, 0.4, 0.35)
    integrate(handle.wispPool, WISP_MAX, step, 0.25, 0.12)
  }
  // Ember flicker: fast shimmer around the integrated fade.
  writeBuffers(handle.emberPool, EMBER_MAX, handle.embers)
  const emberAlphas = handle.embers.geometry.getAttribute('aAlpha')
  for (let i = 0; i < EMBER_MAX; i++) {
    if (handle.emberPool.life[i] >= handle.emberPool.maxLife[i]) continue
    emberAlphas.setX(i, emberAlphas.getX(i) * (0.72 + 0.28 * Math.sin(time * 17 + handle.emberPool.seed[i] * 21)))
  }
  emberAlphas.needsUpdate = true
  writeBuffers(handle.wispPool, WISP_MAX, handle.wisps)
}
