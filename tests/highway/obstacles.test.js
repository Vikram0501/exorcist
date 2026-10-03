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
import {
  OBSTACLE_MODEL_URLS,
  checkPlayerObstacleCollision,
  disposeObstacles,
  updateObstacles,
} from '../../src/levels/highway/obstacles.js'

const MODEL_URLS = [
  HIGHWAY_MODEL_URL,
  PLAYER_MODEL_URL,
  GHOST_MODEL_URL,
  CITY_MODEL_URL,
  STREETLIGHT_MODEL_URL,
  ...OBSTACLE_MODEL_URLS,
]

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

test('obstacles cycle zombie, scientist and barbed wire with working collision', async () => {
  await withLevel(async () => {
    const level = await createHighwayLevel(new THREE.Group())
    const obstacles = level.obstacles

    assert.ok(obstacles.length >= 3, `expected obstacles, got ${obstacles.length}`)

    // One GLB visual per position, cycling in order.
    const keys = obstacles.map((obs) => obs.modelKey)
    assert.deepEqual(
      keys.slice(0, 3),
      ['zombie', 'scientist', 'barbed']
    )
    for (let i = 0; i < keys.length; i++) {
      assert.equal(
        keys[i],
        ['zombie', 'scientist', 'barbed'][i % 3],
        `obstacle ${i} breaks the cycle`
      )
    }

    for (const obs of obstacles) {
      // Gameplay metadata preserved for the collision system.
      assert.equal(typeof obs.progress, 'number')
      assert.equal(typeof obs.lateralOffset, 'number')
      assert.ok(obs.halfWidth > 0)
      assert.ok(obs.halfDepth > 0)
      assert.equal(obs.hit, false)

      // Collision stays fair and predictable: visual growth did not drag
      // the hitboxes along with it.
      const expectedBoxes = {
        zombie: [0.7, 0.7],
        scientist: [1.0, 0.6],
        barbed: [2.0, 0.8],
      }
      assert.deepEqual(
        [obs.halfWidth, obs.halfDepth],
        expectedBoxes[obs.modelKey],
        `${obs.modelKey} hitbox changed`
      )

      // No procedural box visuals remain; each obstacle carries GLB meshes.
      let meshes = 0
      obs.mesh.traverse((child) => {
        if (!child.isMesh) return
        meshes++
        assert.notEqual(
          child.geometry.type,
          'BoxGeometry',
          'old procedural obstacle visual remains'
        )
      })
      assert.ok(meshes > 0, 'obstacle has no visual meshes')

      // Visuals sit on the banked road surface, never buried.
      obs.mesh.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(obs.mesh)
      const frame = level.track.sampleAt(obs.progress)
      const roadBase =
        frame.position.y + frame.lateral.y * obs.lateralOffset
      assert.ok(
        Math.abs(box.min.y - roadBase) < 0.05,
        `${obs.modelKey} floats or sinks: min.y=${box.min.y.toFixed(3)} vs road ${roadBase.toFixed(3)}`
      )

      // Readable-but-fair scale: imposing zombies, road-blocking wire.
      const size = box.getSize(new THREE.Vector3())
      if (obs.modelKey === 'zombie') {
        assert.ok(
          size.y > 2.0 && size.y < 2.4,
          `zombie height ${size.y.toFixed(2)}`
        )
      } else if (obs.modelKey === 'scientist') {
        assert.ok(
          size.y > 1.9 && size.y < 2.3,
          `scientist height ${size.y.toFixed(2)}`
        )
      } else {
        assert.ok(
          size.x > 3.8 && size.x < 4.2,
          `barbed width ${size.x.toFixed(2)}`
        )
      }
    }

    // Zombies animate, wire and scientist stay static.
    const zombies = obstacles.filter((obs) => obs.modelKey === 'zombie')
    assert.ok(zombies.length > 0)
    for (const obs of zombies) {
      assert.ok(obs.mixer, 'zombie has no animation mixer')
    }
    for (const obs of obstacles) {
      if (obs.modelKey !== 'zombie') {
        assert.equal(obs.mixer, null)
      }
    }
    updateObstacles(obstacles, 0.016)
    updateObstacles(obstacles, 0.016)

    // Collision still blocks the lane: driving at the obstacle's offset
    // into its progress reports a hit; driving around it reports clear.
    const first = obstacles[0]
    const hit = checkPlayerObstacleCollision(
      obstacles,
      first.progress - 5,
      first.progress + 1,
      first.lateralOffset
    )
    assert.equal(hit, first)

    const clear = checkPlayerObstacleCollision(
      obstacles,
      first.progress - 5,
      first.progress + 1,
      first.lateralOffset + 6
    )
    assert.equal(clear, null)

    disposeObstacles(obstacles)
    assert.equal(obstacles.length, 0)
  })
})
