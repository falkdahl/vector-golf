# REQ-029: Main Menu (No Run) — New Game + High Score + Golf Art + Pause End Run

- **ID:** REQ-029
- **Title:** Main Menu When No Run In Play — New Game, High Score, Golf Art; Pause New Game → End Run to Main Menu
- **Priority:** Should Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / Persistence / UI (REQ-011/REQ-014/REQ-027/REQ-028 Extension)

## Description
The game SHALL show a **main menu** whenever **no current run is in play** (fresh load with no saved progress, after `End Run`, or after a completed run has been cleared). The main menu SHALL have a single primary button **New Game** which starts a fresh run at hole 1, below it a text **Current high score** with the best total shots from a completed run (lowest total wins), and a simple decorative background drawing of a golf ball, golf club and hole with flag. The existing **pause menu** (`Escape`) SHALL be changed: its second button SHALL no longer say **New Game** but **End Run**, and clicking **End Run** SHALL abandon the current run and return to the **main menu** (clearing the active run, preserving the high score).

## Rationale
With `localStorage` persistence (REQ-027) the game now resumes automatically, so a player who has no active run (first visit, after `End Run`, or after storage was cleared) would otherwise see an empty fairway with the reward overlay and no affordance to start. An explicit main menu gives a clear entry point and surfaces the long-term goal — beating the high score — instead of leaving `Total` as the only number. Moving `New Game` to the main menu and making the pause action `End Run` (to main menu) separates “abandon run and go to menu” from “immediately start hole 1” and avoids accidental resets mid-hole. A tiny golf illustration behind the menu makes the static start screen feel like a game and not an empty canvas, without adding image assets (pure canvas/CSS drawing per REQ-001).

## Requirements

1. **Main Menu State & Visibility** in `src/main.js` / `src/render.js` / `index.html`:
   - State SHALL include `mainMenuVisible: boolean` (default `false` until evaluated on load). `mainMenuVisible === true` SHALL mean the main menu overlay is shown and the underlying game is paused; `false` means normal play (`AIMING`/`CHARGING`/`FLYING`/`WIN`/pause/reward).
   - **When to show:** `mainMenuVisible` SHALL be `true` if and only if **no current run is in play**:
     - On initial page load after `setupCanvas()` and `loadProgress()` attempt (REQ-027), if `localStorage.getItem(STORAGE_KEY)` is `null`/corrupt/wrong version **and** no in-memory run has been started (`currentHoleIndex===0 && totalAttempts===0 && holeAttempts===0 && modifiers.length===0 && supply all 0` after `initLevel(0)` would have run, but before any attempt), then `mainMenuVisible = true`.
     - After `End Run` (pause → `End Run`) which does `clearProgress()` and clears the in-memory run (see §3), `mainMenuVisible = true`.
     - After a **new game clear** that is **not immediately followed by an auto-start** — `mainMenuVisible` should be the idle state. If `New Game` was clicked **from the main menu**, it SHALL immediately set `mainMenuVisible=false` and start hole 1 (see §2).
     - `mainMenuVisible` SHALL be `false` while a run is active: `totalAttempts>0` or `holeAttempts>0` or `supply`/`freeShots`/`areaUpgradeCount`/`bouncyBallCount` non-zero or `modifiers.length>0` or `gameState==="FLYING"`/`"WIN"` or after `loadProgress()` restored a saved run.
   - **Blocking:** While `mainMenuVisible===true`, the game SHALL be paused exactly like `pauseMenuVisible`/`rewardMenuVisible`/`WIN`: `update(dt)` SHALL NOT advance `ball` physics (`updateBall`) but SHALL still call `updateParticles(dt,getWindAt)`; `handleLaunch()` SHALL return without incrementing `holeAttempts`/`totalAttempts`; modifier placement/drag (`placeModifier`, `removeModifierAt`, hotbar `1`/`2`/`3`, `Delete`) SHALL be ignored; `Escape` while main menu visible SHALL be ignored (not open pause). `gameState` MAY remain `AIMING` or be a dedicated `MAIN_MENU` state — either is acceptable if `update` is blocked and `render` still draws.
   - `mainMenuVisible` SHALL be reset to `false` on `New Game` start and to `true` on `End Run`. Page reload SHALL re-evaluate via `loadProgress()` + run-empty check (so visiting after `End Run` still shows main menu).

