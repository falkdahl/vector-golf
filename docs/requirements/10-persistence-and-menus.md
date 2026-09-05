# 10 — Persistence, Courses & Menus

- **ID:** 10-persistence-and-menus
- **Supersedes:** REQ-027, REQ-028, REQ-029, REQ-031, REQ-032, REQ-030 (menu parts), REQ-011 (reset/clear part)
- **Type:** Functional + UI + Persistence
- **References:** `01-infrastructure.md` (no build), `02-canvas-system.md` (layout/overlay bounds), `08-level-generation.md` (levels), `09-rewards-and-progression.md` (win/progression), `07-modifiers.md` (supply), `05-input-and-states.md` (states/counters)

## 1. Storage Keys & Payload

- **Active-run**: `STORAGE_KEY="golfVectorField.progress.v1"` JSON `version:1` payload:
  ```js
  { version:1, courseId:string, currentHoleIndex:number, holeAttempts:number, totalAttempts:number,
    supply:{amplify, nullify, flip}, freeShots:number, areaUpgradeCount:number, bouncyBallCount:number,
    sharpshooterCount?:number, secretRewardCounter:number, rewardPending:boolean, rewardOffered:string[]|null,
    rewardRerolled:boolean, rewardMenuVisible:boolean,
    modifiers:Array<{type,x,y,radius}>, aimAngle:number, savedAt:number }
  ```
  Transient `ball.pos/vel/isMoving`, `gameState==="FLYING"` (resume always `AIMING` at tee), `charging/charge`, `mousePos`, field grid not persisted; on resume ball at tee `vel=0`. All numbers clamped `≥0` on load; missing fields default `0/false/[]`; corrupt/`version!==1`/`courseId` missing in courses → treat as no save. Wrap in `try/catch`; quota/error fallback to new game.

- **Courses collection**: `COURSES_KEY="golfVectorField.courses.v1"` JSON `version:1` with `Course[]` per §2. Two keys only (plus legacy `HIGH_SCORE_KEY` for migration). Do not scatter others.

### Save triggers

- `handleLaunch` (exactly once per attempt, counted or free) calls `saveProgress()`; also after `claimReward`, `rerollReward`, `placeModifier`/removal/drag, `advanceHole`/`handleNextHole`/`loadLevel`, `maybeShowRewardMenu` when creating fresh `rewardOffered`.

### Load & Resume — Manual via **Continue**, not auto-resume

- On load `init()` shows main menu (see §3) and evaluates `hasRestorableSave()` (valid JSON `version:1` + `courseId` exists in `courses`) only to toggle `#continue-button` visibility; it does **not** auto-restore.
- Clicking **Continue** (`#continue-button` text `Continue` id `continue-button`, visible iff valid save) restores: resolve `activeCourse = courses.find(c=>c.id===data.courseId)`, `LEVELS=activeCourse.holes`, restore all persisted fields, recompute `areaMultiplier/bouncyRemaining` (`bouncyRemaining=bouncyBallCount`), recreate field `createField(cols,rows,strength,seed,W,H)` then `setModifiers(modifiers)`, ball at tee `AIMING` (never `FLYING`/`WIN`), `rewardMenuVisible` if `rewardOffered.length===3`, then hide main-menu overlay, switch bottom to grass via `drawBackground('grass')`, `updateAttemptsUI`/`updateHotbarUI`. If no save/corrupt, Continue does nothing (menu stays on root). `loadProgress()`/`hasRestorableSave()` handle validation.

### Clear on abandon / new course start

- `clearProgress() => localStorage.removeItem(STORAGE_KEY)` and reset run state to `currentHoleIndex=0, holeAttempts=0, totalAttempts=0, supply={1,1,1}, freeShots=0, areaUpgradeCount=0, bouncyBallCount=0, bouncyRemaining=0, secretRewardCounter=0, rewardPending=false, rewardOffered=[], modifiers=[]…` without touching `COURSES_KEY`. Called on `resetGameAfterWin` (`R` in `WIN`/`GAME_COMPLETE`), `startNewGameFromMain` (course play), `endRun` (see §6). Only **full completion** updates `bestTotal` (see §5), `End Run` does not.

## 2. Course Model `src/courses.js`

