import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import { asTrack, createDefaultTrack } from '../../src/levels/highway/track.js'
import {
  HighwayRaceController, GHOST_PREFERRED_LANE, GHOST_BUMP_INITIAL_DELAY,
  GHOST_BUMP_COOLDOWN, GHOST_BUMP_SETUP_TIME, GHOST_BUMP_DURATION,
  GHOST_BUMP_LATERAL_SPEED, GHOST_BUMP_MAX_IMPULSE, GHOST_BUMP_SPEED_LOSS,
} from '../../src/levels/highway/race.js'

function fixture(fn, track = asTrack([new THREE.Vector3(), new THREE.Vector3(0, 0, -2000)])) {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = {
    createElement: () => ({ style: {}, remove() {} }),
    body: { appendChild() {} },
  }
  const player = new HighwayCarController(new THREE.Object3D(), new THREE.PerspectiveCamera(), track)
  const race = new HighwayRaceController(player, new THREE.Object3D(), 0, 'TEST GHOST', null,
    new THREE.Scene(), track, null, track.totalLength)
  race.raceStarted = race.finishedCountdown = true
  player.setDrivingEnabled(true)
  player.obstacles = race.obstacles = []
  player.placeAt(400, 2)
  player.velocity.copy(player.forwardVector()).multiplyScalar(40)
  player.speed = 40
  player.keys = { KeyW: true }
  race.ghostPathProgress = 400
  race.ghostSpeed = 40
  race.seatGhostFromTrack()
  const tick = (dt = 1 / 60) => { player.update(dt); race.update(dt) }
  try { fn({ player, race, track, tick }) } finally {
    race.dispose()
    player.dispose()
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
}

const obstacle = (s, d) => ({ progress: s, lateralOffset: d, halfWidth: 0.7, halfDepth: 0.7 })

test('initial delay, visible setup and cooldown prevent constant aggression', () => fixture(({ race }) => {
  assert.equal(race.ghostBumpCooldown, GHOST_BUMP_INITIAL_DELAY)
  for (let i = 0; i < 5 * 60; i++) race.updateGhostBump(1 / 60)
  assert.equal(race.ghostBumpPhase, 'idle')
  for (let i = 0; i < 62; i++) race.updateGhostBump(1 / 60)
  assert.equal(race.ghostBumpPhase, 'setup')
  assert.equal(race.ghostBumpTargetD, GHOST_PREFERRED_LANE + 0.25)
  for (let i = 0; i < Math.ceil(GHOST_BUMP_SETUP_TIME * 60); i++) race.updateGhostBump(1 / 60)
  assert.equal(race.ghostBumpPhase, 'bump')
  for (let i = 0; i < Math.ceil(GHOST_BUMP_DURATION * 60) + 1; i++) race.updateGhostBump(1 / 60)
  assert.equal(race.ghostBumpPhase, 'idle', 'missed attempts time out')
  assert.ok(race.ghostBumpCooldown > GHOST_BUMP_COOLDOWN - 0.1)
  for (let i = 0; i < 9 * 60; i++) race.updateGhostBump(1 / 60)
  assert.equal(race.ghostBumpPhase, 'idle')
  for (let i = 0; i < 62; i++) race.updateGhostBump(1 / 60)
  assert.equal(race.ghostBumpPhase, 'setup', 'next safe opportunity only after cooldown')
}))

for (const fps of [30, 60, 120]) {
  test(`controlled side bump at ${fps} FPS costs a little pace then recovers`, () => fixture(({ player, race, tick }) => {
    race.ghostBumpCooldown = 0
    let hit = false
    for (let i = 0; i < 3 * fps; i++) {
      const beforeD = race.ghostLateralOffset
      tick(1 / fps)
      if (race.ghostBumpPhase !== 'idle') {
        assert.ok(Math.abs(race.ghostLateralOffset - beforeD) <= GHOST_BUMP_LATERAL_SPEED / fps + 1e-8)
      }
      if (race.carCollisionCooldown > 0) {
        hit = true
        assert.equal(race.ghostBumpPhase, 'idle', 'contact ends the attack immediately')
        assert.equal(race.ghostBumpCooldown, GHOST_BUMP_COOLDOWN)
        assert.ok(Math.abs(player.speed - 40 * (1 - GHOST_BUMP_SPEED_LOSS)) < 0.15,
          `small speed reduction: ${player.speed}`)
        assert.ok(Math.abs(player.velocity.dot(player.rightVector())) <= GHOST_BUMP_MAX_IMPULSE)
        assert.ok(Math.abs(player.yawRate) <= 0.08)
        assert.ok(player.canDrive && !player.hasCrashed)
        break
      }
    }
    assert.ok(hit, 'real swept collision, not an artificial damage trigger')
    const progress = race.ghostPathProgress
    for (let i = 0; i < 3 * fps; i++) tick(1 / fps)
    assert.ok(race.ghostPathProgress > progress + 80, 'ghost keeps racing')
    assert.ok(Math.abs(race.ghostLateralOffset - GHOST_PREFERRED_LANE) < 0.1, 'normal lane recovery')
    assert.equal(race.ghostBumpPhase, 'idle')
  }))
}

const unsafeCases = {
  'near road edge': ({ player }) => { player.placeAt(400, 3.5); player.velocity.copy(player.forwardVector()).multiplyScalar(40) },
  'player drifting': ({ player }) => { player.isDrifting = true },
  'player facing across the road': ({ player }) => { player.heading += 0.4 },
  'longitudinal gap': ({ race }) => { race.ghostPathProgress -= 8 },
  'large speed difference': ({ race }) => { race.ghostSpeed = 30 },
  'player stopped': ({ player }) => { player.velocity.set(0, 0, 0) },
  'ongoing contact': ({ race }) => { race.carContactActive = true },
  'obstacle recovery': ({ race }) => { race.ghostObstacleCooldowns.set({}, 0.1) },
  'active avoidance': ({ race }) => { race.ghostAvoiding = true },
  'outward shove corridor blocked': ({ player }) => { player.obstacles = [obstacle(450, 3.5)] },
  'obstacle just behind player': ({ race }) => { race.obstacles = [obstacle(395, 2)] },
  'ghost return lane blocked': ({ race }) => { race.obstacles = [obstacle(450, -2)] },
  'near finish': ({ race }) => { race.finishDistance = 450 },
  'race frozen': ({ race }) => { race.frozen = true },
  'race not started': ({ race }) => { race.raceStarted = false },
}
for (const [name, mutate] of Object.entries(unsafeCases)) {
  test(`no intentional bump when ${name}`, () => fixture(state => {
    state.race.ghostBumpCooldown = 0
    mutate(state)
    state.race.updateGhostBump(1 / 60)
    assert.equal(state.race.ghostBumpPhase, 'idle')
  }))
}

test('real circuit straights permit aggression but upcoming bends veto it', () => fixture(({ player, race }) => {
  assert.equal(race.canGhostBump(true), true, 'back straight at s=400')
  player.placeAt(540, 2)
  player.velocity.copy(player.forwardVector()).multiplyScalar(40)
  race.ghostPathProgress = 540
  assert.equal(race.canGhostBump(true), false, 'corner entry is reserved for normal racing')
}, createDefaultTrack()))

test('new obstacle cancels an active attempt and existing avoidance takes priority', () => fixture(({ player, race, tick }) => {
  race.ghostBumpCooldown = 0
  tick()
  assert.equal(race.ghostBumpPhase, 'setup')
  race.obstacles = player.obstacles = [obstacle(race.ghostPathProgress + 30, -2)]
  tick()
  assert.equal(race.ghostBumpPhase, 'idle')
  assert.equal(race.ghostAvoiding, true)
  assert.ok(Math.abs(race.ghostAvoidanceTargetD - -2) >= 2.2 - 1e-8,
    'normal avoidance selected a lane that clears the obstacle')
  assert.ok(race.ghostBumpCooldown > 9)
  for (let i = 0; i < 150; i++) tick()
  assert.ok(race.ghostPathProgress > race.obstacles[0].progress + 20)
  assert.ok(race.ghostSpeed > 18, 'ghost navigated instead of driving through the obstacle')
}))

test('player can evade; newly unsafe player-side obstacles and hitches abort attempts', () => {
  for (const [cancel, dt] of [
    [({ player }) => { player.placeAt(400, 3); player.velocity.copy(player.forwardVector()).multiplyScalar(40) }, 1 / 60],
    [({ player }) => { player.obstacles = [obstacle(430, 3.5)] }, 1 / 60],
    [() => {}, 0.2],
  ]) fixture(state => {
    const { race } = state
    race.ghostBumpCooldown = 0
    race.updateGhostBump(1 / 60)
    assert.equal(race.ghostBumpPhase, 'setup')
    cancel(state)
    race.updateGhostBump(dt)
    assert.equal(race.ghostBumpPhase, 'idle')
    assert.equal(race.ghostBumpCooldown, GHOST_BUMP_COOLDOWN)
  })
})

test('sustained contact cannot retrigger impacts after the short collision cooldown', () => fixture(({ player, race }) => {
  const overlap = () => {
    player.placeAt(400, 0.2)
    player.velocity.copy(player.forwardVector()).multiplyScalar(40)
    race.ghostPathProgress = 400
    race.ghostLateralOffset = -2
    race.ghostLateralVelocity = 1.8
    race.ghostSpeed = 40
    race.seatGhostFromTrack()
    race.lastPlayerCollisionPos = player.car.position.clone()
    race.lastGhostCollisionPos = race.ghostCar.position.clone()
  }
  overlap()
  race.ghostBumpPhase = 'bump'
  race.updateCarCollision(1 / 60)
  assert.ok(race.carContactActive)
  assert.ok(player.speed < 40)
  for (let i = 0; i < 120; i++) {
    overlap()
    const before = player.velocity.clone()
    race.updateCarCollision(1 / 60)
    assert.ok(player.velocity.distanceTo(before) < 1e-8, 'separation only, no stacked impulses')
  }
  player.placeAt(420, 2)
  race.updateCarCollision(1 / 60)
  race.updateCarCollision(1 / 60)
  assert.equal(race.carContactActive, false, 'real separation releases the contact latch')
  overlap()
  race.updateCarCollision(1 / 60)
  assert.ok(race.carCollisionCooldown > 0, 'a genuinely new collision still responds')
}))
