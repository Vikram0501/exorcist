import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHECKPOINT_FRACTIONS,
  HUD_UPDATE_INTERVAL,
  HighwayHUD,
  checkpointDistances,
  formatCheckpointDelta,
  formatRaceTime,
  racePosition,
  raceProgress,
  speedKmh,
} from '../../src/levels/highway/hud.js'

test('speed converts m/s to km/h correctly', () => {
  assert.equal(speedKmh(0), 0)
  assert.equal(speedKmh(35), 126)
  assert.equal(speedKmh(-10), 36)
  assert.ok(Math.abs(speedKmh(16.6667) - 60) < 0.01)
  assert.equal(speedKmh(NaN), 0)
  assert.equal(speedKmh(Infinity), 0)
})

test('race timer formats MM:SS.cs', () => {
  assert.equal(formatRaceTime(0), '00:00.00')
  assert.equal(formatRaceTime(3.2), '00:03.20')
  assert.equal(formatRaceTime(65.25), '01:05.25')
  assert.equal(formatRaceTime(599.99), '09:59.99')
  assert.equal(formatRaceTime(-5), '00:00.00')
  assert.equal(formatRaceTime(NaN), '00:00.00')
})

test('position uses live track progress with ties to the player', () => {
  assert.equal(racePosition(100, 90), 1)
  assert.equal(racePosition(90, 100), 2)
  assert.equal(racePosition(100, 100), 1)
})

test('progress is anchored to the finish line, not the runoff', () => {
  const finish = 1521
  assert.equal(raceProgress(0, finish), 0)
  assert.ok(Math.abs(raceProgress(finish / 2, finish) - 0.5) < 1e-9)
  assert.equal(raceProgress(finish, finish), 1)
  assert.equal(raceProgress(finish + 60, finish), 1)
  assert.equal(raceProgress(-10, finish), 0)
  assert.equal(raceProgress(100, 0), 0)
})

test('five checkpoints spread across the race distance', () => {
  assert.equal(CHECKPOINT_FRACTIONS.length, 5)
  const finish = 1521
  const points = checkpointDistances(finish)
  assert.equal(points.length, 5)
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i] > points[i - 1], 'ascending')
  }
  assert.ok(points[0] > 0, 'first checkpoint after the start')
  assert.ok(points[4] < finish, 'last checkpoint before the finish')
})

test('checkpoint deltas only use measured ghost timing', () => {
  assert.equal(formatCheckpointDelta(60.5, 58.2), '+2.3s')
  assert.equal(formatCheckpointDelta(58.2, 60.5), '−2.3s')
  assert.equal(formatCheckpointDelta(60, null), null)
  assert.equal(formatCheckpointDelta(null, 60), null)
})

// ---- Headless DOM stub: elements are plain objects, no layout engine ----

function makeDocumentStub() {
  const mk = (tag) => {
    const el = {
      tag,
      className: '',
      textContent: '',
      innerHTML: '',
      style: {},
      children: [],
      parentNode: null,
      appendChild(child) {
        child.parentNode = el
        el.children.push(child)
        return child
      },
      removeChild(child) {
        const index = el.children.indexOf(child)
        if (index >= 0) el.children.splice(index, 1)
        child.parentNode = null
      },
      remove() {
        if (el.parentNode) el.parentNode.removeChild(el)
      },
    }
    el.parentNode = {
      removeChild(child) {
        const index = el.children.indexOf(child)
        if (index >= 0) el.children.splice(index, 1)
        child.parentNode = null
      },
    }
    return el
  }
  const head = mk('head')
  const body = mk('body')
  // Top-level containers have no parent: give them inert removers.
  for (const top of [head, body]) top.parentNode = null
  return {
    head,
    body,
    createElement: (tag) => mk(tag),
  }
}

function makeRace() {
  return {
    ghostPathProgress: 0,
    raceStarted: false,
    raceFinished: false,
    finishDistance: 1521,
    track: null,
  }
}

function makeController() {
  return { pathProgress: 0, speed: 0 }
}

function withDocument(fn) {
  const original = globalThis.document
  const stub = makeDocumentStub()
  globalThis.document = stub
  try {
    return fn(stub)
  } finally {
    globalThis.document = original
  }
}

