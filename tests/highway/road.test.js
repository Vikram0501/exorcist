import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { HIGHWAY_SURFACE_Y, HIGHWAY_MODEL_URL } from '../../src/levels/highway/road.js'
import { PLAYER_MODEL_URL, GHOST_MODEL_URL, HIGHWAY_CAR_TARGET_LENGTH, loadHighwayCars } from '../../src/levels/highway/cars.js'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { CITY_MODEL_URL } from '../../src/levels/highway/city.js'

test('actual GLB covers the unchanged race path, including seams, cars and finish', async () => {
  const assets = new Map(await Promise.all(
    [HIGHWAY_MODEL_URL, PLAYER_MODEL_URL, GHOST_MODEL_URL, CITY_MODEL_URL].map(async url =>
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
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
  }
  try {
    const level = await createHighwayLevel(new THREE.Group())
    // Highway, player car, ghost car and the Level 3 city, each loaded once.
    assert.equal(loads, 4)
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
      assert.ok(Math.abs(box.getSize(new THREE.Vector3()).z - HIGHWAY_CAR_TARGET_LENGTH) < 1e-5)
      const center = box.getCenter(new THREE.Vector3())
      assert.ok(Math.abs(center.x - root.position.x) < 1e-5)
      assert.ok(Math.abs(center.z - root.position.z) < 1e-5)
    }
    assert.ok(Math.abs(level.totalRoadLength - 952.6585091144439) < 1e-6)
    assert.equal(level.finishZ, -880)
    assert.deepEqual(level.colliders, [])
    const road = level.model.getObjectByName('highwayRoadGLB')
    assert.equal(road.userData.segmentLength, 20)
    assert.equal(road.children.length, 49)
    assert.equal(road.children.at(-1).userData.endDistance, level.totalRoadLength)
    assert.equal(new Set(road.children.map(tile => tile.material)).size, 1)
    assert.ok(road.children[0].material.isMeshStandardMaterial)
    assert.ok(road.children[0].material.map)

    for (let i = 0; i < road.children.length; i++) {
      const geo = road.children[i].geometry
      const p = geo.getAttribute('position')
      const n = geo.getAttribute('normal')
      for (let v = 0; v < p.count; v++) {
        assert.ok(Math.abs(p.getY(v) - HIGHWAY_SURFACE_Y) < 1e-6)
        assert.ok(n.getY(v) > 0.999, 'upward-facing surface')
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

    const camera = new THREE.PerspectiveCamera()
    const car = new HighwayCarController(level.playerCar, camera, level.roadPath, level.arcLengths)
    const race = new HighwayRaceController(car, level.ghostCar, level.finishZ,
      level.ghostName, null, new THREE.Scene(), level.roadPath, level.arcLengths, level.totalRoadLength)
    road.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(undefined, new THREE.Vector3(0, -1, 0))
    const checkGround = object => {
      ray.ray.origin.copy(object.position).y = 10
      const hits = ray.intersectObject(road, true)
      assert.ok(hits.length, `no asphalt under ${object.position.toArray()}`)
      assert.ok(Math.abs(hits[0].point.y - HIGHWAY_SURFACE_Y) < 1e-6)
      object.updateMatrixWorld(true)
      assert.ok(Math.abs(new THREE.Box3().setFromObject(object).min.y - HIGHWAY_SURFACE_Y) < 1e-6)
    }
    // Dense sampling, path vertices and finish test both smoothed player and
    // unsmoothed ghost normals, including the full allowed steering envelope.
    const samples = new Set([...level.arcLengths, race.finishDistance])
    for (let d = 0; d < level.totalRoadLength; d += 0.5) samples.add(d)
    for (const d of samples) {
      car.pathProgress = d
      for (const lateral of [-5.5, 2, 5.5]) {
        car.lateralOffset = lateral
        car.updateCarPosition()
        checkGround(car.car)
      }
      // The existing ghost uses angle=0 at the exact terminal path point;
      // finish is 60 units earlier, so test its driven interval only.
      if (d > 0 && d <= race.finishDistance) {
        race.ghostPathProgress = d
        race.updateGhost(0)
        checkGround(race.ghostCar)
      }
    }
    car.pathProgress = 0
    car.lateralOffset = 2
    car.updateCarPosition()
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
    car.pathProgress = race.finishDistance - 1
    race.ghostPathProgress = race.finishDistance - 1
    race.checkFinish()
    assert.equal(race.raceFinished, false)
    for (const winner of ['player', 'ghost']) {
      race.raceFinished = false
      car.pathProgress = race.finishDistance + (winner === 'player' ? 0 : -1)
      race.ghostPathProgress = race.finishDistance + (winner === 'ghost' ? 0 : -1)
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
