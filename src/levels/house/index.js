import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Octree } from 'three/addons/math/Octree.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { setupHouseLighting } from './lighting.js'

// Current house scene exported from Blender. Includes the surrounding forest and
// four boundary meshes named Plane, Plane.001, Plane.002 and Plane.003.
// Generated from House.glb with WebP textures and meshopt compression. Keep
// the Blender export beside it as the editable source asset.
const HOUSE_MODEL_URL = '/models/House.optimized.glb'
const HOUSE_SCALE = 0.15

const DOOR_SPEED = 12
const DOOR_OPEN_ANGLE = Math.PI / 2

// The source model was exported from SketchUp/Blender with local Z as up.
// The GLB scene root converts it to Three.js Y-up.
const LOCAL_VERTICAL_AXIS = 'z'
const LOCAL_VERTICAL = new THREE.Vector3(0, 0, 1)

// -----------------------------------------------------------------------------
// COLLISION SELECTION
// -----------------------------------------------------------------------------
// Use only structural / walkable labelled meshes. This keeps the Octree small,
// while floors, walls and stairs come from the exact same model transforms as
// the visible house.

const COLLISION_KEYWORDS = [
  'floor',
  'wall',
  'structure',
  'stair',
  'railing',
  'railings',
  'pillar',
  'path',
  'road',
  'yard',
  'garden',
  'door frame',
  'window frame',
  'windows',
  'backyard',
  'rock',
  'roof',
]

const COLLISION_EXACT_EXCLUDES = new Set([
  'doors',
  'entire yard floor outline',
  'removed_duplicate_entire_yard_floor_outline',
  'barn door',
  'barn door frame',
  'removed_barn_door_frame',
])

// Blender boundary meshes. These stay in the model for collision but are
// hidden from rendering at runtime. Blender auto-names duplicated Plane objects
// as Plane.001, Plane.002, etc.
function isBoundaryCollisionMesh(object) {
  // Three.js may sanitize Blender names:
  //
  // Plane
  // Plane.001
  // Plane_001
  // Plane001
  //
  // Turn all of those into:
  // plane / plane001 / plane002 / plane003

  const name = (object?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return (
    name === 'plane' ||
    name === 'plane001' ||
    name === 'plane002' ||
    name === 'plane003'
  )
}

// Furniture collision.
// These two meshes contain the furniture in the current GLB.
// Their real triangles are used in the Octree rather than one huge box.
const FURNITURE_COLLISION_NAMES = new Set([
  'all furniture',
  'furniture',
])

// These meshes need collision even though their Blender-generated names do not
// identify their purpose. Keeping them explicit prevents future exports from
// silently making their geometry walk-through.
const EXPLICIT_COLLISION_MESH_NAMES = new Set([
  'material3.014',
  'material3.031',
  'material3.047',
  'material3.065',
  'all furniture',
  'furniture',
  'house floor',
])

// House Floor is a Blender helper mesh: it is collision-only at runtime.
const HIDDEN_RENDER_MESH_NAMES = new Set([
  'house floor',
])

// Player HUD X/Z coordinates of the two doors whose hinges
// need to be changed to the opposite side.
const DOOR_HINGE_SWAP_TARGETS = [
  { x: 2.7, z: 2.2 },
  { x: 1.3, z: 0.9 },
]

// Maximum distance from the supplied player coordinate
// for a door to count as the intended door.
const DOOR_HINGE_SWAP_MAX_DISTANCE = 1.0

function shouldUseForCollision(object) {
  if (!object?.isMesh) return false

  const name = (object.name || '')
    .trim()
    .toLowerCase()

  if (!name) return false

  if (COLLISION_EXACT_EXCLUDES.has(name)) {
    return false
  }

  // Invisible forest boundary walls.
  if (isBoundaryCollisionMesh(object)) {
    return true
  }

  // Indoor furniture
  if (
    FURNITURE_COLLISION_NAMES.has(name) ||
    EXPLICIT_COLLISION_MESH_NAMES.has(name)
  ) {
    return true
  }

  // Doors are dynamic and must NOT be baked into
  // the static house Octree.
  if (
    object.userData.dynamicDoor ||
    object.userData.dynamicDoorRoot
  ) {
    return false
  }

  return COLLISION_KEYWORDS.some(
    (keyword) =>
      name.includes(keyword),
  )
}

function shouldHideAtRuntime(object) {
  const name = (object?.name || '')
    .trim()
    .toLowerCase()

  return HIDDEN_RENDER_MESH_NAMES.has(name)
}

function getPlacementBox(root) {
  const box = new THREE.Box3()

  root.traverse((object) => {
    if (
      !object.isMesh ||
      shouldHideAtRuntime(object)
    ) {
      return
    }

    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox()
    }

    box.union(
      object.geometry.boundingBox
        .clone()
        .applyMatrix4(object.matrixWorld),
    )
  })

  // Keep the loader resilient to a malformed export with no renderable mesh.
  return box.isEmpty()
    ? new THREE.Box3().setFromObject(root)
    : box
}

