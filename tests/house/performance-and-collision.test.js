import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildLabelledCollisionWorld, installHeavyChairLod, simplifyDecorativeGravel } from '../../src/levels/house/index.js'
import { HouseScareShake } from '../../src/levels/house/scare-shake.js'

test('decorative gravel keeps its material and footprint with far fewer triangles', () => {
  const model = new THREE.Group()
  const material = new THREE.MeshStandardMaterial()
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4, 100, 100).rotateX(-Math.PI / 2), material)
  gravel.name = 'Gravel road in village.001'
  model.add(gravel)
  const original = gravel.geometry
  const before = new THREE.Box3().setFromObject(gravel)
  assert.equal(simplifyDecorativeGravel(model), 1)
  const after = new THREE.Box3().setFromObject(gravel)
  assert.equal(gravel.material, material)
  assert.ok(gravel.geometry.index.count / 3 <= 128)
  assert.ok(Math.abs(after.min.x - before.min.x) < 0.001)
  assert.ok(Math.abs(after.max.z - before.max.z) < 0.001)
  assert.notEqual(gravel.geometry, original)
})

test('the bathroom mirror contributes a solid, thin collider to the house octree', () => {
  const model = new THREE.Group()
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial())
  mirror.name = 'Bathroom Mirror'
  mirror.position.y = 1
  mirror.rotation.y = Math.PI / 4
  model.add(mirror)
  const { world, names } = buildLabelledCollisionWorld(model)
  assert.ok(names.some(name => name.includes('solid mirror')))
  assert.ok(world.sphereIntersect(new THREE.Sphere(new THREE.Vector3(0, 1, 0), 0.1)))
  assert.equal(world.sphereIntersect(new THREE.Sphere(new THREE.Vector3(3, 1, 0), 0.1)), false)
})

test('the heavy chair uses a small silhouette beyond room distance', () => {
  const model = new THREE.Group()
  const chair = new THREE.Group()
  chair.name = 'Simple_Wooden_Chair'
  model.add(chair)
  const original = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.6), new THREE.MeshStandardMaterial())
  original.name = 'abound_test'
  chair.add(original)
  assert.equal(installHeavyChairLod(model), 1)
  const lod = chair.children[0]
  assert.ok(lod.isLOD)
  assert.equal(lod.levels.length, 2)
  assert.equal(lod.levels[0].object, original)
  assert.ok(lod.levels[1].object.geometry.index.count / 3 < 100)
  const camera = new THREE.PerspectiveCamera()
  camera.position.z = 10
  model.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  lod.update(camera)
  assert.equal(original.visible, false)
  assert.equal(lod.levels[1].object.visible, true)
})

test('the jump-scare shake moves the screen and restores the gameplay camera', () => {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(1, 2, 3)
  camera.rotation.set(0.1, 0.2, 0.3)
  const startPosition = camera.position.clone()
  const startRotation = camera.rotation.clone()
  const shake = new HouseScareShake(camera)
  shake.apply(1.5)
  assert.ok(camera.position.distanceTo(startPosition) > 0.001)
  shake.clear()
  assert.ok(camera.position.distanceTo(startPosition) < 1e-9)
  assert.ok(Math.abs(camera.rotation.x - startRotation.x) < 1e-9)
  assert.ok(Math.abs(camera.rotation.y - startRotation.y) < 1e-9)
  assert.ok(Math.abs(camera.rotation.z - startRotation.z) < 1e-9)
})
