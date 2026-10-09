# Level 3 — The Phantom Highway

## Overview

A phantom forces you into a deadly high-speed chase on an open highway. Survive
the race, outmaneuver the phantom, and put it to rest.

## Gameplay Focus

- Vehicle control
- Reflexes
- Final confrontation

## Ghost Name Mechanic

When Level 3 starts, a ghost name is randomly selected from a predefined list
and displayed as blank letter slots:

```
_ _ _ _    _ _ _ _
```

The player must eventually collect letters on the highway to reveal the
phantom's name. The name is used in the race result text when the race
finishes.

### Name List

Names are stored in `GHOST_NAMES` in `src/levels/highway/index.js`.

### State

- `ghostName` — the selected full name string (e.g. `'MARA VOSS'`)
- `ghostNameUI` — the DOM element displaying the blank slots

### Reset Behavior

Each Level 3 load picks a fresh random name and creates a new UI element.
The previous run's name and UI are disposed via `HighwayRaceController.dispose()`.

## Level Details

### GLB car visuals

`src/levels/highway/cars.js` loads `/models/player_car.glb` and
`/models/ghost_car.glb` once each per Level 3 instance, concurrently after the
road loads. Setup awaits both requests, including on failure, so a late sibling
load cannot attach resources after teardown. Fresh instances are owned by the
existing level root and disposed through its normal lifecycle.

Each gameplay Group has one visual Group containing its GLB scene. The old
procedural body/roof meshes are removed. The separate `Plane001` baked-shadow
nodes are removed and their resources disposed before measuring the vehicles.
The imported body/glass materials and maps are retained. Player meshes cast
and receive shadows; ghost meshes receive shadows but do not cast solid shadows.
The ghost uses the agreed cyan tint (`0x44dddd`), emissive `0x228888` at intensity
1.5, and initial opacity 0.5. All ghost materials are transparent so the existing
race flicker/fog fading and exorcism opacity updates work.

Tuning is isolated in `cars.js`: model URLs, `HIGHWAY_CAR_TARGET_LENGTH = 4`,
`PLAYER_MODEL_ROTATION = 0`, `GHOST_MODEL_ROTATION = 0`, and ghost appearance
constants. Browser inspection of the headlights/grille and tail lights confirmed
both imported noses point along +Z, matching the gameplay roots' forward axis.
The earlier geometry-only inference of a required 180-degree turn was incorrect.

Uniform scale is derived from each body's measured length, preserving proportions.
XZ bounds are centered on the gameplay root; model-bottom Y is compensated locally,
then `seatCarVisuals` places the tires at the highway surface (Y = 0.05).
Measured final visual transforms, relative to the root at Y = 0.2:

| Model | Uniform scale | Local position XYZ | Size W × H × L |
| --- | --- | --- | --- |
| Player | 0.01415619 | (0, -0.18084472, 0.07819687) | 1.4260 × 0.9963 × 4 |
| Ghost | 0.00552815 | (0.00058651, -0.15512189, 0.15697484) | 1.4369 × 1.0167 × 4 |

Root transforms, movement, AI, countdown, race results, collision extents, and
chase-camera target remain unchanged. The camera follows the player gameplay
root. The fixed collision width remains 1.8, slightly wider than these visuals;
their 4-unit length matches the existing collision depth.

Assets by [Renafox](https://sketchfab.com/kryik1023), both licensed
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/):

