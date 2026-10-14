import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Game } from '../../src/core/game.js'

test('the exorcism can start by standing beside the grave even when the ray hits the soil', () => {
  const game = Object.create(Game.prototype)
  const grave = { id: 'evelyn-grave', story: true }
  game.currentLevel = 'house'
  game.model = new THREE.Group()
  game.input = { isLocked: true }
  game.player = { position: new THREE.Vector3(1.2, 1.5, 0.5) }
  game.houseStory = {
    canInspect: id => id === 'evelyn-grave',
    gravePosition: new THREE.Vector3(0, 0, 0),
    root: new THREE.Group(),
  }
  game.investigationItems = [grave]
  game.setInteractionRay = () => {}
  game.raycaster = { intersectObjects: () => [] }
  assert.equal(game.getLookedAtInvestigationItem(), grave)

  game.player.position.x = 4
  assert.equal(game.getLookedAtInvestigationItem(), null)
})
