import test from 'node:test'
import assert from 'node:assert/strict'
import { HouseStory, HOUSE_EVIDENCE, RITE_QUESTIONS } from '../../src/levels/house/story.js'
import { buildHouseJournalEntries } from '../../src/levels/house/story-view.js'
import { HousePursuit } from '../../src/levels/house/pursuit.js'
import { createAuthoredGhost, createJumpScareGhost, darkenGraves } from '../../src/levels/house/story-assets.js'
import * as THREE from 'three'

function createStory() {
  const story = Object.create(HouseStory.prototype)
  Object.assign(story, {
    found: new Set(), phoneAnswered: false, riteStep: 0, released: false,
    complete: false, time: 0, onMessage() {},
    nextScareAllowedAt: 0,
    pursuit: new HousePursuit(),
    audio: { playCue() {}, playMelody() {}, setCalm() {}, stopPhoneRing() {} },
  })
  return story
}

test('the phone unlocks the new clues and all four must precede Daniel’s envelope', () => {
  const story = createStory()
  assert.equal(story.inspect('evelyn-diary'), false)
  assert.equal(story.answerRite(0), false)
  story.answerPhone()
  assert.equal(story.canInspect('evelyn-diary'), true)
  assert.equal(story.canInspect('music-box'), true)
  assert.equal(story.canInspect('daniel-confession'), false)
  story.inspect('evelyn-diary')
  assert.equal(story.canInspect('music-box'), true)
  story.inspect('music-box')
  assert.equal(story.pursuit.state, 'idle')
  story.inspect('annex-message')
  assert.equal(story.canInspect('daniel-confession'), false)
  story.inspect('caretaker-record')
  assert.equal(story.canInspect('daniel-confession'), true)
  story.inspect('daniel-confession')
  assert.equal(story.pendingLetterScare, true)
  assert.equal(story.canInspect('evelyn-grave'), false)
})

test('opening Daniel’s envelope leaves it in place and reveals the authored letter', () => {
  const story = createStory()
  story.answerPhone()
  for (const id of ['evelyn-diary', 'music-box', 'annex-message', 'caretaker-record']) story.inspect(id)
  story.confessionEnvelope = { visible: true }
  story.confessionLetter = { visible: false }
  assert.equal(story.inspect('daniel-confession'), true)
  assert.equal(story.confessionEnvelope.visible, true)
  assert.equal(story.confessionLetter.visible, true)
  assert.equal(story.pendingLetterScare, true)
})

test('inspecting the diary keeps its authored page hidden in the room', () => {
  const story = createStory()
  story.answerPhone()
  story.diaryEntry = { visible: false }
  assert.equal(story.inspect('evelyn-diary'), true)
  assert.equal(story.diaryEntry.visible, false)
  assert.equal(story.found.has('evelyn-diary'), true)
})

test('field notes cover every inspected clue, the call, grave, and completed case once', () => {
  const game = {
    inspectedEvidence: new Set(['newspaper', 'vale-frame', ...HOUSE_EVIDENCE.map(item => item.id)]),
    investigationItems: [
      { id: 'newspaper', title: 'Newspaper', storyNote: 'Clipping' },
      { id: 'vale-frame', title: 'Portrait', storyNote: 'Scratches' },
      { id: 'daniel-confession', title: 'Letter' },
      { id: 'daniel-confession', title: 'Letter' },
    ],
    bedroomPhoneAnswered: true,
    houseStory: { pursuit: { state: 'safe' }, released: true, complete: true },
  }
  const entries = buildHouseJournalEntries(game)
  assert.deepEqual(entries.map(item => item.id), [
    'newspaper', 'vale-frame', 'bedroom-phone', ...HOUSE_EVIDENCE.map(item => item.id),
    'evelyn-grave', 'completed-rite', 'closed-case',
  ])
  assert.ok(entries.every(item => item.storyNote))
  assert.equal(entries.filter(item => item.id === 'daniel-confession').length, 1)
})

test('the telephone waits three seconds after the family frame closes', () => {
  const story = createStory()
  assert.equal(story.isPhoneRinging(), false)
  story.schedulePhoneRing(3)
  story.time = 2.9
  assert.equal(story.isPhoneRinging(), false)
  story.time = 3
  assert.equal(story.isPhoneRinging(), true)
  story.answerPhone()
  assert.equal(story.isPhoneRinging(), false)
  assert.ok(story.nextScareAllowedAt >= story.time + 20)
  assert.ok(story.nextScareAllowedAt <= story.time + 30)
})

