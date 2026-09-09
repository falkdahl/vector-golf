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

## 4. Hotbar UI — Modifier Bar

- Horizontal overlay `div#hotbar` centered `position:absolute; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.35-0.45); backdrop-filter:blur(4-6px); border-radius:10px; padding:6px 10px; display:flex; gap:10px; z-index:5`.
- Slots style `background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); border-radius:6px; font:600 11px white with stroke 2px; min-width:80px; padding:6px 10px; white-space:nowrap`.
  - Content one line only `"<icon> {Name} {supply}"` (integer `supply[type]`): `» Amplify 1` orange `#e67e22`, `∅ Nullify 1` blue `#3498db`, `⇄ Flip 1` purple `#9b59b6`, `↻ Rotate 1` red `#e74c3c` (distinct hue `4±15` sat >80). No hotkey badge, no `active/supply` fraction.
  - Selected: type-tinted `rgba(...,0.28)` `border rgba(...,0.9)` `scale 1.04`; disabled: `opacity 0.45; filter:grayscale(0.6)`.
  - **No Free Shot slot** — shown in HUD as `Attempts Left: X (+Y)`.
- Selection via hotbar click or keys `1`/`2`/`3`/`4` even when collapsed; `Escape` / re-pressing same key / re-clicking deselects to `null`. `1`→`amplify`, `2`→`nullify`, `3`→`flip`, `4`→`rotate`. No Free Shot toggle.
- **Collapsible:** default expanded in `AIMING`/`CHARGING`; toggle `#hotbar-toggle` chevron `▾/▴` collapses `150-200ms` to `~28px` pill; slots `display:none` but selection persists; ephemeral (reset on `loadLevel`/new game). Hidden during `FLYING`/`WIN`/`reward`/`pause`/`main-menu`.

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

- [ ] Hotbar 4 slots `Amplify`/`Nullify`/`Flip`/`Rotate` one line `icon Name supply`, collapsible, hotkeys `1-4` work while collapsed, hidden during `FLYING`. Free Shot not in hotbar; HUD `Attempts Left: X (+Y)` only.
- [ ] Preview for `1-4` when selected and supply allows; left-click places and clears selection; drag moves; right-click/Delete removes and frees slot. `rotate` red `4`; Free Shot no hotkey/preview.
- [ ] `getWindAt` inside `amplify` `5×`, `nullify` `{0,0}` (physics preserves velocity), `flip` `*-5`, `rotate` `90° CCW 5×`; stacking deduped `flip+flip→5×`, `rotate→5× 90°`, `amplify+flip→-25×` etc.; effective radius used for all spatial; `freeShot` does not affect `getWindAt`.
- [ ] Supply `{1,1,1,1,0}` on new game, one of each spatial placeable, `freeShot` passive; second amplify blocked until removal/reward; HUD `Attempts Left` correct; hotbar slot `^{icon} {Name} {supply}$` one line, rotate icon red `#e74c3c`.
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
