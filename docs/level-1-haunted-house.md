# Level 1 — The Haunted House

## Overview

A vengeful spirit haunts an old house. Explore the environment, piece together
the mystery of how it died, and use that knowledge to perform the exorcism.

## Gameplay Focus

- Investigation
- Puzzle-solving
- Atmosphere

## House Layout

The house is loaded from an FBX model (`public/house.fbx`). The model is
auto-scaled and centered at the origin on load. Colliders are extracted from
each mesh's world-space bounding box.

## Technical Notes

- Loader: `src/levels/house.js` — exports `loadHouse(scene)` (returns a Promise)
- FBX model loaded via `FBXLoader` from `three/addons/loaders/FBXLoader.js`
- Model auto-scaled if largest dimension exceeds 100 units
- Model centered at origin, bottom snapped to Y=0
- Rotated +90° on X axis (Z-up FBX → Y-up Three.js)
- Shadows enabled on all meshes (`castShadow` / `receiveShadow`)
- Collision: AABB extracted from mesh bounding boxes (no procedural walls)
- Lighting: ambient + directional with shadow map
- No fog (removed for visibility)

## TODO

- [ ] Add interior props (furniture, doors, windows)
- [ ] Add ambient sound (creaking, wind)
- [ ] Add vengeful spirit entity
- [ ] Add investigation clues / puzzle items
