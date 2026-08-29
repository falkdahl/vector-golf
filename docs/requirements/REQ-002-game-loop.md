# REQ-002: Canvas Setup & Game Loop

- **ID:** REQ-002
- **Title:** Canvas Setup & Game Loop
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Architecture - Core loop, Phase 1

## Description
The game SHALL render to a single HTML5 `<canvas>` element and run a deterministic update-render loop using `requestAnimationFrame` with a fixed timestep. The loop must separate `update(dt)` (physics, input, state) from `render()` (drawing).

## Rationale
Canvas is the sole rendering surface per constraints. A fixed timestep (1/60s) with accumulator ensures deterministic physics across varying frame rates, critical for wind and collision consistency.

## Requirements

1. The DOM SHALL contain exactly one primary `<canvas id="game">` with logical size `900x600` CSS pixels (values tunable, but default 900x600) centered on page.
2. The game SHALL implement `requestAnimationFrame` loop in `src/main.js` that:
   - Tracks `deltaTime` from `performance.now()`.
   - Uses a fixed timestep `FIXED_DT = 1/60` (~16.666ms) with accumulator pattern.
   - Calls `update(FIXED_DT)` one or more times per frame, then `render()` once.
   - Caps accumulator to avoid spiral of death (max 5 steps per frame).
3. The loop SHALL handle `dt` in seconds for physics calculations.
4. Canvas context SHALL be `2d` with `imageSmoothingEnabled = true`.
5. The game SHALL clear the canvas each frame before drawing (`clearRect`).
6. The loop SHALL be pausable (e.g., on `visibilitychange` or win screen) without leaking frames.

## Acceptance Criteria

- [ ] Canvas element exists with id `game`, visible and centered, size 900x600 (or responsive variant per REQ-012).
- [ ] `src/main.js:1` exports/init `init()` and starts `requestAnimationFrame(loop)`.
- [ ] With Chrome DevTools FPS throttling (30fps, 60fps), ball travel distance over 2 seconds varies <5% (fixed timestep check).
- [ ] No use of `setInterval` / `setTimeout` for main loop.
- [ ] Console shows no errors when tab is backgrounded and resumed.

## Dependencies
- REQ-001 (scaffold must exist)

## Notes
- Example accumulator pseudocode to include in `src/main.js:20`:
  ```js
  let accumulator = 0;
  function loop(now) {
    let frameTime = (now - last) / 1000;
    accumulator += Math.min(frameTime, 0.1);
    while (accumulator >= FIXED_DT) { update(FIXED_DT); accumulator -= FIXED_DT; }
    render();
    requestAnimationFrame(loop);
  }
  ```

## File Paths
- `src/main.js:1` (loop)
- `index.html:10` (canvas element)
