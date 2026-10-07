import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Player } from '../../src/core/player.js'

function makePlayer(keys) {
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener() {} }
  try {
    const input = { yaw: 0, pitch: 0, isDown: code => keys.has(code) }
    return new Player(new THREE.PerspectiveCamera(), input)
  } finally {
    globalThis.window = previousWindow
  }
}

test('crouching lowers the eye height, keeps the feet planted, and slows the walk', () => {
  const keys = new Set(['KeyW'])
  const player = makePlayer(keys)

  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.ok(Math.abs(player.velocity.z + 3) < 0.000001)

  const feet = player.position.y - player.eyeHeight

  keys.add('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, true)
  assert.equal(player.eyeHeight, 0.55)
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - feet) < 0.000001, 'crouching does not lift the feet')
  assert.ok(Math.abs(player.velocity.z + 3 * 0.45) < 0.000001, 'a crouched player moves slower')

  const capsule = player.getCollisionCapsule()
  assert.ok(capsule.end.y < feet + 1, 'the collision capsule shortens while crouched')

  keys.delete('KeyC')
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.ok(Math.abs((player.position.y - player.eyeHeight) - feet) < 0.000001, 'standing restores the same stance')
})

test('flying overrides the crouch key so C keeps descending', () => {
  const keys = new Set(['KeyC'])
  const player = makePlayer(keys)

  player.updateVelocity(2)
  assert.equal(player.crouching, true)

  player.flying = true
  player.updateVelocity(2)
  assert.equal(player.crouching, false)
  assert.ok(player.velocity.y < 0, 'C still flies down')
})

test('reset clears the crouch stance', () => {
  const keys = new Set(['KeyC'])
  const player = makePlayer(keys)
  player.updateVelocity(2)
  assert.equal(player.crouching, true)

  player.reset(new THREE.Vector3(0, 2, 0), Math.PI)
  assert.equal(player.crouching, false)
  assert.equal(player.eyeHeight, 1)
  assert.equal(player.position.y, 2)
})
