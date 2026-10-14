# Level 1 bathroom mirror

The game turns the authored bathroom plane into a live mirror. The October 13 house export names it `Bathroom Mirror`; Three.js loads that as `Bathroom_Mirror`. The installer accepts both forms and `BathroomMirror`.

The new source model has been pulled and `house-runtime.glb`, which Level 1 loads, has been rebuilt from it. To check it, enter the bathroom and look above the sink. The mirror reflects the room and the priest, including in first-person view.

If the model changes again, keep the mirror pane separate from its frame, face its front normal into the bathroom, and run `python scripts/optimize-house-glb.py` after exporting `house.glb`.

The reflection uses a 512 × 512 render target so it does not double the game's full-screen rendering cost.
The runtime adds a dark metal trim and a warm local light to reveal the priest in the reflection.
