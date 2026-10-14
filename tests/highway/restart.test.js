import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  GHOST_PREFERRED_LANE,
  HighwayRaceController,
} from '../../src/levels/highway/race.js'
import { HighwayHUD } from '../../src/levels/highway/hud.js'
import { Game, isGhostNameCorrect } from '../../src/core/game.js'
import {
  createCollectibles,
  resetCollectibles,
} from '../../src/levels/highway/collectibles.js'
import {
  createGhostNameUI,
  pickRandomGhostName,
  resetGhostNameUI,
} from '../../src/levels/highway/index.js'
import { createRoadSigns } from '../../src/levels/highway/signs.js'
import { createDefaultTrack } from '../../src/levels/highway/track.js'

// Headless DOM stubs: plain objects, no layout engine.
function makeElement(tag = 'div') {
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
      const i = el.children.indexOf(child)
      if (i >= 0) el.children.splice(i, 1)
      child.parentNode = null
    },
    remove() {
      if (el.parentNode) el.parentNode.removeChild(el)
    },
  }
  return el
}

function withStubs(fn) {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const listeners = { added: 0, removed: 0 }
  globalThis.window = {
    addEventListener() { listeners.added++ },
    removeEventListener() { listeners.removed++ },
  }
  const body = makeElement('body')
  const head = makeElement('head')
  globalThis.document = {
    createElement: (tag) => {
      const el = makeElement(tag)
      if (tag === 'canvas') el.getContext = () => ({ fillRect() {}, strokeRect() {}, fillText() {} })
      return el
    },
    getElementById: () => ({ classList: { add() {} } }),
    body,
    head,
  }
  try {
    return fn({ listeners, body, head })
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

function makeLiveRace() {
  const track = createDefaultTrack()
  const player = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  player.obstacles = []
  const ghostUI = { style: {} }
  const race = new HighwayRaceController(
    player, new THREE.Object3D(), -880, 'OWEN GRAVE', ghostUI,
    new THREE.Scene(), track, null, track.totalLength
  )
  race.obstacles = []
  // Simulate a live race past the countdown.
  race.time = 4
  race.finishedCountdown = true
  race.raceStarted = true
  player.setDrivingEnabled(true)
  return { track, player, race, ghostUI }
}

function simulateDeath(player, race) {
  // Drive far from spawn, damage the ghost/race state, then crash.
  player.placeAt(300, 1)
  player.keys = { KeyW: true }
  race.ghostPathProgress = 320
  race.ghostSpeed = 30
  race.ghostLateralVelocity = 3
  race.ghostObstacleCooldowns.set({ progress: 1 }, 0.1)
  race.ghostAvoiding = true
  race.carCollisionCooldown = 0.2
  race.carContactActive = true
  race.ghostBumpPhase = 'bump'
  race.brakeCutTriggered = true
  race.brakeCutPhase = 'cut'
  race.brakeCutTimer = 2
  race.time = 42
  race.raceFinished = false
  const hit = { progress: 305, lateralOffset: 1, halfWidth: 0.7, halfDepth: 0.7 }
  let crashed = null
  player.onCrash = (h) => { crashed = h }
  player.crashAt(hit)
  // Mirror Game.showGameOver freeze.
  player.setDrivingEnabled(false)
  race.ghostSpeed = 0
  return crashed
}

test('player crash freezes driving and fires onCrash once', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  const crashed = simulateDeath(player, race)
  assert.ok(crashed, 'onCrash fired')
  assert.equal(player.canDrive, false, 'driving disabled after death')
  assert.equal(player.hasCrashed, true, 'crash latched')
  player.dispose()
  race.dispose()
}))

