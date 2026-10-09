import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Player } from '../../src/core/player.js'

function makeInput() {
  const down = new Set()
  const pressed = new Set()
  return {
    yaw: 0,
    pitch: 0,
    isDown: code => down.has(code),
    consumePressed: code => pressed.delete(code),
    press(code) {
      if (!down.has(code)) pressed.add(code)
      down.add(code)
    },
    release(code) { down.delete(code) },
  }
}

function makePlayer(input) {
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener() {} }
  try {
    return new Player(new THREE.PerspectiveCamera(), input)
  } finally {
    globalThis.window = previousWindow
  }
}

test('C toggles crouch, keeps the feet planted, and slows the walk', () => {
  const input = makeInput()
  const player = makePlayer(input)
  input.press('KeyW')
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.ok(Math.abs(player.velocity.z + 2.5) < 0.000001)
  const feet = player.position.y - player.eyeHeight

  input.press('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, true)
  assert.equal(player.eyeHeight, 0.55)
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - feet) < 0.000001)
  assert.ok(Math.abs(player.velocity.z + 2.5 * 0.45) < 0.000001)
  assert.ok(player.getCollisionCapsule().end.y < feet + 1)

  input.release('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, true, 'releasing C keeps the stance')
  input.press('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - feet) < 0.000001)
})

test('C remains the fly-down key while flying', () => {
  const input = makeInput()
  const player = makePlayer(input)
  input.press('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, true)
  player.flying = true
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.ok(player.velocity.y < 0)
})

test('reset clears the crouch stance', () => {
  const input = makeInput()
  const player = makePlayer(input)
  input.press('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, true)
  player.reset(new THREE.Vector3(0, 2, 0), Math.PI)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.equal(player.position.y, 2)
})
