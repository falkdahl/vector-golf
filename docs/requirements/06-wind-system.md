# 06 — Wind System & Modifiers (Field, Visualization, Hotbar, Supply)

- **ID:** 06-wind-system
- **Supersedes:** REQ-003, REQ-004, REQ-015, REQ-016, REQ-017, REQ-018, REQ-020, REQ-035, REQ-023 (radius aspect)
- **Type:** Functional / UI
- **References:** `02-canvas-system.md` (logical size, loop), `05-input-and-states.md` (states), `07-level-generation.md` (field budgets per tier), `03-rendering.md` (layer order)

## 1. Field Model `src/vectorField.js`

### 1.1 Grid & Sampling

- Regular grid over `LOGICAL_W×H` (default `cols=32, rows=18` for `1280×720`, cell ~40×40; alternatively `20×15` scaled to keep `cols/rows≈16/9`). Each cell `{x,y}`.
- Data structure `field[row][col]={x,y}`.
- `getWindAt(worldX,worldY)` exports bilinear interpolation of 4 nearest cells (clamped) in world units. Also exports `WIND_STRENGTH` (normative `180`), plus debug `getSourcePositions()` etc.

### 1.2 Generation — Random Superposition (no unary flow)

Signature:
```js
createField(cols, rows, strength, seed, width, height, nSources, nSinks, nDoublets, nVortexes)
```
Requires `seed` and four counts `>=0`; if a count is `0` that type omitted except mandatory constraints coerced, except hole-1 tutorial (`sources:1,sinks:1,doublets:0,vortexes:0`) may have `0,0,0,0` without coercion.

Defaults (counts omitted): `seed=42, nSources=1, nSinks=1, nDoublets=1, nVortexes=1`. If `unaryFlow` arg passed, ignore it.

**Mandatory minima (coerced if violated, except hole-1):**
- At least one vortex **or** doublet strictly inside (`20≤ex≤width-20`, `20≤ey≤height-20`) for all levels except `hole-1`. If `0,0` for both with `nSources+sinks>0` on non-tutorial, implicitly create one vortex inside.
- At least one source **and** one sink slightly outside (`OUTSIDE∈[20,60]` for sources, `OUTSIDE_SINK∈[60,100]` for sinks; no placement exactly on edge `±1px`, none strictly inside).

**Seeded randomness:** deterministic `mulberry32(seed)` drives all positions/strengths/orientations.

**Placement:**
- Sources/sinks: random side `left x=-OUTSIDE / right x=width+OUTSIDE / top y=-OUTSIDE / bottom y=height+OUTSIDE`, other coordinate uniform along side, offset `20-60` for sources and `60-100` for sinks.
- Vortexes/doublets: uniformly inside `[20,width-20]×[20,height-20]`.

**Strengths (very fast wind):** Sources `sigma∈[1.2,2.2]`, sinks same negative, doublets `mu∈[1.2,2.2]` + `theta∈[0,2π)`, vortex `Gamma∈[1.4,2.6]` random sign. Tunables at top: `WIND_STRENGTH=180, SOFTENING_A=28, MIN_WIND_FORCE=80`.

**Element fields (`a≈28`, `eps=a²`):**
- Source/sink: `dx=x-sx, dy=y-sy, r2=dx²+dy²+eps, contrib = S*(dx,dy)/r2` (sink `S=-sigma`)
- Vortex: `contrib = Gamma*(-dy,dx)/r2`
- Doublet: rotate into frame with `theta`, `r2, r4=r2², local=mu*((dx'²-dy'²)/r4, 2*dx'*dy'/r4)`, rotate back.

**Superposition:** `Vraw = Σsources+Σsinks+Σdoublets+Σvortexes` per cell centre. No unary flow.

### 1.3 Per-Difficulty Field Placement — Single Source of Truth (normative for `07-level-generation.md` §5)

