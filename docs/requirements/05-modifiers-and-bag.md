# 05 — Modifiers, Golfbag & Hotbar

- **ID:** 05-modifiers-and-bag
- **Supersedes:** 06-wind-system §0/§3–§8; 10-progression §0–§2 (bag/passive/starting)
- **Type:** Functional + UI
- **References:** `04-levels-and-wind.md` (base field); `06-run-rules.md` (states/blocking); `07-rewards-and-economy.md` (grants)

> Bag slots are the source of truth here. Legacy `supply` counters are derived via `syncDerivedFromBag()` for physics/compat only.

## 1. Model & constants

- Spatial golfbag: `golfbag[4]`, each `null | {type}` with `type ∈ {magnifier,liquifier,deflector,rotator}` (legacy `amplify/nullify/flip/rotate` map). One item per slot, no stacking. `GOLFBAG_SLOTS=4` always; all slots unlocked from the start.
- Passive slots (3, stackable, never placeable): `passiveCounts = { fieldExtender, powerCell, freeShot }`. `powerCell` alias `rangeModifier`. `freeShot` holds charges.
- `modifiers: Array<{id,type,x,y,radius}>` — placed spatial bubbles only; `freeShot`/passives never in `modifiers`. `BASE_MODIFIER_RADIUS=54`. Effective radius via `getEffectiveModifierRadius()` (§3). `BASE_STRENGTH=5` (§2).
- Hotkeys `1–4` spatial only (`1 liquifier`, `2 deflector`, `3 rotator`, `4 magnifier`); selecting sets `selectedBagIndex`/`selectedModifier`. Passives have no hotkey; `selectedModifier` never becomes passive; `canPlace(passive)===false`.

## 2. Wind effects (`getWindAt`, after base field)

- `areaMultiplier = 1 + 0.20*effectiveFieldExtenderCount`; `powerMultiplier = 1 + 0.20*effectivePowerCellCount` (additive, not `1.20^n`; `effective*=0` when toggled off). `effectiveRadius = 54*areaMultiplier` (retroactive on pickup/toggle). `effectiveBase = 5*powerMultiplier`.
- `magnifierCount/deflectorCount/rotatorCount` = bubbles containing the point; `hasRotDef>0`; `totalFactor = 5**(magnifierCount+(hasRotDef?1:0)) * ((hasRotDef||magnifierCount>0) ? powerMultiplier : 1)`; `totalQuarterTurns = (rotatorCount+2*deflectorCount)%4`; `wind = base*totalFactor` rotated `Q*90°` CCW. Liquifier first: inside any liquifier → `{0,0}` for visuals, and physics skips wind+friction (entry velocity preserved).
- Concretely: magnifier `5×` (stacking `25×/125×`) scaled by power; deflector `-5×` (deduped: any deflector+rotator count = one `5×`, further `×5` per explicit magnifier); rotator `90° CCW + 5×` (deduped with deflector; angles stack mod 360°); liquifier `0`, dominates, ignores Power Cell. Free Shot is not a wind effect (see §5).
- Field art (`fgCtx`, no center icons; centers stay clear for arrows): magnifier orange `rgba(230,126,34,0.25)`, liquifier blue dashed, deflector purple `rgba(155,89,182,0.25)`, rotator red `rgba(231,76,60,0.25)`; stacked groups share one fill + segmented edge (one arc per member); dragged `0.6` opacity. Ball-enter flash: outside→inside during `FLYING` sets `m.flashAt`; white overlay + expanding ring for `MODIFIER_FLASH_MS=350ms` (stacked groups flash as one).

## 3. Passives (+20% each, togglable)

- `fieldExtender`: `+20%` radius per stack (see §2). `powerCell`: `+20%` strength for magnifier/deflector/rotator (see §2). `freeShot`: free attempts (see §5).
- Toggle: clicking a filled `fieldExtender`/`powerCell` slot flips `passiveEnabled[type]` (default on, persisted, reset on new run) via `togglePassive()`; `applyPassiveEffects()` resizes placed bubbles, re-syncs field, updates UI, saves. Off shows `.passive-off` (dimmed/grayscale, `(OFF)` hint); on shows `(ON)`. Picking up a passive never changes its toggle. Blocked in menus/overlays; allowed in `AIMING`/`CHARGING`/`FLYING`.

## 4. Hotbar & golfbag UI (bottom-center grouped)

