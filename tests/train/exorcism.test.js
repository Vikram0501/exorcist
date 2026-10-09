import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { RITE_SEAL, createCluePlan } from '../../src/levels/train/story-data.js'
import { TrainStory, RITE_HOLD_SECONDS } from '../../src/levels/train/story.js'
import { createExorcismChamber } from '../../src/levels/train/exorcism.js'
import { createTrainCollision } from '../../src/levels/train/collision.js'
import { trainFloorAt } from '../../src/levels/train/zombie.js'
import { loadTrainGeometry } from './model-fixture.js'

function seededRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function planItems(plan) {
  const items = []
  for (const letter of plan.letters) {
    items.push({
      id: letter.id,
      title: letter.title,
      foundAt: letter.foundAt,
      storyNote: 'mark',
      riteNote: 'mark note',
      story: true,
      kind: 'letter',
      slot: letter.slot,
      char: letter.char,
      total: plan.letters.length,
    })
  }
  for (const residue of plan.residue) {
    items.push({
      id: residue.id,
      title: residue.title,
      foundAt: residue.foundAt,
      storyNote: residue.storyNote,
      riteNote: residue.hintNote,
      story: true,
      kind: 'residue',
      slot: residue.slot,
    })
  }
  items.push({
    id: RITE_SEAL.id,
    title: RITE_SEAL.title,
    foundAt: RITE_SEAL.foundAt,
    storyNote: RITE_SEAL.storyNote,
    riteNote: RITE_SEAL.riteNote,
    story: true,
    kind: 'rite',
  })
  return items
}

function createStory(seed = 7) {
  const plan = createCluePlan(seededRng(seed))
  const messages = []
  const story = new TrainStory({
    plan,
    items: planItems(plan),
    nameBoard: { revealLetter: () => {} },
    onMessage: (text) => messages.push(text),
    rng: seededRng(seed + 1),
  })
  return { story, plan, messages }
}

function sealOf(story) {
  return story.items.find((item) => item.kind === 'rite')
}

function learnName(story) {
  for (const item of story.items) {
    if (item.kind === 'letter') story.read(item)
  }
}

test('the ashen seal sits on the deck of the burnt carriage where a player can stand', async () => {
  const model = await loadTrainGeometry('01')
  const group = new THREE.Group()
  group.add(model)
  group.updateWorldMatrix(true, true)
  const carriage = { group, model, bounds: new THREE.Box3().setFromObject(model) }
  const colliders = await createTrainCollision([{ model }])
  const chamber = createExorcismChamber({ carriages: [carriage], colliders })
  group.updateWorldMatrix(true, true)

  assert.equal(chamber.item.id, RITE_SEAL.id)
  assert.equal(chamber.item.kind, 'rite')
  assert.equal(chamber.item.story, true)
  assert.equal(chamber.item.object, chamber.root)
  assert.equal(chamber.root.parent, group, 'the chamber belongs to its carriage')

  const position = chamber.position
  assert.ok(position.x > 1.2 && position.x < 4.2, 'the seal stays inside the walking lane')
  assert.ok(position.z > carriage.bounds.min.z && position.z < carriage.bounds.max.z)

  const deck = trainFloorAt(colliders, position.x, position.z)
  assert.ok(deck > 0.3 && deck < 0.7, `the seal lies on the 0.4 deck, got ${deck}`)

  const standing = (x, z) => !colliders[0].world.capsuleIntersect(new Capsule(
    new THREE.Vector3(x, 0.72, z),
    new THREE.Vector3(x, 1.18, z),
    0.2,
  ))
  assert.ok(standing(position.x, position.z), 'the ring leaves the aisle walkable')

  const origin = new THREE.Vector3(position.x, position.y + 0.9, position.z - 1.2)
  assert.ok(standing(origin.x, origin.z), 'there is standing room before the ring')
  const direction = position.clone().sub(origin).normalize()
  const hits = new THREE.Raycaster(origin, direction).intersectObjects([model, chamber.root], true)
  assert.ok(hits.length > 0, 'the seal is seen from eye height')
  assert.equal(hits[0].object.name, 'train-rite-seal', 'the seal is the first thing the eye meets')

  const lights = chamber.root.children.filter((child) => child.isPointLight)
  assert.equal(lights.length, 1, 'the chamber carries exactly one glow')

  chamber.dispose()
  assert.equal(group.children.includes(chamber.root), false, 'the chamber leaves its carriage')
})