- `Course = { id:string (UUID v4 via crypto.randomUUID fallback), name:string ("Adjective Noun"), holes:Level[], holeCount:3|6|9|18, seed:number, createdAt:number, bestTotal:number|null }`.
- `name` via two lists `ADJECTIVES` (≥10 wind/weather e.g. `Breezy,Gusty,Stormy,Misty,Blustery,Whispering,Howling,Calm,Sunny,Zephyr`) + `NOUNS` (≥10 golf e.g. `Fairway,Greens,Links,Meadow,Dunes,Valley,Hollow,Pines`) random `"Adjective Noun"` via `Math.random`.
- `holes` via `generateCourse(holeCount, seed, options?)` wrapping `generateLevels(seed,holeCount,{difficulty})` per `08-level-generation.md` (for `3` uniform `difficulty` from player choice; `6`/`9`/`18` linear `easy→hard`).
- **Collection persistence**: `loadCourses()` at `init()` parses `COURSES_KEY`; on corrupt/missing/wrong version auto-create one default `18`-hole course and `saveCourses()`. Validate each course (`id` string, `name` string, `holes.length` `3|6|9|18`, each hole with `tee/hole/obstacles/field`); discard invalid with `console.warn`. Allow empty array `[]` after user deletes all (no auto-create until next reload with missing key). `saveCourses(courses)` on every mutation: New Course, Import, delete, `bestTotal` improve.
- **Active-run binding**: `STORAGE_KEY` payload's `courseId` ties to a `Course.id`; on load verify it still exists else treat as no saved run.

## 3. Main Menu — Single HTML Overlay, Two Modes (Entry vs In-Level Pause)

State `mainMenuVisible:boolean` + `isInLevelPause:boolean` (or `with-backdrop` class / `dataset.mode`).

- **Entry mode** (over splash, no backdrop `background:transparent`): shown on fresh load, after `End Run`, or when no run active; root shows **Continue** (conditional), **New Game**, **Help** — **never `End Run`**.
- **In-level pause mode** (over playing field, with backdrop `background:rgba(0,0,0,0.55)` / `with-backdrop`): triggered **while in a level** (`activeCourse!==null`, regardless of `AIMING`/`CHARGING`/`FLYING`) by **`Escape` or `P` (`KeyP`)** — both work identically even in `FLYING` (freeze ball `pos`/`vel`). Pauses `updateBall` but `updateWindUniforms` still runs and field stays rendered dimmed behind backdrop. Root shows **Continue**, **Help**, **End Run** — **never `New Game`**. Pressing `Escape`/`P` again or clicking **Continue** simply hides overlay, removes `with-backdrop`, and **resumes at exact paused state** (ball continues flight, no `loadProgress` re-parse). Entry Continue (after reload) restores from `loadProgress` and switches to grass; pause Continue just unpauses.

DOM `index.html` (single `#main-menu-overlay` inside `#game-container`):
```html
<div id="main-menu-overlay" class="hidden">
  <div class="main-menu-content">
    <div id="main-menu-root">
      <button id="continue-button" class="main-menu-button hidden">Continue</button>
      <button id="new-game-button" class="main-menu-button">New Game</button>
      <button id="help-button" class="main-menu-button">Help</button>
      <button id="end-run-button" class="main-menu-button hidden">End Run</button>
    </div>
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
  <div id="help-overlay" class="hidden"><div class="help-card">…<button id="help-back-button">Back</button></div></div>
</div>
<div id="toast" class="hidden">copied to clipboard</div>
```
No `<h2>Golf Vector Field</h2>` inside overlay required; outside `#game-container` no `h1`/`#instructions`. `#pause-overlay` legacy shall be removed or permanently `hidden`; the visible pause surface is `#main-menu-overlay`.

- CSS: `#main-menu-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:transparent;border-radius:8px;z-index:12}` `.with-backdrop{background:rgba(0,0,0,0.55)}` `.hidden{display:none}` `.main-menu-content{max-width:90%;max-height:90%;overflow:hidden;flex-direction:column;gap:14px;background:transparent}` `.main-menu-button{min-width:180px;padding:12px 28px;font:700 14px system-ui;background:#2ecc71;border:2px solid #27ae60;border-radius:8px;color:white}` (opaque, not `rgba(...,0.28)`). End Run red `background:#e74c3c` `border:1px solid #c0392b`.

- **Continue visibility**: visible iff `hasRestorableSave()` true. On entry with save, `Continue` alongside `New Game`/`Help` (but `End Run` absent); in pause, `Continue` visible because run active. Click semantics per above; course lookup failures are no-op.

- **Blocking**: while `mainMenuVisible===true` (any sub-view) `updateBall` frozen, `handleLaunch`/placement/drag/hotkeys ignored, `maybeShowRewardMenu` blocked, hotbar hidden. Legacy `WIN`/`rewardMenuVisible` take priority over pause open.

## 4. New Game → Course Submenu (behind `New Game`, not in root)

