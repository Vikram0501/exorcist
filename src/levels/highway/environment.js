import * as THREE from 'three'


// ============================================
// CONSTANTS
// ============================================

const FOG_COLOR = 0x0a0e14
const FOG_DENSITY_BASE = 0.012
const FOG_DENSITY_FAR = 0.022

const HEADLIGHT_COLOR = 0xFFF4D0
const HEADLIGHT_INTENSITY = 45
const HEADLIGHT_DISTANCE = 50
const HEADLIGHT_ANGLE = Math.PI / 6
const HEADLIGHT_PENUMBRA = 0.4
const HEADLIGHT_DECAY = 1.0

const TREE_COUNT = 2000
const TREE_VARIATION_COUNT = 5
const LARGE_TREE_COUNT = 24
const BRANCH_COUNT = 700
const BUSH_COUNT = 500
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

const TREE_MIN_SCALE = 0.8
const TREE_MAX_SCALE = 1.5
const TREE_TILT_RANGE = 0.1


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


function buildTreeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x121212,
    roughness: 0.95,
    metalness: 0,
  })
}


function buildBranchMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x0e0e0e,
    roughness: 0.95,
    metalness: 0,
  })
}


function buildBushMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x0d120d,
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
// GLB TREE PREPARATION
// ============================================

function prepareTreeGeometry(geometry, quaternion, scale) {
  const geo = geometry.clone()

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().set(
    quaternion[0],
    quaternion[1],
    quaternion[2],
    quaternion[3]
  )
  const s = new THREE.Vector3(
    scale[0],
    scale[1],
    scale[2]
  )
  m.compose(new THREE.Vector3(0, 0, 0), q, s)
  geo.applyMatrix4(m)

  geo.computeBoundingBox()
  const box = geo.boundingBox

  const cx = (box.max.x + box.min.x) / 2
  const cz = (box.max.z + box.min.z) / 2
  geo.translate(-cx, 0, -cz)
  geo.translate(0, -box.min.y, 0)

  return {
    geometry: geo,
    height: box.max.y - box.min.y,
  }
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
    treeTemplates,
    roadPath,
    arcLengths,
  }) {

    this.scene = scene
    this.highwayGroup = highwayGroup
    this.playerCar = playerCar
    this.moonLight = moonLight

    this.treeTemplates = treeTemplates || []
    this.roadPath = roadPath || []
    this.arcLengths = arcLengths || []

    this.group = new THREE.Group()
    this.group.name = 'highwayEnvironment'
    this.highwayGroup.add(this.group)

    this.leftLight = null
    this.rightLight = null
    this.leftTarget = null
    this.rightTarget = null
    this.leftCone = null
    this.rightCone = null

    this.mistLayers = []
    this.mistLayerData = []

    this.treeBaseMatrices = []
    this.treeSwayData = []

    this.treeVariationMeshes = []
    this.treePlacementData = []

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
    this.setupShoulders()
    this.setupForest()
    this.setupBranches()
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
    const points = this.roadPath
    const arcLengths = this.arcLengths
    if (
      !points ||
      !points.length ||
      !arcLengths
    ) {
      return new THREE.Vector3(0, 0, -465)
    }

    const totalLength =
      arcLengths[arcLengths.length - 1]

    if (distance <= 0) {
      return points[0].clone()
    }

    if (distance >= totalLength) {
      return points[
        points.length - 1
      ].clone()
    }

    let segIndex = 0
    for (
      let i = 0;
      i < arcLengths.length - 1;
      i++
    ) {
      if (
        distance >= arcLengths[i] &&
        distance < arcLengths[i + 1]
      ) {
        segIndex = i
        break
      }
    }

    const segLength =
      arcLengths[segIndex + 1] -
      arcLengths[segIndex]
    const t =
      segLength > 0
        ? (distance - arcLengths[segIndex]) /
          segLength
        : 0

    const p0 = points[segIndex]
    const p1 = points[segIndex + 1]

    return new THREE.Vector3(
      p0.x + (p1.x - p0.x) * t,
      0,
      p0.z + (p1.z - p0.z) * t
    )
  }


  distanceToRoadCenter(x, z) {
    if (
      !this.roadPath ||
      !this.roadPath.length ||
      !this.arcLengths
    ) {
      return 999
    }

    const totalLength =
      this.arcLengths[
        this.arcLengths.length - 1
      ]
    const step = 5

    let minDist = Infinity

    for (
      let d = 0;
      d <= totalLength;
      d += step
    ) {
      const sample = this.getPathSample(d)
      const dx = x - sample.x
      const dz = z - sample.z
      const dist = Math.sqrt(
        dx * dx + dz * dz
      )
      if (dist < minDist) {
        minDist = dist
      }
    }

    return minDist
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
  // SHOULDERS
  // ============================================

  setupShoulders() {

    const mat = buildShoulderMaterial()
    this.sharedMaterials.push(mat)

    const shoulderGeo =
      new THREE.BoxGeometry(13, 0.15, ROAD_LENGTH)

    const leftShoulder =
      new THREE.Mesh(shoulderGeo, mat)
    leftShoulder.position.set(
      -13.5, -0.12, ROAD_CENTER_Z
    )
    leftShoulder.receiveShadow = true
    this.group.add(leftShoulder)

    const rightShoulder =
      new THREE.Mesh(shoulderGeo, mat)
    rightShoulder.position.set(
      13.5, -0.12, ROAD_CENTER_Z
    )
    rightShoulder.receiveShadow = true
    this.group.add(rightShoulder)

    const outerMat =
      new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        roughness: 0.98,
        metalness: 0,
      })
    this.sharedMaterials.push(outerMat)

    const outerGeo =
      new THREE.BoxGeometry(20, 0.1, ROAD_LENGTH)

    const leftOuter =
      new THREE.Mesh(outerGeo, outerMat)
    leftOuter.position.set(
      -33.5, -0.2, ROAD_CENTER_Z
    )
    leftOuter.receiveShadow = true
    this.group.add(leftOuter)

    const rightOuter =
      new THREE.Mesh(outerGeo, outerMat)
    rightOuter.position.set(
      33.5, -0.2, ROAD_CENTER_Z
    )
    rightOuter.receiveShadow = true
    this.group.add(rightOuter)
  }


  // ============================================
  // FOREST
  // ============================================

  setupForest() {

    if (this.treeTemplates.length > 0) {
      this.setupForestFromGLB()
    } else {
      this.setupForestFallback()
    }

    this.setupBushes()
  }


  setupForestFromGLB() {

    const dummy = new THREE.Object3D()

    const treesPerVariation =
      Math.ceil(TREE_COUNT / TREE_VARIATION_COUNT)
    const variationCounts =
      new Array(TREE_VARIATION_COUNT).fill(0)

    const treeAssignments = []

    for (
      let i = 0;
      i < TREE_COUNT;
      i++
    ) {
      const vi =
        Math.floor(
          hash(i * 99.9) * TREE_VARIATION_COUNT
        )
      variationCounts[vi]++
      treeAssignments.push(vi)
    }

    for (
      let v = 0;
      v < TREE_VARIATION_COUNT;
      v++
    ) {
      const count = variationCounts[v]
      if (count === 0) continue

      const template =
        this.treeTemplates[
          v % this.treeTemplates.length
        ]

      const mesh =
        new THREE.InstancedMesh(
          template.mesh.geometry,
          template.mesh.material,
          count
        )
      mesh.castShadow = true
      mesh.receiveShadow = true

      this.treeVariationMeshes.push(mesh)
      this.group.add(mesh)
    }

    const variationIndices =
      new Array(TREE_VARIATION_COUNT).fill(0)

    for (
      let i = 0;
      i < TREE_COUNT;
      i++
    ) {

      const vi = treeAssignments[i]
      const localIdx = variationIndices[vi]
      variationIndices[vi]++

      const hf = horrorFactor(
        ROAD_MAX_Z -
          hash(i * 6.6) * ROAD_LENGTH
      )

      const side =
        hash(i * 1.1 + 0.5) > 0.5
          ? 1 : -1

      const zone = hash(i * 2.2 + 0.3)

      let minDist = 9
      let maxDist = 55

      if (hf > 0.3) {
        minDist = 8 - hf * 2
        maxDist = 55 - hf * 10
      }

      let x
      if (zone < 0.4) {
        x = side *
          (minDist + hash(i * 3.3) *
            (14 - minDist))
      } else if (zone < 0.8) {
        x = side *
          (14 + hash(i * 4.4) * 16)
      } else {
        x = side *
          (30 + hash(i * 5.5) *
            (maxDist - 30))
      }

      const z =
        ROAD_MAX_Z + 5 -
        hash(i * 6.6) *
          (ROAD_LENGTH + 20)

      const roadDist =
        this.distanceToRoadCenter(x, z)

      const minRoadDist =
        ROAD_WIDTH * 0.5 + 3

      if (roadDist < minRoadDist) {
        dummy.position.set(0, -1000, 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()

        const mesh =
          this.treeVariationMeshes[vi]
        mesh.setMatrixAt(
          localIdx,
          dummy.matrix
        )

        this.treePlacementData.push({
          variationIdx: vi,
          instanceIdx: localIdx,
          base: {
            x: 0, z: -1000, rotY: 0,
            leanX: 0,
            leanZ: 0,
            scale: 0,
          },
          sway: {
            phase: 0,
            speed: 0,
            amplitude: 0,
          },
        })

        continue
      }

      const rotY =
        hash(i * 9.9) * Math.PI * 2

      const leanX =
        hashRange(i * 40.1, -TREE_TILT_RANGE, TREE_TILT_RANGE) *
        (1 + hf * 1.5)

      const leanZ =
        (hash(i * 40.2) > 0.5 ? 1 : -1) *
        hashRange(i * 40.3, 0.02, 0.12) *
        (1 + hf * 2)

      const sideSign = side
      const inwardBias = 0.03
      const leanXBias =
        sideSign > 0
          ? -inwardBias
          : inwardBias

      const uniformScale =
        hashRange(
          i * 88.8,
          TREE_MIN_SCALE,
          TREE_MAX_SCALE
        )

      dummy.position.set(x, 0, z)
      dummy.rotation.set(
        leanX + leanXBias,
        rotY,
        leanZ
      )
      dummy.scale.setScalar(uniformScale)
      dummy.updateMatrix()

      const mesh =
        this.treeVariationMeshes[vi]
      mesh.setMatrixAt(localIdx, dummy.matrix)

      this.treePlacementData.push({
        variationIdx: vi,
        instanceIdx: localIdx,
        base: {
          x, z, rotY,
          leanX: leanX + leanXBias,
          leanZ,
          scale: uniformScale,
        },
        sway: {
          phase: hash(i * 50.1) * Math.PI * 2,
          speed: hashRange(i * 50.2, 0.3, 0.8),
          amplitude:
            hashRange(i * 50.3, 0.003, 0.012) *
            (1 + hf * 0.5),
        },
      })
    }

    for (
      const mesh of this.treeVariationMeshes
    ) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }


  setupForestFallback() {

    const treeMat = buildTreeMaterial()
    this.sharedMaterials.push(treeMat)

    const trunkGeo =
      new THREE.CylinderGeometry(
        0.06, 0.2, 1, 6
      )

    const trunkMesh =
      new THREE.InstancedMesh(
        trunkGeo, treeMat, TREE_COUNT
      )
    trunkMesh.castShadow = true
    trunkMesh.receiveShadow = true

    const dummy = new THREE.Object3D()

    for (
      let i = 0;
      i < TREE_COUNT;
      i++
    ) {

      const progress =
        Math.max(
          0,
          Math.min(
            1,
            -hash(i * 6.6) *
              ROAD_LENGTH /
              ROAD_LENGTH
          )
        )

      const hf = horrorFactor(
        ROAD_MAX_Z -
          hash(i * 6.6) * ROAD_LENGTH
      )

      const side =
        hash(i * 1.1 + 0.5) > 0.5
          ? 1 : -1

      const zone = hash(i * 2.2 + 0.3)

      let minDist = 9
      let maxDist = 55

      if (hf > 0.3) {
        minDist = 8 - hf * 2
        maxDist = 55 - hf * 10
      }

      let x
      if (zone < 0.4) {
        x = side *
          (minDist + hash(i * 3.3) *
            (14 - minDist))
      } else if (zone < 0.8) {
        x = side *
          (14 + hash(i * 4.4) * 16)
      } else {
        x = side *
          (30 + hash(i * 5.5) *
            (maxDist - 30))
      }

      const z =
        ROAD_MAX_Z + 5 -
        hash(i * 6.6) *
          (ROAD_LENGTH + 20)

      const roadDist =
        this.distanceToRoadCenter(x, z)

      const minRoadDist =
        ROAD_WIDTH * 0.5 + 3

      if (roadDist < minRoadDist) {
        dummy.position.set(0, -1000, 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()

        trunkMesh.setMatrixAt(
          i, dummy.matrix
        )

        this.treeBaseMatrices.push({
          x: 0, z: -1000,
          height: 0,
          widthScale: 0,
          rotY: 0, leanX: 0, leanZ: 0,
        })

        this.treeSwayData.push({
          phase: 0,
          speed: 0,
          amplitude: 0,
        })

        continue
      }

      const baseHeight =
        hashRange(i * 7.7, 3, 9)

      const height =
        baseHeight * (1 + hf * 0.3)

      const widthScale =
        hashRange(i * 8.8, 0.5, 1.4)

      const rotY =
        hash(i * 9.9) * Math.PI * 2

      const leanX =
        hashRange(i * 40.1, -0.08, 0.08) *
        (1 + hf * 1.5)

      const leanZ =
        (hash(i * 40.2) > 0.5 ? 1 : -1) *
        hashRange(i * 40.3, 0.02, 0.12) *
        (1 + hf * 2)

      dummy.position.set(x, 0, z)
      dummy.rotation.set(leanX, rotY, leanZ)
      dummy.scale.set(
        widthScale, height, widthScale
      )
      dummy.updateMatrix()

      trunkMesh.setMatrixAt(
        i, dummy.matrix
      )

      this.treeBaseMatrices.push({
        x, z, height, widthScale,
        rotY, leanX, leanZ,
      })

      this.treeSwayData.push({
        phase: hash(i * 50.1) * Math.PI * 2,
        speed: hashRange(i * 50.2, 0.3, 0.8),
        amplitude:
          hashRange(i * 50.3, 0.003, 0.012) *
          (1 + hf * 0.5),
      })
    }

    trunkMesh.instanceMatrix.needsUpdate = true
    this.group.add(trunkMesh)
    this.trunkMesh = trunkMesh


    // LARGE SINISTER TREES

    const largeCount = LARGE_TREE_COUNT
    const largeGeo =
      new THREE.CylinderGeometry(
        0.15, 0.4, 1, 7
      )

    const largeMesh =
      new THREE.InstancedMesh(
        largeGeo, treeMat, largeCount
      )
    largeMesh.castShadow = true
    largeMesh.receiveShadow = true

    for (
      let i = 0;
      i < largeCount;
      i++
    ) {

      const side =
        hash(i * 60.1) > 0.5 ? 1 : -1

      const x =
        side *
        (9 + hash(i * 60.2) * 8)

      const zStart =
        ROAD_MAX_Z - 30
      const zRange = ROAD_LENGTH - 60
      const z =
        zStart -
        hash(i * 60.3) * zRange

      const height =
        hashRange(i * 60.4, 10, 16)

      const widthScale =
        hashRange(i * 60.5, 1.8, 3.0)

      const rotY =
        hash(i * 60.6) * Math.PI * 2

      const leanZ =
        (hash(i * 60.7) > 0.5 ? 1 : -1) *
        hashRange(i * 60.8, 0.05, 0.2)

      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, rotY, leanZ)
      dummy.scale.set(
        widthScale, height, widthScale
      )
      dummy.updateMatrix()

      largeMesh.setMatrixAt(
        i, dummy.matrix
      )

      this.treeBaseMatrices.push({
        x, z, height, widthScale,
        rotY, leanX: 0, leanZ,
        isLarge: true,
      })

      this.treeSwayData.push({
        phase: hash(i * 61.1) * Math.PI * 2,
        speed: hashRange(i * 61.2, 0.15, 0.4),
        amplitude:
          hashRange(i * 61.3, 0.002, 0.006),
      })
    }

    largeMesh.instanceMatrix.needsUpdate = true
    this.group.add(largeMesh)
  }


  setupBushes() {

    const bushMat = buildBushMaterial()
    this.sharedMaterials.push(bushMat)

    const bushGeo =
      new THREE.DodecahedronGeometry(0.7, 1)

    const bushPos =
      bushGeo.getAttribute('position')
    for (
      let i = 0;
      i < bushPos.count;
      i++
    ) {
      bushPos.setY(
        i,
        bushPos.getY(i) * 0.3
      )
    }
    bushPos.needsUpdate = true
    bushGeo.computeVertexNormals()

    const bushMesh =
      new THREE.InstancedMesh(
        bushGeo, bushMat, BUSH_COUNT
      )
    bushMesh.castShadow = false
    bushMesh.receiveShadow = true

    const dummy = new THREE.Object3D()

    for (
      let i = 0;
      i < BUSH_COUNT;
      i++
    ) {

      const side =
        hash(i * 11.1 + 2.1) > 0.5
          ? 1 : -1

      const x =
        side *
        (7.5 + hash(i * 12.2) * 22)

      const z =
        ROAD_MAX_Z + 3 -
        hash(i * 13.3) *
          (ROAD_LENGTH + 10)

      const roadDist =
        this.distanceToRoadCenter(x, z)

      const minRoadDist =
        ROAD_WIDTH * 0.5 + 2

      if (roadDist < minRoadDist) {
        dummy.position.set(0, -1000, 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()

        bushMesh.setMatrixAt(
          i, dummy.matrix
        )
        continue
      }

      const scale =
        hashRange(i * 14.4, 0.4, 1.8)

      const rotY =
        hash(i * 15.5) * Math.PI * 2

      dummy.position.set(x, 0.1, z)
      dummy.rotation.set(0, rotY, 0)
      dummy.scale.set(
        scale, scale * 0.7, scale
      )
      dummy.updateMatrix()

      bushMesh.setMatrixAt(
        i, dummy.matrix
      )
    }

    bushMesh.instanceMatrix.needsUpdate = true
    this.group.add(bushMesh)
  }


  // ============================================
  // BRANCHES
  // ============================================

  setupBranches() {

    const mat = buildBranchMaterial()
    this.sharedMaterials.push(mat)

    const branchGeo =
      new THREE.CylinderGeometry(
        0.015, 0.04, 1, 4
      )

    const branchMesh =
      new THREE.InstancedMesh(
        branchGeo, mat, BRANCH_COUNT
      )
    branchMesh.castShadow = false
    branchMesh.receiveShadow = false

    const dummy = new THREE.Object3D()

    for (
      let i = 0;
      i < BRANCH_COUNT;
      i++
    ) {

      const side =
        hash(i * 70.1) > 0.5 ? 1 : -1

      const x =
        side *
        (7.5 + hash(i * 70.2) * 18)

      const z =
        ROAD_MAX_Z + 2 -
        hash(i * 70.3) * (ROAD_LENGTH + 10)

      const roadDist =
        this.distanceToRoadCenter(x, z)

      const minRoadDist =
        ROAD_WIDTH * 0.5 + 2

      if (roadDist < minRoadDist) {
        dummy.position.set(0, -1000, 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()

        branchMesh.setMatrixAt(
          i, dummy.matrix
        )
        continue
      }

      const branchLen =
        hashRange(i * 70.4, 1.5, 4)

      const heightOffGround =
        hashRange(i * 70.5, 2, 7)

      const tiltAngle =
        (hash(i * 70.6) > 0.5 ? 1 : -1) *
        hashRange(i * 70.7, 0.3, 1.2)

      const rotY =
        hash(i * 70.8) * Math.PI * 2

      dummy.position.set(
        x, heightOffGround, z
      )
      dummy.rotation.set(
        tiltAngle, rotY, 0
      )
      dummy.scale.set(
        1, branchLen, 1
      )
      dummy.updateMatrix()

      branchMesh.setMatrixAt(
        i, dummy.matrix
      )
    }

    branchMesh.instanceMatrix.needsUpdate = true
    this.group.add(branchMesh)
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

    const patchCount = 12
    const patchLength = 12
    const patchGap = 22

    for (
      let patch = 0;
      patch < patchCount;
      patch++
    ) {

      const patchStartZ =
        ROAD_MAX_Z - 15 -
        patch * (patchLength + patchGap)

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

        const z =
          patchStartZ - j * 4.2

        const damaged =
          hash(patch * 90.2 + j) > 0.7

        const tiltX = damaged
          ? hashRange(
              patch * 90.3 + j,
              -0.2,
              0.2
            )
          : 0

        dummy.position.set(
          -7.6, 0.35, z
        )
        dummy.rotation.set(tiltX, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()

        railMesh.setMatrixAt(
          railIndex, dummy.matrix
        )
        railIndex++

        dummy.position.set(
          -7.6, 0.5, z + 2
        )
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        postMesh.setMatrixAt(
          postIndex, dummy.matrix
        )
        postIndex++

        dummy.position.set(
          -7.6, 0.5, z - 2
        )
        dummy.updateMatrix()
        postMesh.setMatrixAt(
          postIndex, dummy.matrix
        )
        postIndex++

        if (
          railIndex < GUARDRAIL_COUNT
        ) {

          dummy.position.set(
            7.6, 0.35, z
          )
          dummy.rotation.set(
            -tiltX * 0.5, 0, 0
          )
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          railMesh.setMatrixAt(
            railIndex, dummy.matrix
          )
          railIndex++

          dummy.position.set(
            7.6, 0.5, z + 2
          )
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          postMesh.setMatrixAt(
            postIndex, dummy.matrix
          )
          postIndex++

          dummy.position.set(
            7.6, 0.5, z - 2
          )
          dummy.updateMatrix()
          postMesh.setMatrixAt(
            postIndex, dummy.matrix
          )
          postIndex++
        }
      }
    }

    railMesh.instanceMatrix.needsUpdate = true
    postMesh.instanceMatrix.needsUpdate = true
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

    const positions = [
      { x: -11, z: -50, rotY: 0.15, s: 0.9 },
      { x: 13, z: -110, rotY: -0.25, s: 1.0 },
      { x: -15, z: -170, rotY: 0.4, s: 0.85 },
      { x: 12, z: -220, rotY: -0.1, s: 0.95 },
      { x: -13, z: -280, rotY: 0.3, s: 0.88 },
      { x: 14, z: -340, rotY: -0.35, s: 0.92 },
      { x: -12, z: -420, rotY: 0.2, s: 0.87 },
      { x: 15, z: -500, rotY: -0.3, s: 0.93 },
      { x: -14, z: -580, rotY: 0.25, s: 0.9 },
      { x: 11, z: -660, rotY: -0.2, s: 0.86 },
      { x: -13, z: -740, rotY: 0.35, s: 0.91 },
      { x: 14, z: -820, rotY: -0.15, s: 0.88 },
    ]

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

      car.position.set(pos.x, 0, pos.z)
      car.rotation.y = pos.rotY
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

    for (
      let i = 0;
      i < MILE_MARKER_COUNT;
      i++
    ) {

      const side =
        hash(i * 31.1) > 0.5 ? 1 : -1

      const x =
        side *
        (7.8 + hash(i * 32.2) * 2)

      const z =
        ROAD_MAX_Z - 5 - i * 23

      const tilt =
        hashRange(i * 33.3, -0.2, 0.2)

      dummy.position.set(x, 0.45, z)
      dummy.rotation.set(
        tilt, 0,
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

    for (
      let i = 0;
      i < DEBRIS_COUNT;
      i++
    ) {

      const side =
        hash(i * 95.1) > 0.5 ? 1 : -1

      const x =
        side *
        (7.5 + hash(i * 95.2) * 12)

      const z =
        ROAD_MAX_Z -
        hash(i * 95.3) * ROAD_LENGTH

      const scaleX =
        hashRange(i * 95.4, 0.3, 1.5)

      const rotY =
        hash(i * 95.5) * Math.PI * 2

      dummy.position.set(x, 0.07, z)
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
    this.updateTreeSway(dt, time)
    this.updateShadowFollowing()
    this.updateSilhouettes(dt, time)
    this.updateDisturbances(dt, time)
    this.updateFogPacing(time)
  }


  updateHeadlights(time) {

    const pos = this.playerCar.position
    const frontZ = pos.z - 2
    const targetZ = pos.z - 35

    const flicker =
      1 + Math.sin(time * 8.7) * 0.01 +
      Math.sin(time * 13.3) * 0.008

    const leftX = pos.x - 0.6
    const rightX = pos.x + 0.6
    const lightY = pos.y + 0.4

    this.leftLight.position.set(
      leftX, lightY, frontZ
    )
    this.leftLight.intensity =
      HEADLIGHT_INTENSITY * flicker
    this.leftTarget.position.set(
      leftX, pos.y, targetZ
    )
    this.leftCone.position.set(
      leftX, lightY, frontZ - 17.5
    )
    this.leftCone.rotation.set(
      -Math.PI / 2, 0, 0
    )
    this.leftBulb.position.set(
      leftX, lightY, frontZ
    )

    this.rightLight.position.set(
      rightX, lightY, frontZ
    )
    this.rightLight.intensity =
      HEADLIGHT_INTENSITY * flicker
    this.rightTarget.position.set(
      rightX, pos.y, targetZ
    )
    this.rightCone.position.set(
      rightX, lightY, frontZ - 17.5
    )
    this.rightCone.rotation.set(
      -Math.PI / 2, 0, 0
    )
    this.rightBulb.position.set(
      rightX, lightY, frontZ
    )
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


  updateTreeSway(dt, time) {

    if (
      this.treeVariationMeshes.length > 0
    ) {
      this.updateTreeSwayGLB(dt, time)
    } else if (this.trunkMesh) {
      this.updateTreeSwayFallback(dt, time)
    }
  }


  updateTreeSwayGLB(dt, time) {

    const dummy = new THREE.Object3D()

    for (
      let i = 0;
      i < this.treePlacementData.length;
      i++
    ) {

      const data = this.treePlacementData[i]
      const base = data.base
      const sway = data.sway

      const swayX =
        Math.sin(
          time * sway.speed + sway.phase
        ) *
        sway.amplitude

      const swayZ =
        Math.cos(
          time * sway.speed * 0.7 +
            sway.phase + 1.5
        ) *
        sway.amplitude *
        0.6

      dummy.position.set(
        base.x, 0, base.z
      )
      dummy.rotation.set(
        base.leanX + swayX,
        base.rotY,
        base.leanZ + swayZ
      )
      dummy.scale.setScalar(base.scale)
      dummy.updateMatrix()

      const mesh =
        this.treeVariationMeshes[
          data.variationIdx
        ]
      mesh.setMatrixAt(
        data.instanceIdx,
        dummy.matrix
      )
    }

    for (
      const mesh of this.treeVariationMeshes
    ) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }


  updateTreeSwayFallback(dt, time) {

    if (!this.trunkMesh) return

    const dummy = new THREE.Object3D()

    const totalTrees =
      this.treeBaseMatrices.length

    for (
      let i = 0;
      i < totalTrees;
      i++
    ) {

      const base = this.treeBaseMatrices[i]
      const sway = this.treeSwayData[i]

      if (!base || !sway) continue

      const swayX =
        Math.sin(
          time * sway.speed + sway.phase
        ) *
        sway.amplitude

      const swayZ =
        Math.cos(
          time * sway.speed * 0.7 +
            sway.phase + 1.5
        ) *
        sway.amplitude *
        0.6

      dummy.position.set(
        base.x, 0, base.z
      )
      dummy.rotation.set(
        base.leanX + swayX,
        base.rotY,
        base.leanZ + swayZ
      )
      dummy.scale.set(
        base.widthScale,
        base.height,
        base.widthScale
      )
      dummy.updateMatrix()

      this.trunkMesh.setMatrixAt(
        i, dummy.matrix
      )
    }

    this.trunkMesh.instanceMatrix.needsUpdate =
      true
  }


  updateShadowFollowing() {

    if (!this.moonLight) return

    const pz =
      this.playerCar.position.z

    this.moonLight.position.set(
      -30, 35, pz - 90
    )

    this.moonLight.target.position.set(
      0, 0, pz
    )
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

    for (
      const mesh of this.treeVariationMeshes
    ) {
      if (mesh.parent) {
        mesh.parent.remove(mesh)
      }
      mesh.dispose()
    }
    this.treeVariationMeshes = []
    this.treePlacementData = []

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
    this.treeBaseMatrices = []
    this.treeSwayData = []
    this.silhouetteMeshes = []
    this.silhouetteData = []
    this.trunkMesh = null

    this.scene.fog = null
  }
}
