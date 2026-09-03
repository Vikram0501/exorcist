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

// Use the existing Play button as Level 1.
playBtn.textContent =
  'LEVEL 1 — HOUSE'


// Create Level 2 by copying the existing
// button so it keeps the same CSS styling.
const trainBtn =
  playBtn.cloneNode(true)


trainBtn.removeAttribute('id')

trainBtn.textContent =
  'LEVEL 2 — TRAIN'



// Create Level 3.
const level3Btn =
  playBtn.cloneNode(true)


level3Btn.removeAttribute('id')

level3Btn.textContent =
  'LEVEL 3 — COMING SOON'


level3Btn.disabled = true

level3Btn.style.opacity = '0.45'

level3Btn.style.cursor =
  'not-allowed'



// Put Level 2 after Level 1.
playBtn.insertAdjacentElement(
  'afterend',
  trainBtn
)


// Put Level 3 after Level 2.
trainBtn.insertAdjacentElement(
  'afterend',
  level3Btn
)



// ============================================
// START LEVEL
// ============================================

function startLevel(levelName) {

  overlay.classList.add(
    'hidden'
  )


  game.start(levelName)
}



// ============================================
// BUTTONS
// ============================================

playBtn.addEventListener(
  'click',
  () => {

    startLevel('house')
  }
)


trainBtn.addEventListener(
  'click',
  () => {

    startLevel('train')
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


      overlay.classList.remove(
        'hidden'
      )
    }
  }
)