| Tier | Shape | `treesOnFairway` | `waterOnFairway` | Field `sources,sinks,doublets,vortexes` |
|------|-------|------------------|------------------|------------------------------------------|
| **Easy** | `I` (straight `<15` off) | `1-2` | `0` | `1,1,1,0` (total 3) — source outside left edge `x=-OUTSIDE` (`20-60`, left third) and sink slightly above/below middle third `x∈[W/3,2*W/3]`, `y=-OUTSIDE_SINK` or `H+OUTSIDE_SINK` (`60-100`) — tail wind, one doublet in fairway tree `≤2px` |
| **Medium** | `L/V/U` | `2-3` | `1-2` | `2,1,2,1` (total 6) — sources: one near tee outside `20-60` + one extra randomly outside `20-60` (`dist>180` from existing source and sink) + sink 1 middle-third `60-100` |
| **Hard** | `S/Z` | `3-5` | `1-2` | `1,1,3,1` (total 6) — source 1 near tee outside `20-60` + sink 1 middle-third `60-100` |

- **Doublet-in-tree rule:** if `treesOnFairway≥1` then ≥1 doublet `hypot(doublet-tree)≤2`. Remaining doublets/vortexes interior `20` from edge and not `OB`.
- **Source `20-60` / sink `60-100`:** sources `OUTSIDE=20-60` (`30+rand*20`), sinks `OUTSIDE_SINK=60-100` (`60+rand*41`). Easy source always left edge; every level has exactly one sink on middle third top/bottom `x∈[426,853]` at `1280` and `y∈[-100,-60]` or `[780,820]`.
- Wind strength constant across tiers (see §1.4).

`07-level-generation.md` shall reference this table instead of re-defining it.

### 1.4 Scaling & Minimum Force (constant, not scaling with difficulty)

- `WIND_STRENGTH=180` scales sampled vector: `vel += wind * WIND_STRENGTH * dt`. Wind dominates friction (`FRICTION=0.35`). `field.strength` passed to `createField` is fixed constant (e.g. `90`) independent of `tier`/`levelNum`.
- Minimum effective force `|wind|*WIND_STRENGTH ≥ 60` (`0.1*MAX_POWER`) for every cell/sample. Generation scales magnitudes so `magnitude ≥0.33` at `180`. Field has varying strength (max ≥1.1× min).
- High acceleration: ball slowed to `<20` re-accelerates to `>60-80` within `0.3-0.5s`; never stationary >0.4s.

### 1.5 Determinism

- Bit-identical for same `seed+counts+cols+rows+width+height`. Different seed/counts yield `>15%` vector diff. No third-party noise library; inline PRNG.

## 2. Wind Visualization — Three.js Particles with Ghost Trails

- **Overlay** `#wind-canvas` transparent `THREE.WebGLRenderer` with `alpha:true, antialias:true, premultipliedAlpha:false, setClearColor(0x000000,0)`, `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3` below HTML overlays.
- **Particles only:** `PARTICLE_COUNT=60-80` (default `70`), spawned uniformly `[0,W]×[0,H]`, advected by `getWindAt(pos)` including live modifiers, `particleSpeed ~40-60`. OOB or life expiration triggers uniform-random respawn (no wrap, no clumping).
  - Lifetime `maxLife=3.5-5.0` (default `4.5`), `alpha=life/maxLife`.
  - **Ghost trails:** fade quad `renderer.autoClear=false` + full-screen `MeshBasicMaterial(0x000000, opacity 0.06-0.12)` or trail geometry `Line` with last `6-10` positions per-vertex `head 0.9→tail 0.0`, ribbons `4-8px` `rgba(255,255,255,0.55-0.85)` additive; head `6-9px` white.
  - **Modifier-aware:** inside `amplify` ~5× faster/longer, inside `nullify` stall, inside `flip` reverse 5× faster, inside `rotate` 90° CCW 5× faster (stacked `rotate`/`flip` deduped to one 5×, further amplified by `amplify`).
