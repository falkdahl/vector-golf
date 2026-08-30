# REQ-021: Modifier Reward Menu Every 5 Total Attempts

- **ID:** REQ-021
- **Title:** Upgrade Reward Menu Every 5 Total Attempts (Inside Canvas)
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Reward / Inventory Acquisition

## Description
At the start of any total attempt whose number ends with `0` or `5` (i.e., `totalAttempts % 5 === 0`), the player SHALL be presented with a menu **inside the canvas** to select one of three upgrade options **randomly chosen** from the five possible upgrades. The pool of possible upgrades SHALL be `Amplify`, `Nullify`, `Flip`, `Free Shots +3`, and `Area +20%` (modifier area increase). For each menu trigger, three distinct options SHALL be randomly selected from this pool (uniformly, without duplication) and displayed. When a modifier option (`Amplify`/`Nullify`/`Flip`) is selected, the supply of that modifier type (per REQ-020 `supply = {amplify, nullify, flip}`) SHALL increase by one and the menu SHALL close. When `Free Shots +3` is selected (when it is among the three offered), the hidden free shots counter (per REQ-022 `freeShots`) SHALL increase by three and the menu SHALL close. When `Area +20%` is selected (when it is among the three offered), all modifier areas SHALL increase by 20% of the base area per REQ-023 (stacking additively) and the menu SHALL close. After any selection the game SHALL return to normal `AIMING` input.

## Rationale
Supply starts empty per REQ-020, so without acquisition the player can never place. A periodic reward every 5 total attempts gives a deterministic, performance-tied acquisition loop: the more attempts the player needs, the more tools they earn. Triggering on `0` or `5` (every 5th attempt) is trivial to compute (`%5`) and aligns with `totalAttempts` from REQ-014. The `Free Shots +3` upgrade adds a non-movement alternative that reduces future attempt counting per REQ-022. The `Area +20%` upgrade (REQ-023) adds field-shaping progression, enlarging circular influence per REQ-015 `MODIFIER_RADIUS`. Showing only **three random options out of five** adds variety and choice tension — the player cannot always pick the same upgrade, and over multiple triggers all upgrades remain obtainable. Presenting inside the canvas (not DOM overlay) preserves static-hosting, canvas-centric style and, per updated UI, uses no white card background but high-contrast colored text on the green fairway.

## Requirements

1. **Trigger Condition** in `src/main.js`:
   - The reward menu SHALL trigger at the **start** of an attempt where `totalAttempts % 5 === 0`.
   - `totalAttempts` is the global counter from REQ-014 (sum across all holes, incremented exactly once per `handleLaunch()` when `freeShots === 0` per REQ-022; free shots do not advance it).
   - Trigger moments:
     - On **new game** (`totalAttempts === 0`) immediately after `initLevel()` / `loadLevel(0)` and before first aiming input — player starts with empty supply and must choose first upgrade among three random options from the 5-pool.
     - After any launch that causes `totalAttempts` to become `5, 10, 15, 20…` — at the next entry into `AIMING` (either after `resetBall()` on death/OOB or after ball comes to rest and is reset, or after advancing hole if the winning launch was the 5th/10th). The menu SHALL appear **before** the player can aim/charge/place the next shot.
   - The menu SHALL NOT trigger mid-flight (`FLYING`) or while `WIN` overlay is shown. It SHALL be evaluated whenever `gameState` transitions to `AIMING` with `totalAttempts % 5 === 0` and no reward is already pending/claimed for that `totalAttempts` value.
   - For each qualifying `totalAttempts` value, the reward SHALL be offered **exactly once**. Re-entering `AIMING` without incrementing `totalAttempts` (e.g., pressing `R` during play which does NOT increment) SHALL NOT re-trigger if reward already claimed for that value. After selection, the value is marked claimed; the next trigger is at `+5`.

