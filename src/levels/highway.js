import * as THREE from 'three'


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


export async function createHighwayLevel(levelRoot) {

  // ============================================
  // HIGHWAY GROUP
  // ============================================

  const highway = new THREE.Group()

  highway.name = 'highwayLevel'

  levelRoot.add(highway)


  // ============================================
  // LIGHTING
  // ============================================

  const ambientLight =
    new THREE.AmbientLight(
      0xffffff,
      1.2
    )

  highway.add(ambientLight)


  const moonLight =
    new THREE.DirectionalLight(
      0xffffff,
      2
    )

  moonLight.position.set(
    10,
    20,
    10
  )

  moonLight.castShadow = true

  highway.add(moonLight)


  // ============================================
  // ROAD
  // ============================================

  const roadGeometry =
    new THREE.BoxGeometry(
      14,
      0.2,
      400
    )


  const roadMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
    })


  const road =
    new THREE.Mesh(
      roadGeometry,
      roadMaterial
    )


  road.position.set(
    0,
    0,
    -195
  )

  road.receiveShadow = true

  highway.add(road)


  // ============================================
  // CENTRE ROAD LINES
  // ============================================

  const lineMaterial =
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
    })


  for (
    let z = 0;
    z > -390;
    z -= 12
  ) {

    const line =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          0.15,
          0.03,
          5
        ),
        lineMaterial
      )


    line.position.set(
      0,
      0.12,
      z
    )


    highway.add(line)
  }


  // ============================================
  // BARRIERS
  // ============================================

  const barrierMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x777777,
    })


  const leftBarrier =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        0.4,
        1,
        400
      ),
      barrierMaterial
    )


  leftBarrier.position.set(
    -7,
    0.5,
    -195
  )


  highway.add(leftBarrier)


  const rightBarrier =
    leftBarrier.clone()


  rightBarrier.position.x = 7


  highway.add(rightBarrier)


  // ============================================
  // PLAYER CAR
  // ============================================

  const playerCar =
    createPlayerCar()


  playerCar.position.set(
    2,
    0.2,
    0
  )


  highway.add(playerCar)


  // ============================================
  // GHOST CAR
  // ============================================

  const ghostCar =
    createGhostCar()


  ghostCar.position.set(
    -2,
    0.2,
    0
  )


  highway.add(ghostCar)


  // ============================================
  // STARTING LINE
  // ============================================

  const startLine =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        14,
        0.03,
        0.6
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      })
    )


  startLine.position.set(
    0,
    0.13,
    3
  )


  highway.add(startLine)

  // ============================================
  // FINISH LINE
  // ============================================

    const finishZ = -320


    const finishLine =
    new THREE.Group()


    // White line across road

    const finishStrip =
    new THREE.Mesh(
        new THREE.BoxGeometry(
        14,
        0.04,
        1
        ),

        new THREE.MeshBasicMaterial({
        color: 0xffffff,
        })
    )


    finishStrip.position.set(
    0,
    0.14,
    finishZ
    )


    finishLine.add(finishStrip)



    // Left finish post

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
    -6.5,
    2.5,
    finishZ
    )


    finishLine.add(leftPost)



    // Right finish post

    const rightPost =
    leftPost.clone()


    rightPost.position.x = 6.5


    finishLine.add(rightPost)



    // Top bar

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
    0,
    5,
    finishZ
    )


    finishLine.add(topBar)


    highway.add(finishLine)


  // ============================================
  // GHOST NAME
  // ============================================

  const ghostName =
    pickRandomGhostName()


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

    spawn:
        new THREE.Vector3(
        0,
        2,
        8
        ),

    modelSize:
        new THREE.Vector3(
        14,
        5,
        400
        ),
    }
}



// ============================================
// PLAYER CAR
// ============================================

function createPlayerCar() {

  const car =
    new THREE.Group()


  // Body

  const body =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        1.8,
        0.6,
        4
      ),

      new THREE.MeshStandardMaterial({
        color: 0xaa0000,
      })
    )


  body.position.y = 0.6

  body.castShadow = true

  car.add(body)


  // Roof

  const roof =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        1.4,
        0.5,
        1.8
      ),

      new THREE.MeshStandardMaterial({
        color: 0x660000,
      })
    )


  roof.position.set(
    0,
    1.05,
    0
  )


  roof.castShadow = true

  car.add(roof)


  return car
}



// ============================================
// GHOST CAR
// ============================================

function createGhostCar() {

  const ghostCar =
    new THREE.Group()


  const ghostMaterial =
    new THREE.MeshStandardMaterial({

      color: 0x66ffff,

      transparent: true,

      opacity: 0.6,

      emissive: 0x116666,

      emissiveIntensity: 1,
    })


  const body =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        1.8,
        0.6,
        4
      ),
      ghostMaterial
    )


  body.position.y = 0.6

  ghostCar.add(body)


  const roof =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        1.4,
        0.5,
        1.8
      ),

      ghostMaterial.clone()
    )


  roof.position.set(
    0,
    1.05,
    0
  )


  ghostCar.add(roof)


  return ghostCar
}