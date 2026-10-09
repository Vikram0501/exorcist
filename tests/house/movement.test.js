import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Player } from '../../src/core/player.js'

test('Level 1 uses its walking, sprinting, jumping, and collision settings', () => {
  const previousWindow = globalThis.window
  globalThis.window = { addEventListener() {} }
  const keys = new Set(['KeyW'])
  const input = { yaw: 0, pitch: 0, isDown: key => keys.has(key), consumePressed: () => false }
  let player
  try {
    player = new Player(new THREE.PerspectiveCamera(), input)
  } finally {
    globalThis.window = previousWindow
  }

  player.updateVelocity(2)
  assert.ok(Math.abs(player.velocity.z + 2.5) < 0.000001)
  keys.add('ShiftLeft')
  player.updateVelocity(2)
  assert.ok(Math.abs(player.velocity.z + 4) < 0.000001)
  keys.add('Space')
  player.isGrounded = true
  player.updateVelocity(0.05)
  assert.equal(player.velocity.y, 7.5)
  assert.equal(player.getCollisionCapsule().radius, 0.35)
})
