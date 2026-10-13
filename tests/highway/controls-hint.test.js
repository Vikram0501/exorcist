import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HIGHWAY_CONTROLS_ID,
  ON_FOOT_CONTROLS_ID,
  setControlsHint,
} from '../../src/levels/highway/controls-hint.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8')
const carJs = fs.readFileSync(
  path.join(repoRoot, 'src', 'levels', 'highway', 'car.js'), 'utf8'
)

function makePanel() {
  const classes = new Set()
  return {
    style: {},
    classList: {
      toggle(name, force) {
        if (force) classes.add(name)
        else classes.delete(name)
      },
      contains(name) {
        return classes.has(name)
      },
    },
  }
}

function makeDocument() {
  const nodes = {
    [HIGHWAY_CONTROLS_ID]: makePanel(),
    [ON_FOOT_CONTROLS_ID]: makePanel(),
  }
  // Highway panel starts hidden, like the shipped index.html.
  nodes[HIGHWAY_CONTROLS_ID].classList.toggle('hidden', true)
  return {
    nodes,
    getElementById(id) {
      return nodes[id] ?? null
    },
  }
}

const isHidden = (doc, id) =>
  doc.nodes[id].classList.contains('hidden')

test('entering the highway shows racing controls and hides on-foot ones', () => {
  const doc = makeDocument()
  setControlsHint(doc, 'highway')
  assert.equal(isHidden(doc, HIGHWAY_CONTROLS_ID), false)
  assert.equal(isHidden(doc, ON_FOOT_CONTROLS_ID), true)
})

test('other levels and the menu restore the on-foot hint', () => {
  for (const level of ['house', 'train', null, undefined]) {
    const doc = makeDocument()
    setControlsHint(doc, 'highway')
    setControlsHint(doc, level)
    assert.equal(
      isHidden(doc, HIGHWAY_CONTROLS_ID), true, `highway hidden for ${level}`
    )
    assert.equal(
      isHidden(doc, ON_FOOT_CONTROLS_ID), false, `on-foot shown for ${level}`
    )
  }
})

test('helper is safe with missing nodes and repeat calls', () => {
  assert.doesNotThrow(() => setControlsHint(null, 'highway'))
  assert.doesNotThrow(() => setControlsHint({}, 'highway'))
  assert.doesNotThrow(() =>
    setControlsHint({ getElementById: () => null }, 'highway')
  )
  const doc = makeDocument()
  assert.doesNotThrow(() => {
    setControlsHint(doc, 'highway')
    setControlsHint(doc, 'highway')
    setControlsHint(doc, null)
    setControlsHint(doc, null)
  })
  assert.equal(isHidden(doc, HIGHWAY_CONTROLS_ID), true)
  assert.equal(isHidden(doc, ON_FOOT_CONTROLS_ID), false)
})

test('panel lists only controls the highway actually implements', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyD', 'KeyS', 'Space']) {
    assert.ok(
      carJs.includes(`'${code}'`),
      `car.js handles ${code}, so it may be displayed`
    )
  }
  for (const [label, code] of [
    ['W', 'KeyW'],
    ['A', 'KeyA'],
    ['D', 'KeyD'],
    ['S', 'KeyS'],
    ['SPACE', 'Space'],
  ]) {
    assert.ok(
      indexHtml.includes(`<kbd>${label}</kbd>`),
      `panel shows ${label} (${code})`
    )
  }
  assert.ok(indexHtml.includes('<kbd>ESC</kbd>'), 'panel shows ESC exit')
  for (const unsupported of ['KeyE', 'KeyI', 'KeyT', 'KeyR']) {
    assert.ok(
      !new RegExp(`highwayControls[\\s\\S]{0,800}<kbd>[^<]*</kbd>[\\s\\S]{0,200}${unsupported}`).test(indexHtml),
      `no ${unsupported} control in the highway panel`
    )
  }
})

test('panel markup and styling match the Level 1 conventions', () => {
  // Bottom-centre placement, dark translucent horror styling, bold keys,
  // dot separators, non-interactive, hidden until the highway loads.
  assert.ok(
    indexHtml.includes('id="highwayControls" class="hidden"'),
    'hidden until Level 3 loads'
  )
  assert.ok(
    indexHtml.includes('bottom: 18px; left: 50%'),
    'bottom-centre placement like #hudControls'
  )
  assert.ok(
    indexHtml.includes('background: rgba(4, 5, 6, 0.42)'),
    'dark semi-transparent background'
  )
  assert.ok(
    indexHtml.includes('#highwayControls kbd'),
    'dedicated bold-key rule'
  )
  assert.ok(
    indexHtml.includes('font-weight: 700'),
    'keys bolder than descriptions'
  )
  assert.ok(
    indexHtml.includes('&middot;'),
    'subtle dot separators like Level 1'
  )
  assert.ok(
    indexHtml.includes('#highwayControls.hidden { display: none; }'),
    'hide rule so it never lingers on menu/other levels'
  )
  assert.ok(
    indexHtml.includes('#hudControls.hidden { display: none; }'),
    'on-foot hint can hide during the highway'
  )
  const panelCss = indexHtml.slice(
    indexHtml.indexOf('#highwayControls {'),
    indexHtml.indexOf('#highwayControls {') + 600
  )
  assert.ok(panelCss.includes('z-index: 10'), 'below menus/overlays')
  assert.ok(
    panelCss.includes('pointer-events: none'),
    'never intercepts input or gameplay'
  )
  assert.ok(
    indexHtml.includes('@media (max-width: 700px)') &&
      indexHtml.includes('#highwayControls { bottom: 12px;'),
    'small-screen rule'
  )
})
