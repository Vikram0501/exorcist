import { Game } from './core/game.js'

const game = new Game(document.getElementById('app'))
const overlay = document.getElementById('overlay')
const screens = [...overlay.querySelectorAll('[data-screen]')]
const levels = ['house', 'train', 'highway']
const cards = levels.map(level => document.querySelector(`[data-level="${level}"]`))
const briefing = document.getElementById('briefingCopy')
const briefingTitle = document.getElementById('briefingTitle')
const briefingStatus = document.getElementById('briefingStatus')
const beginCaseBtn = document.getElementById('beginCaseBtn')
const pauseBtn = document.getElementById('pauseBtn')
const nextCaseBtn = document.getElementById('nextCaseBtn')
const completionTitle = document.getElementById('completionTitle')
const completionCopy = document.getElementById('completionCopy')
const caseNotes = {
  house: {
    title: 'CASE 01 / VALE MANOR',
    intro: 'The Order cast you out. Three restless spirits stand between you and redemption. Your first assignment lies behind the doors of Vale Manor. Find Evelyn Vale. Learn what happened to her. Speak the name of the thing that keeps her there.',
    result: 'Evelyn Vale is free. The Order has heard of your work. Your next assignment is a midnight train whose passengers refuse to stay dead.',
  },
  train: {
    title: 'CASE 02 / NIGHT TRAIN',
    intro: 'The train still runs. Its passengers do not remember dying. Follow their traces through the carriages, survive what walks the aisle, and finish the rite before it finds you.',
    result: 'The train runs on quiet. One last case stands between you and the Order: an old highway where a ghost has made the road its own.',
  },
  highway: {
    title: 'CASE 03 / OLD HIGHWAY',
    intro: 'One final haunting. A road without an end. Outrun the thing in the dark, gather the fragments of its name, and perform the last exorcism.',
    result: 'Three spirits laid to rest. The Order can no longer deny what you have done. Your name is yours again—but the dark still knows it.',
  },
}

let unlocked = 0
try {
  unlocked = Math.max(0, Math.min(3, Number.parseInt(localStorage.getItem('exorcist-unlocked'), 10) || 0))
} catch { /* Private browsing can disable storage. */ }

let screen = 'title'
let requestId = 0
let ready = false
let selectedLevel = null

function show(name) {
  screen = name
  screens.forEach(panel => { panel.hidden = panel.dataset.screen !== name })
  overlay.classList.toggle('hidden', name === 'playing')
  pauseBtn.classList.toggle('hidden', name !== 'playing')
}

function updateCards() {
  cards.forEach((card, index) => {
    card.disabled = false
    card.querySelector('.level-card-action').textContent = index < unlocked ? 'REPLAY' : 'ENTER'
  })
}

function caseFiles() {
  if (game.currentLevel) game.exitToMenu()
  requestId++
  ready = false
  updateCards()
  show('cases')
}

async function prepareCase(level) {
  if (!caseNotes[level]) return
  if (game.currentLevel) game.exitToMenu()
  const request = ++requestId
  selectedLevel = level
  ready = false
  briefingTitle.textContent = caseNotes[level].title
  briefing.textContent = caseNotes[level].intro
  briefingStatus.hidden = true
  beginCaseBtn.disabled = true
  beginCaseBtn.textContent = 'PREPARING CASE'
  show('briefing')

  // Start loading immediately behind the cinematic, but keep it on screen
  // long enough to read even when assets are cached.
  game.setPaused(true)
  try {
    const [loaded] = await Promise.all([
      game.start(level, { lockPointer: false }),
      new Promise(resolve => setTimeout(resolve, 4500)),
    ])
    if (request !== requestId) return
    if (!loaded) throw new Error('Level failed to load')
    ready = true
    beginCaseBtn.disabled = false
    beginCaseBtn.textContent = 'BEGIN CASE'
  } catch (error) {
    if (request !== requestId) return
    console.error('Could not start level:', error)
    game.exitToMenu()
    briefingStatus.textContent = 'COULD NOT LOAD CASE. RETURN TO CASE FILES AND TRY AGAIN.'
    briefingStatus.hidden = false
  }
}

