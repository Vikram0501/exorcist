import * as THREE from 'three'
import { loadHighwayRoad, seatCarVisuals } from './road.js'
import { loadHighwayCars } from './cars.js'
import { loadCityBuildings } from './city.js'
import { loadStreetlightTemplate } from './streetlights.js'
import { createObstacles, loadObstacleModels }
  from './obstacles.js'
import { createRacecraft }
  from './racecraft.js'
import {
  ROAD_PATH_POINTS,
  ROAD_WIDTH,
  FINISH_DISTANCE_BUFFER,
  createDefaultTrack,
} from './track.js'


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
// ROAD PATH SYSTEM (single source of truth: track.js)
// ============================================
//
// ROAD_PATH_POINTS, ROAD_WIDTH and arc-length sampling live in track.js.
// They are re-exported here for compatibility with existing imports/tests.
export { ROAD_PATH_POINTS, ROAD_WIDTH } from './track.js'


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
  // ROAD PATH (single source of truth: Track)
  // ============================================

  const track = createDefaultTrack()
  // Legacy compat: existing consumers/tests read these fields. `track`
  // is authoritative for all new sampling.
  const roadPathPoints = track.points
  const arcLengths = track.arcLengths
  const totalRoadLength = track.totalLength


  // ============================================
  // GLB VISUAL ROAD (race coordinates remain independent)
  // ============================================

  // Await before cars/controllers are created. A failed asset load uses the
  // existing level-load error path rather than starting a race without a road.
  highway.add(await loadHighwayRoad({
    roadWidth: ROAD_WIDTH,
    arcLengths,
    sampleAtDistance: distance => track.sampleAt(distance),
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
    const sample = track.sampleAt(d)

    // Banked placement: toWorld carries the lateral/up frame, so the
    // barrier base sits on the banked shoulder cross-section. Roll about
    // the travel axis (Euler XYZ applies Z before Y) matches road bank.
    const leftBarrier = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        1,
        barrierSampleStep
      ),
      barrierMaterial
    )
    leftBarrier.position.copy(
      track.toWorld(d, barrierOffset, 0.5)
    )
    leftBarrier.rotation.set(0, sample.angle, sample.bank)
    highway.add(leftBarrier)

    const rightBarrier = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        1,
        barrierSampleStep
      ),
      barrierMaterial
    )
    rightBarrier.position.copy(
      track.toWorld(d, -barrierOffset, 0.5)
    )
    rightBarrier.rotation.set(0, sample.angle, sample.bank)
    highway.add(rightBarrier)
  }


  // ============================================
  // TOTAL ARC LENGTH
  // ============================================

  const finishDistance =
    track.getFinishDistance(FINISH_DISTANCE_BUFFER)


  // ============================================
  // PLAYER CAR
  // ============================================

  const [playerCar, ghostCar] = await loadHighwayCars(highway)

  const startSample = track.sampleAt(0)

  playerCar.position.set(
    startSample.position.x + 2,
    startSample.position.y + 0.2,
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
    startSample.position.y + 0.2,
    startSample.position.z
  )

  highway.add(ghostCar)
  ghostCar.rotation.y = startSample.angle
  seatCarVisuals(ghostCar)


  // ============================================
  // STARTING LINE
  // ============================================

  const startLineSample =
    track.sampleAt(3)

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
  startLine.position.y += 0.13
  startLine.rotation.y =
    startLineSample.angle

  highway.add(startLine)


  // ============================================
  // FINISH LINE
  // ============================================

  const finishSample =
    track.sampleAt(finishDistance)

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
  finishStrip.position.y += 0.14
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
    finishSample.position.y + 2.5,
    finishSample.position.z +
      perpZf * 6.5
  )

  finishLine.add(leftPost)

  const rightPost =
    leftPost.clone()

  rightPost.position.set(
    finishSample.position.x -
      perpXf * 6.5,
    finishSample.position.y + 2.5,
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
    finishSample.position.y + 5,
    finishSample.position.z
  )
  topBar.rotation.y =
    finishSample.angle

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
  // RACECRAFT DRESSING (procedural, no gameplay)
  // ============================================

  // Synchronous procedural pass over the finished track: worn road
  // markings, reflective studs, curve lamps, danger-corner barrier caps
  // and text-free start/finish paint. Lives under the highway group so
  // level disposal covers it.
  const racecraft =
    createRacecraft({
      track,
      highway,
      finishDistance,
    })


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
      startSample.position.y + 2,
      startSample.position.z + 8
    ),

    modelSize: new THREE.Vector3(
      50,
      5,
      totalRoadLength
    ),

    moonLight: moonLight,

    ambientLight: ambientLight,

    // Authoritative track. Legacy roadPath/arcLengths/totalRoadLength/
    // finishZ are kept for compatibility (tests + existing consumers).
    track: track,

    roadPath: roadPathPoints,

    arcLengths: arcLengths,

    totalRoadLength: totalRoadLength,

    obstacles: obstacles,

    cityBuildings: cityBuildings,

    streetlights: streetlights,

    racecraft: racecraft,
  }
}
