# REQ-029: Main Menu (No Run) — New Game + High Score + HTML Overlay Bounded to Canvas + Dual Background

- **ID:** REQ-029
- **Title:** Main Menu When No Run In Play — New Game, High Score, Pause End Run; HTML Overlay Centered Over 16:9 Canvas, Not Overflowing
- **Priority:** Should Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / Persistence / UI (REQ-011/REQ-014/REQ-027/REQ-028 Extension)

## Description
The game SHALL show a **main menu** whenever **no current run is in play** (fresh load with no saved progress, after `End Run`, or after a completed run has been cleared). The main menu SHALL have a single primary button **New Game** which starts a fresh run at hole 1 with supply `{1,1,1}` and no pending reward, below it a text **Current high score** with the best total shots from a completed run (lowest total wins). **The main menu SHALL be rendered purely as regular HTML elements** (DOM overlay `#main-menu-overlay` inside `#game-container`) centered over the **16:9 stacked canvases**, not drawn inside the canvas via `drawMainMenu`. The overlay SHALL be bounded to the canvas area and SHALL NOT overflow the canvas. While main menu is visible, the **bottom canvas** SHALL show `img/gfg-splash.png` (fallback `img/gfg-spash.png`) as its background (REQ-030). The existing **pause menu** (`Escape`) SHALL be `End Run` (not `New Game`) and return to the main menu.

## Rationale
`localStorage` persistence means a no-run visit needs an explicit HTML entry point that is always legible, responsive, and accessible without canvas text metrics. HTML centering over the 16:9 container guarantees the menu stays inside the canvas at any viewport, while the bottom canvas splash gives a branded backdrop without canvas-drawn golf art. Dual-canvas 16:9 (REQ-002/013) requires overlays to be `position:absolute; inset:0` inside the container, not full-viewport.

## Requirements

1. **Main Menu State & Visibility** in `src/main.js` / `index.html` / `style.css`:
   - State SHALL include `mainMenuVisible: boolean` (default `false` until evaluated on load). `true` = HTML overlay shown + game paused + bottom canvas shows splash; `false` = normal play.
   - **When to show:** `true` iff no current run in play:
     - On initial load after `setupCanvas()` and `loadProgress()` attempt, if `localStorage.getItem(STORAGE_KEY)` is `null`/corrupt/wrong version **and** no in-memory run started (`currentHoleIndex===0 && totalAttempts===0 && holeAttempts===0 && modifiers.length===0 && supply all 1` after `initLevel(0)`), then `mainMenuVisible = true`.
     - After `End Run` (`clearProgress()` + reset), `mainMenuVisible = true`.
     - After a new-game clear not auto-started, `mainMenuVisible` is idle state. `New Game` click SHALL set `mainMenuVisible=false` and start hole 1.
     - `false` while run active: `totalAttempts>0` or `holeAttempts>0` or non-initial supply/freeShots/area/bouncy or `modifiers.length>0` or `FLYING`/`WIN` or restored save.
   - **Blocking:** While `true`, paused like `pauseMenuVisible`/`rewardMenuVisible`/`WIN`: `update` not advance `ball` but `updateParticles` still; `handleLaunch()` no-op; placement/drag/hotkeys ignored; `Escape` ignored (not open pause); `R` ignored; hotbar hidden; `maybeShowRewardMenu` blocked. Bottom canvas SHALL show splash (REQ-030) while true; on `false` it SHALL tile grass.
   - Reset to `false` on `New Game` start, to `true` on `End Run`. Reload re-evaluates via `loadProgress()`.

