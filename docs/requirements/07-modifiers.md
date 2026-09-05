# 07 — Modifiers (Hotbar, Placement, Types, Supply & Consumption)

- **ID:** 07-modifiers
- **Supersedes:** REQ-015, REQ-016, REQ-017, REQ-018, REQ-020, REQ-035, REQ-023 (effective-radius aspect)
- **Type:** Functional + UI
- **References:** `06-wind-system.md` (`getWindAt`), `05-input-and-states.md` (states), `09-rewards-and-progression.md` (supply acquisition), `03-rendering.md` (circle styles)

## 1. Model & Constants

- `modifiers: Array<{id, type:'amplify'|'nullify'|'flip', x, y, radius:number, isDragging?:boolean}>` in `src/main.js` (or exported via `src/vectorField.js:setModifiers`).
- Base constant `BASE_MODIFIER_RADIUS` normative: latest spec uses `54` (reduced 40% from `90`; see `09-rewards-and-progression.md` for upgrade math). Earlier `90` is legacy and **superseded by `54`** per clarification (later requirement wins). Define once: `BASE_MODIFIER_RADIUS=54` or `90`→`54` at top of `src/main.js`/`src/vectorField.js`; document chosen value. Effective radius is `getEffectiveModifierRadius()` (see §4).
- `MODIFIER_RADIUS` is not mutated directly; effective radius is derived via multiplier.

## 2. Hotbar UI `src/main.js` / `index.html` / `style.css`

- Horizontal transparent overlay `div#hotbar` centered `position:absolute; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.35-0.45); backdrop-filter:blur(4-6px); border-radius:10px; padding:6px 10px; display:flex; gap:10px; z-index:5`.
- Slots use same style as pause-menu `reward-stats` (`background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); border-radius:6px; font:600 11px system-ui,white with -webkit-text-stroke 2px rgba(0,0,0,0.65); paint-order:stroke fill; min-width:80px; padding:6px 10px`).
  - Slot 1 `Amplify xN` icon `»` `#e67e22` orange; Slot 2 `Nullify` `∅` `#3498db`; Slot 3 `Flip` `⇄` `#9b59b6`.
  - Selected: type-tinted `rgba(...,0.28)` `border rgba(...,0.9)` `scale 1.04`; disabled (see supply): `opacity 0.45; filter:grayscale(0.6); cursor:not-allowed`.
- Selection via hotbar click **or** keys `1`/`2`/`3` even when collapsed; `Escape` / re-pressing same key / re-clicking selected deselects to `null`. No opaque solid selection.
- **Collapsible**: default `expanded` in `AIMING`/`CHARGING`; toggle handle `#hotbar-toggle` `32×24` or `36×18` chevron `▾/▴` (and optional `M`/`B` key) collapses with `150-200ms` transition. Collapsed pill `~28px` tall shows only handle; slots `display:none` but selection persists and hotkeys/preview/placement still work. Expanding restores slots. Collapse is ephemeral (reset to expanded on `loadLevel`/`advanceHole`/new game). Hidden entirely during `FLYING`/`WIN`/`reward`/`pause`/`main-menu`.

## 3. Placement Interaction `src/input.js` + `src/main.js`

- Preview circle dashed `50%` of effective radius, color per type, following mouse via `getCanvasMousePos` when a modifier is selected and state is `AIMING`/`CHARGING`; no preview when `null` or supply insufficient (or desaturated red).
- Left-click places at cursor's logical coords if `canPlace(selectedModifier)` (see §6) and not overlapping `FLYING`; after placement `selectedModifier=null` (must re-select for next). Placing does not launch.
- **Dragging**: `mousedown` on existing circle (`dist<radius`) enters dragging, `mousemove` updates `x,y`, `mouseup` finalizes; works only before shooting; dragged opacity `0.6`, `grabbing` cursor; does not delete or consume supply.
- Right-click or `Delete`/`Backspace` on a circle removes it (frees supply slot, see §6); dragging does not delete. `R` ball reset does NOT clear modifiers; advancing hole or game reset does (see §7).

## 4. Effective Area (Area Upgrades)

- State `areaUpgradeCount >=0` (`0` on new game) defined in `09-rewards-and-progression.md` but **applied here**. Multiplier `areaMultiplier = 1 + 0.2*areaUpgradeCount` (**additive**, not `1.2^n`; two gives `1.4` → e.g. `54*1.4=75.6`, not `77.76`).
- `getEffectiveModifierRadius() = BASE_MODIFIER_RADIUS * areaMultiplier` (e.g. `54,64.8,75.6,86.4...`; or `90,108,126,144` if base were 90 — use actual base).
- All hit tests (`getWindAt`, dragging, preview, removal) shall use effective radius. Existing modifiers grow retroactively on `Area Up` acquisition (either update each `m.radius` or compute lazily via getter).

