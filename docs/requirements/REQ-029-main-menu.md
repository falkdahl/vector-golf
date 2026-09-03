# REQ-029: Main Menu (No Run) — HTML Overlay Bounded to Canvas + Dual Background

- **ID:** REQ-029
- **Title:** Main Menu When No Run In Play — HTML Overlay Centered Over 16:9 Canvas, Not Overflowing
- **Priority:** Should Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / Persistence / UI (REQ-011/REQ-014/REQ-027/REQ-028 Extension)

## Description
The game SHALL show a **main menu** whenever **no current run is in play** (fresh load with no saved progress, after `End Run`, or after a completed run has been cleared). **With multiple courses (REQ-031) the main menu SHALL show a scrollable list of one button per saved course as two rows — upper row the course **name** (`course-name` `700 13px`) and lower row the **hole count + record** (`course-meta` `500 11px`, e.g., `"9 holes\u2003Record: 42"` with long space `\u2003` between holes and record, not a dash) — plus per-course Export/Delete buttons, and footer actions New Course / Import Course; the title `Golf Vector Field` (`h2` inside the overlay) and the legacy single **New Game** button and **Current high score** text have been **removed** from the main menu overlay (the `h1` outside `#game-container` remains).** **The main menu SHALL be rendered purely as regular HTML elements** (DOM overlay `#main-menu-overlay` inside `#game-container`) centered over the **16:9 stacked canvases**, not drawn inside the canvas via `drawMainMenu`. The overlay SHALL be bounded to the canvas area and SHALL NOT overflow the canvas. While main menu is visible, the **bottom canvas** SHALL show `img/gfg-splash.png` (fallback `img/gfg-spash.png`) as its background (REQ-030). The existing **pause menu** (`Escape`) SHALL be `End Run` (not `New Game`) and return to the main menu. **See REQ-031 for the multi-course roster, per-course records, export/import and name generation.**

## Rationale
`localStorage` persistence means a no-run visit needs an explicit HTML entry point that is always legible, responsive, and accessible without canvas text metrics. HTML centering over the 16:9 container guarantees the menu stays inside the canvas at any viewport, while the bottom canvas splash gives a branded backdrop without canvas-drawn golf art. Dual-canvas 16:9 (REQ-002/013) requires overlays to be `position:absolute; inset:0` inside the container, not full-viewport. The global high-score text and single New Game button were removed to make the course collection the primary entry point.

## Requirements

1. **Main Menu State & Visibility** in `src/main.js` / `index.html` / `style.css`:
   - State SHALL include `mainMenuVisible: boolean` (default `false` until evaluated on load). `true` = HTML overlay shown + game paused + bottom canvas shows splash; `false` = normal play.
   - **When to show:** `true` iff no current run in play:
     - On initial load after `setupCanvas()` and `loadProgress()` attempt, if `localStorage.getItem(STORAGE_KEY)` is `null`/corrupt/wrong version **and** no in-memory run started (`currentHoleIndex===0 && totalAttempts===0 && holeAttempts===0 && modifiers.length===0 && supply all 1` after `initLevel(0)`), then `mainMenuVisible = true`.
     - After `End Run` (`clearProgress()` + reset), `mainMenuVisible = true`.
     - After a new-game clear not auto-started, `mainMenuVisible` is idle state.
     - `false` while run active: `totalAttempts>0` or `holeAttempts>0` or non-initial supply/freeShots/area/bouncy or `modifiers.length>0` or `FLYING`/`WIN` or restored save.
   - **Blocking:** While `true`, paused like `pauseMenuVisible`/`rewardMenuVisible`/`WIN`: `update` not advance `ball` but `updateWind` still; `handleLaunch()` no-op; placement/drag/hotkeys ignored; `Escape` ignored (not open pause); `R` ignored; hotbar hidden; `maybeShowRewardMenu` blocked. Bottom canvas SHALL show splash (REQ-030) while true; on `false` it SHALL tile grass.
   - Reset to `false` on course play start, to `true` on `End Run`. Reload re-evaluates via `loadProgress()`.

