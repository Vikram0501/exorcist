import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import {
  GHOST_PROFILES,
  LETTER_ANCHORS,
  RESIDUE_ANCHORS,
  createCluePlan,
  kanaLetters,
  residueSlot,
  selectLetterAnchors,
} from '../../src/levels/train/story-data.js'
import { TrainStory, HOLD_SECONDS } from '../../src/levels/train/story.js'
import { createTrainClues } from '../../src/levels/train/clues.js'
import { createTrainCollision } from '../../src/levels/train/collision.js'
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
  const items = plan.letters.map((letter) => ({
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
  }))
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
  return items
}

function createStory(seed = 7) {
  const plan = createCluePlan(seededRng(seed))
  const messages = []
  const revealed = []
  const story = new TrainStory({
    plan,
    items: planItems(plan),
    nameBoard: { revealLetter: (index) => revealed.push(index) },
    onMessage: (text) => messages.push(text),
  })
  return { story, plan, messages, revealed }
}

test('every ghost profile carries a kana name and two residue hints', () => {
  for (const profile of GHOST_PROFILES) {
    assert.match(profile.kana, /\s/, `${profile.id} needs a given-family split`)
    assert.match(profile.romaji, /^[A-Z]+ [A-Z]+$/)
    const letters = kanaLetters(profile)
    assert.ok(letters.length >= 4 && letters.length <= 7, `${profile.id} name length`)
    for (const anchor of RESIDUE_ANCHORS) {
      const data = profile.residue[anchor.id]
      assert.ok(data, `${profile.id} misses a hint for ${anchor.id}`)
      const slot = residueSlot(profile, data)
      assert.ok(slot >= 0 && slot < letters.length, `${profile.id} slot in range`)
    }
  }
})

test('the plan assigns one kana per slot and spreads letters across carriages', () => {
  const plan = createCluePlan(seededRng(3))
  const letters = kanaLetters(plan.profile)
  assert.equal(plan.letters.length, letters.length)
  assert.deepEqual(
    plan.letters.map((letter) => letter.slot).sort((a, b) => a - b),
    letters.map((_, index) => index),
  )
  assert.deepEqual(plan.letters.map((letter) => letter.char), letters)
  const ids = new Set(plan.letters.map((letter) => letter.anchor.id))
  assert.equal(ids.size, plan.letters.length, 'each anchor used once')
  const cars = new Set(plan.letters.map((letter) => letter.anchor.car))
  assert.deepEqual([...cars].sort((a, b) => a - b), [1, 2, 3, 4])
  assert.equal(plan.residue.length, RESIDUE_ANCHORS.length)
})

test('the run is reproducible from its seed and varies otherwise', () => {
  const a = createCluePlan(seededRng(11))
  const b = createCluePlan(seededRng(11))
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  const c = createCluePlan(seededRng(99))
  assert.notEqual(JSON.stringify(a), JSON.stringify(c))
})

test('selecting letters never repeats an anchor and respects car depth', () => {
  const anchors = selectLetterAnchors(6, seededRng(5))
  assert.equal(anchors.length, 6)
  assert.equal(new Set(anchors.map((anchor) => anchor.id)).size, 6)
  for (const anchor of anchors) assert.ok(LETTER_ANCHORS.includes(anchor))
})

test('holding E fills the mark, releasing resets, and it cannot read twice', () => {
  const { story, plan, revealed, messages } = createStory()
  const letter = story.items.find((item) => item.kind === 'letter')
  assert.equal(story.canInspect(letter.id), true)
  assert.equal(story.hold(HOLD_SECONDS * 0.5, letter), false)
  assert.ok(story.progress > 0.4 && story.progress < 0.6)
  story.releaseHold()
  assert.equal(story.progress, 0)
  assert.equal(story.hold(HOLD_SECONDS - 0.01, letter), false)
  assert.equal(story.hold(0.02, letter), true)
  assert.equal(story.read(letter), true)
  assert.equal(story.found.has(letter.id), true)
  assert.equal(story.read(letter), false)
  assert.deepEqual(revealed, [letter.slot])
  assert.ok(messages[0].includes(letter.char))
  assert.equal(story.canInspect(letter.id), false)
  assert.match(story.prompt(letter), /recorded/)
})