2. **Menu State, Random Selection & Blocking** in `src/main.js`:
   - State SHALL be `rewardMenuVisible: boolean`, `rewardClaimedFor: number|null` (or `Set`), and `rewardOffered: string[]` (length `3`, distinct types from pool `['amplify','nullify','flip','freeShots','areaUp']`). On each trigger, `rewardOffered` SHALL be populated by uniform random selection without replacement: e.g., `pool=[...]; shuffle via Fisher-Yates with Math.random(); offered=pool.slice(0,3)`.
   - Randomness SHALL use `Math.random()` (no external library) and SHALL guarantee three distinct values per menu; the two excluded types SHALL not be shown in that trigger. Over many triggers all five types SHALL be possible to appear.
   - While `rewardMenuVisible === true`, the game SHALL be in a blocking state:
     - `gameState` MAY remain `AIMING` but input for aiming (`ArrowLeft`/`ArrowRight`/`KeyA`/`KeyD`), charging (`Space`), launching, and modifier placement/dragging (`click`, `1`/`2`/`3`, `Escape`) SHALL be ignored. Alternatively a dedicated `REWARD` state may be introduced; either is acceptable if aiming/launch is blocked. Keys `1`/`2`/`3` SHALL be re-bound to select the three *offered* options in left-to-right order (not fixed mapping).
     - `update()` SHALL still advance particles/animations but SHALL NOT advance ball physics or allow `handleLaunch()`.
   - The hotbar (`#hotbar`) and canvas HUD (`drawHUD`) SHALL remain visible underneath the menu but hotbar selection SHALL be disabled while menu is open.

3. **Inside-Canvas Rendering** in `src/render.js`:
   - The menu SHALL be drawn **inside the canvas** via a function `drawRewardMenu(ctx, width, height, offered, hovered)` called from `render()` when `rewardMenuVisible === true`, similar to `drawHUD` per REQ-012/REQ-014. It SHALL NOT be a DOM overlay (`#win-overlay` style) — it is a canvas overlay.
   - Visual spec (no white background, high contrast on green `#3a9d23`):
     - Full-canvas dim `rgba(0,0,0,0.55)` behind menu (no solid white card; white card background SHALL NOT be drawn).
     - Title text `Choose an Upgrade` 22px `700 system-ui` **white** `rgba(255,255,255,1)` with `stroke rgba(0,0,0,0.75) 5px lineWidth` and `lineJoin round` centered at `cardY+28`, for good contrast against green/dim.
     - No `Total Attempts: N` subtitle SHALL be shown (hidden per updated UI). No white card `fill #fff` SHALL be present.
     - **Three** option buttons inside the centered area, laid out horizontally with `gap 12px`, each `90×110` (centered card `340×220`; total width `3*90+2*12=294` centered):
       - If `amplify` is among offered: `Amplify` border `rgba(230,126,34,0.9)` 2px, fill `rgba(230,126,34,0.28)` (hover `0.38`), icon `»` 22-24px `#e67e22` with dark outline `rgba(0,0,0,0.65) 4px`, label `Amplify` 13px **white** with `stroke rgba(0,0,0,0.75) 4px`, supply hint `+1 to supply` 11px `rgba(255,255,255,0.95)` with stroke, key hint `[1]`/`[2]`/`[3]` 11px (position reflects offered order).
       - If `nullify` is among offered: `Nullify` border `rgba(52,152,219,0.9)`, fill `rgba(52,152,219,0.28)` (hover `0.38`), icon `∅` 22-24px `#3498db` with outline, label `Nullify` white with stroke.
       - If `flip` is among offered: `Flip` border `rgba(155,89,182,0.9)`, fill `rgba(155,89,182,0.28)` (hover `0.38`), icon `⇄` 22-24px `#9b59b6` with outline, label `Flip` white with stroke.
       - If `freeShots` is among offered: `Free Shots +3` border `rgba(46,204,113,0.9)` 2px, fill `rgba(46,204,113,0.28)` (hover `0.38`), icon `★` 22-24px `#2ecc71` with dark outline `rgba(0,0,0,0.65) 4px`, label `Free Shots` 13px white with stroke, hint `+3 free shots` 11px `rgba(255,255,255,0.95)` with stroke.
       - If `areaUp` is among offered: `Area +20%` border `rgba(243,156,18,0.9)` 2px, fill `rgba(243,156,18,0.28)` (hover `0.38`), icon `◯` 22-24px `#f39c12` with dark outline `rgba(0,0,0,0.65) 4px`, label `Area +20%` 13px white with stroke, hint `+20% area` 11px `rgba(255,255,255,0.95)` with stroke.
     - Each displayed button SHALL use the same styling as above; the two excluded types SHALL not be drawn.
     - All button text SHALL use high-contrast white/light colors with dark stroke/shadow (e.g., `stroke rgba(0,0,0,0.75)`) to remain readable on `rgba(0,0,0,0.55)` dim over green fairway, not dark `#222` on white.
     - Buttons SHALL show hover feedback when mouse is over: brightened fill (`0.38`), `cursor pointer`, optional shadow.
   - Font hierarchy SHALL use `system-ui` only, no external assets, consistent with REQ-012.

