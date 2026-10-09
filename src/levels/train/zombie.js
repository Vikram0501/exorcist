import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'

const AISLE_X = 2.9
const FALLBACK_LANE_MIN = 2.55
const FALLBACK_LANE_MAX = 3.05
const CORRIDOR_STEP = 0.25
const CORRIDOR_X_MIN = 0.9
const CORRIDOR_X_MAX = 4.6
const CORRIDOR_X_STEP = 0.1
const CORRIDOR_SPREAD = 0.75
const CORRIDOR_BOTTOM = 0.72
const CORRIDOR_TOP = 1.18
const CORRIDOR_RADIUS = 0.2
const CORRIDOR_BINARY_STEPS = 6
const PATROL_SPEED = 1.2
const HUNT_SPEED = 2.6
const SENSE_RADIUS = 7.5
const SENSE_MOVE_SPEED = 0.5
const PATH_MARGIN = 0.2
const CATCH_RADIUS = 0.75
const CONTACT_RADIUS = 0.45
const GRAB_REACH = 0.6
const HOLD_DISTANCE = 0.4
const PROWL_SPAN = 1.5
const MEMORY_TIME = 4.5
const PATROL_PAUSE = 1.4
const EDGE_MARGIN = 3
const START_OFFSET = 2
const VISIBLE_RANGE = 40
const PROBE_RADIUS = 0.1
const FLOOR_PROBE_OFFSETS = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5]
const FLOOR_SAMPLES = 7
const FLOOR_MIN_Y = 0.2
const AISLE_RETURN = 6
const TURN_SMOOTHING = 8
const MAX_PLAYBACK_RATE = 1.6
const ORIENT_INTERVAL = 20

function probe(world, x, y, z) {
  const capsule = new Capsule(
    new THREE.Vector3(x, y - PROBE_RADIUS, z),
    new THREE.Vector3(x, y + PROBE_RADIUS, z),
    PROBE_RADIUS
  )
  return world.capsuleIntersect(capsule)
}

function surfaceAt(world, x, z) {
  let y = 3
  while (y > -1 && probe(world, x, y, z)) y -= 0.1
  if (y <= -1) return null

  let free = y
  let hit = null
  for (; y > -1; y -= 0.1) {
    if (probe(world, x, y, z)) {
      hit = y
      break
    }
    free = y
  }
  if (hit === null) return null
  for (let i = 0; i < 8; i++) {
    const middle = (free + hit) / 2
    if (probe(world, x, middle, z)) hit = middle
    else free = middle
  }
  return free - 2 * PROBE_RADIUS
}

function floorWorld(colliders) {
  return colliders?.find?.((collider) => collider.type === 'mesh')?.world || null
}

function sampleFloor(world, x, z) {
  let floor = null
  for (const offset of FLOOR_PROBE_OFFSETS) {
    const surface = surfaceAt(world, x + offset, z)
    if (surface !== null && (floor === null || surface < floor)) floor = surface
  }
  return floor
}

export function trainFloorAt(colliders, x, z) {
  const world = floorWorld(colliders)
  if (!world) return 0
  return sampleFloor(world, x, z) ?? 0
}

export function trainFloorAlong(colliders, x, minZ, maxZ) {
  const world = floorWorld(colliders)
  if (!world) return 0

  let floor = null
  for (let i = 0; i < FLOOR_SAMPLES; i++) {
    const z = minZ + ((maxZ - minZ) * i) / (FLOOR_SAMPLES - 1)
    const surface = sampleFloor(world, x, z)
    if (surface === null || surface < FLOOR_MIN_Y) continue
    if (floor === null || surface < floor) floor = surface
  }
  return floor ?? 0
}

function rotateToward(current, target, amount) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * amount
}

function corridorClear(world, x, z) {
  const capsule = new Capsule(
    new THREE.Vector3(x, CORRIDOR_BOTTOM, z),
    new THREE.Vector3(x, CORRIDOR_TOP, z),
    CORRIDOR_RADIUS
  )
  return !world.capsuleIntersect(capsule)
}

function freeRuns(world, z) {
  const runs = []
  let open = null
  for (let x = CORRIDOR_X_MIN; x <= CORRIDOR_X_MAX + 1e-9; x += CORRIDOR_X_STEP) {
    const clear = corridorClear(world, x, z)
    if (clear && open === null) open = x
    else if (!clear && open !== null) {
      runs.push([open, x - CORRIDOR_X_STEP])
      open = null
    }
  }
  if (open !== null) runs.push([open, CORRIDOR_X_MAX])
  return runs
}

