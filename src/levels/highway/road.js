import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const HIGHWAY_MODEL_URL = '/models/highway.glb'
export const HIGHWAY_SURFACE_Y = 0.05 // Original driving surface elevation.
export const HIGHWAY_MODEL_SCALE = 1 // Asset: 20 long × 14 wide in game units.
// Dense fixed-step rows follow the smooth CatmullRom bends directly; no
// control-vertex inclusions are needed since the Track sampling itself is
// continuous.
export const ROAD_SAMPLE_STEP = 1.0
const START_RUNOFF_SEGMENTS = 1 // Ground behind the starting cars/chase camera.
const ROAD_ANISOTROPY = 8
const ROAD_ROUGHNESS = 0.94

// One deterministic, tileable aggregate map shared by the whole circuit.
// No painted highway lanes are carried over from the source quad's texture.
function asphaltTexture() {
  const size = 512
  const data = new Uint8Array(size * size * 4)
  let seed = 731
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * Math.PI * 2
      const v = y / size * Math.PI * 2
      const mottling = Math.sin(u * 3 + Math.sin(v * 2)) * 4 +
        Math.cos(v * 5 + Math.sin(u)) * 3
      const value = Math.round(60 + mottling + (random() - 0.5) * 25)
      const i = (y * size + x) * 4
      data[i] = value
      data[i + 1] = value + 1
      data[i + 2] = value + 2
      data[i + 3] = 255
    }
  }
  // Hairline fissures wrap at the tile boundary, avoiding hard texture seams.
  for (let crack = 0; crack < 7; crack++) {
    let x = random() * size
    let y = random() * size
    const angle = random() * Math.PI * 2
    for (let j = 0; j < 35 + crack * 9; j++) {
      x += Math.cos(angle) + (random() - 0.5) * 2
      y += Math.sin(angle) + (random() - 0.5) * 2
      const i = (((Math.floor(y) + size) % size) * size +
        (Math.floor(x) + size) % size) * 4
      data[i] = 30
      data[i + 1] = 31
      data[i + 2] = 32
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = ROAD_ANISOTROPY
  texture.needsUpdate = true
  return texture
}

// Shared visual extrusion for barriers and their caps. Sampling rather than
// yawing a long box keeps the inside edge clear of the curbs on tight bends.
export function createTrackBoxGeometry(track, s0, s1, d, height, width, thickness) {
  const geometry = new THREE.BoxGeometry(width, thickness, s1 - s0,
    1, 1, Math.ceil(s1 - s0))
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    // lateral/up/-tangent is right-handed; using +tangent would invert
    // the box winding and hide its outside faces with FrontSide materials.
    const s = (s0 + s1) / 2 - positions.getZ(i)
    const p = track.toWorld(s, d + positions.getX(i), height + positions.getY(i))
    positions.setXYZ(i, p.x, p.y, p.z)
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

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

// This asset is a textured quad, not a complete environment. Rows sampled
// from the smooth Track every ~1.5 m bend the copies onto the race curves.
// Adjacent tiles share exact cross-sections: no overlapping surfaces or
// procedural underlay.
export function createHighwayRoad(scene, {
  sampleAtDistance, arcLengths, roadWidth, track,
}) {
  void track
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

  const map = asphaltTexture()
  const bumpMap = map.clone()
  bumpMap.colorSpace = THREE.NoColorSpace
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: 0.018,
    side: source.material.side,
    roughness: ROAD_ROUGHNESS,
    metalness: 0,
  })
  for (const value of Object.values(source.material)) {
    if (value?.isTexture) value.dispose()
  }
  source.material.dispose()

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
    // Fixed-step rows: Track sampling is continuous, so no extra vertices
    // are needed at control points.
    const distances = new Set([start, end])
    for (let d = start + ROAD_SAMPLE_STEP; d < end; d += ROAD_SAMPLE_STEP) {
      distances.add(d)
    }
    const rows = [...distances].sort((a, b) => a - b)
    const vertices = [], uvs = [], indices = []
    for (let row = 0; row < rows.length; row++) {
      const d = rows[row]
      const sample = sampleAtDistance(Math.max(0, d))
      const position = sample.position.clone()
      if (d < 0) {
        // Start runoff: extend the launch straight backward along the
        // full 3D tangent so the extra tile matches road pitch, not just
        // plan position.
        position.x += sample.tangent.x * d
        position.y += sample.tangent.y * d
        position.z += sample.tangent.z * d
      }
      for (let side = 0; side < 2; side++) {
        const lateral = ((side === 0 ? box.max.z : box.min.z) - center.z) * HIGHWAY_MODEL_SCALE
        // Banked cross-section: centreline plus the banked lateral axis,
        // with the surface offset along the banked up. Normals recomputed
        // below follow the banking automatically.
        vertices.push(
          position.x +
            sample.lateral.x * lateral +
            sample.up.x * HIGHWAY_SURFACE_Y,
          position.y +
            sample.lateral.y * lateral +
            sample.up.y * HIGHWAY_SURFACE_Y,
          position.z +
            sample.lateral.z * lateral +
            sample.up.z * HIGHWAY_SURFACE_Y
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
