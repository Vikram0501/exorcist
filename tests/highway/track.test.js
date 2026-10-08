import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  ROAD_PATH_POINTS,
  ROAD_WIDTH,
  FINISH_DISTANCE_BUFFER,
  LEGACY_TOTAL_ROAD_LENGTH,
  Track,
  asTrack,
  buildArcLengthTable,
  createDefaultTrack,
} from '../../src/levels/highway/track.js'

// Circuit route including the 60 m finish runoff.
const EXPECTED_TOTAL_LENGTH = 1581.046503009062

test('s=0 produces the expected start position', () => {
  const track = createDefaultTrack()
  const frame = track.sampleAt(0)
  assert.ok(Math.abs(frame.position.x - 0) < 1e-9)
  assert.ok(Math.abs(frame.position.z - 10) < 1e-9)
  assert.equal(frame.progress, 0)
})

test('s=totalLength produces the expected end position', () => {
  const track = createDefaultTrack()
  const frame = track.sampleAt(track.totalLength)
  assert.ok(frame.position.distanceTo(ROAD_PATH_POINTS.at(-1)) < 1e-9)
  assert.equal(frame.progress, track.totalLength)
})

test('sampleAt() clamps safely outside valid range', () => {
  const track = createDefaultTrack()
  const before = track.sampleAt(-100)
  assert.equal(before.progress, 0)
  assert.ok(Math.abs(before.position.z - 10) < 1e-9)
  const after = track.sampleAt(track.totalLength + 100)
  assert.equal(after.progress, track.totalLength)
  assert.ok(after.position.distanceTo(ROAD_PATH_POINTS.at(-1)) < 1e-9)
})

test('tangent and lateral are normalized and perpendicular', () => {
  const track = createDefaultTrack()
  for (let s = 0; s <= track.totalLength; s += 37) {
    const frame = track.sampleAt(s)
    assert.ok(Math.abs(frame.tangent.length() - 1) < 1e-9, `tangent at ${s}`)
    assert.ok(Math.abs(frame.lateral.length() - 1) < 1e-9, `lateral at ${s}`)
    assert.ok(Math.abs(frame.tangent.dot(frame.lateral)) < 1e-9, `perp at ${s}`)
    assert.ok(Math.abs(frame.up.length() - 1) < 1e-9)
    assert.ok(Math.abs(frame.up.dot(frame.tangent)) < 1e-9)
  }
})

test('toWorld(s, 0) equals the track centre', () => {
  const track = createDefaultTrack()
  for (const s of [0, 100, 300, 500, 700, track.totalLength]) {
    const centre = track.sampleAt(s).position
    const world = track.toWorld(s, 0)
    assert.ok(world.distanceTo(new THREE.Vector3(centre.x, centre.y, centre.z)) < 1e-9)
  }
})

test('positive and negative d appear on opposite sides', () => {
  const track = createDefaultTrack()
  const s = 450
  const frame = track.sampleAt(s)
  const plus = track.toWorld(s, 3)
  const minus = track.toWorld(s, -3)
  const plusSide = new THREE.Vector3().subVectors(plus, frame.position).dot(frame.lateral)
  const minusSide = new THREE.Vector3().subVectors(minus, frame.position).dot(frame.lateral)
  assert.ok(plusSide > 2.9 && plusSide < 3.1)
  assert.ok(minusSide < -2.9 && minusSide > -3.1)
  // Opposite sides of centre: midpoint is the centre.
  const mid = new THREE.Vector3().addVectors(plus, minus).multiplyScalar(0.5)
  assert.ok(mid.distanceTo(frame.position) < 1e-9)
})

test('getProgress01() works correctly', () => {
  const track = createDefaultTrack()
  assert.equal(track.getProgress01(0), 0)
  assert.equal(track.getProgress01(track.totalLength), 1)
  assert.ok(Math.abs(track.getProgress01(track.totalLength / 2) - 0.5) < 1e-9)
  assert.equal(track.getProgress01(-50), 0)
  assert.equal(track.getProgress01(track.totalLength + 50), 1)
})

