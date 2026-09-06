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
- Outpace the ghost across the finish line to complete the exorcism
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

Level 3 is a procedurally generated highway race with no GLB model. All geometry (road, cars, barriers, finish line) is built from Three.js primitives.

### Race

- A 3-2-1-GO countdown starts the race; the player cannot move until "GO!"
- The player and a ghost car race down a straight highway toward a finish line at z = -320
- The ghost driver is competitive: it targets staying ~8 units ahead of the player, accelerating up to 38 units/s or braking down to 18 units/s as needed
- The race ends when either the player or ghost crosses the finish line; a result message is displayed ("YOU RACED [NAME]" or "[NAME] WON")
- Crossing the finish line stops both cars and displays the outcome

### Ghost Identity

- 10 possible ghost identities, randomly selected each race: MARA VOSS, ELIAS DREAD, ROSE HOLLOW, JACK FINN, LILY ASH, OWEN GRAVE, NORA SHADE, FELIX MOURN, IVY COBALT, OTIS WREN
- The selected identity drives both the collectible letters and the road sign clues for that race
- Each run presents a different ghost, encouraging replayability

### Collectible Letters

- Each letter of the ghost's full name (first + last) is placed as a glowing pickup on the road
- Letters spawn at 10 predefined positions along the highway, shuffled randomly
- Positions are categorised by risk level:
  - **Safe** (z = -15, -48, -81): early in the race, easy to grab
  - **Medium** (z = -114, -147, -180): mid-race, requires steering away from the centre
  - **High** (z = -213, -246, -279, -312): late-race, near the finish, harder to reach
- The HUD displays blank slots for each letter (e.g. `_ _ _ _ _ _ _ _ _ _`) and a counter ("LETTERS: 3/10")
- Collecting a letter reveals it in green on the HUD; repeated letters are separate collectibles where applicable

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
- [ ] Level 3 — final exorcism / name-entry finale
- [ ] Investigation clues and puzzle items
- [ ] Ambient sound and atmosphere
- [ ] Enemy AI and combat
