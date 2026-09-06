# 07 — Modifiers (Hotbar, Placement, Types, Supply & Consumption)

- **ID:** 07-modifiers
- **Supersedes:** REQ-015, REQ-016, REQ-017, REQ-018, REQ-020, REQ-035, REQ-023 (effective-radius aspect)
- **Type:** Functional + UI
- **References:** `06-wind-system.md` (`getWindAt`), `05-input-and-states.md` (states), `09-rewards-and-progression.md` (supply acquisition), `03-rendering.md` (circle styles)

## 1. Model & Constants

- `modifiers: Array<{id, type:'amplify'|'nullify'|'flip', x, y, radius:number, isDragging?:boolean}>` in `src/main.js` (or exported via `src/vectorField.js:setModifiers`). Only spatial modifiers (`amplify`/`nullify`/`flip`) are stored in this array; `freeShot` is **not** a spatial modifier and is never pushed to `modifiers`.
- `supply = { amplify:number, nullify:number, flip:number, freeShot:number }` in `src/main.js` (or `src/supply.js`). `freeShot` is a consumable attempt modifier, not a field circle.
- `isFreeShotActive:boolean` (or `isFreeShotArmed` / `freeShotActive`) in `src/main.js` — whether the next launch will be a free shot. Toggling this does **not** create a circle and does not call `syncModifiersToField` for a spatial entry.
- Base constant `BASE_MODIFIER_RADIUS` normative: latest spec uses `54` (reduced 40% from `90`; see `09-rewards-and-progression.md` for upgrade math). Earlier `90` is legacy and **superseded by `54`** per clarification (later requirement wins). Define once: `BASE_MODIFIER_RADIUS=54` or `90`→`54` at top of `src/main.js`/`src/vectorField.js`; document chosen value. Effective radius is `getEffectiveModifierRadius()` (see §4). Applies only to spatial types (`amplify`/`nullify`/`flip`); `freeShot` has no radius.
- `MODIFIER_RADIUS` is not mutated directly; effective radius is derived via multiplier.

## 2. Hotbar UI — Modifier Bar `src/main.js` / `index.html` / `style.css`

- Horizontal transparent overlay `div#hotbar` (Modifier Bar) centered `position:absolute; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.35-0.45); backdrop-filter:blur(4-6px); border-radius:10px; padding:6px 10px; display:flex; gap:10px; z-index:5`.
- Slots use same style as pause-menu `reward-stats` (`background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); border-radius:6px; font:600 11px system-ui,white with -webkit-text-stroke 2px rgba(0,0,0,0.65); paint-order:stroke fill; min-width:80px; padding:6px 10px; display:flex; align-items:center; gap:6px; white-space:nowrap`).
  - **Content — icon + name + supply on one line only**: each `.hotbar-slot` shall contain exactly three visible text elements on a single line (`white-space:nowrap; flex-wrap:nowrap; overflow:hidden; text-overflow:ellipsis` optional) — the modifier icon, the modifier name, and the current supply count. No hotkey badge, no `active/supply` fraction, no second line, no wrapping. Format is `"<icon> {Name} {supply}"` (supply is `supply[type]` integer, not `active/supply`). Examples:
    - Slot 1: icon `»` `#e67e22` orange, name `Amplify`, supply `1` → text `» Amplify 1`
    - Slot 2: icon `∅` `#3498db`, name `Nullify`, supply `1` → text `∅ Nullify 1`
    - Slot 3: icon `⇄` `#9b59b6`, name `Flip`, supply `1` → text `⇄ Flip 1`
    - Slot 4: icon `★` `#f1c40f` gold (alternatives `◉`/`✦` gold acceptable, hue `45±10`, sat >80, luminance 60-80), name `Free Shot`, supply `0` → text `★ Free Shot 0`
  - Selected: type-tinted `rgba(...,0.28)` `border rgba(...,0.9)` `scale 1.04`; disabled (see supply): `opacity 0.45; filter:grayscale(0.6); cursor:not-allowed`.
  - **Free Shot active state**: when `isFreeShotActive===true`, Slot 4 shows persistent active styling distinct from selection — `background:rgba(241,196,15,0.28); border:1px solid rgba(241,196,15,0.95); box-shadow:0 0 10px rgba(241,196,15,0.6)` and `scale 1.04`; text remains `★ Free Shot {supply}` on one line. Deactivating removes this styling.
