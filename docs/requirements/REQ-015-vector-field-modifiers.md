# REQ-015: Vector Field Modifiers - Hotbar & Placement System

- **ID:** REQ-015
- **Title:** Vector Field Modifiers - Hotbar & Placement System
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Field Manipulation

## Description
The player SHALL be able to manipulate the vector field before shooting by placing circular area modifiers on the field with the mouse. Modifiers SHALL be selectable from a hotbar on the bottom of the screen. Once placed, each modifier SHALL affect an area in a circle around its position, altering the wind vectors sampled via `getWindAt` within that radius.

## Rationale
User requested ability to strategically shape the wind field before each shot, turning the game from pure aiming into a puzzle where the player designs a wind corridor. A hotbar provides clear, accessible choices; mouse placement gives spatial control; circular area ensures intuitive influence.

## Requirements

1. **Hotbar UI** in `index.html` / `style.css` and/or `src/render.js`:
   - A horizontal hotbar SHALL be rendered as a **transparent overlay** centered at the bottom edge of the canvas (`#game-container` `position:absolute; bottom:10px; left:50%; transform:translateX(-50%)`), **not** as a solid bar below the canvas or an opaque DOM strip that would obscure the lower playing field. Background SHALL be semi-transparent (`rgba(0,0,0,0.35-0.45)` or `rgba(20,20,20,0.45)`) with `backdrop-filter: blur(4-6px)`, `border-radius:10px`, `padding:6px 10px`, `z-index:5`, and `display:flex; gap:10px` so the green fairway, wind arrows, obstacles and ball near the bottom edge remain visible underneath. The hotbar overlay SHALL NOT push layout or cover the canvas outside its own pill; it floats over the canvas.
   - Each slot SHALL show an icon/label and count (if limited) or infinite usage indicator:
      - Slot 1: `Amplify x5` (e.g., icon `>>` or `↑↑`, color `#e67e22` orange)
      - Slot 2: `Nullify` (e.g., icon `○` or `∅`, color `#3498db` blue)
      - Slot 3: `Flip` (e.g., icon `↻` or `⇄`, color `#9b59b6` purple)
   - Slots SHALL use the **same style as modifiers in the pause menu** (`.reward-stats > div`): `background: rgba(255,255,255,0.06)` `border: 1px solid rgba(255,255,255,0.18)` `border-radius: 6px` `font: 600 11px system-ui, sans-serif` `color: white` with `-webkit-text-stroke: 2px rgba(0,0,0,0.65)` `paint-order: stroke fill` `min-width: 80px` `padding: 6px 10px` `justify-content: space-between`, icon `14px` with type colors (`#e67e22` amplify `»`, `#3498db` nullify `∅`, `#9b59b6` flip `⇄`), count `700 12px` white with stroke, key badge `600 10px` `rgba(0,0,0,0.35)`. Selected state SHALL be same as pause menu hover but with type-tinted fill (`amplify rgba(230,126,34,0.28) border rgba(230,126,34,0.9)`, `nullify rgba(52,152,219,0.28) border rgba(52,152,219,0.9)`, `flip rgba(155,89,182,0.28) border rgba(155,89,182,0.9)`) and `scale 1.04`, remaining semi-transparent — no opaque `background:#2c3e50` or `#34495e`.
   - Selection SHALL be via mouse click on hotbar slot or keyboard `1`, `2`, `3` **even when the hotbar is collapsed** (hotkeys remain functional). Selected slot SHALL be visually highlighted with type-tinted fill as above — highlight SHALL remain semi-transparent (no opaque solid selection).
   - **Deselection**: Pressing `Escape`, pressing the number hotkey of the currently selected modifier (e.g., `1` when Amplify already selected), or clicking the hotbar button of the currently selected modifier SHALL deselect it, leaving **no modifier selected** (hotbar shows no highlight, no preview circle). This allows the player to cancel placement without having to place.
   - **Transparent & Pause-Menu Style**: The hotbar container SHALL remain translucent (`rgba(0,0,0,0.35-0.45)` + `backdrop-filter:blur(4px)`), and idle slots SHALL use pause-menu style (`rgba(255,255,255,0.06)` + `1px rgba(255,255,255,0.18)`) — no opaque solid background, no `background:#fff` or `background:rgba(44,62,80,0.75)` at `1.0`. Only the selected slot brightens to type-tinted `rgba(...,0.28)` with `border rgba(...,0.9)` but stays semi-transparent. This ensures the lower `~80px` of the field remains readable through the overlay (arrow grid / particles visible underneath) and hotbar visually matches `.reward-stats` in `style.css:237`.
   - **Collapsible / Expandable**: The hotbar SHALL be collapsible to minimize obstruction of the lower playing field:
     - Default state is **expanded** during `AIMING`/`CHARGING` (slots visible as `flex` gap `10px`, container `padding 6px 10px`).
     - A toggle control SHALL be provided — a small collapse button/handle (e.g., `<button id="hotbar-toggle" aria-label="Collapse modifiers">▾</button>` `32×24px` at trailing edge of hotbar, or a centered handle `36×18px` with chevron `▾` when expanded / `▴` when collapsed) — clicking it SHALL collapse/expand the hotbar with a `150-200ms` CSS `transition` on `transform`/`opacity`/`height`/`padding` (no layout shift outside the overlay). Keyboard shortcut `M` (or `B`) MAY also toggle; `Escape` remains deselect-only per existing routing and SHALL NOT toggle collapse.
     - **Collapsed state**: hotbar container shrinks to a minimal pill (`height ~28px`, `padding 4px 8px`) showing only the toggle handle (and optionally a compact summary `⋯`/`≡`) — **no modifier slots are visible** while collapsed, but **the active selected modifier SHALL NOT be deselected when the menu is collapsed** (selection persists). The underlying lower field (obstacles, ball near bottom edge, wind arrows, placement clicks) becomes fully visible and clickable; clicks on the field pass through except on the small pill itself (`pointer-events:auto` on pill, `none` elsewhere). While collapsed, **modifier hotkeys `1`/`2`/`3` SHALL still work** (they select/deselect the corresponding modifier even though slots are hidden), and **preview circle and placement SHALL still work** (if a modifier is selected, `mousemove` shows dashed preview and `click` on canvas places it, same as when expanded). Slot clicks are unavailable while collapsed because slots are `display:none`, but hotkey selection remains functional until expanded.
     - **Expanded state**: restores full three slots with same selection/disable logic per REQ-015/020 (showing persisted selection from collapsed state), toggle handle shows `▾` (collapse affordance).
     - Collapse state is ephemeral UI state: it SHALL be remembered only within the current session/hole and SHALL reset to **expanded** on `loadLevel()` / `advanceHole()` / new game (`resetGameAfterWin`/`startNewGameFromMain`/`endRun`) so the player always starts a hole with modifiers visible. It SHALL be hidden entirely (not collapsed) during `FLYING`/`WIN` as before — `FLYING`/`WIN`/`rewardMenuVisible`/`pauseMenuVisible`/`mainMenuVisible` take precedence and hide the hotbar (`display:none` or `.hidden`).
   - Hotbar SHALL be visible during `AIMING`/`CHARGING` (as pill when collapsed, as full bar when expanded); hidden (no pill, no slots) during `FLYING`/`WIN`/`reward`/`pause`/`main-menu` to prevent mid-flight manipulation.

