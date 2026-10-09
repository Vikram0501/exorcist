import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  GHOST_PREFERRED_LANE,
  GHOST_MAX_SPEED,
  GHOST_ACCELERATION,
  GHOST_HIT_RECOVERY_ACCELERATION,
  GHOST_PLAYER_HIT_COOLDOWN,
  GHOST_HIT_RECOVERY_DURATION,
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

function parkGhost(race, s, d, speed) {
  race.ghostPathProgress = s
  race.ghostLateralOffset = d
  race.ghostSpeed = speed
  race.ghostLateralVelocity = 0
  race.ghostPlayerHitCooldown = 0
  race.ghostHitRecoveryTimer = 0
  race.carCollisionCooldown = 0
  race.carContactActive = false
  race.lastPlayerCollisionPos = null
  race.lastGhostCollisionPos = null
  race.seatGhostFromTrack()
}

function drivePlayerIntoGhost(player, race, playerS, playerD, playerSpeed, ghostS, ghostD, ghostSpeed, frames = 120) {
  player.placeAt(playerS, playerD)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * playerSpeed, 0, f.z * playerSpeed)
  parkGhost(race, ghostS, ghostD, ghostSpeed)
  let hitFrame = -1
  let before = 0
  let after = 0
  let hitCooldown = 0
  let recovery = 0
  for (let i = 0; i < frames; i++) {
    player.keys = { KeyW: true }
    const ghostBefore = race.ghostSpeed
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0 && hitFrame < 0) {
      hitFrame = i
      before = ghostBefore
      after = race.ghostSpeed
      hitCooldown = race.ghostPlayerHitCooldown
      recovery = race.ghostHitRecoveryTimer
      break
    }
  }
  return { hitFrame, before, after, hitCooldown, recovery }
}

// 1. Rear-end: player behind, faster, same lane.
test('player rear-ending ghost applies bounded slowdown without boosting ghost', () => withStubs(() => {
  const { player, race } = makeRace()
  const { hitFrame, before, after, hitCooldown, recovery } = drivePlayerIntoGhost(
    player, race, 40, GHOST_PREFERRED_LANE, 35, 50, GHOST_PREFERRED_LANE, 20
  )
  assert.ok(hitFrame >= 0, 'contact happened')
  assert.ok(after < before, `ghost slowed ${before.toFixed(1)} -> ${after.toFixed(1)}`)
  const loss = (before - after) / before
  assert.ok(loss >= 0.06 - 1e-9 && loss <= 0.18 + 1e-9, `bounded loss 6-18%, got ${(loss * 100).toFixed(1)}%`)
  assert.equal(race.ghostMaxSpeed, GHOST_MAX_SPEED, 'max speed untouched')
  assert.ok(hitCooldown > 0, 'damage cooldown armed')
  assert.ok(recovery > 0, 'recovery window armed')
  assert.ok(Number.isFinite(race.ghostLateralOffset), 'lateral state finite')
  player.dispose()
  race.dispose()
}))

// 2. Side swipe costs less than a direct ram but is still noticeable.
test('side swipe slows ghost less than direct rear-end', () => withStubs(() => {
  const runSide = () => {
    const { player, race } = makeRace()
    // Player offset to the side, aimed to sideswipe: ghost holds its lane.
    player.placeAt(40, 0.5)
    const f = player.forwardVector(new THREE.Vector3())
    player.velocity.set(f.x * 30, 0, f.z * 30)
    parkGhost(race, 44, GHOST_PREFERRED_LANE, 25)
    let loss = 0
    for (let i = 0; i < 120; i++) {
      player.keys = { KeyA: true, KeyW: true }
      const before = race.ghostSpeed
      player.update(1 / 60)
      race.update(1 / 60)
      if (race.carCollisionCooldown > 0) {
        loss = Math.max(loss, (before - race.ghostSpeed) / before)
        break
      }
    }
    player.dispose()
    race.dispose()
    return loss
  }
  const { player, race } = makeRace()
  const ram = drivePlayerIntoGhost(player, race, 40, GHOST_PREFERRED_LANE, 35, 50, GHOST_PREFERRED_LANE, 20)
  const ramLoss = (ram.before - ram.after) / ram.before
  player.dispose()
  race.dispose()
  const sideLoss = runSide()
  assert.ok(sideLoss > 0.02, `side swipe noticeable, got ${(sideLoss * 100).toFixed(1)}%`)
  assert.ok(sideLoss <= ramLoss + 1e-9, `glancing hit ${sideLoss.toFixed(3)} <= ram ${ramLoss.toFixed(3)}`)
}))

// 3. Ghost rear-ending player preserves fair reciprocal behaviour.
test('ghost-initiated rear-end does not trigger player-hit slowdown', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 15, 0, f.z * 15)
  parkGhost(race, 32, GHOST_PREFERRED_LANE, 35)
  let kicked = false
  for (let i = 0; i < 60; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0) {
      kicked = true
      break
    }
  }
  assert.ok(kicked, 'contact happened')
  assert.equal(race.ghostPlayerHitCooldown, 0, 'no player-hit damage cooldown')
  assert.equal(race.ghostHitRecoveryTimer, 0, 'no slow recovery window')
  player.dispose()
  race.dispose()
}))

