# REQ-028: Escape/P Shows Main Menu With Backdrop — Works Even In Flight, Continue Resumes, End Run Abandons, Never New Game

- **ID:** REQ-028
- **Title:** Escape or P During Level Shows Main Menu Buttons With Backdrop Shadowing Field — Works In Flight, Continue Hides Overlay To Resume, End Run Clears Storage Without Record, Never New Game
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / UI / Persistence (REQ-011/REQ-027/REQ-029 Extension)

## Description
While the player is **currently in a level** (a run is active: `mainMenuVisible===false`, `activeCourse` set, `STORAGE_KEY` has a `courseId`, regardless of `gameState` being `AIMING`, `CHARGING`, `FLYING`, or even `WIN` — but **`Escape` or `P` SHALL work even if a ball is in flight**), pressing **either `Escape` (`e.code==="Escape"`) or `P` (`e.code==="KeyP"`)** SHALL show the **main menu buttons `Continue`, `Help`, plus an extra `End Run`** **with a backdrop shadowing the playing field** (semi-transparent dim) — **never `New Game`**. This is the same HTML overlay as the entry main menu (REQ-029) but in **in-level pause mode with backdrop** (vs splash entry mode without backdrop, which never shows `End Run` and does show `New Game`). Pressing **Continue** (or `Escape`/`P` again) SHALL simply **hide the overlay and resume the game** at the exact state it was paused (ball position/velocity preserved if it was in flight). Pressing **`End Run`** SHALL **end the current run**, **remove it from `localStorage`** (`STORAGE_KEY` cleared), reset to entry main menu (splash, no backdrop) and **shall NOT count toward the per-course record** (`bestTotal` unchanged). The **pause menu while inside a level SHALL never show the button "New Game"** (even though entry does).

## Rationale
Players need standard pause affordances (`Escape` and `P` for `Pause`) that work at any time, including mid-flight, without losing progress. Reusing the main menu buttons (minus `New Game` to avoid starting a second course while paused) keeps the HUD minimal. A backdrop shadowing the field distinguishes pause (field is visible but dimmed) from the splash entry (field not visible). `End Run` gives an explicit abandon path that clears the persisted run without polluting leaderboards.

## Requirements

1. **Trigger & State — Escape or P Works Even In Flight, Never New Game** in `src/main.js`:
   - State SHALL reuse `mainMenuVisible: boolean` (REQ-029) for the overlay, with `isInLevelPause: boolean` to distinguish **splash entry mode** (no backdrop, never `End Run`) vs **in-level pause mode** (with backdrop, never `New Game`).
   - **When in a level** (`activeCourse !== null` or `STORAGE_KEY` has `courseId`, and `!mainMenuVisible` before press, regardless of `gameState`):
     - Pressing **either `Escape` or `P`** SHALL set `mainMenuVisible = true`, `isInLevelPause = true`, `courseMenuVisible = false`, `helpVisible = false`, show `#main-menu-overlay` **with backdrop** (`with-backdrop` class `background: rgba(0,0,0,0.55)`), and pause the game (see §4). This SHALL work when `gameState === "FLYING"` (ball in flight), `AIMING`, `CHARGING`, or even `WIN` (though `WIN` already has its own overlay, `WIN` MAY take priority — document choice, but `FLYING` MUST be supported).
     - Both `e.code === "Escape"` and `e.code === "KeyP"` SHALL be treated identically for opening the pause; tests SHALL verify pressing `KeyP` while `AIMING` or `FLYING` shows the same overlay with backdrop as `Escape`.
     - No `selectedModifier` deselection priority SHALL block the pause in this mode.
   - **Closing via Continue or Escape/P:**
     - While the in-level pause overlay is visible (`mainMenuVisible===true` && `isInLevelPause===true`), pressing **either `Escape` or `P`** again **or** clicking **`Continue`** SHALL simply **hide the overlay** (`mainMenuVisible=false`, `isInLevelPause=false`, remove backdrop) and **resume the game** at the exact paused state. No state reset, no `clearProgress`, no `loadProgress` re-parse.
     - `Continue` text SHALL be exactly `"Continue"`, `id="continue-button"`, opaque `background:#2ecc71`. It SHALL be **visible whenever an active run exists** (which it does in this context).
   - **Never New Game on pause:** While `isInLevelPause===true`, `New Game` (`#new-game-button`) SHALL be **hidden** (`hidden` class) — the pause menu never shows `New Game` (tests SHALL verify `document.getElementById('new-game-button').classList.contains('hidden')` is true when `isInLevelPause` with backdrop). `Help` and `End Run` remain visible per §2.
   - **Blocking while paused:**
     - While the in-level pause overlay is visible, `update()` SHALL pause ball physics (no `updateBall`) but SHALL still call `updateWindUniforms`. `handleLaunch()` (Space) and placement/drag/hotkeys SHALL be no-op, `maybeShowRewardMenu` blocked, hotbar hidden.
     - `R` while paused SHALL be blocked; only `Continue`/`Escape`/`P` and `End Run`/`Help` apply.

