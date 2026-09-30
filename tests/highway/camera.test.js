import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  HighwayCarController,
} from '../../src/levels/highway/car.js'

function straightRoad() {
  const roadPath = [
    new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(0, 0, -940),
  ]
  return { roadPath, arcLengths: [0, 950] }
}

test('chase camera sits modestly closer and lower, still looking ahead', async () => {
  assert.equal(CAMERA_DISTANCE, 6.8)
  assert.equal(CAMERA_HEIGHT, 3.6)

  const originalWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try {
    const { roadPath, arcLengths } = straightRoad()
    const camera = new THREE.PerspectiveCamera()
    const car = new THREE.Object3D()
    const controller = new HighwayCarController(
      car, camera, roadPath, arcLengths
    )

    controller.pathProgress = 200
    controller.lateralOffset = 0
    controller.updateCarPosition()

    camera.position.set(999, 999, 999)
    for (let i = 0; i < 300; i++) {
      controller.updateCamera()
    }

    const gap = camera.position.distanceTo(car.position)
    const expected = Math.sqrt(
      CAMERA_DISTANCE * CAMERA_DISTANCE +
        CAMERA_HEIGHT * CAMERA_HEIGHT
    )
    assert.ok(
      Math.abs(gap - expected) < 0.3,
      `camera gap ${gap.toFixed(2)}, expected ~${expected.toFixed(2)}`
    )
    assert.ok(
      camera.position.z > car.position.z,
      'camera stays behind the car'
    )

    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    assert.ok(
      forward.z < -0.5,
      'camera still looks down-road'
    )

    controller.dispose()
  } finally {
    globalThis.window = originalWindow
  }
})
