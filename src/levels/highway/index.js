import * as THREE from 'three'
import { loadHighwayRoad, seatCarVisuals } from './road.js'
import { loadHighwayCars } from './cars.js'
import { loadCityBuildings } from './city.js'
import { loadStreetlightTemplate } from './streetlights.js'
import { createObstacles, loadObstacleModels }
  from './obstacles.js'


const GHOST_NAMES = [
  'MARA VOSS',
  'ELIAS DREAD',
  'ROSE HOLLOW',
  'JACK FINN',
  'LILY ASH',
  'OWEN GRAVE',
  'NORA SHADE',
  'FELIX MOURN',
  'IVY COBALT',
  'OTIS WREN',
]


function pickRandomGhostName() {
  const index = Math.floor(
    Math.random() * GHOST_NAMES.length
  )
  return GHOST_NAMES[index]
}


function formatBlankSlots(name) {
  const spaceIndex =
    name.indexOf(' ')

  const first =
    name.substring(0, spaceIndex)

  const last =
    name.substring(spaceIndex + 1)

  const slots = []

  for (let i = 0; i < first.length; i++) {
    slots.push({
      letter: first[i],
      revealed: false,
    })
  }

  for (let i = 0; i < last.length; i++) {
    slots.push({
      letter: last[i],
      revealed: false,
    })
  }

  return {
    first,
    last,
    slots,
  }
}


function renderSlotDisplay(
  slotElements,
  slots,
  gapIndex
) {
  for (
    let i = 0;
    i < slotElements.length;
    i++
  ) {
    const span = slotElements[i]
    const slot = slots[i]

    if (slot.revealed) {
      span.textContent = slot.letter
      span.style.color = '#22ff22'
    } else {
      span.textContent = '_'
      span.style.color = '#66ffff'
    }
  }
}


export function createGhostNameUI(name) {
  const { slots } =
    formatBlankSlots(name)

  const el =
    document.createElement('div')

  el.style.position = 'fixed'
  el.style.top = '12px'
  el.style.left = '50%'
  el.style.transform =
    'translateX(-50%)'
  el.style.zIndex = '100'
  el.style.fontWeight = 'bold'
  el.style.pointerEvents = 'none'
  el.style.userSelect = 'none'
  el.style.fontFamily = 'monospace'
  el.style.textAlign = 'center'

  const nameRow =
    document.createElement('div')

  nameRow.style.fontSize = '28px'
  nameRow.style.letterSpacing = '3px'
  nameRow.style.textShadow =
    '0 0 12px #006666'

  const spaceIndex =
    name.indexOf(' ')
  const firstLen = spaceIndex
  const totalSlots = slots.length

  const slotElements = []

  for (let i = 0; i < totalSlots; i++) {
    const span =
      document.createElement('span')

    span.textContent = '_'
    span.style.color = '#66ffff'
    span.style.display = 'inline-block'
    span.style.width = '1ch'
    span.style.textAlign = 'center'

    nameRow.appendChild(span)
    slotElements.push(span)

    if (i === firstLen - 1) {
      const gap =
        document.createElement('span')

      gap.textContent = '\u00A0\u00A0\u00A0\u00A0'
      gap.style.display = 'inline-block'
      gap.style.width = '4ch'

      nameRow.appendChild(gap)
    }
  }

  el.appendChild(nameRow)

  const counterRow =
    document.createElement('div')

  counterRow.style.fontSize = '14px'
  counterRow.style.marginTop = '4px'
  counterRow.style.color = '#999999'
  counterRow.style.letterSpacing = '1px'

  const collected = 0
  const total = slots.length

  counterRow.textContent =
    'LETTERS: ' +
    collected +
    '/' +
    total

  el.appendChild(counterRow)

  document.body.appendChild(el)

  el._slots = slots
  el._slotElements = slotElements
  el._counterRow = counterRow
  el._collected = 0
  el._total = total

  el.revealLetter = function (slotIndex) {
    if (
      slotIndex < 0 ||
      slotIndex >= slots.length
    ) {
      return
    }

    if (slots[slotIndex].revealed) {
      return
    }

    slots[slotIndex].revealed = true

    this._collected++

    renderSlotDisplay(
      slotElements,
      slots,
      firstLen
    )

    counterRow.textContent =
      'LETTERS: ' +
      this._collected +
      '/' +
      this._total
  }

  renderSlotDisplay(
    slotElements,
    slots,
    firstLen
  )

  return el
}


