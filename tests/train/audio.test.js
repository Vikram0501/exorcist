import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TrainAudio,
  moanVolume,
  TRAIN_AMBIENT_VOLUME,
  ZOMBIE_MOAN_VOLUME,
  SCREAM_VOLUME,
  CHASE_SCREAM_VOLUME,
  screamVolume,
  SCREAM_COOLDOWN,
  CHASE_SCREAM_URL,
  NAME_SCREAM_URL,
} from '../../src/levels/train/audio.js'

function mockAudio(t) {
  const originalAudio = globalThis.Audio
  const created = []
  const plays = []
  globalThis.Audio = class {
    constructor(url) {
      this.url = url
      this.paused = true
      this.currentTime = 0
      this.loop = false
      this.volume = 1
      created.push(this)
    }
    play() { this.paused = false; plays.push(this.url); return Promise.resolve() }
    pause() { this.paused = true }
  }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
  })
  return { created, plays }
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
  const { created } = mockAudio(t)
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

test('the banshee cry fires once when a chase starts, and never twice', t => {
  const { created, plays } = mockAudio(t)
  const audio = new TrainAudio()
  const player = { position: { x: 0, y: 1, z: 0 } }
  const zombie = { position: { x: 8, y: 0, z: 0 }, state: 'patrol' }
  const cries = () => plays.filter(url => url === CHASE_SCREAM_URL)

  audio.setTrainActive(true)
  audio.update(player, zombie, 0.1)
  assert.equal(cries().length, 0, 'no cry while it is only patrolling')

  zombie.state = 'hunt'
  audio.update(player, zombie, 0.1)
  assert.equal(cries().length, 1, 'the cry fires on the rising edge of the hunt')
  const chase = created.find(sound => sound.url === CHASE_SCREAM_URL)
  assert.equal(chase.paused, false)
  assert.equal(chase.volume, CHASE_SCREAM_VOLUME, 'the banshee cry sits under the name scream')
  assert.equal(screamVolume('chase'), SCREAM_VOLUME * 0.8)

  audio.update(player, zombie, 0.1)
  audio.update(player, zombie, 0.1)
  assert.equal(cries().length, 1, 'one cry per chase, not one per frame')

  zombie.state = 'patrol'
  audio.update(player, zombie, 0.1)
  zombie.state = 'hunt'
  zombie.position = { x: 40, y: 0, z: 0 }
  audio.update(player, zombie, 0.1)
  assert.equal(cries().length, 1, 'silent when the chase is out of earshot')

  audio.update(player, { ...zombie, position: { x: 8, y: 0, z: 0 } }, SCREAM_COOLDOWN + 1)
  zombie.state = 'patrol'
  zombie.position = { x: 8, y: 0, z: 0 }
  audio.update(player, zombie, 0.1)
  zombie.state = 'hunt'
  audio.update(player, zombie, 0.1)
  assert.equal(cries().length, 2, 'a later chase gets its own cry once the cooldown lapses')

  audio.setTrainActive(false)
  assert.equal(chase.paused, true)
  assert.equal(audio.playScream('name'), false, 'no screams once the ambience is off')
})

test('the name scream plays on demand for the rite', t => {
  const { created, plays } = mockAudio(t)
  const audio = new TrainAudio()
  audio.setTrainActive(true)

  assert.equal(audio.playScream('name'), true)
  const scream = created.find(sound => sound.url === NAME_SCREAM_URL)
  assert.ok(scream, 'the zombie scream element exists')
  assert.equal(scream.loop, false)
  assert.equal(scream.paused, false)
  assert.equal(scream.volume, SCREAM_VOLUME)
  assert.equal(plays.filter(url => url === NAME_SCREAM_URL).length, 1)

  audio.playScream('name')
  assert.equal(created.filter(sound => sound.url === NAME_SCREAM_URL).length, 1,
    'it reuses the element rather than stacking new ones')
  assert.equal(plays.filter(url => url === NAME_SCREAM_URL).length, 2,
    'but it still replays from the top')
})
