# REQ-023: Modifier Area +20% Upgrade Reward

- **ID:** REQ-023
- **Title:** Modifier Area +20% Upgrade Reward (Stackable)
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Reward / Field Manipulation (REQ-015/REQ-021 Extension)

## Description
The game SHALL provide an upgrade reward `Area +20%` (type `areaUp` / `modifierArea`) that increases **all** modifier areas (circular influence radius `MODIFIER_RADIUS`) by **20% of the base area** per acquisition. The reward SHALL be included in the list of random upgrade awards in the reward menu (REQ-021) alongside `Amplify`, `Nullify`, `Flip`, and `Free Shots +3`. If the same award is taken multiple times, effects SHALL stack **additively**: two `Area +20%` rewards SHALL give a `40%` base area increase (not `44%` multiplicative), three SHALL give `60%`, etc. The increased area SHALL apply to all existing modifiers already placed and to all future modifiers placed, and SHALL persist for the remainder of the run.

## Rationale
Modifier area directly controls puzzle influence (REQ-015 `MODIFIER_RADIUS=90`). A flat radius makes later puzzles stale. An area-upgrade reward adds progression variety: players who repeatedly choose it can create larger wind corridors or calm zones, trading off against new modifier supply or free shots. Additive stacking (`+20%` per count, `1 + 0.2*n`) is predictable, easy to balance, and avoids exponential blow-up (`1.2^n` would be 72.8% at 3 stacks vs 60% additive). Including the reward in the random 3-of-N offer keeps the reward menu fresh and prevents guaranteed area growth, requiring strategic choice.

## Requirements

1. **Pool Inclusion** in `src/main.js` (REQ-021 Pool):
   - The random upgrade pool `POOL` per REQ-021 SHALL be extended from four to **five** distinct types: `['amplify','nullify','flip','freeShots','areaUp']` (internal identifiers; `areaUp` MAY be alias `modifierArea` or `areaPlus20`, but SHALL be documented consistently).
   - The reward menu SHALL still display **exactly three** distinct options per trigger, now randomly chosen as `shuffle([...POOL]).slice(0,3)` (3-of-5 uniform without replacement). The excluded two types SHALL not be shown that trigger. Over many triggers all five types SHALL remain possible to appear.
   - No change to trigger timing (`totalAttempts %5===0`) or blocking logic; only the pool size grows.

2. **Stacking State** in `src/main.js`:
   - SHALL include `areaUpgradeCount: number` (integer `>=0`) or `modifierAreaBonus: number` and/or `modifierRadiusMultiplier: number`, initialized to `0` (count) / `1.0` (multiplier) on **new game**: page load / `initLevel()` with `currentHoleIndex===0`, `resetGameAfterWin()` (press `R` in `WIN`/`GAME_COMPLETE`), and full page reload.
   - On each acquisition of the `Area +20%` reward (`claimReward('areaUp')` when offered), `areaUpgradeCount += 1` (exactly `+1` count per selection) SHALL be executed once, and the effective multiplier SHALL be recomputed as:
     ```js
     areaMultiplier = 1 + 0.2 * areaUpgradeCount   // additive
     // 0 → 1.0 (90px), 1 → 1.2 (108px), 2 → 1.4 (126px), 3 → 1.6 (144px)
     ```
     Alternatively store `areaBonusPercent = areaUpgradeCount * 20` and `effectiveRadius = base * (1 + areaBonusPercent/100)`.
   - Multiplicative stacking (`1.2^n`) SHALL NOT be used. Two upgrades SHALL give `126px` (1.4×), not `129.6px` (1.44×). This SHALL be enforced by the additive formula and verified in acceptance.
   - Clamping: `areaUpgradeCount` SHALL be `>=0`, integer. No upper limit for MVP (but area `<=` canvas dimension is natural bound; e.g., 10 stacks = 3× = 270px still < 600px height, acceptable).
   - State SHALL be exposed via helpers `getAreaUpgradeCount()`, `getAreaMultiplier()`, `getEffectiveModifierRadius()` and `addAreaUpgrade(n)` for tests (`window.__getAreaUpgradeCount`, etc.), but no HUD display is required in MVP.

