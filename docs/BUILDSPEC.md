# BUILDSPEC — Exorcist: The Last Rites

Specification for AI/agent coding sessions on this project. Read this first before
making any changes. It documents the architecture, conventions, and known
behaviors so future sessions can extend the game without breaking it.

## 1. Project Overview

A browser-based 3D first-person game built with **three.js**, served and bundled
by **Vite**. You play as a disgraced exorcist working to regain your
qualifications by completing increasingly dangerous supernatural missions.

Each mission is a self-contained level with its own environment, enemy type, and
core gameplay loop. The game progresses through three missions, each requiring
different skills — investigation, evasion, and reflexes.

- Runtime: modern web browser (desktop). Pointer Lock API is required.
- Rendering: WebGL via `THREE.WebGLRenderer` with shadows.
- No physics engine: collision is custom AABB + circle logic (see §7).
- Level geometry is loaded from GLB models via `GLTFLoader`.

## 1a. Game Design

### Mission 1 — The Haunted House
A vengeful spirit haunts an old house. Explore the environment, piece together
the mystery of how it died, and use that knowledge to perform the exorcism.
Gameplay focus: investigation, puzzle-solving, atmosphere.

### Mission 2 — The Undead Train
An undead creature stalks the carriages of a moving train, attacking anything it
finds. Evade the monster, search the train for tools and holy relics, and
eventually confront it. Gameplay focus: stealth, resource gathering, tension.

### Mission 3 — The Phantom Highway
A phantom forces you into a deadly high-speed chase on an open highway. Survive
the race, outmaneuver the phantom, and put it to rest. Gameplay focus: vehicle
control, reflexes, final confrontation.

## 2. Tech Stack & Versions

| Concern    | Tool / Lib      | Version    |
| ---------- | --------------- | ---------- |
| Language   | JavaScript (ES modules) | ECMAScript 2020+ |
| Build tool | Vite            | ^5.4.0     |
| 3D library | three           | ^0.169.0   |
| Package    | npm             | 12 deps    |

- The project uses **ES modules** (`"type": "module"` in `package.json`).
- No TypeScript, no linting tooling, no test framework installed yet.
- Vanilla three.js only — no add-ons like `OrbitControls`, `PointerLockControls`,
  or any game engine. Adding add-ons is fine, but import from
  `three/addons/...` and keep the vendored style consistent.

## 3. Commands

Run these from the project root (`C:\Users\subra\Exorcist`).