export function removeGhostNameUI(el) {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el)
  }
}


// ============================================
// ROAD PATH SYSTEM
// ============================================

const ROAD_PATH_POINTS = [
  new THREE.Vector3(0, 0, 10),
  new THREE.Vector3(0, 0, -50),
  new THREE.Vector3(0, 0, -130),
  new THREE.Vector3(0, 0, -190),
  new THREE.Vector3(6, 0, -260),
  new THREE.Vector3(12, 0, -330),
  new THREE.Vector3(8, 0, -400),
  new THREE.Vector3(0, 0, -460),
  new THREE.Vector3(-8, 0, -530),
  new THREE.Vector3(-14, 0, -600),
  new THREE.Vector3(-8, 0, -670),
  new THREE.Vector3(0, 0, -730),
  new THREE.Vector3(0, 0, -800),
  new THREE.Vector3(0, 0, -870),
  new THREE.Vector3(0, 0, -940),
]

const ROAD_WIDTH = 14


function buildArcLengthTable(points) {
  const arcLengths = [0]
  for (let i = 1; i < points.length; i++) {
    const dx =
      points[i].x - points[i - 1].x
    const dz =
      points[i].z - points[i - 1].z
    arcLengths.push(
      arcLengths[i - 1] +
        Math.sqrt(dx * dx + dz * dz)
    )
  }
  return arcLengths
}


function getDirectionAtPoint(
  points,
  index
) {
  const p0 =
    points[Math.max(0, index - 1)]
  const p1 = points[index]
  const p2 =
    points[
      Math.min(points.length - 1, index + 1)
    ]

  const dx = p2.x - p0.x
  const dz = p2.z - p0.z
  const len = Math.sqrt(dx * dx + dz * dz)

  if (len < 0.001) {
    return new THREE.Vector2(0, -1)
  }

  return new THREE.Vector2(
    dx / len,
    dz / len
  )
}


function getPositionAlongPath(
  points,
  arcLengths,
  distance
) {
  const totalLength =
    arcLengths[arcLengths.length - 1]

  if (distance <= 0) {
    const dir = getDirectionAtPoint(
      points,
      0
    )
    return {
      position: points[0].clone(),
      direction: dir.clone(),
      angle: Math.atan2(dir.x, dir.y),
    }
  }

  if (distance >= totalLength) {
    const last = points.length - 1
    const dir = getDirectionAtPoint(
      points,
      last
    )
    return {
      position: points[last].clone(),
      direction: dir.clone(),
      angle: Math.atan2(dir.x, dir.y),
    }
  }

  let segIndex = 0
  for (
    let i = 0;
    i < arcLengths.length - 1;
    i++
  ) {
    if (
      distance >= arcLengths[i] &&
      distance < arcLengths[i + 1]
    ) {
      segIndex = i
      break
    }
  }

  const segLength =
    arcLengths[segIndex + 1] -
    arcLengths[segIndex]
  const t =
    segLength > 0
      ? (distance - arcLengths[segIndex]) /
        segLength
      : 0

  const p0 = points[segIndex]
  const p1 = points[segIndex + 1]

  const position = new THREE.Vector3(
    p0.x + (p1.x - p0.x) * t,
    0,
    p0.z + (p1.z - p0.z) * t
  )

  const dir = getDirectionAtPoint(
    points,
    segIndex
  )

  const dir1 = getDirectionAtPoint(
    points,
    segIndex + 1
  )

  const blendedDir = new THREE.Vector2(
    dir.x + (dir1.x - dir.x) * t,
    dir.y + (dir1.y - dir.y) * t
  )
  const blendLen = Math.sqrt(
    blendedDir.x * blendedDir.x +
      blendedDir.y * blendedDir.y
  )
  if (blendLen > 0.001) {
    blendedDir.x /= blendLen
    blendedDir.y /= blendLen
  }

  return {
    position,
    direction: blendedDir,
    angle: Math.atan2(
      blendedDir.x,
      blendedDir.y
    ),
  }
}


