// Level 3 (highway) controls hint: a small bottom-centre panel mirroring
// the Level 1 `#hudControls` styling, listing only the keys the highway
// car controller actually handles (see car.js readInputs(): KeyW throttle,
// KeyA/KeyD steering, KeyS brake/reverse, Space drift; Esc exits via
// main.js). Pure DOM toggling, no gameplay or input handling, so it can
// never intercept keyboard or pointer interaction (CSS pointer-events).
export const HIGHWAY_CONTROLS_ID = 'highwayControls'

export const ON_FOOT_CONTROLS_ID = 'hudControls'


function setHidden(el, hidden) {
  if (!el) return

  if (el.classList?.toggle) {
    el.classList.toggle('hidden', hidden)
  } else if (el.style) {
    el.style.display = hidden ? 'none' : ''
  }
}


// Shows the racing controls during highway gameplay and restores the
// on-foot hint everywhere else (menu, loading, other levels, exit).
// Safe with missing nodes (headless/tests) and idempotent.
export function setControlsHint(documentRoot, levelName) {
  if (!documentRoot?.getElementById) return

  const isHighway = levelName === 'highway'

  setHidden(
    documentRoot.getElementById(HIGHWAY_CONTROLS_ID),
    !isHighway
  )

  setHidden(
    documentRoot.getElementById(ON_FOOT_CONTROLS_ID),
    isHighway
  )
}
