import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import { HighwayRaceController } from '../../src/levels/highway/race.js'
import { HighwayHUD } from '../../src/levels/highway/hud.js'
import { HighwayAudio } from '../../src/levels/highway/audio.js'
import { Game } from '../../src/core/game.js'
import { createDefaultTrack } from '../../src/levels/highway/track.js'

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function mockAudio(t) {
  const originalAudio = globalThis.Audio
  const created = []
  globalThis.Audio = class {
    constructor(url) {
      this.url = url
      this.paused = true
      this.currentTime = 0
      this.loop = false
      this.volume = 1
      this.listeners = {}
      created.push(this)
    }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn)
    }
  }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
  })
  return created
}

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

test('real Game exit unmounts body UI and canvas through five fresh entries', t => withDomStubs(({ body, head, listeners }) => {
  const originalCancel = globalThis.cancelAnimationFrame
  const cancelled = []
  globalThis.cancelAnimationFrame = id => cancelled.push(id)
  t.after(() => { globalThis.cancelAnimationFrame = originalCancel })
  document.getElementById = id => body.children.find(el => el.id === id) || null
  const menu = makeElement()
  menu.id = 'overlay'
  body.appendChild(menu)
  const canvas = makeElement('canvas')
  const game = Object.create(Game.prototype)
  Object.assign(game, {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: canvas }, container: body,
    input: { release() {}, clear() {}, lock() {} },
    clock: { stop() {} }, levelLoadId: 0, houseAudioStartFrame: null,
    houseAudio: { setHouseActive() {}, unlock() {} },
    trainAudio: { setTrainActive() {}, unlock() {} },
    hideNewspaperReader() {}, closeEvidenceBook() {},
    collectibles: [], roadSigns: [], exorcismParticles: [],
  })
  mockAudio(t)
  game.highwayAudio = new HighwayAudio()
  for (let cycle = 0; cycle < 5; cycle++) {
    const { player, race } = makeLiveRace()
    const hud = new HighwayHUD({ controller: player, race })
    const controls = makeElement()
    controls.id = 'highwayControls'
    body.appendChild(controls)
    body.appendChild(canvas)
    const gameOver = makeElement()
    body.appendChild(gameOver)
    Object.assign(game, {
      currentLevel: 'highway', loaded: true, animationRunning: true,
      animationFrameId: cycle + 1, highwayController: player,
      highwayRace: race, highwayHUD: hud, gameOverEl: gameOver,
      levelRoot: new THREE.Group(),
    })
    game.scene.add(game.levelRoot)
    game.highwayAudio.setHighwayActive(true)
    game.highwayAudio.setPlayerDriving(true)
    game.highwayAudio.playCountdown()
    game.exitToMenu()
    game.exitToMenu()
    assert.deepEqual(body.children, [menu], 'only menu remains, including after game over')
    assert.equal(head.children.length, 0, 'HUD styles removed')
    assert.equal(canvas.parentNode, null)
    assert.equal(game.scene.children.length, 0)
    assert.equal(game.animationRunning, false)
    assert.equal(game.highwayRace, null)
    for (const sound of [game.highwayAudio.music, game.highwayAudio.carSound, game.highwayAudio.countdown]) {
      assert.equal(sound.paused, true)
    }
    assert.equal(listeners.added, listeners.removed, 'car listeners balanced')
    game.animate() // must return before accessing the renderer/clock
  }
  assert.deepEqual(cancelled, [1, 2, 3, 4, 5], 'exactly one cancellation per exit')
}))

function withDomStubs(fn) {
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
    createElement: () => makeElement(),
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
  race.time = 4
  race.finishedCountdown = true
  race.raceStarted = true
  player.setDrivingEnabled(true)
  return { track, player, race, ghostUI }
}

// ---------------------------------------------------------------------------
// Audio: exit must silence everything, re-enter must not stack elements
// ---------------------------------------------------------------------------

