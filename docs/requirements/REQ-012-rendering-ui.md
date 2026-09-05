# REQ-012: Rendering & UI Polish — Dual Canvas Split, Only Canvases, Maximized 16:9

- **ID:** REQ-012
- **Title:** Rendering & UI Polish — Dual Canvas (Background vs Dynamic), 16:9, Only Canvases, No Outside Elements
- **Priority:** Should Have (MVP polish)
- **Type:** UI / Functional
- **Status:** Draft
- **Related Plan Section:** Rendering (Phase 5)

## Description
The game SHALL have a coherent visual theme and minimal UI that communicates controls, wind, and game status. Rendering SHALL be split across **two stacked canvases** (REQ-002): bottom canvas for background images, top canvas for all dynamic elements, both 16:9 and sharing the same logical coordinate space. **No elements SHALL exist outside `#game-container` except a black "Loading..." screen during splash load** — specifically **no `<h1>` title outside the canvas and no `#instructions` panel** — so the canvas can be centered and truly maximized while maintaining 16:9. The main menu SHALL have **no dimming backdrop**; splash is fully visible with opaque buttons on top (REQ-029/030).

## Rationale
Separating opaque background (image-tiled grass or splash) from transparent dynamic drawing avoids clearing/redrawing the background every frame, keeps wind/ball rendering independent, and makes main-menu-over-canvas HTML correctly bounded to the 16:9 area. Removing all outside elements ensures the 16:9 stack maximizes the viewport without being offset by headers, footers, or 20px body padding.

## Requirements

1. **Background & Terrain — Dual Canvas Split With Zoned Colors (REQ-010 Pipeline)** (see REQ-030 for image specifics and REQ-010 for terrain zones):
   - **Bottom canvas `#bg-canvas`** SHALL be the only surface that draws background/terrain:
     - During **level play** (`mainMenuVisible===false`): draw **zoned terrain** per REQ-010 §2-6 on the bottom canvas **before** any grass texture overlay, covering `0,0,LOGICAL_W,LOGICAL_H` (16:9). Terrain zones SHALL be filled with **fixed colors** (tolerance ±8 per channel):
       - **Golf Green** (putting circle around hole): light green `#A8E6A3` `rgb(168,230,163)`
       - **Fairway** (`0 ≤ d ≤ W_fairway` warped SDF): slightly darker green `#6BC96E` `rgb(107,201,110)`
       - **Rough** (`W_fairway < d ≤ W_rough`): even darker green `#3D8B3D` `rgb(61,139,61)`
       - **Out of Bounds** (`d > W_rough`): even darker gray `#2E2E2E` `rgb(46,46,46)` (gray, sat <20)
       - **Water Hazards** (Cellular Automata clusters near fairway edges): blue `#4A90E2` `rgb(74,144,226)` (hue 210±10)
       Rendering order on bottom canvas: `OB gray → Rough → Fairway → Green → Water blue` (water on top of zones). After solid zone fills, the bottom canvas **MAY** tile `img/grass_seamless.webp` at low opacity (`globalAlpha 0.12-0.18`) as texture overlay, but **zone colors SHALL remain the dominant visible fill** (not hidden behind opaque grass). Image SHALL be preloaded (`new Image()` `src="./img/grass_seamless.webp"`) and drawn with `ctx.createPattern(img,'repeat')` scaled to DPR if used.
     - During **main menu** (`mainMenuVisible===true` including root / course submenu / help): show `img/gfg-splash.png` (file in repo is `img/gfg-spash.png` — tolerate typo, check both `./img/gfg-splash.png` and `./img/gfg-spash.png`) centered and covered (`object-fit:cover` equivalent via `drawImage` aspect-cover) on the bottom canvas, not tiled. No terrain/grass SHALL be visible behind the splash while main menu is shown. **No dimming backdrop** SHALL be drawn — the splash is fully visible (see §3).
     - Fallback solid fills MAY be used while images are loading, but not as the final rendered background. While splash is loading, a **black background with "Loading..." text** SHALL be shown (REQ-030, §3).
     - Bottom canvas SHALL be `opaque` (`background:#2E2E2E` or `#3a9d23` as fallback for OB) and drawn only on mode change / resize / dpr change or when `terrain` changes (not necessarily every frame). Zone drawing SHALL use the per-level `terrain` SDF + warped noise (REQ-010 §5-6) to compute `terrainZoneAt(x,y)` per pixel or per `4×4` block for performance.
   - **Top canvas `#game`** SHALL be transparent (`background:transparent; clearRect` each frame) and SHALL NOT draw background — only dynamic content on top of terrain (see §2: obstacles/trees (circular), hole/flag, ball, etc., drawn **above** terrain zones). Its `clearRect(0,0,W,H)` SHALL NOT erase the bottom canvas underneath (stacked `z-index` keeps bottom visible through transparency).
   - Trees SHALL be **circular obstacles** (`type:'circle'`, `r=18-36`) rendered on the top canvas above terrain, per REQ-008/034 (Poisson Disc, a subset `treesOnFairway` on fairway per difficulty Easy 1-2/Medium 2-3/Hard 3-5, plus optional extra in Rough/OB).

