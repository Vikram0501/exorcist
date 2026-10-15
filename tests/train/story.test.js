import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import {
  GHOST_PROFILES,
  LETTER_ANCHORS,
  RESIDUE_ANCHORS,
  REAR_LETTER,
  UPPER_LETTERS,
  createCluePlan,
  kanaLetters,
  residueSlot,
  selectLetterAnchors,
} from '../../src/levels/train/story-data.js'
import { TrainStory, HOLD_SECONDS } from '../../src/levels/train/story.js'
import { createTrainClues } from '../../src/levels/train/clues.js'
import { createTrainCollision } from '../../src/levels/train/collision.js'
import { trainUpperFloorAt } from '../../src/levels/train/zombie.js'
import { loadTrainGeometry } from './model-fixture.js'

// Mirrors the paper lift clues.js uses so the note floats a hair over the deck.
const PAPER_LIFT = 0.015

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

// Clue spots sit under seats and in the stair bays, so the aisle line behind a
// paper is often blocked. Any clear standing spot close enough that the paper
// is the first thing the ray hits counts as a reader position.
function findReader(prop, model, standingRoom) {
  const paper = prop.getWorldPosition(new THREE.Vector3())
  const eye = new THREE.Vector3()
  const direction = new THREE.Vector3()
  for (let radius = 0.5; radius <= 2.001; radius += 0.15) {
    for (let step = 0; step < 24; step++) {
      const angle = (step / 24) * Math.PI * 2
      const x = paper.x + Math.cos(angle) * radius
      const z = paper.z + Math.sin(angle) * radius
      if (!standingRoom(x, z)) continue
      eye.set(x, paper.y + 0.9, z)
      direction.copy(paper).sub(eye).normalize()
      const hits = new THREE.Raycaster(eye, direction).intersectObjects([model, prop], true)
      if (hits.length > 0 && hits[0].object === prop) return { x, z, radius }
    }
  }
  return null
}

function planItems(plan) {
  const items = [{
    id: REAR_LETTER.id,
    title: REAR_LETTER.title,
    foundAt: REAR_LETTER.foundAt,
    storyNote: REAR_LETTER.storyNote,
    riteNote: REAR_LETTER.riteNote,
    story: true,
    kind: 'note',
  }]
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
  for (const letter of plan.letters) assert.ok(LETTER_ANCHORS.includes(letter.anchor))
  assert.equal(plan.residue.length, RESIDUE_ANCHORS.length)
})

test('every carriage gets 1-3 clues, drawn without repeats from the shared spots', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const plan = createCluePlan(seededRng(seed))
    const clues = [...plan.letters, ...plan.residue]
    const perCar = new Map()
    const seen = new Set()
    for (const clue of clues) {
      assert.ok(LETTER_ANCHORS.includes(clue.anchor), `seed ${seed} ${clue.id} uses a pool anchor`)
      assert.equal(seen.has(clue.anchor.id), false, `seed ${seed} reuses ${clue.anchor.id}`)
      seen.add(clue.anchor.id)
      assert.equal(clue.anchor.floor, true, `seed ${seed} ${clue.id} lies on the deck`)
      perCar.set(clue.anchor.car, (perCar.get(clue.anchor.car) || 0) + 1)
    }
    for (const car of [1, 2, 3, 4]) {
      const count = perCar.get(car) || 0
      assert.ok(count >= 1 && count <= 3, `seed ${seed} carriage ${car} holds ${count} clues`)
    }
  }
})

test('the run is reproducible from its seed and varies otherwise', () => {
  const a = createCluePlan(seededRng(11))
  const b = createCluePlan(seededRng(11))
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  const c = createCluePlan(seededRng(99))
  assert.notEqual(JSON.stringify(a), JSON.stringify(c))
})

