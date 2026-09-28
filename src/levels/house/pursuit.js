import * as THREE from 'three'

const CHASE_SPEED = 5.6

// Follow the route the player actually walked, including stairs and doorways.
// A short head start gives time to read the warning and orient toward the grave.
export class HousePursuit {
  constructor() {
    this.state = 'idle'
    this.position = new THREE.Vector3()
    this.checkpoint = new THREE.Vector3()
    this.route = []
    this.grace = 0
  }

  start(position) {
    this.checkpoint.copy(position)
    this.position.copy(position).add(new THREE.Vector3(0, 0, 3))
    this.route = [position.clone()]
    this.grace = 1.3
    this.state = 'chasing'
  }

  update(dt, position, grave) {
    if (this.state !== 'chasing') return this.state
    if (Math.hypot(position.x - grave.x, position.z - grave.z) < 2.6 &&
        Math.abs(position.y - grave.y - 1) < 2) {
      this.state = 'safe'
      return this.state
    }
    const last = this.route.at(-1) || this.position
    if (last.distanceToSquared(position) > 0.04) this.route.push(position.clone())
    if (this.grace > 0) {
      this.grace = Math.max(0, this.grace - dt)
      return this.state
    }
    let distance = CHASE_SPEED * dt
    while (distance > 0 && this.route.length) {
      const target = this.route[0]
      const gap = this.position.distanceTo(target)
      if (gap <= distance) {
        this.position.copy(target)
        this.route.shift()
        distance -= gap
      } else {
        this.position.lerp(target, distance / gap)
        distance = 0
      }
    }
    if (this.position.distanceTo(position) < 0.85) this.state = 'caught'
    return this.state
  }

  retry() {
    this.start(this.checkpoint)
    return this.checkpoint.clone()
  }
}
