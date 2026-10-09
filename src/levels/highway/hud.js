import { FINISH_DISTANCE_BUFFER } from './track.js'

// ============================================
// LEVEL 3 ARCADE RACING HUD
// ============================================
//
// Read-only overlay on top of the existing race: speed, timer, position,
// progress and checkpoint feedback. All values derive from the live
// HighwayCarController / HighwayRaceController / Track state — no new
// timing, physics or progress systems. DOM writes are throttled to
// HUD_UPDATE_HZ and skipped when values are unchanged.
//
// Layout avoids every existing element: the case-file panel (top-left),
// ghost-name puzzle (top-center), countdown/result banner (center),
// brake warnings (bottom-center) and control hints (bottom-center).

export const HUD_UPDATE_HZ = 10
export const HUD_UPDATE_INTERVAL = 1 / HUD_UPDATE_HZ
export const MPS_TO_KMH = 3.6
export const SPEED_SMOOTHING = 8
export const CHECKPOINT_FRACTIONS = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
export const TOAST_DURATION = 1.8

export function speedKmh(speedMps) {
  if (!Number.isFinite(speedMps)) return 0
  return Math.abs(speedMps) * MPS_TO_KMH
}

export function formatRaceTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const centis = Math.floor((seconds * 100) % 100)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

export function racePosition(playerProgress, ghostProgress) {
  return playerProgress >= ghostProgress ? 1 : 2
}

export function raceProgress(playerProgress, finishDistance) {
  if (!(finishDistance > 0)) return 0
  return Math.min(1, Math.max(0, playerProgress / finishDistance))
}

export function checkpointDistances(finishDistance) {
  return CHECKPOINT_FRACTIONS.map((fraction) => fraction * finishDistance)
}

