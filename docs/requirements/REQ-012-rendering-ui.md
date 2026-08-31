# REQ-012: Rendering & UI Polish

- **ID:** REQ-012
- **Title:** Rendering & UI Polish
- **Priority:** Should Have (MVP polish)
- **Type:** UI / Functional
- **Status:** Draft
- **Related Plan Section:** Rendering (Phase 5)

## Description
The game SHALL have a coherent visual theme and minimal UI that communicates controls, wind, and game status without external assets. All rendering SHALL be via canvas + DOM/CSS.

## Rationale
Even a simple golf game needs clear affordances (aim line, wind legend, instructions) to be playable. Pure canvas/CSS keeps static-hosting constraint.

## Requirements

1. **Background**: Canvas filled with fairway color `#3a9d23` or gradient, optionally subtle grid dots for texture (canvas pattern, no images).
2. **Draw Order** in `src/render.js:render()`:
   1. Clear + background
   2. Arrow grid (REQ-004)
   3. Particles (REQ-004)
   4. Obstacles (REQ-008)
   5. Hole + flag (REQ-009)
   6. Ball (REQ-005)
   7. Aim orbit + line + indicator (REQ-006) when state AIMING/CHARGING
   8. Win overlay (REQ-009) when WIN
3. **UI** in `index.html` / `style.css` and **Canvas HUD** in `src/render.js`:
    - Title `<h1>Golf Vector Field</h1>` above canvas.
    - **Power bar (REQ-007) SHALL be drawn inside the canvas under the player ball** when `CHARGING` (Space held), not as DOM below canvas. It appears centered under `ball.pos` (e.g., `x - 30px, y + 28px`, 60×8px) with fill `charge*100%`.
    - **Hole/Attempts/Total counters (REQ-014) SHALL be drawn inside the canvas on top** (e.g., `ctx.fillText` at `y = 20px`, `x = 12px` for Hole left, `x = canvasW/2` for Attempts center, `x = canvasW-12` for Total right, or top-left/top-right layout). No DOM `#force-bar-container` / `#hole-counter` / `#attempts-counter` below canvas shall be used; HUD is purely canvas. Font: 14px system sans, white with 1px black stroke/shadow for contrast on green.
    - **Modifier hotbar (REQ-015/020) SHALL be a transparent overlay** (`#hotbar` `position:absolute; bottom:10px; left:50%; translateX(-50%)` `background:rgba(0,0,0,0.35-0.45)` + `backdrop-filter:blur(4-6px)` `border-radius:10px` `z-index:5`) centered at bottom edge of canvas, **not** a solid bar below the canvas. Slots SHALL use **same style as modifiers in the pause menu** (`background rgba(255,255,255,0.06)` `1px rgba(255,255,255,0.18)` `600 11px` white with stroke, icon `14px` `#e67e22/#3498db/#9b59b6`), and hotbar SHALL be collapsible/expandable via `#hotbar-toggle` to avoid obstructing the lower playing field (see REQ-015 for collapsed pill `~28px` behaviour; selection persists and hotkeys `1`/`2`/`3` work even when collapsed).
    - Instructions panel: "Arrows: Aim | Space: Shoot | R: Reset | H: Toggle Wind" (text near canvas, DOM below).
    - Win overlay: centered absolute `<div>` with semi-transparent background, hidden by default, showing `Hole Cleared!` or `Game Complete! Total Attempts: Y` and per-hole attempts.
4. **Aim Enhancements** (optional but recommended):
   - Predicted trajectory: dotted line sampling 30 steps ahead using current angle/power and `getWindAt` (no friction for preview) to hint wind effect.
5. Styling in `style.css`:
   - Centered layout `body {display:flex; flex-direction:column; align-items:center; font-family:sans-serif; background:#1a1a1a; color:#eee}`.
   - Canvas `border: 3px solid #222; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.5)`.
   - Responsive: canvas scales via CSS `max-width:95vw` while keeping logical 900x600 (see REQ-013 for dpr handling).
6. No external fonts/images; use system fonts and canvas primitives only.

## Acceptance Criteria

- [ ] On load, canvas shows green background, obstacles, hole, ball, and aim line - all distinct colors with sufficient contrast.
- [ ] Draw order verified: ball appears above obstacles, wind under obstacles.
- [ ] Instructions text is visible without scrolling on 900px wide viewport.
- [ ] Win overlay appears centered over canvas and hides on `R`.
- [ ] No layout shift when force bar charges (width only changes inside fixed container).
- [ ] Lighthouse audit shows no missing assets 404s.

## Dependencies
- REQ-002, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009

## Notes
- Keep `render.js` pure functions: `drawBackground(ctx)`, `drawObstacles(ctx, obstacles)`, `drawBall(ctx, ball)`, etc., for testability.

## File Paths
- `src/render.js:1`
- `index.html:1`
- `style.css:1`
