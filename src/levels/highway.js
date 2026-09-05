import * as THREE from 'three'


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
  // RETURN DATA EXPECTED BY game.js
  // ============================================

  return {

    colliders: [],

    colliderHelpers: [],

    lightHelpers: [],

    doors: [],

    ramps: [],

    model: highway,

    // We need game.js to know about these cars
    playerCar: playerCar,

    ghostCar: ghostCar,

    finishZ: finishZ,

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