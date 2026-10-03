import * as THREE from 'three'
import { asTrack, FRAME_TANGENT_HALF } from './track.js'


// ============================================
// CONSTANTS
// ============================================

const FOG_COLOR = 0x160809
const FOG_DENSITY_BASE = 0.014
const FOG_DENSITY_FAR = 0.026

const HEADLIGHT_COLOR = 0xFFF4D0
const HEADLIGHT_INTENSITY = 45
const HEADLIGHT_DISTANCE = 50
const HEADLIGHT_ANGLE = Math.PI / 6
const HEADLIGHT_PENUMBRA = 0.4
const HEADLIGHT_DECAY = 1.0

const SILHOUETTE_COUNT = 36
const MIST_LAYER_COUNT = 3
const MIST_INSTANCES_PER_LAYER = 80
const TOTAL_MIST_INSTANCES =
  MIST_LAYER_COUNT * MIST_INSTANCES_PER_LAYER
const GUARDRAIL_COUNT = 100
const MILE_MARKER_COUNT = 40
const ABANDONED_CAR_COUNT = 12
const DEBRIS_COUNT = 60

const ROAD_WIDTH = 14
const ROAD_LENGTH = 950
const ROAD_CENTER_Z = -465
const ROAD_MAX_Z = 10
const ROAD_MIN_Z = -940

const HORROR_BUILD_START_Z = -80
const HORROR_BUILD_END_Z = -800

// The city block is wider than it is deep and faces its -X edge to the road.
// Sections are pushed outward until that edge clears the safe corridor, so the
// clearance is a guarantee rather than an offset that depends on the model.
const CITY_MODEL_SCALE = 1.5
const CITY_Y_OFFSET = -0.15 // Outer ground top: keeps bases out of the air.
const CITY_SAFE_ROAD_CLEARANCE = 17
const CITY_OPEN_SECTION_CLEARANCE = 27
const CITY_CLEARANCE_VARIATION = 1.5
const CITY_CLEARANCE_TOLERANCE = 0.02
const CITY_FOOTPRINT_STEP = 1
// Flipped blocks alternate with upright ones and the two footprints reach in
// opposite directions, so each gap is keyed to the block just placed: an
// upright block's main mass ends about 11 units ahead of its origin, and the
// next (rotated) block reaches its mass back about 11 units, so the tight gap
// still leaves a metre of overlap. After a rotated block the mass reaches
// about 16 units ahead plus the outlying group near 24, so the gap stays wide
// while the next block's trailing outlying group keeps the street wall solid.
// Both combinations keep the footprints overlapping, so the street wall never
// opens a section-sized hole.
const CITY_SEGMENT_LENGTH = 25 // After a rotated block.
const CITY_SPACING_VARIATION = 1.2
const CITY_SEGMENT_LENGTH_TIGHT = 20 // After an upright block.
const CITY_SPACING_VARIATION_TIGHT = 0.7
const CITY_SCALE_VARIATION = 0.02
const CITY_DRAW_DISTANCE = 140
const CITY_END_CUSHION = 18
// Tangent half-window moved to track.js (FRAME_TANGENT_HALF); kept in sync.
const CITY_SIDES = [-1, 1]

// Streetlight poles follow the same path-frame convention as the barriers
// and city: each pole origin sits on the path plus a lateral offset, with
// the lamp arm yawed toward the road. The baked template's arm extends
// along local +X, so rotation.y = frame.angle faces +X at the road for the
// +1 side and +PI turns it around for the -1 side.
const STREETLIGHT_OFFSET = 9
const STREETLIGHT_SPACING_STRAIGHT = 40
const STREETLIGHT_SPACING_CORNER = 20
const STREETLIGHT_CORNER_BANK = (3.5 * Math.PI) / 180
const STREETLIGHT_START = 15
const STREETLIGHT_END_CUSHION = 10
const STREETLIGHT_MIN_CLEARANCE = 8
const STREETLIGHT_DRAW_DISTANCE = 140
const STREETLIGHT_Y_OFFSET = 0
const STREETLIGHT_SIDES = [-1, 1]

// Pooled local illumination for the lamp corridor: a few shadowless red
// point lights reassigned to the nearest poles ahead of the player, so the
// road reads as pools of light in the dark. Never one light per pole.
const STREETLIGHT_POOL_COUNT = 3
const STREETLIGHT_POOL_COLOR = 0xff5533
const STREETLIGHT_POOL_INTENSITY = 45
const STREETLIGHT_POOL_DISTANCE = 28
const STREETLIGHT_POOL_DECAY = 1.8
const STREETLIGHT_POOL_HEIGHT = 5.2
const STREETLIGHT_POOL_RESCAN = 0.4
const STREETLIGHT_POOL_RANGE = 130


// ============================================
// HELPERS
// ============================================

function hash(n) {
  const x =
    Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}


function hashRange(seed, min, max) {
  return min + hash(seed) * (max - min)
}


function noise2D(x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy

  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)

  const n00 = hash(ix + iy * 157)
  const n10 = hash(ix + 1 + iy * 157)
  const n01 = hash(ix + (iy + 1) * 157)
  const n11 = hash(ix + 1 + (iy + 1) * 157)

  const nx0 = n00 + (n10 - n00) * sx
  const nx1 = n01 + (n11 - n01) * sx

  return nx0 + (nx1 - nx0) * sy
}


function fbm(x, y, octaves) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    value +=
      amplitude * noise2D(x * frequency, y * frequency)
    amplitude *= 0.5
    frequency *= 2
  }
  return value
}


function horrorFactor(z) {
  const t =
    Math.max(
      0,
      Math.min(
        1,
        (z - HORROR_BUILD_END_Z) /
          (HORROR_BUILD_START_Z - HORROR_BUILD_END_Z)
      )
    )
  return t * t
}


// ============================================
// MATERIAL BUILDERS
// ============================================

function buildShoulderMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x141010,
    roughness: 0.95,
    metalness: 0,
  })
}


function buildGuardrailMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x2a1a0a,
    roughness: 0.85,
    metalness: 0.35,
  })
}


function buildAbandonedCarBodyMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.85,
    metalness: 0.15,
  })
}


function buildAbandonedCarRoofMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x0f0f0f,
    roughness: 0.9,
    metalness: 0.1,
  })
}


function buildMileMarkerMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.8,
    metalness: 0.1,
  })
}


function buildDebrisMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x1a1510,
    roughness: 0.95,
    metalness: 0.05,
  })
}


function buildSilhouetteMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x050508,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
}


