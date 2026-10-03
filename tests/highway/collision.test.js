import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  CAR_COLLISION_COOLDOWN,
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
  // Skip the countdown deterministically: race is live, player can drive.
  race.time = 4
  race.finishedCountdown = true
  race.raceStarted = true
  player.setDrivingEnabled(true)
  return { track, player, race }
}

// Park the ghost at an exact track state and reseed swept history.
function parkGhost(race, s, d, speed) {
  race.ghostPathProgress = s
  race.ghostLateralOffset = d
  race.ghostSpeed = speed
  race.ghostLateralVelocity = 0
  race.carCollisionCooldown = 0
  race.lastPlayerCollisionPos = null
  race.lastGhostCollisionPos = null
  race.seatGhostFromTrack()
}

function carGap(player, race) {
  return player.car.position.distanceTo(race.ghostCar.position)
}

function finiteRace(player, race, label) {
  for (const v of [
    player.car.position.x, player.car.position.z,
    player.velocity.x, player.velocity.z,
    player.heading, player.yawRate, player.speed,
    race.ghostSpeed, race.ghostLateralOffset,
    race.ghostLateralVelocity, race.ghostPathProgress,
    race.ghostCar.position.x, race.ghostCar.position.z,
  ]) {
    assert.ok(Number.isFinite(v), `${label}: finite, got ${v}`)
  }
}

// 1. No pass-through: a slower ghost ahead in-lane cannot be driven through.
test('player cannot pass through the ghost', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 30, 0, f.z * 30)
  parkGhost(race, 48, GHOST_PREFERRED_LANE, 20)
  let minGap = Infinity
  for (let i = 0; i < 180; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    minGap = Math.min(minGap, carGap(player, race))
  }
  assert.ok(
    minGap > 1.5,
    `cars never interpenetrate, minGap=${minGap.toFixed(2)}`
  )
  finiteRace(player, race, 'no pass-through')
  player.dispose()
  race.dispose()
}))

// 2. Rear-ending costs the player pace (velocity, not the stale scalar).
// Kick-anchored: setups are identical until the first kick, so the
// measured drop is contact, not rubber-band drift. (Start straight:
// flat, unbanked, so straight-line runs stay on the road.)
test('player rear-ending ghost loses pace', () => withStubs(() => {
  const run = (ghostS) => {
    const { player, race } = makeRace()
    player.placeAt(40, GHOST_PREFERRED_LANE)
    const f = player.forwardVector(new THREE.Vector3())
    player.velocity.set(f.x * 35, 0, f.z * 35)
    parkGhost(race, ghostS, GHOST_PREFERRED_LANE, 20)
    let kickFrame = -1
    let preSpeed = 0
    let postSpeed = 0
    for (let i = 0; i < 120; i++) {
      player.keys = { KeyW: true }
      const before = player.velocity.length()
      player.update(1 / 60)
      race.update(1 / 60)
      if (race.carCollisionCooldown > 0 && kickFrame < 0) {
        kickFrame = i
        preSpeed = before
      }
      if (kickFrame >= 0 && i === kickFrame + 10) {
        postSpeed = player.velocity.length()
      }
    }
    const out = { kickFrame, preSpeed, postSpeed }
    player.dispose()
    race.dispose()
    return out
  }
  // Ghost 10 m ahead, slower: contact is inevitable.
  const hit = run(50)
  assert.ok(hit.kickFrame >= 0, 'precondition: contact happened')
  assert.ok(
    hit.postSpeed < hit.preSpeed - 2,
    `contact costs pace ${hit.preSpeed.toFixed(1)} -> ${hit.postSpeed.toFixed(1)}`
  )
  // Ghost far ahead at the same speed: out of reach, never touched.
  const free = run(200)
  assert.equal(free.kickFrame, -1, 'control run stays contact-free')
}))

