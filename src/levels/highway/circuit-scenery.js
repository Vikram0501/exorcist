import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createTrackBoxGeometry } from './road.js'

// A few authored landmarks, in arc metres on the Phase 2 circuit. Padding
// reserves room for whole city-block footprints, not only their origins.
export const CIRCUIT_SITES = [
  { name: 'abandonedPits', kind: 'pits', s0: 55, s1: 115, side: -1 },
  { name: 'leftCornerStand', kind: 'stand', s0: 602, s1: 650, side: 1 },
  { name: 'driftCornerStand', kind: 'stand', s0: 1010, s1: 1060, side: -1 },
]

export function circuitSiteAt(s, side, padding = 40) {
  return CIRCUIT_SITES.find(site => site.side === side &&
    s >= site.s0 - padding && s <= site.s1 + padding)
}

function hash(n) {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function concreteMaterial() {
  // Shared procedural pitting, rain streaks and fine cracks. No image loads.
  const size = 128
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stain = Math.max(0, Math.sin(x * 0.23 + Math.sin(y * 0.04))) * 22
      const crack = Math.abs(x - (54 + Math.sin(y * 0.11) * 5)) < 0.8 ? 35 : 0
      const v = 133 + hash(x + y * size) * 30 - stain - crack
      const i = (y * size + x) * 4
      pixels.set([v, v - 5, v - 12, 255], i)
    }
  }
  const map = new THREE.DataTexture(pixels, size, size)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
  return new THREE.MeshStandardMaterial({ map, roughness: 0.98, vertexColors: true })
}