- Selection via hotbar click **or** keys `1`/`2`/`3`/`4` even when collapsed; `Escape` / re-pressing same key / re-clicking selected deselects to `null`. For `1-3` this selects spatial type for placement; for `4` this **toggles Free Shot active** (see §3 & §5) — not a placement selection. `1-3` and `4` are mutually exclusive in selection: activating Free Shot clears `selectedModifier` spatial selection and vice versa.
- **Collapsible**: default `expanded` in `AIMING`/`CHARGING`; toggle handle `#hotbar-toggle` `32×24` or `36×18` chevron `▾/▴` (and optional `M`/`B` key) collapses with `150-200ms` transition. Collapsed pill `~28px` tall shows only handle; slots `display:none` but selection/active persists and hotkeys/preview/placement/toggle still work. Expanding restores slots. Collapse is ephemeral (reset to expanded on `loadLevel`/`advanceHole`/new game). Hidden entirely during `FLYING`/`WIN`/`reward`/`pause`/`main-menu`.

## 3. Placement Interaction `src/input.js` + `src/main.js`

- **Spatial modifiers (`amplify`/`nullify`/`flip`)**: Preview circle dashed `50%` of effective radius, color per type, following mouse via `getCanvasMousePos` when a spatial modifier is selected and state is `AIMING`/`CHARGING`; no preview when `null` or supply insufficient (or desaturated red).
  - Left-click places at cursor's logical coords if `canPlace(selectedModifier)` (see §6) and not overlapping `FLYING`; after placement `selectedModifier=null` (must re-select for next). Placing does not launch.
  - **Dragging**: `mousedown` on existing circle (`dist<radius`) enters dragging, `mousemove` updates `x,y`, `mouseup` finalizes; works only before shooting; dragged opacity `0.6`, `grabbing` cursor; does not delete or consume supply.
  - Right-click or `Delete`/`Backspace` on a circle removes it (frees supply slot, see §6); dragging does not delete. `R` ball reset does NOT clear modifiers; advancing hole or game reset does (see §7).
- **Free Shot (`4`) — non-spatial toggle**: Clicking Slot 4 or pressing `4` while in `AIMING`/`CHARGING` and `supply.freeShot > 0` toggles `isFreeShotActive = !isFreeShotActive`. No preview circle, no drag, no placement on canvas. If `supply.freeShot === 0`, toggle is rejected (slot disabled, no active state, optional tooltip `No supply remaining`). `isFreeShotActive` can be toggled any number of times before launch; it persists through collapses and aim changes but is cleared on launch consumption (see §5), on `resetBall`? No — `resetBall` does **not** clear `isFreeShotActive` (so a death before shooting keeps the armed free shot), but advancing hole, `endRun`, `clearProgress`, new game, and `GAME_OVER` clear it. Activation is ignored when `FLYING`/`WIN`/`rewardMenuVisible`/`mainMenuVisible`/`GAME_OVER`.
- Visual feedback for Free Shot active is **not** a circle — it is a golden glowing effect over the ball in the Three.js layer (see §5).

## 4. Effective Area (Area Upgrades)

