# REQ-022: Free Shots Hidden Counter

- **ID:** REQ-022
- **Title:** Free Shots Hidden Counter - Conditional Attempt Counting
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Game States, Attempts Tracking (REQ-014 Extension), Upgrade Reward

## Description
The game SHALL maintain a hidden counter of free shots `freeShots: number`. When a new shot is made (`handleLaunch` on successful `launchBall`), the free shots counter SHALL decrease by one if it is greater than `0`. If the free shots counter is already at `0`, then the attempt counters (`holeAttempts` and `totalAttempts` per REQ-014) **and the secret reward counter** (per REQ-021) SHALL be increased by one as normal. The free shots counter is hidden — it SHALL NOT be rendered in the HUD or win overlay. The free shots counter SHALL be increased by three when the `Free Shots +3` upgrade reward is taken — this upgrade appears as one of the six possible random upgrades in the reward menu (REQ-021/REQ-023/REQ-024), where each menu trigger randomly shows three distinct options out of the pool `Amplify`/`Nullify`/`Flip`/`Free Shots +3`/`Area +20%`/`Bouncy Ball +1`.

## Rationale
Free shots allow granting the player attempts that do not penalize `Attempts`/`Total` (per REQ-014) and do not increment the **secret reward counter** (per REQ-021) that drives the reward menu. Making the counter hidden keeps the HUD simple while preserving a deterministic deduction rule: free shots are always consumed first. Tying the `Free Shots +3` grant to the random 3-of-6 reward menu (pool now includes `Area +20%` per REQ-023 and `Bouncy Ball +1` per REQ-024) makes it a variable, non-guaranteed option — the player must adapt to the random offer, and the `+3` grant (when offered and chosen) becomes the canonical way to acquire free shots alongside debug grants. No reward menu appears before the first attempt on the first hole; on each subsequent hole a reward menu appears before the first attempt; first reward on hole 1 only after 5 counted shots per REQ-021; subsequent holes have a reward before first attempt and then every 5 counted shots with counter resetting per hole.

## Requirements

1. **State** in `src/main.js`:
   - SHALL include `freeShots: number` initialized to `0` on **new game**: page load / `initLevel()` with `currentHoleIndex===0`, `resetGameAfterWin()` (press `R` in `WIN`/`GAME_COMPLETE`), `startNewGameFromMain()` (REQ-029), `endRun()` (REQ-029), `clearProgress()` (REQ-027), and full page reload.
   - `freeShots` SHALL be clamped to `>=0` at all times (never negative). Decrement SHALL use `Math.max(0, freeShots-1)` or guard `if (freeShots>0)`. Increment via upgrade SHALL use `freeShots = Math.max(0, freeShots+3)` (or `addFreeShots(3)`).
   - Type SHALL be integer. Initial value `0` means normal counting until grants are added via random upgrade or debug.
   - The counter SHALL be **hidden**: `drawHUD()` in `src/render.js` SHALL NOT display it, and the win overlay (`#win-overlay`) SHALL still show only `Hole N/M - Attempts this hole: X, Total: Y` per REQ-014. No DOM element for free shots SHALL be created. For test/debug, exposure via `window.__getFreeShots()` / `getFreeShots()` is allowed but not visible to the player.

2. **Launch Deduction Logic** in `src/main.js:handleLaunch(angle, power)`:
   - On each successful launch (guard `gameState === "AIMING" || gameState === "CHARGING"` and `!rewardMenuVisible` per REQ-021, exactly one `launchBall(angle,power)` call):
     ```js
     if (freeShots > 0) {
       freeShots = Math.max(0, freeShots - 1);
       // do NOT increment holeAttempts / totalAttempts / attempts
       // still call updateAttemptsUI() so HUD stays consistent (counters unchanged)
       // still call maybeShowRewardMenu() check? No trigger because totalAttempts unchanged
     } else {
       holeAttempts += 1;
       totalAttempts += 1;
       attempts = totalAttempts;
     }
     // in both branches: launchBall, gameState="FLYING", resetCharge, updateAttemptsUI, updateForceBar
     ```
   - The decrement or increment SHALL happen **exactly once** per launch. Pressing `R` to reset without launching SHALL NOT decrement `freeShots` nor increment attempts. Dying (obstacle/edge, `resetBall()`) SHALL NOT decrement/ increment beyond the launch that caused it.
   - `freeShots` decrement and attempt increment are mutually exclusive per launch: never both on the same shot.

