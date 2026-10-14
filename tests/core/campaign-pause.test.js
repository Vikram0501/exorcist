import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../../src/core/game.js'

function audio() {
  return {
    paused: false, plays: 0, stops: 0,
    pause() { this.paused = true; this.stops++ },
    play() { this.paused = false; this.plays++; return Promise.resolve() },
  }
}

test('pausing freezes active audio without restarting or duplicating it on resume', () => {
  const game = Object.create(Game.prototype)
  const music = audio()
  const moans = audio()
  const countdown = audio()
  game.paused = false
  game.pausedAudio = []
  game.currentLevel = 'highway'
  game.input = { clear() {} }
  game.clock = { getDelta() { return 0 } }
  game.houseAudio = { setPaused() {} }
  game.trainAudio = { ambient: null, moans, screams: {} }
  game.highwayAudio = { music, carSound: null, countdown }

  game.setPaused(true)
  game.setPaused(true)
  assert.equal(game.paused, true)
  for (const source of [music, moans, countdown]) assert.equal(source.stops, 1)
  game.setPaused(false)
  game.setPaused(false)
  for (const source of [music, moans, countdown]) assert.equal(source.plays, 1)
})
