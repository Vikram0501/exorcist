import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  TRACK_BANK_MAX_ANGLE,
  createDefaultTrack,
} from '../../src/levels/highway/track.js'
import {
  HIGHWAY_SURFACE_Y,
  HIGHWAY_MODEL_URL,
  createHighwayRoad,
} from '../../src/levels/highway/road.js'
import {
  CAR_RIDE_HEIGHT,
  HighwayCarController,
} from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { createObstacles } from '../../src/levels/highway/obstacles.js'

function withWindow(fn) {
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
  }
}

function trackY(track, s) {
  return track.sampleAt(s).position.y
}

// Non-zero Y range with a real crest and dip.
test('elevation profile has visible range', () => withWindow(() => {
  const track = createDefaultTrack()
  let minY = Infinity
  let maxY = -Infinity
  for (let s = 0; s <= track.totalLength; s += 2) {
    const y = trackY(track, s)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  assert.ok(maxY > 14, `crest reads, maxY=${maxY.toFixed(1)}`)
  assert.ok(minY < -2, `dip reads, minY=${minY.toFixed(1)}`)
  assert.ok(maxY - minY > 15, `obvious 3D range=${(maxY - minY).toFixed(1)}`)
  // Start and finish stay stable and readable.
  assert.ok(Math.abs(trackY(track, 0)) < 0.01, 'flat launch')
  assert.ok(Math.abs(trackY(track, track.totalLength)) < 0.01, 'stable finish')
}))

// Smooth elevation: no vertical kinks between dense samples.
test('elevation is smooth', () => withWindow(() => {
  const track = createDefaultTrack()
  let maxStep = 0
  let prev = trackY(track, 0)
  for (let s = 2; s <= track.totalLength; s += 2) {
    const y = trackY(track, s)
    maxStep = Math.max(maxStep, Math.abs(y - prev))
    prev = y
  }
  assert.ok(maxStep < 0.4, `no sudden transitions, max 2 m step=${maxStep.toFixed(3)}`)
}))

// Maximum grade stays arcade-sane.
test('maximum grade is restrained', () => withWindow(() => {
  const track = createDefaultTrack()
  let maxGrade = 0
  for (let s = 0; s <= track.totalLength; s += 2) {
    const t = track.sampleAt(s).tangent
    const grade = Math.abs(t.y) / Math.max(1e-9, Math.hypot(t.x, t.z))
    maxGrade = Math.max(maxGrade, grade)
  }
  assert.ok(maxGrade < 0.08, `no extreme slopes, max=${(maxGrade * 100).toFixed(2)}%`)
  assert.ok(maxGrade > 0.03, `genuinely hilly, max=${(maxGrade * 100).toFixed(2)}%`)
}))

// 3D tangent is normalized and genuinely non-planar somewhere.
test('tangent is a normalized 3D vector', () => withWindow(() => {
  const track = createDefaultTrack()
  let maxTy = 0
  for (let s = 0; s <= track.totalLength; s += 5) {
    const t = track.sampleAt(s).tangent
    assert.ok(Math.abs(t.length() - 1) < 1e-9, `unit tangent at ${s}`)
    maxTy = Math.max(maxTy, Math.abs(t.y))
  }
  assert.ok(maxTy > 0.02, `slope exists, max|ty|=${maxTy.toFixed(3)}`)
}))

// Tangent/lateral/up are mutually perpendicular unit vectors.
test('track frame is orthonormal in 3D', () => withWindow(() => {
  const track = createDefaultTrack()
  for (let s = 0; s <= track.totalLength; s += 5) {
    const f = track.sampleAt(s)
    for (const v of [f.tangent, f.lateral, f.up]) {
      assert.ok(Math.abs(v.length() - 1) < 1e-9, `unit frame at ${s}`)
    }
    assert.ok(Math.abs(f.tangent.dot(f.lateral)) < 1e-9, `tangent/lateral at ${s}`)
    assert.ok(Math.abs(f.tangent.dot(f.up)) < 1e-9, `tangent/up at ${s}`)
    assert.ok(Math.abs(f.lateral.dot(f.up)) < 1e-9, `lateral/up at ${s}`)
    // Banked cross-section: bounded by the maximum bank angle.
    assert.ok(
      Math.abs(f.lateral.y) <= Math.sin(TRACK_BANK_MAX_ANGLE) + 1e-9,
      `bounded cross-slope at ${s}`
    )
  }
}))

// toWorld/toTrack round-trip still works with elevation.
test('toWorld/toTrack round-trip holds with elevation', () => withWindow(() => {
  const track = createDefaultTrack()
  let maxDs = 0
  let maxDd = 0
  for (let s = 0; s <= track.totalLength; s += 5) {
    for (const d of [-5, 0, 3.5]) {
      const back = track.toTrack(track.toWorld(s, d, 0))
      maxDs = Math.max(maxDs, Math.abs(back.s - s))
      maxDd = Math.max(maxDd, Math.abs(back.d - d))
    }
  }
  assert.ok(maxDs < 0.1, `progress round-trips, maxDs=${maxDs.toFixed(3)}`)
  assert.ok(maxDd < 1e-6, `lateral round-trips, maxDd=${maxDd}`)
}))

// Road mesh follows elevation (mock GLB quad, no downloads).
test('road geometry follows track Y', () => withWindow(() => {
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
  assert.ok(road.children.length > 5, 'tiles built')
  for (const tile of [road.children[2], road.children[10], road.children[30]]) {
    const p = tile.geometry.getAttribute('position')
    const rows = p.count / 2
    const ds = [tile.userData.startDistance, tile.userData.endDistance]
    for (let v = 0; v < p.count; v++) {
      const row = Math.floor(v / 2)
      const frac = rows > 1 ? row / (rows - 1) : 0
      const d = ds[0] + (ds[1] - ds[0]) * frac
      // Banked cross-section: centreline height plus cross-slope at the
      // row's lateral offset, plus surface along the banked up. The mock
      // quad is symmetric, so both side assignments are tried.
      const frame = track.sampleAt(Math.max(0, d))
      const expected = [7, -7].map(
        (off) =>
          frame.position.y +
          frame.lateral.y * off +
          frame.up.y * HIGHWAY_SURFACE_Y
      )
      const best = Math.min(...expected.map((e) => Math.abs(p.getY(v) - e)))
      assert.ok(
        best < 0.05,
        `vertex rides banked elevation at d=${d.toFixed(1)}`
      )
    }
  }
}))

// Player placement and driving height ride the elevation.
test('player sits on the elevated road', () => withWindow(() => {
  const track = createDefaultTrack()
  const car = new THREE.Object3D()
  const camera = new THREE.PerspectiveCamera()
  const c = new HighwayCarController(car, camera, track, null)
  c.setDrivingEnabled(true)
  for (const s of [100, 400, 500, 700, 900]) {
    c.placeAt(s, 2)
    const expected = track.toWorld(s, 2, CAR_RIDE_HEIGHT).y
    assert.ok(
      Math.abs(car.position.y - expected) < 1e-9,
      `placed height at s=${s}`
    )
  }
  // Driving keeps height glued to the banked cross-section (planar
  // physics + banked Y seating).
  c.placeAt(300, 0)
  for (let i = 0; i < 240; i++) {
    c.keys = { KeyW: true }
    c.update(1 / 60)
    const expected = track.toWorld(
      c.pathProgress,
      c.lateralOffset,
      CAR_RIDE_HEIGHT
    ).y
    // 0.05 covers the one-frame telemetry lag (frame travel x grade).
    assert.ok(
      Math.abs(car.position.y - expected) < 0.05,
      `driving height at s=${c.pathProgress.toFixed(0)}`
    )
  }
  c.dispose()
}))

// Visual pitch follows the slope; physics root stays yaw-only.
test('car pitches visually with the slope', () => withWindow(() => {
  const track = createDefaultTrack()
  const car = new THREE.Group()
  car.add(new THREE.Group())
  const camera = new THREE.PerspectiveCamera()
  const c = new HighwayCarController(car, camera, track, null)
  c.setDrivingEnabled(true)
  // Uphill: nose up (negative rotation.x for +Z-forward models).
  c.placeAt(250, 0)
  for (let i = 0; i < 120; i++) {
    c.keys = { KeyW: true }
    c.update(1 / 60)
  }
  const frame = track.sampleAt(c.pathProgress)
  assert.ok(frame.tangent.y > 0.01, 'precondition: climbing')
  const visual = car.children[0]
  const expected = -Math.asin(THREE.MathUtils.clamp(frame.tangent.y, -1, 1))
  assert.ok(
    Math.abs(visual.rotation.x - expected) < 0.05,
    `visual pitch ${visual.rotation.x.toFixed(3)} matches slope ${expected.toFixed(3)}`
  )
  assert.equal(car.rotation.x, 0, 'physics root never pitches')
  assert.equal(car.rotation.z, 0, 'physics root never rolls')
  c.dispose()
}))

// Ghost seating rides the elevation with grade pitch.
test('ghost sits on the elevated road', () => withWindow(() => {
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
    for (const s of [100, 500, 800, 1000]) {
      race.ghostPathProgress = s
      race.seatGhostFromTrack()
      const expected = track.toWorld(s, -2, CAR_RIDE_HEIGHT).y
      assert.ok(
        Math.abs(ghostCar.position.y - expected) < 1e-9,
        `ghost height at s=${s}`
      )
      const ty = track.sampleAt(s).tangent.y
      const visual = ghostCar.children[0]
      assert.ok(
        Math.abs(visual.rotation.x + Math.asin(ty)) < 1e-9,
        `ghost pitch at s=${s}`
      )
    }
    player.dispose()
    race.dispose()
  } finally {
    globalThis.document = originalDocument
  }
}))

