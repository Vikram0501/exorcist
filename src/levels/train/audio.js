// Level 2 (train) audio: a constant carriage ambience bed plus the
// stalker's moans, which only reach the player while it is close.

export const TRAIN_AMBIENT_URL = '/levels/train/audio/train-inside.mp3'

export const TRAIN_AMBIENT_VOLUME = 0.15

export const ZOMBIE_MOAN_URL = '/levels/train/audio/zombie-moans.mp3'

export const ZOMBIE_MOAN_VOLUME = 0.7

export const MOAN_FULL_RANGE = 5

export const MOAN_SILENT_RANGE = 30

export function moanVolume(distance) {
  if (!Number.isFinite(distance) || distance >= MOAN_SILENT_RANGE) return 0
  if (distance <= MOAN_FULL_RANGE) return ZOMBIE_MOAN_VOLUME
  const fade = (distance - MOAN_FULL_RANGE) / (MOAN_SILENT_RANGE - MOAN_FULL_RANGE)
  return ZOMBIE_MOAN_VOLUME * (1 - fade)
}

export class TrainAudio {
  constructor() {
    this.enabled = false
    this.ambient = null
    this.moans = null
    this.moanPlaying = false
    this.context = null
  }

  ensureAmbient() {
    if (this.ambient) return this.ambient
    this.ambient = this.createAudio(TRAIN_AMBIENT_URL, true)
    this.ambient.volume = TRAIN_AMBIENT_VOLUME
    return this.ambient
  }

  ensureMoans() {
    if (this.moans) return this.moans
    this.moans = this.createAudio(ZOMBIE_MOAN_URL, true)
    this.moans.volume = 0
    return this.moans
  }

  async unlock() {
    const AudioContext =
      typeof window !== 'undefined'
        ? window.AudioContext || window.webkitAudioContext
        : null

    if (AudioContext && !this.context) this.context = new AudioContext()

    await this.context?.resume().catch(() => {})
    this.ensureAmbient()
    this.ensureMoans()
  }

  setTrainActive(active) {
    if (!active) {
      this.enabled = false
      this.stopAudio(this.ambient)
      this.stopAudio(this.moans)
      this.moanPlaying = false
      return
    }

    this.enabled = true

    const ambient = this.ensureAmbient()
    ambient.volume = TRAIN_AMBIENT_VOLUME
    if (ambient.paused) ambient.play().catch(() => {})

    if (this.moans) {
      this.moans.pause()
      this.moans.volume = 0
      this.moanPlaying = false
    }
  }

  update(player, zombie) {
    if (!this.enabled) return

    const zombiePosition = zombie?.position
    if (!player?.position || !zombiePosition) {
      this.setMoanVolume(0)
      return
    }

    const dx = player.position.x - zombiePosition.x
    const dz = player.position.z - zombiePosition.z
    this.setMoanVolume(moanVolume(Math.hypot(dx, dz)))
  }

  setMoanVolume(volume) {
    if (volume <= 0) {
      if (this.moanPlaying) {
        this.moanPlaying = false
        this.moans?.pause()
      }
      return
    }

    const moans = this.ensureMoans()
    moans.volume = volume
    if (!this.moanPlaying) {
      this.moanPlaying = true
      if (moans.paused) {
        moans.play().catch(() => { this.moanPlaying = false })
      }
    }
  }

  stopAudio(audio) {
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
  }

  createAudio(source, loop = false) {
    const audio = new Audio(source)
    audio.loop = loop
    audio.preload = 'auto'
    return audio
  }
}
