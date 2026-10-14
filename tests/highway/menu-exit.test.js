import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function campaign() {
  const listeners = { window: {}, document: {} }
  const nodes = new Map()
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', disabled: false, hidden: false, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { this[`on${type}`] = fn },
      querySelector() { return node(`${id}-action`) },
    })
    return nodes.get(id)
  }
  const screens = ['title', 'cases', 'briefing', 'pause', 'complete'].map(name => {
    const item = node(name)
    item.dataset.screen = name
    return item
  })
  node('overlay').querySelectorAll = () => screens
  const controlSections = ['house', 'train', 'highway'].map(name => {
    const section = node(`controls-${name}`)
    section.dataset.controlsCase = name
    return section
  })
  node('controlsDialog').querySelectorAll = () => controlSections
  node('controlsDialog').showModal = function () { this.open = true }
  node('controlsDialog').close = function () { this.open = false }
  node('creditsDialog').showModal = function () { this.open = true }
  node('creditsDialog').close = function () { this.open = false }
  const controlsButtons = [node('pauseControls')]
  const cards = ['house', 'train', 'highway'].map(name => node(`card-${name}`))
  let exits = 0
  const pauses = []
  const starts = []
  const timers = []
  const game = {
    currentLevel: null, loaded: false, gameOverEl: null, namePuzzleEl: null,
    input: { isLocked: false, lock() {}, release() {} },
    setPaused(value) { pauses.push(value) },
    start(level) {
      starts.push({ level, briefingVisible: !node('briefing').hidden })
      this.currentLevel = level
      this.loaded = true
      return Promise.resolve(true)
    },
    exitToMenu() { exits++; this.currentLevel = null; this.loaded = false },
  }
  const storage = new Map()
  const settings = { master: 1, music: 1, sfx: 1, sensitivity: 1 }
  const settingListeners = []
  game.applySettings = function () {
    this.applySettingsCalls = (this.applySettingsCalls || 0) + 1
  }
  const context = {
    Game: function () { return game }, console, queueMicrotask,
    getSettings() { return { ...settings } },
    updateSetting(key, value) {
      settings[key] = value
      for (const listener of settingListeners) listener({ ...settings })
    },
    subscribe(listener) { settingListeners.push(listener) },
    setTimeout(fn) { timers.push(fn) },
    localStorage: {
      getItem(key) { return storage.get(key) }, setItem(key, value) { storage.set(key, value) },
    },
    window: { addEventListener(type, fn) { (listeners.window[type] ??= []).push(fn) } },
    document: {
      getElementById: node, pointerLockElement: null,
      querySelector(selector) { return cards[['house', 'train', 'highway'].findIndex(name => selector.includes(name))] },
      querySelectorAll() { return controlsButtons },
      addEventListener(type, fn) { (listeners.document[type] ??= []).push(fn) },
    },
  }
  const source = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
  vm.runInNewContext(source, context)
  return {
    node, cards, game, listeners, storage, starts, controlSections, controlsButtons, settings,
    advanceIntro() { timers.splice(0).forEach(fn => fn()) },
    get exits() { return exits }, get pauses() { return pauses },
  }
}

test('all cases are available; the selected case preloads behind its own briefing', async () => {
  const ui = campaign()
  assert.ok(ui.cards.every(card => !card.disabled))
  ui.cards[1].onclick()
  assert.deepEqual(ui.starts, [{ level: 'train', briefingVisible: true }])
  assert.equal(ui.node('briefingTitle').textContent, 'CASE 02 / NIGHT TRAIN')
  assert.equal(ui.node('briefing').hidden, false)
  assert.equal(ui.node('beginCaseBtn').disabled, true)
  assert.equal(ui.node('briefingStatus').hidden, true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ui.node('beginCaseBtn').disabled, true, 'the intro remains visible even if assets load quickly')
  ui.advanceIntro()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ui.node('beginCaseBtn').disabled, false)
  assert.equal(ui.node('briefingStatus').hidden, true)
  ui.node('beginCaseBtn').onclick()
  assert.equal(ui.node('pause').hidden, true)
  ui.node('pauseBtn').onclick()
  assert.equal(ui.node('pause').hidden, false)
  assert.equal(ui.pauses.at(-1), true)
  ui.node('resumeBtn').onclick()
  assert.equal(ui.pauses.at(-1), false)
  for (const fn of ui.listeners.window.levelcomplete) fn({ detail: { levelName: 'train' } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(ui.storage.get('exorcist-unlocked'), '2')
  ui.node('completionCasesBtn').onclick()
  assert.ok(ui.cards.every(card => !card.disabled))
})

test('browser-consumed Escape pauses active play, but not death retry or briefings', async () => {
  const ui = campaign()
  ui.node('startBtn').onclick()
  for (const fn of ui.listeners.document.pointerlockchange) fn()
  assert.equal(ui.node('briefing').hidden, false)
  await new Promise(resolve => setImmediate(resolve))
  ui.advanceIntro()
  await new Promise(resolve => setImmediate(resolve))
  ui.node('beginCaseBtn').onclick()
  ui.game.gameOverEl = {}
  for (const fn of ui.listeners.document.pointerlockchange) fn()
  assert.equal(ui.node('pause').hidden, true)
  ui.game.gameOverEl = null
  for (const fn of ui.listeners.document.pointerlockchange) fn()
  assert.equal(ui.node('pause').hidden, false)
  assert.equal(ui.exits, 0)
  ui.node('pauseCasesBtn').onclick()
  assert.equal(ui.exits, 1)
})

test('title credits open separately while pause controls show only the active case', async () => {
  const ui = campaign()
  ui.node('creditsBtn').onclick()
  assert.equal(ui.node('creditsDialog').open, true)
  assert.equal(ui.node('controlsDialog').open, undefined)
  ui.node('creditsDialog').close()
  ui.node('caseFilesBtn').onclick()
  ui.cards[2].onclick()
  ui.advanceIntro()
  await new Promise(resolve => setImmediate(resolve))
  ui.node('beginCaseBtn').onclick()
  ui.node('pauseBtn').onclick()
  ui.controlsButtons[0].onclick()
  assert.deepEqual(ui.controlSections.map(section => section.hidden), [true, true, false])
})

test('the pause sliders live-apply the mix as they move', async () => {
  const ui = campaign()
  ui.node('startBtn').onclick()
  await new Promise(resolve => setImmediate(resolve))
  ui.advanceIntro()
  await new Promise(resolve => setImmediate(resolve))
  ui.node('beginCaseBtn').onclick()
  ui.node('pauseBtn').onclick()
  assert.equal(ui.node('pause').hidden, false)

  ui.node('masterVolume').value = '50'
  ui.node('masterVolume').oninput()
  assert.equal(ui.settings.master, 0.5)
  assert.equal(ui.node('masterVolumeValue').textContent, '50%')
  assert.equal(ui.game.applySettingsCalls, 1, 'the game re-applies the mix as sliders move')

  ui.node('sensitivitySlider').value = '150'
  ui.node('sensitivitySlider').oninput()
  assert.equal(ui.settings.sensitivity, 1.5)
  assert.equal(ui.node('sensitivityValue').textContent, '150%')
  assert.equal(ui.game.applySettingsCalls, 2)

  assert.equal(ui.node('resumeBtn').onclick !== undefined, true, 'the pause actions are still wired')
})
