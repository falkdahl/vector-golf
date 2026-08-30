# REQ-028: Escape Pause Menu — Resume / New Game + Reward Stats

- **ID:** REQ-028
- **Title:** Pause Menu via Escape — Resume & New Game + Reward Counts (xN)
- **Priority:** Should Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / UI (REQ-011/REQ-014 Extension)

## Description
The game SHALL provide a pause menu accessible with the **Escape** key. The menu SHALL have two buttons: **Resume** which simply closes the menu and resumes play, and **New Game** which clears the current run state and starts over at hole 1. In the bottom of the menu SHALL be a list of all reward types with a count `xN` showing how many times the player has chosen that reward in the current run (e.g., `Amplify x5` means amplify was chosen 5 times this run).

## Rationale
Players need a discoverable way to pause, inspect run progress, and restart without waiting for a win. Escape is the standard PC pause affordance and is already partially used to deselect modifiers (REQ-015). Centralizing `Resume`/`New Game` in a single overlay avoids hidden `R`-only resets and makes the new `localStorage` persistence (REQ-027) understandable — `New Game` explicitly clears the saved run. Showing reward counts `xN` at the bottom gives immediate feedback on build (how many times each upgrade was taken), which is otherwise invisible (counters are hidden per REQ-022/023/024), and helps players plan future rerolls without opening storage.

## Requirements

1. **Trigger & State** in `src/main.js`:
   - State SHALL include `pauseMenuVisible: boolean` (default `false`), and optionally `pauseMenuHover: string|null` for button hover.
   - `pauseMenuVisible` SHALL be `false` on **new game** (`initLevel` with `currentHoleIndex===0`, `resetGameAfterWin`/`newGame()` via `New Game`, page reload with no saved progress).
   - **Opening:** While `gameState` is `AIMING` or `CHARGING` and `rewardMenuVisible===false` and `gameState!=="WIN"` and `gameState!=="FLYING"`:
     - If `selectedModifier !== null`, pressing `Escape` SHALL first **deselect** the modifier (set `selectedModifier=null`, `updateHotbarUI()`) and **not** open the pause menu (preserves REQ-015 deselection). A second press of `Escape` with `selectedModifier===null` SHALL set `pauseMenuVisible=true`.
     - If `selectedModifier===null`, pressing `Escape` SHALL immediately set `pauseMenuVisible=true`.
   - **Closing via key:** While `pauseMenuVisible===true`, pressing `Escape` again SHALL set `pauseMenuVisible=false` (i.e., `Resume`).
   - **Blocking:** While `rewardMenuVisible===true` or `gameState==="WIN"`/`"GAME_COMPLETE"` or `gameState==="FLYING"`, pressing `Escape` SHALL **not** open the pause menu (reward menu has priority and blocks, WIN uses its own overlay). Specifically, `Escape` while `rewardMenuVisible` SHALL remain blocked per REQ-021 (no pause behind reward).
   - **Focus:** While `pauseMenuVisible===true`, the existing pause path in `update(dt)` SHALL pause physics (like `WIN`/`rewardMenuVisible`): still call `updateParticles(dt, getWindAt)` and render, but do NOT advance `ball` physics, do not allow `handleLaunch()` or modifier placement/drag. `gameState` MAY stay `AIMING`/`CHARGING` or be a dedicated `PAUSED` state — either is acceptable if `update()` is blocked and `render()` still draws.
   - `pauseMenuVisible` SHALL be reset to `false` on `resetGameAfterWin()`/`newGame()` and on `loadLevel`/`advanceHole` if it was open when advancing (advance only via `New Game` or `Resume` then `handleNextHole`, not while paused).

