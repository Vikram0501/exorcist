import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TrainEnding,
  APPARITION_SECONDS,
  FADE_SECONDS,
  APPARITION_OFFSET,
} from '../../src/levels/train/ending.js'

function harness(overrides = {}) {
  const calls = []
  const zombie = {
    maxZ: 8,
    minZ: -60,
    appearAt: z => calls.push(['appearAt', z]),
  }
  const audio = { playScream: kind => calls.push(['scream', kind]) }
  const exorcism = { position: { x: 2.9, y: 0.38, z: -4.6 } }
  let exits = 0
  const ending = new TrainEnding({
    zombie,
    exorcism,
    audio,
    onExit: () => { exits += 1 },
    ...overrides,
  })
  return { ending, calls, zombie, audio, exorcism, exitCount: () => exits }
}

test('the closing beat calls the spirit up, screams its name, then burns out to white', () => {
  const { ending, calls, exitCount } = harness()

  assert.equal(ending.start(), true)
  assert.deepEqual(calls, [
    ['appearAt', -4.6 + APPARITION_OFFSET],
    ['scream', 'name'],
  ], 'the spirit stands past the ash ring and screams as it is named')
  assert.equal(ending.active, true)
  assert.equal(ending.finished, false)
  assert.equal(ending.start(), false, 'it will not start twice')

  assert.equal(ending.update(APPARITION_SECONDS - 0.01), false)
  assert.equal(ending.fading, false, 'it gets a beat in the aisle before the whiteout')

  ending.update(0.02)
  assert.equal(ending.fading, true, 'then the world starts fading to white')

  assert.equal(ending.update(FADE_SECONDS - 0.02), false, 'still fading')
  assert.equal(ending.finished, false)

  assert.equal(ending.update(0.02), true, 'the finished white screen hands off to the prompt')
  assert.equal(ending.finished, true)
  assert.equal(ending.active, false)
  assert.equal(exitCount(), 0, 'the exit prompt waits for the player to click it')
})

test('the spirit is called up relative to the seal, or to the far end without one', () => {
  const { ending, calls, exorcism } = harness()
  ending.start()
  assert.equal(calls[0][1], exorcism.position.z + APPARITION_OFFSET)

  const { ending: orphan, calls: orphanCalls, zombie } = harness({ exorcism: null })
  orphan.start()
  assert.deepEqual(orphanCalls, [['appearAt', zombie.maxZ - 6], ['scream', 'name']])
})

test('nothing runs without a stalker, and dispose clears the white screen', () => {
  const { ending, calls } = harness({ zombie: null })
  assert.equal(ending.start(), false, 'no stalker, no closing beat')
  assert.deepEqual(calls, [])
  assert.equal(ending.update(1), false)

  const { ending: finished } = harness()
  finished.start()
  finished.update(APPARITION_SECONDS + FADE_SECONDS + 0.01)
  assert.equal(finished.finished, true)
  assert.equal(finished.start(), false, 'a finished ending cannot be replayed')
  finished.dispose()
  assert.equal(finished.fade, null)
  assert.equal(finished.active, false)
})
