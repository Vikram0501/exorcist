# Exorcist: The Last Rites

A browser-based 3D first-person game built with Three.js. You play as a disgraced exorcist working to regain your qualifications by completing increasingly dangerous supernatural missions.

## Story

Stripped of your title after a failed exorcism gone wrong, you must prove yourself worthy once more. Three hauntings await — each more perilous than the last — as you journey from crumbling mansions to speeding trains to open highways, battling forces that defy the living.

**Mission 1 — The Haunted House**
- A vengeful spirit haunts an old house
- Explore the environment and piece together the mystery of how it died
- Use that knowledge to perform the exorcism
- Focus: investigation, puzzle-solving, atmosphere

**Mission 2 — The Undead Train**
- An undead creature stalks the carriages of a moving train, attacking anything it finds
- Evade the monster and search the train for tools and holy relics
- Eventually confront the creature before it's too late
- Focus: stealth, resource gathering, tension

**Mission 3 — The Phantom Highway**
- A phantom forces you into a deadly high-speed race on an open highway
- Race against a competitive ghost driver with randomized identity
- Collect glowing letters scattered across the road to spell out the ghost's full name
- Read roadside clue signs that progressively reveal the ghost's identity
- Survive a supernatural brake-cut sequence that disables your ability to slow down
- Beat the ghost to the finish, then enter its full name to perform the exorcism
- Focus: vehicle control, reflexes, risk/reward, final confrontation

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move (on foot) / Drive & steer (Level 3 vehicle) |
| Mouse | Look around |
| `Space` | Jump / fly up |
| `C` | Fly down |
| `Shift` | Sprint |
| `E` | Interact (doors) |
| `F` | Toggle fly mode |
| `H` | Toggle collider debug view |
| `J` | Log nearby wall colliders |
| `Esc` | Release mouse / pause |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)

### Install & Run

```bash
npm install
npm run dev
```

The game opens at `http://localhost:5173`. Click **Start Game** to begin.

### Build for Production

```bash
npm run build
npm run preview
```

## Tech Stack

