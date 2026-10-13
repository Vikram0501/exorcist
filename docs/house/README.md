# Level 1: Vale Manor

Investigate Evelyn Vale's disappearance, uncover her father's confession, escape
the pursuing caretaker Elias Wren, and complete the exorcism at Evelyn's grave.

## Files

| Location | Purpose |
| --- | --- |
| `src/levels/house/index.js` | Environment loading, collision, doors, opening investigation props |
| `src/levels/house/lighting.js` | House lights, sky, and moon |
| `src/levels/house/audio.js` | Music, footsteps, doors, telephone, ghost sounds, and screams |
| `src/levels/house/story.js` | Evidence, progression, apparition timing, and release rite |
| `src/levels/house/story-assets.js` | Authored ghost and grave helpers |
| `src/levels/house/story-view.js` | Captions, journal, and rite UI |
| `src/levels/house/pursuit.js` | Ghost chase and retry state |
| `tests/house/` | Story, audio, and music startup tests |

Paths in this table are relative to the repository root. Shared game orchestration
remains in `src/core/game.js`.

## Assets and adding models

All Level 1 assets live in `public/levels/house/`:

```text
models/house.glb            Original house export and authored story props
models/house-runtime.glb    Optimized house asset loaded by the game
textures/moon.png          Moon texture
audio/ambience.ogg         Background music
audio/footsteps-house.ogg  Indoor footsteps
audio/footsteps-path.ogg   Outdoor footsteps
audio/door-open.ogg        Door opening
audio/door-close.ogg       Door closing
audio/ghost-footsteps.ogg  Ghost footsteps
audio/ghost-breath.ogg     Ghost breathing
audio/ghost-voice-01.ogg    First ambient ghost recording
audio/ghost-voice-02.ogg    Second ambient ghost recording
audio/phone-ring.ogg       Telephone ring
audio/screams/             scream-01.ogg through scream-04.ogg
```

Add future house props to `public/levels/house/models/` with descriptive lowercase
names, for example `diary.glb` or `music-box.glb`. Files in `public/` are served
without that prefix: `/levels/house/models/diary.glb`. Adding a file alone does
not place it in the scene; its loader, position, and interaction must also be wired
into the house code.

The environment loads with `GLTFLoader` and `MeshoptDecoder`, at scale `0.15`.
Preserve its authored hierarchy, node names, pivots, and transforms: doors,
investigation props, the two ghosts, and the grave depend on them. Structural collision
uses an Octree built from selected model meshes; doors retain dynamic bounds.
Replacement exports need their evidence placement and collision checked in game.

## Story and verification

- [Current playable route and behavior](playthrough.md)
- [Original design brief](archive/design-brief.md): historical planning, including
  ideas that are not implemented; use the playable route for current behavior.
- [Project conventions](../BUILDSPEC.md)

From the repository root, run `npm test` and `npm run build`. For a manual check,
run `npm run dev`, start the house, and follow the playable route. Music should
begin only after the loaded scene is visible and the player enters the game.
