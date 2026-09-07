# 03 — Rendering, Backgrounds & Terrain Colors

- **ID:** 03-rendering
- **Supersedes:** REQ-012, REQ-030 (rendering sections), REQ-010/033 (color palette only — generation details in `08-level-generation.md`)
- **Type:** UI / Functional
- **References:** `02-canvas-system.md` for DOM/resize/loading; `08-level-generation.md` for terrain generation

## 1. Rendering Split (authoritative draw order)

- **Bottom `bgCtx` (`#bg-canvas`, `z-index:1`, opaque)** — drawn **on demand** (mode switch, resize, terrain change), not every frame (clearing every frame is allowed if ≥55fps). Content:
  1. `OB` → `Rough` → `Fairway` → `Green` (zone fills, see §2) → `Water` (blue)
  2. Optional grass texture overlay (`globalAlpha 0.12-0.18` tiled `grass_seamless.webp`, §3)
  3. Or splash cover when in main menu (§3)
  No dimming rect here; backdrop dimming is done by `#main-menu-overlay.with-backdrop` per `10-persistence-and-menus.md`.

- **Middle `fgCtx` (`#game`, `z-index:2`, transparent, `clearRect` each frame)** — every `render()`:
  1. Trees / circular obstacles, 2. Hole + flag, 3. **Treasure** (`level.treasure` gold chest/star `r 10-14`, see §5, hidden after `isCollected`), 4. Ball (with shadow, `z` lift), 5. Aim orbit+line+indicator (when `AIMING`/`CHARGING`), 6. Modifier circles + preview, 7. Force bar under ball (when `CHARGING`), 8. HUD `Hole/Attempts Left/Total` (canvas), 9. Reward menu canvas overlay (when visible), 10. Pause/Game Over dim (if canvas mode, else DOM)

- **Top `windRenderer` (`#wind-canvas`, `z-index:3`, transparent, `pointer-events:none`)** — Three.js ghost trails + particles + **Free Shot golden glow** over ball (see `06-wind-system.md` & `07-modifiers.md` §5.2), `renderer.setClearColor(0x000000,0)` and own per-frame clear, above game but below HTML overlays (`#hotbar` z5, overlays z10-12).

- API: `render(bgCtx, fgCtx, W, H)` plus `windRenderer.render()`; `drawBackground(bgCtx,W,H,mode)` with `mode ∈ {'grass','splash'}`.

## 2. Terrain Zone Colors (normative palette, ±8 per channel)

Defined once here; `08-level-generation.md` references these values for generation/SDF thresholds.

- **Green** (putting circle, `r~60-90` around `hole`): `#A8E6A3` `rgb(168,230,163)` (alternatives `#B7E5B0`/`#A0E0A0` acceptable, Δ vs Fairway `ΔL*>10`)
- **Fairway** (`0 ≤ d ≤ W_fairway` warped): `#6BC96E` `rgb(107,201,110)` (alternatives `#7AC87A`/`#68B86A`, see `08-level-generation.md` §2 for tighter hard fairway)
- **Rough** (`W_fairway < d ≤ W_rough`): `#3D8B3D` `rgb(61,139,61)` (alternatives `#4A9F4A`/`#36802F`, Δ vs Fairway `>8`)
- **OB** (`d > W_rough`): `#2E2E2E` `rgb(46,46,46)` (alternatives `#333`/`#3A3A3A`/`#404040`, saturation <20, luminance <35, darker than Rough)
- **Water**: `#4A90E2` `rgb(74,144,226)` (alternatives `#3A8DDE`/`#2E86C1`/`#5AA0E8`, hue `210±10`, sat >50)

Rendering order on `bgCtx` is `OB → Rough → Fairway → Green → Water`. Zone fills are dominant; grass texture at low opacity does not hide them.

- **Trees** (circular obstacles, `r∈[18,36]`): drawn on **top canvas** above zones, trunk `#6B3A2A`, canopy `#1E7A34`, with shadow.
- **Hole**: filled `#111`, outer rim `2px #333`, inner shadow; flag/marker optional offset.

## 3. Background Images

- Assets `img/grass_seamless.webp` (tiled) and `img/gfg-splash.png` (fallback `img/gfg-spash.png`) preloaded `new Image()` at module load; fallback on `onerror` tries the typo name; relative paths only.
- **Level mode** (`mainMenuVisible===false`): tile grass via `createPattern(img,'repeat')` covering `0,0,LOGICAL_W,LOGICAL_H`, `imageSmoothingEnabled=true`, DPR-scaled.
- **Main-menu mode** (`mainMenuVisible===true`): show splash aspect-covered (`scale=Math.max(W/imgW,H/imgH)`, centered `drawImage`); no grass visible. No dimming backdrop in this mode (see `10-persistence-and-menus.md` entry vs pause distinction). Splash/grass switch is via `drawBackground(mode)` on mode toggle and resize.
- Fallback solid fill (`#3a9d23` or `#2E2E2E`) is shown only while images are decoding; `#loading-screen` covers white flash (see `02-canvas-system.md`).

## 4. HUD & In-Canvas UI — Attempts Left + Game Over

