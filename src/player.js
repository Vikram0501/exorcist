import * as THREE from 'three'

const PLAYER_RADIUS = 0.35
const EYE_HEIGHT = 1.7
const WALK_SPEED = 6
const SPRINT_SPEED = 10
const ACCEL = 45
const DAMPING = 10
const GRAVITY = -20
const JUMP_VELOCITY = 7.5
const STEP_HEIGHT = 0.5

export class Player {
  constructor(camera, input) {
    this.camera = camera
    this.input = input
    this.velocity = new THREE.Vector3()
    this.position = camera.position
    this.position.set(20, EYE_HEIGHT, 25)
    this.isGrounded = true
    this.flying = false

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF') {
        this.flying = !this.flying
        this.velocity.y = 0
      }
    })
  }

  reset(spawn, yaw = 0) {
    this.velocity.set(0, 0, 0)
    this.position.copy(spawn)
    this.isGrounded = true
    this.flying = false
    this.input.yaw = yaw
    this.input.pitch = 0
    this.updateRotation()
  }

  update(dt, colliders) {
    this.updateRotation()
    this.updateVelocity(dt)
    this.move(dt)
    if (!this.flying) {
      const walls = colliders.filter(c => c.type === 'wall' || c.type === 'door')
      this.collide(walls)
      this.applyGravity(dt, colliders)
      this.position.y = Math.max(this.position.y, EYE_HEIGHT)
    }
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

    if (this.flying) {
      const flySpeed = sprinting ? SPRINT_SPEED : WALK_SPEED
      if (this.input.isDown('Space')) {
        this.velocity.y = flySpeed
      } else if (this.input.isDown('KeyC')) {
        this.velocity.y = -flySpeed
      } else {
        this.velocity.y = 0
      }
    } else {
      if (this.input.isDown('Space') && this.isGrounded) {
        this.velocity.y = JUMP_VELOCITY
        this.isGrounded = false
      }
    }
  }

  move(dt) {
    this.position.x += this.velocity.x * dt
    this.position.z += this.velocity.z * dt
    this.position.y += this.velocity.y * dt
  }

  collide(colliders) {
    for (const c of colliders) {
      const playerBottom = this.position.y - EYE_HEIGHT
      const playerTop = this.position.y + 0.1
      if (
        c.minY !== undefined &&
        c.maxY !== undefined &&
        (playerTop <= c.minY || playerBottom >= c.maxY)
      ) continue

      const nearestX = clamp(this.position.x, c.minX, c.maxX)
      const nearestZ = clamp(this.position.z, c.minZ, c.maxZ)
      const dx = this.position.x - nearestX
      const dz = this.position.z - nearestZ
      const distSq = dx * dx + dz * dz

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq)
          const push = Math.min((PLAYER_RADIUS - dist) / dist, 2)
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
    const feetY = this.position.y - EYE_HEIGHT
    const walkableSurface = this.getWalkableSurface(colliders, feetY)
    if (
      this.velocity.y <= 0 &&
      this.isGrounded &&
      walkableSurface !== null &&
      Math.abs(walkableSurface.top - feetY) <= STEP_HEIGHT
    ) {
      this.setGroundedSurface(walkableSurface)
      this.velocity.y = 0
      return
    }

    this.velocity.y += GRAVITY * dt
    const nextFeetY = this.position.y - EYE_HEIGHT
    const previousFeetY = nextFeetY - this.velocity.y * dt
    const landingSurface = this.getLandingSurface(colliders, previousFeetY, nextFeetY)
    if (landingSurface !== null) {
      this.setGroundedSurface(landingSurface)
      this.velocity.y = 0
      this.isGrounded = true
      return
    }

    this.isGrounded = false
  }

  getWalkableSurface(colliders, feetY) {
    let surface = { top: 0, floor: 0 }
    for (const c of colliders) {
      const candidate = this.getColliderSurface(c)
      if (candidate === null || Math.abs(candidate.top - feetY) > STEP_HEIGHT) continue
      if (candidate.top > surface.top) surface = candidate
    }
    return surface
  }

  getLandingSurface(colliders, previousFeetY, feetY) {
    const surfaces = []
    if (previousFeetY >= 0 && feetY <= 0) surfaces.push({ top: 0, floor: 0 })
    for (const c of colliders) {
      const candidate = this.getColliderSurface(c)
      if (candidate === null || previousFeetY < candidate.top || feetY > candidate.top) continue
      surfaces.push(candidate)
    }
    return surfaces.length > 0
      ? surfaces.reduce((highest, candidate) => candidate.top > highest.top ? candidate : highest)
      : null
  }

  getColliderSurface(c) {
    if (c.type === 'floor') {
      return this.overlapsCollider(c) ? { top: c.top, floor: c.floor } : null
    }
    if (c.type === 'ramp') {
      const top = this.getRampSurface(c)
      return top === null ? null : { top, floor: -1 }
    }
    return null
  }

  setGroundedSurface(surface) {
    this.position.y = surface.top + EYE_HEIGHT
  }

  overlapsCollider(c) {
    return (
      this.position.x > c.minX - PLAYER_RADIUS &&
      this.position.x < c.maxX + PLAYER_RADIUS &&
      this.position.z > c.minZ - PLAYER_RADIUS &&
      this.position.z < c.maxZ + PLAYER_RADIUS
    )
  }

  getRampSurface(ramp) {
    let totalLength = 0
    const segments = []
    for (let i = 1; i < ramp.points.length; i++) {
      const [startX, startZ] = ramp.points[i - 1]
      const [endX, endZ] = ramp.points[i]
      const length = Math.hypot(endX - startX, endZ - startZ)
      segments.push({ startX, startZ, endX, endZ, length, totalLength })
      totalLength += length
    }

    for (const segment of segments) {
      const dx = segment.endX - segment.startX
      const dz = segment.endZ - segment.startZ
      const t = Math.max(
        0,
        Math.min(
          1,
          ((this.position.x - segment.startX) * dx +
            (this.position.z - segment.startZ) * dz) /
            (segment.length * segment.length)
        )
      )
      const nearestX = segment.startX + dx * t
      const nearestZ = segment.startZ + dz * t
      if (Math.hypot(this.position.x - nearestX, this.position.z - nearestZ) > ramp.width) continue

      return THREE.MathUtils.lerp(
        ramp.bottomY,
        ramp.topY,
        (segment.totalLength + segment.length * t) / totalLength
      )
    }

    return null
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