- Player: [Old Rusty Car 2](https://sketchfab.com/3d-models/old-rusty-car-2-544aa41de67b48cf89f8fcc2bb06e8f4).
- Ghost: [Old Rusty Car](https://sketchfab.com/3d-models/old-rusty-car-95baa20ebc5d4d2e869f0b549be838fe).

Runtime adaptations: uniform resizing, pivot correction, baked-plane removal,
shadow flags, and ghost material tint/transparency. Regression checks in
`tests/highway/road.test.js` parse all three real GLBs with only texture decoding
substituted, verify seating along the route, visual count/centering/size, material
flags, existing race behavior, and partial-load ownership.

### GLB road visuals

`src/levels/highway/road.js` loads `/models/highway.glb` once per Level 3
load, before the race controllers are created. A failed load uses the existing
level-load error handling; it does not start a race without asphalt.

The supplied asset is a single flat, textured quad: 20 units long along imported
X, 14 units wide along imported Z, with one embedded 512×256 JPEG. It contains
asphalt and lane markings, but no shoulders, barriers, trees, lights or cameras.
The old procedural asphalt and white centre-dash meshes are removed. Existing
roadside scenery, barriers, start stripe and finish gantry remain.

The GLB geometry is cloned, subdivided, and conformed to the **unchanged** race
path. Imported longitudinal X maps to the path tangent and lateral Z to its
perpendicular (equivalent to yaw `pathAngle - Math.PI / 2` on straight sections).
Authored UVs are interpolated from the asset's corners. Tiles share identical
edge vertices; path control points are included in the subdivision. There is
no overlapping asphalt, Y jitter, hidden underlay or road-mesh collider.

The measured 20-unit length determines repetition: 48 tiles cover the
952.658509-unit path, with the last tile clipped to the endpoint. One additional
tile extends behind the start for the chase camera. The finish remains at
progress 892.658509, world Z = -880.

The source material is explicitly unlit. Only that case is adapted to a lit
`MeshStandardMaterial`, retaining its color, texture, UVs, color space and
sidedness so existing headlights and car shadows work. Geometry is per-tile;
material/texture are shared and disposed by the existing level-root lifecycle.

Tuning is isolated in `road.js`:

- `HIGHWAY_MODEL_URL`: source asset.
- `HIGHWAY_MODEL_SCALE = 1`: uniform asset scale; width is validated against
  the existing 14-unit race corridor. Changing width needs deliberate alignment.
- `HIGHWAY_SURFACE_Y = 0.05`: original road elevation. Start/finish stripes and
  obstacle/pickup elevations still assume this height.
- `ROAD_SAMPLE_STEP = 2`: maximum longitudinal subdivision spacing.
- `START_RUNOFF_SEGMENTS = 1`: tiles behind the start.
- `ROAD_ANISOTROPY = 8`, `ROAD_ROUGHNESS = 0.92`: surface rendering.

Car controller roots remain at Y = 0.2, player lateral offset +2 and ghost -2.
Only the visible car children are lowered by their measured bounding-box offset
to meet the road. Controls, camera, collision, countdown, ghost AI, progress,
finish detection and result states are unchanged.

The new asset is credited in its embedded metadata as **Highway** by
[Genkidonky](https://sketchfab.com/Genkidonky),
[source](https://sketchfab.com/3d-models/highway-3a23cea9b8f2493f9e1ae93f82881145),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Runtime adaptations: path-conformed subdivision and lit asphalt material.

Regression checks: `node --test tests/highway/road.test.js` loads the actual GLB
geometry (substituting only image decoding in Node), checks tile seams, road
coverage throughout the steering envelope, vehicle ground contact, countdown,
both winners and failed loading. Real browser checks are needed for the JPEG,
lighting, texture repetition and WebGL rendering.

### GLB city environment

`src/levels/highway/city.js` loads `/models/street_city_buildings_8.glb` once
per Level 3 load (sequentially after the road) and prepares one shared
template. The asset imports with a −90° root rotation and a 0.01 root scale;
the baked world transforms are kept and the 73 meshes are merged per material
into 8 batches (one geometry + material each) with shadows enabled and the
measured footprint stored as `userData.cityBox`. The flat ground slab
`Plane.002_Material.010_0` — the only mesh on its material — is removed and
disposed so the buildings sit on the highway's own ground; source geometries
are then disposed. The load is scenery only: a failure logs a warning and the
highway stays complete without a city.

`HighwayEnvironmentManager.setupCity` builds the corridor statically: for each
side of the road, blocks are placed from distance 0 to path length + 18 by
walking `getCityFrame(distance)`, whose tangent/normal are sampled ±4 units
along the path, so placement follows the road bends. Each block is a clone of
the template under `highwayEnvironment → cityEnvironment`, yawed to the path
tangent, optionally rotated 180°, scaled, and pushed laterally to a measured
clearance. There is no per-frame placement work; `updateCity` only toggles
visibility beyond `CITY_DRAW_DISTANCE = 140`.

Repetition varies without moving parts: block index parity alternates which end
carries the outlying group (the two sides run in opposite phase), scale varies
±2%, clearance varies 17…18.5, and the longitudinal gap depends on the block
just placed — 20 ± 0.7 after an upright block, 25 ± 1.2 after a rotated one.
The asymmetric gaps keep consecutive footprints overlapping by about a metre,
so the street wall has no section-sized holes; the layout was verified against
the real mesh intervals over the whole path (0 junction gaps on both sides).
Result: 87 blocks (44 left, 43 right).

Blocks are straight while the road curves, so `settleCitySection` starts from
the frame position and shifts along the path normal (at most 4 attempts) until
`measureCityClearance` — the point-to-polyline distance of every footprint
corner — meets `CITY_SAFE_ROAD_CLEARANCE = 17` within
`CITY_CLEARANCE_TOLERANCE = 0.02`. Measured minimum: 17.01, clear of the
14-unit road, the shoulder band and the chase camera.

Tuning is isolated in `environment.js` constants: `CITY_MODEL_SCALE = 1.5`,
`CITY_Y_OFFSET = -0.15` (outer ground top), the clearance/spacing/scale
variation ranges, `CITY_DRAW_DISTANCE`, `CITY_END_CUSHION = 18`, and
`CITY_SIDES`.

Regression checks in `tests/highway/city.test.js` assert one load of the city
URL, 8 template batches with shadows, both sides, shared geometry and
materials, the group parent chain, minimum clearance, footprint coverage of
every 2 units of the path, visibility culling without rebuild, clean dispose,
and a restart that rebuilds the same count without duplicating groups;
`tests/highway/road.test.js` counts 4 GLB loads in total.

The asset is credited in its embedded metadata as **street city buildings (8)**
by [dasy444](https://sketchfab.com/dasy444),
[source](https://sketchfab.com/3d-models/street-city-buildings-8-873c5f14ec464966a11a4d772d187270),
licensed
[Sketchfab Standard](https://sketchfab.com/licenses).
Runtime adaptations: per-material merge, ground-slab removal, shadow flags, and
path-conformed placement. Real browser checks are needed for lighting, texture
repetition and shadows.

