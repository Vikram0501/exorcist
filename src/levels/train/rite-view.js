export class TrainRiteView {
  constructor(game) {
    this.game = game
    this.dialog = document.createElement('section')
    this.dialog.id = 'trainRite'
    this.dialog.className = 'hidden'
    this.dialog.setAttribute('role', 'dialog')
    this.dialog.setAttribute('aria-modal', 'true')
    this.dialog.setAttribute('aria-labelledby', 'riteTitle')
    document.body.append(this.dialog)
    this.dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return
      const buttons = [...this.dialog.querySelectorAll('button')]
      const index = buttons.indexOf(document.activeElement)
      const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
      event.preventDefault()
      buttons[next]?.focus()
    })
    this.open = false
    this.outcome = null
  }

  openRite() {
    const story = this.game.trainStory
    if (!story || !story.canBeginRite() || this.open) return
    this.open = true
    this.outcome = null
    this.game.input.release()
    this.renderRite()
  }

  renderRite() {
    const story = this.game.trainStory
    if (!story) return
    this.dialog.replaceChildren()
    this.dialog.classList.remove('hidden')

    const panel = document.createElement('div')
    panel.className = 'rite-panel'

    const label = document.createElement('p')
    label.className = 'evidence-label'
    label.textContent = `THE EXORCISM / MARK ${story.assembled.length} OF ${story.answer.length}`

    const title = document.createElement('h2')
    title.id = 'riteTitle'
    title.textContent = 'Speak its name'

    const copy = document.createElement('p')
    copy.textContent = story.assembled.length >= story.answer.length
      ? 'The name is whole in the ash ring. Say it once, out loud, and let the line end.'
      : 'The ring is waiting. Rebuild the name mark by mark from your field notes, in the order it was written.'

    const slots = document.createElement('div')
    slots.className = 'rite-slots'
    story.answer.forEach((char, index) => {
      const slot = document.createElement('span')
      slot.className = 'rite-slot'
      slot.textContent = story.assembled[index] || '·'
      if (story.assembled[index]) slot.classList.add('filled')
      slots.append(slot)
    })

    panel.append(label, title, copy, slots)

    if (story.assembled.length >= story.answer.length) {
      const speak = document.createElement('button')
      speak.type = 'button'
      speak.className = 'rite-speak'
      speak.textContent = 'SPEAK THE NAME'
      speak.addEventListener('click', () => this.speak())
      panel.append(speak)
    } else {
      const tray = document.createElement('div')
      tray.className = 'rite-tray'
      for (const char of story.riteMarks.filter(mark => !story.assembled.includes(mark))) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = char
        button.addEventListener('click', () => this.pick(char))
        tray.append(button)
      }
      panel.append(tray)
    }

    const feedback = document.createElement('p')
    feedback.className = 'rite-feedback'
    feedback.setAttribute('role', 'status')

    const notes = document.createElement('button')
    notes.type = 'button'
    notes.className = 'rite-back'
    notes.textContent = 'Open field notes'
    notes.addEventListener('click', () => this.game.openEvidenceBook())

    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'rite-back'
    back.textContent = 'Step back'
    back.addEventListener('click', () => this.closeRite())

    panel.append(feedback, notes, back)
    this.dialog.append(panel)
    panel.querySelector('button')?.focus()
  }

  pick(char) {
    const story = this.game.trainStory
    if (!story || story.released) return
    const result = story.pickMark(char)
    if (result === 'wrong') {
      this.showOutcome('broken')
      return
    }
    if (result) this.renderRite()
  }

  speak() {
    if (!this.game.trainStory?.speakName()) return
    this.closeRite()
  }

  showOutcome(type) {
    const story = this.game.trainStory
    this.outcome = type
    this.open = true
    this.game.input.release()
    this.dialog.replaceChildren()
    this.dialog.classList.remove('hidden')

    const panel = document.createElement('div')
    panel.className = 'rite-panel'

    const title = document.createElement('h2')
    title.id = 'riteTitle'
    const copy = document.createElement('p')
    const action = document.createElement('button')
    action.type = 'button'

    if (type === 'broken') {
      title.textContent = 'The rite broke'
      copy.textContent = 'That is not its name. The syllables carried down the aisle, and something heard them. Your field notes are safe — begin again once the carriage is clear.'
      action.textContent = 'Begin again'
      action.addEventListener('click', () => {
        if (story) story.failureReason = null
        const player = this.game.player
        if (player) this.game.trainZombie?.stalk(player.position.x, player.position.z)
        this.outcome = null
        this.closeRite()
      })
    } else {
      title.textContent = 'The exorcism is complete'
      copy.textContent = 'The thing that walked the aisle answered to its name and stopped. The train runs on into the dark, and it is quiet now.'
      action.textContent = 'Return to the case menu'
      action.addEventListener('click', () => {
        this.closeRite(false)
        document.getElementById('overlay')?.classList.remove('hidden')
      })
    }

    panel.append(title, copy, action)
    this.dialog.append(panel)
    action.focus()
  }

  update(dt) {
    const story = this.game.trainStory
    if (story?.complete && story.time - story.endingTime > 5 && this.outcome !== 'complete') {
      this.showOutcome('complete')
    }
  }

  closeRite(resume = true) {
    this.open = false
    this.outcome = null
    this.dialog.classList.add('hidden')
    if (resume) this.game.input.lock()
  }

  dispose() {
    this.dialog.remove()
    this.open = false
    this.outcome = null
  }
}
