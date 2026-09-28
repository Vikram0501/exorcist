import test from 'node:test'
import assert from 'node:assert/strict'
import { HauntedHouseAudio, prepareScareBuffer } from '../../src/levels/house/audio.js'

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
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.duration = 2 }
    pause() {}
    play() { played.push(this.url); return Promise.resolve() }
  }
  globalThis.window = { clearTimeout() {}, setTimeout() { return 1 } }
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
})