2. **Draw Order** split across layers:
   - **Bottom layer (`bgCtx` on `#bg-canvas`, `z-index:1`)**, drawn on demand:
     1. Background image: tiled grass (level) OR splash cover (main menu) per §1 — single operation, no dimming rect.
   - **Middle layer (`fgCtx` on `#game`, `z-index:2`, transparent)**, drawn every `render()` after `clearRect`:
     1. Obstacles (REQ-008)
     2. Hole + flag (REQ-009)
     3. Ball (REQ-005)
     4. Aim orbit + line + indicator (REQ-006) when `AIMING`/`CHARGING`
     5. Modifier circles + preview (REQ-015)
     6. Force bar under ball (REQ-007) when `CHARGING`
     7. HUD `Hole/Attempts/Total` (REQ-014) via `drawHUD` on top layer
     8. Reward menu `drawRewardMenu` (REQ-021) when `rewardMenuVisible`
     9. Pause `drawPauseMenu` if canvas mode used (otherwise DOM overlay) — still on top layer
     10. Win dim handled as DOM `#win-overlay` over container (not canvas), but top layer MAY also dim when `WIN`.
   - **Top wind layer (`windRenderer` on `#wind-canvas`, `z-index:3`, transparent, `pointer-events:none`)**, drawn every frame by Three.js (REQ-004):
     1. Fragment-shader wind streaks/lines (animated via `uTime`, reconstructed from field components + modifiers)
     2. Wind-blown particles (spawned uniformly, advected by same field, fade `life 2s → 0`)
     This layer is **separate from the 2D game canvas** and SHALL be `background:transparent` so grass (bottom) and game elements (middle) remain visible through it. It SHALL be above the game canvas but below UI overlays (`#hotbar` `z-index:5`, `#pause-overlay`/`#win-overlay` `z-index:10-12`).
   - `render()` SHALL accept two 2D contexts `render(bgCtx, fgCtx, W, H)` plus call `windRenderer.render(windScene, windCamera)` for the wind overlay. Bottom is not cleared per frame unless background mode switched; middle is cleared per frame; wind is cleared by Three.js (`alpha:0`).
   - Z-order: `bg-canvas (1, opaque)` → `game (2, transparent)` → `wind-canvas (3, transparent, shader+particles)` → `hotbar (5)` → `overlays (10-12)` → `#loading-screen` (100, fixed, hidden after load).

3. **UI** in `index.html` / `style.css` and **Canvas HUD** in `src/render.js`:
     - **No `<h1>` title SHALL exist** outside or inside `#game-container` (`document.querySelector('h1') === null`). The previous `<h1>Golf Vector Field</h1>` above the container SHALL be removed.
     - **No `#instructions` panel SHALL exist** (`document.getElementById('instructions') === null`). Controls are now documented in the **Help overlay** (REQ-029/032), not in a static footer. A separate instructions DOM below the container SHALL NOT exist.
     - **Only `#game-container` and `#loading-screen` SHALL be direct children of `body`**. `body` SHALL have `padding:0`, `overflow:hidden`, `background:#000` (black during load), `display:flex; align-items:center; justify-content:center; min-height:100vh;` so the container is truly centered and maximized.
     - **Power bar (REQ-007) SHALL be drawn on the top canvas** inside the 16:9 area under the player ball when `CHARGING`.
     - **Hole/Attempts/Total counters (REQ-014) SHALL be drawn on the top canvas** on top (e.g., `y=20px` left/center/right) — HUD is purely top-canvas, not DOM.
     - **Modifier hotbar (REQ-015/020) SHALL be a transparent HTML overlay** (`#hotbar` `position:absolute; bottom:10px; left:50%; translateX(-50%)`) **bounded to `#game-container`** (so it never overflows the 16:9 canvas). Same styling as before (`rgba(0,0,0,0.35)`, `backdrop-filter:blur(4px)`).
     - **Main menu (REQ-029) SHALL be HTML** (`#main-menu-overlay`) **centered over the canvas** inside `#game-container` with `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%; background: transparent` (no dimming `rgba(0,0,0,0.35)` — splash unobscured, opaque buttons provide legibility); content `.main-menu-content` is centered flex column with scrollable children for course list / help; it SHALL have `max-width:90%; max-height:90%; overflow:hidden` and visible buttons SHALL be opaque (`background:#2ecc71` alpha 1). No canvas `drawMainMenu` SHALL be used (see REQ-029). The three root buttons are "Continue" (conditional), "New Game", "Help" — "New Game" navigates to course submenu where each course button has two rows + trashcan delete icon (REQ-031).
     - **Pause/win overlays** similarly `position:absolute; inset:0; width:100%; height:100%` inside container, not covering outside.
     - **No static instructions panel** outside container; short rules + control scheme are in Help overlay.