test('race.reset restores countdown, start positions and clears gameplay state', () => withStubs(() => {
  const { track, player, race, ghostUI } = makeLiveRace()
  simulateDeath(player, race)
  // Corrupt finish/countdown UI like a real death + ghost-win path.
  race.finishRace('ghost')
  assert.equal(race.raceFinished, true)
  const countdownEl = race.countdownElement
  const warningEl = race.brakeCutWarningEl
  const aftermathEl = race.brakeCutAftermathEl
  const onKeyDownBefore = player.onKeyDown

  race.reset()

  // Lifecycle restarts.
  assert.equal(race.raceFinished, false, 'win/loss cleared')
  assert.equal(race.winner, null)
  assert.equal(race.time, 0, 'timer reset')
  assert.equal(race.raceStarted, false, 'race not started before countdown')
  assert.equal(race.finishedCountdown, false, 'countdown restarts')
  assert.equal(race.countdownAudioStarted, false, 'countdown voice re-arms')
  // Ghost back at start.
  assert.equal(race.ghostPathProgress, 0)
  assert.equal(race.ghostLateralOffset, GHOST_PREFERRED_LANE)
  assert.equal(race.ghostLateralVelocity, 0)
  assert.equal(race.ghostSpeed, 5, 'ghost initial speed')
  assert.equal(race.ghostObstacleCooldowns.size, 0, 'cooldowns cleared')
  assert.equal(race.ghostAvoiding, false)
  assert.equal(race.ghostAvoidBlocked, false)
  assert.equal(race.carCollisionCooldown, 0)
  assert.equal(race.carContactActive, false)
  assert.equal(race.ghostBumpPhase, 'idle')
  assert.equal(race.ghostPlayerHitCooldown, 0)
  assert.equal(race.ghostHitRecoveryTimer, 0)
  // Brake-cut script cleared.
  assert.equal(race.brakeCutTriggered, false)
  assert.equal(race.brakeCutPhase, 'none')
  assert.equal(race.brakeCutTimer, 0)
  // Player car back at spawn.
  assert.equal(player.pathProgress < 5, true, `player at start, got s=${player.pathProgress}`)
  assert.ok(Math.abs(player.lateralOffset - 2) < 0.6, `player lateral +2, got ${player.lateralOffset}`)
  assert.equal(player.hasCrashed, false, 'crash latch cleared')
  assert.equal(player.brakesWorking, true, 'brakes restored')
  assert.equal(player.canDrive, false, 'driving re-enabled only at GO')
  assert.deepEqual(player.keys, {}, 'stuck keys cleared')
  assert.equal(player.speed, 0)
  // Same DOM nodes reused (no duplicates).
  assert.equal(race.countdownElement, countdownEl, 'countdown node reused')
  assert.equal(race.brakeCutWarningEl, warningEl)
  assert.equal(race.brakeCutAftermathEl, aftermathEl)
  assert.equal(countdownEl.textContent, '3')
  assert.equal(countdownEl.style.display, 'block')
  assert.equal(warningEl.style.display, 'none')
  assert.equal(aftermathEl.style.display, 'none')
  assert.equal(ghostUI.style.display, 'block', 'name banner visible again')
  // Same listeners (no duplicates).
  assert.equal(player.onKeyDown, onKeyDownBefore, 'key listeners reused, not re-added')
  player.dispose()
  race.dispose()
}))

test('countdown restarts the race and re-enables controls after reset', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  simulateDeath(player, race)
  race.reset()
  // Run the 3-2-1-GO countdown.
  for (let i = 0; i < 300; i++) race.update(1 / 60)
  assert.equal(race.finishedCountdown, true, 'countdown finishes')
  assert.equal(race.raceStarted, true, 'race starts')
  assert.equal(player.canDrive, true, 'controls work after GO')
  assert.equal(race.countdownElement.style.display, 'none', 'banner hidden after GO')
  player.dispose()
  race.dispose()
}))

test('reset can repeat after multiple deaths without breaking', () => withStubs(() => {
  const { player, race } = makeLiveRace()
  for (let round = 0; round < 3; round++) {
    simulateDeath(player, race)
    assert.equal(player.hasCrashed, true, `round ${round}: crashed`)
    race.reset()
    assert.equal(player.hasCrashed, false, `round ${round}: latch cleared`)
    assert.equal(race.raceFinished, false, `round ${round}: race live`)
    assert.equal(race.time, 0, `round ${round}: timer zero`)
    for (let i = 0; i < 300; i++) race.update(1 / 60)
    assert.equal(player.canDrive, true, `round ${round}: drives after GO`)
  }
  player.dispose()
  race.dispose()
}))

