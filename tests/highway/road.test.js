import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { HIGHWAY_SURFACE_Y, HIGHWAY_MODEL_URL, ROAD_SAMPLE_STEP } from '../../src/levels/highway/road.js'
import { PLAYER_MODEL_URL, GHOST_MODEL_URL, HIGHWAY_CAR_TARGET_LENGTH, loadHighwayCars } from '../../src/levels/highway/cars.js'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { CITY_MODEL_URL } from '../../src/levels/highway/city.js'
import { STREETLIGHT_MODEL_URL } from '../../src/levels/highway/streetlights.js'
import { OBSTACLE_MODEL_URLS } from '../../src/levels/highway/obstacles.js'

test('road covers the circuit, including seams, cars and finish', async () => {
  const assets = new Map(await Promise.all(
    [HIGHWAY_MODEL_URL, PLAYER_MODEL_URL, GHOST_MODEL_URL, CITY_MODEL_URL, STREETLIGHT_MODEL_URL, ...OBSTACLE_MODEL_URLS].map(async url =>
      [url, await readFile(new URL(`../../public${url}`, import.meta.url))])
  ))
  const originalLoad = GLTFLoader.prototype.loadAsync
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let loads = 0
  GLTFLoader.prototype.loadAsync = async function (url) {
    assert.ok(assets.has(url))
    const bytes = assets.get(url)
    loads++
    // Node has no image decoder. Parse the actual geometry/transforms/material
    // with GLTFLoader, substituting only the embedded JPEG's GPU texture.
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
    // Highway, player car, ghost car, city, streetlights and 3 obstacles.
    assert.equal(loads, 8)
    for (const [root, ghost] of [[level.playerCar, false], [level.ghostCar, true]]) {
      assert.equal(root.children.length, 1)
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(root.children[0].quaternion)
      assert.ok(forward.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6)
      assert.equal(root.getObjectByName('Plane001'), undefined)
      let meshes = 0
      root.traverse(object => {
        if (!object.isMesh) return
        meshes++
        assert.notEqual(object.geometry.type, 'BoxGeometry')
        assert.ok(object.material.map)
        assert.equal(object.castShadow, !ghost)
        assert.equal(object.receiveShadow, true)
        if (ghost) assert.equal(object.material.transparent, true)
      })
      assert.equal(meshes, 2)
      root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(root)
      // 1e-3: the smooth CatmullRom start tangent is ~8e-5 rad off-axis
      // (correct curve behaviour), which grows the yawed bounding box by
      // ~1e-4. This still validates the 4 m car scaling, not exact axis
      // alignment.
      assert.ok(Math.abs(box.getSize(new THREE.Vector3()).z - HIGHWAY_CAR_TARGET_LENGTH) < 1e-3)
      const center = box.getCenter(new THREE.Vector3())
      assert.ok(Math.abs(center.x - root.position.x) < 1e-3)
      assert.ok(Math.abs(center.z - root.position.z) < 1e-3)
    }
    assert.ok(Math.abs(level.totalRoadLength - 1581.046503009062) < 1e-6)
    assert.ok(Math.abs(level.finishZ - level.track.sampleAt(level.track.getFinishDistance()).position.z) < 1e-6)
    assert.deepEqual(level.colliders, [])
    const road = level.model.getObjectByName('highwayRoadGLB')
    assert.equal(road.userData.segmentLength, 20)
    assert.equal(road.children.length, Math.ceil(level.totalRoadLength / 20) + 1)
    assert.equal(road.children.at(-1).userData.endDistance, level.totalRoadLength)
    assert.equal(new Set(road.children.map(tile => tile.material)).size, 1)
    assert.ok(road.children[0].material.isMeshStandardMaterial)
    assert.ok(road.children[0].material.map)

    for (let i = 0; i < road.children.length; i++) {
      const tile = road.children[i]
      const geo = tile.geometry
      const p = geo.getAttribute('position')
      const n = geo.getAttribute('normal')
      // Rebuild the tile's exact row distances (mirrors road.js: fixed
      // 1.5 m steps plus endpoints, sorted) to prove every vertex rides
      // the elevated centreline. 1e-4 absorbs Float32 storage rounding
      // at heights ~16 m.
      const step = ROAD_SAMPLE_STEP
      const start = tile.userData.startDistance
      const end = tile.userData.endDistance
      const rows = [start, end]
      for (let d = start + step; d < end; d += step) rows.push(d)
      rows.sort((a, b) => a - b)
      assert.equal(p.count, rows.length * 2)
      for (let v = 0; v < p.count; v++) {
        // Start runoff (d < 0) extrapolates backward along the launch
        // tangent, mirroring road.js. The cross-section is banked: each
        // side sits at centreline + cross-slope at its lateral offset.
        // The GLB quad is symmetric, so both side assignments are tried.
        const d = rows[Math.floor(v / 2)]
        const frame = d < 0
          ? level.track.sampleAt(0)
          : level.track.sampleAt(d)
        const expected = [7, -7].map((off) => {
          const baseY = d < 0
            ? frame.position.y + frame.tangent.y * d
            : frame.position.y
          return (
            baseY + frame.lateral.y * off + frame.up.y * HIGHWAY_SURFACE_Y
          )
        })
        const best = Math.min(
          ...expected.map((e) => Math.abs(p.getY(v) - e))
        )
        assert.ok(
          best < 1e-4,
          `vertex rides banked elevation, got ${p.getY(v)}`
        )
        // Banked normals tilt with the road: up to ~10 deg banking keeps
        // normal.y above cos(11.5 deg).
        assert.ok(n.getY(v) > 0.98, 'banked surface, no kinks/flips')
      }
      if (i === 0) continue
      const prev = road.children[i - 1].geometry.getAttribute('position')
      for (let side = 0; side < 2; side++) {
        assert.deepEqual(
          new THREE.Vector3().fromBufferAttribute(prev, prev.count - 2 + side),
          new THREE.Vector3().fromBufferAttribute(p, side),
          'adjacent GLB tiles have identical endpoints, with no gap/overlap',
        )
      }
    }

    const barriers = level.model.children.filter(mesh => mesh.name === 'circuitBarrier')
    level.model.updateMatrixWorld(true)
    const barrierRay = new THREE.Raycaster()
    for (let s = 5; s < level.totalRoadLength - 5; s += 29) {
      for (const side of [-1, 1]) {
        barrierRay.set(level.track.toWorld(s, side * 6, 0.5),
          level.track.sampleAt(s).lateral.clone().multiplyScalar(side))
        const hits = barrierRay.intersectObjects(barriers, false)
        assert.ok(hits.length > 0, `outward-facing barrier exists at ${s}`)
        assert.ok(hits[0].distance > 1.1 && hits[0].distance < 1.18,
          `sloped concrete face stays outside the 7 m road edge: ${hits[0].distance}`)
      }
    }

    const camera = new THREE.PerspectiveCamera()
    const car = new HighwayCarController(level.playerCar, camera, level.roadPath, level.arcLengths)
    const race = new HighwayRaceController(car, level.ghostCar, level.finishZ,
      level.ghostName, null, new THREE.Scene(), level.roadPath, level.arcLengths, level.totalRoadLength)
    road.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(undefined, new THREE.Vector3(0, -1, 0))
    const checkGround = (object, sExact, dExact) => {
      // Ray starts above the car (the road climbs to +16 m, so a fixed
      // y = 10 origin would start underneath the asphalt on the crest).
      ray.ray.origin.copy(object.position)
      ray.ray.origin.y = object.position.y + 10
      const hits = ray.intersectObject(road, true)
      assert.ok(hits.length, `no asphalt under ${object.position.toArray()}`)
      // Mesh check against the exact placement coordinates (the
      // toTrack solver carries sub-metre s-tolerance on straights, which
      // grade would turn into height noise). 1e-2 absorbs mesh chordal
      // error between the 1.0 m road rows.
      const meshY = level.track.toWorld(
        sExact,
        dExact,
        HIGHWAY_SURFACE_Y
      ).y
      assert.ok(
        Math.abs(hits[0].point.y - meshY) < 1e-2,
        `asphalt at road height, got ${hits[0].point.y}, want ${meshY}`
      )
      object.updateMatrixWorld(true)
      // Origin check against the EXACT placement coordinates (no solver
      // involved): 0.2 ride height along the banked frame.
      const seatY = level.track.toWorld(sExact, dExact, 0.2).y
      assert.ok(
        Math.abs(object.position.y - seatY) < 1e-3,
        'car origin rides the elevated road'
      )
      // A world-axis bounding box's low corner is below centre-road Y on
      // a slope even with perfect seating. Account for the actual grade,
      // bank and footprint rather than the old mild-highway fixed margin.
      const body = new THREE.Box3().setFromObject(object)
      const size = body.getSize(new THREE.Vector3())
      const up = level.track.sampleAt(sExact).up
      const slopeAllowance = (Math.abs(up.x) * size.x + Math.abs(up.z) * size.z) / (2 * up.y)
      assert.ok(
        Math.abs(body.min.y - meshY) < slopeAllowance + 0.15,
        `car body rests on asphalt at ${sExact}, delta=${body.min.y - meshY}`
      )
    }
    // Dense fixed-step sampling covers both smoothed player and ghost
    // placement over the full allowed steering envelope. (The legacy
    // arc-length vertex set is now a uniform CatmullRom LUT, so stepping
    // the track directly is the meaningful coverage.)
    const samples = new Set([race.finishDistance])
    for (let d = 0; d < level.totalRoadLength; d += 1) samples.add(d)
    for (const d of samples) {
      for (const lateral of [-5.5, 2, 5.5]) {
        // Physics-driven pose: place the car from track coordinates with
        // tangent-aligned heading, then verify real asphalt underneath.
        car.placeAt(d, lateral)
        checkGround(car.car, d, lateral)
      }
      // Ghost drives the same interval it can finish on (finish sits 60
      // units before the end of the track).
      if (d > 0 && d <= race.finishDistance) {
        race.ghostPathProgress = d
        race.updateGhost(0)
        checkGround(
          race.ghostCar,
          race.ghostPathProgress,
          race.ghostLateralOffset
        )
      }
    }
    car.placeAt(0, 2)
    car.updateCamera()
    assert.ok(camera.position.y > HIGHWAY_SURFACE_Y)
    assert.ok(camera.position.z > car.car.position.z)

    race.ghostPathProgress = 0
    race.update(2.9)
    assert.equal(car.canDrive, false)
    race.update(0.2)
    assert.equal(race.raceStarted, true)
    assert.equal(car.canDrive, true)
    car.keys.KeyW = true
    car.update(0.1)
    assert.ok(car.pathProgress > 0)
    assert.ok(car.car.position.z < 10)

    const results = []
    race.onFinish = winner => results.push(winner)
    car.placeAt(race.finishDistance - 1, 0)
    race.ghostPathProgress = race.finishDistance - 1
    race.checkFinish()
    assert.equal(race.raceFinished, false)
    for (const winner of ['player', 'ghost']) {
      race.raceFinished = false
      // ±1 m margins: derived track progress carries sub-metre solver
      // tolerance, so sit clearly across the line instead of exactly on it.
      car.placeAt(race.finishDistance + (winner === 'player' ? 1 : -1), 0)
      race.ghostPathProgress = race.finishDistance + (winner === 'ghost' ? 1 : -1)
      race.checkFinish()
      assert.equal(race.winner, winner)
      assert.equal(car.canDrive, false)
    }
    assert.deepEqual(results, ['player', 'ghost'])
    car.dispose()
    race.dispose()
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('a missing GLB rejects loading before cars or a roadless race are created', async () => {
  const original = GLTFLoader.prototype.loadAsync
  GLTFLoader.prototype.loadAsync = async () => { throw new Error('missing highway') }
  try {
    const root = new THREE.Group()
    await assert.rejects(createHighwayLevel(root), /missing highway/)
    assert.equal(root.children[0].children.filter(object => object.isMesh).length, 0)
  } finally {
    GLTFLoader.prototype.loadAsync = original
  }
})

test('a failed car load waits for its sibling and keeps resources owned by the level', async () => {
  const original = GLTFLoader.prototype.loadAsync
  const highway = new THREE.Group()
  let resolvePlayer
  GLTFLoader.prototype.loadAsync = url => url === PLAYER_MODEL_URL
    ? new Promise(resolve => { resolvePlayer = resolve })
    : Promise.reject(new Error('missing ghost car'))
  try {
    let settled = false
    const load = loadHighwayCars(highway)
    const rejected = assert.rejects(load, /missing ghost car/).then(() => { settled = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false, 'must not finish teardown while the sibling is still loading')
    const scene = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), new THREE.MeshStandardMaterial())
    scene.add(mesh)
    resolvePlayer({ scene })
    await rejected
    assert.equal(highway.children.length, 1)
    assert.equal(mesh.parent.parent.parent.parent, highway, 'fulfilled resources remain reachable by level disposal')
    mesh.geometry.dispose()
    mesh.material.dispose()
  } finally {
    GLTFLoader.prototype.loadAsync = original
  }
})
