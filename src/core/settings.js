// Shared player settings: the audio mix and look sensitivity.
// Persisted to localStorage so the mix survives reloads; consumers read
// live values through getSettings()/audioGain() and react via subscribe().

const STORAGE_KEY = 'exorcist-settings'

export const DEFAULT_SETTINGS = Object.freeze({
  master: 1,
  music: 1,
  sfx: 1,
  sensitivity: 1,
})

const RANGES = {
  master: [0, 1],
  music: [0, 1],
  sfx: [0, 1],
  sensitivity: [0.25, 3],
}

const listeners = new Set()
let settings = readStored()

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalize(raw) {
  const next = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return next
  for (const key of Object.keys(RANGES)) {
    const value = Number(raw[key])
    if (!Number.isFinite(value)) continue
    const [min, max] = RANGES[key]
    next[key] = clamp(value, min, max)
  }
  return next
}

function readStored() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)))
  } catch {
    // Missing, corrupted, or unavailable storage (private browsing).
    return { ...DEFAULT_SETTINGS }
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* Continue without storage. */ }
}

export function getSettings() {
  return { ...settings }
}

export function updateSetting(key, value) {
  settings = normalize({ ...settings, [key]: value })
  persist()
  const snapshot = getSettings()
  for (const listener of listeners) listener(snapshot)
  return snapshot
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Scale an authored base volume by the master volume and its role bus.
// Roles: 'music' for looping music and ambience beds, 'sfx' for one-shots,
// voices, and engine noise. Returns 0..base so ducking maths still works.
export function audioGain(role, base) {
  return base * settings.master * (settings[role] ?? 1)
}
