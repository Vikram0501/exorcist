import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { TrainZombie, detectionAwareness } from '../../src/levels/train/zombie.js'
import { Game } from '../../src/core/game.js'

const AISLE_X = 2.9

function carriage(minZ, maxZ) {
  return { bounds: new THREE.Box3(new THREE.Vector3(0, 0, minZ), new THREE.Vector3(5, 3, maxZ)) }
}

function harness() {
  const group = new THREE.Group()
  const carriages = [carriage(0, 35), carriage(-35, 0), carriage(-70, -35)]
  const world = { capsuleIntersect: capsule => capsule.start.x < 2.5 || capsule.start.x > 3.3 }
  const colliders = [{ type: 'mesh', world }]
  const zombie = new TrainZombie({ group, carriages, colliders })
  return { zombie, group, carriages }
}

function playerAt(x, z, { crouching = false, flashlightOn = false, speed = 0 } = {}) {
  return {
    position: new THREE.Vector3(x, 1.4, z),
    velocity: new THREE.Vector3(0, 0, speed),
    crouching,
    flashlightOn,
  }
}

function step(zombie, player, frames, dt = 0.05) {
  let outcome = null
  for (let frame = 0; frame < frames; frame++) {
    const result = zombie.update(dt, player)
    if (result) outcome = result
  }
  return outcome
}

const reading = (overrides) => detectionAwareness({
  state: 'patrol',
  hidden: false,
  distance: 20,
  ...overrides,
})

test('the meter stays dead while the stalker cannot act at all', () => {
  for (const state of ['dormant', 'banished', 'apparition']) {
    assert.equal(reading({ state, distance: 0.5 }), 0, state)
  }
})

test('the hiding rule reads zero however close it walks', () => {
  assert.equal(reading({ hidden: true, distance: 0.1 }), 0)
  assert.equal(reading({ hidden: true, distance: 0 }), 0)
})

test('anything it can reach has already been seen', () => {
  assert.equal(reading({ distance: 5.5 }), 1, 'the sense radius itself')
  assert.equal(reading({ distance: 1 }), 1, 'a player standing still at arm length')
  assert.equal(reading({ distance: 0 }), 1, 'and one right in front of it')
  assert.ok(reading({ distance: 5.6 }) < 1, 'a step outside the radius is only a warning')
})

test('the approach fills in from far away instead of jumping to full', () => {
  const far = reading({ distance: 10 })
  const near = reading({ distance: 6 })
  assert.ok(far > 0, `ten units out is already read, got ${far}`)
  assert.ok(near > far, `closer reads hotter: ${near} > ${far}`)
  assert.ok(near < 1, 'a warning below the radius is never a detection')
})

test('the bar climbs smoothly to the boundary and stays flat beyond it', () => {
  let previous = -1
  for (const distance of [11, 10, 9, 7, 6, 5.6]) {
    const value = reading({ distance })
    assert.ok(value > previous, `closing in reads hotter at ${distance}: ${value}`)
    previous = value
  }
  assert.equal(reading({ distance: 12 }), 0, 'past twice the sense radius nothing is read')
  assert.equal(reading({ distance: 11 }), 0, 'twice the sense radius is the edge of the warning')
  assert.equal(reading({ distance: 5.5 }), 1, 'no gap between warning and detection')
  assert.ok(1 - reading({ distance: 5.6 }) < 0.05, 'it arrives at full without a jump')
})

test('the waking stalker warns about a nearby player before it can reach them', () => {
  const { zombie, group } = harness()
  const parked = group.position.z
  assert.equal(zombie.state, 'dormant')
  assert.equal(zombie.detection, 0)

  step(zombie, playerAt(AISLE_X, -67), 3)
  assert.equal(zombie.state, 'dormant')
  assert.equal(zombie.detection, 0, 'still asleep reads nothing')
  assert.equal(group.position.z, parked, 'it does not stir')

  step(zombie, playerAt(AISLE_X, 6), 1)
  assert.equal(zombie.state, 'patrol', 'eight units is still outside its senses')
  assert.ok(
    zombie.detection > 0 && zombie.detection < 1,
    `eight units reads as closing danger, got ${zombie.detection}`
  )
})

test('it reads itself as spotted the moment it notices a runner', () => {
  const { zombie, group } = harness()
  step(zombie, playerAt(AISLE_X, 6), 1)
  assert.ok(zombie.detection < 1, 'approaching is a warning, not a detection')

  const runner = playerAt(AISLE_X, group.position.z + 4, { speed: 4 })
  assert.equal(zombie.update(0.05, runner), null)
  assert.equal(zombie.state, 'hunt')
  assert.equal(zombie.detection, 1, 'the bar snaps to full with the hunt')
})

test('a crouched player off the lane stays at zero with the stalker on top of them', () => {
  const { zombie, group } = harness()
  step(zombie, playerAt(AISLE_X, 6), 1)

  const hidden = playerAt(AISLE_X - 1.5, group.position.z, { crouching: true, speed: 4 })
  assert.equal(zombie.update(0.05, hidden), null)
  assert.equal(zombie.hidden, true)
  assert.equal(zombie.detection, 0, 'hiding beats the range check')
})

test('a player outside the radius reads a rising warning, not a catch', () => {
  const { zombie, group } = harness()
  step(zombie, playerAt(AISLE_X, 6), 1)

  const runner = playerAt(AISLE_X, group.position.z + 6.2, { speed: 4 })
  assert.equal(zombie.update(0.05, runner), null)
  assert.equal(zombie.state, 'patrol', 'six units is outside the sense radius')
  assert.ok(zombie.detection > 0.3 && zombie.detection < 1, `warning band, got ${zombie.detection}`)
})

