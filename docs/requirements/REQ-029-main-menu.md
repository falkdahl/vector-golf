# REQ-029: Main Menu — Continue / New Game / Help (Entry, No Backdrop, Never End Run) And Pause Variant Handling

- **ID:** REQ-029
- **Title:** Main Menu With Opaque Buttons Over Splash (Entry, No Backdrop, Never End Run) — Conditional Continue, New Game → Course List, Help Overlay; Pause Variant Never Shows New Game
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / Persistence / UI (REQ-011/REQ-014/REQ-027/REQ-028 Extension)

## Description
The game SHALL show a **main menu** as a **single HTML overlay** (`#main-menu-overlay` inside `#game-container`) centered over the **16:9 stacked canvases**. The overlay has **two modes**: (a) **entry mode** over the splash (`img/gfg-splash.png`) **with no backdrop/dimming** — shown on fresh load, after `End Run`, or when no run is active; and (b) **in-level pause mode** triggered by **Escape or P** while currently in a level (a run is active, regardless of `AIMING`/`CHARGING`/`FLYING`) — **with a backdrop shadowing the playing field** (`rgba(0,0,0,0.55)`) so the field is visible but dimmed. The **entry main menu with the splash screen SHALL never show the button "End Run"** (even if an active saved run exists, `End Run` is hidden on splash). The **pause menu while inside a level SHALL never show the button "New Game"** (even though entry does). In entry mode the root view SHALL contain **Continue** (conditional), **New Game**, **Help** — never `End Run`. In pause mode the root view SHALL contain **Continue**, **Help**, **End Run** — never `New Game`. Clicking "Continue" SHALL simply **hide the overlay and resume the game** at the exact paused state (no reload, no state reset). Clicking "New Game" (entry only) navigates to a **course selection submenu**; clicking "Help" shows a **help overlay**; clicking **"End Run"** (pause only) ends the current run, removes it from `localStorage` and returns to entry mode **without counting toward the per-course record**. All menus SHALL be bounded to the canvas area and SHALL NOT overflow it — scrollable areas SHALL be used instead. While the splash image is still loading, the page background SHALL be **black with centered "Loading..." text**.

## Rationale
Keeping entry (splash) free of `End Run` avoids confusion when no field is visible and prevents accidental abandon from the splash. Keeping pause free of `New Game` avoids starting a second course while a run is paused (course selection belongs on entry). Opaque buttons guarantee legibility. Supporting both `Escape` and `P` covers standard pause affordances and `P` mnemonic.

## Requirements

