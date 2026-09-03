# REQ-030: Stacked Canvases & Background Image System — 16:9 Landscape, Tiled Grass vs Splash

- **ID:** REQ-030
- **Title:** Stacked Canvases & Background Images — 16:9 Maximized, Bottom Tiled Grass (Level) vs Splash (Main Menu), Top Transparent Dynamic
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Rendering / Layout / Assets (REQ-002/REQ-012/REQ-013 Extension)

## Description
The game SHALL render in **landscape 16:9** centered on screen, **maximizing canvas area** using **two stacked canvases**: a bottom opaque canvas that renders **only** background imagery, and a top transparent canvas that renders all dynamic game elements. When drawing a **level** (`mainMenuVisible===false`) the bottom canvas SHALL tile the seamless texture `img/grass_seamless.webp` across the entire logical area. When on the **main menu** (`mainMenuVisible===true`) the bottom canvas SHALL show `img/gfg-splash.png` (tolerate typo `img/gfg-spash.png` asFallback) centered and aspect-covered. The top canvas SHALL be transparent and cleared every frame; it SHALL never draw background.

## Rationale
16:9 landscape matches modern monitors and gives maximal play area. A tiled grass texture gives richer fairway than solid `#3a9d23` without GPU cost, while a branded splash on the main menu distinguishes idle vs play. Stacking isolates static image work (bottom, redraw only on mode/resize) from per-frame dynamic work (top, `clearRect` every frame) and avoids background overdraw or canvas-white flash.

## Requirements

1. **Layout — 16:9 Landscape, Centered, Maximizing Area, Two Stacked Canvases** in `index.html` / `style.css` / `src/main.js`:
   - Container SHALL be `#game-container` with:
     ```css
     #game-container {
       position: relative;
       width: min(95vw, calc(95vh * 16/9));
       height: min(95vh, calc(95vw * 9/16));
       aspect-ratio: 16 / 9;
       margin: auto;
       display: block;
     }
     body {
       display:flex; flex-direction:column;
       align-items:center; justify-content:center;
       min-height:100vh; margin:0; padding:20px;
       background:#1a1a1a;
     }
     ```
     This centers the 16:9 stack both axes and **maximizes** it: width is limited by viewport width or by viewport height×16/9, whichever is smaller; height analogously. No canvas or overlay SHALL exceed this container or cause scroll.
   - Inside container SHALL be exactly **two** canvases stacked:
     ```html
     <div id="game-container">
       <canvas id="bg-canvas" width="1280" height="720"></canvas>
       <canvas id="game" width="1280" height="720"></canvas>
       <div id="hotbar">...</div>
       <div id="win-overlay" class="hidden">...</div>
       <div id="pause-overlay" class="hidden">...</div>
       <div id="main-menu-overlay" class="hidden">...</div>
     </div>
     ```
     Ids MAY be `bg`/`background` or `fg`/`foreground` as alias if documented, but both MUST be present, share the **same logical size** (16:9, e.g., `1280×720` or `1600×900`), and be stacked:
     ```css
     #game-container canvas { position:absolute; inset:0; width:100%; height:100%; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.5); }
     #bg-canvas { z-index:1; background:#3a9d23; /* fallback */ }
     #game { z-index:2; background:transparent; pointer-events:auto; }
     #bg-canvas { pointer-events:none; }
     #hotbar, #win-overlay, #pause-overlay, #main-menu-overlay { position:absolute; z-index:5-12; }
     ```
   - Logical size SHALL be **16:9** (`W/H == 16/9`). Default `LOGICAL_W=1280, LOGICAL_H=720` (or `1600×900`) — tunable but ratio MUST be 16:9. All `levels.js` `canvas`, `tee`, `hole`, `field cols/rows`, and `getWindAt` bounds SHALL use this logical size, not `900×600`. `900×600` references SHALL be considered deprecated and replaced.
   - The stack as a whole SHALL be centered and maximized; no separate `h1` or instructions panel SHALL break centering outside the flex column (they are above/below but container remains flex-centered).

