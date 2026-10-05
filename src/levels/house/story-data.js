export const HOUSE_EVIDENCE = [
  {
    id: 'evelyn-diary', title: "Evelyn's diary", foundAt: "Upstairs, beside Evelyn's bed",
    assetNames: ['Diary'], position: [1, 5.72, 4.3], label: 'EVELYN VALE', inspectionMode: 'object',
    storyNote: '8 SEPTEMBER. The footsteps are back. They start upstairs after Dad turns out the lights. Yesterday a lamp moved from my room to the hall. Dad says I am hearing the pipes, but pipes do not stop outside my door.\n\n11 SEPTEMBER. I heard Mum singing from the annex. Mum died last winter. It knew her words but missed the last note of her song. I wound her music box and the singing stopped.\n\n12 SEPTEMBER. Dad says I must stay away from the annex. I saw a lady at the top of the stairs. When I looked again she was gone. She calls to me in Mum’s voice…',
    riteNote: 'The voice upstairs imitates Margaret. Evelyn recognized that its music-box tune was wrong.',
    response: 'EVELYN · “It knew her words, but not her song.”',
  },
  {
    id: 'music-box', title: "Margaret's music box", foundAt: 'Upstairs, main bedroom',
    assetNames: ['Music Box'], position: [1, 5.72, 4.3], label: 'MARGARET / EVELYN', kind: 'box', inspectionMode: 'object',
    storyNote: 'Margaret gave this music box to Evelyn. Its tune reaches the final note that the upstairs voice never could. For a moment, the footsteps stop. Evelyn may still recognize it.',
    riteNote: 'Remember Margaret’s music-box melody at Evelyn’s grave. It is her anchor, and it quiets Elias.',
    response: 'The melody finishes. The footsteps above you stop.',
  },
  {
    id: 'annex-message', title: 'The wall scratches', foundAt: 'Upstairs, the locked annex',
    position: [-1.65, 5.72, 3.65], label: 'SHE IS NOT MOTHER', kind: 'engraving',
    storyNote: 'SHE IS NOT MOTHER. FATHER LOCKED THE DOOR. I WAS HERE. Beneath the larger letters, Evelyn scratched one more line from inside the room: “She came through anyway.”',
    riteNote: 'Daniel locked Evelyn in the annex. A locked door could not stop the spirit.',
    response: 'EVELYN · “She came through anyway.”',
  },
  {
    id: 'caretaker-record', title: 'Vale estate service record', foundAt: 'Kitchen',
    assetNames: ['Aged Vale Estate Service Record'], position: [0, 2, 0], label: 'VALE ESTATE',
    storyNote: 'ELIAS WREN. CARETAKER. DIED 17 NOVEMBER 1931 ON THE VALE PROPERTY. Following her death, the upper rooms were repeatedly found lit and unlocked. The family reported footsteps when the house was empty. The record was closed without explanation.',
    riteNote: 'Elias Wren is the older spirit. An exorcist must speak her full name to banish her.',
    response: 'ELIAS · “You know my name now.”',
  },
  {
    id: 'daniel-confession', title: "Daniel's confession", foundAt: 'Kitchen, inside the envelope',
    assetNames: ['Daniel Envelope'], position: [0, 2, 0], label: 'I COULD NOT TELL THEM', kind: 'confession',
    storyNote: 'Evelyn heard Margaret’s voice in the upstairs annex. I knew Margaret was dead, and I knew something else was walking our house. I locked Evelyn in that room while I went for help. I thought the door would keep her away from it. When I returned, the door was still locked. Evelyn was dead inside.\n\nI buried her in the unmarked grave behind the house. I told everyone she had vanished. I scratched her face from our portrait because I could not bear to meet her eyes. None of that kept her here. It only left her alone with the thing that killed her.\n\nHer name was Evelyn Vale. She did not run away. — Daniel',
    riteNote: 'Daniel locked Evelyn in the annex. Elias entered and killed her. Daniel hid her body in the unmarked backyard grave and scratched out her portrait.',
    response: 'Daniel’s letter is revealed. Elias is close. Read it, then run.',
  },
]

export const RITE_QUESTIONS = [
  { title: 'What detail exposed the voice as an imitation of Margaret?', choices: ['It used the wrong name for Daniel.', 'It missed the last note of her song.', 'It came from the telephone.', 'It spoke only after sunrise.'], answer: 1, line: 'The voice missed the last note. It was never Margaret.' },
  { title: 'What can restore the melody Evelyn remembers?', choices: ['The song in Margaret’s music box.', 'The tune of the upstairs telephone.', 'The words on the annex wall.', 'The family portrait.'], answer: 0, line: 'Evelyn Vale, I remember your mother’s song. You are remembered.' },
  { title: 'What happened behind the locked annex door?', choices: ['Evelyn escaped before morning.', 'Daniel hid there from Elias.', 'Daniel locked Evelyn in; Elias came through anyway.', 'Margaret led Evelyn outside.'], answer: 2, line: 'You were locked away. Elias came through the door. None of this was your fault.' },
  { title: 'Who scratched Evelyn’s face from the portrait, and why?', choices: ['Elias, to erase her name.', 'Daniel, because he could not meet her eyes.', 'Margaret, before she died.', 'Evelyn, to warn the family.'], answer: 1, line: 'Daniel hid the truth, but he could not erase you.' },
  { title: 'Name the older spirit from the estate record.', choices: ['Margaret Vale', 'Evelyn Vale', 'Elias Wren', 'Daniel Vale'], answer: 2, line: 'Elias Wren, I know your name. Leave this house and release her.' },
]