1. **Main Menu State & Visibility — Entry vs In-Level Pause (Escape/P With Backdrop, Button Visibility Rules)** in `src/main.js` / `index.html` / `style.css`:
   - State SHALL include `mainMenuVisible: boolean` (default `false` until evaluated) plus derived `isInLevelPause: boolean` (or `mainMenuOverlay.dataset.mode` / `with-backdrop` class) to distinguish **entry mode** (over splash, no backdrop, never `End Run`) vs **in-level pause mode** (over playing field, with backdrop, never `New Game`). `true` = HTML main-menu overlay shown + game paused; `false` = normal play.
   - **When to show `mainMenuVisible=true`:**
     - On initial load after `setupCanvases()` + `loadCourses()`, if no run has been resumed, show main menu in **entry mode** (bottom canvas shows splash, overlay `background: transparent`, `with-backdrop` absent). The menu SHALL **always be shown on entry** (even if no save exists) as the entry — the difference is whether "Continue" is rendered; **`End Run` is never rendered on splash** regardless of save.
     - **In a level via Escape or P:** While **currently in a level** (a run is active: `activeCourse !== null` or `hasRestorableSave()` true, regardless of `gameState` being `AIMING`, `CHARGING`, **or `FLYING` — Escape/P SHALL work even if a ball is in flight**), pressing **`Escape` or `P`** (`e.code === "Escape"` or `e.code === "KeyP"`) SHALL set `mainMenuVisible=true` in **in-level pause mode**: overlay `background: rgba(0,0,0,0.55)` (or `with-backdrop` class) shadowing the playing field (grass + field + ball still rendered behind, dimmed), root view shows `Continue`/`Help`/`End Run` (see §2) — **`New Game` is never shown in this mode**. The game SHALL pause (ball frozen, see Blocking) but wind animation continues.
     - After `End Run` (`clearProgress()` + reset), `mainMenuVisible=true` in **entry mode** (no backdrop, splash) and the root view is shown (`courseMenuVisible=false`, `helpVisible=false`, `Continue` hidden because no active run, `End Run` never shown, `New Game`/`Help` visible).
     - Reset to `false` when a run is resumed via "Continue" (simply hide overlay, remove backdrop, resume exact state) or started via a course play button, and to `true` on `End Run` or `Escape`/`P` in level. Reload with a restorable save SHALL still show the entry menu (with Continue, without End Run) rather than auto-resuming — user must click Continue to resume.
   - **Sub-views inside main menu** (mutually exclusive, all inside `#main-menu-overlay`):
     - `mainMenuRootVisible` (default) — entry shows Continue (conditional)/New Game/Help (never End Run); pause shows Continue/Help/End Run (never New Game, End Run visible when active run, Help always).
     - `courseMenuVisible` — shown after clicking "New Game" **only from entry** (pause never shows New Game, so course list is not reachable from pause); shows course list + footer.
     - `helpVisible` — shown after clicking "Help" (from either entry or pause); shows rules + controls + Back.
     - Only one sub-view visible at a time. "Back" from either sub-view returns to root. In in-level pause mode, `Help` → help overlay SHALL keep the **backdrop** (still shadowing field) until the overlay is closed via Continue/Escape/P or a course is picked (backdrop removed on hide). `New Game` is not reachable from pause, so no course list with backdrop is required.
   - **Blocking:** While `mainMenuVisible===true` (any sub-view, either entry or pause), paused: `update` SHALL NOT advance `ball` (ball frozen mid-flight if it was `FLYING`) but `updateWind` still runs and `render()` still draws the field behind the backdrop (when in pause mode) or splash (when in entry mode); `handleLaunch()` no-op; placement/drag/hotkeys ignored; hotbar hidden; `maybeShowRewardMenu` blocked. **Escape/P handling while visible:** pressing `Escape` or `P` again (when `mainMenuVisible` due to in-level pause) SHALL be equivalent to `Continue` (hide overlay and resume). While `mainMenuVisible` due to entry with no run, `Escape`/`P` SHALL be ignored (no pause to close).
   - Priority: if `mainMenuVisible true`, `rewardMenuVisible`/`WIN` SHALL be `false` (or `WIN` takes priority — document choice). The legacy `pauseMenuVisible`/`#pause-overlay` SHALL be removed/kept hidden; the single `#main-menu-overlay` is the pause surface (see REQ-028).

