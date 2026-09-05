# REQ-030: Stacked Canvases & Background Image System — 16:9 Landscape, Tiled Grass vs Splash, No Backdrop, Black Loading

- **ID:** REQ-030
- **Title:** Stacked Canvases & Background Images — 16:9 Maximized, Bottom Tiled Grass (Level) vs Splash (Main Menu), Top Transparent Dynamic, No Dimming Backdrop, Black Loading Screen
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Rendering / Layout / Assets (REQ-002/REQ-012/REQ-013 Extension)

## Description
The game SHALL render in **landscape 16:9** centered on screen, **maximizing canvas area** using **three stacked layers**: a bottom opaque `2D` canvas that renders **only** background imagery, a middle transparent `2D` canvas that renders all dynamic game elements, and a top transparent `Three.js` overlay (`#wind-canvas`) that renders wind streaks + particles (REQ-004). When drawing a **level** (`mainMenuVisible===false`) the bottom canvas SHALL tile the seamless texture `img/grass_seamless.webp`. When on the **main menu** (`mainMenuVisible===true`) the bottom canvas SHALL show `img/gfg-splash.png` (fallback `img/gfg-spash.png`) aspect-covered. The top 2D canvas and wind overlay SHALL be transparent and cleared every frame; they SHALL never draw background. The **main menu overlay SHALL have no dimming backdrop when shown over the splash** (entry mode, `background: transparent`) — splash is shown unobscured with opaque buttons on top; **when shown via Escape during a level (in-level pause, see REQ-028/029) it SHALL have a backdrop shadowing the playing field** (`background: rgba(0,0,0,0.55)` or `with-backdrop` class). While the splash is loading, the page SHALL show a **black background with centered "Loading..." text** and no white flash.

## Rationale
16:9 landscape matches modern monitors and gives maximal play area. Tiled grass gives richer fairway without GPU cost, while branded splash distinguishes idle vs play. Stacking isolates static image work (bottom, redraw only on mode/resize) from per-frame dynamic work (top, `clearRect` every frame). Removing the dimming backdrop lets the splash art remain fully visible as designed; opaque buttons provide legibility instead. A black Loading... placeholder prevents white flash before the splash image decodes.

## Requirements

