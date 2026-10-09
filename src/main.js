import { Game } from './core/game.js'


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

window.addEventListener('assetprogress', (event) => {
  if (!loadingButton) return
  const { itemsLoaded, itemsTotal } = event.detail
  const pct = itemsTotal > 0 ? Math.round((itemsLoaded / itemsTotal) * 100) : 0
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

  disableLevelButtons()


  loadingButton = button

  button.textContent =
    'LOADING...'


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

    console.error(
      'Could not start level:',
      err
    )


    resetLevelButtons()

  }

  finally {

    loadingButton = null

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

    if (
      e.key === 'Escape' &&
      game.input.isLocked
    ) {

      game.input.release()


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
    resetLevelButtons()
    overlay.classList.remove('hidden')
  }
})
