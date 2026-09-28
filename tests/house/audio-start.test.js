import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../../src/core/game.js'

function setup(t) {
  const previous = globalThis.requestAnimationFrame
  const frames = []
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length }
  t.after(() => {
    if (previous === undefined) delete globalThis.requestAnimationFrame
    else globalThis.requestAnimationFrame = previous
  })
  const activations = []
  const game = Object.assign(Object.create(Game.prototype), {
    loaded: false, currentLevel: 'house', levelLoadId: 1,
    houseAudioStartFrame: null, input: { isLocked: true }, model: {},
    houseAudio: {
      enabled: false,
      setHouseActive(active, model) { this.enabled = active; activations.push(model) },
    },
  })
  return { game, frames, activations }
}

test('music waits for a loaded level and the frame after its first render', t => {
  const { game, frames, activations } = setup(t)
  game.startHouseAudioAfterRender()
  assert.equal(frames.length, 0)
  game.loaded = true
  game.startHouseAudioAfterRender()
  game.startHouseAudioAfterRender()
  assert.equal(frames.length, 1)
  assert.equal(activations.length, 0)
  frames.shift()()
  assert.deepEqual(activations, [game.model])
  game.startHouseAudioAfterRender()
  assert.equal(frames.length, 0)
})

test('returning to the menu before presentation leaves the music silent', t => {
  const { game, frames, activations } = setup(t)
  game.loaded = true
  game.startHouseAudioAfterRender()
  game.input.isLocked = false
  frames.shift()()
  game.startHouseAudioAfterRender()
  assert.equal(activations.length, 0)
  assert.equal(frames.length, 0)
  game.input.isLocked = true
  game.startHouseAudioAfterRender()
  frames.shift()()
  assert.equal(activations.length, 1)
})

test('a stale frame callback cannot start music for a replaced level', t => {
  const { game, frames, activations } = setup(t)
  game.loaded = true
  game.startHouseAudioAfterRender()
  game.levelLoadId++
  frames.shift()()
  assert.equal(activations.length, 0)
})
