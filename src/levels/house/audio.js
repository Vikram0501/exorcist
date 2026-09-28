import * as THREE from 'three'

const SOUND = {
  music: '/levels/house/audio/ambience.ogg',
  houseStep: '/levels/house/audio/footsteps-house.ogg',
  pathStep: '/levels/house/audio/footsteps-path.ogg',
  doorOpen: '/levels/house/audio/door-open.ogg',
  doorClose: '/levels/house/audio/door-close.ogg',
  ghostFootsteps: '/levels/house/audio/ghost-footsteps.ogg',
  ghostBreath: '/levels/house/audio/ghost-breath.ogg',
  ghostOne: '/levels/house/audio/ghost-voice-01.ogg',
  ghostTwo: '/levels/house/audio/ghost-voice-02.ogg',
  phoneRing: '/levels/house/audio/phone-ring.ogg',
}

const JUMP_SCARE_SOUNDS = [
  '/levels/house/audio/screams/scream-01.ogg',
  '/levels/house/audio/screams/scream-02.ogg',
  '/levels/house/audio/screams/scream-03.ogg',
  '/levels/house/audio/screams/scream-04.ogg',
]

const MUSIC_VOLUME = 0.3
const DUCKED_MUSIC_VOLUME = 0.1

export function prepareScareBuffer(buffer) {
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample))
  }
  if (peak < 0.00001) throw new Error('The jump-scare recording contains no audible samples')
  let onset = buffer.length
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) >= peak * 0.04) onset = Math.min(onset, i)
      samples[i] *= 0.98 / peak
    }
  }
  return { buffer, offset: Math.max(0, onset / buffer.sampleRate - 0.005) }
}

// Uses the supplied recordings directly. Audio elements are efficient for these
// short OGG files and keep music playback separate from one-shot effects.
export class HauntedHouseAudio {
  constructor() {
    this.enabled = false
    this.music = this.createAudio(SOUND.music, true)
    this.music.volume = MUSIC_VOLUME
    this.nextFootstepAt = 0
    this.nextGhostAt = 0
    this.interiorZones = []
    this.restoreTimer = null
    this.effects = new Set()
    this.tones = new Set()
    this.context = null
    this.calm = false
    this.paused = false
    this.scareUntil = 0
    this.phone = this.createAudio(SOUND.phoneRing)
    this.phone.volume = 0.75
    this.jumpScares = JUMP_SCARE_SOUNDS.map(url => {
      const fallback = this.createAudio(url)
      fallback.volume = 1
      return { url, fallback, decoded: null }
    })
    this.lastJumpScare = null
    this.jumpScareSource = null
    this.jumpScareLoading = null
  }