2. **Main Menu Content — Opaque Buttons, Conditional Backdrop, Strict Button Visibility** in `src/main.js` / `index.html` / `style.css`:
   - The main menu SHALL be **only HTML** inside `#game-container` (the same overlay is reused for entry and for in-level pause):
     ```html
     <div id="game-container">
       <canvas id="bg-canvas" width="1280" height="720"></canvas>
       <canvas id="game" width="1280" height="720"></canvas>
       <canvas id="wind-canvas"></canvas>
       <div id="main-menu-overlay" class="hidden">
         <div class="main-menu-content">
           <!-- ROOT: entry shows Continue/New Game/Help; pause shows Continue/Help/End Run -->
           <div id="main-menu-root">
             <button id="continue-button" class="main-menu-button hidden">Continue</button>
             <button id="new-game-button" class="main-menu-button">New Game</button>
             <button id="help-button" class="main-menu-button">Help</button>
             <button id="end-run-button" class="main-menu-button hidden">End Run</button>
           </div>
           <!-- COURSE SUBMENU (hidden until New Game, entry only) -->
           <div id="course-menu" class="hidden">
             <div id="course-list" class="course-list"></div>
             <div id="course-menu-footer">
               <button id="new-course-button">New Course</button>
               <button id="import-course-button">Import</button>
             </div>
             <div id="new-course-choices" class="hidden">...</div>
             <div id="import-area" class="hidden">...</div>
             <button id="course-menu-back">Back</button>
           </div>
         </div>
         <!-- HELP SUBMENU (sibling of .main-menu-content, still inside overlay) -->
         <div id="help-overlay" class="hidden">
           <div class="help-card">
             <h3>How to Play</h3>
             <p>...</p>
             <h4>Controls</h4>
             <p>...</p>
             <button id="help-back-button">Back</button>
           </div>
         </div>
       </div>
       <div id="loading-screen">Loading...</div>
     </div>
     ```
     Tests SHALL verify `document.getElementById('continue-button')`, `new-game-button`, `help-button`, `end-run-button` exist in DOM, but visibility is conditional per below.
   - **Visibility rules (strict):**
     - **Entry (splash) — never End Run:** `End Run` (`#end-run-button`) SHALL have `class="hidden"` / `display:none` **always when the overlay is shown over the splash** (`!isInLevelPause`), even if `hasRestorableSave()` is true. `New Game` SHALL be visible on entry.
     - **Pause (in-level, with backdrop, triggered by Escape/P) — never New Game:** `New Game` (`#new-game-button`) SHALL have `class="hidden"` / `display:none` **always when `isInLevelPause===true`** (paused during level), even though entry shows it. `End Run` SHALL be visible on pause when an active run exists (`hasRestorableSave()` true).
   - **Conditional backdrop:**
     - **Entry mode (over splash, no active run or after End Run):** `#main-menu-overlay` SHALL have **no dimming backdrop** — `background: transparent` (or `background: none`), **NOT** `rgba(0,0,0,0.55)`. The splash SHALL be fully visible.
     - **In-level pause mode (Escape/P during active run, even in FLYING):** `#main-menu-overlay` SHALL have a **backdrop shadowing the playing field** — `background: rgba(0,0,0,0.55)` (or `0.5-0.6`, or via `with-backdrop` class / `data-mode="pause"`). The field (grass, obstacles, ball, HUD) is still rendered behind but dimmed. The overlay's backdrop SHALL be the **only** dimming (no extra `bgCtx` fill).
     - `.main-menu-content` and `.help-card` SHALL be `background: transparent` (or `rgba(0,0,0,0.75)` for help card only — but overlay itself carries the backdrop when paused, not a separate `bgCtx` fill).
     - Each root button SHALL be **opaque** — e.g., `background: #2ecc71` (or `#3498db`) solid for Continue/New Game/Help, `background:#e74c3c` for End Run, `border: 2px solid #27ae60` / `1px solid #c0392b`, `color: white`. Computed `getComputedStyle(btn).backgroundColor` SHALL be `rgb(...)` with alpha `1` (not `rgba(...,0.28)`).
     - No `backdrop-filter` on the overlay.
   - **No `<h2>Golf Vector Field</h2>` title inside overlay** is required to be absent; the `h1` outside `#game-container` SHALL be removed entirely per global layout rule (REQ-002/012) — no title element SHALL exist outside the canvas.
   - **No `Current high score` text** and **no legacy `#main-new-game-button`** SHALL exist.
   - No canvas `drawMainMenu` SHALL be drawn; `src/render.js:drawMainMenu` SHALL be removed or never called when `mainMenuVisible true`.
   - Overlay centering and **not overflow** (see §8):
     ```css
     #main-menu-overlay {
       position: absolute; inset: 0;
       display: flex; align-items: center; justify-content: center;
       width: 100%; height: 100%;
       background: transparent; /* no backdrop */
       border-radius: 8px; z-index: 12;
     }
     #main-menu-overlay.with-backdrop { background: rgba(0,0,0,0.55); }
     #main-menu-overlay.hidden { display:none; }
     .main-menu-content {
       display:flex; flex-direction:column; align-items:center; gap:14px;
       max-width: 90%; max-height: 90%;
       overflow: hidden; /* scrollable children handle overflow */
       padding: 16px; background: transparent; text-align:center;
     }
     .main-menu-button {
       min-width: 180px; padding: 12px 28px;
       font: 700 14px system-ui, sans-serif;
       background: #2ecc71; /* opaque */
       border: 2px solid #27ae60; border-radius: 8px; color: white;
     }
     ```

