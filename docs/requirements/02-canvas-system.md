# 02 — Canvas System, Layout & Responsiveness

- **ID:** 02-canvas-system
- **Supersedes:** REQ-002, REQ-013, REQ-030 (layout/responsive/loading sections only)
- **Type:** Functional / Non-Functional (layout is normative)

This is the **single source of truth** for DOM structure, 16:9 layout, HiDPI, resize and loading screen. All other files shall reference this file instead of re-defining layout.

## 1. Logical Coordinate Space

- Logical size is strictly 16:9. Default `LOGICAL_W=1280`, `LOGICAL_H=720` (alternatives `1600×900` or `960×540` are allowed if ratio is `16/9 ±0.01`). `900×600` (3:2) and any non-16:9 size is deprecated and shall not be used.
- All physics, `levels.js`, `createField`, `tee`/`hole` coordinates and `getWindAt` bounds shall use this logical space. Values are tunable but the ratio must stay `16/9`.
- Export `LOGICAL_W`/`LOGICAL_H` from `src/main.js` or `src/render.js` as single source of truth.

## 2. DOM Structure — Only Canvases Inside Container

Allowed DOM:

```html
<body>
  <div id="game-container">
    <canvas id="bg-canvas" width="1280" height="720"></canvas>  <!-- z-index:1 opaque -->
    <canvas id="game" width="1280" height="720"></canvas>       <!-- z-index:2 transparent, handles input -->
    <canvas id="wind-canvas"></canvas>                          <!-- z-index:3 Three.js, alpha:true, pointer-events:none -->
    <div id="hotbar">...</div>
    <div id="win-overlay" class="hidden">...</div>
    <div id="main-menu-overlay" class="hidden">...</div>
    <div id="toast" class="hidden">copied to clipboard</div>
  </div>
  <div id="loading-screen">Loading...</div>
</body>
```

- Outside `#game-container` only `#loading-screen` may exist. **No `<h1>`** (`document.querySelector('h1')===null`), **no `#instructions`** (`getElementById('instructions')===null`), no other body children. Tests shall verify `document.body.children` contains only `#game-container` + optional `#loading-screen` and no horizontal scroll.
- Inside `#game-container` stacking via CSS `canvas,#wind-canvas { position:absolute; inset:0; width:100%; height:100% }` with `#bg-canvas{z-index:1}` `#game{z-index:2}` `#wind-canvas{z-index:3; pointer-events:none; background:transparent}` and `pointer-events:none` on `bg`+`wind`; `game` is the only input target.
- Overlays (`#hotbar`,`#win-overlay`,`#main-menu-overlay`,`#help-overlay`,`#toast`) are `position:absolute; inset:0` or anchored to container edges, `z-index:5-12`, bounded to container (`getBoundingClientRect()` inside container). Scrollable children use `overflow-y:auto; overscroll-behavior:contain`.

## 3. Centering & Maximization (16:9)

```css
body { display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:0; background:#000; overflow:hidden; }
#game-container {
  position:relative; aspect-ratio:16/9;
  width:min(95vw, calc(95vh * 16/9));
  height:min(95vh, calc(95vw * 9/16));
  margin:auto;
}
#game-container canvas, #wind-canvas { position:absolute; inset:0; width:100%; height:100%; border-radius:8px; }
```
- Body has `padding:0`, `overflow:hidden`, `background:#000` during loading (no `20px` padding that would shrink the container).
- Container's `getBoundingClientRect()` width/height ratio is `1.777±0.02`. All three layers have identical `getBoundingClientRect()`.

## 4. Game Loop

- `src/main.js` implements `requestAnimationFrame` loop with `FIXED_DT=1/60` accumulator, `update(FIXED_DT)` then `render()` once, max 5 steps per frame, `dt` in seconds.
- Separate concerns: `bgCtx` drawn on demand (mode/resize change, see `03-rendering.md`), `fgCtx` cleared each frame (`clearRect`) for dynamic content, `windRenderer` cleared by Three.js (`setClearColor(0x000000,0)`).
- Loop is pausable (`visibilitychange`, `WIN`, `mainMenuVisible`); `updateWind` still runs while paused but `updateBall` is frozen (see `05-input-and-states.md` and `10-persistence-and-menus.md`). No `setInterval`/`setTimeout` for main loop.

## 5. HiDPI & Resize

- `dpr = window.devicePixelRatio || 1`.
- 2D canvases: `canvas.width = LOGICAL_W * dpr`, `canvas.height = LOGICAL_H * dpr`, `style` stays `100%` of container, `ctx.setTransform(dpr,0,0,dpr,0,0)` after resize. All physics uses logical coords; `getCanvasMousePos(e)` maps via `rect=game.getBoundingClientRect(); x=(e.clientX-rect.left)*(LOGICAL_W/rect.width)`.
- Three.js: `renderer.setPixelRatio(dpr); renderer.setSize(W,H,false)` (CSS size), update `uResolution` and orthographic camera to logical space.
- `window.resize` re-applies `setupCanvases()` for all three layers (debounced 100-200ms), redraws background mode-appropriately, updates wind renderer, without resetting game state. DPR changes handled via `resize`/`matchMedia`.

## 6. Loading Screen

- `#loading-screen { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:#000; color:#fff; font:600 18px system-ui,sans-serif; z-index:100 }` with text exactly `Loading...`.
- Visible while `gfg-splash.png` is loading (`!complete || !naturalWidth`); hidden (`display:none` / `.hidden`) after `splashImg.onload`/`decode()`; never re-shown on resize.

## Acceptance Criteria

- [ ] DOM has only `#game-container` (+ optional `#loading-screen`); no `h1`, no `#instructions`, `body` is `background:#000`, `padding:0`, `overflow:hidden` during load.
- [ ] Three layers share same 16:9 logical space and identical `getBoundingClientRect()`; container is centered and maximizes `min(95vw,95vh*16/9)`.
- [ ] On DPR=2, backing store is `LOGICAL_W*dpr` and physics distance is identical to DPR=1.
- [ ] Resize from `1920×1080` to `800×600` keeps 16:9, all layers aligned, no overflow, input mapping correct.
- [ ] FPS throttling 30/60fps: ball travel over 2s varies <5% (fixed timestep); no main-loop `setInterval`.

## Dependencies

- `01-infrastructure.md` (no build)
- Consumed by `03-rendering.md`, `06-wind-system.md`

## File Paths

- `index.html:1`, `style.css:1`, `src/main.js:1` (loop, `setupCanvases`, `getCanvasMousePos`, loading hide), `src/windThree.js:1` (renderer resize)
