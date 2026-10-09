import { JOURNAL_ENTRIES } from './story-data.js'

export const HOLD_SECONDS = 1.2

export class TrainStory {
  constructor({ plan, items, nameBoard = null, onMessage = () => {} }) {
    this.profile = plan.profile
    this.items = items || []
    this.nameBoard = nameBoard
    this.onMessage = onMessage
    this.total = plan.letters.length
    this.found = new Set()
    this.slotsDone = new Set()
    this.journalSeen = new Set()
    this.holdingId = null
    this.holdTime = 0
    this.time = 0
    this.frontZ = Infinity
  }

  letterItem(id) {
    return this.items.find((item) => item.id === id) || null
  }

  canInspect(id) {
    const item = this.letterItem(id)
    return !!item && !this.found.has(id)
  }

  prompt(item) {
    if (!item) return ''
    if (this.found.has(item.id)) return `${item.title} · recorded in field notes`
    if (item.kind === 'note') return 'Hold E · Read the letter'
    return item.kind === 'residue' ? 'Hold E · Read the residue' : 'Hold E · Read the mark'
  }

  hold(dt, item) {
    if (!item || this.found.has(item.id)) return false
    if (this.holdingId !== item.id) {
      this.holdingId = item.id
      this.holdTime = 0
    }
    this.holdTime += dt
    if (this.holdTime >= HOLD_SECONDS) {
      this.holdTime = 0
      this.holdingId = null
      return true
    }
    return false
  }

  get progress() {
    return this.holdingId ? Math.min(1, this.holdTime / HOLD_SECONDS) : 0
  }

  releaseHold() {
    this.holdingId = null
    this.holdTime = 0
  }

  read(item) {
    if (!item || this.found.has(item.id)) return false
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

  update(dt, player) {
    this.time += dt
    if (player && player.position.z >= this.frontZ) this.journalSeen.add('the-fire')
  }

  objective() {
    if (this.slotsDone.size === 0) return 'FIND ITS NAME · DO NOT BE SEEN'
    if (this.slotsDone.size >= this.total) return 'ITS NAME IS COMPLETE · REACH THE FRONT CAR'
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
    }
    return entries
  }

  dispose() {
    this.nameBoard = null
    this.found.clear()
    this.slotsDone.clear()
    this.journalSeen.clear()
  }
}
