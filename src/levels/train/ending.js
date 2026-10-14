// The train's closing beat. Speaking the name calls the spirit up one last
// time: it appears in the burnt carriage's doorway, screams as the camera
// shakes, and the world burns out to white before the level ends.

export const APPARITION_SECONDS = 1.6

// The name scream runs ~8.1s; the white-out rides the whole cry plus a
// beat of silence after it.
export const FADE_SECONDS = 8.6

// How far inside the burnt carriage's doorway the spirit stands.
export const ENTRANCE_OFFSET = 1.2

// Fallback when the chamber is missing: how far past the ash ring it stands.
export const APPARITION_OFFSET = 3.2

// Camera shake layered over the train's sway during the whiteout.
export const SHAKE_INTENSITY = 0.07

export class TrainEnding {
  constructor({ zombie = null, exorcism = null, audio = null, shake = null, onExit = () => {} } = {}) {
    this.zombie = zombie
    this.exorcism = exorcism
    this.audio = audio
    this.shake = shake
    this.onExit = onExit
    this.active = false
    this.finished = false
    this.caseClosed = false
    this.elapsed = 0
    this.fading = false
    this.fade = null
  }

  start() {
    if (this.active || this.finished || !this.zombie) return false
    this.active = true
    this.finished = false
    this.caseClosed = false
    this.elapsed = 0
    this.fading = false

    const entrance = this.exorcism?.carriage?.bounds?.min?.z
    const seal = this.exorcism?.position
    const z = entrance !== undefined
      ? entrance + ENTRANCE_OFFSET
      : seal
        ? seal.z + APPARITION_OFFSET
        : this.zombie.maxZ - 6
    this.zombie.appearAt(z)
    this.buildFade()
    return true
  }

  update(dt) {
    if (!this.active) return false
    this.elapsed += dt

    if (!this.fading && this.elapsed >= APPARITION_SECONDS) {
      this.fading = true
      if (this.fade) this.fade.style.opacity = '1'
      this.audio?.playScream('name')
      this.shake?.rattle(SHAKE_INTENSITY, FADE_SECONDS)
    }

    if (this.elapsed >= APPARITION_SECONDS + FADE_SECONDS) {
      this.dispose()
      this.finished = true
      this.onExit()
      return true
    }
    return false
  }

  buildFade() {
    if (typeof document === 'undefined' || this.fade) return
    const fade = document.createElement('div')
    fade.id = 'trainEndingFade'
    fade.style.cssText =
      'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;' +
      `transition:opacity ${FADE_SECONDS}s ease-in;z-index:105;`
    document.body.append(fade)
    this.fade = fade
  }

  dispose() {
    this.fade?.remove()
    this.fade = null
    this.active = false
  }
}
