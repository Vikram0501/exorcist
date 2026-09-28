# Vale Manor: playable investigation

The current house now has a complete investigation and release sequence built on the existing model and recordings. `story.js` owns the added props and case progression; `story-view.js` presents captions, the expanded journal, and the rite. The original newspaper, photograph, table setting, and telephone remain the opening interactions.

Asset paths beginning with `audio/` are relative to `public/levels/house/`. See the [house guide](README.md) for the full layout.

## Route

1. Inspect the porch newspaper, then the family photograph. The kitchen telephone starts ringing three seconds after the photograph inspection closes, using the supplied `audio/phone-ring.ogg` recording. The fourth place setting is optional evidence of another presence.
2. Answer the telephone. Evelyn's captioned warning sends the player upstairs.
3. Find Evelyn's diary in Daniel's upstairs room. In the small room where he locked her, read the words she scratched into the wall. The diary provides the key to the music box in Evelyn's bedroom. The wall engraving can be found before the diary, but the box needs the key.
4. Return to the kitchen and read Daniel's confession beside the lone place setting. The letter becomes available after the three upstairs clues and reveals the two backyard graves. Closing the letter triggers a close-up ghost scare with a short screen shake and a randomly selected scream from `audio/screams/scream-01.ogg` through `scream-04.ogg`; competing sounds are muted while it plays. The ghost vanishes briefly, then Elias's pursuit begins. Sprint to Evelyn's unmarked grave beside the other grave; if caught, retry from the letter with all evidence intact.
5. The three rite choices at the grave ask for Evelyn's name, the truth of her confinement, and her mother's music box. A wrong answer gives feedback and permits another attempt. Stepping away preserves the current rite step and allows journal review.
6. Evelyn appears and fades, the random haunting audio stops, and the objective leads back to the front road. Crossing the departure threshold closes her case while Elias appears at the upstairs window.

Level 1 loads the artist's `public/levels/house/models/vale-manor.glb` asset. The `Ghost` mesh and `grave001` object are used for the apparitions and final grave; the other supplied grave remains in the backyard. The bathroom-mirror event and moving furniture remain future extensions of the brief.
Both supplied graves use darker, rougher materials. The grave accent lights are 95% dimmer than before and reach only 0.4 units, so Daniel's confession provides the main direction for finding the graves. Clue lights have no visible candle/flame markers, and house lighting has no debug helper shapes; the house lights still illuminate their surroundings.
After the telephone call, the first indoor scare waits 20–30 seconds of active gameplay. Subsequent ambient appearances are scheduled 35–60 seconds apart. The diary and engraving can trigger a scare after inspection closes, but respect the same 35-second minimum cooldown; skipped clue scares are not queued. The confession is the deliberate final scare and bypasses this cooldown to start the chase. Each scare puts a camera-attached copy of the supplied ghost across the view for 0.95 seconds with screen shake. The chase uses the separate 1.35-metre ghost in the world.

All four scream recordings are predecoded, normalized, and played through a boosted audio channel with a compressor. Each scare randomly chooses a scream other than the previous one. Leading silence is skipped so the sound hits with the face. Music and competing effects stay muted for the recording; pointer-lock handoffs do not interrupt it. Scare duration uses elapsed real time so it cannot linger when gameplay is paused or frames are slow.

Walking speed is 4.8 units per second, sprinting is 8, and the pursuing ghost moves at 5.6. These are all 20% slower than the previous tuning, preserving the player's sprint advantage. Footstep timing follows the slower movement.

## Placement and interaction

Background music starts only after the loaded level has rendered its first frame and the player is in the game. Loading, failed loads, and the menu stay silent; unloading cancels any pending music start.

The diary and music box use world coordinates aligned with the current centered house export. A downward ray places them on the upstairs floor. The engraved message is placed on the nearest wall in the locked room. The kitchen letter is placed beside a copy of the model's `Plate`, close to the existing `Phone`; the dining-room `Table Set` remains where it is. The rite and safe zone use the actual bounds of the supplied grave. Recheck these anchors after replacing the house model.

Interact within three metres while looking at the object. Investigation raycasts ignore invisible collision helpers and stop at opaque obstructions. Names of original props normalize punctuation and whitespace because GLTFLoader sanitizes names such as `Table Set` to `Table_Set`.

`E` inspects/interacts, `I` toggles the evidence log, `T` toggles the torch, and `Esc` opens the case menu. Movement and story timers pause during inspection, the journal, the rite, and the menu. Scripted audio can finish while inspecting evidence. Resume retains the current case; browser reload starts a new case. `R` respawns without clearing evidence.

## Verification

Run `npm test` for progression gates, repeated house scares, evidence-inspection timing, camera framing, audio preparation, wrong rite answers, and pursuit retry. Run `npm run build` for the production bundle. A visual playthrough is still needed to confirm the wall inscription and kitchen letter sit correctly in the current model.

The scare was checked in headless Chrome with software WebGL using the supplied ghost: the repeated house appearance showed the close-up face, changed the screen transform across frames, played audio with music muted, and removed the face and shake afterward without starting a chase. This was a focused scare check, not a complete level playthrough.

The replacement recordings `audio/screams/scream-01.ogg` through `scream-04.ogg` were each decoded and played through the game's scare audio path in Chrome. All four produced an audio signal while music stayed muted. Tests cover choosing all four recordings without immediate repeats and suppressing rapid clue scares without blocking the confession chase.