- **Free Shot glow + edge glow** (see §5.2): ball glow only while `isFreeShotActive===true` (armed before launch) and removed immediately after launch; edge glow while `isFreeShotActive` OR `freeShotFlightActive`. Three.js golden glow `0xf1c40f`/`0xFFD700` `14-22px` `AdditiveBlending`, pulsation `1.0+0.15*sin(time*3)`, plus DOM `div#free-shot-edge-glow` border+shadow when edge active. Exports `setFreeShotActive`/`setFreeShotBallActive`/`setFreeShotEdgeActive`/`updateFreeShotGlow`.
- **Feeding:** `getWindAt` is source of truth; `updateWind(dt, getWindAt)` before `render()`; `syncModifiersToField()` next-frame.
- **Performance & toggle:** ≥55fps at `1280×720` with 70 particles. `H` toggles particles+trails visibility (no physics impact); glow should remain visible when wind hidden. Resize updates `setPixelRatio`/`uResolution`/camera.

## 3. Modifiers — Model & Constants

- `modifiers: Array<{id, type:'amplify'|'nullify'|'flip'|'rotate', x, y, radius:number}>` in `src/main.js`. Spatial only; `freeShot` never in `modifiers`.
- `supply = { amplify, nullify, flip, rotate, freeShot }`. `rotate` is spatial 90° CCW, `freeShot` is passive stock.
- `isFreeShotActive:boolean` — only auto-armed when `getAttemptsLeft()<=1 && supply.freeShot>0` at launch init; no manual hotkey.
- `BASE_MODIFIER_RADIUS=54` (reduced 40% from legacy `90`). `MODIFIER_RADIUS` not mutated; effective radius via `getEffectiveModifierRadius()` (see §4). Applies to spatial types; `freeShot` has no radius.

## 4. Hotbar UI — Golfbag Modifier Bar (Top-Left Bag + Grid)

