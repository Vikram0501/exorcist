// Level 3 load progress: fixed-weight, session-scoped task tracking.
//
// Why this exists: the shared LoadingManager counts grow while loading
// (sub-resources are discovered lazily), so `loaded/total` can hit 100%
// and then fall backwards as new items register. This tracker instead
// enumerates every required Level 3 task up front with weights that sum
// to HIGHWAY_LOAD_TOTAL. Completed weight only ever grows (each task
// counts once), so the displayed percentage is monotonic by construction
// and 100% is unreachable until every task has actually finished.
//
// Sessions: each Level 3 entry creates one tracker bound to that load's
// `isAlive` check (the game's levelLoadId). Completions from a previous
// or cancelled session are ignored, so old callbacks can never move the
// percentage of a new session, and exiting mid-load freezes the display.

export const HIGHWAY_LOAD_TOTAL = 100

// Every asset/init step required before Level 3 can begin. Weights are
// roughly proportional to download size; the sum must stay 100.
export const HIGHWAY_LOAD_TASKS = [
  { id: 'road', weight: 16 },
  { id: 'city', weight: 8 },
  { id: 'streetlights', weight: 6 },
  { id: 'player-car', weight: 11 },
  { id: 'ghost-car', weight: 11 },
  { id: 'obstacle-zombie', weight: 6 },
  { id: 'obstacle-scientist', weight: 6 },
  { id: 'obstacle-barbed', weight: 6 },
  { id: 'sky', weight: 10 },
  { id: 'audio', weight: 8 },
  { id: 'init', weight: 12 },
]

export const HIGHWAY_LOAD_EVENT = 'highwayloadprogress'


export function highwayLoadPercent(loaded, total) {
  if (!(total > 0)) return 0
  return Math.round((loaded / total) * 100)
}


export function createHighwayLoadTracker({
  isAlive = () => true,
  onProgress = null,
} = {}) {
  const weights = new Map(
    HIGHWAY_LOAD_TASKS.map((task) => [task.id, task.weight])
  )

  const done = new Set()

  let completed = 0

  let settled = false

  const emit = () => {
    onProgress?.({
      loaded: completed,
      total: HIGHWAY_LOAD_TOTAL,
    })
  }

  return {
    get completed() {
      return completed
    },

    get isSettled() {
      return settled
    },

    // Marks one task finished and reports the new total. Idempotent per
    // task id, silent for unknown ids and dead sessions: the underlying
    // sum never decreases, so callers must not clamp it with Math.max().
    complete(id) {
      if (settled || done.has(id)) {
        return completed
      }

      const weight = weights.get(id)

      if (!weight) {
        return completed
      }

      if (!isAlive()) {
        return completed
      }

      done.add(id)
      completed += weight

      if (completed >= HIGHWAY_LOAD_TOTAL) {
        completed = HIGHWAY_LOAD_TOTAL
        settled = true
      }

      emit()

      return completed
    },

    // Runs one tracked step: completion is reported only when `fn`
    // succeeds. A failure settles the tracker (no later partial event
    // can reach 100%) and rethrows for the existing level-load error
    // path, which fails the level instead of starting it broken.
    async run(id, fn) {
      let result

      try {
        result = await fn()
      } catch (error) {
        settled = true
        throw error
      }

      this.complete(id)

      return result
    },

    // Permanently stops this session (level failure or exit).
    abort() {
      settled = true
    },
  }
}
