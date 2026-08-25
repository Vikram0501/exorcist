import { Game } from './game.js'

const container = document.getElementById('app')
const game = new Game(container)

const overlay = document.getElementById('overlay')
const playBtn = document.getElementById('playBtn')

playBtn.addEventListener('click', () => {
  overlay.classList.add('hidden')
  game.start()
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game.input.isLocked) {
    game.input.release()
    overlay.classList.remove('hidden')
  }
})