4. **Selection & Mutation** in `src/main.js` + `src/render.js` hit-testing:
   - The three displayed options (derived from `rewardOffered`) SHALL be selectable by **left-click inside canvas** on the button rectangles. Hit-testing SHALL be done in logical canvas coordinates (`900×600`) via `getCanvasMousePos()` same as modifier placement, mapping click to offered index.
   - Keyboard `1` → first offered, `2` → second offered, `3` → third offered SHALL select while menu is open (order is left-to-right offered order, randomized per trigger). Fixed mapping `1=amplify` SHALL NOT be used; the key selects by position in the current random set.
   - On selection:
     - If `t in {'amplify','nullify','flip'}`: `supply[t]++` (exactly `+1`, via `addToSupply(t,1)` or direct `supply[t]+=1`) SHALL be executed once, `updateHotbarUI()` SHALL be called.
     - If `t === 'freeShots'` (Free Shots +3 button when offered): `freeShots += 3` (exactly `+3`, via `addFreeShots(3)` or `freeShots = Math.max(0, freeShots+3)`) SHALL be executed once per REQ-022. No `supply` change in this branch.
     - If `t === 'areaUp'` (Area +20% button when offered): `areaUpgradeCount += 1` and `areaMultiplier = 1 + 0.2 * areaUpgradeCount` (additive, e.g., `1→1.2→1.4`) SHALL be applied per REQ-023, effective radius `getEffectiveModifierRadius()` updated, and existing modifiers' radii retroactively grown. No `supply`/`freeShots` change in this branch.
     - In all branches: `rewardClaimedFor = totalAttempts` (or add to `Set`) and `rewardMenuVisible = false` and `rewardOffered = []` cleared.
     - Menu SHALL close immediately; mouse cursor returns to `default`; normal `AIMING` input resumes. No additional placement is performed — modifier upgrades still require explicit hotbar selection; free shots are consumed automatically on next launches per REQ-022; area bonus applies immediately to modifier circles.
   - Selection SHALL be idempotent: rapid double-click SHALL only grant `+1` (or `+3` or `+20%` count) once per trigger. Random selection SHALL be distinct — no duplicate types in the same menu.

5. **Lifecycle & Persistence** per REQ-014/REQ-020/REQ-022/REQ-023:
   - `rewardMenuVisible` SHALL be `false`, `rewardClaimedFor` cleared, and `rewardOffered` cleared on **new game** (`resetGameAfterWin()` or `currentHoleIndex=0, totalAttempts=0, holeAttempts=0, freeShots=0, areaUpgradeCount=0` reset, and page reload). This causes the initial `0` reward to appear again as a new random 3-set from the 5-pool on fresh start.
   - Death resets (`resetBall()`), `R` during play, and hole advances (`advanceHole()`/`handleNextHole()`/`loadLevel(n>0)`) SHALL NOT reset `supply`/`freeShots`/`areaUpgradeCount` and SHALL NOT clear `rewardClaimedFor`/`rewardOffered` except when advancing coincides with a new qualifying `totalAttempts` value. If advancing to a new hole leaves `totalAttempts %5===0` and that value was already claimed, no second menu SHALL appear for same value.
   - `FLYING` → `AIMING` transition via `resetBall()` after OOB/obstacle SHALL evaluate trigger before next launch.
   - `freeShots` and `areaUpgradeCount` granted via menu SHALL persist per REQ-022/REQ-023 (through death and hole advances) until consumed or reset.

6. **Determinism & No External Storage**:
   - Trigger logic SHALL be `if (totalAttempts % 5 === 0 && rewardClaimedFor !== totalAttempts) showMenu()` evaluated on entry to `AIMING`. Displayed options SHALL be randomly chosen at show time using `Math.random()`; determinism across runs is not required for the random subset, but the trigger timing remains deterministic. No `localStorage` required.