test('the rite stays shut until every mark of the name is known', () => {
  const { story } = createStory()
  const seal = sealOf(story)

  assert.equal(story.nameComplete, false)
  assert.equal(story.canBeginRite(), false)
  assert.match(story.prompt(seal), /not whole/)
  assert.equal(story.hold(RITE_HOLD_SECONDS, seal), false, 'holding E cannot start an unfinished name')
  assert.equal(story.progress, 0)

  learnName(story)
  assert.equal(story.nameComplete, true)
  assert.equal(story.canBeginRite(), true)
  assert.equal(story.prompt(seal), 'Hold E · Speak the name')
  assert.equal(story.hold(RITE_HOLD_SECONDS - 0.01, seal), false)
  assert.ok(story.progress > 0.9)
  assert.equal(story.hold(0.02, seal), true, 'the hold opens the rite')
  assert.equal(story.progress, 0)
})

test('a wrong mark breaks the rite and a whole name can be spoken', () => {
  const { story, plan } = createStory()
  learnName(story)

  const wrong = story.answer.find((char, index) => index > 0)
  assert.equal(story.pickMark(wrong), 'wrong')
  assert.equal(story.failureReason, 'wrong-mark')
  assert.deepEqual(story.assembled, [], 'the broken ring forgets the order')

  for (const char of story.answer) assert.equal(story.pickMark(char), true)
  assert.deepEqual(story.assembled, story.answer)

  assert.equal(story.speakName(), true)
  assert.equal(story.released, true)
  assert.equal(story.canBeginRite(), false)
  assert.match(story.objective(), /LEAVE THE BURNT CARRIAGE/)
  assert.match(story.prompt(sealOf(story)), /leave the burnt carriage/)
  assert.equal(story.speakName(), false, 'the name is spoken only once')

  const ids = story.journalEntries().map((entry) => entry.id)
  assert.ok(ids.includes('the-name-spoken'))
  assert.ok(!ids.includes('the-run-ends'))
  assert.equal(story.answer.length, plan.letters.length)
})

test('the run closes once the player steps back out of the burnt carriage', () => {
  const { story } = createStory()
  learnName(story)
  for (const char of story.answer) story.pickMark(char)
  story.speakName()

  story.exitZ = 8.5
  story.update(0.1, { position: { z: 19 } })
  assert.equal(story.complete, false, 'still inside the burning carriage')

  story.update(0.1, { position: { z: 8.4 } })
  assert.equal(story.complete, true)
  assert.equal(story.endingTime, story.time)
  assert.match(story.objective(), /CASE CLOSED/)

  const ids = story.journalEntries().map((entry) => entry.id)
  assert.ok(ids.includes('the-run-ends'))
  assert.equal(story.failureReason, null)
})

test('the rite hold uses its own charge and never reads the seal as a clue', () => {
  const { story } = createStory()
  learnName(story)
  const seal = sealOf(story)
  const residue = story.items.find((item) => item.kind === 'residue')

  assert.equal(story.read(seal), false)
  assert.equal(story.found.has(seal.id), false)
  assert.equal(story.canInspect(seal.id), true)

  assert.equal(story.hold(1.2, residue), true, 'clues still fill in 1.2 seconds')
  story.releaseHold()
  assert.equal(story.hold(1.2, seal), false, 'the rite needs its longer charge')
  assert.equal(story.hold(RITE_HOLD_SECONDS - 1.2, seal), true)
})
