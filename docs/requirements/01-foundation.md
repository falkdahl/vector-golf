# 01 — Foundation (Static Hosting, Canvas System, Loop)

- **ID:** 01-foundation
- **Supersedes:** 01-infrastructure, 02-canvas-system
- **Type:** Infrastructure + layout (normative for setup; all other files obey it)

## 1. Static hosting

- Zero-dependency static site: HTML5 + CSS + vanilla JS ES modules. No build step, no bundler, no `node_modules/`, no npm packages required to run.
- `index.html` at repo root loads everything via relative paths (`style.css`, `src/main.js` via `<script type="module">`). Static images only under `img/` via `./img/...`: `gfg-splash.png`, `logo.png`, `golfbag.png`, modifier icons `magnifier-icon.png`, `liquifier-icon.png`, `deflector-icon.png`, `rotator-icon.png`, `field-extender-icon.png`, `power-cell-icon.png` (legacy `amplify/nullify/flip/rotate-icon.png` map to the new names). No other image assets.
- Exactly one third-party import allowed: `three` via import map (`unpkg` or `jsdelivr` `three@0.160.0/build/three.module.js`, or local `vendor/three.module.js`). `import * as THREE from 'three'` is the only third-party import. No other CDN/`https://` script imports.
- Serving: `python3 -m http.server 8000` (or `npx serve .`, or GitHub Pages) from repo root serves `index.html` with no 404s. `file://` ESM CORS is unsupported; docs recommend http serving.
- `README.md` documents run/deploy instructions.

## 2. Logical space

- Strictly 16:9. `LOGICAL_W=1280`, `LOGICAL_H=720` (alternatives `1600×900`/`960×540` allowed if ratio is `16/9 ±0.01`). `900×600` is deprecated.
- All physics, levels, `createField`, `tee`/`hole`, `getWindAt` bounds use this space. `LOGICAL_W`/`LOGICAL_H` exported from `src/main.js` or `src/render.js` (single source of truth).

## 3. DOM (only canvases + overlays inside container)

```html
<body>
  <div id="game-container">
    <canvas id="bg-canvas" width="1280" height="720"></canvas>  <!-- z1 opaque -->
    <canvas id="game" width="1280" height="720"></canvas>       <!-- z2 transparent, input target -->
    <canvas id="wind-canvas"></canvas>                          <!-- z3 Three.js, alpha, pointer-events:none -->
    <div id="hud">...</div>                                     <!-- z4, pointer-events:none -->
    <div id="bottom-bar">...</div>                              <!-- z6 -->
    <div id="journal-wrapper">...</div>
    <div id="journal-panel" class="hidden">...</div>
    <div id="reward-overlay" class="hidden">...</div>            <!-- z10 -->
    <div id="win-overlay" class="hidden">...</div>
    <div id="main-menu-overlay" class="hidden">...</div>
    <div id="pause-overlay" class="hidden">...</div>
    <div id="help-overlay" class="hidden">...</div>
    <div id="starting-items-overlay" class="hidden">...</div>
    <div id="coin-summary-overlay" class="hidden">...</div>     <!-- points summary, id kept for compat -->
    <div id="cutscene-dialog" class="hidden">...</div>
    <button id="cutscene-skip-button" class="hidden">Skip »</button>
    <button id="banter-skip-button" class="hidden">Skip »</button>
    <div id="toast" class="hidden">copied to clipboard</div>
  </div>
  <div id="loading-screen">Loading...</div>
</body>
```

- Outside `#game-container` only `#loading-screen` may exist. No `<h1>`, no `#instructions`, no other body children. No horizontal scroll.
- Stacking: `canvas,#wind-canvas { position:absolute; inset:0; width:100%; height:100% }`, `#bg-canvas{z-index:1}`, `#game{z-index:2}`, `#wind-canvas{z-index:3; pointer-events:none; background:transparent}`, `#hud{z-index:4; pointer-events:none}`; overlays `z-index 6–14` bounded to container (`getBoundingClientRect()` inside container). Scrollable children use `overflow-y:auto; overscroll-behavior:contain`.
- Centering: `body { display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:0; background:#000; overflow:hidden; }`, `#game-container { position:relative; aspect-ratio:16/9; width:min(95vw, calc(95vh * 16/9)); height:min(95vh, calc(95vw * 9/16)); margin:auto; overflow:hidden; }`. Container ratio `1.777±0.02`; all three layers share identical `getBoundingClientRect()`.

## 4. Game loop

- `src/main.js`: `requestAnimationFrame` with `FIXED_DT=1/60` accumulator, `update(FIXED_DT)` then `render()` once, max 5 steps/frame, `dt` in seconds. No `setInterval`/`setTimeout` for the main loop.
- Split: `bgCtx` drawn on demand (mode/resize/terrain change), `fgCtx` `clearRect` each frame, `windRenderer` own per-frame clear (`setClearColor(0x000000,0)`).
- Pausable (`visibilitychange`, `WIN`, `GAME_OVER`, `mainMenuVisible`, pause, banners, cutscene, banter); while paused `updateWind` visuals may run but `updateBall` is frozen.

## 5. HiDPI & resize

- `dpr = window.devicePixelRatio || 1`. 2D canvases: `canvas.width = LOGICAL_W*dpr`, `height = LOGICAL_H*dpr`, CSS stays `100%`, `ctx.setTransform(dpr,0,0,dpr,0,0)` after resize. Physics uses logical coords; `getCanvasMousePos(e)` maps via `rect=game.getBoundingClientRect(); x=(e.clientX-rect.left)*(LOGICAL_W/rect.width)`.
- Three.js: `renderer.setPixelRatio(dpr); renderer.setSize(W,H,false)`, update `uResolution` + orthographic camera. `window.resize` re-applies `setupCanvases()` for all layers (debounced 100–200ms), redraws background, no state reset. DPR changes handled via `resize`/`matchMedia`.

## 6. Loading screen

- `#loading-screen { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:#000; color:#fff; font:600 18px system-ui,sans-serif; z-index:100 }`, text exactly `Loading...`. Visible while splash is loading; hidden after `onload`/`decode()`; never re-shown on resize.

## Acceptance

- [ ] `index.html` uses relative paths; only `three` is third-party; no `node_modules/`; static server loads with no 404s.
- [ ] DOM contains only `#game-container` (+ optional `#loading-screen`); no `h1`/`#instructions`; body `background:#000`, `padding:0`, `overflow:hidden`.
- [ ] Container is centered 16:9 `min(95vw,95vh*16/9)`; all layers share rect; DPR=2 keeps physics identical; resize keeps ratio, alignment, input mapping.
- [ ] Fixed timestep: 30/60fps ball travel over 2s varies <5%; no main-loop `setInterval`.

## File paths

- `index.html:1`, `style.css:1`, `src/main.js:1` (loop, `setupCanvases`, `getCanvasMousePos`, loading hide), `src/windThree.js:1` (renderer resize), `README.md:1`
