import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDefaultTrack } from '../../src/levels/highway/track.js'
import { HIGHWAY_SURFACE_Y } from '../../src/levels/highway/road.js'
import {
  createRacecraft,
  updateRacecraft,
  MARKING_LIFT,
} from '../../src/levels/highway/racecraft.js'

function withStubs(fn) {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  // Headless canvas: absorb 2D calls; pixels are irrelevant to
  // placement/orientation assertions.
  const ctxStub = new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    }
  )
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: (tag) => ({
      style: {},
      remove() {},
      width: 0,
      height: 0,
      getContext: () => (tag === 'canvas' ? ctxStub : null),
    }),
    body: { appendChild() {} },
  }
  // Deterministic canvas weathering (checker wear uses Math.random).
  const originalRandom = Math.random
  Math.random = () => 0.5
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    Math.random = originalRandom
  }
}

function makeRacecraft() {
  const track = createDefaultTrack()
  const highway = new THREE.Group()
  const handle = createRacecraft({
    track,
    highway,
    finishDistance: track.getFinishDistance(),
  })
  return { track, highway, handle }
}

test('curbs and tire wear follow banked corners without entering barriers', () => withStubs(() => {
  const { track, handle } = makeRacecraft()
  for (const name of ['racecraftCornerCurbs', 'racecraftSkidMarks']) {
    const mesh = handle.group.getObjectByName(name)
    assert.ok(mesh, `${name} exists`)
    const p = mesh.geometry.getAttribute('position')
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i += 17) {
      v.fromBufferAttribute(p, i)
      const solved = track.toTrack(v)
      const frame = track.sampleAt(solved.s)
      const lift = v.clone().sub(track.toWorld(solved.s, solved.d, HIGHWAY_SURFACE_Y)).dot(frame.up)
      assert.ok(lift > 0.015 && lift < 0.08, `${name} sits just above asphalt: ${lift}`)
      if (name === 'racecraftCornerCurbs') {
        assert.ok(Math.abs(solved.d) > 6.15 && Math.abs(solved.d) < 6.85,
          'curbs clear the driving envelope, studs and barrier')
      } else {
        assert.ok(Math.abs(solved.d) < 3, 'tire wear stays on the racing surface')
      }
    }
  }
  assert.equal(handle.group.getObjectByName('racecraftFloodlights'), undefined)
}))

// Markings ride the banked track with a fixed anti-z-fight lift.
test('markings follow the track with lift', () => withStubs(() => {
  const { track, handle } = makeRacecraft()
  const mesh = handle.group.getObjectByName('racecraftMarkings')
  assert.ok(mesh, 'markings mesh built')
  assert.equal(mesh.material.polygonOffset, true, 'polygon offset on')
  const p = mesh.geometry.getAttribute('position')
  assert.ok(p.count > 5000, `real coverage (${p.count} verts)`)
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i += 37) {
    v.fromBufferAttribute(p, i)
    const solved = track.toTrack(v)
    const surface = track.toWorld(solved.s, solved.d, HIGHWAY_SURFACE_Y).y
    const lift = v.y - surface
    assert.ok(
      lift > 0.015 && lift < 0.05,
      `lift above asphalt prevents z-fighting, got ${lift.toFixed(4)}`
    )
  }
}))

// No decorative race signage remains: no gantries, banners, boards.
test('no decorative race signage exists', () => withStubs(() => {
  const { handle } = makeRacecraft()
  const names = []
  handle.group.traverse((object) => {
    if (object.name) names.push(object.name)
  })
  for (const name of names) {
    assert.ok(
      !/banner|gantry|chevron|warning|startred|startgreen|boardback/i.test(name),
      `no signage object: ${name}`
    )
  }
  assert.ok(
    !('gantries' in handle.counts),
    'no gantry counter'
  )
  assert.ok(
    !('boardSpots' in handle),
    'no board placement telemetry'
  )
}))

