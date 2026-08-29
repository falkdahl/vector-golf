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
   - A horizontal hotbar SHALL be rendered at the bottom of the screen (below canvas or as DOM overlay at bottom, or inside canvas bottom bar) containing three selectable modifier slots.
   - Each slot SHALL show an icon/label and count (if limited) or infinite usage indicator:
     - Slot 1: `Amplify x5` (e.g., icon `>>` or `↑↑`, color `#e67e22` orange)
     - Slot 2: `Nullify` (e.g., icon `○` or `∅`, color `#3498db` blue)
     - Slot 3: `Flip` (e.g., icon `↻` or `⇄`, color `#9b59b6` purple)
   - Selection SHALL be via mouse click on hotbar slot or keyboard `1`, `2`, `3`. Selected slot SHALL be visually highlighted (border `2px #fff`, background brightened, or scale `1.1`).
   - **Deselection**: Pressing `Escape`, pressing the number hotkey of the currently selected modifier (e.g., `1` when Amplify already selected), or clicking the hotbar button of the currently selected modifier SHALL deselect it, leaving **no modifier selected** (hotbar shows no highlight, no preview circle). This allows the player to cancel placement without having to place.
   - Hotbar SHALL be visible during `AIMING`/`CHARGING` only; hidden during `FLYING`/`WIN` to prevent mid-flight manipulation.

2. **Placement Interaction** in `src/input.js` and `src/main.js`:
   - When a modifier is selected and `gameState` is `AIMING` or `CHARGING`, a preview circle (radius `80-120px`, dashed, color matching modifier) SHALL follow the mouse cursor over the canvas.
   - Left-click on canvas SHALL place the selected modifier at the cursor's logical canvas coordinates (`worldX, worldY`), if placement is valid.
   - **Deselection**: Once a modifier has been placed, **no modifier SHALL remain selected** (selection cleared to `null`). The user must explicitly re-select a modifier from the hotbar to place another. This prevents accidental consecutive placements.
   - **Draggable**: Placed modifiers SHALL be draggable to adjust position without deleting. On `mousedown` on an existing modifier circle (hit test `dist < radius`), the modifier SHALL enter dragging state, follow the mouse (`mousemove`) updating its `x,y` in real-time, and finalize on `mouseup`. Dragging SHALL be allowed only before shooting (`AIMING`/`CHARGING`), not during `FLYING`. Dragging SHALL NOT delete the modifier; it only moves it. Visual feedback: dragged modifier opacity 0.6 and cursor `grabbing`.
   - Placement SHALL only be allowed before shooting (not during `FLYING`). Placing SHALL NOT trigger a launch.
   - Right-click or `Delete`/`Backspace` SHALL remove the modifier under cursor (or last placed) for misclick correction. `R` (ball reset) does NOT clear modifiers, but advancing hole or game reset does.
   - Placement SHALL respect limits: max `3` modifiers per hole (configurable `MAX_MODIFIERS_PER_HOLE=3` in `src/levels.js` or `src/main.js`). If limit reached and no modifier is selected (per deselection rule), user must select again; if limit reached and user tries to place another, oldest modifier is replaced or placement is ignored with feedback (shake hotbar).
   - Modifiers SHALL be stored as array `modifiers = [{id, type:'amplify'|'nullify'|'flip', x, y, radius:90, isDragging?:boolean}]` in `src/main.js` or `src/vectorField.js`.
   - Modifiers SHALL persist through death resets (obstacle/edge) but SHALL be cleared on advancing to next hole or on game reset (`R` in WIN).

3. **Circular Area Effect** in `src/vectorField.js`:
   - `getWindAt(worldX, worldY)` SHALL be modified to apply all active modifiers that contain the query point (`hypot(x - mod.x, y - mod.y) < mod.radius`).
   - If multiple modifiers overlap, they SHALL be applied in placement order (stacking) – e.g., amplify then flip = flipped amplified vector.
   - Radius SHALL be `80-100px` (tunable `MODIFIER_RADIUS=90`) for all three types, visible as circle.
   - Performance: modifier check SHALL be `O(n)` with `n ≤3`, negligible over `getWindAt`.