test('toTrack(toWorld(s,d)) approximately recovers s and d', () => {
  const track = createDefaultTrack()
  for (const [s, d] of [[50, 2], [250, -3.5], [450, 0], [650, 5], [850, -1.5], [1050, 3]]) {
    const world = track.toWorld(s, d, 0)
    const back = track.toTrack(world)
    assert.ok(Math.abs(back.s - s) < 1.5, `s recovered at s=${s},d=${d}: got ${back.s}`)
    assert.ok(Math.abs(back.d - d) < 0.5, `d recovered at s=${s},d=${d}: got ${back.d}`)
  }
})

test('track length matches the new race-track geometry', () => {
  const track = createDefaultTrack()
  assert.ok(
    Math.abs(track.totalLength - EXPECTED_TOTAL_LENGTH) < 1e-6,
    `total ${track.totalLength}, expected ${EXPECTED_TOTAL_LENGTH}`
  )
  // The legacy table helper still describes the control polygon, which
  // must stay within a few percent of the smoothed curve length.
  const polygon = buildArcLengthTable(ROAD_PATH_POINTS)
  const polygonLength = polygon[polygon.length - 1]
  assert.ok(
    Math.abs(polygonLength - track.totalLength) / track.totalLength < 0.05,
    `polygon ${polygonLength} vs curve ${track.totalLength}`
  )
  // Finish convention preserved.
  assert.equal(track.getFinishDistance(), track.totalLength - FINISH_DISTANCE_BUFFER)
  assert.equal(ROAD_WIDTH, 14)
  assert.equal(LEGACY_TOTAL_ROAD_LENGTH, 952.6585091144439)
})

test('endpoint direction is valid and does not collapse to angle 0', () => {
  const track = createDefaultTrack()
  const start = track.sampleAt(0)
  const end = track.sampleAt(track.totalLength)
  // Both ends of this track head roughly -Z: yaw near ±PI, never a
  // collapsed 0 placeholder.
  for (const [name, frame] of [['start', start], ['end', end]]) {
    assert.ok(Number.isFinite(frame.angle), `${name} angle finite`)
    assert.ok(Math.abs(frame.angle) > 1.0, `${name} angle ${frame.angle} not collapsed to 0`)
    assert.ok(
      Math.abs(frame.tangent.length() - 1) < 1e-9,
      `${name} tangent normalized`
    )
  }
  // asTrack() passes Track instances through untouched.
  assert.equal(asTrack(track), track)
})

test('samples are continuous with no sudden tangent jumps', () => {
  const track = createDefaultTrack()
  let prevAngle = track.sampleAt(0).angle
  let maxDelta = 0
  for (let s = 2; s <= track.totalLength; s += 2) {
    const angle = track.sampleAt(s).angle
    let delta = Math.abs(angle - prevAngle)
    if (delta > Math.PI) delta = 2 * Math.PI - delta
    if (delta > maxDelta) maxDelta = delta
    prevAngle = angle
  }
  // CatmullRom bends ease in/out: a 2 m step must never snap the heading.
  assert.ok(maxDelta < 0.05, `max tangent delta per 2 m: ${maxDelta}`)
})

test('sampling is finite and progress monotonic', () => {
  const track = createDefaultTrack()
  let prevS = -Infinity
  for (let s = 0; s <= track.totalLength; s += 13) {
    const frame = track.sampleAt(s)
    for (const v of [frame.position.x, frame.position.y, frame.position.z,
      frame.tangent.x, frame.tangent.z, frame.angle]) {
      assert.ok(Number.isFinite(v), `finite sample at s=${s}`)
    }
    assert.ok(frame.progress >= prevS)
    prevS = frame.progress
    assert.ok(frame.progress01 >= 0 && frame.progress01 <= 1)
  }
  assert.equal(track.sampleAt(track.totalLength).progress01, 1)
})

