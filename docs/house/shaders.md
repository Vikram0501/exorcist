# Level 1 haunting effects

`src/levels/house/shaders.js` attaches two story effects to Vale Manor. They are removed when the level unloads and never block clue raycasts.

| Effect | When it appears | Appearance |
| --- | --- | --- |
| Telephone signal | While the upstairs phone rings | Three glowing blood red semicircles expand from the receiver. |
| Elias smoke | During the chase | Three transparent black wisps drift around Elias and follow the figure. |

The smoke uses three small camera-facing shader planes. Elias keeps the figure's own opacity. The phone arcs use ring geometry and additive materials. The grave has no shader or added glow.