- **Golfbag + Hotbar — Bottom center (grouped):** wrapper `#bottom-bar` (`position:absolute; bottom:12px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:6px; z-index:6`) centered horizontally at bottom of canvas with **little gap to bottom** `bottom:12px` `±4px`, containing `#golfbag-container` and `div#hotbar` side-by-side **middle-aligned** via `align-items:center` and **almost touching** (`gap 2-6px` between bag and hotbar’s black background). This replaces the previous top-left positioning; bag no longer at `top:42 left:12` but inside the centered bottom wrapper.
- **Golfbag:** inside `#bottom-bar` child `#golfbag-container` (`display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; width:52px; height:70px;`) containing `img#golfbag-icon` `src="./img/golfbag.png"` (`alt="golfbag"`, relative path). Bag height `68-72px` (`±4px`, `+15-20%` vs original `58px`), `width:auto; max-height:70px; object-fit:contain`. Hover grows `transform:scale(1.06-1.10)` `transition:transform 150ms ease, filter 150ms ease` and drops shadow onto game canvas (`filter:drop-shadow(0 6px 8px rgba(0,0,0,0.45))`). `cursor:pointer`, `tabindex=0`/`role=button`. **No background behind the bag itself** — bag rendered directly over terrain, only `drop-shadow`; wrapper has `background:transparent`. In collapsed mode the bag remains with no background.
- **Hotbar grid — Black transparent background spanning only the squares:** inside `#bottom-bar` sibling `div#hotbar` (`display:flex; align-items:center; gap:6px; z-index:5`) with **black transparent** `background:rgba(0,0,0,0.35)` (or `0.30-0.45`, `backdrop-filter:blur(4px)` optional) **that only spans the squares** (i.e. the `rgba` is on `#hotbar` itself, not on wrapper or bag). `border-radius:10px; padding:6px; border:1px solid rgba(255,255,255,0.12); box-shadow:0 2px 10px rgba(0,0,0,0.35);` The tight gap and middle alignment inside the bottom-centered wrapper make bag+hotbar read as a single grouped control. No sand-brown. Bag+hotbar are **always visible during gameplay including `FLYING` (shot in flight)** — they do not disappear when ball is launched; they remain visible through the entire hole until `WIN`/`GAME_OVER`/`pause`/`main-menu`. During reward selection both bag and hotbar remain visible (see bug fix below).
- **Grid:** inside `#hotbar` child `div#hotbar-grid` `display:grid; grid-template-columns:repeat(4,1fr); gap:6px;` containing four squares `div.hotbar-slot[data-type="amplify|nullify|flip|rotate"]` each **reduced by 40% vs previous `58px`** → `width/height 34-36px` (`58*0.6≈35px`, `±2px` tolerance, `aspect-ratio:1/1`), `border-radius:6px; border:1.5px solid rgba(0,0,0,0.25); position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; cursor:pointer; user-select:none`.
  - Each square **slightly transparent background in the modifier's respective color:** `amplify` orange `rgba(230,126,34,0.82)`, `nullify` blue `rgba(52,152,219,0.82)`, `flip` purple `rgba(155,89,182,0.82)`, `rotate` red `rgba(231,76,60,0.82)` (solid equivalent plus `opacity 0.80-0.85` or `rgba alpha 0.82` `±0.05`, hue distinct). Icon centered `span.hotbar-icon` `font:700 14-16px` (scaled down with square) `color:white; -webkit-text-stroke:1.6px rgba(0,0,0,0.55);` icons `»`/`∅`/`⇄`/`↻`.
  - Supply badge: `span.hotbar-count` lower-right `position:absolute; right:3px; bottom:1px; font:700 11-12px; color:white; -webkit-text-stroke:1.6px rgba(0,0,0,0.65);` text `"xN"` (`x2` etc.) always `xN` even `x0`. Font size increased vs previous `9-10px` → `11-12px` for better legibility.
  - Selected: `border-color:rgba(255,255,255,0.95); box-shadow:0 0 0 1.5px rgba(255,255,255,0.45), 0 2px 6px rgba(0,0,0,0.30); transform:scale(1.05)`. Disabled: `opacity 0.45; filter:grayscale(0.35); cursor:not-allowed`.
  - **No Free Shot slot** — shown in HUD as `Attempts Left: X (+Y)`.
- Selection via grid click or keys `1`/`2`/`3`/`4` even when collapsed (grid hidden, golfbag still visible, keys still toggle selection). `Escape`/re-press deselects. `1`→`amplify`, `2`→`nullify`, `3`→`flip`, `4`→`rotate`.
- **Collapsible — golfbag toggle only (no close button):**
  - The **close button `button#hotbar-toggle` has been removed** (`document.getElementById('hotbar-toggle')===null`). There is no circular `×` on the hotbar.
  - Clicking the **golfbag** toggles collapsed: `isHotbarCollapsed = !isHotbarCollapsed`; `hotbar.classList.toggle("collapsed", isHotbarCollapsed)` → `150-200ms` transition; `#hotbar`/`#hotbar-grid` become `display:none` or `background:transparent` when collapsed — **no background just the bag** remains visible (`#golfbag-container` stays, `#hotbar` hidden or transparent). `isHotbarCollapsed` ephemeral, reset on `loadLevel`/new game. The bag itself keeps `background:transparent` at all times.
  - When **collapsed**, only the golfbag is visible centered at bottom (`#bottom-bar` still `bottom:12 left:50%` but `#hotbar` is `display:none`, so wrapper shrinks to bag width with **no background**). Clicking the bag **re-opens** (`classList.remove("collapsed")`, grid re-appears inside same bottom-centered wrapper, middle-aligned `align-items:center`, gap `2-6px` almost touching bag). Hover growth/shadow still indicates clickable. Keyboard `I`/`Tab` also toggles.
  - **Bag and hotbar always visible during gameplay, including `FLYING` and `reward` (bug fix):** `rewardMenuVisible===true` must **not** hide `#golfbag-container` nor `#hotbar`; **both remain visible** during reward selection (`#bottom-bar` at `bottom:12` centered, `z-index:6` above dim, below help) and `click`/`Enter`/`Space`/`I`/`Tab` still toggle collapsed state. This fixes the bug where bag was visible but hotbar hidden during reward — now both are visible. Only `pause`/`main-menu`/`holeBanner`/`attemptsBanner`/`WIN`/`GAME_OVER` hide both (`#bottom-bar` hidden). `AIMING`/`CHARGING`/`FLYING`/`rewardMenuVisible` all keep bag+hotbar visible (hotbar respects collapsed state). During `FLYING` hotbar is **not hidden** — it stays at bottom center alongside the bag, allowing modifiers to be seen mid-flight (flight remains non-interactive for placement, but visibility is retained).
  - **Keyboard toggle:** `KeyI`/`Tab` invert `isHotbarCollapsed` without `Ctrl/Alt/Meta` and not typing in `INPUT`/`TEXTAREA`; `Tab` `preventDefault()`. Works even while `rewardMenuVisible` is true (bag still toggles). `1-4` keys keep working while collapsed. Selection persists; `Escape` deselects.