2. **Resume vs New Game Actions** in `src/main.js`:
   - **Resume** (button or `Escape`):
     ```js
     function resumeGame(){
       if(!pauseMenuVisible) return;
       pauseMenuVisible=false;
       pauseMenuHover=null;
       if(canvas) canvas.style.cursor="default";
     }
     ```
     SHALL simply close the menu, leave all run state untouched (`currentHoleIndex`, `holeAttempts`, `totalAttempts`, `supply`, `freeShots`, `areaUpgradeCount`, `bouncyBallCount`, `secretRewardCounter`, `modifiers`, `aimAngle`, `rewardStats` if tracked). SHALL NOT clear `localStorage` or reset counters. After resuming, next frame SHALL be `AIMING`/`CHARGING` with HUD/hotbar visible, and if the reward was pending but not shown due to pause, `maybeShowRewardMenu()` MAY be evaluated on next `AIMING` entry.
   - **New Game** (button):
     ```js
     function startNewGame(){
       clearProgress(); // REQ-027 localStorage remove
       currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
       supply={amplify:0,nullify:0,flip:0};
       freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
       // if sharpshooterCount exists -> 0
       secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false;
       rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
       pauseMenuVisible=false;
       // REQ-028 stats
       rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
       modifiers=[]; syncModifiersToField();
       selectedModifier=null;
       loadLevel(0); // recreates field, ball at tee, aim toward hole
       gameState="AIMING";
       winOverlay.classList.add("hidden");
       updateAttemptsUI(); updateHotbarUI();
       maybeShowRewardMenu(); // will show initial 3-of-N offer on hole 1
     }
     ```
     SHALL be executable **any time the pause menu is visible**, even mid-run on hole 2/3. SHALL clear `localStorage` via `clearProgress()` (REQ-027), reset all run state as above (equivalent to `resetGameAfterWin` but callable outside `WIN`), reset `bouncyRemaining`, clear `rewardChosenCounts`, close the pause menu, and start at hole 1 in `AIMING` at its tee. It SHALL NOT require `WIN` state.
   - Both actions SHALL be idempotent and SHALL set `pauseMenuHover=null` and cursor to `default`.

3. **Reward Stats Tracking** in `src/main.js` (shared with REQ-021/022/023/024):
   - State SHALL include `rewardChosenCounts: Record<string,number>` with keys matching the pool `['amplify','nullify','flip','freeShots','areaUp','bouncyBall']` (and `'sharpshooter'` if pool is 7). Initialized to `0` for all keys on new game (`initLevel` index 0, `resetGameAfterWin`, `startNewGame`, page reload with no save). If `sharpshooter` pool exists, include it; otherwise 6 keys.
   - On each successful `claimReward(type)` (exactly once per menu trigger, `rewardMenuVisible` guard), the corresponding counter SHALL increment by `1`:
     ```js
     // inside claimReward after the existing supply/freeShots/area/bouncy mutation
     if(type in rewardChosenCounts) rewardChosenCounts[type] = Math.max(0, (rewardChosenCounts[type]||0)+1);
     // for freeShots: also addFreeShots(3) already, but chosen count is separate from remaining freeShots
     saveProgress(); // also persist counts per REQ-027 (extend payload)
     ```
     - For `freeShots`, the count is **times chosen**, not remaining `freeShots` (e.g., choosing freeShots twice → `freeShots` remaining may be `3` after using some, but `rewardChosenCounts.freeShots ===2` and bottom list shows `Free Shots x2`).
     - For `areaUp` and `bouncyBall`, the counts SHALL equal `areaUpgradeCount` and `bouncyBallCount` respectively after the increment (they are the same as “times chosen” for those upgrades). For `amplify`/`nullify`/`flip`, counts SHALL equal `supply[type]` after the increment (since each choice adds `+1` to supply).
   - The counts SHALL **persist** through death resets (`resetBall()`), `R` during play (ball reset without scoring), and hole advances (`advanceHole`/`handleNextHole`/`loadLevel(n>0)`) — those SHALL NOT reset them. Only `startNewGame`/`resetGameAfterWin`/new game (index 0) SHALL zero them. `clearProgress` SHALL also clear them from storage.
   - Helpers SHALL be exposed for tests: `getRewardChosenCounts():Record<string,number>`, `getRewardChosenCount(type):number`, `setRewardChosenCounts(obj)` (clamped `>=0` int). Debug via `window.__getRewardChosenCounts`, `window.__setRewardChosenCounts`.
   - Persistence (REQ-027 extension): `getSavePayload()` SHALL include `rewardChosenCounts`, and `loadProgress()` SHALL restore it (merge with defaults for missing keys, clamp `>=0` int). If payload has no `rewardChosenCounts` (old save), initialize to `0`s and derive from existing counters where possible (amplify→supply.amplify, etc., freeShots→0) without throwing.