3. **Continue Button — Conditional on Active Save, Simply Hides Overlay To Resume** in `src/main.js`:
   - `#continue-button` SHALL be **visible iff** `localStorage.getItem(STORAGE_KEY)` contains a **valid, restorable run** (valid JSON, correct version, `courseId` exists in `courses` collection). In entry mode with no run, it is hidden; **in-level pause mode (Escape/P during active run, even when `gameState==="FLYING"`), it is visible** because a run is active.
   - Clicking "Continue" SHALL **simply hide the overlay and resume the game** at the exact paused state — `mainMenuVisible=false`, `courseMenuVisible=false`, `helpVisible=false`, hide `#main-menu-overlay`, remove `with-backdrop` class (if it was in pause mode, backdrop `rgba(0,0,0,0.55)` is removed), and **resume the in-memory run without re-parsing storage or resetting state**. No `clearProgress`, no `loadLevel` re-init, no `saveProgress` side-effect; the in-memory `activeCourse`, `currentHoleIndex`, `holeAttempts`, `totalAttempts`, `supply`, `modifiers`, `ball.pos`/`ball.vel`/`isMoving`, `aimAngle` are preserved. If the menu was shown via Escape/P while the ball was in flight (`FLYING` with `ball.vel` non-zero), after Continue the ball **shall continue its flight** from the exact frozen position/velocity (pause froze `ball`, see §1 Blocking). If the menu was entry over splash (reloaded page, Continue after `saveProgress`), clicking Continue SHALL restore the saved run state via `loadProgress()` data and switch bottom canvas to grass (the entry case still needs to restore from storage, but the in-level pause case shall NOT re-load from storage — it shall just unpause).
   - Implementation distinction: entry Continue (after reload) does `loadProgress()` → restore → `mainMenuVisible=false` → grass; in-level Continue (Escape/P pause) does `mainMenuVisible=false` → resume with no storage re-parse. Both SHALL result in `mainMenuVisible false` and `with-backdrop` removed.
   - If the saved `courseId` is missing from `courses` (course deleted), clicking Continue SHALL be a no-op or re-show main menu root (treat as no save) — do not crash.
   - Tests SHALL verify: after `localStorage.removeItem(STORAGE_KEY)` + reload, `continue-button` is hidden; after one counted attempt + `saveProgress()` + reload, `continue-button` is visible; clicking it hides the main menu and `STORAGE_KEY` course hole index unchanged (resumes). **In-level:** start a level, launch ball so `FLYING`, press `Escape` or `P` (overlay with backdrop visible), click `Continue` → overlay hidden, `mainMenuVisible false`, `getComputedStyle(mainMenuOverlay).backgroundColor` back to `transparent`, ball continues flight (position changes within 500ms).

4. **End Run Button — Abandon Without Record, Never on Splash** in `src/main.js` / `index.html` / `style.css`:
   - `#end-run-button` (text exactly `"End Run"`, `id="end-run-button"` inside `#main-menu-root` alongside Continue/New Game/Help) SHALL be **visible only in pause mode** (`isInLevelPause===true` and active run exists, `hasRestorableSave()` true). **On the main menu with the splash screen (entry, `!isInLevelPause`) it SHALL be hidden (`hidden` class) always — even if `hasRestorableSave()` is true.** In pause, `End Run` is visible; on splash, `End Run` is never visible regardless of button logic.
   - Clicking `End Run` SHALL: `clearProgress()` (`localStorage.removeItem(STORAGE_KEY)`), reset run state to entry defaults (`currentHoleIndex=0`, `holeAttempts=0`, `totalAttempts=0`, `supply={1,1,1}`, `freeShots=0`, `areaUpgradeCount=0`, `bouncyBallCount=0`, `modifiers=[]`, `rewardPending=false`, etc. — without touching `COURSES_KEY`), set `mainMenuVisible=true` in **entry mode** (no backdrop, splash), hide `with-backdrop`, `courseMenuVisible=false`, `helpVisible=false`, `isInLevelPause=false`, `Continue` and `End Run` now hidden (no active run), `New Game`/`Help` visible, bottom canvas shows splash. **The per-course `bestTotal` SHALL NOT be updated** — `maybeUpdateHighScore`/`maybeUpdateCourseRecord` SHALL NOT be called; the abandoned run's `totalAttempts` is discarded.
   - When visible (pause), `End Run` SHALL be **opaque red** (`background:#e74c3c` `border:1px solid #c0392b` or `background:rgba(231,76,60,0.9)` opaque, hover `#c0392b`), white text, `min-width:140px`.
   - Tests SHALL verify: entry over splash never shows `End Run` (check `document.getElementById('end-run-button').classList.contains('hidden')` is true on fresh load with no run, and also after reload with an active save when overlay is in entry mode with `background:transparent`); start a course, make 2 attempts (`totalAttempts=2`), press `Escape` or `P` (pause with backdrop, End Run visible), click `End Run` → `localStorage.getItem(STORAGE_KEY)===null`, overlay now `background:transparent` (entry mode, no backdrop), `Continue` hidden, `End Run` hidden, `COURSES_KEY` still has the course with `bestTotal` unchanged (`null` if never completed, or previous value if it had a record), reloading still shows entry with `Continue` hidden.

