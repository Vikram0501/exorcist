import * as THREE from 'three'
import { mergeGeometries }
  from 'three/addons/utils/BufferGeometryUtils.js'
import { HIGHWAY_SURFACE_Y, createTrackBoxGeometry }
  from './road.js'

// ============================================
// LEVEL 3 RACECRAFT — ROAD-DRIVEN RACE DRESSING
// ============================================
//
// Procedural racing visual language that lives ON the road: worn edge
// lines, corner curbs, tire wear, reflective studs, danger-corner barrier caps,
// curve-tracing lamps and start/finish paint. No gantries, no banners, no text boards, no
// sponsor aesthetic: the racetrack feel comes from the road, curves,
// elevation, barriers, lighting and composition instead.
//
// Everything follows Track frames (curvature, elevation, banking), so
// nothing floats, clips, or lies flat in world space. The palette stays
// apocalyptic (bone, blood-red, sulfur, rust): worn, improvised, broken.
//
// Performance: a handful of merged meshes + shared materials (see
// handle.counts). Only emissiveIntensity on 3 shared materials animates
// per frame (updateRacecraft); zero per-object cost.

// Corner classification from smoothed bank angle (radians).
export const CORNER_MIN_BANK = (2.5 * Math.PI) / 180
export const MAJOR_CORNER_BANK = (5 * Math.PI) / 180
export const DANGER_CORNER_BANK = (4 * Math.PI) / 180

// Marking layout (lateral offsets from centre, road half-width is 7).
// Deliberately restrained: thin worn lines, never colourful stripes.
export const EDGE_LINE_INNER = 5.95
export const EDGE_LINE_OUTER = 6.08
export const MARKING_LIFT = 0.025

const WHITE_LINE = new THREE.Color(0xcfc9b8)
const RED_LINE = new THREE.Color(0x7a1c1c)
const DARK_STEEL = new THREE.Color(0x232228)

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function drawChecker(ctx, width, height) {
  const cols = 8
  const rows = 2
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const worn = Math.random() < 0.12
      ctx.fillStyle =
        (i + j) % 2 === 0
          ? worn ? '#5a5a58' : '#cfcfc8'
          : worn ? '#3a3434' : '#101010'
      ctx.fillRect(
        (i * width) / cols,
        (j * height) / rows,
        width / cols + 1,
        height / rows + 1
      )
    }
  }
}

// Continuous ribbon strip following the track at a fixed lateral band.
// y rides the banked cross-section plus lift along the banked up.
function ribbonGeometries(track, s0, s1, step, dInner, dOuter, lift, color, geos) {
  let prev = null
  for (let i = 0; i <= Math.ceil((s1 - s0) / step); i++) {
    const s = s0 + i * step
    const sc = Math.min(s, s1)
    const a = track.toWorld(sc, dInner, lift)
    const b = track.toWorld(sc, dOuter, lift)
    const n = track.sampleAt(sc).up
    const row = { a, b, n }
    if (prev) {
      pushStrip(geos, prev, row, color)
    }
    prev = row
  }
}

