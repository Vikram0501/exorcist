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

<!-- Add your level-specific information below -->