## 5. Per-Type Effects (applied in `getWindAt` after base field + bilinear, in placement order)

- **Amplify (`factor 5`)**: `if type==='amplify' && inside → wind*=5`. Stacking multiplicative (two →25×, capped at `25×`).
- **Nullify (`factor 0`)**: `getWindAt` returns `{0,0}` for visualization (faint); **physics inside nullify (see `04-physics-and-collision.md`) skips both wind and friction** so ball keeps entry velocity (`isInsideNullify` branch). Stacking: nullify dominates (over amplify/flip, result `{0,0}` and preserved velocity). Minimum-force rule is intentionally violated inside nullify for physics but visualization shows zero.
- **Flip (`factor -1`)**: `wind*=-1` per circle (magnitude unchanged, so min force still satisfied). Two flips cancel to `1×`; `amplify(5)+flip` → `-5×`.
- Circular area: `dist < effectiveRadius` where `effectiveRadius = getEffectiveModifierRadius()`. Performance `O(n)` where `n`=modifiers length.

Visualization on `game` canvas (below wind overlay):
- `amplify` solid orange `rgba(230,126,34,0.25)` ring `>>`, `nullify` blue dashed `rgba(52,152,219,0.25)` `∅`, `flip` purple `rgba(155,89,182,0.25)` `↻`. Dragged at 60% opacity.

## 6. Supply (Inventory Limits)

- `supply = { amplify:number, nullify:number, flip:number }` in `src/main.js` (or `src/supply.js`).
- Initialized to `{1,1,1}` on new game (`initLevel(0)`, `resetGameAfterWin`, `startNewGameFromMain`, `endRun`, `clearProgress`, page reload with no save). Persists through death/`R` and through hole advances **minus win-consumption** (see §7).
- **Placement guard**: `canPlace(type) => modifiers.filter(m=>m.type===type).length < supply[type]`. Place allowed iff true; otherwise rejected (no `modifiers` push, no `syncModifiersToField`). UI shows disabled slot / desaturated preview, tooltip `No supply remaining`.
- Dragging does not check/consume supply. Right-click removal frees one slot. `updateHotbarUI()` shows badges `xN` / `N/M` and disabled styling; collapsed hotbar hides badges but still enforces `canPlace`.
- `addToSupply(type,n)` increments counter (used by rewards, see `09-rewards-and-progression.md`).

## 7. Consumption on Win (REQ-035)

- When a hole is beaten (`WIN` → `handleNextHole`/`advanceHole` before clearing), iterate **snapshot** of `modifiers` and for each `m`: `supply[m.type]=Math.max(0, supply[m.type]-1)`. Clamped, exactly once per win (guard against double `handleNextHole`), not on death/manual removal/drag/`End Run`.
- Then `modifiers=[]; syncModifiersToField(); updateHotbarUI(); saveProgress();` For non-final holes next hole's hotbar reflects reduced supply (type that hit `0` becomes disabled until reward replenishes). For final hole `Game Complete` → `clearProgress()` resets to `{1,1,1}` (consumption moot before reset).

## Acceptance Criteria

- [ ] Hotbar is transparent overlay with pause-menu-style slots, collapsible to pill, toggle persists selection, hotkeys work while collapsed, hidden during `FLYING`.
- [ ] Preview shown when selected and supply allows; left-click places and clears selection; drag moves; right-click/Delete removes and frees slot.
- [ ] `getWindAt` inside amplify `5×`, inside nullify `{0,0}` (physics preserves velocity), inside flip `*-1`; stacking as specified; effective radius used everywhere.
- [ ] Supply `{1,1,1}` on new game, one of each placeable; second amplify blocked until removal or reward; `updateHotbarUI` disabled styling correct.
- [ ] With one `Amplify` placed at win → `supply.amplify 1→0` and `modifiers` cleared; removed-before-win not consumed; death not consumed; reload `Continue` preserves `0`.

## File Paths

- `src/main.js:1` (`supply`, `modifiers`, `selectedModifier`, `isHotbarCollapsed`, `canPlace`, `placeModifier`, `removeModifierAt`, `handleNextHole` consumption, `getEffectiveModifierRadius`, hotbar toggle)
- `src/vectorField.js:1` (`MODIFIER_RADIUS` base, `getWindAt` modifier loop, `setModifiers`/`syncModifiersToField`)
- `src/input.js:1` (keys `1/2/3`, `Escape`, mouse placement/drag, collapse `M`/`B`)
- `src/render.js:1` (`drawModifiers`, `drawModifierPreview`)
- `index.html:30` (`#hotbar` + `#hotbar-toggle`), `style.css:1` (transparent, `backdrop-filter`, collapsed `.collapsed`)
