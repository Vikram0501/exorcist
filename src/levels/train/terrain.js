import * as THREE from 'three'

// Scenery is a set of flat cards standing parallel to the carriage windows.
// Every card scrolls at the same world speed, so the parallax comes purely
// from how far each card sits from the glass.
const SCROLL_SPEED = 24

const TAU = Math.PI * 2

// Must match SKY_RADIUS of the night sky dome in lighting.js: cards that poke
// through it are hidden behind it.
const SKY_RADIUS = 200

// heightScale is the top of each card measured in carriage heights above the
// floor. Profiles below are authored in world Y so every layer's crest lands
// at a distinct elevation in the window: hedge at the sill, trees above it,
// then the ridge, then the far range, then sky.
const LAYERS = [
  { name: 'scenery_near', style: 'brush', color: 0x04060a, rim: 0x141f33, distance: 5, tile: 30, heightScale: 1.0, size: [2048, 512], fence: 3, poles: 3 },
  { name: 'scenery_mid', style: 'trees', color: 0x060c16, rim: 0x18263e, distance: 14, tile: 76, heightScale: 1.7, size: [1024, 512] },
  { name: 'scenery_far', style: 'hills', color: 0x0a1424, rim: 0x1f3050, distance: 40, tile: 170, heightScale: 4.2, size: [1024, 256] },
  { name: 'scenery_haze', style: 'ridge', color: 0x121d33, rim: 0x243a5c, distance: 70, tile: 300, heightScale: 8.1, size: [512, 256] },
]

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

// Smooth value noise that repeats exactly over u = 0..1, so any profile built
// from it tiles without a seam.
function makeNoise(rand, baseFrequency, octaves, persistence) {
  const bands = []
  let frequency = baseFrequency
  let amplitude = 1
  let total = 0

  for (let octave = 0; octave < octaves; octave++) {
    const values = new Float32Array(frequency)
    for (let i = 0; i < frequency; i++) values[i] = rand() * 2 - 1
    bands.push({ frequency, amplitude, values })
    total += amplitude
    frequency *= 2
    amplitude *= persistence
  }

  return (u) => {
    let sum = 0
    for (const band of bands) {
      const x = u * band.frequency
      const index = Math.floor(x)
      const value = band.values[index % band.frequency]
      const next = band.values[(index + 1) % band.frequency]
      sum += band.amplitude * (value + (next - value) * smoothstep(x - index))
    }
    return sum / total
  }
}

function wrapIndex(x, width) {
  return ((x % width) + width) % width
}

// `top[x]` is the height of the silhouette in rows above the bottom of the
// card, so these stamps all keep the taller of the two.
function stampCircle(top, width, cx, cy, radius) {
  const from = Math.floor(cx - radius)
  const to = Math.ceil(cx + radius)
  for (let x = from; x <= to; x++) {
    const dx = x - cx
    if (Math.abs(dx) > radius) continue
    const y = cy + Math.sqrt(radius * radius - dx * dx)
    const index = wrapIndex(x, width)
    if (y > top[index]) top[index] = y
  }
}

function stampBand(top, width, cx, halfWidth, peak) {
  const from = Math.floor(cx - halfWidth)
  const to = Math.ceil(cx + halfWidth)
  for (let x = from; x <= to; x++) {
    const index = wrapIndex(x, width)
    if (peak > top[index]) top[index] = peak
  }
}

function stampTriangle(top, width, cx, halfWidth, peak, base) {
  const from = Math.floor(cx - halfWidth)
  const to = Math.ceil(cx + halfWidth)
  const drop = peak - base
  for (let x = from; x <= to; x++) {
    const slope = Math.abs(x - cx) / halfWidth
    const y = peak - drop * slope
    const index = wrapIndex(x, width)
    if (y > top[index]) top[index] = y
  }
}

function bump(top, width, cx, radius, peak) {
  stampCircle(top, width, cx, peak - radius, radius)
}

// ── Profiles: authored in world Y through `at()` ────────────────────────────

