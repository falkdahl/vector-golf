# REQ-002: Canvas Setup & Game Loop

- **ID:** REQ-002
- **Title:** Canvas Setup & Game Loop — Dual Stacked Canvases 16:9
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Architecture - Core loop, Phase 1

## Description
The game SHALL render to **two stacked HTML5 `<canvas>` elements** sharing the same logical 16:9 coordinate space and run a deterministic update-render loop using `requestAnimationFrame` with a fixed timestep. The bottom canvas renders only static background imagery (tiled grass or splash), the top canvas is transparent and renders all dynamic game elements. The loop must separate `update(dt)` (physics, input, state) from `render()` (drawing).

## Rationale
A 16:9 landscape maximizes usable area on modern displays. Splitting rendering into a background canvas (rarely redrawn, image-tiled) and a transparent foreground canvas (cleared every frame) reduces overdraw, isolates background image tiling (REQ-030) from dynamic elements, and keeps hit-testing/input on a single top canvas.

## Requirements

1. The DOM SHALL contain **two stacked `<canvas>` elements plus one transparent Three.js overlay** inside `#game-container`:
   - Bottom: `<canvas id="bg-canvas">` (or `id="background"` / `id="bg"`) — opaque, renders background imagery.
   - Middle: `<canvas id="game">` (or `id="fg-canvas"` / `id="foreground"`) — transparent (`background: transparent`), renders all dynamic elements (obstacles, ball, HUD, etc.) and receives all input (click, hover).
   - Top (wind): **transparent element for wind visualization** using Three.js — e.g., `<canvas id="wind-canvas">` or `<div id="wind-container"><canvas>` created by `THREE.WebGLRenderer` with `alpha:true` (REQ-004). This element SHALL be `position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:3` so it sits **on top of the game canvas** but below UI overlays (`#hotbar`/`#pause-overlay`/`#win-overlay` `z-index:5-12`). It SHALL be fully transparent except for shader-drawn lines/particles.
   - All three SHALL share the **same logical size** with **landscape 16:9 aspect ratio** (default `1280×720` or `1600×900` or `960×540` — values tunable but ratio MUST be `width/height == 16/9` within `0.01`). `900×600` (3:2) is no longer valid; all logical coordinates, `levels.js` `canvas` fields, and `createField` `width/height` SHALL use the 16:9 size (e.g., `1280×720`).
   - All SHALL be stacked via CSS (`#game-container { position:relative; aspect-ratio:16/9; }` + `canvas, #wind-canvas { position:absolute; inset:0; width:100%; height:100%; }` with `#bg-canvas {z-index:1}` `#game {z-index:2}` `#wind-canvas {z-index:3; pointer-events:none; background:transparent}`) and **centered on screen**, maximizing area: container `width: min(95vw, calc(95vh * 16/9))`, `height: min(95vh, calc(95vw * 9/16))`, `margin:auto`, centered flex column. No canvas/overlay SHALL overflow the viewport or exceed the container.
   - `#game-container` itself SHALL be centered (`body {display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh;}`) so the 16:9 stack is centered both horizontally and vertically with maximal size.
2. The game SHALL implement `requestAnimationFrame` loop in `src/main.js` that:
   - Tracks `deltaTime` from `performance.now()`.
   - Uses a fixed timestep `FIXED_DT = 1/60` (~16.666ms) with accumulator pattern.
   - Calls `update(FIXED_DT)` one or more times per frame, then `render()` once.
   - Caps accumulator to avoid spiral of death (max 5 steps per frame).
