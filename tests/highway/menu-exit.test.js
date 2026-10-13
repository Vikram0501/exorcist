import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('actual menu handlers exit on browser-consumed ESC, but preserve death retry', () => {
  const handlers = { window: {}, document: {} }
  const nodes = new Map()
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, querySelector() { return null },
    })
    return nodes.get(id)
  }
  let exits = 0
  const game = {
    currentLevel: 'highway', loaded: true, levelState: 'RACING',
    input: { isLocked: false },
    exitToMenu() { exits++; this.currentLevel = null; this.loaded = false },
  }
  const context = {
    Game: function () { return game }, HIGHWAY_LOAD_EVENT: 'highwayloadprogress',
    window: { addEventListener(type, fn) { (handlers.window[type] ??= []).push(fn) } },
    document: {
      getElementById: node, pointerLockElement: null,
      addEventListener(type, fn) { (handlers.document[type] ??= []).push(fn) },
    },
  }
  const source = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
  vm.runInNewContext(source, context)
  for (const fn of handlers.document.pointerlockchange) fn()
  assert.equal(exits, 1, 'pointer unlock alone exits when browser consumes Escape')
  Object.assign(game, { currentLevel: 'highway', loaded: true, levelState: 'GAME_OVER' })
  for (const fn of handlers.document.pointerlockchange) fn()
  assert.equal(exits, 1, 'intentional death unlock preserves Play Again')
  for (const fn of handlers.window.keydown) fn({ key: 'Escape' })
  assert.equal(exits, 2, 'explicit Escape exits game-over screen')
  Object.assign(game, { currentLevel: 'highway', loaded: false, levelState: 'RACING' })
  for (const fn of handlers.window.keydown) fn({ key: 'Escape' })
  assert.equal(exits, 3, 'Escape works during loading without pointer lock')
})
