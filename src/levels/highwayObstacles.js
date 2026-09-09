import * as THREE from 'three'


// ============================================
// OBSTACLE CONSTANTS
// ============================================

// Car collision half-extents
const CAR_HALF_DEPTH = 2.0
const CAR_HALF_WIDTH = 0.9

// Minimum progress before obstacles appear
// (avoids the start/countdown area)
const MIN_PROGRESS = 80

// Minimum progress before finish
const FINISH_BUFFER = 80

// Spacing between obstacles
const MIN_SPACING = 90
const MAX_SPACING = 130

// Lateral offset range (within road bounds)
const ROAD_HALF_WIDTH = 6.5
const LATERAL_MIN = -3.5
const LATERAL_MAX = 3.5


// ============================================
// GET POSITION ALONG ROAD PATH
// ============================================

function getPositionOnRoad(
  roadPath,
  arcLengths,
  distance
) {
  const totalLength =
    arcLengths[arcLengths.length - 1]

  if (distance <= 0) {
    return {
      position: roadPath[0].clone(),
      angle: 0,
    }
  }

  if (distance >= totalLength) {
    const last = roadPath.length - 1
    return {
      position: roadPath[last].clone(),
      angle: 0,
    }
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

  const p0 = roadPath[segIndex]
  const p1 = roadPath[segIndex + 1]

  const position = new THREE.Vector3(
    p0.x + (p1.x - p0.x) * t,
    0,
    p0.z + (p1.z - p0.z) * t
  )

  const dx = p1.x - p0.x
  const dz = p1.z - p0.z
  const len = Math.sqrt(dx * dx + dz * dz)

  const angle =
    len > 0.001
      ? Math.atan2(dx, dz)
      : 0

  return { position, angle }
}


// ============================================
// OBSTACLE TYPE DEFINITIONS
// ============================================

const OBSTACLE_TYPES = [
  {
    name: 'crate',
    width: 2.2,
    depth: 2.2,
    height: 1.8,
    color: 0x8B5E3C,
    emissive: 0x3A2510,
  },
  {
    name: 'barricade',
    width: 4.0,
    depth: 1.0,
    height: 1.2,
    color: 0xCC6600,
    emissive: 0x442200,
  },
  {
    name: 'concrete',
    width: 2.0,
    depth: 3.0,
    height: 1.4,
    color: 0x666666,
    emissive: 0x222222,
  },
  {
    name: 'wreckedCar',
    width: 2.0,
    depth: 4.0,
    height: 1.6,
    color: 0x334455,
    emissive: 0x111822,
  },
]


// ============================================
// BUILD OBSTACLE MESH
// ============================================

function buildObstacleMesh(type) {
  const group = new THREE.Group()

  const bodyMat =
    new THREE.MeshStandardMaterial({
      color: type.color,
      roughness: 0.8,
      metalness: 0.2,
      emissive: type.emissive,
      emissiveIntensity: 0.3,
    })

  const body =
    new THREE.Mesh(
      new THREE.BoxGeometry(
        type.width,
        type.height,
        type.depth
      ),
      bodyMat
    )

  body.position.y = type.height * 0.5
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  if (type.name === 'barricade') {
    const stripeMat =
      new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
      })

    const stripe =
      new THREE.Mesh(
        new THREE.BoxGeometry(
          type.width * 0.9,
          0.15,
          type.depth * 0.5
        ),
        stripeMat
      )

    stripe.position.y = type.height * 0.6
    group.add(stripe)
  }

  return group
}


// ============================================
// CREATE OBSTACLES
// ============================================

export function createObstacles(
  roadPath,
  arcLengths,
  totalRoadLength,
  highwayGroup
) {
  const obstacles = []

  let currentProgress = MIN_PROGRESS
  const maxProgress =
    totalRoadLength - FINISH_BUFFER

  while (currentProgress < maxProgress) {
    const spacing =
      MIN_SPACING +
      Math.random() *
        (MAX_SPACING - MIN_SPACING)

    currentProgress += spacing

    if (currentProgress >= maxProgress) {
      break
    }

    const typeIndex =
      Math.floor(
        Math.random() *
          OBSTACLE_TYPES.length
      )
    const type =
      OBSTACLE_TYPES[typeIndex]

    const lateralOffset =
      LATERAL_MIN +
      Math.random() *
        (LATERAL_MAX - LATERAL_MIN)

    const roadSample =
      getPositionOnRoad(
        roadPath,
        arcLengths,
        currentProgress
      )

    const dir = roadSample.angle
    const perpX = -Math.cos(dir)
    const perpZ = Math.sin(dir)

    const worldX =
      roadSample.position.x +
      perpX * lateralOffset
    const worldZ =
      roadSample.position.z +
      perpZ * lateralOffset

    const mesh =
      buildObstacleMesh(type)

    mesh.position.set(
      worldX,
      0,
      worldZ
    )
    mesh.rotation.y = dir
    highwayGroup.add(mesh)

    const obstacle = {
      mesh: mesh,
      progress: currentProgress,
      lateralOffset: lateralOffset,
      halfWidth: type.width * 0.5,
      halfDepth: type.depth * 0.5,
      hit: false,
    }

    obstacles.push(obstacle)
  }

  return obstacles
}


// ============================================
// CHECK COLLISION
//
// Returns the closest obstacle that the car
// would overlap given its path progress and
// lateral offset. Returns null if clear.
// ============================================

export function checkObstacleCollision(
  obstacles,
  carProgress,
  carLateral,
  carHalfDepth,
  carHalfWidth
) {
  let closest = null
  let closestDist = Infinity

  for (
    let i = 0;
    i < obstacles.length;
    i++
  ) {
    const obs = obstacles[i]

    const progressDist =
      Math.abs(
        carProgress - obs.progress
      )

    const totalDepth =
      carHalfDepth + obs.halfDepth

    if (progressDist >= totalDepth) {
      continue
    }

    const lateralDist =
      Math.abs(
        carLateral - obs.lateralOffset
      )

    const totalWidth =
      carHalfWidth + obs.halfWidth

    if (lateralDist >= totalWidth) {
      continue
    }

    if (progressDist < closestDist) {
      closestDist = progressDist
      closest = obs
    }
  }

  return closest
}


// ============================================
// CHECK PLAYER COLLISION
//
// Called from highwayCar.js after steering
// but before advancing pathProgress.
//
// If a collision would occur, returns the
// obstacle so the caller can clamp progress.
// ============================================

export function checkPlayerObstacleCollision(
  obstacles,
  currentProgress,
  newProgress,
  lateralOffset
) {
  for (
    let i = 0;
    i < obstacles.length;
    i++
  ) {
    const obs = obstacles[i]

    // Only check obstacles between current
    // and new progress (ahead of the car)
    if (
      obs.progress <= currentProgress ||
      obs.progress >= newProgress
    ) {
      continue
    }

    // Check lateral overlap
    const lateralDist =
      Math.abs(
        lateralOffset - obs.lateralOffset
      )

    const totalWidth =
      CAR_HALF_WIDTH + obs.halfWidth

    if (lateralDist >= totalWidth) {
      continue
    }

    return obs
  }

  return null
}


// ============================================
// DISPOSE OBSTACLES
// ============================================

export function disposeObstacles(obstacles) {
  for (
    let i = 0;
    i < obstacles.length;
    i++
  ) {
    const obs = obstacles[i]

    if (obs.mesh.parent) {
      obs.mesh.parent.remove(obs.mesh)
    }

    obs.mesh.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        child.material.dispose()
      }
    })
  }

  obstacles.length = 0
}