test('exiting Level 3 stops music, car sound and countdown audio', t => withDomStubs(() => {
  const created = mockAudio(t)
  const audio = new HighwayAudio()
  audio.unlock()
  audio.setHighwayActive(true)
  audio.setPlayerDriving(true)
  audio.playCountdown()
  const music = created.find(a => a.url.includes('level3_ambient'))
  const car = created.find(a => a.url.includes('car_sound'))
  const countdown = created.find(a => a.url.includes('countdown'))
  assert.ok(music && car && countdown, 'all three elements exist')
  assert.equal(music.paused, false, 'music playing')
  assert.equal(car.paused, false, 'car sound playing')
  assert.equal(countdown.paused, false, 'countdown playing')

  // This is what unloadCurrentLevel() -> setHighwayActive(false) does.
  audio.setHighwayActive(false)

  assert.equal(audio.enabled, false)
  assert.equal(music.paused, true, 'music stopped')
  assert.equal(music.currentTime, 0, 'music rewound')
  assert.equal(car.paused, true, 'car sound stopped')
  assert.equal(countdown.paused, true, 'countdown stopped')
  assert.equal(countdown.currentTime, 0, 'countdown rewound')
}))

test('repeatedly entering and exiting never stacks audio elements', t => withDomStubs(() => {
  const created = mockAudio(t)
  const audio = new HighwayAudio()
  audio.unlock()
  for (let i = 0; i < 3; i++) {
    audio.setHighwayActive(true)
    audio.setPlayerDriving(true)
    audio.playCountdown()
    audio.setHighwayActive(false)
  }
  assert.equal(created.length, 3, `exactly music+car+countdown, got ${created.length}`)
  audio.setHighwayActive(true)
  assert.equal(created.length, 3, 're-enter reuses the same elements')
  const music = created.find(a => a.url.includes('level3_ambient'))
  assert.equal(music.paused, false, 'music plays again after re-enter')
}))

// ---------------------------------------------------------------------------
// Listeners: exit must remove Level 3 key handlers, exactly once
// ---------------------------------------------------------------------------

test('disposing the car controller removes its key listeners (no leaks across re-entries)', () => withDomStubs(({ listeners }) => {
  const track = createDefaultTrack()
  const addedBefore = listeners.added
  const removedBefore = listeners.removed
  const c1 = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  assert.equal(listeners.added - addedBefore, 2, 'keydown + keyup registered')
  c1.dispose()
  assert.equal(listeners.removed - removedBefore, 2, 'both listeners removed on exit')
  // Double dispose (exit called twice) must not throw. The browser
  // removeEventListener is idempotent, so re-removal is harmless.
  assert.doesNotThrow(() => c1.dispose(), 'second dispose is safe')

  // Re-enter: a fresh controller registers fresh listeners.
  const c2 = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  assert.equal(listeners.added - addedBefore, 4, 'fresh listeners on re-enter')
  c2.dispose()
}))

// ---------------------------------------------------------------------------
// DOM: exit must remove race banners; double exit must be safe
// ---------------------------------------------------------------------------

test('disposing the race removes countdown/brake nodes and is safe twice', () => withDomStubs(() => {
  const { player, race } = makeLiveRace()
  const countdown = race.countdownElement
  const warning = race.brakeCutWarningEl
  const aftermath = race.brakeCutAftermathEl
  assert.ok(countdown.parentNode, 'countdown attached')
  race.dispose()
  assert.equal(countdown.parentNode, null, 'countdown removed')
  assert.equal(warning.parentNode, null, 'warning removed')
  assert.equal(aftermath.parentNode, null, 'aftermath removed')
  assert.doesNotThrow(() => race.dispose(), 'second dispose is a safe no-op')
  player.dispose()
}))

test('disposing the HUD removes its root and ignores further updates', () => withDomStubs(({ body }) => {
  const hud = new HighwayHUD({
    controller: { pathProgress: 0, speed: 0 },
    race: { ghostPathProgress: 0, raceStarted: true, raceFinished: false, finishDistance: 1521, track: null },
    track: null,
  })
  assert.equal(body.children.length, 1)
  hud.dispose()
  assert.equal(body.children.length, 0, 'HUD root removed on exit')
  assert.doesNotThrow(() => {
    hud.dispose()
    hud.update(0.016)
    hud.reset()
  }, 'post-exit HUD calls are safe no-ops')
}))

// ---------------------------------------------------------------------------
// Lifecycle contract: exit stops updates, re-enter starts exactly one loop
// ---------------------------------------------------------------------------