function pushStrip(geos, r0, r1, color) {
  const positions = new Float32Array([
    r0.a.x, r0.a.y, r0.a.z,
    r0.b.x, r0.b.y, r0.b.z,
    r1.a.x, r1.a.y, r1.a.z,
    r1.b.x, r1.b.y, r1.b.z,
  ])
  const normals = new Float32Array([
    r0.n.x, r0.n.y, r0.n.z,
    r0.n.x, r0.n.y, r0.n.z,
    r1.n.x, r1.n.y, r1.n.z,
    r1.n.x, r1.n.y, r1.n.z,
  ])
  const colors = new Float32Array([
    color.r, color.g, color.b,
    color.r, color.g, color.b,
    color.r, color.g, color.b,
    color.r, color.g, color.b,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex([0, 2, 1, 1, 2, 3])
  geos.push(geo)
}

// Flat quad strip lying across the road (start/finish paint, no text).
function paintStrip(track, s, depth, texture) {
  const group = new THREE.Group()
  const geo = new THREE.PlaneGeometry(11.8, depth, 24, 4)
  const pos = geo.getAttribute('position')
  // Bake the banked frame into the vertices: local X across the road,
  // local Y along travel.
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i)
    const ly = pos.getY(i)
    const p = track.toWorld(s - ly, lx, HIGHWAY_SURFACE_Y + MARKING_LIFT)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  group.add(mesh)
  return group
}

export function createRacecraft({ track, highway, finishDistance }) {
  const totalLength = track.totalLength
  const group = new THREE.Group()
  group.name = 'racecraft'
  highway.add(group)

  const counts = {
    markingVerts: 0,
    studs: 0,
    lamps: 0,
    caps: 0,
  }

  // ---- Corner zones from smoothed bank (robust to tuning) ----
  const cornerAt = (s) => Math.abs(track.sampleBank(s))
  const zones = []
  {
    let start = -1
    for (let s = 0; s <= totalLength; s += 5) {
      const inCorner = cornerAt(Math.min(s, totalLength)) > CORNER_MIN_BANK
      if (inCorner && start < 0) start = s
      if (!inCorner && start >= 0) {
        zones.push({ s0: start, s1: s })
        start = -1
      }
    }
    if (start >= 0) zones.push({ s0: start, s1: totalLength })
  }

  // ---- Road markings (merged, vertex-colored, banked) ----
  {
    const geos = []
    const lift = HIGHWAY_SURFACE_Y + MARKING_LIFT
    for (const side of [1, -1]) {
      ribbonGeometries(
        track, 0, totalLength, 1,
        side * EDGE_LINE_INNER, side * EDGE_LINE_OUTER,
        lift, WHITE_LINE, geos
      )
    }
    const merged = mergeGeometries(geos, false)
    for (const geo of geos) geo.dispose()
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // Winding varies per road side; double-sided keeps every strip
      // visible from the chase camera for one cheap material.
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(merged, mat)
    mesh.name = 'racecraftMarkings'
    mesh.receiveShadow = true
    group.add(mesh)
    counts.markingVerts = merged.getAttribute('position').count
  }

  // ---- Shared small-geometry helpers ----
  const darkGeos = []
  const boxAt = (list, x, y, z, w, h, dep, yaw) => {
    const geo = new THREE.BoxGeometry(w, h, dep)
    geo.rotateY(yaw)
    geo.translate(x, y, z)
    list.push(geo)
  }
  const bulbAt = (list, x, y, z, radius) => {
    const geo = new THREE.SphereGeometry(radius, 10, 8)
    geo.translate(x, y, z)
    list.push(geo)
  }

  const addTextured = (geos, mat, name) => {
    if (geos.length === 0) return null
    const merged = mergeGeometries(geos, false)
    for (const geo of geos) geo.dispose()
    const mesh = new THREE.Mesh(merged, mat)
    mesh.name = name
    group.add(mesh)
    return mesh
  }

  // Low-profile rumble curbs stay inside the existing barriers and outside
  // the driving envelope. Sample each metre like the asphalt, including the
  // last partial segment; never orient straight boxes across a bend.
  {
    const geos = []
    for (const zone of zones) {
      for (let s = zone.s0; s < zone.s1; s += 2) {
        const end = Math.min(s + 2, zone.s1)
        const color = (Math.floor((s - zone.s0) / 2) % 2 ? WHITE_LINE : RED_LINE).clone()
        color.multiplyScalar(0.78 + 0.16 * (0.5 + 0.5 * Math.sin(s * 1.73)))
        for (const side of [-1, 1]) {
          for (const [a, b, ha, hb] of [
            [6.2, 6.32, 0.025, 0.065],
            [6.32, 6.65, 0.065, 0.065],
            [6.65, 6.8, 0.065, 0.025],
          ]) {
            let prev = null
            for (let i = 0; i <= Math.ceil(end - s); i++) {
              const d = Math.min(s + i, end)
              const row = {
                a: track.toWorld(d, side * a, HIGHWAY_SURFACE_Y + ha),
                b: track.toWorld(d, side * b, HIGHWAY_SURFACE_Y + hb),
                n: track.sampleAt(d).up,
              }
              if (prev) pushStrip(geos, prev, row, color)
              prev = row
            }
          }
        }
      }
    }
    const mesh = addTextured(geos, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }), 'racecraftCornerCurbs')
    if (mesh) mesh.receiveShadow = true
  }

  // Faded paired tire arcs at selected corner entries. These are visual-only
  // ribbons, not physics objects; all vertices inherit the banked road frame.
  {
    const geos = []
    const rubber = new THREE.Color(0x111214)
    for (const zone of zones) {
      const start = Math.max(8, zone.s0 - 12)
      const end = Math.min(zone.s1, start + 55)
      const direction = Math.sign(track.sampleBank(zone.s0 + 5)) || 1
      for (const tire of [-0.8, 0.8]) {
        let prev = null
        for (let i = 0; i <= Math.ceil(end - start); i++) {
          const s = Math.min(start + i, end)
          const t = (s - start) / (end - start)
          const center = direction * (Math.sin(t * Math.PI) * 2 - 0.7) + tire
          const width = 0.10 * Math.sin(t * Math.PI)
          const row = {
            a: track.toWorld(s, center - width, HIGHWAY_SURFACE_Y + MARKING_LIFT),
            b: track.toWorld(s, center + width, HIGHWAY_SURFACE_Y + MARKING_LIFT),
            n: track.sampleAt(s).up,
          }
          if (prev) pushStrip(geos, prev, row, rubber)
          prev = row
        }
      }
    }
    addTextured(geos, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, transparent: true, opacity: 0.28,
      depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }), 'racecraftSkidMarks')
  }

  // ---- Reflective edge studs (both sides, alternating colors) ----
  let studRedMat
  let studAmberMat
  {
    const reds = []
    const ambers = []
    let i = 0
    for (let s = 10; s < totalLength - 5; s += 20) {
      for (const side of [6.9, -6.9]) {
        const p = track.toWorld(s, side, HIGHWAY_SURFACE_Y + 0.09)
        boxAt(i % 2 === 0 ? reds : ambers, p.x, p.y, p.z, 0.18, 0.18, 0.18, 0)
        i++
        counts.studs++
      }
    }
    studRedMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      emissive: 0xff2a1a,
      emissiveIntensity: 0.9,
      roughness: 0.6,
    })
    studAmberMat = new THREE.MeshStandardMaterial({
      color: 0x4a3208,
      emissive: 0xffa020,
      emissiveIntensity: 0.9,
      roughness: 0.6,
    })
    addTextured(reds, studRedMat, 'racecraftStudsRed')
    addTextured(ambers, studAmberMat, 'racecraftStudsAmber')
  }

  // ---- Danger-corner barrier caps + curve lamps ----
  let capMatRef
  let bulbMatRef
  {
    const capGeos = []
    for (let s = 10; s < totalLength - 5; s += 10) {
      if (Math.abs(track.sampleBank(s)) < DANGER_CORNER_BANK) continue
      const side = (track.sampleBank(s) >= 0 ? 1 : -1) * 7.4
      const geo = createTrackBoxGeometry(track, s - 5, s + 5, side, 1.06, 0.38, 0.12)
      capGeos.push(geo)
      counts.caps++
    }
    capMatRef = new THREE.MeshStandardMaterial({
      color: 0x3a0808,
      emissive: 0xff1a1a,
      emissiveIntensity: 0.7,
      roughness: 0.7,
    })
    addTextured(capGeos, capMatRef, 'racecraftBarrierCaps')

    // Improvised lamps tracing corner outsides.
    const bulbGeos = []
    for (const zone of zones) {
      for (let s = zone.s0; s < zone.s1; s += 30) {
        const bank = track.sampleBank(s)
        const side = (bank >= 0 ? 1 : -1) * 9.8
        const base = track.toWorld(s, side, 0)
        boxAt(darkGeos, base.x, base.y + 2.1, base.z, 0.16, 4.2, 0.16,
          track.sampleAt(s).angle)
        const top = track.toWorld(s, side, 4.35)
        bulbAt(bulbGeos, top.x, top.y, top.z, 0.24)
        counts.lamps++
      }
    }
    bulbMatRef = new THREE.MeshStandardMaterial({
      color: 0x4a3208,
      emissive: 0xffb545,
      emissiveIntensity: 1.1,
      roughness: 0.5,
    })
    addTextured(bulbGeos, bulbMatRef, 'racecraftLampBulbs')
  }

  // ---- Dark steel: lamp poles (world-upright, banked bases) ----
  {
    const darkMat = new THREE.MeshStandardMaterial({
      color: DARK_STEEL,
      roughness: 0.95,
      metalness: 0.25,
    })
    if (darkGeos.length > 0) {
      const merged = mergeGeometries(darkGeos, false)
      for (const geo of darkGeos) geo.dispose()
      const mesh = new THREE.Mesh(merged, darkMat)
      mesh.name = 'racecraftDarkSteel'
      mesh.castShadow = false
      group.add(mesh)
    }
  }

  // ---- Start/finish paint (checkered, no text) ----
  {
    const checkerTex = canvasTexture(128, 32, drawChecker)
    const startPaint = paintStrip(track, 3, 2, checkerTex)
    startPaint.name = 'racecraftStartPaint'
    group.add(startPaint)
    const finishPaint = paintStrip(track, finishDistance, 2, checkerTex)
    finishPaint.name = 'racecraftFinishPaint'
    group.add(finishPaint)
  }

  // Flicker channels (shared materials only — zero per-object cost).
  const flicker = [
    { mat: bulbMatRef, base: 1.1, amp: 0.22, speed: 5.1, phase: 2.4 },
    { mat: capMatRef, base: 0.7, amp: 0.18, speed: 1.6, phase: 1.1 },
    { mat: studRedMat, base: 0.9, amp: 0.12, speed: 2.8, phase: 3.0 },
    { mat: studAmberMat, base: 0.9, amp: 0.12, speed: 2.8, phase: 0.4 },
  ]

  return {
    group,
    flicker,
    counts,
    zones: zones.map((z) => ({ ...z })),
  }
}

export function updateRacecraft(handle, time) {
  if (!handle || !handle.flicker) return
  for (const channel of handle.flicker) {
    channel.mat.emissiveIntensity =
      channel.base +
      Math.sin(time * channel.speed + channel.phase) * channel.amp
  }
}
