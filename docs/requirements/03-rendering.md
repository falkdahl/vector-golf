# 03 — Rendering, Backgrounds & Terrain Colors

- **ID:** 03-rendering
- **Supersedes:** REQ-012, REQ-030 (rendering sections), REQ-010/033 (color palette only)
- **Type:** UI / Functional
- **References:** `02-canvas-system.md` (DOM/resize/loading); `07-level-generation.md` (terrain generation); `05-input-and-states.md` (HUD state); `08-rewards-and-progression.md` (overlays)

## 1. Rendering Split (authoritative draw order)

- **Bottom `bgCtx` (`#bg-canvas`, `z-index:1`, opaque)** — drawn **on demand** (mode switch, resize, terrain change), not every frame (clearing every frame is allowed if ≥55fps). Content:
  1. `OB` → `Rough` → `Fairway` → `Green` (zone fills, see §2) → `Water` (blue)
  2. Or splash cover when in main menu (§3)
  No dimming rect here; backdrop dimming is done by `#main-menu-overlay.with-backdrop` per `09-persistence-and-campaign.md`.

- **Middle `fgCtx` (`#game`, `z-index:2`, transparent, `clearRect` each frame)** — every `render()`:
  1. Trees / circular obstacles, 2. Hole + flag, 3. **Treasure** (`level.treasure` gold chest/star `r 10-14`, see §5, hidden after `isCollected`), 4. Ball (with shadow, `z` lift), 5. Aim orbit+line+indicator (when `AIMING`/`CHARGING`), 6. Modifier circles + preview, 7. Force bar under ball (when `CHARGING`), 8. HUD `Hole/Attempts Left/Total` (canvas), 9. Reward menu canvas overlay (when visible), 10. Pause/Game Over dim (if canvas mode, else DOM)

- **Top `windRenderer` (`#wind-canvas`, `z-index:3`, transparent, `pointer-events:none`)** — Three.js ghost trails + particles + **Free Shot golden glow** over ball (see `06-wind-system.md` §2 & §7.2), `renderer.setClearColor(0x000000,0)` and own per-frame clear, above game but below HTML overlays (`#hotbar` z5, overlays z10-12).

- API: `render(bgCtx, fgCtx, W, H)` plus `windRenderer.render()`; `drawBackground(bgCtx,W,H,mode)` with `mode ∈ {'terrain','splash'}`.

## 2. Terrain Zone Colors (normative palette, ±8 per channel)

Defined once here; `07-level-generation.md` references these values for generation/SDF thresholds.

- **Green** (putting circle, `r~60-90` around `hole`): `#A8E6A3` `rgb(168,230,163)` (alternatives `#B7E5B0`/`#A0E0A0` acceptable, Δ vs Fairway `ΔL*>10`)
- **Fairway** (`0 ≤ d ≤ W_fairway` warped): `#6BC96E` `rgb(107,201,110)` (alternatives `#7AC87A`/`#68B86A`, see `07-level-generation.md` §2 for tighter hard fairway)
- **Rough** (`W_fairway < d ≤ W_rough`): `#3D8B3D` `rgb(61,139,61)` (alternatives `#4A9F4A`/`#36802F`, Δ vs Fairway `>8`)
- **OB** (`d > W_rough`): `#2E2E2E` `rgb(46,46,46)` (alternatives `#333`/`#3A3A3A`/`#404040`, saturation <20, luminance <35, darker than Rough)
- **Water**: `#4A90E2` `rgb(74,144,226)` (alternatives `#3A8DDE`/`#2E86C1`/`#5AA0E8`, hue `210±10`, sat >50)

Rendering order on `bgCtx` is `OB → Rough → Fairway → Green → Water`. Zone fills are dominant.

- **Trees** (circular obstacles, `r∈[18,36]`): drawn on **top canvas** above zones, trunk `#6B3A2A`, canopy `#1E7A34`, with shadow.
- **Hole**: filled `#111`, outer rim `2px #333`, inner shadow; flag/marker optional offset.

## 3. Background Images

- Asset `img/gfg-splash.png` preloaded `new Image()` at module load; relative path only.
- **Level mode** (`mainMenuVisible===false`): draw zoned terrain via `drawTerrainZones` covering `0,0,LOGICAL_W,LOGICAL_H` (see `07-level-generation.md`).
- **Main-menu mode** (`mainMenuVisible===true`): show splash aspect-covered (`scale=Math.max(W/imgW,H/imgH)`, centered `drawImage`); no terrain visible. No dimming backdrop in this mode (see `08-rewards-and-progression.md` entry vs pause distinction). Splash/terrain switch is via `drawBackground(mode)` on mode toggle and resize.
- Fallback solid fill (`#3a9d23` or `#2E2E2E`) is shown only while image is decoding; `#loading-screen` covers white flash (see `02-canvas-system.md`).

