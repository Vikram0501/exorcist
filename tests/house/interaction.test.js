import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Octree } from 'three/addons/math/Octree.js'
import { findHouseInvestigationItem } from '../../src/levels/house/interaction.js'

function scene() {
  const model = new THREE.Group()
  const itemObject = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4))
  itemObject.position.z = -2
  model.add(itemObject)
  model.updateMatrixWorld(true)
  const item = { id: 'caretaker-record', object: itemObject }
  const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 3)
  return { model, item, raycaster, player: new THREE.Vector3() }
}

test('house interaction samples clue props without raycasting the full model', () => {
  const { model, item, raycaster, player } = scene()
  const expensiveDecoration = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))
  expensiveDecoration.raycast = () => { throw new Error('unrelated house mesh was raycast') }
  model.add(expensiveDecoration)
  assert.equal(findHouseInvestigationItem(raycaster, [item], [], null, player, 3), item)
  item.object.visible = false
  assert.equal(findHouseInvestigationItem(raycaster, [item], [], null, player, 3), null)
})

test('house collision panels and moving doors block clues behind them', () => {
  const { item, raycaster, player } = scene()
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.1))
  wall.position.z = -1
  const wallRoot = new THREE.Group()
  wallRoot.add(wall)
  const world = new Octree().fromGraphNode(wallRoot)
  assert.equal(findHouseInvestigationItem(raycaster, [item], [], world, player, 3), null)

  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1))
  door.position.z = -1
  door.updateMatrixWorld(true)
  assert.equal(findHouseInvestigationItem(raycaster, [item], [{ object: door }], null, player, 3), null)
})