// -----------------------------------------------------------------------------
// DOOR UPDATE / TOGGLE
// -----------------------------------------------------------------------------

export function updateDoors(doors, dt) {
  for (const door of doors) {
    if (door.type === 'slide') {
      const current =
        door.object.position[door.slideAxis]

      const target =
        door.targetPosition[door.slideAxis]

      door.object.position[door.slideAxis] =
        THREE.MathUtils.damp(
          current,
          target,
          DOOR_SPEED,
          dt,
        )

      door.openProgress =
        THREE.MathUtils.clamp(
          Math.abs(
            door.object.position[door.slideAxis] -
            door.closedPosition[door.slideAxis]
          ) /
          Math.max(door.slideDistance, 0.0001),
          0,
          1,
        )

      continue
    }

    door.object.rotation[door.rotationAxis] =
      THREE.MathUtils.damp(
        door.object.rotation[door.rotationAxis],
        door.targetRotation,
        DOOR_SPEED,
        dt,
      )

    door.openProgress = THREE.MathUtils.clamp(
      Math.abs(door.object.rotation[door.rotationAxis]) /
        Math.max(door.openAngle, 0.0001),
      0,
      1,
    )
  }
}

export function toggleDoor(door, playerWorldPosition = null) {
  door.isOpen = !door.isOpen

  if (door.type === 'slide') {
    door.targetPosition.copy(
      door.closedPosition,
    )

    if (door.isOpen) {
      door.targetPosition[door.slideAxis] +=
        door.slideSign * door.slideDistance
    }

    return
  }

  if (door.isOpen) {
    door.openSign =
      chooseSwingDirection(
        door,
        playerWorldPosition,
      )

    door.targetRotation =
      door.openSign * door.openAngle
  } else {
    door.targetRotation = 0
  }
}

function chooseSwingDirection(door, playerWorldPosition) {
  if (!playerWorldPosition) {
    return door.openSign || 1
  }

  door.object.updateWorldMatrix(true, false)

  const playerLocal = door.object.worldToLocal(
    playerWorldPosition.clone(),
  )

  const plusCentre = door.panelCentreLocal
    .clone()
    .applyAxisAngle(
      LOCAL_VERTICAL,
      door.openAngle,
    )

  const minusCentre = door.panelCentreLocal
    .clone()
    .applyAxisAngle(
      LOCAL_VERTICAL,
      -door.openAngle,
    )

  return plusCentre.distanceToSquared(playerLocal) >=
    minusCentre.distanceToSquared(playerLocal)
    ? 1
    : -1
}

// -----------------------------------------------------------------------------
// DYNAMIC DOOR COLLIDERS
// -----------------------------------------------------------------------------

export function getDoorColliders(doors) {
  return doors.flatMap((door) => {
    // Once the panel has moved enough to clear the opening, do not keep an
    // oversized axis-aligned Box3 across the doorway.
    if (door.openProgress > 0.18) {
      return []
    }

    door.object.updateWorldMatrix(true, true)

    const box = new THREE.Box3().setFromObject(
      door.object,
    )

    return [{
      type: 'door',
      name: door.name,
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
      minY: box.min.y,
      maxY: box.max.y,
    }]
  })
}

// -----------------------------------------------------------------------------
// HOUSE LOAD
// -----------------------------------------------------------------------------