1. **Layout — 16:9 Landscape, Centered, Maximizing Area, Two Stacked Canvases, No Outside Elements** in `index.html` / `style.css` / `src/main.js`:
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
       display:flex; align-items:center; justify-content:center;
       min-height:100vh; margin:0; padding:0; /* no 20px that would shrink centering */
       background:#000; /* black while loading; after load may stay #000 or #1a1a1a but must be black during loading */
       overflow:hidden; /* no page scroll */
     }
     ```
     This centers the 16:9 stack both axes and **maximizes** it: width is limited by viewport width or by viewport height×16/9, whichever is smaller; height analogously. No canvas or overlay SHALL exceed this container or cause scroll. **No elements SHALL exist outside `#game-container`** — specifically **no `<h1>`** (`document.querySelector('h1')===null`) and **no `#instructions`** (`document.getElementById('instructions')===null`) and no other sibling of `#game-container` besides `#loading-screen` (which is fixed full-screen during load). See REQ-029/REQ-012 for layout-not-overflow.
   - Inside container SHALL be exactly **two 2D canvases plus one transparent wind overlay** stacked:
      ```html
      <div id="game-container">
        <canvas id="bg-canvas" width="1280" height="720"></canvas>
        <canvas id="game" width="1280" height="720"></canvas>
        <canvas id="wind-canvas"></canvas> <!-- Three.js wind shader + particles, transparent, z-index:3 -->
        <div id="hotbar">...</div>
        <div id="win-overlay" class="hidden">...</div>
        <div id="pause-overlay" class="hidden">...</div>
        <div id="main-menu-overlay" class="hidden">...</div>
      </div>
      <div id="loading-screen">Loading...</div>
      ```
      `id="wind-canvas"` MAY be `wind-container`/`wind-overlay` as alias if documented, but the wind element MUST be present, share the **same logical size** (16:9, e.g., `1280×720` or `1600×900`), and be stacked:
      ```css
      #game-container canvas, #wind-canvas { position:absolute; inset:0; width:100%; height:100%; border-radius:8px; }
      #bg-canvas { z-index:1; background:#3a9d23; /* fallback */ box-shadow:0 4px 20px rgba(0,0,0,0.5); }
      #game { z-index:2; background:transparent; pointer-events:auto; box-shadow:0 4px 20px rgba(0,0,0,0.5); }
      #wind-canvas { z-index:3; background:transparent; pointer-events:none; border:none; box-shadow:none; }
      #bg-canvas, #wind-canvas { pointer-events:none; }
      #hotbar, #win-overlay, #pause-overlay, #main-menu-overlay { position:absolute; z-index:5-12; }
      #loading-screen {
        position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
        background:#000; color:#fff; font:600 18px system-ui, sans-serif; z-index:100;
      }
      #loading-screen.hidden { display:none; }
      ```
      The wind element SHALL be created by Three.js (`THREE.WebGLRenderer` `alpha:true`, `setClearColor(0,0)`) inside `src/windThree.js` (REQ-004) and have `pointer-events:none` so it never blocks input.
   - Logical size SHALL be **16:9** (`W/H == 16/9`). Default `LOGICAL_W=1280, LOGICAL_H=720` (or `1600×900`) — tunable but ratio MUST be 16:9. All `levels.js` `canvas`, `tee`, `hole`, `field cols/rows`, and `getWindAt` bounds SHALL use this logical size, not `900×600`. `900×600` references SHALL be considered deprecated and replaced.
   - The stack as a whole SHALL be centered and maximized; **no separate `h1` or instructions panel SHALL exist or break centering** (removed per new layout).

 2. **Bottom Canvas Rendering — Background Images Only, Conditional Backdrop** in `src/render.js` / `src/main.js`:
   - The bottom canvas context `bgCtx = bgCanvas.getContext('2d')` SHALL be the **only** context that draws background imagery. Its drawing SHALL be triggered on:
     - Initial load after images preload
     - `mainMenuVisible` toggling (`New Game → course play` → grass, `End Run`/`Continue` etc. → splash vs grass)
     - `window.resize` / DPR change (re-setup)
   - It SHALL **not** be cleared every frame (optional `clearRect` only when switching modes is sufficient), but clearing every frame is allowed if still ≥55fps. It SHALL be opaque.
   - **Image assets** SHALL be `img/grass_seamless.webp` and `img/gfg-splash.png` (repo file currently `img/gfg-spash.png` — implementation SHALL try `./img/gfg-splash.png` first, and on `error` fallback to `./img/gfg-spash.png`). Both SHALL be preloaded via `new Image()` at module load:
     ```js
     const grassImg = new Image(); grassImg.src = './img/grass_seamless.webp';
     const splashImg = new Image();
     splashImg.src = './img/gfg-splash.png';
     splashImg.onerror = () => { if (splashImg.src.includes('gfg-splash.png')) splashImg.src='./img/gfg-spash.png'; };
     ```
     No external CDN; relative paths only per REQ-001.
   - **While splash is loading**, `body` SHALL be black and `#loading-screen` with text **exactly "Loading..."** SHALL be visible (`display:flex`, centered). The splash `onload`/`onerror`/`decode()` SHALL hide `#loading-screen` (`classList.add('hidden')` / `display:none`). No white background flash SHALL occur — initial `body {background:#000}` from first paint.
   - **When drawing a level** (`mainMenuVisible===false`, i.e., `AIMING`/`CHARGING`/`FLYING`/`WIN`/`pause`/`reward`):
     - Bottom canvas SHALL **tile** `grass_seamless.webp` seamlessly across the full logical area via `createPattern(img,'repeat')` (see prior spec for `drawGrassTiled`). Pattern `repeat` both axes, no stretching, no gaps, sharp at DPR2 via `setTransform`.
    - **When on the main menu** (`mainMenuVisible===true`, root or course submenu or help):
      - Bottom canvas SHALL show `gfg-splash.png` **aspect-covered, centered** (`Math.max(W/imgW,H/imgH)` scale, centered `drawImage`), not tiled. No grass SHALL be visible while menu is shown when in **entry mode** (no active run or after End Run).
      - **Backdrop conditional:** Over the splash (entry mode, `!hasRestorableSave()` or after `End Run`), **no dimming backdrop SHALL be drawn**: `bgCtx` SHALL NOT fill a dark rect, and `#main-menu-overlay` SHALL have `background: transparent` (not `rgba(0,0,0,0.55)`). The splash SHALL be fully visible; opaque buttons provide contrast. **When the main menu is shown via Escape during a level (in-level pause, even in `FLYING`), the overlay SHALL have a backdrop shadowing the playing field:** `#main-menu-overlay` SHALL have `background: rgba(0,0,0,0.55)` (or `with-backdrop` class) so the field (grass + ball) is visible but dimmed behind the menu (see REQ-028/029). The field itself remains rendered behind the backdrop (not cleared to splash). A previous spec's `background:rgba(0,0,0,0.35)` on the overlay over splash is **forbidden**, but `rgba(0,0,0,0.55)` **is required** for the in-level pause case.
   - Bottom canvas SHALL have `imageSmoothingEnabled = true` and SHALL respect DPR via `setTransform(dpr,0,0,dpr,0,0)` before drawing the pattern/image.
   - Helper `drawBackground(bgCtx, W, H, mode)` with `mode ∈ {'grass','splash'}` SHALL be exported from `src/render.js` and called from `src/main.js` on mode switch and resize.