3. **Radius Application** in `src/main.js` / `src/vectorField.js` / `src/render.js`:
   - Base constant `MODIFIER_RADIUS = 90` (per REQ-015) SHALL remain the single source of truth for base value; effective radius SHALL be derived at use time, not by mutating the constant itself, to keep stacking traceable.
   - All code that consumes or displays modifier radius SHALL use the effective radius:
     - **Placement** `placeModifier(x,y)` in `src/main.js` SHALL create modifiers with `radius: getEffectiveModifierRadius()` (which returns `base * multiplier`). Alternatively store `baseRadius` and compute on read.
     - **Existing modifiers**: after an `Area +20%` acquisition, all modifiers already in `modifiers[]` SHALL have their `radius` updated retroactively to the new effective value (e.g., `modifiers.forEach(m=>m.radius=getEffectiveModifierRadius())` or compute radius lazily via `getEffectiveModifierRadius()` on hit-test/draw/getWindAt). Either approach is acceptable if visually and logically all areas immediately grow.
     - **Physics/Query** `getWindAt(x,y)` in `src/vectorField.js` hit-test `dist < mod.radius` SHALL use effective radius. If radius is stored per modifier, it SHALL be the effective radius; if computed lazily, use `getEffectiveModifierRadius()`.
     - **Hit-testing** for dragging/removal (`Math.hypot(m.x - ... ) < m.radius`) in `src/main.js` SHALL use effective radius.
     - **Preview** `drawModifierPreview(x,y,type,radius)` SHALL be called with effective radius when previewing any modifier while the bonus is active, so the dashed preview reflects the larger area.
     - **Visualization** `drawModifiers(ctx, modifiers)` SHALL draw circles with `mod.radius` effective size; particle/arrow influence inside shall match (since `getWindAt` uses same radius).
   - No per-type distinction: the bonus applies uniformly to `amplify`, `nullify`, and `flip` areas alike.

4. **Persistence & Lifecycle** per REQ-011/REQ-014/REQ-020/REQ-022:
   - `areaUpgradeCount` / `areaMultiplier` SHALL **persist** through death resets (`resetBall()` on obstacle/OOB) and through `R` during play (ball reset without scoring) — those SHALL NOT reset the count.
   - `areaUpgradeCount` SHALL **persist** across hole advances (`advanceHole()` / `handleNextHole()` / `loadLevel(n>0)`) — advancing SHALL NOT reset it (similar to `supply` and `freeShots`). Only a new game reset SHALL zero it.
   - Deterministic per run: radius for a given count SHALL be same on reload with same sequence; randomness only affects *whether* the reward was offered (REQ-021), not the radius formula itself. No `localStorage` required.

5. **Rendering of Upgrade Button** in `src/render.js`:
   - When `areaUp` is among the three randomly offered upgrades, its button SHALL be rendered with distinct styling for recognizability and high contrast (similar to other buttons, no white card):
     - Label `Area +20%` (or `Area Up`), icon `◯` or `⬡` or `◎` (e.g., `◯` 22-24px), color `#f39c12` (amber) or `#e67e22` distinct from Amplify orange; suggested `#f1c40f` gold or `#d35400` burnt orange — document choice, but SHALL be distinct from existing four colors and pass contrast on dim `rgba(0,0,0,0.55)` over green.
     - Border `rgba(243,156,18,0.9)` 2px, fill `rgba(243,156,18,0.28)` (hover `0.38`), with dark outline on icon and white label with stroke per REQ-021 button spec.
     - Hint text `+20% area` 11px `rgba(255,255,255,0.95)` with stroke, key hint `[1]`/`[2]`/`[3]` positional.
   - When `areaUp` is not offered, no `Area +20%` button SHALL be drawn that trigger.

