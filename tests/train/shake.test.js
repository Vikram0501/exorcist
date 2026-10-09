import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { TrainCameraShake } from '../../src/levels/train/shake.js'

function snapshot(camera) {
  return {
    position: camera.position.clone(),
    rotation: camera.rotation.clone(),
  }
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} !== ${expected}`)
}

test('the carriage sway nudges the camera only while it is applied', () => {
  const camera = new THREE.PerspectiveCamera()
  const before = snapshot(camera)
  const shake = new TrainCameraShake(camera)

  shake.apply(1 / 60)

  const moved =
    camera.position.distanceTo(before.position) > 0 ||
    Math.abs(camera.rotation.z - before.rotation.z) > 0
  assert.ok(moved, 'the camera is nudged for the render')
  assert.ok(camera.position.distanceTo(before.position) < 0.05, 'the sway stays subtle')
  assert.ok(Math.abs(camera.rotation.z) < 0.02, 'the roll stays subtle')

  shake.clear()
  assertClose(camera.position.distanceTo(before.position), 0, 'position restored')
  assertClose(camera.rotation.z, before.rotation.z, 'roll restored')
  assertClose(camera.rotation.x, before.rotation.x, 'pitch restored')
})

test('applying and clearing the sway over many frames never drifts the camera', () => {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500)
  camera.position.set(2.8, 1, -127)
  camera.rotation.set(-0.2, 1.4, 0)
  const before = snapshot(camera)
  const shake = new TrainCameraShake(camera)

  for (let frame = 0; frame < 600; frame++) {
    shake.apply(1 / 60)
    shake.clear()
  }

  assertClose(camera.position.distanceTo(before.position), 0, 'position drift')
  assertClose(camera.rotation.x, before.rotation.x, 'pitch drift')
  assertClose(camera.rotation.y, before.rotation.y, 'yaw drift')
  assertClose(camera.rotation.z, before.rotation.z, 'roll drift')
})

test('the sway keeps moving so the carriage never looks frozen', () => {
  const camera = new THREE.PerspectiveCamera()
  const shake = new TrainCameraShake(camera)

  shake.apply(1 / 60)
  const first = camera.position.clone()
  shake.clear()

  shake.apply(10)
  const later = camera.position.clone()
  shake.clear()

  assert.ok(first.distanceTo(later) > 0, 'the offset changes over time')
})
