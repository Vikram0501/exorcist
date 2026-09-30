import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  DEFAULT_SCENE_BACKGROUND,
  RED_SKY_FALLBACK_COLOR,
  RED_SKY_INTENSITY,
  RED_SKY_ROTATION_Y,
  RED_SKY_URL,
  disposeHighwayAtmosphere,
  loadHighwayAtmosphere,
} from '../../src/levels/highway/atmosphere.js'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { HighwayEnvironmentManager } from '../../src/levels/highway/environment.js'

function stubTextureLoader(run, impl) {
  const original =
    THREE.TextureLoader.prototype.loadAsync
  THREE.TextureLoader.prototype.loadAsync = impl
  try {
    return run()
  } finally {
    THREE.TextureLoader.prototype.loadAsync = original
  }
}

test('red sky loads once as an equirect background', async () => {
  let calls = 0
  let url = null
  await stubTextureLoader(async () => {
    calls++
    const scene = new THREE.Scene()
    const handle = await loadHighwayAtmosphere(scene)
    url = calls
    assert.equal(handle.fallback, false)
    assert.equal(scene.background?.isTexture, true)
    assert.equal(
      scene.background.mapping,
      THREE.EquirectangularReflectionMapping
    )
    assert.equal(
      scene.background.colorSpace,
      THREE.SRGBColorSpace
    )
    assert.equal(
      scene.backgroundIntensity,
      RED_SKY_INTENSITY
    )
    assert.equal(
      scene.backgroundRotation.y,
      RED_SKY_ROTATION_Y
    )
    handle.texture.dispose()
    return url
  }, async (requestUrl) => {
    assert.equal(requestUrl, RED_SKY_URL)
    return new THREE.Texture()
  })
  assert.equal(calls, 1, 'one texture load per Level 3 entry')
})

test('a missing sky falls back to dark gloom without throwing', async () => {
  await stubTextureLoader(async () => {
    const scene = new THREE.Scene()
    const handle = await loadHighwayAtmosphere(scene)
    assert.equal(handle.fallback, true)
    assert.equal(handle.texture, null)
    assert.equal(scene.background?.isColor, true)
    assert.equal(
      scene.background.getHex(),
      RED_SKY_FALLBACK_COLOR
    )
  }, async () => {
    throw new Error('missing sky')
  })
})

test('disposing the atmosphere restores the shared default', async () => {
  await stubTextureLoader(async () => {
    const scene = new THREE.Scene()
    const handle = await loadHighwayAtmosphere(scene)
    assert.equal(scene.background, handle.texture)

    let disposed = false
    const original = handle.texture.dispose.bind(
      handle.texture
    )
    handle.texture.dispose = () => {
      disposed = true
      original()
    }

    disposeHighwayAtmosphere(scene, handle)

    assert.equal(disposed, true)
    assert.equal(scene.background?.isColor, true)
    assert.equal(
      scene.background.getHex(),
      DEFAULT_SCENE_BACKGROUND
    )
    assert.equal(scene.backgroundIntensity, 1)
    assert.deepEqual(
      scene.backgroundRotation,
      new THREE.Euler(0, 0, 0)
    )
  }, async () => new THREE.Texture())
})

test('the brake-cut flicker restores the sky instead of the default', async () => {  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
  }
  try {
    const scene = new THREE.Scene()
    const sky = new THREE.Texture()
    scene.background = sky

    const camera = new THREE.PerspectiveCamera()
    const car = new THREE.Object3D()
    const controller = new HighwayCarController(
      car, camera, null, null
    )
    const race = new HighwayRaceController(
      controller, new THREE.Object3D(), -880,
      'MARA VOSS', null, scene, null, null, 100
    )

    race.brakeCutPhase = 'cut'
    race.brakeCutTimer = 0.4
    race.updateBrakeCut(0.2)

    assert.equal(scene.background, sky)
    controller.dispose()
    race.dispose()
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('neutral fill and red rim lights follow the player without shadows', async () => {
  const playerCar = new THREE.Object3D()
  playerCar.position.set(2, 0.2, -300)
  const environment = new HighwayEnvironmentManager({
    scene: new THREE.Scene(),
    highwayGroup: new THREE.Group(),
    playerCar,
    moonLight: null,
    cityBuildings: null,
    streetlights: null,
    roadPath: [],
    arcLengths: [],
  })

  const fill = environment.group.getObjectByName('neutralFill')
  const rim = environment.group.getObjectByName('redRim')
  assert.ok(fill?.isDirectionalLight, 'neutral fill exists')
  assert.ok(rim?.isDirectionalLight, 'red rim exists')
  assert.equal(fill.castShadow, false)
  assert.equal(rim.castShadow, false)
  assert.equal(fill.color.getHex(), 0xbfb6ae)
  assert.equal(rim.color.getHex(), 0xd42a2a)

  environment.updateShadowFollowing()

  assert.ok(
    fill.position.z > playerCar.position.z,
    'fill rides the camera side'
  )
  assert.ok(
    rim.position.z < playerCar.position.z,
    'rim stays down-road for edge light'
  )
  assert.ok(
    rim.position.y < fill.position.y,
    'rim stays low, fill stays high'
  )

  environment.dispose()
})