6. **No External Storage & No HUD**:
   - No new HUD element is required to display `areaUpgradeCount` or multiplier in MVP (hidden bonus, similar to `freeShots`). The effective area is visible via larger circles on canvas. Debug exposure via `window` helpers is allowed.

## Acceptance Criteria

- [ ] On fresh page load (new game) hidden `areaUpgradeCount===0`, `getEffectiveModifierRadius()===90` (base `MODIFIER_RADIUS`), `getAreaMultiplier()===1.0`.
- [ ] Reward menu at `Total=0` now draws **exactly three** buttons randomly chosen from **five** possible types `Amplify`, `Nullify`, `Flip`, `Free Shots +3`, `Area +20%` (pool size 5). Never duplicate types in one menu, never four or two, never shows excluded types. Over 12 reloads, all five pool types appear at least once statistically (3-of-5 random). Verified by `getRewardOffered().length===3` and `new Set(offered).size===3` subset of pool.
- [ ] When `Area +20%` is among the three offered, its button shows label `Area +20%` (or `Area Up`), icon `◯` (or `⬡`/`◎`) 22-24px amber/gold `#f39c12`/`#f1c40f`, border `rgba(243,156,18,0.9)`, hint `+20% area`, key hint positional `[1]`/`[2]`/`[3]`.
- [ ] Selecting `Area +20%` when offered (click or positional key `1`/`2`/`3`) closes the menu, increments `areaUpgradeCount` from `0` to `1`, `areaMultiplier` becomes `1.2`, `getEffectiveModifierRadius()` becomes `108` (`90*1.2`), `supply` and `freeShots` unchanged, `Total` still `0`, no `Total Attempts: N` text drawn.
- [ ] Placing an `Amplify` modifier **after** one `Area +20%` upgrade creates a modifier with `radius===108` (not 90). `getWindAt` inside `108px` returns modified vector (e.g., amplified), outside returns base; sampling at `95px` (previously outside base but inside boosted) now shows effect, proving larger area.
- [ ] Existing modifiers retroactively grow: place an `Amplify` with radius `90` before any area upgrade, verify `getWindAt` at `95px` is base. Then take `Area +20%` via next reward menu, verify without moving modifier that `getWindAt` at same `95px` now returns amplified vector and `drawModifiers` circle visually larger (`126px` after second upgrade).
- [ ] Stacking additive: take `Area +20%` a second time (next `Total=5` menu where it is again randomly offered and chosen). `areaUpgradeCount` becomes `2`, `areaMultiplier` becomes `1.4` (not `1.44`), `effectiveRadius` becomes `126` (`90*1.4`). Verify via `getEffectiveModifierRadius()===126` and sampling. Third intake gives `1.6` / `144px`.
- [ ] Additive vs multiplicative check: after two upgrades, radius is `126` ±0.5, not `129.6` (`90*1.44`). Test helper `getAreaMultiplier()===1.4` not `1.44`.
- [ ] `Area +20%` not offered scenario: if the current random 3-set does not contain `Area +20%`, it cannot be selected and `areaUpgradeCount` stays unchanged that trigger; only modifier/free-shots upgrades are selectable.
- [ ] Dying (`resetBall()` on obstacle/OOB) does NOT reset `areaUpgradeCount` or `effectiveRadius`; modifiers already placed keep larger radius after death, and next placed modifier still uses `126px` etc.
- [ ] Advancing hole (`handleNextHole()` after win) does NOT reset `areaUpgradeCount`; modifiers are cleared per REQ-015 but effective radius for next hole's placements remains `126px`; `supply`/`freeShots` also persist.
- [ ] Pressing `R` in `WIN`/`GAME_COMPLETE` (`resetGameAfterWin()`) resets `areaUpgradeCount` to `0`, `areaMultiplier` to `1.0`, `effectiveRadius` to `90`, together with `holeAttempts=0, totalAttempts=0, supply={0,0,0}, freeShots=0`, and next `0` menu again offers a new random 3-of-5.
- [ ] Preview circle while a modifier is selected and `areaUpgradeCount>0` shows dashed preview with effective radius (`108`/`126`/`144`), not base `90`, with correct color per type.
- [ ] No 3rd-party libraries; pure vanilla JS `areaUpgradeCount`, `effectiveRadius = base * (1 + 0.2*count)`, `POOL` now size 5 with uniform `Math.random()` shuffle.

