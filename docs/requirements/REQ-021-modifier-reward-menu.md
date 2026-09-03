# REQ-021: Modifier Reward Menu via Secret Counter

- **ID:** REQ-021
- **Title:** Upgrade Reward Menu via Secret Counter (Inside Canvas)
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Reward / Inventory Acquisition

## Description
The player SHALL be presented with a menu **inside the canvas** to select one of three upgrade options **randomly chosen** from the six possible upgrades (`Amplify`, `Nullify`, `Flip`, `Free Shots +3`, `Area +20%`, `Bouncy Ball +1`). The pool SHALL be `['amplify','nullify','flip','freeShots','areaUp','bouncyBall']`. For each menu trigger, three distinct options SHALL be randomly selected from this pool (uniformly, without duplication) and displayed. When a modifier option (`Amplify`/`Nullify`/`Flip`) is selected, the supply of that modifier type (per REQ-020 `supply = {amplify, nullify, flip}`) SHALL increase by one and the menu SHALL close. When `Free Shots +3` is selected (when it is among the three offered), the hidden free shots counter (per REQ-022 `freeShots`) SHALL increase by three and the menu SHALL close. When `Area +20%` is selected (when it is among the three offered), all modifier areas SHALL increase by 20% of the base area per REQ-023 (stacking additively) and the menu SHALL close. When `Bouncy Ball +1` is selected (when it is among the three offered), the bouncy ball counter per REQ-024 SHALL increase by one and the menu SHALL close. **Per REQ-025, while the menu is visible a `Re-roll` button SHALL also be shown; when clicked (or `R` pressed) the three options SHALL be randomly populated again with a new 3-set from the same 6-pool and the attempt counters SHALL be increased by one per REQ-025 (hole/total +1, secret counter unchanged, free shots not consumed).** After any selection the game SHALL return to normal `AIMING` input. The trigger for the menu SHALL be driven by a **secret hidden counter** (see Requirements 1), not by `totalAttempts % 5`. No reward menu SHALL appear before the first attempt on the first hole; on each subsequent hole (hole index >0) a reward menu SHALL appear before the first attempt immediately upon entering that hole's AIMING state, before the player can aim/charge/place. In addition, during a hole the reward menu SHALL appear after every 5 counted shots (secret counter 0→5→0) at the next entry into AIMING.

## Rationale
Supply starts with one of each per REQ-020 (`{1,1,1}`), so the player can place immediately. A periodic reward driven by a **secret counter** that only advances on *counted* shots (non-free shots) gives a deterministic, performance-tied acquisition loop that is intentionally hidden from the player: the HUD remains simple (`Hole/Attempts/Total`) while progression still rewards persistence. The `Free Shots +3` upgrade therefore delays the next reward because free shots do not increment the secret counter (per REQ-022). The `Area +20%` (REQ-023) and `Bouncy Ball +1` (REQ-024) upgrades add field-shaping and resilience progression. Showing only **three random options out of six** adds variety and choice tension — the player cannot always pick the same upgrade, and over multiple triggers all upgrades remain obtainable. Presenting inside the canvas (not DOM overlay) preserves static-hosting, canvas-centric style and, per updated UI, uses no white card background but high-contrast colored text on the green fairway. No award is given before the first attempt on the first hole; on each subsequent hole an award is given before the first attempt so the player starts each new hole with a choice. During a hole, progression continues after every 5 counted shots.

## Requirements