- State `areaUpgradeCount >=0` (`0` on new game) defined in `09-rewards-and-progression.md` but **applied here**. Multiplier `areaMultiplier = 1 + 0.2*areaUpgradeCount` (**additive**, not `1.2^n`; two gives `1.4` → e.g. `54*1.4=75.6`, not `77.76`).
- `getEffectiveModifierRadius() = BASE_MODIFIER_RADIUS * areaMultiplier` (e.g. `54,64.8,75.6,86.4...`; or `90,108,126,144` if base were 90 — use actual base). Applies only to spatial modifiers.
- All hit tests (`getWindAt`, dragging, preview, removal) shall use effective radius. Existing modifiers grow retroactively on `Area Up` acquisition (either update each `m.radius` or compute lazily via getter).
- `freeShot` has no radius and is unaffected by `areaMultiplier`.

## 5. Per-Type Effects

### 5.1 Spatial Wind Effects (applied in `getWindAt` after base field + bilinear, in placement order)

- **Amplify (`factor 5`)**: `if type==='amplify' && inside → wind*=5`. Stacking multiplicative (two →25×, capped at `25×`).
- **Nullify (`factor 0`)**: `getWindAt` returns `{0,0}` for visualization (faint); **physics inside nullify (see `04-physics-and-collision.md`) skips both wind and friction** so ball keeps entry velocity (`isInsideNullify` branch). Stacking: nullify dominates (over amplify/flip, result `{0,0}` and preserved velocity). Minimum-force rule is intentionally violated inside nullify for physics but visualization shows zero.
- **Flip (`factor -5`)**: `wind*=-5` per circle (flips direction and increases strength 5×, same as one amplifier). Two flips → `25×`; `amplify(5)+flip(-5)` → `-25×` (capped at `25×` magnitude).
- Circular area: `dist < effectiveRadius` where `effectiveRadius = getEffectiveModifierRadius()`. Performance `O(n)` where `n`=modifiers length.

Visualization on `game` canvas (below wind overlay):
- `amplify` solid orange `rgba(230,126,34,0.25)` ring `>>`, `nullify` blue dashed `rgba(52,152,219,0.25)` `∅`, `flip` purple `rgba(155,89,182,0.25)` `↻`. Dragged at 60% opacity.

### 5.2 Free Shot — Consumable Attempt Modifier (non-spatial)

- **Effect**: When `isFreeShotActive === true` and a launch is performed (`handleLaunch` / `launchBall`), that **attempt does not decrease `Attempts Left`**: `holeAttempts`/`totalAttempts` are **not** incremented for that launch, and `attemptsLeft = maxAttempts - holeAttempts` is unchanged. The ball still launches with normal physics (`power`/`angle` unchanged). `isFreeShotActive` is **not** a wind effect and does not enter `getWindAt`.
- **Consumption**: After a launch that was free (i.e. `isFreeShotActive` was true at launch time and `supply.freeShot > 0`), do `supply.freeShot = max(0, supply.freeShot - 1); isFreeShotActive = false; updateHotbarUI(); saveProgress();`. Consumed exactly once per free launch. If `isFreeShotActive` was false, normal cost applies and `supply.freeShot` is untouched.
- **Visual feedback — golden glowing effect over ball in Three.js layer + subtle edge glow**: **Ball glow** is shown **only while `isFreeShotActive===true` (armed before launch)** and is **removed immediately after launch** (even though `freeShotFlightActive` remains true, ball glow is hidden during flight); **Edge glow** is shown **while `isFreeShotActive===true` OR while `freeShotFlightActive===true` (through `FLYING` until ball stops, resets, or wins)**. The Three.js overlay (`#wind-canvas`, `src/windThree.js`) renders a **golden glowing effect centered on `ball.pos`** above the ball when armed. Implementation may be a `THREE.Sprite`/`Mesh`/`Point` with `additive` blending, `color 0xf1c40f` / `0xFFD700`, `opacity 0.55-0.85`, `radius 14-22px` logical (scaled by DPR), soft falloff, pulsation `scale 1.0 + 0.15*sin(time*3)` and `opacity` flicker. Must be in `windThree.js` on `#wind-canvas` (z-index 3-4) so it appears over ball but below HTML overlays; must use `pointer-events:none`, `depthWrite:false`, `transparent:true`. **Edge glow** (`div#free-shot-edge-glow` `position:absolute; inset:0; border-radius:8px; border:2px solid rgba(241,196,15,0.38); box-shadow: inset 0 0 36px rgba(241,196,15,0.22), inset 0 0 70px rgba(241,196,15,0.12), 0 0 18px rgba(241,196,15,0.28); opacity 1 when edge active else 0, transition 220-260ms, z-index:4, pointer-events:none`) **persists through flight** while ball glow is hidden. Canvas 2D fallback (if Three not ready) may draw gold ring `rgba(241,196,15,0.45)` `stroke 2px` around ball when armed, but Three.js gold glow (armed only) + edge glow (armed or flight) is normative. When neither armed nor in free flight, no gold glow is shown.
- **Stacking/limits**: Only one free shot can be armed at a time (`isFreeShotActive` boolean, not counted). Multiple `freeShot` supply just allows multiple future free launches sequentially, each requiring re-arming via `4`. `freeShot` cannot be placed as a circle and does not participate in `canPlace`/drag/remove/area upgrades.