2. **New Game Button (Main Menu Only)** in `src/main.js` / `index.html` / `style.css`:
   - The main menu SHALL contain one primary button **New Game** (id `main-new-game-button` for DOM mode, or canvas rect `getMainMenuButtonsLayout(...).newGame` for canvas mode).
   - On click (or `Enter`/`Space` when main menu focused), handler SHALL:
     ```js
     function startNewGameFromMain(){
       clearProgress(); // ensure no stale saved run
       currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
       supply={amplify:0,nullify:0,flip:0}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
       // sharpshooterCount 0 if exists
       secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false;
       rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false; rewardMenuHover=null; rewardClaimedFor=null;
       pauseMenuVisible=false; pauseMenuHover=null; mainMenuVisible=false;
       rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
       modifiers=[]; syncModifiersToField(); selectedModifier=null;
       loadLevel(0); gameState="AIMING";
       if(winOverlay) winOverlay.classList.add("hidden");
       const mainOverlay=document.getElementById("main-menu-overlay");
       if(mainOverlay) mainOverlay.classList.add("hidden");
       const pauseOverlay=document.getElementById("pause-overlay");
       if(pauseOverlay) pauseOverlay.classList.add("hidden");
       updateAttemptsUI(); updateHotbarUI();
       maybeShowRewardMenu(); // initial 3-of-N for hole 1
       // Do NOT write high score; do NOT saveProgress yet — first attempt will create save per REQ-027 AC
     }
     ```
     It SHALL start at **hole 1** (`LEVELS[0].tee`, `LEVELS[0].hole`, field `createField(..., LEVELS[0].field.seed, ...)`), `AIMING`, HUD `Hole:1/M Attempts:0 Total:0`, and the initial reward menu SHALL appear as usual. It SHALL NOT require `WIN` state.
   - The button SHALL be centered, size `160×48` (or `140×44` like pause buttons, but documented), border `rgba(46,204,113,0.9)` 2px, fill `rgba(46,204,113,0.28)` (hover `0.38`), label `New Game` `700 14px` white with stroke `rgba(0,0,0,0.65) 3px`, icon `▶` or `⛳` 14px optional, hover brightens and `cursor pointer`.
   - While main menu is visible, `Escape` SHALL NOT close it (only `New Game` closes it). `R` while main menu SHALL be ignored.

