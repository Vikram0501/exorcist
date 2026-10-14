import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TrainEnding,
  APPARITION_SECONDS,
  FADE_SECONDS,
  APPARITION_OFFSET,
  ENTRANCE_OFFSET,
  SHAKE_INTENSITY,
} from '../../src/levels/train/ending.js'

function harness(overrides = {}) {
  const calls = []
  const zombie = {
    maxZ: 8,
    minZ: -60,
    appearAt: z => calls.push(['appearAt', z]),
  }
  const audio = { playScream: kind => calls.push(['scream', kind]) }
  const shake = { rattle: (intensity, duration) => calls.push(['rattle', intensity, duration]) }
  const exorcism = {
    position: { x: 2.9, y: 0.38, z: -4.6 },
    carriage: { bounds: { min: { z: -9 }, max: { z: 6 } } },
  }
  let exits = 0
  const ending = new TrainEnding({
    zombie,
    exorcism,
    audio,
    shake,
    onExit: () => { exits += 1 },
    ...overrides,
  })
  return { ending, calls, zombie, audio, shake, exorcism, exitCount: () => exits }
}

test('the closing beat calls the spirit to the carriage door, then screams, shakes, and burns out', () => {
  const { ending, calls, exitCount } = harness()

  assert.equal(ending.start(), true)
  assert.deepEqual(calls, [
    ['appearAt', -9 + ENTRANCE_OFFSET],
  ], 'the spirit stands in the burnt carriage doorway')
  assert.equal(ending.active, true)
  assert.equal(ending.finished, false)
  assert.equal(ending.start(), false, 'it will not start twice')

  assert.equal(ending.update(APPARITION_SECONDS - 0.01), false)
  assert.equal(ending.fading, false, 'it gets a beat in the doorway before the whiteout')

  ending.update(0.02)
  assert.equal(ending.fading, true, 'then the world starts fading to white')
  assert.deepEqual(calls.at(-2), ['scream', 'name'], 'it screams as the white comes up')
  assert.deepEqual(calls.at(-1), ['rattle', SHAKE_INTENSITY, FADE_SECONDS],
    'the camera shakes through the fade')

  assert.equal(ending.update(FADE_SECONDS - 0.02), false, 'still fading')
  assert.equal(ending.finished, false)

  assert.equal(ending.update(0.02), true, 'the finished white screen ends the level')
  assert.equal(ending.finished, true)
  assert.equal(ending.active, false)
  assert.equal(ending.fade, null, 'the white overlay is removed on the way out')
  assert.equal(exitCount(), 1, 'it exits straight to the completion screen')
})

test('the spirit appears at the carriage entrance, or by the seal or far end without one', () => {
  const { ending, calls, exorcism } = harness()
  ending.start()
  assert.equal(calls[0][1], exorcism.carriage.bounds.min.z + ENTRANCE_OFFSET)

  const { ending: sealed, calls: sealedCalls } = harness({
    exorcism: { position: { x: 2.9, y: 0.38, z: -4.6 } },
  })
  sealed.start()
  assert.equal(sealedCalls[0][1], -4.6 + APPARITION_OFFSET, 'no chamber: back to standing past the ash ring')

  const { ending: orphan, calls: orphanCalls, zombie } = harness({ exorcism: null })
  orphan.start()
  assert.deepEqual(orphanCalls, [['appearAt', zombie.maxZ - 6]])
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
