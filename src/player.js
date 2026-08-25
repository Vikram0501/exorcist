import * as THREE from 'three'

const PLAYER_RADIUS = 0.5
const EYE_HEIGHT = 1.7
const WALK_SPEED = 6
const SPRINT_SPEED = 10
const ACCEL = 45
const DAMPING = 10
const GRAVITY = -20
const JUMP_VELOCITY = 7.5

export class Player {
  constructor(camera, input) {
    this.camera = camera
    this.input = input
    this.velocity = new THREE.Vector3()
    this.position = camera.position
    this.position.set(3, EYE_HEIGHT, 3)
    this.isGrounded = true
  }

  update(dt, colliders) {
    this.updateRotation()
    this.updateVelocity(dt)
    this.move(dt)
    this.collide(colliders)
    this.applyGravity(dt, colliders)
    this.position.y = Math.max(this.position.y, EYE_HEIGHT)
    this.camera.position.copy(this.position)
  }

  updateRotation() {
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.input.yaw
    this.camera.rotation.x = this.input.pitch
  }

  updateVelocity(dt) {
    const forward = this.getForward()
    const right = this.getRight()

    const moveX = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0)
    const moveZ = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0)

    const wish = new THREE.Vector3()
    wish
      .addScaledVector(right, moveX)
      .addScaledVector(forward, moveZ)
    if (wish.lengthSq() > 0) wish.normalize()

    const sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED

    const targetVx = wish.x * speed
    const targetVz = wish.z * speed

    const blend = 1 - Math.exp(-ACCEL * dt)
    this.velocity.x += (targetVx - this.velocity.x) * blend
    this.velocity.z += (targetVz - this.velocity.z) * blend

    if (this.input.isDown('Space') && this.isGrounded) {
      this.velocity.y = JUMP_VELOCITY
      this.isGrounded = false
    }
  }

  move(dt) {
    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt
    this.position.y += this.velocity.y * dt
  }

  collide(colliders) {
    for (const c of colliders) {
      const nearestX = clamp(this.position.x, c.minX, c.maxX)
      const nearestZ = clamp(this.position.z, c.minZ, c.maxZ)
      const dx = this.position.x - nearestX
      const dz = this.position.z - nearestZ
      const distSq = dx * dx + dz * dz

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq)
          const push = (PLAYER_RADIUS - dist) / dist
          this.position.x += dx * push
          this.position.z += dz * push
        } else {
          const toCenterX = this.position.x - (c.minX + c.maxX) / 2
          const toCenterZ = this.position.z - (c.minZ + c.maxZ) / 2
          if (Math.abs(toCenterX) > Math.abs(toCenterZ)) {
            this.position.x =
              toCenterX > 0 ? c.maxX + PLAYER_RADIUS : c.minX - PLAYER_RADIUS
          } else {
            this.position.z =
              toCenterZ > 0 ? c.maxZ + PLAYER_RADIUS : c.minZ - PLAYER_RADIUS
          }
        }
      }
    }
  }

  applyGravity(dt, colliders) {
    if (this.velocity.y <= 0 && this.isGrounded) {
      this.velocity.y = 0
      return
    }

    this.velocity.y += GRAVITY * dt
    const feetY = this.position.y - EYE_HEIGHT
    if (feetY <= 0) {
      this.position.y = EYE_HEIGHT
      this.velocity.y = 0
      this.isGrounded = true
      return
    }

    for (const c of colliders) {
      const overlapsXZ =
        this.position.x > c.minX - PLAYER_RADIUS &&
        this.position.x < c.maxX + PLAYER_RADIUS &&
        this.position.z > c.minZ - PLAYER_RADIUS &&
        this.position.z < c.maxZ + PLAYER_RADIUS
      if (!overlapsXZ) continue

      const prevFeetY = this.position.y - EYE_HEIGHT - this.velocity.y * dt
      if (prevFeetY >= c.top && feetY <= c.top) {
        this.position.y = c.top + EYE_HEIGHT
        this.velocity.y = 0
        this.isGrounded = true
        return
      }
    }

    this.isGrounded = false
  }

  getForward() {
    return new THREE.Vector3(
      -Math.sin(this.input.yaw),
      0,
      -Math.cos(this.input.yaw)
    )
  }

  getRight() {
    return new THREE.Vector3(
      Math.cos(this.input.yaw),
      0,
      -Math.sin(this.input.yaw)
    )
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}