5. **Escape and P Show Main Menu With Backdrop Even In Flight, New Game Never on Pause** in `src/main.js`:
   - While **currently in a level** (run active, `!mainMenuVisible` before press, `activeCourse` set, regardless of `gameState`), pressing **`Escape` or `P`** (`e.code === "Escape"` or `e.code === "KeyP"`) SHALL show the main menu overlay **with backdrop** (`#main-menu-overlay` `background: rgba(0,0,0,0.55)` or `with-backdrop` class) **even if `gameState==="FLYING"`** (ball in flight). The previous rule blocking `Escape` during `FLYING` SHALL be considered superseded; `FLYING` SHALL NOT block `Escape`/`P` in this mode. `P` is in addition to `Escape`, not a replacement; both keys SHALL trigger the same pause.
   - In pause mode, **`New Game` SHALL be hidden** (`#new-game-button` `hidden`) — the pause menu never shows `New Game` (tests SHALL verify `document.getElementById('new-game-button').classList.contains('hidden')` is true when `isInLevelPause===true` with backdrop). Entry remains the only place to see `New Game`.
   - Pressing `Escape` or `P` again while the in-level pause is visible SHALL be equivalent to `Continue` (hide overlay, remove backdrop, resume). While the menu is visible due to Escape/P, `R`/`Space`/`Arrow`/`click` placement SHALL be blocked (same as `mainMenuVisible` blocking per §1).

6. **New Game → Course Selection Submenu (Entry Only)** in `src/main.js` / `index.html` / `style.css`:
   - Clicking `#new-game-button` ("New Game") **only reachable from entry** (pause never shows it) SHALL hide `#main-menu-root` and show `#course-menu` (`courseMenuVisible=true`) **while keeping `mainMenuVisible=true`** (still on splash, still paused, no backdrop). The bottom canvas SHALL remain splash.
   - **Course list inside submenu** (`#course-menu #course-list`):
     - Scrollable container `overflow-y:auto`, `max-height: min(42vh, 320px)` or `max-height: 45%` of overlay, `display:flex; flex-direction:column; gap:8px; padding:4px; overscroll-behavior:contain`. When many courses exist, `scrollHeight > clientHeight` SHALL be true; only the list scrolls, not the page, not the overlay outside container. No horizontal overflow; each row fits within `90%` width.
     - Per-course row `<div class="course-row" data-course-id="...">` containing:
       - **Course button** `<button class="course-play-button">` with **same opaque style as root menu buttons** (`background:#2ecc71` opaque `border:2px solid #27ae60`, not transparent, hover `#27ae60`), `display:flex; flex-direction:column; align-items:flex-start; gap:2px; flex:1; min-width:0;` Two rows inside:
         - Upper `span.course-name` with course `name` (`700 13px` white with stroke).
         - Lower `span.course-meta` with `"<holeCount> holes   Record: <best|—>"` in smaller font (`500 11px` `opacity:0.95` stroke `1px`), where the gap between holes and `Record:` is a long space or similar, and `Record: —` when `bestTotal===null`. The course button's text SHALL be two rows (two spans), not a single line dash.
       - **Delete button** `<button class="course-delete-button" title="Delete course">🗑</button>` (or `🗑️`/`✕` icon) **to the right of the course button**, inside the same `.course-row`, `flex:0 0 auto`, `padding:6px 10px`, `font:600 11px`, `background:#e74c3c` opaque `border:1px solid #c0392b`, white. **Only the trashcan icon SHALL be visible as label** — text SHALL be exactly `🗑`/`🗑️` (or icon) with **no word "Delete"** in `textContent` (aria-label/title may contain "Delete" for accessibility, but visible text is icon only). Tests SHALL verify `course-delete-button.textContent.trim() === "🗑"` (or includes `🗑` and no alphabetic "Delete" word) and that clicking it does NOT start a game.
       - No per-row **Export** button SHALL be present in this submenu (export is now via pause menu only, see REQ-031). Tests SHALL verify `document.querySelector('.course-export-button')` is `null` in the course menu (export may still exist in pause overlay).
       - Clicking the **course play button** (not delete) SHALL start a **new run on that course**: set `activeCourse=course`, `currentHoleIndex=0`, `holeAttempts=0`, `totalAttempts=0`, `supply={1,1,1}`, etc., `loadLevel(0)`, `gameState="AIMING"`, `mainMenuVisible=false`, hide all overlays, `drawBackground('grass')`, `saveProgress()` with `courseId`. Reload after one attempt resumes via Continue.
     - Delete flow: clicking `.course-delete-button` SHALL `confirm("Delete course \"<name>\"?")`; if confirmed, remove course from `courses`, `saveCourses()`, re-render list, and if deleted course was the active run's course, `clearProgress()` (so Continue disappears if that was the saved `courseId`). The user MAY delete all courses (empty list `[]` persisted); main menu course submenu then shows empty scrollable list with New Course / Import still visible; no auto-create until next reload with empty `COURSES_KEY`.
   - **Footer inside course submenu** (`#course-menu-footer`):
     - Two buttons: `<button id="new-course-button">New Course</button>` and `<button id="import-course-button">Import</button>` (text **exactly** "New Course" and "Import" — not "⤵ Import Course"). Both opaque, centered `gap:10px`, `max-width:360px`, `width:100%`.
     - New Course flow: clicking `New Course` shows choice UI `#new-course-choices` with three opaque buttons `data-holes="3"`/`"9"`/`"18"` ("3 Holes" etc.) + Cancel; selecting creates course via `createCourse(holeCount)`, pushes to `courses`, `saveCourses()`, re-renders list, stays in course submenu (not auto-start).
     - Import flow: clicking `Import` shows `#import-area` with `<p class="import-help">Paste the string exported from another game</p>`, `<textarea id="import-input">`, `Import` confirm + `Cancel`, error text `Invalid course data` on failure. On valid base64, decode/validate, handle duplicate `id` by regenerating UUID, push, `saveCourses()`, re-render, hide import area.
   - A **Back** button (`#course-menu-back`, text "Back") SHALL return from course submenu to root (hide `#course-menu`, show `#main-menu-root`), without starting a game.

