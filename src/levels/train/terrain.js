import * as THREE from 'three'

const SCROLL_SPEED = 24
const TAU = Math.PI * 2
const SKY_RADIUS = 200

const LAYERS = [
  {
    name: 'scenery_near',
    style: 'brush',
    color: 0x080d0e,
    distance: 5,
    tile: 30,
    heightScale: 1.0,
    size: [2048, 512],
  },
  {
    name: 'scenery_mid',
    style: 'trees',
    color: 0x0b1215,
    distance: 14,
    tile: 76,
    heightScale: 1.7,
    size: [2048, 1024],
  },
  {
    name: 'scenery_far',
    style: 'hills',
    color: 0x101920,
    distance: 40,
    tile: 170,
    heightScale: 4.2,
    size: [2048, 512],
  },
  {
    name: 'scenery_haze',
    style: 'ridge',
    color: 0x16202a,
    distance: 70,
    tile: 300,
    heightScale: 8.1,
    size: [2048, 512],
  },
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

function makeNoise(rand, baseFrequency, octaves, persistence) {
  const bands = []
  let frequency = baseFrequency
  let amplitude = 1
  let total = 0

  for (let octave = 0; octave < octaves; octave++) {
    const values = new Float32Array(frequency)

    for (let i = 0; i < frequency; i++) {
      values[i] = rand() * 2 - 1
    }

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

      sum += band.amplitude *
        (value + (next - value) * smoothstep(x - index))
    }

    return sum / total
  }
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

    top[x] = at(
      10 + 14 * (0.55 * rolling + 0.45 * ridged * ridged),
    )
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
  hills: hillsProfile,
  ridge: ridgeProfile,
}

