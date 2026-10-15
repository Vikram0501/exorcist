export const GHOST_PROFILES = [
  {
    id: 'yuki-mori',
    romaji: 'YUKI MORI',
    kana: 'ユウキ モリ',
    reply: 'ユウキ モリ',
    residue: {
      'torn-ticket': {
        slot: { part: 'given', index: 1 },
        storyNote:
          'A child practised a name on the back of a ticket, then tore it in half. The surviving stroke is the second mark of the given name, doubled like a pair of rain lines.',
        hintNote: 'The second character of the given name is remembered here.',
      },
      'burnt-tag': {
        slot: { part: 'family', index: 0 },
        storyNote:
          'A luggage tag burned down to one corner. The surname survived as a single rounded stroke, the shape of a mouth mid-word.',
        hintNote: 'The first character of the surname is remembered here.',
      },
    },
  },
  {
    id: 'rei-kato',
    romaji: 'REI KATO',
    kana: 'レイ カトウ',
    reply: 'レイ カトウ',
    residue: {
      'torn-ticket': {
        slot: { part: 'given', index: 0 },
        storyNote:
          'The ticket stub is scorched along one edge. A single clean stroke remains, sharp as a hooked blade — the first mark of the given name.',
        hintNote: 'The first character of the given name is remembered here.',
      },
      'burnt-tag': {
        slot: { part: 'family', index: 1 },
        storyNote:
          'The tag held two strokes before the fire took it. One is left, crossed at the foot — the second mark of the surname.',
        hintNote: 'The second character of the surname is remembered here.',
      },
    },
  },
  {
    id: 'sora-endo',
    romaji: 'SORA ENDO',
    kana: 'ソラ エンドウ',
    reply: 'ソラ エンドウ',
    residue: {
      'torn-ticket': {
        slot: { part: 'family', index: 2 },
        storyNote:
          'Practice strokes cover the ticket. Only the third mark of the surname is finished, a long sweep that ends in a hook.',
        hintNote: 'The third character of the surname is remembered here.',
      },
      'burnt-tag': {
        slot: { part: 'given', index: 1 },
        storyNote:
          'The tag is half gone. What is left of the given name is its second mark, a single upright stroke.',
        hintNote: 'The second character of the given name is remembered here.',
      },
    },
  },
  {
    id: 'ao-saito',
    romaji: 'AO SAITO',
    kana: 'アオ サイトウ',
    reply: 'アオ サイトウ',
    residue: {
      'torn-ticket': {
        slot: { part: 'family', index: 0 },
        storyNote:
          'The stub bears a surname practised over and over. The first mark is clearest, a slanted stroke leaning toward the aisle.',
        hintNote: 'The first character of the surname is remembered here.',
      },
      'burnt-tag': {
        slot: { part: 'given', index: 0 },
        storyNote:
          'The tag survived as a corner. The first mark of the given name is a simple cross, cut off before its foot.',
        hintNote: 'The first character of the given name is remembered here.',
      },
    },
  },
]

// Eight floor spots measured by walking the spawn carriage (car 4, world z
// -131.37 .. -96.35) — under seats, in the stair bays, one in the walking
// lane. Every copy of the carriage is the same mesh, so the same eight are
// mirrored onto all four passenger cars and the plan deals 1-3 of them to
// each. `y` is deliberately absent: clues.js drops each spot onto the deck
// that the collision reports under it.
const SPAWN_MIN_Z = -131.37
const SPAWN_LENGTH = 35.02
const CARRIAGE_CLUE_SPOTS = [
  { x: 4.02, z: -120.87 },
  { x: 1.56, z: -124.18 },
  { x: 4.31, z: -114.86 },
  { x: 4.32, z: -125.92 },
  { x: 4.01, z: -99.25 },
  { x: 4.14, z: -101.97 },
  { x: 2.89, z: -101.11 },
  { x: 1.37, z: -111.08 },
]

export const LETTER_ANCHORS = CARRIAGE_CLUE_SPOTS.flatMap((spot, index) =>
  [1, 2, 3, 4].map((car) => {
    const t = (spot.z - SPAWN_MIN_Z) / SPAWN_LENGTH
    return {
      id: `c${car}s${index + 1}`,
      car,
      t,
      x: spot.x,
      floor: true,
      risk: t >= 0.7 ? 'high' : t >= 0.4 ? 'medium' : 'safe',
    }
  }),
)

// Pin each name-mark letter (by slot index) to a specific LETTER_ANCHORS id
// so a run always places that mark at that spot. Leave a slot null/absent to
// let the plan pick a free anchor at random, as before.
// Example: letters: ['c4s1', null, 'c2s3', 'c1s8'] pins marks 1, 3 and 4.
export const CLUE_PLACEMENTS = {
  letters: [],
}

