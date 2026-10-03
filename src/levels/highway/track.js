import * as THREE from 'three'

// ============================================
// LEVEL 3 TRACK — SINGLE SOURCE OF TRUTH
// ============================================
//
// Track-relative coordinates used across Level 3:
//
//   s = distance/progress along the highway centre line (world units)
//   d = lateral distance from the track centre (+ = one side, - = other)
//
// Internals: THREE.CatmullRomCurve3 (centripetal) with arc-length-aware
// sampling, so `s` is always real distance travelled along the track and
// never the raw curve parameter. The public API is curve-agnostic: future
// elevation/banking support slots in without touching consumers.
//
// Conventions:
//   - position: centre point on track (y follows the elevation profile)
//   - tangent:  normalized 3D forward direction of travel (has real y)
//   - lateral:  normalized perpendicular rotated by bank around tangent
//     (level on straights; outer edge rises in banked corners)
//   - up:       track up, derived from world-up + tangent, then rotated
//     by bank around tangent (world-up on flat straights)
//   - angle:    yaw-compatible angle, Math.atan2(tangent.x, tangent.z)
//   - bank:     smoothed bank angle in radians (0 on straights)
//   - progress: clamped distance along track

export const ROAD_WIDTH = 14

// Authoritative finish buffer: finish sits this far before track end.
export const FINISH_DISTANCE_BUFFER = 60

// Half-window used for tangent estimation in track frames. Matches the
// historical city/streetlight frame convention.
export const FRAME_TANGENT_HALF = 4

// Total length of the previous (~952.66 m) piecewise-linear highway.
// Scripted triggers authored against that layout are normalized through
// this constant so gameplay pacing survives geometry changes.
export const LEGACY_TOTAL_ROAD_LENGTH = 952.6585091144439

// Sampling step used by toTrack() coarse search.
const TO_TRACK_COARSE_STEP = 4

// Arcade banking derived from plan curvature: bank angle (rad) ~=
// BANK_GAIN * yaw-rate, clamped to BANK_MAX_ANGLE. GAIN 25 puts gentle
// sweepers at ~2-3 deg, medium corners at ~4-6 deg and the tightest
// drift corner near ~8 deg. Banking is outer-edge-up by construction
// (verified against the turn direction), purely from geometry.
const BANK_GAIN = 25
const BANK_MAX_ANGLE = (10 * Math.PI) / 180
// Banking LUT resolution + smoothing (two box-blur passes over this
// radius in samples). Blends banking in before corners and out after,
// with no abrupt roll changes.
const BANK_LUT_SAMPLES = 720
const BANK_SMOOTH_RADIUS = 20
const BANK_SMOOTH_PASSES = 2

export const TRACK_BANK_GAIN = BANK_GAIN
export const TRACK_BANK_MAX_ANGLE = BANK_MAX_ANGLE

// Arc-length LUT resolution for the CatmullRom curve.
const CURVE_ARC_DIVISIONS = 2000

// Dense samples used for exact-style distance queries.
const CLEARANCE_SAMPLE_COUNT = 600


