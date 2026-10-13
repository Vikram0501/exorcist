import { JOURNAL_ENTRIES, kanaLetters, shuffle } from './story-data.js'

export const HOLD_SECONDS = 1.2
export const RITE_HOLD_SECONDS = 2.5

export class TrainStory {
  constructor({ plan, items, nameBoard = null, onMessage = () => {}, rng = Math.random }) {
    this.profile = plan.profile
    this.items = items || []
    this.nameBoard = nameBoard
    this.onMessage = onMessage
    this.total = plan.letters.length
    this.found = new Set()
    this.slotsDone = new Set()
    this.journalSeen = new Set()
    this.holdingItem = null
    this.holdTime = 0
    this.time = 0
    this.frontZ = Infinity
    this.exitZ = -Infinity
    this.answer = kanaLetters(plan.profile)
    this.riteMarks = shuffle([...this.answer], rng)
    this.assembled = []
    this.failureReason = null
    this.released = false
    this.releaseTime = 0
    this.complete = false
    this.endingTime = 0
  }

  letterItem(id) {
    return this.items.find((item) => item.id === id) || null
  }

  get nameComplete() {
    return this.slotsDone.size >= this.total
  }

  canInspect(id) {
    const item = this.letterItem(id)
    return !!item && !this.found.has(id)
  }

  canBeginRite() {
    return this.nameComplete && !this.released
  }

  prompt(item) {
    if (!item) return ''
    if (item.kind === 'rite') {
      if (this.released) return 'The name is spoken · leave the burnt carriage'
      if (!this.nameComplete) return `The name is not whole · ${this.slotsDone.size} of ${this.total} marks`
      return 'Hold E · Speak the name'
    }
    if (this.found.has(item.id)) return `${item.title} · recorded in field notes`
    if (item.kind === 'note') return 'Hold E · Read the letter'
    return item.kind === 'residue' ? 'Hold E · Read the residue' : 'Hold E · Read the mark'
  }

  hold(dt, item) {
    if (!item || this.found.has(item.id)) return false
    if (item.kind === 'rite' && !this.canBeginRite()) return false
    if (this.holdingItem?.id !== item.id) {
      this.holdingItem = item
      this.holdTime = 0
    }
    this.holdTime += dt
    if (this.holdTime >= (item.kind === 'rite' ? RITE_HOLD_SECONDS : HOLD_SECONDS)) {
      this.holdTime = 0
      this.holdingItem = null
      return true
    }
    return false
  }

  get progress() {
    if (!this.holdingItem) return 0
    const seconds = this.holdingItem.kind === 'rite' ? RITE_HOLD_SECONDS : HOLD_SECONDS
    return Math.min(1, this.holdTime / seconds)
  }

  releaseHold() {
    this.holdingItem = null
    this.holdTime = 0
  }

  read(item) {
    if (!item || item.kind === 'rite' || this.found.has(item.id)) return false
    this.found.add(item.id)
    if (item.slot !== undefined) {
      this.slotsDone.add(item.slot)
      this.nameBoard?.revealLetter?.(item.slot)
    }
    if (item.kind === 'letter') {
      const mark = item.slot + 1
      this.onMessage(`IT REMEMBERS · ${item.char} · mark ${mark} of ${this.total}`)
    } else if (item.kind !== 'note') {
      this.onMessage(`INFERRED · ${item.title} · read its field note`)
    }
    return true
  }

  pickMark(char) {
    if (!this.canBeginRite()) return false
    if (char !== this.answer[this.assembled.length]) {
      this.failRite('wrong-mark')
      return 'wrong'
    }
    this.assembled.push(char)
    return true
  }

  failRite(reason = 'wrong-mark') {
    if (this.released) return false
    this.failureReason = reason
    this.assembled = []
    return true
  }

  speakName() {
    if (!this.canBeginRite() || this.assembled.length < this.answer.length) return false
    this.released = true
    this.releaseTime = this.time
    this.onMessage('IT HEARS ITS NAME · THE AISLE FALLS QUIET', 8)
    return true
  }

  update(dt, player) {
    this.time += dt
    if (!player) return
    if (player.position.z >= this.frontZ) this.journalSeen.add('the-fire')
    if (this.released && !this.complete && player.position.z <= this.exitZ) {
      this.complete = true
      this.endingTime = this.time
      this.onMessage('CASE CLOSED · THE TRAIN RUNS ON QUIET', 8)
    }
  }

  objective() {
    if (this.complete) return 'CASE CLOSED · THE TRAIN RUNS ON QUIET'
    if (this.released) return 'THE NAME IS SPOKEN · LEAVE THE BURNT CARRIAGE'
    if (this.slotsDone.size === 0) return 'FIND ITS NAME · DO NOT BE SEEN'
    if (this.nameComplete) return 'ITS NAME IS COMPLETE · SPEAK IT IN THE BURNT CARRIAGE'
    return `READ ITS NAME · ${this.slotsDone.size} / ${this.total} · DO NOT BE SEEN`
  }

  journalEntries() {
    const entries = []
    for (const item of this.items) {
      if (item.kind === 'note' && this.found.has(item.id)) entries.push(item)
    }
    for (const item of this.items) {
      if (item.kind === 'residue' && this.found.has(item.id)) entries.push(item)
    }
    const letters = this.items
      .filter((item) => item.kind === 'letter' && this.found.has(item.id))
      .sort((a, b) => a.slot - b.slot)
    entries.push(...letters)
    for (const entry of JOURNAL_ENTRIES) {
      if (entry.at === 'front' && this.journalSeen.has(entry.id)) entries.push(entry)
      if (entry.at === 'rite' && this.released) entries.push(entry)
      if (entry.at === 'end' && this.complete) entries.push(entry)
    }
    return entries
  }

  dispose() {
    this.nameBoard = null
    this.found.clear()
    this.slotsDone.clear()
    this.journalSeen.clear()
    this.assembled = []
    this.riteMarks = []
    this.answer = []
  }
}
