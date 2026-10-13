import * as THREE from 'three'
import { trainFloorAt } from './zombie.js'
import { RITE_SEAL } from './story-data.js'

const DECK_FALLBACK = 0.4
const SEAL_LIFT = 0.02
const SEAL_RADIUS = 1.05
const SEAL_SEGMENTS = 64
const CANDLE_COUNT = 6
const CANDLE_HEIGHT = 0.14
const CANDLE_WIDTH = 0.035
const FLAME_RADIUS = 0.03
const GLOW_COLOR = 0xff7a3a
const GLOW_INTENSITY = 2.4
const GLOW_DISTANCE = 8
const GLOW_HEIGHT = 0.9
const TEXTURE_SIZE = 512
const TICKS = 36

function makeTexture(draw, size = TEXTURE_SIZE) {
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

function sealTexture() {
  return makeTexture((context, size) => {
    const centre = size / 2
    const ring = size * 0.44
    const inner = ring * 0.84

    context.strokeStyle = 'rgba(236, 228, 210, 0.6)'
    context.lineWidth = size * 0.014
    context.beginPath()
    context.arc(centre, centre, ring, 0, Math.PI * 2)
    context.stroke()

    context.lineWidth = size * 0.005
    context.beginPath()
    context.arc(centre, centre, inner, 0, Math.PI * 2)
    context.stroke()

    context.lineCap = 'round'
    for (let i = 0; i < TICKS; i++) {
      const angle = (i / TICKS) * Math.PI * 2
      const reach = ring * (i % 3 === 0 ? 0.62 : 0.72)
      context.strokeStyle = i % 3 === 0
        ? 'rgba(196, 42, 32, 0.8)'
        : 'rgba(236, 228, 210, 0.5)'
      context.lineWidth = size * (i % 3 === 0 ? 0.01 : 0.006)
      context.beginPath()
      context.moveTo(centre + Math.cos(angle) * reach, centre + Math.sin(angle) * reach)
      context.lineTo(centre + Math.cos(angle) * inner, centre + Math.sin(angle) * inner)
      context.stroke()
    }

    context.strokeStyle = 'rgba(196, 42, 32, 0.85)'
    context.lineWidth = size * 0.009
    context.beginPath()
    context.moveTo(centre - ring * 0.34, centre)
    context.lineTo(centre + ring * 0.34, centre)
    context.moveTo(centre, centre - ring * 0.34)
    context.lineTo(centre, centre + ring * 0.34)
    context.stroke()

    let seed = 91
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    context.fillStyle = 'rgba(16, 12, 10, 0.5)'
    for (let i = 0; i < 90; i++) {
      const angle = rand() * Math.PI * 2
      const radius = ring * 0.15 + rand() * ring * 0.85
      const speck = size * (0.002 + rand() * 0.006)
      context.beginPath()
      context.arc(centre + Math.cos(angle) * radius, centre + Math.sin(angle) * radius, speck, 0, Math.PI * 2)
      context.fill()
    }
  })
}

function frontCarriage(carriages) {
  let front = null
  for (const carriage of carriages) {
    if (!carriage?.bounds) continue
    if (!front || carriage.bounds.max.z > front.bounds.max.z) front = carriage
  }
  return front
}

export function createExorcismChamber({ carriages = [], colliders = null } = {}) {
  const carriage = frontCarriage(carriages)
  if (!carriage) return null

  const { min, max } = carriage.bounds
  const anchor = RITE_SEAL.anchor
  const world = new THREE.Vector3(anchor.x, 0, min.z + anchor.t * (max.z - min.z))
  const deck = colliders ? trainFloorAt(colliders, world.x, world.z) : 0
  world.y = (deck > 0.05 ? deck : DECK_FALLBACK) + SEAL_LIFT

  const root = new THREE.Group()
  root.name = 'train-rite-chamber'
  root.position.copy(carriage.group.worldToLocal(world.clone()))

  const disposables = []

  const texture = sealTexture()
  const sealGeometry = new THREE.CircleGeometry(SEAL_RADIUS, SEAL_SEGMENTS)
  const sealMaterial = new THREE.MeshStandardMaterial({
    map: texture || null,
    color: texture ? 0xffffff : 0xb9a98d,
    emissive: new THREE.Color(0x4a140d),
    emissiveMap: texture || null,
    emissiveIntensity: 1.1,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.95,
    metalness: 0,
  })
  const seal = new THREE.Mesh(sealGeometry, sealMaterial)
  seal.name = 'train-rite-seal'
  seal.rotation.set(-Math.PI / 2, 0, 0)
  seal.renderOrder = 2
  root.add(seal)
  disposables.push(sealGeometry, sealMaterial, texture)

  const candleGeometry = new THREE.CylinderGeometry(CANDLE_WIDTH, CANDLE_WIDTH * 1.3, CANDLE_HEIGHT, 8)
  const waxMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d0bb, roughness: 0.95, metalness: 0 })
  const flameGeometry = new THREE.SphereGeometry(FLAME_RADIUS, 8, 6)
  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0x20090a,
    emissive: new THREE.Color(0xffa04a),
    emissiveIntensity: 3,
    roughness: 1,
    metalness: 0,
  })
  disposables.push(candleGeometry, waxMaterial, flameGeometry, flameMaterial)

  for (let i = 0; i < CANDLE_COUNT; i++) {
    const angle = (i / CANDLE_COUNT) * Math.PI * 2
    const x = Math.cos(angle) * SEAL_RADIUS
    const z = Math.sin(angle) * SEAL_RADIUS

    const wax = new THREE.Mesh(candleGeometry, waxMaterial)
    wax.position.set(x, CANDLE_HEIGHT / 2, z)
    root.add(wax)

    const flame = new THREE.Mesh(flameGeometry, flameMaterial)
    flame.position.set(x, CANDLE_HEIGHT + FLAME_RADIUS * 0.5, z)
    flame.scale.set(1, 1.6, 1)
    root.add(flame)
  }

  const glow = new THREE.PointLight(GLOW_COLOR, GLOW_INTENSITY, GLOW_DISTANCE, 2)
  glow.name = 'train_rite_glow'
  glow.castShadow = false
  glow.position.set(0, GLOW_HEIGHT, 0)
  root.add(glow)

  carriage.group.add(root)

  const item = {
    id: RITE_SEAL.id,
    title: RITE_SEAL.title,
    foundAt: RITE_SEAL.foundAt,
    storyNote: RITE_SEAL.storyNote,
    riteNote: RITE_SEAL.riteNote,
    object: root,
    story: true,
    kind: 'rite',
    position: world.clone(),
  }

  return {
    item,
    root,
    carriage,
    position: world.clone(),
    dispose() {
      root.removeFromParent()
      root.clear()
      for (const disposable of disposables) disposable?.dispose?.()
    },
  }
}
