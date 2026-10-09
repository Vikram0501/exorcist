import { Game } from './core/game.js'

const game = new Game(document.getElementById('app'))
const overlay = document.getElementById('overlay')
const playBtn = document.getElementById('playBtn')
const respawnBtn = document.getElementById('respawnBtn')
const buttonMarkup = playBtn.innerHTML
const controlsDialog = document.getElementById('controlsDialog')
let loading = false

document.getElementById('controlsBtn').addEventListener('click', () => controlsDialog.showModal())
document.getElementById('closeControlsBtn').addEventListener('click', () => controlsDialog.close())

function resetPlayButton() {
  playBtn.innerHTML = buttonMarkup
  playBtn.disabled = false
  if (game.loaded) playBtn.querySelector('.level-card-action').textContent = 'RESUME'
}

window.addEventListener('assetprogress', (event) => {
  if (!loading) return
  const { itemsLoaded, itemsTotal } = event.detail
  const pct = itemsTotal > 0 ? Math.round((itemsLoaded / itemsTotal) * 100) : 0
  playBtn.textContent = `LOADING ${pct}%`
})

window.addEventListener('levelloaded', () => respawnBtn.classList.remove('hidden'))
respawnBtn.addEventListener('click', () => {
  if (game.respawn()) game.input.lock()
})

playBtn.addEventListener('click', async () => {
  if (loading) return
  loading = true
  playBtn.disabled = true
  playBtn.textContent = 'LOADING...'
  try {
    if (!await game.start()) throw new Error('Level 1 failed to load')
    overlay.classList.add('hidden')
  } catch (error) {
    console.error('Could not start Level 1:', error)
  } finally {
    loading = false
    resetPlayButton()
  }
})

document.addEventListener('pointerlockchange', () => {
  if (game.input.isLocked || document.pointerLockElement) {
    if (game.loaded) overlay.classList.add('hidden')
    return
  }
  if (game.loaded && !game.newspaperOpen && !game.evidenceBookOpen && !game.houseStoryView?.open) {
    resetPlayButton()
    overlay.classList.remove('hidden')
  }
})

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (game.houseStoryView?.open) game.houseStoryView.closeRite(false)
  if (game.newspaperOpen) game.hideNewspaperReader()
  if (game.evidenceBookOpen) game.closeEvidenceBook(true)
  if (game.input.isLocked) game.input.release()
  if (!document.pointerLockElement && game.loaded) {
    resetPlayButton()
    overlay.classList.remove('hidden')
  }
})