- `New Game` (visible only in entry) → show `#course-menu` (hide `#main-menu-root`) while `mainMenuVisible===true` still on splash, no backdrop.
- **Scrollable list** `#course-list` bounded to canvas (`getBoundingClientRect()` inside container at `375px`): `max-height: min(42vh,320px)` or `≈45%` overlay, `overflow-y:auto; overscroll-behavior:contain; display:flex; gap:8px`.
- **Per-row** `.course-row[data-course-id]`:
  - **Course play button** `.course-play-button` (opaque `background:#2ecc71` `border:2px solid #27ae60`, `flex:1; flex-direction:column; gap:2px`) with two rows: `span.course-name` `700 13px` white with stroke (course `name`, ellipsis), `span.course-meta` `500 11px` smaller (`getComputedStyle(meta).fontSize < name.fontSize`) showing `"<holeCount> holes   Record: <best|—>"` (e.g. `"9 holes  Record: 42"` or `"18 holes  Record: —"` when `bestTotal===null`).
  - **Delete button** `.course-delete-button` to the right `flex:0 0 auto; padding:6px 10px; font:600 11px; background:#e74c3c; border:1px solid #c0392b; color:white` with **visible text exactly `🗑`** (or `🗑️`), no alphabetic `Delete` in `textContent` (`title="Delete course"` allowed). Does NOT start game; `confirm("Delete course \"<name>\"?")` → remove from `courses`, `saveCourses()`, re-render; if deleted `id===active courseId` also `clearProgress()` (Continue disappears). Deleting all is allowed (`courses:[]` → `{"version":1,"courses":[]}`; empty scrollable list with New Course/Import still visible; no auto-create until reload with missing key). Tests verify per-row Export does NOT exist (`querySelector('.course-export-button')===null` in `#course-menu`).
  - Clicking the **play button** starts new run on that course: `activeCourse=course; LEVELS=course.holes; currentHoleIndex=0; holeAttempts=0; totalAttempts=0; supply={1,1,1}; /* etc. full run reset without touching courses */ loadLevel(0); gameState="AIMING"; mainMenuVisible=false; hide overlays; drawBackground('grass'); saveProgress(courseId)`.

- **Footer** `#course-menu-footer` below list: `New Course` (`#new-course-button` text `New Course`, opaque) and `Import` (`#import-course-button` text exactly `Import`, opaque). Bounded to canvas.
  - **New Course flow**: → show `#new-course-choices` with HTML buttons `data-holes="3"/"6"/"9"/"18"` ("3 Holes" etc.) + `Cancel`. Selecting `6`/`9`/`18` generates `createCourse(holeCount)` linearly `easy→hard`; selecting `3` shows secondary difficulty chooser `#new-course-choices-difficulty` `data-difficulty="easy"/"medium"/"hard"` (all `3` holes uniform that tier per `08-level-generation.md`); `Cancel` hides choices; push/save/re-render, stay in submenu (not auto-start).
  - **Import flow**: → `#import-area` with `<p class="import-help">Paste the string exported from another game</p>` `<textarea id="import-input">` `Import` confirm + `Cancel` `Invalid course data` error `p#import-error`. Decode `atob(trim) → JSON.parse`, validate as `Course` (same checks as load; `holes.length` `3|6|9|18`); on duplicate `id` generate new UUID (suffix name `" (Import)"`), push/save/re-render. Invalid → show `Invalid course data`, no crash, no add. All bounded to canvas.

## 5. Best Score Per Course (replaces global `HIGH_SCORE_KEY`)

