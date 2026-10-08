import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createDefaultTrack } from '../../src/levels/highway/track.js'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { HIGHWAY_MODEL_URL } from '../../src/levels/highway/road.js'
import { PLAYER_MODEL_URL, GHOST_MODEL_URL } from '../../src/levels/highway/cars.js'
import { CITY_MODEL_URL } from '../../src/levels/highway/city.js'
import { STREETLIGHT_MODEL_URL } from '../../src/levels/highway/streetlights.js'
import { OBSTACLE_MODEL_URLS } from '../../src/levels/highway/obstacles.js'

function withWindow(fn) {
  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
  }
}

function makeControllerOnTrack() {
  const track = createDefaultTrack()
  const camera = new THREE.PerspectiveCamera()
  const car = new THREE.Object3D()
  const controller = new HighwayCarController(car, camera, track, null)
  controller.setDrivingEnabled(true)
  return { controller, track, camera, car }
}

function cameraClearance(controller, track, label) {
  const camera = controller.camera.position
  const solved = track.toTrack(camera)
  const frame = track.sampleAt(solved.s)
  const offset = camera.clone().sub(frame.position)
  const d = offset.dot(frame.lateral)
  assert.ok(Math.abs(d) <= 5.9, `${label}: camera stays inside barriers, d=${d.toFixed(2)}`)
  const ground = frame.position.y - (frame.up.x * (camera.x - frame.position.x) +
    frame.up.z * (camera.z - frame.position.z)) / frame.up.y
  assert.ok(camera.y >= ground + 1.4, `${label}: camera above the road surface`)
  const toCamera = camera.clone().sub(controller.car.position).setY(0)
  assert.ok(toCamera.length() > 3 && toCamera.length() < 12, `${label}: near plane neither clips the car nor drifts away`)
}

test('closer chase camera clears barriers, road and the car body', () => withWindow(() => {
  const { controller, track } = makeControllerOnTrack()
  for (const s of [20, 300, 630, 770, 1000, 1200, track.getFinishDistance() - 5]) {
    controller.placeAt(s, 2)
    for (let i = 0; i < 120; i++) controller.updateCamera(1 / 60)
    cameraClearance(controller, track, `s=${s}`)
    const forward = new THREE.Vector3()
    controller.camera.getWorldDirection(forward)
    assert.ok(forward.normalize().dot(controller.forwardVector(new THREE.Vector3())) > 0.5, 'still looks down-road')
  }
  // Drift and reverse extremes stay constrained too.
  controller.placeAt(1000, 4)
  controller.keys = { KeyW: true, KeyA: true, Space: true }
  for (let i = 0; i < 60; i++) controller.update(1 / 60)
  cameraClearance(controller, track, 'drift extreme')
  controller.placeAt(500, -4, 0.7)
  for (let i = 0; i < 120; i++) controller.updateCamera(1 / 60)
  cameraClearance(controller, track, 'teleport')
  controller.dispose()
}))

test('corner preview reveals straights without hijacking drift steering', () => withWindow(() => {
  const { controller, track } = makeControllerOnTrack()
  controller.placeAt(60, 0)
  for (let i = 0; i < 120; i++) controller.updateCamera(1 / 60)
  const straightLook = controller.smoothedLook.clone()
  const straightRoad = track.toWorld(68, 0, 1)
  assert.ok(straightLook.distanceTo(straightRoad) < 4, 'straight preview tracks the road ahead')
  // Genuine slide on the spawn straight (same recipe as the drift-camera
  // suite): cruise to speed first, then break traction with the handbrake.
  controller.placeAt(200, 0)
  for (let i = 0; i < 180; i++) {
    controller.keys = { KeyW: true }
    controller.update(1 / 60)
  }
  for (let i = 0; i < 40; i++) {
    controller.keys = { KeyW: true, KeyA: true, Space: true }
    controller.update(1 / 60)
  }
  assert.ok(Math.abs(controller.slipAngle) > 0.12, 'precondition: real slide')
  const headingDir = controller.forwardVector(new THREE.Vector3())
  const lookDir = controller.smoothedLook.clone().sub(controller.car.position).setY(0).normalize()
  assert.ok(lookDir.dot(headingDir) > 0.85, 'heading still dominates the view mid-drift')
  controller.dispose()
}))

test('player and ghost cars stay distinct with readable materials', async () => {
  const urls = [HIGHWAY_MODEL_URL, PLAYER_MODEL_URL, GHOST_MODEL_URL, CITY_MODEL_URL, STREETLIGHT_MODEL_URL, ...OBSTACLE_MODEL_URLS]
  const assets = new Map(await Promise.all(urls.map(async (url) =>
    [url, await readFile(new URL(`../../public${url}`, import.meta.url))])))
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
    createElement: (tag) => ({
      style: {},
      remove() {},
      width: 0,
      height: 0,
      getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
    }),
    body: { appendChild() {} },
  }
  try {
    const level = await createHighwayLevel(new THREE.Group())
    const playerMats = new Set()
    level.playerCar.traverse((object) => {
      if (!object.isMesh) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        playerMats.add(material)
        if (!material.transparent) {
          assert.ok(material.roughness >= 0.38 && material.roughness <= 0.75, 'player bodywork readable, never blown out')
          assert.ok((material.metalness ?? 0) <= 0.65, 'metals reflect the red sky without black crush')
        }
      }
    })
    const ghostMats = new Set()
    level.ghostCar.traverse((object) => {
      if (!object.isMesh) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        ghostMats.add(material)
        assert.equal(material.transparent, true)
        assert.ok(Math.abs(material.opacity - 0.62) < 1e-9, 'ghost stays translucent')
        assert.equal(material.depthWrite, false)
      }
    })
    assert.ok(playerMats.size > 0 && ghostMats.size > 0)
    const playerColor = [...playerMats][0].color.getHex()
    const ghostColor = [...ghostMats][0].color.getHex()
    assert.notEqual(playerColor, ghostColor, 'ghost visually distinct from the player')
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
