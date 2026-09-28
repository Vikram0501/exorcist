import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createHighwayLevel } from '../../src/levels/highway/index.js'
import { HIGHWAY_MODEL_URL } from '../../src/levels/highway/road.js'
import { PLAYER_MODEL_URL, GHOST_MODEL_URL } from '../../src/levels/highway/cars.js'
import { CITY_MODEL_URL } from '../../src/levels/highway/city.js'
import { HighwayEnvironmentManager } from '../../src/levels/highway/environment.js'

const MODEL_URLS = [
  HIGHWAY_MODEL_URL,
  PLAYER_MODEL_URL,
  GHOST_MODEL_URL,
  CITY_MODEL_URL,
]

const PATH_SAMPLE_STEP = 1
// Designed for 17; the sampled path and footprint keep a small margin.
const MIN_ROAD_CLEARANCE = 16.5

async function withLevel(run) {
  const assets = new Map(await Promise.all(
    MODEL_URLS.map(async url =>
      [url, await readFile(new URL(`../../public${url}`, import.meta.url))])
  ))
  const originalLoad = GLTFLoader.prototype.loadAsync
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let loads = 0

  GLTFLoader.prototype.loadAsync = async function (url) {
    // Anything else, including deadtrees.glb, is an unexpected load.
    assert.ok(assets.has(url), `unexpected asset ${url}`)
    const bytes = assets.get(url)
    loads++
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
    return await run(() => loads)
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

function createEnvironment(level, playerCar) {
  return new HighwayEnvironmentManager({
    scene: new THREE.Scene(),
    highwayGroup: level.model,
    playerCar,
    moonLight: new THREE.DirectionalLight(0xffffff, 1),
    cityBuildings: level.cityBuildings,
    roadPath: level.roadPath,
    arcLengths: level.arcLengths,
  })
}

test('the city surrounds both sides of the road and leaves the highway clear', async () => {
  await withLevel(async (loadCount) => {
    const level = await createHighwayLevel(new THREE.Group())
    assert.equal(loadCount(), 4, 'road, cars and city each load exactly once')

    const template = level.cityBuildings
    assert.ok(template, 'the level hands back the prepared city template')
    // Eight merged material batches: the GLB's own ground slab is dropped.
    assert.equal(template.children.length, 8)
    for (const mesh of template.children) {
      assert.ok(mesh.castShadow)
      assert.ok(mesh.receiveShadow)
    }
    const box = template.userData.cityBox
    assert.ok(box)
    assert.ok(box.max.y > 7 && box.min.y < 0, 'buildings keep their authored height')

    const playerCar = new THREE.Object3D()
    playerCar.position.set(0, 0, -465)
    const environment = createEnvironment(level, playerCar)
    const sections = environment.citySections

    assert.equal(environment.cityGroup.name, 'cityEnvironment')
    assert.equal(environment.cityGroup.parent, environment.group)
    assert.equal(environment.group.parent, level.model, 'city hangs off the Level 3 group')
    assert.ok(sections.length > 60, `expected a full corridor, got ${sections.length}`)
    assert.ok(sections.some(section => section.name.includes('_left_')), 'left side')
    assert.ok(sections.some(section => section.name.includes('_right_')), 'right side')

    // Sections clone one prepared template: shared geometry and materials.
    const geometries = new Set()
    const materials = new Set()
    for (const section of sections) {
      for (const mesh of section.children) {
        geometries.add(mesh.geometry)
        materials.add(mesh.material)
      }
    }
    assert.equal(geometries.size, template.children.length)
    assert.equal(materials.size, template.children.length)

    level.model.updateMatrixWorld(true)

    const path = []
    for (
      let d = 0;
      d <= level.totalRoadLength;
      d += PATH_SAMPLE_STEP
    ) {
      path.push(environment.getPathSample(d))
    }

    // Footprint: corners plus edge midpoints, in world space.
    const footprint = [
      [box.min.x, box.min.z], [box.max.x, box.min.z],
      [box.min.x, box.max.z], [box.max.x, box.max.z],
      [(box.min.x + box.max.x) / 2, box.min.z],
      [(box.min.x + box.max.x) / 2, box.max.z],
      [box.min.x, (box.min.z + box.max.z) / 2],
      [box.max.x, (box.min.z + box.max.z) / 2],
    ]

    let minClearance = Infinity
    for (const section of sections) {
      for (const [x, z] of footprint) {
        const corner = new THREE.Vector3(x, 0, z)
          .applyMatrix4(section.matrixWorld)
        for (const point of path) {
          const distance = Math.hypot(
            corner.x - point.x,
            corner.z - point.z
          )
          if (distance < minClearance) minClearance = distance
        }
      }
    }
    assert.ok(
      minClearance >= MIN_ROAD_CLEARANCE,
      `city reaches to ${minClearance.toFixed(2)} of the road centre`
    )

    // Every metre of the race sits inside some section's length.
    for (let d = 0; d <= level.totalRoadLength; d += 2) {
      const point = environment.getPathSample(d)
      const covered = sections.some((section) => {
        const local = section.worldToLocal(point.clone())
        return local.z >= box.min.z && local.z <= box.max.z
      })
      assert.ok(covered, `no city section covers distance ${d}`)
    }

    // Culling is a visibility flag only: nothing is rebuilt or duplicated.
    const built = sections.length
    playerCar.position.z = -465
    environment.updateCity()
    assert.equal(sections.length, built)
    const visible = sections.filter(section => section.visible)
    assert.ok(visible.length > 0, 'nearby sections render')
    assert.ok(visible.length < built, 'distant sections are culled')

    playerCar.position.z = 10
    environment.updateCity()
    assert.ok(
      sections.filter(section => section.visible).length < built
    )

    environment.dispose()
    assert.equal(environment.group.parent, null, 'the whole city group detaches')
    assert.equal(level.model.getObjectByName('highwayEnvironment'), undefined)

    const restarted = createEnvironment(level, playerCar)
    assert.equal(restarted.citySections.length, built, 'restart rebuilds the same city')
    assert.equal(restarted.cityGroup.parent, restarted.group)
    assert.equal(level.model.getObjectByName('highwayEnvironment'), restarted.group)
    assert.equal(
      level.model.children.filter(child => child.name === 'highwayEnvironment').length,
      1,
      'no abandoned environment groups after a restart'
    )
    restarted.dispose()
  })
})