// Obstacles sit on the elevated surface.
test('obstacles sit on the elevated road', () => withWindow(() => {
  const track = createDefaultTrack()
  const mkTemplate = (halfWidth) => ({
    key: 'mock',
    def: { key: 'mock', yaw: 0, animate: false, halfWidth, halfDepth: 0.7 },
    scene: (() => {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshBasicMaterial()
      ))
      return g
    })(),
    box: new THREE.Box3(
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 2, 0.5)
    ),
    scale: 1,
    yOffset: 0,
    clips: [],
  })
  const highway = new THREE.Group()
  const obstacles = createObstacles(
    [mkTemplate(0.7)], track, null, track.totalLength, highway
  )
  assert.ok(obstacles.length > 3, 'field generated')
  for (const obs of obstacles) {
    const frame = track.sampleAt(obs.progress)
    const expected =
      frame.position.y + frame.lateral.y * obs.lateralOffset
    assert.ok(
      Math.abs(obs.mesh.position.y - expected) < 1e-9,
      `obstacle height at s=${obs.progress.toFixed(0)}`
    )
  }
}))

// Barriers follow elevation in the built level (real GLBs).
test('barriers follow elevation', async () => {
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
    const level = await createHighwayLevel(new THREE.Group())
    const track = level.track
    const barriers = []
    level.model.traverse((object) => {
      if (!object.isMesh) return
      if (object.name === 'circuitBarrier') {
        barriers.push(object)
      }
    })
    assert.equal(barriers.length, Math.ceil(track.totalLength / 40) * 2)
    // Regression: no mirrored transforms anywhere in the built level
    // (negative scale flips text and inverts winding).
    level.model.traverse((object) => {
      assert.ok(
        object.scale.x > 0 && object.scale.y > 0 && object.scale.z > 0,
        `no negative scale on ${object.name || object.type}`
      )
    })
    // Check baked bottom/top vertices through climbs and descents.
    for (let k = 0; k < barriers.length; k += 20) {
      const p = barriers[k].geometry.getAttribute('position')
      for (let i = 0; i < p.count; i += 11) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i)
        const solved = track.toTrack(v)
        const frame = track.sampleAt(solved.s)
        const height = v.clone().sub(frame.position).dot(frame.up)
        assert.ok(height > -0.02 && height < 1.02,
          `barrier rides elevation at s=${solved.s}`)
      }
    }
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}, { timeout: 120000 })

