# 02 — Rendering (Layers, Terrain, HUD, Overlays)

- **ID:** 02-rendering
- **Supersedes:** 03-rendering (palette, draw order, HUD, banners rendering)
- **Type:** UI / Functional
- **References:** `01-foundation.md` (layers/resize); `04-levels-and-wind.md` (terrain SDF); `06-run-rules.md` (banner state); `07-rewards-and-economy.md` (reward/points overlays)

> Draw-order and palette live here only. Gameplay state lives in `06-run-rules.md`; modifier art lives in `05-modifiers-and-bag.md`.

## 1. Layer responsibilities and draw order

1. **Course terrain buffer (sliding window, max 2 holes per course/DPR):** one opaque image per hole — zone fills `OB → Rough → Fairway → Green → Water` (§2) only. Play is strictly sequential, so only the current hole + next hole are buffered (`prepareCourseStaticWindow` / `ensureCourseStaticImage` / `evictCourseHolesExcept` at `staticCacheDpr()`, `1` on mobile ≈ 7MB, display DPR on desktop): current hole renders synchronously on course start / hole advance / DPR change, next hole prebuilds in one background task during play; a speedrun that beats the prebuild pays one single-hole render under the loading cover. Additionally hole 0 of every staged course is pre-warmed from the main menu into a bounded first-hole cache (4 entries mobile, 2 desktop; `renderFirstHoleForCache`, largest courses first) and adopted zero-copy on course start (`adoptFirstHoleAsHole0`), so Play clicks never render. Gameplay never renders more than 1 hole in a click or frame (single-hole `ensureCourseStaticImage` + direct-draw fallback on miss).
2. **Hole overlay (offscreen, one current-hole image):** trees/brick obstacles + hole+flag, transparent (`renderHoleOverlay`/`drawHoleOverlay`, keyed by hole identity + DPR, treasure excluded). Blitted after modifier bubbles so foliage covers bubble edges — bubbles sit **under** trees. Re-rendered only on hole/DPR change.
3. **`fgCtx` (`#game`, z2, gameplay-opaque):** blit terrain (this is the clear — no transparent `clearRect` in gameplay) → modifier circles + wind arrows (under trees) → hole-overlay blit → treasure (gold chest `r 10–14`, hidden when collected) → ball+shadow → aim visuals (only `AIMING`/`CHARGING`, suppressed during reward/summary/cutscene/banter/transition — never around a ball sitting in a cleared hole) → preview + snap link (placement UI, above trees) → force bar (only `CHARGING`) → center banners → softlock banner → canvas pause/game-over dim (DOM overlays preferred). `bgCtx` (`#bg-canvas`, z1) is hidden during gameplay and carries no terrain; it renders only menu splash fallback and cutscene backgrounds.
3. **`windRenderer` (`#wind-canvas`, z3, transparent):** Three.js streaks + Free Shot glow (see `04-levels-and-wind.md`, `05-modifiers-and-bag.md`).
4. **HTML HUD (`#hud`, z4, `pointer-events:none`):** 28px strip `rgba(0,0,0,0.25)`, `14px system-ui` white with `3px` stroke; `#hud-hole` left `Hole: N/M`, `#hud-attempts` center `Attempts Left: X (+Y)` (`(+Y)` only when `Y>0`), `#hud-total` right **`Points: N`** (points only change on hole clear; see `07-rewards-and-economy.md`). Visible in `AIMING`/`CHARGING`/`FLYING`; dimmed/hidden behind `WIN`/`GAME_OVER`/menus; hidden entirely on the tutorial course. Legacy canvas `drawHUD` is deprecated and never called.
5. **HTML overlays** (`#reward-overlay`, `#win-overlay`, `#gameover`, `#pause-overlay`, `#main-menu-overlay`, `#starting-items-overlay`, `#coin-summary-overlay` points summary, `#course-cleared-overlay` Course Cleared, `#cutscene-dialog`, skip buttons, `#toast`): `position:absolute`, `z-index 6–14`, bounded to container.

API: `render(bgCtx, fgCtx, W, H)`, `drawBackground(bgCtx,W,H,mode)` with `mode ∈ {'terrain','splash'}` (menu/cutscene only — gameplay never calls it per frame), `prepareCourseStaticWindow(key,dpr)` / `ensureCourseStaticImage(i,level,dpr)` / `evictCourseHolesExcept(keep)` / `getCourseStaticImage(i)` / `drawCourseStaticImage(ctx,i)` (gameplay static blit; see `01-foundation.md` §3).

## 2. Terrain palette (normative, ±8 per channel; referenced by generation)