test('track does not self-intersect and bends leave road clearance', () => {
  const track = createDefaultTrack()
  const pts = []
  for (let s = 0; s <= track.totalLength; s += 5) {
    pts.push({ s, p: track.sampleAt(s).position })
  }
  let minDist = Infinity
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      // Ignore neighbouring sections of the same bend complex.
      if (pts[j].s - pts[i].s < 150) continue
      const d = pts[i].p.distanceTo(pts[j].p)
      if (d < minDist) minDist = d
    }
  }
  // Road is 14 wide (half-width 7); distant sections must stay far apart.
  assert.ok(minDist > ROAD_WIDTH * 3, `min non-neighbour distance: ${minDist}`)
})

test('curvature stays playable for the lateral controller', () => {
  const track = createDefaultTrack()
  // Approximate radius from heading change over 5 m windows.
  let minRadius = Infinity
  let prev = track.sampleAt(0)
  for (let s = 5; s <= track.totalLength; s += 5) {
    const cur = track.sampleAt(s)
    let dAng = cur.angle - prev.angle
    while (dAng > Math.PI) dAng -= 2 * Math.PI
    while (dAng < -Math.PI) dAng += 2 * Math.PI
    if (Math.abs(dAng) > 1e-6) {
      minRadius = Math.min(minRadius, 5 / Math.abs(dAng))
    }
    prev = cur
  }
  // Tight corners still leave a safe radius for free-steering arcade cars.
  assert.ok(minRadius > 45, `min curve radius: ${minRadius}`)
})

// The route climbs meaningfully somewhere (not effectively flat).
test('track contains a meaningful climb', () => {
  const track = createDefaultTrack()
  let best = -Infinity
  for (let s = 0; s + 200 <= track.totalLength; s += 5) {
    const rise =
      track.sampleAt(s + 200).position.y - track.sampleAt(s).position.y
    if (rise > best) best = rise
  }
  assert.ok(best > 9, `climb over 200 m: ${best.toFixed(1)} m`)
})

// ... and descends meaningfully somewhere.
test('track contains a meaningful descent', () => {
  const track = createDefaultTrack()
  let best = Infinity
  for (let s = 0; s + 200 <= track.totalLength; s += 5) {
    const drop =
      track.sampleAt(s + 200).position.y - track.sampleAt(s).position.y
    if (drop < best) best = drop
  }
  assert.ok(best < -8, `descent over 200 m: ${best.toFixed(1)} m`)
})

// A real crest: local maximum far from either end whose far side drops
// out of sight from chase-camera height — the downhill reveal reads
// while racing instead of merely existing as numbers.
test('track contains a crest', () => {
  const track = createDefaultTrack()
  const y = (s) => track.sampleAt(s).position.y
  let crest = -1
  let crestY = -Infinity
  for (let s = 150; s <= track.totalLength - 150; s += 5) {
    if (y(s) > crestY) {
      crestY = y(s)
      crest = s
    }
  }
  assert.ok(crest > 0, 'a highest point exists mid-race')
  // Sightline from eye height (car + chase camera) 40 m before the top,
  // over the crest: road staying hidden beyond it proves the reveal.
  const eyeS = crest - 40
  const eyeY = y(eyeS) + 3.8
  const slope = (crestY - eyeY) / 40
  let hidden = 0
  for (
    let s = crest;
    s <= Math.min(track.totalLength, crest + 250);
    s += 2
  ) {
    if (eyeY + slope * (s - eyeS) - y(s) > 0.3) hidden += 2
  }
  assert.ok(
    hidden > 25,
    `downhill hides behind the crest for ${hidden.toFixed(0)} m`
  )
})

// A readable S-bend: opposite-signed turns within quick succession.
test('track contains an S-bend', () => {
  const track = createDefaultTrack()
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }
  const turnOver = (s, span) =>
    wrap(track.sampleAt(Math.min(track.totalLength, s + span)).angle -
      track.sampleAt(Math.max(0, s - span)).angle)
  let found = false
  for (let s = 100; s <= track.totalLength - 100; s += 5) {
    const first = turnOver(s, 45)
    for (let t = s + 40; t <= Math.min(track.totalLength - 40, s + 160); t += 5) {
      const second = turnOver(t, 45)
      if (first < (-15 * Math.PI) / 180 && second > (15 * Math.PI) / 180) {
        found = true
        break
      }
    }
    if (found) break
  }
  assert.ok(found, 'a left-then-right (or mirrored) S sequence exists')
})

