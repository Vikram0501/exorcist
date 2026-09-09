import * as THREE from 'three'
import { checkPlayerObstacleCollision }
  from './highwayObstacles.js'


export class HighwayCarController {

  constructor(
    car,
    camera,
    roadPath,
    arcLengths
  ) {

    this.car = car
    this.camera = camera
    this.roadPath = roadPath
    this.arcLengths = arcLengths

    // Car movement values
    this.speed = 0
    this.maxSpeed = 35
    this.acceleration = 18
    this.braking = 28
    this.friction = 8
    this.steerSpeed = 7

    // Keep the car inside the road
    this.minX = -5.5
    this.maxX = 5.5

    // Path progress (distance along road)
    this.pathProgress = 0

    // Lateral offset from road center
    this.lateralOffset = 2

    // Keyboard state
    this.keys = {}

    this.canDrive = false;

    this.brakesWorking = true;

    this.obstacles = null;


    this.onKeyDown = (event) => {

      this.keys[event.code] = true

    }


    this.onKeyUp = (event) => {

      this.keys[event.code] = false

    }


    window.addEventListener(
      'keydown',
      this.onKeyDown
    )


    window.addEventListener(
      'keyup',
      this.onKeyUp
    )


    // Put camera behind the car immediately
    this.updateCarPosition()
    this.camera.position.set(
      this.car.position.x,
      this.car.position.y + 4,
      this.car.position.z + 8
    )

  }



  update(dt) {

    if (this.canDrive) {

        this.updateMovement(dt)

    }

    this.updateCarPosition()
    this.updateCamera()

  }



  updateMovement(dt) {

    // W = accelerate
    if (this.keys['KeyW']) {

      this.speed +=
        this.acceleration * dt

    }


    // S = brake (only if brakes are working)
    if (this.keys['KeyS'] && this.brakesWorking) {

      this.speed -=
        this.braking * dt

    }


    // Slowly lose speed if W is not pressed
    // Only when brakes are working
    if (
      !this.keys['KeyW'] &&
      this.brakesWorking
    ) {

      this.speed -=
        this.friction * dt

    }


    this.speed =
      THREE.MathUtils.clamp(
        this.speed,
        0,
        this.maxSpeed
      )


    // A = move left
    if (this.keys['KeyA']) {

      this.lateralOffset -=
        this.steerSpeed * dt

    }


    // D = move right
    if (this.keys['KeyD']) {

      this.lateralOffset +=
        this.steerSpeed * dt

    }


    // Do not let car leave highway
    this.lateralOffset =
      THREE.MathUtils.clamp(
        this.lateralOffset,
        this.minX,
        this.maxX
      )


    // Move forward along the road path
    const oldProgress = this.pathProgress
    const newProgress =
      this.pathProgress + this.speed * dt

    // Check obstacle collision before moving
    if (
      this.obstacles &&
      this.obstacles.length > 0
    ) {
      const hit =
        checkPlayerObstacleCollision(
          this.obstacles,
          oldProgress,
          newProgress,
          this.lateralOffset
        )

      if (hit) {
        this.pathProgress =
          hit.progress - 2.5
        this.speed = 0
      } else {
        this.pathProgress = newProgress
      }
    } else {
      this.pathProgress = newProgress
    }

  }


  updateCarPosition() {

    if (
      !this.roadPath ||
      !this.arcLengths
    ) {
      return
    }

    const totalLength =
      this.arcLengths[
        this.arcLengths.length - 1
      ]

    const clampedProgress =
      THREE.MathUtils.clamp(
        this.pathProgress,
        0,
        totalLength
      )

    this.pathProgress = clampedProgress

    const sample =
      this.getSampleAtDistance(
        clampedProgress
      )


    // Compute perpendicular offset

    const perpX =
      -Math.cos(sample.angle)
    const perpZ =
      Math.sin(sample.angle)


    this.car.position.set(
      sample.position.x +
        perpX * this.lateralOffset,
      0.2,
      sample.position.z +
        perpZ * this.lateralOffset
    )


    // Rotate car to face travel direction

    this.car.rotation.y = sample.angle

  }