2. **Bottom Canvas Rendering — Background Images Only** in `src/render.js` / `src/main.js`:
   - The bottom canvas context `bgCtx = bgCanvas.getContext('2d')` SHALL be the **only** context that draws background imagery. Its drawing SHALL be triggered on:
     - Initial load after images preload
     - `mainMenuVisible` toggling (`startNewGameFromMain` → grass, `endRun` → splash, initial menu → splash, first level load → grass)
     - `window.resize` / DPR change (re-setup)
   - It SHALL **not** be cleared every frame (optional `clearRect` only when switching modes is sufficient), but clearing every frame is allowed if still ≥55fps. It SHALL be opaque.
   - **Image assets** SHALL be `img/grass_seamless.webp` and `img/gfg-splash.png` (repo file currently `img/gfg-spash.png` — implementation SHALL try `./img/gfg-splash.png` first, and on `error` fallback to `./img/gfg-spash.png`). Both SHALL be preloaded via `new Image()` at module load:
     ```js
     const grassImg = new Image(); grassImg.src = './img/grass_seamless.webp';
     const splashImg = new Image();
     splashImg.src = './img/gfg-splash.png';
     splashImg.onerror = () => { if (splashImg.src.includes('gfg-splash.png')) splashImg.src='./img/gfg-spash.png'; };
     ```
     No external CDN; relative paths only per REQ-001. While loading, fallback fill `#3a9d23` MAY be shown.
   - **When drawing a level** (`mainMenuVisible===false`, i.e., `AIMING`/`CHARGING`/`FLYING`/`WIN`/`pause`/`reward`):
     - Bottom canvas SHALL **tile** `grass_seamless.webp` seamlessly across the full logical area:
       ```js
       function drawGrassTiled(bgCtx, W, H, dpr, img){
         bgCtx.save();
         bgCtx.setTransform(dpr,0,0,dpr,0,0);
         if (img.complete && img.naturalWidth) {
           const pat = bgCtx.createPattern(img, 'repeat');
           bgCtx.fillStyle = pat;
           bgCtx.fillRect(0,0,W,H);
         } else {
           bgCtx.fillStyle='#3a9d23'; bgCtx.fillRect(0,0,W,H);
         }
         bgCtx.restore();
       }
       ```
       The pattern SHALL be `repeat` (both axes), no stretching, no gaps, and SHALL remain sharp at DPR2 via `setTransform`. It SHALL cover `0,0,W,H` fully.
   - **When on the main menu** (`mainMenuVisible===true`):
     - Bottom canvas SHALL show `gfg-splash.png` **aspect-covered, centered** (like `object-fit:cover`), not tiled:
       ```js
       function drawSplashCover(bgCtx, W, H, dpr, img){
         bgCtx.save();
         bgCtx.setTransform(dpr,0,0,dpr,0,0);
         bgCtx.fillStyle='#1a1a1a'; bgCtx.fillRect(0,0,W,H); // letterbox guard
         if (img.complete && img.naturalWidth) {
           const scale = Math.max(W/img.naturalWidth, H/img.naturalHeight);
           const w = img.naturalWidth*scale, h = img.naturalHeight*scale;
           const x = (W - w)/2, y = (H - h)/2;
           bgCtx.drawImage(img, x, y, w, h);
         } else {
           // fallback: solid + maybe canvas golf art, but splash missing is tolerated
           bgCtx.fillStyle='#2c3e50'; bgCtx.fillRect(0,0,W,H);
         }
         bgCtx.restore();
       }
       ```
       Splash SHALL cover the entire canvas (no empty bars), centered, preserving aspect ratio via `Math.max` scale. No grass SHALL be visible behind it while menu is shown.
   - Bottom canvas SHALL have `imageSmoothingEnabled = true` and SHALL respect DPR via `setTransform(dpr,0,0,dpr,0,0)` before drawing the pattern/image.
   - A helper `drawBackground(bgCtx, W, H, mode)` with `mode ∈ {'grass','splash'}` SHALL be exported from `src/render.js` and called from `src/main.js` on mode switch and resize.

