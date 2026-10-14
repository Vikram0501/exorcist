// Level 3 (highway) audio: background music, player car sound,
// and the one-shot race countdown voice.
//
// Reuses the same HTMLAudio-element pattern as HauntedHouseAudio:
// single persistent elements, started once per activation and
// stopped on unload so overlapping copies can never play.
import { audioGain } from '../../core/settings.js'

export const LEVEL3_MUSIC_URL =
  '/levels/house/audio/level3_ambient_sound.mp3'

export const LEVEL3_MUSIC_VOLUME = 0.25

export const CAR_SOUND_URL =
  '/levels/house/audio/car_sound.mp3'

export const CAR_SOUND_VOLUME = 0.35

export const COUNTDOWN_URL =
  '/levels/house/audio/countdown.mp3'

export const COUNTDOWN_VOLUME = 0.9

export const COUNTDOWN_DUCKED_MUSIC_VOLUME = 0.12

export class HighwayAudio {
  constructor() {
    this.enabled = false
    this.music = null
    this.carSound = null
    this.carDriving = false
    this.countdown = null
    this.context = null
  }

  ensureMusic() {
    if (this.music) return this.music

    this.music = this.createAudio(
      LEVEL3_MUSIC_URL,
      true,
    )
    this.music.volume = audioGain('music', LEVEL3_MUSIC_VOLUME)

    return this.music
  }

  ensureCarSound() {
    if (this.carSound) return this.carSound

    this.carSound = this.createAudio(
      CAR_SOUND_URL,
      true,
    )
    this.carSound.volume = audioGain('sfx', CAR_SOUND_VOLUME)

    return this.carSound
  }

  ensureCountdown() {
    if (this.countdown) return this.countdown

    this.countdown = this.createAudio(
      COUNTDOWN_URL,
      false,
    )
    this.countdown.volume = audioGain('sfx', COUNTDOWN_VOLUME)
    this.countdown.addEventListener?.('ended', () => {
      this.restoreMusicAfterCountdown()
    })

    return this.countdown
  }

  // Called from the game's user-gesture flow (Game.start) so the
  // browser allows playback. Pre-creates the elements; no sound yet.
  async unlock() {
    this.ensureMusic()
    this.ensureCarSound()
    this.ensureCountdown()

    const AudioContext =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          window.webkitAudioContext
        : null

    if (AudioContext && !this.context) {
      this.context = new AudioContext()
    }

    await this.context?.resume().catch(() => {})
  }

  // Resolves once the music, car and countdown elements can actually
  // play (or have failed / timed out). Used as one weighted step of the
  // Level 3 load tracker so 100% also means audio is ready. Never
  // rejects: an unplayable element must not fail the level, and every
  // play() call site already tolerates rejection.
  waitForReady(timeoutMs = 6000) {
    this.cancelReady?.()
    const elements = [this.music, this.carSound, this.countdown].filter(
      (el) => el && typeof el.addEventListener === 'function'
    )

    if (elements.length === 0) {
      return Promise.resolve(false)
    }

    return new Promise((resolve) => {
      let settled = false
      let pending = elements.length
      const cleanups = []

      const finish = (ready) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        for (const cleanup of cleanups) cleanup()
        this.cancelReady = null
        resolve(ready)
      }

      const onOneDone = () => {
        pending -= 1
        if (pending <= 0) finish(true)
      }

      const timer = setTimeout(() => finish(false), timeoutMs)
      this.cancelReady = () => finish(false)

      for (const el of elements) {
        // HAVE_ENOUGH_DATA: already buffered, no wait needed.
        if (el.readyState >= 4) {
          onOneDone()
          continue
        }

        let done = false
        const complete = () => {
          if (done) return
          done = true
          onOneDone()
        }
        cleanups.push(() => {
          el.removeEventListener?.('canplaythrough', complete)
          el.removeEventListener?.('error', complete)
        })
        el.addEventListener('canplaythrough', complete, { once: true })
        el.addEventListener('error', complete, { once: true })
      }
    })
  }

  // Start music for Level 3. Safe to call repeatedly: if music is
  // already playing this is a no-op, so re-initializing the level
  // can never stack overlapping copies.
  setHighwayActive(active) {
    if (!active) {
      this.cancelReady?.()
      this.enabled = false
      this.carDriving = false

      if (this.music) {
        this.music.pause()
        this.music.currentTime = 0
      }

      if (this.carSound) {
        this.carSound.pause()
        this.carSound.currentTime = 0
      }

      this.stopCountdown()

      return
    }

    if (
      this.enabled &&
      this.music &&
      !this.music.paused
    ) {
      return
    }

    this.enabled = true
    this.carDriving = false
    this.ensureMusic()
    this.music.volume = audioGain('music', LEVEL3_MUSIC_VOLUME)

    if (this.music.paused) {
      this.music.play().catch(() => {})
    }
  }

  // Player-only driving sound. Call every frame with the player's
  // actual forward-driving state; idempotent so holding W never
  // restarts the loop and only one instance can ever play.
  setPlayerDriving(driving) {
    driving = Boolean(driving) && this.enabled

    if (driving === this.carDriving) {
      if (
        driving &&
        this.carSound &&
        this.carSound.paused
      ) {
        this.carSound.play().catch(() => {})
      }

      return
    }

    this.carDriving = driving
    this.ensureCarSound()
    this.carSound.volume = audioGain('sfx', CAR_SOUND_VOLUME)

    if (driving) {
      if (this.carSound.paused) {
        this.carSound.play().catch(() => {})
      }
    } else {
      this.carSound.pause()
    }
  }

  // Race countdown voice ("3, 2, 1, GO" in one recording).
  // Plays once per countdown: a second call while it is still
  // playing is a no-op, so update loops can never restart it.
  playCountdown() {
    if (!this.enabled) return

    this.ensureCountdown()

    if (!this.countdown.paused) return

    this.countdown.loop = false
    this.countdown.volume = audioGain('sfx', COUNTDOWN_VOLUME)
    this.countdown.currentTime = 0

    if (this.music) {
      this.music.volume = audioGain('music', COUNTDOWN_DUCKED_MUSIC_VOLUME)
    }

    this.countdown.play().catch(() => {})
  }

  stopCountdown() {
    if (this.countdown) {
      this.countdown.pause()
      this.countdown.currentTime = 0
    }
  }

  // Restore full music volume once the countdown visuals finish
  // (also restored automatically when the voice recording ends).
  restoreMusicAfterCountdown() {
    if (this.enabled && this.music) {
      this.music.volume = audioGain('music', LEVEL3_MUSIC_VOLUME)
    }
  }

  // Re-apply the current mix after the player moves a volume slider. The
  // music stays ducked while the countdown voice is still playing.
  applyVolumes() {
    if (this.music) {
      const ducked = this.countdown && !this.countdown.paused
      this.music.volume = audioGain('music', ducked ? COUNTDOWN_DUCKED_MUSIC_VOLUME : LEVEL3_MUSIC_VOLUME)
    }
    if (this.carSound) this.carSound.volume = audioGain('sfx', CAR_SOUND_VOLUME)
    if (this.countdown) this.countdown.volume = audioGain('sfx', COUNTDOWN_VOLUME)
  }

  createAudio(source, loop = false) {
    const audio = new Audio(source)
    audio.loop = loop
    audio.preload = 'auto'
    return audio
  }
}
