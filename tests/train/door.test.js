import test from 'node:test'
import assert from 'node:assert/strict'
import { getDoorColliders, toggleDoor, updateDoors } from '../../src/levels/house/index.js'
import { createTrainCarriageDoor } from '../../src/levels/train/index.js'
import { loadTrainAsset } from './model-fixture.js'

test('the type 02 lower door plays its authored open and close animations', async () => {
  const gltf = await loadTrainAsset('02')
  const model = gltf.scene.clone(true)
  const door = createTrainCarriageDoor(model, gltf.animations)

  assert.ok(door, 'the named lower door and both animation clips are present')
  assert.equal(door.object.name, 'Rear_Lower_Door')
  assert.equal(getDoorColliders([door]).length, 1, 'the closed door blocks the opening')
  assert.ok(door.object.children.every(child => child.userData.dynamicDoor))

  const closedRotation = door.object.quaternion.clone()
  const duration = door.openAction.getClip().duration

  toggleDoor(door)
  updateDoors([door], duration / 2)
  assert.ok(door.openProgress > 0.45 && door.openProgress < 0.55)
  assert.ok(door.object.quaternion.angleTo(closedRotation) > 0.01)
  assert.equal(getDoorColliders([door]).length, 0, 'the moving door clears the opening')

  updateDoors([door], duration)
  assert.ok(door.openProgress > 0.99)

  toggleDoor(door)
  updateDoors([door], duration)
  assert.ok(door.openProgress < 0.01)
  assert.ok(door.object.quaternion.angleTo(closedRotation) < 0.0001)
})