// Camera tracks elevation with the car (no feel retune).
test('chase camera follows elevation', () => withWindow(() => {
  const track = createDefaultTrack()
  const car = new THREE.Object3D()
  const camera = new THREE.PerspectiveCamera(75)
  const c = new HighwayCarController(car, camera, track, null)
  c.setDrivingEnabled(true)
  const settleAt = (s) => {
    c.placeAt(s, 0)
    for (let i = 0; i < 300; i++) c.updateCamera(1 / 60)
    return camera.position.y
  }
  // Discover the actual crest and dip stations (geometry-driven).
  let sHi = 0
  let sLo = 0
  let maxY = -Infinity
  let minY = Infinity
  for (let s = 0; s <= track.totalLength; s += 5) {
    const y = trackY(track, s)
    if (y > maxY) {
      maxY = y
      sHi = s
    }
    if (y < minY) {
      minY = y
      sLo = s
    }
  }
  const lowY = settleAt(sLo)
  const highY = settleAt(sHi)
  const trackDelta = maxY - minY
  assert.ok(trackDelta > 10, 'precondition: real elevation difference')
  assert.ok(
    Math.abs((highY - lowY) - trackDelta) < 1.5,
    `camera rides with the car, delta=${(highY - lowY).toFixed(1)} vs track ${trackDelta.toFixed(1)}`
  )
  c.dispose()
}))

// Full-state sweep: no NaN/Infinity anywhere in the elevated pipeline.
test('elevated pipeline stays finite', () => withWindow(() => {
  const track = createDefaultTrack()
  for (let s = 0; s <= track.totalLength; s += 5) {
    const f = track.sampleAt(s)
    for (const v of [
      f.position.x, f.position.y, f.position.z,
      f.tangent.x, f.tangent.y, f.tangent.z,
      f.lateral.x, f.lateral.y, f.lateral.z,
      f.up.x, f.up.y, f.up.z, f.angle,
    ]) {
      assert.ok(Number.isFinite(v), `finite frame at s=${s}, got ${v}`)
    }
    const w = track.toWorld(s, -3.5, 1)
    assert.ok(Number.isFinite(w.x + w.y + w.z), `finite toWorld at ${s}`)
  }
}))