2. **Placement Interaction** in `src/input.js` and `src/main.js`:
   - When a modifier is selected and `gameState` is `AIMING` or `CHARGING`, a preview circle (radius `80-120px`, dashed, color matching modifier) SHALL follow the mouse cursor over the canvas.
   - Left-click on canvas SHALL place the selected modifier at the cursor's logical canvas coordinates (`worldX, worldY`), if placement is valid.
   - **Deselection**: Once a modifier has been placed, **no modifier SHALL remain selected** (selection cleared to `null`). The user must explicitly re-select a modifier from the hotbar to place another. This prevents accidental consecutive placements.
   - **Draggable**: Placed modifiers SHALL be draggable to adjust position without deleting. On `mousedown` on an existing modifier circle (hit test `dist < radius`), the modifier SHALL enter dragging state, follow the mouse (`mousemove`) updating its `x,y` in real-time, and finalize on `mouseup`. Dragging SHALL be allowed only before shooting (`AIMING`/`CHARGING`), not during `FLYING`. Dragging SHALL NOT delete the modifier; it only moves it. Visual feedback: dragged modifier opacity 0.6 and cursor `grabbing`.
   - Placement SHALL only be allowed before shooting (not during `FLYING`). Placing SHALL NOT trigger a launch.
   - Right-click or `Delete`/`Backspace` SHALL remove the modifier under cursor (or last placed) for misclick correction. `R` (ball reset) does NOT clear modifiers, but advancing hole or game reset does.
   - Placement SHALL allow **any number of modifiers** in play at the same time (no hard limit). The game SHALL NOT enforce a maximum of 3 per hole; the player may place unlimited modifiers until they choose to remove them or advance holes. Previous limit of 3 is removed.
   - Modifiers SHALL be stored as array `modifiers = [{id, type:'amplify'|'nullify'|'flip', x, y, radius:90, isDragging?:boolean}]` in `src/main.js` or `src/vectorField.js`.
   - Modifiers SHALL persist through death resets (obstacle/edge) but SHALL be cleared on advancing to next hole or on game reset (`R` in WIN). **When cleared because the hole was beaten (via `handleNextHole`/`advanceHole`), each cleared modifier SHALL be consumed from supply per REQ-035 (`supply[type] = max(0, supply[type]-1)` per placed modifier) before the array is emptied; clearing without a win (e.g., initial load) does not consume.**