1. **Trigger Condition via Secret Counter** in `src/main.js`:
   - The game SHALL maintain a **secret hidden counter** `secretRewardCounter: number` (integer `0..4`, hidden, never rendered in HUD or win overlay). It SHALL be initialized to `0` on **new game**: page load / `initLevel()` with `currentHoleIndex===0`, `resetGameAfterWin()` (press `R` in `WIN`/`GAME_COMPLETE`), `startNewGameFromMain()` (REQ-029), `endRun()` (REQ-029), `clearProgress()` (REQ-027), and full page reload. Debug exposure via `window.__getSecretRewardCounter()` / `getSecretRewardCounter()` is allowed but not visible to the player.
   - The secret counter SHALL be **increased by one exactly once per counted shot**, i.e., whenever the player makes a shot that is **not counted as a free shot** (per REQ-022: `freeShots === 0` at `handleLaunch()` time, so `holeAttempts`/`totalAttempts` are incremented). Shots that consume a free shot (`freeShots > 0` → `freeShots--`, no `totalAttempts` increment) SHALL **NOT** increment the secret counter.
   - If after increment the secret counter **reaches `5`**, it SHALL be **reset back to `0`** and the reward menu SHALL be queued to be shown at the **next entry into `AIMING`** (before the player can aim/charge/place the next shot). The menu SHALL appear as a blocking canvas overlay.
   - The menu SHALL NOT trigger mid-flight (`FLYING`) or while `WIN` overlay is shown. It SHALL be evaluated whenever `gameState` transitions to `AIMING` (e.g., after `resetBall()` on death/OOB, after `R` during play, or after advancing hole) and the secret counter has just been reset to `0` after reaching `5`. If a reward is pending, it SHALL be offered **exactly once** before next launch; re-entering `AIMING` without a new counted shot (e.g., pressing `R` which does not increment the secret counter) SHALL NOT re-trigger.
   - The secret counter SHALL **persist** through death resets (`resetBall()` on obstacle/OOB) and `R` during play — those SHALL NOT reset it. The counter SHALL be **reset to `0` on each hole advance** (`advanceHole()`/`handleNextHole()`/`loadLevel(n>0)` where `n>0`); the reset is accompanied by queuing a reward menu before the first attempt on that new hole when `currentHoleIndex>0` (see next bullet). Reaching `5` also resets to `0` + shows menu, and **new game** (`currentHoleIndex===0`) resets to `0` with no pending menu on the first hole. No `localStorage` required beyond REQ-027 persistence.
   - `totalAttempts` (REQ-014) SHALL continue to be the displayed attempts counter and SHALL be incremented only on counted shots (same condition as secret counter), but the **trigger** for the reward menu SHALL be the **secret counter**, not `totalAttempts % 5`. The two counters advance in lock-step on counted shots, but the secret counter cycles `0→5→0` while `totalAttempts` is monotonic.
   - There SHALL be **no special trigger before the first counted shot on the first hole**. New game (first hole, `currentHoleIndex===0`) SHALL start with `rewardMenuVisible=false`, `rewardPending=false`, and no pending reward; `maybeShowRewardMenu()` SHALL NOT show a menu when `totalAttempts===0` and `secretRewardCounter===0` on hole 1. On each subsequent hole (`currentHoleIndex>0`), `rewardPending` SHALL be set to `true` immediately upon `loadLevel(n)`/`advanceHole()` and `maybeShowRewardMenu()` SHALL show the reward menu before the first attempt on that hole, with `secretRewardCounter===0` at hole entry.