3. **Pause Menu Change — New Game → End Run** in `src/main.js` / `src/render.js` / `index.html` / `style.css`:
   - The pause menu (`Escape` per REQ-028) SHALL be changed: its second button text SHALL be **End Run** (not `New Game`), id `end-run-button` for DOM (or `getPauseButtonsLayout(...).endRun` for canvas). Visuals remain the same red distinct button (`border rgba(231,76,60,0.9)` `fill rgba(231,76,60,0.28)` hover `0.38`, label `End Run` `700 14px` white stroke, icon `✕` or `↺` 14px).
   - On click (or `Enter` while pause focused), handler SHALL:
     ```js
     function endRun(){
       if(!pauseMenuVisible) return false;
       clearProgress(); // REQ-027 — abandon current run
       // keep high score storage intact (see §4 — different key)
       currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
       supply={amplify:0,nullify:0,flip:0}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
       secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false;
       rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
       rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
       modifiers=[]; syncModifiersToField(); selectedModifier=null;
       pauseMenuVisible=false; pauseMenuHover=null;
       mainMenuVisible=true;
       loadLevel(0); gameState="AIMING"; // preload hole 1 layout but keep main menu on top so it is not playable yet
       if(winOverlay) winOverlay.classList.add("hidden");
       const pauseOverlay=document.getElementById("pause-overlay");
       if(pauseOverlay) pauseOverlay.classList.add("hidden");
       const mainOverlay=document.getElementById("main-menu-overlay");
       if(mainOverlay) mainOverlay.classList.remove("hidden");
       updateAttemptsUI(); updateHotbarUI();
       // Do NOT call maybeShowRewardMenu — main menu blocks it; it will show after New Game
       return true;
     }
     ```
     It SHALL abandon the current run, **clear the active run** (`localStorage` key `STORAGE_KEY` via `clearProgress()`) but **preserve the high score key** (`HIGH_SCORE_KEY`, see §4), reset the same state as `New Game` but **leave `mainMenuVisible=true`** so the game returns to the main menu instead of immediately becoming playable. The player must then press `New Game` on the main menu to start. It SHALL work from any hole (1..M) mid-run, even with `rewardMenuVisible`? No — while `rewardMenuVisible` the pause menu cannot be opened, so `End Run` cannot be clicked then (reward has priority). While `WIN` the pause menu cannot be opened either.
   - **Resume** button behavior unchanged: `resumeGame()` closes pause and resumes same run.

4. **High Score — Current High Score Text** below New Game button (Main Menu):
   - Storage SHALL use a separate key `HIGH_SCORE_KEY = "golfVectorField.highScore.v1"` (or `"golf.highScore.v1"`), value is JSON `{"version":1,"bestTotal":number}` or plain number string, with `try/catch` on access.
   - **Update:** Whenever a **complete run** finishes — i.e., the player clears the **final hole** and `gameState` becomes `"WIN"` on `currentHoleIndex===LEVELS.length-1` (checked in `checkWin()` when final hole win overlay would be shown) — the game SHALL compare `totalAttempts` (at that moment, after the final `holeAttempts` increment) to the stored `bestTotal`:
     ```js
     function maybeUpdateHighScore(){
       try{
         const raw=localStorage.getItem(HIGH_SCORE_KEY);
         const prev = raw ? JSON.parse(raw).bestTotal : null;
         if(prev==null || totalAttempts < prev){
           localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({version:1, bestTotal: totalAttempts}));
         }
       } catch {}
     }
     ```
     SHALL be called exactly once per completed run (e.g., inside `checkWin()` when final hole win, before showing `winOverlay`, or on `handleNextHole`/`resetGameAfterWin` when final win is detected). Lower `totalAttempts` is better (like golf). Ties SHALL keep the existing best (not overwrite). No update on incomplete runs (`End Run` does not affect high score) or on hole 1..M-1 wins.
   - **Display:** In the main menu, centered **below** the `New Game` button (e.g., `y = newGameRect.y + newGameRect.h + 18`), text SHALL read:
     - If a completed-run high score exists: `Current high score: N` where `N` is the stored `bestTotal` integer, font `600 13px system-ui` white `rgba(255,255,255,0.95)` with stroke `rgba(0,0,0,0.65) 3px`, centered.
     - If no completed run has been stored yet (first visit, `localStorage` no `HIGH_SCORE_KEY`): `Current high score: —` (em dash) or `Current high score: none` (either is acceptable, document choice). Font same as above, `rgba(255,255,255,0.85)`.
   - High score SHALL **persist** through `End Run` (which clears `STORAGE_KEY` but not `HIGH_SCORE_KEY`) and through `clearProgress()`/`resetGameAfterWin()` when called via `New Game` from main menu? Actually `resetGameAfterWin` is for win-state `R` — it currently clears `STORAGE_KEY` via `clearProgress()` but high score SHALL remain. Only an explicit storage clear in DevTools or a code `localStorage.clear()` would reset it. Pressing `New Game` from main menu SHALL NOT reset high score.
   - Helpers SHALL be exposed for tests: `getHighScore():number|null`, `setHighScore(n:number)`, `clearHighScore()`, `maybeUpdateHighScore()`, and `HIGH_SCORE_KEY`. Debug via `window.__getHighScore`, etc.

