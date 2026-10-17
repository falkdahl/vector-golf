# 01 — Foundation (Static Hosting, Canvas System, Loop)

- **ID:** 01-foundation
- **Supersedes:** 01-infrastructure, 02-canvas-system
- **Type:** Infrastructure + layout (normative for setup; all other files obey it)

## 1. Static hosting

- Zero-dependency static site: HTML5 + CSS + vanilla JS ES modules. No build step, no bundler, no `node_modules/`, no npm packages required to run.
- `index.html` at repo root loads everything via relative paths (`style.css`, `src/main.js` via `<script type="module">`). No CDN scripts: native import maps only (no `es-module-shims`). Static images only under `img/` via `./img/...`: painted backgrounds/splash/character art as `.webp` (q80), `golfbag.png`, `logo.webp`, modifier icons `magnifier-icon.png`, `liquifier-icon.png`, `deflector-icon.png`, `rotator-icon.png`, `field-extender-icon.png`, `power-cell-icon.png` (legacy `amplify/nullify/flip/rotate-icon.png` map to the new names), and PWA icons `icon-192.png`/`icon-512.png`. Audio under `audio/` via `./audio/...`: themes as `.ogg`, short SFX as `.wav`. No other image/audio assets.
- PWA (see `13-pwa.md`): `manifest.webmanifest` and `sw.js` at repo root, linked/registered via relative `./` paths; no build step. iOS/theme meta tags and icon links live in `index.html` `<head>`, adding no body children.
- Exactly one third-party import allowed: `three` via import map (local `vendor/three.module.js`; `unpkg`/`jsdelivr` `three@0.160.0/build/three.module.js` permitted as fallback). `import * as THREE from 'three'` is the only third-party import. No other CDN/`https://` script imports. `three` loads lazily via dynamic `import()` on first level entry so boot stays fast; `windThree.js` facades in `src/main.js` no-op until it arrives.
- Serving: `python3 -m http.server 8000` (or `npx serve .`, or GitHub Pages) from repo root serves `index.html` with no 404s. `file://` ESM CORS is unsupported; docs recommend http serving.
- `README.md` documents run/deploy instructions.

## 2. Logical space

- Strictly 16:9. `LOGICAL_W=1280`, `LOGICAL_H=720` (alternatives `1600×900`/`960×540` allowed if ratio is `16/9 ±0.01`). `900×600` is deprecated.
- All physics, levels, `createField`, `tee`/`hole`, `getWindAt` bounds use this space. `LOGICAL_W`/`LOGICAL_H` exported from `src/main.js` or `src/render.js` (single source of truth).

## 3. DOM (single gameplay canvas + blit; `bg-canvas` compat-only)

```html
<body>
  <div id="game-container">
    <canvas id="bg-canvas" width="1280" height="720"></canvas>  <!-- compat only: hidden (display:none) during gameplay, shown for menu fallback/cutscene -->
    <canvas id="game" width="1280" height="720"></canvas>       <!-- gameplay surface (opaque during play), input target -->
    <canvas id="wind-canvas"></canvas>                          <!-- z3 Three.js, alpha, pointer-events:none -->
    <div id="hud">...</div>                                     <!-- z4, pointer-events:none -->
    <div id="bottom-bar">...</div>                              <!-- z6 -->
    <div id="mobile-rotate-overlay" class="hidden">...</div>     <!-- z50 portrait rotate guard (mobile only) -->
    <div id="journal-wrapper">...</div>
    <div id="journal-panel" class="hidden">...</div>
    <div id="reward-overlay" class="hidden">...</div>            <!-- z10 -->
    <div id="win-overlay" class="hidden">...</div>
    <div id="main-menu-overlay" class="hidden">...</div>
    <div id="pause-overlay" class="hidden">...</div>
    <div id="help-overlay" class="hidden">...</div>
    <div id="menu-hamburger-menu" class="hidden">...</div>     <!-- main-menu ☰ popup: Music/SFX/Help -->
    <div id="starting-items-overlay" class="hidden">...</div>
    <div id="coin-summary-overlay" class="hidden">...</div>     <!-- points summary, id kept for compat -->
    <div id="course-cleared-overlay" class="hidden">...</div>   <!-- Course Cleared, after final Hole Complete -->
    <div id="cutscene-dialog" class="hidden">...</div>
    <button id="cutscene-skip-button" class="hidden">Skip »</button>
    <button id="banter-skip-button" class="hidden">Skip »</button>
    <div id="toast" class="hidden">copied to clipboard</div>
    <div id="continue-overlay">...</div>                   <!-- z60 boot gate: splash + Click to continue (audio-unlock gesture), visible until first click/key; skipped on auto-resume into a restorable save -->
  </div>
  <div id="loading-screen">Loading...</div>
</body>
```

