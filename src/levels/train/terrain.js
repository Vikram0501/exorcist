import * as THREE from 'three'


const SEGMENT_COUNT = 3
const SEGMENT_LENGTH = 40
const WRAP_BUFFER = 20


function createGroundLayer() {
  const group = new THREE.Group()
  group.name = 'terrain_ground'

  const segLen = SEGMENT_LENGTH + WRAP_BUFFER
  const width = 60

  const mat = new THREE.MeshBasicMaterial({
    color: 0x0a0704,
    side: THREE.DoubleSide,
  })

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const geo = new THREE.PlaneGeometry(width, segLen)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -0.1
    mesh.position.z = -i * segLen
    group.add(mesh)

    const debrisCount = 6 + Math.floor(Math.random() * 5)
    for (let d = 0; d < debrisCount; d++) {
      const size = 0.15 + Math.random() * 0.4
      const dGeo = new THREE.BoxGeometry(size, size * 0.6, size)
      const dMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.08, 0.3, 0.03 + Math.random() * 0.03),
      })
      const debris = new THREE.Mesh(dGeo, dMat)
      debris.position.set(
        (Math.random() - 0.5) * width * 0.8,
        size * 0.3,
        -i * segLen + (Math.random() - 0.5) * segLen
      )
      debris.rotation.y = Math.random() * Math.PI
      group.add(debris)
    }
  }

  return { group, segLen, speed: 22 }
}


function createHillsLayer() {
  const group = new THREE.Group()
  group.name = 'terrain_hills'

  const segLen = SEGMENT_LENGTH + WRAP_BUFFER
  const offset = 18

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const hillCount = 4 + Math.floor(Math.random() * 3)
    for (let h = 0; h < hillCount; h++) {
      const w = 3 + Math.random() * 5
      const h2 = 2 + Math.random() * 4
      const d = 2 + Math.random() * 4

      const shape = new THREE.Shape()
      shape.moveTo(-w / 2, 0)
      shape.lineTo(0, h2)
      shape.lineTo(w / 2, 0)
      shape.closePath()

      const extrudeSettings = {
        depth: d,
        bevelEnabled: false,
      }
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.62, 0.15, 0.02 + Math.random() * 0.02),
        side: THREE.DoubleSide,
      })
      const hill = new THREE.Mesh(geo, mat)
      const side = Math.random() > 0.5 ? 1 : -1
      hill.position.set(
        side * (offset + Math.random() * 8),
        0,
        -i * segLen + (Math.random() - 0.5) * segLen
      )
      hill.rotation.y = Math.random() * Math.PI
      group.add(hill)
    }
  }

  return { group, segLen, speed: 10 }
}


function createMountainsLayer() {
  const group = new THREE.Group()
  group.name = 'terrain_mountains'

  const segLen = SEGMENT_LENGTH + WRAP_BUFFER
  const offset = 45

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const mtnCount = 3 + Math.floor(Math.random() * 3)
    for (let m = 0; m < mtnCount; m++) {
      const w = 6 + Math.random() * 10
      const h = 8 + Math.random() * 14
      const d = 4 + Math.random() * 6

      const shape = new THREE.Shape()
      shape.moveTo(-w / 2, 0)
      shape.lineTo(-w * 0.1, h * 0.7)
      shape.lineTo(0, h)
      shape.lineTo(w * 0.15, h * 0.65)
      shape.lineTo(w / 2, 0)
      shape.closePath()

      const extrudeSettings = {
        depth: d,
        bevelEnabled: false,
      }
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.65, 0.1, 0.015 + Math.random() * 0.015),
        side: THREE.DoubleSide,
      })
      const mtn = new THREE.Mesh(geo, mat)
      const side = Math.random() > 0.5 ? 1 : -1
      mtn.position.set(
        side * (offset + Math.random() * 15),
        0,
        -i * segLen + (Math.random() - 0.5) * segLen
      )
      mtn.rotation.y = Math.random() * Math.PI
      group.add(mtn)
    }
  }

  return { group, segLen, speed: 3 }
}


export function createTrainTerrain(level) {
  const layers = [
    createGroundLayer(),
    createHillsLayer(),
    createMountainsLayer(),
  ]

  const terrainGroup = new THREE.Group()
  terrainGroup.name = 'train_terrain'

  for (const layer of layers) {
    terrainGroup.add(layer.group)
  }

  level.add(terrainGroup)

  function update(dt) {
    for (const layer of layers) {
      const { group, segLen, speed } = layer
      const totalLen = segLen * SEGMENT_COUNT

      for (const child of group.children) {
        child.position.z += speed * dt

        if (child.position.z > segLen) {
          child.position.z -= totalLen
        }
      }
    }
  }

  function dispose() {
    for (const layer of layers) {
      for (const child of layer.group.children) {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      }
    }
    level.remove(terrainGroup)
  }

  return { terrainGroup, update, dispose }
}
