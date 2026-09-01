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
- A phantom forces you into a deadly high-speed chase on an open highway
- Survive the race and outmaneuver the phantom
- Put it to rest once and for all
- Focus: vehicle control, reflexes, final confrontation

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move |
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
- Level geometry loaded from GLB models via `GLTFLoader`

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
        ├── train.js           # Level 2 GLB loader
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
- [ ] Level 3 (Phantom Highway) — not yet started
- [ ] Investigation clues and puzzle items
- [ ] Ambient sound and atmosphere
- [ ] Enemy AI and combat
