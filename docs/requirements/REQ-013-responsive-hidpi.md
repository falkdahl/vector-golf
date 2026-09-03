# REQ-013: Responsive Canvas & HiDPI Handling — 16:9 Maximized Stacked Canvases

- **ID:** REQ-013
- **Title:** Responsive Canvas & HiDPI Handling — 16:9 Maximized, Dual Canvas, Centered
- **Priority:** Should Have
- **Type:** Non-Functional
- **Status:** Draft
- **Related Plan Section:** Risks & Mitigations, Phase 5 Polish

## Description
The **two stacked canvases** (REQ-002) SHALL handle high-DPI displays and responsive sizing without blurriness or input misalignment, while keeping **logical coordinates at 16:9** (e.g., `1280×720` or `1600×900`) for physics consistency and **maximizing the canvas area** centered on screen.

## Rationale
Canvas rendered at CSS size on Retina displays appears blurry if not scaled by `devicePixelRatio`. A 16:9 container that maximizes `min(95vw, 95vh*16/9)` ensures the game uses the largest possible centered rectangle on any viewport (desktop, laptop, tablet landscape) while staying strictly 16:9. Both canvases must share the same backing-store scaling and input mapping.

## Requirements

1. **HiDPI Support** in `src/main.js` or `src/render.js` `setupCanvas()` for **both** canvases:
   - Read `dpr = window.devicePixelRatio || 1`.
   - For each canvas (`bgCanvas` logical `W×H` and `game` logical `W×H`, both 16:9 e.g., `1280×720`):
     - Set `canvas.width = logicalWidth * dpr`, `canvas.height = logicalHeight * dpr` (backing store).
     - Keep `canvas.style.width/style.height` at `100%` of the `aspect-ratio:16/9` container (or `width:100%; height:100%` absolute inset 0). Do NOT set `style.width = logicalWidth + 'px'` fixed; the container’s `width: min(95vw, calc(95vh*16/9))` drives CSS size so both canvases scale together.
     - Call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` or `ctx.scale(dpr, dpr)` once after resize for each context, and reset transform each frame before clearing if needed.
   - All physics and `getWindAt` SHALL use **logical coordinates** (e.g., `1280×720` 16:9), not device pixels. Same `LOGICAL_W/H` for both layers.
   - `getCanvasMousePos(e)` SHALL use the top canvas rect: `rect = game.getBoundingClientRect(); x = (e.clientX-rect.left)*(LOGICAL_W/rect.width)`.

2. **Responsive Layout — 16:9 Maximized, Centered**:
   - `#game-container` SHALL be `position:relative; aspect-ratio:16/9; width: min(95vw, calc(95vh * 16/9)); height: min(95vh, calc(95vw * 9/16)); margin:auto;` and `body {display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh;}` so the stack is centered both axes and **maximizes area** without overflow.
   - Both `canvas` SHALL be `position:absolute; inset:0; width:100%; height:100%; border-radius:8px;` inside the container, sharing the same CSS box so they remain pixel-aligned.
   - Both canvases SHALL have `max-width:none` inside container (container already constrains), and SHALL NOT use `max-width:95vw` directly on canvas — the container handles it. This guarantees 16:9 at all sizes.
   - No recalculation of field grid on resize; field stays e.g., `32×18` for `1280×720` (or `20×15` scaled to new logical size) over logical space — grid is fixed per level, only CSS/DPR mapping changes.
   - Overlays (`#pause-overlay`, `#main-menu-overlay`, `#win-overlay`, `#hotbar`) SHALL be `position:absolute; inset:0` (or anchored to container edges) with `width:100%; height:100%` bounded to the container, so they never overflow the canvas area (see REQ-029).

3. **Resize Handling**:
   - Listen to `window.resize` and re-apply dpr setup for **both** canvases (debounced 100-200ms) without resetting game state. On resize, redraw bottom background (tile/splash per REQ-030) at new DPR scale.
   - No reload required on resize. `dpr` changes (drag between monitors) handled via `resize` or `matchMedia`.

4. **Performance**: HiDPI handling must not drop below 55fps with full visualization (REQ-004) on both layers.

## Acceptance Criteria

- [ ] On a 2× Retina display (or simulated via `devicePixelRatio=2`), both canvases remain crisp (no blur) and line widths/grass texture remain sharp; `canvas.width` equals `logicalWidth*dpr` (e.g., `2560` for `1280` at DPR2) for **both** canvases, while `canvas.style.width` is `100%` of the 16:9 container.
- [ ] Physics behavior identical at `dpr=1` and `dpr=2` (ball travel distance same for same launch) regardless of background tiling.
- [ ] Resizing window from `1920×1080` to `800×600` keeps container 16:9 (measured `rect.width/rect.height ≈ 1.777 ±0.02`), both canvases stay stacked and pixel-aligned (`getBoundingClientRect()` identical for both), centered, maximizing area (container touches the limiting viewport edge at `95vw` or `95vh*16/9`), and aim orbit stays circular; input mapping still correct (click at visual center → logical `640,360` for `1280×720`).
- [ ] No canvas or overlay overflows `#game-container`: `game.getBoundingClientRect()` and `main-menu-overlay.getBoundingClientRect()` are contained within `container.getBoundingClientRect()` (no `left<container.left` or `right>container.right`).
- [ ] Background tiling (grass) and splash image remain correctly scaled/covered after resize without stretching artifacts beyond `object-fit:cover` or `createPattern` repeat.

## Dependencies
- REQ-002 (dual canvas setup, 16:9 logical)
- REQ-012 (styling)
- REQ-030 (background image rendering)

## Notes
- If fixed `LOGICAL_W/H` changes (e.g., `1280×720`), update `LEVELS[].canvas` and `createField(..., LOGICAL_W, LOGICAL_H)` accordingly; ratio must stay 16:9.
- For MVP, `LOGICAL_W=1280, LOGICAL_H=720` (cell `40×40` for `32×18` grid) is recommended; `1600×900` is also valid if documented consistently.

## File Paths
- `src/main.js:10` (setupCanvas for bg+fg, handleResize, getCanvasMousePos)
- `src/render.js:10` (ctx transform for both)
- `style.css:15` (#game-container 16/9 maximized centering, canvas absolute stacked)
