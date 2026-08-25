# Level 1 — The Haunted House

## Overview

A vengeful spirit haunts an old house. Explore the environment, piece together
the mystery of how it died, and use that knowledge to perform the exorcism.

## Gameplay Focus

- Investigation
- Puzzle-solving
- Atmosphere

## House Layout

The house is 20m × 14m with two floors. Walls are thin planes (0.2m collision
thickness). Doorways are gaps between wall segments.

### Ground Floor

```
z=14 ┌───────────────────┬───────────────────┐
     │                   │                   │
     │    Living Room    │     Kitchen       │
     │    (0-10, 7-14)   │   (10-20, 7-14)  │
     │                   │                   │
z=7  ├─────────┬─────────┼───────────────────┤
     │         │         │                   │
     │  Entry  │ Stairs  │   Dining Room     │
     │  Hall   │         │   (10-20, 0-7)    │
     │ (0-6,   │ (6-10,  │                   │
     │  0-7)   │  0-7)   │                   │
z=0  └────╥════┴─────────┴───────────────────┘
     x=0  ║x=2  x=4  x=6       x=10        x=20
          front door
```

**Rooms:**
- Entry Hall (0–6, 0–7) — front door on south wall (gap x=2–x=4)
- Stairs (6–10, 0–7) — leads upstairs
- Dining Room (10–20, 0–7)
- Living Room (0–10, 7–14)
- Kitchen (10–20, 7–14)

**Doorways (gaps in walls):**
- Front door: south wall, x=2 to x=4
- Entry → Kitchen: wall at x=6, gap z=3–z=4
- Stairs → Kitchen: wall at x=10, gap z=3–z=4
- Living ↔ Kitchen: wall at z=7, gap x=6–x=8
- Kitchen → Dining: wall at x=10, gap z=3–z=4

### Upstairs

Same footprint (20m × 14m). Accessed via stairs.

**Rooms:**
- Hallway/Landing (0–12, 0–7)
- Bedroom (0–12, 7–14)
- Bathroom (12–20, 7–14)

**Doorways:**
- Hallway → Bedroom: wall at z=7, gap x=6–x=8

## Technical Notes

- Loader: `src/levels/house.js` — exports `loadHouse(scene)`
- All wall geometries merged per floor (2 draw calls for walls total)
- Shared materials: `wallMat`, `floorMat`, `ceilMat`
- Collision thickness: 0.2m per wall
- Interior point lights for atmosphere (dim, warm tones)
- Background/fog set to dark blue `0x1a1a2e`

## TODO

- [ ] Add stairs geometry (ramp or steps)
- [ ] Add exterior environment (yard, path, trees)
- [ ] Add interior props (furniture, doors, windows)
- [ ] Add ambient sound (creaking, wind)
- [ ] Add vengeful spirit entity
- [ ] Add investigation clues / puzzle items
