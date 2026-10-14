import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { updateSetting, audioGain, getSettings } from '../../src/core/settings.js'
import { TrainAudio, TRAIN_AMBIENT_VOLUME, SCREAM_VOLUME } from '../../src/levels/train/audio.js'

function withStoredSettings(raw) {
  const store = new Map()
  if (raw !== undefined) store.set('exorcist-settings', raw)
  globalThis.localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
  }
  return store
}

async function freshSettings() {
  return import(`../../src/core/settings.js?v=${Math.random()}`)
}

test('missing or corrupted storage falls back to the defaults', async () => {
  withStoredSettings('not json at all')
  const { getSettings: read, DEFAULT_SETTINGS } = await freshSettings()
  assert.deepEqual(read(), { ...DEFAULT_SETTINGS })

  withStoredSettings(JSON.stringify({ master: 'loud', nonsense: 1 }))
  assert.deepEqual((await freshSettings()).getSettings(), { ...DEFAULT_SETTINGS })
})

test('stored values are clamped into range and invalid keys ignored', async () => {
  withStoredSettings(JSON.stringify({ master: 5, music: -2, sfx: 0.25, sensitivity: 0, nonsense: 'yes' }))
  const { getSettings: read } = await freshSettings()
  const settings = read()
  assert.equal(settings.master, 1, 'master clamps to the top of the range')
  assert.equal(settings.music, 0, 'music clamps to silence')
  assert.equal(settings.sfx, 0.25, 'in-range values survive')
  assert.equal(settings.sensitivity, 0.25, 'sensitivity clamps to its floor')
  assert.equal(settings.nonsense, undefined, 'unknown keys are dropped')
})

test('audioGain multiplies the base by master and its role bus', async () => {
  withStoredSettings(undefined)
  const { audioGain: gain, updateSetting: set } = await freshSettings()
  assert.equal(gain('music', 0.3), 0.3, 'defaults leave authored levels untouched')

  set('master', 0.5)
  set('music', 0.4)
  assert.ok(Math.abs(gain('music', 0.3) - 0.3 * 0.5 * 0.4) < 1e-12)
  assert.ok(Math.abs(gain('sfx', 0.8) - 0.8 * 0.5) < 1e-12, 'sfx keeps its own bus at full')
})

test('updateSetting notifies subscribers and persists the mix', async () => {
  const store = withStoredSettings(undefined)
  const { updateSetting: set, subscribe } = await freshSettings()
  const seen = []
  const unsubscribe = subscribe(snapshot => seen.push(snapshot.master))

  set('master', 0.6)
  assert.deepEqual(seen, [0.6])
  assert.equal(JSON.parse(store.get('exorcist-settings')).master, 0.6)

  unsubscribe()
  set('master', 0.2)
  assert.deepEqual(seen, [0.6], 'unsubscribed listeners stay silent')
})

function mockAudio(t) {
  const originalAudio = globalThis.Audio
  globalThis.Audio = class {
    constructor(url) {
      this.url = url
      this.paused = true
      this.currentTime = 0
      this.loop = false
      this.volume = 1
    }
    play() { this.paused = false; return Promise.resolve() }
    pause() { this.paused = true }
  }
  t.after(() => {
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
  })
}

test('the train mix follows the sliders, including live re-application', t => {
  mockAudio(t)
  t.after(() => {
    updateSetting('master', 1)
    updateSetting('music', 1)
    updateSetting('sfx', 1)
  })

  updateSetting('master', 0.5)
  updateSetting('music', 0.4)
  updateSetting('sfx', 0.25)

  const audio = new TrainAudio()
  audio.setTrainActive(true)
  assert.ok(Math.abs(audio.ambient.volume - TRAIN_AMBIENT_VOLUME * 0.5 * 0.4) < 1e-12,
    'ambience scales with master x music')

  updateSetting('sfx', 0.5)
  audio.playScream('name')
  assert.ok(Math.abs(audio.screams.name.volume - SCREAM_VOLUME * 0.5 * 0.5) < 1e-12,
    'screams scale with master x sfx')

  updateSetting('master', 1)
  updateSetting('music', 1)
  audio.applyVolumes()
  assert.ok(Math.abs(audio.ambient.volume - TRAIN_AMBIENT_VOLUME) < 1e-12,
    'applyVolumes rescales already-playing beds')

  updateSetting('master', 1)
  updateSetting('music', 1)
  updateSetting('sfx', 1)
  assert.deepEqual(getSettings(), { master: 1, music: 1, sfx: 1, sensitivity: 1 })
})

test('the pause sliders and their readouts ship in the overlay', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  for (const marker of [
    'data-screen="pause"',
    'id="masterVolume"',
    'id="musicVolume"',
    'id="sfxVolume"',
    'id="sensitivitySlider"',
    'id="masterVolumeValue"',
    'id="sensitivityValue"',
  ]) {
    assert.ok(html.includes(marker), `${marker} is present in index.html`)
  }
  assert.ok(!html.includes('postFxToggle'), 'the chromatic aberration toggle is gone')
  assert.ok(!html.includes('pauseSettingsBtn'), 'sliders live on the pause screen, not behind a button')
})