2. **New Game Button — HTML Only, Centered Over Canvas, Not Overflowing** in `src/main.js` / `index.html` / `style.css`:
   - The main menu SHALL be **only HTML** (`#main-menu-overlay` inside `#game-container`):
     ```html
     <div id="game-container">
       <canvas id="bg-canvas"></canvas>
       <canvas id="game"></canvas>
       <div id="main-menu-overlay" class="hidden">
         <div class="main-menu-content">
           <h2>Golf Vector Field</h2>
           <button id="main-new-game-button">▶ New Game</button>
           <p class="high-score">Current high score: —</p>
         </div>
       </div>
       <!-- pause/win overlays also inside container -->
     </div>
     ```
   - No canvas `drawMainMenu` SHALL be drawn while HTML menu exists; `src/render.js:drawMainMenu` SHALL be removed or never called when `mainMenuVisible true` (or kept only as dead code). Tests SHALL verify **no** `canvas` text `Golf Vector Field` drawn when HTML overlay is visible (only DOM).
   - Overlay SHALL be centered over canvas and **not overflow**: CSS SHALL be:
     ```css
     #main-menu-overlay {
       position: absolute; inset: 0; /* bounded to #game-container */
       display: flex; align-items: center; justify-content: center;
       width: 100%; height: 100%;
       background: rgba(0,0,0,0.35); /* dim over bottom splash, not over full viewport */
       border-radius: 8px; z-index: 12;
     }
     #main-menu-overlay.hidden { display:none; }
     .main-menu-content {
       display:flex; flex-direction:column; align-items:center; gap:14px;
       max-width: 90%; max-height: 90%; /* never overflow canvas */
       padding: 24px 20px; background: transparent; text-align:center;
     }
     ```
     Container `#game-container` SHALL be `position:relative` 16:9 (REQ-013) so `inset:0` is exactly the canvas area.
   - Button handler `startNewGameFromMain()` (same logic as before, but also switches bottom canvas to grass):
     ```js
     function startNewGameFromMain(){
       clearProgress();
       currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
       supply={amplify:1,nullify:1,flip:1}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; bouncyRemaining=0;
       secretRewardCounter=0; rewardPending=false;
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
       drawBackgroundMode('grass'); // bottom canvas now tiles grass (REQ-030)
     }
     ```
     Starts at hole 1 `AIMING`, `Hole:1/M Attempts:0 Total:0`, no initial reward menu.
   - Button visuals: centered `160×48` green `rgba(46,204,113,0.28)` border `rgba(46,204,113,0.9)` 2px hover `0.38`, label `New Game` `700 14px` white stroke `rgba(0,0,0,0.65) 3px`, icon `▶` 14px, centered inside `.main-menu-content` with `max-width:90%` so it never overflows canvas at small sizes.
   - While visible, `Escape` and `R` ignored; only `New Game` click/Enter closes it.

3. **Pause Menu Change — New Game → End Run** (unchanged but now also switches bottom to splash):
   - Pause second button text SHALL be **End Run** (id `end-run-button`), red styling, handler `endRun()` clears `STORAGE_KEY` but preserves `HIGH_SCORE_KEY`, resets run to `{1,1,1}`, sets `mainMenuVisible=true` + `pauseMenuVisible=false`, `loadLevel(0)`, and calls `drawBackgroundMode('splash')` so bottom canvas shows splash behind the newly shown HTML main menu.

4. **High Score** below New Game button:
   - `HIGH_SCORE_KEY="golfVectorField.highScore.v1"` JSON `{"version":1,"bestTotal":number}` with `try/catch`.
   - Update on final hole `WIN` via `maybeUpdateHighScore()` as before (lowest `totalAttempts` wins, ties keep).
   - Display: inside `.main-menu-content` below New Game, centered, `600 13px` white stroke, `Current high score: N` or `—`/`none`. Must be inside `max-width:90%` so text wraps but never overflows canvas (`word-break:break-word` tolerated, but `max-width:100%` of content).
   - Persists through `End Run` and `clearProgress()` (different key).

5. **Main Menu Background — Splash on Bottom Canvas (no canvas golf art)**:
   - While `mainMenuVisible===true`, bottom canvas SHALL show `img/gfg-splash.png` (fallback `img/gfg-spash.png`) aspect-covered (REQ-030) behind the HTML overlay; **no canvas-drawn golf ball/club/hole SHALL be drawn** as background art. The HTML overlay’s `background:rgba(0,0,0,0.35)` dims the splash for legibility, but splash remains visible through the transparent `.main-menu-content`.
   - When `mainMenuVisible===false` (level play), bottom canvas tiles `img/grass_seamless.webp`.
   - No `<img>` element for splash/grass inside DOM; bottom canvas is the renderer. No external assets beyond the two `img/` files.