## Acceptance Criteria

- [ ] On fresh page load (`totalAttempts=0`, new game) the game shows a canvas-drawn upgrade menu centered **inside the canvas** (not DOM) before any aiming: dim `rgba(0,0,0,0.55)` over green, **no white card background**, title `Choose an Upgrade` 22px bold white with dark stroke, **exactly three buttons** (not four/five) with high-contrast white labels; buttons are three distinct types randomly chosen from the pool of five `Amplify »` (orange), `Nullify ∅` (blue), `Flip ⇄` (purple), `Free Shots +3 ★` (green `#2ecc71`), `Area +20% ◯` (amber `#f39c12`), each with `+1 to supply` or `+3 free shots` or `+20% area` hint and key hints `[1]`,`[2]`,`[3]` matching left-to-right order, no `Total Attempts: 0` text.
- [ ] No white card (`fill #fff` rounded rect) is drawn for the menu; text is white/light with `stroke rgba(0,0,0,0.6-0.75)` for contrast on green/dim.
- [ ] Randomness: reloading the page 10 times at `Total=0` yields varying 3-sets over the runs (not always the same three) and never shows duplicate types within a single menu (three distinct). All five pool types appear across runs (statistical; at least once in 10). Similarly, reaching `Total=5` after 5 counted launches shows a new random 3-set independent of the `0` set. Exactly three buttons are hit-testable; the two excluded types not offered are not drawn and not clickable.
- [ ] While menu is open at `0`, pressing `Space` does NOT charge/launch, pressing `ArrowLeft`/`ArrowRight` does NOT rotate aim, hotbar `1`/`2`/`3` as placement is blocked — only menu `1`/`2`/`3` selects the offered upgrades by position (e.g., if offered is `[flip, freeShots, areaUp]`, pressing `1` grants `Flip`, `2` grants `+3 free shots`, `3` grants `Area +20%`).
- [ ] Selecting an offered `Amplify` (click on its button or press its positional key) closes the menu, `supply.amplify` becomes `1` (was `0`), other supplies, `freeShots`, and `areaUpgradeCount` unchanged, hotbar badge updates, and normal aiming resumes. Similarly selecting offered `Nullify`/`Flip` grants `+1` to that type only; selecting `Free Shots +3` (when offered) grants `+3` free shots; selecting `Area +20%` (when offered) increments `areaUpgradeCount` to `1` and `effectiveRadius` to `108` (`90*1.2`).
- [ ] After claiming at `0` and launching 5 counted shots (`totalAttempts` `1→5` if no free shots consumed), at `totalAttempts=5` and ball reset to tee, the upgrade menu appears again with a new random 3-set from the 5-pool before the 6th counted attempt.
- [ ] If `Free Shots +3` was taken, the next 3 launches consume free shots (`freeShots 3→0`) and do NOT increment `totalAttempts`; the menu for `5` is delayed until 5 counted attempts have occurred. Area bonus persists through free shots.
- [ ] Stacking Area: taking `Area +20%` at `0` gives `effectiveRadius 108`; taking it again at `5` (when randomly offered and chosen) gives `126` (`90*1.4`), not `129.6` (`90*1.44`); third intake gives `144` (`1.6×`). Verified via `getEffectiveModifierRadius()` and `getAreaMultiplier()`.
- [ ] Existing modifiers grow retroactively: place a modifier before any area upgrade (radius `90`), take `Area +20%`, verify same modifier now has effective radius `108` and `getWindAt` at `95px` now inside.
- [ ] Pressing `R` in `WIN`/`GAME_COMPLETE` (`resetGameAfterWin`) resets `totalAttempts=0`, `supply={0,0,0}`, `freeShots=0`, `areaUpgradeCount=0`/`effectiveRadius=90`, clears `rewardClaimedFor`/`rewardOffered`, and shows a new random 3-set from the 5-pool again at `0`.
- [ ] Menu selection via keyboard `1`/`2`/`3` maps to offered order left-to-right, not fixed types; verified by triggering menu twice and checking that `1` grants different types across random offers.
- [ ] Rendering verification: `drawRewardMenu(ctx, width, height, offered, hovered)` is called inside canvas with 3 buttons, arrows/HUD still drawn underneath dim, no DOM `#reward-overlay` is created; pure canvas + vanilla JS. No `Total Attempts: N` text drawn inside menu.
- [ ] No 3rd-party libraries; vanilla JS `Math.random()` shuffle 3-of-5, `totalAttempts %5`, `supply[t]++` or `freeShots+=3` or `areaUpgradeCount++` additively.