// Widest clear run around one probe, then walked outward: far cheaper than
// scanning the whole carriage width at every depth sample.
function findRun(world, z, reference) {
  const centre = reference ? (reference[0] + reference[1]) / 2 : AISLE_X
  let start = null
  for (let offset = 0; offset <= CORRIDOR_X_MAX - CORRIDOR_X_MIN; offset += CORRIDOR_X_STEP) {
    const candidates = offset === 0 ? [centre] : [centre - offset, centre + offset]
    for (const x of candidates) {
      if (x < CORRIDOR_X_MIN || x > CORRIDOR_X_MAX) continue
      if (corridorClear(world, x, z)) {
        start = x
        break
      }
    }
    if (start !== null) break
  }
  if (start === null) return null

  let min = start
  let max = start
  while (min - CORRIDOR_X_STEP >= CORRIDOR_X_MIN && corridorClear(world, min - CORRIDOR_X_STEP, z)) min -= CORRIDOR_X_STEP
  while (max + CORRIDOR_X_STEP <= CORRIDOR_X_MAX && corridorClear(world, max + CORRIDOR_X_STEP, z)) max += CORRIDOR_X_STEP
  return [min, max]
}

function sharedEdge(a, b) {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0])
}

function pickRun(runs, reference) {
  if (!runs.length) return null
  const centre = (run) => (run[0] + run[1]) / 2
  if (!reference) {
    const aisle = runs.find((run) => run[0] <= AISLE_X && run[1] >= AISLE_X)
    if (aisle) return aisle
    return runs.reduce((best, run) =>
      Math.abs(centre(run) - AISLE_X) < Math.abs(centre(best) - AISLE_X) ? run : best
    )
  }
  const target = centre(reference)
  return runs.reduce((best, run) => {
    const shared = sharedEdge(run, reference)
    const bestShared = sharedEdge(best, reference)
    if (shared !== bestShared) return shared > bestShared ? run : best
    return Math.abs(centre(run) - target) < Math.abs(centre(best) - target) ? run : best
  })
}

function shrinkToward(lane, neighbour, reach) {
  if (!lane || !neighbour) return
  const min = Math.max(lane[0], neighbour[0] - reach)
  const max = Math.min(lane[1], neighbour[1] + reach)
  if (min <= max) {
    lane[0] = min
    lane[1] = max
  }
}

function corridorProfile(world, minZ, maxZ) {
  if (!world) return null

  const layers = [{ z: minZ, lane: findRun(world, minZ, null) }]
  for (let z = minZ + CORRIDOR_STEP; z <= maxZ + 1e-6; z += CORRIDOR_STEP) {
    const previous = layers[layers.length - 1].lane
    layers.push({ z, lane: findRun(world, z, previous) })
  }
  if (!layers.length || layers.every((layer) => !layer.lane)) return null

  for (let i = layers.length - 2; i >= 0; i--) {
    const lane = layers[i].lane
    const next = layers[i + 1].lane
    if (!lane || !next || sharedEdge(lane, next) > 0) continue
    const alternate = pickRun(freeRuns(world, layers[i].z), next)
    if (alternate && sharedEdge(alternate, next) > 0) layers[i].lane = alternate
  }

  for (let i = layers.length - 2; i >= 0; i--) shrinkToward(layers[i].lane, layers[i + 1].lane, CORRIDOR_SPREAD)
  for (let i = 1; i < layers.length; i++) shrinkToward(layers[i].lane, layers[i - 1].lane, CORRIDOR_SPREAD)

  let carried = null
  for (const layer of layers) {
    if (layer.lane) carried = layer.lane
    else layer.lane = carried
  }
  carried = null
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].lane) carried = layers[i].lane
    else layers[i].lane = carried
  }
  if (!carried) return null

  return layers.map((layer) => ({ min: layer.lane[0], max: layer.lane[1] }))
}

function laneCentre(lane) {
  if (AISLE_X >= lane.min && AISLE_X <= lane.max) return AISLE_X
  return (lane.min + lane.max) / 2
}