## 5. Placement Interaction

- **Spatial:** Preview dashed `50%` effective radius, color per type, following mouse via `getCanvasMousePos` when selected and `AIMING`/`CHARGING`; left-click places if `canPlace(selectedModifier)` and not `FLYING`; after placement `selectedModifier=null`. Dragging `mousedown` on circle (`dist<radius`) + `mousemove` + `mouseup` updates `x,y`; dragged opacity `0.6`, `grabbing` cursor; does not consume supply. Right-click or `Delete`/`Backspace` removes (frees slot); `R` does NOT clear modifiers; advancing hole does (see §7).
- **Free Shot:** not placed, no hotkey, no preview, passive stock shown in HUD; auto-arm only (see §6.2).
- **Rotate (`4`):** preview red `rgba(231,76,60,0.25)` `↻`, same placement/drag/removal as other spatial.

## 6. Effective Area (Area Upgrades)

- State `areaUpgradeCount >=0` (`0` on new game) defined in `08-rewards-and-progression.md` but applied here. Multiplier `areaMultiplier = 1 + 0.2*areaUpgradeCount` (additive, not `1.2^n`; e.g. `54*1.4=75.6`).
- `getEffectiveModifierRadius() = BASE_MODIFIER_RADIUS * areaMultiplier`. Applies to spatial `amplify`/`nullify`/`flip`/`rotate`.
- All hit tests shall use effective radius. Existing modifiers grow retroactively on `Area Up`.
- `freeShot` unaffected.

## 7. Per-Type Effects

### 7.1 Spatial Wind Effects (applied in `getWindAt` after base field)

- **Amplify (`5×` per circle):** `if amplify && inside → wind*=5` multiplicative. Stacking `5×`, `25×`, `125×`.
- **Nullify (`0`):** `getWindAt` returns `{0,0}` for visualization; physics inside nullify skips wind and friction (preserves entry velocity). Dominates over others. Violates minimum-force rule intentionally.
- **Flip (`-5×` includes one amplify):** `wind = (-wind)*5`. Stacked flips/rotates deduped: any number of `flip`+`rotate` combined contribute exactly one `5×` regardless of count (e.g. `flip+flip→5×` not `25×`). Further amplified by explicit `amplify`: `amplify(5)+flip(-5)→-25×`.
- **Rotate (`90° CCW` + `5×`):** `wind = rotate90CCW(wind)*5` where `rotate90CCW(x,y)=(-y,x)`. Deduped with `flip`: any `rotate`+`flip` together give one `5×`; angle stacks `rotateCount*90° + flipCount*180°` modulo 360°, magnitude stays `5×` once. Explicit `amplify` further amplifies: `amplify+rotate→25× 90° CCW`, `2×amplify+rotate+flip→125× 270° CCW`. Nullify still dominates.
- **Normative formula:** `amplifyCount=|{m:inside∧amplify}|`, `flipCount=|{m:inside∧flip}|`, `rotateCount=|{m:inside∧rotate}|`, `hasRotFlip=(flipCount+rotateCount)>0`, `totalFactor=5**(amplifyCount+(hasRotFlip?1:0))`, `totalQuarterTurns=(rotateCount+2*flipCount)%4`, `wind=(base*totalFactor) rotated Q*90° CCW`. Nullify first. Circular area `dist<effectiveRadius`.

