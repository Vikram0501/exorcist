import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const WALL_HEIGHT = 3
const WALL_THICKNESS = 0.2
const HOUSE_WIDTH = 20
const HOUSE_DEPTH = 14

const wallMat = new THREE.MeshStandardMaterial({
  color: 0xd4c4a8,
  roughness: 0.9,
  side: THREE.DoubleSide,
})

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x8b7355,
  roughness: 0.8,
})

const ceilMat = new THREE.MeshStandardMaterial({
  color: 0xf5f5dc,
  roughness: 0.9,
})

// [x1, z1, x2, z2] — doorways are gaps between segments
const GROUND_FLOOR = [
  // south exterior (front door x=2–x=4)
  [0, 0, 2, 0],
  [4, 0, 20, 0],
  // north exterior
  [0, 14, 20, 14],
  // west exterior
  [0, 0, 0, 14],
  // east exterior
  [20, 0, 20, 14],

  // interior: entry/kitchen divider
  [6, 0, 6, 7],
  // interior: stairs/kitchen divider
  [10, 0, 10, 7],
  // interior: living/kitchen divider (door gap z=6–z=8)
  [0, 7, 6, 7],
  [8, 7, 20, 7],
  // interior: kitchen/dining divider
  [10, 7, 10, 14],
]

const UPSTAIRS = [
  // south wall
  [0, 0, 20, 0],
  // north wall
  [0, 14, 20, 14],
  // west wall
  [0, 0, 0, 14],
  // east wall
  [20, 0, 20, 14],

  // hallway/bedroom divider (door gap z=6–z=8)
  [0, 7, 6, 7],
  [8, 7, 12, 7],
  // bedroom/bathroom divider
  [12, 7, 12, 14],
]

function makeWallGeo(x1, z1, x2, z2, h) {
  const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
  if (len < 0.001) return null

  const geo = new THREE.PlaneGeometry(len, h)
  const cx = (x1 + x2) / 2
  const cz = (z1 + z2) / 2
  const m = new THREE.Matrix4()

  if (Math.abs(z2 - z1) < 0.001) {
    m.makeTranslation(cx, h / 2, cz)
  } else {
    const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2)
    const trans = new THREE.Matrix4().makeTranslation(cx, h / 2, cz)
    m.multiplyMatrices(trans, rot)
  }

  geo.applyMatrix4(m)
  return geo
}

function addWalls(scene, walls, yOff, colliders) {
  const geos = []

  for (const [x1, z1, x2, z2] of walls) {
    const geo = makeWallGeo(x1, z1, x2, z2, WALL_HEIGHT)
    if (!geo) continue
    geos.push(geo)

    const xAligned = Math.abs(z2 - z1) < 0.001
    const t = WALL_THICKNESS / 2
    colliders.push({
      minX: Math.min(x1, x2) - (xAligned ? 0 : t),
      maxX: Math.max(x1, x2) + (xAligned ? 0 : t),
      minZ: Math.min(z1, z2) - (xAligned ? t : 0),
      maxZ: Math.max(z1, z2) + (xAligned ? t : 0),
      top: yOff + WALL_HEIGHT,
    })
  }

  if (!geos.length) return
  const merged = mergeGeometries(geos)
  const mesh = new THREE.Mesh(merged, wallMat)
  mesh.position.y = yOff
  mesh.receiveShadow = true
  scene.add(mesh)
}

function addPlane(scene, y, w, d, mat) {
  const geo = new THREE.PlaneGeometry(w, d)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = y
  mesh.receiveShadow = true
  scene.add(mesh)
}

export function loadHouse(scene) {
  const colliders = []

  addWalls(scene, GROUND_FLOOR, 0, colliders)
  addPlane(scene, 0, HOUSE_WIDTH, HOUSE_DEPTH, floorMat)
  addPlane(scene, WALL_HEIGHT, HOUSE_WIDTH, HOUSE_DEPTH, ceilMat)

  addWalls(scene, UPSTAIRS, WALL_HEIGHT, colliders)
  addPlane(scene, WALL_HEIGHT * 2, HOUSE_WIDTH, HOUSE_DEPTH, ceilMat)

  const ambient = new THREE.AmbientLight(0xffffff, 0.3)
  scene.add(ambient)

  const hallLight = new THREE.PointLight(0xffeedd, 0.8, 15)
  hallLight.position.set(3, WALL_HEIGHT - 0.5, 3)
  hallLight.castShadow = true
  scene.add(hallLight)

  const livingLight = new THREE.PointLight(0xffeedd, 0.6, 18)
  livingLight.position.set(5, WALL_HEIGHT - 0.5, 10)
  scene.add(livingLight)

  return colliders
}
