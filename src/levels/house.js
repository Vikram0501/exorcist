import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addLevelLights } from './lighting.js'

const SHOW_COLLIDERS = false
const WALL_SECTION_LENGTH = 0.25
const STAIR_WALL_OVERLAP = 0.03
const PASSAGE_CLEARANCE = 0.12
const MIN_PASSAGE_WIDTH = 0.5

const DOOR_NAMES = [
  'Door_Back_Left_Hinge',
  'Door_Back_Right_Hinge',
  'Door_Interior_01',
  'Door_Interior_02',
]

const DOOR_OPENINGS = [
  { axis: 'x', min: 4.75, max: 6.35, plane: -16.05, minY: 0, maxY: 2.2 },
  { axis: 'x', min: 4.16, max: 5.2, plane: -2.22, minY: 0, maxY: 2.2 },
  { axis: 'z', min: -6.35, max: -5.35, plane: 11.6, minY: 0, maxY: 2.2 },
]

const PASSAGE_OPENINGS = [
  { axis: 'z', min: -6.65, max: -5.65, plane: 5.54, minY: 0, maxY: 2.2 },
  { axis: 'z', min: -7.05, max: -6.15, plane: 3.94, minY: 3.35, maxY: 6.4 },
  { axis: 'x', min: 8.25, max: 9.45, plane: -5.45, minY: 3.35, maxY: 6.4 },
  { axis: 'x', min: 9.45, max: 10.75, plane: -7.7, minY: 3.35, maxY: 6.4 },
]

const STAIR_WALL_AREA = {
  minX: 5,
  maxX: 7.9,
  minZ: -10.1,
  maxZ: -7.5,
}

const DOOR_OPEN_DIRECTIONS = {
  Door_Back_Left_Hinge: Math.PI / 2,
  Door_Back_Right_Hinge: -Math.PI / 2,
  Door_Interior_01: Math.PI / 2,
  Door_Interior_02: -Math.PI / 2,
}

const FLOORS = [
  [0, 11.78, -16.1, 0.4, 0],
  [0, 11.78, -6.4, 0.4, 3.35],
  [0, 11.78, -16.1, -10, 3.35],
  [0, 5, -10, -6.4, 3.35],
  [7.9, 11.78, -10, -6.4, 3.35],
]

const STAIR_RAMP = {
  type: 'ramp',
  points: [
    [5.5, -9.27],
    [6.35, -9.33],
    [7.15, -8.54],
    [7.1, -7.68],
    [6.25, -7],
    [5.4, -7.14],
  ],
  bottomY: 0,
  topY: 3.35,
  width: 0.6,
}

function createFloorColliders() {
  return [
    ...FLOORS.map(([minX, maxX, minZ, maxZ, top]) => ({
      type: 'floor',
      minX,
      maxX,
      minZ,
      maxZ,
      top,
      floor: top === 0 ? 0 : 1,
    })),
  ]
}

function splitWallSection(box) {
  const size = box.getSize(new THREE.Vector3())
  const axis = size.x >= size.z ? 'x' : 'z'
  const plane = axis === 'x' ? (box.min.z + box.max.z) / 2 : (box.min.x + box.max.x) / 2
  const opening = [...DOOR_OPENINGS, ...PASSAGE_OPENINGS].find((candidate) =>
    candidate.axis === axis &&
    Math.abs(candidate.plane - plane) < 0.2 &&
    box.min.y < candidate.maxY &&
    box.max.y > candidate.minY
  )

  if (!opening) return [box]

  const min = axis === 'x' ? box.min.x : box.min.z
  const max = axis === 'x' ? box.max.x : box.max.z
  const clearance = PASSAGE_OPENINGS.includes(opening) ? PASSAGE_CLEARANCE : 0
  const openingMin = opening.min - clearance
  const openingMax = opening.max + clearance
  if (openingMax <= min || openingMin >= max) return [box]

  const sections = []
  if (openingMin > min) {
    const left = box.clone()
    if (axis === 'x') left.max.x = openingMin
    else left.max.z = openingMin
    sections.push(left)
  }
  if (openingMax < max) {
    const right = box.clone()
    if (axis === 'x') right.min.x = openingMax
    else right.min.z = openingMax
    sections.push(right)
  }
  return sections
}

function isDoorChild(mesh) {
  let object = mesh
  while (object) {
    if (DOOR_NAMES.includes(object.name)) return true
    object = object.parent
  }
  return false
}

function isStairWallComponent(box) {
  return (
    box.min.y < 0.1 &&
    box.max.y > 2.5 &&
    box.min.x >= STAIR_WALL_AREA.minX &&
    box.max.x <= STAIR_WALL_AREA.maxX &&
    box.min.z >= STAIR_WALL_AREA.minZ &&
    box.max.z <= STAIR_WALL_AREA.maxZ
  )
}

