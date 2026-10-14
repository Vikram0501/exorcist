import * as THREE from 'three'

// Shared LoadingManager: every level asset loader passes this in, so the UI
// can show real download progress instead of an endless "LOADING..." label.
export const loadingManager = new THREE.LoadingManager()

export const LEVEL_LOAD_EVENT = 'levelloadprogress'

const LEVEL_TASKS = {
  house: { model: 55, world: 18, avatar: 12, setup: 5, warmup: 8, ready: 2 },
  train: { carriages: 38, layout: 12, collision: 15, zombie: 12, clues: 8, warmup: 12, ready: 3 },
}

// Count completed work in this load session. Decoded assets cannot claim
// 100% while collision, scene setup, or shader warmup is still pending.
export function createLevelLoadTracker(levelName, isAlive, onProgress) {
  const weights = LEVEL_TASKS[levelName]
  if (!weights) return null
  const done = new Set()
  let loaded = 0
  let aborted = false
  return {
    complete(id) {
      if (aborted || !isAlive() || done.has(id) || !weights[id]) return loaded
      done.add(id)
      loaded += weights[id]
      onProgress?.({ levelName, loaded, total: 100 })
      return loaded
    },
    abort() { aborted = true },
  }
}

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  window.dispatchEvent(
    new CustomEvent('assetprogress', {
      detail: { url, itemsLoaded, itemsTotal },
    }),
  )
}