test('wrong rite answers scare the player and require a respawn', () => {
  const story = createStory()
  assert.equal(RITE_QUESTIONS.length, 5)
  story.answerPhone()
  for (const id of ['evelyn-diary', 'music-box', 'annex-message', 'caretaker-record', 'daniel-confession']) story.inspect(id)
  story.pursuit.state = 'safe'
  story.camera = new THREE.PerspectiveCamera()
  story.ghost = new THREE.Group()
  story.jumpScareGhost = new THREE.Group()
  story.time = 1
  story.nextScareAllowedAt = 100
  story.answerRite(RITE_QUESTIONS[0].answer)
  assert.equal(story.riteStep, 1)
  assert.equal(story.answerRite((RITE_QUESTIONS[1].answer + 1) % 3), false)
  assert.equal(story.riteStep, 0)
  assert.equal(story.pursuit.state, 'caught')
  assert.equal(story.failureReason, 'wrong-answer')
  assert.equal(story.jumpScareGhost.visible, true)
  assert.equal(story.answerRite(RITE_QUESTIONS[0].answer), false)
  story.pursuit.retry(new THREE.Vector3(0, 1, 0))
  story.pursuit.state = 'safe'
  story.jumpScareTime = 0
  for (const question of RITE_QUESTIONS) story.answerRite(question.answer)
  assert.equal(story.released, true)
  assert.match(story.objective(), /FRONT ROAD/)
  assert.equal(story.answerRite(0), false)
})

test('finishing the exorcism hides Elias and reveals Evelyn at the grave', () => {
  const story = createStory()
  story.answerPhone()
  for (const id of ['evelyn-diary', 'music-box', 'annex-message', 'caretaker-record', 'daniel-confession']) story.inspect(id)
  story.pursuit.state = 'safe'
  story.ghost = new THREE.Group()
  story.ghost.visible = true
  story.evelyn = new THREE.Group()
  story.evelyn.visible = false
  story.gravePosition = new THREE.Vector3(0, 0, 0)
  story.lights = []
  story.markers = []
  story.disturbance = 0
  story.nextRing = Infinity
  for (const question of RITE_QUESTIONS) story.answerRite(question.answer)
  assert.equal(story.ghost.visible, false)
  story.update(0.1, { position: new THREE.Vector3(1, 1, 0) }, false)
  assert.equal(story.evelyn.visible, true)
  story.update(0.1, { position: new THREE.Vector3(1, 1, 19) }, false)
  assert.equal(story.complete, true)
  assert.equal(story.evelyn.visible, false)
})

test('the chase follows the walked route, preserves its checkpoint, and ends at the grave', () => {
  const pursuit = new HousePursuit()
  const start = new THREE.Vector3(0, 1, 0)
  const grave = new THREE.Vector3(10, 0, 0)
  pursuit.start(start)
  pursuit.update(1, new THREE.Vector3(4, 1, 0), grave)
  assert.equal(pursuit.position.x, 0)
  pursuit.update(0.4, new THREE.Vector3(4, 1, 0), grave)
  pursuit.update(0.8, new THREE.Vector3(7, 1, 0), grave)
  assert.ok(pursuit.position.x > 0)
  pursuit.state = 'caught'
  assert.deepEqual(pursuit.retry().toArray(), start.toArray())
  assert.equal(pursuit.state, 'chasing')
  assert.equal(pursuit.update(0.1, new THREE.Vector3(10, 1, 0), grave), 'safe')
})

test('a caught player can restart the chase from the front of the house', () => {
  const story = createStory()
  const front = new THREE.Vector3(1, 2, 25)
  story.pursuit.start(new THREE.Vector3(2, 5, 3))
  story.pursuit.state = 'caught'
  let resetPosition = null
  let resetYaw = null
  const player = { input: { yaw: 0 }, reset(position, yaw) {
    resetPosition = position.clone()
    resetYaw = yaw
  } }
  assert.equal(story.retryPursuit(player, front, 0.4), true)
  assert.deepEqual(resetPosition.toArray(), front.toArray())
  assert.equal(resetYaw, 0.4)
  assert.equal(story.pursuit.state, 'chasing')
  assert.deepEqual(story.pursuit.checkpoint.toArray(), front.toArray())
})