- Outside `#game-container` only `#loading-screen` may exist. No `<h1>`, no `#instructions`, no other body children. No horizontal scroll.
- Gameplay uses single-canvas blitting (mobile perf): at course start all holes are pre-rendered once into an offscreen terrain buffer (zone fills only; treasure excluded because collect-state flips mid-run, trees/hole excluded so bubbles draw under trees). Every gameplay frame `render()` blits the terrain image onto `#game` (`drawImage` scaled to the backing store), draws modifier bubbles + wind arrows, blits the hole overlay (trees/brick obstacles + hole/flag, current hole only), then draws dynamic elements on top (treasure, ball, aim, banners). This replaces per-frame two-canvas compositing (`bg-canvas` + `#game`); `#bg-canvas` is `display:none` during gameplay so the compositor skips the dead layer, and is only shown for menu splash fallback / cutscene background rendering. `#bg-canvas` is kept in the DOM for backward compat (never removed).
- Stacking: `canvas,#wind-canvas { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:min(100vw, calc(100vh * 16/9)); height:min(100vh, calc(100vw * 9/16)) }` (centered 16:9 contain box, `dvw`/`dvh` with `vw`/`vh` fallback first), `#bg-canvas{z-index:1}`, `#game{z-index:2}`, `#wind-canvas{z-index:3; pointer-events:none; background:transparent}`, `#hud{z-index:4; pointer-events:none}`; overlays `z-index 6–14` bounded to container (`getBoundingClientRect()` inside container); `#continue-overlay{z-index:60}` (boot gate, above game overlays, below `#loading-screen`). Scrollable children use `overflow-y:auto; overscroll-behavior:contain`.
- Centering: `body { display:flex; align-items:center; justify-content:center; min-height:100vh; min-height:100dvh; margin:0; padding:0; background:#000; overflow:hidden; }`, `#game-container { position:relative; width:100vw; width:100dvw; height:100vh; height:100dvh; aspect-ratio:auto; margin:0; overflow:hidden; background:#2E2E2E; }`. The container fills the viewport in every mode (windowed, F11, mobile ⛶, installed PWA); `dvh` (with `vh` fallback first) keeps the full height visible under mobile browser chrome when not fullscreen. Each canvas is a centered 16:9 "contain" box scaling via `min(100dvw,100dvh*16/9)`/`min(100dvh,100dvw*9/16)`, so the entire 1280×720 level is always visible and undistorted; the leftover area is the container's OB colour `#2E2E2E`, which blends with the terrain's OB (generation keeps rough/tee/green inside the canvas with an ≥8px margin). `#game` and `#wind-canvas` share identical `getBoundingClientRect()` during play (`#bg-canvas` has no box while hidden). No `:fullscreen`-specific sizing (the base layout already fills the viewport); input mapping via the canvas rect is unchanged. UI font is a single shared stack `:root{--ui-font:"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",system-ui,-apple-system,sans-serif}`; all `font`/`font-family` rules use `var(--ui-font)` (the `Impact`/`"Press Start 2P"`/`monospace` stacks append it as fallback). Concrete Latin faces are listed BEFORE the `system-ui` generic so a phone whose `system-ui` lacks proper Latin glyphs (rendering boxes/tofu, incl. blank `.continue-prompt`-style text) falls back to a readable named face.

## 4. Game loop