- **Green** (putting circle `r~60–90` around hole): `#A8E6A3` (`168,230,163`).
- **Fairway** (`0 ≤ d ≤ W_fairway` warped): `#6BC96E` (`107,201,110`).
- **Rough** (`W_fairway < d ≤ W_rough`): `#3D8B3D` (`61,139,61`).
- **OB** (`d > W_rough`): `#2E2E2E` (`46,46,46`), saturation <20, luminance <35, darker than Rough.
- **Water**: `#4A90E2` (`74,144,226`), hue `210±10`, sat >50.
- Trees (top canvas): trunk `#6B3A2A`, canopy `#1E7A34`, with shadow. Hole: fill `#111`, `2px #333` rim. Order on `bgCtx`: `OB → Rough → Fairway → Green → Water`; trees/hole/treasure on `fgCtx` above zones.

## 3. Background modes

- Asset `img/gfg-splash.webp` preloaded at module load (relative path only).
- Level mode (`mainMenuVisible===false`): zoned terrain covering `0,0,LOGICAL_W,LOGICAL_H` via `drawTerrainZones`.
- Main-menu mode: splash aspect-covered (`scale=max(W/imgW,H/imgH)`, centered); no terrain visible. Switch via `drawBackground(mode)` on toggle/resize. Solid fallback fill only while decoding; `#loading-screen` covers flash.

## 4. In-canvas UI (rendering only)

- **Force bar** (`drawForceBar`, only `CHARGING`): centered `ball.pos+(0,28)`, `60×8`, border `1px #222`, bg `rgba(0,0,0,0.35)`, fill `charge` green→yellow→red, label `78%`.
- **Aim visuals** (`drawAim`, only `AIMING`/`CHARGING` and no blocking overlay): orbit `28–32px` dashed `rgba(0,0,0,0.2)`, line `30px` (`30+charge*50` charging), indicator dot.
- **Center banners** (`drawCenterBanner`, transient `1000ms ±100ms`, full-canvas dim `rgba(0,0,0,0.55)`, `700 22px` white stroke `5px` centered): `Hole N`, `Last Attempt`, `Free Shot!`. Block input while visible; mutually exclusive with reward overlay. State/trigger canonical in `06-run-rules.md`.
- **Softlock banner** (`drawSoftlockBanner`, non-blocking pill `y~H/2-60,h~28`, `rgba(0,0,0,0.65)`, `700 13px` white stroke `4px`): normal `Stuck? Press R to reset`; last-attempt variant exactly `Stuck on last attempt? End Run in pause menu (Escape)`. Rendered after force bar when `softlockBannerVisible`; never a full dim; hidden during `WIN`/`GAME_OVER`/reward/pause/main-menu.
- **Victory / Game Over overlays** (DOM): dim `rgba(0,0,0,0.55)`, title `700 22px` white stroke `5px` (`Course Completed!` legacy + `★★★ 72px #FFD700` + `Total/Points` + green `Continue #145a32`, resp. `Game Over` + green `Continue`); `Press R to continue`. Final wins use Hole Complete + Course Cleared instead of Victory (see `07-rewards-and-economy.md` §5b). Never shown on the tutorial course (banter + menu return instead; see `09-tutorial.md`).
- **Course Cleared overlay** (DOM `#course-cleared-overlay`, z14): dim `rgba(0,0,0,0.55)`, title `Course Cleared` `700 22px` white stroke `5px`, big `+N points` `700 36px #FFD700`, `New Record` `800 22px #FFD700` with per-letter `recordDance` bounce when record, green `Continue #27ae60`.

## Acceptance

- [ ] Zone colors within tolerance, order `OB→Rough→Fairway→Green→Water`; terrain buffer + hole overlay hold terrain / trees+hole, bubbles under trees, treasure dynamic above overlay.
- [ ] Level mode = static-buffer blit on `#game`; menu mode = splash aspect-covered (parallax DOM, `bg-canvas` fallback only).
- [ ] Draw order `game(static blit → dynamic) → wind → HUD → HTML overlays` during play (`bg-canvas` hidden); reward/summary are HTML, never canvas; no icon gradient behind reward icons.
- [ ] HUD is HTML `#hud-hole/#hud-attempts/#hud-total` (`Hole: N/M`, `Attempts Left: X (+Y)`, `Points: N`); force bar canvas-only while `CHARGING`.
- [ ] Treasure gold `r 12±2`, above trees/hole, below ball, hidden when collected; softlock pill mid-screen above center, normal text `Stuck? Press R to reset`.

## File paths

- `src/render.js:1` (`drawBackground`, `drawDynamic`, `drawForceBar`, `drawObstacles`, `drawHole`, `drawTreasure`, `drawCenterBanner`, `drawSoftlockBanner`), `src/main.js:1` (`#hud` sync), `src/terrain.js:1` (`terrainZoneAt`), `index.html:1` (`#hud`), `style.css:1`