- `#bottom-bar` (`absolute; bottom:12px; left:50%; translateX(-50%); flex; align-items:center; gap:2–6px; z-index:6`): `#golfbag-wrapper/#golfbag-container` (79px circle, `rgba(0,0,0,0.35)`, `blur(4px)`, `1px rgba(255,255,255,0.12)` border, `img#golfbag-icon ./img/golfbag.png` 77px, `I` badge top-left, hover `scale(1.08)`, collapsed `translateY(51px)` clipped by container) + `#hotbar` (transparent, `max-width:420px`) + passive slots.
- Spatial: `#hotbar-grid repeat(4,1fr)`, `54×54` squares, distinct `2px` borders when filled (`liquifier #1a4a6b`, `deflector #4a235a`, `rotator #6e1a12`, `magnifier #7a3a0a`) on `0.28` tinted backgrounds; `img.hotbar-icon-img 36×36` (`./img/<type>-icon.png`); hotkey badge `1–4` top-center; selected outline/scale; hover `scale(1.10)`. Empty spatial slot: gray `rgba(128,128,128,0.28)` + `#7a7a7a` border, no icon/badges.
- Passive: 3 siblings `div.hotbar-slot.passive[data-type=fieldExtender|powerCell|freeShot]` (separate `#passive-hotbar-grid` or adjacent; `querySelectorAll('.hotbar-slot.passive')===3`), `54×54`, transparent when empty (no icon), gray `0.28` tint when filled, `xN` badge `span.hotbar-count` lower-right when `N>0` else hidden, no `.hotbar-hotkey`, tooltip name + `(ON)/(OFF)` + toggle hint. FreeShot filled slot shows `★`/icon + `xN`; armed adds `.passive-active` gold outline/glow.
- Collapse: no `#hotbar-toggle` button; golfbag click or `I`/`Tab` toggles `isHotbarCollapsed` (ephemeral; `0.22s` animations; collapsed hotbar `opacity:0,max-width:0,pointer-events:none`). `1–4` still work collapsed. Visible in `AIMING`/`CHARGING`/`FLYING` and reward menus; hidden in pause/menus/banners/`WIN`/`GAME_OVER`/summaries/cutscene/banter/starting overlay.

## 5. Free Shot (passive charges)

- Stock in `passiveCounts.freeShot`; HUD `Attempts Left: X (+Y)`. Each free launch consumes one charge on launch; `isFreeShotActive` stays armed while stock remains. Auto-arm when `!armed && stock>0 && attemptsLeft<=1`. Manual arm/disarm by clicking the filled Free Shots slot (`toggleFreeShot()`).
- At launch (see `06-run-rules.md`): armed free launch consumes no counted attempt. Visuals: ball gold glow only while armed pre-launch (never during `FLYING`), edge glow while armed or `freeShotFlightActive`. Three.js `0xf1c40f/0xFFD700 14–22px` additive + `#free-shot-edge-glow`; canvas gold ring fallback.

## 6. Placement, stacking, drag & drop

- Preview (armed + `AIMING`/`CHARGING`): dashed `50%` effective radius in type color at `mousePos`; live wind arrows as-if-placed (liquifier shows none); OOB hover (outside canvas or `terrainZoneAt==='ob'`) shows red preview + `out of bounds`, click is a no-op (stays armed), bag-drop there disarms back to slot. Click/drag-drop on canvas places via `placeModifier` (OOB-checked after snap): item leaves its bag slot, `modifiers.push`, `selectedModifier=null`, `syncDerivedFromBag()+syncModifiersToField()+updateHotbarUI()+saveProgress()`. Blocked while `FLYING`/menus.
- Drag placed: `mousedown` on circle (when nothing armed) + move + `mouseup` updates `x,y` with grab offset preserved; no supply change. Bag→level drag (>6px) arms the item (preview follows, even over hotbar); release on canvas places, on another spatial slot moves/swaps, elsewhere deselects. Level→bag drag release over a spatial slot swaps/picks up (`drop slot first`, then lowest index); leftovers split.
- Stacking: candidate center inside another modifier snaps to its exact center (`STACK_SNAP_EPS=2px`); EM-pull line (cyan glow + white zigzag + pulses + rings) while in snap; commits only on release (grab-time membership snapshot). Stacked edge = segmented multicolor arcs; no `xN`. Right-click/`Delete`/`Backspace` on a stack splits (`splitStackAtIndex`: anchor stays, others pop out along their arc midpoints `1.3R`, up to `1.9R` if crowded); lone pickup returns to an empty spatial slot (`supply` derived `++`), or toasts `Golfbag is already full` and stays when full (pickup never enters discard mode — that is reward-only).
- Reward-discard mode only: claiming a spatial while all 4 spatial slots are full sets `pendingRewardType`, keeps the menu open (`Bag full — destroy one to take X`), highlights occupied spatial slots `.discard-target`, offers `Skip (take nothing) [Esc]`; clicking/hotkey `1–4` destroys that slot then grants. Passives never trigger bag-full (stackable).

## Acceptance

- [ ] 4 spatial slots always visible with icons/hotkeys `1–4`; 3 passive slots stackable with `xN`, no hotkeys, not placeable; toggles resize/restrength retroactively and persist.
- [ ] `+20%` multipliers: 2 FE → `75.6` radius; 2 PC → `7.0` base; off → base values.
- [ ] Place removes from bag; pickup refunds or toasts when full; win clears board without refund; free launch consumes one charge, no counted attempt; auto-arm at `≤1`.
- [ ] Snap/stacking/split, drag both directions, OOB guard, EM line, enter-flash, no center icons on field.

## File paths

- `src/main.js:1` (bag, `modifiers`, `placeModifier`, `canPlace`, stacking/drag, `getEffectiveModifierRadius`, hotbar toggle), `src/vectorField.js:1`, `src/render.js:1` (`drawModifiers`, `drawModifierPreview`, `drawSnapLink`), `src/input.js:1` (`1–4`, `I`/`Tab`), `index.html:1`, `style.css:1`