3. **Upgrade Grant `Free Shots +3` (Random)** in `src/main.js:claimReward(type)` per REQ-021/REQ-023/REQ-024:
   - The pool of possible upgrades SHALL be `['amplify','nullify','flip','freeShots','areaUp','bouncyBall']` (six types including `Area +20%` per REQ-023 and `Bouncy Ball +1` per REQ-024). For each reward trigger (REQ-021 secret counter reaching `5` and reset to `0`), three distinct types SHALL be randomly selected via `Math.random()` shuffle without duplication; only those three SHALL be displayed. The three excluded types SHALL not be grantable in that trigger. There is no initial reward before the first attempt.
   - When the reward menu is visible and the `Free Shots +3` option **is among the three offered** and is selected (click on its button or press its positional key `1`/`2`/`3` corresponding to its left-to-right position), the handler SHALL execute `freeShots += 3` (exactly `+3`, via `addFreeShots(3)` or `freeShots = Math.max(0, freeShots+3)`), exactly once per reward trigger. If `Free Shots +3` is not among the offered three, it SHALL not be selectable and `freeShots` SHALL not change that trigger.
   - This grant SHALL NOT affect `supply` in the same selection; the two mutation paths (modifier `+1` vs free shots `+3`) are mutually exclusive per selection and per the random offer (only one type chosen).
   - The grant SHALL respect clamping (`>=0`) and integer type. Adding `+3` to an existing `freeShots=1` SHALL result in `4`; adding to `0` SHALL result in `3`. Randomness does not affect the `+3` amount.
   - After granting (or any modifier grant), `rewardMenuVisible = false`, and `rewardOffered = []` per REQ-021.

4. **Interaction with Attempts & Random Reward** (REQ-014, REQ-021):
   - `totalAttempts` SHALL only increase when `freeShots === 0` at launch time. Therefore a free shot does **not** increment the **secret reward counter** (per REQ-021) nor the reward menu schedule and does not affect `drawHUD` `Total` or `Attempts` values. The secret counter is only increased on counted shots (non-free shots).
   - `holeAttempts` likewise only increases when `freeShots === 0`. Win overlay per-hole attempts SHALL reflect only counted attempts, not free shots.
   - The `Free Shots +3` reward, when offered randomly and taken, therefore **delays** the next reward menu by 3 counted attempts (since those 3 launches are free and do not increment the secret counter). Because the offer is random (3-of-6), the delay is non-guaranteed — the player may not be offered free shots on a given trigger.

5. **Persistence & Lifecycle** per REQ-011/REQ-014/REQ-020:
   - `freeShots` SHALL **persist** through death resets (`resetBall()` on obstacle/OOB) and through `R` during play (ball reset without scoring) — those SHALL NOT reset `freeShots`.
   - `freeShots` SHALL **persist** across hole advances (`advanceHole()` / `handleNextHole()` / `loadLevel(n>0)`) — advancing SHALL NOT reset `freeShots` (similar to `supply` in REQ-020). Only a new game reset SHALL zero it.
   - `freeShots` SHALL be deterministic per run apart from random menu offers; reloading the hole SHALL NOT replenish it. No `localStorage` required beyond REQ-027. Random selection for reward offers SHALL use `Math.random()` each trigger; no seeding required.

6. **API for Grants (Testing/Future)** in `src/main.js`:
   - SHALL expose helper `addFreeShots(n=1)` / `setFreeShots(v)` / `getFreeShots()` that clamps to `>=0` and is callable via `window.__addFreeShots` for manual grants and tests. The `Free Shots +3` upgrade SHALL use `addFreeShots(3)` internally when its randomly offered button is selected. For testing the random offer, a helper `getRewardOffered()` / `window.__getRewardOffered()` SHALL expose the current three offered types.