7. **Help Overlay** in `src/main.js` / `index.html` / `style.css`:
   - Clicking `#help-button` SHALL hide root and show `#help-overlay` inside the same `#main-menu-overlay`.
   - `#help-overlay` SHALL contain **short rule explanation** and **control scheme**:
     - Rules (example, wording MAY vary but MUST convey): "Get the ball into the hole in as few attempts as possible. Wind vectors push the ball while it flies. Place modifiers (Amplify/Nullify/Flip) before shooting to alter wind locally. Each hole tracks attempts; total across the course is your score. Low record per course is saved."
     - Controls (MUST include): `ArrowLeft/ArrowRight` or `Arrow keys` to aim, `Space` hold to charge power and release to shoot, `Click` (or tap) to place selected modifier, `Right-click` to remove, `1/2/3` or hotbar click to select modifier, `H` toggle wind visibility, `R` reset ball, `Escape`/`P` pause (note both keys).
   - The help content SHALL be **scrollable** if it overflows: `max-height: 70%`, `overflow-y:auto`, `overscroll-behavior:contain`, so it never overflows the 16:9 canvas. No page scroll.
   - A **Back** button (`#help-back-button`, text "Back") SHALL return to root.
   - Help SHALL be shown over the splash (still transparent overlay, no dimming) when triggered from entry, and over the dimmed field with backdrop when triggered from pause; help text panel MAY have a semi-opaque card behind text for legibility (e.g., `background: rgba(0,0,0,0.65)` on the help card only — not a full-screen backdrop), but the full-screen overlay background SHALL remain transparent in entry and `with-backdrop` in pause. Prefer opaque card for text, still letting splash/field be visible around it.

8. **Overflow & Scrollable Guarantees** in `style.css`:
   - All menu buttons (root and course submenu) SHALL be inside the `90%` width container; no button SHALL overflow `#game-container`. Verified by `button.getBoundingClientRect().left >= containerRect.left` and `right <= containerRect.right` at `375px` viewport.
   - When content overflows, **only the list/help scrolls** (`#course-list`, `#help-overlay`), not the page (`body overflow hidden` or no scroll). `#main-menu-overlay` itself SHALL have `overflow:hidden` and visible children use `overflow-y:auto`.
   - Container remains 16:9 maximized centered (REQ-002/013).