3. **Top Canvas Rendering — Transparent, Dynamic Only** in `src/render.js` / `src/main.js`:
   - Top canvas `game` SHALL have `background:transparent` (CSS `background:transparent` and never `fillStyle='#3a9d23'` as background). Its context `fgCtx` SHALL be cleared every frame via `fgCtx.clearRect(0,0,W,H)` or `fgCtx.setTransform(dpr,0,0,dpr,0,0); fgCtx.clearRect(0,0,W,H)` at DPR scale.
   - It SHALL render **only** dynamic elements (no background): arrow grid, particles, obstacles, hole/flag, ball, aim orbit/line, modifier circles/preview, force bar, HUD, reward menu canvas overlay (if canvas mode for reward/pause), but NOT grass or splash.
   - Input (mouse move/click for `getCanvasMousePos`, drag, placement) SHALL be attached to the **top canvas only** (`game.addEventListener(...)`), using `game.getBoundingClientRect()` scaled to logical `W/H`. Bottom canvas SHALL have `pointer-events:none` so it never intercepts.
   - Performance: clearing/drawing top only each frame keeps ≥55fps; bottom not redrawn per frame saves fill cost.

4. **HiDPI & Resize for Both Canvases** in `src/main.js:setupCanvas()` (extends REQ-013):
   - A single `setupCanvases()` SHALL configure **both** canvases:
     ```js
     const LOGICAL_W = 1280, LOGICAL_H = 720; // 16:9
     function setupCanvases(){
       const dpr = window.devicePixelRatio || 1;
       for (const c of [bgCanvas, game]) {
         c.width = LOGICAL_W * dpr;
         c.height = LOGICAL_H * dpr;
         c.style.width = '100%'; c.style.height='100%'; //100% of container
         const ctx = c.getContext('2d');
         ctx.setTransform(dpr,0,0,dpr,0,0);
         ctx.imageSmoothingEnabled = true;
       }
       redrawBottom(); // grass or splash per mainMenuVisible
     }
     ```
     Called on load and `window.addEventListener('resize', ...)` debounced 100-200ms. Both canvases SHALL always have identical `width/height` attributes and identical `getBoundingClientRect()`.

5. **Main Menu HTML — Centered Over Canvas, Not Overflowing** (normative cross-ref to REQ-029):
   - `#main-menu-overlay` SHALL be inside `#game-container` with `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%;` so its box equals the 16:9 canvas area — never larger. Content `.main-menu-content` SHALL have `max-width:90%; max-height:90%;` to prevent overflow at small viewports.
   - No canvas `drawMainMenu` SHALL be rendered while HTML menu is visible; HTML is the sole menu. Bottom splash is visible through the overlay’s semi-transparent `background:rgba(0,0,0,0.35)`.

## Acceptance Criteria