test('being caught starts a scare before the respawn state', () => {
  const story = createStory()
  const camera = new THREE.PerspectiveCamera()
  const ghost = new THREE.Group()
  ghost.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.3), new THREE.MeshStandardMaterial()))
  Object.assign(story, {
    camera, ghost, jumpScareGhost: createJumpScareGhost(ghost, camera),
    jumpScareTime: 0, lights: [], markers: [], disturbance: 0,
    nextRing: Infinity, gravePosition: new THREE.Vector3(20, 0, 0),
  })
  story.found.add('daniel-confession')
  story.pursuit.start(new THREE.Vector3(0, 1, 0))
  story.pursuit.grace = 0
  story.pursuit.position.set(0, 1, 0)
  story.audio.playJumpScare = () => {}
  story.update(0.1, { position: new THREE.Vector3(0, 1, 0) }, false)
  assert.equal(story.pursuit.state, 'caught')
  assert.equal(story.failureReason, 'caught')
  assert.ok(story.jumpScareTime > 0)
  assert.equal(story.jumpScareGhost.visible, true)
})

test('the annex clue can be found first, but the letter waits for the kitchen record too', () => {
  const story = createStory()
  story.answerPhone()
  story.inspect('annex-message')
  assert.equal(story.inspect('daniel-confession'), false)
  assert.match(story.objective(), /DIARY/)
  story.inspect('evelyn-diary')
  assert.match(story.objective(), /MUSIC BOX/)
  assert.equal(story.inspect('evelyn-diary'), false)
  assert.equal(story.found.size, 2)
  story.inspect('music-box')
  assert.match(story.objective(), /SERVICE RECORD/)
  assert.equal(story.inspect('daniel-confession'), false)
  story.inspect('caretaker-record')
  assert.match(story.objective(), /ENVELOPE/)
  story.inspect('daniel-confession')
  assert.match(story.objective(), /GRAVE/)
})

test('closing the confession triggers a brief close-up scare before the chase', () => {
  const story = createStory()
  const camera = new THREE.PerspectiveCamera()
  const ghost = new THREE.Group()
  ghost.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.2), new THREE.MeshStandardMaterial()))
  let played = 0
  Object.assign(story, {
    camera, ghost, gravePosition: new THREE.Vector3(10, 0, 0),
    lights: [], markers: [], disturbance: 0,
    nextRing: Infinity, jumpScareTime: 0, jumpScareGhost: createJumpScareGhost(ghost, camera),
    ground: ([x, , z]) => new THREE.Vector3(x, 0, z),
  })
  story.audio.playJumpScare = () => { played++ }
  story.audio.isInside = () => false
  story.answerPhone()
  for (const id of ['evelyn-diary', 'music-box', 'annex-message', 'caretaker-record', 'daniel-confession']) story.inspect(id)
  assert.equal(story.triggerLetterScare(), true)
  assert.equal(played, 1)
  assert.equal(ghost.visible, false)
  assert.equal(story.jumpScareGhost.visible, true)
  assert.equal(story.jumpScareGhost.parent, camera)
  assert.ok(Math.abs(story.jumpScareGhost.position.z) < 0.5)
  assert.equal(story.pursuit.state, 'idle')
  const player = { position: new THREE.Vector3(0, 1, 0) }
  story.updateJumpScare(0.5, player)
  assert.equal(story.jumpScareGhost.visible, true)
  story.updateJumpScare(0.7, player)
  assert.equal(story.pursuit.state, 'chasing')
  assert.equal(ghost.visible, false)
  assert.equal(story.jumpScareGhost.visible, false)
})

test('the supplied ghost stays opaque at its shorter height during the chase', () => {
  const source = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 2, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x695c56 }),
  )
  const ghost = createAuthoredGhost(source)
  const mesh = ghost.getObjectByProperty('isMesh', true)
  const height = new THREE.Box3().setFromObject(ghost).getSize(new THREE.Vector3()).y
  assert.ok(Math.abs(height - 1.35) < 0.001)
  assert.equal(mesh.material.opacity, 1)
  assert.equal(mesh.material.transparent, false)

  const story = createStory()
  Object.assign(story, {
    ghost, gravePosition: new THREE.Vector3(10, 0, 0),
    lights: [], markers: [], disturbance: 0,
    nextRing: Infinity,
  })
  story.found.add('daniel-confession')
  story.pursuit.state = 'chasing'
  story.update(0.1, { position: new THREE.Vector3(0, 1, 0) }, false)
  assert.equal(mesh.material.opacity, 1)
  assert.equal(mesh.material.transparent, false)
})

