[Play the hosted game](https://wmc.ms.wits.ac.za/students/sgroup3891/index.html)

# Exorcist: The Last Rites

A browser-based 3D first-person game built with Three.js. You play as a disgraced exorcist working to regain your qualifications by completing increasingly dangerous supernatural missions.

## Story

Stripped of your title after a failed exorcism gone wrong, you must prove yourself worthy once more. Three hauntings await — each more perilous than the last — as you journey from crumbling mansions to speeding trains to open highways, battling forces that defy the living.

**Mission 1 — Vale Manor**
- Investigate Evelyn Vale's disappearance through the house and rear yard
- Answer the upstairs telephone, inspect Evelyn's diary and music box, and identify Elias Wren in the kitchen record
- Open Daniel's envelope, escape the female caretaker spirit to Evelyn's grave, and complete the exorcism
- Return to the road to close Evelyn's case

**Mission 2 — The Undead Train**
- An undead creature stalks the carriages of a moving train, attacking anything it finds
- Evade it, collect name marks and residue hints, and record clues in your field notes
- Speak its name in the burnt carriage to finish the rite
- Focus: stealth, investigation, tension

**Mission 3 — The Phantom Highway**
- A phantom forces you into a deadly high-speed race on an open highway
- Race against a competitive ghost driver with randomized identity
- Collect glowing letters scattered across the road to spell out the ghost's full name
- Read roadside clue signs that progressively reveal the ghost's identity
- Survive a brake failure that lasts until the race ends
- Beat the ghost to the finish, then enter its full name to perform the exorcism
- Focus: vehicle control, reflexes, risk/reward, final confrontation

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move (on foot) / Accelerate, steer, brake or reverse (Level 3) |
| Mouse | Look around |
| `Space` | Jump on foot / drift in Level 3 |
| `C` | Crouch on foot |
| `Shift` | Sprint |
| `E` | Interact with doors, inspect evidence, begin the grave-side rite |
| `I` | Open / close field notes |
| `T` | Toggle the torch in Levels 1 and 2 |
| `V` | Change camera in Level 1 |
| `R` | Respawn in Level 1 |
| `Esc` | Pause / resume |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)

### Install & Run

```bash
npm install
npm run dev
```

The game opens at `http://127.0.0.1:5173`. Choose **Begin** to start at Vale Manor or **Case Files** to replay any case during development. Each case loads behind its introduction; completed cases are marked for replay.

### Tests

```bash
npm test
```

### Build for Production

```bash
npm run build
npm run preview
```

### Department LAMP deployment

The course handout requires a static ZIP uploaded through Moodle's **CGV Project
hosting** tool. The game is built for a group subdirectory, and the archive
contains only runtime assets.

```bash
npm run build
python scripts/package-deployment.py
python -m http.server 8765 --directory deployment
```

Play the packaged site at `http://127.0.0.1:8765/site/` before uploading. The
archive is `deployment/exorcist-deployment.zip`, with `index.html` at its top
level. Upload the ZIP in the group file manager, click its filename, and choose
**UnZip** so `index.html` is in the group root. Open the hosted game linked at
the top of this README in Chrome to verify all three levels. Rebuild and
repackage after every game change; the development server is not the deployment
build.

## Tech Stack