4. **Styling** in `style.css`:
    - `body {display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:0; background:#000; overflow:hidden;}`
    - `#game-container` 16:9 maximized centered (REQ-013), `canvas, #wind-canvas {position:absolute; inset:0; width:100%; height:100%; border-radius:8px;}` with `#bg-canvas {z-index:1; background:#3a9d23}` `#game {z-index:2; background:transparent; pointer-events:auto; border:3px solid #222; box-shadow:0 4px 20px rgba(0,0,0,0.5)}` `#wind-canvas {z-index:3; background:transparent; pointer-events:none; border:none; box-shadow:none}`. Overlays `z-index:10-12` inside container. `canvas` border is on `#game` only; wind canvas has no border.
    - `#main-menu-overlay {background:transparent}` — **no** `background:rgba(0,0,0,0.35)`. Buttons opaque.
    - `#loading-screen {position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:#000; color:#fff; font:600 18px system-ui, sans-serif; z-index:100;}`
    - Body centered flex as in REQ-013, but **without 20px padding** that would reduce maximized size.

5. **No external fonts** beyond system fonts; images limited to the two in `img/` per REQ-001/REQ-030. Loading screen text is plain "Loading..." on black.

## Acceptance Criteria

- [ ] `document.querySelector('h1') === null` and `document.getElementById('instructions') === null` and `document.body.children` count is 1 or 2 (only `#game-container` + optional `#loading-screen`), `body` computed `backgroundColor` is `rgb(0,0,0)` during loading and `padding` is `0px`, `overflow` is `hidden`. No `<h1>` or instructions panel exists outside container.
- [ ] On level play (`mainMenuVisible false`), **bottom canvas** shows tiled `grass_seamless.webp` covering the entire 16:9 area without visible seams, scaled for DPR; inspecting `bgCanvas.getContext('2d').getImageData` shows non-uniform grass texels, not solid `#3a9d23`. Top canvas has transparent background (computed `backgroundColor rgba(0,0,0,0)`), and `clearRect` each frame does not erase bottom image (visible through).
- [ ] On main menu (`mainMenuVisible true` root / course submenu / help), bottom canvas instead shows `gfg-splash.png` (or `gfg-spash.png` fallback) aspect-covered centered (covers entire canvas, no letterboxing, no tiling), with no grass visible, and **no dimming backdrop** — `getComputedStyle(document.getElementById('main-menu-overlay')).backgroundColor` is `rgba(0,0,0,0)` / `transparent`, not `rgba(0,0,0,0.35)`. Buttons over it are opaque (`rgb(...)` alpha 1).
- [ ] Draw order verified: middle `game` layer renders obstacles→hole→ball→aim→modifiers→HUD; **top `wind-canvas` transparent layer renders shader streaks + particles above game but below UI**. Bottom image is always behind. Streaks do not obscure ball/hole (alpha ≤0.65). `wind-canvas` has `pointer-events:none` and `background:transparent`.
- [ ] HUD/hotbar/overlays are inside `#game-container` and never overflow canvas bounds (overlay `getBoundingClientRect()` contained within container). No title or instructions outside. Help overlay (when shown) is scrollable and bounded to container.
- [ ] No layout shift when force bar charges; Lighthouse shows no 404s for `img/grass_seamless.webp` and `img/gfg-splash.png` (fallback to `gfg-spash.png` tolerated, but at least one splash loads). While splash is loading, `#loading-screen` with text `Loading...` is visible on black background; after load it is hidden.

## Dependencies
- REQ-002 (dual canvas + wind overlay DOM, only canvases, maximized)
- REQ-003/REQ-004 (wind field + Three.js shader overlay)
- REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-014, REQ-015
- REQ-030 (background image tiling/splash, loading)
- REQ-029 (main menu HTML over canvas, course submenu, help)
- REQ-031/032 (course collection / help)

## Notes
- Keep `render.js` pure: `drawBackground(bgCtx,W,H, mode, images)` and `drawDynamic(fgCtx,W,H, state)` split for testability. Preload images once: `grassImg = new Image(); grassImg.src='./img/grass_seamless.webp'` and `splashImg.src='./img/gfg-splash.png'` with fallback to `./img/gfg-spash.png` on error.
- Tiling via `const pat = bgCtx.createPattern(grassImg,'repeat'); bgCtx.fillStyle=pat; bgCtx.fillRect(0,0,W,H)` after scaling `setTransform(dpr,0,0,dpr,0,0)`.
- Splash cover via aspect-cover math: `scale = Math.max(W/img.width, H/img.height); drawImage(img, (W-img.width*scale)/2, (H-img.height*scale)/2, img.width*scale, img.height*scale)`.
- The `h1` and `#instructions` removal is normative: even if they remain in the file as comments, tests SHALL check `document.querySelector('h1') === null` and `document.getElementById('instructions') === null` — they must be deleted, not hidden.

## File Paths
- `src/render.js:1` (drawBackground on bgCtx, drawDynamic on fgCtx, image preloading — no longer draws wind, no dimming rect)
- `src/windThree.js:1` (Three.js wind overlay, shader lines + particles)
- `index.html:1` (#bg-canvas + #game + #wind-canvas inside #game-container, overlays inside container, import map for three, NO h1, NO #instructions, #loading-screen outside container)
- `style.css:1` (stacked canvases + wind overlay, container 16:9 maximized centered no padding, overlay background transparent, body black, loading screen)