2. **Menu State, Random Selection & Blocking** in `src/main.js`:
   - State SHALL be `rewardMenuVisible: boolean`, `rewardPending: boolean`, `rewardOffered: string[]` (length `3`, distinct types from pool `['amplify','nullify','flip','freeShots','areaUp','bouncyBall']`), and **`rewardRerolled: boolean` per REQ-025** (`false` when menu freshly shown, `true` after one re-roll, reset on each new menu trigger). On each trigger (secret counter reached `5` and reset), `rewardOffered` SHALL be populated by uniform random selection without replacement: e.g., `pool=[...]; shuffle via Fisher-Yates with Math.random(); offered=pool.slice(0,3)` and `rewardRerolled = false`.
   - Randomness SHALL use `Math.random()` (no external library) and SHALL guarantee three distinct values per menu; the three excluded types SHALL not be shown in that trigger. Over many triggers all six types SHALL be possible to appear.
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
       - If `bouncyBall` is among offered: `Bouncy Ball +1` border `rgba(26,188,156,0.9)` 2px, fill `rgba(26,188,156,0.28)` (hover `0.38`), icon `◎` 22-24px `#1abc9c` with dark outline `rgba(0,0,0,0.65) 4px`, label `Bouncy Ball +1` 11px white with stroke (use `11px` for length), hint `+1 bounce` 11px `rgba(255,255,255,0.95)` with stroke.
      - Each displayed button SHALL use the same styling as above; the three excluded types SHALL not be drawn.
      - All button text SHALL use high-contrast white/light colors with dark stroke/shadow (e.g., `stroke rgba(0,0,0,0.75)`) to remain readable on `rgba(0,0,0,0.55)` dim over green fairway, not dark `#222` on white.
      - Buttons SHALL show hover feedback when mouse is over: brightened fill (`0.38`), `cursor pointer`, optional shadow.
      - **Re-roll button** (per REQ-025): When `rewardMenuVisible === true`, a **Re-roll button** SHALL also be shown centered below the three option buttons, e.g., `110×28` at `(width/2 -55, cardY+155)` inside the `340×220` card (below the `90×110` cards). Visual when **available** (`rewardRerolled===false`): border `rgba(255,255,255,0.85)` `1.5px`, fill `rgba(255,255,255,0.12)` (hover `0.22`), icon `↻` 14px white, label `Re-roll` 12px `700` white with `stroke rgba(0,0,0,0.65) 3px`, cost hint `(1 attempt)` 10px `rgba(255,255,255,0.85)`, key hint `[R]` 10px; hover brightens fill and shows `cursor pointer`. When **used** (`rewardRerolled===true`): disabled fill `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.35)`, text `rgba(255,255,255,0.45)`, `cursor not-allowed`, or hidden. Click inside its logical rect or pressing `R`/`r` (`KeyR`) while menu visible and not yet rerolled SHALL trigger `rerollReward()` per REQ-025: immediately increment `holeAttempts` and `totalAttempts` by `+1` (updating HUD, **not** consuming `freeShots` even if `freeShots>0`, **not** incrementing `secretRewardCounter`), set `rewardRerolled=true`, and replace `rewardOffered` with a **new** random 3-set from the same 6-pool (uniform without replacement, may by chance equal previous set, no guarantee of difference). The new offer SHALL be hit-testable via `1`/`2`/`3` as before. The re-roll SHALL be allowed **only once per menu**; second click/`R` does nothing, does not cost again, and does not change `rewardOffered`.
    - Font hierarchy SHALL use `system-ui` only, no external assets, consistent with REQ-012.

4. **Selection & Mutation** in `src/main.js` + `src/render.js` hit-testing:
   - The three displayed options (derived from `rewardOffered`) SHALL be selectable by **left-click inside canvas** on the button rectangles. Hit-testing SHALL be done in logical canvas coordinates (`900×600`) via `getCanvasMousePos()` same as modifier placement, mapping click to offered index.
   - Keyboard `1` → first offered, `2` → second offered, `3` → third offered SHALL select while menu is open (order is left-to-right offered order, randomized per trigger). Fixed mapping `1=amplify` SHALL NOT be used; the key selects by position in the current random set.
   - On selection:
     - If `t in {'amplify','nullify','flip'}`: `supply[t]++` (exactly `+1`, via `addToSupply(t,1)` or direct `supply[t]+=1`) SHALL be executed once, `updateHotbarUI()` SHALL be called.
     - If `t === 'freeShots'` (Free Shots +3 button when offered): `freeShots += 3` (exactly `+3`, via `addFreeShots(3)` or `freeShots = Math.max(0, freeShots+3)`) SHALL be executed once per REQ-022. No `supply` change in this branch.
     - If `t === 'areaUp'` (Area +20% button when offered): `areaUpgradeCount += 1` and `areaMultiplier = 1 + 0.2 * areaUpgradeCount` (additive, e.g., `1→1.2→1.4`) SHALL be applied per REQ-023, effective radius `getEffectiveModifierRadius()` updated, and existing modifiers' radii retroactively grown. No `supply`/`freeShots` change in this branch.
     - If `t === 'bouncyBall'` (Bouncy Ball +1 button when offered): `bouncyBallCount += 1` (exactly `+1`) SHALL be applied per REQ-024, `bouncyRemaining` re-initialized. No `supply`/`freeShots`/`area` change in this branch.
     - In all branches: the pending reward flag SHALL be cleared (e.g., `rewardPending = false`) and `rewardMenuVisible = false` and `rewardOffered = []` cleared. The secret counter SHALL remain at `0` after the trigger that just was claimed; it will start counting again from `0` on next counted shots.
     - Menu SHALL close immediately; mouse cursor returns to `default`; normal `AIMING` input resumes. No additional placement is performed — modifier upgrades still require explicit hotbar selection; free shots are consumed automatically on next launches per REQ-022; area bonus applies immediately to modifier circles; bouncy bonus applies to next attempts per REQ-024.
   - Selection SHALL be idempotent: rapid double-click SHALL only grant `+1` (or `+3` or `+20%` or `+1 bounce`) once per trigger. Random selection SHALL be distinct — no duplicate types in the same menu.