3. **Circular Area Effect** in `src/vectorField.js`:
   - `getWindAt(worldX, worldY)` SHALL be modified to apply all active modifiers that contain the query point (`hypot(x - mod.x, y - mod.y) < mod.radius`).
   - If multiple modifiers overlap, they SHALL be applied in placement order (stacking) – e.g., amplify then flip = flipped amplified vector.
   - Radius SHALL be `80-100px` (tunable `MODIFIER_RADIUS=90`) for all three types, visible as circle.
   - Performance: modifier check SHALL be `O(n)` with `n` being the number of active modifiers (unlimited, but typically <20), still negligible over `getWindAt` due to simple distance checks.

4. **Visualization Integration** in `src/render.js` (2D circles) and `src/windThree.js` (Three.js shader/particles):
   - Placed modifiers SHALL be drawn as circles on the **game canvas `#game`** (below ball but above background, and below the transparent wind overlay so they remain visible through low-alpha streaks): `amplify` solid orange ring `rgba(230,126,34,0.25)` with `>>` icon, `nullify` blue dashed `rgba(52,152,219,0.25)` with `∅`, `flip` purple double arrow `rgba(155,89,182,0.25)` with `↻`. While dragging, modifier SHALL be drawn with 60% opacity and `grabbing` cursor.
   - Preview circle while hovering (when a modifier is selected, before placement) SHALL be dashed 50% opacity. When no modifier is selected (after placement), no preview SHALL be shown.
   - **Wind overlay SHALL be modifier-aware**: `updateWindUniforms()` SHALL feed live `modifiers` array into shader uniforms `uModifiers`/`uModifiersCount` each frame (see REQ-004 §4). The fragment shader SHALL sample modifiers when reconstructing `vWind` at each fragment: if `dist < radius` for a modifier, transform the base field vector (`*5` for amplify, `0` for nullify, `*-1` for flip, capped) before streak generation. Particles advected in JS or shader SHALL also use `getWindAt` that includes modifiers, so particles inside/outside circles match shader streak behavior. Arrows are no longer rendered; shader streak brightness/speed inside amplify/nullify/flip SHALL update live (stronger/fainter/reversed) identically to old arrow grid requirement.

5. **Determinism** per REQ-003: modifiers SHALL be deterministic for the current hole; reloading the hole resets them.

## Acceptance Criteria