- **HUD** `drawHUD(ctx, currentHoleIndex, totalHoles, holeAttempts, totalAttempts, maxAttempts)` every `render()`: `Hole: N/M` at `(12,22)` left, **`Attempts Left: X`** (where `X = max(0, maxAttempts - holeAttempts)`, **not** `Attempts: X`) at `(W/2,22)` center, `Total: Y` at `(W-12,22)` right, `14px system-ui`, fill `white`, stroke `rgba(0,0,0,0.7) 3px` or shadow, semi-transparent strip `rgba(0,0,0,0.25) 28px` behind. `maxAttempts` starts `10` and is **static** (no `Max Attempts +5` reward; superseded by `Free Shot` per `07`/`09`). HUD visible in `AIMING`/`CHARGING`/`FLYING`, also dimmed behind `WIN`/`GAME_OVER`. When `isFreeShotActive===true`, HUD may optionally show `Free Shot armed` hint near ball, but `Attempts Left` value itself is unchanged until launch.
- **Victory overlay** (DOM, when `gameState==='WIN'` final hole only): full-canvas dim `rgba(0,0,0,0.55)`, `★★★` three stars `72px #FFD700`, title `Course Completed!` `700 22px` white `stroke 5px` centered, text `Total: Y` (no hole/attempts-this-hole info), green `Continue` button (`#continue-button-win` `#145a32`) with `Press R to continue` hint — `R` or `Continue` does `clearProgress()` removing active game and returns to entry main menu.
- **Game Over overlay** (DOM, when `gameState==='GAME_OVER'`): full-canvas dim `rgba(0,0,0,0.55)` (same as Victory), big title `Game Over` `700 22px` (or larger) white `stroke 5px` centered **only** over green `Continue` button (`#gameover-return-button` `#145a32`, text `Continue`) with `Press R to continue` hint — `R` or green `Continue` does `clearProgress()` removing active game and returns to entry main menu (no `Next`/`Return to Main Menu` text other than green `Continue`).
- **Force bar** `drawForceBar(ctx, ball, charge)` only when `CHARGING` (Space held): centered at `ball.pos + (0,28)`, `60×8`, border `1px #222`, bg `rgba(0,0,0,0.35)`, fill `charge*100%` lerp green `#2ecc71→yellow→red #e74c3c`, label below as `78%` (no word "Power") `13-14px 600` white with shadow.
- **Aim visuals** (see `05-input-and-states.md`): orbit `28-32px` dashed `rgba(0,0,0,0.2)`, aim line `30px` (+ `charge*50` when charging), indicator dot on orbit.
- **Modifier circles & preview** (spatial `amplify`/`nullify`/`flip`): see `07-modifiers.md`; **Free Shot gold glow** is rendered in Three.js layer over ball, not on `game` canvas.
- **Treasure** (`src/render.js:drawTreasure`): exactly one per hole `level.treasure = {x,y,radius:10-14 (default 12), isCollected}` placed near a tree per `08-level-generation.md` §4. Rendered on `fgCtx` above trees/hole, below ball/aim, as gold chest `chest #D4AF37` (`rgb(212,175,55)`) with highlight `#FFD700` and dark outline `#8B6914`, plus small sparkle/star `✦`/`★`; radius `12 ±2`, with `rgba(0,0,0,0.18)` shadow. Hidden when `isCollected===true` (after hit) until next hole. Must be visible distinct from trees/hole on fairway/rough, not obscured by modifier circles.
- **Hole & Attempts Banners** (`src/render.js:drawCenterBanner` / `drawHoleBanner` / `drawAttemptsBanner`, see `11-banners.md`): transient center banners with same backdrop as reward menu (`rgba(0,0,0,0.55)` full-dim, `700 22px white stroke 5px` centered) on `fgCtx`, shown `2000ms` then auto-hide. Hole banner `Hole N` at start of each hole before reward; attempts banner `${N} Attempts Left` before last three attempts (`3/2/1`). Rendered after `drawHUD`/`drawForceBar`, mutually exclusive with `drawRewardMenu` (hole banner → reward transition, attempts banner auto-hide). Block launch/placement while visible, wind still animates.
- **No DOM HUD** (`#hole-counter`/`#force-bar-container` removed); no `<h1>`/`#instructions`; overlays bounded to container.

## Acceptance Criteria

- [ ] Bottom canvas zones use palette within ±8 per channel; order `OB→Rough→Fairway→Green→Water`; trees on top canvas; hole black circle.
- [ ] Level mode tiles grass without seams (DPR-sharp); main-menu mode shows splash aspect-covered, no grass, and per `10-persistence-and-menus.md` backdrop rules.
- [ ] Draw order is `bg (zones+grass/splash) → game (obstacles→hole→treasure→ball→aim→modifiers→forceBar→HUD→reward) → wind (particles/trails) → HTML overlays` (treasure above trees, below ball).
- [ ] HUD and force bar are inside canvas, visible without scroll, with correct stroke/shadow.
- [ ] Treasure: one per hole near a tree (`level.treasure`, radius `12±2`, gold `#D4AF37`/`#FFD700`), visible on `fgCtx` when `!isCollected`, hidden after hit, never at `0,0` or overlapping tree, on `fairway`/`rough`, and `drawTreasure` called each frame.

## File Paths

- `src/render.js:1` (`drawBackground`, `drawDynamic`, `drawHUD`, `drawForceBar`, `drawObstacles`, `drawHole`, `drawTreasure`)
- `src/terrain.js:1` (exports `terrainZoneAt` used by `drawBackground` zone fill)
- `index.html:30` (no extra DOM for HUD), `style.css:1` (container/overlay bounds)
