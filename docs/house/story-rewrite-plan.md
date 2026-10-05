# Vale Manor: current story and asset wiring

The source Level 1 scene is `public/levels/house/models/house.glb`; the game
loads the optimized `house-runtime.glb`. The player
is an exorcist investigating the disappearance of sixteen-year-old Evelyn Vale.
The older, hostile ghost is **Elias Wren**, a woman and former caretaker. The
separate `Evelyn` model appears only after the exorcism.

## What happened

Evelyn's mother Margaret died the previous winter. Elias imitated Margaret's
voice while footsteps and moving lights troubled the house. Daniel locked
Evelyn in the upstairs annex, thinking a closed door would protect her while
he sought help. Elias passed through and killed her. Daniel buried Evelyn in
the unmarked grave behind the house, told everyone she had vanished, and
scratched her face out of the family portrait. The newspaper photograph still
shows Evelyn's face.

## Route

1. Read the existing Canva newspaper on the porch. It identifies Evelyn and
   reports the upstairs footsteps and moving lights.
2. Inspect the scratched family portrait inside. Closing the inspection
   starts the telephone ringing three seconds later.
3. Answer the phone in the **upstairs main bedroom**, next to the music box.
   Evelyn points the exorcist toward her diary and warns against the voice
   that sounds like Margaret.
4. Read the authored `Diary` beside Evelyn's bed. Inspect the `Music Box` in
   the main bedroom. There is **no key**; the box is available after the call.
5. Read the generated scratches inside the upstairs annex: `SHE IS NOT
   MOTHER`, `FATHER LOCKED THE DOOR`, `I WAS HERE`.
6. Read the `Aged Vale Estate Service Record` in the **kitchen**. It names
   Elias Wren and calls her a former caretaker who died in 1931.
7. After those four clues, open `Daniel Envelope` in the kitchen. The envelope
   remains and the separate `Daniels Letter` appears in the world and inspection
   view. Closing the inspection starts the main scare and Elias's chase.
8. Sprint to the **single unmarked grave** behind the house. If caught, respawn
   at the front of the house with evidence intact.
9. At the grave, answer five questions covering the melody, the annex, the
   portrait, and the older spirit, then banish
   Elias Wren by name. The hostile ghost disappears. The separate translucent
   Evelyn appears, thanks the exorcist, and fades.
10. Return to the front road to close the case.

All long readable copy is in `src/levels/house/story-data.js`; the inspection
view and evidence journal display it even when the model texture is difficult
to read. The existing newspaper artwork, portrait, ghost, phone, and grave are
kept. The wall scratches are generated in code. The fourth place setting is
no longer an investigation interaction.

## Authored object names in the GLB

| Object name | Role |
| --- | --- |
| `Newspaper_front` | Porch newspaper |
| `Frame1` | Scratched family portrait |
| `Phone` | Main-bedroom telephone |
| `Diary` | Physical diary beside Evelyn's bed |
| `Diary Entry` | Readable page shown when the diary is inspected |
| `Music Box` | Main-bedroom music box |
| `Aged Vale Estate Service Record` | Kitchen record |
| `Daniel Envelope` | Kitchen interaction target |
| `Daniels Letter` | Hidden until the envelope is opened |
| `Ghost` | Hostile Elias model and jump scares |
| `Evelyn` | Hidden until the completed exorcism |
| `grave` | Evelyn's unmarked grave and safe area |

All evidence remains in the world after inspection. The field notes record each
discovery, including the phone call, grave, and completed rite.

The source `house.glb` now includes the authored `Diary Entry` page. The
physical book stays beside Evelyn's bed; the page stays hidden in the room
and is shown only in the inspection view, with a text transcription in the
inspection panel and field notes.
