import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  GHOST_AVOID_LANE_BOUND,
  GHOST_AVOID_LOOKAHEAD_FAR,
  GHOST_AVOID_LOOKAHEAD_NEAR,
  GHOST_LATERAL_MAX_SPEED,
  GHOST_PREFERRED_LANE,
  HighwayRaceController,
} from '../../src/levels/highway/race.js'
import { createDefaultTrack } from '../../src/levels/highway/track.js'

function withStubs(fn) {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
  }
  try {
    return fn()
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

function makeRace() {
  const track = createDefaultTrack()
  const player = new HighwayCarController(
    new THREE.Object3D(), new THREE.PerspectiveCamera(), track, null
  )
  player.obstacles = []
  const race = new HighwayRaceController(
    player, new THREE.Object3D(), -880, 'OWEN GRAVE', null,
    new THREE.Scene(), track, null, track.totalLength
  )
  race.obstacles = []
  race.time = 4
  race.finishedCountdown = true
  race.raceStarted = true
  player.setDrivingEnabled(true)
  return { track, player, race }
}

function zombie(s, d, halfWidth = 0.7) {
  return {
    mesh: null, progress: s, lateralOffset: d,
    halfWidth, halfDepth: 0.7, hit: false,
  }
}

// Drives the ghost (player parked far away so the rubber band holds a
// steady chase pace) and records per-frame samples.
function runGhost(race, player, frames, keys = {}) {
  const samples = []
  for (let i = 0; i < frames; i++) {
    player.keys = { ...keys }
    player.update(1 / 60)
    race.update(1 / 60)
    samples.push({
      s: race.ghostPathProgress,
      d: race.ghostLateralOffset,
      v: race.ghostSpeed,
      avoiding: race.ghostAvoiding,
      side: race.ghostAvoidanceSide,
      target: race.ghostAvoidanceTargetD,
      obs: race.ghostAvoidanceObstacle,
    })
  }
  return samples
}

function countHits(samples) {
  let hits = 0
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1].v > 10 && samples[i].v <= 5.01) hits++
  }
  return hits
}

function finiteGhost(race, label) {
  for (const v of [
    race.ghostPathProgress, race.ghostSpeed,
    race.ghostLateralOffset, race.ghostLateralVelocity,
    race.ghostAvoidanceTargetD, race.ghostAvoidanceSide,
  ]) {
    assert.ok(Number.isFinite(v), `${label}: finite ghost state, got ${v}`)
  }
}

// 1. Ghost detects an obstacle ahead in its trajectory.
test('ghost detects an obstacle ahead', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  const obs = zombie(200, GHOST_PREFERRED_LANE)
  race.obstacles = [obs]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 120)
  const first = samples.find(s => s.avoiding)
  assert.ok(first, 'avoidance engages before the obstacle')
  assert.equal(first.obs, obs, 'tracks the actual obstacle')
  assert.ok(
    obs.progress - first.s >= GHOST_AVOID_LOOKAHEAD_NEAR - 1 &&
      obs.progress - first.s <= GHOST_AVOID_LOOKAHEAD_FAR + 1,
    `detects inside the look-ahead window, ds=${(obs.progress - first.s).toFixed(1)}`
  )
  player.dispose()
  race.dispose()
}))

// 2. Obstacles safely outside the trajectory are ignored.
test('ghost ignores obstacles outside its trajectory', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(200, 3.5)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 200)
  assert.ok(
    samples.every(s => !s.avoiding),
    'never avoids a non-threat'
  )
  assert.equal(countHits(samples), 0, 'passes cleanly')
  assert.ok(
    Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE) < 0.1,
    'holds its lane'
  )
  player.dispose()
  race.dispose()
}))

// 3. Chooses left when left is safer.
test('ghost chooses left when left is safer', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(200, -0.5)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 60)
  const first = samples.find(s => s.avoiding)
  assert.ok(first, 'avoidance engages')
  assert.equal(first.side, -1, `dodges left, side=${first.side}`)
  assert.ok(first.target < -0.5, `target ${first.target} is left of the obstacle`)
  player.dispose()
  race.dispose()
}))

// 4. Chooses right when right is safer.
test('ghost chooses right when right is safer', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(200, -3.5)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 60)
  const first = samples.find(s => s.avoiding)
  assert.ok(first, 'avoidance engages')
  assert.equal(first.side, 1, `dodges right, side=${first.side}`)
  assert.ok(first.target > -3.5, `target ${first.target} is right of the obstacle`)
  player.dispose()
  race.dispose()
}))

