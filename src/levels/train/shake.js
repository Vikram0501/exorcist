import * as THREE from 'three'

const SWAY_LATERAL = 0.012
const SWAY_HARMONIC = 0.005
const BOB_VERTICAL = 0.007
const ROLL_AMOUNT = 0.005
const PITCH_AMOUNT = 0.002
const SWAY_RATE = 0.85
const HARMONIC_RATE = 2.3
const BOB_RATE = 3.1

// Camera sway that reads as a carriage rolling over the rails. The offset is
// applied just before rendering and removed right after, so gameplay logic
// (which shares the camera position with the player) never sees it.
export class TrainCameraShake {
  constructor(camera) {
    this.camera = camera
    this.time = 0
    this.applied = false
    this.offset = new THREE.Vector3()
    this.roll = 0
    this.pitch = 0
  }

  apply(dt) {
    this.clear()

    this.time += dt

    const t = this.time
    this.offset.set(
      Math.sin(t * SWAY_RATE) * SWAY_LATERAL +
        Math.sin(t * HARMONIC_RATE + 1.7) * SWAY_HARMONIC,
      Math.sin(t * BOB_RATE + 0.6) * BOB_VERTICAL,
      Math.sin(t * SWAY_RATE * 0.5 + 2.2) * SWAY_HARMONIC
    )
    this.roll = Math.sin(t * SWAY_RATE + 0.9) * ROLL_AMOUNT
    this.pitch = Math.sin(t * BOB_RATE * 0.5) * PITCH_AMOUNT

    this.camera.position.add(this.offset)
    this.camera.rotation.z += this.roll
    this.camera.rotation.x += this.pitch
    this.applied = true
  }

  clear() {
    if (!this.applied) return
    this.camera.position.sub(this.offset)
    this.camera.rotation.z -= this.roll
    this.camera.rotation.x -= this.pitch
    this.applied = false
  }
}