5. **Re-roll Button & Counters (REQ-025)** in `src/main.js` / `src/render.js`:
   - While `rewardMenuVisible === true` and `rewardRerolled === false`, the player SHALL be able to re-roll exactly once per menu via **click on the Re-roll button** (hit-tested via `getRewardRerollButtonLayout(width,height)` `110×28` rect) or pressing `R`/`r` (`KeyR`) while the menu is visible. `R` during normal play (no menu) SHALL remain `resetBall`/`handleNextHole` per REQ-011; only when `rewardMenuVisible` SHALL `R` mean re-roll.
   - On re-roll, `rerollReward()` SHALL execute exactly once: `holeAttempts += 1; totalAttempts += 1; attempts = totalAttempts; updateAttemptsUI();` **but SHALL NOT** increment `secretRewardCounter` (so it does **not** advance towards the next reward) and **SHALL NOT** decrement `freeShots` even if `freeShots>0` (free shots cannot be used for re-rolls per REQ-025, it always costs an attempt). The secret counter stays at its pre-reroll value (e.g., `0` after a `5→0` trigger).
   - The three offered options SHALL be **randomly populated again** with a new distinct 3-set from the same 6-pool (`shuffle([...POOL]).slice(0,3)`), replacing `rewardOffered`; `rewardRerolled` becomes `true`, `rewardMenuHover` cleared, menu stays visible. The new offer SHALL be selectable via `1`/`2`/`3` or click as before.
   - After `rewardRerolled === true`, the Re-roll button SHALL become disabled (`rgba(255,255,255,0.06)` fill, `not-allowed` cursor, or hidden) and a second click/`R` SHALL do nothing (no second cost, `rewardOffered` unchanged, counters unchanged). The flag SHALL be reset to `false` only when the next reward menu is newly triggered (secret counter reached `5` again) and SHALL also be cleared on new game (`resetGameAfterWin`, `startNewGameFromMain`, `endRun`, `clearProgress`, `initLevel` with `currentHoleIndex===0`, page reload) alongside other reward state.

6. **Lifecycle & Persistence** per REQ-014/REQ-020/REQ-022/REQ-023/REQ-024:
   - `rewardMenuVisible` SHALL be `false`, `rewardOffered` cleared, `rewardPending=false`, and secret counter `secretRewardCounter = 0` on **new game starting at hole 1** (`resetGameAfterWin()` or `currentHoleIndex=0, totalAttempts=0, holeAttempts=0, freeShots=0, areaUpgradeCount=0, bouncyBallCount=0` reset, `startNewGameFromMain`, `endRun`, `clearProgress`, and page reload). No initial reward menu SHALL be shown on hole 1; the next menu requires 5 counted shots on that hole. On each hole advance to `n>0`, `secretRewardCounter` SHALL be reset to `0` and `rewardPending` set to `true` so a menu appears before the first attempt on that new hole, then `rewardPending` cleared after showing.
   - Death resets (`resetBall()`) and `R` during play SHALL NOT reset `supply`/`freeShots`/`areaUpgradeCount`/`bouncyBallCount` and SHALL NOT alter `secretRewardCounter` except for the increment-on-counted-shot rule and the per-hole reset. Hole advances (`advanceHole()`/`handleNextHole()`/`loadLevel(n>0)`) SHALL reset `secretRewardCounter` to `0` and queue a reward menu before the first attempt on the new hole (when `currentHoleIndex>0`), regardless of prior count. If a counted shot caused the counter to reach `5` on the previous hole and reset to `0`, the pending menu is consumed by the per-hole menu on the new hole (no double menu). Upgrades (`freeShots`/`area`/`bouncy`) themselves persist across holes until consumed or reset.
   - `FLYING` → `AIMING` transition via `resetBall()` after OOB/obstacle SHALL be the point where the pending reward (if secret counter just hit `5`) is evaluated before next launch.
   - `freeShots`, `areaUpgradeCount`, `bouncyBallCount` granted via menu SHALL persist per REQ-022/REQ-023/REQ-024 (through death and hole advances) until consumed or reset. The secret counter itself ALSO persists (except for reset to `0` on reaching `5` and on new game).