export async function loadHouse(level) {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(HOUSE_MODEL_URL)
  const model = gltf.scene

  // If the uncleaned House(5).glb is accidentally used, remove the duplicate
  // combined mesh at runtime as a safety net. In the cleaned GLB this object is
  // already absent.
  removeKnownDuplicateMesh(model)

  model.scale.setScalar(HOUSE_SCALE)

  model.traverse((child) => {
  if (!child.isMesh) return

  if (shouldHideAtRuntime(child)) {
    child.visible = false
    child.castShadow = false
    child.receiveShadow = false
    return
  }

  if (isBoundaryCollisionMesh(child)) {
    console.log(
      'FOUND INVISIBLE BOUNDARY:',
      child.name,
    )

    // Completely invisible.
    child.visible = false
    child.castShadow = false
    child.receiveShadow = false

    return
  }

  child.castShadow = false
  child.receiveShadow = true
  })

  model.updateMatrixWorld(true)

  // Keep the original house alignment stable. The new forest and invisible
  // boundary walls are separate roots in House.glb and must not change the
  // centering used by the existing spawn, doors and lighting coordinates.
  const placementRoot =
    findObjectCaseInsensitive(model, 'world') || model

  // Do not let collision-only Blender helpers alter the visual house origin.
  // In particular, House Floor is deliberately much larger than the house.
  const initialBox = getPlacementBox(placementRoot)
  const initialCenter = initialBox.getCenter(
    new THREE.Vector3(),
  )

  model.position.x -= initialCenter.x
  model.position.z -= initialCenter.z
  model.position.y -= initialBox.min.y
  model.updateMatrixWorld(true)

  // Give the added barn meshes existing house materials and make their
  // interior-facing surfaces visible.
  prepareBarnVisuals(model)

  // Convert the labelled normal doors into independent hinged doors and add
  // the separately labelled barn door as a sliding door.
  const doors = createInteractiveDoors(model)
  model.updateMatrixWorld(true)

  const investigationItems =
    createInvestigationItems(model)

  // Build the collision Octree from the labelled structural meshes in THIS
  // model, using their final world transforms. No second GLB, no alignment drift.
  const {
    world: collisionWorld,
    names: collisionMeshNames,
  } = buildLabelledCollisionWorld(model)

  level.add(model)
  model.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())

  const { lightHelpers } =
    setupHouseLighting(level, model, size)

  const spawn = new THREE.Vector3(
    1,
    2,
    25,
  )

  // Face toward the centre of the house on spawn. Player.getForward() uses
  // (-sin(yaw), 0, -cos(yaw)), so derive yaw from the target direction.
  const houseTarget = new THREE.Vector3(0, 2, 0)
  const toHouse = houseTarget.clone().sub(spawn)
  const spawnYaw = Math.atan2(
    -toHouse.x,
    -toHouse.z,
  )

  console.log('Labelled house loaded', {
    size,
    spawn,
    spawnYaw,
    doors: doors.map((door) => door.name),
    collisionMeshes: collisionMeshNames,
  })

  return {
    colliders: [{
      type: 'octree',
      world: collisionWorld,
    }],
    colliderHelpers: [],
    lightHelpers,
    doors,
    investigationItems,
    ramps: [],
    model,
    spawn,
    spawnYaw,
    modelSize: size,
  }
}

// -----------------------------------------------------------------------------
// REMOVE DUPLICATE COMBINED MESH
// -----------------------------------------------------------------------------

function removeKnownDuplicateMesh(model) {
  const duplicateNames = new Set([
    'entire yard floor outline',
    'removed_duplicate_entire_yard_floor_outline',
    'barn door frame',
    'removed_barn_door_frame',
  ])

  const toRemove = []

  model.traverse((object) => {
    const name = (object.name || '').trim().toLowerCase()
    if (duplicateNames.has(name)) {
      toRemove.push(object)
    }
  })

  for (const object of toRemove) {
    if (object.parent) {
      object.parent.remove(object)
    }
  }

  if (toRemove.length > 0) {
    console.log(
      'Removed duplicate combined house mesh:',
      toRemove.map((object) => object.name),
    )
  }
}

// -----------------------------------------------------------------------------
// COLLISION WORLD FROM LABELLED MESHES
// -----------------------------------------------------------------------------