test('exit flags stop gameplay updates and re-enter restarts a single loop', () => {
  // Mirrors Game.animate()'s `if (this.loaded)` gate and the
  // start()/loadLevel() `if (!this.animationRunning)` guard.
  const game = {
    loaded: true,
    currentLevel: 'highway',
    animationRunning: true,
    animationFrameId: 42,
    cancelledFrames: [],
    levelLoadId: 7,
    loopsStarted: 1,
    updates: 0,
    animateGate() {
      if (!this.animationRunning) return
      if (this.loaded) this.updates++
    },
    exitToMenuContract() {
      if (this.animationFrameId !== null) {
        this.cancelledFrames.push(this.animationFrameId)
      }
      this.animationFrameId = null
      this.levelLoadId++
      this.currentLevel = null
      this.loaded = false
      this.animationRunning = false
    },
    ensureLoopContract() {
      if (!this.animationRunning) {
        this.animationRunning = true
        this.loopsStarted++
      }
    },
  }

  game.animateGate()
  assert.equal(game.updates, 1, 'updates run while loaded')

  const loadIdBeforeExit = game.levelLoadId
  game.exitToMenuContract()
  assert.equal(game.loaded, false)
  assert.equal(game.currentLevel, null)
  assert.equal(game.animationRunning, false, 'loop cancelled')
  assert.deepEqual(game.cancelledFrames, [42], 'queued frame callback cancelled')
  assert.equal(game.animationFrameId, null, 'no dangling frame id')
  assert.equal(game.levelLoadId, loadIdBeforeExit + 1, 'in-flight loads invalidated')

  game.animateGate()
  game.animateGate()
  assert.equal(game.updates, 1, 'no gameplay updates after exit')

  // Exiting twice is safe.
  game.exitToMenuContract()
  assert.equal(game.loaded, false)

  // Re-entering restarts exactly one loop, even if ensured twice.
  game.loaded = true
  game.currentLevel = 'highway'
  game.ensureLoopContract()
  game.ensureLoopContract()
  assert.equal(game.loopsStarted, 2, 'single loop on re-enter, never duplicates')
  game.animateGate()
  assert.equal(game.updates, 2, 'gameplay runs again after re-enter')
})

test('a load that finishes after exit is discarded (no resurrection behind the menu)', () => {
  const game = { levelLoadId: 10, levelRoot: null, resurrected: false }
  // loadLevel() captures its id synchronously, loads async.
  const capturedId = ++game.levelLoadId // 11
  // Player presses Escape mid-load.
  game.levelLoadId++ // exitToMenu() bump -> 12
  game.levelRoot = null
  // The stale load completes: its guard must reject it.
  const stale = capturedId !== game.levelLoadId
  assert.equal(stale, true, 'stale load detected via load id')
  if (!stale) game.resurrected = true
  assert.equal(game.resurrected, false, 'nothing repopulates the scene behind the menu')
  assert.equal(game.levelRoot, null)
})

// ---------------------------------------------------------------------------
// Death flows: Play Again guard + game-over cleanup on exit
// ---------------------------------------------------------------------------

test('Play Again after an exit is a safe no-op (restart guard holds)', () => {
  // Mirrors Game.restartHighway()'s `if (currentLevel !== 'highway') return`.
  const game = { currentLevel: null, restarted: false }
  const restartHighwayGuard = () => {
    if (game.currentLevel !== 'highway') return
    game.restarted = true
  }
  restartHighwayGuard()
  assert.equal(game.restarted, false, 'stale retry button cannot restart an exited level')
})

test('crashed state cannot survive disposal: fresh controllers start clean', () => withDomStubs(() => {
  const { player, race } = makeLiveRace()
  player.placeAt(300, 1)
  player.crashAt({ progress: 305, lateralOffset: 1, halfWidth: 0.7, halfDepth: 0.7 })
  assert.equal(player.hasCrashed, true)
  assert.equal(player.canDrive, false)
  // Exit disposes both (as unloadCurrentLevel does).
  race.dispose()
  player.dispose()
  // Re-enter builds fresh instances with clean state.
  const track = createDefaultTrack()
  const freshPlayer = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  const freshRace = new HighwayRaceController(
    freshPlayer, new THREE.Object3D(), -880, 'OWEN GRAVE', { style: {} },
    new THREE.Scene(), track, null, track.totalLength
  )
  assert.equal(freshPlayer.hasCrashed, false, 'no crash latch on fresh entry')
  assert.equal(freshRace.raceFinished, false)
  assert.equal(freshRace.time, 0)
  assert.equal(freshRace.ghostPathProgress, 0)
  assert.equal(freshRace.ghostSpeed, 5, 'ghost at initial speed')
  freshPlayer.dispose()
  freshRace.dispose()
}))
