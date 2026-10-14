import test from 'node:test'
import assert from 'node:assert/strict'
import { Input } from '../../src/core/input.js'

test('returning from inspection keeps the camera aimed where it was', () => {
  const oldWindow = globalThis.window
  const oldDocument = globalThis.document
  const listeners = new Map()
  const dom = { requestPointerLock: () => Promise.resolve() }
  globalThis.window = { addEventListener() {} }
  globalThis.document = {
    pointerLockElement: null,
    addEventListener(type, callback) { listeners.set(type, callback) },
  }
  try {
    const input = new Input(dom)
    input.yaw = 0.4
    input.pitch = -0.2
    input.lock({ preserveView: true })
    globalThis.document.pointerLockElement = dom
    listeners.get('pointerlockchange')()
    listeners.get('mousemove')({ movementX: 300, movementY: 150 })
    assert.equal(input.yaw, 0.4)
    assert.equal(input.pitch, -0.2)
    input.suppressMouseUntil = 0
    listeners.get('mousemove')({ movementX: 300, movementY: 150 })
    listeners.get('mousemove')({ movementX: 300, movementY: 150 })
    listeners.get('mousemove')({ movementX: 10, movementY: -10 })
    assert.equal(input.yaw, 0.38)
    assert.ok(Math.abs(input.pitch + 0.18) < 1e-10)
  } finally {
    globalThis.window = oldWindow
    globalThis.document = oldDocument
  }
})