function splitLongWallSection(box, triangles, position, mesh) {
  const size = box.getSize(new THREE.Vector3())
  const axis = size.x >= size.z ? 'x' : 'z'
  const min = axis === 'x' ? box.min.x : box.min.z
  const max = axis === 'x' ? box.max.x : box.max.z
  const length = max - min
  if (length <= WALL_SECTION_LENGTH * 2) return [box]

  const binCount = Math.ceil(length / WALL_SECTION_LENGTH)
  const occupied = new Array(binCount).fill(false)
  const bodyMinY = box.min.y + 0.1
  const bodyMaxY = Math.min(box.max.y, box.min.y + 1.8)
  const point = new THREE.Vector3()

  for (const triangle of triangles) {
    let triangleMin = Infinity
    let triangleMax = -Infinity
    let triangleMinY = Infinity
    let triangleMaxY = -Infinity
    for (const vertex of triangle) {
      point.fromBufferAttribute(position, vertex)
      mesh.localToWorld(point)
      const value = axis === 'x' ? point.x : point.z
      triangleMin = Math.min(triangleMin, value)
      triangleMax = Math.max(triangleMax, value)
      triangleMinY = Math.min(triangleMinY, point.y)
      triangleMaxY = Math.max(triangleMaxY, point.y)
    }
    if (triangleMaxY <= bodyMinY || triangleMinY >= bodyMaxY) continue

    const firstBin = Math.max(0, Math.floor((triangleMin - min) / WALL_SECTION_LENGTH))
    const lastBin = Math.min(binCount - 1, Math.floor((triangleMax - min) / WALL_SECTION_LENGTH))
    for (let bin = firstBin; bin <= lastBin; bin++) occupied[bin] = true
  }

  if (!occupied.some(Boolean)) return []

  const occupiedRuns = []
  let firstOccupiedBin = null
  for (let bin = 0; bin < binCount; bin++) {
    if (occupied[bin] && firstOccupiedBin === null) firstOccupiedBin = bin
    if (occupied[bin] || firstOccupiedBin === null) continue

    occupiedRuns.push({ first: firstOccupiedBin, last: bin - 1 })
    firstOccupiedBin = null
  }
  if (firstOccupiedBin !== null) {
    occupiedRuns.push({ first: firstOccupiedBin, last: binCount - 1 })
  }

  const sections = []
  for (let run = 0; run < occupiedRuns.length; run++) {
    const { first, last } = occupiedRuns[run]
    const gapBefore = run === 0
      ? 0
      : (first - occupiedRuns[run - 1].last - 1) * WALL_SECTION_LENGTH
    const gapAfter = run === occupiedRuns.length - 1
      ? 0
      : (occupiedRuns[run + 1].first - last - 1) * WALL_SECTION_LENGTH
    const section = box.clone()
    let sectionMin = min + first * WALL_SECTION_LENGTH
    let sectionMax = Math.min(max, min + (last + 1) * WALL_SECTION_LENGTH)
    if (gapBefore >= MIN_PASSAGE_WIDTH) sectionMin += PASSAGE_CLEARANCE
    if (gapAfter >= MIN_PASSAGE_WIDTH) sectionMax -= PASSAGE_CLEARANCE
    if (axis === 'x') {
      section.min.x = sectionMin
      section.max.x = sectionMax
    } else {
      section.min.z = sectionMin
      section.max.z = sectionMax
    }
    sections.push(section)
  }
  return sections
}

function getWallSections(mesh) {
  const position = mesh.geometry.getAttribute('position')
  const index = mesh.geometry.index
  const indices = index ? index.array : Array.from({ length: position.count }, (_, i) => i)
  const parents = Array.from({ length: position.count }, (_, i) => i)

  const find = (vertex) => {
    while (parents[vertex] !== vertex) {
      parents[vertex] = parents[parents[vertex]]
      vertex = parents[vertex]
    }
    return vertex
  }
  const join = (first, second) => {
    const firstRoot = find(first)
    const secondRoot = find(second)
    if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot
  }

  for (let i = 0; i < indices.length; i += 3) {
    join(indices[i], indices[i + 1])
    join(indices[i], indices[i + 2])
  }

  const components = new Map()
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i])
    if (!components.has(root)) {
      components.set(root, { vertices: new Set(), triangles: [] })
    }
    const component = components.get(root)
    component.vertices.add(indices[i])
    component.vertices.add(indices[i + 1])
    component.vertices.add(indices[i + 2])
    component.triangles.push([indices[i], indices[i + 1], indices[i + 2]])
  }

  const point = new THREE.Vector3()
  const colliders = []
  for (const component of components.values()) {
    const box = new THREE.Box3()
    for (const vertex of component.vertices) {
      point.fromBufferAttribute(position, vertex)
      box.expandByPoint(mesh.localToWorld(point.clone()))
    }

    const size = box.getSize(new THREE.Vector3())
    const height = size.y
    const length = Math.max(size.x, size.z)
    const thickness = Math.min(size.x, size.z)
    const curvedStairWall = isStairWallComponent(box)
    if ((height < 2.5 || length < 0.5 || thickness > 0.75) && !curvedStairWall) continue

    const spatialSections = curvedStairWall
      ? [box]
      : splitLongWallSection(box, component.triangles, position, mesh)
    for (const spatialSection of spatialSections) {
      for (const section of splitWallSection(spatialSection)) {
        if (curvedStairWall) {
          section.expandByVector(new THREE.Vector3(STAIR_WALL_OVERLAP, 0, STAIR_WALL_OVERLAP))
          console.log('Curved stair wall component:', section)
        }
        colliders.push({
          type: 'wall',
          minX: section.min.x,
          maxX: section.max.x,
          minZ: section.min.z,
          maxZ: section.max.z,
          minY: section.min.y,
          maxY: section.max.y,
        })
      }
    }
  }
  return colliders
}