// 5. Avoidance stays inside road bounds.
test('ghost stays inside road bounds while avoiding', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [{
    mesh: null, progress: 200, lateralOffset: 3.5,
    halfWidth: 2.0, halfDepth: 0.8, hit: false,
  }]
  race.ghostPathProgress = 140
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 300)
  for (const s of samples) {
    assert.ok(
      Math.abs(s.d) <= GHOST_AVOID_LANE_BOUND + 0.01,
      `inside bounds, d=${s.d.toFixed(2)}`
    )
  }
  player.dispose()
  race.dispose()
}))

// 6. Avoidance begins early enough at race speed.
test('ghost begins avoidance early enough at race speed', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(260, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const d0 = race.ghostLateralOffset
  // 110 m out: beyond any look-ahead, so the ghost must still be free.
  assert.ok(!race.ghostAvoiding, 'no reaction hundreds of metres away')
  const samples = runGhost(race, player, 220)
  const first = samples.find(s => s.avoiding)
  assert.ok(first, 'avoidance engages')
  const ds = 260 - first.s
  assert.ok(ds > 20, `plans ${ds.toFixed(0)}m ahead, not at the last instant`)
  assert.ok(
    ds <= GHOST_AVOID_LOOKAHEAD_FAR + 1,
    `inside the window, ds=${ds.toFixed(1)}`
  )
  const idx = samples.indexOf(first)
  const later = samples[Math.min(idx + 30, samples.length - 1)]
  const moved = Math.abs(later.d - d0)
  assert.ok(moved > 0.3, `lateral move starts promptly, moved=${moved.toFixed(2)}`)
  player.dispose()
  race.dispose()
}))

// 7. No lateral teleporting.
test('ghost never teleports laterally', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 300)
  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      Math.abs(samples[i].d - samples[i - 1].d) <
        GHOST_LATERAL_MAX_SPEED / 60 + 1e-6,
      'per-frame lateral step respects the servo speed limit'
    )
  }
  player.dispose()
  race.dispose()
}))

// 8. The ghost commits to its chosen side.
test('ghost commits to the chosen side', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 200)
  const engaged = samples.filter(s => s.avoiding)
  assert.ok(engaged.length > 10, 'avoidance spans many frames')
  const sides = new Set(engaged.map(s => s.side))
  assert.equal(sides.size, 1, `one side only, saw ${[...sides]}`)
  const targets = new Set(engaged.map(s => s.target.toFixed(3)))
  assert.equal(targets.size, 1, 'one stable target, no re-planning dither')
  player.dispose()
  race.dispose()
}))

// 9. No left/right oscillation while avoiding.
test('ghost does not oscillate while avoiding', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 260)
  const engaged = samples.filter(s => s.avoiding)
  const target = engaged[0].target
  let maxOvershoot = 0
  for (const s of engaged) {
    const past = (s.d - target) * Math.sign(target - GHOST_PREFERRED_LANE)
    maxOvershoot = Math.max(maxOvershoot, past)
  }
  assert.ok(
    maxOvershoot < 0.6,
    `settles without weave, overshoot=${maxOvershoot.toFixed(2)}`
  )
  player.dispose()
  race.dispose()
}))

// 10. Clean dodge: clears the obstacle with no collision.
test('ghost clears an avoidable obstacle without collision', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  const obs = zombie(220, GHOST_PREFERRED_LANE)
  race.obstacles = [obs]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 300)
  assert.equal(countHits(samples), 0, 'no collision on a clean dodge')
  assert.ok(
    race.ghostPathProgress > obs.progress + 10,
    'passed the obstacle'
  )
  // Physical clearance at the crossing moment.
  let minGap = Infinity
  for (const s of samples) {
    if (Math.abs(s.s - obs.progress) < 3) {
      minGap = Math.min(minGap, Math.abs(s.d - obs.lateralOffset))
    }
  }
  assert.ok(
    minGap > 0.9 + obs.halfWidth,
    `real clearance, gap=${minGap.toFixed(2)}`
  )
  player.dispose()
  race.dispose()
}))

// 11. Returns toward the preferred lane after clearing.
test('ghost recovers to its lane after clearing', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 500)
  assert.ok(
    samples.some(s => s.avoiding),
    'precondition: avoidance happened'
  )
  assert.ok(!race.ghostAvoiding, 'avoidance ends after the pass')
  assert.ok(
    Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE) < 0.15,
    `back on its line d=${race.ghostLateralOffset.toFixed(2)}`
  )
  player.dispose()
  race.dispose()
}))

