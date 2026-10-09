import * as THREE from 'three'
import { LEGACY_TOTAL_ROAD_LENGTH } from './track.js'


// Track-relative sign stations. legacyS is the distance along the previous
// ~952.66 m highway (10 - z on the old near-straight layout); placement
// normalizes through the legacy total so clue pacing survives geometry
// changes. d is lateral offset from the track centre.
const SIGN_OFFSET = 8

const SIGN_STATIONS = [
  { legacyS: 50, side: 'left', tier: 'early' },
  { legacyS: 80, side: 'right', tier: 'early' },
  { legacyS: 140, side: 'left', tier: 'middle' },
  { legacyS: 170, side: 'right', tier: 'middle' },
  { legacyS: 200, side: 'left', tier: 'middle' },
  { legacyS: 250, side: 'right', tier: 'late' },
  { legacyS: 280, side: 'left', tier: 'late' },
  { legacyS: 310, side: 'right', tier: 'late' },
  { legacyS: 410, side: 'left', tier: 'late' },
  { legacyS: 510, side: 'right', tier: 'late' },
  { legacyS: 610, side: 'left', tier: 'late' },
  { legacyS: 710, side: 'right', tier: 'late' },
  { legacyS: 810, side: 'left', tier: 'late' },
]


const ORDINALS = [
  'FIRST',
  'SECOND',
  'THIRD',
  'FOURTH',
  'FIFTH',
]


function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min
}


function pickRandom(arr) {
  return arr[
    Math.floor(Math.random() * arr.length)
  ]
}


function generateEarlyClues(firstName, lastName) {
  const clues = []

  clues.push({
    line1: 'FIRST NAME',
    line2: firstName.length +
      ' LETTERS',
  })

  clues.push({
    line1: 'SURNAME',
    line2: lastName.length +
      ' LETTERS',
  })

  return clues
}


function generateMiddleClues(firstName, lastName) {
  const clues = []

  clues.push({
    line1: 'FIRST NAME',
    line2: 'STARTS WITH ' +
      firstName[0],
  })

  clues.push({
    line1: 'SURNAME',
    line2: 'STARTS WITH ' +
      lastName[0],
  })

  if (firstName.length >= 3) {
    const idx = randomInt(
      1,
      firstName.length - 1
    )

    clues.push({
      line1: 'LETTER ' +
        (idx + 1) + ':',
      line2: firstName[idx] +
        ' IN FIRST NAME',
    })
  }

  if (lastName.length >= 3) {
    const idx = randomInt(
      1,
      lastName.length - 1
    )

    clues.push({
      line1: 'LETTER ' +
        (idx + 1) + ':',
      line2: lastName[idx] +
        ' IN SURNAME',
    })
  }

  return clues
}


function generateLateClues(firstName, lastName) {
  const clues = []

  if (firstName.length >= 3) {
    const indices = []

    for (
      let i = 0;
      i < firstName.length;
      i++
    ) {
      indices.push(i)
    }

    const revealCount = randomInt(
      1,
      Math.min(2, firstName.length - 1)
    )

    const shuffled = []

    for (
      let i = indices.length - 1;
      i > 0;
      i--
    ) {
      const j = Math.floor(
        Math.random() * (i + 1)
      )
      const temp = indices[i]
      indices[i] = indices[j]
      indices[j] = temp
    }

    for (
      let i = 0;
      i < revealCount;
      i++
    ) {
      shuffled.push(indices[i])
    }

    shuffled.sort(function (a, b) {
      return a - b
    })

    let pattern = ''

    for (
      let i = 0;
      i < firstName.length;
      i++
    ) {
      if (
        shuffled.indexOf(i) !== -1
      ) {
        pattern += firstName[i]
      } else {
        pattern += '_'
      }

      if (i < firstName.length - 1) {
        pattern += ' '
      }
    }

    clues.push({
      line1: 'FIRST NAME:',
      line2: pattern,
    })
  }

  if (lastName.length >= 3) {
    const indices = []

    for (
      let i = 0;
      i < lastName.length;
      i++
    ) {
      indices.push(i)
    }

    const revealCount = randomInt(
      1,
      Math.min(2, lastName.length - 1)
    )

    for (
      let i = indices.length - 1;
      i > 0;
      i--
    ) {
      const j = Math.floor(
        Math.random() * (i + 1)
      )
      const temp = indices[i]
      indices[i] = indices[j]
      indices[j] = temp
    }

    const revealed = []

    for (
      let i = 0;
      i < revealCount;
      i++
    ) {
      revealed.push(indices[i])
    }

    revealed.sort(function (a, b) {
      return a - b
    })

    let pattern = ''

    for (
      let i = 0;
      i < lastName.length;
      i++
    ) {
      if (
        revealed.indexOf(i) !== -1
      ) {
        pattern += lastName[i]
      } else {
        pattern += '_'
      }

      if (i < lastName.length - 1) {
        pattern += ' '
      }
    }

    clues.push({
      line1: 'SURNAME:',
      line2: pattern,
    })
  }

  return clues
}


function buildRoadSignHints(ghostName) {
  const spaceIndex =
    ghostName.indexOf(' ')

  const firstName =
    ghostName.substring(0, spaceIndex)

  const lastName =
    ghostName.substring(spaceIndex + 1)

  const earlyClues =
    generateEarlyClues(
      firstName,
      lastName
    )

  const middleClues =
    generateMiddleClues(
      firstName,
      lastName
    )

  const lateClues =
    generateLateClues(
      firstName,
      lastName
    )

  return {
    early: earlyClues,
    middle: middleClues,
    late: lateClues,
  }
}