## 6. Supply (Inventory Limits)

- `supply = { amplify:number, nullify:number, flip:number, freeShot:number }` in `src/main.js` (or `src/supply.js`).
- Initialized to `{1,1,1,0}` on new game (`initLevel(0)`, `resetGameAfterWin`, `startNewGameFromMain`, `endRun`, `clearProgress`, page reload with no save). **New games start with `0` `freeShot`**; spatial types start `1`. Persists through death/`R` and through hole advances **minus win-consumption** for spatial types (see §7) and **minus launch-consumption** for `freeShot` (see §5.2).
- **Placement guard (spatial)**: `canPlace(type) => type!=='freeShot' && modifiers.filter(m=>m.type===type).length < supply[type]` (only for `amplify`/`nullify`/`flip`). Place allowed iff true; otherwise rejected (no `modifiers` push, no `syncModifiersToField`). UI shows disabled slot / desaturated preview, tooltip `No supply remaining`.
- **Activation guard (freeShot)**: `canActivateFreeShot() => supply.freeShot > 0`. Toggling `isFreeShotActive` allowed only if true; otherwise rejected (no active state). `updateHotbarUI()` shows for each slot the current supply `supply[type]` on one line (`{icon} {Name} {supply}`) and disabled styling for all 4 slots; collapsed hotbar hides slots but still enforces guards.
- Dragging does not check/consume supply. Right-click removal of a spatial circle frees one spatial slot (does not affect `freeShot`). `updateHotbarUI()` must be called after any `supply` or `isFreeShotActive` change and after resize.
- `addToSupply(type,n)` increments counter (used by rewards, see `09-rewards-and-progression.md`). For `freeShot`, `n` is `5` via `Free Shot Supply +5` reward.

## 7. Consumption on Win (REQ-035)

- When a hole is beaten (`WIN` → `handleNextHole`/`advanceHole` before clearing), iterate **snapshot** of `modifiers` (spatial only) and for each `m`: `supply[m.type]=Math.max(0, supply[m.type]-1)` (only `amplify`/`nullify`/`flip`). Clamped, exactly once per win (guard against double `handleNextHole`), not on death/manual removal/drag/`End Run`.
- `freeShot` is **not** consumed on win; it is only consumed on free launch per §5.2. If `isFreeShotActive` was armed but win occurs before launch, it remains armed into next hole until used or cleared.
- Then `modifiers=[]; syncModifiersToField(); updateHotbarUI(); saveProgress();` For non-final holes next hole's hotbar reflects reduced spatial supply (type that hit `0` becomes disabled until reward replenishes). For final hole `Game Complete` → `clearProgress()` resets to `{1,1,1,0}` (consumption moot before reset).

