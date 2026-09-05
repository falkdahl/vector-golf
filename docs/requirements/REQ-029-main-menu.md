# REQ-029: Main Menu — Continue / New Game / Help + Course Submenu + No Backdrop

- **ID:** REQ-029
- **Title:** Main Menu With Three Opaque Buttons Over Splash, Conditional Continue, New Game → Course List, Help Overlay, No Backdrop
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Game States / Persistence / UI (REQ-011/REQ-014/REQ-027/REQ-028 Extension)

## Description
The game SHALL show a **main menu** whenever **no run is currently being played OR as the entry point**. The main menu SHALL be rendered purely as **HTML** (`#main-menu-overlay` inside `#game-container`) centered over the **16:9 stacked canvases** with **no backdrop/dimming** shadowing the splash image. It SHALL contain exactly **three possible buttons** in its root view: **"Continue"** (conditional), **"New Game"**, and **"Help"** — all **opaque** and shown directly on top of the splash screen (`img/gfg-splash.png`). "Continue" SHALL only be present when `localStorage` contains an active saved run (`STORAGE_KEY`). Clicking "Continue" resumes that run; clicking "New Game" navigates to a **course selection submenu** (scrollable list of course buttons + Delete icon + New Course / Import footer); clicking "Help" shows a **help overlay** with rules and controls. All menus SHALL be bounded to the canvas area and SHALL NOT overflow it — scrollable areas SHALL be used instead. While the splash image is still loading, the page background SHALL be **black with centered "Loading..." text**.

## Rationale
A three-button entry keeps the flow explicit: resume vs start new vs learn. Conditional Continue prevents confusing resume when no save exists. Routing New Game → course list decouples the roster from the entry screen and allows the entry to stay minimal and readable over the unobscured splash. Opaque buttons guarantee legibility without a dimming backdrop that would hide the branded splash. Scrollable sub-containers guarantee no overflow at narrow viewports (REQ-013). A black Loading... placeholder avoids white flash while the splash image loads.

## Requirements

1. **Main Menu State & Visibility** in `src/main.js` / `index.html` / `style.css`:
   - State SHALL include `mainMenuVisible: boolean` (default `false` until evaluated). `true` = HTML main-menu overlay shown + game paused + bottom canvas shows splash; `false` = normal play.
   - **When to show `mainMenuVisible=true`:**
     - On initial load after `setupCanvases()` + `loadProgress()` + `loadCourses()`, if no in-memory run is active and the main menu has not been explicitly dismissed, show main menu. Unlike the previous draft, the main menu SHALL **always be shown on entry** (even if no save exists) as the 3-button entry — the difference is whether "Continue" is rendered.
     - After `End Run` (`clearProgress()` + reset), `mainMenuVisible=true` and the root 3-button view is shown (`courseSubmenuVisible=false`, `helpVisible=false`).
     - Reset to `false` when a run is resumed via "Continue" or started via a course play button, and to `true` on `End Run`. Reload with a restorable save SHALL still show the main menu entry (with Continue) rather than auto-resuming — user must click Continue to resume.
   - **Sub-views inside main menu** (mutually exclusive, all inside `#main-menu-overlay`):
     - `mainMenuRootVisible` (default) — shows Continue/New Game/Help.
     - `courseMenuVisible` — shown after clicking "New Game"; shows course list + footer.
     - `helpVisible` — shown after clicking "Help"; shows rules + controls + Back.
     - Only one sub-view visible at a time. "Back" from either sub-view returns to root.
   - **Blocking:** While `mainMenuVisible===true` (any sub-view), paused like `pauseMenuVisible`/`rewardMenuVisible`/`WIN`: `update` SHALL NOT advance `ball` but `updateWind` still runs; `handleLaunch()` no-op; placement/drag/hotkeys ignored; `Escape` ignored (not open pause); `R` ignored; hotbar hidden; `maybeShowRewardMenu` blocked. Bottom canvas SHALL show splash while true; on `false` it SHALL tile grass.
   - Priority: if `mainMenuVisible true`, `pauseMenuVisible`/`rewardMenuVisible`/`WIN` SHALL be `false`.