4. **Menu Rendering** in `src/render.js` / `index.html` / `style.css`:
   - **Inside canvas** via `drawPauseMenu(ctx,width,height,hovered)` called from `render()` when `pauseMenuVisible===true`, **OR** as a **DOM overlay** `#pause-overlay` centered over canvas (like `#win-overlay`). Either is acceptable if visuals meet spec and hit-testing works in logical coordinates. No white card background on green with dark text; use high-contrast white with stroke on dim `rgba(0,0,0,0.55)` (same as reward/win dim) and transparent panel background.
   - Layout (example, 340×320 centered, but sizes tunable):
     - Full-canvas dim `rgba(0,0,0,0.55)` behind menu (same as reward menu and win dim per updated style).
     - Title `Paused` 22px `700 system-ui` white `rgba(255,255,255,1)` with `stroke rgba(0,0,0,0.75) 5px` centered at top of panel (same font as `Choose an Upgrade` per REQ-021 and `Victory`).
     - Two buttons centered vertically, `140×44` each, gap `12px`:
       - **Resume** — border `rgba(255,255,255,0.85)` 2px, fill `rgba(255,255,255,0.12)` (hover `0.22`), label `Resume` 14px `700` white with stroke `rgba(0,0,0,0.65) 3px`, icon `▶` 14px (optional), key hint `Esc` 10px. On hover brighten, `cursor pointer`.
       - **New Game** — border `rgba(231,76,60,0.9)` 2px, fill `rgba(231,76,60,0.28)` (hover `0.38`), label `New Game` 14px `700` white with stroke, icon `↺` 14px. Distinct red to signal reset. Hover brightens.
     - **Bottom reward list:** centered below buttons, inside same dim panel, `width ~320px`, `y = panelY + 200` (or below buttons `+24px`), layout as 3×2 grid or single row wrapped (depending on pool size 6→ 3 columns ×2 rows, 7→ 4+3). Each entry `48×48` or `80×20` showing icon+label+count:
       - Icon matching reward menu: `» #e67e22` amplify, `∅ #3498db` nullify, `⇄ #9b59b6` flip, `★ #2ecc71` freeShots, `◯ #f39c12` areaUp, `◎ #1abc9c` bouncyBall (and `🎯 #e74c3c` sharpshooter if present).
       - Label 11px white with stroke `rgba(0,0,0,0.65) 3px`, count `xN` 12px `700` white with stroke, e.g., `Amplify x2`, `Free Shots x1`, `Area +20% x0`. Count SHALL be `0` when never chosen this run, not hidden.
       - Entries SHALL be laid out with `gap 8px`, centered. Background for each entry transparent or `rgba(255,255,255,0.06)` rounded, not white card.
     - All text SHALL use high-contrast white with dark stroke/shadow for readability on dim over green, same as reward menu. No solid white card `fill #fff` SHALL be drawn.
   - Hit-testing for canvas mode: helpers `getPauseButtonsLayout(width,height)` returning `Rect`s for Resume and New Game (e.g., `{resume:{x,y,w,h}, newGame:{x,y,w,h}}`) and optionally `getRewardStatsListLayout`. Click inside Resume → `resumeGame()`, inside New Game → `startNewGame()`. Keyboard while pause visible: `Escape` → Resume, `N`/`Enter` MAY also trigger New Game but not required; `1`/`2`/`3` SHALL be ignored (not selecting rewards).
   - For DOM mode: `index.html` SHALL contain `#pause-overlay.hidden > .pause-content` with two `button`s and a `.reward-stats` container of 6/7 `div`s each with icon+label+`xN`. Same dim and transparent styles as `#win-overlay` per updated style. Click handlers mirror canvas logic.