2. **Extra Button — End Run (Abandon Without Record, Never on Splash)** in `src/main.js` / `index.html` / `style.css`:
   - The in-level pause overlay SHALL contain **`End Run`** (`id="end-run-button"` inside `#main-menu-root` — tests check text `"End Run"`), **in addition to** `Continue` and `Help`, **but never `New Game`**. On splash entry (no active run or after End Run, `!isInLevelPause`), `End Run` SHALL be **hidden** (the main menu with the splash screen never shows `End Run` — even if `hasRestorableSave()` would be true, entry hides it).
   - The pause menu SHALL **never** show `New Game`; the entry menu SHALL **never** show `End Run`. This is a strict split: entry shows `Continue`/`New Game`/`Help`; pause shows `Continue`/`Help`/`End Run`.
   - Clicking `End Run` SHALL:
     ```js
     function endRun(){
       clearProgress(); // remove STORAGE_KEY
       // reset run state to entry defaults without touching COURSES_KEY or bestTotal
       currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
       supply={amplify:1,nullify:1,flip:1}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
       secretRewardCounter=0; rewardPending=false; firstRewardClaimed=false;
       rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
       rewardChosenCounts={amplify:0,nullify:0,flip:0,freeShots:0,areaUp:0,bouncyBall:0};
       modifiers=[]; syncModifiersToField(); selectedModifier=null;
       // show entry main menu (splash, no backdrop, never End Run)
       mainMenuVisible=true; isInLevelPause=false; courseMenuVisible=false; helpVisible=false;
       // do NOT call maybeUpdateHighScore / maybeUpdateCourseRecord
     }
     ```
     - **Remove from storage:** `localStorage.removeItem(STORAGE_KEY)`. `COURSES_KEY` SHALL be preserved.
     - **Record shall NOT count:** `bestTotal` unchanged. Only full course completion updates `bestTotal`.
     - **UI after End Run:** hide backdrop, show entry menu over splash (`background:transparent`, `Continue` hidden because no active run now, `New Game`/`Help` visible, `End Run` never visible), bottom canvas splash.
   - `End Run` SHALL be styled distinct (red): `background:#e74c3c` opaque `border:1px solid #c0392b`, white text, hover `#c0392b`.

3. **Menu Rendering — Main Menu Buttons With Backdrop Shadowing Field, No New Game on Pause** in `index.html` / `style.css` / `src/main.js`:
   - The overlay used for Escape/P-in-level SHALL be **the same `#main-menu-overlay`** as entry (REQ-029), not a separate `#pause-overlay` (legacy `#pause-overlay` SHALL be removed or kept hidden; tests SHALL verify the pause-triggered menu is `#main-menu-overlay`, not `#pause-overlay`). When shown via Escape/P during a level, it SHALL have a **backdrop**:
     ```css
     #main-menu-overlay { background: transparent; }
     #main-menu-overlay.with-backdrop { background: rgba(0,0,0,0.55); }
     ```
     Tests SHALL verify: when `mainMenuVisible` is shown via Escape/P during a level, `getComputedStyle(mainMenuOverlay).backgroundColor` is `rgba(0, 0, 0, 0.55)`, not `transparent`; when shown as entry over splash, it is `transparent`.
   - The overlay SHALL be centered over the canvas with content `.main-menu-content` `max-width:90%; max-height:90%`. All visible buttons SHALL be **opaque** (`#2ecc71` for Continue/Help, `#e74c3c` for End Run), not semi-transparent. `New Game` SHALL be `hidden` on pause.
   - **Continue button behavior:** clicking `Continue` SHALL simply hide the overlay (`mainMenuVisible=false`, remove `with-backdrop`) and resume the game loop (unpause). No reload, no `loadProgress`. If the ball was in flight (`FLYING` with `ball.vel` non-zero), after Continue the ball **shall continue its flight** from the exact preserved position/velocity.