// 4. Damage cooldown: second hit while cooling prevents stacking.
test('player-hit damage cooldown prevents stacked slowdowns', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 50, GHOST_PREFERRED_LANE, 20)
  let firstLoss = 0
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyW: true }
    const before = race.ghostSpeed
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0) {
      firstLoss = (before - race.ghostSpeed) / before
      break
    }
  }
  assert.ok(firstLoss > 0, 'first hit applied loss')
  assert.ok(race.ghostPlayerHitCooldown > 0, 'cooldown armed')
  // Simulate a genuinely new second contact while damage cooldown still armed:
  // separate, then re-overlap with fresh swept history.
  race.carCollisionCooldown = 0
  race.carContactActive = false
  player.placeAt(60, GHOST_PREFERRED_LANE)
  player.velocity.copy(player.forwardVector(new THREE.Vector3()).multiplyScalar(35))
  race.ghostPathProgress = 64
  race.ghostLateralOffset = GHOST_PREFERRED_LANE
  race.seatGhostFromTrack()
  race.lastPlayerCollisionPos = player.car.position.clone()
  race.lastGhostCollisionPos = race.ghostCar.position.clone()
  let secondHit = false
  for (let i = 0; i < 120 && !secondHit; i++) {
    player.keys = { KeyW: true }
    const ghostBefore = race.ghostSpeed
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0) {
      secondHit = true
      // No forward boost even during cooldown, and no extra % damage.
      // Allow one frame of normal rubber-band acceleration.
      assert.ok(race.ghostSpeed <= ghostBefore + 0.3, 'no speed boost on stacked hit')
      const extraLoss = (ghostBefore - race.ghostSpeed) / ghostBefore
      assert.ok(extraLoss < 0.02, `no stacked damage, got ${(extraLoss * 100).toFixed(1)}%`)
    }
  }
  assert.ok(secondHit, 'second contact registered')
  player.dispose()
  race.dispose()
}))

// 5. Gradual recovery, never instant, max unchanged.
test('ghost recovers gradually after player bump', () => withStubs(() => {
  const { player, race } = makeRace()
  const { hitFrame } = drivePlayerIntoGhost(
    player, race, 40, GHOST_PREFERRED_LANE, 35, 50, GHOST_PREFERRED_LANE, 20
  )
  assert.ok(hitFrame >= 0, 'contact happened')
  const slowed = race.ghostSpeed
  assert.ok(race.ghostHitRecoveryTimer > 0)
  // Park player far away so rubber band wants max chase pace.
  player.placeAt(0, 2)
  player.velocity.set(0, 0, 0)
  const samples = []
  for (let i = 0; i < 60; i++) {
    player.keys = {}
    player.update(1 / 60)
    const before = race.ghostSpeed
    race.update(1 / 60)
    samples.push(race.ghostSpeed - before)
  }
  const firstStep = samples[0]
  assert.ok(firstStep >= 0 && firstStep <= GHOST_HIT_RECOVERY_ACCELERATION / 60 + 1e-9,
    `capped recovery accel, step=${firstStep.toFixed(4)}`)
  assert.ok(firstStep < GHOST_ACCELERATION / 60 - 1e-9, 'slower than normal acceleration')
  assert.ok(race.ghostSpeed > slowed, 'speed rebuilt over time, not instantly')
  assert.equal(race.ghostMaxSpeed, GHOST_MAX_SPEED, 'max never reduced')
  // After recovery window, full acceleration resumes.
  for (let i = 0; i < Math.ceil(GHOST_HIT_RECOVERY_DURATION * 60) + 5; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.equal(race.ghostHitRecoveryTimer, 0, 'recovery window expires')
  player.dispose()
  race.dispose()
}))

// 6. Ghost still avoids obstacles after being bumped.
test('ghost avoids obstacles after player bump', () => withStubs(() => {
  const { player, race } = makeRace()
  const obs = { mesh: null, progress: 200, lateralOffset: GHOST_PREFERRED_LANE, halfWidth: 0.7, halfDepth: 0.7, hit: false }
  race.obstacles = [obs]
  player.obstacles = []
  const { hitFrame } = drivePlayerIntoGhost(
    player, race, 40, GHOST_PREFERRED_LANE, 35, 50, GHOST_PREFERRED_LANE, 20
  )
  assert.ok(hitFrame >= 0, 'bump happened')
  // Drive ghost toward obstacle; player parked far so rubber band is steady.
  player.placeAt(0, 2)
  player.velocity.set(0, 0, 0)
  race.ghostPathProgress = 150
  race.ghostSpeed = 30
  let avoided = false
  for (let i = 0; i < 300; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.ghostAvoiding) avoided = true
  }
  assert.ok(avoided, 'avoidance still engages after bump')
  assert.ok(race.ghostPathProgress > obs.progress + 5, 'ghost navigated past obstacle')
  player.dispose()
  race.dispose()
}))

// 7. Repeated bumps cannot pin the ghost; race still progresses.
test('repeated player bumps do not stop race progress', () => withStubs(() => {
  const { track, player, race } = makeRace()
  const finish = track.getFinishDistance()
  player.placeAt(100, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  race.ghostPathProgress = 104
  race.ghostSpeed = 20
  race.ghostLateralOffset = GHOST_PREFERRED_LANE
  race.seatGhostFromTrack()
  const ghostStart = race.ghostPathProgress
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }
  for (let i = 0; i < 600; i++) {
    // Player chases ghost down the track.
    const look = track.sampleAt(Math.min(finish, player.pathProgress + 20)).position
    const err = wrap(Math.atan2(look.x - player.car.position.x, look.z - player.car.position.z) - player.heading)
    player.keys = { KeyW: true }
    if (err > 0.02) player.keys.KeyA = true
    else if (err < -0.02) player.keys.KeyD = true
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.raceFinished) break
  }
  assert.ok(race.ghostPathProgress > ghostStart + 60, 'ghost kept racing despite contact')
  assert.ok(Number.isFinite(race.ghostSpeed) && race.ghostSpeed >= 0, 'speed stayed sane')
  assert.ok(player.canDrive || race.raceFinished, 'player not unfairly killed by own bump')
  player.dispose()
  race.dispose()
}), { timeout: 120000 })
