import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// The spawn is s=0. A short lead-in puts START in the chase camera's view
// instead of overhead/behind it during the countdown. Presentation only.
export const START_BANNER_DISTANCE = 12
export const BANNER_WIDTH = 16
export const BANNER_HEIGHT = 2.5
export const BANNER_CLEARANCE = 4.8
export const BANNER_POST_OFFSET = 8.3

function bannerTexture(label) {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#14191a'
  ctx.fillRect(0, 0, 2048, 320)
  ctx.strokeStyle = '#806044'
  ctx.lineWidth = 12
  ctx.strokeRect(6, 6, 2036, 308)
  // Worn amber safety edging, checkered wings and restrained rust chips.
  // Damage stays out of the lettering so the word is readable at speed.
  ctx.fillStyle = '#c5a65e'
  ctx.fillRect(24, 24, 2000, 8)
  ctx.fillRect(24, 288, 2000, 8)
  for (const x0 of [40, 1816]) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#202526' : '#eee7d2'
        ctx.fillRect(x0 + col * 64, 40 + row * 60, 64, 60)
      }
    }
  }
  for (let i = 0; i < 38; i++) {
    const x = 28 + (i * 193) % 1980
    const y = i % 2 ? 15 : 302
    ctx.fillStyle = i % 3 ? '#35241d' : '#a27850'
    ctx.fillRect(x, y, 12 + i % 23, 3 + i % 6)
  }
  ctx.fillStyle = '#e6ded0'
  for (const x of [22, 256, 1792, 2026]) {
    for (const y of [48, 272]) ctx.fillRect(x - 3, y - 3, 6, 6)
  }
  ctx.font = '900 220px "Arial Black", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f5f0df'
  ctx.fillText(label, 1024, 169, 1480)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.name = `${label.toLowerCase()}BannerTexture`
  return texture
}

export function createRaceBanner(track, progress, label) {
  const frame = track.sampleAt(progress)
  const group = new THREE.Group()
  group.name = `racecraft${label === 'START' ? 'Start' : 'Finish'}Gantry`
  group.userData = { progress, label, visualOnly: true }
  group.position.copy(frame.position)
  // PlaneGeometry's visible front is +Z. Point it BACK up-track. Local +X
  // then points to the approaching driver's right: normal canvas UVs read
  // left-to-right. No negative scales and no mirrored DoubleSide backs.
  group.rotation.y = frame.angle + Math.PI

  const footHeights = [-1, 1].map(side =>
    track.toWorld(progress, side * BANNER_POST_OFFSET).y - frame.position.y)
  const highestRoad = Math.max(...[-7, 0, 7].map(d =>
    track.toWorld(progress, d).y - frame.position.y))
  const bottom = highestRoad + BANNER_CLEARANCE
  const top = bottom + BANNER_HEIGHT
  const parts = []
  function box(w, h, depth, x, y, z) {
    const geometry = new THREE.BoxGeometry(w, h, depth)
    geometry.translate(x, y, z)
    parts.push(geometry)
  }
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const x = side * BANNER_POST_OFFSET
    const foot = footHeights[i]
    box(0.4, top - foot + 0.15, 0.5, x, (top + foot) / 2, 0)
    box(0.7, 0.25, 0.8, x, foot + 0.125, 0)
  }
  box(17, 0.18, 0.5, 0, top + 0.04, 0)
  box(17, 0.18, 0.5, 0, bottom - 0.04, 0)
  box(BANNER_WIDTH, BANNER_HEIGHT, 0.18, 0, bottom + BANNER_HEIGHT / 2, 0)
  const geometry = mergeGeometries(parts)
  parts.forEach(part => part.dispose())
  const steel = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x635041, roughness: 0.94, metalness: 0.25,
    emissive: 0x302018, emissiveIntensity: 0.25,
  }))
  steel.name = 'raceBannerFrame'
  group.add(steel)

  // Unlit, untone-mapped lettering keeps bone-white contrast under the red
  // sky. Fog is disabled only on the board, not on the road or supporting
  // structure. Normal depth testing still lets real geometry occlude it.
  const material = new THREE.MeshBasicMaterial({
    map: bannerTexture(label), toneMapped: false, fog: false,
    side: THREE.FrontSide,
  })
  const faceGeometry = new THREE.PlaneGeometry(BANNER_WIDTH, BANNER_HEIGHT)
  for (const side of [1, -1]) {
    const face = new THREE.Mesh(faceGeometry, material)
    face.name = side === 1 ? 'raceBannerApproachFace' : 'raceBannerReverseFace'
    face.position.set(0, bottom + BANNER_HEIGHT / 2, side * 0.101)
    if (side === -1) face.rotation.y = Math.PI
    group.add(face)
  }
  return group
}