test('HUD builds all widgets and starts at zero', () => withDocument((doc) => {
  const hud = new HighwayHUD({
    controller: makeController(),
    race: makeRace(),
    track: null,
  })
  assert.equal(doc.body.children.length, 1, 'single HUD root')
  const names = []
  doc.body.children[0].children.forEach((child) => names.push(child.className))
  assert.ok(names.some((name) => name.includes('hw-timer')), 'timer present')
  assert.ok(names.some((name) => name.includes('hw-position')), 'position present')
  assert.ok(names.some((name) => name.includes('hw-progress')), 'progress present')
  assert.ok(names.some((name) => name.includes('hw-speed')), 'speed present')
  assert.ok(names.some((name) => name.includes('hw-toast')), 'toast present')
  assert.equal(hud.elapsed, 0)
  hud.dispose()
}))

test('timer runs only between GO and the finish', () => withDocument(() => {
  const controller = makeController()
  const race = makeRace()
  const hud = new HighwayHUD({ controller, race, track: null })
  hud.update(1)
  assert.equal(hud.elapsed, 0, 'no timing during the countdown')
  race.raceStarted = true
  // Frame steps respect the hitch clamp: many small updates sum exactly.
  for (let i = 0; i < 35; i++) hud.update(0.1)
  assert.ok(Math.abs(hud.elapsed - 3.5) < 1e-9, 'accumulates while racing')
  race.raceFinished = true
  hud.update(10)
  assert.ok(Math.abs(hud.elapsed - 3.5) < 1e-9, 'frozen at the finish')
  assert.equal(hud.cache.timer, formatRaceTime(3.5))
  hud.dispose()
}))

test('position flips when either car overtakes', () => withDocument(() => {
  const controller = makeController()
  const race = makeRace()
  race.raceStarted = true
  const hud = new HighwayHUD({ controller, race, track: null })
  controller.pathProgress = 500
  race.ghostPathProgress = 400
  hud.update(HUD_UPDATE_INTERVAL)
  assert.equal(hud.cache.position, '1/2')
  race.ghostPathProgress = 600
  hud.update(HUD_UPDATE_INTERVAL)
  assert.equal(hud.cache.position, '2/2')
  hud.dispose()
}))

test('checkpoints record both cars and announce the player split', () => withDocument(() => {
  const controller = makeController()
  const race = makeRace()
  race.raceStarted = true
  const hud = new HighwayHUD({ controller, race, track: null })
  const first = hud.checkpoints[0]
  // Ghost crosses first, then the player: delta must be positive.
  race.ghostPathProgress = first + 1
  hud.update(HUD_UPDATE_INTERVAL)
  hud.update(2)
  controller.pathProgress = first + 1
  hud.update(HUD_UPDATE_INTERVAL)
  assert.ok(hud.playerCheckpointTimes[0] != null, 'player split recorded')
  assert.ok(hud.ghostCheckpointTimes[0] != null, 'ghost split recorded')
  assert.ok(
    hud.playerCheckpointTimes[0] > hud.ghostCheckpointTimes[0],
    'ghost was genuinely earlier'
  )
  assert.ok(hud.toastRemaining > 0, 'feedback shown')
  const shown = hud.toast.innerHTML
  assert.ok(shown.includes('CHECKPOINT 1/5'), 'checkpoint labelled')
  assert.ok(shown.includes('+'), 'behind delta shown from measured times')
  hud.dispose()
}))

test('checkpoint with no ghost timing shows AHEAD, never an invented delta', () => withDocument(() => {
  const controller = makeController()
  const race = makeRace()
  race.raceStarted = true
  const hud = new HighwayHUD({ controller, race, track: null })
  controller.pathProgress = hud.checkpoints[0] + 1
  hud.update(HUD_UPDATE_INTERVAL)
  assert.ok(hud.toast.innerHTML.includes('AHEAD'), 'leading with no ghost data')
  assert.ok(!hud.toast.innerHTML.includes('+'), 'no invented difference')
  hud.dispose()
}))

test('restart starts fresh and dispose cleans up listeners and nodes', () => withDocument((doc) => {
  const first = new HighwayHUD({
    controller: makeController(),
    race: makeRace(),
    track: null,
  })
  assert.equal(doc.body.children.length, 1)
  first.dispose()
  assert.equal(doc.body.children.length, 0, 'root removed')
  assert.equal(doc.head.children.length, 0, 'styles removed')
  first.update(1)
  const second = new HighwayHUD({
    controller: makeController(),
    race: makeRace(),
    track: null,
  })
  assert.equal(second.elapsed, 0, 'fresh timer on restart')
  assert.ok(second.playerCheckpointTimes.every((time) => time == null))
  assert.equal(doc.body.children.length, 1, 'exactly one HUD after restart')
  second.dispose()
  assert.equal(doc.body.children.length, 0)
}))
