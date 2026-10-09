import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TrainAudio,
  moanVolume,
  TRAIN_AMBIENT_VOLUME,
  ZOMBIE_MOAN_VOLUME,
} from '../../src/levels/train/audio.js'

function mockAudio(t) {
  const originalAudio = globalThis.Audio
  const created = []
  globalThis.Audio = class {
    constructor(url) {
      this.url = url
      this.paused = true
      this.currentTime = 0
      this.loop = false
      this.volume = 1
      created.push(this)
    }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
  })
  return created
}

test('moans fade out across the 5 to 30 distance band', () => {
  assert.equal(moanVolume(4), ZOMBIE_MOAN_VOLUME)
  assert.equal(moanVolume(5), ZOMBIE_MOAN_VOLUME)
  assert.ok(Math.abs(moanVolume(17.5) - ZOMBIE_MOAN_VOLUME * 0.5) < 1e-9)
  assert.ok(moanVolume(29) > 0, 'still faintly audible near the edge')
  assert.ok(moanVolume(29) < ZOMBIE_MOAN_VOLUME * 0.1, 'but barely')
  assert.equal(moanVolume(30), 0)
  assert.equal(moanVolume(40), 0)
  assert.equal(moanVolume(NaN), 0)
})

test('ambience loops quietly and moans only sound while the stalker is close', t => {
  const created = mockAudio(t)
  const audio = new TrainAudio()
  const player = { position: { x: 0, y: 1, z: 0 } }
  const zombieAt = distance => ({ position: { x: distance, y: 0, z: 0 } })

  audio.setTrainActive(true)
  const ambient = created.find(sound => sound.url.endsWith('train-inside.mp3'))
  assert.ok(ambient, 'the carriage ambience element exists')
  assert.equal(ambient.loop, true)
  assert.equal(ambient.paused, false)
  assert.equal(ambient.volume, TRAIN_AMBIENT_VOLUME)

  audio.update(player, zombieAt(40))
  assert.equal(audio.moans, null, 'no moan element is created outside the range')

  audio.update(player, zombieAt(17.5))
  const moans = created.find(sound => sound.url.endsWith('zombie-moans.mp3'))
  assert.ok(moans, 'the moan element exists once the stalker is near')
  assert.equal(moans.loop, true)
  assert.equal(moans.paused, false)
  assert.ok(Math.abs(moans.volume - ZOMBIE_MOAN_VOLUME * 0.5) < 1e-9)

  audio.update(player, zombieAt(3))
  assert.equal(moans.volume, ZOMBIE_MOAN_VOLUME)

  audio.update(player, zombieAt(35))
  assert.equal(moans.paused, true, 'moans stop once the stalker is beyond 30 units')

  audio.setTrainActive(false)
  assert.equal(ambient.paused, true)
  assert.equal(ambient.currentTime, 0)
  assert.equal(moans.paused, true)
})