3. **Top Canvas Rendering — Transparent, Dynamic Only** in `src/render.js` / `src/main.js`:
   - Top 2D canvas `game` SHALL have `background:transparent` (CSS `background:transparent` and never `fillStyle='#3a9d23'` as background). Its context `fgCtx` SHALL be cleared every frame via `fgCtx.clearRect(0,0,W,H)` at DPR scale.
   - It SHALL render **only** 2D dynamic elements (obstacles, hole/flag, ball, aim orbit/line, modifier circles/preview, force bar, HUD, reward menu canvas overlay if canvas mode, but NOT grass/splash and NOT the wind streaks/particles).
   - Input SHALL be attached to the **game canvas only** (`game.addEventListener(...)`), using `game.getBoundingClientRect()` scaled to logical `W/H`. Bottom canvas and wind overlay SHALL have `pointer-events:none`.

4. **Wind Overlay — Transparent Three.js Element on Top of Game Canvas** (REQ-004):
   - The wind element `#wind-canvas` SHALL be `position:absolute; inset:0; width:100%; height:100%; pointer-events:none; background:transparent; z-index:3` (above `game` `z-index:2` but below UI overlays `z-index:5-12`). It SHALL be created and driven by `src/windThree.js` (`THREE.WebGLRenderer` `alpha:true`, `setClearColor(0x000000,0)`), sharing the same logical `W×H` and DPR handling.

5. **HiDPI & Resize for All Canvases + Wind Overlay** in `src/main.js:setupCanvas()` / `src/windThree.js` (extends REQ-013):
   - A single `setupCanvases()` SHALL configure **both** 2D canvases via `dpr` scaling (backing store `W*dpr` `H*dpr`, CSS `100%` of container, `setTransform(dpr,0,0,dpr,0,0)`). Called on load and `resize` debounced 100-200ms. Both canvases SHALL always have identical `width/height` attributes and identical `getBoundingClientRect()`.

 6. **Main Menu HTML — Centered Over Canvas, Not Overflowing, Conditional Backdrop** (normative cross-ref to REQ-029/028):
   - `#main-menu-overlay` SHALL be inside `#game-container` with `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%;` so its box equals the 16:9 canvas area — never larger. Content `.main-menu-content` SHALL have `max-width:90%; max-height:90%;` to prevent overflow. **Conditional backdrop:** over splash (entry, no active run) `background:transparent` (`getComputedStyle(overlay).backgroundColor === "rgba(0, 0, 0, 0)"`); over paused level (Escape during active run, even in `FLYING`) `background:rgba(0,0,0,0.55)` (or `with-backdrop` class) shadowing the field.
   - No canvas `drawMainMenu` SHALL be rendered while HTML menu is visible; HTML is the sole menu. Bottom splash is visible unobscured.

## Acceptance Criteria

