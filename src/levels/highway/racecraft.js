import * as THREE from 'three'
import { mergeGeometries }
  from 'three/addons/utils/BufferGeometryUtils.js'
import { HIGHWAY_SURFACE_Y }
  from './road.js'

// ============================================
// LEVEL 3 RACECRAFT — ROAD-DRIVEN RACE DRESSING
// ============================================
//
// Procedural racing visual language that lives ON the road: worn edge
// lines, centre dashes, reflective studs, danger-corner barrier caps,
// curve-tracing lamps, start/finish paint, and small floodlight heads on
// the original finish arch. No gantries, no banners, no text boards, no
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
export const EDGE_LINE_INNER = 6.1
export const EDGE_LINE_OUTER = 6.55
export const RED_LINE_INNER = 6.62
export const RED_LINE_OUTER = 6.92
export const CENTRE_DASH_HALF = 0.18
export const MARKING_LIFT = 0.025

const WHITE_LINE = new THREE.Color(0xcfc9b8)
const RED_LINE = new THREE.Color(0x7a1c1c)
const SULFUR_DASH = new THREE.Color(0x9a8852)
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
  for (let s = s0; s <= s1 + 1e-6; s += step) {
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
  const geo = new THREE.PlaneGeometry(14, depth, 24, 1)
  const pos = geo.getAttribute('position')
  const frame = track.sampleAt(s)
  // Bake the banked frame into the vertices: local X across the road,
  // local Y along travel.
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i)
    const ly = pos.getY(i)
    const p = track.toWorld(s, lx, HIGHWAY_SURFACE_Y + MARKING_LIFT)
    // Advance along the tangent for the strip depth.
    p.addScaledVector(frame.tangent, -ly)
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
        track, 0, totalLength, 2,
        side * EDGE_LINE_INNER, side * EDGE_LINE_OUTER,
        lift, WHITE_LINE, geos
      )
      ribbonGeometries(
        track, 0, totalLength, 2,
        side * RED_LINE_INNER, side * RED_LINE_OUTER,
        lift, RED_LINE, geos
      )
    }
    // Centre dashes: 3 m paint every 9 m.
    for (let s = 6; s < totalLength - 3; s += 9) {
      const s1 = Math.min(s + 3, totalLength)
      let prev = null
      for (let d = s; d <= s1 + 1e-6; d += 1) {
        const sc = Math.min(d, s1)
        const a = track.toWorld(sc, -CENTRE_DASH_HALF, lift)
        const b = track.toWorld(sc, CENTRE_DASH_HALF, lift)
        const n = track.sampleAt(sc).up
        const row = { a, b, n }
        if (prev) pushStrip(geos, prev, row, SULFUR_DASH)
        prev = row
      }
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
      const side = (track.sampleBank(s) >= 0 ? 1 : -1) * 7.2
      const p = track.toWorld(s, side, 1.06)
      const frame = track.sampleAt(s)
      const geo = new THREE.BoxGeometry(0.5, 0.12, 10)
      geo.rotateZ(frame.bank)
      geo.rotateY(frame.angle)
      geo.translate(p.x, p.y, p.z)
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

  // ---- Floodlight heads on the original finish arch (lighting, no text) ----
  {
    const floodGeos = []
    const s = finishDistance
    const frame = track.sampleAt(s)
    for (const d of [-5, 5]) {
      const p = track.toWorld(s, d, 5.4)
      const fgeo = new THREE.BoxGeometry(0.5, 0.3, 0.3)
      fgeo.rotateY(frame.angle)
      fgeo.translate(p.x, p.y, p.z)
      floodGeos.push(fgeo)
    }
    const floodMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      emissive: 0xfff2d8,
      emissiveIntensity: 1.4,
      roughness: 0.5,
    })
    addTextured(floodGeos, floodMat, 'racecraftFloodlights')
  }

  // ---- Start/finish paint (checkered, no text) ----
  {
    const checkerTex = canvasTexture(128, 32, drawChecker)
    const startPaint = paintStrip(track, 4, 1.4, checkerTex)
    startPaint.name = 'racecraftStartPaint'
    group.add(startPaint)
    const finishPaint = paintStrip(track, finishDistance, 1.6, checkerTex)
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