// The profile only samples the carriage every CORRIDOR_STEP, so furniture edges
// that fall between two samples can still be under the lane. This trims the
// sampled lane down to what is actually clear at this exact depth, in a handful
// of probes rather than a full scan.
function clearLane(world, z, lane) {
  const centre = (lane.min + lane.max) / 2
  if (!corridorClear(world, centre, z)) {
    const run = findRun(world, z, [lane.min, lane.max])
    if (!run) return lane
    if (sharedEdge(run, [lane.min, lane.max]) <= 0) return { min: run[0], max: run[1] }
    return { min: Math.max(run[0], lane.min), max: Math.min(run[1], lane.max) }
  }

  let min = lane.min
  let max = lane.max
  if (!corridorClear(world, min, z)) {
    let lo = min
    let hi = centre
    for (let i = 0; i < CORRIDOR_BINARY_STEPS; i++) {
      const mid = (lo + hi) / 2
      if (corridorClear(world, mid, z)) hi = mid
      else lo = mid
    }
    min = hi
  }
  if (!corridorClear(world, max, z)) {
    let lo = centre
    let hi = max
    for (let i = 0; i < CORRIDOR_BINARY_STEPS; i++) {
      const mid = (lo + hi) / 2
      if (corridorClear(world, mid, z)) lo = mid
      else hi = mid
    }
    max = lo
  }
  return min <= max ? { min, max } : lane
}

export class TrainZombie {
  constructor({ group, mixer, footOffset = 0, carriages = [], colliders = [] } = {}) {
    this.group = group || null
    this.mixer = mixer || null
    this.footOffset = footOffset
    this.state = 'dormant'
    this.hidden = false
    this.direction = -1
    this.pause = 0
    this.memory = 0
    this.facing = Math.PI
    this.prowling = false
    this.prowl = -1
    this.orientTimer = ORIENT_INTERVAL
    this.target = new THREE.Vector2(AISLE_X, 0)

    let minZ = Infinity
    let maxZ = -Infinity
    let triggerZ = -Infinity

    for (const carriage of carriages) {
      if (!carriage?.bounds) continue
      minZ = Math.min(minZ, carriage.bounds.min.z)
      maxZ = Math.max(maxZ, carriage.bounds.max.z)
    }

    const spawnCarriage = carriages[carriages.length - 1]
    if (spawnCarriage?.bounds) triggerZ = spawnCarriage.bounds.max.z
    const startCarriage = carriages[Math.max(0, carriages.length - 2)]

    this.minZ = Number.isFinite(minZ) ? minZ + EDGE_MARGIN : -60
    this.maxZ = Number.isFinite(maxZ) ? maxZ - EDGE_MARGIN : 60
    if (this.maxZ < this.minZ) this.maxZ = this.minZ
    this.triggerZ = Number.isFinite(triggerZ) ? triggerZ : this.maxZ

    if (this.group) {
      const startZ = startCarriage?.bounds
        ? startCarriage.bounds.max.z - START_OFFSET
        : this.maxZ - START_OFFSET
      this.floorY = trainFloorAlong(colliders, AISLE_X, this.minZ, this.maxZ)
      this.world = floorWorld(colliders)
      this.corridor = corridorProfile(this.world, this.minZ, this.maxZ)
      const startX = laneCentre(this.laneAt(startZ))
      this.group.position.set(startX, this.floorY + this.footOffset, startZ)
      this.group.rotation.y = this.facing
      this.target.set(startX, startZ)
    } else {
      this.floorY = 0
      this.world = null
      this.corridor = null
    }
  }

  tableAt(z) {
    if (!this.corridor?.length) return { min: FALLBACK_LANE_MIN, max: FALLBACK_LANE_MAX }
    const index = Math.round((z - this.minZ) / CORRIDOR_STEP)
    return this.corridor[THREE.MathUtils.clamp(index, 0, this.corridor.length - 1)]
  }

  laneAt(z) {
    const lane = this.tableAt(z)
    return this.world ? clearLane(this.world, z, lane) : lane
  }

  get position() {
    return this.group ? this.group.position : null
  }

  isOnPath(x, z) {
    const lane = this.tableAt(z)
    return x >= lane.min - PATH_MARGIN && x <= lane.max + PATH_MARGIN
  }

  isHidden(player) {
    if (!player.crouching || player.flashlightOn) return false
    return !this.isOnPath(player.position.x, player.position.z)
  }