export function formatCheckpointDelta(playerTime, ghostTime) {
  if (playerTime == null || ghostTime == null) return null
  const delta = playerTime - ghostTime
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(1)}s`
}

const HUD_CSS = `
.highway-hud { position: fixed; inset: 0; z-index: 15; pointer-events: none; user-select: none;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.highway-hud .hw-panel { position: absolute; color: #e8ded0; background: rgba(6, 7, 9, 0.62);
  border: 1px solid rgba(122, 28, 28, 0.55); border-radius: 3px; padding: 6px 12px 7px; }
.highway-hud .hw-label { font-size: 9px; font-weight: 700; letter-spacing: 0.22em; color: #b08a84; }
.highway-hud .hw-value { font-size: 26px; font-weight: 700; line-height: 1.15; color: #f2e9d8;
  text-shadow: 0 0 10px rgba(160, 30, 30, 0.65), 0 2px 4px #000; }
.highway-hud .hw-unit { font-size: 11px; color: #b08a84; margin-left: 5px; }
.highway-hud .hw-timer { top: 150px; left: 20px; border-left: 2px solid rgba(156, 44, 39, 0.9); }
.highway-hud .hw-position { top: 20px; right: 20px; text-align: right; border-right: 2px solid rgba(156, 44, 39, 0.9); }
.highway-hud .hw-position .hw-value { color: #ffd9d2; }
.highway-hud .hw-speed { bottom: 20px; right: 20px; text-align: right; border-right: 2px solid rgba(156, 44, 39, 0.9); }
.highway-hud .hw-speed .hw-value { font-size: 40px; }
.highway-hud .hw-progress { top: 86px; left: 50%; transform: translateX(-50%);
  width: min(440px, 52vw); padding: 6px 12px 8px; text-align: center; }
.highway-hud .hw-bar { height: 4px; margin-top: 5px; background: rgba(232, 222, 208, 0.14);
  border-radius: 2px; overflow: hidden; }
.highway-hud .hw-fill { height: 100%; width: 100%; border-radius: 2px;
  background: linear-gradient(90deg, #7a1c1c, #c8352a); transform-origin: left center; transform: scaleX(0); }
.highway-hud .hw-pct { font-size: 10px; color: #b08a84; letter-spacing: 0.14em; margin-top: 3px; }
.highway-hud .hw-toast { top: 148px; left: 50%; transform: translateX(-50%); white-space: nowrap;
  font-size: 15px; font-weight: 700; letter-spacing: 0.12em; color: #f2e9d8;
  background: rgba(6, 7, 9, 0.72); border: 1px solid rgba(122, 28, 28, 0.65); border-radius: 3px;
  padding: 7px 18px; opacity: 0; transition: opacity 0.25s ease-out; text-shadow: 0 2px 6px #000; }
.highway-hud .hw-toast .hw-delta-bad { color: #ff6a5a; }
.highway-hud .hw-toast .hw-delta-good { color: #7de89a; }
@media (max-width: 700px) {
  .highway-hud .hw-timer { top: auto; bottom: 64px; left: 12px; padding: 4px 9px 5px; }
  .highway-hud .hw-timer .hw-value { font-size: 19px; }
  .highway-hud .hw-position { top: 12px; right: 12px; padding: 4px 9px 5px; }
  .highway-hud .hw-position .hw-value { font-size: 19px; }
  .highway-hud .hw-speed { bottom: 64px; right: 12px; padding: 4px 9px 5px; }
  .highway-hud .hw-speed .hw-value { font-size: 27px; }
  .highway-hud .hw-progress { top: 76px; width: min(300px, 62vw); }
  .highway-hud .hw-toast { top: 128px; font-size: 12px; max-width: 92vw; white-space: normal; text-align: center; }
}
`

function createWidget(documentRoot, parent, className, labelText) {
  const panel = documentRoot.createElement('div')
  panel.className = className
  const label = documentRoot.createElement('div')
  label.className = 'hw-label'
  label.textContent = labelText
  const value = documentRoot.createElement('div')
  value.className = 'hw-value'
  panel.appendChild(label)
  panel.appendChild(value)
  parent.appendChild(panel)
  return { panel, value }
}

export class HighwayHUD {
  constructor({ controller, race, track } = {}) {
    this.controller = controller ?? null
    this.race = race ?? null
    this.track = track ?? race?.track ?? null
    this.finishDistance = race?.finishDistance ??
      (this.track ? this.track.totalLength - FINISH_DISTANCE_BUFFER : 0)
    this.checkpoints = checkpointDistances(this.finishDistance)
    this.playerCheckpointTimes = this.checkpoints.map(() => null)
    this.ghostCheckpointTimes = this.checkpoints.map(() => null)

    this.elapsed = 0
    this.displayedSpeed = 0
    this.accumulator = HUD_UPDATE_INTERVAL
    this.toastRemaining = 0
    this.cache = { timer: '', speed: '', position: '', progress: '' }
    this.disposed = false

    const doc = typeof document !== 'undefined' ? document : null
    this.documentRoot = doc
    if (!doc) {
      this.root = null
      return
    }
    this.styleElement = doc.createElement('style')
    this.styleElement.textContent = HUD_CSS
    if (doc.head) doc.head.appendChild(this.styleElement)
    else doc.body.appendChild(this.styleElement)

    const root = doc.createElement('div')
    root.className = 'highway-hud'
    doc.body.appendChild(root)
    this.root = root

    const timer = createWidget(doc, root, 'hw-panel hw-timer', 'TIME')
    timer.value.textContent = formatRaceTime(0)
    this.timerValue = timer.value

    const position = createWidget(doc, root, 'hw-panel hw-position', 'POS')
    position.value.textContent = '1/2'
    this.positionValue = position.value

    const progress = doc.createElement('div')
    progress.className = 'hw-panel hw-progress'
    const bar = doc.createElement('div')
    bar.className = 'hw-bar'
    const fill = doc.createElement('div')
    fill.className = 'hw-fill'
    bar.appendChild(fill)
    const pct = doc.createElement('div')
    pct.className = 'hw-pct'
    pct.textContent = '0%'
    progress.appendChild(bar)
    progress.appendChild(pct)
    root.appendChild(progress)
    this.progressFill = fill
    this.progressPct = pct

    const speed = createWidget(doc, root, 'hw-panel hw-speed', 'SPEED')
    speed.value.textContent = '0'
    const unit = doc.createElement('span')
    unit.className = 'hw-unit'
    unit.textContent = 'km/h'
    speed.value.appendChild(unit)
    this.speedValue = speed.value
    this.speedUnit = unit

    const toast = doc.createElement('div')
    toast.className = 'hw-toast'
    root.appendChild(toast)
    this.toast = toast
  }

  showToast(html, duration = TOAST_DURATION) {
    if (!this.toast) return
    this.toast.innerHTML = html
    this.toast.style.opacity = '1'
    this.toastRemaining = duration
  }

  checkCheckpoints(playerS, ghostS) {
    if (this.race?.raceFinished) return
    for (let i = 0; i < this.checkpoints.length; i++) {
      if (this.ghostCheckpointTimes[i] == null && ghostS >= this.checkpoints[i]) {
        this.ghostCheckpointTimes[i] = this.elapsed
      }
      if (this.playerCheckpointTimes[i] == null && playerS >= this.checkpoints[i]) {
        this.playerCheckpointTimes[i] = this.elapsed
        const delta = formatCheckpointDelta(
          this.playerCheckpointTimes[i], this.ghostCheckpointTimes[i]
        )
        const label = `CHECKPOINT ${i + 1}/5 &nbsp;·&nbsp; ${formatRaceTime(this.elapsed)}`
        if (delta == null) {
          this.showToast(`${label} &nbsp;·&nbsp; <span class="hw-delta-good">AHEAD</span>`)
        } else if (this.playerCheckpointTimes[i] <= (this.ghostCheckpointTimes[i] ?? Infinity)) {
          this.showToast(`${label} &nbsp;·&nbsp; <span class="hw-delta-good">${delta}</span>`)
        } else {
          this.showToast(`${label} &nbsp;·&nbsp; <span class="hw-delta-bad">${delta}</span>`)
        }
      }
    }
  }

  refresh() {
    if (!this.root || !this.controller || !this.race) return
    const playerS = this.controller.pathProgress ?? 0
    const ghostS = this.race.ghostPathProgress ?? 0

    const timerText = formatRaceTime(this.elapsed)
    if (timerText !== this.cache.timer) {
      this.cache.timer = timerText
      this.timerValue.textContent = timerText
    }

    const positionText = `${racePosition(playerS, ghostS)}/2`
    if (positionText !== this.cache.position) {
      this.cache.position = positionText
      this.positionValue.textContent = positionText
    }

    const progress = raceProgress(playerS, this.finishDistance)
    const pctText = `${Math.floor(progress * 100)}%`
    if (pctText !== this.cache.progress) {
      this.cache.progress = pctText
      this.progressPct.textContent = pctText
      this.progressFill.style.transform = `scaleX(${progress.toFixed(4)})`
    }

    const speedText = String(Math.round(this.displayedSpeed))
    if (speedText !== this.cache.speed) {
      this.cache.speed = speedText
      this.speedValue.textContent = speedText
      this.speedValue.appendChild(this.speedUnit)
    }
  }

  update(dt) {
    if (this.disposed) return
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0
    const race = this.race

    if (this.toastRemaining > 0) {
      this.toastRemaining -= step
      if (this.toastRemaining <= 0 && this.toast) this.toast.style.opacity = '0'
    }

    if (race?.raceFinished) {
      if (this.toast) this.toast.style.opacity = '0'
      this.refresh()
      return
    }

    if (race?.raceStarted) this.elapsed += step

    if (this.controller) {
      const target = speedKmh(this.controller.speed ?? 0)
      const alpha = 1 - Math.exp(-SPEED_SMOOTHING * step)
      this.displayedSpeed += (target - this.displayedSpeed) * alpha
      if (!Number.isFinite(this.displayedSpeed)) this.displayedSpeed = 0
    }

    if (this.controller && race) {
      this.checkCheckpoints(
        this.controller.pathProgress ?? 0,
        race.ghostPathProgress ?? 0
      )
    }

    this.accumulator += step
    if (this.accumulator >= HUD_UPDATE_INTERVAL) {
      this.accumulator = 0
      this.refresh()
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.root) {
      if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
      else if (this.root.remove) this.root.remove()
    }
    if (this.styleElement) {
      if (this.styleElement.parentNode) {
        this.styleElement.parentNode.removeChild(this.styleElement)
      } else if (this.styleElement.remove) this.styleElement.remove()
    }
    this.root = null
    this.controller = null
    this.race = null
    this.track = null
  }
}
