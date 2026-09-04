import { Game } from './game.js'


const container =
  document.getElementById('app')


const game =
  new Game(container)


const overlay =
  document.getElementById('overlay')


const playBtn =
  document.getElementById('playBtn')



// ============================================
// LEVEL SELECT MENU
// ============================================

playBtn.textContent =
  'LEVEL 1 — HOUSE'


const trainBtn =
  playBtn.cloneNode(true)


trainBtn.removeAttribute('id')

trainBtn.textContent =
  'LEVEL 2 — TRAIN'



const level3Btn =
  playBtn.cloneNode(true)


level3Btn.removeAttribute('id')

level3Btn.textContent =
  'LEVEL 3 — COMING SOON'


level3Btn.disabled = true

level3Btn.style.opacity = '0.45'

level3Btn.style.cursor = 'not-allowed'



playBtn.insertAdjacentElement(
  'afterend',
  trainBtn
)


trainBtn.insertAdjacentElement(
  'afterend',
  level3Btn
)



// ============================================
// ORIGINAL BUTTON TEXT
// ============================================

const HOUSE_TEXT =
  'LEVEL 1 — HOUSE'

const TRAIN_TEXT =
  'LEVEL 2 — TRAIN'



// ============================================
// BUTTON STATE
// ============================================

function disableLevelButtons() {

  playBtn.disabled = true

  trainBtn.disabled = true

}


function enableLevelButtons() {

  playBtn.disabled = false

  trainBtn.disabled = false

}


function resetLevelButtons() {

  playBtn.textContent =
    HOUSE_TEXT

  trainBtn.textContent =
    TRAIN_TEXT


  enableLevelButtons()

}



// ============================================
// START LEVEL
// ============================================

async function startLevel(
  levelName,
  button
) {

  disableLevelButtons()


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


    button.textContent =
      'FAILED — TRY AGAIN'


    enableLevelButtons()

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