- `bestTotal` is `null` initially. On **full course completion** (`currentHoleIndex===course.holes.length-1 && WIN`), compare `totalAttempts` to `course.bestTotal`; if `null` or `<` then set and `saveCourses()`. Ties keep existing. No update on incomplete/`End Run`/quit. Legacy `HIGH_SCORE_KEY` may be kept for migration only (if `bestTotal===null` and legacy key exists, optionally assign to default course's `bestTotal`).

## 6. Export (Pause Menu Only) & Toast

- Encode `exportCourse(course) = btoa(JSON.stringify(course))` (whole course including `holes/field`; `bestTotal` may be excluded/reset to `null` on import if documented).
- In pause overlay (`#pause-overlay .pause-content` or inside `#main-menu-overlay.with-backdrop`) beside `Resume`/`End Run`, add `button#pause-export-button.course-export-button` (text `⎙ Export Course`/`Export` acceptable, visible). It exports `activeCourse` via `navigator.clipboard.writeText(base64)` or fallback `execCommand('copy')` via temporary textarea (`try/catch`). Show toast `#toast` near bottom-center of `#game-container` `text:"copied to clipboard"` (case-insensitive) `background:rgba(0,0,0,0.75); color:white; padding:8px 14px; border-radius:6px; position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:20` auto-hide `1800-2500ms`. Does not close pause or end run.

## 7. End Run

- `function endRun(){ clearProgress(); currentHoleIndex=0; holeAttempts=0; totalAttempts=0; supply={1,1,1}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; ...; modifiers=[]; syncModifiersToField(); mainMenuVisible=true; isInLevelPause=false; courseMenuVisible=false; helpVisible=false; /* no maybeUpdateHighScore */ }`
- Removes `STORAGE_KEY` only; preserves `COURSES_KEY`; `bestTotal` unchanged.

## 8. Help Overlay (inside same main-menu overlay)

- Shown via `Help` in either entry or pause → hide `#main-menu-root`/`#course-menu`, show `#help-overlay` (`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:transparent; z-index:12`) while `mainMenuVisible===true` still on splash (entry) or on dimmed field with `with-backdrop` (pause). No `rgba(0,0,0,0.35)` full-screen dim; card provides legibility.
- **Card** `.help-card` inside is opaque scrollable: `max-width:90%; max-height:85%; width:min(420px,90%); overflow-y:auto; overscroll-behavior:contain; background:rgba(0,0,0,0.75)` (or `#222` opaque) `color:white; padding:16px 18px; border-radius:10px; flex-direction:column; gap:10px; scrollbar-width:thin`. Card background is opaque/semi-opaque (not `transparent`); `getComputedStyle(helpOverlay).backgroundColor==="rgba(0,0,0,0)"` (no backdrop), card itself provides contrast.
- **Content** (short, ≤400 words): Rules must contain `wind` + `hole`/`course` + `attempt`/`stroke`/`fewest`; controls must contain `arrow`/`aim` + `space`/`charge`/`shoot` + `click`/`place`; plus mention modifiers-before-shoot, attempts tracking, per-course `bestTotal` saved. Controls list rows `Arrow keys — Aim`, `Space — Hold to charge, release to shoot`, `Click — Place modifier`, `Right-click — Remove`, `1/2/3`, `H`, `R`, `Escape/P` pause (core three `Arrow/Space/Click` mandatory).
- **Back** `#help-back-button` text `Back` opaque; returns to root without side effects. Bounded to canvas; no page scroll. While help visible game is paused (same blocking as §3).

## Acceptance Criteria

- [ ] Fresh load: splash visible, `#loading-screen` black→hidden after decode, `localStorage` has `COURSES_KEY` with one `18`-hole course `id` UUID, `name` `"Adjective Noun"`; menu root has `New Game`/`Help`, `Continue` hidden when no run, `End Run` never visible on entry; buttons opaque; all bounding rects inside container.
- [ ] With save: `Continue` visible on entry (but `End Run` still hidden on entry); clicking `Continue` (entry) or `New Game`→course play→reload→`Continue` (pause case) behavior per §3/§4 resumes/restarts correctly and `STORAGE_KEY` has `courseId`.
- [ ] `Escape`/`P` even in `FLYING` freezes ball, shows pause with backdrop and `Continue`/`Help`/`End Run` (never `New Game`); `Continue`/`Escape`/`P` unfreezes and ball continues; `End Run` clears `STORAGE_KEY`, restores entry menu over splash.
- [ ] Course submenu behind `New Game` only: scrollable `#course-list`, per-row two-row play button + `🗑` delete (no per-row export), footer `New Course`/`Import` exact texts; `New Course` `3/6/9/18` + `3`-difficulty chooser; `Import` help text + `atob` validation; export only in pause via `#pause-export-button` with toast `copied to clipboard`; reloading preserves courses per `COURSES_KEY`.
- [ ] Full course completion updates `bestTotal` (lower is better), ties keep, `End Run` never updates. Help overlay shows required keywords, is scrollable, card opaque, overlay transparent, Back returns to correct root (entry vs pause backdrop preserved).

## File Paths

- `src/main.js:1` (mainMenuVisible/isInLevelPause/courseMenuVisible/helpVisible, `hasRestorableSave`, `Continue`/`End Run`/`New Game`/`Help` handlers, `Escape`/`KeyP` even in `FLYING`, `clearProgress`, course play)
- `src/courses.js:1` (`COURSES_KEY`, `generateCourse`, `randomName`, `loadCourses`, `saveCourses`, `exportCourse`, `importCourse`)
- `src/storage.js:1` (optional helper for `STORAGE_KEY` save/load/clear)
- `index.html:1` (`#main-menu-overlay` + submenus + `#loading-screen` + `#toast`; no `h1`/`#instructions`/`#pause-overlay` legacy)
- `style.css:1` (overlay `transparent` vs `with-backdrop`, opaque buttons, scrollable `course-list`/`help-card`, toast, loading screen)
