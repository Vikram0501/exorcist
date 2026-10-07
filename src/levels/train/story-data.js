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

export const LETTER_ANCHORS = [
  { id: 'a41', car: 4, t: 0.2, x: 2.34, y: 0.9, face: '+x', risk: 'safe' },
  { id: 'a42', car: 4, t: 0.44, x: 3.46, y: 0.9, face: '-x', risk: 'safe' },
  { id: 'a31', car: 3, t: 0.2, x: 2.34, y: 0.9, face: '+x', risk: 'safe' },
  { id: 'a32', car: 3, t: 0.4, x: 3.46, y: 0.9, face: '-x', risk: 'medium' },
  { id: 'a33', car: 3, t: 0.62, x: 1.15, y: 1.15, face: '+x', risk: 'medium' },
  { id: 'a21', car: 2, t: 0.24, x: 2.34, y: 0.9, face: '+x', risk: 'medium' },
  { id: 'a22', car: 2, t: 0.48, x: 3.46, y: 0.9, face: '-x', risk: 'medium' },
  { id: 'a23', car: 2, t: 0.7, x: 4.3, y: 1.15, face: '-x', risk: 'high' },
  { id: 'a11', car: 1, t: 0.2, x: 2.34, y: 0.9, face: '+x', risk: 'medium' },
  { id: 'a12', car: 1, t: 0.44, x: 3.46, y: 0.9, face: '-x', risk: 'high' },
  { id: 'a13', car: 1, t: 0.66, x: 1.15, y: 1.15, face: '+x', risk: 'high' },
  { id: 'a14', car: 1, t: 0.86, x: 4.2, y: 1.0, face: '-x', risk: 'high' },
]

export const RESIDUE_ANCHORS = [
  {
    id: 'torn-ticket',
    car: 3,
    t: 0.3,
    x: 2.34,
    y: 0.58,
    face: '+x',
    title: 'Torn ticket stub',
    foundAt: 'Passenger carriage, beneath the seats',
  },
  {
    id: 'burnt-tag',
    car: 2,
    t: 0.4,
    x: 3.46,
    y: 0.58,
    face: '-x',
    title: 'Half-burned name tag',
    foundAt: 'Passenger carriage, on the luggage rack',
  },
]

export const JOURNAL_ENTRIES = [
  {
    id: 'the-boarding',
    title: 'The boarding',
    foundAt: 'Rear platform',
    storyNote:
      'The rusted door sealed behind me on its own. The train was empty and running, one more carriage than the track should allow. Somewhere down the length of it, a light came on as if it had been waiting.',
    riteNote: 'Read its name without being seen. The train does not go anywhere; it only keeps happening.',
    at: 'start',
  },
  {
    id: 'the-fire',
    title: 'What the fire left',
    foundAt: "Driver's carriage",
    storyNote:
      'The carriage is a burned shell — scorched seats, bone fused into the floor, old blood drying in the shape of handwriting. This is where the line ended, and where the thing that walks it was made.',
    riteNote: 'The spirit died trapped and unheard. It hunts to be seen.',
    at: 'front',
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

function shuffle(list, rng) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function selectLetterAnchors(count, rng = Math.random) {
  const byCar = new Map()
  for (const anchor of LETTER_ANCHORS) {
    if (!byCar.has(anchor.car)) byCar.set(anchor.car, [])
    byCar.get(anchor.car).push(anchor)
  }
  const cars = [...byCar.keys()].sort((a, b) => b - a)
  for (const car of cars) byCar.set(car, shuffle(byCar.get(car), rng))

  const picked = []
  let depth = 0
  while (picked.length < count && depth < 8) {
    for (const car of cars) {
      if (picked.length >= count) break
      const pool = byCar.get(car)
      if (pool.length > depth) picked.push(pool[depth])
    }
    depth++
  }
  return picked
}

export function createCluePlan(rng = Math.random) {
  const profile = chooseProfile(rng)
  const letters = kanaLetters(profile)
  const anchors = selectLetterAnchors(letters.length, rng)
  const order = shuffle(anchors.map((anchor, index) => index), rng)

  const letterPlan = letters.map((char, slot) => {
    const anchor = anchors[order[slot]]
    return {
      id: `letter-${anchor.id}`,
      slot,
      char,
      anchor,
      title: `Its name · ${slot + 1}`,
      foundAt: anchor.risk === 'high' ? 'Deep in the train, exposed' : 'Passenger carriage',
    }
  })

  const residuePlan = RESIDUE_ANCHORS.map((anchor) => {
    const data = profile.residue[anchor.id]
    return {
      id: anchor.id,
      slot: residueSlot(profile, data),
      anchor,
      title: anchor.title,
      foundAt: anchor.foundAt,
      storyNote: data.storyNote,
      hintNote: data.hintNote,
    }
  })

  return { profile, letters: letterPlan, residue: residuePlan }
}