## Acceptance Criteria

- [ ] Hotbar (Modifier Bar) is transparent overlay with pause-menu-style slots, collapsible to pill, toggle persists selection/active, hotkeys `1`/`2`/`3`/`4` work while collapsed, hidden during `FLYING`. Four slots visible when expanded: Amplify, Nullify, Flip, **Free Shot (gold `★`, `4`)** — each slot shows **only icon + name + current supply on one line** (`white-space:nowrap` single line, e.g. `» Amplify 1`, `∅ Nullify 1`, `⇄ Flip 1`, `★ Free Shot 0`), no hotkey badge, no `active/supply` fraction, no wrapping.
- [ ] Preview shown for `1-3` when selected and supply allows; left-click places and clears selection; drag moves; right-click/Delete removes and frees slot. `4` shows **no preview**; click/`4` toggles `isFreeShotActive` when `supply.freeShot >0`, otherwise disabled; active state has gold border/glow distinct from spatial selection.
- [ ] `getWindAt` inside amplify `5×`, inside nullify `{0,0}` (physics preserves velocity), inside flip `*-5` (flip + 5×); stacking `flip+flip→25×`, `amplify+flip→-25×` (capped 25×); effective radius used for spatial; `freeShot` does **not** affect `getWindAt`.
- [ ] Supply `{1,1,1,0}` on new game, one of each spatial placeable, zero freeShot; second amplify blocked until removal or reward; `freeShot` cannot be placed; `updateHotbarUI` disabled styling correct for all 4 and each slot text matches `^{icon} {Name} {supply}$` on one line.
- [ ] Free Shot active: golden glowing effect over ball visible in Three.js layer (`#wind-canvas`) **only while `isFreeShotActive===true` (armed, before launch)**, removed immediately after launch; **edge glow** (`#free-shot-edge-glow` border+shadow) visible **while `isFreeShotActive===true` OR `freeShotFlightActive` (through flight)**; inactive and not in free flight shows no glow. Launch with active does **not** increment `holeAttempts`/`totalAttempts` nor decrement `attemptsLeft`; after launch `supply.freeShot` decreases by exactly `1`, armed clears, ball glow hidden, edge glow persists through flight until ball stops/resets/wins; normal launches still cost `1` attempt.
- [ ] With one `Amplify` placed at win → `supply.amplify 1→0` and `modifiers` cleared; removed-before-win not consumed; death not consumed; `freeShot` not consumed on win; reload `Continue` preserves `freeShot` supply and `isFreeShotActive` (or resets active but preserves count).

## File Paths

- `src/main.js:1` (`supply` with `freeShot`, `modifiers`, `selectedModifier`, `isFreeShotActive`/`freeShotActive`, `isHotbarCollapsed`, `canPlace`, `canActivateFreeShot`, `placeModifier`, `removeModifierAt`, `handleNextHole` consumption (spatial only), `handleLaunch` free-shot branching, `getEffectiveModifierRadius`, hotbar toggle, gold glow state)
- `src/vectorField.js:1` (`MODIFIER_RADIUS` base, `getWindAt` modifier loop for spatial only, `setModifiers`/`syncModifiersToField`)
- `src/input.js:1` (keys `1/2/3/4`, `Escape`, mouse placement/drag, collapse `M`/`B`, `isFreeShotActive` toggle)
- `src/render.js:1` (`drawModifiers`, `drawModifierPreview` for spatial only)
- `src/windThree.js:1` (golden glowing effect over ball when `isFreeShotActive` or `freeShotFlightActive`, edge glow `#free-shot-edge-glow`, `setFreeShotActive`/`updateFreeShotGlow`/`isFreeShotFlightActive`)
- `index.html:30` (`#hotbar` + `#hotbar-toggle` with 4 slots), `style.css:1` (transparent, `backdrop-filter`, collapsed `.collapsed`, gold active styling)
