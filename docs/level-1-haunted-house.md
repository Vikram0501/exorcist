# Level 1 — The Haunted House

## Overview

A vengeful spirit haunts an old house. Explore the environment, piece together
the mystery of how it died, and use that knowledge to perform the exorcism.

## Gameplay Focus

- Investigation
- Puzzle-solving
- Atmosphere

## House Layout

The house is loaded from `public/models/house_game.glb` at its Blender-authored
scale and orientation. Its node hierarchy is preserved so door hinges and their
child meshes remain independently movable.

## Technical Notes

- Loader: `src/levels/house.js` — exports `loadHouse(scene)` (returns a Promise)
- GLB model loaded via `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`
- Model loaded from `/models/house_game.glb` using `gltf.scene`
- Blender-authored scale and +Y-up orientation are preserved
- Door nodes retained: `Door_Back_Left_Hinge`, `Door_Back_Right_Hinge`,
  `Door_Interior_01`, and `Door_Interior_02`
- Shadows enabled on all meshes (`castShadow` / `receiveShadow`)
- Collision: floor AABBs, a curved invisible stair ramp, and dynamic door
  AABBs. Structural wall sections are detected from tall, thin non-door GLB
  geometry, and debug wireframes are available through `SHOW_COLLIDERS`
- Lighting: ambient + directional with shadow map
- No fog (removed for visibility)

## TODO

- [x] Add door interaction and hinge animation
- [ ] Add ambient sound (creaking, wind)
- [ ] Add vengeful spirit entity
- [ ] Add investigation clues / puzzle items