- [ ] DOM has **no elements outside `#game-container` except `#loading-screen`**: `document.querySelector('h1')===null`, `document.getElementById('instructions')===null`, and `body` children count is `1` (container) + maybe `loading-screen`. `body` computed `backgroundColor` is `rgb(0,0,0)` during loading and not white.
- [ ] While splash image is still loading (simulate slow network / before `splashImg.complete`), `#loading-screen` is visible (`display:flex`, text `Loading...` centered) and `body` background is black `rgb(0,0,0)`. After splash `onload`/`decode`, `#loading-screen` becomes `hidden`/`display:none` and splash is visible on `bgCanvas`. No white flash observed (screen is black, not white, before splash). Toggling `mainMenuVisible` does not re-show loading.
- [ ] Container `#game-container` is `aspect-ratio:16/9`, `width: min(95vw, calc(95vh*16/9))`, `height: min(95vh, calc(95vw*9/16))`, centered (`margin:auto` / flex justify center), maximized (touches limiting viewport edge). Both 2D canvases + wind overlay have same `getBoundingClientRect()` as container.
- [ ] When **drawing a level** (`mainMenuVisible false`), bottom canvas tiles grass via `createPattern(img,'repeat')`; when **on main menu over splash (entry, no active run)** (`mainMenuVisible true` root/course/help with no active run), bottom canvas shows splash aspect-covered centered (`scale=Math.max(W/imgW,H/imgH)`), no grass, **no dimming backdrop** — `getComputedStyle(main-menu-overlay).backgroundColor` is `transparent` (`rgba(0,0,0,0)`), not `rgba(0,0,0,0.55)`. **When the main menu is shown via Escape during a level (even in `FLYING`, with backdrop), the overlay has `background: rgba(0,0,0,0.55)` shadowing the field** (field still rendered behind, dimmed), while `Continue` simply hides the overlay and resumes (ball continues flight).
- [ ] Main menu buttons are **opaque**: `getComputedStyle(continue-button|new-game-button|help-button).backgroundColor` is `rgb(...)` with alpha 1, not `rgba(...,0.28)`. Same for course play buttons when course submenu is shown.
- [ ] All overlays (`#hotbar`, `#pause-overlay`, `#win-overlay`, `#main-menu-overlay`, `#help-overlay` inside it, `#course-menu` inside it) are inside `#game-container` `position:absolute; inset:0` or anchored to container edges, never overflowing canvas at `375px` width (no horizontal scroll).
- [ ] Images loaded via relative `./img/...` paths, no 404 after `python3 -m http.server`; fallback `#3a9d23` only while loading.
- [ ] No canvas `drawMainMenu` is executed while HTML main menu visible.

## Dependencies
- REQ-002 (dual canvas DOM, 16:9 logical)
- REQ-012 (split draw order)
- REQ-013 (HiDPI + 16:9 maximizing + overlay bounds)
- REQ-029 (main menu HTML over canvas, now no backdrop)

## Notes
- Keep `LOGICAL_W/H` as single source of truth (`export const LOGICAL_W=1280, LOGICAL_H=720` in `src/main.js` or `src/render.js`). All `LEVELS[].canvas`, `createField(..., LOGICAL_W, LOGICAL_H)`, `clamp` bounds, and `isOutOfBounds` SHALL use these, not `900/600`.
- Preload pattern: ensure `grassImg.decode()` or `onload → redrawBottom()` so first frame after load shows tiles. For splash: `Promise.all([splashImg.decode().catch(()=>{}), grassImg.decode().catch(()=>{})]).then(()=>{ hideLoading(); redrawBottom(); })` or `onload` fallback.
- The loading screen SHALL be `position:fixed; inset:0` outside container OR `position:absolute; inset:0` inside container covering full viewport — either is acceptable if it covers viewport with black and centered Loading... text and `z-index:100` above container.

## File Paths
- `index.html:1` (#game-container with #bg-canvas + #game + overlays + #loading-screen outside, NO h1, NO #instructions, img/ assets relative)
- `style.css:1` (#game-container 16:9 centered maximized, stacked canvas CSS, overlay inset 0 background transparent, body background #000, loading screen)
- `src/main.js:1` (LOGICAL_W/H 16:9, setupCanvases for both, getCanvasMousePos on top canvas, drawBackground mode switch, image preload with fallback, hide loading on splash load)
- `src/render.js:1` (drawBackground(bgCtx,W,H,mode, images), dynamic draw on fgCtx only, no drawMainMenu)
- `img/grass_seamless.webp:1` (tiled level background)
- `img/gfg-splash.png:1` (splash main menu background, fallback `gfg-spash.png`)