function bytesOf(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function createSceneryTexture(layer, seed, frame) {
  let rand = mulberry32(seed * 7919 + 13)

  const { width, height, at } = frame

  // Canvas needs a DOM; headless test runs (node --test) get a flat
  // placeholder so the cards still exist and dispose cleanly.
  if (typeof document === 'undefined') {
    const base = bytesOf(layer.color)
    const data = new Uint8Array(4 * 4)
    for (let i = 0; i < 4; i++) {
      data[i * 4] = base[0]
      data[i * 4 + 1] = base[1]
      data[i * 4 + 2] = base[2]
      data[i * 4 + 3] = 255
    }
    const fallback = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat)
    fallback.needsUpdate = true
    return fallback
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  const vegetation = layer.style === 'brush' || layer.style === 'trees'

  const top = vegetation
    ? new Float32Array(width)
    : PROFILES[layer.style](rand, layer, frame)

  const ground = makeNoise(rand, 9, 5, 0.5)
  const broad = makeNoise(rand, 7, 4, 0.5)
  const fine = makeNoise(rand, 43, 3, 0.5)
  const base = bytesOf(layer.color)
  const haze = [27, 34, 43]
  const air = 1 - Math.exp(-layer.distance * 0.012)
  const pixels = ctx.createImageData(width, height)

  if (vegetation) {
    for (let x = 0; x < width; x++) {
      top[x] = at(
        (layer.style === 'brush' ? -0.5 : 0.3) +
        ground(x / width) * 0.65,
      )
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const below = top[x] - y
      const i = ((height - 1 - y) * width + x) * 4

      const alpha = Math.max(
        0,
        Math.min(1, below / (vegetation ? 1 : 1.8)),
      )

      const u = x / width

      const relief =
        broad(u + y / height * 0.08) * 0.2 +
        fine(u + y / height * 0.025) * 0.09

      const grain = (rand() - 0.5) * 1.7

      const valleyMist =
        air +
        (1 - air) * 0.12 *
        Math.exp(-Math.max(0, y / height) * 5)

      for (let c = 0; c < 3; c++) {
        pixels.data[i + c] = Math.max(
          0,
          base[c] * (1 + relief) * (1 - valleyMist) +
          haze[c] * valleyMist +
          grain,
        )
      }

      pixels.data[i + 3] = Math.round(alpha * 255)
    }
  }

  ctx.putImageData(pixels, 0, 0)

  if (vegetation) {
    const sx = width / layer.tile
    const sy = height / (frame.top - frame.floor)
    const py = y => height - at(y)

    const tint = (lift = 0) => {
      const channels = base.map((v, c) =>
        Math.round(v * (1 - air) + haze[c] * air + lift),
      )

      return `rgb(${channels.join(',')})`
    }

    function line(x1, y1, x2, y2, thickness, shade) {
      ctx.strokeStyle = shade
      ctx.lineWidth = Math.max(0.55, thickness * sx)
      ctx.beginPath()
      ctx.moveTo(x1 * sx, py(y1))
      ctx.lineTo(x2 * sx, py(y2))
      ctx.stroke()
    }

    function crown(x, y, radius, count) {
      for (let j = 0; j < count; j++) {
        const angle = rand() * TAU
        const r = Math.sqrt(rand()) * radius
        const lx = x + Math.cos(angle) * r
        const ly = y + Math.sin(angle) * r * 0.7

        ctx.fillStyle = tint(rand() * 5)
        ctx.globalAlpha = 0.5 + rand() * 0.5
        ctx.beginPath()

        ctx.ellipse(
          lx * sx,
          py(ly),
          (0.035 + rand() * 0.085) * sx,
          (0.045 + rand() * 0.12) * sy,
          rand() * Math.PI,
          0,
          TAU,
        )

        ctx.fill()
      }

      ctx.globalAlpha = 1
    }

    const treeCount = layer.style === 'trees' ? 37 : 65

    for (let i = 0; i < treeCount; i++) {
      const x = rand() * layer.tile

      const desiredHeight = layer.style === 'trees'
        ? 3.5 + rand() * 6.1
        : 0.35 + rand() ** 2 * 2.5

      const h = Math.min(
        desiredHeight,
        Math.max(0.3, frame.top - 0.4) / 1.25,
      )

      const lean = (rand() - 0.5) * h * 0.18
      const branches = []

      for (let j = 0; j < 16; j++) {
        const t = 0.28 + j / 23
        const side = j % 2 ? 1 : -1
        const reach = h * (1 - t) * (0.22 + rand() * 0.25)

        branches.push({
          t,
          dx: lean * t + side * reach,
          dy: h * t + h * (0.08 + rand() * 0.12),
          r: h * (0.08 + rand() * 0.035),
          seed: rand() * 100000,
        })
      }

      const savedRand = rand

      for (const shift of [-layer.tile, 0, layer.tile]) {
        const tx = x + shift

        line(tx, 0, tx + lean, h, h * 0.018, tint())

        for (const branch of branches) {
          line(
            tx + lean * branch.t,
            h * branch.t,
            tx + branch.dx,
            branch.dy,
            h * 0.006,
            tint(1),
          )

          rand = mulberry32(branch.seed)

          crown(
            tx + branch.dx,
            branch.dy,
            branch.r,
            layer.style === 'trees' ? 100 : 38,
          )
        }
      }

      rand = savedRand
    }

    if (layer.style === 'brush') {
      for (let x = 0; x < layer.tile; x += 3.2) {
        line(x, -0.7, x, 1.25, 0.055, tint(1))
      }

      for (const y of [0.45, 0.95]) {
        line(0, y, layer.tile, y, 0.012, tint(2))
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8

  return texture
}

function trainBounds(carriages) {
  const box = new THREE.Box3()

  for (const carriage of carriages) {
    if (carriage?.bounds) box.union(carriage.bounds)
  }

  if (box.isEmpty()) {
    box.set(
      new THREE.Vector3(0, 0, -140),
      new THREE.Vector3(6, 6, 20),
    )
  }

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

    const zReach = Math.sqrt(
      Math.max(1, SKY_RADIUS * SKY_RADIUS - x * x - top * top),
    )

    half = Math.min(half, zReach - Math.abs(centre.z) - 3)
  }

  return Math.max(half, size.z / 2 + 40)
}

export function createTrainTerrain(level, carriages = []) {
  const bounds = trainBounds(carriages)
  const size = bounds.getSize(new THREE.Vector3())
  const centre = bounds.getCenter(new THREE.Vector3())
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
      at: worldY => ((worldY - floor) / height) * config.size[1],
    }

    const texture = createSceneryTexture(config, index + 1, frame)
    texture.repeat.set(length / config.tile, 1)

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false,
    })

    const geometry = new THREE.PlaneGeometry(length, height)

    for (const side of [-1, 1]) {
      const card = new THREE.Mesh(geometry, material)
      card.name = `${config.name}_${side < 0 ? 'left' : 'right'}`
      card.renderOrder = -20 - index
      card.rotation.y = -Math.PI / 2

      card.position.set(
        side < 0
          ? bounds.min.x - config.distance
          : bounds.max.x + config.distance,
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
    if (!Number.isFinite(dt) || dt <= 0) return

    for (const layer of layers) {
      layer.offset = (
        layer.offset + (SCROLL_SPEED * dt) / layer.tile
      ) % 1

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
