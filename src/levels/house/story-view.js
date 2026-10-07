import { HOUSE_EVIDENCE, RITE_QUESTIONS } from './story.js'

export function buildHouseJournalEntries(game) {
  const entries = []
  for (const id of ['newspaper', 'vale-frame']) {
    if (!game.inspectedEvidence.has(id)) continue
    const item = game.investigationItems.find(candidate => candidate.id === id)
    if (item) entries.push(item)
  }
  if (game.bedroomPhoneAnswered) entries.push({
    id: 'bedroom-phone', title: 'The impossible call', foundAt: 'Upstairs, main bedroom',
    storyNote: 'Evelyn called after I inspected her damaged portrait. She said the upstairs voice sounded like her dead mother Margaret and directed me to the diary beside her bed.',
    riteNote: 'Evelyn is asking for help. The voice imitating Margaret belongs to another spirit.',
  })
  for (const item of HOUSE_EVIDENCE) {
    if (game.inspectedEvidence.has(item.id)) entries.push(item)
  }
  if (game.houseStory?.pursuit.state === 'safe' || game.houseStory?.released) entries.push({
    id: 'evelyn-grave', title: "Evelyn's unmarked grave", foundAt: 'Backyard',
    storyNote: 'The unmarked grave behind the house is where Daniel buried Evelyn. Elias stopped pursuing me at its edge.',
    riteNote: 'The exorcism can begin here. Use the music-box melody, tell Evelyn the truth, and name Elias Wren.',
  })
  if (game.houseStory?.released) entries.push({
    id: 'completed-rite', title: 'The exorcism', foundAt: "Evelyn's grave",
    storyNote: 'I remembered Margaret’s melody, told Evelyn what Daniel concealed, and banished Elias Wren by name. Evelyn appeared to thank me.',
    riteNote: 'Evelyn is at rest. Elias has left the manor.',
  })
  if (game.houseStory?.complete) entries.push({
    id: 'closed-case', title: 'Case closed', foundAt: 'Front road',
    storyNote: 'I left Vale Manor after the rite. The truth of Evelyn’s disappearance is recorded here.',
    riteNote: 'Evelyn Vale was found and released.',
  })
  return entries
}

export function renderJournal(book, entries) {
  if (!book) return
  book.querySelectorAll('[data-story-entry]').forEach(entry => entry.remove())
  book.querySelector('.evidence-empty').hidden = entries.length > 0
  for (const item of entries) {
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
    if (story?.pursuit.state === 'caught' && story.jumpScareTime <= 0 && this.outcome !== 'caught') this.showOutcome('caught')
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
    const wrongAnswer = type === 'caught' && this.game.houseStory.failureReason === 'wrong-answer'
    title.textContent = type === 'caught'
      ? (wrongAnswer ? 'The rite failed' : 'Elias found you')
      : 'The exorcism is complete'
    const copy = document.createElement('p')
    copy.textContent = type === 'caught'
      ? (wrongAnswer
          ? 'Elias broke the rite. Your field notes are safe. Return to the grave and begin again.'
          : 'Your field notes are safe. You can try again from the front of the house.')
      : 'Evelyn Vale is at rest. Elias Wren has been banished from the manor.'
    const action = document.createElement('button')
    action.type = 'button'
    action.textContent = type === 'caught' ? 'Respawn at front of house' : 'Return to the case menu'
    action.addEventListener('click', () => {
      if (type === 'caught') {
        this.game.houseStory.retryPursuit(this.game.player, this.game.spawnPoint, this.game.spawnYaw)
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
    label.textContent = `THE EXORCISM / ${story.riteStep + 1} OF ${RITE_QUESTIONS.length}`
    const title = document.createElement('h2')
    title.id = 'riteTitle'
    title.textContent = question.title
    const copy = document.createElement('p')
    copy.textContent = 'Use the evidence you gathered to free Evelyn and name the spirit that held her.'
    panel.append(label, title, copy)
    question.choices.forEach((choice, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = choice
      button.addEventListener('click', () => {
        if (!story.answerRite(index)) {
          this.closeRite(false)
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
    back.textContent = 'Step back'
    back.addEventListener('click', () => this.closeRite())
    const notes = document.createElement('button')
    notes.type = 'button'
    notes.className = 'rite-back'
    notes.textContent = 'Open field notes'
    notes.addEventListener('click', () => this.game.openEvidenceBook())
    panel.append(feedback, notes, back)
    this.dialog.append(panel)
    panel.querySelector('button').focus()
  }

  closeRite(resume = true) {
    this.open = false
    this.dialog.classList.add('hidden')
    if (resume) this.game.input.lock()
  }

  updateJournal() {
    renderJournal(document.querySelector('.evidence-notepad'), buildHouseJournalEntries(this.game))
  }

  dispose() {
    this.caption.remove()
    this.dialog.remove()
    document.querySelectorAll('[data-story-entry]').forEach(entry => entry.remove())
  }
}