7. **Determinism & No External Storage**:
   - Trigger logic SHALL be based on the **secret counter**, not `totalAttempts % 5`. Pseudocode:
     ```js
     let secretRewardCounter = 0; // hidden 0..4
     let rewardPending = false;
     function maybeShowRewardMenu() {
       if (gameState !== 'AIMING' && gameState !== 'CHARGING') return;
       if (rewardMenuVisible) return;
       if (rewardPending) {
         rewardOffered = shuffle([...POOL]).slice(0,3);
         rewardMenuVisible = true;
         rewardPending = false;
       }
     }
     function handleLaunch(angle,power){
       if (rewardMenuVisible) return;
       // ... launchBall ...
       if (freeShots > 0) {
         freeShots--;
       } else {
         holeAttempts++; totalAttempts++;
         secretRewardCounter++;
         if (secretRewardCounter >= 5) {
           secretRewardCounter = 0;
           rewardPending = true;
         }
       }
       // ... gameState="FLYING" ...
     }
     function claimReward(type){
       // ... apply supply/freeShots/area/bouncy ...
       rewardMenuVisible = false;
       rewardOffered = [];
       // secretRewardCounter already 0 after the 5th counted shot
     }
     // New game: secretRewardCounter=0; rewardPending=false; rewardMenuVisible=false; no initial menu
     ```
     Displayed options SHALL be randomly chosen at show time using `Math.random()`; determinism across runs is not required for the random subset, but the trigger timing (every 5 counted shots) remains deterministic. No `localStorage` required outside REQ-027. `totalAttempts` display still increments only on counted shots, in lock-step with secret counter, but the counter cycles independently.

## Acceptance Criteria