// Papers left in the upper-deck compartments. One per passenger carriage,
// read with hold-E like any note; they open the inspection panel and are
// revealed on the name display. The double-decker's upper level only exists
// over the rear half of the carriage, so `t` sits inside a roofed upper
// compartment bay — well behind the step where the upper deck runs out.
export const UPPER_LETTER_ANCHORS = [
  { id: 'u41', car: 4, t: 0.1, x: 4, upper: true },
  { id: 'u31', car: 3, t: 0.14, x: 4, upper: true },
  { id: 'u21', car: 2, t: 0.21, x: 4, upper: true },
  { id: 'u11', car: 1, t: 0.24, x: 4, upper: true },
]

export const UPPER_LETTERS = [
  {
    id: 'night-run-sheet',
    anchorId: 'u41',
    title: "The conductor's night run sheet",
    foundAt: 'Upper compartment, rear carriage',
    storyNote:
      'A duty roster clipped to the upper rack. Four carriages out of the yard, full crew — and no arrival time printed; the line stops mid-page as if the printer knew. In the margin, in pencil: "Do not announce the name over the speaker. It answers."',
    riteNote: 'The name was never to be spoken aloud. Someone answered anyway.',
  },
  {
    id: 'unsent-letter',
    anchorId: 'u31',
    title: 'The unsent letter',
    foundAt: 'Upper compartment, third carriage',
    storyNote:
      'A letter folded into a bottle, never posted. Whoever wrote it watched the aisle below through the gap in the floorboards: "The conductors keep telling it to move along. It does not move along. It learned my name from my ticket, and now it says it softly when the lamps go out."',
    riteNote: 'It learned names from tickets. The torn stubs remember the rest.',
  },
  {
    id: 'guards-note',
    anchorId: 'u21',
    title: "The guard's compartment note",
    foundAt: 'Upper compartment, second carriage',
    storyNote:
      'Scorched paper wedged behind the upper latch. "Fire took the front car at the river bridge. We sealed the doors behind it and cut the name apart — one mark per carriage — so it could not call itself whole. Whoever speaks it last carries it."',
    riteNote: 'The name was cut apart on purpose. Rebuild it only inside the seal.',
  },
  {
    id: 'last-diary-page',
    anchorId: 'u11',
    title: 'The last diary page',
    foundAt: 'Upper compartment, front carriage',
    storyNote:
      'A half-burned diary page, stiff with heat. "It is walking the aisle again, looking for the rest of itself. If you are reading this upstairs, you are already above it. Finish the name below, in the ash where the line ended, and let us all stop happening."',
    riteNote: 'You are above it now. Go down and finish what the fire started.',
  },
]

// The two residue clues. Placement is not fixed: createCluePlan deals them
// spots from the same eight as the name marks, so a run spreads them across
// the carriages like any other clue.
export const RESIDUE_ANCHORS = [
  {
    id: 'torn-ticket',
    title: 'Torn ticket stub',
    foundAt: 'Passenger carriage, left on the deck',
  },
  {
    id: 'burnt-tag',
    title: 'Half-burned name tag',
    foundAt: 'Passenger carriage, left on the deck',
  },
]

export const REAR_LETTER = {
  id: 'rear-letter',
  title: 'The rear-carriage letter',
  foundAt: 'Rear carriage, on the floor ahead of the door',
  anchor: { id: 'rear-letter', car: 4, t: 0.2, x: 2.8, floor: true },
  storyNote:
    'Whoever sealed this door behind me is still aboard. I am leaving this where every run begins — at the back — so the next one does not have to discover it all the hard way.\n\n' +
    'The train does not go anywhere. It only keeps happening. Something burnt walks the aisle: it hears running and it follows your torch. Crouch, kill the light, and stand off the aisle line between the seats, and it will walk straight past you. Let it reach you and the run ends where it always ends — back here, at this letter.\n\n' +
    'Its name was cut apart and hidden through the carriages, scratched in red. Hold E on a mark until it gives itself up; the torn ticket and the half-burnt tag give up marks as well. Every mark fills the name shown above.\n\n' +
    'When the name is whole, carry it forward to the burning carriage at the head of the train. That is where the line ended, and where it has to end.',
  riteNote:
    'Read its name without being seen. The train does not go anywhere; it only keeps happening.',
}

export const RITE_SEAL = {
  id: 'exorcism-seal',
  title: 'The ashen seal',
  foundAt: 'Burnt carriage, at the head of the train',
  storyNote:
    'Salt and ash drawn in a ring on the burned deck, still warm. The carriages were never the trap — the name was. Say it here and the line lets go.',
  riteNote: 'Hold E to begin. Rebuild the name you uncovered, then speak it.',
  anchor: { id: 'rite-seal', x: 2.7, t: 0.62 },
}

export const JOURNAL_ENTRIES = [
  {
    id: 'the-fire',
    title: 'What the fire left',
    foundAt: "Driver's carriage",
    storyNote:
      'The carriage is a burned shell — scorched seats, bone fused into the floor, old blood drying in the shape of handwriting. This is where the line ended, and where the thing that walks it was made.',
    riteNote: 'The spirit died trapped and unheard. It hunts to be seen.',
    at: 'front',
  },
  {
    id: 'the-name-spoken',
    title: 'The name spoken',
    foundAt: 'Burnt carriage, in the ash ring',
    storyNote:
      'I rebuilt the name mark by mark inside the burned carriage and spoke it aloud. The thing that walked the aisle stopped mid-stride, as if it had been waiting years to be answered.',
    riteNote: 'The stalker is released. The aisle is empty.',
    at: 'rite',
  },
  {
    id: 'the-run-ends',
    title: 'The run ends',
    foundAt: 'Doorway of the burnt carriage',
    storyNote:
      'I walked out of the burning carriage and the train ran on quieter than before. Whatever kept happening here has finished happening.',
    riteNote: 'Case closed. Its name was carried forward and given back.',
    at: 'end',
  },
]