function buildLabelledCollisionWorld(model) {
  model.updateMatrixWorld(true)

  const collisionRoot = new THREE.Group()
  collisionRoot.name = 'House_Collision_Runtime'

  const names = []

  model.traverse((object) => {
    if (!shouldUseForCollision(object)) return

    object.updateWorldMatrix(true, false)

    const cleanName =
      (object.name || '').trim().toLowerCase()

    // =====================================================
    // INVISIBLE FOREST BOUNDARY WALLS
    // =====================================================
    //
    // Do NOT rely on the visible mesh triangles here.
    // Build a guaranteed solid box from each Plane instead.
    //
    // This means:
    //
    // Plane
    // Plane.001
    // Plane.002
    // Plane.003
    //
    // are invisible visually but remain solid collision.

    if (isBoundaryCollisionMesh(object)) {
      if (!object.geometry.boundingBox) {
        object.geometry.computeBoundingBox()
      }

      const box =
        object.geometry.boundingBox
          .clone()
          .applyMatrix4(object.matrixWorld)

      const size =
        box.getSize(
          new THREE.Vector3(),
        )

      const centre =
        box.getCenter(
          new THREE.Vector3(),
        )

      // Guarantee enough thickness for collision.
      const minimumThickness = 0.3

      if (size.x < minimumThickness) {
        size.x = minimumThickness
      }

      if (size.y < minimumThickness) {
        size.y = minimumThickness
      }

      if (size.z < minimumThickness) {
        size.z = minimumThickness
      }

      const collisionMesh =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            size.x,
            size.y,
            size.z,
          ),
        )

      collisionMesh.position.copy(centre)

      collisionMesh.name =
        `INVISIBLE_BOUNDARY_${object.name}`

      collisionRoot.add(
        collisionMesh,
      )

      names.push(
        `${object.name} [INVISIBLE BOUNDARY]`,
      )

      console.log(
        'Created invisible boundary collider:',
        object.name,
        {
          size,
          centre,
        },
      )

      return
    }

    // =====================================================
    // BARN WALLS
    // =====================================================

    if (isBarnWallName(cleanName)) {
      const box =
        new THREE.Box3().setFromObject(
          object,
        )

      const size =
        box.getSize(
          new THREE.Vector3(),
        )

      const centre =
        box.getCenter(
          new THREE.Vector3(),
        )

      const minThickness = 0.22

      if (size.x < minThickness) {
        size.x = minThickness
      }

      if (size.y < minThickness) {
        size.y = minThickness
      }

      if (size.z < minThickness) {
        size.z = minThickness
      }

      const collisionMesh =
        new THREE.Mesh(
          new THREE.BoxGeometry(
            size.x,
            size.y,
            size.z,
          ),
        )

      collisionMesh.position.copy(
        centre,
      )

      collisionMesh.name =
        `COLLISION_SOLID_${object.name}`

      collisionRoot.add(
        collisionMesh,
      )

      names.push(
        `${object.name} [solid proxy]`,
      )

      return
    }

    // =====================================================
    // NORMAL HOUSE COLLISION
    // =====================================================

    const collisionMesh =
      new THREE.Mesh(
        object.geometry,
      )

    object.matrixWorld.decompose(
      collisionMesh.position,
      collisionMesh.quaternion,
      collisionMesh.scale,
    )

    collisionMesh.name =
      `COLLISION_${object.name}`

    collisionMesh.matrixAutoUpdate =
      true

    collisionRoot.add(
      collisionMesh,
    )

    names.push(
      object.name,
    )
  })

  collisionRoot.updateMatrixWorld(true)

  const world = new Octree()

  world.fromGraphNode(
    collisionRoot,
  )

  console.log(
    `House collision built from ${names.length} labelled meshes`,
    names,
  )

  return {
    world,
    names,
  }
}

// -----------------------------------------------------------------------------
// INTERACTIVE DOORS
// -----------------------------------------------------------------------------