test('ordinary house appearances play the loud close-up scare and do not start the chase', () => {
  const story = createStory()
  const camera = new THREE.PerspectiveCamera()
  const ghost = new THREE.Group()
  ghost.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.2), new THREE.MeshStandardMaterial()))
  Object.assign(story, {
    camera, ghost, lights: [], markers: [], disturbance: 0,
    nextApparitionAt: 0, nextRing: Infinity,
    jumpScareTime: 0, jumpScareGhost: createJumpScareGhost(ghost, camera),
    ground: ([x, , z]) => new THREE.Vector3(x, 0, z),
  })
  story.audio.isInside = () => true
  let scares = 0
  story.audio.playJumpScare = () => { scares++ }
  story.phoneAnswered = true
  const player = { position: new THREE.Vector3(0, 1, 0) }
  story.update(1, player, false)
  assert.equal(scares, 1)
  assert.equal(story.jumpScareGhost.visible, true)
  assert.equal(ghost.visible, false)
  story.updateJumpScare(1, player)
  assert.equal(story.jumpScareGhost.visible, false)
  assert.equal(story.pursuit.state, 'idle')
  story.update(21, player, false)
  assert.equal(scares, 1, 'the previous rapid repeat interval must remain quiet')
  story.update(40, player, false)
  assert.equal(scares, 2)
  assert.equal(story.jumpScareGhost.visible, true)
})

test('evidence scares wait for inspection to close and only play once', () => {
  const story = createStory()
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100)
  const ghost = createAuthoredGhost(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.3), new THREE.MeshStandardMaterial()))
  Object.assign(story, { camera, ghost, jumpScareTime: 0, jumpScareGhost: createJumpScareGhost(ghost, camera) })
  let scares = 0
  story.audio.playJumpScare = () => { scares++ }
  story.answerPhone()
  story.time = story.nextScareAllowedAt
  story.inspect('evelyn-diary')
  assert.equal(scares, 0)
  assert.equal(story.finishInspection('evelyn-diary'), true)
  assert.equal(scares, 1)
  assert.equal(story.finishInspection('evelyn-diary'), false)
  story.jumpScareEndsAt = performance.now() - 1
  story.updateJumpScare(0.001, {})
  assert.equal(story.jumpScareGhost.visible, false, 'slow frames must not stretch the scare duration')
})

test('nearby clue scares share the cooldown while the confession can still begin the chase', () => {
  const story = createStory()
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100)
  const ghost = createAuthoredGhost(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.3), new THREE.MeshStandardMaterial()))
  Object.assign(story, { camera, ghost, phoneAnswered: true, jumpScareTime: 0, jumpScareGhost: createJumpScareGhost(ghost, camera) })
  let scares = 0
  story.audio.playJumpScare = () => { scares++ }
  const player = { position: new THREE.Vector3(0, 1, 0) }
  assert.equal(story.startHouseApparition(), true)
  story.updateJumpScare(1, player)
  for (const id of ['evelyn-diary', 'annex-message']) {
    story.inspect(id)
    assert.equal(story.finishInspection(id), false)
  }
  assert.equal(scares, 1)
  story.inspect('music-box')
  story.inspect('caretaker-record')
  story.inspect('daniel-confession')
  assert.equal(story.finishInspection('daniel-confession'), true)
  story.updateJumpScare(1, player)
  assert.equal(scares, 2)
  assert.equal(story.pursuit.state, 'chasing')
})

test('the close-up face stays centred when the player moves and looks up', () => {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 100)
  const ghost = createAuthoredGhost(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.3), new THREE.MeshStandardMaterial()))
  const closeup = createJumpScareGhost(ghost, camera)
  const size = new THREE.Box3().setFromObject(ghost).getSize(new THREE.Vector3())
  const face = new THREE.Vector3(0, size.y * 0.91, size.z / 2)
  for (const pitch of [-0.8, 0, 0.8]) {
    camera.position.set(12, 5, -8)
    camera.rotation.set(pitch, 1.3, 0, 'YXZ')
    camera.updateMatrixWorld(true)
    const projected = closeup.children[0].localToWorld(face.clone()).project(camera)
    assert.ok(Math.abs(projected.x) < 0.001)
    assert.ok(Math.abs(projected.y) < 0.001)
    assert.ok(projected.z > -1 && projected.z < 1)
  }
})

test('both supplied graves are darker without changing shared house materials', () => {
  const model = new THREE.Group()
  const shared = new THREE.MeshStandardMaterial({ color: 0xb9ada1, roughness: 0.5 })
  const houseMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared)
  model.add(houseMesh)
  const graves = ['grave', 'grave001'].map(name => {
    const group = new THREE.Group()
    group.name = name
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared)
    group.add(mesh)
    model.add(group)
    return mesh
  })
  const original = shared.color.clone()
  darkenGraves(model)
  for (const grave of graves) {
    assert.ok(grave.material.color.r < original.r * 0.4)
    assert.ok(grave.material.roughness >= 0.92)
    assert.notEqual(grave.material, shared)
  }
  assert.ok(houseMesh.material.color.equals(original))
})
