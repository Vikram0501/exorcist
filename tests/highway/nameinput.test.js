import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  HighwayCarController,
  isTypingTarget,
} from '../../src/levels/highway/car.js'
import {
  isGhostNameCorrect,
  normalizeGhostNameAnswer,
} from '../../src/core/game.js'

// Captures window listeners so synthetic keyboard events can be fired.
function captureWindow() {
  const handlers = { keydown: [], keyup: [] }
  const originalWindow = globalThis.window
  globalThis.window = {
    addEventListener: (type, handler) => {
      handlers[type].push(handler)
    },
    removeEventListener: (type, handler) => {
      handlers[type] = handlers[type].filter(h => h !== handler)
    },
  }
  return {
    handlers,
    restore() { globalThis.window = originalWindow },
  }
}

function straightRoad() {
  return {
    roadPath: [
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -940),
    ],
    arcLengths: [0, 950],
  }
}

function makeController(win) {
  const { roadPath, arcLengths } = straightRoad()
  const controller = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(),
    roadPath, arcLengths
  )
  controller.setDrivingEnabled(true)
  void win
  return controller
}

function keyEvent(code, target, prevented) {
  return {
    code,
    target,
    preventDefault: () => { prevented.called = true },
  }
}

const GAME_TARGET = { tagName: 'CANVAS', isContentEditable: false }
const NAME_TARGET = { tagName: 'INPUT', isContentEditable: false }

// 1. Space triggers drift during active racing.
test('space triggers drift during active racing', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    const prevented = { called: false }
    win.handlers.keydown[0](keyEvent('Space', GAME_TARGET, prevented))
    assert.equal(c.keys['Space'], true)
    c.update(0.016)
    c.dispose()
  } finally {
    win.restore()
  }
})

// 2. Space default is prevented during racing (no page scroll).
test('space default is prevented during racing', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    const prevented = { called: false }
    win.handlers.keydown[0](keyEvent('Space', GAME_TARGET, prevented))
    assert.equal(prevented.called, true)
    c.dispose()
  } finally {
    win.restore()
  }
})

// 3. Space typed into the ghost-name input is NOT intercepted.
test('space in the name input is not intercepted', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    const prevented = { called: false }
    win.handlers.keydown[0](keyEvent('Space', NAME_TARGET, prevented))
    assert.ok(!c.keys['Space'], 'drift state untouched by typing')
    assert.equal(prevented.called, false, 'input keeps its Space')
    c.dispose()
  } finally {
    win.restore()
  }
})

// 4. "owen grave" keeps its interior space through normalization.
test('owen grave remains owen grave', () => {
  assert.equal(normalizeGhostNameAnswer('owen grave'), 'OWEN GRAVE')
  assert.ok(!normalizeGhostNameAnswer('owen grave').includes('OWENGRAVE'))
})

// 5. Multi-word ghost names can be submitted successfully.
test('multi-word ghost names match', () => {
  assert.ok(isGhostNameCorrect('owen grave', 'OWEN GRAVE'))
  assert.ok(isGhostNameCorrect('Owen Grave', 'OWEN GRAVE'))
  assert.ok(!isGhostNameCorrect('owengrave', 'OWEN GRAVE'))
})

// 6. Case-insensitive comparison still behaves as intended.
test('comparison is case-insensitive', () => {
  assert.ok(isGhostNameCorrect('OWEN GRAVE', 'OWEN GRAVE'))
  assert.ok(isGhostNameCorrect('owen grave', 'OWEN GRAVE'))
  assert.ok(isGhostNameCorrect('OwEn GrAvE', 'OWEN GRAVE'))
  assert.ok(!isGhostNameCorrect('MARA VOSS', 'OWEN GRAVE'))
})

// 7. Leading/trailing whitespace handling remains sensible.
test('outer whitespace is forgiven, wrong names still fail', () => {
  assert.ok(isGhostNameCorrect('  owen grave  ', 'OWEN GRAVE'))
  assert.ok(isGhostNameCorrect('owen   grave', 'OWEN GRAVE'))
  assert.ok(!isGhostNameCorrect('', 'OWEN GRAVE'))
  assert.ok(!isGhostNameCorrect('   ', 'OWEN GRAVE'))
})

// 8. Typing in a normal INPUT does not control the car.
test('typing in an input does not control the car', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    const target = { tagName: 'INPUT', isContentEditable: false }
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
      win.handlers.keydown[0](keyEvent(code, target, { called: false }))
    }
    assert.deepEqual(c.keys, {})
    c.dispose()
  } finally {
    win.restore()
  }
})

// 9. Typing in a TEXTAREA does not control the car.
test('typing in a textarea does not control the car', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    const target = { tagName: 'TEXTAREA', isContentEditable: false }
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
      win.handlers.keydown[0](keyEvent(code, target, { called: false }))
    }
    assert.deepEqual(c.keys, {})
    c.dispose()
  } finally {
    win.restore()
  }
})

// 10. contenteditable typing is not intercepted.
test('contenteditable typing is not intercepted', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    assert.ok(isTypingTarget({ tagName: 'DIV', isContentEditable: true }))
    const prevented = { called: false }
    win.handlers.keydown[0](keyEvent(
      'Space', { tagName: 'DIV', isContentEditable: true }, prevented
    ))
    assert.ok(!c.keys['Space'])
    assert.equal(prevented.called, false)
    c.dispose()
  } finally {
    win.restore()
  }
})

// 11. W/A/S/D typed into the name field do not drive the car.
test('wasd typed into the name field do not drive', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      win.handlers.keydown[0](keyEvent(code, NAME_TARGET, { called: false }))
    }
    c.readInputs()
    assert.equal(c.steerInput, 0)
    assert.equal(c.throttleInput, false)
    assert.equal(c.brakeInput, false)
    assert.equal(c.driftInput, false)
    c.dispose()
  } finally {
    win.restore()
  }
})

// 12. Returning to racing restores gameplay controls.
test('gameplay controls work again after typing', () => {
  const win = captureWindow()
  try {
    const c = makeController(win)
    // Type first (ignored), then drive (honoured).
    win.handlers.keydown[0](keyEvent('Space', NAME_TARGET, { called: false }))
    assert.ok(!c.keys['Space'])
    const prevented = { called: false }
    win.handlers.keydown[0](keyEvent('Space', GAME_TARGET, prevented))
    assert.equal(c.keys['Space'], true)
    assert.equal(prevented.called, true)
    // Releases always clear, even from inside a text field, so keys
    // held across a focus change cannot stick on.
    win.handlers.keydown[0](keyEvent('KeyW', GAME_TARGET, { called: false }))
    win.handlers.keyup[0](keyEvent('KeyW', NAME_TARGET, { called: false }))
    assert.ok(!c.keys['KeyW'])
    c.dispose()
  } finally {
    win.restore()
  }
})
