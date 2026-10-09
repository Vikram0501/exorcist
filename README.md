# Exorcist: Vale Manor

A browser-based 3D horror game built with Three.js. Investigate Evelyn Vale's disappearance, uncover the truth about Elias Wren, and complete the exorcism at her grave.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Use `npm test` for the house tests and `npm run build` for a production build.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look around |
| `E` | Interact and inspect |
| `I` | Field notes |
| `T` | Torch |
| `V` | Switch first/third-person view |
| `Shift` | Sprint |
| `C` | Toggle crouch |
| `Space` | Jump |
| `R` | Respawn |
| `Esc` | Case menu |

## Level 1 assets

The editable house scene is `source-assets/house.glb`. The game loads the smaller `public/levels/house/models/house-runtime.glb`, generated from that source with:

```bash
python scripts/optimize-house-glb.py
```

The priest uses `priest-player.glb`, a gameplay copy containing idle and directional walking clips. Its original source is kept locally at `source-assets/priest_all_animation.glb`; run `python scripts/prepare-priest-player.py` to regenerate the gameplay copy. See the [priest attribution](public/levels/house/models/PRIEST-LICENSE.md).

For a bathroom reflection, add a separate plane named `BathroomMirror` to the house source and regenerate the runtime GLB. See the [mirror guide](docs/level-1-bathroom-mirror.md). The [house notes](docs/house/README.md) describe the story assets and playable route.
