# Level 1 bathroom mirror

The game turns one mesh named `BathroomMirror` into a live mirror. There is no such mesh in the current house export yet.

1. Open `source-assets/house.glb` in Blender. Add a single flat rectangular plane over the bathroom mirror area, slightly in front of its backing or frame. Name the **object** exactly `BathroomMirror`.
2. Face the plane's front normal into the bathroom. It can have an ordinary placeholder material; the game replaces its visible surface. Keep the frame as separate geometry.
3. Export the entire house as glTF Binary to `source-assets/house.glb`. Then run `python scripts/optimize-house-glb.py` from the project root to rebuild `house-runtime.glb`, which Level 1 loads.
4. Reload Level 1 and look at the plane. The mirror will reflect the room and the priest, including in first-person view. If it looks blank, flip the plane's face normal in Blender and export again.

The reflection uses a 512 × 512 render target so it does not double the game's full-screen rendering cost.