4. **Pause Semantics — Continue Resumes Exactly** in `src/main.js`:
   - While the in-level pause overlay is visible, `update(dt)` SHALL NOT advance `ball` physics (`ball.pos`/`ball.vel` frozen), but SHALL still call `updateWindUniforms` and `render()` (wind shader animates and field remains visible dimmed behind backdrop). `render()` SHALL still draw the level behind the dimmed overlay.
   - On `Continue` (or `Escape`/`P` to close), the next `update(FIXED_DT)` SHALL resume from the frozen state. For `FLYING`, ball continues with same velocity; for `CHARGING`, charge is preserved or reset to `AIMING` as documented.
   - No `saveProgress()` side-effect on `Continue`.

5. **Interaction & Priority** in `src/main.js`:
   - **Escape/P priority chain when in a level:**
     1. If `rewardMenuVisible` is true, Escape/P SHALL be **blocked** (reward has priority) — do not open pause behind reward.
     2. Else if `gameState==="WIN"` (win overlay visible), Escape/P SHALL be **ignored** (win uses `R`/`Next`).
     3. Else if `mainMenuVisible` is already true (`isInLevelPause===true`), Escape/P SHALL close it (same as Continue).
     4. Else (in `AIMING`/`CHARGING`/`FLYING` with no reward/win), **either `Escape` or `P`** SHALL open the in-level pause overlay (with backdrop, never New Game).
   - While pause is visible, `R`, `Space`, `Arrow`, `1`/`2`/`3`, `click` SHALL be blocked. Only `Continue`/`Escape`/`P`, `End Run`, `Help` → help overlay, and `Back` shall work. `Help` shall keep the backdrop.
   - The legacy `#pause-overlay` SHALL be removed or kept hidden; the Escape/P path SHALL show `#main-menu-overlay` with `with-backdrop`.

6. **No Duplicate Pause Overlay:**
   - The legacy `#pause-overlay` SHALL be **removed** or kept permanently `hidden` and never shown; the Escape/P path SHALL show `#main-menu-overlay` (with `with-backdrop` class) instead. Tests SHALL verify `document.getElementById('pause-overlay')` is either `null` or `hidden` when Escape/P pause is visible, and `#main-menu-overlay` is visible with backdrop.

## Acceptance Criteria

- [ ] While in a level (after starting a course via `New Game` → course play on entry, at `Hole:1` `AIMING`, `STORAGE_KEY` has `courseId`), pressing **`Escape` or `P` (`KeyP`)** shows **main menu overlay** (`#main-menu-overlay` `!hidden`) **with backdrop** (`getComputedStyle(mainMenuOverlay).backgroundColor === "rgba(0, 0, 0, 0.55)"` or `0.5-0.6`, not `transparent`), containing buttons **Continue** (`#continue-button` text `Continue` visible, opaque), **Help** (`#help-button`), and **End Run** (`#end-run-button` text `End Run` visible, red), **but never `New Game`** (`#new-game-button` `hidden` when `isInLevelPause===true`). The playing field (grass, obstacles, ball, HUD) is still rendered behind the dimmed backdrop (not cleared to splash). Pressing `Escape` or `P` again **or** clicking `Continue` hides the overlay (`hidden` true, `mainMenuVisible false`), removes the backdrop, and the game resumes in the same `gameState`.
- [ ] **Entry never shows End Run:** on fresh load with no run, and also after reload with an active save when the overlay is shown over splash with `background:transparent` (entry mode, `!isInLevelPause`), `document.getElementById('end-run-button').classList.contains('hidden')` is true (End Run never visible on splash), even though `Continue` may be visible when a save exists. `New Game` is visible on entry.
- [ ] **Pause never shows New Game:** while paused via `Escape`/`P` at any hole, `document.getElementById('new-game-button').classList.contains('hidden')` is true, while `document.getElementById('end-run-button').classList.contains('hidden')` is false. On entry, the opposite.
- [ ] **Both Escape and P work even if a ball is in flight:** launch a ball (`Space` charge → shoot, `gameState==="FLYING"`, `ball.isMoving true`), while it is still moving, press `Escape` **and separately test `P`** — each shows the main menu overlay with backdrop and freezes the ball (`ball.pos` unchanged over 500ms while paused). Clicking `Continue` unfreezes and the ball continues its trajectory (not teleported to tee).
- [ ] **End Run:** while the pause is visible, clicking `End Run` clears `localStorage.getItem(STORAGE_KEY)` (`null`), hides the pause menu, shows the **entry main menu** over splash (`background:transparent` without backdrop, `Continue` hidden because no active run, `New Game`/`Help` visible, `End Run` never visible on splash), bottom canvas shows splash (not grass), and the per-course `bestTotal` for the active course is **unchanged** (if it was `null` or `12`, it stays `null`/`12`, not updated to `totalAttempts` of the abandoned run). Reloading after End Run still shows entry menu with `Continue` hidden.
- [ ] **Continue simply resumes:** while paused via `Escape`/`P` at `Hole:2` `holeAttempts=1` `totalAttempts=5` with a modifier placed (`modifiers.length=1`), clicking `Continue` hides the overlay and the next frame still shows `Hole:2` `Attempts:1` `Total:5` with the same modifier on the field (`getWindAt` unchanged) and `supply` unchanged; no `clearProgress` or `loadProgress` side-effect, `STORAGE_KEY` still has the same `courseId` and counters.
- [ ] **Backdrop distinction:** on fresh entry over splash has `background:transparent`; on Escape/P-in-level pause has `background:rgba(0,0,0,0.55)` (or `with-backdrop` class). Toggling `End Run` switches from `0.55` back to `transparent`.
- [ ] No legacy pause overlay is shown: `document.getElementById('pause-overlay')` is `null` or `hidden` when Escape/P pause is visible; the visible overlay is `#main-menu-overlay` with `with-backdrop`/`data-mode="pause"`.
- [ ] While the pause is visible, input is blocked: holding `ArrowRight` does not change `getAimAngle()`, holding `Space` does not increase `charge`, clicking does not place a modifier. `updateBall` is not called while paused (ball frozen), but `updateWindUniforms` still runs (wind animation visible behind backdrop).