4. **Visualization Integration** in `src/render.js`:
   - Placed modifiers SHALL be drawn as circles on the canvas (below ball but above arrows/particles): `amplify` solid orange ring `rgba(230,126,34,0.25)` with `>>` icon, `nullify` blue dashed `rgba(52,152,219,0.25)` with `∅`, `flip` purple double arrow `rgba(155,89,182,0.25)` with `↻`. While dragging, modifier SHALL be drawn with 60% opacity and `grabbing` cursor.
   - Preview circle while hovering (when a modifier is selected, before placement) SHALL be dashed 50% opacity. When no modifier is selected (after placement), no preview SHALL be shown.
   - Arrow grid SHALL be updated to reflect the resulting effect on the ball: arrows **inside each modifier circle SHALL be drawn using the modified `getWindAt` result** (including amplify/nullify/flip), not the base field. This ensures arrows inside amplify appear stronger, inside nullify faint/zero, inside flip reversed. Particles SHALL also reflect modified field via `getWindAt`.

5. **Determinism** per REQ-003: modifiers SHALL be deterministic for the current hole; reloading the hole resets them.

## Acceptance Criteria

- [ ] Hotbar with 3 slots visible below canvas showing Amplify x5, Nullify, Flip with distinct colors/icons and selection highlight.
- [ ] Pressing `1` selects Amplify (highlight moves), `2` nullify, `3` flip; clicking hotbar slot does same. Pressing the same hotkey again (e.g., `1` when Amplify already selected) deselects it.
- [ ] Clicking the hotbar button of the currently selected modifier deselects it (no selection).
- [ ] Pressing `Escape` deselects any selected modifier (no selection).
- [ ] With Amplify selected, moving mouse over canvas shows orange preview circle radius ~90 following cursor; with no selection, no preview is shown.
- [ ] Left-click places modifier at cursor; it remains drawn as solid circle after click **and no modifier remains selected** (hotbar shows no selection, preview disappears until next selection).
- [ ] Placed modifier is draggable: mousedown on modifier, drag moves it, mouseup finalizes; works only before shooting, not during `FLYING`; dragging does not delete.
- [ ] Placing a modifier does not launch ball; ball remains at tee in `AIMING`.
- [ ] `getWindAt` inside amplify circle returns ~5× original vector (verified by sampling inside vs outside).
- [ ] Arrows inside each modifier circle reflect resulting effect: inside amplify arrows more opaque/longer, inside nullify faint/zero, inside flip reversed direction (verified by sampling `getWindAt` for arrow drawing).
- [ ] Hotbar hidden during `FLYING`; cannot place/drag while ball drifting.
- [ ] Right-click or Delete on modifier removes it; dragging adjusts without deleting; `R` (ball reset) does not clear modifiers, but advancing hole or game reset does.
- [ ] Max 3 modifiers per hole enforced; 4th placement either ignored or replaces oldest with visual feedback.
- [ ] Particles and arrows inside modifier circles visibly change per modifier type.
- [ ] No 3rd-party libraries; pure canvas + vanilla JS.

## Dependencies
- REQ-003 (vector field, getWindAt)
- REQ-002 (game loop dt)
- REQ-006/007 (input, only before shooting)
- REQ-012 (UI)

## Notes
- Hotbar can be DOM (`<div id="hotbar">`) for accessibility or canvas-drawn; DOM preferred for click handling.
- Store modifiers per hole in `src/main.js:modifiers` and pass to `vectorField.js` via `setModifiers()` or direct import.

## File Paths
- `index.html:30` (hotbar DOM) or `src/render.js:1` (drawHotbar)
- `style.css:1` (hotbar styling)
- `src/input.js:1` (selection keys 1/2/3, mouse placement)
- `src/main.js:1` (modifiers array, placement logic, max limit)
- `src/vectorField.js:1` (apply modifiers in getWindAt, MODIFIER_RADIUS)
- `src/render.js:1` (drawModifiers, drawPreview)

