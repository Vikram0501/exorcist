import * as THREE from 'three'

const KANA_FONT = '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans CJK JP", "MS Gothic", sans-serif'

function makeTexture(draw, size = 256) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, size, size)
  draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  return texture
}

function drawScuff(context, size) {
  context.fillStyle = 'rgba(8, 6, 4, 0.82)'
  context.beginPath()
  context.roundRect(size * 0.08, size * 0.1, size * 0.84, size * 0.8, size * 0.06)
  context.fill()
  context.strokeStyle = 'rgba(150, 40, 30, 0.55)'
  context.lineWidth = size * 0.02
  context.stroke()
}

function letterTexture(letter) {
  return makeTexture((context, size) => {
    drawScuff(context, size)
    context.textAlign = 'center'
    context.fillStyle = 'rgba(196, 42, 32, 0.95)'
    context.font = `${size * 0.46}px ${KANA_FONT}`
    context.fillText(letter.char, size / 2, size * 0.56)
    context.fillStyle = 'rgba(226, 214, 198, 0.85)'
    context.font = `${size * 0.1}px ${KANA_FONT}`
    context.fillText(letter.romaji, size / 2, size * 0.78)
    context.fillStyle = 'rgba(226, 214, 198, 0.6)'
    context.font = `${size * 0.08}px ${KANA_FONT}`
    context.fillText(`№ ${letter.slot + 1} / ${letter.total}`, size / 2, size * 0.9)
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

function anchorPosition(carriage, anchor) {
  const { min, max } = carriage.bounds
  const z = min.z + anchor.t * (max.z - min.z)
  return new THREE.Vector3(anchor.x, anchor.y, z)
}

function buildProp({ carriage, anchor, texture, width, height }) {
  const geometry = new THREE.PlaneGeometry(width, height)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  const world = anchorPosition(carriage, anchor)
  const local = carriage.group.worldToLocal(world.clone())
  mesh.position.copy(local)
  mesh.rotation.y = anchor.face === '+x' ? Math.PI / 2 : -Math.PI / 2
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

export function createTrainClues({ carriages, plan }) {
  const items = []
  const meshes = []

  for (const letter of plan.letters) {
    const carriage = carriages[letter.anchor.car]
    if (!carriage) continue
    const texture = letterTexture({
      char: letter.char,
      romaji: plan.profile.romaji,
      slot: letter.slot,
      total: plan.letters.length,
    })
    const mesh = buildProp({ carriage, anchor: letter.anchor, texture, width: 0.4, height: 0.4 })
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
