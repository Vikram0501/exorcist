import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { updateTrainCarriageVisibility } from '../../src/levels/train/index.js'

test('only nearby train cars are drawn as the player moves', () => {
  const carriages = [0, -35, -70, -105].map(z => ({
    group: new THREE.Group(),
    bounds: new THREE.Box3(
      new THREE.Vector3(0, 0, z - 17.5),
      new THREE.Vector3(4, 5, z + 17.5),
    ),
  }))
  updateTrainCarriageVisibility(carriages, -127)
  assert.deepEqual(carriages.map(c => c.group.visible), [false, false, true, true])
  updateTrainCarriageVisibility(carriages, -10)
  assert.deepEqual(carriages.map(c => c.group.visible), [true, true, false, false])
})