function buildMistMaterial(layer) {
  const colors = [0x556677, 0x667788, 0x445566]
  const opacities = [0.07, 0.05, 0.09]
  return new THREE.MeshBasicMaterial({
    color: colors[layer % 3],
    transparent: true,
    opacity: opacities[layer % 3],
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
}


// ============================================
// GEOMETRY BUILDERS
// ============================================

function createAbandonedCarGroup(
  bodyMat,
  roofMat
) {
  const group = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 3.5),
    bodyMat
  )
  body.position.y = 0.45
  body.castShadow = true
  group.add(body)

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.4, 1.5),
    roofMat
  )
  roof.position.set(0, 0.9, -0.3)
  roof.castShadow = true
  group.add(roof)

  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    roughness: 0.9,
  })

  const wheelGeo =
    new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8)

  const offsets = [
    [-0.85, 0.25, 0.9],
    [0.85, 0.25, 0.9],
    [-0.85, 0.25, -0.9],
    [0.85, 0.25, -0.9],
  ]

  for (const [wx, wy, wz] of offsets) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(wx, wy, wz)
    group.add(wheel)
  }

  return group
}


function createSilhouetteGeometry() {
  const group = new THREE.Group()

  const bodyGeo =
    new THREE.CylinderGeometry(0.12, 0.15, 1.6, 5)
  const bodyMat = buildSilhouetteMaterial()
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 0.8
  group.add(body)

  const headGeo =
    new THREE.SphereGeometry(0.15, 6, 4)
  const head = new THREE.Mesh(headGeo, bodyMat)
  head.position.y = 1.75
  group.add(head)

  return group
}


// ============================================
// ENVIRONMENT MANAGER
// ============================================

export class HighwayEnvironmentManager {

  constructor({
    scene,
    highwayGroup,
    playerCar,
    moonLight,
    cityBuildings,
    streetlights,
    roadPath,
    arcLengths,
    track,
  }) {

    this.scene = scene
    this.highwayGroup = highwayGroup
    this.playerCar = playerCar
    this.moonLight = moonLight

    this.cityTemplate = cityBuildings || null
    this.streetlightTemplate = streetlights || null
    // Single source of truth for path sampling. Accepts a Track or
    // legacy (roadPath, arcLengths); legacy fields kept for compat.
    this.track = track || asTrack(roadPath, arcLengths)
    this.roadPath = this.track.points
    this.arcLengths = this.track.arcLengths

    this.group = new THREE.Group()
    this.group.name = 'highwayEnvironment'
    this.highwayGroup.add(this.group)

    this.leftLight = null
    this.rightLight = null
    this.leftTarget = null
    this.rightTarget = null
    this.leftCone = null
    this.rightCone = null

    this.fillLight = null
    this.rimLight = null

    this.mistLayers = []
    this.mistLayerData = []

    this.cityGroup = null
    this.citySections = []

    this.streetlightGroup = null
    this.streetlightPoles = []
    this.streetlightPool = []
    this.streetlightPoolTimer = 0

    this.sharedMaterials = []

    this.disturbanceTimer = 0
    this.disturbanceInterval = 15
    this.activeDisturbance = null
    this.disturbanceDuration = 0

    this.silhouetteMeshes = []
    this.silhouetteData = []

    this.disposed = false

    this.setupFog()
    this.setupHeadlights()
    this.setupCrimsonHemi()
    this.setupCinematicLights()
    this.setupShoulders()
    this.setupCity()
    this.setupStreetlights()
    this.setupGroundMist()
    this.setupSilhouettes()
    this.setupRoadsideClutter()
    this.setupDebris()
    this.setupShadowFollowing()
  }


  // ============================================
  // PATH HELPERS
  // ============================================

  getPathSample(distance) {
    // Delegates to the shared Track (positions unchanged).
    if (!this.track) {
      return new THREE.Vector3(0, 0, -465)
    }
    return this.track.sampleAt(distance).position.clone()
  }


  // ============================================
  // FOG
  // ============================================

  setupFog() {
    this.scene.fog =
      new THREE.FogExp2(FOG_COLOR, FOG_DENSITY_BASE)
  }


  // ============================================
  // HEADLIGHTS
  // ============================================