- [ ] Hotbar with 3 slots rendered as **transparent overlay** centered at bottom edge of canvas (`bottom:10px; left:50%; translateX(-50%)`), container `background rgba(0,0,0,0.35-0.45)` with `backdrop-filter:blur(4-6px)`, `border-radius:10px`, `z-index:5`; field underneath (green `#3a9d23`, arrows) remains visible through the overlay (not an opaque bar below canvas). Slots themselves use **same style as pause menu** (`background rgba(255,255,255,0.06)` `border 1px rgba(255,255,255,0.18)` `border-radius 6px` `600 11px` white with stroke, icon `14px` color `#e67e22/#3498db/#9b59b6`) not solid `rgba(44,62,80,0.75)`.
- [ ] Hotbar is **collapsible/expandable**: expanded by default during `AIMING`/`CHARGING` showing 3 pause-menu-styled slots (`flex gap 10px`); a toggle handle/button (`#hotbar-toggle` `32×24px` or `36×18px` chevron `▾/▴`) is visible at edge/center of the hotbar. Clicking the toggle collapses the hotbar to a minimal pill `~28px` height showing only the handle (no slots visible) with `150-200ms` transition; lower playing field becomes fully visible and receives placement clicks, but hotkeys/preview/placement still work. Clicking again expands back to 3 slots (showing persisted selection). Keyboard `M`/`B` MAY also toggle; `Escape` still only deselects, not collapse.
- [ ] Pressing `1` selects Amplify (highlight moves), `2` nullify, `3` flip; clicking hotbar slot does same when expanded. Pressing the same hotkey again (e.g., `1` when Amplify already selected) deselects it. While **collapsed**, `1`/`2`/`3` **still select** (slots hidden but hotkeys remain functional) — e.g., collapse, press `1`, then canvas shows preview and click places amplify.
- [ ] Clicking the hotbar button of the currently selected modifier deselects it (no selection).
- [ ] Pressing `Escape` deselects any selected modifier (no selection) and does not toggle collapse.
- [ ] With Amplify selected (whether hotbar **expanded or collapsed**), moving mouse over canvas shows orange preview circle radius ~90 following cursor; with no selection, no preview is shown. While **collapsed**, preview still shows if a modifier is selected (selection **persists** through collapse, not cleared).
- [ ] Left-click places modifier at cursor when a modifier is selected (regardless of collapsed/expanded, as long as `AIMING`/`CHARGING`); it remains drawn as solid circle after click **and no modifier remains selected** (hotbar shows no selection, preview disappears until next selection). Verified with collapsed: `1` while collapsed → preview visible → click places.
- [ ] Placed modifier is draggable: mousedown on modifier, drag moves it, mouseup finalizes; works only before shooting in `AIMING`/`CHARGING` with hotbar expanded or collapsed (drag hit-test on field, not hotbar), not during `FLYING`; dragging does not delete. Collapsed pill does not intercept field drags except on the pill itself.
- [ ] Placing a modifier does not launch ball; ball remains at tee in `AIMING`.
- [ ] `getWindAt` inside amplify circle returns ~5× original vector (verified by sampling inside vs outside).
- [ ] Arrows inside each modifier circle reflect resulting effect: inside amplify arrows more opaque/longer, inside nullify faint/zero, inside flip reversed direction (verified by sampling `getWindAt` for arrow drawing). Arrows under the transparent hotbar overlay remain visible through the semi-transparent pill.
- [ ] Hotbar hidden entirely (`display:none`/`.hidden`) during `FLYING`; cannot place/drag while ball drifting. Collapse state resets to expanded on `loadLevel`/`advanceHole`/new game.
- [ ] Right-click or Delete on modifier removes it (and refunds the supply slot, not consumed); dragging adjusts without deleting; `R` (ball reset) does not clear modifiers, but advancing hole or game reset does (**and advancing after a win consumes each placed modifier from supply per REQ-035, so `supply` is reduced by the number of modifiers that were on the field at win time**).
- [ ] Any number of modifiers can be in play at the same time; placing 5, 10 or more modifiers is allowed and all are rendered and affect `getWindAt`.
- [ ] Particles and arrows inside modifier circles visibly change per modifier type.
- [ ] Lower playing field obstruction check: with hotbar **collapsed**, the bottom `~80px` of the field shows no hotbar overlay (only small pill at bottom center); with hotbar **expanded**, the overlay is translucent so obstacles/ball at `y ~540-580` are still readable through it (verified by screenshot/opacity). No opaque bar covers the lower field in either state.
- [ ] No 3rd-party libraries; pure canvas + vanilla JS, CSS `backdrop-filter` only.

## Dependencies
- REQ-003 (vector field, getWindAt)
- REQ-002 (game loop dt)
- REQ-006/007 (input, only before shooting)
- REQ-012 (UI)
- REQ-020 (supply, placement limit)
- REQ-035 (consumption of placed modifiers from supply on win)

## Notes
- Hotbar can be DOM (`<div id="hotbar">`) for accessibility or canvas-drawn; DOM preferred for click handling.
- Store modifiers per hole in `src/main.js:modifiers` and pass to `vectorField.js` via `setModifiers()` or direct import.

## File Paths
- `index.html:30` (hotbar DOM with `#hotbar` transparent overlay, `#hotbar-toggle` collapse handle) or `src/render.js:1` (drawHotbar)
- `style.css:1` (hotbar transparent `rgba(0,0,0,0.35-0.45)` + `backdrop-filter:blur`, collapsed `.collapsed` pill `height ~28px`, toggle button, slot semi-transparent)
- `src/input.js:1` (selection keys 1/2/3, mouse placement, toggle `M`/`B` for collapse optionally)
- `src/main.js:1` (modifiers array, placement logic, max limit, `isHotbarCollapsed` state, `toggleHotbar()`, `syncHotbarCollapsedUI()`, collapse reset on `loadLevel`/`advanceHole`)
- `src/vectorField.js:1` (apply modifiers in getWindAt, MODIFIER_RADIUS)
- `src/render.js:1` (drawModifiers, drawPreview)

