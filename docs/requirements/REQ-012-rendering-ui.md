# REQ-012: Rendering & UI Polish — Dual Canvas Split

- **ID:** REQ-012
- **Title:** Rendering & UI Polish — Dual Canvas (Background vs Dynamic), 16:9
- **Priority:** Should Have (MVP polish)
- **Type:** UI / Functional
- **Status:** Draft
- **Related Plan Section:** Rendering (Phase 5)

## Description
The game SHALL have a coherent visual theme and minimal UI that communicates controls, wind, and game status. Rendering SHALL be split across **two stacked canvases** (REQ-002): bottom canvas for background images, top canvas for all dynamic elements, both 16:9 and sharing the same logical coordinate space.

## Rationale
Separating opaque background (image-tiled grass or splash) from transparent dynamic drawing avoids clearing/redrawing the background every frame, keeps wind/ball rendering independent, and makes main-menu-over-canvas HTML correctly bounded to the 16:9 area.

## Requirements

1. **Background — Dual Canvas Split** (see REQ-030 for image specifics):
   - **Bottom canvas `#bg-canvas`** SHALL be the only surface that draws background imagery:
     - During **level play** (`mainMenuVisible===false`): tile `img/grass_seamless.webp` (seamless grass) across the entire logical area via `createPattern` `repeat` or `drawImage` tiling, covering `0,0,LOGICAL_W,LOGICAL_H` (16:9). Image SHALL be preloaded (`new Image()` `src="./img/grass_seamless.webp"`) and drawn with `ctx.createPattern(img,'repeat')` scaled to DPR.
     - During **main menu** (`mainMenuVisible===true`): show `img/gfg-splash.png` (file in repo is `img/gfg-spash.png` — tolerate typo, check both `./img/gfg-splash.png` and `./img/gfg-spash.png`) centered and covered (`object-fit:cover` equivalent via `drawImage` aspect-cover) on the bottom canvas, not tiled. No grass SHALL be visible behind the splash while main menu is shown.
     - No solid `#3a9d23` fill SHALL be the primary background in either mode; the images are the background. Fallback `#3a9d23` MAY be used while images are loading or on error, but not as the final rendered background.
     - Bottom canvas SHALL be `opaque` (`background:#3a9d23` as fallback) and drawn only on mode change / resize / dpr change (not necessarily every frame).
   - **Top canvas `#game`** SHALL be transparent (`background:transparent; clearRect` each frame) and SHALL NOT draw background — only dynamic content (see §2). Its `clearRect(0,0,W,H)` SHALL NOT erase the bottom canvas underneath (stacked `z-index` keeps bottom visible through transparency).

2. **Draw Order** split across layers:
   - **Bottom layer (`bgCtx` on `#bg-canvas`)**, drawn on demand:
     1. Background image: tiled grass (level) OR splash cover (main menu) per §1 — single operation.
   - **Top layer (`fgCtx` on `#game`)**, drawn every `render()` after `clearRect`:
     1. Arrow grid (REQ-004) — using `getWindAt` including modifiers
     2. Particles (REQ-004)
     3. Obstacles (REQ-008)
     4. Hole + flag (REQ-009)
     5. Ball (REQ-005)
     6. Aim orbit + line + indicator (REQ-006) when `AIMING`/`CHARGING`
     7. Modifier circles + preview (REQ-015)
     8. Force bar under ball (REQ-007) when `CHARGING`
     9. HUD `Hole/Attempts/Total` (REQ-014) via `drawHUD` on top layer
     10. Reward menu `drawRewardMenu` (REQ-021) when `rewardMenuVisible`
     11. Pause `drawPauseMenu` if canvas mode used (otherwise DOM overlay) — still on top layer
     12. Win dim handled as DOM `#win-overlay` over container (not canvas), but top layer MAY also dim when `WIN`.
   - `render()` SHALL accept two contexts `render(bgCtx, fgCtx, W, H)` or call `drawBackground(bgCtx,...)` then `drawDynamic(fgCtx,...)`. Bottom is not cleared per frame unless background mode switched.
   - Z-order within top layer remains as above; bottom background is always behind (z-index 1 vs 2).