  update(dt, player) {
    if (!this.group) return null

    this.hidden = this.isHidden(player)
    this.group.visible = Math.abs(player.position.z - this.group.position.z) < VISIBLE_RANGE

    if (this.state === 'dormant') {
      if (player.position.z <= this.triggerZ) return null
      this.state = 'patrol'
      this.pause = 0.5
    }

    this.orientTimer -= dt
    if (this.orientTimer <= 0) {
      this.orientTimer = ORIENT_INTERVAL
      this.orientToward(player)
    }

    const dx = player.position.x - this.group.position.x
    const dz = player.position.z - this.group.position.z
    const distance = Math.hypot(dx, dz)
    const playerSpeed = Math.hypot(player.velocity.x, player.velocity.z)
    const noticed = !this.hidden &&
      distance <= SENSE_RADIUS &&
      (playerSpeed >= SENSE_MOVE_SPEED || player.flashlightOn)

    if (noticed) {
      this.state = 'hunt'
      this.memory = MEMORY_TIME
      this.target.set(player.position.x, player.position.z)
    } else if (this.state === 'hunt') {
      this.memory -= dt
      if (this.memory <= 0) {
        this.state = 'patrol'
        this.pause = PATROL_PAUSE
        this.prowling = false
        this.target.set(AISLE_X, this.group.position.z)
      }
    }

    const moved = this.state === 'hunt' ? this.hunt(dt) : this.patrol(dt)

    const frameSpeed = dt > 0 ? Math.hypot(moved.x, moved.z) / dt : 0
    if (frameSpeed > 0.001) this.facing = Math.atan2(moved.x, moved.z)
    this.group.rotation.y = rotateToward(
      this.group.rotation.y,
      this.facing,
      1 - Math.exp(-TURN_SMOOTHING * dt)
    )

    if (this.mixer) {
      this.mixer.update(dt * Math.min(MAX_PLAYBACK_RATE, frameSpeed / PATROL_SPEED))
    }

    const reachX = Math.max(0, Math.abs(dx) - (this.hidden ? 0 : GRAB_REACH))
    const reach = Math.hypot(reachX, dz)
    const catchRadius = this.hidden ? CONTACT_RADIUS : CATCH_RADIUS
    return reach < catchRadius ? 'caught' : null
  }

  orientToward(player) {
    const offsetX = player.position.x - this.group.position.x
    const offsetZ = player.position.z - this.group.position.z
    if (Math.abs(offsetZ) > 0.05) this.direction = offsetZ < 0 ? -1 : 1
    if (offsetX !== 0 || offsetZ !== 0) this.facing = Math.atan2(offsetX, offsetZ)
  }

  patrol(dt) {
    const moved = { x: 0, z: 0 }
    const beforeX = this.group.position.x

    if (this.pause > 0) {
      this.pause -= dt
    } else {
      const before = this.group.position.z
      let next = before + this.direction * PATROL_SPEED * dt
      if (next <= this.minZ) {
        next = this.minZ
        this.direction = 1
        this.pause = PATROL_PAUSE
      } else if (next >= this.maxZ) {
        next = this.maxZ
        this.direction = -1
        this.pause = PATROL_PAUSE
      }
      moved.z = next - before
      this.group.position.z = next
    }

    const lane = this.laneAt(this.group.position.z)
    const aim = THREE.MathUtils.clamp(
      laneCentre(this.tableAt(this.group.position.z)),
      lane.min,
      lane.max
    )
    this.group.position.x += (aim - this.group.position.x) * (1 - Math.exp(-AISLE_RETURN * dt))
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, lane.min, lane.max)
    moved.x = this.group.position.x - beforeX
    return moved
  }

  hunt(dt) {
    const moved = { x: 0, z: 0 }
    const beforeX = this.group.position.x
    const beforeZ = this.group.position.z
    const lane = this.tableAt(beforeZ)
    const offsetX = THREE.MathUtils.clamp(this.target.x, lane.min, lane.max) - beforeX
    const offsetZ = this.target.y - beforeZ
    const distance = Math.hypot(offsetX, offsetZ)

    if (this.prowling && distance > PROWL_SPAN) this.prowling = false

    if (this.prowling) {
      this.group.position.z += this.prowl * HUNT_SPEED * dt
      if ((this.group.position.z - this.target.y) * this.prowl >= PROWL_SPAN) {
        this.prowling = false
        this.prowl = -this.prowl
      }
      this.group.position.x += offsetX * (1 - Math.exp(-AISLE_RETURN * dt))
    } else if (distance > HOLD_DISTANCE) {
      const step = Math.min(HUNT_SPEED * dt, distance)
      this.group.position.x += (offsetX / distance) * step
      this.group.position.z += (offsetZ / distance) * step
    } else {
      this.prowling = true
      this.prowl = Math.sign(beforeZ - this.target.y) || this.prowl
      this.group.position.z += this.prowl * HUNT_SPEED * dt
    }

    const nextLane = this.laneAt(this.group.position.z)
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, nextLane.min, nextLane.max)
    moved.x = this.group.position.x - beforeX
    moved.z = this.group.position.z - beforeZ
    return moved
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.mixer.getRoot())
      this.mixer = null
    }
    this.group = null
  }
}
