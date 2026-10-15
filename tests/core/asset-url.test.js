import test from 'node:test'
import assert from 'node:assert/strict'
import { assetUrl } from '../../src/core/asset-url.js'

test('public assets resolve inside the hosted group folder', () => {
  const previousDocument = globalThis.document
  try {
    delete globalThis.document
    assert.equal(assetUrl('/models/player_car.glb'), '/models/player_car.glb')

    globalThis.document = { baseURI: 'https://example.edu/cgv/group-01/index.html' }
    assert.equal(
      assetUrl('/models/player_car.glb'),
      'https://example.edu/cgv/group-01/models/player_car.glb',
    )
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