function brushProfile(rand, config, frame) {
  const { width, height, at } = frame
  const top = new Float32Array(width)
  const groundNoise = makeNoise(rand, 8, 4, 0.5)
  const scrubNoise = makeNoise(rand, 40, 3, 0.55)
  const ground = at(-0.4)

  for (let x = 0; x < width; x++) {
    const u = x / width
    top[x] = ground
      + height * 0.03 * groundNoise(u)
      + height * 0.05 * Math.max(0, scrubNoise(u))
  }

  for (let i = 0; i < 52; i++) {
    bump(top, width, rand() * width, 6 + rand() * 14, at(0.5 + rand() * 1.1))
  }
  for (let i = 0; i < 15; i++) {
    bump(top, width, rand() * width, 16 + rand() * 24, at(1.6 + rand() * 1.5))
  }

  // Fence posts hugging the track: thin, evenly spaced, the fastest thing in
  // frame. A few taller signal poles punctuate the rhythm and stay visible
  // from the upper deck as well.
  const posts = config.fence || 0
  for (let i = 0; i < posts; i++) {
    const cx = ((i + 0.25 + rand() * 0.5) * width) / posts
    stampBand(top, width, cx, 2 + rand() * 2, at(3.0 + rand() * 0.8))
  }

  const poles = config.poles || 0
  for (let i = 0; i < poles; i++) {
    const cx = ((i + 0.3 + rand() * 0.4) * width) / poles
    stampBand(top, width, cx, 3 + rand() * 3, at(4.4 + rand() * 1.4))
  }

  return top
}

function treesProfile(rand, config, frame) {
  const { width, height, at } = frame
  const top = new Float32Array(width)
  const groundNoise = makeNoise(rand, 6, 4, 0.5)
  const ground = at(1.0)

  for (let x = 0; x < width; x++) {
    top[x] = ground + height * 0.02 * groundNoise(x / width)
  }

  const trees = 20
  const span = width / trees

  for (let i = 0; i < trees; i++) {
    const cx = (i + 0.15 + rand() * 0.7) * span

    if (rand() < 0.5) {
      // Conifer: two stacked tiers give the serrated fir outline.
      const crest = at(5.0 + rand() * 4.5)
      const halfWidth = 14 + rand() * 16
      const shoulder = ground + (crest - ground) * 0.62
      stampTriangle(top, width, cx, halfWidth, shoulder, ground)
      stampTriangle(top, width, cx + (rand() - 0.5) * halfWidth * 0.3, halfWidth * 0.62, crest, shoulder - height * 0.03)
      continue
    }

    // Broadleaf: trunk under a lobed canopy.
    const trunkTop = at(2.2 + rand() * 0.9)
    stampBand(top, width, cx, 2 + rand() * 2.5, trunkTop)
    const crest = Math.max(at(5.0 + rand() * 4.5), trunkTop + height * 0.08)
    const radius = 12 + rand() * 14
    const lobes = 3 + Math.floor(rand() * 3)
    for (let lobe = 0; lobe < lobes; lobe++) {
      bump(top, width, cx + (rand() - 0.5) * radius * 2.2, radius, crest - rand() * radius * 1.1)
    }
  }

  for (let i = 0; i < 34; i++) {
    bump(top, width, rand() * width, 4 + rand() * 7, at(1.6 + rand() * 1.3))
  }

  return top
}

function hillsProfile(rand, config, frame) {
  const { at } = frame
  const width = frame.width
  const top = new Float32Array(width)
  const broad = makeNoise(rand, 3, 4, 0.55)
  const detail = makeNoise(rand, 9, 4, 0.5)

  for (let x = 0; x < width; x++) {
    const u = x / width
    const rolling = 0.5 + 0.5 * broad(u)
    const ridged = 1 - Math.abs(detail(u))
    top[x] = at(10 + 14 * (0.55 * rolling + 0.45 * ridged * ridged))
  }

  return top
}

function ridgeProfile(rand, config, frame) {
  const { at } = frame
  const width = frame.width
  const top = new Float32Array(width)
  const range = makeNoise(rand, 2, 3, 0.45)

  for (let x = 0; x < width; x++) {
    const rolling = 0.5 + 0.5 * range(x / width)
    top[x] = at(34 + 14 * rolling)
  }

  return top
}

const PROFILES = {
  brush: brushProfile,
  trees: treesProfile,
  hills: hillsProfile,
  ridge: ridgeProfile,
}