function createInteractiveDoors(model) {
  const doors = []

  const source = findObjectCaseInsensitive(
    model,
    'Doors',
  )

  if (source?.isMesh) {
    doors.push(
      ...splitRegularDoorMesh(source),
    )
  } else {
    console.warn(
      'House: labelled "Doors" mesh was not found',
    )
  }

  const barnDoor =
    createBarnDoorController(model)

  if (barnDoor) {
    doors.push(barnDoor)
  }

  console.log(
    `Created ${doors.length} interactive doors`,
    doors.map((door) => ({
      name: door.name,
      type: door.type,
    })),
  )

  return doors
}

function createBarnDoorController(model) {
  const source = findObjectCaseInsensitive(
    model,
    'Barn door',
  )

  if (!source?.isMesh) {
    console.warn(
      'House: labelled "Barn door" mesh was not found',
    )
    return null
  }

  source.geometry.computeBoundingBox()

  const box = source.geometry.boundingBox
  const size = box.getSize(
    new THREE.Vector3(),
  )

  // The barn door is vertical in local X/Z and almost flat in local Y,
  // therefore X is the horizontal sliding axis.
  const slideAxis = 'x'
  const slideDistance =
    Math.max(size.x * 1.05, 0.5)

  source.userData.dynamicDoor = true
  source.castShadow = true
  source.receiveShadow = true

  const closedPosition =
    source.position.clone()

  return {
    type: 'slide',
    name: 'Barn_Door',
    object: source,
    mesh: source,
    slideAxis,
    slideDistance,
    slideSign: 1,
    closedPosition,
    targetPosition:
      closedPosition.clone(),
    isOpen: false,
    openProgress: 0,
  }
}

function prepareBarnVisuals(model) {
  const interiorWalls =
    findObjectCaseInsensitive(
      model,
      'Interior walls',
    )

  const floorReference =
    findObjectCaseInsensitive(
      model,
      'Flooring',
    ) ||
    findObjectCaseInsensitive(
      model,
      'House floors',
    )

  // The Blender-added barn wall objects have UVs but no assigned material.
  // Reuse the existing interior-wall material so they remain textured.
  model.traverse((object) => {
    if (!object?.isMesh) return

    const name =
      (object.name || '').trim().toLowerCase()

    if (isBarnWallName(name)) {
      if (interiorWalls?.isMesh) {
        object.material =
          cloneMaterialOrArray(
            interiorWalls.material,
          )
      }

      makeMaterialDoubleSided(object)
    }

    // The source roof is shared with the rest of the house. Rendering it
    // double-sided makes the barn roof visible from inside as well.
    if (name.includes('roof')) {
      makeMaterialDoubleSided(object)
    }
  })

  const barnFloor =
    findObjectCaseInsensitive(
      model,
      'Barn floor',
    )

  if (
    barnFloor?.isMesh &&
    floorReference?.isMesh
  ) {
    barnFloor.material =
      cloneMaterialOrArray(
        floorReference.material,
      )
  }
}

function cloneMaterialOrArray(material) {
  if (Array.isArray(material)) {
    return material.map((item) =>
      item?.clone ? item.clone() : item,
    )
  }

  return material?.clone
    ? material.clone()
    : material
}

function makeMaterialDoubleSided(object) {
  object.material =
    cloneMaterialOrArray(object.material)

  const materials =
    Array.isArray(object.material)
      ? object.material
      : [object.material]

  for (const material of materials) {
    if (!material) continue
    material.side = THREE.DoubleSide
    material.needsUpdate = true
  }
}

function isBarnWallName(name) {
  const clean =
    (name || '').trim().toLowerCase()

  return (
    clean === 'barn wall' ||
    clean.startsWith('barn wall.')
  )
}

function findObjectCaseInsensitive(root, wantedName) {
  const target = wantedName.trim().toLowerCase()
  let found = null

  root.traverse((object) => {
    if (
      !found &&
      (object.name || '').trim().toLowerCase() === target
    ) {
      found = object
    }
  })

  return found
}

