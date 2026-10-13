// The train's closing beat. Speaking the name calls the spirit up one last
// time in the burnt carriage: it stands in the aisle, screams, and the world
// burns out to white before the case menu takes over.

export const APPARITION_SECONDS = 1.6

export const FADE_SECONDS = 2.2

// How far past the ash ring the spirit stands — deep enough that the player
// has to look up the carriage at it.
export const APPARITION_OFFSET = 3.2

export class TrainEnding {
  constructor({ zombie = null, exorcism = null, audio = null, onExit = () => {} } = {}) {
    this.zombie = zombie
    this.exorcism = exorcism
    this.audio = audio
    this.onExit = onExit
    this.active = false
    this.finished = false
    this.promptShown = false
    this.elapsed = 0
    this.fading = false
    this.fade = null
  }

  start() {
    if (this.active || this.finished || !this.zombie) return false
    this.active = true
    this.finished = false
    this.promptShown = false
    this.elapsed = 0
    this.fading = false

    const seal = this.exorcism?.position
    const z = seal ? seal.z + APPARITION_OFFSET : this.zombie.maxZ - 6
    this.zombie.appearAt(z)
    this.audio?.playScream('name')
    this.buildFade()
    return true
  }

  update(dt) {
    if (!this.active) return false
    this.elapsed += dt

    if (!this.fading && this.elapsed >= APPARITION_SECONDS) {
      this.fading = true
      if (this.fade) this.fade.style.opacity = '1'
    }

    if (this.elapsed >= APPARITION_SECONDS + FADE_SECONDS) {
      this.active = false
      this.finished = true
      this.showPrompt()
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

  // The white screen becomes the exit prompt: no panel, no backdrop, just the
  // line and the way out.
  showPrompt() {
    if (typeof document === 'undefined' || !this.fade || this.prompt) return
    const prompt = document.createElement('div')
    prompt.id = 'trainEndingPrompt'
    prompt.style.cssText =
      'position:absolute;inset:0;display:grid;place-content:center;gap:26px;' +
      'text-align:center;color:#241d1a;font-family:Georgia,serif;pointer-events:auto;'

    const line = document.createElement('p')
    line.textContent = 'THE TRAIN RUNS ON QUIET'
    line.style.cssText = 'margin:0;font-size:clamp(20px,3.4vw,34px);letter-spacing:.16em;'

    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'RETURN TO THE CASE FILES'
    button.style.cssText =
      'padding:14px 26px;border:1px solid #241d1a;background:transparent;color:#241d1a;' +
      'font:700 12px/1 system-ui,sans-serif;letter-spacing:.22em;cursor:pointer;'
    button.addEventListener('click', () => {
      this.dispose()
      this.onExit()
    })

    prompt.append(line, button)
    this.fade.append(prompt)
    this.fade.style.pointerEvents = 'auto'
    this.prompt = prompt
    button.focus()
  }

  dispose() {
    this.fade?.remove()
    this.fade = null
    this.prompt = null
    this.active = false
  }
}