test('reading a residue clue reveals an inferred mark', () => {
  const { story, revealed } = createStory()
  const residue = story.items.find((item) => item.kind === 'residue')
  assert.equal(story.read(residue), true)
  assert.deepEqual(revealed, [residue.slot])
  assert.equal(story.slotsDone.has(residue.slot), true)
})

test('the objective walks from the opening line to a complete name', () => {
  const { story, plan } = createStory()
  assert.match(story.objective(), /FIND ITS NAME/)
  const first = story.items.find((item) => item.kind === 'letter')
  story.read(first)
  assert.match(story.objective(), /READ ITS NAME/)
  for (const item of story.items) story.read(item)
  assert.equal(story.slotsDone.size, plan.letters.length)
  assert.match(story.objective(), /COMPLETE/)
})

test('field notes list the boarding, residue, letters in order, then the fire', () => {
  const { story, plan } = createStory()
  plan.letters.forEach((letter, index) => {
    if (index % 2 === 0) story.read(story.items.find((item) => item.id === letter.id))
  })
  const residue = story.items.find((item) => item.kind === 'residue')
  story.read(residue)

  const before = story.journalEntries().map((entry) => entry.id)
  assert.equal(before[0], 'the-boarding')
  assert.equal(before[1], residue.id)
  const letterIds = before.slice(2)
  assert.ok(letterIds.every((id) => id.startsWith('letter-')))
  assert.ok(!before.includes('the-fire'))

  story.frontZ = 0
  story.update(0.1, { position: { z: 1 } })
  const after = story.journalEntries().map((entry) => entry.id)
  assert.equal(after[after.length - 1], 'the-fire')
})

test('clue props parent to their carriages and expose one item per plan entry', async () => {
  const model = await loadTrainGeometry('02')
  const group = new THREE.Group()
  group.add(model)
  group.updateWorldMatrix(true, true)
  const carriage = { group, model, bounds: new THREE.Box3().setFromObject(model) }
  const carriages = [carriage, carriage, carriage, carriage, carriage]
  const plan = createCluePlan(seededRng(21))
  const clues = createTrainClues({ carriages, plan })

  assert.equal(clues.items.length, plan.letters.length + plan.residue.length)
  for (const item of clues.items) {
    assert.equal(item.object.parent, group)
    assert.equal(item.object.visible, true)
  }
  clues.dispose()
  assert.equal(group.children.filter((child) => child.name.startsWith('train-clue-')).length, 0)
})

test('every clue sits in clear space and is seen before the seat behind it', async () => {
  const model = await loadTrainGeometry('02')
  const group = new THREE.Group()
  group.add(model)
  group.updateWorldMatrix(true, true)
  const carriage = { group, model, bounds: new THREE.Box3().setFromObject(model) }
  const carriages = [carriage, carriage, carriage, carriage, carriage]
  const plan = createCluePlan(seededRng(21))
  const clues = createTrainClues({ carriages, plan })
  const colliders = await createTrainCollision([{ model }])
  const world = colliders[0].world

  for (const item of clues.items) {
    const prop = item.object
    const position = prop.getWorldPosition(new THREE.Vector3())
    const toAisle = prop.rotation.y > 0 ? 1 : -1
    const standingRoom = (x, z) => !world.capsuleIntersect(new Capsule(
      new THREE.Vector3(x, 0.72, z),
      new THREE.Vector3(x, 1.18, z),
      0.2,
    ))
    let origin = null
    for (let offset = 0.6; offset <= 2.0; offset += 0.1) {
      const x = position.x + toAisle * offset
      if (standingRoom(x, position.z)) {
        origin = new THREE.Vector3(x, position.y, position.z)
        break
      }
    }
    assert.ok(origin, `${item.id} has no standing room in front of it`)
    const direction = position.clone().sub(origin).normalize()
    const hits = new THREE.Raycaster(origin, direction).intersectObjects([model, prop], true)
    assert.ok(hits.length > 0, `${item.id} is hidden from the lane`)
    assert.equal(hits[0].object, prop, `${item.id} is buried behind the carriage`)
  }
  clues.dispose()
})