5. **Main Menu Background Art** — Simple Golf Drawing:
   - Behind the main menu panel (still inside `#main-menu-overlay` or canvas `drawMainMenu`), a **simple decorative drawing** SHALL be visible, consisting of a **golf ball** (white circle `radius ~6` with small dimple, thin dark stroke), a **golf club** (angled shaft `stroke #6B3A2A`/`#8B4A33` 3px, head `fill #C0C0C0`/`#A0A0A0` small trapezoid/ellipse), and a **hole with flag** (hole `fill #111` `radius 14` with rim `#222` 2px, flag pole `stroke #fff` 2px vertical, flag `fill #e74c3c` `14×10` rectangle like `drawHole`), all drawn with pure canvas 2D or pure CSS (no image assets per REQ-001, no third-party downloads).
   - The art SHALL be placed behind the `New Game` button so it does not block hit-testing: e.g., centered at `width/2, height/2 + 80` (below high-score text) or as a faint backdrop inside the overlay (opacity `0.9` or `1.0` but behind panel). It SHALL be visible whenever `mainMenuVisible===true`, and hidden when `mainMenuVisible===false` (not drawn on top of playfield during `AIMING`). It SHALL not affect `getWindAt` or collisions.
   - Canvas implementation MAY be `drawMainMenuBackground(ctx,W,H)` called from `drawMainMenu` before drawing the dim and buttons. DOM implementation MAY be CSS `background` or inline `canvas` element inside the overlay. Either is acceptable if all three elements (ball, club, hole+flag) are recognizable as golf and use the same shapes/colors as `drawBall`/`drawHole` for consistency.

6. **Interaction & Lifecycle** in `src/main.js`:
   - While `mainMenuVisible===true`:
     - `update(dt)` SHALL pause ball physics (like pause/reward/WIN) but still call `updateParticles`.
     - Input for aiming/charging/launching/modifier placement SHALL be ignored; `handleLaunch` returns early if `mainMenuVisible`.
     - `Escape` while main menu SHALL be ignored (not open pause, not close main menu).
     - `R` while main menu SHALL be ignored.
     - Hotbar SHALL be hidden.
     - `maybeShowRewardMenu()` SHALL NOT trigger while main menu is visible (blocked like pause).
   - **Visibility priority** (single overlay at a time): if `mainMenuVisible` is true, both `pauseMenuVisible` and `rewardMenuVisible` and `WIN` SHALL be false. If a saved run exists, `mainMenuVisible` SHALL be false on load (resume). `startNewGame` from pause (`End Run`) SHALL set `mainMenuVisible=true` and `pauseMenuVisible=false` atomically.
   - Persisted high score SHALL survive `clearProgress` (different key), so ending a run does not lose the best total.

## Acceptance Criteria