// 3. The ghost is affected by being rear-ended: the kick's slow factor
// dominates instantly, before the rubber band rebuilds its speed.
test('player rear-ending ghost slows the ghost', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 50, GHOST_PREFERRED_LANE, 20)
  let kicked = false
  for (let i = 0; i < 120 && !kicked; i++) {
    player.keys = { KeyW: true }
    const before = race.ghostSpeed
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0.2) {
      kicked = true
      assert.ok(
        race.ghostSpeed < before - 0.3,
        `kick slows ghost ${before.toFixed(1)} -> ${race.ghostSpeed.toFixed(1)}`
      )
    }
  }
  assert.ok(kicked, 'precondition: contact happened')
  player.dispose()
  race.dispose()
}))

// 4. A fast ghost rear-ending the player shoves the player forward.
test('ghost rear-ending player affects player velocity', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 15, 0, f.z * 15)
  parkGhost(race, 32, GHOST_PREFERRED_LANE, 35)
  const before = player.velocity.length()
  for (let i = 0; i < 60; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.ok(
    player.velocity.length() > before + 1,
    `player shoved ${before.toFixed(1)} -> ${player.velocity.length().toFixed(1)}`
  )
  finiteRace(player, race, 'ghost rear-end')
  player.dispose()
  race.dispose()
}))

// 5. Side contact pushes the player laterally.
test('side contact pushes player laterally', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, 0.5)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 30, 0, f.z * 30)
  parkGhost(race, 40, GHOST_PREFERRED_LANE, 30)
  const before = player.lateralOffset
  let kicked = false
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyA: true, KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0) kicked = true
  }
  assert.ok(kicked, 'side contact engaged')
  assert.ok(
    Math.abs(player.lateralOffset - before) > 0.5,
    `player displaced ${before.toFixed(2)} -> ${player.lateralOffset.toFixed(2)}`
  )
  player.dispose()
  race.dispose()
}))

// 6. Side contact displaces the ghost laterally.
test('side contact displaces ghost laterally', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, 0.5)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 30, 0, f.z * 30)
  parkGhost(race, 40, GHOST_PREFERRED_LANE, 30)
  let maxOffset = Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE)
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyA: true, KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    maxOffset = Math.max(
      maxOffset,
      Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE)
    )
  }
  assert.ok(
    maxOffset > 0.3,
    `ghost shoved off its lane by ${maxOffset.toFixed(2)}m`
  )
  player.dispose()
  race.dispose()
}))

// 7. The ghost eases back to its lane gradually, never snapping.
test('ghost gradually returns toward its preferred lane', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, 0.5)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 30, 0, f.z * 30)
  parkGhost(race, 40, GHOST_PREFERRED_LANE, 30)
  for (let i = 0; i < 60; i++) {
    player.keys = { KeyA: true, KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
  }
  const displaced = Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE)
  assert.ok(displaced > 0.2, `precondition: shoved, off=${displaced.toFixed(2)}`)
  // Hands off: ghost races on while its lane re-centres progressively.
  let maxStep = 0
  let prev = race.ghostLateralOffset
  for (let i = 0; i < 240; i++) {
    player.keys = {}
    player.update(1 / 60)
    race.update(1 / 60)
    maxStep = Math.max(maxStep, Math.abs(race.ghostLateralOffset - prev))
    prev = race.ghostLateralOffset
  }
  assert.ok(maxStep < 0.2, `no snap, maxStep=${maxStep.toFixed(3)}`)
  assert.ok(
    Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE) < 0.1,
    `recovered to ${race.ghostLateralOffset.toFixed(3)}`
  )
  player.dispose()
  race.dispose()
}))

// 8. Contact alone never kills the player.
test('contact does not instantly kill the player', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 46, GHOST_PREFERRED_LANE, 20)
  let kicked = false
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.carCollisionCooldown > 0) kicked = true
  }
  assert.ok(kicked, 'precondition: contact happened')
  assert.ok(player.canDrive, 'player still driving after pure car contact')
  finiteRace(player, race, 'non-lethal contact')
  player.dispose()
  race.dispose()
}))