6. **Interaction & Lifecycle**:
   - While `mainMenuVisible===true`: `update` pauses ball, `handleLaunch` no-op, `Escape` ignored, hotbar hidden, `maybeShowRewardMenu` blocked.
   - Visibility priority: if `mainMenuVisible true`, both `pauseMenuVisible` and `rewardMenuVisible` and `WIN` false. `endRun` sets `mainMenuVisible=true` atomically.

## Acceptance Criteria

- [ ] On fresh visit (clear both keys, reload), page shows **HTML main menu** (`mainMenuVisible true`) **centered over the 16:9 stacked canvases** (`#main-menu-overlay` `position:absolute; inset:0` inside `#game-container`, `display:flex; align-items:center; justify-content:center`): title `Golf Vector Field` 22px, centered button `New Game` `160×48` green inside `max-width:90%` content, below it `Current high score: —` 13px, all inside the canvas area. **No part of the overlay overflows** the canvas (`overlay.getBoundingClientRect()` contained within `container.getBoundingClientRect()` on all viewports, width ≤90% of container, not viewport-width). Bottom canvas behind shows `gfg-splash.png` (or `gfg-spash.png`) aspect-covered, not tiled grass. Top canvas is transparent above splash. No `canvas` text `drawMainMenu` is drawn (inspect `render.js` not calling `drawMainMenu` when HTML menu visible, or `drawMainMenu` removed).
- [ ] While main menu visible, game paused: `ArrowRight` no aim change, `Space` no charge, click no modifier, `Escape` does NOT open pause nor close main menu. Container is 16:9 maximized centered (`container width/height ratio 1.77±0.02`).
- [ ] Clicking `New Game` (DOM `#main-new-game-button` inside overlay) starts run at hole 1: overlay `hidden`, `mainMenuVisible false`, bottom canvas switches to **tiled grass** (`grass_seamless.webp` repeat), top canvas draws level, `Hole:1/M Attempts:0 Total:0`, supply `{1,1,1}`, no reward menu, STORAGE_KEY null before first attempt. Reload after one counted attempt resumes at `1/1` (not main menu).
- [ ] Completing full run stores `HIGH_SCORE_KEY` as before; `End Run` clears STORAGE_KEY but keeps HIGH_SCORE, shows HTML main menu with splash again, `Current high score: N`.
- [ ] `End Run` change: pause shows `Resume` + `End Run` (not `New Game`), clicking `End Run` abandons run, shows HTML main menu with splash, STORAGE_KEY null, but HIGH_SCORE preserved, splash visible behind HTML.
- [ ] No `New Game` text remains in pause menu; only main menu has `New Game`.
- [ ] Overlays never overflow: `#pause-overlay`, `#main-menu-overlay`, `#win-overlay` all `position:absolute; inset:0; width:100%; height:100%` inside `#game-container`, `max-width/height 100%` for content, so on `375px` viewport no horizontal scroll or clipped outside canvas.

## Dependencies
- REQ-002 (16:9 dual canvases)
- REQ-013 (16:9 responsive centering, overlay bounds)
- REQ-030 (background images tiled/splash)
- REQ-012 (dual-canvas draw split)
- REQ-027/028 (persistence, pause)

## Notes
- Remove `drawMainMenu(ctx,W,H,...)` and `getMainMenuButtonsLayout` from `src/render.js:1` if present; replace with `drawBackground(bgCtx,W,H,mode)` that handles `grass` vs `splash`. HTML main menu no longer needs hit-testing.
- Preload both images once; on `startNewGameFromMain`/`endRun` call `redrawBottom()` to switch pattern. Bottom draw uses `createPattern` for grass and aspect-cover `drawImage` for splash, both scaled by DPR `setTransform(dpr,0,0,dpr,0,0)`.
- Keep `.main-menu-content h2` styled like pause title: `700 22px` white with `stroke rgba(0,0,0,0.75) 5px` for contrast over splash dim.

## File Paths
- `src/main.js:1` (mainMenuVisible, HIGH_SCORE_KEY, startNewGameFromMain, endRun, init visibility, overlay bound, background mode switch)
- `index.html:1` (#game-container with #bg-canvas + #game + #main-menu-overlay HTML inside container, not overflow)
- `style.css:1` (#main-menu-overlay absolute inset 0 centered, .main-menu-content max-width 90%, container 16:9)
- `src/render.js:1` (remove drawMainMenu, add drawBackground bgCtx vs top dynamic, no canvas golf art)