function beginCase() {
  if (!ready || screen !== 'briefing') return
  show('playing')
  game.setPaused(false)
  game.input.lock()
}

function pause() {
  if (screen !== 'playing' || !game.loaded) return
  game.setPaused(true)
  show('pause')
  game.input.release()
}

function resume() {
  if (screen !== 'pause') return
  show('playing')
  game.setPaused(false)
  game.input.lock()
}

document.getElementById('startBtn').addEventListener('click', () => prepareCase('house'))
document.getElementById('caseFilesBtn').addEventListener('click', caseFiles)
document.getElementById('titleBtn').addEventListener('click', () => show('title'))
document.getElementById('briefingBackBtn').addEventListener('click', caseFiles)
document.getElementById('completionCasesBtn').addEventListener('click', caseFiles)
document.getElementById('pauseCasesBtn').addEventListener('click', caseFiles)
document.getElementById('resumeBtn').addEventListener('click', resume)
document.getElementById('restartBtn').addEventListener('click', () => prepareCase(selectedLevel))
beginCaseBtn.addEventListener('click', beginCase)
pauseBtn.addEventListener('click', pause)
cards.forEach((card, index) => card.addEventListener('click', () => prepareCase(levels[index])))
nextCaseBtn.addEventListener('click', () => prepareCase(levels[Math.min(levels.indexOf(selectedLevel) + 1, 2)]))

const controlsDialog = document.getElementById('controlsDialog')
const controlSections = [...controlsDialog.querySelectorAll('[data-controls-case]')]
document.querySelectorAll('[data-controls]').forEach(button => button.addEventListener('click', () => {
  const currentCase = screen === 'pause' ? selectedLevel : null
  controlSections.forEach(section => {
    section.hidden = currentCase !== null && section.dataset.controlsCase !== currentCase
  })
  controlsDialog.showModal()
}))
document.getElementById('closeControlsBtn').addEventListener('click', () => controlsDialog.close())
document.getElementById('respawnBtn').addEventListener('click', () => {
  if (game.respawn()) game.input.lock()
})
window.addEventListener('levelloaded', event => {
  document.getElementById('respawnBtn').classList.toggle('hidden', event.detail.levelName !== 'house')
})

window.addEventListener('levelcomplete', event => {
  const level = event.detail.levelName
  if (level !== selectedLevel) return
  // Finish after the level's current update, which may have fired the event.
  queueMicrotask(() => {
    if (level !== selectedLevel || screen !== 'playing') return
    const index = levels.indexOf(level)
    unlocked = Math.max(unlocked, index + 1)
    try { localStorage.setItem('exorcist-unlocked', String(unlocked)) } catch { /* Continue without storage. */ }
    game.exitToMenu()
    completionTitle.textContent = index === 2 ? 'THE LAST RITE' : `CASE 0${index + 1} CLOSED`
    completionCopy.textContent = caseNotes[level].result
    nextCaseBtn.hidden = index === 2
    nextCaseBtn.textContent = `BEGIN CASE 0${index + 2}`
    show('complete')
  })
})

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || controlsDialog.open) return
  if (screen === 'pause') {
    event.preventDefault()
    resume()
  } else if (screen === 'playing') {
    if (game.houseStoryView?.open || game.trainRiteView?.open || game.newspaperOpen || game.evidenceBookOpen) return
    event.preventDefault()
    pause()
  }
})

// The browser may consume Escape to unlock the mouse without a keydown.
document.addEventListener('pointerlockchange', () => {
  if (screen !== 'playing' || !game.loaded || game.input.isLocked || document.pointerLockElement) return
  if (game.houseStoryView?.open || game.trainRiteView?.open || game.newspaperOpen || game.evidenceBookOpen || game.gameOverEl || game.namePuzzleEl || game.trainEnding?.active || game.trainEnding?.finished) return
  pause()
})

updateCards()
show('title')
