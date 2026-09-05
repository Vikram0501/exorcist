import * as THREE from 'three'


export class HighwayCarController {

  constructor(car, camera) {

    this.car = car
    this.camera = camera

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

    // Keyboard state
    this.keys = {}

    this.canDrive = false;


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

    this.updateCamera()

  }



  updateMovement(dt) {

    // W = accelerate
    if (this.keys['KeyW']) {

      this.speed +=
        this.acceleration * dt

    }


    // S = brake
    if (this.keys['KeyS']) {

      this.speed -=
        this.braking * dt

    }


    // Slowly lose speed if W is not pressed
    if (!this.keys['KeyW']) {

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

      this.car.position.x -=
        this.steerSpeed * dt

    }


    // D = move right
    if (this.keys['KeyD']) {

      this.car.position.x +=
        this.steerSpeed * dt

    }


    // Do not let car leave highway
    this.car.position.x =
      THREE.MathUtils.clamp(
        this.car.position.x,
        this.minX,
        this.maxX
      )


    // Move forward down the highway
    this.car.position.z -=
      this.speed * dt

  }



  updateCamera() {

    const targetPosition =
      new THREE.Vector3(
        this.car.position.x,
        this.car.position.y + 4,
        this.car.position.z + 8
      )


    // Smoothly follow car
    this.camera.position.lerp(
      targetPosition,
      0.1
    )


    // Look ahead of the car
    this.camera.lookAt(
      this.car.position.x,
      this.car.position.y + 1,
      this.car.position.z - 8
    )

  }

  setDrivingEnabled(enabled) {

    this.canDrive = enabled

    if (!enabled) {

        this.speed = 0

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