test('the bar holds full through the hunt and drops when the memory fades', () => {
  const { zombie, group } = harness()
  step(zombie, playerAt(AISLE_X, 6), 1)

  const runner = playerAt(AISLE_X, group.position.z + 4, { speed: 4 })
  step(zombie, runner, 2)
  assert.equal(zombie.state, 'hunt')
  assert.equal(zombie.detection, 1)

  const safe = playerAt(AISLE_X - 1.5, group.position.z, { crouching: true, flashlightOn: false })
  step(zombie, safe, 40)
  assert.equal(zombie.state, 'hunt')
  assert.equal(zombie.detection, 1, 'it is still working from memory')

  step(zombie, safe, 70)
  assert.equal(zombie.state, 'patrol')
  assert.equal(zombie.detection, 0, 'it lost them, the bar clears')
})

test('a broken rite lights the bar, banishment and the apparition kill it', () => {
  const { zombie } = harness()
  step(zombie, playerAt(AISLE_X, 6), 1)

  assert.equal(zombie.stalk(AISLE_X, -30), true)
  assert.equal(zombie.detection, 1, 'being sent for reads as detected')

  assert.equal(zombie.banish(), true)
  assert.equal(zombie.detection, 0)
  step(zombie, playerAt(AISLE_X, 6), 2)
  assert.equal(zombie.detection, 0, 'a banished stalker senses nothing')

  const risen = harness()
  step(risen.zombie, playerAt(AISLE_X, 6), 1)
  risen.zombie.appearAt(-20)
  assert.equal(risen.zombie.detection, 0)
  step(risen.zombie, playerAt(AISLE_X, -6), 2)
  assert.equal(risen.zombie.detection, 0, 'the apparition never senses anyone')
})

// ---- The HUD widget: a stubbed meter driven straight off the prototype ----

function meterElements() {
  const classes = new Set(['hidden'])
  return {
    classes,
    meter: {
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)),
        contains: (name) => classes.has(name),
      },
    },
    fill: { style: {} },
    label: { textContent: '' },
  }
}

function meterGame() {
  const { classes, meter, fill, label } = meterElements()
  const game = Object.create(Game.prototype)
  game.currentLevel = 'train'
  game.trainCaught = false
  game.trainZombie = { state: 'patrol', hidden: false, detection: 0 }
  game.detectionMeterEl = meter
  game.detectionFillEl = fill
  game.detectionStateEl = label
  game.detectionMeterValue = null
  game.detectionMeterState = null
  return { game, classes, meter, fill, label }
}

test('the meter only rides along in the train level', () => {
  const { game, classes } = meterGame()

  game.currentLevel = 'house'
  game.updateDetectionMeter()
  assert.ok(classes.has('hidden'), 'the house objective panel carries no meter')

  game.currentLevel = 'train'
  game.trainZombie = null
  game.updateDetectionMeter()
  assert.ok(classes.has('hidden'), 'nothing to fear before the stalker exists')

  game.trainZombie = { state: 'apparition', hidden: false, detection: 0 }
  game.updateDetectionMeter()
  assert.ok(classes.has('hidden'), 'the standing apparition cannot detect anyone')

  game.trainZombie = { state: 'patrol', hidden: false, detection: 0.5 }
  game.updateDetectionMeter()
  assert.ok(!classes.has('hidden'), 'a walking stalker shows the meter')

  game.trainCaught = true
  game.updateDetectionMeter()
  assert.ok(classes.has('hidden'), 'the retry screen owns the view')
})

test('the meter writes the bar and the verdict label', () => {
  const { game, classes, fill, label } = meterGame()

  game.trainZombie.detection = 0.42
  game.updateDetectionMeter()
  assert.equal(fill.style.width, '42.0%')
  assert.equal(label.textContent, 'UNSEEN')
  assert.ok(classes.has('is-unseen'))

  game.trainZombie.hidden = true
  game.trainZombie.detection = 0
  game.updateDetectionMeter()
  assert.equal(fill.style.width, '0.0%')
  assert.equal(label.textContent, 'HIDDEN')
  assert.ok(classes.has('is-hidden'))
  assert.ok(!classes.has('is-unseen'))

  game.trainZombie.hidden = false
  game.trainZombie.detection = 1
  game.updateDetectionMeter()
  assert.equal(fill.style.width, '100.0%')
  assert.equal(label.textContent, 'SPOTTED')
  assert.ok(classes.has('is-spotted'))
  assert.ok(!classes.has('is-hidden'))

  const written = fill.style.width
  game.updateDetectionMeter()
  assert.equal(fill.style.width, written, 'an unchanged reading is not rewritten')
})

test('the meter tears down with the level', () => {
  const { game, classes, fill, label } = meterGame()
  game.trainZombie.detection = 1
  game.updateDetectionMeter()
  assert.ok(!classes.has('hidden'))

  game.currentLevel = 'highway'
  game.updateDetectionMeter()
  assert.ok(classes.has('hidden'))
  assert.equal(game.detectionMeterValue, null, 'the cached reading is dropped')
  assert.equal(game.detectionMeterState, null)
  assert.equal(fill.style.width, '100.0%')
  assert.equal(label.textContent, 'SPOTTED', 'stale text is fine, it is hidden')
})