test('selecting anchors never repeats one and spreads them evenly over the cars', () => {
  const anchors = selectLetterAnchors(8, seededRng(5))
  assert.equal(anchors.length, 8)
  assert.equal(new Set(anchors.map((anchor) => anchor.id)).size, 8)
  for (const anchor of anchors) assert.ok(LETTER_ANCHORS.includes(anchor))
  const share = (picked) => {
    const perCar = new Map()
    for (const anchor of picked) perCar.set(anchor.car, (perCar.get(anchor.car) || 0) + 1)
    return [...perCar.values()].sort((a, b) => a - b)
  }
  assert.deepEqual(share(anchors), [2, 2, 2, 2])
  assert.deepEqual(share(selectLetterAnchors(9, seededRng(6))), [2, 2, 2, 3])
  assert.deepEqual(share(selectLetterAnchors(7, seededRng(7))), [1, 2, 2, 2])
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
  assert.match(story.prompt(letter), /already read/)
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

test('field notes list the rear letter, residue, letters in order, then the fire', () => {
  const { story, plan } = createStory()
  assert.deepEqual(story.journalEntries(), [])
  story.read(story.items.find((item) => item.kind === 'note'))
  plan.letters.forEach((letter, index) => {
    if (index % 2 === 0) story.read(story.items.find((item) => item.id === letter.id))
  })
  const residue = story.items.find((item) => item.kind === 'residue')
  story.read(residue)

  const before = story.journalEntries().map((entry) => entry.id)
  assert.equal(before[0], REAR_LETTER.id)
  assert.equal(before[1], residue.id)
  const letterIds = before.slice(2)
  assert.ok(letterIds.every((id) => id.startsWith('letter-')))
  assert.ok(!before.includes('the-fire'))

  story.frontZ = 0
  story.update(0.1, { position: { z: 1 } })
  const after = story.journalEntries().map((entry) => entry.id)
  assert.equal(after[after.length - 1], 'the-fire')
})

test('the rear letter is held open like a mark and marked as read', () => {
  const { story } = createStory()
  const note = story.items.find((item) => item.kind === 'note')
  assert.equal(note.story, true)
  assert.equal(story.prompt(note), 'Hold E · Read the letter')
  assert.equal(story.hold(HOLD_SECONDS - 0.01, note), false)
  assert.equal(story.hold(0.02, note), true)
  assert.equal(story.read(note), true)
  assert.match(story.prompt(note), /already read/)
  assert.equal(story.journalEntries()[0].id, REAR_LETTER.id)
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

  assert.equal(clues.items.length, plan.letters.length + plan.residue.length + 1 + UPPER_LETTERS.length)
  const note = clues.items.find((item) => item.kind === 'note')
  assert.ok(note, 'the rear letter is always created')
  assert.ok(Math.abs(note.object.rotation.x - Math.PI / 2) < 1e-9, 'the letter lies flat on the floor')
  for (const item of clues.items) {
    assert.ok(item.object.parent === group, `${item.id} parents to its carriage`)
    assert.equal(item.object.visible, true)
    assert.ok(item.object.material.isMeshStandardMaterial, `${item.id} responds to scene light`)
  }
  clues.debug.show()
  clues.debug.hide()
  clues.dispose()
  assert.equal(group.children.filter((child) => child.name.startsWith('train-clue-')).length, 0)
})

test('every clue sits in clear space and can be read from a standing player', async () => {
  const model = await loadTrainGeometry('02')
  const group = new THREE.Group()
  group.add(model)
  group.updateWorldMatrix(true, true)
  const carriage = { group, model, bounds: new THREE.Box3().setFromObject(model) }
  const carriages = [carriage, carriage, carriage, carriage, carriage]
  const plan = createCluePlan(seededRng(21))
  const colliders = await createTrainCollision([{ model }])
  const clues = createTrainClues({ carriages, plan, colliders })
  const world = colliders[0].world

  const standingRoom = (x, z) => !world.capsuleIntersect(new Capsule(
    new THREE.Vector3(x, 0.72, z),
    new THREE.Vector3(x, 1.18, z),
    0.2,
  ))

  for (const item of clues.items) {
    if (item.upper) continue
    const prop = item.object
    assert.ok(prop.rotation.x > 0, `${item.id} lies flat on the deck`)
    const reader = findReader(prop, model, standingRoom)
    assert.ok(reader, `${item.id} has no standing spot that sees it`)
  }
  clues.dispose()
})

test('every spot in the pool can be reached and read from the aisle', async () => {
  const model = await loadTrainGeometry('02')
  const group = new THREE.Group()
  group.add(model)
  group.updateWorldMatrix(true, true)
  const carriage = { group, model, bounds: new THREE.Box3().setFromObject(model) }
  const carriages = [carriage, carriage, carriage, carriage, carriage]
  const chars = kanaLetters(GHOST_PROFILES[0])
  const plan = {
    profile: GHOST_PROFILES[0],
    letters: LETTER_ANCHORS.map((anchor, index) => ({
      id: `mark-${anchor.id}`,
      slot: index % chars.length,
      char: chars[index % chars.length],
      anchor,
      title: 'Mark',
      foundAt: 'Floor',
    })),
    residue: [],
  }
  const colliders = await createTrainCollision([{ model }])
  const clues = createTrainClues({ carriages, plan, colliders })
  const world = colliders[0].world

  const standingRoom = (x, z) => !world.capsuleIntersect(new Capsule(
    new THREE.Vector3(x, 0.72, z),
    new THREE.Vector3(x, 1.18, z),
    0.2,
  ))

  for (const item of clues.items) {
    if (item.kind !== 'letter') continue
    const prop = item.object
    assert.ok(prop.rotation.x > 0, `${item.id} should lie flat on the floor`)
    const reader = findReader(prop, model, standingRoom)
    assert.ok(reader, `${item.id} has no standing spot that sees it`)
  }
  clues.dispose()
})

test('CLUE_PLACEMENTS pins name marks to chosen anchors and leaves the rest free', () => {
  const pinned = createCluePlan(seededRng(13), { letterPlacements: ['c4s1', null, 'c2s3'] })
  assert.equal(pinned.letters[0].anchor.id, 'c4s1')
  assert.equal(pinned.letters[2].anchor.id, 'c2s3')
  assert.ok(LETTER_ANCHORS.includes(pinned.letters[1].anchor))
  const ids = pinned.letters.map((letter) => letter.anchor.id)
  assert.equal(new Set(ids).size, ids.length, 'each anchor used once')

  const unpinned = createCluePlan(seededRng(13))
  assert.notEqual(unpinned.letters[0].anchor.id, 'c4s1')

  assert.throws(
    () => createCluePlan(seededRng(1), { letterPlacements: ['no-such-anchor'] }),
    /unknown LETTER_ANCHORS/,
  )
  assert.throws(
    () => createCluePlan(seededRng(1), { letterPlacements: ['c4s1', null, 'c4s1'] }),
    /pinned twice/,
  )
})

test('every upper-deck letter lies on the upper deck and is read from upstairs', async () => {
  const model = await loadTrainGeometry('02')
  const group = new THREE.Group()
  group.add(model)
  group.updateWorldMatrix(true, true)
  const carriage = { group, model, bounds: new THREE.Box3().setFromObject(model) }
  const carriages = [carriage, carriage, carriage, carriage, carriage]
  const plan = createCluePlan(seededRng(21))
  const colliders = await createTrainCollision([{ model }])
  const clues = createTrainClues({ carriages, plan, colliders })
  const world = colliders[0].world

  const upstairsRoom = (x, feetY, z) => !world.capsuleIntersect(new Capsule(
    new THREE.Vector3(x, feetY + 0.2, z),
    new THREE.Vector3(x, feetY + 0.8, z),
    0.2,
  ))

  const upperItems = clues.items.filter((item) => UPPER_LETTERS.some((entry) => entry.id === item.id))
  assert.equal(upperItems.length, UPPER_LETTERS.length)
  for (const item of upperItems) {
    const prop = item.object
    const position = prop.getWorldPosition(new THREE.Vector3())
    assert.ok(position.y > 2.5, `${item.id} should sit on the upper deck, got y=${position.y}`)
    assert.ok(prop.rotation.x > 0, `${item.id} lies flat like a note`)
    const deck = trainUpperFloorAt(colliders, position.x, position.z)
    assert.ok(Math.abs(position.y - deck - PAPER_LIFT) < 0.05, `${item.id} rests on the local upper deck`)
    const feet = deck + 0.05
    assert.ok(upstairsRoom(position.x, feet, position.z), `${item.id} has no upstairs standing room`)
    const origin = new THREE.Vector3(position.x, position.y + 0.9, position.z - 1.2)
    assert.ok(upstairsRoom(origin.x, feet, origin.z), `${item.id} has no upstairs standing room before it`)
    const direction = position.clone().sub(origin).normalize()
    const hits = new THREE.Raycaster(origin, direction).intersectObjects([model, prop], true)
    assert.ok(hits.length > 0, `${item.id} is hidden upstairs`)
    assert.ok(hits[0].object === prop, `${item.id} is buried under the upper deck`)
  }
  clues.dispose()
})
