import { HOUSE_EVIDENCE, RITE_QUESTIONS } from './story.js'

export class HouseStoryView {
  constructor(game) {
    this.game = game
    this.remaining = 0
    this.caption = document.createElement('div')
    this.caption.id = 'houseCaption'
    this.caption.setAttribute('role', 'status')
    this.caption.className = 'hidden'
    document.body.append(this.caption)
    this.dialog = document.createElement('section')
    this.dialog.id = 'houseRite'
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

  message(text, duration = 8) {
    this.caption.textContent = text
    this.remaining = duration
    this.caption.classList.remove('hidden')
  }

  update(dt, active) {
    if (active) this.remaining = Math.max(0, this.remaining - dt)
    this.caption.classList.toggle('hidden', this.remaining <= 0 || !active)
    const story = this.game.houseStory
    if (story?.pursuit.state === 'caught' && this.outcome !== 'caught') this.showOutcome('caught')
    if (story?.complete && story.time - story.endingTime > 5 && this.outcome !== 'complete') this.showOutcome('complete')
  }

  showOutcome(type) {
    this.outcome = type
    this.open = true
    this.game.input.release()
    this.dialog.replaceChildren()
    this.dialog.classList.remove('hidden')
    const panel = document.createElement('div')
    panel.className = 'rite-panel'
    const title = document.createElement('h2')
    title.textContent = type === 'caught' ? 'Elias found you' : 'Evelyn Vale is free'
    const copy = document.createElement('p')
    copy.textContent = type === 'caught'
      ? 'The music box is still with you. Your evidence is safe. Run to the two graves behind the house.'
      : 'Her disappearance is explained. The older presence remains in the house.'
    const action = document.createElement('button')
    action.type = 'button'
    action.textContent = type === 'caught' ? 'Try the crossing again' : 'Return to the case menu'
    action.addEventListener('click', () => {
      if (type === 'caught') {
        this.game.houseStory.retryPursuit(this.game.player)
        this.outcome = null
        this.closeRite()
      } else {
        this.closeRite(false)
        document.getElementById('overlay')?.classList.remove('hidden')
      }
    })
    panel.append(title, copy, action)
    this.dialog.append(panel)
    action.focus()
  }

  openRite() {
    if (this.game.houseStory.released) return
    this.open = true
    this.game.input.release()
    this.renderRite()
  }

  renderRite(error = '') {
    const story = this.game.houseStory
    const question = RITE_QUESTIONS[story.riteStep]
    this.dialog.replaceChildren()
    this.dialog.classList.remove('hidden')
    const panel = document.createElement('div')
    panel.className = 'rite-panel'
    const label = document.createElement('p')
    label.className = 'evidence-label'
    label.textContent = `THE RELEASE / ${story.riteStep + 1} OF 3`
    const title = document.createElement('h2')
    title.id = 'riteTitle'
    title.textContent = question.title
    const copy = document.createElement('p')
    copy.textContent = 'Speak for Evelyn. The other voice does not belong in this rite.'
    panel.append(label, title, copy)
    question.choices.forEach((choice, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = choice
      button.addEventListener('click', () => {
        if (!story.answerRite(index)) {
          this.renderRite('The voice answers too quickly. That is his memory, not hers. Consult your notes and try again.')
        } else if (story.released) {
          this.closeRite()
        } else {
          this.renderRite()
        }
      })
      panel.append(button)
    })
    const feedback = document.createElement('p')
    feedback.className = 'rite-feedback'
    feedback.setAttribute('role', 'status')
    feedback.textContent = error
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'rite-back'
    back.textContent = 'Step back / consult field notes'
    back.addEventListener('click', () => this.closeRite())
    panel.append(feedback, back)
    this.dialog.append(panel)
    panel.querySelector('button').focus()
  }

  closeRite(resume = true) {
    this.open = false
    this.dialog.classList.add('hidden')
    if (resume) this.game.input.lock()
  }

  updateJournal() {
    const book = document.querySelector('.evidence-notepad')
    book.querySelectorAll('[data-story-entry]').forEach(entry => entry.remove())
    const entries = [...HOUSE_EVIDENCE]
    if (this.game.kitchenPhoneAnswered) entries.unshift({ id: 'kitchen-phone', title: 'The impossible call', foundAt: 'Kitchen', storyNote: 'A girl asked me to read what she left upstairs. She warned that the voice of her mother was an imitation.', riteNote: 'Two presences. Listen to what they say, not whose voice they use.' })
    for (const item of entries) {
      if (item.id !== 'kitchen-phone' && !this.game.inspectedEvidence.has(item.id)) continue
      const entry = document.createElement('article')
      entry.dataset.storyEntry = item.id
      entry.className = 'story-journal-entry'
      const title = document.createElement('h3')
      title.textContent = item.title
      const location = document.createElement('small')
      location.textContent = item.foundAt
      const body = document.createElement('p')
      body.textContent = item.storyNote
      const fact = document.createElement('p')
      fact.className = 'evidence-clue'
      fact.textContent = item.riteNote
      entry.append(location, title, body, fact)
      book.insertBefore(entry, document.getElementById('closeEvidenceNotepadBtn'))
    }
  }

  dispose() {
    this.caption.remove()
    this.dialog.remove()
    document.querySelectorAll('[data-story-entry]').forEach(entry => entry.remove())
  }
}