3. **UI** in `index.html` / `style.css` and **Canvas HUD** in `src/render.js`:
     - Title `<h1>Golf Vector Field</h1>` above `#game-container` (outside the 16:9 stack, not inside).
     - **Power bar (REQ-007) SHALL be drawn on the top canvas** inside the 16:9 area under the player ball when `CHARGING`.
     - **Hole/Attempts/Total counters (REQ-014) SHALL be drawn on the top canvas** on top (e.g., `y=20px` left/center/right) — HUD is purely top-canvas, not DOM.
     - **Modifier hotbar (REQ-015/020) SHALL be a transparent HTML overlay** (`#hotbar` `position:absolute; bottom:10px; left:50%; translateX(-50%)`) **bounded to `#game-container`** (so it never overflows the 16:9 canvas). Same styling as before (`rgba(0,0,0,0.35)`, `backdrop-filter:blur(4px)`).
     - **Main menu (REQ-029) SHALL be HTML** (`#main-menu-overlay`) **centered over the canvas** inside `#game-container` with `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%` so it never overflows the canvas area; content `.main-menu-content` is centered flex column. No canvas `drawMainMenu` SHALL be used (see REQ-029).
     - **Pause/win overlays** similarly `position:absolute; inset:0; width:100%; height:100%` inside container, not covering outside.
     - Instructions panel: "Arrows: Aim | Space: Shoot | R: Reset | H: Toggle Wind" (DOM below container).

4. **Styling** in `style.css`:
    - `#game-container` 16:9 maximized centered (REQ-013), `canvas {position:absolute; inset:0; width:100%; height:100%; border:3px solid #222; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.5);}` with `#bg-canvas {z-index:1} #game {z-index:2; background:transparent}`. Overlays `z-index:10-12` inside container.
    - Body centered flex as in REQ-013.

5. **No external fonts** beyond system fonts; images limited to the two in `img/` per REQ-001/REQ-030.

## Acceptance Criteria

- [ ] On level play (`mainMenuVisible false`), **bottom canvas** shows tiled `grass_seamless.webp` covering the entire 16:9 area without visible seams, scaled for DPR; inspecting `bgCanvas.getContext('2d').getImageData` shows non-uniform grass texels, not solid `#3a9d23`. Top canvas has transparent background (computed `backgroundColor rgba(0,0,0,0)`), and `clearRect` each frame does not erase bottom image (visible through).
- [ ] On main menu (`mainMenuVisible true`), bottom canvas instead shows `gfg-splash.png` (or `gfg-spash.png` fallback) aspect-covered centered (covers entire canvas, no letterboxing, no tiling), with no grass visible. Switching `mainMenuVisible` toggles bottom layer between tiled grass and splash without affecting top layer’s `clearRect`.
- [ ] Draw order verified: top layer renders arrows→particles→obstacles→hole→ball→aim→modifiers→HUD in correct z-order above the background image; bottom image is always behind (visually bottom layer is beneath all dynamic elements).
- [ ] Title `<h1>` is outside `#game-container`; HUD/hotbar/overlays are inside container and never overflow canvas bounds (overlay `getBoundingClientRect()` contained within container).
- [ ] No layout shift when force bar charges; Lighthouse shows no 404s for `img/grass_seamless.webp` and `img/gfg-splash.png` (fallback to `gfg-spash.png` tolerated, but at least one splash loads).

## Dependencies
- REQ-002 (dual canvas DOM)
- REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-014, REQ-015
- REQ-030 (background image tiling/splash)
- REQ-029 (main menu HTML over canvas)

## Notes
- Keep `render.js` pure: `drawBackground(bgCtx,W,H, mode, images)` and `drawDynamic(fgCtx,W,H, state)` split for testability. Preload images once: `grassImg = new Image(); grassImg.src='./img/grass_seamless.webp'` and `splashImg.src='./img/gfg-splash.png'` with fallback to `./img/gfg-spash.png` on error.
- Tiling via `const pat = bgCtx.createPattern(grassImg,'repeat'); bgCtx.fillStyle=pat; bgCtx.fillRect(0,0,W,H)` after scaling `setTransform(dpr,0,0,dpr,0,0)`.
- Splash cover via aspect-cover math: `scale = Math.max(W/img.width, H/img.height); drawImage(img, (W-img.width*scale)/2, (H-img.height*scale)/2, img.width*scale, img.height*scale)`.

## File Paths
- `src/render.js:1` (drawBackground on bgCtx, drawDynamic on fgCtx, image preloading)
- `index.html:1` (#bg-canvas + #game inside #game-container, overlays inside container)
- `style.css:1` (stacked canvas, container 16:9, overlay bounds)