- [ ] On fresh page load (new game, `secretRewardCounter=0`, `totalAttempts=0`, `supply={1,1,1}`) the game does **NOT** show a reward menu before the first attempt on **hole 1**. Canvas shows fairway with HUD `Total:0` and no dim overlay; `rewardMenuVisible===false`, `rewardPending===false`, hover/mouse is in aiming mode and hotbar shows `1` for each modifier on hole 1. Supply is `{1,1,1}` and one of each modifier can be placed immediately. After advancing to **hole 2** (clearing hole 1), a reward menu **SHALL** appear before the first attempt on hole 2 with `secretRewardCounter===0` at hole entry.
- [ ] No white card (`fill #fff` rounded rect) is drawn for the menu; text is white/light with `stroke rgba(0,0,0,0.6-0.75)` for contrast on green/dim.
- [ ] Randomness: reaching the first trigger after 5 counted shots shows a random 3-set from the 6-pool (three distinct, without duplication). Reloading and completing 5 counted shots repeatedly yields varying 3-sets over runs and never shows duplicate types within a single menu. All six pool types appear across many triggers (statistical). Exactly three buttons are hit-testable; the three excluded types not offered are not drawn and not clickable.
- [ ] While menu is open (after 5 counted shots), pressing `Space` does NOT charge/launch, pressing `ArrowLeft`/`ArrowRight` does NOT rotate aim, hotbar `1`/`2`/`3` as placement is blocked — only menu `1`/`2`/`3` selects the offered upgrades by position (e.g., if offered is `[flip, freeShots, areaUp]`, pressing `1` grants `Flip`, `2` grants `+3 free shots`, `3` grants `Area +20%`).
- [ ] Selecting an offered `Amplify` (click on its button or press its positional key) after the 5-shot trigger closes the menu, `supply.amplify` increments by `1` (e.g., from `1` to `2`), other supplies, `freeShots`, `areaUpgradeCount`, `bouncyBallCount` and `secretRewardCounter` (still `0`) unchanged, hotbar badge updates, and normal aiming resumes. Similarly selecting offered `Nullify`/`Flip` grants `+1` to that type only; selecting `Free Shots +3` (when offered) grants `+3` free shots; selecting `Area +20%` (when offered) increments `areaUpgradeCount` to `1` and `effectiveRadius` to `64.8` (`54*1.2` with current base `54`); selecting `Bouncy Ball +1` increments `bouncyBallCount` to `1`.
- [ ] After launching **5 counted shots** from new game (`secretRewardCounter` `0→5`, reset to `0`, `totalAttempts` `0→5` if no free shots consumed), at `secretRewardCounter` reset and ball reset to tee, the upgrade menu appears with a random 3-set from the 6-pool before the 6th counted attempt (which will be `totalAttempts=6` next, but secret counter is `0` again). Verified via `getSecretRewardCounter()===0` after trigger and before next launch.
- [ ] If `Free Shots +3` was taken after first trigger, the next 3 launches consume free shots (`freeShots 3→0`) and do **NOT** increment `secretRewardCounter` nor `totalAttempts`; the menu for the next 5 counted shots is delayed until 5 counted shots have occurred (free shots are ignored). `secretRewardCounter` stays at same value through free shots. Area/bouncy bonuses persist through free shots.
- [ ] Secret counter increments only on counted shots: programmatically set `freeShots=1`, `secretRewardCounter=2`, launch once (free shot) → `freeShots 1→0`, `secretRewardCounter` stays `2`, `totalAttempts` stays. Launch again (counted, `freeShots==0`) → `secretRewardCounter 2→3`, `totalAttempts` increments.
- [ ] Counter reset: set `secretRewardCounter=4`, `freeShots=0`, launch once (counted) → `secretRewardCounter` `4→5` → reset to `0` and `rewardPending=true`; at next `AIMING` entry, menu appears. After claiming, `secretRewardCounter` remains `0`. Next counted shot increments to `1`.
- [ ] Stacking Area: taking `Area +20%` after first trigger gives `effectiveRadius 64.8` (`54*1.2`); taking it again after 5 more counted shots (when randomly offered and chosen) gives `75.6` (`54*1.4`), not `77.76` (`54*1.44`); third intake gives `86.4` (`1.6×`). Verified via `getEffectiveModifierRadius()` and `getAreaMultiplier()`. With base `90` the values would be `108/126/144`, but current base `54` (reduced 40% per recent change) yields `64.8/75.6/86.4`.
- [ ] Existing modifiers grow retroactively: place a modifier before any area upgrade (radius `54`), take `Area +20%`, verify same modifier now has effective radius `64.8` and `getWindAt` at `60px` (previously outside base but inside boosted) now inside.
- [ ] Pressing `R` in `WIN`/`GAME_COMPLETE` (`resetGameAfterWin`), `startNewGameFromMain`, or `endRun` resets `secretRewardCounter=0`, `totalAttempts=0`, `supply={1,1,1}`, `freeShots=0`, `areaUpgradeCount=0`/`effectiveRadius=54`, `bouncyBallCount=0`, clears `rewardPending`/`rewardOffered`, `rewardMenuVisible=false`, and does **not** show a menu until 5 counted shots have been made (verified fresh game has no menu, `rewardMenuVisible===false`).
- [ ] Hole advance resets secret counter: after 2 counted shots on hole 1 (`secretRewardCounter===2`), advancing to hole 2 via `handleNextHole()` resets `secretRewardCounter` to `0` (verified via `getSecretRewardCounter()===0` at hole 2 entry) and immediately shows a reward menu before the first attempt on hole 2. The 5-shot cycle then restarts per hole (e.g., 5 counted shots on hole 2 triggers its own menu, independent of hole 1 count).
- [ ] Pressing `R` during play (in `AIMING`/`FLYING`) does NOT increment secret counter nor reset it; it only resets ball position and re-inits `bouncyRemaining` but leaves `secretRewardCounter` unchanged.
- [ ] Menu selection via keyboard `1`/`2`/`3` maps to offered order left-to-right, not fixed types; verified by triggering menu twice and checking that `1` grants different types across random offers.
- [ ] Rendering verification: `drawRewardMenu(ctx, width, height, offered, hovered)` is called inside canvas with 3 buttons, arrows/HUD still drawn underneath dim, no DOM `#reward-overlay` is created; pure canvas + vanilla JS. No `Total Attempts: N` text drawn inside menu.
- [ ] No 3rd-party libraries; vanilla JS `Math.random()` shuffle 3-of-6, `secretRewardCounter` integer 0..4, `supply[t]++` or `freeShots+=3` or `areaUpgradeCount++` or `bouncyBallCount++` additively, hidden counter logic.
- [ ] Re-roll button per REQ-025 is shown on every reward menu (`↻ Re-roll (1 attempt) [R]` `110×28` centered at `cardY+155`, `rgba(255,255,255,0.12)` fill, white border) when `rewardRerolled===false` (enabled, `cursor pointer` on hover) and becomes disabled (`0.06` fill, `not-allowed`, or hidden) after one use; clicking it or pressing `R`/`r` (`KeyR`) while `rewardMenuVisible` and not yet rerolled immediately increments `holeAttempts`+1 and `totalAttempts`+1 (HUD updates, e.g., `0/0→1/1` on first menu after re-roll) **but does NOT** increment `secretRewardCounter` (stays `0`) and **does NOT** decrement `freeShots` even if `freeShots>0` (always costs attempt per REQ-025), replaces `rewardOffered` with a new random 3-set from the 6-pool (may equal previous by chance), keeps `rewardMenuVisible` true and `rewardRerolled=true`; second click/`R` does nothing (counters unchanged, offer unchanged, `rerollReward()` returns `false`). After re-roll, selecting an upgrade via `1`/`2`/`3` applies to the **new** offer per REQ-025.