- [Three.js](https://threejs.org/) v0.169 — 3D rendering (WebGL, shadows)
- [Vite](https://vitejs.dev/) v5.4 — bundler and dev server
- Vanilla JavaScript (ES modules, no framework)
- Custom AABB + circle collision (no physics engine)
- Level geometry loaded from GLB models via `GLTFLoader` (Levels 1 & 2)
- Procedural Three.js geometry for Level 3 (road, cars, barriers, signs, collectibles)

## Level 3 — Phantom Highway

Level 3 is a procedurally generated highway race with no GLB model. All geometry (road, cars, barriers, finish line, signs, collectibles) is built from Three.js primitives. The level includes a post-race name puzzle and exorcism finale.

### Race

- A 3-2-1-GO countdown starts the race; the player cannot move until "GO!"
- The player and a ghost car race down a straight highway toward a finish line at z = -320
- The ghost driver is competitive: it targets staying ~8 units ahead of the player, accelerating up to 38 units/s or braking down to 18 units/s as needed
- The car is confined to the road (x clamped to -5.5..5.5) and there are no obstacle collisions or health mechanics; the only failure states are losing the race or entering the wrong name in the finale puzzle
- The race ends when either the player or ghost crosses the finish line

### Finish-Order Logic

- If the player crosses first: "YOU WON THE RACE" is displayed for 2.5 s, then the name puzzle appears
- If the ghost crosses first: "[GHOST NAME] WON" is displayed for 2.5 s, then the game over screen appears
- If both cross on the same frame, whichever car is further past the finish line (lower z) wins

### Ghost Identity

- 10 possible ghost identities, randomly selected each race via `pickRandomGhostName()` in `highway.js`: MARA VOSS, ELIAS DREAD, ROSE HOLLOW, JACK FINN, LILY ASH, OWEN GRAVE, NORA SHADE, FELIX MOURN, IVY COBALT, OTIS WREN
- The selected identity drives all downstream systems: the collectible letters, the road sign clues, the ghost name HUD, and the final name puzzle
- A new identity is selected each time Level 3 is loaded (including restarts)

### Collectible Letters

- Each letter of the ghost's full name (first + last) is placed as a glowing pickup on the road
- Positions are drawn from a pool of 10 predefined spots along the highway, shuffled randomly; the exact number of pickups matches the number of letters in the selected name (7–10 depending on the identity)
- Positions are categorised by risk level:
  - **Safe** (z = -15, -48, -81): early in the race, easy to grab
  - **Medium** (z = -114, -147, -180): mid-race, requires steering away from the centre
  - **High** (z = -213, -246, -279, -312): late-race, near the finish, harder to reach
- The HUD displays blank slots for each letter (e.g. `_ _ _ _ _ _ _`) and a counter ("LETTERS: 3/7"), where the total varies by name length
- Collecting a letter reveals it in green on the HUD; repeated letters are separate collectibles where applicable
- Collected letters are displayed in the name puzzle as hints (revealed letters shown in green, unrevealed as `_`)

### Road Signs

- 8 physical roadside signs are placed along the highway (alternating left and right)
- Signs are generated from the same ghost identity as the collectibles
- Clues are tiered by position along the road:
  - **Early** (z = -40, -70): name lengths ("FIRST NAME 4 LETTERS", "SURNAME 5 LETTERS")
  - **Middle** (z = -130, -160, -190): starting letters and specific letter reveals ("FIRST NAME STARTS WITH M", "LETTER 3: R IN SURNAME")
  - **Late** (z = -240, -270, -300): partial name patterns with blanks (e.g. "M _ _ A", "V _ _ _ _")
- Signs are 3D objects (pole + board + glow) with flickering emissive animation
- Signs are regenerated correctly on restart with a new ghost identity

### Brake Cut

- A brake-cut sequence triggers at z = -172 during the race
- **Warning phase** (1.5 s): "BRAKE FAILURE IMMINENT" flickers at the bottom of the screen
- **Cut phase** (1.0 s): brakes are disabled, the ghost teleports near the player and drives through, the screen background flickers red
- **Aftermath phase** (4.0 s): "BRAKES FAILED - DON'T STOP NOW" is displayed; the ghost is restored 25 units ahead
- During the cut phase, `W` continues to accelerate, `S` no longer brakes or reverses, `A`/`D` steering remains available
- After the aftermath phase the message hides and normal racing resumes

### Final Name Puzzle

- Only appears after the player wins the race (ghost winning goes straight to game over)
- After the 2.5 s result display, there is a 1.5 s pause before the puzzle UI appears
- The puzzle shows: "YOU WON THE RACE." / "NOW END IT." / "ENTER THE DRIVER'S FULL NAME:"
- Collected letters are displayed as hints (revealed letters in green, unrevealed as `_`)
- The player types the ghost's full name in a text input and submits via button or Enter key
- Answer validation is case-insensitive and whitespace-normalized (e.g. "mara voss", "Mara  Voss", and "MARA VOSS" all match)
- Exactly one attempt is allowed; the UI shows "ONE ATTEMPT ONLY."
- A correct answer triggers the exorcism sequence
- A wrong answer immediately shows the game over screen ("WRONG NAME.") without revealing the correct name

### Exorcism Sequence

- Triggered by entering the correct ghost name in the puzzle
- Both player and ghost cars are frozen
- The ghost car flickers and fades over ~5 s, then disappears entirely
- Floating cyan particles spawn and drift upward for ~8 s
- The scene background transitions from dark to warm dawn over 5 s
- The directional and ambient lighting shifts to warmer tones
- An overlay fades in showing "THE LAST RIDE IS OVER." / "THE SPIRIT HAS BEEN EXORCISED."
- After 9 s the state transitions to COMPLETE; the overlay persists until the player restarts with `3`

### Game Over

- Two triggers: ghost crosses the finish line first, or wrong name in the puzzle
- The game over overlay shows "GAME OVER" with the appropriate message:
  - Ghost won: "[GHOST NAME] REACHED THE FINISH FIRST." / "THE RACE WAS NEVER YOURS."
  - Wrong name: "WRONG NAME." / "THE RACE WAS NEVER YOURS."
- A hint reads "Press 3 to try again"
- All cars are frozen; the name puzzle and ghost name HUD are hidden

### State Machine

The level progresses through these states:

```
RACING → FINISH_CHECK → NAME_PUZZLE → EXORCISM → COMPLETE
                ↓                ↓
            GAME_OVER         GAME_OVER
        (ghost won race)   (wrong name)
```

- **RACING**: normal gameplay — countdown, ghost AI, collectibles, brake cut, finish detection
- **FINISH_CHECK**: race result displayed for 2.5 s, then branches based on winner
- **NAME_PUZZLE**: 1.5 s pause, then puzzle UI appears; awaits player input
- **EXORCISM**: ghost dissolves with visual effects over 9 s
- **COMPLETE**: exorcism finished; overlay persists
- **GAME_OVER**: terminal state; press `3` to restart

### Restart and Cleanup

Restarting Level 3 (pressing `3`) fully tears down the current state:

- Name puzzle DOM and Enter key listener are removed
- Game over overlay is removed
- Exorcism overlay and all particle elements are removed
- Scene background and lighting are restored to original values
- Highway race controller, car controller, keyboard listeners, ghost name UI, collectibles, road signs, and all Three.js objects are disposed
- The `levelState` is reset to `RACING`
- A new ghost identity is randomly selected for the fresh run
- No stale DOM elements or event listeners remain after restart

## Project Structure

```
Exorcist/
├── index.html                 # HTML shell, HUD, start screen
├── package.json               # Scripts and dependencies
├── public/
│   └── models/
│       ├── house_game.glb     # Level 1 environment
│       └── train.glb          # Level 2 environment
├── docs/
│   ├── BUILDSPEC.md           # Architecture and coding conventions
│   ├── level-1-haunted-house.md
│   ├── level-2-undead-train.md
│   └── level-3-phantom-highway.md
└── src/
    ├── main.js                # Entry point, start/escape wiring
    ├── game.js                # Game class: scene, camera, renderer, loop
    ├── player.js              # First-person controller (movement, collision)
    ├── input.js               # Keyboard state + pointer-lock mouse look
    └── levels/
        ├── house.js           # Level 1 GLB loader, colliders, doors
        ├── houseLighting.js   # Level 1 lighting
        ├── train.js           # Level 2 GLB loader
        ├── trainLighting.js   # Level 2 lighting
        ├── highway.js         # Level 3 procedural road, cars, ghost name UI
        ├── highwayCar.js      # Level 3 vehicle controller (WASD, chase cam)
        ├── highwayRace.js     # Level 3 race logic, countdown, ghost AI, brake-cut
        ├── highwayCollectibles.js  # Level 3 letter pickups and HUD updates
        ├── highwaySigns.js    # Level 3 roadside clue signs
        └── lighting.js        # Shared ambient + directional lighting
```

## Development

The game has no physics library. Collision is handled with custom AABB and circle logic — the player is a vertical line with a horizontal circle of radius 0.35 for XZ push-out. Collision data is authored separately from the GLB geometry.

Level design documents live in `docs/`. Read `docs/BUILDSPEC.md` first if you plan to contribute — it covers module responsibilities, coding conventions, and known gotchas.

### Adding a New Level

1. Place the `.glb` model in `public/models/`
2. Create a loader in `src/levels/` following the pattern in `house.js`
3. Register it in the `LEVELS` object in `src/game.js`
4. Add floor, wall, and door colliders as needed
5. Switch levels at runtime with `1`/`2` keys

## Current Status

- [x] First-person movement with gravity, jumping, and fly mode
- [x] Level 1 (Haunted House) — GLB loading, wall/floor collision, interactive doors, stair ramp
- [x] Level 2 (Undead Train) — GLB loading, basic lighting
- [ ] Level 2 collision, enemies, stealth mechanics
- [x] Level 3 (Phantom Highway) — procedural road, vehicle controls, competitive ghost
- [x] Level 3 — randomized ghost identities and collectible name letters
- [x] Level 3 — dynamic roadside clue signs
- [x] Level 3 — brake-cut sequence
- [x] Level 3 — final name puzzle and exorcism finale
- [ ] Investigation clues and puzzle items
- [ ] Ambient sound and atmosphere
- [ ] Enemy AI and combat