3. The loop SHALL handle `dt` in seconds for physics calculations.
4. Both 2D canvas contexts SHALL be `2d` with `imageSmoothingEnabled = true`. The Three.js renderer for the wind overlay SHALL be `THREE.WebGLRenderer` with `alpha:true`, `antialias:true`, `premultipliedAlpha:false`. Top game canvas SHALL be cleared each frame (`clearRect`); bottom canvas SHALL be cleared/redrawn only when background mode changes or on resize/dpr change. The wind WebGL canvas SHALL be transparent (`renderer.setClearColor(0x000000, 0)`) and cleared each frame by Three.js.
5. The game SHALL clear the **game** canvas each frame before drawing dynamic elements (`clearRect` on `fgCtx`); bottom canvas SHALL NOT be cleared per-frame unless background imagery requires refresh. The wind overlay SHALL manage its own per-frame clear. Background tiling/splash is drawn to `bgCtx` per REQ-030.
6. The loop SHALL be pausable (e.g., on `visibilitychange` or win/pause/main-menu) without leaking frames. `update()` still calls wind particle / shader uniform updates when paused per REQ-028/029, but `render()` SHALL draw all layers. The `requestAnimationFrame` loop SHALL drive both the 2D `render()` and the Three.js `windRenderer.render()` each frame (or via shared `loop` that calls `updateWindShader(dt, uniforms)` then `render()`).

## Acceptance Criteria

- [ ] DOM contains **two** 2D canvases (`#bg-canvas` + `#game`) **plus one transparent Three.js wind overlay** (`#wind-canvas` or `#wind-container > canvas`) inside `#game-container`, stacked (`position:absolute; inset:0`) with bottom at `z-index:1`, game at `z-index:2`, wind at `z-index:3` (`pointer-events:none; background:transparent`), all sized to same 16:9 logical space (e.g., `1280×720` logical, CSS `width:100% height:100%` of a `aspect-ratio:16/9` container). Missing wind overlay or single-canvas DOM SHALL fail.
- [ ] `#game-container` has `aspect-ratio:16/9` and is centered, maximizing area: on `1920×1080` viewport container fills `min(95vw, 95vh*16/9)` width and corresponding height; on narrow viewport it shrinks proportionally but stays 16:9 without overflow or letterboxing outside container. Verified via `getBoundingClientRect()` width/height ratio `1.77±0.02`. All three layers have identical `getBoundingClientRect()`.
- [ ] Game canvas (`#game`) has transparent background (`rgba(0,0,0,0)`) and is the only element handling mouse/click/hover for placement/drag; bottom canvas and wind overlay do not intercept pointer events (`pointer-events:none`).
- [ ] `src/main.js:1` exports/init `init()` and starts `requestAnimationFrame(loop)`; loop drives both `bgCtx` (when needed) and `fgCtx`.
- [ ] With Chrome DevTools FPS throttling (30fps, 60fps), ball travel distance over 2 seconds varies <5% (fixed timestep check).
- [ ] No use of `setInterval` / `setTimeout` for main loop.
- [ ] Console shows no errors when tab is backgrounded and resumed.

## Dependencies
- REQ-001 (scaffold must exist)
- REQ-030 (stacked background imagery)
- REQ-013 (16:9 responsive HiDPI handling for both canvases)

## Notes
- Example container CSS:
  ```css
  #game-container {
    position: relative;
    width: min(95vw, calc(95vh * 16/9));
    height: min(95vh, calc(95vw * 9/16));
    aspect-ratio: 16 / 9;
    margin: auto;
  }
  #game-container canvas { position:absolute; inset:0; width:100%; height:100%; border-radius:8px; }
  #bg-canvas { z-index:1; background:#3a9d23; }
  #game { z-index:2; background:transparent; }
  ```
- Logical coordinates example: `LOGICAL_W=1280, LOGICAL_H=720` (both 16:9). `createField(cols,rows, strength, seed, LOGICAL_W, LOGICAL_H, ...)` and `LEVELS[].canvas {width:1280,height:720}`.
- Input mapping via `getCanvasMousePos(e, canvas)` SHALL use the top canvas rect and scale to logical size: `x = (e.clientX - rect.left) * (LOGICAL_W / rect.width)`.

## File Paths
- `src/main.js:1` (loop, setupCanvas for both, getCanvasMousePos)
- `index.html:10` (two canvas elements inside #game-container)
- `style.css:1` (#game-container 16:9 centering, stacked canvas positioning)
- `src/render.js:1` (render split across bg/fg contexts)