7. **No External Storage & No Rendering**:
   - No modification to `src/render.js:drawHUD` or win overlay DOM is required except ensuring `freeShots` is not rendered. HUD still draws `Hole`, `Attempts`, `Total` per REQ-014. The upgrade button for `Free Shots +3` is rendered inside `drawRewardMenu` per REQ-021 only when randomly offered (green `#2ecc71`, icon `★`, label `Free Shots`).

## Acceptance Criteria

- [ ] On fresh page load (new game) hidden `freeShots` is `0` (`getFreeShots() === 0`), HUD shows `Attempts: 0` `Total: 0`, and **no reward menu is visible** (`rewardMenuVisible===false`). Supply is `{1,1,1}` and hotbar shows one of each enabled, not all `0` disabled.
- [ ] With `freeShots===0`, launching once makes `freeShots` stay `0`, `holeAttempts` becomes `1`, `totalAttempts` becomes `1`, HUD updates to `Attempts 1` `Total 1`.
- [ ] Programmatically set `freeShots=2`, HUD still `1/1`. Launch once: `freeShots` becomes `1`, counters stay `1/1`, HUD unchanged. Launch second time: `freeShots` becomes `0`, counters still `1/1`. Launch third time with `0`: `holeAttempts` becomes `2`, `totalAttempts` becomes `2`, HUD updates to `2/2`.
- [ ] **Upgrade grant `Free Shots +3` (random)**: after 5 counted shots (`Total=5`, `secretRewardCounter 0→5→0`) upgrade menu shows three random options from the 6-pool. If `Free Shots +3` is among them (appears in ~50% of triggers statistically, 3-of-6), clicking its button (green `★`) or pressing its positional `1`/`2`/`3` closes menu, `freeShots` becomes `3`, `supply` remains as before, `areaUpgradeCount` remains `0`, `Total` still `5`. If it is not among the offered three, it cannot be selected and `freeShots` stays `0` — the player must wait for a future random offer where it appears.
- [ ] After a `Free Shots +3` grant that was offered and taken (e.g., after first reward), next 3 launches consume free shots (`freeShots 3→2→1→0`) with counters staying at that `Total`; fourth launch (now `0`) becomes counted `Attempts` and `Total` increment by `1`.
- [ ] With `freeShots=1` remaining and, at `Total=10` (second trigger), a new random 3-set is offered that includes `Free Shots +3` and it is chosen, `freeShots` becomes `4` (`1+3`), not `3` — exactly `+3` additive.
- [ ] Randomness: after 5 counted shots, menu shows exactly 3 distinct types; across 12 runs all six pool types appear at least once statistically, and no menu ever shows 4/5 buttons or duplicate types. At `Total=10` after another 5 counted launches, the new random 3-set is independent of the previous set.
- [ ] Rapid double-launch is one deduction/increment per launch. Pressing `R` without launch does NOT decrement `freeShots` nor increment counters.
- [ ] Dying (`resetBall()`) does NOT decrement `freeShots` beyond the launch; `freeShots` persists after reset.
- [ ] Advancing hole (`handleNextHole()`) does NOT reset `freeShots`: if `freeShots=1` before win, after advancing still `1`. Secret reward counter **SHALL** reset to `0` on hole advance and a reward menu SHALL appear before first attempt on the new hole (when `currentHoleIndex>0`).
- [ ] Pressing `R` in `WIN`/`GAME_COMPLETE` (`resetGameAfterWin()`), `startNewGameFromMain`, or `endRun` resets `freeShots` to `0` together with `holeAttempts=0, totalAttempts=0`; HUD returns to `0/0`; next menu requires 5 counted shots again.
- [ ] `freeShots` is hidden: canvas top bar still shows only `Hole: N/M` `Attempts: X` `Total: Y`, win overlay shows only hole/total, no `Free Shots` text in DOM or HUD (only inside upgrade menu button when randomly offered). `window.__getFreeShots()` still returns correct value.
 - [ ] When `freeShots` consumes a shot that would have been a counted shot toward the secret counter, the reward menu does **not** appear and the secret counter does **not** increment: e.g., `secretRewardCounter=4, Total=4, freeShots=1`, launch (free) → `freeShots=0, secretRewardCounter stays 4, Total=4`, no menu; next counted launch → `secretRewardCounter 4→5 → reset to 0, Total=5` then menu appears with new random 3-set at next `AIMING`.