function splitRegularDoorMesh(source) {
  const parent = source.parent

  if (!parent) {
    return []
  }

  const nonIndexed =
    source.geometry.index
      ? source.geometry.toNonIndexed()
      : source.geometry.clone()

  const triangleGroups =
    clusterDoorTriangles(nonIndexed)

  if (triangleGroups.length !== 7) {
    console.warn(
      'Expected 7 door panels; detected',
      triangleGroups.length,
    )
  }

  // ---------------------------------------------
  // SAVE ORIGINAL WORLD TRANSFORM
  // ---------------------------------------------
  //
  // We need this before removing the original
  // "Doors" mesh from the model.
  //
  // This allows us to identify a door from its
  // actual WORLD position, rather than assuming
  // Door_1, Door_2 etc always stay in the same
  // order after a Blender export.

  source.updateWorldMatrix(
    true,
    false,
  )

  const sourceWorldMatrix =
    source.matrixWorld.clone()

  // ---------------------------------------------
  // CREATE DYNAMIC DOOR ROOT
  // ---------------------------------------------

  const doorRoot =
    new THREE.Group()

  doorRoot.name =
    'Interactive_Doors_Root'

  doorRoot.position.copy(
    source.position,
  )

  doorRoot.quaternion.copy(
    source.quaternion,
  )

  doorRoot.scale.copy(
    source.scale,
  )

  doorRoot.userData.dynamicDoorRoot =
    true

  parent.add(doorRoot)

  parent.remove(source)

  // ---------------------------------------------
  // SPLIT ORIGINAL DOOR MESH
  // ---------------------------------------------

  const entries =
    triangleGroups
      .map((triangleIndices) => {

        const geometry =
          copyTriangles(
            nonIndexed,
            triangleIndices,
          )

        geometry.computeBoundingBox()

        const box =
          geometry.boundingBox.clone()

        const centre =
          box.getCenter(
            new THREE.Vector3(),
          )

        // Convert the centre of this particular
        // door panel into actual world coordinates.

        const worldCentre =
          centre
            .clone()
            .applyMatrix4(
              sourceWorldMatrix,
            )

        return {
          geometry,
          box,
          centre,
          worldCentre,
        }
      })

      // Keep existing ordering logic.
      .sort((a, b) =>
        a.centre.z - b.centre.z ||
        a.centre.x - b.centre.x ||
        a.centre.y - b.centre.y
      )

  // ---------------------------------------------
  // FIND THE TWO DOORS THAT NEED HINGES SWAPPED
  // ---------------------------------------------

  const requestedHingeSwapIndices =
    new Set()

  for (
    const target
    of DOOR_HINGE_SWAP_TARGETS
  ) {

    let closestIndex = -1

    let closestDistanceSq =
      Infinity

    entries.forEach(
      (entry, index) => {

        const dx =
          entry.worldCentre.x -
          target.x

        const dz =
          entry.worldCentre.z -
          target.z

        const distanceSq =
          dx * dx +
          dz * dz

        if (
          distanceSq <
          closestDistanceSq
        ) {

          closestDistanceSq =
            distanceSq

          closestIndex =
            index
        }
      },
    )

    if (
      closestIndex >= 0 &&
      closestDistanceSq <=
        DOOR_HINGE_SWAP_MAX_DISTANCE *
        DOOR_HINGE_SWAP_MAX_DISTANCE
    ) {

      requestedHingeSwapIndices
        .add(
          closestIndex,
        )

    } else {

      console.warn(
        'House: no door panel found near hinge-swap target',
        target,
      )
    }
  }

  // ---------------------------------------------
  // CREATE INDIVIDUAL DOORS
  // ---------------------------------------------

  const controllers = []

  entries.forEach(
    (entry, index) => {

      const {
        geometry,
        box,
        centre,
        worldCentre,
      } = entry

      const extentX =
        box.max.x -
        box.min.x

      const extentY =
        box.max.y -
        box.min.y

      // The source GLB uses local Z as vertical.
      // Therefore the horizontal width of the
      // door is either local X or local Y.

      const widthAxis =
        extentX >= extentY
          ? 'x'
          : 'y'

      const hinge =
        centre.clone()

      // -----------------------------------------
      // EXISTING HINGE CORRECTIONS
      // -----------------------------------------
      //
      // Your old code already reversed the hinge
      // on two particular generated doors.
      //
      // Keep that behaviour for every existing
      // door.
      //
      // For our TWO requested doors, flip that
      // result again, giving them the opposite
      // hinge side to what you currently have.

      const existingOppositeHingeSide =
        index === 2 ||
        index === 5

      const shouldSwapRequestedDoor =
        requestedHingeSwapIndices
          .has(index)

      // XOR:
      //
      // false + false = normal
      // true  + false = existing reverse
      // false + true  = requested reverse
      // true  + true  = reverse the existing reverse

      const oppositeHingeSide =
        existingOppositeHingeSide !==
        shouldSwapRequestedDoor

      hinge[widthAxis] =
        oppositeHingeSide
          ? box.max[widthAxis]
          : box.min[widthAxis]

      // Debug so you can check exactly which doors
      // were changed in the browser console.

      if (
        shouldSwapRequestedDoor
      ) {

        console.log(
          `Swapped hinge side for Door_${index + 1}`,
          {
            worldPosition: {
              x: worldCentre.x,
              y: worldCentre.y,
              z: worldCentre.z,
            },
          },
        )
      }

      // -----------------------------------------
      // MOVE GEOMETRY RELATIVE TO NEW HINGE
      // -----------------------------------------

      geometry.translate(
        -hinge.x,
        -hinge.y,
        -hinge.z,
      )

      geometry.computeBoundingBox()

      geometry.computeBoundingSphere()

      // -----------------------------------------
      // CREATE HINGE / PIVOT
      // -----------------------------------------

      const pivot =
        new THREE.Group()

      pivot.name =
        `Door_${index + 1}`

      pivot.position.copy(
        hinge,
      )

      pivot.userData.dynamicDoor =
        true

      // -----------------------------------------
      // CREATE DOOR MESH
      // -----------------------------------------

      const mesh =
        new THREE.Mesh(
          geometry,
          source.material,
        )

      mesh.name =
        `Door_${index + 1}_Mesh`

      mesh.castShadow =
        true

      mesh.receiveShadow =
        true

      mesh.userData.dynamicDoor =
        true

      pivot.add(mesh)

      doorRoot.add(pivot)

      // -----------------------------------------
      // DOOR CONTROLLER
      // -----------------------------------------

      controllers.push({
        type: 'swing',

        name:
          pivot.name,

        object:
          pivot,

        mesh,

        rotationAxis:
          LOCAL_VERTICAL_AXIS,

        openAngle:
          DOOR_OPEN_ANGLE,

        openSign:
          index % 2 === 0
            ? 1
            : -1,

        targetRotation: 0,

        isOpen: false,

        openProgress: 0,

        panelCentreLocal:
          centre
            .clone()
            .sub(hinge),
      })
    },
  )

  nonIndexed.dispose()

  return controllers
}