9. **Loading State — Black Background With "Loading..." Text** in `index.html` / `style.css` / `src/main.js`:
   - While splash image is loading (before `splashImg.complete && naturalWidth`), the page SHALL show **black background** (`body background:#000` or `#1a1a1a` is black for loading, then `#1a1a1a` after) with centered **"Loading..." text** inside `#loading-screen`:
     ```html
     <div id="loading-screen">Loading...</div>
     ```
     ```css
     body { background:#000; }
     #loading-screen {
       position: fixed; inset:0;
       display:flex; align-items:center; justify-content:center;
       background:#000; color:#fff; font:600 18px system-ui, sans-serif; z-index:100;
     }
     #loading-screen.hidden { display:none; }
     ```
     On `splashImg.onload` (or `decode()`), or fallback, hide `#loading-screen` and show either the main menu (splash via `drawBackground('splash')`) or the game. If splash fails to load, fallback still hides Loading... and shows solid fallback without spinner forever.
   - No white flash: body background is black from first paint.

## Acceptance Criteria

- [ ] On fresh load (clear both keys), page shows **black "Loading..."** briefly until splash loads, then **main menu root with opaque buttons**: "New Game" and "Help" visible, **"Continue" hidden** (`display:none` / `.hidden` / not in DOM) because no active save, and **"End Run" never visible on splash** (`#end-run-button` `hidden` even though no run). Bottom canvas behind shows `gfg-splash.png` aspect-covered **without any dimming backdrop** — computed `getComputedStyle(document.getElementById('main-menu-overlay')).backgroundColor` is `rgba(0,0,0,0)` / `transparent`, not `rgba(0,0,0,0.35)`. All root buttons (when visible) have opaque `backgroundColor` `rgb(...)` alpha 1 (e.g., `#2ecc71`), not `rgba(...,0.28)`.
- [ ] With an active save present (start a course, make one attempt, `saveProgress()` has `courseId`), reloading shows main menu root with **"Continue" visible** alongside "New Game" / "Help", but **"End Run" still hidden on splash** (`#end-run-button` `hidden` when `!isInLevelPause` even though save exists). Clicking "Continue" hides `#main-menu-overlay`, switches bottom to tiled grass, resumes at `Hole:1/N Attempts:1 Total:1` (not hole 0), and preserves `courseId`. With no save, "Continue" is not rendered/visible and clicking "New Game" still works.
- [ ] **Entry never shows End Run:** even after creating an active run and returning to splash via `End Run` then immediately checking the splash menu, `End Run` is hidden; also on fresh reload with an active save, the splash entry shows `Continue`/`New Game`/`Help` but `End Run` is hidden. Tests SHALL verify `document.getElementById('end-run-button').classList.contains('hidden')` is true when `mainMenuOverlay` is visible over splash with `background:transparent`.
- [ ] **Escape and P in level show pause with backdrop and correct buttons:** while in a level (`mainMenuVisible false`, `gameState` `AIMING` or `FLYING`), pressing `Escape` **or** `P` (`KeyP`) shows `#main-menu-overlay` with `background: rgba(0,0,0,0.55)` (or `with-backdrop` class, not `transparent`), containing `Continue`/`Help`/`End Run` opaque buttons **but `New Game` hidden** (`#new-game-button` `hidden` when `isInLevelPause===true`). The playing field (grass still rendered behind, dimmed) is visible behind the backdrop, not splash. Pressing `Escape` or `P` again or clicking `Continue` hides the overlay, removes the backdrop (`background: transparent`), and resumes.
- [ ] While the ball is in flight (`FLYING` with `ball.vel` non-zero), `Escape` or `P` still opens the pause overlay (not blocked) and freezes the ball (`ball.pos` unchanged while paused); clicking `Continue` (or pressing `Escape`/`P` again) hides the overlay and the ball continues flight from the frozen position (no teleport to tee, no state reset).
- [ ] Clicking "New Game" **only from entry** hides the root buttons and shows **course submenu** (`#course-menu` visible, `#main-menu-root` hidden) still over the splash (no grass, still paused, no backdrop). `New Game` is never shown in pause, so course submenu is not reachable from pause.
- [ ] Clicking "Help" hides root and shows help overlay (`#help-overlay` visible) with **rules text** ("wind" + "hole" + "attempts" or "fewest" mentioned) and **controls text** ("Arrow" + "Space" + "Click" or "Place" and `Escape`/`P` mentioned for pause), plus a "Back" button. Help content is scrollable (`overflow-y:auto`) and bounded to canvas (`getBoundingClientRect()` inside container). Clicking "Back" returns to root with appropriate buttons (entry: Continue/New Game/Help; pause: Continue/Help/End Run) still with correct backdrop state, no game started.
- [ ] All menu buttons never overflow the 16:9 canvas: at `375px` viewport, every visible button's `getBoundingClientRect()` is contained within `container.getBoundingClientRect()`, and no horizontal scroll bar appears. When 10+ courses exist, `course-list.scrollHeight > clientHeight` is true and list is scrollable, while root/help/course submenu themselves do not overflow.
- [ ] No `h1`/`#instructions`/other elements outside `#game-container` exist: `document.querySelector('h1')` is `null`, `document.getElementById('instructions')` is `null`, `document.querySelector('#main-menu-overlay h2')` is `null`, and `document.querySelector('.high-score')` is `null`. Only `#game-container` with its three canvases + overlays + `#loading-screen` is present in `body`.
- [ ] During splash load, `body` computed `backgroundColor` is `rgb(0,0,0)` and `#loading-screen` textContent is `Loading...` visible (`display:flex`). After load, `#loading-screen` is `hidden`/`display:none` and splash is visible on `bgCanvas`.
- [ ] No canvas `drawMainMenu` is executed while HTML main menu visible; wind overlay remains transparent.
- [ ] **Pause never shows New Game:** while paused via `Escape`/`P` at `Hole:2` (or any level), `document.getElementById('new-game-button').classList.contains('hidden')` is true and `document.getElementById('end-run-button').classList.contains('hidden')` is false (End Run visible); on entry splash, the opposite (`New Game` visible, `End Run` hidden).
- [ ] **End Run:** while the pause is visible (backdrop), `End Run` button (`#end-run-button` text `End Run` visible, red) is present; clicking it clears `STORAGE_KEY` (`localStorage.getItem(STORAGE_KEY)===null`), hides the pause backdrop and shows entry menu over splash (`background: transparent`, `Continue` hidden, `End Run` hidden, `New Game`/`Help` visible), bottom canvas shows splash, and `bestTotal` for the active course is **unchanged** (abandoned run does not count toward record).

