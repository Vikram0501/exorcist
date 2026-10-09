import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { HIGHWAY_MODEL_URL } from '../../src/levels/highway/road.js'
import { PLAYER_MODEL_URL, GHOST_MODEL_URL } from '../../src/levels/highway/cars.js'
import { CITY_MODEL_URL } from '../../src/levels/highway/city.js'
import { STREETLIGHT_MODEL_URL } from '../../src/levels/highway/streetlights.js'
import { OBSTACLE_MODEL_URLS } from '../../src/levels/highway/obstacles.js'
import { HighwayEnvironmentManager } from '../../src/levels/highway/environment.js'

const MODEL_URLS = [
  HIGHWAY_MODEL_URL,
  PLAYER_MODEL_URL,
  GHOST_MODEL_URL,
  CITY_MODEL_URL,
  STREETLIGHT_MODEL_URL,
  ...OBSTACLE_MODEL_URLS,
]

// Poles sit well outside the barriers (7.2) and steering envelope (5.5).
const MIN_POLE_CLEARANCE = 7.5

async function withLevel(run) {
  const assets = new Map(await Promise.all(
    MODEL_URLS.map(async url =>
      [url, await readFile(new URL(`../../public${url}`, import.meta.url))])
  ))
  const originalLoad = GLTFLoader.prototype.loadAsync
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document

  GLTFLoader.prototype.loadAsync = async function (url) {
    assert.ok(assets.has(url), `unexpected asset ${url}`)
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
    return await run()
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

test('streetlights line both sides of the highway with shared resources', async () => {
  await withLevel(async () => {
    const level = await createHighwayLevel(new THREE.Group())
    assert.ok(level.streetlights, 'the level hands back the streetlight template')
    assert.ok(
      level.streetlights.userData.streetlightBox,
      'template stores its footprint'
    )

    const playerCar = new THREE.Object3D()
    playerCar.position.set(0, 0, -465)
    const environment = new HighwayEnvironmentManager({
      scene: new THREE.Scene(),
      highwayGroup: level.model,
      playerCar,
      moonLight: new THREE.DirectionalLight(0xffffff, 1),
      cityBuildings: level.cityBuildings,
      streetlights: level.streetlights,
      roadPath: level.roadPath,
      arcLengths: level.arcLengths,
    })

    const poles = environment.streetlightPoles
    assert.ok(poles.length > 40, `expected a full corridor, got ${poles.length}`)
    assert.ok(
      poles.some(pole => pole.name.includes('_left_')),
      'left side'
    )
    assert.ok(
      poles.some(pole => pole.name.includes('_right_')),
      'right side'
    )
    assert.equal(
      environment.streetlightGroup.name,
      'streetlightEnvironment'
    )
    assert.equal(
      environment.streetlightGroup.parent,
      environment.group
    )

    // Poles clone one prepared template: shared geometry and materials.
    const template = level.streetlights
    const geometries = new Set()
    const materials = new Set()
    for (const pole of poles) {
      for (const mesh of pole.children) {
        geometries.add(mesh.geometry)
        materials.add(mesh.material)
      }
    }
    assert.equal(geometries.size, template.children.length)
    assert.equal(materials.size, template.children.length)

    level.model.updateMatrixWorld(true)

    // Every pole base stays grounded on the banked roadside and clear
    // of the drivable road (same raw-dot lateral the placement uses).
    for (const pole of poles) {
      const anchor = environment.track.sampleAt(
        pole.userData.streetlightDistance
      )
      const dx = pole.position.x - anchor.position.x
      const dz = pole.position.z - anchor.position.z
      const dActual = dx * anchor.lateral.x + dz * anchor.lateral.z
      const expectedBase =
        anchor.position.y + anchor.lateral.y * dActual
      assert.ok(
        Math.abs(pole.position.y - expectedBase) < 1e-6,
        `${pole.name} grounded at ${pole.position.y}, want ${expectedBase}`
      )
      const clearance = environment.distanceToPath(
        pole.position.x, pole.position.z
      )
      assert.ok(
        clearance >= MIN_POLE_CLEARANCE,
        `${pole.name} only ${clearance.toFixed(2)} from the road centre`
      )
    }

    // Lamp arms face the roadway: right poles yaw with the path tangent,
    // left poles turn half a circle.
    for (const pole of poles) {
      const frame = environment.getCityFrame(
        pole.userData.streetlightDistance
      )
      const expected =
        frame.angle +
        (pole.userData.streetlightSide > 0 ? 0 : Math.PI)
      const TAU = Math.PI * 2
      const actual = ((pole.rotation.y % TAU) + TAU) % TAU
      const want = ((expected % TAU) + TAU) % TAU
      assert.ok(
        Math.abs(actual - want) < 1e-6,
        `${pole.name} arm does not face the road`
      )
    }

    // Culling is a visibility flag only: nothing is rebuilt or duplicated.
    const built = poles.length
    playerCar.position.z = -465
    environment.updateStreetlights()
    assert.equal(poles.length, built)
    const visible = poles.filter(pole => pole.visible)
    assert.ok(visible.length > 0, 'nearby poles render')
    assert.ok(visible.length < built, 'distant poles are culled')

    // The returning drift corner faces +Z. Light selection must still
    // follow race progress, rather than illuminating the section behind.
    playerCar.position.copy(level.track.toWorld(1100, 0, 0.2))
    assert.ok(level.track.sampleAt(1100).tangent.z > 0)
    environment.updateStreetlightPool(1)
    let lit = 0
    for (const light of environment.streetlightPool) {
      const pole = poles.find(p => Math.abs(p.position.x - light.position.x) < 1e-6 &&
        Math.abs(p.position.z - light.position.z) < 1e-6)
      if (!pole) continue
      const ahead = pole.userData.streetlightDistance - 1100
      assert.ok(ahead >= -10.1 && ahead <= 130.1, 'pool follows upcoming circuit stations')
      assert.ok(Math.abs(light.position.y - pole.position.y - 5.2) < 1e-6,
        'existing lamp height follows track elevation')
      lit++
    }
    assert.ok(lit > 0, 'returning corner has working light pools')

    environment.dispose()
    assert.equal(environment.group.parent, null)
    assert.equal(
      level.model.getObjectByName('highwayEnvironment'),
      undefined
    )
    assert.equal(environment.streetlightPoles.length, 0)
  })
})

test('a missing streetlight model leaves a complete highway without lamps', async () => {
  await withLevel(async () => {
    const original = GLTFLoader.prototype.loadAsync
    GLTFLoader.prototype.loadAsync = async function (url) {
      if (url === STREETLIGHT_MODEL_URL) {
        throw new Error('missing streetlight')
      }
      return original.call(this, url)
    }
    try {
      const level = await createHighwayLevel(new THREE.Group())
      assert.equal(level.streetlights, null)
      assert.ok(level.model.getObjectByName('highwayRoadGLB'))

      const playerCar = new THREE.Object3D()
      const environment = new HighwayEnvironmentManager({
        scene: new THREE.Scene(),
        highwayGroup: level.model,
        playerCar,
        moonLight: null,
        cityBuildings: level.cityBuildings,
        streetlights: level.streetlights,
        roadPath: level.roadPath,
        arcLengths: level.arcLengths,
      })
      assert.equal(environment.streetlightPoles.length, 0)
      assert.equal(environment.streetlightGroup, null)
      environment.dispose()
    } finally {
      GLTFLoader.prototype.loadAsync = original
    }
  })
})