## Dependencies

- REQ-015 (modifier area `MODIFIER_RADIUS=90`, circular effect, `getWindAt` hit-test)
- REQ-021 (upgrade reward menu 3-random-of-N, trigger `totalAttempts%5`, `rewardOffered`, `claimReward` branching)
- REQ-020 (supply coexistence; area upgrade does not affect supply)
- REQ-022 (free shots coexistence; area upgrade does not affect freeShots)
- REQ-012 (rendering inside canvas, high-contrast buttons, no white card)
- REQ-011 (game states, `resetBall`, `loadLevel`, persistence)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  const BASE_MODIFIER_RADIUS = 90; // per REQ-015
  let areaUpgradeCount = 0;
  function getAreaMultiplier(){ return 1 + 0.2 * areaUpgradeCount; } // additive
  function getEffectiveModifierRadius(){ return BASE_MODIFIER_RADIUS * getAreaMultiplier(); } // 90,108,126,144...
  function getAreaUpgradeCount(){ return areaUpgradeCount; }
  function addAreaUpgrade(n=1){ areaUpgradeCount = Math.max(0, areaUpgradeCount + Math.floor(n)); }

  const POOL = ['amplify','nullify','flip','freeShots','areaUp']; // now 5
  // maybeShowRewardMenu: rewardOffered = shuffle([...POOL]).slice(0,3);

  function claimReward(type){
    if(!rewardMenuVisible || !rewardOffered.includes(type)) return;
    if(type==='freeShots') addFreeShots(3);
    else if(type==='areaUp') {
      addAreaUpgrade(1); // +20% additive
      // retroactively grow existing modifiers: modifiers.forEach(m=>m.radius=getEffectiveModifierRadius());
      // or rely on effective radius getter in getWindAt/hit-test
    } else addToSupply(type,1);
    rewardClaimedFor = totalAttempts;
    rewardMenuVisible=false; rewardOffered=[];
  }
  // placeModifier: modifiers.push({..., radius:getEffectiveModifierRadius()})
  // getWindAt/dist: use mod.radius (effective) or getEffectiveModifierRadius() if lazy
  // drawRewardMenu: def for areaUp {icon:'◯', label:'Area +20%', color:'#f39c12', border:'rgba(243,156,18,0.9)', fill:'rgba(243,156,18,0.28)', hint:'+20% area'}
  // initLevel/resetGameAfterWin: areaUpgradeCount=0
  // advanceHole/resetBall: do NOT reset areaUpgradeCount
  ```
- Visual choice for Area button: alternatives `⬢` or `◎` with amber/gold `#f39c12` ensure distinctness from Amplify orange `#e67e22`, Nullify blue `#3498db`, Flip purple `#9b59b6`, Free Shots green `#2ecc71`.
- Hit-testing and particle/arrow influence automatically scale with effective radius because they query `getWindAt` which checks `dist < effectiveRadius`.

## File Paths

- `src/main.js:1` (POOL size 5 with areaUp, areaUpgradeCount, getAreaMultiplier/getEffectiveModifierRadius/addAreaUpgrade, claimReward areaUp branch +20% additive, placeModifier effective radius, retroactive radius update, initLevel/resetGameAfterWin reset, persistence through resetBall/advanceHole)
- `src/render.js:1` (REWARD_TYPE_DEFS areaUp entry #f39c12 ◯, getRewardButtonsLayout now 3-of-5 random, drawRewardMenu draws Area +20% button when offered, preview radius uses effective radius)
- `src/vectorField.js:1` (optional: getWindAt uses effective radius via mod.radius or imported getEffectiveModifierRadius; if radius stored per modifier no change to interpolation)
- `index.html:1` (no DOM for area bonus)
- `style.css:1` (no styling needed; canvas-only)

