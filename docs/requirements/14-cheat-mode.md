# 14 — Cheat Mode (Hashimoto Protocol, Testing Only)

- **ID:** 14-cheat-mode
- **Supersedes:** (new)
- **Type:** Testing / Debug (non-normative for gameplay balance)
- **References:** `02-canvas-system.md` (mouse mapping `getCanvasMousePos`, logical space), `04-physics-and-collision.md` (ball state, wind), `05-input-and-states.md` (game states, attempts)

## 1. Purpose

A hidden testing aid honoring the old classics. Entering the Konami code on the
keyboard activates cheat mode ("Hashimoto Protocol"), in which the ball can be
dragged and dropped anywhere on the course with the mouse. This is a manual
testing tool only: it is session-scoped, never persisted, and never advertised
in any menu, help text, or HUD.

## 2. Activation / Deactivation — Konami Code (Toggle)

- The trigger sequence (by physical key, `KeyboardEvent.code`) is exactly:
  `ArrowUp, ArrowUp, ArrowDown, ArrowDown, ArrowLeft, ArrowRight, ArrowLeft, ArrowRight, KeyB, KeyA`
  ("up,up,down,down,left,right,left,right,b,a").
- Detection is passive: it observes `keydown` events without consuming them
  (aiming, charging, menus keep working normally while the code is entered).
- Detection is skipped while typing in `INPUT`/`TEXTAREA`/editable elements
  (e.g. the campaign seed box) and while `Ctrl`/`Alt`/`Meta` is held; key
  auto-repeat (`e.repeat`) is ignored.
- Any non-sequence key (except pure modifiers) resets progress; overlapping
  input restarts from the matching prefix (e.g. a third `ArrowUp` restarts at 1).
- The code toggles cheat mode:
  - When cheat mode is off, completing the sequence calls
    `showToast("Hashimoto Protocol Activated")` (exact text) and sets the
    session flag `cheatMode = true`.
  - When cheat mode is already on, completing the sequence again shows a popup
    with the exact text `Hashimoto Protocol Disabled` (same `#toast` popup
    mechanism) and exits cheat mode (`cheatMode = false`). If the ball is
    currently held, it is dropped in place first (stays where it is with
    `vel = {x:0,y:0}`, wind resumes next tick) and grabbing is disabled from
    that moment on.

## 3. Cheat Ball Drag & Drop

While `cheatMode === true`:

- **Grab:** left `mousedown` on the canvas within `BALL_RADIUS + 10` of the
  ball center starts a ball drag, provided no modal is blocking (`mainMenu`,
  pause, reward menu, hole/attempts/free-shot banners, cutscene, banter, coin
  summary, starting items/loadout) and `gameState ∈ {'AIMING','CHARGING','FLYING'}`
  (never `WIN`/`GAME_OVER`). The ball takes precedence over modifier circles
  on grab (small ball radius wins over the large modifier radius).
- **Counts as launched:** grabbing from `AIMING`/`CHARGING` transitions exactly
  as if the ball was launched — `ball.isMoving = true`, `ball.vel = {x:0,y:0}`,
  `ball.z = 0`, `gameState = "FLYING"`, `modifiersTraversedThisShot` reset,
  charge cancelled, softlock detection reset — except the ball does not fly:
  it sticks to the cursor. Attempt accounting is unchanged (launches never
  consume attempts; failure resets via `R`/hazards still do, per
  `05-input-and-states.md` §4).
- **Held:** every tick while held, `updateWindUniforms` still runs (particles
  keep animating) but the ball ignores wind, friction, win, treasure,
  collision, and softlock — `ball.pos` follows the clamped cursor,
  `ball.vel = {x:0,y:0}`.
- **Drop:** `mouseup` (anywhere, listener on `window`) ends the drag: the ball
  stays at the clamped cursor position with `vel = {x:0,y:0}`, softlock
  detection resets, progress saves, and from the next tick the ball interacts
  with wind, hazards, treasure, and the hole normally (still `FLYING`).
  Dropping onto the hole wins on the next tick; dropping onto water/OB/edge
  resets on the next tick, per `04-physics-and-collision.md`.
- Positions are clamped to `[BALL_RADIUS, LOGICAL_W-BALL_RADIUS] ×
  [BALL_RADIUS, LOGICAL_H-BALL_RADIUS]`.
- The `click` immediately following a drop is swallowed (no accidental
  modifier placement, even if a `resetBall` between `mouseup` and `click`
  returned the game to `AIMING`).
- `resetBall()`, `loadLevel()`, and run teardown clear a stale drag so the
  ball can never stick to the cursor after a reset. `R`/pause `Next Attempt`
  keep working mid-drag (they reset the ball and cancel the drag).
- Cursor feedback: hovering the ball in a grabbable state shows `grab`,
  dragging shows `grabbing`.

## 4. Non-Goals / Constraints

- Cheat state (`cheatMode`, drag state, Konami progress) is runtime-only: never
  written to `STORAGE_KEY`, never restored, never affects `bestTotal`, points,
  rewards, or course generation.
- No UI advertises it: no button, no help entry, no HUD change. Only the
  activation/deactivation toast popups (auto-hide after ~2s like all toasts).
- No `prompt`/`alert`/`confirm` (unlike the unrelated `hole` selector secret).
- Test hooks: `window.__isCheatMode`, `window.__activateCheatMode`,
  `window.__deactivateCheatMode`, `window.__toggleCheatMode`,
  `window.__isCheatDraggingBall`.

## Acceptance Criteria

- [ ] Typing the full sequence (with other keys before it, and with normal aim
  keys interleaved only as part of the sequence) shows a `#toast` with exactly
  `Hashimoto Protocol Activated`, visible then auto-hidden; wrong keys reset
  progress (typing `up,up,up,…` does not activate); typing in the seed input
  does not trigger it.
- [ ] Typing the full sequence again while cheat mode is on shows a popup with
  exactly `Hashimoto Protocol Disabled` and exits cheat mode: `mousedown` on
  the ball no longer grabs it (falls through to normal modifier/placement
  behavior), and a ball held at that moment is dropped in place with `vel`
  zero. A third entry of the sequence re-activates (`Activated` toast again).
- [ ] After activation, `mousedown` within ~10px of the ball edge in `AIMING`
  grabs it: `gameState` becomes `FLYING`, ball follows the mouse on `mousemove`
  with `vel` zero and no wind drift/win/treasure triggering while held.
- [ ] `mouseup` drops the ball: it stays put, then drifts under wind on
  subsequent ticks; dropping on the hole wins; dropping on water resets
  (attempt consumed per normal rules).
- [ ] The post-drop `click` never places a modifier, even if the drop caused an
  immediate reset to `AIMING`.
- [ ] Modal states (main menu, pause, reward, banners, cutscene, banter,
  summaries) block grabbing; `R` mid-drag resets to tee and cancels the drag.
- [ ] Reload clears cheat mode; no cheat keys appear in saves.

## File Paths

- `docs/requirements/14-cheat-mode.md:1` (this file)
- `src/main.js:1` (`cheatMode`, `cheatDraggingBall`, Konami listener, grab/drop in mouse handlers, `update()` held-ball branch, `loop` untouched)
- `index.html:1` (existing `#toast`, reused as-is)
- `style.css:1` (existing `#toast` styles, reused as-is)