Visualization on `game` canvas: `amplify` orange `rgba(230,126,34,0.25)` `»` white, `nullify` blue dashed `∅` white, `flip` purple `⇄` white, `rotate` red `↻` red `#e74c3c`; dragged 60% opacity. Trails inside modifiers show `5×` speed (flip reversed, rotate 90° CCW), nullify stalls.

### 7.2 Free Shot — Passive Consumable (see `05-input-and-states.md` §4 for launch branching)

- **Effect:** When `isFreeShotActive===true` at launch, attempt does not decrease `Attempts Left`; `holeAttempts`/`totalAttempts` not incremented; ball launches normally; not a wind effect.
- **Consumption & Persistence:** After free launch `supply.freeShot--`; keep `isFreeShotActive` while `supply.freeShot>0` else `false`; persisting auto-armed consecutive frees; normal launches still cost 1. Auto-arm when `!isFreeShotActive && supply.freeShot>0 && getAttemptsLeft()<=1`.
- **Visual:** ball glow only while armed before launch, edge glow while armed OR `freeShotFlightActive` (through `FLYING` until stop/reset/win). Three.js golden glow `0xf1c40f` `14-22px` additive + edge `div#free-shot-edge-glow` border+shadow; canvas fallback gold ring if Three not ready. No glow when neither armed nor in free flight.
- **Limits:** only one armed at a time; multiple `freeShot` supply allows sequential frees; no hotkey, no circle, no `canPlace`/area upgrade.

## 8. Supply & Consumption

- `supply = { amplify, nullify, flip, rotate, freeShot }` in `src/main.js`. Initialized to `{1,1,1,1,0}` on new game. Persists through death/`R` and hole advances minus win-consumption (spatial) and minus launch-consumption (`freeShot`).
- **Placement guard (spatial):** `canPlace(type) => type!=='freeShot' && modifiers.filter(m=>type).length < supply[type]`. Place allowed iff true; otherwise rejected, disabled slot + desaturated preview. `freeShot` never uses `canPlace`. Dragging does not check/consume. Right-click removal frees slot.
- **No hotkey guard for freeShot:** `4` is `rotate`; `canActivateFreeShot()` only for auto-arm check.
- `addToSupply(type,n)` increments counter (used by rewards). For `freeShot`, `n=5` via `Free Shot Supply +5`; for `rotate`, `n=1`.

### Consumption on Win

- When hole beaten (`WIN` → `handleNextHole` before clearing), iterate snapshot of `modifiers` (spatial only) and `supply[m.type]=max(0,supply[m.type]-1)` per placed modifier, clamped, exactly once per win, not on death/removal/`End Run`.
- `freeShot` not consumed on win; only on free launch. If armed but win before launch, remains armed into next hole until used.
- Then `modifiers=[]; syncModifiersToField(); updateHotbarUI(); saveProgress();` For final hole `clearProgress()` resets to `{1,1,1,1,0}`.

## Acceptance Criteria

