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
    this.rattleIntensity = 0
    this.rattleDuration = 0
    this.rattleElapsed = 0
  }

  // A violent shake layered over the rolling sway — the closing beat's
  // scream-and-whiteout. Decays linearly to nothing over its duration.
  rattle(intensity = 0.08, duration = 1) {
    this.rattleIntensity = intensity
    this.rattleDuration = duration
    this.rattleElapsed = 0
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

    if (this.rattleDuration > 0) {
      this.rattleElapsed += dt
      if (this.rattleElapsed < this.rattleDuration) {
        const amount = this.rattleIntensity * (1 - this.rattleElapsed / this.rattleDuration)
        this.offset.x += (Math.random() * 2 - 1) * amount
        this.offset.y += (Math.random() * 2 - 1) * amount
        this.roll += (Math.random() * 2 - 1) * amount * 0.6
        this.pitch += (Math.random() * 2 - 1) * amount * 0.6
      } else {
        this.rattleDuration = 0
      }
    }

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
