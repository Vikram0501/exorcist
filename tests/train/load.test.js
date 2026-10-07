import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadTrain, updateTrainCarriageVisibility } from '../../src/levels/train/index.js'
import { Player } from '../../src/core/player.js'

test('loaded carriage bounds follow their parents, expose the spawn car, and allow walking', async () => {
  const originalLoad = GLTFLoader.prototype.loadAsync
  const originalTextureLoad = THREE.TextureLoader.prototype.load
  const previousWindow = globalThis.window
  GLTFLoader.prototype.loadAsync = async function (url) {
    const first = url.includes('_01.')
    const bounds = first
      ? new THREE.Box3(new THREE.Vector3(0.06, -1.63, 8.5), new THREE.Vector3(4.78, 3.5, 25.45))
      : new THREE.Box3(new THREE.Vector3(0.63, 0.1, -26.31), new THREE.Vector3(4.89, 6.13, 8.71))
    const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(10)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial())
    mesh.position.copy(bounds.getCenter(new THREE.Vector3()).multiplyScalar(10))
    const scene = new THREE.Group()
    scene.add(mesh)
    return { scene }
  }
  THREE.TextureLoader.prototype.load = () => new THREE.Texture()
  globalThis.window = { addEventListener() {} }
  try {
    const level = await loadTrain(new THREE.Group())
    const { carriages, spawn, colliders } = level
    for (const { model, bounds } of carriages) {
      const actual = new THREE.Box3().setFromObject(model)
      assert.ok(actual.min.distanceTo(bounds.min) < 0.00001)
      assert.ok(actual.max.distanceTo(bounds.max) < 0.00001)
    }
    assert.ok(carriages.at(-1).group.visible, 'the spawn carriage must be visible on the first frame')
    assert.ok(carriages.at(-1).bounds.containsPoint(spawn))
    const input = { yaw: 0, pitch: 0, isDown: code => code === 'KeyW' }
    const player = new Player(new THREE.PerspectiveCamera(), input)
    player.reset(spawn, level.spawnYaw)
    for (let frame = 0; frame < 120; frame++) player.update(1 / 60, colliders)
    assert.ok(player.position.z > spawn.z + 5, 'W must move the player along the carriage')
    assert.ok(player.isGrounded)
    assert.ok(player.position.y > 1.09, 'the player must stand on the authored train floor')
    updateTrainCarriageVisibility(carriages, player.position.z)
    assert.ok(carriages.at(-1).group.visible)
    level.trainTerrain.dispose()
    for (const controller of level.controllers) controller.dispose()
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad
    THREE.TextureLoader.prototype.load = originalTextureLoad
    globalThis.window = previousWindow
  }
})
