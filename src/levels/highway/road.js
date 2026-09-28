import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const HIGHWAY_MODEL_URL = '/models/highway.glb'
export const HIGHWAY_SURFACE_Y = 0.05 // Original driving surface elevation.
export const HIGHWAY_MODEL_SCALE = 1 // Asset: 20 long × 14 wide in game units.
const ROAD_SAMPLE_STEP = 2 // Subdivide the four-vertex asset to follow bends.
const START_RUNOFF_SEGMENTS = 1 // Ground behind the starting cars/chase camera.
const ROAD_ANISOTROPY = 8
const ROAD_ROUGHNESS = 0.92

export async function loadHighwayRoad(options) {
  const gltf = await new GLTFLoader().loadAsync(HIGHWAY_MODEL_URL)
  try {
    return createHighwayRoad(gltf.scene, options)
  } catch (error) {
    // A rejected level never hands these resources to the game's disposer.
    gltf.scene.traverse(object => {
      object.geometry?.dispose()
      const materials = Array.isArray(object.material)
        ? object.material : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose()
        }
        material.dispose()
      }
    })
    throw error
  }
}

// This asset is a textured quad, not a complete environment. Subdivide copies
// of its geometry/UVs and bend them onto the existing race path. Adjacent tiles
// share exact cross-sections: no overlapping surfaces or procedural underlay.
export function createHighwayRoad(scene, {
  sampleAtDistance, arcLengths, roadWidth,
}) {
  scene.updateMatrixWorld(true)
  const meshes = []
  scene.traverse(object => { if (object.isMesh) meshes.push(object) })
  if (meshes.length !== 1 || Array.isArray(meshes[0].material)) {
    throw new Error('Highway GLB must contain one textured road tile')
  }

  const source = meshes[0]
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const positions = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  if (positions.count !== 4 || !uv || !source.material.map ||
      size.y > 0.001 || size.x <= 0 ||
      Math.abs(size.z * HIGHWAY_MODEL_SCALE - roadWidth) > 0.001) {
    geometry.dispose()
    throw new Error('Highway GLB must be a flat 14-wide textured quad')
  }

  // Preserve the authored UV orientation, including Sketchfab's root rotation.
  // Imported X is longitudinal; imported Z is lateral. Mapping these onto
  // tangent/perpendicular is equivalent to yaw = pathAngle - PI/2 on straights.
  const corners = [box.max.z, box.min.z].map(z =>
    [box.min.x, box.max.x].map(x => {
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getX(i) - x) < 0.001 &&
            Math.abs(positions.getZ(i) - z) < 0.001) {
          return new THREE.Vector2(uv.getX(i), uv.getY(i))
        }
      }
      throw new Error('Highway GLB corners must form a rectangle')
    })
  )

  // Only adapt the explicitly unlit material: otherwise headlights and car
  // shadows would disappear from the asphalt. Retain its original color/map,
  // UVs, color space and sidedness. Already-lit assets retain their material.
  let material = source.material
  if (material.isMeshBasicMaterial) {
    material = new THREE.MeshStandardMaterial({
      map: source.material.map,
      color: source.material.color,
      side: source.material.side,
      roughness: ROAD_ROUGHNESS,
      metalness: 0,
    })
    source.material.dispose()
  }
  material.map.anisotropy = ROAD_ANISOTROPY

  const length = size.x * HIGHWAY_MODEL_SCALE
  const totalLength = arcLengths[arcLengths.length - 1]
  const count = Math.ceil(totalLength / length)
  const road = new THREE.Group()
  road.name = 'highwayRoadGLB'
  road.userData.segmentLength = length
  road.userData.surfaceY = HIGHWAY_SURFACE_Y

  for (let tile = -START_RUNOFF_SEGMENTS; tile < count; tile++) {
    const start = tile * length
    const end = Math.min(start + length, totalLength)
    // Include path vertices so no triangle shortcuts a polyline corner.
    const distances = new Set([start, end])
    for (let d = start + ROAD_SAMPLE_STEP; d < end; d += ROAD_SAMPLE_STEP) {
      distances.add(d)
    }
    for (const d of arcLengths) {
      if (d > start && d < end) distances.add(d)
    }
    const rows = [...distances].sort((a, b) => a - b)
    const vertices = [], uvs = [], indices = []
    for (let row = 0; row < rows.length; row++) {
      const d = rows[row]
      const sample = sampleAtDistance(Math.max(0, d))
      const position = sample.position.clone()
      if (d < 0) {
        position.x += sample.direction.x * d
        position.z += sample.direction.y * d
      }
      for (let side = 0; side < 2; side++) {
        const lateral = ((side === 0 ? box.max.z : box.min.z) - center.z) * HIGHWAY_MODEL_SCALE
        vertices.push(
          position.x - sample.direction.y * lateral,
          HIGHWAY_SURFACE_Y,
          position.z + sample.direction.x * lateral,
        )
        const texcoord = corners[side][0].clone().lerp(corners[side][1], (d - start) / length)
        uvs.push(texcoord.x, texcoord.y)
      }
      if (row > 0) {
        const base = (row - 1) * 2
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }
    const tileGeometry = geometry.clone()
    tileGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    tileGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    tileGeometry.deleteAttribute('normal')
    tileGeometry.setIndex(indices)
    tileGeometry.computeVertexNormals()
    tileGeometry.computeBoundingBox()
    tileGeometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(tileGeometry, material)
    mesh.name = `highwayTile${tile}`
    mesh.receiveShadow = true
    mesh.userData.startDistance = start
    mesh.userData.endDistance = end
    road.add(mesh)
  }

  geometry.dispose()
  source.geometry.dispose()
  // Each tile owns geometry; all share one material/texture. The existing
  // disposeLevel traversal deduplicates resources and disposes textures too.
  return road
}

// Preserve controller/collision origins (y=0.2), but seat the actual body on
// the surface. Existing box cars have their lowest visible point at local y=.3.
export function seatCarVisuals(car) {
  car.updateMatrixWorld(true)
  const bottom = new THREE.Box3().setFromObject(car).min.y
  const offset = HIGHWAY_SURFACE_Y - bottom
  for (const child of car.children) child.position.y += offset
}