2. **Main Menu Content — Course List Only (No Title, No High Score Text, No Single New Game Button)** in `src/main.js` / `index.html` / `style.css`:
   - The main menu SHALL be **only HTML** (`#main-menu-overlay` inside `#game-container`):
     ```html
     <div id="game-container">
       <canvas id="bg-canvas"></canvas>
       <canvas id="game"></canvas>
       <canvas id="wind-canvas"></canvas>
       <div id="main-menu-overlay" class="hidden">
         <div class="main-menu-content">
           <p class="subtitle">Choose a Course</p>
           <div id="course-list" class="course-list"></div>
           <div id="main-menu-footer">
             <button id="new-course-button">+ New Course</button>
             <button id="import-course-button">⤵ Import Course</button>
           </div>
           <div id="new-course-choices" class="hidden">...</div>
           <div id="import-area" class="hidden">...</div>
         </div>
       </div>
     </div>
     ```
     **No `<h2>Golf Vector Field</h2>` SHALL be present inside `#main-menu-overlay`** (`document.querySelector('#main-menu-overlay h2')` is `null`), the `h1` outside `#game-container` remains.
   - **No `Current high score: —` text SHALL be present in the main menu**, and **no single `New Game` button (`#main-new-game-button`) SHALL be present**. Tests SHALL verify `document.getElementById('main-new-game-button')` is `null` and `document.querySelector('.high-score')` is `null` or hidden and contains no `Current high score` text.
   - The per-course play button text SHALL use a **long space** (`\u2003\u2003` em spaces) between course name and record, e.g., `"Gentle Dunes\u2003\u2003Record: 42"` and `"Record: —"` — **not** a dash `—`/`-` . This is implemented in `src/main.js:renderCourseList()` as `` `${course.name}\u2003\u2003Record: ${record}` ``.
   - No canvas `drawMainMenu` SHALL be drawn while HTML menu exists; `src/render.js:drawMainMenu` SHALL be removed or never called when `mainMenuVisible true` (or kept only as dead code). Tests SHALL verify **no** `canvas` text `Golf Vector Field` drawn when HTML overlay is visible (only DOM).
   - Overlay SHALL be centered over canvas and **not overflow**: CSS SHALL be:
     ```css
     #main-menu-overlay {
       position: absolute; inset: 0;
       display: flex; align-items: center; justify-content: center;
       width: 100%; height: 100%;
       background: rgba(0,0,0,0.35);
       border-radius: 8px; z-index: 12;
     }
     #main-menu-overlay.hidden { display:none; }
     .main-menu-content {
       display:flex; flex-direction:column; align-items:center; gap:14px;
       max-width: 90%; max-height: 90%;
       padding: 24px 20px; background: transparent; text-align:center;
     }
     ```
     Container `#game-container` SHALL be `position:relative` 16:9 (REQ-013) so `inset:0` is exactly the canvas area.

3. **Pause Menu Change — New Game → End Run** (unchanged but now also switches bottom to splash):
   - Pause second button text SHALL be **End Run** (id `end-run-button`), red styling, handler `endRun()` clears `STORAGE_KEY` but preserves `HIGH_SCORE_KEY` (for migration only) and `COURSES_KEY`, resets run to `{1,1,1}`, sets `mainMenuVisible=true` + `pauseMenuVisible=false`, `loadLevel(0)`, and calls `drawBackgroundMode('splash')` so bottom canvas shows splash behind the newly shown HTML main menu.

4. **Main Menu Background — Splash on Bottom Canvas (no canvas golf art)**:
   - While `mainMenuVisible===true`, bottom canvas SHALL show `img/gfg-splash.png` (fallback `img/gfg-spash.png`) aspect-covered (REQ-030) behind the HTML overlay; **no canvas-drawn golf ball/club/hole SHALL be drawn** as background art. The HTML overlay’s `background:rgba(0,0,0,0.35)` dims the splash for legibility, but splash remains visible through the transparent `.main-menu-content`.
   - When `mainMenuVisible===false` (level play), bottom canvas tiles `img/grass_seamless.webp`.
   - No `<img>` element for splash/grass inside DOM; bottom canvas is the renderer. No external assets beyond the two `img/` files.

