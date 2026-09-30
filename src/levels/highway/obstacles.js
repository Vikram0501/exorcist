import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinnedModel }
  from 'three/addons/utils/SkeletonUtils.js'


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
// OBSTACLE MODEL DEFINITIONS
// ============================================

// One entry per visual, cycled in order by obstacle index. Collision boxes
// are tuned to each visual so hits stay fair relative to what the player
// sees. Both zombie sources face +Z natively (toes ahead of feet), while an
// obstacle group's +Z points along the direction of travel, so zombies get
// a half-turn to face oncoming traffic. The wire fence already spans local
// X, which lies across the road, so it needs no extra yaw.
const OBSTACLE_MODEL_DEFS = [
  {
    key: 'zombie',
    url: '/models/zombie.glb',
    targetHeight: 2.2,
    yaw: Math.PI,
    halfWidth: 0.7,
    halfDepth: 0.7,
    animate: true,
  },
  {
    key: 'scientist',
    url: '/models/zombie_doom_scientist.glb',
    targetHeight: 2.1,
    yaw: Math.PI,
    halfWidth: 1.0,
    halfDepth: 0.6,
    animate: false,
  },
  {
    key: 'barbed',
    url: '/models/barbed_wire.glb',
    targetWidth: 4.0,
    yaw: 0,
    halfWidth: 2.0,
    halfDepth: 0.8,
    animate: false,
  },
]


export const OBSTACLE_MODEL_URLS =
  OBSTACLE_MODEL_DEFS.map((def) => def.url)


// ============================================
// GLB LOADING (once per Level 3 load)
// ============================================

export async function loadObstacleModels() {
  const loader = new GLTFLoader()

  const results = await Promise.allSettled(
    OBSTACLE_MODEL_DEFS.map(
      async (def) => {
        const gltf = await loader.loadAsync(def.url)
        return prepareObstacleTemplate(def, gltf)
      }
    )
  )

  const failed = results.find(
    (result) => result.status === 'rejected'
  )

  if (failed) {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      disposeObstacleTemplate(result.value)
    }
    throw failed.reason
  }

  return results.map((result) => result.value)
}


// The source hierarchy is kept intact (skinned meshes must stay bound to
// their skeleton), so a template is the loaded scene with shadows enabled
// plus its measured footprint and clips. Clones share geometry/materials.
function prepareObstacleTemplate(def, gltf) {
  const scene = gltf.scene

  scene.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(scene)

  scene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const size = box.getSize(new THREE.Vector3())

  const scale = def.targetWidth !== undefined
    ? def.targetWidth / size.x
    : def.targetHeight / size.y

  return {
    key: def.key,
    def,
    scene,
    box,
    scale,
    // Lifts the model's lowest point onto the road surface.
    yOffset: -box.min.y * scale,
    clips: gltf.animations,
  }
}


function disposeObstacleTemplate(template) {
  template.scene.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose()
    }
    if (object.material) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose()
        }
        material.dispose()
      }
    }
  })
}


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
// BUILD OBSTACLE VISUAL
// ============================================

function buildObstacleVisual(template, obstacleIndex) {
  const group = new THREE.Group()
  group.name = `obstacle_${template.key}`

  const visual = new THREE.Group()
  visual.scale.setScalar(template.scale)
  visual.rotation.y = template.def.yaw
  visual.position.y = template.yOffset
  group.add(visual)

  // SkeletonUtils.clone rebinds skinned meshes to a fresh skeleton so each
  // zombie animates independently; plain meshes clone cheaply the same way.
  // Geometry/materials stay shared with the template.
  const model = cloneSkinnedModel(template.scene)
  visual.add(model)

  let mixer = null

  if (template.def.animate && template.clips.length > 0) {
    mixer = new THREE.AnimationMixer(model)
    const action = mixer.clipAction(template.clips[0])
    // Stagger the loop so grouped zombies do not move in lockstep.
    action.time = (obstacleIndex * 1.7) % template.clips[0].duration
    action.play()
  }

  return { group, mixer }
}


// ============================================
// CREATE OBSTACLES
// ============================================

export function createObstacles(
  templates,
  roadPath,
  arcLengths,
  totalRoadLength,
  highwayGroup
) {
  const obstacles = []

  let currentProgress = MIN_PROGRESS
  const maxProgress =
    totalRoadLength - FINISH_BUFFER

  let obstacleIndex = 0

  while (currentProgress < maxProgress) {
    const spacing =
      MIN_SPACING +
      Math.random() *
        (MAX_SPACING - MIN_SPACING)

    currentProgress += spacing

    if (currentProgress >= maxProgress) {
      break
    }

    // Cycle the three visuals in order: zombie, scientist, barbed wire.
    const template =
      templates[obstacleIndex % templates.length]
    const def = template.def

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

    const { group, mixer } = buildObstacleVisual(
      template,
      obstacleIndex
    )

    group.position.set(
      worldX,
      0,
      worldZ
    )
    group.rotation.y = dir
    highwayGroup.add(group)

    const obstacle = {
      mesh: group,
      progress: currentProgress,
      lateralOffset: lateralOffset,
      halfWidth: def.halfWidth,
      halfDepth: def.halfDepth,
      hit: false,
      modelKey: template.key,
      mixer: mixer,
    }

    obstacles.push(obstacle)
    obstacleIndex++
  }

  return obstacles
}


// ============================================
// UPDATE OBSTACLES (zombie animation)
// ============================================

export function updateObstacles(obstacles, dt) {
  for (
    let i = 0;
    i < obstacles.length;
    i++
  ) {
    const mixer = obstacles[i].mixer

    if (mixer) {
      mixer.update(dt)
    }
  }
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

    if (obs.mixer) {
      obs.mixer.stopAllAction()
      obs.mixer.uncacheRoot(obs.mesh)
      obs.mixer = null
    }

    if (obs.mesh.parent) {
      obs.mesh.parent.remove(obs.mesh)
    }

    // Cloned visuals share the template's geometry/materials; dispose calls
    // are idempotent and the whole set is discarded with the level.
    obs.mesh.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(
            (m) => m && m.dispose()
          )
        } else {
          child.material.dispose()
        }
      }
    })
  }

  obstacles.length = 0
}