## 4. HUD & In-Canvas UI

This section defines **rendering** only; state is canonical in `05-input-and-states.md` and `06-wind-system.md`. Do not re-define counters here.

- **HUD** `drawHUD(ctx, currentHoleIndex, totalHoles, holeAttempts, totalAttempts, maxAttempts, freeShotSupply)` every `render()`: renders `Hole: N/M` left `(12,22)`, `Attempts Left: X (+Y)` centered (`(+Y)` only when `Y>0`, see `05-input-and-states.md` §4 for `X`/`Y` derivation), `Total: Y` right `(W-12,22)`, `14px system-ui` white `stroke rgba(0,0,0,0.7) 3px`, strip `rgba(0,0,0,0.25) 28px` behind. Visible in `AIMING`/`CHARGING`/`FLYING`, dimmed behind `WIN`/`GAME_OVER`.
- **Victory overlay** (DOM, `gameState==='WIN'` final hole only): dim `rgba(0,0,0,0.55)`, `★★★` `72px #FFD700`, title `Course Completed!` `700 22px` white `stroke 5px`, text `Total: Y`, green `Continue` `#continue-button-win` `#145a32` with `Press R to continue` → `clearProgress()` → entry menu (see `05-input-and-states.md` §5 and `08-rewards-and-progression.md` §1).
- **Game Over overlay** (DOM, `gameState==='GAME_OVER'`): same dim as Victory, title `Game Over` `700 22px` white `stroke 5px` over green `Continue` `#gameover-return-button` `#145a32` with `Press R to continue` → `clearProgress()` (see `05-input-and-states.md` §5).
- **Force bar** `drawForceBar(ctx, ball, charge)` only when `CHARGING` (Space held): centered at `ball.pos+(0,28)`, `60×8`, border `1px #222`, bg `rgba(0,0,0,0.35)`, fill `charge*100%` lerp green→yellow→red, label `78%` white with shadow.
- **Aim visuals** (see `05-input-and-states.md` §2): orbit `28-32px` dashed `rgba(0,0,0,0.2)`, aim line `30px` (+ `charge*50`), indicator dot.
- **Modifier circles & preview** (spatial): see `06-wind-system.md` §4 & §7; Free Shot gold glow rendered in Three.js layer (see `06-wind-system.md` §2), not on `game` canvas.
- **Treasure** (`src/render.js:drawTreasure`): one per hole `level.treasure` gold chest `r 10-14` (see `07-level-generation.md` §4 for placement; rendering here). Rendered on `fgCtx` above trees/hole, below ball/aim, chest `#D4AF37`/`#FFD700` `r 12±2` with shadow `rgba(0,0,0,0.18)`; hidden when `isCollected===true`.
- **Hole & Attempts Banners** (`src/render.js:drawCenterBanner`, see `05-input-and-states.md` §6): transient dim `rgba(0,0,0,0.55)` `700 22px white stroke 5px` `1000ms`; `Hole N` before reward, `Last Attempt` before last counted attempt when `freeShot===0`. Mutually exclusive with `drawRewardMenu`.
- **No DOM HUD** (`#hole-counter`/`#force-bar-container` removed); no `<h1>`/`#instructions`; overlays bounded to container.

## Acceptance Criteria

- [ ] Bottom canvas zones use palette within ±8 per channel; order `OB→Rough→Fairway→Green→Water`; trees on top canvas; hole black circle.
- [ ] Level mode draws zoned terrain; main-menu mode shows splash aspect-covered and per `08-rewards-and-progression.md` backdrop rules.
- [ ] Draw order is `bg (zones/splash) → game (obstacles→hole→treasure→ball→aim→modifiers→forceBar→HUD→reward) → wind (particles/trails) → HTML overlays` (treasure above trees, below ball).
- [ ] HUD and force bar are inside canvas, visible without scroll, with correct stroke/shadow.
- [ ] Treasure: one per hole near a tree (`level.treasure`, radius `12±2`, gold `#D4AF37`/`#FFD700`), visible on `fgCtx` when `!isCollected`, hidden after hit, never at `0,0` or overlapping tree, on `fairway`/`rough`, and `drawTreasure` called each frame.

## File Paths

- `src/render.js:1` (`drawBackground`, `drawDynamic`, `drawHUD`, `drawForceBar`, `drawObstacles`, `drawHole`, `drawTreasure`)
- `src/terrain.js:1` (exports `terrainZoneAt` used by `drawBackground` zone fill)
- `index.html:30` (no extra DOM for HUD), `style.css:1` (container/overlay bounds)