- [Three.js](https://threejs.org/) v0.169 — 3D rendering (WebGL, shadows)
- [Vite](https://vitejs.dev/) v5.4 — bundler and dev server
- Vanilla JavaScript (ES modules, no framework)
- Custom AABB + circle collision (no physics engine)
- Level geometry loaded from GLB models via `GLTFLoader` (Levels 1 & 2)
- A GLB road and car models plus procedural circuit scenery, signs, and collectibles for Level 3

## Level 3 — Phantom Highway

Level 3 is an elevated, banked racing circuit. The road and both cars use GLB assets; scenery, obstacles, signs, and collectible letters are placed along the track.

### Race

- A 3-2-1-GO countdown starts the race; the player cannot move until "GO!"
- The player and a competitive ghost car race through corners, elevation changes, and obstacles to the finish line
- The race ends when either car crosses the finish; the result determines whether the player gets a chance to name the spirit

### Ghost Identity

- 10 possible ghost identities, randomly selected each race: MARA VOSS, ELIAS DREAD, ROSE HOLLOW, JACK FINN, LILY ASH, OWEN GRAVE, NORA SHADE, FELIX MOURN, IVY COBALT, OTIS WREN
- The selected identity drives both the collectible letters and the road sign clues for that race
- Clicking **Play Again** after losing selects a name different from the previous round and rebuilds the corresponding clues, letters, and name display

### Collectible Letters

- Each letter of the ghost's full name (first + last) is placed as a glowing pickup on the road
- Letters are placed at safe positions along the curved track, clear of road obstacles and other pickups
- The HUD displays blank slots and a counter based on the selected name's length
- Collecting a letter reveals it in green on the HUD; repeated letters are separate collectibles where applicable
- Collected letters appear as hints in the final name puzzle

### Road Signs

- Roadside signs are placed at stations along both sides of the circuit
- Signs are generated from the same ghost identity as the collectibles
- Clues progress from name lengths through starting letters to partial name patterns
- Signs are 3D objects (pole + board + glow) with flickering emissive animation
- Signs are regenerated correctly on restart with a new ghost identity

### Brake Cut

- The brake-cut sequence begins around one-quarter of the way around the circuit
- **Warning phase** (1.5 s): "BRAKE FAILURE IMMINENT" flickers at the bottom of the screen
- **Failure phase** (rest of the race): "BRAKES FAILED - DON'T STOP NOW" appears; `S` cannot brake or reverse, and `Space` cannot engage the handbrake or drift. Acceleration and steering remain available.
- The brakes restore when the race ends, restarts, or the level closes

### Name Puzzle and Finale

- Winning the race leads to a one-attempt name puzzle showing the letters collected during the race
- The player types the ghost's full name and submits by button or Enter; case and extra whitespace are forgiven
- A wrong name or losing the race shows **Play Again**; a correct name triggers the exorcism sequence
- The exorcism freezes both cars, dissolves the ghost, and transitions to the campaign's final case-complete screen
- Retrying resets the countdown, race, name puzzle, pickups, signs, and failure event while reusing the loaded level and its existing car listeners

## Project Structure

```text
exorcist/
  index.html                   HTML shell, HUD, and menus
  src/
    main.js                    Entry point
    core/                      Shared game, input, and player
    levels/
      house/                   Level 1 environment, story, audio, and UI
      train/                   Level 2 (existing layout)
      highway/                 Level 3 (existing layout)
      shared/                  Shared lighting
  public/
    levels/house/
      models/house.glb          Original Blender export and authored props
      models/house-runtime.glb  Optimized Level 1 asset loaded by the game
      textures/moon.png
      audio/                   Descriptively named house recordings
        screams/               scream-01.ogg through scream-04.ogg
    models/                    Existing Level 2, Level 3, and shared assets
  tests/house/                 Level 1 regression tests
  docs/
    BUILDSPEC.md               Project conventions
    house/                     Level 1 guide, playthrough, and archived brief
    level-2-undead-train.md
    level-3-phantom-highway.md
```

Level 1 file responsibilities and asset placement are documented in
[the house guide](docs/house/README.md). Use lowercase kebab-case names for new
house files. Generated `dist/` and installed `node_modules/` are ignored by Git.

## Development

The house uses capsule collision against an Octree built from selected environment meshes, with dynamic door bounds. Shared movement also supports AABB collision for other environments. There is no external physics engine.

Level design documents live in `docs/`. Read `docs/BUILDSPEC.md` first if you plan to contribute — it covers module responsibilities, coding conventions, and known gotchas.

### Adding a New Level

1. Place the `.glb` model in `public/models/`
2. Create a loader in `src/levels/<level>/index.js` following the pattern in `src/levels/house/index.js`
3. Register it in the `LEVELS` object in `src/core/game.js`
4. Add floor, wall, and door colliders as needed
5. Select the level from the game menu

## Current Status

- [x] First-person movement with gravity and jumping
- [x] Level 1 (Haunted House) — GLB loading, wall/floor collision, interactive doors, stair ramp
- [x] Level 2 (Undead Train) — GLB loading, basic lighting
- [ ] Level 2 collision, enemies, stealth mechanics
- [x] Level 2 investigation: name marks, residue hints, field notes, and the burnt-carriage exorcism rite
- [x] Level 3 (Phantom Highway) — GLB road and cars, circuit scenery, vehicle controls, competitive ghost
- [x] Level 3 — randomized ghost identities and collectible name letters
- [x] Level 3 — dynamic roadside clue signs
- [x] Level 3 — brake-cut sequence
- [x] Level 3 — final exorcism / name-entry finale
- [x] Level 1 investigation: newspaper, scratched family portrait, upstairs telephone, diary, music box, annex scratches, caretaker record, Daniel's envelope and letter, grave
- [x] Level 1 evidence journal, five-question exorcism, separate Evelyn farewell, and departure ending
- [x] Level 1 ambient recordings, telephone ring, music-box melody, candlelight, torch, and story apparitions
- [ ] Enemy AI and combat