// 12. Holds its line when a second nearby obstacle makes that safer.
test('ghost holds its line for a second nearby obstacle', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [
    zombie(220, GHOST_PREFERRED_LANE),
    zombie(238, -0.5),
  ]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 400)
  assert.equal(countHits(samples), 0, 'both cleared without contact')
  // Continuous right-side line: never crosses back left of -0.5
  // between the two obstacles.
  const between = samples.filter(s => s.s > 216 && s.s < 244)
  assert.ok(between.length > 0, 'samples cover the gap')
  assert.ok(
    between.every(s => s.d > -0.5),
    `holds the right-side line, min=${Math.min(...between.map(s => s.d)).toFixed(2)}`
  )
  player.dispose()
  race.dispose()
}))

// 13. Player position steers the side choice away from the player.
test('ghost prefers the side away from the player', () => withStubs(() => {
  const { player, race } = makeRace()
  // Player cruises alongside on the left escape route the whole way.
  race.obstacles = [zombie(220, -0.5)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  let first = null
  for (let i = 0; i < 120 && !first; i++) {
    // Hold the player beside the ghost on the left.
    player.placeAt(race.ghostPathProgress + 2, -3)
    const f = player.forwardVector(new THREE.Vector3())
    player.velocity.set(f.x * 35, 0, f.z * 35)
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.ghostAvoiding) {
      first = {
        side: race.ghostAvoidanceSide,
        target: race.ghostAvoidanceTargetD,
      }
    }
  }
  assert.ok(first, 'avoidance engages')
  assert.equal(first.side, 1, `dodges right, away from the player (side=${first.side})`)
  player.dispose()
  race.dispose()
}))

// 14. A blocking player can still be bumped during avoidance.
test('player can still block and bump the ghost during avoidance', () => withStubs(() => {
  const { player, race } = makeRace()
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  let committed = false
  let kicked = false
  for (let i = 0; i < 200 && !kicked; i++) {
    if (race.ghostAvoiding && !committed) {
      committed = true
    }
    if (committed) {
      // Park the player on the ghost's escape line.
      player.placeAt(race.ghostPathProgress + 3, race.ghostAvoidanceTargetD)
      const f = player.forwardVector(new THREE.Vector3())
      player.velocity.set(f.x * 30, 0, f.z * 30)
    }
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0) kicked = true
  }
  assert.ok(committed, 'precondition: ghost committed to a dodge')
  assert.ok(kicked, 'ghost stays tangible: contact still happens')
  finiteGhost(race, 'bump during avoidance')
  player.dispose()
  race.dispose()
}))

// 15. A too-late obstacle still triggers a real collision.
test('unavoidable obstacle still collides', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  // One car-length ahead at full speed: physically unavoidable.
  race.obstacles = [zombie(153, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 60)
  assert.ok(countHits(samples) >= 1, 'the late obstacle is hit, not phased')
  player.dispose()
  race.dispose()
}))

// 16. That collision slows the ghost.
test('failed avoidance slows the ghost', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(153, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 30)
  assert.ok(
    Math.min(...samples.map(s => s.v)) <= 5.01,
    'knockback slowdown applies'
  )
  player.dispose()
  race.dispose()
}))

// 17. The hit obstacle stays solid (re-hit after the cooldown).
test('hit obstacle remains collidable, no permanent ignore', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  const obs = zombie(153, GHOST_PREFERRED_LANE)
  race.obstacles = [obs]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  runGhost(race, player, 30)
  assert.ok(
    !('ghostHitObstacles' in race),
    'the old permanent exclusion set is gone'
  )
  // Re-approach the same obstacle from behind: it must hit again.
  race.ghostPathProgress = 148
  race.ghostLateralOffset = GHOST_PREFERRED_LANE
  race.ghostLateralVelocity = 0
  race.ghostSpeed = 25
  race.ghostAvoiding = false
  race.ghostAvoidanceObstacle = null
  race.ghostObstacleCooldowns.clear()
  race.seatGhostFromTrack()
  const samples = runGhost(race, player, 60)
  assert.ok(countHits(samples) >= 1, 'same obstacle collides again')
  player.dispose()
  race.dispose()
}))

// 18. No hit-knockback-hit infinite loop.
test('ghost never loops on one obstacle', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(153, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 600)
  assert.ok(countHits(samples) <= 2, 'at most a hit plus a marginal clip')
  assert.ok(
    race.ghostPathProgress > 250,
    `races on s=${race.ghostPathProgress.toFixed(0)}`
  )
  player.dispose()
  race.dispose()
}))