5. **Interaction & Blocking** in `src/main.js`:
   - While `pauseMenuVisible===true`:
     - `update()` SHALL pause ball physics (no `updateBall`, no wind drift) but SHALL still call `updateParticles`.
     - Input for aiming (`ArrowLeft`/`Right`/`KeyA`/`KeyD`), charging (`Space`), modifier placement (`click`, `1`/`2`/`3`), and launching SHALL be ignored. `handleLaunch` blocked (return early if `pauseMenuVisible`).
     - Hotbar SHALL be hidden (like `FLYING`/`WIN`/`rewardMenuVisible`).
     - `R` key while pause visible SHALL be blocked (do not `resetBall`/`handleNextHole`); only `Escape`/`Resume` and `New Game` apply.
   - **Escape priority chain** (single `window keydown` handler order):
     1. If `rewardMenuVisible`, block and handle reward `1`/`2`/`3`/`0` only.
     2. Else if `pauseMenuVisible`, `Escape` → `resumeGame()`.
     3. Else if `gameState==="WIN"`, `Escape` ignored (win has its own `R`/`Next`).
     4. Else if `selectedModifier!==null`, `Escape` → deselect only.
     5. Else → open pause menu.
   - Pressing `Escape` rapidly SHALL toggle pause (open/close) but SHALL NOT create multiple overlays. `resumeGame()` and `startNewGame()` SHALL each be callable via click or key and SHALL return `true/false` for tests.

6. **No HUD Change & Persistence**:
   - No new HUD element outside the menu. The reward counts are only visible inside the pause menu bottom list, not in `drawHUD` or win overlay (hidden stats, like `freeShots`/`areaUpgradeCount`).
   - Counts SHALL be persisted via `saveProgress`/`loadProgress` (REQ-027 payload extension) so the bottom list shows correct `xN` after reload (e.g., `Amplify x2` still `x2` after revisit). `clearProgress` SHALL reset them to `0`.

## Acceptance Criteria