  async unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (AudioContext && !this.context) this.context = new AudioContext()
    await this.context?.resume().catch(() => {})
    this.preloadJumpScare()
  }

  preloadJumpScare() {
    if (!this.context || this.jumpScareLoading) return this.jumpScareLoading
    this.jumpScareLoading = Promise.all(this.jumpScares.map(async scream => {
      try {
        const response = await fetch(scream.url)
        if (!response.ok) throw new Error(`Jump-scare audio returned ${response.status}`)
        const buffer = await this.context.decodeAudioData(await response.arrayBuffer())
        scream.decoded = prepareScareBuffer(buffer)
      } catch (error) {
        console.warn(`Could not decode ${scream.url}; using its preloaded recording.`, error)
      }
    }))
    return this.jumpScareLoading
  }

  async setHouseActive(active, model = null) {
    this.enabled = active
    this.calm = false
    this.paused = false
    this.scareUntil = 0
    this.nextFootstepAt = 0

    if (!active) {
      this.jumpScareSource?.stop()
      this.jumpScareSource = null
      for (const scream of this.jumpScares) scream.fallback.pause()
      this.stopPhoneRing()
      for (const sound of this.effects) sound.pause()
      this.effects.clear()
      for (const tone of this.tones) { try { tone.stop() } catch {} }
      this.tones.clear()
      this.music.pause()
      this.music.currentTime = 0
      this.restoreMusic()
      return
    }

    this.findInteriorZones(model)
    this.nextGhostAt = performance.now() / 1000 + randomBetween(7, 13)
    this.music.volume = MUSIC_VOLUME
    this.music.play().catch(() => {})
  }

  update(player) {
    if (!this.enabled || this.paused) return
    const now = performance.now() / 1000
    if (now < this.scareUntil) return
    const speed = Math.hypot(player.velocity.x, player.velocity.z)

    if (player.isGrounded && !player.flying && speed > 0.7) {
      const sprinting = speed > 6.4
      if (now >= this.nextFootstepAt) {
        this.playEffect(
          this.isInside(player.position)
            ? SOUND.houseStep
            : SOUND.pathStep,
          sprinting ? 0.72 : 0.58,
        )
        this.nextFootstepAt = now + (sprinting ? 0.39 : 0.58)
      }
    } else {
      this.nextFootstepAt = Math.min(this.nextFootstepAt, now + 0.08)
    }

    if (!this.calm && now >= this.nextGhostAt) {
      this.playRandomGhostSound()
      this.nextGhostAt = now + randomBetween(10, 22)
    }
  }

  playDoor(isOpen) {
    if (!this.enabled) return
    this.playEffect(isOpen ? SOUND.doorOpen : SOUND.doorClose, 0.72)
  }

  playRandomGhostSound() {
    if (!this.enabled || this.paused || this.calm || performance.now() / 1000 < this.scareUntil) return
    const sounds = [
      SOUND.ghostFootsteps,
      SOUND.ghostBreath,
      SOUND.ghostOne,
      SOUND.ghostTwo,
    ]
    this.duckMusic(3.5)
    this.playEffect(sounds[Math.floor(Math.random() * sounds.length)], 0.82)
  }

  playEffect(source, volume) {
    if (!this.enabled || this.paused) return
    if (performance.now() / 1000 < this.scareUntil) return
    const sound = this.createAudio(source)
    sound.volume = volume
    this.effects.add(sound)
    sound.addEventListener('ended', () => this.effects.delete(sound), { once: true })
    sound.play().catch(() => this.effects.delete(sound))
  }

  playCue(name) {
    if (SOUND[name]) this.playEffect(SOUND[name], 0.6)
  }

  playJumpScare() {
    if (!this.enabled) return false
    this.jumpScareSource?.stop()
    this.lastJumpScare?.fallback.pause()
    const choices = this.jumpScares.filter(scream => scream !== this.lastJumpScare)
    const scream = choices[Math.floor(Math.random() * choices.length)]
    this.lastJumpScare = scream
    const decoded = scream.decoded
    const fallbackDuration = Number.isFinite(scream.fallback.duration) ? scream.fallback.duration : 3
    const duration = decoded ? decoded.buffer.duration - decoded.offset : fallbackDuration
    this.scareUntil = performance.now() / 1000 + Math.max(1.2, duration)
    this.stopPhoneRing()
    for (const sound of this.effects) sound.pause()
    this.effects.clear()
    for (const tone of this.tones) { try { tone.stop() } catch {} }
    this.tones.clear()
    window.clearTimeout(this.restoreTimer)
    this.music.volume = 0
    this.restoreTimer = window.setTimeout(() => this.restoreMusic(), Math.max(1.2, duration) * 1000)
    this.nextGhostAt = this.scareUntil + randomBetween(7, 13)
    if (decoded && this.context?.state === 'running') {
      const source = this.context.createBufferSource()
      const gain = this.context.createGain()
      const limiter = this.context.createDynamicsCompressor()
      source.buffer = decoded.buffer
      gain.gain.value = 2
      limiter.threshold.value = -4
      limiter.knee.value = 6
      limiter.ratio.value = 12
      limiter.attack.value = 0.001
      limiter.release.value = 0.08
      source.connect(gain).connect(limiter).connect(this.context.destination)
      source.onended = () => {
        source.disconnect()
        gain.disconnect()
        limiter.disconnect()
        if (this.jumpScareSource === source) this.jumpScareSource = null
      }
      this.jumpScareSource = source
      source.start(0, decoded.offset)
    } else {
      scream.fallback.currentTime = 0
      scream.fallback.play().catch(error => console.error(`Jump-scare playback failed (${scream.url}):`, error))
      this.context?.resume().catch(error => console.warn('Audio could not resume:', error))
    }
    return true
  }

  setCalm(calm) {
    this.calm = calm
    this.music.volume = calm ? 0.07 : MUSIC_VOLUME
  }

  setPaused(paused) {
    if (paused === this.paused) return
    this.paused = paused
    if (paused) {
      this.stopPhoneRing()
      this.music.pause()
      for (const sound of this.effects) sound.pause()
      this.effects.clear()
      for (const tone of this.tones) { try { tone.stop() } catch {} }
      this.tones.clear()
    } else if (this.enabled) {
      this.music.play().catch(() => {})
      this.nextGhostAt = performance.now() / 1000 + randomBetween(10, 22)
    }
  }

  playTone(frequency, delay, duration, volume = 0.035, type = 'sine') {
    if (!this.enabled || this.paused || !this.context || this.context.state !== 'running') return
    if (performance.now() / 1000 < this.scareUntil) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const start = this.context.currentTime + delay
    oscillator.type = type
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(this.context.destination)
    this.tones.add(oscillator)
    oscillator.onended = () => { this.tones.delete(oscillator); oscillator.disconnect(); gain.disconnect() }
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  playPhoneRing() {
    if (!this.enabled || this.paused || !this.phone.paused) return
    if (performance.now() / 1000 < this.scareUntil) return
    this.phone.currentTime = 0
    this.phone.play().catch(() => {})
  }

  stopPhoneRing() {
    this.phone.pause()
    this.phone.currentTime = 0
  }

  playMelody() {
    for (const [index, frequency] of [659, 784, 880, 784, 659, 587, 523].entries()) {
      this.playTone(frequency, index * 0.48, 1.1, 0.045)
      this.playTone(frequency * 2, index * 0.48, 0.35, 0.012)
    }
  }

  duckMusic(seconds) {
    if (!this.enabled || performance.now() / 1000 < this.scareUntil) return
    this.music.volume = DUCKED_MUSIC_VOLUME
    window.clearTimeout(this.restoreTimer)
    this.restoreTimer = window.setTimeout(
      () => this.restoreMusic(),
      seconds * 1000,
    )
  }

  restoreMusic() {
    window.clearTimeout(this.restoreTimer)
    this.restoreTimer = null
    this.music.volume = this.calm ? 0.07 : MUSIC_VOLUME
  }

  findInteriorZones(model) {
    this.interiorZones = []
    if (!model) return

    model.updateWorldMatrix(true, true)
    model.traverse((object) => {
      if (!object.isMesh) return
      const name = (object.name || '').toLowerCase()
      const isIndoorFloor =
        (name.includes('floor') || name.includes('flooring')) &&
        !name.includes('yard') &&
        !name.includes('garden') &&
        !name.includes('path') &&
        !name.includes('road') &&
        !name.includes('barn')

      if (isIndoorFloor) {
        this.interiorZones.push(new THREE.Box3().setFromObject(object))
      }
    })
  }

  isInside(position) {
    return this.interiorZones.some((zone) =>
      position.x >= zone.min.x - 0.65 &&
      position.x <= zone.max.x + 0.65 &&
      position.z >= zone.min.z - 0.65 &&
      position.z <= zone.max.z + 0.65,
    )
  }

  createAudio(source, loop = false) {
    const audio = new Audio(source)
    audio.loop = loop
    audio.preload = 'auto'
    return audio
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}