// The labelled Doors mesh contains seven panels. Each panel is represented by
// two-sided triangles. Cluster neighbouring triangles into one panel group.
function clusterDoorTriangles(geometry) {
  const position = geometry.getAttribute('position')
  const triangleCount = Math.floor(position.count / 3)

  const centres = []
  const longestEdges = []

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const a = readPosition(position, triangle * 3)
    const b = readPosition(position, triangle * 3 + 1)
    const c = readPosition(position, triangle * 3 + 2)

    centres.push(
      a.clone().add(b).add(c).multiplyScalar(1 / 3),
    )

    longestEdges.push(
      Math.max(
        a.distanceTo(b),
        b.distanceTo(c),
        c.distanceTo(a),
      ),
    )
  }

  const sortedEdges = [...longestEdges]
    .sort((a, b) => a - b)

  const medianEdge = sortedEdges.length > 0
    ? sortedEdges[Math.floor(sortedEdges.length / 2)]
    : 1

  const neighbourDistance =
    Math.max(0.001, medianEdge * 0.42)

  const neighbourDistanceSq =
    neighbourDistance * neighbourDistance

  const unvisited = new Set(
    Array.from(
      { length: triangleCount },
      (_, index) => index,
    ),
  )

  const groups = []

  while (unvisited.size > 0) {
    const first = unvisited.values().next().value
    const queue = [first]
    const group = []
    unvisited.delete(first)

    while (queue.length > 0) {
      const current = queue.pop()
      group.push(current)

      for (const candidate of [...unvisited]) {
        if (
          centres[current].distanceToSquared(
            centres[candidate],
          ) <= neighbourDistanceSq
        ) {
          unvisited.delete(candidate)
          queue.push(candidate)
        }
      }
    }

    groups.push(group)
  }

  return groups
}

