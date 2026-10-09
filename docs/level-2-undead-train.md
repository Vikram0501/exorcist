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
- **Hidden** when crouched, torch off, and anywhere the zombie does not walk:
  outside the corridor lane at the player's depth (`lane ± 0.2`), which covers
  the seat backs and every other spot off the patrol line. Hidden players are
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

Press **Ctrl** to crouch, and again to stand. Crouching lowers the eye height
to `0.55`, keeps the feet planted, and walks at `0.45` speed, so the stance
holds without touching the key.

## Clues and field notes

The train hides the spirit's name across its carriages. `story-data.js` holds
four ghost profiles, each a short kana name with a romaji reading and two
residue hints. Every run picks one at random, so a retry after a catch rolls a
new name and a new layout.

- A letter laid flat on the floor ahead of the spawn teaches the level in
  story voice: the stalker's weakness, the hidden name marks, the residues, the
  field notes and the front-carriage goal. It is read by holding **E** like any
  other clue, opens the shared inspection panel, and becomes the first field
  note entry — replacing the old opening summary. Its height is probed from the
  collision deck so the paper sits on the floor in every run.
- The name is split into individual kana marks. `createCluePlan` shuffles the
  marks across a pool of floor anchors — each glyph lies flat on the deck
  between the seat banks, in the walking lane — one per carriage across
  the rear four cars, so the reading order never matches the name order.
  Selection is driven by an injectable RNG, which keeps the tests
  deterministic.
- Two fixed residue clues — a torn ticket and a half-burned name tag — sit low
  in the dark carriages. Reading one hands over a single mark, so a cautious
  player can infer the name without reading every mark in the open.
- A mark is read by holding **E** for `1.2` seconds in the world. Pointer lock
  stays held, so the stalker keeps ticking while the player reads: the read is
  the exposure window. `#holdProgress` fills at the bottom of the screen, and
  releasing **E**, looking away or being caught resets it.
- Reading fills a slot on the name board, reusing Level 3's `createGhostNameUI`
  (`revealLetter`), shown in kana with a counter of collected marks.
- Field notes (**I** / Evidence) use the same book as Level 1. `game.js` now
  takes a per-level journal builder, and the train renders the rear-carriage
  letter once read, read residue, read marks in name order, then the fire note
  once the front carriage is reached.
- Clue props are canvas-textured planes — a mark is nothing but the red kana
  glyph, no panel, outline or transliteration, so it reads as paint on the
  deck — parented to their carriage groups, so the carriage visibility culling
  still applies and the raycast reaches them across the whole train. Their
  materials are light-reactive, so a mark in a dark carriage only reads
  clearly inside the flashlight beam or a carriage's own lights — sweeping
  the torch is how you search, and the torch is what the stalker notices.
  Textures are skipped when there is no DOM, so the modules load under
  `node --test`.
- Placement is verified against the shipped collision: every clue must lie on
  walkable floor and must be seen first from a standing player's eye height
  (the descending ray has to hit the prop before the carriage surface). The
  seeded plan is checked in one test, and every anchor in the pool is checked
  in its own.

The exorcism finale is designed — assemble the kana in the burnt front carriage
and speak the name — but not built yet; the clue system is complete without it.