function bytesOf(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function createSceneryTexture(layer, seed, frame) {
  const rand = mulberry32(seed * 7919 + 13)
  const top = PROFILES[layer.style](rand, layer, frame)
  const tone = makeNoise(rand, 5, 3, 0.5)

  const { width, height } = frame
  const base = bytesOf(layer.color)
  const edge = bytesOf(layer.rim)
  const data = new Uint8Array(width * height * 4)

  for (let x = 0; x < width; x++) {
    const ceiling = top[x]
    const shade = 0.82 + 0.36 * (0.5 + 0.5 * tone(x / width))

    for (let y = 0; y < height; y++) {
      const offset = (y * width + x) * 4
      const below = ceiling - y

      if (below <= 0) {
        // Transparent sky carries the rim colour so filtering at the edge
        // cannot pull dark background into the silhouette.
        data[offset] = edge[0]
        data[offset + 1] = edge[1]
        data[offset + 2] = edge[2]
        data[offset + 3] = 0
        continue
      }

      // Moonlight rakes the top few rows; the rest falls off into shadow.
      const lit = shade * (0.55 + 0.45 * Math.min(1, y / Math.max(1, ceiling)))
      const rimMix = Math.max(0, Math.min(1, (4 - below) / 4))

      for (let channel = 0; channel < 3; channel++) {
        const shaded = base[channel] * lit
        data[offset + channel] = Math.round(shaded + (edge[channel] - shaded) * rimMix)
      }
      data[offset + 3] = below >= 1 ? 255 : Math.round(below * 255)
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // The cards are always seen at a grazing angle, so anisotropy is what
  // keeps the silhouette edges from smearing.
  texture.anisotropy = 16
  texture.needsUpdate = true
  return texture
}

function trainBounds(carriages) {
  const box = new THREE.Box3()
  for (const carriage of carriages) {
    if (carriage?.bounds) box.union(carriage.bounds)
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, -140), new THREE.Vector3(6, 6, 20))
  return box
}

function cardHalfLength(bounds, size, centre) {
  let half = (size.z + 140) / 2
  for (const config of LAYERS) {
    const x = Math.max(
      Math.abs(bounds.min.x - config.distance),
      Math.abs(bounds.max.x + config.distance),
    )
    const top = bounds.min.y + size.y * config.heightScale
    const zReach = Math.sqrt(Math.max(1, SKY_RADIUS * SKY_RADIUS - x * x - top * top))
    half = Math.min(half, zReach - Math.abs(centre.z) - 3)
  }
  return Math.max(half, size.z / 2 + 40)
}

export function createTrainTerrain(level, carriages = []) {
  const bounds = trainBounds(carriages)
  const size = bounds.getSize(new THREE.Vector3())
  const centre = bounds.getCenter(new THREE.Vector3())

  // Run well past both ends so the view never runs out of scenery when the
  // player looks along the carriage through a window, but stop short of the
  // night sky dome: anything poking through it would be hidden behind it.
  const length = cardHalfLength(bounds, size, centre) * 2
  const floor = bounds.min.y - 4

  const terrainGroup = new THREE.Group()
  terrainGroup.name = 'train_terrain'

  const layers = []
  const geometries = []
  const materials = []
  const textures = []

  LAYERS.forEach((config, index) => {
    const top = bounds.min.y + size.y * config.heightScale
    const height = top - floor
    const frame = {
      width: config.size[0],
      height: config.size[1],
      floor,
      top,
      at: (worldY) => ((worldY - floor) / height) * config.size[1],
    }

    const texture = createSceneryTexture(config, index + 1, frame)
    texture.repeat.set(length / config.tile, 1)

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // Discard the empty sky rows before they cost a blend.
      alphaTest: 0.01,
      depthWrite: true,
      side: THREE.DoubleSide,
      fog: false,
    })

    const geometry = new THREE.PlaneGeometry(length, height)

    for (const side of [-1, 1]) {
      const card = new THREE.Mesh(geometry, material)
      card.name = `${config.name}_${side < 0 ? 'left' : 'right'}`
      card.rotation.y = -Math.PI / 2
      card.position.set(
        side < 0 ? bounds.min.x - config.distance : bounds.max.x + config.distance,
        floor + height / 2,
        centre.z,
      )
      terrainGroup.add(card)
    }

    geometries.push(geometry)
    materials.push(material)
    textures.push(texture)
    layers.push({ texture, tile: config.tile, offset: 0 })
  })

  level.add(terrainGroup)
  terrainGroup.updateMatrixWorld(true)

  function update(dt) {
    for (const layer of layers) {
      layer.offset = (layer.offset + (SCROLL_SPEED * dt) / layer.tile) % 1
      layer.texture.offset.x = layer.offset
    }
  }

  function dispose() {
    level.remove(terrainGroup)
    terrainGroup.clear()
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    for (const texture of textures) texture.dispose()
    geometries.length = 0
    materials.length = 0
    textures.length = 0
    layers.length = 0
  }

  return { terrainGroup, update, dispose }
}