| Command            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `npm install`      | Install dependencies (after cloning / new deps). |
| `npm run dev`      | Start dev server (default http://localhost:5173).|
| `npm run build`    | Production build → `dist/`.                      |
| `npm run preview`  | Serve the production build locally.              |

Verification for agent sessions:
- **Always** run `npm run build` after code changes to confirm modules transform.
- Smoke-test the dev server: start `npm run dev`, GET `/`, `/src/main.js`,
  `/src/game.js`, expect HTTP 200. (Do this if rendering/imports change.)

## 4. File Structure

```
Exorcist/
├── index.html          # HTML shell: #app canvas mount, #hud overlay, start screen
├── package.json        # Scripts + deps (three, vite)
├── dist/               # Build output (gitignored, generated)
├── docs/
│   ├── BUILDSPEC.md              # This file
│   ├── level-1-haunted-house.md  # Level 1 design doc
│   ├── level-2-undead-train.md   # Level 2 design doc
│   └── level-3-phantom-highway.md# Level 3 design doc
├── public/
│   └── models/
│       └── house_game.glb # Level 1 GLB environment model
└── src/
    ├── main.js         # Entry point: instantiates Game, wires start overlay
    ├── game.js         # Game class: scene, camera, renderer, render loop, HUD
    ├── player.js       # First-person controller (movement, gravity, collision)
    ├── input.js        # Keyboard set + pointer-lock mouse look state
    └── levels/
        └── house.js    # Level 1 loader: GLB, colliders, lighting
```

## 5. Module Responsibilities

### `src/main.js`
- Pure wiring code. Creates the `Game`, attaches start-overlay DOM handlers.
- On "Start Game" click: hides overlay, calls `game.start()`.
- Listens for `Escape`: if pointer is locked it calls `input.release()` and
  shows the overlay again so the player can resume.

### `src/game.js` — `class Game`
Core runtime class. Owns:
- `scene` — `THREE.Scene`, background set to dark blue `0x1a1a2e`.
- `camera` — `THREE.PerspectiveCamera(75, aspect, 0.1, 300)`.
- `renderer` — antialiased, `setPixelRatio(min(devicePixelRatio, 2))`, shadows on
  with `PCFSoftShadowMap`.
- `input` (`Input`), `player` (`Player`) — see below.
- `colliders`, `ramps`, `doors` — populated asynchronously from `loadHouse()`.
- `loaded` — boolean, `true` once the GLB model has finished loading.

Key flow:
- Constructor kicks off async `loadHouse(this.scene)`. On resolve, sets level
  collision data, positions the player at the authored level spawn, and sets
  `loaded = true`.
- `start()` only runs if `loaded` is true. Sets `started = true`, calls
  `input.lock()`, kicks off `animate()`.
- `animate()` uses `requestAnimationFrame`; `dt = min(clock.getDelta(), 0.05)`
  clamps delta to avoid tunneling after tab switches.
- `updateHud(dt)` maintains a 20-sample FPS ring buffer and writes position +
  FPS into `#hudPos` / `#hudFps`.
- `onResize()` updates camera aspect + renderer size. Also adjusts camera far
  plane based on model size.

### `src/input.js` — `class Input`
Stateless input aggregator:
- `keys` — a `Set` of `e.code` strings (e.g. `'KeyW'`, `'ShiftLeft'`), updated
  by window `keydown`/`keyup`.
- `pressed` — one-shot key presses consumed with `consumePressed(code)` for
  actions such as door interaction.
- `yaw`, `pitch` — accumulated look angles from `mousemove` (`movementX/Y`
  scaled by `0.002`). Pitch is clamped to `±(π/2 − 0.05)`.
- `isLocked` — reflects `document.pointerLockElement === dom`.
- `lock()` / `release()` — pointer lock entry/exit (release clears keys).
- Mouse look only accumulates while locked.

### `src/levels/house.js`
Level 1 loader. Exports `loadHouse(scene)` which returns a Promise resolving to
`{ colliders, doors, ramps, model, spawn, modelSize }`.

- Loads `public/models/house_game.glb` via `GLTFLoader`.
- Uses `gltf.scene` at its Blender-authored scale and +Y-up orientation.
- Preserves all GLB hierarchy, including door hinge/object nodes.
- Traverses meshes only to enable `castShadow` / `receiveShadow`.
- Defines floor AABBs and one curved stair ramp separately from visual geometry.
  Structural bounds are not expanded by the player radius.
- Detects connected wall sections from every non-door GLB mesh using tall, thin
  component dimensions, preserving door openings; set `SHOW_COLLIDERS` to
  `true` to show wireframe debug bounds.
- Returns named door nodes; `getDoorColliders()` recalculates their world-space
  AABBs while the door is closed. `updateDoors()` animates their existing pivots.
- Adds ambient + directional lighting with shadow map.

### `src/player.js` — `class Player`
First-person controller wrapping the camera. **The camera IS the player** — the
player has no separate mesh.

Tuning constants (top of file):
```
PLAYER_RADIUS = 0.35    // circle radius used for XZ collision
EYE_HEIGHT    = 1.7     // camera height above ground
WALK_SPEED    = 6
SPRINT_SPEED  = 10
ACCEL         = 45      // move accel blend rate
DAMPING       = 10      // DECLARED BUT UNUSED — safe to remove or wire up
GRAVITY       = -20
JUMP_VELOCITY = 7.5
```

Update pipeline (`update(dt, colliders)`), in order:
1. `updateRotation()` — `rotation.order = 'YXZ'`, applies `yaw` to Y, `pitch` to X.
2. `updateVelocity(dt)` — builds wish direction from WASD (+camera forward/right,
   W/S then normalized), lerps current velocity toward `speed * wishDir`
   (exponential smoothing via `1 − e^(−ACCEL·dt)`), handles jump impulse when
   grounded and Space pressed.
3. `move(dt)` — integrates position from velocity.
4. `collide(colliders)` — circle-vs-AABB XZ push-out for wall and door bounds.
5. `applyGravity(dt, colliders)` — gravity integration, floor landing, and
   smooth support for the authored stair-ramp surface.
6. All walls are tested for XZ collision; their `minY`/`maxY` bounds determine
   whether they overlap the player's body at the current height.

Direction helpers (both return horizontal, y=0 vectors):
- `getForward()` → `(-sin(yaw), 0, -cos(yaw))`
- `getRight()`   → `(cos(yaw), 0, -sin(yaw))`

## 6. `index.html` DOM Contract

Element IDs that JS depends on — **do not rename without updating JS**:

| ID        | Used by          | Purpose                       |
| --------- | ---------------- | ----------------------------- |
| `#app`    | `game.js`        | Canvas mount point            |
| `#hud`    | `game.js`        | FPS / position readout        |
| `#hudPos` | `game.js`        | Position text node            |
| `#hudFps` | `game.js`        | FPS text node                 |
| `#interactionPrompt` | `game.js` | Contextual door interaction text |
| `#overlay`| `main.js`        | Start screen (`.hidden` class toggles) |
| `#playBtn`| `main.js`        | Start button                  |

CSS lives in `<style>` in `index.html` (no separate stylesheet). Controls:
**WASD** move, **mouse** look, **E** interact with doors, **Space** jump,
**Shift** sprint, **F** toggle fly, **Esc** release.

## 7. Collision System (Important)

There is **no physics library**. The player is modeled as:
- A vertical line at `position` with eye height `EYE_HEIGHT` above the feet.
- A horizontal circle of radius `PLAYER_RADIUS = 0.35` for XZ blocking.

Collision data is authored separately from the GLB:
- Walls and doors are vertical AABBs
  `{ type, minX, maxX, minZ, maxZ, minY, maxY, floor }`.
- Floors are horizontal AABBs `{ type: 'floor', minX, maxX, minZ, maxZ, top }`.
- The staircase is one `ramp` with a curved XZ centerline, lower/upper heights,
  and width. The player interpolates the surface height along that centerline.

- `collide()`: for wall/door bounds, find the nearest point on the box to the
  player center; if the distance is less than `PLAYER_RADIUS`, push the player
  out along the nearest axis. Handles the "center-inside-box" case by pushing
  toward the nearest face.
- `applyGravity()`: the player lands when its swept feet position crosses a
  floor/ramp surface and stays grounded while walking within one step height.

Door bounds are regenerated every frame from their named GLB nodes. Other
colliders are static, intentional gameplay geometry rather than visual meshes.
The camera raycasts the centre screen up to 2 metres; a hit is resolved through
its parent chain to one of the four door controller nodes.

**Limitations to be aware of:**
- Door colliders follow their GLB nodes; structural walls, floors, and ramps are static.
- Collision is approximate (bounding boxes don't match intricate geometry).
- No player-vs-player or projectile collision yet.
- Ramp support is limited to the authored house staircase path.

## 8. Conventions & Coding Rules

- **No comments unless requested.** This spec is the documentation.
- ES modules with named imports/exports. Every module exports a class or
  functions; no default exports used so far.
- 2-space indentation, single quotes, trailing commas, semicolons.
- Keep tuning values as module-level `const` at the top of the file.
- Prefer `input.isDown('KeyX')` over raw key listeners in gameplay code —
  Input already centralizes key state. (`KeyA`–`KeyZ`, `ShiftLeft`, `Space`,
  `Escape` codes are used.)
- New gameplay entities (enemies, pickups) should follow the player pattern:
  constructor takes dependencies (scene/camera/input), an `update(dt, ...)`
  method, and no DOM coupling.
- Static assets (GLB, textures) go in `public/` for Vite static serving.

## 9. Adding Features — Quick Recipes

**New GLB model:** place the `.glb` file in `public/models/`, import `GLTFLoader`
from `three/addons/loaders/GLTFLoader.js`, load with `loader.load('/models/file.glb',
...)`. Traverse meshes to enable shadows and define intentional colliders
separately from visual geometry.

**New key binding:** add the code string to a check in `player.js`
`updateVelocity()` (movement) or `updateRotation()` context (e.g. hold `ShiftRight`
already sprints). Add the key to the controls line in `index.html`.

**HUD field:** add a `<span>` in `#hud` in `index.html`, then set
`document.getElementById(...).textContent` inside `updateHud(dt)` in `game.js`.

**FPS counter reset:** the HUD FPS is a 20-sample average; increase the sample
window in `updateHud()` if you want smoother numbers.

## 10. Known Gotchas

- **W/S axis:** `moveZ` is `(W?1:0) − (S?1:0)` in `player.js`. If you refactor
  movement, keep W = +forward. (This was once inverted.)
- **Camera rotation order** must stay `'YXZ'` (set every frame in
  `updateRotation()`) or look/pitch will roll.
- **Delta clamping:** `dt` is capped at 0.05s in `animate()` — keep this to
  prevent collisions/graphics from tunneling on slow frames.
- **Pointer lock:** `mousemove` events only fire while `isLocked`. The player
  cannot look around on the start screen by design.
- **GLB hierarchy:** Do not flatten, merge, or clone away the environment scene.
  Door nodes rely on their Blender-authored pivots and children.
- **Collider size:** Structural bounds use real obstacle extents. Player radius
  is applied only in `player.js`, never when authoring level bounds.
- **`dist/`** is build output. Rebuild with `npm run build`, never hand-edit.
