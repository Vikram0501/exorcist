import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Player } from '../../src/core/player.js'

test('switching levels preserves house movement and the newer train tuning', () => {
  const keys = new Set(['KeyW'])
  const player = Object.assign(Object.create(Player.prototype), {
    input: { yaw: 0, isDown: key => keys.has(key), consumePressed: () => false },
    position: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(),
    isGrounded: true,
    flying: false,
  })
  for (const [level, walk, sprint, jump, radius] of [
    ['house', 2.5, 4, 7.5, 0.35],
    ['train', 3, 5, 5, 0.2],
    ['house', 2.5, 4, 7.5, 0.35],
  ]) {
    player.configureForLevel(level)
    player.velocity.set(0, 0, 0)
    keys.clear()
    keys.add('KeyW')
    player.updateVelocity(2)
    assert.ok(Math.abs(player.velocity.z + walk) < 0.000001)
    keys.add('ShiftLeft')
    player.updateVelocity(2)
    assert.ok(Math.abs(player.velocity.z + sprint) < 0.000001)
    keys.add('Space')
    player.isGrounded = true
    player.updateVelocity(0.05)
    assert.equal(player.velocity.y, jump)
    assert.equal(player.getCollisionCapsule().radius, radius)
  }
})
