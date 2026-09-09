import * as THREE from 'three'

const SOUND = {
  music: '/background%20music.ogg',
  houseStep: '/Walking%20on%20house.ogg',
  pathStep: '/Walking%20on%20path.ogg',
  doorOpen: '/Door%20open.ogg',
  doorClose: '/Door%20close.ogg',
  ghostFootsteps: '/Ghost%20Footsteps.ogg',
  ghostBreath: '/ghostbreath.ogg',
  ghostOne: '/Moes%20Ghost%201.ogg',
  ghostTwo: '/Moes%20Ghost%202.ogg',
}

const MUSIC_VOLUME = 0.3
const DUCKED_MUSIC_VOLUME = 0.1

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
  }

  async unlock() {
    // Called from the menu click so the browser permits later playback.
    return true
  }

  async setHouseActive(active, model = null) {
    this.enabled = active
    this.nextFootstepAt = 0

    if (!active) {
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
    if (!this.enabled) return
    const now = performance.now() / 1000
    const speed = Math.hypot(player.velocity.x, player.velocity.z)

    if (player.isGrounded && !player.flying && speed > 0.7) {
      const sprinting = speed > 7.5
      if (now >= this.nextFootstepAt) {
        this.playEffect(
          this.isInside(player.position)
            ? SOUND.houseStep
            : SOUND.pathStep,
          sprinting ? 0.72 : 0.58,
        )
        this.nextFootstepAt = now + (sprinting ? 0.31 : 0.46)
      }
    } else {
      this.nextFootstepAt = Math.min(this.nextFootstepAt, now + 0.08)
    }

    if (now >= this.nextGhostAt) {
      this.playRandomGhostSound()
      this.nextGhostAt = now + randomBetween(10, 22)
    }
  }

  playDoor(isOpen) {
    if (!this.enabled) return
    this.playEffect(isOpen ? SOUND.doorOpen : SOUND.doorClose, 0.72)
  }

  playRandomGhostSound() {
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
    const sound = this.createAudio(source)
    sound.volume = volume
    sound.play().catch(() => {})
  }

  duckMusic(seconds) {
    if (!this.enabled) return
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
    this.music.volume = MUSIC_VOLUME
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
