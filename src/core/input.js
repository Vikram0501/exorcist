export class Input {
  constructor(domElement) {
    this.dom = domElement
    this.keys = new Set()
    this.pressed = new Set()
    this.yaw = 0
    this.pitch = 0
    this.isLocked = false
    this.preserveViewOnLock = false
    this.suppressMouseUntil = 0
    this.suppressMouseMoves = 0
    this.viewBeforeLock = null

    this.onKeyDown = (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code)
      this.keys.add(e.code)
    }
    this.onKeyUp = (e) => this.keys.delete(e.code)
    this.onMouseMove = (e) => {
      if (!this.isLocked) return
      if (performance.now() < this.suppressMouseUntil) return
      if (this.suppressMouseMoves > 0) {
        this.suppressMouseMoves--
        return
      }
      // Some browsers deliver a warp-sized delta after recapturing the cursor.
      if (Math.abs(e.movementX) > 120 || Math.abs(e.movementY) > 120) return
      this.yaw -= e.movementX * 0.002
      this.pitch -= e.movementY * 0.002
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch))
    }
    this.onLockChange = () => {
      this.isLocked = document.pointerLockElement === this.dom
      if (this.isLocked && this.preserveViewOnLock) {
        // Browsers can report the cursor's move back into the canvas as a
        // large relative delta when an inspection dialog closes.
        this.yaw = this.viewBeforeLock.yaw
        this.pitch = this.viewBeforeLock.pitch
        this.suppressMouseUntil = performance.now() + 250
        this.suppressMouseMoves = 2
      } else if (this.isLocked) {
        this.suppressMouseUntil = 0
        this.suppressMouseMoves = 0
      }
      if (this.isLocked) {
        this.preserveViewOnLock = false
        this.viewBeforeLock = null
      }
      if (!this.isLocked) this.clear()
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
    window.addEventListener('blur', () => this.clear())
  }

  isDown(code) {
    return this.keys.has(code)
  }

  consumePressed(code) {
    return this.pressed.delete(code)
  }

  clear() {
    this.keys.clear()
    this.pressed.clear()
  }

  lock({ preserveView = false } = {}) {
    this.clear()
    this.preserveViewOnLock = preserveView
    this.viewBeforeLock = preserveView ? { yaw: this.yaw, pitch: this.pitch } : null
    const request = this.dom.requestPointerLock()
    request?.catch(() => {})
  }

  release() {
    this.clear()
    document.exitPointerLock()
  }
}
