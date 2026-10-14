import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HIGHWAY_LOAD_EVENT,
  HIGHWAY_LOAD_TASKS,
  HIGHWAY_LOAD_TOTAL,
  createHighwayLoadTracker,
  highwayLoadPercent,
} from '../../src/levels/highway/load-progress.js'
import { HighwayAudio } from '../../src/levels/highway/audio.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const mainJs = fs.readFileSync(
  path.join(repoRoot, 'src', 'main.js'),
  'utf8'
)

function makeTracker(events, alive = true) {
  return createHighwayLoadTracker({
    isAlive: () => alive,
    onProgress: ({ loaded, total }) => {
      events.push({ loaded, total, pct: highwayLoadPercent(loaded, total) })
    },
  })
}

test('task weights cover every required asset and sum to exactly 100', () => {
  const ids = HIGHWAY_LOAD_TASKS.map((task) => task.id)
  for (const required of [
    'road',
    'city',
    'streetlights',
    'player-car',
    'ghost-car',
    'obstacle-zombie',
    'obstacle-scientist',
    'obstacle-barbed',
    'sky',
    'audio',
    'init',
  ]) {
    assert.ok(ids.includes(required), `task listed: ${required}`)
  }
  const sum = HIGHWAY_LOAD_TASKS.reduce((a, t) => a + t.weight, 0)
  assert.equal(sum, HIGHWAY_LOAD_TOTAL)
  assert.equal(HIGHWAY_LOAD_TOTAL, 100)
})

test('percentage climbs monotonically to exactly 100% in completion order', () => {
  const events = []
  const tracker = makeTracker(events)
  const order = [...HIGHWAY_LOAD_TASKS]
  for (const task of order) tracker.complete(task.id)
  assert.ok(events.length === HIGHWAY_LOAD_TASKS.length)
  for (let i = 1; i < events.length; i++) {
    assert.ok(
      events[i].pct >= events[i - 1].pct,
      `never decreases: ${events[i - 1].pct}% -> ${events[i].pct}%`
    )
  }
  const last = events[events.length - 1]
  assert.equal(last.loaded, HIGHWAY_LOAD_TOTAL)
  assert.equal(last.pct, 100, '100% only with every task done')
  assert.equal(tracker.isSettled, true)
})

test('parallel arrivals in any order still never decrease', () => {
  const orders = [
    [...HIGHWAY_LOAD_TASKS].reverse(),
    [...HIGHWAY_LOAD_TASKS].sort((a, b) => b.weight - a.weight),
  ]
  for (const order of orders) {
    const events = []
    const tracker = makeTracker(events)
    for (const task of order) tracker.complete(task.id)
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i].loaded >= events[i - 1].loaded, 'monotonic')
    }
    assert.equal(events[events.length - 1].pct, 100)
  }
})

test('duplicate and unknown completions are ignored', () => {
  const events = []
  const tracker = makeTracker(events)
  tracker.complete('road')
  tracker.complete('road')
  tracker.complete('no-such-task')
  assert.equal(events.length, 1, 'exactly one emission')
  assert.equal(tracker.completed, 16, 'counted once')
})

test('a failed session can never reach 100%', async () => {
  const events = []
  const tracker = makeTracker(events)
  tracker.complete('road')
  await assert.rejects(
    tracker.run('player-car', () => Promise.reject(new Error('cdn down'))),
    /cdn down/
  )
  tracker.complete('ghost-car')
  tracker.complete('sky')
  assert.ok(
    events.every((e) => e.pct < 100),
    'no 100% after a task failed'
  )
  assert.equal(tracker.isSettled, true, 'failed session is settled')
})

test('stale sessions cannot move a new session (exit / re-entry)', () => {
  let alive = true
  const liveEvents = []
  const staleEvents = []
  const live = createHighwayLoadTracker({
    isAlive: () => alive,
    onProgress: ({ loaded, total }) => liveEvents.push({ loaded, total }),
  })
  const stale = createHighwayLoadTracker({
    isAlive: () => false,
    onProgress: ({ loaded, total }) => staleEvents.push({ loaded, total }),
  })
  // A tracker from a previous (exited) session emits nothing.
  stale.complete('road')
  assert.equal(staleEvents.length, 0, 'dead session emits nothing')
  // The new session is unaffected.
  live.complete('road')
  assert.equal(liveEvents.length, 1, 'live session unaffected')
  // Exiting flips isAlive: further completions are dropped.
  alive = false
  live.complete('city')
  assert.equal(liveEvents.length, 1, 'post-exit completions dropped')
})

test('run() reports completion and returns the wrapped value', async () => {
  const events = []
  const tracker = makeTracker(events)
  const value = await tracker.run('sky', async () => 'texture!')
  assert.equal(value, 'texture!')
  assert.equal(events.length, 1)
  assert.equal(tracker.completed, 10)
})

test('highwayLoadPercent matches the menu formula', () => {
  assert.equal(highwayLoadPercent(0, 100), 0)
  assert.equal(highwayLoadPercent(16, 100), 16)
  assert.equal(highwayLoadPercent(1, 3), 33)
  assert.equal(highwayLoadPercent(0, 0), 0)
})

// ---------------------------------------------------------------------------
// Audio readiness (one weighted step of the tracker).
// ---------------------------------------------------------------------------

function mockAudio(t, { readyState = 4 } = {}) {
  const originalAudio = globalThis.Audio
  const elements = []
  globalThis.Audio = class {
    constructor(url) {
      this.url = url
      this.readyState = readyState
      this.handlers = {}
      elements.push(this)
    }
    addEventListener(type, fn) {
      ;(this.handlers[type] ??= []).push(fn)
    }
    fire(type) {
      for (const fn of this.handlers[type] ?? []) fn()
    }
  }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
  })
  return elements
}

test('audio is ready immediately when elements are buffered', async (t) => {
  mockAudio(t, { readyState: 4 })
  const audio = new HighwayAudio()
  await audio.unlock()
  assert.equal(await audio.waitForReady(50), true)
})

test('audio waits for canplaythrough instead of failing the level', async (t) => {
  const elements = mockAudio(t, { readyState: 0 })
  const audio = new HighwayAudio()
  await audio.unlock()
  const pending = audio.waitForReady(1000)
  for (const el of elements) el.fire('canplaythrough')
  assert.equal(await pending, true)
})

test('audio errors resolve (never reject or hang the load)', async (t) => {
  const elements = mockAudio(t, { readyState: 0 })
  const audio = new HighwayAudio()
  await audio.unlock()
  const pending = audio.waitForReady(1000)
  for (const el of elements) el.fire('error')
  assert.equal(await pending, true)
})

test('audio readiness times out instead of blocking forever', async (t) => {
  mockAudio(t, { readyState: 0 })
  const audio = new HighwayAudio()
  await audio.unlock()
  // Nothing fires: the timeout resolves so loading can proceed.
  assert.equal(await audio.waitForReady(20), false)
})

test('highway progress stays off the campaign briefing', () => {
  assert.ok(
    !mainJs.includes('HIGHWAY_LOAD_EVENT') && !mainJs.includes('LOADING ${pct}%'),
    'the briefing does not show raw asset progress'
  )
  assert.equal(typeof HIGHWAY_LOAD_EVENT, 'string')
})