// 9. A shove into a lethal obstacle triggers the EXISTING crash logic.
test('ghost can push the player into a lethal obstacle', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, 0.5)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 25, 0, f.z * 25)
  player.obstacles = [{
    mesh: null, progress: 41, lateralOffset: -1.5,
    halfWidth: 1.2, halfDepth: 1.0, hit: false,
  }]
  let crashed = null
  player.onCrash = (hit) => { crashed = hit }
  // Ghost to the player's right, overlapping: shoves player left.
  player.update(1 / 60)
  race.ghostPathProgress = player.pathProgress
  race.ghostLateralOffset = 2.5
  race.ghostSpeed = 30
  race.ghostLateralVelocity = 0
  race.carCollisionCooldown = 0
  race.lastPlayerCollisionPos = null
  race.lastGhostCollisionPos = null
  race.seatGhostFromTrack()
  for (let i = 0; i < 90 && player.canDrive; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.equal(player.canDrive, false, 'existing crash logic fired')
  assert.ok(crashed, 'onCrash fired with the lethal obstacle')
  player.dispose()
  race.dispose()
}))

// 10. A light tap costs pace but never stops either car.
test('small contact does not stop both cars', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 26, 0, f.z * 26)
  parkGhost(race, 46, GHOST_PREFERRED_LANE, 24)
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.ok(
    player.velocity.length() > 10,
    `player still rolling ${player.velocity.length().toFixed(1)}`
  )
  assert.ok(
    race.ghostSpeed > 10,
    `ghost still rolling ${race.ghostSpeed.toFixed(1)}`
  )
  finiteRace(player, race, 'light tap')
  player.dispose()
  race.dispose()
}))

// 11. Harder contact produces a stronger response than a tiny tap.
test('harder contact produces stronger response', () => withStubs(() => {
  const run = (playerSpeed, ghostSpeed) => {
    const { player, race } = makeRace()
    player.placeAt(40, GHOST_PREFERRED_LANE)
    const f = player.forwardVector(new THREE.Vector3())
    player.velocity.set(f.x * playerSpeed, 0, f.z * playerSpeed)
    parkGhost(race, 46, GHOST_PREFERRED_LANE, ghostSpeed)
    let maxKick = 0
    const v0 = player.velocity.length()
    for (let i = 0; i < 60; i++) {
      player.keys = { KeyW: true }
      player.update(1 / 60)
      const before = player.velocity.length()
      race.update(1 / 60)
      if (race.carCollisionCooldown > 0) {
        maxKick = Math.max(maxKick, Math.abs(player.velocity.length() - v0))
      }
      void before
    }
    const out = { maxKick, endSpeed: player.velocity.length() }
    player.dispose()
    race.dispose()
    return out
  }
  const soft = run(26, 24)
  const hard = run(35, 20)
  assert.ok(
    hard.maxKick > soft.maxKick + 1,
    `hard kick ${hard.maxKick.toFixed(1)} > soft ${soft.maxKick.toFixed(1)}`
  )
}))

// 12. Full-race contact chaos stays finite.
test('collision never generates NaN or Infinity', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 44, GHOST_PREFERRED_LANE, 20)
  for (let i = 0; i < 300; i++) {
    player.keys = i % 2 ? { KeyW: true, KeyA: true } : { KeyW: true, KeyD: true }
    player.update(1 / 60)
    race.update(1 / 60)
    if (i % 30 === 0) finiteRace(player, race, `chaos frame ${i}`)
  }
  finiteRace(player, race, 'chaos end')
  player.dispose()
  race.dispose()
}))

// 13. Side-by-side rubbing does not jitter: lateral motion stays smooth.
test('cars do not violently jitter while touching', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, -0.4)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 30, 0, f.z * 30)
  parkGhost(race, 40, GHOST_PREFERRED_LANE, 30)
  // Settle into rubbing contact, then measure the steady phase.
  for (let i = 0; i < 60; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
  }
  let maxStep = 0
  let prev = player.lateralOffset
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    // Ignore the single kick frame itself (cooldown just armed).
    if (race.carCollisionCooldown < CAR_COLLISION_COOLDOWN - 1 / 60) {
      maxStep = Math.max(maxStep, Math.abs(player.lateralOffset - prev))
    }
    prev = player.lateralOffset
  }
  assert.ok(
    maxStep < 0.35,
    `rubbing stays smooth, max lateral step=${maxStep.toFixed(3)}`
  )
  finiteRace(player, race, 'rubbing')
  player.dispose()
  race.dispose()
}))