5. **Interaction & Lifecycle**:
   - While `mainMenuVisible===true`: `update` pauses ball, `handleLaunch` no-op, `Escape` ignored, hotbar hidden, `maybeShowRewardMenu` blocked.
   - Visibility priority: if `mainMenuVisible true`, both `pauseMenuVisible` and `rewardMenuVisible` and `WIN` false. `endRun` sets `mainMenuVisible=true` atomically.

## Acceptance Criteria

- [ ] On fresh visit (clear both keys, reload), page shows **HTML main menu** (`mainMenuVisible true`) **centered over the 16:9 stacked canvases** (`#main-menu-overlay` `position:absolute; inset:0` inside `#game-container`, `display:flex; align-items:center; justify-content:center`): **no `h2` `Golf Vector Field` title inside the overlay** (`document.querySelector('#main-menu-overlay h2')` is `null`), subtitle `Choose a Course`, scrollable `#course-list` with per-course **two-row buttons** (upper `span.course-name` `700 13px` name, lower `span.course-meta` `500 11px` `"<holeCount> holes\u2003Record: —"` with long space `\u2003` between holes and `Record:`), footer `+ New Course` and `⤵ Import Course`, all inside `max-width:90%`. **No `Current high score: —` text is present** and **no `#main-new-game-button` exists**. Bottom canvas behind shows `gfg-splash.png` aspect-covered. No `canvas` text `drawMainMenu` is drawn.
- [ ] Per-course button text uses **long space** not dash: `course-play-button` text matches `/\u2003.*Record:/` and does **not** contain ` — ` between name and `Record`. Verified via `getComputedStyle` or `textContent.includes('\u2003')` and `!textContent.includes(' — Record')`.
- [ ] While main menu visible, game paused: `ArrowRight` no aim change, `Space` no charge, click no modifier, `Escape` does NOT open pause nor close main menu. Container is 16:9 maximized centered.
- [ ] Clicking a course play button starts run at hole 1 of that course: overlay `hidden`, `mainMenuVisible false`, bottom canvas switches to **tiled grass**, top canvas draws level, `Hole:1/M Attempts:0 Total:0`, supply `{1,1,1}`, no reward menu, `STORAGE_KEY` contains `courseId`. Reload after one counted attempt resumes at `1/1` (not main menu).
- [ ] `End Run` change: pause shows `Resume` + `End Run` (not `New Game`), clicking `End Run` abandons run, shows HTML main menu with splash, `STORAGE_KEY` null, splash visible behind HTML.
- [ ] No `New Game` text remains in pause menu; only course list has per-course `Export`.
- [ ] Overlays never overflow: `#pause-overlay`, `#main-menu-overlay`, `#win-overlay` all `position:absolute; inset:0; width:100%; height:100%` inside `#game-container`, `max-width/height 100%` for content, so on `375px` viewport no horizontal scroll.

## Dependencies
- REQ-002 (16:9 dual canvases)
- REQ-013 (16:9 responsive centering, overlay bounds)
- REQ-030 (background images tiled/splash)
- REQ-012 (dual-canvas draw split)
- REQ-027/028 (persistence, pause)
- REQ-031 (courses collection, per-course records)

## Notes
- Remove `drawMainMenu(ctx,W,H,...)` and `getMainMenuButtonsLayout` from `src/render.js:1` if present; replace with `drawBackground(bgCtx,W,H,mode)` that handles `grass` vs `splash`. HTML main menu no longer needs hit-testing. Also remove `#main-new-game-button` and `.high-score` from `index.html` and their CSS.
- The per-course button long space is implemented as two em spaces: `` `${course.name}\u2003\u2003Record: ${record}` `` in `src/main.js:renderCourseList()`.

## File Paths
- `src/main.js:1` (mainMenuVisible, startNewGameFromMain removed/kept for migration only, endRun, init visibility, overlay bound, course list rendering with long space)
- `index.html:1` (#game-container with #bg-canvas + #game + #wind-canvas + #main-menu-overlay HTML inside container, not overflow; no #main-new-game-button, no .high-score)
- `style.css:1` (#main-menu-overlay absolute inset 0 centered, .main-menu-content max-width 90%, container 16:9)
- `src/render.js:1` (remove drawMainMenu, add drawBackground bgCtx vs top dynamic, no canvas golf art)
