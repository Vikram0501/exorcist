# Level 2 — The Undead Train

## Overview

An undead creature stalks the carriages of a moving train, attacking anything it
finds. Evade the monster, search the train for tools and holy relics, and
eventually confront it.

## Gameplay Focus

- Stealth
- Resource gathering
- Tension

## Level Details

The five carriages use collision against the actual model surfaces, including
chairs, partitions, side walls, floors, and ceilings. Thin panels block from
either side. Movement uses small collision steps to prevent sprinting through
walls, while openings in the models stay open.

A balanced triangle BVH is built in a background worker once per unique
carriage model and shared by repeated cars. Each triangle is stored once;
long train surfaces cannot multiply across spatial subdivisions. Geometry
extraction yields to the browser, and collision queries inspect only nearby
surfaces. Each instance applies its carriage offset to keep collision aligned
with the visible train. Tests exercise furniture, walls, and the aisle using
the shipped carriage geometry.

Only the starting carriage is lit. Crossing the boundary into the next
carriage cuts those lights for good, leaving the rest of the train dark.
Carriages that start dark are created without point lights at all, so they
never reach the GPU light list. Debug light helpers and labels are created
only when the light debug view is enabled. The train's moonlight no longer
renders a large shadow map.

## Stalker AI

The burnt zombie is a SkinnedMesh cloned through `SkeletonUtils` and driven by
its bundled clip with an `AnimationMixer`. It is fitted to `1.3` units, a
little taller than the player's `1.0` capsule, by measuring mesh geometry:
`Box3.setFromObject` measures skinned vertices and reports a fresh clone six
times too small, which used to scale the stalker up past the carriage roof.
`src/levels/train/zombie.js` owns its state machine; `game.js` ticks it once
per frame and shows the retry screen when it reports a catch.

- **Dormant** until the player leaves the spawn carriage by crossing the far
  wall of its bounds. It starts parked at the far end of the carriage after
  the spawn carriage, aligned to the free lane at that depth, then pauses half
  a second and walks the aisle line (`x = 2.9`) between the two ends of the
  train, inset by three units, reversing with a `1.4` second pause at each
  edge. Patrol speed is `1.2`.
- **Corridor** is measured from the shipped collision at load rather than
  hard-coded. `corridorProfile` walks the patrol range in `0.25` unit depth
  steps with a capsule standing in the carriage (feet to waist, `0.2` radius),
  keeps the free run nearest the aisle, reconnects forks that would otherwise
  strand a layer, and smooths each lane toward its neighbours so it slides
  around furniture instead of snapping. The table it builds is a lane profile
  per depth: it swings left of the end-section lockers (`x ≈ 1.1 … 2.1`),
  right of the opposite locker (`x ≈ 3.6 … 4.4`), and narrows to the doorway
  (`x ≈ 2.45 … 3.05`) at every carriage junction, falling back to a `2.55 …
  3.05` aisle band when there is no collision data. Each frame the lane is
  re-trimmed with a handful of probes at the zombie's exact depth, so edges
  that fall between two samples cannot be stepped into. The zombie has no
  collision of its own; the lane is the fence.
- **Hunt** whenever the player is exposed and within `7.5` units. Exposure
  means not meeting the hiding rule below: standing, moving at more than a
  crouch, or shining the torch anywhere in the carriage. Moving and lit are
  tracked separately, so a brief torch beam holds its interest for `4.5`
  seconds after the beam leaves. It closes both axes at once at a constant
  `2.6` speed, aiming at the player clamped into the corridor lane, and stops
  `0.4` units out. When the seat backs keep it from reaching that point it
  keeps moving: it paces the aisle `1.5` units past the target and back,
  holding position in front of the player rather than freezing where the
  geometry stopped it.
- **Hidden** when crouched, torch off, and at least `0.95` units off the aisle
  line, which puts the player between the seat backs. Hidden players are
  undetectable regardless of distance; a stationary player in the aisle is only
  found by touch.
- **Caught** when a hidden player is within `0.45` units or an exposed player
  within `0.75` of its grip, which reaches `0.6` units past the corridor lane
  into the seats. Contact ends the run and `game.js` reuses the shared retry
  screen to restart the level.
- Floor height comes from capsule probes against the carriage BVH. A single
  column can read a seat back or the ceiling above it, so the probe takes the
  lowest of seven columns spread along the patrol line, which lands on the
  `0.4` unit deck. It is culled past the same `40` unit distance used for
  carriage visibility.

Hold **C** to crouch. Crouching lowers the eye height to `0.55`, keeps the feet
planted, and walks at `0.45` speed; releasing it restores the stance in place.