- [ ] DOM has **exactly two** canvases (`#bg-canvas` + `#game` or documented alias) inside `#game-container` stacked `position:absolute; inset:0; width:100%; height:100%`, bottom `z-index:1` opaque, top `z-index:2` transparent. Inspecting `window.getComputedStyle(game).backgroundColor` is `rgba(0,0,0,0)` / `transparent`; `bgCanvas.getContext('2d')` after level load shows tiled grass pixels (not solid `#3a9d23`), while `game` context after `clearRect` shows no background pixels (alpha 0) and bottom remains visible through.
- [ ] Container `#game-container` is `aspect-ratio:16/9`, `width: min(95vw, calc(95vh*16/9))`, `height: min(95vh, calc(95vw*9/16))`, centered (`margin:auto` / flex justify center). Measured `containerRect.width / containerRect.height ≈ 1.777 ±0.02` on `1920×1080`, `1280×720`, `375×812` viewports, and it touches the limiting viewport edge (maximized). Both canvases have same `getBoundingClientRect()` as container and each other.
- [ ] When **drawing a level** (new game started, `mainMenuVisible false`), bottom canvas **tiles** `img/grass_seamless.webp` via `createPattern(img,'repeat')` covering entire area without seams or stretch; at DPR2 the grass remains sharp (backing store `2560×1440` for `1280×720`). Top canvas is transparent and dynamic elements appear above grass. No splash is visible.
- [ ] When **on main menu** (`mainMenuVisible true` on fresh load or after `End Run`), bottom canvas shows `img/gfg-splash.png` (fallback `img/gfg-spash.png` tolerated) **aspect-covered centered** (covers entire canvas, no tiling, no letterboxing, image centered, `drawImage` with `scale=Math.max(W/imgW,H/imgH)`). No grass pattern is visible. HTML `#main-menu-overlay` is centered over the same area (`inset:0` flex center) and `main-menu-overlay.getBoundingClientRect()` is contained within `container.getBoundingClientRect()` (no overflow). Content `max-width:90%` keeps button/text inside.
- [ ] Switching `mainMenuVisible` → `false` (click `New Game`) immediately redraws bottom to tiled grass; switching `false`→`true` (`End Run`) redraws bottom to splash. No `clearRect` on top erases bottom.
- [ ] Top canvas handles all input: `click`/`mousemove` on `game` maps via `rect = game.getBoundingClientRect(); logicalX = (e.clientX-rect.left)*(LOGICAL_W/rect.width)` correctly at both DPR1 and DPR2, and after resize (verified by clicking visual center → logical `LOGICAL_W/2, LOGICAL_H/2`).
- [ ] Images are loaded via relative `./img/...` paths, no 404 after `python3 -m http.server`; fallback `#3a9d23` only while loading; no external `https://` image URLs. `Lighthouse` no missing asset.
- [ ] No canvas `drawMainMenu` is executed while HTML main menu visible: searching `src/render.js` for `drawMainMenu` either absent or not called when `mainMenuVisible true` (verified via console stub or code search).
- [ ] Overlays (`#hotbar`, `#pause-overlay`, `#win-overlay`, `#main-menu-overlay`) are inside `#game-container` `position:absolute; inset:0` or anchored to container edges, never overflowing canvas at `375px` width (no horizontal scroll, no `left < container.left`).

## Dependencies
- REQ-002 (dual canvas DOM, 16:9 logical)
- REQ-012 (split draw order)
- REQ-013 (HiDPI + 16:9 maximizing + overlay bounds)
- REQ-029 (main menu HTML over canvas)

## Notes
- Keep `LOGICAL_W/H` as single source of truth (`export const LOGICAL_W=1280, LOGICAL_H=720` in `src/main.js` or `src/render.js`). All `LEVELS[].canvas`, `createField(..., LOGICAL_W, LOGICAL_H)`, `clamp` bounds, and `isOutOfBounds` SHALL use these, not `900/600`. Field grid for 16:9: e.g., `cols=32, rows=18` (cell `40`) or `cols=24, rows=13.5` rounded to `cols=32, rows=18`—document choice; `20×15` (3:2) at `1280×720` is stretched, so upscale to `32×18` or keep `20×15` but treat as before with letterbox? Prefer `32×18` for square cells.
- Preload pattern: ensure `grassImg.decode()` or `onload → redrawBottom()` so first frame after load shows tiles.

## File Paths
- `index.html:1` (#game-container with #bg-canvas + #game + overlays, img/ assets relative)
- `style.css:1` (#game-container 16:9 centered maximized, stacked canvas CSS, overlay inset 0)
- `src/main.js:1` (LOGICAL_W/H 16:9, setupCanvases for both, getCanvasMousePos on top canvas, drawBackground mode switch, image preload with fallback)
- `src/render.js:1` (drawBackground(bgCtx,W,H,mode, images), dynamic draw on fgCtx only, no drawMainMenu)
- `img/grass_seamless.webp:1` (tiled level background)
- `img/gfg-splash.png:1` (splash main menu background, fallback `gfg-spash.png`)