// Structures ride elevation (no floating or burial).
test('structures follow elevation', () => withStubs(() => {
  const { track, handle } = makeRacecraft()
  // Caps now curve with the barrier, including their tops and bottoms.
  const caps = handle.group.getObjectByName('racecraftBarrierCaps')
  assert.ok(caps, 'danger-corner caps built')
  const p = caps.geometry.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i += 31) {
    v.fromBufferAttribute(p, i)
    const solved = track.toTrack(v)
    const frame = track.sampleAt(solved.s)
    const offset = v.clone().sub(frame.position)
    const d = offset.dot(frame.lateral)
    assert.ok(Math.abs(d) > 7.19 && Math.abs(d) < 7.61)
    const h = offset.dot(frame.up)
    assert.ok(Math.min(Math.abs(h - 1), Math.abs(h - 1.12)) < 0.02,
      'cap conforms to the curved banked barrier')
  }
  // Start/finish paint lies on the asphalt (vertices are baked in
  // world space, so the centroid — not the origin — is the reference).
  for (const name of ['racecraftStartPaint', 'racecraftFinishPaint']) {
    const paint = handle.group.getObjectByName(name)
    assert.ok(paint, `${name} present`)
    paint.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(paint)
    const centroid = box.getCenter(new THREE.Vector3())
    const solved = track.toTrack(centroid)
    const surface = track.toWorld(solved.s, solved.d, HIGHWAY_SURFACE_Y).y
    // The 14 m-wide strip tilts with banking, so corners spread around
    // the centreline surface (up to ~0.4 on banked ground); bounds prove
    // contact, not floating.
    assert.ok(
      Math.abs(box.min.y - surface) < 0.45 &&
        Math.abs(box.max.y - surface) < 0.55,
      `${name} lies on the road`
    )
  }
}))

// Props stay off the drivable surface (except paint by design).
test('no prop clutters the driving line', () => withStubs(() => {
  const { track, handle } = makeRacecraft()
  // Studs sit on edge lines, outside the envelope.
  for (const name of ['racecraftStudsRed', 'racecraftStudsAmber']) {
    const mesh = handle.group.getObjectByName(name)
    const p = mesh.geometry.getAttribute('position')
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i += 53) {
      v.fromBufferAttribute(p, i)
      const solved = track.toTrack(v)
      assert.ok(
        Math.abs(solved.d) > 6.5,
        `stud off the driving line (d=${solved.d.toFixed(2)})`
      )
    }
  }
  // Lamp poles stand outside the barriers.
  const steel = handle.group.getObjectByName('racecraftDarkSteel')
  assert.ok(steel, 'lamp poles built')
}))

// Corner zones are detected, including the drift corner.
test('corner zones cover the major bends', () => withStubs(() => {
  const { handle } = makeRacecraft()
  assert.ok(handle.zones.length >= 3, `${handle.zones.length} zones`)
  const drift = handle.zones.find((z) => z.s0 < 600 && z.s1 > 600)
  assert.ok(drift, 'drift corner zoned')
  assert.ok(handle.counts.studs > 50, 'stud coverage')
  assert.ok(handle.counts.lamps > 10, 'lamp coverage')
  assert.ok(handle.counts.caps > 5, 'danger-corner caps')
}))

// Flicker animates shared materials only, staying finite.
test('updateRacecraft flickers safely', () => withStubs(() => {
  const { handle } = makeRacecraft()
  updateRacecraft(handle, 0)
  const before = handle.flicker.map((c) => c.mat.emissiveIntensity)
  updateRacecraft(handle, 1.37)
  const after = handle.flicker.map((c) => c.mat.emissiveIntensity)
  assert.ok(
    after.some((v, i) => Math.abs(v - before[i]) > 1e-6),
    'flicker moves intensities'
  )
  for (const v of after) {
    assert.ok(Number.isFinite(v) && v >= 0 && v < 3, `sane intensity ${v}`)
  }
  updateRacecraft(null, 1)
  updateRacecraft({}, 1)
}))

// Performance: bounded draw calls and geometry.
test('racecraft stays cheap', () => withStubs(() => {
  const { handle } = makeRacecraft()
  let meshes = 0
  let tris = 0
  handle.group.traverse((object) => {
    if (!object.isMesh) return
    meshes++
    const geo = object.geometry
    tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3
  })
  assert.ok(meshes < 30, `${meshes} draw calls`)
  assert.ok(tris < 40000, `${Math.round(tris)} triangles`)
}))

// Finite pipeline, no NaN anywhere.
test('racecraft geometry is finite', () => withStubs(() => {
  const { handle } = makeRacecraft()
  handle.group.traverse((object) => {
    if (!object.isMesh) return
    const p = object.geometry.getAttribute('position')
    for (let i = 0; i < p.count; i += 13) {
      assert.ok(
        Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)),
        `finite verts in ${object.name}`
      )
    }
  })
}))