2. **Main Menu Content — Three Opaque Buttons Over Splash, No Backdrop** in `src/main.js` / `index.html` / `style.css`:
   - The main menu SHALL be **only HTML** inside `#game-container`:
     ```html
     <div id="game-container">
       <canvas id="bg-canvas" width="1280" height="720"></canvas>
       <canvas id="game" width="1280" height="720"></canvas>
       <canvas id="wind-canvas"></canvas>
       <!-- Main menu root + submenus all inside this overlay -->
       <div id="main-menu-overlay" class="hidden">
         <div class="main-menu-content">
           <!-- ROOT: three buttons -->
           <div id="main-menu-root">
             <button id="continue-button" class="main-menu-button hidden">Continue</button>
             <button id="new-game-button" class="main-menu-button">New Game</button>
             <button id="help-button" class="main-menu-button">Help</button>
           </div>
           <!-- COURSE SUBMENU (hidden until New Game) -->
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
           <!-- HELP SUBMENU -->
           <div id="help-overlay" class="hidden">
             <h3>How to Play</h3>
             <p>...</p>
             <h4>Controls</h4>
             <p>...</p>
             <button id="help-back-button">Back</button>
           </div>
         </div>
       </div>
       <!-- loading placeholder (outside or inside container) -->
       <div id="loading-screen">Loading...</div>
     </div>
     ```
     Exact IDs/classes MAY be tuned but the **three root buttons SHALL exist with texts exactly "Continue", "New Game", "Help"** (case-sensitive) and be children of `#main-menu-overlay` (or overlay's content). Tests SHALL verify `document.getElementById('continue-button')`, `new-game-button`, `help-button`.
   - **Opaque buttons, no backdrop shadowing splash:**
     - `#main-menu-overlay` SHALL have **no dimming backdrop** — `background: transparent` (or `background: none`), **NOT** `rgba(0,0,0,0.35)`. The splash on the bottom canvas SHALL be fully visible without darkening.
     - `.main-menu-content` SHALL also be `background: transparent` (no semi-opaque panel).
     - Each root button (`.main-menu-button` / `#continue-button` / `#new-game-button` / `#help-button`) SHALL be **opaque** — e.g., `background: #2ecc71` or `#3498db` solid, `border: 2px solid #27ae60` (or similar opaque), `color: white`. Computed `getComputedStyle(btn).backgroundColor` SHALL be `rgb(...)` with alpha `1` (not `rgba(...,0.28)`). This applies to all three root buttons and to course play buttons and footer buttons.
     - No `backdrop-filter` on the overlay.
   - **No `<h2>Golf Vector Field</h2>` title inside overlay** is required to be absent; the `h1` outside `#game-container` SHALL be removed entirely per global layout rule (REQ-002/012) — no title element SHALL exist outside the canvas.
   - **No `Current high score` text** and **no legacy `#main-new-game-button`** SHALL exist.
   - No canvas `drawMainMenu` SHALL be drawn; `src/render.js:drawMainMenu` SHALL be removed or never called when `mainMenuVisible true`.
   - Overlay centering and **not overflow** (see §5):
     ```css
     #main-menu-overlay {
       position: absolute; inset: 0;
       display: flex; align-items: center; justify-content: center;
       width: 100%; height: 100%;
       background: transparent; /* no backdrop */
       border-radius: 8px; z-index: 12;
     }
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

3. **Continue Button — Conditional on Active Save** in `src/main.js`:
   - `#continue-button` SHALL be **visible iff** `localStorage.getItem(STORAGE_KEY)` contains a **valid, restorable run** (valid JSON, correct version, `courseId` exists in `courses` collection, and `currentHoleIndex`/`totalAttempts` indicate an in-progress run). Otherwise it SHALL have class `hidden` / `display:none` and be absent from layout/AT.
   - Clicking "Continue" SHALL: `mainMenuVisible=false`, hide `#main-menu-overlay`, restore the saved run state via `loadProgress()` data (`activeCourse`, `currentHoleIndex`, `holeAttempts`, `totalAttempts`, `supply`, `modifiers`, `ball` position), call `loadLevel(currentHoleIndex)` for the correct hole of the correct course, switch bottom canvas to tiled grass (`drawBackground('grass')`), and resume `gameState` (`AIMING` unless `FLYING` was saved — if flying, resume `FLYING`).
   - If the saved `courseId` is missing from `courses` (course deleted), clicking Continue SHALL be a no-op or re-show main menu root (treat as no save) — do not crash.
   - Tests SHALL verify: after `localStorage.removeItem(STORAGE_KEY)` + reload, `continue-button` is hidden; after one counted attempt + `saveProgress()` + reload, `continue-button` is visible; clicking it hides the main menu and sets `STORAGE_KEY` course hole index unchanged (resumes).

4. **New Game → Course Selection Submenu** in `src/main.js` / `index.html` / `style.css`:
   - Clicking `#new-game-button` ("New Game") SHALL **not** start a run directly. It SHALL hide `#main-menu-root` and show `#course-menu` (`courseMenuVisible=true`) **while keeping `mainMenuVisible=true`** (still on splash, still paused). The bottom canvas SHALL remain splash.
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

5. **Help Overlay** in `src/main.js` / `index.html` / `style.css`:
   - Clicking `#help-button` SHALL hide root and show `#help-overlay` inside the same `#main-menu-overlay`.
   - `#help-overlay` SHALL contain **short rule explanation** and **control scheme**:
     - Rules (example, wording MAY vary but MUST convey): "Get the ball into the hole in as few attempts as possible. Wind vectors push the ball while it flies. Place modifiers (Amplify/Nullify/Flip) before shooting to alter wind locally. Each hole tracks attempts; total across the course is your score. Low record per course is saved."
     - Controls (MUST include): `ArrowLeft/ArrowRight` or `Arrow keys` to aim, `Space` hold to charge power and release to shoot, `Click` (or tap) to place selected modifier, `Right-click` to remove, `1/2/3` or hotbar click to select modifier, `H` toggle wind visibility, `R` reset ball, `Escape` pause.
   - The help content SHALL be **scrollable** if it overflows: `max-height: 70%`, `overflow-y:auto`, `overscroll-behavior:contain`, so it never overflows the 16:9 canvas. No page scroll.
   - A **Back** button (`#help-back-button`, text "Back") SHALL return to root.
   - Help SHALL be shown over the splash (still transparent overlay, no dimming); help text panel MAY have a semi-opaque card behind text for legibility (e.g., `background: rgba(0,0,0,0.65)` on the help card only — not a full-screen backdrop), but the full-screen overlay background SHALL remain transparent. Prefer opaque card for text, still letting splash be visible around it.

6. **Overflow & Scrollable Guarantees** in `style.css`:
   - All menu buttons (root and course submenu) SHALL be inside the `90%` width container; no button SHALL overflow `#game-container`. Verified by `button.getBoundingClientRect().left >= containerRect.left` and `right <= containerRect.right` at `375px` viewport.
   - When content overflows, **only the list/help scrolls** (`#course-list`, `#help-overlay`), not the page (`body overflow hidden` or no scroll). `#main-menu-overlay` itself SHALL have `overflow:hidden` and visible children use `overflow-y:auto`.
   - Container remains 16:9 maximized centered (REQ-002/013).

7. **Loading State — Black Background With "Loading..." Text** in `index.html` / `style.css` / `src/main.js`:
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

- [ ] On fresh load (clear both keys), page shows **black "Loading..."** briefly until splash loads, then **main menu root with three opaque buttons**: "New Game" and "Help" visible, **"Continue" hidden** (`display:none` / `.hidden` / not in DOM) because no active save. Bottom canvas behind shows `gfg-splash.png` aspect-covered **without any dimming backdrop** — computed `getComputedStyle(document.getElementById('main-menu-overlay')).backgroundColor` is `rgba(0,0,0,0)` / `transparent`, not `rgba(0,0,0,0.35)`. All three root buttons (when visible) have opaque `backgroundColor` `rgb(...)` alpha 1 (e.g., `#2ecc71`), not `rgba(...,0.28)`.
- [ ] With an active save present (start a course, make one attempt, `saveProgress()` has `courseId`), reloading shows main menu root with **"Continue" visible** alongside "New Game" / "Help". Clicking "Continue" hides `#main-menu-overlay`, switches bottom to tiled grass, resumes at `Hole:1/N Attempts:1 Total:1` (not hole 0), and preserves `courseId`. With no save, "Continue" is not rendered/visible and clicking "New Game" still works.
- [ ] Clicking "New Game" hides the root buttons and shows **course submenu** (`#course-menu` visible, `#main-menu-root` hidden) still over the splash (no grass, still paused). The course list is scrollable (`overflow-y:auto`, `max-height` constrained), per-course button is two rows (`span.course-name` 700 13px name, `span.course-meta` 500 11px `"<holeCount> holes Record: —"` smaller), **same opaque style as root buttons** (`#2ecc71`), and to its right is a **delete button showing only a trashcan icon "🗑"** (textContent is exactly `🗑`/`🗑️` with no word "Delete"), `background:#e74c3c` opaque. No per-row Export button exists. Footer shows "New Course" (`#new-course-button`) and "Import" (`#import-course-button` text exactly "Import") `width:100%`/`gap:10px`. Clicking a course play button starts that course at hole 1 and hides the menu.
- [ ] Clicking "Help" hides root and shows help overlay (`#help-overlay` visible) with **rules text** ("wind" + "hole" + "attempts" or "fewest" mentioned) and **controls text** ("Arrow" + "Space" + "Click" or "Place" mentioned), plus a "Back" button. Help content is scrollable (`overflow-y:auto`) and bounded to canvas (`getBoundingClientRect()` inside container). Clicking "Back" returns to root with three buttons still over splash, no game started.
- [ ] All menu buttons never overflow the 16:9 canvas: at `375px` viewport, every visible button's `getBoundingClientRect()` is contained within `container.getBoundingClientRect()`, and no horizontal scroll bar appears. When 10+ courses exist, `course-list.scrollHeight > clientHeight` is true and list is scrollable, while root/help/course submenu themselves do not overflow.
- [ ] No `h1`/`#instructions`/other elements outside `#game-container` exist: `document.querySelector('h1')` is `null`, `document.getElementById('instructions')` is `null`, `document.querySelector('#main-menu-overlay h2')` is `null`, and `document.querySelector('.high-score')` is `null`. Only `#game-container` with its three canvases + overlays + `#loading-screen` is present in `body`.
- [ ] During splash load, `body` computed `backgroundColor` is `rgb(0,0,0)` and `#loading-screen` textContent is `Loading...` visible (`display:flex`). After load, `#loading-screen` is `hidden`/`display:none` and splash is visible on `bgCanvas`.
- [ ] No canvas `drawMainMenu` is executed while HTML main menu visible; wind overlay remains transparent.

## Dependencies
- REQ-002 (16:9 dual canvases)
- REQ-013 (16:9 responsive centering, overlay bounds)
- REQ-030 (background images tiled/splash, loading)
- REQ-012 (dual-canvas draw split)
- REQ-027/028 (persistence, pause)
- REQ-031 (courses collection, per-course records)

## Notes
- Implementation sketch for conditional Continue:
  ```js
  function hasRestorableSave(){
    try{ const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return false;
      const d=JSON.parse(raw); return !!(d.courseId && courses.find(c=>c.id===d.courseId));
    }catch{ return false; }
  }
  function renderMainMenuRoot(){
    document.getElementById('continue-button').classList.toggle('hidden', !hasRestorableSave());
  }
  ```
- Root buttons share a class `main-menu-button` with opaque style; course play buttons reuse the same palette.

## File Paths
- `src/main.js:1` (mainMenuVisible, courseMenuVisible/helpVisible, conditional Continue, New Game → course submenu navigation, Help navigation, overlay bindings)
- `index.html:1` (#game-container with #bg-canvas + #game + #wind-canvas + #main-menu-overlay containing root/course/help submenus + #loading-screen; NO h1, NO #instructions, no #main-new-game-button, no .high-score)
- `style.css:1` (#main-menu-overlay background transparent, opaque buttons, scrollable course list/help, black loading screen)
- `src/render.js:1` (no drawMainMenu, drawBackground bgCtx vs top dynamic, no canvas golf art)
