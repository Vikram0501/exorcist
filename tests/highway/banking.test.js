import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  TRACK_BANK_MAX_ANGLE,
  createDefaultTrack,
} from '../../src/levels/highway/track.js'
import { createHighwayRoad } from '../../src/levels/highway/road.js'
import {
  CAR_RIDE_HEIGHT,
  HighwayCarController,
} from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { createRoadSigns } from '../../src/levels/highway/signs.js'

const DEG = 180 / Math.PI

function withStubs(fn) {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: (tag) => ({ style: {}, remove() {}, width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
    body: { appendChild() {} },
  }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

async function loadLevel() {
  const assets = new Map(await Promise.all(
    [
      '/models/highway.glb',
      '/models/player_car.glb',
      '/models/ghost_car.glb',
      '/models/street_city_buildings_8.glb',
      '/models/street_lamp.glb',
      '/models/zombie.glb',
      '/models/zombie_doom_scientist.glb',
      '/models/barbed_wire.glb',
    ].map(async (url) =>
      [url, await readFile(new URL(`../../public${url}`, import.meta.url))])
  ))
  const originalLoad = GLTFLoader.prototype.loadAsync
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  GLTFLoader.prototype.loadAsync = async function (url) {
    const bytes = assets.get(url)
    const loader = new GLTFLoader()
    loader.register(() => ({ name: 'TEST_IMAGE', loadTexture: async () => new THREE.Texture() }))
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  }
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: (tag) => ({ style: {}, remove() {}, width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
    body: { appendChild() {} },
  }
  try {
    return await createHighwayLevel(new THREE.Group())
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

// Bank is ~0 on straights (discovered, not pinned: the start and
// finish straights must read level wherever the geometry puts them).
test('bank is zero on straights', () => withStubs(() => {
  const track = createDefaultTrack()
  const calm = []
  for (let s = 10; s < track.totalLength - 10; s += 5) {
    let peak = 0
    for (let k = -30; k <= 30; k += 5) {
      peak = Math.max(peak, Math.abs(track.sampleBank(s + k)))
    }
    if (peak < 1 / DEG) calm.push(s)
  }
  assert.ok(calm.length > 5, 'genuine level stretches exist')
  assert.ok(
    calm.some((s) => s < 120),
    'the start straight stays level'
  )
  // The finish straight may carry a whisper of the final sweeper's
  // camber through bank smoothing; it must stay nearly level.
  let finishCalm = Infinity
  for (let s = track.totalLength - 100; s <= track.totalLength - 10; s += 5) {
    finishCalm = Math.min(finishCalm, Math.abs(track.sampleBank(s)))
  }
  assert.ok(
    finishCalm < 3.5 / DEG,
    `finish straight nearly level (${(finishCalm * DEG).toFixed(2)}deg)`
  )
  for (const s of [calm[0], calm[calm.length - 1]]) {
    assert.ok(
      Math.abs(track.sampleAt(s).bank) < 1 / DEG,
      `straight at s=${s.toFixed(0)} stays level`
    )
  }
}))

// Bank direction matches the curve direction (outer edge up), checked
// at the actual strongest turns in each direction.
test('bank direction matches curve direction', () => withStubs(() => {
  const track = createDefaultTrack()
  let rightS = 0
  let rightBank = 0
  let leftS = 0
  let leftBank = 0
  for (let s = 0; s <= track.totalLength; s += 2) {
    const bank = track.sampleBank(s)
    if (bank < rightBank) {
      rightBank = bank
      rightS = s
    }
    if (bank > leftBank) {
      leftBank = bank
      leftS = s
    }
  }
  // Strongest right turn: +d (right/inner) side lower.
  assert.ok(rightBank < -5 / DEG, `a real right corner exists (${(rightBank * DEG).toFixed(1)}deg)`)
  {
    const f = track.sampleAt(rightS)
    assert.ok(f.lateral.y < -0.05, 'inner (+d) edge lower on a right turn')
  }
  // Strongest left turn: mirror image.
  assert.ok(leftBank > 3 / DEG, `a real left corner exists (${(leftBank * DEG).toFixed(1)}deg)`)
  {
    const f = track.sampleAt(leftS)
    assert.ok(f.lateral.y > 0.03, 'inner (-d) edge lower on a left turn')
  }
}))

// The hero drift corner carries the strongest banking (6-10 deg band).
test('hero corner has the strongest meaningful banking', () => withStubs(() => {
  const track = createDefaultTrack()
  let peak = 0
  let peakS = 0
  for (let s = 0; s <= track.totalLength; s += 2) {
    const bank = Math.abs(track.sampleBank(s))
    if (bank > peak) {
      peak = bank
      peakS = s
    }
  }
  assert.ok(
    peak > 6 / DEG && peak < 10 / DEG,
    `hero banks ${(peak * DEG).toFixed(1)}deg at s=${peakS.toFixed(0)}`
  )
  // Mid-race or later: not the opening sweeper.
  assert.ok(
    peakS > track.totalLength * 0.4,
    `hero sits in the second half (s=${peakS.toFixed(0)})`
  )
}))

// Bank transitions are smooth (no abrupt roll).
test('bank transitions are smooth', () => withStubs(() => {
  const track = createDefaultTrack()
  let maxStep = 0
  let prev = track.sampleAt(0).bank
  for (let s = 2; s <= track.totalLength; s += 2) {
    const bank = track.sampleAt(s).bank
    maxStep = Math.max(maxStep, Math.abs(bank - prev))
    prev = bank
  }
  assert.ok(
    maxStep < 0.5 / DEG,
    `no abrupt roll, max 2 m step=${(maxStep * DEG).toFixed(3)}deg`
  )
}))

// Maximum bank stays within the arcade-safe envelope.
test('maximum bank remains safe', () => withStubs(() => {
  const track = createDefaultTrack()
  let maxBank = 0
  for (let s = 0; s <= track.totalLength; s += 2) {
    maxBank = Math.max(maxBank, Math.abs(track.sampleAt(s).bank))
  }
  assert.ok(
    maxBank <= TRACK_BANK_MAX_ANGLE + 1e-9,
    `capped, max=${(maxBank * DEG).toFixed(2)}deg`
  )
  assert.ok(
    maxBank > 5 / DEG,
    `strong corner genuinely banks, max=${(maxBank * DEG).toFixed(2)}deg`
  )
  assert.ok(maxBank < 11 / DEG, 'restrained, far from extreme')
}))

// Road width is preserved across banking (unit lateral).
test('road width is preserved under banking', () => withStubs(() => {
  const track = createDefaultTrack()
  const shape = new THREE.Shape()
  shape.moveTo(-10, -7)
  shape.lineTo(10, -7)
  shape.lineTo(10, 7)
  shape.lineTo(-10, 7)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(),
    roughness: 0.9,
  })
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(geometry, material))
  const road = createHighwayRoad(scene, {
    sampleAtDistance: (d) => track.sampleAt(d),
    arcLengths: track.arcLengths,
    roadWidth: 14,
  })
  for (const tile of [road.children[5], road.children[20], road.children[35]]) {
    const p = tile.geometry.getAttribute('position')
    const n = tile.geometry.getAttribute('normal')
    for (let v = 0; v < p.count; v += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(p, v)
      const b = new THREE.Vector3().fromBufferAttribute(p, v + 1)
      assert.ok(
        Math.abs(a.distanceTo(b) - 14) < 0.02,
        `full width kept, got ${a.distanceTo(b).toFixed(3)}`
      )
      // Normals follow the banked up, never flip.
      const na = new THREE.Vector3().fromBufferAttribute(n, v)
      assert.ok(na.y > 0.97, 'upward banked normal')
      assert.ok(Math.abs(na.length() - 1) < 1e-6, 'unit normal')
    }
  }
}))

// Banked car seating: cross-slope height differs across the road,
// checked at the strongest banked station found on the track.
test('player seating follows the banked cross-slope', () => withStubs(() => {
  const track = createDefaultTrack()
  let peakS = 0
  let peak = 0
  for (let s = 0; s <= track.totalLength; s += 2) {
    const bank = Math.abs(track.sampleBank(s))
    if (bank > peak) {
      peak = bank
      peakS = s
    }
  }
  assert.ok(peak > 5 / DEG, 'precondition: real banking exists')
  const car = new THREE.Object3D()
  const camera = new THREE.PerspectiveCamera()
  const c = new HighwayCarController(car, camera, track, null)
  c.placeAt(peakS, 5)
  const plusY = car.position.y
  c.placeAt(peakS, -5)
  const minusY = car.position.y
  assert.ok(
    Math.abs(plusY - minusY) > 0.5,
    `cross-slope reads, +5d=${plusY.toFixed(2)} -5d=${minusY.toFixed(2)}`
  )
  assert.ok(
    Math.abs(plusY - track.toWorld(peakS, 5, CAR_RIDE_HEIGHT).y) < 1e-9,
    'exact banked seating'
  )
  c.dispose()
}))

// Visual bank roll combines with (not replaces) drift roll.
test('car visual rolls with banking, physics stays yaw-only', () => withStubs(() => {
  const track = createDefaultTrack()
  const car = new THREE.Group()
  car.add(new THREE.Group())
  const camera = new THREE.PerspectiveCamera()
  const c = new HighwayCarController(car, camera, track, null)
  c.setDrivingEnabled(true)
  // Seed on the strongest banked stretch so the visual roll reads.
  let peakS = 0
  let peak = 0
  for (let s = 0; s <= track.totalLength; s += 2) {
    const bank = Math.abs(track.sampleBank(s))
    if (bank > peak) {
      peak = bank
      peakS = s
    }
  }
  c.placeAt(Math.max(0, peakS - 40), -2)
  for (let i = 0; i < 120; i++) {
    c.keys = { KeyW: true }
    c.update(1 / 60)
  }
  const frame = track.sampleAt(c.pathProgress)
  const visual = car.children[0]
  const align = Math.cos(c.heading - frame.angle)
  const expectedBank = frame.bank * align
  assert.ok(
    Math.abs(expectedBank) > 0.03,
    'precondition: banked corner with an aligned car'
  )
  // Drift roll is bounded tiny; the bulk of visual roll is banking.
  const driftOnly = THREE.MathUtils.clamp(
    -c.steerInput * 0.02 - c.slipAngle * c.driftFactor * 0.04,
    -0.06,
    0.06
  )
  assert.ok(
    Math.abs(visual.rotation.z - (driftOnly + expectedBank)) < 1e-9,
    `bank adds to drift roll, got ${visual.rotation.z.toFixed(3)}`
  )
  assert.equal(car.rotation.x, 0, 'physics root never pitches')
  assert.equal(car.rotation.z, 0, 'physics root never rolls')
  c.dispose()
}))

// Ghost seating + visual roll on banking.
test('ghost seating and roll follow banking', () => withStubs(() => {
  const originalDocument = globalThis.document
  globalThis.document = {
    createElement: (tag) => ({ style: {}, remove() {}, width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
    body: { appendChild() {} },
  }
  try {
    const track = createDefaultTrack()
    const player = new HighwayCarController(
      new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
    )
    const ghostCar = new THREE.Group()
    ghostCar.add(new THREE.Group())
    const race = new HighwayRaceController(
      player, ghostCar, -880, 'TEST', null, new THREE.Scene(),
      track, null, track.totalLength
    )
    let peakS = 0
    let peak = 0
    for (let s = 0; s <= track.totalLength; s += 2) {
      const bank = Math.abs(track.sampleBank(s))
      if (bank > peak) {
        peak = bank
        peakS = s
      }
    }
    race.ghostPathProgress = peakS
    race.ghostLateralOffset = -2
    race.seatGhostFromTrack()
    const expected = track.toWorld(peakS, -2, CAR_RIDE_HEIGHT)
    assert.ok(
      ghostCar.position.distanceTo(expected) < 1e-9,
      'ghost rides the banked cross-section'
    )
    const visual = ghostCar.children[0]
    assert.ok(
      Math.abs(visual.rotation.z - track.sampleAt(peakS).bank) < 1e-9,
      'ghost visual rolls with the road'
    )
    player.dispose()
    race.dispose()
  } finally {
    globalThis.document = originalDocument
  }
}))

// Barriers follow banking in position and roll (built level).
test('barriers follow banking', async () => {
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    const level = await loadLevel()
    const track = level.track
    const barriers = []
    level.model.traverse((object) => {
      if (!object.isMesh) return
      const size = object.geometry.parameters
      if (size && size.width === 0.4 && size.height === 1) {
        barriers.push(object)
      }
    })
    assert.ok(barriers.length > 100, 'barrier field built')
    // Banked-corner barriers discovered from the bank profile (no pinned
    // stations). Pairs are added left (+7.2) then right (-7.2) per
    // 10 m station.
    let peakS = 0
    let peak = 0
    for (let s = 0; s <= track.totalLength; s += 2) {
      const bank = Math.abs(track.sampleBank(s))
      if (bank > peak) {
        peak = bank
        peakS = s
      }
    }
    assert.ok(peak > 5 / DEG, 'precondition: banked corner exists')
    let checked = 0
    for (let k = 0; k < barriers.length; k += 2) {
      const s = Math.floor(k / 2) * 10
      if (Math.abs(s - peakS) > 50) continue
      const side = k % 2 === 0 ? 7.2 : -7.2
      const expected = track.toWorld(s, side, 0.5)
      assert.ok(
        barriers[k].position.distanceTo(expected) < 1e-6,
        `barrier seated on bank at s=${s}`
      )
      const expectedRoll = track.sampleAt(s).bank
      assert.ok(
        Math.abs(barriers[k].rotation.z - expectedRoll) < 1e-9,
        `barrier rolls with road at s=${s}`
      )
      checked++
    }
    assert.ok(checked >= 8, `checked banked barriers (${checked})`)
  } finally {
    globalThis.window = originalWindow
  }
}, { timeout: 120000 })

// Road-attached signs follow the frame but stay world-upright.
test('signs follow the banked frame while staying upright', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  // Headless canvas: absorb 2D calls; texture pixels are irrelevant to
  // placement/orientation assertions.
  const ctxStub = new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    }
  )
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: (tag) => ({
      style: {},
      remove() {},
      width: 0,
      height: 0,
      getContext: () => (tag === 'canvas' ? ctxStub : null),
    }),
    body: { appendChild() {} },
  }
  try {
    const track = createDefaultTrack()
    const highway = new THREE.Group()
    const signs = createRoadSigns('OWEN GRAVE', highway, track)
  assert.ok(signs.length > 5, 'sign row built')
  for (const sign of signs) {
    // Position rides the banked cross-section (solved back to track).
    const solved = track.toTrack(sign.position)
    const expected = track.toWorld(solved.s, solved.d, 0)
    assert.ok(
      sign.position.distanceTo(expected) < 0.6,
      'sign sits on the banked frame'
    )
    // ...but the board stays world-upright (posts obey gravity).
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(sign.quaternion)
    assert.ok(up.y > 0.99, 'sign stays upright on banking')
    // Text faces oncoming traffic, never mirrored: the board's +Z face
    // (the textured front) must point back up the track. (The removed
    // race banners failed this: their plane +Z faced down-track, so
    // drivers read the mirrored back face.)
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(sign.quaternion)
    const tangent = track.sampleAt(solved.s).tangent
    assert.ok(
      facing.x * -tangent.x + facing.z * -tangent.z > 0.9,
      'sign front faces oncoming drivers'
    )
    // No mirrored transforms anywhere on the sign.
    sign.traverse((child) => {
      assert.ok(
        child.scale.x > 0 && child.scale.y > 0 && child.scale.z > 0,
        'no negative scale (mirrored text source)'
      )
    })
    }
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

// Banked pipeline stays finite; bank interpolates without jumps.
test('banking stays finite and continuous', () => withStubs(() => {
  const track = createDefaultTrack()
  for (let s = 0; s <= track.totalLength; s += 2) {
    const f = track.sampleAt(s)
    for (const v of [f.bank, f.lateral.y, f.up.x, f.up.z]) {
      assert.ok(Number.isFinite(v), `finite banking at s=${s}`)
    }
  }
  assert.ok(Number.isFinite(track.sampleBank(-100)), 'clamped low')
  assert.ok(Number.isFinite(track.sampleBank(1e9)), 'clamped high')
}))