// 19. After a hit, the ghost navigates around that obstacle.
test('ghost routes around an obstacle it just hit', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  const obs = zombie(153, GHOST_PREFERRED_LANE)
  race.obstacles = [obs]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 400)
  assert.ok(countHits(samples) >= 1, 'precondition: the hit happened')
  assert.ok(
    race.ghostPathProgress > obs.progress + 20,
    'passed the obstacle it hit'
  )
  assert.ok(
    Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE) < 0.5,
    'settled back toward its lane afterwards'
  )
  player.dispose()
  race.dispose()
}))

// 20. A staggered series is threaded without contact.
test('ghost threads multiple staggered obstacles', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [
    zombie(220, -3),
    { mesh: null, progress: 250, lateralOffset: 0.5, halfWidth: 1.0, halfDepth: 0.6, hit: false },
    zombie(280, 3),
  ]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 600)
  assert.equal(countHits(samples), 0, 'no contact through the series')
  assert.ok(race.ghostPathProgress > 320, 'rode through the whole series')
  finiteGhost(race, 'series')
  player.dispose()
  race.dispose()
}))

// 21. Blocked both sides: slows and threads the least-risk gap.
test('blocked route slows the ghost and picks least risk', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [{
    mesh: null, progress: 220, lateralOffset: 0,
    halfWidth: 6, halfDepth: 0.8, hit: false,
  }]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const samples = runGhost(race, player, 120)
  assert.ok(
    samples.some(s => s.v < 23),
    `lifts below rubber-band minimum, min=${Math.min(...samples.map(s => s.v)).toFixed(1)}`
  )
  player.dispose()
  race.dispose()
}))

// 22. Avoidance arithmetic never produces NaN/Infinity.
test('avoidance never generates NaN or Infinity', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  for (const dt of [0, -0.016, NaN, 1 / 30, 1 / 120]) {
    race.updateGhost(dt)
    finiteGhost(race, `dt=${dt}`)
  }
  // Degenerate obstacle data must not break planning either.
  race.obstacles = [
    { mesh: null, progress: NaN, lateralOffset: 0, halfWidth: 1, halfDepth: 1, hit: false },
    { mesh: null, progress: 400, lateralOffset: NaN, halfWidth: 1, halfDepth: 1, hit: false },
  ]
  race.updateGhost(1 / 60)
  finiteGhost(race, 'degenerate obstacles')
  player.dispose()
  race.dispose()
}))

// 23. Large dt stays stable and bounded.
test('avoidance survives a frame hitch', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(0, 2)
  race.obstacles = [zombie(220, GHOST_PREFERRED_LANE)]
  race.ghostPathProgress = 150
  race.ghostSpeed = 35
  const d0 = race.ghostLateralOffset
  race.updateGhost(0.5)
  finiteGhost(race, 'hitch')
  assert.ok(
    Math.abs(race.ghostLateralOffset - d0) <=
      GHOST_LATERAL_MAX_SPEED * 0.1 + 1e-6,
    'lateral step bounded by the hitch clamp'
  )
  player.dispose()
  race.dispose()
}))

// 24. The ghost still finishes after real obstacle interactions.
test('ghost finishes a race with obstacle interactions', () => withStubs(() => {
  const { track, player, race } = makeRace()
  const finish = track.getFinishDistance()
  player.placeAt(50, 2)
  // Deterministic mid-density field across both lanes.
  const field = []
  const lanes = [-3, 0, 3, -1.5, 1.5, -3, 0.5, 3]
  for (let i = 0; i < 8; i++) {
    field.push(zombie(150 + i * (finish - 250) / 7, lanes[i % lanes.length]))
  }
  race.obstacles = field
  race.ghostPathProgress = 60
  race.ghostSpeed = 30
  let steps = 0
  for (steps = 0; steps < 12000 && race.ghostPathProgress < finish; steps++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (steps % 30 === 0) {
      finiteGhost(race, `race frame ${steps}`)
      const solved = track.toTrack(race.ghostCar.position)
      assert.ok(Math.abs(solved.s - race.ghostPathProgress) < 0.1,
        'ghost stays on the correct section through the returning corner')
      assert.ok(Math.abs(solved.d) <= GHOST_AVOID_LANE_BOUND + 0.1,
        'ghost remains inside the racing surface')
      const frame = track.sampleAt(solved.s)
      const d = race.ghostCar.position.clone().sub(frame.position).dot(frame.lateral)
      assert.ok(Math.abs(d - race.ghostLateralOffset) < 0.01,
        'ghost world pose agrees with collision coordinates')
    }
  }
  assert.ok(
    race.ghostPathProgress >= finish,
    `ghost finished s=${race.ghostPathProgress.toFixed(0)}`
  )
  finiteGhost(race, 'finish')
  player.dispose()
  race.dispose()
}), { timeout: 120000 })