- [ ] On fresh visit (clear `localStorage` for both keys, reload), page shows **main menu** (`mainMenuVisible true`): full-canvas dim `rgba(0,0,0,0.55)` like pause/reward/win, title `Golf Vector Field` or `Main Menu` `700 22px` white stroke `5px` (or at least `New Game` button), centered button `New Game` `160×48` green `rgba(46,204,113,0.28)` hover `0.38` with `▶`/`⛳`, below it text `Current high score: —` (or `none`) `600 13px` white stroke `3px`, and behind the button a **simple golf drawing** — recognizable ball (white `6px` circle), club (brown shaft + silver head angled toward ball), and hole with flag (black circle `14px` + white pole + red flag `14×10`) — all drawn with canvas/CSS, no `<img>`/external asset, visible behind the panel.
- [ ] While main menu is visible, the game is paused: holding `ArrowRight` does not change `getAimAngle()`, `Space` does not increase `charge`, clicking canvas does not place modifiers. `gameState` stays `AIMING` (or `MAIN_MENU`) with ball at `LEVELS[0].tee`. Pressing `Escape` does **not** open pause and does **not** close main menu. HUD still shows `Hole:1/M Attempts:0 Total:0` underneath the dim (if not fully covered) but hotbar is hidden.
- [ ] Clicking `New Game` (hit-test inside its rect or DOM `#main-new-game-button`) immediately starts a new run at hole 1: `mainMenuVisible false`, overlay hidden, `currentHoleIndex 0`, `holeAttempts 0`, `totalAttempts 0`, `supply {0,0,0}`, `freeShots 0`, etc., `modifiers []`, ball at tee, `maybeShowRewardMenu()` shows initial 3-of-N offer, `localStorage STORAGE_KEY` is still `null` before first attempt (per REQ-027, not pre-created), and no high-score change yet. Second reload **after** one counted attempt (`Total 1`) resumes at `Hole:1 Attempts:1 Total:1` (not main menu), because a run is now in play.
- [ ] Completing a full run: clear `localStorage` for both keys, click `New Game`, complete holes 1..M (e.g., via `checkWin` or programmatically `totalAttempts=12` then `checkWin` on final hole). After final hole win (`gameState WIN` on last hole), `maybeUpdateHighScore()` SHALL have stored `bestTotal = 12` under `HIGH_SCORE_KEY` (`localStorage.getItem("golfVectorField.highScore.v1")` JSON `{"version":1,"bestTotal":12}`). Return to main menu via `End Run` or `resetGameAfterWin`/`R` then reload: main menu now shows `Current high score: 12` (not `—`) below `New Game` (verified via `getHighScore()===12` and DOM text inside `#main-menu-overlay .high-score` or canvas `drawMainMenu` text).
- [ ] High score is best (lowest) total: complete a second run with `Total 15` → after final win, `bestTotal` stays `12` (not overwritten). Complete a third run with `Total 10` → after final win, `bestTotal` becomes `10` and main menu shows `Current high score: 10`.
- [ ] `End Run` change: open pause via `Escape` (from `AIMING` with no reward/WIN). Pause now shows title `Paused`, centered `Resume` white button (`140×44` `rgba(255,255,255,0.12)`) and **`End Run`** red button (`↺`/`✕` `rgba(231,76,60,0.28)`, `700 14px`, not `New Game`). Clicking `Resume` closes pause and resumes same run (no state change). Clicking **`End Run`** (hit-test inside `endRun` rect or DOM `#end-run-button`) abandons the run: `pauseMenuVisible false`, `mainMenuVisible true`, `currentHoleIndex 0`, `holeAttempts 0`, `totalAttempts 0`, `supply {0,0,0}` etc., `modifiers []`, `STORAGE_KEY` cleared (`null`), but `HIGH_SCORE_KEY` preserved (e.g., stays `10`), main menu now visible with `Current high score: 10` and golf art behind it. No new run starts until `New Game` is clicked on main menu.
- [ ] `End Run` from hole 2 or 3 also returns to main menu at hole 1 (not staying on current hole). `handleLaunch` is blocked while pause is open, so `Total` does not increment from a queued launch.
- [ ] Main menu golf art: with main menu open, the canvas (or overlay background) shows a recognizable ball (`#fff` circle `6px` with stroke `#222`), club (brown `6B3A2A` shaft diagonal, silver `C0C0C0` head), and hole with flag (same shapes as in-game `drawHole`/`drawBall` but as static decoration, e.g., at `W/2, H/2+70`). No `<img src="https://...">` or external asset; pure canvas 2D or CSS.
- [ ] No `New Game` text remains in the pause menu: search of `#pause-overlay` and canvas `drawPauseMenu` SHALL NOT contain `New Game` as the second button label — only `End Run`. The main menu SHALL be the only place with `New Game`.
- [ ] No 3rd-party libraries; pure vanilla JS `mainMenuVisible` boolean, `keydown Escape` branching, `localStorage` two keys (`STORAGE_KEY` for run, `HIGH_SCORE_KEY` for best), canvas/CSS drawing.

