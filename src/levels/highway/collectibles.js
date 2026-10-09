import * as THREE from 'three'
import { asTrack } from './track.js'
import { PICKUP_RADIUS, planLetterPositions } from './collectible-placement.js'


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

    // Bob anchor rides the elevation: LetterPickup bobs around the
    // track height at spawn, not a hardcoded world Y.
    this.baseY = position.y

    highway.add(this.mesh)
  }

  update(dt) {
    if (this.collected) {
      return
    }

    this.mesh.rotation.y +=
      dt * 1.5

    this.mesh.position.y =
      (this.baseY ?? 0.2) +
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
  ghostNameUI,
  roadPath,
  arcLengths,
  totalRoadLength,
  obstacles = []
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

  const numLetters = letters.length
  const track = asTrack(roadPath, arcLengths)
  const positions = planLetterPositions(track, numLetters, obstacles)

  const safeEnd = totalRoadLength * 0.25

  const mediumEnd =
    totalRoadLength * 0.5

  const collectibles = []

  for (
    let i = 0;
    i < numLetters;
    i++
  ) {
    const { progress: distance, lateralOffset } = positions[i]
    const position = track.toWorld(distance, lateralOffset, 0.2)

    let risk = 'high'

    if (distance < safeEnd) {
      risk = 'safe'
    } else if (distance < mediumEnd) {
      risk = 'medium'
    }

    const pickup =
      new LetterPickup(
        letters[i].letter,
        letters[i].slotIndex,
        position,
        highway
      )

    pickup.risk = risk
    pickup.progress = distance
    pickup.lateralOffset = lateralOffset

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
