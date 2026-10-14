import * as THREE from 'three'
import { HOUSE_JUMP_SCARE_DURATION } from './story-data.js'

// Apply the scare jolt only around rendering. Player movement and interaction
// keep the unshaken camera position.
export class HouseScareShake {
  constructor(camera) {
    this.camera = camera
    this.offset = new THREE.Vector3()
    this.roll = 0
    this.pitch = 0
    this.yaw = 0
    this.applied = false
  }

  apply(remaining) {
    this.clear()
    if (!(remaining > 0)) return
    const elapsed = HOUSE_JUMP_SCARE_DURATION - remaining
    const strength = Math.min(1, remaining / 0.22) * (0.5 + 0.5 * Math.exp(-elapsed * 2))
    this.offset.set(
      (Math.sin(elapsed * 67) * 0.045 + Math.sin(elapsed * 113) * 0.016) * strength,
      Math.sin(elapsed * 79 + 0.8) * 0.035 * strength,
      0,
    )
    this.roll = Math.sin(elapsed * 61 + 0.3) * 0.055 * strength
    this.pitch = Math.sin(elapsed * 73) * 0.03 * strength
    this.yaw = Math.sin(elapsed * 49 + 0.5) * 0.025 * strength
    this.camera.position.add(this.offset)
    this.camera.rotation.z += this.roll
    this.camera.rotation.x += this.pitch
    this.camera.rotation.y += this.yaw
    this.applied = true
  }

  clear() {
    if (!this.applied) return
    this.camera.position.sub(this.offset)
    this.camera.rotation.z -= this.roll
    this.camera.rotation.x -= this.pitch
    this.camera.rotation.y -= this.yaw
    this.applied = false
  }
}