## Dependencies

- REQ-002 (16:9 dual canvases, centered)
- REQ-012 (rendering split, HUD on top canvas)
- REQ-013 (responsive)
- REQ-027 (STORAGE_KEY, save on attempt, clear on End Run, no record on abandon)
- REQ-029 (main menu HTML, Continue/New Game/Help vs Continue/Help/End Run split, never End Run on splash / never New Game on pause)
- REQ-030 (grass vs splash, backdrop shadowing field when paused)
- REQ-031 (courses, bestTotal only on full completion)

## Notes

- Implementation sketch `src/main.js`:
  ```js
  // In window keydown handler:
  // if (mainMenuVisible && isInLevelPause) { if (e.code==="Escape"||e.code==="KeyP") { mainMenuVisible=false; isInLevelPause=false; syncMainMenu(); return; } }
  // else if (!mainMenuVisible && (gameState==="AIMING"||gameState==="CHARGING"||gameState==="FLYING") && !rewardMenuVisible && gameState!=="WIN") {
  //   if (e.code==="Escape"||e.code==="KeyP") {
  //     mainMenuVisible=true; isInLevelPause = !!activeCourse;
  //     if (isInLevelPause) mainMenuOverlay.classList.add('with-backdrop');
  //     syncMainMenu(); return;
  //   }
  // }
  // function renderMainMenuRootVisibility(){
  //   const isPause = isInLevelPause;
  //   document.getElementById('continue-button').classList.toggle('hidden', !hasRestorableSave());
  //   document.getElementById('end-run-button').classList.toggle('hidden', !isPause || !hasRestorableSave());
  //   document.getElementById('new-game-button').classList.toggle('hidden', !!isPause);
  // }
  ```
- CSS for backdrop:
  ```css
  #main-menu-overlay { background: transparent; }
  #main-menu-overlay.with-backdrop { background: rgba(0,0,0,0.55); }
  ```
- Keep `rewardMenuVisible` and `WIN` priority: Escape/P behind those overlays is ignored.

## File Paths

- `src/main.js:1` (Escape and P handlers even in FLYING, mainMenuVisible with isInLevelPause/with-backdrop, handleContinue simply hides overlay to resume preserving ball state, endRun clears STORAGE_KEY without maybeUpdateHighScore, renderMainMenuRootVisibility with never End Run on splash / never New Game on pause)
- `index.html:1` (#main-menu-overlay contains Continue/New Game/Help/End Run buttons, #pause-overlay removed or hidden)
- `style.css:1` (#main-menu-overlay transparent by default, .with-backdrop rgba(0,0,0,0.55) shadowing field, opaque buttons)
- `docs/requirements/REQ-028-escape-pause-menu.md:1` (this file)