  setupHeadlights() {

    const coneGeo =
      new THREE.ConeGeometry(3.5, 35, 16, 1, true)

    const positions =
      coneGeo.getAttribute('position')

    const colors = new Float32Array(
      positions.count * 3
    )

    for (
      let i = 0;
      i < positions.count;
      i++
    ) {
      const y = positions.getY(i)
      const t = (y + 17.5) / 35
      const brightness =
        t * t * t
      colors[i * 3] = brightness
      colors[i * 3 + 1] = brightness * 0.95
      colors[i * 3 + 2] = brightness * 0.8
    }

    coneGeo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        colors,
        3
      )
    )

    const coneMat =
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })

    this.sharedMaterials.push(coneMat)

    const lightMat =
      new THREE.MeshBasicMaterial({
        color: HEADLIGHT_COLOR,
      })

    this.sharedMaterials.push(lightMat)


    const createHeadlight = (side) => {

      const light =
        new THREE.SpotLight(
          HEADLIGHT_COLOR,
          HEADLIGHT_INTENSITY
        )

      light.angle = HEADLIGHT_ANGLE
      light.penumbra = HEADLIGHT_PENUMBRA
      light.decay = HEADLIGHT_DECAY
      light.distance = HEADLIGHT_DISTANCE
      light.castShadow = false

      const target = new THREE.Object3D()
      light.target = target

      this.group.add(light)
      this.group.add(target)

      const cone =
        new THREE.Mesh(coneGeo, coneMat)
      this.group.add(cone)

      const bulb =
        new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 6),
          lightMat
        )
      this.group.add(bulb)

      return { light, target, cone, bulb }
    }

    const left = createHeadlight(-1)
    const right = createHeadlight(1)

    this.leftLight = left.light
    this.leftTarget = left.target
    this.leftCone = left.cone
    this.leftBulb = left.bulb

    this.rightLight = right.light
    this.rightTarget = right.target
    this.rightCone = right.cone
    this.rightBulb = right.bulb
  }


  // ============================================
  // CRIMSON SKY FILL
  // ============================================

  // Faint red sky-bounce so building faces and zombie sides keep detail
  // instead of crushing to black. No shadows, fixed cost.
  setupCrimsonHemi() {

    const hemi = new THREE.HemisphereLight(
      0x74444c,
      0x0d0a09,
      0.45
    )
    hemi.name = 'crimsonSkyFill'

    this.group.add(hemi)
  }


  // ============================================
  // CINEMATIC FILL + RIM
  // ============================================

  // Two shadowless directionals that follow the player: a desaturated warm
  // fill from the camera side recovers texture detail (faces, bodywork,
  // facades, wire), while a low crimson rim from down-road edges zombies
  // and cars against the dark. Neither casts shadows; fixed per-frame cost.
  setupCinematicLights() {

    this.fillLight = new THREE.DirectionalLight(
      0xbfb6ae,
      0.55
    )
    this.fillLight.name = 'neutralFill'

    this.rimLight = new THREE.DirectionalLight(
      0xd42a2a,
      0.9
    )
    this.rimLight.name = 'redRim'

    this.group.add(this.fillLight)
    this.group.add(this.fillLight.target)
    this.group.add(this.rimLight)
    this.group.add(this.rimLight.target)
  }


  // ============================================
  // SHOULDERS (track-following ribbons)
  // ============================================

  // Flat ribbons hugging the smooth bends: inner asphalt edge plus outer
  // ground, mirroring the historical straight-slab layout (shoulders span
  // lateral 7..20, outer ground 23.5..43.5) so only curvature changes.
  buildTrackRibbon(innerD, outerD, y, material, step = 4) {
    const totalLength = this.track.totalLength
    const rows = Math.max(2, Math.ceil(totalLength / step) + 1)
    const vertices = new Float32Array(rows * 2 * 3)
    const uvs = new Float32Array(rows * 2 * 2)
    const indices = []

    for (let row = 0; row < rows; row++) {
      const s = Math.min(row * step, totalLength)
      const inner = this.track.toWorld(s, innerD, y)
      const outer = this.track.toWorld(s, outerD, y)
      vertices.set([inner.x, inner.y, inner.z], row * 6)
      vertices.set([outer.x, outer.y, outer.z], row * 6 + 3)
      uvs.set([0, s / 10], row * 4)
      uvs.set([1, s / 10], row * 4 + 2)
      if (row > 0) {
        const base = (row - 1) * 2
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    return mesh
  }

  setupShoulders() {

    const mat = buildShoulderMaterial()
    this.sharedMaterials.push(mat)

    for (const side of [1, -1]) {
      const shoulder = this.buildTrackRibbon(
        side * 7, side * 20, -0.12, mat
      )
      shoulder.material.side = THREE.DoubleSide
      this.group.add(shoulder)
    }

    const outerMat =
      new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.98,
        metalness: 0,
      })
    this.sharedMaterials.push(outerMat)

    for (const side of [1, -1]) {
      const outer = this.buildTrackRibbon(
        side * 23.5, side * 43.5, -0.2, outerMat
      )
      outer.material.side = THREE.DoubleSide
      this.group.add(outer)
    }
  }


  // ============================================
  // CITY
  // ============================================

  setupCity() {

    if (!this.cityTemplate) return

    const box = this.cityTemplate.userData.cityBox

    if (!box) return

    const totalLength =
      this.arcLengths[this.arcLengths.length - 1]

    if (!totalLength) return

    this.cityGroup = new THREE.Group()
    this.cityGroup.name = 'cityEnvironment'
    this.group.add(this.cityGroup)

    for (const side of CITY_SIDES) {

      let distance = 0
      let index = 0

      while (distance < totalLength + CITY_END_CUSHION) {

        // Alternating blocks swap which end carries the outlying group, and
        // the left/right sides run in opposite phase so the two walls do not
        // read as mirror copies.
        const sideParity = side > 0 ? 1 : 0
        const parity =
          (sideParity + (index % 2 === 1 ? 1 : 0)) % 2

        this.addCitySection(side, index, distance, box, parity)

        // The gap depends on the block just placed; see the constants above.
        const tight = parity === 0
        const segment = tight
          ? CITY_SEGMENT_LENGTH_TIGHT
          : CITY_SEGMENT_LENGTH
        const variation = tight
          ? CITY_SPACING_VARIATION_TIGHT
          : CITY_SPACING_VARIATION

        distance += segment + hashRange(
          index * 3.7 + side * 11.3,
          -variation,
          variation
        )

        index += 1

      }

    }

    console.log(
      'City environment:',
      this.citySections.length,
      'sections'
    )
  }


  // Built once here: the race only toggles visibility, and a restart builds
  // from a freshly loaded template instead of reusing anything stale.
  addCitySection(side, index, distance, box, parity) {

    const frame = this.getCityFrame(distance)

    // Alternating blocks swap which end carries the outlying group, so the
    // repeated model does not read as one stamped strip. `parity` comes from
    // the caller because it also decides the gap to the next block.
    const scale = CITY_MODEL_SCALE * (
      1 + hashRange(
        index * 9.3 + side * 4.7,
        -CITY_SCALE_VARIATION,
        CITY_SCALE_VARIATION
      )
    )

    // Composition varies by track section: open vistas at the crest,
    // downhill reveal, hero corner and fast run (the road silhouette
    // stays visible), tighter urban walls elsewhere. Never below the
    // safe road clearance the tests enforce.
    const progress01 =
      this.track.getProgress01(distance)
    const openSection =
      (progress01 > 0.30 && progress01 < 0.42) || // crest
      (progress01 > 0.44 && progress01 < 0.56) || // downhill reveal
      (progress01 > 0.62 && progress01 < 0.76) || // hero drift corner
      (progress01 > 0.78 && progress01 < 0.90) // fast run
    const baseClearance = openSection
      ? CITY_OPEN_SECTION_CLEARANCE
      : CITY_SAFE_ROAD_CLEARANCE
    const clearance = baseClearance + hashRange(
      index * 5.1 + side * 7.9,
      0,
      CITY_CLEARANCE_VARIATION
    )

    const section = this.cityTemplate.clone()

    section.name =
      `citySection_${side > 0 ? 'right' : 'left'}_${index}`
    section.rotation.y =
      frame.angle + (parity === 1 ? Math.PI : 0)
    section.scale.setScalar(scale)
    // Base rides the elevation: the offset is relative to the track
    // height at this distance, not a hardcoded world Y.
    const cityGroundY =
      this.track.sampleAt(distance).position.y
    section.position.set(
      frame.x,
      cityGroundY + CITY_Y_OFFSET,
      frame.z
    )

    this.cityGroup.add(section)
    section.updateMatrixWorld(true)

    this.settleCitySection(
      section, box, frame, side, clearance
    )

    // Cross-slope seating: blocks sit wide of the centreline, so re-seat
    // the base on the banked cross-section at the settled lateral
    // offset. The block itself stays world-upright: buildings never tilt.
    {
      const anchor = this.track.sampleAt(distance)
      const dx = section.position.x - anchor.position.x
      const dz = section.position.z - anchor.position.z
      const dActual =
        dx * anchor.lateral.x + dz * anchor.lateral.z
      section.position.y =
        anchor.position.y +
        anchor.lateral.y * dActual +
        CITY_Y_OFFSET
      section.updateMatrixWorld(true)
    }

    this.citySections.push(section)
  }


  // A block is straight and the road bends under it, so placement starts from
  // the frame and then measures the whole footprint against the path until
  // every corner is at the safe distance.
  settleCitySection(section, box, frame, side, clearance) {

    const near =
      this.measureCityNearEdge(section, box, frame, side)
    let shift = side * clearance - near

    for (let attempt = 0; attempt < 4; attempt++) {

      section.position.x += frame.perpX * shift
      section.position.z += frame.perpZ * shift
      section.updateMatrixWorld(true)

      const gap =
        clearance - this.measureCityClearance(section, box)

      if (gap <= CITY_CLEARANCE_TOLERANCE) return

      shift = side * gap

    }
  }


  measureCityNearEdge(section, box, frame, side) {

    const corners = [
      new THREE.Vector3(box.min.x, 0, box.min.z),
      new THREE.Vector3(box.max.x, 0, box.min.z),
      new THREE.Vector3(box.min.x, 0, box.max.z),
      new THREE.Vector3(box.max.x, 0, box.max.z),
    ]

    let nearest = side < 0 ? -Infinity : Infinity

    for (const corner of corners) {

      corner.applyMatrix4(section.matrixWorld)

      const along =
        (corner.x - frame.x) * frame.perpX +
        (corner.z - frame.z) * frame.perpZ

      nearest = side < 0
        ? Math.max(nearest, along)
        : Math.min(nearest, along)

    }

    return nearest
  }


  measureCityClearance(section, box) {

    const corners = [
      [box.min.x, box.min.z],
      [box.max.x, box.min.z],
      [box.max.x, box.max.z],
      [box.min.x, box.max.z],
    ]

    const point = new THREE.Vector3()
    let nearest = Infinity

    for (let i = 0; i < corners.length; i++) {

      const [fromX, fromZ] = corners[i]
      const [toX, toZ] = corners[(i + 1) % corners.length]

      const edgeLength =
        Math.hypot(toX - fromX, toZ - fromZ)
      const steps = Math.max(
        1,
        Math.ceil(edgeLength / CITY_FOOTPRINT_STEP)
      )

      for (let step = 0; step <= steps; step++) {

        const t = step / steps

        point.set(
          fromX + (toX - fromX) * t,
          0,
          fromZ + (toZ - fromZ) * t
        )
        point.applyMatrix4(section.matrixWorld)

        const distance =
          this.distanceToPath(point.x, point.z)

        if (distance < nearest) {
          nearest = distance
        }

      }

    }

    return nearest
  }


  // Exact distance to the path polyline: sampling it would blur the corners
  // the block has to stay away from.
  distanceToPath(x, z) {
    // Delegates to the shared Track (mathematics unchanged).
    return this.track.distanceToPath(x, z)
  }


  // Path position, travel yaw and the perpendicular both sides are measured
  // against, taken from the same convention as the barriers and cars.
  getCityFrame(distance) {
    // Routed through the shared Track. Tangent window (±4 m) and
    // perpendicular convention preserved exactly.
    const totalLength = this.track.totalLength

    const tangentAt = Math.min(
      Math.max(distance, FRAME_TANGENT_HALF),
      totalLength - FRAME_TANGENT_HALF
    )

    const behind =
      this.track.sampleAt(tangentAt - FRAME_TANGENT_HALF).position
    const ahead =
      this.track.sampleAt(tangentAt + FRAME_TANGENT_HALF).position
    const origin = this.track.sampleAt(distance).position

    const dx = ahead.x - behind.x
    const dz = ahead.z - behind.z
    const length = Math.sqrt(dx * dx + dz * dz) || 1
    const dirX = dx / length
    const dirZ = dz / length

    return {
      x: origin.x,
      z: origin.z,
      angle: Math.atan2(dirX, dirZ),
      perpX: -dirZ,
      perpZ: dirX,
    }
  }


  // ============================================
  // STREETLIGHTS
  // ============================================

  // Built once here: the race only toggles visibility. Poles clone one
  // prepared template, so geometry/materials are shared across the corridor
  // and disposed by the normal group traversal. Placement walks each side of
  // the path at a fixed arc-distance pitch with the two sides staggered, so
  // lamps read as a deliberate corridor rather than scattered props.
  setupStreetlights() {

    if (!this.streetlightTemplate) return

    const totalLength =
      this.arcLengths[this.arcLengths.length - 1]

    if (!totalLength) return

    this.streetlightGroup = new THREE.Group()
    this.streetlightGroup.name = 'streetlightEnvironment'
    this.group.add(this.streetlightGroup)

    // Rhythmic placement: tighter pitch through corners (lamps trace
    // the bends), wider on fast straights, outside-of-corner emphasis
    // where the banking reads. Never fully symmetric: the varying pitch
    // keeps the corridor apocalyptic, not runway-like.
    let distance = STREETLIGHT_START
    let index = 0
    let straightSide = -1

    while (
      distance <
      totalLength - STREETLIGHT_END_CUSHION
    ) {

      const bank = this.track.sampleBank(distance)
      const inCorner =
        Math.abs(bank) > STREETLIGHT_CORNER_BANK
      // Cornered bends get lamps on the outer side so each curve reads
      // as a sweeping line of light; straights keep alternating sides.
      const side = inCorner
        ? (bank >= 0 ? 1 : -1)
        : (straightSide = -straightSide)

      this.addStreetlightPole(side, index, distance)

      distance += inCorner
        ? STREETLIGHT_SPACING_CORNER
        : STREETLIGHT_SPACING_STRAIGHT
      index += 1

    }

    console.log(
      'Streetlight environment:',
      this.streetlightPoles.length,
      'poles'
    )

    this.setupStreetlightPool()
  }


  // A fixed pool of shadowless lights; the update pass reassigns them to
  // the nearest poles ahead of the player a few times per second.
  setupStreetlightPool() {

    for (
      let i = 0;
      i < STREETLIGHT_POOL_COUNT;
      i++
    ) {

      const light = new THREE.PointLight(
        STREETLIGHT_POOL_COLOR,
        STREETLIGHT_POOL_INTENSITY,
        STREETLIGHT_POOL_DISTANCE,
        STREETLIGHT_POOL_DECAY
      )
      light.name = `streetlightPool_${i}`
      light.position.set(0, -10, 0)

      this.group.add(light)
      this.streetlightPool.push(light)

    }

    this.streetlightPoolTimer = STREETLIGHT_POOL_RESCAN
  }


  addStreetlightPole(side, index, distance) {

    const frame = this.getCityFrame(distance)

    const pole = this.streetlightTemplate.clone()

    pole.name =
      `streetlight_${side > 0 ? 'right' : 'left'}_${index}`
    pole.userData.streetlightSide = side
    pole.userData.streetlightDistance = distance
    pole.rotation.y =
      frame.angle + (side > 0 ? 0 : Math.PI)
    // Base rides the elevation like the city blocks above.
    const poleGroundY =
      this.track.sampleAt(distance).position.y
    pole.position.set(
      frame.x + frame.perpX * side * STREETLIGHT_OFFSET,
      poleGroundY + STREETLIGHT_Y_OFFSET,
      frame.z + frame.perpZ * side * STREETLIGHT_OFFSET
    )

    this.streetlightGroup.add(pole)
    pole.updateMatrixWorld(true)

    // Curves shift the analytic offset slightly; nudge outward until the
    // pole base clears the road, barriers and steering envelope.
    for (let attempt = 0; attempt < 3; attempt++) {

      const clearance = this.distanceToPath(
        pole.position.x, pole.position.z
      )

      if (clearance >= STREETLIGHT_MIN_CLEARANCE) break

      pole.position.x +=
        frame.perpX * side *
        (STREETLIGHT_MIN_CLEARANCE - clearance)
      pole.position.z +=
        frame.perpZ * side *
        (STREETLIGHT_MIN_CLEARANCE - clearance)
      pole.updateMatrixWorld(true)

    }

    // Cross-slope seating at the final (nudged) lateral offset. The pole
    // itself stays world-upright like the buildings.
    {
      const anchor = this.track.sampleAt(distance)
      const dx = pole.position.x - anchor.position.x
      const dz = pole.position.z - anchor.position.z
      const dActual =
        dx * anchor.lateral.x + dz * anchor.lateral.z
      pole.position.y =
        anchor.position.y +
        anchor.lateral.y * dActual +
        STREETLIGHT_Y_OFFSET
      pole.updateMatrixWorld(true)
    }

    this.streetlightPoles.push(pole)
  }


  // ============================================
  // GROUND MIST — multi-layer noise-driven
  // ============================================

  setupGroundMist() {

    this.mistLayers = []
    this.mistLayerData = []

    const sizes = [
      { w: 14, h: 6 },
      { w: 10, h: 4 },
      { w: 18, h: 7 },
    ]

    const driftSpeeds = [0.15, 0.25, 0.1]
    const driftAmplitudes = [5, 3, 7]
    const yRanges = [
      [0.1, 0.5],
      [0.3, 0.8],
      [0.05, 0.3],
    ]

    for (
      let layer = 0;
      layer < MIST_LAYER_COUNT;
      layer++
    ) {

      const mat =
        buildMistMaterial(layer)
      this.sharedMaterials.push(mat)

      const geo =
        new THREE.PlaneGeometry(
          sizes[layer].w,
          sizes[layer].h
        )

      const mesh =
        new THREE.InstancedMesh(
          geo,
          mat,
          MIST_INSTANCES_PER_LAYER
        )

      mesh.renderOrder = -1

      const dummy = new THREE.Object3D()
      const layerData = []

      for (
        let i = 0;
        i < MIST_INSTANCES_PER_LAYER;
        i++
      ) {

        const idx =
          layer * MIST_INSTANCES_PER_LAYER + i

        const x =
          hashRange(
            idx * 21.1,
            -28,
            28
          )

        const z =
          ROAD_MAX_Z + 2 -
          hash(idx * 22.2) *
            (ROAD_LENGTH + 8)

        const y =
          hashRange(
            idx * 23.3,
            yRanges[layer][0],
            yRanges[layer][1]
          )

        const rotY =
          hash(idx * 24.4) * Math.PI

        const scaleX =
          hashRange(
            idx * 25.5,
            sizes[layer].w * 0.5,
            sizes[layer].w * 1.5
          )

        const scaleY =
          hashRange(
            idx * 26.6,
            sizes[layer].h * 0.5,
            sizes[layer].h * 1.2
          )

        dummy.position.set(x, y, z)
        dummy.rotation.set(
          -Math.PI / 2, rotY, 0
        )
        dummy.scale.set(scaleX, scaleY, 1)
        dummy.updateMatrix()

        mesh.setMatrixAt(i, dummy.matrix)

        layerData.push({
          baseX: x,
          baseZ: z,
          y: y,
          rotY: rotY,
          scaleX: scaleX,
          scaleY: scaleY,
          noiseOffsetX:
            hash(idx * 80.1) * 100,
          noiseOffsetZ:
            hash(idx * 80.2) * 100,
        })
      }

      mesh.instanceMatrix.needsUpdate = true
      this.group.add(mesh)

      this.mistLayers.push(mesh)
      this.mistLayerData.push(layerData)
    }
  }


  // ============================================
  // SILHOUETTES
  // ============================================

  setupSilhouettes() {

    const dummy = new THREE.Object3D()

    for (
      let i = 0;
      i < SILHOUETTE_COUNT;
      i++
    ) {

      const silhouette =
        createSilhouetteGeometry()

      const side =
        hash(i * 85.1) > 0.5 ? 1 : -1

      const x =
        side *
        (10 + hash(i * 85.2) * 15)

      const z =
        ROAD_MAX_Z - 20 -
        hash(i * 85.3) *
          (ROAD_LENGTH - 40)

      const height =
        hashRange(i * 85.4, 1.4, 2.2)

      const rotY =
        hash(i * 85.5) * Math.PI * 2

      silhouette.position.set(x, 0, z)
      silhouette.rotation.y = rotY
      silhouette.scale.setScalar(
        hashRange(i * 85.6, 0.6, 1.2)
      )

      silhouette.visible = false

      this.group.add(silhouette)
      this.silhouetteMeshes.push(silhouette)
      this.silhouetteData.push({
        x, z, height,
        phase:
          hash(i * 85.7) * Math.PI * 2,
        appearChance:
          hashRange(i * 85.8, 0.002, 0.008),
        visible: false,
        timer: 0,
        visibleDuration: 0,
      })
    }
  }


  // ============================================
  // ROADSIDE CLUTTER
  // ============================================

  setupRoadsideClutter() {

    this.setupGuardrails()
    this.setupAbandonedCars()
    this.setupMileMarkers()
  }


  setupGuardrails() {

    const mat = buildGuardrailMaterial()
    this.sharedMaterials.push(mat)

    const railGeo =
      new THREE.BoxGeometry(0.12, 0.7, 4)

    const postGeo =
      new THREE.CylinderGeometry(
        0.04, 0.04, 1.0, 4
      )

    const railMesh =
      new THREE.InstancedMesh(
        railGeo, mat, GUARDRAIL_COUNT
      )
    railMesh.castShadow = true
    railMesh.receiveShadow = true

    const postMesh =
      new THREE.InstancedMesh(
        postGeo, mat, GUARDRAIL_COUNT * 2
      )
    postMesh.castShadow = true

    const dummy = new THREE.Object3D()
    let railIndex = 0
    let postIndex = 0

    // Track-relative patches spread over the full length (previously the
    // straight-Z layout only covered the opening stretch). Damage pattern
    // hashes are preserved.
    const totalLength = this.track.totalLength
    const patchCount = 12
    const patchLength = 12
    const patchGap =
      (totalLength - 30 - patchCount * patchLength) /
      Math.max(1, patchCount - 1)

    for (
      let patch = 0;
      patch < patchCount;
      patch++
    ) {

      const patchStartS =
        15 + patch * (patchLength + patchGap)

      const segments =
        2 + Math.floor(
          hash(patch * 90.1) * 2
        )

      for (
        let j = 0;
        j < segments &&
          railIndex < GUARDRAIL_COUNT;
        j++
      ) {

        const s = patchStartS + j * 4.2

        const damaged =
          hash(patch * 90.2 + j) > 0.7

        const tiltX = damaged
          ? hashRange(
              patch * 90.3 + j,
              -0.2,
              0.2
            )
          : 0

        for (const side of [-1, 1]) {
          if (railIndex >= GUARDRAIL_COUNT) break

          const frame = this.track.sampleAt(s)
          const railPos = this.track.toWorld(s, side * 7.6, 0.35)

          dummy.position.copy(railPos)
          // Road-attached: roll with the banking (Euler XYZ applies Z
          // before Y, so this is roll about travel, then yaw). Posts
          // below stay world-vertical.
          dummy.rotation.set(tiltX, frame.angle, frame.bank)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()

          railMesh.setMatrixAt(
            railIndex, dummy.matrix
          )
          railIndex++

          for (const ds of [-2, 2]) {
            if (postIndex >= GUARDRAIL_COUNT * 2) break
            const postFrame = this.track.sampleAt(s + ds)
            const postPos = this.track.toWorld(
              s + ds, side * 7.6, 0.5
            )
            void postFrame
            dummy.position.copy(postPos)
            dummy.rotation.set(0, 0, 0)
            dummy.scale.set(1, 1, 1)
            dummy.updateMatrix()
            postMesh.setMatrixAt(
              postIndex, dummy.matrix
            )
            postIndex++
          }
        }
      }
    }

    railMesh.instanceMatrix.needsUpdate = true
    postMesh.instanceMatrix.needsUpdate = true
    // Hide unused instances below the ground instead of leaving identity
    // matrices at the origin.
    {
      const hide = new THREE.Object3D()
      hide.position.set(0, -50, 0)
      hide.updateMatrix()
      for (let i = railIndex; i < GUARDRAIL_COUNT; i++) {
        railMesh.setMatrixAt(i, hide.matrix)
      }
      for (let i = postIndex; i < GUARDRAIL_COUNT * 2; i++) {
        postMesh.setMatrixAt(i, hide.matrix)
      }
      railMesh.instanceMatrix.needsUpdate = true
      postMesh.instanceMatrix.needsUpdate = true
    }
    this.group.add(railMesh)
    this.group.add(postMesh)
  }


  setupAbandonedCars() {

    const bodyMat =
      buildAbandonedCarBodyMaterial()
    const roofMat =
      buildAbandonedCarRoofMaterial()
    this.sharedMaterials.push(bodyMat)
    this.sharedMaterials.push(roofMat)

    // frac: normalized station on the previous highway (s_old / legacy
    // total), so the wreck rhythm survives geometry changes. d keeps the
    // historical left/right lateral placement.
    const positions = [
      { frac: 60 / 952.6585091144439, d: -11, rotY: 0.15, s: 0.9 },
      { frac: 120 / 952.6585091144439, d: 13, rotY: -0.25, s: 1.0 },
      { frac: 180 / 952.6585091144439, d: -15, rotY: 0.4, s: 0.85 },
      { frac: 230 / 952.6585091144439, d: 12, rotY: -0.1, s: 0.95 },
      { frac: 290 / 952.6585091144439, d: -13, rotY: 0.3, s: 0.88 },
      { frac: 350 / 952.6585091144439, d: 14, rotY: -0.35, s: 0.92 },
      // Deliberate storytelling: wreck on the outer edge of the
      // downhill reveal (a left, so outer is +d).
      { frac: 430 / 952.6585091144439, d: 13, rotY: 0.45, s: 0.87 },
      { frac: 510 / 952.6585091144439, d: 15, rotY: -0.3, s: 0.93 },
      { frac: 590 / 952.6585091144439, d: -14, rotY: 0.25, s: 0.9 },
      // Deliberate storytelling: wreck on the outer edge at the hero
      // drift corner apex approach (a right, so outer is -d).
      { frac: 670 / 952.6585091144439, d: -12, rotY: 0.35, s: 0.86 },
      { frac: 750 / 952.6585091144439, d: -13, rotY: 0.35, s: 0.91 },
      { frac: 830 / 952.6585091144439, d: 14, rotY: -0.15, s: 0.88 },
    ]

    const totalLength = this.track.totalLength

    for (
      let i = 0;
      i < ABANDONED_CAR_COUNT;
      i++
    ) {

      const pos = positions[i]

      const car =
        createAbandonedCarGroup(
          bodyMat, roofMat
        )

      const station = pos.frac * totalLength
      const frame = this.track.sampleAt(station)
      const world = this.track.toWorld(station, pos.d, 0)
      car.position.copy(world)
      car.rotation.y = frame.angle + pos.rotY
      car.scale.setScalar(pos.s)

      car.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      this.group.add(car)
    }
  }


  setupMileMarkers() {

    const mat = buildMileMarkerMaterial()
    this.sharedMaterials.push(mat)

    const postGeo =
      new THREE.CylinderGeometry(
        0.04, 0.06, 0.9, 4
      )

    const markerMesh =
      new THREE.InstancedMesh(
        postGeo, mat, MILE_MARKER_COUNT
      )
    markerMesh.castShadow = false
    markerMesh.receiveShadow = false

    const dummy = new THREE.Object3D()

    const totalLength = this.track.totalLength

    for (
      let i = 0;
      i < MILE_MARKER_COUNT;
      i++
    ) {

      const side =
        hash(i * 31.1) > 0.5 ? 1 : -1

      const d =
        side *
        (7.8 + hash(i * 32.2) * 2)

      // Evenly spaced stations over the full track (previously every 23 m
      // in world Z on the near-straight layout).
      const s =
        5 + (i / MILE_MARKER_COUNT) * (totalLength - 10)

      const frame = this.track.sampleAt(s)
      const world = this.track.toWorld(s, d, 0.45)

      const tilt =
        hashRange(i * 33.3, -0.2, 0.2)

      dummy.position.copy(world)
      dummy.rotation.set(
        tilt, frame.angle,
        hashRange(i * 34.4, -0.12, 0.12)
      )
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()

      markerMesh.setMatrixAt(
        i, dummy.matrix
      )
    }

    markerMesh.instanceMatrix.needsUpdate = true
    this.group.add(markerMesh)
  }


  // ============================================
  // DEBRIS
  // ============================================

  setupDebris() {

    const mat = buildDebrisMaterial()
    this.sharedMaterials.push(mat)

    const debrisGeo =
      new THREE.BoxGeometry(1, 0.15, 0.3)

    const debrisMesh =
      new THREE.InstancedMesh(
        debrisGeo, mat, DEBRIS_COUNT
      )
    debrisMesh.castShadow = false
    debrisMesh.receiveShadow = true

    const dummy = new THREE.Object3D()

    // Track-relative scatter (previously uniform in world Z with raw X
    // offsets, which the bends would drag onto the asphalt). Hash streams
    // preserved so the debris pattern keeps its character.
    const totalLength = this.track.totalLength

    for (
      let i = 0;
      i < DEBRIS_COUNT;
      i++
    ) {

      const side =
        hash(i * 95.1) > 0.5 ? 1 : -1

      const d =
        side *
        (7.5 + hash(i * 95.2) * 12)

      const s =
        hash(i * 95.3) * totalLength

      const world = this.track.toWorld(s, d, 0.07)

      const scaleX =
        hashRange(i * 95.4, 0.3, 1.5)

      const rotY =
        hash(i * 95.5) * Math.PI * 2

      dummy.position.copy(world)
      dummy.rotation.set(
        hashRange(i * 95.6, -0.3, 0.3),
        rotY,
        hashRange(i * 95.7, -0.2, 0.2)
      )
      dummy.scale.set(scaleX, 1, 1)
      dummy.updateMatrix()

      debrisMesh.setMatrixAt(
        i, dummy.matrix
      )
    }

    debrisMesh.instanceMatrix.needsUpdate = true
    this.group.add(debrisMesh)
  }


  // ============================================
  // SHADOW FOLLOWING
  // ============================================

  setupShadowFollowing() {

    if (!this.moonLight) return

    this.moonLight.shadow.mapSize.width = 2048
    this.moonLight.shadow.mapSize.height = 2048
    this.moonLight.shadow.camera.near = 1
    this.moonLight.shadow.camera.far = 180
    this.moonLight.shadow.camera.left = -70
    this.moonLight.shadow.camera.right = 70
    this.moonLight.shadow.camera.top = 70
    this.moonLight.shadow.camera.bottom = -70
    this.moonLight.shadow.bias = -0.003

    this.moonLight.shadow.camera
      .updateProjectionMatrix()
  }


  // ============================================
  // UPDATE
  // ============================================

  update(dt, playerPosition) {

    if (this.disposed) return

    const time = performance.now() * 0.001

    this.updateHeadlights(time)
    this.updateGroundMist(dt, time)
    this.updateCity()
    this.updateStreetlights()
    this.updateStreetlightPool(dt)
    this.updateShadowFollowing()
    this.updateSilhouettes(dt, time)
    this.updateDisturbances(dt, time)
    this.updateFogPacing(time)
  }


  // Forward-facing lighting follows the car's actual heading (which tracks
  // the local Track tangent until true steering lands), so the beams stay
  // on the highway through bends instead of assuming forward = -Z.
  carForward(into) {
    const fwd = into || new THREE.Vector3()
    if (this.playerCar) {
      fwd.set(0, 0, 1).applyQuaternion(this.playerCar.quaternion)
      fwd.y = 0
      if (fwd.lengthSq() > 1e-8) {
        fwd.normalize()
        return fwd
      }
    }
    return fwd.set(0, 0, -1)
  }

  carRight(into) {
    const right = into || new THREE.Vector3()
    const fwd = this.carForward(new THREE.Vector3())
    // Right of forward on the ground plane (forward × up).
    right.set(-fwd.z, 0, fwd.x)
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
    return right.normalize()
  }

  updateHeadlights(time) {

    const pos = this.playerCar.position
    const fwd = this.carForward(new THREE.Vector3())
    const right = this.carRight(new THREE.Vector3())

    // Cone geometry points down -Y natively with the historical -PI/2 X
    // tilt; yaw that tilt so the beam follows the car heading.
    const yaw = Math.atan2(fwd.x, fwd.z) + Math.PI
    const tilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), -Math.PI / 2
    )
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), yaw
    )
    const coneQuat = yawQ.multiply(tilt)

    const flicker =
      1 + Math.sin(time * 8.7) * 0.01 +
      Math.sin(time * 13.3) * 0.008

    const lightY = pos.y + 0.4
    const leftBase = pos.clone().addScaledVector(right, -0.6)
    const rightBase = pos.clone().addScaledVector(right, 0.6)

    this.leftLight.position.set(
      leftBase.x, lightY, leftBase.z
    ).addScaledVector(fwd, 2)
    this.leftLight.intensity =
      HEADLIGHT_INTENSITY * flicker
    this.leftTarget.position.set(
      leftBase.x, pos.y, leftBase.z
    ).addScaledVector(fwd, 35)
    this.leftCone.position.set(
      leftBase.x, lightY, leftBase.z
    ).addScaledVector(fwd, 19.5)
    this.leftCone.quaternion.copy(coneQuat)
    this.leftBulb.position.set(
      leftBase.x, lightY, leftBase.z
    ).addScaledVector(fwd, 2)

    this.rightLight.position.set(
      rightBase.x, lightY, rightBase.z
    ).addScaledVector(fwd, 2)
    this.rightLight.intensity =
      HEADLIGHT_INTENSITY * flicker
    this.rightTarget.position.set(
      rightBase.x, pos.y, rightBase.z
    ).addScaledVector(fwd, 35)
    this.rightCone.position.set(
      rightBase.x, lightY, rightBase.z
    ).addScaledVector(fwd, 19.5)
    this.rightCone.quaternion.copy(coneQuat)
    this.rightBulb.position.set(
      rightBase.x, lightY, rightBase.z
    ).addScaledVector(fwd, 2)
  }


  updateGroundMist(dt, time) {

    const playerZ =
      this.playerCar.position.z

    for (
      let layer = 0;
      layer < MIST_LAYER_COUNT;
      layer++
    ) {

      const mesh = this.mistLayers[layer]
      const data = this.mistLayerData[layer]

      if (!mesh || !data) continue

      const dummy = new THREE.Object3D()

      const driftSpeed =
        [0.15, 0.25, 0.1][layer]
      const driftAmp =
        [5, 3, 7][layer]

      for (
        let i = 0;
        i < MIST_INSTANCES_PER_LAYER;
        i++
      ) {

        const m = data[i]

        const noiseX =
          fbm(
            time * driftSpeed * 0.3 +
              m.noiseOffsetX,
            m.noiseOffsetZ,
            3
          )

        const noiseZ =
          fbm(
            m.noiseOffsetX,
            time * driftSpeed * 0.2 +
              m.noiseOffsetZ,
            3
          )

        const x =
          m.baseX +
          noiseX * driftAmp * 2 +
          Math.sin(
            time * driftSpeed +
              m.noiseOffsetX
          ) *
            driftAmp

        const zOffset =
          noiseZ * 3 +
          Math.sin(
            time * driftSpeed * 0.5 +
              m.noiseOffsetZ
          ) *
            2

        const z = m.baseZ + zOffset

        const distToPlayer =
          Math.abs(z - playerZ)

        const proximityFade =
          distToPlayer < 20
            ? 0.3 +
              0.7 *
                (distToPlayer / 20)
            : 1

        const y =
          m.y +
          Math.sin(
            time * 0.3 +
              m.noiseOffsetX
          ) *
            0.1

        dummy.position.set(x, y, z)
        dummy.rotation.set(
          -Math.PI / 2,
          m.rotY +
            Math.sin(
              time * 0.2 +
                m.noiseOffsetZ
            ) *
              0.1,
          0
        )
        dummy.scale.set(
          m.scaleX * proximityFade,
          m.scaleY * proximityFade,
          1
        )
        dummy.updateMatrix()

        mesh.setMatrixAt(i, dummy.matrix)
      }

      mesh.instanceMatrix.needsUpdate = true
    }
  }


  updateCity() {

    if (this.citySections.length === 0) return

    const playerZ = this.playerCar.position.z

    for (const section of this.citySections) {

      section.visible =
        Math.abs(section.position.z - playerZ) <=
        CITY_DRAW_DISTANCE

    }
  }


  updateStreetlights() {

    if (this.streetlightPoles.length === 0) return

    const playerZ = this.playerCar.position.z

    for (const pole of this.streetlightPoles) {

      pole.visible =
        Math.abs(pole.position.z - playerZ) <=
        STREETLIGHT_DRAW_DISTANCE

    }
  }


  updateStreetlightPool(dt) {

    if (this.streetlightPool.length === 0) return
    if (this.streetlightPoles.length === 0) return

    this.streetlightPoolTimer += dt

    if (
      this.streetlightPoolTimer <
      STREETLIGHT_POOL_RESCAN
    ) {
      return
    }

    this.streetlightPoolTimer = 0

    const player = this.playerCar.position

    // Nearest poles ahead of the player, so light pools open up down the
    // road instead of sitting behind the car.
    const ahead = []

    for (const pole of this.streetlightPoles) {

      const dz = player.z - pole.position.z

      if (dz < -10 || dz > STREETLIGHT_POOL_RANGE) continue

      const dx = pole.position.x - player.x
      ahead.push({ pole, near: dx * dx + dz * dz })

    }

    ahead.sort((a, b) => a.near - b.near)

    for (
      let i = 0;
      i < this.streetlightPool.length;
      i++
    ) {

      const light = this.streetlightPool[i]
      const slot = ahead[i]

      if (!slot) {
        light.position.set(0, -10, 0)
        continue
      }

      light.position.set(
        slot.pole.position.x,
        STREETLIGHT_POOL_HEIGHT,
        slot.pole.position.z
      )

    }
  }


  updateShadowFollowing() {

    const px = this.playerCar.position.x
    const pz =
      this.playerCar.position.z

    if (this.moonLight) {

      this.moonLight.position.set(
        -30, 35, pz - 90
      )

      this.moonLight.target.position.set(
        0, 0, pz
      )

    }

    // Fill rides the camera side so approaching faces and bodywork catch
    // neutral light; rim stays low down-road so dark shapes edge in red.
    if (this.fillLight) {

      this.fillLight.position.set(
        px + 10, 18, pz + 30
      )

      this.fillLight.target.position.set(
        px, 0, pz - 20
      )

    }

    if (this.rimLight) {

      this.rimLight.position.set(
        px - 15, 10, pz - 130
      )

      this.rimLight.target.position.set(
        px, 1, pz - 20
      )

    }
  }


  updateSilhouettes(dt, time) {

    const playerZ =
      this.playerCar.position.z

    for (
      let i = 0;
      i < SILHOUETTE_COUNT;
      i++
    ) {

      const s = this.silhouetteData[i]
      const mesh = this.silhouetteMeshes[i]

      if (!s || !mesh) continue

      const distToPlayer =
        Math.abs(s.z - playerZ)

      if (s.visible) {

        s.timer += dt

        const visibilityFade =
          distToPlayer < 30
            ? Math.min(
                1,
                distToPlayer / 30
              )
            : 1

        const flickerFade =
          0.4 +
          0.6 *
            Math.abs(
              Math.sin(
                time * 2 + s.phase
              )
            )

        mesh.visible =
          visibilityFade * flickerFade > 0.15

        if (
          s.timer >= s.visibleDuration
        ) {
          s.visible = false
          mesh.visible = false
          s.timer = 0
        }
      } else {

        if (
          distToPlayer < 80 &&
          distToPlayer > 15
        ) {

          const noiseVal =
            noise2D(
              time * 0.5 + i * 10,
              i * 7.3
            )

          if (
            noiseVal >
              1 - s.appearChance * dt * 60
          ) {
            s.visible = true
            s.timer = 0
            s.visibleDuration =
              hashRange(
                i * 86.1,
                2,
                6
              )
          }
        }
      }
    }
  }


  updateDisturbances(dt, time) {

    this.disturbanceTimer += dt

    if (
      this.activeDisturbance
    ) {

      this.disturbanceDuration -= dt

      if (
        this.disturbanceDuration <= 0
      ) {

        this.activeDisturbance = null
        this.disturbanceTimer = 0
        this.disturbanceInterval =
          hashRange(
            time * 0.1,
            12,
            30
          )
      }

      return
    }

    if (
      this.disturbanceTimer >=
        this.disturbanceInterval
    ) {

      const disturbances = [
        'fogPulse',
        'shadowCross',
        'ghostFlicker',
        'distantLight',
      ]

      const idx = Math.floor(
        hash(time * 0.3) *
          disturbances.length
      )

      this.activeDisturbance =
        disturbances[idx]

      this.disturbanceDuration =
        hashRange(time, 1, 3)
    }
  }


  updateFogPacing(time) {

    if (!this.scene.fog) return

    const playerZ =
      this.playerCar.position.z

    const hf = horrorFactor(playerZ)

    const baseDensity =
      FOG_DENSITY_BASE +
      hf *
        (FOG_DENSITY_FAR -
          FOG_DENSITY_BASE) *
        0.4

    const noiseModulation =
      noise2D(
        time * 0.1,
        playerZ * 0.01
      ) *
      0.003

    this.scene.fog.density =
      baseDensity + noiseModulation

    if (
      this.activeDisturbance ===
        'fogPulse'
    ) {

      this.scene.fog.density +=
        0.008 *
          Math.abs(
            Math.sin(
              time * 3
            )
          )
    }
  }


  // ============================================
  // EXORCISM INTEGRATION
  // ============================================

  setFogColor(color) {
    if (this.scene.fog) {
      this.scene.fog.color.copy(color)
    }
  }


  setFogDensity(density) {
    if (this.scene.fog) {
      this.scene.fog.density = density
    }
  }


  getDisturbance() {
    return this.activeDisturbance
  }


  // ============================================
  // DISPOSE
  // ============================================

  dispose() {

    if (this.disposed) return

    this.disposed = true

    if (this.group.parent) {
      this.group.parent.remove(this.group)
    }

    this.group.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose()
      }

      if (child.material) {
        if (
          Array.isArray(child.material)
        ) {
          child.material.forEach(
            (m) => m.dispose()
          )
        } else {
          child.material.dispose()
        }
      }
    })

    this.sharedMaterials.forEach(
      (m) => m.dispose()
    )
    this.sharedMaterials = []

    this.mistLayers = []
    this.mistLayerData = []
    this.silhouetteMeshes = []
    this.silhouetteData = []
    this.fillLight = null
    this.rimLight = null
    this.cityGroup = null
    this.citySections = []
    this.cityTemplate = null
    this.streetlightGroup = null
    this.streetlightPoles = []
    this.streetlightTemplate = null
    this.streetlightPool = []
    this.streetlightPoolTimer = 0

    this.scene.fog = null
  }
}