// Level 3 control points with deliberate arcade elevation (Phase 1).
//
// Horizontal X/Z rhythm is unchanged: acceleration straight -> gentle
// right sweeper -> medium left complex -> short straight -> strong
// right (drift-friendly) -> recovery straight -> large left sweeper ->
// final fast section -> FINISH. Z decreases monotonically (no doubling
// back, no self-intersections).
//
// Elevation rhythm (restrained, CatmullRom-smoothed): flat launch ->
// steady climb -> crest (+16) over the medium-left complex -> descent
// through the drift corner -> dip (-4) on the recovery straight ->
// gentle rise to a stable flat finish. Steepest control-polygon grade
// is ~6%; the smoothed curve stays below that. No jumps, no
// rollercoaster: velocity physics remains planar (see car.js).
// Level 3 control points: dramatic arcade street-racing geometry.
//
// Rhythm (8 readable sections): start straight -> uphill right sweeper
// -> crest complex (lefts over the top) -> downhill traverse -> S-bend
// (right then left) -> HERO right drift corner -> unwinding left
// sweeper -> fast straight -> stable finish straight.
// Z decreases monotonically (no doubling back, no self-intersections).
// Elevation: flat launch -> steady climb -> crest (+15) -> descent to a
// dip (-7) at the hero -> gentle rise to a stable finish. All radii stay
// well above the lateral controller's comfort zone (min ~50 m).
export const ROAD_PATH_POINTS = [
  // Section 1: start / acceleration straight (flat launch).
  new THREE.Vector3(0.0, 0.0, 10.0),
  new THREE.Vector3(-0.0, 1.0, -110.0),
  // Section 2: uphill sweeper, long right.
  new THREE.Vector3(3.5, 2.7, -153.2),
  new THREE.Vector3(14.0, 4.3, -195.2),
  new THREE.Vector3(31.2, 6.0, -235.0),
  new THREE.Vector3(48.7, 7.8, -271.0),
  new THREE.Vector3(63.7, 9.7, -308.1),
  new THREE.Vector3(76.1, 11.5, -346.1),
  // Section 3: crest complex, bending left over the top. Sharpened so
  // the climb reads against the skyline and the far side drops out of
  // sight from the chase camera (see crest-visibility test).
  new THREE.Vector3(83.6, 13.5, -375.2),
  new THREE.Vector3(89.5, 14.8, -404.5),
  new THREE.Vector3(90.9, 12.6, -451.2),
  new THREE.Vector3(78.8, 10.2, -496.3),
  // Section 4: downhill traverse.
  new THREE.Vector3(54.3, 7.0, -536.0),
  new THREE.Vector3(34.4, 6.0, -576.4),
  new THREE.Vector3(35.4, 6.0, -621.3),
  new THREE.Vector3(38.3, 4.0, -666.2),
  // Section 5: S-bend, right then left.
  new THREE.Vector3(23.9, 2.0, -708.9),
  new THREE.Vector3(-1.1, 0.0, -752.2),
  new THREE.Vector3(-13.9, -2.3, -797.1),
  // Section 6: HERO drift corner, big banked right.
  new THREE.Vector3(-3.8, -4.7, -842.6),
  new THREE.Vector3(26.8, -7.0, -877.9),
  new THREE.Vector3(58.9, -6.3, -916.2),
  // Section 7: unwinding left sweeper, fast and open.
  new THREE.Vector3(67.6, -5.7, -965.5),
  new THREE.Vector3(50.5, -5.0, -1012.4),
  new THREE.Vector3(16.1, -3.0, -1061.6),
  // Section 8: finish straight, stable and readable.
  new THREE.Vector3(-6.0, 0.0, -1110.0),
]


// Legacy piecewise-linear arc-length table. Kept for compatibility checks
// and tests; the Track class itself samples the CatmullRom curve.
export function buildArcLengthTable(points) {
  const arcLengths = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = (points[i].y || 0) - (points[i - 1].y || 0)
    const dz = points[i].z - points[i - 1].z
    arcLengths.push(
      arcLengths[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz)
    )
  }
  return arcLengths
}