function tint(geometry, color) {
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function mergedMesh(geometries, material, name) {
  const geometry = mergeGeometries(geometries, false)
  for (const part of geometries) part.dispose()
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.receiveShadow = true
  return mesh
}

export function createCircuitBarriers(track) {
  const material = concreteMaterial()
  const meshes = []
  // 40 m cullable batches, with 4 m concrete modules and recessed joints.
  // The sloping foot sits at |d|=7, leaving the original driving limits intact.
  for (let start = 0; start < track.totalLength; start += 40) {
    const end = Math.min(start + 40, track.totalLength)
    for (const side of [-1, 1]) {
      const parts = []
      for (let s = start; s < end; s += 4) {
        const stop = Math.min(s + 4, end)
        const geometry = new THREE.BoxGeometry(0.8, 1, stop - s, 1, 4, Math.ceil(stop - s))
        const p = geometry.getAttribute('position')
        const colors = []
        for (let i = 0; i < p.count; i++) {
          const height = p.getY(i) + 0.5
          const distance = (s + stop) / 2 - p.getZ(i)
          const halfWidth = height < 0.25
            ? THREE.MathUtils.lerp(0.4, 0.28, height / 0.25)
            : THREE.MathUtils.lerp(0.28, 0.19, (height - 0.25) / 0.75)
          // Narrow the face at each module end: dark seams without gaps
          // or overlapping coplanar surfaces. A few top edges are chipped.
          const edge = Math.abs(distance - s) < 0.01 || Math.abs(distance - stop) < 0.01
          const chip = height === 1 && hash(distance * 3 + Math.sign(p.getX(i)) * 7) > 0.78 ? 0.055 : 0
          const d = side * 7.4 + Math.sign(p.getX(i)) * (halfWidth - (edge ? 0.012 : 0))
          const world = track.toWorld(distance, d, height - chip)
          p.setXYZ(i, world.x, world.y, world.z)
          const shade = (edge ? 0.52 : 0.82) + hash(s + side * 13) * 0.15
          colors.push(shade, shade, shade)
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
        geometry.computeVertexNormals()
        parts.push(geometry)
      }
      const mesh = mergedMesh(parts, material, 'circuitBarrier')
      mesh.userData = { startDistance: start, endDistance: end, side }
      meshes.push(mesh)
    }
  }
  return meshes
}

export function createCircuitScenery(track) {
  const root = new THREE.Group()
  root.name = 'abandonedCircuitScenery'
  const materials = {
    concrete: concreteMaterial(),
    steel: new THREE.MeshStandardMaterial({ color: 0x49332a, roughness: 0.94, metalness: 0.3 }),
    bench: new THREE.MeshStandardMaterial({ color: 0x51433b, roughness: 1 }),
    shutter: new THREE.MeshStandardMaterial({ color: 0x54534a, roughness: 0.95, metalness: 0.15 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x252322, roughness: 1 }),
  }
  const tireGeometry = new THREE.TorusGeometry(0.43, 0.17, 6, 16)
  tireGeometry.rotateX(Math.PI / 2)
  tireGeometry.scale(1, 0.82, 1)

  function tires(name, stations, side, lateral) {
    const mesh = new THREE.InstancedMesh(tireGeometry, materials.rubber, stations.length * 3)
    mesh.name = name
    const dummy = new THREE.Object3D()
    const matrix = new THREE.Matrix4()
    let index = 0
    for (const s of stations) {
      const frame = track.sampleAt(s)
      matrix.makeBasis(frame.lateral, frame.up, frame.tangent.clone().negate())
      for (let row = 0; row < 3; row++) {
        const d = side * (lateral + (hash(s + row) - 0.5) * 0.1)
        dummy.position.copy(track.toWorld(s, d, 0.16 + row * 0.29))
        dummy.quaternion.setFromRotationMatrix(matrix)
        dummy.rotateY(hash(s * 2 + row) * Math.PI)
        dummy.scale.setScalar(0.96 + hash(s + row * 7) * 0.07)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
        mesh.setColorAt(index++, new THREE.Color().setScalar(0.65 + hash(s * 5 + row) * 0.35))
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.receiveShadow = true
    root.add(mesh)
  }

  // Outside of the tighter left and returning right. Keep a clear service
  // strip around streetlights at |d|=9; tires sit beyond it, behind the wall.
  tires('leftCornerTires', Array.from({ length: 25 }, (_, i) => 596 + i * 1.35), 1, 10.7)
  tires('driftCornerTires', Array.from({ length: 33 }, (_, i) => 1004 + i * 1.35), -1, 10.7)
  tires('pitStoredTires', [63, 65, 109, 111], -1, 12)

  for (const site of CIRCUIT_SITES) {
    const group = new THREE.Group()
    group.name = site.name
    group.userData.site = { ...site }
    const batches = new Map()
    function box(key, s, d, h, width, height, length) {
      const geo = createTrackBoxGeometry(track, s - length / 2, s + length / 2,
        site.side * d, h, width, height)
      if (key === 'concrete') tint(geo, new THREE.Color(0.78, 0.75, 0.69))
      if (!batches.has(key)) batches.set(key, [])
      batches.get(key).push(geo)
    }
    if (site.kind === 'stand') {
      const center = (site.s0 + site.s1) / 2
      // Grounded stepped terraces, rusty supports and incomplete bench rows.
      box('concrete', center, 17, -0.22, 10, 0.6, 27)
      for (let tier = 0; tier < 4; tier++) {
        const d = 13.2 + tier * 1.65
        const top = 0.45 + tier * 0.68
        box('concrete', center, d, top / 2, 1.6, top, 25)
        for (let bay = 0; bay < 7; bay++) {
          const s = center - 10.5 + bay * 3.5
          // Missing and shortened benches make decay visible in silhouette.
          if ((bay + tier * 3) % 6 === 0) continue
          box('bench', s, d + 0.25, top + 0.48, 0.48, 0.14, bay % 3 === 0 ? 2.1 : 3.1)
          for (const ds of [-1.1, 1.1]) {
            box('steel', s + ds, d + 0.25, top + 0.24, 0.09, 0.48, 0.09)
          }
        }
      }
      for (let bay = 0; bay < 8; bay++) {
        const s = center - 12.2 + bay * 3.5
        box('steel', s, 19.2, 1.85, 0.12, 3.8, 0.12)
        if (bay !== 2 && bay < 7) box('steel', s + 1.7, 19.2, 3.65, 0.1, 0.1, 3.4)
      }
    } else {
      // Four open-front service bays, one roof partially stripped away and
      // a mixture of open, half-closed and rusted corrugated shutters.
      for (let bay = 0; bay < 4; bay++) {
        const s = 72 + bay * 9
        box('concrete', s, 17.5, -0.02, 10, 0.35, 8.8)
        box('concrete', s, 22, 2, 0.35, 4, 8.8)
        for (const ds of [-4.35, 4.35]) {
          box('concrete', s + ds, 17.5, 2, 9, 4, 0.22)
        }
        box('steel', s, 13.1, 3.85, 0.2, 0.3, 8.8)
        for (let panel = 0; panel < 5; panel++) {
          if (bay === 2 && panel > 2) continue
          box('shutter', s, 14 + panel * 1.7, 4.06, 1.65, 0.12, 8.65)
        }
        const shutterHeight = [0.6, 2.8, 0, 1.5][bay]
        for (let h = 0; h < shutterHeight; h += 0.2) {
          box('shutter', s, 13.18 + (Math.floor(h * 5) % 2) * 0.035,
            3.65 - h, 0.08, 0.18, 8.2)
        }
      }
      // A few fallen panels on the apron, clear of the road and lamp strip.
      box('steel', 109, 15, 0.12, 1.2, 0.12, 3)
      box('shutter', 66, 18, 0.17, 2.6, 0.18, 1.6)
    }
    // Abandoned equipment, broken perimeter fencing and rubble on the
    // aprons. Everything stays well outside the road (|d| >= 10.5),
    // behind the tire walls and lamp strip. Small props reuse the same
    // material batches, so no new draw calls are added.
    function prop(key, geo, s, d, h, yaw = 0, tilt = 0) {
      const frame = track.sampleAt(s)
      const quaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(tilt, frame.angle + yaw, tilt * 0.6)
      )
      geo.applyMatrix4(new THREE.Matrix4().compose(
        track.toWorld(s, site.side * d, h), quaternion, new THREE.Vector3(1, 1, 1)
      ))
      if (!batches.has(key)) batches.set(key, [])
      batches.get(key).push(geo)
    }
    {
      const center = (site.s0 + site.s1) / 2
      const fenceD = site.kind === 'stand' ? 23.5 : 24
      const fenceS0 = site.kind === 'stand' ? center - 14 : 52
      const fenceS1 = site.kind === 'stand' ? center + 14 : 118
      let prevPost = null
      for (let s = fenceS0; s <= fenceS1; s += 4) {
        if (hash(s * 1.7 + fenceD) < 0.18) { prevPost = null; continue } // torn-out post
        const lean = (hash(s * 2.3) - 0.5) * 0.3
        prop('steel', new THREE.BoxGeometry(0.12, 1.1, 0.12), s, fenceD, 0.4, 0, lean)
        if (prevPost !== null && hash(s * 3.1) > 0.3) {
          for (const railH of [0.55, 0.9]) {
            if (hash(s * 4.7 + railH) < 0.25) continue // missing rail
            const mid = (prevPost + s) / 2
            const rail = new THREE.BoxGeometry(0.06, 0.08, s - prevPost - 0.1)
            prop('steel', rail, mid, fenceD, railH, 0, lean * 0.5)
          }
        }
        prevPost = s
      }
      const drumSpots = site.kind === 'pits'
        ? [[70, 11.5, 0, 0], [71.2, 11.8, 0, 1], [120, 20, 0, 0], [100, 24.5, 0, 2]]
        : [[center - 8, 21.5, 0, 0], [center + 9, 21.8, 0, 1]]
      for (const [s, d, h, tipped] of drumSpots) {
        const drum = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10)
        if (tipped === 2) {
          drum.rotateZ(Math.PI / 2)
          prop('steel', drum, s, d, 0.32, hash(s) * 3, 0)
        } else {
          prop('steel', drum, s, d, 0.45 + h, hash(s * 1.3) * 3, tipped === 1 ? 0.12 : 0)
        }
      }
      const crateSpots = site.kind === 'pits'
        ? [[80, 13.5, 0.45], [80.7, 13.6, 1.05], [95, 19, 0.45], [108, 13.2, 0.45]]
        : [[center - 5, 21.2, 0.45], [center + 4, 21.4, 0.45], [center + 4.6, 21.4, 1.0]]
      for (const [s, d, h] of crateSpots) {
        prop('bench', new THREE.BoxGeometry(0.65, 0.65, 0.65), s, d, h, hash(s * 2.9) * 3, (hash(s * 3.7) - 0.5) * 0.2)
      }
      if (site.kind === 'stand') {
        // Fallen scaffold pole in front of the terraces.
        prop('steel', new THREE.BoxGeometry(0.14, 0.14, 7), center + 3, 11.8, 0.2, 0.35, 0.03)
      }
      for (let i = 0; i < (site.kind === 'pits' ? 14 : 10); i++) {
        const s = site.kind === 'pits'
          ? 56 + hash(i * 7.7 + center) * 60
          : center - 13 + hash(i * 7.7 + center) * 26
        const d = 11 + hash(i * 9.1) * 11
        // The concrete batch is vertex-colored: rubble must be tinted too
        // or the merge fails on inconsistent attributes. Boxes (indexed)
        // merge with the track-box walls; tetrahedra would not.
        const chunk = new THREE.BoxGeometry(0.34, 0.22, 0.3)
        chunk.scale(0.6 + hash(i * 5.3), 0.6 + hash(i * 6.1) * 0.8, 0.6 + hash(i * 7.9))
        prop('concrete', tint(chunk, new THREE.Color(0.62, 0.59, 0.55)),
          s, d, 0.08, hash(i * 3.3) * 3, (hash(i * 4.1) - 0.5) * 0.6)
      }
    }
    for (const [key, geometries] of batches) {
      group.add(mergedMesh(geometries, materials[key], `${site.name}_${key}`))
    }
    root.add(group)
  }
  return root
}