- [ ] Golfbag `img#golfbag-icon` `src="./img/golfbag.png"` is `68-72px` high inside `#bottom-bar` `position:absolute bottom:12px left:50% transform:translateX(-50%)` with no background; hotbar grid `#hotbar`/`#hotbar-grid` is `1×4` `repeat(4,1fr)` with black transparent `rgba(0,0,0,0.35)` background that only spans the squares inside same bottom-centered wrapper (`display:flex align-items:center gap 2-6px` almost touching bag, **middle of hotbar inline with middle of icon** via `align-items:center`), squares `34-36px` (`−40%`), **slightly transparent** modifier colors `amplify rgba(230,126,34,0.82) / nullify rgba(52,152,219,0.82) / flip rgba(155,89,182,0.82) / rotate rgba(231,76,60,0.82)` (`0.80-0.85`), centered white icons `14-16px`, **`xN` badge `11-12px`** lower-right; collapsed hides grid and leaves **no background just the bag** (no close button, `getElementById('hotbar-toggle')===null`); **both bag and hotbar remain visible during `AIMING`/`CHARGING`/`FLYING` and `rewardMenuVisible`** (bottom-center `bottom:12px` centered, gap `12px` to bottom edge); hidden only during `WIN`/`GAME_OVER`/`pause`/`main-menu`/`banners`; golfbag click/`I`/`Tab` toggle; `hover scale 1.06-1.10 + drop-shadow`; `1-4` work while collapsed.
- [ ] Preview for `1-4` when selected and supply allows; left-click places and clears selection; drag moves; right-click/Delete removes and frees slot. `rotate` red `4`; Free Shot no hotkey/preview.
- [ ] `getWindAt` inside `amplify` `5×`, `nullify` `{0,0}` (physics preserves velocity), `flip` `*-5`, `rotate` `90° CCW 5×`; stacking deduped `flip+flip→5×`, `rotate→5× 90°`, `amplify+flip→-25×` etc.; effective radius used for all spatial; `freeShot` does not affect `getWindAt`.
- [ ] Supply `{1,1,1,1,0}` on new game, one of each spatial placeable, `freeShot` passive; second amplify blocked until removal/reward; HUD `Attempts Left` correct; hotbar square `xN` lower-right (`x1`, `x2` …), rotate icon white on red `#e74c3c`.
- [ ] Free Shot: ball glow only while armed before launch, edge glow while armed OR free flight; free launch does not increment attempts but decrements `freeShot` once and persists while supply remains; auto-arm at `<=1` when `supply.freeShot>0`.
- [ ] With one `Amplify`/`Rotate` placed at win → `supply 1→0` and `modifiers` cleared; removed-before-win not consumed; `freeShot` not consumed on win.
- [ ] `createField` signature requires seed+four counts, coerced outside/inside placement verified for 100 seeds (sources `20-60` outside, sinks `60-100` middle-third top/bottom, vortexes/doublets `≥20` inside, ≥1 vortex|doublet except hole-1).
- [ ] `getWindAt` bilinear correct, min force `≥60` effective, varying strength max≥1.1×min; DOM three layers stacked wind transparent; particles `60-80` modifier-aware; deterministic.

## File Paths

- `src/vectorField.js:1` (`MODIFIER_RADIUS` base, `getWindAt`, `setModifiers`, `createField`, `WIND_STRENGTH`)
- `src/windThree.js:1` (`initWindOverlay`, `updateWind`, `renderWind`, `setWindVisible`, gold glow)
- `src/main.js:1` (`supply`, `modifiers`, `selectedModifier`, `canPlace`, `placeModifier`, `handleLaunch` free-shot, `getEffectiveModifierRadius`, hotbar toggle)
- `src/input.js:1` (keys `1`/`2`/`3`/`4` spatial)
- `src/render.js:1` (`drawModifiers`, `drawModifierPreview`, `drawHUD`)
- `index.html:8` (import map, `#wind-canvas`, `#hotbar`), `style.css:1`