- [ ] `freeShots` never negative: launch at `0` stays `0`; `addFreeShots(-5)` or `setFreeShots(-3)` clamps to `0`.
- [ ] No 3rd-party libraries; pure vanilla JS `Math.random()` shuffle for 3-of-6 offer, `freeShots` integer and branching.

## Dependencies

- REQ-014 (attempts counter, `holeAttempts`, `totalAttempts`, `handleLaunch`, `resetGameAfterWin`, HUD)
- REQ-011 (game states `AIMING`/`CHARGING`/`FLYING`/`WIN`, `resetBall`, `loadLevel`)
- REQ-021 (upgrade reward menu with 3-random-of-6 options including `Free Shots +3` and `Area +20%`, trigger secret counter `5`, `claimReward` branching, `rewardOffered` random)
- REQ-020 (supply coexistence; free shots grant does not affect supply)
- REQ-023 (modifier area +20% coexistence; pool now 6, free shots offer competes with area)
- REQ-012 (HUD inside canvas, hidden counter must not be drawn)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let freeShots = 0;
  function getFreeShots(){ return freeShots; }
  function setFreeShots(v){ freeShots = Math.max(0, Math.floor(v)); }
  function addFreeShots(n=1){ freeShots = Math.max(0, freeShots + Math.floor(n)); }

  const POOL = ['amplify','nullify','flip','freeShots','areaUp','bouncyBall']; // now 6 with Area +20% and Bouncy Ball per REQ-023/REQ-024
  let rewardOffered = [];
  let secretRewardCounter = 0; // hidden 0..4 per REQ-021, not rendered
  let rewardPending = false;
  function getSecretRewardCounter(){ return secretRewardCounter; }
  function maybeShowRewardMenu(){
    if(rewardMenuVisible) return;
    if(gameState!=='AIMING' && gameState!=='CHARGING') return;
    if(rewardPending){
      rewardOffered = [...POOL].sort(()=>Math.random()-0.5).slice(0,3); // 3-of-6
      rewardMenuVisible = true; rewardPending = false;
      return;
    }
  }
  function handleLaunch(angle, power){
    if(rewardMenuVisible) return;
    if(gameState!=="AIMING" && gameState!=="CHARGING") return;
    launchBall(angle,power);
    if(freeShots > 0){
      freeShots = Math.max(0, freeShots - 1);
      // secretRewardCounter NOT incremented - free shots delay reward
    } else {
      holeAttempts+=1; totalAttempts+=1; attempts=totalAttempts;
      secretRewardCounter++;
      if(secretRewardCounter >= 5){ secretRewardCounter = 0; rewardPending = true; }
    }
    updateAttemptsUI(); gameState="FLYING"; resetCharge(); updateForceBar();
  }
  function claimReward(type){
    if(!rewardMenuVisible || !rewardOffered.includes(type)) return;
    if(type==='freeShots') addFreeShots(3);
    else if(type==='areaUp') addAreaUpgrade(1);
    else if(type==='bouncyBall') addBouncyBall(1);
    else addToSupply(type,1);
    rewardMenuVisible=false; rewardOffered=[];
  }
  // Keyboard 1→rewardOffered[0], 2→rewardOffered[1], 3→rewardOffered[2]
  // getRewardButtonsLayout(W,H, offered) returns 3 rects for offered
  ```
- Random offer is verified by checking `getRewardOffered().length===3`, distinct, subset of pool, changes across triggers.

## File Paths

- `src/main.js:1` (POOL, rewardOffered random 3-of-6, freeShots state, getFreeShots/setFreeShots/addFreeShots, handleLaunch branching, claimReward freeShots+3 branch when offered, initLevel/resetGameAfterWin/startNewGameFromMain/endRun/clearProgress reset, persistence)
- `src/render.js:1` (drawRewardMenu with 3 buttons for offered set, no HUD modification, Free Shots +3 button when offered green `#2ecc71`)
- `src/input.js:1` (unchanged)
- `index.html:1` (no DOM for freeShots)
- `style.css:1` (no styling needed)