- `src/main.js`: `requestAnimationFrame` with `FIXED_DT=1/60` accumulator, `update(FIXED_DT)` then `render()` once, max 5 steps/frame, `dt` in seconds. No `setInterval`/`setTimeout` for the main loop.
- Split: gameplay `fgCtx` (`#game`) blits the course static buffer then draws dynamic elements each frame (no per-frame `clearRect` transparency cost — the blit is the clear), `windRenderer` own per-frame clear (`setClearColor(0x000000,0)`). `bgCtx` is gameplay-inert (hidden layer); it is only painted on demand for menu splash fallback and as the cutscene background plane.
- Pausable (`visibilitychange`, `WIN`, `GAME_OVER`, `mainMenuVisible`, pause, banners, cutscene, banter); while paused `updateWind` visuals may run but `updateBall` is frozen.
- Music auto-pause on tab hidden (`src/audio.js`): when the page becomes hidden (`document.hidden` via `visibilitychange`, `pagehide` for iOS Safari bfcache) both theme tracks (`main-theme.ogg`, `main-menu.ogg` `<audio>` elements) pause immediately (fades cancelled; `musicWanted`/`menuMusicWanted` intent flags preserved). When the page becomes visible again (`visibilitychange` visible + `pageshow`, guarded by `!document.hidden`) each wanted track fades back in. `setMusicActive/setMenuMusicActive(true)` and the gesture-unlock retry while hidden only set the intent flag and defer playback until visible. Visibility-only by design: window `blur`/`focus` is excluded, so a desktop tab that is still visible (e.g. side-by-side chat window) keeps playing; mobile app-switch/lock/Home always reports hidden so it still pauses there. Scope is music only (SFX/wind untouched). Must work on Chrome/Firefox/Safari, desktop + mobile.
- Audio prefs (`AUDIO_PREFS_KEY="golfVectorField.audioPrefs.v1"`, defaults on, full spec in `08-campaign-and-menus.md` §6): `Music OFF` gates all music playback (stage/menu/cutscene scores); `SFX OFF` gates all synth SFX, the wind loop and cutscene SFX/type ticks. Menu toggles in pause menu + main-menu hamburger popup; persisted across page visits.

## 5. HiDPI & resize

- `dpr = window.devicePixelRatio || 1`. 2D canvases: `canvas.width = LOGICAL_W*effectiveDPR()`, `height = LOGICAL_H*effectiveDPR()` (`effectiveDPR()` caps at `1.5` on mobile, `1.0` after sustained `<45fps`), CSS stays `100%`, `ctx.setTransform(dpr,0,0,dpr,0,0)` after resize. Physics uses logical coords; `getCanvasMousePos(e)` maps via `rect=game.getBoundingClientRect(); x=(e.clientX-rect.left)*(LOGICAL_W/rect.width)`. The course static buffer is rasterized at `staticCacheDpr()` (`1` on mobile to bound memory, `effectiveDPR()` on desktop) and scaled on blit; a DPR/resize change rebuilds the buffer (no state reset).
- Three.js: `renderer.setPixelRatio(dpr); renderer.setSize(W,H,false)`, update `uResolution` + orthographic camera. `window.resize` re-applies `setupCanvases()` for all layers (debounced 100–200ms), redraws background, no state reset. DPR changes handled via `resize`/`matchMedia`.

## 6. Loading screen

- `#loading-screen { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:#000; color:#fff; font:600 18px var(--ui-font); z-index:100 }`, text `Loading...`. Visible while Tier 0 splash assets load; hidden after Tier 0 completes. Re-shown as content-load feedback (Play click → cutscene, hole-transition and finale cutscenes, first-restock Hole-2 transition incl. cutscene Skip) until the content starts; never re-shown on resize. The first-restock transition additionally coalesces background work (suppressed intermediates, single hole render) and prebuilds the static window under this cover. Course-start renders hole 0 synchronously (adopted from the menu pre-warm when available) UNDER the loading cover — the cover hides only after, so terrain + hide paint together and the tap never stares at a stale black frame; the next hole prebuilds in the background during play.

## Acceptance

- [ ] `index.html` uses relative paths; only `three` is third-party; no `node_modules/`; static server loads with no 404s.
- [ ] DOM contains only `#game-container` (+ optional `#loading-screen`); no `h1`/`#instructions`; body `background:#000`, `padding:0`, `overflow:hidden`.
- [ ] Container fills the viewport (windowed/F11/mobile ⛶/PWA) with OB `#2E2E2E` background; each canvas is a centered 16:9 contain box (whole level visible, no stretch); DPR=2 keeps physics identical; resize keeps ratio, alignment, input mapping.
- [ ] Fixed timestep: 30/60fps ball travel over 2s varies <5%; no main-loop `setInterval`.
- [ ] Music pauses on tab hide/`pagehide` and resumes wanted track(s) on visible/`pageshow` (Chrome/Firefox/Safari, desktop+mobile); still-visible window blur (desktop side-by-side chat) keeps playing; intent flags preserved across hide.
- [ ] Audio prefs toggles gate music vs SFX everywhere incl. cutscenes; state persists across page visits.

## File paths

- `index.html:1`, `style.css:1`, `src/main.js:1` (loop, `setupCanvases`, `getCanvasMousePos`, loading hide), `src/audio.js:1` (music auto-pause on hidden, visibility-only), `src/windThree.js:1` (renderer resize), `manifest.webmanifest:1` + `sw.js:1` (PWA, see `13-pwa.md`), `README.md:1`
