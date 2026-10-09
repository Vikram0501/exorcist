import * as THREE from 'three'
import { REAR_LETTER } from './story-data.js'
import { trainFloorAt } from './zombie.js'

const KANA_FONT = '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans CJK JP", "MS Gothic", sans-serif'
const DECK_FALLBACK = 0.4
const PAPER_LIFT = 0.015

function makeTexture(draw, size = 256) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, size, size)
  draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function letterTexture(char) {
  return makeTexture((context, size) => {
    context.textAlign = 'center'
    context.fillStyle = 'rgba(196, 42, 32, 0.95)'
    context.font = `${size * 0.72}px ${KANA_FONT}`
    context.fillText(char, size / 2, size * 0.74)
  })
}

function residueTexture(title) {
  return makeTexture((context, size) => {
    context.fillStyle = 'rgba(30, 26, 20, 0.9)'
    context.beginPath()
    context.roundRect(size * 0.06, size * 0.2, size * 0.88, size * 0.6, size * 0.04)
    context.fill()
    context.strokeStyle = 'rgba(170, 150, 110, 0.6)'
    context.lineWidth = size * 0.012
    context.stroke()
    context.textAlign = 'center'
    context.fillStyle = 'rgba(210, 196, 170, 0.95)'
    context.font = `${size * 0.11}px ${KANA_FONT}`
    const words = title.split(' ')
    context.fillText(words.slice(0, 2).join(' '), size / 2, size * 0.46)
    if (words.length > 2) context.fillText(words.slice(2).join(' '), size / 2, size * 0.6)
    context.fillStyle = 'rgba(180, 60, 46, 0.8)'
    context.font = `${size * 0.09}px ${KANA_FONT}`
    context.fillText('READ THE RESIDUE', size / 2, size * 0.72)
  })
}

function rearLetterTexture() {
  return makeTexture((context, size) => {
    context.fillStyle = '#d8cba6'
    context.fillRect(0, 0, size, size)
    context.fillStyle = 'rgba(110, 88, 52, 0.14)'
    context.beginPath()
    context.ellipse(size * 0.24, size * 0.7, size * 0.3, size * 0.16, 0.4, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.ellipse(size * 0.78, size * 0.2, size * 0.22, size * 0.12, -0.3, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = 'rgba(52, 40, 24, 0.55)'
    context.lineWidth = Math.max(1, size * 0.006)
    context.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9)
    context.textAlign = 'center'
    context.fillStyle = 'rgba(44, 32, 20, 0.92)'
    context.font = `${size * 0.062}px Georgia, "Times New Roman", serif`
    context.fillText('TO WHOEVER FINDS THIS', size / 2, size * 0.17)

    let seed = 1337
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    context.strokeStyle = 'rgba(48, 36, 24, 0.7)'
    context.lineWidth = size * 0.012
    context.lineCap = 'round'
    for (let row = 0; row < 9; row++) {
      const y = size * (0.28 + row * 0.068)
      let x = size * 0.12
      const end = size * (0.68 + rand() * 0.2)
      context.beginPath()
      context.moveTo(x, y)
      while (x < end) {
        const word = size * (0.05 + rand() * 0.07)
        context.quadraticCurveTo(x + word * 0.5, y + size * 0.02 * (rand() - 0.5) * 2, x + word, y)
        x += word + size * 0.02
      }
      context.stroke()
    }

    context.fillStyle = 'rgba(150, 38, 30, 0.9)'
    context.font = `italic ${size * 0.07}px Georgia, "Times New Roman", serif`
    context.fillText('it only keeps happening', size / 2, size * 0.93)
  }, 512)
}

function anchorPosition(carriage, anchor) {
  const { min, max } = carriage.bounds
  const z = min.z + anchor.t * (max.z - min.z)
  return new THREE.Vector3(anchor.x, anchor.y, z)
}

function buildProp({ carriage, anchor, texture, width, height }) {
  const geometry = new THREE.PlaneGeometry(width, height)
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.95,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  const world = anchorPosition(carriage, anchor)
  const local = carriage.group.worldToLocal(world.clone())
  mesh.position.copy(local)
  if (anchor.floor) {
    mesh.rotation.set(Math.PI / 2, Math.PI, 0)
  } else {
    mesh.rotation.y = anchor.face === '+x' ? Math.PI / 2 : -Math.PI / 2
  }
  mesh.name = `train-clue-${anchor.id}`
  mesh.userData.sharedAsset = false
  mesh.userData.dispose = () => {
    geometry.dispose()
    material.dispose()
    texture?.dispose()
  }
  carriage.group.add(mesh)
  return mesh
}

export function createTrainClues({ carriages, plan, colliders }) {
  const items = []
  const meshes = []

  const rearCarriage = carriages[REAR_LETTER.anchor.car]
  if (rearCarriage) {
    const anchor = { ...REAR_LETTER.anchor }
    const { min, max } = rearCarriage.bounds
    const deck = colliders
      ? trainFloorAt(colliders, anchor.x, min.z + anchor.t * (max.z - min.z))
      : 0
    anchor.y = (deck > 0.05 ? deck : DECK_FALLBACK) + PAPER_LIFT
    const mesh = buildProp({
      carriage: rearCarriage,
      anchor,
      texture: rearLetterTexture(),
      width: 0.46,
      height: 0.58,
    })
    meshes.push(mesh)
    items.push({
      id: REAR_LETTER.id,
      title: REAR_LETTER.title,
      foundAt: REAR_LETTER.foundAt,
      storyNote: REAR_LETTER.storyNote,
      riteNote: REAR_LETTER.riteNote,
      object: mesh,
      story: true,
      kind: 'note',
    })
  }

  for (const letter of plan.letters) {
    const carriage = carriages[letter.anchor.car]
    if (!carriage) continue
    const anchor = { ...letter.anchor }
    if (anchor.floor) {
      const { min, max } = carriage.bounds
      const deck = colliders
        ? trainFloorAt(colliders, anchor.x, min.z + anchor.t * (max.z - min.z))
        : 0
      anchor.y = (deck > 0.05 ? deck : DECK_FALLBACK) + PAPER_LIFT
    }
    const texture = letterTexture(letter.char)
    const mesh = buildProp({ carriage, anchor, texture, width: 0.5, height: 0.5 })
    meshes.push(mesh)
    items.push({
      id: letter.id,
      title: letter.title,
      foundAt: letter.foundAt,
      storyNote: `A character of the name has been scratched here in red: ${letter.char}. Part of what the thing that walks the train once answered to.`,
      riteNote: `Name mark ${letter.slot + 1} of ${plan.letters.length} — ${letter.char}.`,
      object: mesh,
      story: true,
      kind: 'letter',
      slot: letter.slot,
      char: letter.char,
      total: plan.letters.length,
    })
  }

  for (const residue of plan.residue) {
    const carriage = carriages[residue.anchor.car]
    if (!carriage) continue
    const texture = residueTexture(residue.title)
    const mesh = buildProp({ carriage, anchor: residue.anchor, texture, width: 0.44, height: 0.34 })
    meshes.push(mesh)
    items.push({
      id: residue.id,
      title: residue.title,
      foundAt: residue.foundAt,
      storyNote: residue.storyNote,
      riteNote: residue.hintNote,
      object: mesh,
      story: true,
      kind: 'residue',
      slot: residue.slot,
    })
  }

  return {
    items,
    meshes,
    dispose() {
      for (const mesh of meshes) {
        mesh.userData.dispose?.()
        mesh.removeFromParent()
      }
    },
  }
}
