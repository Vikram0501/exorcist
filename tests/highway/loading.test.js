import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const src = (p) =>
  fs.readFileSync(path.join(repoRoot, 'src', p), 'utf8').replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// Every Level 3 network asset must load through the shared LoadingManager,
// otherwise no `assetprogress` events fire and the menu button stays on the
// static "LOADING..." label (the reported bug).
// ---------------------------------------------------------------------------

test('all Level 3 loaders report through the shared loadingManager', () => {
  const wired = {
    'levels/highway/cars.js': 'new GLTFLoader(loadingManager)',
    'levels/highway/obstacles.js': 'new GLTFLoader(loadingManager)',
    'levels/highway/road.js': 'new GLTFLoader(loadingManager)',
    'levels/highway/city.js': 'new GLTFLoader(loadingManager)',
    'levels/highway/streetlights.js': 'new GLTFLoader(loadingManager)',
    'levels/highway/atmosphere.js':
      'new THREE.TextureLoader(loadingManager)',
  }
  for (const [file, expected] of Object.entries(wired)) {
    const source = src(file)
    assert.ok(
      source.includes('core/loading.js'),
      `${file} imports the shared loadingManager`
    )
    assert.ok(
      source.includes(expected),
      `${file} passes the manager to its loader (${expected})`
    )
  }
})

test('no Level 3 asset loader bypasses progress tracking', () => {
  for (const file of [
    'levels/highway/cars.js',
    'levels/highway/obstacles.js',
    'levels/highway/road.js',
    'levels/highway/city.js',
    'levels/highway/streetlights.js',
    'levels/highway/atmosphere.js',
  ]) {
    const source = src(file)
    assert.ok(
      !source.includes('new GLTFLoader()'),
      `${file} has no untracked GLTFLoader`
    )
    assert.ok(
      !source.includes('new THREE.TextureLoader()'),
      `${file} has no untracked TextureLoader`
    )
  }
})

// ---------------------------------------------------------------------------
// Progress events drive the menu percentage UI.
// ---------------------------------------------------------------------------

test('loadingManager progress events carry itemsLoaded/itemsTotal', async (t) => {
  const events = []
  const originalWindow = globalThis.window
  const OriginalCustomEvent = globalThis.CustomEvent
  if (typeof globalThis.CustomEvent === 'undefined') {
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    }
  }
  globalThis.window = {
    dispatchEvent(event) {
      events.push(event)
      return true
    },
  }
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (OriginalCustomEvent === undefined) delete globalThis.CustomEvent
    else globalThis.CustomEvent = OriginalCustomEvent
  })

  const { loadingManager } = await import(
    '../../src/core/loading.js'
  )
  loadingManager.itemStart('test-asset-a')
  loadingManager.itemStart('test-asset-b')
  loadingManager.itemEnd('test-asset-a')

  assert.ok(events.length > 0, 'progress events fire as items complete')
  const last = events[events.length - 1]
  assert.equal(last.type, 'assetprogress')
  assert.ok(
    Number.isFinite(last.detail.itemsLoaded) &&
      Number.isFinite(last.detail.itemsTotal) &&
      last.detail.itemsTotal > 0,
    'event carries usable counters for the percentage UI'
  )
  const pct = Math.round(
    (last.detail.itemsLoaded / last.detail.itemsTotal) * 100
  )
  assert.ok(pct >= 0 && pct <= 100, `percentage in range, got ${pct}`)
})

test('menu shows LOADING pct%, resets per entry, hides overlay only on success', () => {
  const mainJs = src('main.js')
  assert.ok(
    mainJs.includes('`LOADING ${pct}%`'),
    'button shows the live percentage'
  )
  assert.ok(
    mainJs.includes("button.textContent = 'LOADING 0%'"),
    'every level resets to zero on entry'
  )
  assert.ok(
    mainJs.includes('if (!loaded)') &&
      mainJs.includes("overlay.classList.add(\n      'hidden'\n    )"),
    'menu hides only after a successful load, never on failure'
  )
})

test('Level 3 starts at 0% and owns its display session', () => {
  const mainJs = src('main.js')
  assert.ok(
    mainJs.includes("button.textContent = 'LOADING 0%'"),
    'highway entries start at an explicit 0%'
  )
  assert.ok(
    mainJs.includes('HIGHWAY_LOAD_EVENT'),
    'menu listens to the session tracker event'
  )
  assert.ok(mainJs.includes('LEVEL_LOAD_EVENT'), 'house and train use session progress')
  assert.ok(
    mainJs.includes('loadingLevel = levelName') &&
      mainJs.includes('loadingLevel = null'),
    'display session is set on entry and cleared when loading ends'
  )
})

test('game threads one session tracker through the highway load', () => {
  const gameJs = src('core/game.js')
  assert.ok(
    gameJs.includes('createHighwayLoadTracker({') &&
      gameJs.includes('isAlive: () => loadId === this.levelLoadId'),
    'tracker is bound to the load session (exit invalidates it)'
  )
  assert.ok(
    gameJs.includes('.load(levelRoot, highwayTracker || stageTracker)'),
    'tracker reaches the highway builder'
  )
  assert.ok(
    gameJs.includes("highwayTracker.run('sky'") &&
      gameJs.includes("highwayTracker.run('audio'"),
    'skybox and audio readiness are tracked steps'
  )
  assert.ok(
    gameJs.includes("highwayTracker?.complete('init')"),
    'init completes after the level is marked loaded'
  )
  assert.ok(
    gameJs.includes('highwayTracker?.abort()'),
    'failed loads settle the session so 100% is unreachable'
  )
})

test('highway builder reports each asset to the session tracker', () => {
  const indexJs = src('levels/highway/index.js')
  assert.ok(
    indexJs.includes('levelRoot,\n  loadTracker = null'),
    'tracker param is optional (existing callers unaffected)'
  )
  for (const id of ['road', 'city', 'streetlights']) {
    assert.ok(
      indexJs.includes(`complete('${id}')`),
      `builder reports ${id}`
    )
  }
  assert.ok(
    indexJs.includes('loadHighwayCars(highway, loadTracker)') &&
      indexJs.includes('loadObstacleModels(loadTracker)'),
    'per-file progress reaches the car/obstacle loaders'
  )
})
