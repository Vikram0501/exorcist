import * as THREE from 'three'


const PICKUP_RADIUS = 2.5


const SPAWN_SPOTS = [
  { z: -15, risk: 'safe' },
  { z: -48, risk: 'safe' },
  { z: -81, risk: 'safe' },
  { z: -114, risk: 'medium' },
  { z: -147, risk: 'medium' },
  { z: -180, risk: 'medium' },
  { z: -213, risk: 'high' },
  { z: -246, risk: 'high' },
  { z: -279, risk: 'high' },
  { z: -312, risk: 'high' },
]


function shuffleArray(arr) {
  const copy = arr.slice()

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    )
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }

  return copy
}


class LetterPickup {
  constructor(
    letter,
    slotIndex,
    position,
    highway
  ) {
    this.letter = letter
    this.slotIndex = slotIndex
    this.collected = false
    this.mesh = new THREE.Group()

    const baseGeometry =
      new THREE.CylinderGeometry(
        0.6,
        0.6,
        0.15,
        16
      )

    const baseMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x004444,
        emissive: 0x006666,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.7,
      })

    const base =
      new THREE.Mesh(
        baseGeometry,
        baseMaterial
      )

    this.mesh.add(base)


    const glowGeometry =
      new THREE.TorusGeometry(
        0.7,
        0.05,
        8,
        24
      )

    const glowMaterial =
      new THREE.MeshBasicMaterial({
        color: 0x66ffff,
        transparent: true,
        opacity: 0.4,
      })

    const glow =
      new THREE.Mesh(
        glowGeometry,
        glowMaterial
      )

    glow.rotation.x =
      Math.PI / 2

    glow.position.y = 0.1

    this.mesh.add(glow)


    const canvas =
      document.createElement('canvas')

    canvas.width = 64
    canvas.height = 64

    const ctx =
      canvas.getContext('2d')

    ctx.fillStyle = 'transparent'
    ctx.fillRect(
      0,
      0,
      64,
      64
    )

    ctx.fillStyle = '#66ffff'
    ctx.font =
      'bold 48px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      letter,
      32,
      32
    )

    const texture =
      new THREE.CanvasTexture(
        canvas
      )

    const spriteMaterial =
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
      })

    const sprite =
      new THREE.Sprite(
        spriteMaterial
      )

    sprite.scale.set(
      1.2,
      1.2,
      1
    )

    sprite.position.y = 1.2

    this.mesh.add(sprite)


    this.mesh.position.copy(
      position
    )

    highway.add(this.mesh)
  }

  update(dt) {
    if (this.collected) {
      return
    }

    this.mesh.rotation.y +=
      dt * 1.5

    this.mesh.position.y =
      0.2 +
      Math.sin(
        performance.now() * 0.003
      ) *
        0.15
  }

  checkCollection(
    playerCar
  ) {
    if (this.collected) {
      return false
    }

    const dx =
      this.mesh.position.x -
      playerCar.position.x

    const dz =
      this.mesh.position.z -
      playerCar.position.z

    const dist =
      Math.sqrt(dx * dx + dz * dz)

    if (dist < PICKUP_RADIUS) {
      this.collected = true
      this.mesh.visible = false
      return true
    }

    return false
  }

  dispose() {
    if (this.mesh.parent) {
      this.mesh.parent.remove(
        this.mesh
      )
    }

    this.mesh.traverse(
      (child) => {
        if (child.geometry) {
          child.geometry.dispose()
        }

        if (child.material) {
          if (child.material.map) {
            child.material.map.dispose()
          }

          child.material.dispose()
        }
      }
    )
  }
}


export function createCollectibles(
  ghostName,
  highway,
  ghostNameUI
) {
  const spaceIndex =
    ghostName.indexOf(' ')

  const first =
    ghostName.substring(
      0,
      spaceIndex
    )

  const last =
    ghostName.substring(
      spaceIndex + 1
    )

  const letters = []

  for (
    let i = 0;
    i < first.length;
    i++
  ) {
    letters.push({
      letter: first[i],
      slotIndex: i,
    })
  }

  for (
    let i = 0;
    i < last.length;
    i++
  ) {
    letters.push({
      letter: last[i],
      slotIndex:
        first.length + i,
    })
  }

  const shuffledSpots =
    shuffleArray(SPAWN_SPOTS)

  const collectibles = []

  for (
    let i = 0;
    i < letters.length;
    i++
  ) {
    const spot =
      shuffledSpots[
        i % shuffledSpots.length
      ]

    const xOffset =
      (Math.random() - 0.5) * 6

    const position =
      new THREE.Vector3(
        xOffset,
        0.2,
        spot.z
      )

    const pickup =
      new LetterPickup(
        letters[i].letter,
        letters[i].slotIndex,
        position,
        highway
      )

    pickup.risk = spot.risk

    collectibles.push(pickup)
  }

  return collectibles
}


export function updateCollectibles(
  collectibles,
  playerCar,
  ghostNameUI,
  dt
) {
  for (
    let i = 0;
    i < collectibles.length;
    i++
  ) {
    const pickup =
      collectibles[i]

    pickup.update(dt)

    if (
      pickup.checkCollection(
        playerCar
      )
    ) {
      if (
        ghostNameUI &&
        ghostNameUI.revealLetter
      ) {
        ghostNameUI.revealLetter(
          pickup.slotIndex
        )
      }
    }
  }
}


export function disposeCollectibles(
  collectibles
) {
  for (
    let i = 0;
    i < collectibles.length;
    i++
  ) {
    collectibles[i].dispose()
  }

  collectibles.length = 0
}