## Dependencies

- REQ-011 (states, `loadLevel`, `resetGameAfterWin`, `checkWin` final hole)
- REQ-014 (attempts counters, `drawHUD`)
- REQ-027 (persistence `STORAGE_KEY`, `saveProgress`/`loadProgress`/`clearProgress`)
- REQ-028 (pause menu `pauseMenuVisible`, `Escape`, `Resume`, reward `xN` list — now `End Run`)
- REQ-021/022/023/024/025 (reward pool, `claimReward`, secret counter)
- REQ-012 (rendering, `drawBackground`/`drawHoly`/`drawBall`)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let mainMenuVisible = false;
  const HIGH_SCORE_KEY = "golfVectorField.highScore.v1";
  function getHighScore(){ try{ const raw=localStorage.getItem(HIGH_SCORE_KEY); if(!raw) return null; const d=JSON.parse(raw); return typeof d.bestTotal==='number'? d.bestTotal : (typeof d==='number'? d : null); } catch { return null; } }
  function setHighScore(n){ try{ localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({version:1, bestTotal: Math.max(0, Math.floor(n))})); } catch {} }
  function maybeUpdateHighScore(){
    if(currentHoleIndex!==LEVELS.length-1 || gameState!=="WIN") return;
    const prev=getHighScore(); if(prev==null || totalAttempts < prev) setHighScore(totalAttempts);
  }
  function syncMainMenu(){
    const el=document.getElementById("main-menu-overlay");
    if(!el) return;
    if(mainMenuVisible){
      el.classList.remove("hidden");
      const hs=getHighScore();
      const hse=el.querySelector(".high-score");
      if(hse) hse.textContent = hs==null? "Current high score: —" : `Current high score: ${hs}`;
    } else el.classList.add("hidden");
  }
  function startNewGameFromMain(){
    clearProgress();
    currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
    supply={amplify:0,nullify:0,flip:0}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
    secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
    rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
    modifiers=[]; syncModifiersToField(); selectedModifier=null;
    mainMenuVisible=false; pauseMenuVisible=false; pauseMenuHover=null;
    loadLevel(0); gameState="AIMING";
    if(winOverlay) winOverlay.classList.add("hidden");
    syncMainMenu(); syncPauseOverlay();
    updateAttemptsUI(); updateHotbarUI();
    maybeShowRewardMenu();
  }
  function endRun(){
    if(!pauseMenuVisible) return false;
    clearProgress();
    currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
    supply={amplify:0,nullify:0,flip:0}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
    secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
    rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
    modifiers=[]; syncModifiersToField(); selectedModifier=null;
    pauseMenuVisible=false; pauseMenuHover=null; mainMenuVisible=true;
    loadLevel(0); gameState="AIMING";
    if(winOverlay) winOverlay.classList.add("hidden");
    syncPauseOverlay(); syncMainMenu();
    updateAttemptsUI(); updateHotbarUI();
    // Do NOT call maybeShowRewardMenu — main menu blocks
    return true;
  }
  // in init(): after loadProgress attempt, if no saved run and totalAttempts===0 && holeAttempts===0 && !loadProgressFound && currentHoleIndex===0 -> mainMenuVisible=true; syncMainMenu();
  // in checkWin(): after setting gameState="WIN" on final hole, maybeUpdateHighScore();
  // in handleLaunch/resumeGame/startNewGame/claimReward etc., keep mainMenuVisible false check
  // window exposure: window.__getHighScore, window.__setHighScore, window.__maybeUpdateHighScore, window.isMainMenuVisible, window.getHighScore
  ```
- Visual for main menu (`src/render.js:drawMainMenu`):
  ```js
  export function getMainMenuButtonsLayout(W,H){
    const btnW=160, btnH=48; return { newGame:{x:W/2-btnW/2, y:H/2-10, w:btnW, h:btnH} };
  }
  export function drawMainMenu(ctx,W,H, hovered, highScore){
    ctx.save();
    ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(0,0,W,H);
    // Golf art behind panel — ball, club, hole+flag
    const cx=W/2, cy=H/2+70;
    // hole
    ctx.fillStyle="#222"; ctx.beginPath(); ctx.arc(cx+40, cy, 16,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(cx+40, cy, 14,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx+40, cy-14-18); ctx.lineTo(cx+40, cy-14+6); ctx.stroke();
    ctx.fillStyle="#e74c3c"; ctx.fillRect(cx+40, cy-14-18,14,10);
    // ball
    ctx.fillStyle="#fff"; ctx.strokeStyle="#222"; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(cx-30, cy, 6,0,Math.PI*2); ctx.fill(); ctx.stroke();
    // club shaft + head
    ctx.strokeStyle="#6B3A2A"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx-18, cy-28); ctx.lineTo(cx-28, cy+2); ctx.stroke();
    ctx.fillStyle="#C0C0C0"; ctx.strokeStyle="#8B8B8B"; ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(cx-28, cy+4, 6,3, Math.PI/6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Title + button + high score
    ctx.font="700 22px system-ui, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.lineWidth=5; ctx.fillStyle="white";
    ctx.strokeText("Golf Vector Field", W/2, H/2-60); ctx.fillText("Golf Vector Field", W/2, H/2-60);
    const l=getMainMenuButtonsLayout(W,H); const r=l.newGame;
    const hover=hovered==="newGame";
    ctx.fillStyle=hover?"rgba(46,204,113,0.38)":"rgba(46,204,113,0.28)"; ctx.strokeStyle="rgba(46,204,113,0.9)"; ctx.lineWidth=2;
    // rounded rect ...
    ctx.fill(); ctx.stroke();
    ctx.font="700 14px system-ui, sans-serif"; ctx.strokeStyle="rgba(0,0,0,0.65)"; ctx.lineWidth=3; ctx.fillStyle="white";
    ctx.strokeText("▶ New Game", W/2, r.y+r.h/2); ctx.fillText("▶ New Game", W/2, r.y+r.h/2);
    ctx.font="600 13px system-ui, sans-serif"; ctx.fillStyle="rgba(255,255,255,0.95)"; ctx.strokeStyle="rgba(0,0,0,0.65)"; ctx.lineWidth=3;
    const hsText = highScore==null? "Current high score: —" : `Current high score: ${highScore}`;
    ctx.strokeText(hsText, W/2, r.y+r.h+18); ctx.fillText(hsText, W/2, r.y+r.h+18);
    ctx.restore();
  }
  ```
- Pause menu change: `src/render.js:drawPauseMenu` second button label changes from `New Game` to `End Run` (keep same red styling but text `End Run` `✕`), and `src/main.js` `getPauseButtonsLayout` key `endRun` instead of `newGame` (or keep alias). DOM `#pause-overlay` second button becomes `<button id="end-run-button">✕ End Run</button>`. Click handler maps to `endRun()` not `startNewGame()`.

## File Paths

- `src/main.js:1` (mainMenuVisible, HIGH_SCORE_KEY, getHighScore/setHighScore/maybeUpdateHighScore, startNewGameFromMain, endRun, claimReward not affected, getSavePayload not affected, init main menu visibility check, render blocking, window keydown main menu ignored, window exposure)
- `src/render.js:1` (drawMainMenu, getMainMenuButtonsLayout, drawMainMenuBackground, pause drawPauseMenu button label End Run, golf art drawing)
- `index.html:1` (#main-menu-overlay with title, #main-new-game-button, .high-score, golf art container or canvas; #pause-overlay second button now #end-run-button End Run)
- `style.css:1` (#main-menu-overlay dim, .main-menu-content transparent, buttons, .high-score text, golf art positioning)

