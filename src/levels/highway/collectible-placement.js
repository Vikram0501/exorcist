import { BOUNDARY_D } from './car.js'
import { CAR_HALF_DEPTH, CAR_HALF_WIDTH } from './obstacles.js'

export const PICKUP_RADIUS = 2.5
export const LETTER_FRONT_BACK_CLEARANCE = 8
export const LETTER_SIDE_CLEARANCE = 0.75
// BOUNDARY_D already reserves the car's half-width. Keep the entire pickup
// zone inside that driving envelope, away from curbs (|d| >= 6.2), barriers
// (|d| >= 7), lamps and scenery (outside the barriers).
export const LETTER_LATERAL_LIMIT = BOUNDARY_D - PICKUP_RADIUS - 0.5
export const LETTER_MIN_SPACING = 2 * (PICKUP_RADIUS + CAR_HALF_DEPTH)
const EDGE_MARGIN = PICKUP_RADIUS + CAR_HALF_DEPTH + LETTER_FRONT_BACK_CLEARANCE
const EPSILON = 0.05
const LANES = [-LETTER_LATERAL_LIMIT, 0, LETTER_LATERAL_LIMIT]

function clearance(obstacle) {
  return {
    depth: obstacle.halfDepth + CAR_HALF_DEPTH + PICKUP_RADIUS + LETTER_FRONT_BACK_CLEARANCE,
    width: obstacle.halfWidth + CAR_HALF_WIDTH + PICKUP_RADIUS + LETTER_SIDE_CLEARANCE,
  }
}

export function isLetterPositionSafe(track, progress, lateralOffset, obstacles) {
  if (!Number.isFinite(progress) || !Number.isFinite(lateralOffset) ||
      progress < EDGE_MARGIN || progress > track.getFinishDistance() - EDGE_MARGIN ||
      Math.abs(lateralOffset) > LETTER_LATERAL_LIMIT) return false

  const position = track.toWorld(progress, lateralOffset, 0.2)
  return obstacles.every(obstacle => {
    const { depth, width } = clearance(obstacle)
    // Same coordinates and footprints as the driving collision checks;
    // symmetric depth padding reserves both approach and departure space.
    if (Math.abs(progress - obstacle.progress) <= depth &&
        Math.abs(lateralOffset - obstacle.lateralOffset) <= width) return false

    // Also check in the obstacle's local world frame. This catches nearby
    // returning sections of a curve even if their track progress is far apart.
    const frame = track.sampleAt(obstacle.progress)
    const center = track.toWorld(obstacle.progress, obstacle.lateralOffset)
    const dx = position.x - center.x
    const dz = position.z - center.z
    const along = dx * Math.sin(frame.angle) + dz * Math.cos(frame.angle)
    const across = -dx * Math.cos(frame.angle) + dz * Math.sin(frame.angle)
    return Math.abs(along) > depth || Math.abs(across) > width
  })
}

// Plan every position before creating visuals. Exact interval subtraction
// finds narrow safe pockets that random retry loops or a fixed grid can miss.
export function planLetterPositions(track, count, obstacles = [], random = Math.random) {
  if (count === 0) return []
  const start = EDGE_MARGIN
  const end = track.getFinishDistance() - EDGE_MARGIN
  const lanes = LANES.map(lateralOffset => {
    let intervals = end >= start ? [[start, end]] : []
    for (const obstacle of obstacles) {
      const { depth, width } = clearance(obstacle)
      if (Math.abs(lateralOffset - obstacle.lateralOffset) > width) continue
      const lo = obstacle.progress - depth - EPSILON
      const hi = obstacle.progress + depth + EPSILON
      intervals = intervals.flatMap(([a, b]) => {
        if (hi < a || lo > b) return [[a, b]]
        const remaining = []
        if (lo > a) remaining.push([a, lo])
        if (hi < b) remaining.push([hi, b])
        return remaining
      })
    }
    return { lateralOffset, intervals }
  })

  // Pack safe stations in increasing progress, then stratify over the whole
  // pool. Empty original sections automatically borrow from other sections;
  // even a crowded layout retains every letter and minimum pickup spacing.
  const stations = []
  let cursor = start
  while (cursor <= end) {
    let progress = Infinity
    for (const lane of lanes) {
      for (const [a, b] of lane.intervals) {
        if (b >= cursor) progress = Math.min(progress, Math.max(a, cursor))
      }
    }
    if (!Number.isFinite(progress)) break
    const available = lanes.filter(lane =>
      lane.intervals.some(([a, b]) => progress >= a && progress <= b) &&
      isLetterPositionSafe(track, progress, lane.lateralOffset, obstacles))
    if (available.length) {
      stations.push({ progress, lanes: available })
      cursor = progress + LETTER_MIN_SPACING
    } else {
      // Extra world-space rejection (e.g. a nearby return bend). Bounded
      // forward search; never relax obstacle clearance to force a spawn.
      cursor = progress + 0.5
    }
  }
  if (stations.length < count) {
    throw new Error(`Cannot place ${count} collectible letters safely: only ${stations.length} safe stations`)
  }
  return Array.from({ length: count }, (_, i) => {
    const first = Math.floor(i * stations.length / count)
    const last = Math.floor((i + 1) * stations.length / count)
    const station = stations[first + Math.floor(random() * (last - first))]
    const lane = station.lanes[Math.floor(random() * station.lanes.length)]
    return { progress: station.progress, lateralOffset: lane.lateralOffset }
  })
}
