import test from 'node:test'
import assert from 'node:assert/strict'
import { createLevelLoadTracker } from '../../src/core/loading.js'

test('house and train progress only reaches 100 after readiness', () => {
  for (const [level, steps] of [
    ['house', ['model', 'world', 'avatar', 'setup', 'warmup']],
    ['train', ['carriages', 'layout', 'collision', 'zombie', 'clues', 'warmup']],
  ]) {
    const events = []
    const tracker = createLevelLoadTracker(level, () => true, event => events.push(event))
    for (const step of steps) tracker.complete(step)
    assert.ok(events.at(-1).loaded < 100)
    tracker.complete('ready')
    assert.equal(events.at(-1).loaded, 100)
    tracker.complete('ready')
    assert.equal(events.length, steps.length + 1)
  }
})

test('cancelled level load cannot report stale progress', () => {
  const events = []
  let alive = true
  const tracker = createLevelLoadTracker('house', () => alive, event => events.push(event))
  tracker.complete('model')
  alive = false
  tracker.complete('world')
  assert.equal(events.length, 1)
  tracker.abort()
  tracker.complete('ready')
  assert.equal(events.length, 1)
})