## Dependencies

- REQ-014 (attempts counter, `totalAttempts`, `handleLaunch`, `resetGameAfterWin`)
- REQ-020 (supply state, per-type counters, `supply[type]`, `addToSupply`, `canPlace`, `updateHotbarUI`)
- REQ-022 (free shots hidden counter, `freeShots`, `addFreeShots`, conditional counting)
- REQ-023 (modifier area +20% upgrade, `areaUpgradeCount`, `getEffectiveModifierRadius`, additive stacking)
- REQ-015 (modifier types, area `MODIFIER_RADIUS=90`, and hotbar, but reward menu is separate acquisition UI)
- REQ-011 (game states `AIMING`/`FLYING`/`WIN`, `resetBall`, `loadLevel`, `advanceHole`)
- REQ-012 (rendering inside canvas, HUD style, `render()` draw order)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  const POOL = ['amplify','nullify','flip','freeShots','areaUp']; // 5 possible, 3 shown
  let rewardOffered = []; // 3 random distinct
  let rewardMenuVisible = false;
  let rewardClaimedFor = null;
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
  function maybeShowRewardMenu() {
    if (totalAttempts % 5 !== 0 || rewardClaimedFor === totalAttempts || gameState !== 'AIMING' || rewardMenuVisible) return;
    rewardOffered = shuffle([...POOL]).slice(0,3); // 3 random of 5
    rewardMenuVisible = true;
  }
  function claimReward(type){
    if(!rewardMenuVisible || !rewardOffered.includes(type)) return;
    if(type==='freeShots') addFreeShots(3);
    else if(type==='areaUp') {
      areaUpgradeCount++; // additive: multiplier = 1 + 0.2*count
      // update existing modifiers radius: modifiers.forEach(m=>m.radius=getEffectiveModifierRadius())
    } else addToSupply(type, 1);
    rewardClaimedFor = totalAttempts;
    rewardMenuVisible = false;
    rewardOffered = [];
  }
  // Keyboard 1→rewardOffered[0], 2→rewardOffered[1], 3→rewardOffered[2]
  // getRewardButtonsLayout(width,height, offered) returns 3 rects for offered types
  // drawRewardMenu(ctx,W,H, offered, hovered) draws exactly 3 buttons for offered
  // No white card; title "Choose an Upgrade" white with stroke; no totalAttempts text.
  ```
- Mouse hit-testing: define `getRewardButtonsLayout(width,height, offered)` returning three `Rect {x,y,w,h,type}` for the current random offered set, same coords used for `drawRewardMenu` and `click` detection.
- If the game ever shows both `WIN` overlay (DOM) and reward menu (canvas), `WIN` takes precedence; reward for the winning counted attempt (if it was a `5`/`10`) SHALL appear after `Next`/`R` advances to next hole and enters `AIMING`.
- A11y: canvas text `Choose an Upgrade` 22px bold white with `stroke rgba(0,0,0,0.75) 5px` for readability on `#3a9d23` dim, same strategy as HUD.
- Area upgrade: additive formula ensures 2 stacks = `1.4×` (126px) not `1.44×` (129.6px); verify via `getAreaMultiplier()===1.4`.

## File Paths

- `src/main.js:1` (POOL 5 with areaUp, rewardOffered 3-of-5, rewardMenuVisible, rewardClaimedFor, shuffle+maybeShow, claimReward with areaUp +20% additive, areaUpgradeCount, getEffectiveModifierRadius, handleLaunch counting per REQ-022, resetGameAfterWin clear)
- `src/render.js:1` (drawRewardMenu - no white background, title Choose an Upgrade, getRewardButtonsLayout(offered) returns 3 buttons including Area +20% when offered, high-contrast white text)
- `src/vectorField.js:1` (getWindAt uses effective radius via mod.radius)
- `index.html:1` (no DOM overlay for reward; canvas-only, hotbar remains)
- `style.css:1` (no new CSS needed for canvas menu)