// ============================================
// CREATE HIGHWAY LEVEL
// ============================================

export async function createHighwayLevel(
  levelRoot
) {
  const highway = new THREE.Group()
  highway.name = 'highwayLevel'
  levelRoot.add(highway)


  // ============================================
  // LIGHTING (apocalyptic red-grade, gameplay-safe)
  // ============================================

  // Faint crimson fill: lifts zombies and obstacles without washing the
  // scene. The warm headlights stay the neutral contrast that guides the
  // player down the road.
  const ambientLight =
    new THREE.AmbientLight(0x33141a, 0.5)
  highway.add(ambientLight)

  // Blood-red key light, still shadow-casting so buildings read as dark
  // silhouettes and the asphalt keeps its shading.
  const moonLight =
    new THREE.DirectionalLight(
      0x8f2f3d,
      1.5
    )
  moonLight.position.set(-30, 35, -90)
  moonLight.castShadow = true
  highway.add(moonLight)
  highway.add(moonLight.target)


  // ============================================
  // ROAD PATH
  // ============================================

  const roadPathPoints = ROAD_PATH_POINTS
  const arcLengths = buildArcLengthTable(
    roadPathPoints
  )
  const totalRoadLength =
    arcLengths[arcLengths.length - 1]


  // ============================================
  // GLB VISUAL ROAD (race coordinates remain independent)
  // ============================================

  // Await before cars/controllers are created. A failed asset load uses the
  // existing level-load error path rather than starting a race without a road.
  highway.add(await loadHighwayRoad({
    roadWidth: ROAD_WIDTH,
    arcLengths,
    sampleAtDistance: distance => getPositionAlongPath(
      roadPathPoints, arcLengths, distance
    ),
  }))


  // ============================================
  // CITY ENVIRONMENT
  // ============================================

  // Loaded once and cloned by every section, never per section. Scenery only:
  // a missing model still leaves a complete, playable highway.
  let cityBuildings = null

  try {

    cityBuildings = await loadCityBuildings()

  } catch (error) {

    console.warn(
      'Failed to load street_city_buildings_8.glb:',
      error
    )

  }

  // Streetlight poles: scenery only, same policy as the city. One template
  // load serves the whole corridor; a missing model leaves the highway
  // complete without lamps.
  let streetlights = null

  try {

    streetlights = await loadStreetlightTemplate()

  } catch (error) {

    console.warn(
      'Failed to load street_lamp.glb:',
      error
    )

  }

  const barrierMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x777777,
    })

  // ============================================
  // CONTINUOUS BARRIERS
  // ============================================

  const barrierSampleStep = 10
  const barrierOffset =
    ROAD_WIDTH * 0.5 + 0.2

  for (
    let d = 0;
    d < totalRoadLength;
    d += barrierSampleStep
  ) {
    const sample = getPositionAlongPath(
      roadPathPoints,
      arcLengths,
      d
    )

    const dir = sample.direction
    const perpX = -dir.y
    const perpZ = dir.x

    const leftBarrier = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        1,
        barrierSampleStep
      ),
      barrierMaterial
    )
    leftBarrier.position.set(
      sample.position.x +
        perpX * barrierOffset,
      0.5,
      sample.position.z +
        perpZ * barrierOffset
    )
    leftBarrier.rotation.y = sample.angle
    highway.add(leftBarrier)

    const rightBarrier = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        1,
        barrierSampleStep
      ),
      barrierMaterial
    )
    rightBarrier.position.set(
      sample.position.x -
        perpX * barrierOffset,
      0.5,
      sample.position.z -
        perpZ * barrierOffset
    )
    rightBarrier.rotation.y = sample.angle
    highway.add(rightBarrier)
  }


  // ============================================
  // TOTAL ARC LENGTH
  // ============================================

  const finishDistance =
    totalRoadLength - 60


  // ============================================
  // PLAYER CAR
  // ============================================

  const [playerCar, ghostCar] = await loadHighwayCars(highway)

  const startSample = getPositionAlongPath(
    roadPathPoints,
    arcLengths,
    0
  )

  playerCar.position.set(
    startSample.position.x + 2,
    0.2,
    startSample.position.z
  )

  highway.add(playerCar)
  playerCar.rotation.y = startSample.angle
  seatCarVisuals(playerCar)


  // ============================================
  // GHOST CAR
  // ============================================

  ghostCar.position.set(
    startSample.position.x - 2,
    0.2,
    startSample.position.z
  )

  highway.add(ghostCar)
  ghostCar.rotation.y = startSample.angle
  seatCarVisuals(ghostCar)


  // ============================================
  // STARTING LINE
  // ============================================

  const startLineSample =
    getPositionAlongPath(
      roadPathPoints,
      arcLengths,
      3
    )

  const startLine =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        ROAD_WIDTH,
        0.03,
        0.6
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      })
    )

  startLine.position.copy(
    startLineSample.position
  )
  startLine.position.y = 0.13
  startLine.rotation.y =
    startLineSample.angle

  highway.add(startLine)


  // ============================================
  // FINISH LINE
  // ============================================

  const finishSample =
    getPositionAlongPath(
      roadPathPoints,
      arcLengths,
      finishDistance
    )

  const finishZ = finishSample.position.z

  const finishLine = new THREE.Group()

  const finishStrip =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        ROAD_WIDTH,
        0.04,
        1
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      })
    )

  finishStrip.position.copy(
    finishSample.position
  )
  finishStrip.position.y = 0.14
  finishStrip.rotation.y =
    finishSample.angle

  finishLine.add(finishStrip)

  const perpXf =
    -Math.cos(finishSample.angle)
  const perpZf =
    Math.sin(finishSample.angle)

  const leftPost =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        5,
        0.4
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
      })
    )

  leftPost.position.set(
    finishSample.position.x +
      perpXf * 6.5,
    2.5,
    finishSample.position.z +
      perpZf * 6.5
  )

  finishLine.add(leftPost)

  const rightPost =
    leftPost.clone()

  rightPost.position.set(
    finishSample.position.x -
      perpXf * 6.5,
    2.5,
    finishSample.position.z -
      perpZf * 6.5
  )

  finishLine.add(rightPost)

  const topBar =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        13.4,
        0.5,
        0.5
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
      })
    )

  topBar.position.set(
    finishSample.position.x,
    5,
    finishSample.position.z
  )

  finishLine.add(topBar)

  highway.add(finishLine)


  // ============================================
  // GHOST NAME
  // ============================================

  const ghostName =
    pickRandomGhostName()


  // ============================================
  // ROAD OBSTACLES
  // ============================================

  // Gameplay visuals: a failed asset load uses the existing level-load error
  // path rather than starting a race with missing colliders.
  const obstacleTemplates = await loadObstacleModels()

  const obstacles =
    createObstacles(
      obstacleTemplates,
      roadPathPoints,
      arcLengths,
      totalRoadLength,
      highway
    )


  // ============================================
  // RETURN DATA EXPECTED BY game.js
  // ============================================

  return {
    colliders: [],

    colliderHelpers: [],

    lightHelpers: [],

    doors: [],

    ramps: [],

    model: highway,

    playerCar: playerCar,

    ghostCar: ghostCar,

    finishZ: finishZ,

    ghostName: ghostName,

    spawn: new THREE.Vector3(
      startSample.position.x,
      2,
      startSample.position.z + 8
    ),

    modelSize: new THREE.Vector3(
      50,
      5,
      totalRoadLength
    ),

    moonLight: moonLight,

    ambientLight: ambientLight,

    roadPath: roadPathPoints,

    arcLengths: arcLengths,

    totalRoadLength: totalRoadLength,

    obstacles: obstacles,

    cityBuildings: cityBuildings,

    streetlights: streetlights,
  }
}
