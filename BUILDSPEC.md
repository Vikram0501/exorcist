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
- Developers provide complex 3D assets (models, textures). Code only needs to
  place basic shapes (boxes, cylinders) for buildings and level geometry.

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
├── BUILDSPEC.md        # This file
├── dist/               # Build output (gitignored, generated)
└── src/
    ├── main.js         # Entry point: instantiates Game, wires start overlay
    ├── game.js         # Game class: scene, camera, renderer, render loop, HUD
    ├── environment.js  # Placeholder level (ground, lighting, box placeholders)
    ├── player.js       # First-person controller (movement, gravity, collision)
    └── input.js        # Keyboard set + pointer-lock mouse look state
```

## 5. Module Responsibilities

### `src/main.js`
- Pure wiring code. Creates the `Game`, attaches start-overlay DOM handlers.
- On "Start Game" click: hides overlay, calls `game.start()`.
- Listens for `Escape`: if pointer is locked it calls `input.release()` and
  shows the overlay again so the player can resume.

### `src/game.js` — `class Game`
Core runtime class. Owns:
- `scene` — `THREE.Scene`, background and fog are set per-mission.
- `camera` — `THREE.PerspectiveCamera(75, aspect, 0.1, 300)`.
- `renderer` — antialiased, `setPixelRatio(min(devicePixelRatio, 2))`, shadows on
  with `PCFSoftShadowMap`.
- `input` (`Input`), `player` (`Player`) — see below.
- `environment` via `createEnvironment(this.scene)` (placeholder, see §5).
- `colliders` — imported array from `environment.js`; passed to `player.update`.

Key flow:
- `start()` sets `started = true`, calls `input.lock()`, kicks off `animate()`.
- `animate()` uses `requestAnimationFrame`; `dt = min(clock.getDelta(), 0.05)`
  clamps delta to avoid tunneling after tab switches.
- `updateHud(dt)` maintains a 20-sample FPS ring buffer and writes position +
  FPS into `#hudPos` / `#hudFps`.
- `onResize()` updates camera aspect + renderer size.

### `src/input.js` — `class Input`
Stateless input aggregator:
- `keys` — a `Set` of `e.code` strings (e.g. `'KeyW'`, `'ShiftLeft'`), updated
  by window `keydown`/`keyup`.
- `yaw`, `pitch` — accumulated look angles from `mousemove` (`movementX/Y`
  scaled by `0.002`). Pitch is clamped to `±(π/2 − 0.05)`.
- `isLocked` — reflects `document.pointerLockElement === dom`.
- `lock()` / `release()` — pointer lock entry/exit (release clears keys).
- Mouse look only accumulates while locked.

### `src/environment.js`
Placeholder environment builder. Exports:
- `createEnvironment(scene)` — adds a basic ground plane and lighting to the
  scene. Will be replaced by per-mission level loaders as missions are built.
- `environmentColliders` — array of `{ minX, maxX, minZ, maxZ, top }` AABBs
  (aliased as `colliders` internally), consumed by the player.

Current contents: a flat ground plane, ambient + directional lighting, and a
handful of simple box placeholders. As missions are developed, this module will
be refactored into per-level environment loaders (e.g. `loadHouse.js`,
`loadTrain.js`).

To add a new solid obstacle: call `addBox` with a layout entry — collider
is created automatically. To add non-solid decoration: use `new THREE.Mesh`
directly and do NOT touch `colliders`.

### `src/player.js` — `class Player`
First-person controller wrapping the camera. **The camera IS the player** — the
player has no separate mesh.

Tuning constants (top of file):
```
PLAYER_RADIUS = 0.5     // circle radius used for XZ collision
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
4. `collide(colliders)` — circle-vs-AABB XZ push-out (see §7).
5. `applyGravity(dt, colliders)` — gravity integration, ground (y=0) landing,
   and landing on top of pillars via swept test.

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
| `#overlay`| `main.js`        | Start screen (`.hidden` class toggles) |
| `#playBtn`| `main.js`        | Start button                  |

CSS lives in `<style>` in `index.html` (no separate stylesheet). Controls:
**WASD** move, **mouse** look, **Space** jump, **Shift** sprint, **Esc** release.

## 7. Collision System (Important)

There is **no physics library**. The player is modeled as:
- A vertical line at `position` with eye height `EYE_HEIGHT` above the feet.
- A horizontal circle of radius `PLAYER_RADIUS = 0.5` for XZ blocking.

Colliders are axis-aligned boxes `{ minX, maxX, minZ, maxZ, top }`.

- `collide()`: for each collider, find nearest point on the box to the player
  center; if the distance is less than `PLAYER_RADIUS`, push the player out along
  the nearest axis. Handles the "center-inside-box" degenerate case by pushing
  toward the nearest face.
- `applyGravity()`: the player lands when feet reach `y=0` OR when the swept
  feet position crosses a box's `top` while horizontally overlapping it.

**Limitations to be aware of:**
- Colliders are never updated at runtime — they are static. Moving platforms
  would require the player to recompute/refresh colliders each frame.
- No floor collision for the decorative pads (they are at `y=0.2` but walkable
  — intentional).
- No player-vs-player or projectile collision yet.
- No sloped terrain; only axis-aligned boxes and a flat ground.

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
- All scene construction goes through `environment.js` helpers or explicit
  `new THREE.*` in the module that owns the entity.

## 9. Adding Features — Quick Recipes

**New collidable pillar:** add an entry to the `layout` array in
`environment.js` (`{ x, z, w, h, d, color }`). Collider is created automatically.
Avoid placing the player spawn (`0, 0`) inside a box.

**New non-solid object:** create a `Mesh` in `environment.js` and `scene.add()`
it. Do not touch `colliders`.

**New key binding:** add the code string to a check in `player.js`
`updateVelocity()` (movement) or `updateRotation()` context (e.g. hold `ShiftRight`
already sprints). Add the key to the controls line in `index.html`.

**HUD field:** add a `<span>` in `#hud` in `index.html`, then set
`document.getElementById(...).textContent` inside `updateHud(dt)` in `game.js`.

**Load a 3D model (GLTF):** install via `three` add-ons:
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
```
Create the loader in `game.js` or a new module, load the asset from `/public/`,
and cast/receive shadows on meshes with `traverse`.

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
- **`dist/`** is build output. Rebuild with `npm run build`, never hand-edit.
- The project is not a git repo and has no `.gitignore` yet. If git is
  initialized, add one ignoring `node_modules/` and `dist/`.
- If dependencies are added, run `npm install` again and re-run
  `npm run build` to confirm the production bundle still resolves.