- [ ] On fresh page load (new game, `pauseMenuVisible=false`), pressing `Escape` with no modifier selected (`selectedModifier===null`) immediately opens pause overlay: full-canvas dim `rgba(0,0,0,0.55)`, title `Paused` `700 22px` white with stroke `5px`, two centered buttons `Resume` (`140×44` white border/fill `0.12` hover `0.22`, `▶` icon) and `New Game` (`↺` red `rgba(231,76,60,0.28)`) with hover brighten and `cursor pointer`. Pressing `Escape` again or clicking `Resume` closes the menu (`pauseMenuVisible false`) and returns to `AIMING` without changing `currentHoleIndex`, `holeAttempts`, `totalAttempts`, `supply`, `secretRewardCounter`, or `modifiers`.
- [ ] If a modifier is selected (`selectedModifier='amplify'`), first `Escape` deselects it (`selectedModifier null`, hotbar highlight cleared) and does **not** open pause; second `Escape` then opens pause. Verified via `getSelectedModifier()===null` after first, `isPauseMenuVisible()===true` after second.
- [ ] While `rewardMenuVisible===true`, pressing `Escape` does **not** open pause menu and does **not** close reward menu (reward blocked per REQ-021). While `WIN` overlay is shown, `Escape` does **not** open pause.
- [ ] While pause is visible, aiming/charging is blocked: holding `ArrowRight` does not change `getAimAngle()`, holding `Space` does not increase `charge`, clicking canvas does not place a modifier even if `1` was pressed before pausing. `gameState` remains `AIMING`/`CHARGING` (or `PAUSED`) and ball does not drift; `updateBall` not called. `handleLaunch` while pause returns without incrementing `holeAttempts`/`totalAttempts`.
- [ ] Clicking `Resume` (hit-test inside its rect or DOM button) closes menu and resumes at same hole/attempts: `currentHoleIndex` unchanged, `holeAttempts`/`totalAttempts` unchanged, `supply`/`freeShots`/`areaUpgradeCount`/`bouncyBallCount` unchanged, modifiers still on field, `drawArrows` still shows same wind.
- [ ] Clicking `New Game` (when pause visible) clears run state and starts at hole 1: `currentHoleIndex 0`, `holeAttempts 0`, `totalAttempts 0`, `supply {0,0,0}`, `freeShots 0`, `areaUpgradeCount 0`, `bouncyBallCount 0`, `secretRewardCounter 0`, `rewardPending false`, `firstRewardClaimed false`, `rewardMenuVisible` now `true` with new random 3-of-N offer for hole 1 (per REQ-021 initial), `modifiers []` (field cleared, arrows reflect base field), `pauseMenuVisible false`, `localStorage.getItem(STORAGE_KEY)` is `null` immediately after (cleared), next attempt creates fresh save. On holes 2/3, `New Game` also jumps back to hole 1 (not staying on current hole).
- [ ] Bottom reward list: when pause is open, below the two buttons is a centered list of **all** reward types (6 types `Amplify`, `Nullify`, `Flip`, `Free Shots +3`, `Area +20%`, `Bouncy Ball +1` — or 7 if sharpshooter pool is implemented) each showing icon `»`/`∅`/`⇄`/`★`/`◯`/`◎` with correct colors (`#e67e22/#3498db/#9b59b6/#2ecc71/#f39c12/#1abc9c`) and a count `xN` (e.g., `x0` before any claim, `x2` after two claims). The count SHALL be the **times chosen** this run, not remaining inventory: verified via `getRewardChosenCounts().amplify===2` after two `Amplify` claims, `freeShots` chosen `1` shows `x1` even if `freeShots` remaining is `2` after one use, `areaUp x1` shows `1` after one `Area +20%` claim. The list SHALL persist through hole advances (e.g., `Amplify x1` still `x1` on hole 2) and after reload (e.g., reload after `Amplify x1` still shows `x1` via `loadProgress`). After `New Game`, all counts back to `x0`.
- [ ] Counts are hidden outside pause menu: `drawHUD` still shows only `Hole: N/M` `Attempts: X` `Total: Y`, win overlay shows only hole/total, no `xN` in HUD. `window.__getRewardChosenCounts()` returns correct map.
- [ ] Persistence: after `Amplify x1` then page reload, pause reopened shows `Amplify x1` (not `x0`). `localStorage` payload contains `rewardChosenCounts` and is versioned. Corrupt storage reloads as new game with counts `0`.
- [ ] No 3rd-party libraries; pure vanilla JS `pauseMenuVisible` boolean, `keydown Escape` branching, `localStorage` for clear (reuse REQ-027 key), canvas or DOM rendering with high-contrast white text on dim.

## Dependencies