function createWallColliders(model) {
  const colliders = []
  model.traverse((child) => {
    if (!child.isMesh || isDoorChild(child)) return

    const box = new THREE.Box3().setFromObject(child)
    const sections = getWallSections(child)
    if (sections.length === 0) return

    console.log('Structural wall mesh:', child.name, { min: box.min, max: box.max })
    for (const section of sections) {
      console.log('Wall collider:', child.name, section)
      colliders.push(section)
    }
  })
  return colliders
}

function logMeshBounds(model) {
  model.traverse((child) => {
    if (!child.isMesh) return
    const box = new THREE.Box3().setFromObject(child)
    const size = box.getSize(new THREE.Vector3())
    const horizontalSize = Math.max(size.x, size.z)
    const thickness = Math.min(size.x, size.z)
    const likelyWall = size.y >= 2.5 && horizontalSize >= 0.4 && thickness <= 0.35
    console.log('GLB mesh:', child.name, {
      min: box.min,
      max: box.max,
      size,
      likelyWall,
    })
  })
}

function addColliderHelpers(scene, colliders) {
  const helpers = []

  for (const collider of colliders) {
    const box = new THREE.Box3(
      new THREE.Vector3(collider.minX, collider.minY, collider.minZ),
      new THREE.Vector3(collider.maxX, collider.maxY, collider.maxZ)
    )
    const size = box.getSize(new THREE.Vector3())
    if (size.x < 0.02) box.expandByVector(new THREE.Vector3(0.02, 0, 0))
    if (size.z < 0.02) box.expandByVector(new THREE.Vector3(0, 0, 0.02))
    const helper = new THREE.Box3Helper(box, collider.minY < 3.2 ? 0xff3355 : 0x22ddff)
    helper.visible = SHOW_COLLIDERS
    scene.add(helper)
    helpers.push(helper)
  }
  return helpers
}

function findDoors(model) {
  return DOOR_NAMES.flatMap((name) => {
    const object = model.getObjectByName(name)
    if (!object) {
      console.warn(`Missing expected door node: ${name}`)
      return []
    }

    const closedRotation = object.rotation.y
    const openRotation = closedRotation + DOOR_OPEN_DIRECTIONS[name]
    console.log('Found door node:', name, object)
    return [{
      name,
      object,
      closedRotation,
      openRotation,
      targetRotation: closedRotation,
      isOpen: false,
      openProgress: 0,
    }]
  })
}

export function updateDoors(doors, dt) {
  for (const door of doors) {
    door.object.rotation.y = THREE.MathUtils.damp(
      door.object.rotation.y,
      door.targetRotation,
      14,
      dt
    )
    door.openProgress = THREE.MathUtils.clamp(
      Math.abs(door.object.rotation.y - door.closedRotation) /
        Math.abs(door.openRotation - door.closedRotation),
      0,
      1
    )
  }
}

export function toggleDoor(door) {
  door.isOpen = !door.isOpen
  door.targetRotation = door.isOpen ? door.openRotation : door.closedRotation
}

export function getDoorColliders(doors) {
  return doors.flatMap((door) => {
    if (door.openProgress > 0.8) return []
    const box = new THREE.Box3().setFromObject(door.object)
    return {
      type: 'door',
      name: door.name,
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
      minY: box.min.y,
      maxY: box.max.y,
      floor: 0,
    }
  })
}

export function loadHouse(scene) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()

    loader.load(
      '/models/house_game.glb',
      (gltf) => {
        const model = gltf.scene
        model.traverse((child) => {
          if (!child.isMesh) return
          child.castShadow = true
          child.receiveShadow = true
        })
        model.updateMatrixWorld(true)

        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        console.log('House GLB bounds:', { min: box.min, max: box.max, size })

        scene.add(model)
        logMeshBounds(model)
        const walls = createWallColliders(model)
        const colliderHelpers = addColliderHelpers(scene, walls)
        const doors = findDoors(model)
        addLevelLights(scene, size)

        resolve({
          colliders: [...createFloorColliders(), ...walls],
          colliderHelpers,
          doors,
          ramps: [STAIR_RAMP],
          model,
          spawn: new THREE.Vector3(3, 1.7, -4),
          modelSize: size,
        })
      },
      undefined,
      (err) => {
        console.error('Failed to load house_game.glb:', err)
        reject(err)
      }
    )
  })
}