function createSignTexture(
  line1,
  line2
) {
  const canvas =
    document.createElement('canvas')

  canvas.width = 256

  canvas.height = 128

  const ctx =
    canvas.getContext('2d')

  ctx.fillStyle = '#0a0a0a'

  ctx.fillRect(
    0,
    0,
    256,
    128
  )

  ctx.strokeStyle = '#224444'

  ctx.lineWidth = 3

  ctx.strokeRect(
    4,
    4,
    248,
    120
  )

  ctx.fillStyle = '#88ffff'

  ctx.font =
    'bold 22px monospace'

  ctx.textAlign = 'center'

  ctx.textBaseline = 'middle'

  ctx.fillText(
    line1,
    128,
    40
  )

  ctx.fillText(
    line2,
    128,
    80
  )

  const texture =
    new THREE.CanvasTexture(
      canvas
    )

  texture.magFilter =
    THREE.NearestFilter

  texture.minFilter =
    THREE.NearestFilter

  return texture
}


function createSignMesh(
  line1,
  line2,
  position,
  highway,
  faceTarget = null
) {
  const group =
    new THREE.Group()

  const poleGeometry =
    new THREE.CylinderGeometry(
      0.08,
      0.08,
      3.5,
      8
    )

  const poleMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.6,
    })

  const pole =
    new THREE.Mesh(
      poleGeometry,
      poleMaterial
    )

  pole.position.y = 1.75

  group.add(pole)


  const boardGeometry =
    new THREE.BoxGeometry(
      2.2,
      1.1,
      0.08
    )

  const texture =
    createSignTexture(
      line1,
      line2
    )

  const boardMaterial =
    new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0x224444,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.95,
    })

  const board =
    new THREE.Mesh(
      boardGeometry,
      boardMaterial
    )

  board.position.y = 3.3

  group.add(board)


  const glowGeometry =
    new THREE.BoxGeometry(
      2.3,
      1.2,
      0.02
    )

  const glowMaterial =
    new THREE.MeshBasicMaterial({
      color: 0x116666,
      transparent: true,
      opacity: 0.15,
    })

  const glow =
    new THREE.Mesh(
      glowGeometry,
      glowMaterial
    )

  glow.position.y = 3.3

  glow.position.z = 0.05

  group.add(glow)


  group.position.copy(position)

  if (faceTarget) {
    // Track-relative: face oncoming traffic along the local tangent.
    group.lookAt(faceTarget)
  } else {
    // Legacy straight-road fallback (no Track available).
    group.lookAt(
      0,
      group.position.y,
      position.z - 10
    )
  }

  group.userData.originalEmissive =
    boardMaterial.emissiveIntensity

  group.userData.boardMaterial =
    boardMaterial

  group.userData.glowMaterial =
    glowMaterial

  highway.add(group)

  return group
}


export function createRoadSigns(
  ghostName,
  highway,
  track = null
) {
  const hints =
    buildRoadSignHints(ghostName)

  const signs = []

  for (
    let i = 0;
    i < SIGN_STATIONS.length;
    i++
  ) {
    const spot = SIGN_STATIONS[i]

    const sideOffset =
      spot.side === 'left' ? -SIGN_OFFSET : SIGN_OFFSET

    let position
    let faceTarget = null

    if (track) {
      // Track-relative placement: pacing normalized through the legacy
      // total so clue order/progression is unchanged on new geometry.
      const s =
        (spot.legacyS / LEGACY_TOTAL_ROAD_LENGTH) *
        track.totalLength
      const frame = track.sampleAt(s)
      position = track.toWorld(s, sideOffset)
      // Face oncoming traffic: look back up the track along the tangent.
      faceTarget = position.clone().addScaledVector(frame.tangent, -10)
      faceTarget.y = position.y
    } else {
      // Legacy fallback: old near-straight layout (10 - s = z).
      position =
        new THREE.Vector3(
          sideOffset,
          0,
          10 - spot.legacyS
        )
    }

    let cluePool

    if (spot.tier === 'early') {
      cluePool = hints.early
    } else if (spot.tier === 'middle') {
      cluePool = hints.middle
    } else {
      cluePool = hints.late
    }

    const clue =
      cluePool[
        i % cluePool.length
      ]

    const signGroup =
      createSignMesh(
        clue.line1,
        clue.line2,
        position,
        highway,
        faceTarget
      )

    signGroup.userData.tier =
      spot.tier

    signs.push(signGroup)
  }

  return signs
}


export function updateRoadSigns(
  signs,
  time
) {
  for (
    let i = 0;
    i < signs.length;
    i++
  ) {
    const sign = signs[i]

    if (
      sign.userData.boardMaterial
    ) {
      const flicker =
        Math.sin(
          time * 2.5 + i * 1.7
        ) *
        0.08

      sign.userData.boardMaterial.emissiveIntensity =
        (sign.userData.originalEmissive || 0.3) +
        flicker
    }

    if (
      sign.userData.glowMaterial
    ) {
      const glowFlicker =
        Math.sin(
          time * 3.1 + i * 2.3
        ) *
        0.05

      sign.userData.glowMaterial.opacity =
        0.15 + glowFlicker
    }
  }
}


export function disposeRoadSigns(
  signs
) {
  for (
    let i = 0;
    i < signs.length;
    i++
  ) {
    const sign = signs[i]

    sign.traverse(function (child) {
      if (child.geometry) {
        child.geometry.dispose()
      }

      if (child.material) {
        if (child.material.map) {
          child.material.map.dispose()
        }

        child.material.dispose()
      }
    })

    if (sign.parent) {
      sign.parent.remove(sign)
    }
  }

  signs.length = 0
}