export class Track {
  constructor(points = ROAD_PATH_POINTS, arcLengths = null) {
    // Second parameter is legacy compat (old callers pass arc-length
    // tables); the curve owns arc length now, so it is accepted and
    // ignored. Clone so callers cannot mutate the shared definition.
    void arcLengths
    // Clone so callers cannot mutate the shared definition. Fewer than two
    // points cannot form a curve (some tests construct scenery-only
    // managers with an empty path); fall back to a harmless 1 m stub so
    // sampling stays total while contributing no visible geometry.
    const source = points.length >= 2
      ? points
      : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]
    this.points = source.map((p) => p.clone())
    this.curve = new THREE.CatmullRomCurve3(
      this.points,
      false,
      'centripetal',
      0.5
    )
    this.curve.arcLengthDivisions = CURVE_ARC_DIVISIONS
    this._totalLength = this.curve.getLength()
    // Banking lookup table over uniform arc position (see sampleAt).
    this._bankLUT = computeBankLUT(this.curve, this._totalLength)
    // Legacy compat LUT: uniformly spaced cumulative lengths, so readers
    // using arcLengths[last] as the total keep working.
    this.arcLengths = this.curve.getLengths(CURVE_ARC_DIVISIONS)
    // Dense centre-line samples for distance queries.
    this._clearanceSamples = this.curve.getSpacedPoints(
      CLEARANCE_SAMPLE_COUNT
    )
  }

  get totalLength() {
    return this._totalLength
  }

  clampS(s) {
    return THREE.MathUtils.clamp(s, 0, this._totalLength)
  }

  getProgress01(s) {
    if (this._totalLength <= 0) return 0
    return this.clampS(s) / this._totalLength
  }

  getFinishDistance(buffer = FINISH_DISTANCE_BUFFER) {
    return this._totalLength - buffer
  }

  sampleAt(distance) {
    const totalLength = this._totalLength
    const s = this.clampS(distance)
    const u = totalLength > 0 ? s / totalLength : 0

    const position = this.curve.getPointAt(u)
    const rawTangent = this.curve.getTangentAt(u)

    // True 3D tangent: elevation flows through from the control points.
    // (Phase 1 has no banking; lateral stays level, see below.)
    const tangent = new THREE.Vector3(
      rawTangent.x,
      rawTangent.y,
      rawTangent.z
    )
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, -1)
    tangent.normalize()

    // Track up: world-up with the tangential component removed
    // (Gram-Schmidt), so up is exactly perpendicular to tangent and
    // equals world-up on flat ground. Banking will tilt this later.
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(
      tangent,
      -tangent.y
    )
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0)
    up.normalize()

    // Level lateral axis: tangent x up. Until banking rotates the
    // frame below, its y component is exactly zero (up lies in the
    // world-up/tangent plane), keeping cross-sections horizontal.
    const lateral = new THREE.Vector3().crossVectors(tangent, up)
    if (lateral.lengthSq() < 1e-8) lateral.set(-1, 0, 0)
    lateral.normalize()

    // Arcade banking: rotate (lateral, up) around the tangent by the
    // smoothed bank angle. Positive bank lifts the +d (driver's right)
    // edge; the LUT sign puts the outer edge up for the turn direction.
    // Rotation preserves unit length and mutual perpendicularity.
    const bank = this.sampleBank(s)
    if (bank !== 0) {
      const cos = Math.cos(bank)
      const sin = Math.sin(bank)
      const lx = lateral.x
      const ly = lateral.y
      const lz = lateral.z
      lateral.set(
        lx * cos + up.x * sin,
        ly * cos + up.y * sin,
        lz * cos + up.z * sin
      )
      up.set(
        -lx * sin + up.x * cos,
        -ly * sin + up.y * cos,
        -lz * sin + up.z * cos
      )
    }

    const direction = new THREE.Vector2(tangent.x, tangent.z)
    const angle = Math.atan2(tangent.x, tangent.z)

    return {
      position,
      tangent,
      lateral,
      up,
      direction,
      angle,
      bank,
      progress: s,
      progress01: this.getProgress01(s),
    }
  }


  // Smoothed bank angle (rad) at distance s, linearly interpolated
  // from the construction-time LUT. Zero on straights by construction
  // (curvature-derived), bounded by BANK_MAX_ANGLE.
  sampleBank(distance) {
    const lut = this._bankLUT
    if (!lut || lut.length === 0) return 0
    const s = this.clampS(distance)
    const total = this._totalLength
    if (!(total > 0)) return 0
    const x = (s / total) * (lut.length - 1)
    const i = Math.min(lut.length - 2, Math.floor(x))
    const t = x - i
    return lut[i] * (1 - t) + lut[i + 1] * t
  }

  // Alias kept for readability at call sites dealing in frames.
  getFrameAt(s) {
    return this.sampleAt(s)
  }

  toWorld(s, d, height = 0) {
    // Full banked frame: lateral carries cross-slope height, up carries
    // the surface offset. On flat straights this reduces exactly to the
    // historical (x + lx*d, y + h, z + lz*d).
    const frame = this.sampleAt(s)
    return new THREE.Vector3(
      frame.position.x + frame.lateral.x * d + frame.up.x * height,
      frame.position.y + frame.lateral.y * d + frame.up.y * height,
      frame.position.z + frame.lateral.z * d + frame.up.z * height
    )
  }

  // Distance to the centre line (XZ plane). Uses dense curve samples so
  // clearance checks respect the smoothed bends, not the control polygon.
  distanceToPath(x, z) {
    const samples = this._clearanceSamples
    let nearest = Infinity

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]
      const b = samples[i]

      const dx = b.x - a.x
      const dz = b.z - a.z
      const lengthSq = dx * dx + dz * dz

      const t = lengthSq > 0
        ? ((x - a.x) * dx + (z - a.z) * dz) / lengthSq
        : 0
      const along = t < 0 ? 0 : t > 1 ? 1 : t

      const px = a.x + dx * along - x
      const pz = a.z + dz * along - z
      const distance = Math.sqrt(px * px + pz * pz)

      if (distance < nearest) nearest = distance
    }

    return nearest
  }

  // Approximate world -> track conversion. Coarse arc scan followed by
  // local hill-climbing refinement on the smooth curve.
  toTrack(worldPosition) {
    const totalLength = this._totalLength

    // Coarse scan.
    let bestS = 0
    let bestDistSq = Infinity
    for (let s = 0; s <= totalLength; s += TO_TRACK_COARSE_STEP) {
      const p = this.sampleAt(s).position
      const dx = worldPosition.x - p.x
      const dy = (worldPosition.y || 0) - (p.y || 0)
      const dz = worldPosition.z - p.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestS = s
      }
    }
    {
      const p = this.sampleAt(totalLength).position
      const dx = worldPosition.x - p.x
      const dy = (worldPosition.y || 0) - (p.y || 0)
      const dz = worldPosition.z - p.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestS = totalLength
      }
    }

    // Local refinement: hill-climb in s with shrinking step.
    let refinedS = bestS
    let refinedDistSq = bestDistSq
    let step = TO_TRACK_COARSE_STEP
    for (let iter = 0; iter < 24; iter++) {
      let improved = false
      for (const candidate of [refinedS - step, refinedS + step]) {
        if (candidate < 0 || candidate > totalLength) continue
        const p = this.sampleAt(candidate).position
        const dx = worldPosition.x - p.x
        const dy = (worldPosition.y || 0) - (p.y || 0)
        const dz = worldPosition.z - p.z
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < refinedDistSq) {
          refinedDistSq = distSq
          refinedS = candidate
          improved = true
        }
      }
      if (!improved) step *= 0.5
      if (step < 0.05) break
    }

    const frame = this.sampleAt(refinedS)
    const ox = worldPosition.x - frame.position.x
    const oy = (worldPosition.y || 0) - (frame.position.y || 0)
    const oz = worldPosition.z - frame.position.z
    // True lateral distance across the banked cross-section: the frame
    // lateral's XZ projection shortens by cos(bank), so renormalize.
    // (Exactly 1 on flat ground; toWorld remains the exact inverse.)
    const lateralXZ =
      frame.lateral.x * frame.lateral.x +
      frame.lateral.z * frame.lateral.z
    const d =
      lateralXZ > 1e-8
        ? (ox * frame.lateral.x + oz * frame.lateral.z) / lateralXZ
        : ox * frame.lateral.x + oz * frame.lateral.z
    const distanceFromTrack = Math.sqrt(ox * ox + oy * oy + oz * oz)

    return {
      s: refinedS,
      d,
      distanceFromTrack,
      progress01: this.getProgress01(refinedS),
    }
  }
}