// One hero corner: the tightest sustained bend, clearly stronger than
// ordinary sweepers but no hairpin.
test('hero drift corner has stronger curvature', () => {
  const track = createDefaultTrack()
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }
  let best = { turn: 0, s: 0, radius: Infinity }
  for (let s = 100; s + 150 <= track.totalLength; s += 5) {
    const turn = Math.abs(
      wrap(
        track.sampleAt(s + 150).angle - track.sampleAt(s).angle
      )
    )
    // Local radius at the middle of the window.
    const mid = track.sampleAt(s + 75).angle
    const before = track.sampleAt(s + 70).angle
    const local = Math.abs(wrap(mid - before)) / 5
    const radius = local > 1e-6 ? 1 / local : Infinity
    if (turn > best.turn) {
      best = { turn, s: s + 75, radius: Math.min(radius, best.radius) }
    }
  }
  assert.ok(
    (best.turn * 180) / Math.PI > 45,
    `hero turns ${(best.turn * 180 / Math.PI).toFixed(0)}deg over 150 m`
  )
  assert.ok(
    best.radius > 45,
    `hero stays drivable, local radius ${best.radius.toFixed(0)} m`
  )
  assert.ok(
    best.radius < 120,
    `hero is genuinely stronger, local radius ${best.radius.toFixed(0)} m`
  )
})

test('finish distance remains valid on the new geometry', () => {
  const track = createDefaultTrack()
  const finish = track.getFinishDistance()
  assert.ok(finish > track.totalLength * 0.9)
  assert.ok(finish < track.totalLength)
  const frame = track.sampleAt(finish)
  assert.ok(Number.isFinite(frame.angle))
  assert.ok(Math.abs(frame.tangent.length() - 1) < 1e-9)
})

test('circuit has three racing straights and readable corner complexes', () => {
  const track = createDefaultTrack()
  const turn = (a, b) => {
    const delta = track.sampleAt(b).angle - track.sampleAt(a).angle
    return Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI
  }
  // Long enough to accelerate and race side by side; finish paint lies on
  // the final straight, not partway around the last corner.
  for (const [a, b] of [[10, 160], [400, 520], [1400, 1570]]) {
    assert.ok(Math.abs(turn(a, b)) < 1, `straight ${a}..${b}`)
  }
  assert.ok(turn(190, 370) < -70, 'opening sweeper changes direction visibly')
  assert.ok(turn(550, 710) > 90, 'braking corner is a deliberate left turn')
  assert.ok(turn(730, 810) < -30 && turn(830, 910) > 30, 'linked S changes direction')
  assert.ok(turn(930, 1110) < -135, 'hero corner doubles back through a long drift arc')
  assert.ok(turn(1130, 1370) > 110, 'broad exit sweeper leads onto the sprint')
  let lateralReveal = 0
  for (let s = 940; s < 1070; s += 5) {
    const frame = track.sampleAt(s)
    lateralReveal = Math.max(lateralReveal, Math.abs(
      track.sampleAt(s + 50).position.sub(frame.position).dot(frame.lateral)
    ))
  }
  assert.ok(lateralReveal > ROAD_WIDTH, 'corner leaves the current forward corridor within 50 m')
})

test('two car footprints fit side by side through every circuit corner', () => {
  const track = createDefaultTrack()
  for (let s = 10; s < track.getFinishDistance(); s += 10) {
    const frame = track.sampleAt(s)
    for (const lane of [-2, 2]) {
      const center = track.toWorld(s, lane)
      for (const width of [-1, 1]) {
        for (const length of [-2, 2]) {
          const corner = center.clone().addScaledVector(frame.lateral, width)
            .addScaledVector(frame.tangent, length)
          const solved = track.toTrack(corner)
          assert.ok(Math.abs(solved.d) < 5.9, '4 m by 2 m cars clear the curbs')
          assert.ok(Math.sign(solved.d) === Math.sign(lane), 'cars occupy separate lanes')
          assert.ok(Math.abs(solved.s - s) < 2.5, 'footprint stays on its circuit section')
        }
      }
    }
  }
})