export function chooseProfile(rng = Math.random) {
  const index = Math.floor(rng() * GHOST_PROFILES.length) % GHOST_PROFILES.length
  return GHOST_PROFILES[index]
}

export function kanaLetters(profile) {
  return [...profile.kana.replace(/\s/g, '')]
}

export function residueSlot(profile, residue) {
  const givenLength = profile.kana.split(' ')[0].length
  return residue.slot.part === 'given'
    ? residue.slot.index
    : givenLength + residue.slot.index
}

export function shuffle(list, rng) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function selectLetterAnchors(count, rng = Math.random, exclude = []) {
  const skip = new Set(exclude.map((anchor) => anchor.id))
  const byCar = new Map()
  for (const anchor of LETTER_ANCHORS) {
    if (skip.has(anchor.id)) continue
    if (!byCar.has(anchor.car)) byCar.set(anchor.car, [])
    byCar.get(anchor.car).push(anchor)
  }
  const cars = shuffle([...byCar.keys()], rng)
  const pools = new Map(cars.map((car) => [car, shuffle(byCar.get(car), rng)]))

  // Spread the run evenly — eight clues over four cars is 2/2/2/2, nine is
  // 3/2/2/2 — and let a random car take each leftover slot.
  const quotas = new Map(cars.map((car) => [car, Math.floor(count / cars.length)]))
  let leftover = count - quotas.get(cars[0]) * cars.length
  for (const car of cars) {
    if (leftover <= 0) break
    quotas.set(car, quotas.get(car) + 1)
    leftover--
  }

  const picked = []
  for (const car of cars) {
    const pool = pools.get(car)
    for (let slot = 0; slot < quotas.get(car) && pool.length; slot++) picked.push(pool.shift())
  }
  // A car that ran dry (its spots were all pinned) is topped up from the rest.
  while (picked.length < count) {
    const car = cars.find((candidate) => pools.get(candidate).length)
    if (!car) break
    picked.push(pools.get(car).shift())
  }
  return picked
}

function resolvePlacements(placements, letterCount) {
  const pinnedBySlot = new Map()
  const pinnedIds = new Set()
  const limit = Math.min(placements.length, letterCount)
  for (let slot = 0; slot < limit; slot++) {
    const id = placements[slot]
    if (!id) continue
    const anchor = LETTER_ANCHORS.find((candidate) => candidate.id === id)
    if (!anchor) throw new Error(`CLUE_PLACEMENTS: unknown LETTER_ANCHORS id "${id}"`)
    if (pinnedIds.has(id)) throw new Error(`CLUE_PLACEMENTS: anchor "${id}" is pinned twice`)
    pinnedBySlot.set(slot, anchor)
    pinnedIds.add(id)
  }
  return pinnedBySlot
}

export function createCluePlan(rng = Math.random, options = {}) {
  const profile = chooseProfile(rng)
  const letters = kanaLetters(profile)
  const placements = options.letterPlacements ?? CLUE_PLACEMENTS.letters ?? []
  const pinnedBySlot = resolvePlacements(placements, letters.length)

  // One deal covers the whole run: name marks and residues together, so the
  // eight spots split evenly across the carriages — 2/2/2/2 or 3/2/2/2 — and
  // no clue shares a spot with another.
  const autoCount = letters.length - pinnedBySlot.size
  const deal = selectLetterAnchors(autoCount + RESIDUE_ANCHORS.length, rng, [...pinnedBySlot.values()])
  const residuePool = deal.slice(autoCount)
  const autoQueue = shuffle(deal.slice(0, autoCount), rng)
  const freeSlots = letters.map((_, index) => index).filter((index) => !pinnedBySlot.has(index))
  freeSlots.forEach((slot, index) => pinnedBySlot.set(slot, autoQueue[index]))

  const letterPlan = letters.map((char, slot) => {
    const anchor = pinnedBySlot.get(slot)
    return {
      id: `letter-${anchor.id}`,
      slot,
      char,
      anchor,
      title: `Its name · ${slot + 1}`,
      foundAt: anchor.risk === 'high' ? 'Deep in the train, exposed' : 'Passenger carriage',
    }
  })


  const residuePlan = RESIDUE_ANCHORS.map((entry, index) => {
    const data = profile.residue[entry.id]
    return {
      id: entry.id,
      slot: residueSlot(profile, data),
      anchor: residuePool[index],
      title: entry.title,
      foundAt: entry.foundAt,
      storyNote: data.storyNote,
      hintNote: data.hintNote,
    }
  })

  return { profile, letters: letterPlan, residue: residuePlan }
}