// Default Level 3 track instance data. Callers build their own Track so
// placement never shares mutable sampling state.
export function createDefaultTrack() {
  return new Track(ROAD_PATH_POINTS)
}


// Banking lookup: signed plan-curvature (yaw rate) sampled densely,
// scaled to arcade bank angles, clamped, then box-smoothed twice so
// banking blends in before corners and out after them. Positive bank
// lifts the +d edge; the sign follows the turn direction (outer up).
function computeBankLUT(curve, totalLength) {
  const count = BANK_LUT_SAMPLES + 1
  const lut = new Float32Array(count)
  if (!(totalLength > 0)) return lut
  const headings = new Float32Array(count)
  const tangent = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    curve.getTangentAt(i / (count - 1), tangent)
    headings[i] = Math.atan2(tangent.x, tangent.z)
  }
  const ds = totalLength / (count - 1)
  const raw = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = headings[Math.max(0, i - 1)]
    const b = headings[Math.min(count - 1, i + 1)]
    let rate = (b - a) / (2 * ds)
    while (rate > Math.PI / ds) rate -= (2 * Math.PI) / (2 * ds)
    while (rate < -Math.PI / ds) rate += (2 * Math.PI) / (2 * ds)
    raw[i] = THREE.MathUtils.clamp(
      BANK_GAIN * rate,
      -BANK_MAX_ANGLE,
      BANK_MAX_ANGLE
    )
  }
  let smoothed = raw
  for (let pass = 0; pass < BANK_SMOOTH_PASSES; pass++) {
    const next = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      let sum = 0
      let n = 0
      for (
        let j = Math.max(0, i - BANK_SMOOTH_RADIUS);
        j <= Math.min(count - 1, i + BANK_SMOOTH_RADIUS);
        j++
      ) {
        sum += smoothed[j]
        n++
      }
      next[i] = sum / n
    }
    smoothed = next
  }
  lut.set(smoothed)
  return lut
}


// Accepts either a Track instance or legacy (roadPath, arcLengths) pairs so
// consumers migrate gradually without breaking tests or game.js.
export function asTrack(roadPathOrTrack, arcLengths = null) {
  if (roadPathOrTrack && typeof roadPathOrTrack.sampleAt === 'function') {
    return roadPathOrTrack
  }
  if (Array.isArray(roadPathOrTrack)) {
    return new Track(roadPathOrTrack)
  }
  void arcLengths
  return createDefaultTrack()
}
