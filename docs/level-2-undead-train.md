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
- **Hunt** whenever the player is exposed and within `5.5` units. Exposure
  means not meeting the hiding rule below: standing, moving faster than a
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

The exorcism finale lives in the burnt front carriage — the type `01` car the
level opens with — as an ash seal ringed by candles.

- `createExorcismChamber` (`exorcism.js`) picks the carriage with the greatest
  `bounds.max.z`, lays a `1.05` radius circle a hair above the deck at the
  `RITE_SEAL` anchor (`x: 2.7`, `t: 0.62` → world `z ≈ 19.0`), and adds six
  candles plus exactly one `PointLight`. The carriages stay dark by design, so
  the chamber carries its own glow; the seal and candles are plain meshes and
  never join the collider, so the aisle stays walkable. The seal material is
  canvas-drawn (ring, thirty-six ticks, a cross, ash speckle) and drops the
  texture when there is no DOM, keeping the module loadable under
  `node --test`. The returned root is parented to the carriage group, so the
  visibility cull and the investigation raycast treat it like any clue.
- Placement is checked against the shipped collision: the anchor reads the real
  deck through `trainFloorAt`, a standing capsule fits before and on the seal,
  and a descending ray from eye height hits the seal before the carriage floor.
- The seal is an investigation item of `kind: 'rite'`. Looking at it reports
  `The name is not whole · n of N marks` until every slot is filled, then
  `Hold E · Speak the name`. Holding **E** charges for `RITE_HOLD_SECONDS`
  (`2.5`, twice a clue's `1.2`) and opens the rite panel — a longer charge is
  the last exposure window, since the stalker still patrols the carriage.
- `#trainRite` mirrors Level 1's rite dialog: the game freezes while it is open
  (releasing pointer lock clears `active`), the shuffled `riteMarks` tray
  rebuilds the name mark by mark into numbered slots, and the field notes can
  be opened over the top at a higher z-index without losing the assembly.
  `TrainRiteView` owns the DOM, traps Tab, and re-locks the pointer when it
  closes.
- A wrong mark calls `failRite('wrong-mark')`: the order resets, an outcome
  screen explains that something heard the syllables, and dismissing it clears
  `failureReason` and calls `zombie.stalk(player.x, player.z)` so the stalker
  comes to the player instead of resuming its patrol. Everything already read
  stays in the field notes, so a break costs the walk back to the seal, not the
  investigation.
- **SPEAK THE NAME** runs `speakName()`, which sets `released`, announces the
  name, and makes the next frame of `game.js` call `zombie.banish()` — the
  stalker leaves the aisle for good (`state: 'banished'`, hidden, `update`
  returns `null`). The objective becomes
  `THE NAME IS SPOKEN · LEAVE THE BURNT CARRIAGE` and the journal gains
  `the-name-spoken`.
- `exitZ` is the front carriage's `bounds.min.z`. Stepping back across it after
  the name is spoken sets `complete`, switches the objective to
  `CASE CLOSED · THE TRAIN RUNS ON QUIET`, and records `the-run-ends`; five
  seconds later the outcome screen offers **Return to the case menu**, which
  un-hides `#overlay` exactly as Level 1 does.
- Nothing new is drawn per frame: `TrainRiteView.update` only watches
  `story.complete`, and `game.js` disposes the view and the chamber in
  `unloadCurrentLevel`, so a restart or a level change tears both down.
- `tests/train/exorcism.test.js` covers the placement against real geometry,
  the gating, the assembly, the failure, and the run's end; `zombie.test.js`
  covers `stalk` and `banish`.



