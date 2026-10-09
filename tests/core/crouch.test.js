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
    release(code) {
      down.delete(code)
    },
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

test('crouching toggles with Ctrl, keeps the feet planted, and slows the walk', () => {
  const input = makeInput()
  const player = makePlayer(input)

  input.press('KeyW')
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.ok(Math.abs(player.velocity.z + 3) < 0.000001)

  const feet = player.position.y - player.eyeHeight

  input.press('ControlLeft')
  player.updateVelocity(2)
  assert.equal(player.crouching, true)
  assert.equal(player.eyeHeight, 0.55)
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - feet) < 0.000001, 'crouching does not lift the feet')
  assert.ok(Math.abs(player.velocity.z + 3 * 0.45) < 0.000001, 'a crouched player moves slower')

  const capsule = player.getCollisionCapsule()
  assert.ok(capsule.end.y < feet + 1, 'the collision capsule shortens while crouched')

  input.release('ControlLeft')
  player.updateVelocity(2)
  assert.equal(player.crouching, true, 'releasing Ctrl keeps the stance, it is a toggle')

  input.press('ControlLeft')
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - feet) < 0.000001, 'standing restores the same stance')
})

test('C no longer crouches and still descends while flying', () => {
  const input = makeInput()
  const player = makePlayer(input)

  player.flying = true
  input.press('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, false, 'C is free for fly-down')

  input.press('ControlLeft')
  player.updateVelocity(2)
  assert.equal(player.crouching, true, 'the crouch toggle works while flying')
  assert.ok(player.velocity.y < 0, 'C still flies down')
})

test('reset clears the crouch stance', () => {
  const input = makeInput()
  const player = makePlayer(input)
  input.press('ControlLeft')
  player.updateVelocity(2)
  assert.equal(player.crouching, true)

  player.reset(new THREE.Vector3(0, 2, 0), Math.PI)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.equal(player.position.y, 2)
})