## Dependencies

- REQ-002 (16:9 dual canvases)
- REQ-013 (16:9 responsive centering, overlay bounds)
- REQ-030 (background images tiled/splash, loading)
- REQ-012 (dual-canvas draw split)
- REQ-027/028 (persistence, pause)
- REQ-031 (courses collection, per-course records)

## Notes

- Implementation sketch for conditional Continue / button visibility:
  ```js
  function hasRestorableSave(){
    try{ const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return false;
      const d=JSON.parse(raw); return !!(d.courseId && courses.find(c=>c.id===d.courseId));
    }catch{ return false; }
  }
  function renderMainMenuRootVisibility(){
    const isPause = isInLevelPause;
    document.getElementById('continue-button').classList.toggle('hidden', !hasRestorableSave());
    document.getElementById('end-run-button').classList.toggle('hidden', !isPause || !hasRestorableSave());
    document.getElementById('new-game-button').classList.toggle('hidden', !!isPause);
  }
  ```
- Root buttons share a class `main-menu-button` with opaque style; course play buttons reuse the same palette.
- Both `Escape` (`e.code==="Escape"`) and `P` (`e.code==="KeyP"`) trigger `openInLevelPause()`; document both.

## File Paths

- `src/main.js:1` (mainMenuVisible, isInLevelPause, courseMenuVisible/helpVisible, conditional Continue/End Run/New Game visibility, Escape/P to pause even in FLYING, Continue hide-to-resume, End Run without record)
- `index.html:1` (#game-container with #bg-canvas + #game + #wind-canvas + #main-menu-overlay containing root/course/help submenus + #loading-screen; NO h1, NO #instructions, no #main-new-game-button, no .high-score)
- `style.css:1` (#main-menu-overlay background transparent vs with-backdrop, opaque buttons, scrollable course list/help, black loading screen)
- `src/render.js:1` (no drawMainMenu, drawBackground bgCtx vs top dynamic, no canvas golf art)

