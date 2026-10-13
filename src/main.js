import { Game } from './core/game.js'
import { HIGHWAY_LOAD_EVENT } from './levels/highway/load-progress.js'


const container =
  document.getElementById('app')


const game =
  new Game(container)


const overlay =
  document.getElementById('overlay')


const playBtn =
  document.getElementById('playBtn')

const respawnBtn =
  document.getElementById('respawnBtn')

const trainBtn = document.getElementById('trainBtn')
const level3Btn = document.getElementById('highwayBtn')

// startLevel() replaces a button's markup with "LOADING...", so remember the
// originals and restore them whenever buttons are reset.
const buttonMarkup = new Map([
  [playBtn, playBtn.innerHTML],
  [trainBtn, trainBtn.innerHTML],
  [level3Btn, level3Btn.innerHTML],
])

let loadingButton = null

// Which level the current loading session is for. While a highway load
// is active, the shared `assetprogress` display is bypassed: the Level 3
// session tracker owns the percentage, so cumulative manager totals can
// never drag it backwards. Levels 1 and 2 keep the original path.
let loadingLevel = null
let menuRequest = 0

function exitHighway() {
  if (game.currentLevel !== 'highway') return false
  menuRequest++
  loadingButton = null
  loadingLevel = null
  game.exitToMenu()
  resetLevelButtons()
  overlay.classList.remove('hidden')
  return true
}

window.addEventListener('assetprogress', (event) => {
  if (!loadingButton) return
  if (loadingLevel === 'highway') return
  const { itemsLoaded, itemsTotal } = event.detail
  const pct = itemsTotal > 0 ? Math.round((itemsLoaded / itemsTotal) * 100) : 0
  loadingButton.textContent = `LOADING ${pct}%`
})

window.addEventListener(HIGHWAY_LOAD_EVENT, (event) => {
  if (!loadingButton || loadingLevel !== 'highway') return
  const { loaded, total } = event.detail
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
  loadingButton.textContent = `LOADING ${pct}%`
})
const controlsBtn = document.getElementById('controlsBtn')
const controlsDialog = document.getElementById('controlsDialog')

controlsBtn.addEventListener('click', () => controlsDialog.showModal())
document.getElementById('closeControlsBtn').addEventListener('click', () => controlsDialog.close())



function resetLevelButtons() {
  playBtn.innerHTML = `
    <span class="level-card-number">LEVEL 01</span>
    <span><strong class="level-card-title">Vale Manor</strong><small class="level-card-copy">Old Mill Road · A missing-person investigation</small></span>
    <span class="level-card-action">ENTER</span>
  `

  trainBtn.innerHTML = buttonMarkup.get(trainBtn)
  level3Btn.innerHTML = buttonMarkup.get(level3Btn)

  playBtn.disabled = false
  trainBtn.disabled = false
  level3Btn.disabled = false
}

// ============================================
// BUTTON STATE
// ============================================

function disableLevelButtons() {

  playBtn.disabled = true

  trainBtn.disabled = true

  level3Btn.disabled = true

}


window.addEventListener(
  'levelloaded',
  (event) => {

    respawnBtn.classList.toggle(
      'hidden',
      event.detail.levelName !== 'house'
    )
  }
)


respawnBtn.addEventListener(
  'click',
  () => {

    if (game.respawn()) {

      game.input.lock()
    }
  }
)


// ============================================
// START LEVEL
// ============================================

async function startLevel(
  levelName,
  button
) {
  const request = ++menuRequest

  disableLevelButtons()


  loadingButton = button

  loadingLevel = levelName

  // Level 3 starts at an explicit 0% (its session tracker owns every
  // update from here); other levels keep the original label.
  button.textContent =
    levelName === 'highway'
      ? 'LOADING 0%'
      : 'LOADING...'


  try {

    // IMPORTANT:
    //
    // We do NOT hide the overlay yet.
    //
    // The player will only see the level
    // after the GLB AND collision mesh
    // are completely ready.

    const loaded =
      await game.start(levelName)

    if (request !== menuRequest) return


    if (!loaded) {

      throw new Error(
        'Level failed to load'
      )

    }


    // Model and collisions are now ready.

    resetLevelButtons()


    overlay.classList.add(
      'hidden'
    )

  }

  catch (err) {
    if (request !== menuRequest) return

    console.error(
      'Could not start level:',
      err
    )


    resetLevelButtons()

  }

  finally {
    if (request === menuRequest) {
      loadingButton = null
      loadingLevel = null
    }

  }

}



// ============================================
// HOUSE
// ============================================

playBtn.addEventListener(
  'click',
  () => {

    startLevel(
      'house',
      playBtn
    )

  }
)



// ============================================
// TRAIN
// ============================================

trainBtn.addEventListener(
  'click',
  () => {

    startLevel(
      'train',
      trainBtn
    )

  }
)

// ============================================
// HIGHWAY
// ============================================

level3Btn.addEventListener(
  'click',
  () => {

    startLevel(
      'highway',
      level3Btn
    )

  }
)



// ============================================
// ESCAPE MENU
// ============================================

window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && exitHighway()) return

    if (
      e.key === 'Escape' &&
      game.input.isLocked
    ) {

      game.input.release()

      // Stop Level 3 completely: without this the highway keeps
      // updating, playing audio and running AI behind the menu.
      // exitToMenu() is idempotent and safe mid-load. Other levels keep
      // their existing overlay-resume behaviour.
      if (game.currentLevel === 'highway') {
        game.exitToMenu()
      }


      resetLevelButtons()


      overlay.classList.remove(
        'hidden'
      )

    }

  }
)


document.addEventListener(
  'click',
  (e) => {

    if (
      !game.loaded ||
      game.input.isLocked ||
      game.newspaperOpen ||
      game.evidenceBookOpen ||
      game.houseStoryView?.open ||
      game.currentLevel === 'house'
    ) return

    if (e.target.closest('button')) return

    overlay.classList.add('hidden')
    game.input.lock()

  }
)

document.addEventListener('pointerlockchange', () => {
  if (game.input.isLocked || document.pointerLockElement) {
    if (game.loaded) overlay.classList.add('hidden')
    return
  }
  // Browsers may consume ESC to unlock the pointer without delivering
  // keydown. Deliberate unlock for the retry UI must still allow retry.
  if (game.currentLevel === 'highway') {
    if (game.levelState !== 'GAME_OVER' && game.levelState !== 'NAME_PUZZLE') {
      exitHighway()
    }
    return
  }
  if (game.loaded && !game.newspaperOpen && !game.evidenceBookOpen && !game.houseStoryView?.open) {
    resetLevelButtons()
    const action = playBtn.querySelector('.level-card-action')
    if (action && game.currentLevel === 'house') action.textContent = 'RESUME'
    overlay.classList.remove('hidden')
  }
})

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (game.houseStoryView?.open) game.houseStoryView.closeRite(false)
  if (game.newspaperOpen) game.hideNewspaperReader()
  if (game.evidenceBookOpen) game.closeEvidenceBook(true)
  if (!document.pointerLockElement && game.loaded) {
    // Covers Escape after death (pointer already released for the
    // clickable retry button): exit Level 3 cleanly instead of leaving
    // the highway running behind the menu. Other levels keep their
    // existing overlay behaviour.
    if (game.currentLevel === 'highway') {
      game.exitToMenu()
    }
    resetLevelButtons()
    overlay.classList.remove('hidden')
  }
})