## Dependencies

- REQ-014 (attempts counter, `totalAttempts`, `holeAttempts`, `handleLaunch`, `resetGameAfterWin`)
- REQ-020 (supply state, per-type counters, `supply[type]`, `addToSupply`, `canPlace`, `updateHotbarUI`)
- REQ-022 (free shots hidden counter, `freeShots`, `addFreeShots`, conditional counting, now also gating secret counter)
- REQ-023 (modifier area +20% upgrade, `areaUpgradeCount`, `getEffectiveModifierRadius`, additive stacking)
- REQ-024 (bouncy ball +1 upgrade, `bouncyBallCount`, `bouncyRemaining`)
- REQ-025 (re-roll reward menu, `rewardRerolled`, `rerollReward()` costs `holeAttempts`/`totalAttempts` +1 but not `secretRewardCounter`/`freeShots`)
- REQ-015 (modifier types, area `MODIFIER_RADIUS=54`, and hotbar, but reward menu is separate acquisition UI)
- REQ-011 (game states `AIMING`/`FLYING`/`WIN`, `resetBall`, `loadLevel`, `advanceHole`)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  const POOL = ['amplify','nullify','flip','freeShots','areaUp','bouncyBall']; // 6 possible, 3 shown
  let secretRewardCounter = 0; // hidden 0..4, not rendered
  let rewardOffered = []; // 3 random distinct
  let rewardMenuVisible = false;
  let rewardPending = false;
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
  function getSecretRewardCounter(){ return secretRewardCounter; }
  function maybeShowRewardMenu() {
    if (rewardMenuVisible) return;
    if (gameState !== 'AIMING' && gameState !== 'CHARGING') return;
    if (rewardPending) {
      rewardOffered = shuffle([...POOL]).slice(0,3);
      rewardMenuVisible = true;
      rewardPending = false;
    }
  }
  function handleLaunch(angle,power){
    if(rewardMenuVisible) return;
    if(gameState!=="AIMING" && gameState!=="CHARGING") return;
    launchBall(angle,power);
    if(freeShots > 0){
      freeShots = Math.max(0, freeShots - 1);
      // secretRewardCounter NOT incremented
    } else {
      holeAttempts++; totalAttempts++; 
      secretRewardCounter++;
      if(secretRewardCounter >= 5){
        secretRewardCounter = 0;
        rewardPending = true;
      }
    }
    updateAttemptsUI(); gameState="FLYING"; resetCharge(); updateForceBar();
    // maybeShowRewardMenu will be called on next AIMING entry (resetBall)
  }
  function claimReward(type){
    if(!rewardMenuVisible || !rewardOffered.includes(type)) return;
    if(type==='freeShots') addFreeShots(3);
    else if(type==='areaUp') { areaUpgradeCount++; }
    else if(type==='bouncyBall') { bouncyBallCount++; bouncyRemaining = bouncyBallCount; }
    else addToSupply(type, 1);
    rewardMenuVisible = false;
    rewardOffered = [];
  }
  function advanceHole(){
    if(currentHoleIndex < LEVELS.length-1){
      currentHoleIndex++; holeAttempts=0;
      secretRewardCounter=0; // per-hole reset
      rewardPending = currentHoleIndex>0; // queue menu before first attempt except hole 1
      loadLevel(currentHoleIndex);
      gameState="AIMING"; maybeShowRewardMenu();
    }
  }
  // New game hole 1: secretRewardCounter=0; rewardPending=false; rewardMenuVisible=false; no initial menu on hole 1
  // Death/R during play: resetBall() does NOT touch secretRewardCounter, but will call maybeShow if pending
  // advanceHole/loadLevel: reset secretRewardCounter=0 and queue rewardPending=true when currentHoleIndex>0 so menu shows before first attempt on that new hole; on hole 1 no queue
  // resetGameAfterWin/startNewGameFromMain/endRun/clearProgress: secretRewardCounter=0; rewardPending=false; rewardMenuVisible=false;
  ```
- Mouse hit-testing: define `getRewardButtonsLayout(width,height, offered)` returning three `Rect {x,y,w,h,type}` for the current random offered set, same coords used for `drawRewardMenu` and `click` detection.
- If the game ever shows both `WIN` overlay (DOM) and reward menu (canvas), `WIN` takes precedence; reward for the winning counted attempt (if it was the 5th counted) is consumed by the per-hole reset/menu on the next hole — the per-hole menu on `currentHoleIndex>0` takes precedence and no double menu is shown. On hole 1 the 5th-shot menu appears after the 5th counted shot as before.
- A11y: canvas text `Choose an Upgrade` 22px bold white with `stroke rgba(0,0,0,0.75) 5px` for readability on `#3a9d23` dim, same strategy as HUD.
- Secret counter is hidden: not in HUD, only via `window.__getSecretRewardCounter()` for tests.

## File Paths

- `src/main.js:1` (POOL 6 with bouncyBall, secretRewardCounter hidden per-hole (reset to 0 on `advanceHole`/`loadLevel(n>0)` and queue reward before first attempt on `n>0`), rewardPending, **rewardRerolled**, `rerollReward()` per REQ-025, maybeShowRewardMenu for secret counter + per-hole pre-attempt menu, handleLaunch increments secret counter only on non-free shots and resets at 5, claimReward, `R` re-bound to re-roll when menu visible, `advanceHole`/`handleNextHole` resets counter, resetGameAfterWin/startNewGameFromMain/endRun/clearProgress clears secret counter + reroll flag, etc.)
- `src/render.js:1` (drawRewardMenu - no white background, title Choose an Upgrade, `getRewardButtonsLayout(offered)` returns 3 buttons including Bouncy when offered, **`getRewardRerollButtonLayout` + Re-roll button `110×28` with hover/disabled**, high-contrast white text)
- `src/vectorField.js:1` (getWindAt uses effective radius via mod.radius)
- `index.html:1` (no DOM overlay for reward; canvas-only, hotbar remains)
- `style.css:1` (no new CSS needed for canvas menu)