// 14. Drifting through the ghost stays stable and separated.
test('collision remains stable during player drift', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 32, 0, f.z * 32)
  parkGhost(race, 46, GHOST_PREFERRED_LANE, 26)
  let minGap = Infinity
  for (let i = 0; i < 120; i++) {
    player.keys = { KeyW: true, KeyA: true, Space: true }
    player.update(1 / 60)
    race.update(1 / 60)
    minGap = Math.min(minGap, carGap(player, race))
    if (i % 20 === 0) finiteRace(player, race, `drift frame ${i}`)
  }
  assert.ok(minGap > 1.2, `no deep interpenetration, minGap=${minGap.toFixed(2)}`)
  finiteRace(player, race, 'drift contact')
  player.dispose()
  race.dispose()
}))

// 15. A frame hitch mid-contact stays finite and attached.
test('collision remains stable during a frame hitch', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 30, 0, f.z * 30)
  parkGhost(race, 43, GHOST_PREFERRED_LANE, 25)
  player.update(0.5)
  race.update(0.5)
  finiteRace(player, race, 'hitch contact')
  assert.ok(
    carGap(player, race) < 30,
    'cars stay attached after the hitch'
  )
  player.dispose()
  race.dispose()
}))

// 16. The ghost cannot be shoved permanently off the road.
test('ghost cannot be pushed outside road bounds', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, 3.5)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 40, 4.5, 30)
  for (let i = 0; i < 180; i++) {
    player.keys = { KeyD: true, KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    assert.ok(
      Math.abs(race.ghostLateralOffset) <= 6.01,
      `ghost contained, off=${race.ghostLateralOffset.toFixed(2)}`
    )
  }
  finiteRace(player, race, 'ghost bounds')
  player.dispose()
  race.dispose()
}))

// 17. The player cannot pin the ghost: it keeps racing out of contact.
test('player cannot permanently pin the ghost', () => withStubs(() => {
  const { player, race } = makeRace()
  player.placeAt(40, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 44, GHOST_PREFERRED_LANE, 20)
  const ghostStart = race.ghostPathProgress
  for (let i = 0; i < 300; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
  }
  assert.ok(
    race.ghostPathProgress > ghostStart + 60,
    `ghost raced on ${ghostStart.toFixed(0)} -> ${race.ghostPathProgress.toFixed(0)}`
  )
  finiteRace(player, race, 'no pin')
  player.dispose()
  race.dispose()
}))

// 18. The ghost still finishes after taking contact.
test('ghost remains capable of finishing after collision', () => withStubs(() => {
  const { track, player, race } = makeRace()
  const finish = track.getFinishDistance()
  player.placeAt(100, GHOST_PREFERRED_LANE)
  const f = player.forwardVector(new THREE.Vector3())
  player.velocity.set(f.x * 35, 0, f.z * 35)
  parkGhost(race, 104, GHOST_PREFERRED_LANE, 20)
  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI
    while (a < -Math.PI) a += 2 * Math.PI
    return a
  }
  let t = 0
  // Player rams the ghost early, then both race on cleanly.
  for (let i = 0; i < 90; i++) {
    player.keys = { KeyW: true }
    player.update(1 / 60)
    race.update(1 / 60)
    t += 1 / 60
  }
  let steps = 0
  for (steps = 0; steps < 12000 && race.ghostPathProgress < finish; steps++) {
    const look = track.sampleAt(
      Math.min(finish, player.pathProgress + 20)
    ).position
    const err = wrap(Math.atan2(
      look.x - player.car.position.x, look.z - player.car.position.z
    ) - player.heading)
    player.keys = { KeyW: true }
    if (err > 0.02) player.keys.KeyA = true
    else if (err < -0.02) player.keys.KeyD = true
    player.update(1 / 60)
    race.update(1 / 60)
    if (race.raceFinished) break
  }
  assert.ok(
    race.ghostPathProgress >= finish || race.raceFinished,
    `ghost finished s=${race.ghostPathProgress.toFixed(0)}`
  )
  finiteRace(player, race, 'ghost finishes')
  player.dispose()
  race.dispose()
}), { timeout: 120000 })
