import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Octree } from 'three/addons/math/Octree.js'
import { setupHouseLighting } from './houseLighting.js'

const HOUSE_SCALE = 0.15
const EYE_HEIGHT = 1.7
const SPAWN_DISTANCE = 5
const DOOR_SPEED = 12

const DOOR_OPEN_ANGLES = {
  Door_Front: Math.PI / 2,
  Door_Back: Math.PI / 2,
}


// =====================================================
// UPDATE DOORS
// =====================================================

export function updateDoors(doors, dt) {

  for (const door of doors) {

    door.object.rotation.y =
      THREE.MathUtils.damp(
        door.object.rotation.y,
        door.targetRotation,
        DOOR_SPEED,
        dt
      )


    const totalAngle =
      Math.abs(
        door.openRotation -
        door.closedRotation
      )


    door.openProgress =
      totalAngle > 0
        ? THREE.MathUtils.clamp(
          Math.abs(
            door.object.rotation.y -
            door.closedRotation
          ) / totalAngle,
          0,
          1
        )
        : 0
  }
}


// =====================================================
// TOGGLE DOOR
// =====================================================

export function toggleDoor(door) {

  door.isOpen =
    !door.isOpen


  door.targetRotation =
    door.isOpen
      ? door.openRotation
      : door.closedRotation
}


// =====================================================
// DOOR COLLIDERS
// =====================================================

export function getDoorColliders(doors) {

  return doors.flatMap(
    (door) => {

      // Once mostly open,
      // stop blocking the player.

      if (
        door.openProgress > 0.82
      ) {

        return []
      }


      const box =
        new THREE.Box3()
          .setFromObject(
            door.object
          )


      return [
        {
          type: 'door',

          name: door.name,

          minX: box.min.x,
          maxX: box.max.x,

          minZ: box.min.z,
          maxZ: box.max.z,

          minY: box.min.y,
          maxY: box.max.y,
        },
      ]
    }
  )
}


// =====================================================
// CREATE DOOR CONTROLLER
// =====================================================

function makeDoorController(
  object
) {

  if (!object) {
    return null
  }


  const closedRotation =
    object.rotation.y


  const openRotation =
    closedRotation +
    (
      DOOR_OPEN_ANGLES[
      object.name
      ] ??
      Math.PI / 2
    )


  return {

    name:
      object.name,

    object,

    closedRotation,

    openRotation,

    targetRotation:
      closedRotation,

    isOpen:
      false,

    openProgress:
      0,
  }
}


// =====================================================
// LOAD HOUSE
// =====================================================

export function loadHouse(level) {

  const loader =
    new GLTFLoader()


  return Promise.all([

    loader.loadAsync(
      '/models/House.glb'
    ),

    loader.loadAsync(
      '/models/House_Collision.glb'
    ),

    loader.loadAsync(
      '/models/House_Doors.glb'
    ),

  ]).then(
    ([
      visualGLTF,
      collisionGLTF,
      doorsGLTF,
    ]) => {


      const model =
        visualGLTF.scene


      const collisionModel =
        collisionGLTF.scene


      const doorModel =
        doorsGLTF.scene



      // =====================================================
      // VISUAL HOUSE
      // =====================================================

      model.scale.setScalar(
        HOUSE_SCALE
      )


      model.traverse(
        (child) => {

          if (!child.isMesh) {
            return
          }


          child.castShadow =
            false


          child.receiveShadow =
            true
        }
      )


      model.updateMatrixWorld(
        true
      )



      // =====================================================
      // CENTRE HOUSE
      // =====================================================

      const initialBox =
        new THREE.Box3()
          .setFromObject(
            model
          )


      const initialCenter =
        initialBox.getCenter(
          new THREE.Vector3()
        )


      model.position.x -=
        initialCenter.x


      model.position.z -=
        initialCenter.z


      model.position.y -=
        initialBox.min.y


      model.updateMatrixWorld(
        true
      )



      // =====================================================
      // REMOVE ORIGINAL BAKED DOORS
      // =====================================================

      // Both exterior doors were originally
      // combined inside this mesh.

      const bakedDoors =
        model.getObjectByName(
          'Material2.007'
        )

      if (bakedDoors) {

        if (bakedDoors.parent) {

          bakedDoors.parent.remove(
            bakedDoors
          )

        }

        console.log(
          'Removed baked house doors'
        )

      }
      else {

        console.warn(
          'Could not find baked doors'
        )

      }



      // =====================================================
      // ADD INTERACTIVE DOORS
      // =====================================================

      // House_Doors.glb uses the same original
      // coordinate system as House.glb.
      //
      // Making it a child of the house automatically
      // gives it the same scale and position.

      model.add(
        doorModel
      )


      doorModel.traverse(
        (child) => {

          if (!child.isMesh) {
            return
          }


          child.castShadow =
            true


          child.receiveShadow =
            true
        }
      )


      model.updateMatrixWorld(
        true
      )



      // =====================================================
      // ADD HOUSE TO LEVEL
      // =====================================================

      level.add(
        model
      )



      // =====================================================
      // FINAL SIZE
      // =====================================================

      const box =
        new THREE.Box3()
          .setFromObject(
            model
          )


      const size =
        box.getSize(
          new THREE.Vector3()
        )



      // =====================================================
      // STATIC HOUSE COLLISION
      // =====================================================

      collisionModel.scale.setScalar(
        HOUSE_SCALE
      )


      collisionModel.position.copy(
        model.position
      )


      collisionModel.rotation.copy(
        model.rotation
      )


      collisionModel.updateMatrixWorld(
        true
      )


      const collisionWorld =
        new Octree()


      collisionWorld.fromGraphNode(
        collisionModel
      )



      // =====================================================
      // INTERACTIVE DOORS
      // =====================================================

      const doors = [

        makeDoorController(
          doorModel.getObjectByName(
            'Door_Front'
          )
        ),

        makeDoorController(
          doorModel.getObjectByName(
            'Door_Back'
          )
        ),

      ].filter(Boolean)



      console.log(
        'Interactive house doors:',
        doors.map(
          (door) =>
            door.name
        )
      )



      // =====================================================
      // LIGHTING
      // =====================================================

      const { lightHelpers } =
        setupHouseLighting(level, model, size)



      // =====================================================
      // SPAWN
      // =====================================================

      const spawn =
        new THREE.Vector3(
          0,
          4,
          11
        )



      console.log(
        'House loaded',
        {
          size,
          spawn,
        }
      )



      // =====================================================
      // DONE
      // =====================================================

      return {

        colliders: [
          {
            type: 'octree',
            world:
              collisionWorld,
          },
        ],

        colliderHelpers: [],

        lightHelpers,

        doors,

        ramps: [],

        model,

        spawn,

        modelSize:
          size,
      }

    }
  )
}