import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { installBathroomMirror } from '../../src/levels/house/mirror.js'

test('a named bathroom plane becomes a live reflection in its authored position', () => {
  const model = new THREE.Group()
  model.position.set(2, 1, -3)
  model.rotation.y = 0.4
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial())
  surface.name = 'BathroomMirror'
  surface.position.set(1, 2, 0.4)
  surface.rotation.y = Math.PI / 3
  surface.scale.set(1.2, 0.8, 1)
  model.add(surface)
  const avatar = { root: new THREE.Group() }
  avatar.root.visible = false

  const reflection = installBathroomMirror(model, avatar)
  assert.ok(reflection)
  assert.equal(surface.visible, false)
  assert.equal(reflection.frame.children.filter(child => child.isMesh).length, 4)
  assert.ok(reflection.faceLight.intensity > 0)
  assert.equal(reflection.mirror.material.uniforms.color.value.getHex(), 0xffffff)
  model.updateMatrixWorld(true)
  const camera = new THREE.PerspectiveCamera()
  camera.position.copy(reflection.mirror.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0, 2))
  reflection.update(camera)
  assert.equal(reflection.mirror.visible, true)
  camera.position.set(100, 100, 100)
  reflection.update(camera)
  assert.equal(reflection.mirror.visible, false)
  assert.equal(surface.visible, true)

  const sourcePosition = surface.geometry.getAttribute('position')
  const mirrorPosition = reflection.mirror.geometry.getAttribute('position')
  for (let i = 0; i < sourcePosition.count; i++) {
    const sourcePoint = new THREE.Vector3().fromBufferAttribute(sourcePosition, i).applyMatrix4(surface.matrixWorld)
    const mirrorPoint = new THREE.Vector3().fromBufferAttribute(mirrorPosition, i).applyMatrix4(reflection.mirror.matrixWorld)
    assert.ok(sourcePoint.distanceTo(mirrorPoint) < 1e-5)
  }
  reflection.dispose()
  assert.equal(surface.visible, true)
})

test('a house without the named plane loads without a mirror', () => {
  assert.equal(installBathroomMirror(new THREE.Group(), { root: new THREE.Group() }), null)
})

test('the new Bathroom Mirror export name also installs the reflection', () => {
  const model = new THREE.Group()
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
  surface.name = 'Bathroom Mirror'
  model.add(surface)
  const reflection = installBathroomMirror(model, { root: new THREE.Group() })
  assert.ok(reflection)
  reflection.dispose()
  surface.name = 'Bathroom_Mirror'
  surface.visible = true
  const loadedReflection = installBathroomMirror(model, { root: new THREE.Group() })
  assert.ok(loadedReflection)
  loadedReflection.dispose()
})