test('Play Again changes the ghost name, clues and answer on consecutive rounds without new listeners', () => withStubs(({ listeners, body }) => {
  const { track, player, race } = makeLiveRace()
  const game = Object.create(Game.prototype)
  const model = new THREE.Group()
  const firstName = race.ghostName
  game.currentLevel = 'highway'
  game.levelState = 'GAME_OVER'
  game.levelData = { track, arcLengths: track.arcLengths, totalRoadLength: track.totalLength }
  game.model = model
  game.obstacles = []
  game.ghostNameUI = createGhostNameUI(firstName)
  game.collectibles = createCollectibles(firstName, model, game.ghostNameUI, track, track.arcLengths, track.totalLength)
  game.roadSigns = createRoadSigns(firstName, model, track)
  game.highwayController = player
  game.highwayRace = race
  race.ghostNameUI = game.ghostNameUI
  game.highwayAudio = { setHighwayActive() {}, setPlayerDriving() {} }
  game.highwayHUD = { reset() {} }
  game.input = { clear() {}, lock() {} }

  const originalKeyDown = player.onKeyDown
  for (let round = 0; round < 3; round++) {
    const previousName = race.ghostName
    const previousUI = game.ghostNameUI
    const previousPickups = game.collectibles.slice()
    const previousSigns = game.roadSigns.slice()
    game.pendingGhostName = previousName
    game.nameInput = { value: previousName }
    game.ghostNameUI.revealLetter(0)
    game.restartHighway()

    assert.notEqual(race.ghostName, previousName, `round ${round}: new name`)
    assert.equal(game.pendingGhostName, null, 'old answer cleared')
    assert.equal(game.nameInput, null, 'old question input removed')
    assert.equal(race.ghostNameUI, game.ghostNameUI, 'race and game use the same banner')
    assert.equal(isGhostNameCorrect(race.ghostName, race.ghostName), true)
    assert.equal(isGhostNameCorrect(previousName, race.ghostName), false, 'old name is not the answer')
    assert.equal(game.ghostNameUI._slots.map(slot => slot.letter).join(''), race.ghostName.replace(' ', ''))
    assert.ok(game.ghostNameUI._slots.every(slot => !slot.revealed), 'new clues start hidden')
    assert.equal(game.collectibles.length, game.ghostNameUI._total, 'one pickup per new letter')
    assert.equal(game.collectibles.map(pickup => pickup.letter).join(''), race.ghostName.replace(' ', ''))
    assert.equal(previousUI.parentNode, null, 'old banner removed')
    assert.ok(previousPickups.every(pickup => !pickup.mesh.parent), 'old pickups removed')
    assert.ok(previousSigns.every(sign => !sign.parent), 'old hint signs removed')
    assert.equal(body.children.filter(child => child._slots).length, 1, 'one live name banner')
    assert.equal(player.onKeyDown, originalKeyDown)
    assert.equal(listeners.added, 2, 'no extra car key listeners')
    assert.equal(race.brakeCutPhase, 'none', 'brake event re-armed')
    assert.equal(race.time, 0, 'countdown reset')
  }
  player.dispose()
  race.dispose()
  assert.equal(listeners.removed, 2, 'car listeners cleaned up on dispose')
}))

test('name picker excludes the previous name even when random repeats', () => {
  const first = pickRandomGhostName(null, () => 0)
  const next = pickRandomGhostName(first, () => 0)
  assert.notEqual(next, first)
})

test('HUD.reset zeroes timer, checkpoints and toasts without new nodes', () => withStubs(({ body }) => {
  const controller = { pathProgress: 500, speed: 20 }
  const race = { ghostPathProgress: 400, raceStarted: true, raceFinished: false, finishDistance: 1521, track: null }
  const hud = new HighwayHUD({ controller, race, track: null })
  const nodesBefore = body.children.length
  assert.equal(nodesBefore, 1, 'one HUD root')
  // Simulate mid-race state.
  for (let i = 0; i < 20; i++) hud.update(0.1)
  controller.pathProgress = hud.checkpoints[0] + 1
  race.ghostPathProgress = hud.checkpoints[0] + 1
  hud.update(0.1)
  assert.ok(hud.elapsed > 0, 'timer ran')
  hud.reset()
  assert.equal(hud.elapsed, 0, 'timer zero')
  assert.equal(hud.displayedSpeed, 0)
  assert.ok(hud.playerCheckpointTimes.every((t) => t == null), 'player splits cleared')
  assert.ok(hud.ghostCheckpointTimes.every((t) => t == null), 'ghost splits cleared')
  assert.equal(hud.toastRemaining, 0)
  assert.equal(body.children.length, 1, 'no duplicate HUD nodes')
  hud.dispose()
}))

test('resetCollectibles + resetGhostNameUI restore letters and blank slots', () => withStubs(() => {
  const ghostNameUI = {
    style: { display: 'none' },
    _slots: [{ letter: 'A', revealed: true }, { letter: 'B', revealed: true }],
    _slotElements: [{ textContent: '', style: {} }, { textContent: '', style: {} }],
    _counterRow: { textContent: '' },
    _collected: 2,
    _total: 2,
  }
  const pickups = [
    { collected: true, mesh: { visible: false } },
    { collected: true, mesh: { visible: false } },
  ]
  resetCollectibles(pickups)
  resetGhostNameUI(ghostNameUI)
  for (const p of pickups) {
    assert.equal(p.collected, false, 'pickup collectible again')
    assert.equal(p.mesh.visible, true, 'pickup visible again')
  }
  assert.ok(ghostNameUI._slots.every((s) => !s.revealed), 'slots blank')
  assert.equal(ghostNameUI._collected, 0)
  assert.equal(ghostNameUI.style.display, 'block')
}))
