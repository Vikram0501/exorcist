import test from 'node:test'
import assert from 'node:assert/strict'
import { HauntedHouseAudio, prepareScareBuffer } from '../../src/levels/house/audio.js'
import { HOUSE_JUMP_SCARE_DURATION } from '../../src/levels/house/story-data.js'

test('a quiet scare recording is normalized and skips silence before the hit', () => {
  const channel = new Float32Array(1000)
  channel[500] = 0.1
  channel[510] = -0.2
  const buffer = { numberOfChannels: 1, sampleRate: 1000, length: 1000, getChannelData: () => channel }
  const result = prepareScareBuffer(buffer)
  assert.equal(result.offset, 0.495)
  assert.ok(Math.abs(channel[510] + 0.98) < 0.00001)
  assert.equal(channel[0], 0)
})

test('a silent recording reports a failure instead of pretending to play a scare', () => {
  const buffer = { numberOfChannels: 1, sampleRate: 1000, length: 1000, getChannelData: () => new Float32Array(1000) }
  assert.throws(() => prepareScareBuffer(buffer), /no audible samples/)
})

test('scares choose among all four new screams without an immediate repeat', t => {
  const originalAudio = globalThis.Audio
  const originalWindow = globalThis.window
  const played = []
  let musicHoldMs = 0
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.duration = 1 }
    pause() {}
    play() { played.push(this.url); return Promise.resolve() }
  }
  globalThis.window = { clearTimeout() {}, setTimeout(_callback, ms) { musicHoldMs = ms; return 1 } }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  })
  let draw = 0
  t.mock.method(Math, 'random', () => draw)
  const audio = new HauntedHouseAudio()
  audio.enabled = true
  // Each scare also draws its ambient-audio delay; keep selection deterministic.
  for (const value of [0, 0, 0.5, 0.99]) {
    draw = value
    assert.equal(audio.playJumpScare(), true)
  }
  assert.deepEqual(played, [
    '/levels/house/audio/screams/scream-01.ogg',
    '/levels/house/audio/screams/scream-02.ogg',
    '/levels/house/audio/screams/scream-03.ogg',
    '/levels/house/audio/screams/scream-04.ogg',
  ])
  assert.equal(audio.music.volume, 0)
  assert.equal(musicHoldMs, HOUSE_JUMP_SCARE_DURATION * 1000)
})

test('the completed rite stops all house sounds and keeps the yard silent', async t => {
  const originalAudio = globalThis.Audio
  const originalWindow = globalThis.window
  const played = []
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.paused = true; this.currentTime = 0 }
    pause() { this.paused = true }
    play() { this.paused = false; played.push(this.url); return Promise.resolve() }
    addEventListener() {}
  }
  globalThis.window = { clearTimeout() {} }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  })
  const audio = new HauntedHouseAudio()
  await audio.setHouseActive(true)
  audio.playEffect('/test.ogg', 1)
  audio.setQuiet()
  assert.equal(audio.music.paused, true)
  assert.equal(audio.phone.paused, true)
  const count = played.length
  audio.playDoor(true)
  audio.playMelody()
  audio.update({ velocity: { x: 3, z: 0 }, isGrounded: true, flying: false, position: {} })
  audio.setPaused(true)
  audio.setPaused(false)
  assert.equal(played.length, count)
})