  getSampleAtDistance(distance) {

    if (
      !this.roadPath ||
      !this.arcLengths
    ) {
      return {
        position: this.car.position.clone(),
        direction: new THREE.Vector2(0, -1),
        angle: 0,
      }
    }

    const points = this.roadPath
    const arcLengths = this.arcLengths
    const totalLength =
      arcLengths[arcLengths.length - 1]

    if (distance <= 0) {
      return this.computeSample(points, 0)
    }

    if (distance >= totalLength) {
      return this.computeSample(
        points,
        points.length - 1
      )
    }

    let segIndex = 0
    for (
      let i = 0;
      i < arcLengths.length - 1;
      i++
    ) {
      if (
        distance >= arcLengths[i] &&
        distance < arcLengths[i + 1]
      ) {
        segIndex = i
        break
      }
    }

    const segLength =
      arcLengths[segIndex + 1] -
      arcLengths[segIndex]
    const t =
      segLength > 0
        ? (distance - arcLengths[segIndex]) /
          segLength
        : 0

    const p0 = points[segIndex]
    const p1 = points[segIndex + 1]

    const position = new THREE.Vector3(
      p0.x + (p1.x - p0.x) * t,
      0,
      p0.z + (p1.z - p0.z) * t
    )

    const dir0 =
      this.getDirectionAt(points, segIndex)
    const dir1 =
      this.getDirectionAt(
        points,
        segIndex + 1
      )

    const bx =
      dir0.x + (dir1.x - dir0.x) * t
    const by =
      dir0.y + (dir1.y - dir0.y) * t
    const bLen = Math.sqrt(bx * bx + by * by)

    const direction = new THREE.Vector2(
      bLen > 0.001 ? bx / bLen : 0,
      bLen > 0.001 ? by / bLen : -1
    )

    return {
      position,
      direction,
      angle: Math.atan2(
        direction.x,
        direction.y
      ),
    }

  }


  computeSample(points, index) {
    const dir = this.getDirectionAt(
      points,
      index
    )
    return {
      position: points[index].clone(),
      direction: dir.clone(),
      angle: Math.atan2(dir.x, dir.y),
    }
  }


  getDirectionAt(points, index) {
    const p0 =
      points[Math.max(0, index - 1)]
    const p2 =
      points[
        Math.min(
          points.length - 1,
          index + 1
        )
      ]

    const dx = p2.x - p0.x
    const dz = p2.z - p0.z
    const len = Math.sqrt(dx * dx + dz * dz)

    if (len < 0.001) {
      return new THREE.Vector2(0, -1)
    }

    return new THREE.Vector2(
      dx / len,
      dz / len
    )
  }


  updateCamera() {

    const sample =
      this.getSampleAtDistance(
        this.pathProgress
      )

    const dir = sample.direction


    // Camera behind the car (opposite of travel direction)

    const behindX =
      this.car.position.x - dir.x * 8
    const behindZ =
      this.car.position.z - dir.y * 8


    const targetPosition =
      new THREE.Vector3(
        behindX,
        this.car.position.y + 4,
        behindZ
      )


    // Smoothly follow car
    this.camera.position.lerp(
      targetPosition,
      0.1
    )


    // Look ahead (in the direction of travel)
    const aheadX =
      this.car.position.x + dir.x * 8
    const aheadZ =
      this.car.position.z + dir.y * 8

    this.camera.lookAt(
      aheadX,
      this.car.position.y + 1,
      aheadZ
    )

  }

  setDrivingEnabled(enabled) {

    this.canDrive = enabled

    if (!enabled) {

        this.speed = 0

    }

    if (enabled) {

        this.brakesWorking = true

    }

}



  dispose() {

    window.removeEventListener(
      'keydown',
      this.onKeyDown
    )


    window.removeEventListener(
      'keyup',
      this.onKeyUp
    )

  }

}
