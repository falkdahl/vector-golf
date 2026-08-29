# REQ-013: Responsive Canvas & HiDPI Handling

- **ID:** REQ-013
- **Title:** Responsive Canvas & HiDPI Handling
- **Priority:** Should Have
- **Type:** Non-Functional
- **Status:** Draft
- **Related Plan Section:** Risks & Mitigations, Phase 5 Polish

## Description
The canvas SHALL handle high-DPI displays and responsive sizing without blurriness or input misalignment, while keeping logical coordinates at 900x600 for physics consistency.

## Rationale
Canvas rendered at CSS size on Retina displays appears blurry if not scaled by `devicePixelRatio`. Responsive scaling ensures playability on laptops/tablets without breaking physics or wind field.

## Requirements

1. **HiDPI Support** in `src/main.js` or `src/render.js` `setupCanvas()`:
   - Read `dpr = window.devicePixelRatio || 1`.
   - Set `canvas.width = logicalWidth * dpr`, `canvas.height = logicalHeight * dpr` (logical 900x600).
   - Set `canvas.style.width = logicalWidth + 'px'`, `canvas.style.height = logicalHeight + 'px'` (or `max-width:95vw` scaled proportionally).
   - Call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` or `ctx.scale(dpr, dpr)` once after resize, and reset transform each frame before clearing if needed.
   - All physics and `getWindAt` SHALL use logical coordinates (900x600), not device pixels.
2. **Responsive Layout**:
   - CSS: `canvas {max-width: 95vw; height: auto;}` so on narrow viewports canvas shrinks visually but logical size stays 900x600.
   - No recalculation of field grid on resize; field stays 20x15 over logical space.
3. **Resize Handling**:
   - Listen to `window.resize` and re-apply dpr setup (debounced 200ms) without resetting game state.
   - No reload required on resize.
4. **Performance**: HiDPI handling must not drop below 55fps with full visualization (REQ-004).

## Acceptance Criteria

- [ ] On a 2x Retina display (or simulated via Chrome DevTools devicePixelRatio=2), canvas edges and ball remain crisp (no blur) and line widths appear normal.
- [ ] Physics behavior identical at dpr=1 and dpr=2 (ball travel distance same for same launch).
- [ ] Resizing window from 900px to 600px width scales canvas visually but ball/aim positions remain correct (click not needed for MVP, but aim orbit stays circular).
- [ ] `canvas.width` attribute equals logicalWidth*dpr (e.g., 1800 at dpr2), while `canvas.style.width` remains 900px.

## Dependencies
- REQ-002 (canvas setup)
- REQ-012 (styling)

## Notes
- If `dpr` changes (drag window between monitors), handle `matchMedia` or resize event.
- For MVP, fixed 900x600 logical is acceptable; full fluid responsive is future.

## File Paths
- `src/main.js:10` (setupCanvas, handleResize)
- `src/render.js:10` (ctx transform)
- `style.css:15` (canvas max-width)
