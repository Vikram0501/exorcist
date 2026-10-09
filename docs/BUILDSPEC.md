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
- No physics engine: the house uses Octree/capsule collision; shared movement also supports AABBs (see section 7).
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
- No TypeScript or linting tooling. Tests use the built-in Node.js test runner.
- Vanilla three.js only — no add-ons like `OrbitControls`, `PointerLockControls`,
  or any game engine. Adding add-ons is fine, but import from
  `three/addons/...` and keep the vendored style consistent.

## 3. Commands

Run these from the repository root (the folder containing `package.json`).

| Command            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `npm install`      | Install dependencies (after cloning / new deps). |
| `npm run dev`      | Start dev server (default http://localhost:5173).|
| `npm test`         | Run the Level 1 regression tests.                  |
| `npm run build`    | Production build → `dist/`.                      |
| `npm run preview`  | Serve the production build locally.              |

Verification for agent sessions:
- **Always** run `npm run build` after code changes to confirm modules transform.
- Smoke-test the dev server: start `npm run dev`, GET `/`, `/src/main.js`,
  `/src/core/game.js`, expect HTTP 200. (Do this if rendering/imports change.)

## 4. File Structure

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
      models/vale-manor.glb     Active Level 1 environment
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
[the house guide](house/README.md). Use lowercase kebab-case names for new
house files. Generated `dist/` and installed `node_modules/` are ignored by Git.

## 5. Module Responsibilities

### `src/main.js`
- Pure wiring code. Creates the `Game`, attaches start-overlay DOM handlers.
- On "Start Game" click: hides overlay, calls `game.start()`.
- Listens for `Escape`: if pointer is locked it calls `input.release()` and
  shows the overlay again so the player can resume.

### `src/core/game.js` — `class Game`
Core runtime class. Owns:
- `scene` — `THREE.Scene`, background set to dark blue `0x1a1a2e`.
- `camera` — `THREE.PerspectiveCamera(75, aspect, 0.1, 300)`.
- `renderer` — antialiased, `setPixelRatio(min(devicePixelRatio, 2))`, shadows on
  with `PCFSoftShadowMap`.
- `input` (`Input`), `player` (`Player`) — see below.
- `colliders`, `ramps`, `doors` — populated asynchronously from `loadHouse()`.
- `loaded` — boolean, `true` once the GLB model has finished loading.

Key flow:
- `start(levelName)` starts the loop and loads or resumes the selected level.
- `loadLevel(levelName)` installs the returned model, collisions, and spawn;
  a load identifier prevents stale asynchronous results replacing the active level.
- House music starts on the animation frame after the loaded scene renders,
  only while pointer lock is active. Unloading cancels a pending music start.
- `animate()` uses `requestAnimationFrame`; `dt = min(clock.getDelta(), 0.05)`
  clamps delta to avoid tunneling after tab switches.
- `updateHud(dt)` maintains a 20-sample FPS ring buffer and writes position +
  FPS into `#hudPos` / `#hudFps`.
- `onResize()` updates camera aspect + renderer size. Also adjusts camera far
  plane based on model size.

### `src/core/input.js` — `class Input`
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

### `src/levels/house/index.js`
Level 1 loader. Exports `loadHouse(level)`, resolving to the model, spawn,
spawn yaw, model size, doors, investigation items, collider data, and helper arrays.

- Loads `public/levels/house/models/vale-manor.glb` with `GLTFLoader` and
  `MeshoptDecoder`, at scale 0.15, centered using the visible environment bounds.
- Preserves the authored hierarchy, named objects, door pivots, and transforms.
- Builds an Octree from selected structural and furniture meshes using their
  final world transforms. Collision-only helpers stay hidden.
- Returns named door controllers; `getDoorColliders()` supplies dynamic bounds
  and `updateDoors()` animates the existing pivots.
- Delegates sky, moon, and interior lights to `lighting.js`.
- House audio, story progression, ghost assets, chase state, and story UI live
  alongside the loader. See [house module responsibilities](house/README.md).

### `src/core/player.js` - `class Player`
Shared first-person controller wrapping the camera. It owns velocity, grounded
state, fly mode, rotation, movement, and collision resolution.

House tuning: radius 0.35, eye height 1, walk speed 4.8, sprint speed 8,
acceleration 45, gravity -20, jump velocity 7.5, and step height 0.5.
The pursuing house ghost moves at 5.6 units per second in `house/pursuit.js`.
`configureForLevel()` preserves the newer train defaults separately: radius 0.2,
walk 3, sprint 5, acceleration 20, and jump 5; eye height remains 1.

`update(dt, colliders)` applies rotation and desired velocity, then chooses
fly movement, Octree capsule collision, or the shared AABB movement path.
Keep camera rotation order `YXZ` and W moving in the camera's forward direction.
`reset(spawn, yaw)` clears velocity and restores the authored spawn orientation.

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
**Shift** sprint, **Ctrl** crouch (toggle), **F** toggle fly, **Esc** release.

## 7. Collision System (Important)

There is no external physics library. The house supplies a Three.js Octree built
from selected environment meshes. The player uses capsule collision against it,
with grounded movement and step handling. Door bounds update as doors move.
Shared movement also retains an AABB/circle collision path for other environments.

- Build structural collision after applying the environment's world transforms.
- Preserve GLB node names used by collision filtering and door discovery.
- Hidden boundary and floor helpers may still be required for collision.
- Keep the player radius in the movement controller; do not inflate every mesh
  by that radius when authoring obstacles.
- Test stairs, doorways, and the backyard route after replacing the house model.

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

**New house GLB model:** place the `.glb` file in `public/levels/house/models/`,
import `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`, and load it from
`/levels/house/models/file.glb`. Traverse meshes to enable shadows and define intentional colliders
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
