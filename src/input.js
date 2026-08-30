export class Input {
  constructor(domElement) {
    this.dom = domElement
    this.keys = new Set()
    this.pressed = new Set()
    this.yaw = 0
    this.pitch = 0
    this.isLocked = false

    this.onKeyDown = (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code)
      this.keys.add(e.code)
    }
    this.onKeyUp = (e) => this.keys.delete(e.code)
    this.onMouseMove = (e) => {
      if (!this.isLocked) return
      this.yaw -= e.movementX * 0.002
      this.pitch -= e.movementY * 0.002
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch))
    }
    this.onLockChange = () => {
      this.isLocked = document.pointerLockElement === this.dom
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  isDown(code) {
    return this.keys.has(code)
  }

  consumePressed(code) {
    return this.pressed.delete(code)
  }

  lock() {
    this.dom.requestPointerLock()
  }

  release() {
    this.keys.clear()
    this.pressed.clear()
    document.exitPointerLock()
  }
}
