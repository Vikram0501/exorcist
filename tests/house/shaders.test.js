import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createHouseShaderEffects } from '../../src/levels/house/shaders.js'

test('house effects follow the phone and chase without adding a grave shader', () => {
  const level = new THREE.Group()
  const model = new THREE.Group()
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.25), new THREE.MeshBasicMaterial())
  phone.name = 'Phone'
  phone.position.set(2, 1, -3)
  model.add(phone)
  level.add(model)
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(2, 2, 0)
  camera.updateMatrixWorld(true)
  let ringing = false
  const story = {
    ghost: new THREE.Group(),
    gravePosition: new THREE.Vector3(8, 0, -12),
    ground: ([x, , z]) => new THREE.Vector3(x, 0.1, z),
    isPhoneRinging: () => ringing,
    pursuit: { state: 'idle' },
    phoneAnswered: false,
    riteStep: 0,
    released: false,
  }
  const ghostBody = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  story.ghost.add(ghostBody)
  level.add(story.ghost)

  const effects = createHouseShaderEffects({ level, model, story, camera })
  assert.ok(effects.phone?.isGroup)
  assert.ok(effects.ghost?.isGroup)
  assert.equal(effects.ghost.parent, story.ghost)
  assert.equal(level.getObjectByName('evelyn-grave-illumination'), undefined)
  assert.equal(level.getObjectByName('evelyn-grave-ground-glow'), undefined)
  assert.equal(effects.phone.visible, false)
  assert.equal(effects.phone.userData.arcs.length, 3)
  assert.equal(effects.phone.children.some(child => child.isLight), false)
  assert.ok(effects.phone.userData.arcs.every(arc => arc.geometry.type === 'RingGeometry'))
  assert.equal(effects.ghost.children.length, 3)
  assert.ok(effects.ghost.children.every(wisp =>
    wisp.geometry.type === 'PlaneGeometry' && wisp.material.isShaderMaterial &&
    wisp.material.transparent && wisp.material.blending === THREE.NormalBlending))
  assert.ok(ghostBody.material.color.r < 0.2)
  assert.equal(ghostBody.material.opacity, 1)
  assert.equal(ghostBody.material.transparent, false)

  ringing = true
  effects.update(0.2)
  assert.equal(effects.phone.visible, true)
  assert.ok(effects.phone.userData.arcs.some(arc => arc.material.opacity > 0))
  assert.equal(effects.ghost.visible, false)

  story.ghost.visible = true
  story.pursuit.state = 'chasing'
  story.phoneAnswered = true
  story.riteStep = 2
  effects.update(0.2)
  assert.equal(effects.ghost.visible, true)
  const before = effects.ghost.getWorldPosition(new THREE.Vector3())
  story.ghost.position.x += 2
  effects.update(0.1)
  const after = effects.ghost.getWorldPosition(new THREE.Vector3())
  assert.ok(Math.abs(after.x - before.x - 2) < 0.001)
  assert.ok(effects.ghost.children.every(wisp => wisp.material.uniforms.uTime.value > 0))
  assert.equal(new THREE.Raycaster().intersectObject(effects.ghost).length, 0)

  ringing = false
  story.released = true
  effects.update(0.2)
  assert.equal(effects.phone.visible, false)

  let disposed = 0
  for (const wisp of effects.ghost.children) wisp.material.addEventListener('dispose', () => disposed++)
  for (const arc of effects.phone.userData.arcs) arc.material.addEventListener('dispose', () => disposed++)
  effects.dispose()
  assert.equal(disposed, 6)
  assert.ok([effects.phone, effects.ghost].every(object => object.parent === null))
})