- REQ-011 (states `AIMING`/`CHARGING`/`FLYING`/`WIN`, `resetBall`, `loadLevel`, `resetGameAfterWin`)
- REQ-014 (attempts counters, `holeAttempts`/`totalAttempts`/`currentHoleIndex`, `drawHUD`)
- REQ-015/REQ-020 (modifiers, `selectedModifier`, supply, hotbar)
- REQ-021 (reward menu 3-of-N, secret counter, `claimReward`, `firstRewardClaimed`, `rewardPending`)
- REQ-022/REQ-023/REQ-024 (freeShots, area, bouncy — counts derived, `addFreeShots`/`addAreaUpgrade`/`addBouncyBall`)
- REQ-025 (reroll state, must not be affected by pause)
- REQ-027 (localStorage `saveProgress`/`loadProgress`/`clearProgress`, extend payload with `rewardChosenCounts`)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let pauseMenuVisible = false;
  let pauseMenuHover = null;
  let rewardChosenCounts = { amplify:0, nullify:0, flip:0, freeShots:0, areaUp:0, bouncyBall:0 };
  function getRewardChosenCounts(){ return {...rewardChosenCounts}; }
  function resumeGame(){ if(!pauseMenuVisible) return false; pauseMenuVisible=false; pauseMenuHover=null; if(canvas) canvas.style.cursor="default"; return true; }
  function startNewGame(){
    clearProgress();
    currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
    supply={amplify:0,nullify:0,flip:0}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
    secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
    rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
    modifiers=[]; syncModifiersToField(); selectedModifier=null;
    rewardClaimedFor=null;
    loadLevel(0); gameState="AIMING"; winOverlay.classList.add("hidden");
    updateAttemptsUI(); updateHotbarUI();
    pauseMenuVisible=false; pauseMenuHover=null;
    maybeShowRewardMenu();
    return true;
  }
  // in claimReward(type): after add* mutation, if(type in rewardChosenCounts) rewardChosenCounts[type]++;
  // else if(type==='freeShots') rewardChosenCounts.freeShots++;
  // else if(type==='areaUp') rewardChosenCounts.areaUp++;
  // else if(type==='bouncyBall') rewardChosenCounts.bouncyBall++;
  // saveProgress also persists rewardChosenCounts
  // in window keydown:
  // if(rewardMenuVisible){ /* existing reward 1/2/3/0 handling */ return; }
  // if(pauseMenuVisible){ if(e.code==="Escape"){ resumeGame(); e.preventDefault(); return; } /* clicks */ return; }
  // if(gameState==="WIN"){ return; }
  // if(e.code==="Escape"){
  //   if(selectedModifier!==null){ selectedModifier=null; updateHotbarUI(); e.preventDefault(); return; }
  //   pauseMenuVisible=true; e.preventDefault(); return;
  // }
  // saveProgress payload extension: add rewardChosenCounts:{...rewardChosenCounts}
  // loadProgress: restore rewardChosenCounts with defaults and clamping
  // window exposure: window.__getRewardChosenCounts, window.__setRewardChosenCounts, window.__resumeGame, window.__startNewGame, window.isPauseMenuVisible, window.getRewardChosenCounts
  ```
- Visual for pause menu (`src/render.js:drawPauseMenu`):
  ```js
  export function getPauseButtonsLayout(width,height){
    const btnW=140, btnH=44, gap=12;
    const cx=width/2, cy=height/2 -10;
    return {
      resume:{x:cx-btnW/2, y:cy-28, w:btnW, h:btnH},
      newGame:{x:cx-btnW/2, y:cy+28, w:btnW, h:btnH}
    };
  }
  export function drawPauseMenu(ctx,width,height,hovered, rewardCounts){
    ctx.save();
    ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(0,0,width,height);
    ctx.font="700 22px system-ui, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.lineWidth=5; ctx.fillStyle="white";
    ctx.strokeText("Paused", width/2, height/2-80); ctx.fillText("Paused", width/2, height/2-80);
    const layout=getPauseButtonsLayout(width,height);
    // Resume button white, New Game red - same rounded rect + hover 0.22/0.38
    // draw buttons...
    // Bottom reward list: 6 icons in row, gap 8, y = height/2+90
    // for each type in POOL: icon/color/label + ` x${rewardCounts[type]||0}`
    ctx.restore();
  }
  ```
- DOM alternative for pause menu (`index.html`):
  ```html
  <div id="pause-overlay" class="hidden">
    <div class="pause-content">
      <h2>Paused</h2>
      <button id="resume-button">▶ Resume</button>
      <button id="new-game-button">↺ New Game</button>
      <div class="reward-stats">
        <div data-type="amplify"><span class="icon">»</span> Amplify <span class="count">x0</span></div>
        <!-- ... 5 more -->
      </div>
    </div>
  </div>
  ```
  styled like `#win-overlay` with `background:rgba(0,0,0,0.55)` and transparent `.pause-content`, buttons matching canvas colors, `.reward-stats` grid `display:flex; gap:8px; flex-wrap:wrap; justify-content:center;` counts white with stroke.

## File Paths

- `src/main.js:1` (pauseMenuVisible, pauseMenuHover, rewardChosenCounts, getRewardChosenCounts/getRewardChosenCount, resumeGame, startNewGame/New Game clearProgress, claimReward increment, getSavePayload/loadProgress/clearProgress extension, init resume, window keydown Escape chain, window exposure)
- `src/render.js:1` (drawPauseMenu, getPauseButtonsLayout, getRewardStatsListLayout, pause dim/title/buttons/reward list rendering)
- `index.html:1` (optional #pause-overlay DOM structure if DOM mode chosen)
- `style.css:1` (#pause-overlay dim, .pause-content transparent, buttons, .reward-stats list)