function readPosition(attribute, index) {
  return new THREE.Vector3(
    attribute.getX(index),
    attribute.getY(index),
    attribute.getZ(index),
  )
}

function copyTriangles(sourceGeometry, triangleIndices) {
  const sourcePosition =
    sourceGeometry.getAttribute('position')

  const sourceNormal =
    sourceGeometry.getAttribute('normal')

  const sourceUv =
    sourceGeometry.getAttribute('uv')

  const sourceUv1 =
    sourceGeometry.getAttribute('uv1') ||
    sourceGeometry.getAttribute('uv2')

  const positions = []
  const normals = []
  const uvs = []
  const uv1s = []

  for (const triangle of triangleIndices) {
    for (let corner = 0; corner < 3; corner++) {
      const index = triangle * 3 + corner

      positions.push(
        sourcePosition.getX(index),
        sourcePosition.getY(index),
        sourcePosition.getZ(index),
      )

      if (sourceNormal) {
        normals.push(
          sourceNormal.getX(index),
          sourceNormal.getY(index),
          sourceNormal.getZ(index),
        )
      }

      if (sourceUv) {
        uvs.push(
          sourceUv.getX(index),
          sourceUv.getY(index),
        )
      }

      if (sourceUv1) {
        uv1s.push(
          sourceUv1.getX(index),
          sourceUv1.getY(index),
        )
      }
    }
  }

  const geometry = new THREE.BufferGeometry()

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      positions,
      3,
    ),
  )

  if (normals.length > 0) {
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(
        normals,
        3,
      ),
    )
  } else {
    geometry.computeVertexNormals()
  }

  if (uvs.length > 0) {
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        uvs,
        2,
      ),
    )
  }

  if (uv1s.length > 0) {
    geometry.setAttribute(
      'uv1',
      new THREE.Float32BufferAttribute(
        uv1s,
        2,
      ),
    )
  }

  return geometry
}


function createInvestigationItems(model) {
  const newspaper =
    findObjectCaseInsensitive(
      model,
      'Newspaper_front',
    )

  const frame =
    findObjectCaseInsensitive(
      model,
      'Frame1',
    )

  const phone =
    findObjectCaseInsensitive(
      model,
      'Phone',
    )

  const tableSetting =
    findObjectCaseInsensitive(
      model,
      'Table Set',
    )

  const items = []

  if (newspaper) {
    items.push({
      id: 'newspaper',
      object: newspaper,
      prompt: 'Press E to read the newspaper',
      title: 'Newspaper clipping',
      foundAt: 'Front porch',
      storyNote:
        'Evelyn Vale vanished from this house. Daniel said she ran away, but neighbours heard a girl crying.',
      riteNote:
        'Rite fact: the spirit must be called Evelyn Vale, not “the Vale girl.”',
      removeOnInspect: true,
    })
  } else {
    console.warn(
      'House investigation prop not found: Newspaper_front',
    )
  }

  if (frame) {
    items.push({
      id: 'vale-frame',
      object: frame,
      prompt: 'Press E to inspect the Vale family photograph',
      title: 'Vale family photograph',
      foundAt: 'Entrance room',
      storyNote:
        'Daniel, Margaret and Evelyn are pictured together. Evelyn is holding a small music box.',
      riteNote:
        'Rite fact: the music box belonged to Margaret Vale and is Evelyn’s likely anchor.',
    })
  } else {
    console.warn(
      'House investigation prop not found: Frame1',
    )
  }

  if (phone) {
    items.push({
      id: 'kitchen-phone',
      object: phone,
      prompt: 'The telephone is silent',
    })
  } else {
    console.warn(
      'House investigation prop not found: Phone',
    )
  }

  if (tableSetting) {
    items.push({
      id: 'fourth-place-setting',
      object: tableSetting,
      prompt: 'Press E to inspect the fourth place setting',
      title: 'Fourth place setting',
      foundAt: 'Dining room',
      storyNote:
        'The table is laid for four, although the Vale family had only three members.',
      riteNote:
        'Rite fact: another presence is in the house. Do not confuse it with Evelyn during the release.',
    })
  } else {
    console.warn(
      'House investigation prop not found: Table Set',
    )
  }

  return items
}
