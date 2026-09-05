# REQ-031: Course Collection — Multiple Courses, Per-Course Records, Import/Export, Random Names (New Game → Course Submenu)

- **ID:** REQ-031
- **Title:** Multiple Golf Courses — Collection, Records, Import/Export, Random Names (Course List Behind New Game)
- **Priority:** Must Have
- **Type:** Functional + Persistence + UI
- **Status:** Draft
- **Related Plan Section:** Course Management / Persistence / Main Menu (REQ-010/REQ-027/REQ-029 Extension)

## Description
The game SHALL support **multiple golf courses**, each a collection of `3`, `9` or `18` levels (holes) generated procedurally. All courses SHALL be persisted as a **collection in `localStorage`**. For each course the game SHALL track the **lowest total attempts** (best score). The **main menu's "New Game" button (REQ-029) SHALL navigate to a course selection submenu** (not the root menu): the submenu SHALL show a **scrollable list of one button per course** displaying its name and record using the **same opaque style as the other menu buttons**, with an adjacent **delete button showing only a trashcan icon (🗑)** to the right of each course button. At the **bottom of the course submenu** SHALL be **"New Course"** and one **"Import"** button. The **pause menu** SHALL still contain an **Export** button for the active course; the per-course **Export button in the course list is removed** (only the trashcan delete remains per row). Export SHALL copy a **base64-encoded JSON** representation of the whole course to the clipboard and show a **toast "copied to clipboard"**. Export via pause menu remains. An **Import** flow (input box + explanatory text "Paste the string exported from another game") SHALL be in the course submenu. Each course SHALL contain a **random UUID** and a **random human-readable name** formed as `<Wind/Weather Adjective> + <Golf Noun>` shown in the course buttons.

## Rationale
A single 18-hole set limits replayability and sharing. A collection lets players build a library, keep personal bests per layout, and share creations via a single copy-paste string without a server. Moving the roster behind "New Game" keeps the entry screen minimal (Continue/New Game/Help) while preserving full course management. Random names give identity without manual input, and UUIDs prevent collisions on import. Base64 keeps the payload clipboard-safe for static hosting. Opaque buttons over the unobscured splash keep legibility without a dimming backdrop (REQ-029/030).

## Requirements

1. **Course Data Model** in `src/courses.js` or `src/levels.js`:
   - A `Course` SHALL be:
     ```js
     {
       id: string,          // UUID v4, e.g. crypto.randomUUID() or fallback
       name: string,        // e.g. "Breezy Fairway"
       holes: Level[],      // 3, 9 or 18 items, each as per REQ-010 Level shape
       holeCount: 3|9|18,   // holes.length
       seed: number,        // base seed used to generate holes
       createdAt: number,   // Date.now()
       bestTotal: number|null // lowest totalAttempts on full completion, null = no record yet
     }
     ```
   - `Level` remains as in REQ-010 (`id`, `name`, `canvas`, `tee`, `hole`, `obstacles`, `field`).
   - **UUID**: `id` SHALL be generated via `crypto.randomUUID()` when available, else fallback `Math.random`-based v4 and SHALL be unique across the collection (if collision, regenerate).
   - **Name**: `name` SHALL be generated via a **random adjective + noun** combination:
     - Adjectives (wind/weather, ≥10): e.g. `["Breezy","Gusty","Stormy","Misty","Blustery","Whispering","Howling","Calm","Sunny","Zephyr","Tempest","Windy","Gentle","Brisk","Hazy"]`
     - Nouns (golf-related, ≥10): e.g. `["Fairway","Greens","Links","Meadow","Dunes","Valley","Hollow","Pines","Ridge","Course","Haven","Glen","Heights","Acres","Trail"]`
     - Selection SHALL use `Math.random` / `crypto.getRandomValues` and produce `"Adjective Noun"` (e.g., `"Gentle Dunes"`). No user input for name on creation; name SHALL be shown in course buttons.
   - `holes` SHALL be generated via `generateLevels(seed, holeCount)` (variable count). `holeCount` MUST be `3`, `9` or `18`.

2. **Courses Collection Persistence** in `src/storage.js` / `src/courses.js` / `src/main.js`:
   - Key SHALL be `COURSES_KEY = "golfVectorField.courses.v1"` (distinct from `STORAGE_KEY` for active run). Value SHALL be `JSON.stringify({version:1, courses: Course[]})`.
   - On **first ever load** (no `COURSES_KEY`), the game SHALL **auto-create one default course** with `18` holes and immediately save it, so the course submenu is never empty on first visit.
   - **Save** (`saveCourses()`): `localStorage.setItem(COURSES_KEY, JSON.stringify({version:1, courses}))` on every mutation: New Course, Import Course (if valid), course deletion, and when `bestTotal` improves.
   - **Load** (`loadCourses()`): on `init()` before rendering menus, attempt `localStorage.getItem(COURSES_KEY)` → `JSON.parse` → validate `version===1` and `Array.isArray(courses)`. On corrupt/missing/wrong version, fallback to auto-created default course and overwrite. Each loaded course SHALL be validated: `id` string, `name` string, `holes` array length `3|9|18`, each hole with `tee/hole/obstacles/field` per REQ-010; invalid courses SHALL be discarded (with `console.warn`) and not crash.
   - **Best score per course**: `bestTotal` SHALL be `null` initially. On completing a **full run of the active course** (clearing its final hole, `currentHoleIndex === course.holes.length-1` and `gameState==="WIN"`), compare `totalAttempts` to `course.bestTotal`; if `bestTotal===null` or `totalAttempts < bestTotal`, set `course.bestTotal = totalAttempts` and `saveCourses()`. Lower is better. Ties keep existing. No update on incomplete runs, `End Run`, or mid-course quits.
   - **Active run binding**: the existing `STORAGE_KEY = "golfVectorField.progress.v1"` payload SHALL be extended with `courseId: string` (the `id` of the Course currently being played). On `loadProgress()` verify `courseId` exists in `courses`; if missing, treat as no saved run (show main menu root, Continue hidden). On `saveProgress()` include `courseId`. `clearProgress()` removes only the active run, not the courses collection.

3. **Course Submenu — Scrollable Course List + Per-Course Actions (Behind New Game)** in `index.html` / `style.css` / `src/main.js`:
   - The course submenu SHALL be a sub-view of the main menu (`#main-menu-overlay`), **not the root view**. It SHALL only be visible after clicking **"New Game"** in the root (REQ-029). While visible, `mainMenuVisible===true`, bottom canvas shows splash with **no backdrop** (transparent overlay), all buttons opaque (see REQ-029/030).
   - **Visibility**: `#course-menu` (or `#course-list-container`) SHALL be `hidden` by default; clicking `#new-game-button` shows it and hides `#main-menu-root`; clicking `#course-menu-back` ("Back") hides the submenu and shows root again. No run is started until a course button is clicked.
   - **Structure inside `#course-menu`** (inside `#main-menu-overlay .main-menu-content`):
     ```html
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
     ```
   - **Scrollable list**: `#course-list` SHALL have `max-height: min(42vh, 320px)` or `max-height: 45%` of overlay, `overflow-y:auto`, `overflow-x:hidden`, `display:flex; flex-direction:column; gap:8px; padding:4px; scrollbar-width:thin; overscroll-behavior:contain`. If too many courses (>6-8), the list SHALL scroll vertically while footer + Back remain visible (sticky footer). No horizontal overflow; each row fits within `90%` of overlay width. No page-level scroll; only list scrolls. All buttons SHALL be bounded to `#game-container` (`getBoundingClientRect()` inside container, no overflow at `375px`).
   - **Per-course row**: for each `course` in `courses` (order: creation order or most-recent-first, documented), render `<div class="course-row" data-course-id="...">` containing:
     - **Course button** `<button class="course-play-button">` with **same opaque style as other menu buttons** (`background:#2ecc71` opaque `border:2px solid #27ae60`, `color:white`, `hover #27ae60`, not transparent `rgba(...,0.28)`), `display:flex; flex-direction:column; align-items:flex-start; gap:2px; flex:1; min-width:0;` Two rows inside:
       - Upper `span.course-name` with course `name` (`700 13px` white with stroke, `text-overflow:ellipsis`).
       - Lower `span.course-meta` with **hole count + record** in smaller font (`500 11px` `opacity:0.95` stroke `1px`, e.g., `"9 holes  Record: 42"` or `"18 holes  Record: —"` — smaller font is normative, exact separator may be long space `\u2003` or regular spaces). The lower row SHALL have smaller font than the upper (verified via `getComputedStyle(meta).fontSize < getComputedStyle(name).fontSize`).
       - The button SHALL be two rows as described; no single-line dash format.
     - **Delete button** `<button class="course-delete-button" title="Delete course">🗑</button>` **to the right of the course button** (`flex:0 0 auto`, `gap:8px`, `padding:6px 10px`, `font:600 11px`, `background:#e74c3c` opaque `border:1px solid #c0392b`, white). **Only the trashcan icon SHALL be the visible label** — `textContent.trim()` SHALL be exactly `🗑` or `🗑️` (icon only) with **no alphabetic word "Delete"** in visible text. `title`/`aria-label` MAY contain "Delete course" for accessibility, but visible text is icon only. Tests SHALL verify `deleteButton.textContent.trim() === "🗑"` (or includes `🗑` and `! /Delete/i.test(textContent)`) and that the button does NOT start a game.
     - **No per-row Export button SHALL exist** in this list (removed per new spec). Tests SHALL verify `document.querySelector('#course-list .course-export-button') === null` and `document.querySelector('#course-menu .course-export-button') === null`. Export remains only in pause menu (§4).
     - Clicking the **course play button** (not delete) SHALL start a **new game on that course**: set `activeCourse=course`, `currentHoleIndex=0`, `holeAttempts=0`, `totalAttempts=0`, `supply={1,1,1}`, `loadLevel(0)` using that course's first hole, `gameState="AIMING"`, `mainMenuVisible=false`, hide all main-menu overlays, `drawBackground('grass')`, and `saveProgress()` with `courseId`. No initial reward menu.
     - Delete flow: clicking `.course-delete-button` SHALL `confirm("Delete course \"<name>\"?")` and if confirmed, remove course from `courses`, `saveCourses()`, re-render list, and if the deleted course was the active run's course, `clearProgress()` (so Continue disappears if that `courseId` was saved). **User SHALL be allowed to delete all courses**, leaving `courses` empty (`[]`) persisted as `{"version":1,"courses":[]}`; course submenu then shows empty scrollable list with New Course / Import still visible, no auto-create until next reload with no key (first ever load still auto-creates one). Delete button SHALL NOT start a game.
   - **Footer actions** inside course submenu (below the scrollable list, inside `#course-menu` but outside `#course-list`):
     - **"New Course"** `<button id="new-course-button">New Course</button>` — opaque (e.g., `background:#2ecc71` solid `border:2px solid #27ae60`, white).
     - **"Import"** `<button id="import-course-button">Import</button>` — opaque (e.g., `background:#2ecc71` or neutral opaque like `background:#3498db` — but **must be opaque** alpha 1, not transparent). Text SHALL be exactly `"Import"` (not `"Import Course"` or `"⤵ Import"`). Tests SHALL verify `import-course-button.textContent.trim() === "Import"`.
     - Both SHALL be `max-width:360px`, `width:100%` or `flex:1`, `gap:10px` between them, bounded to canvas.
   - **New Course flow**: clicking `New Course` SHALL show a **choice UI** for hole count: `<div id="new-course-choices"><button data-holes="3">3 Holes</button><button data-holes="9">9 Holes</button><button data-holes="18">18 Holes</button><button id="new-course-cancel">Cancel</button></div>` — must be HTML buttons (not `prompt`). Selecting `3`/`9`/`18` SHALL generate a new course via `createCourse(holeCount)`, push to `courses`, `saveCourses()`, re-render the list (now includes new course), and keep course submenu visible (not auto-starting). `Cancel` SHALL hide the choice UI and restore footer.
   - **Import flow**: clicking `Import` SHALL show an **input area** inside the course submenu: `<div id="import-area"><p class="import-help">Paste the string exported from another game</p><textarea id="import-input" placeholder="Paste base64 string here"></textarea><button id="import-confirm">Import</button><button id="import-cancel">Cancel</button><p id="import-error" class="hidden"></p></div>` (or `<input>` instead of `<textarea>`). The help text SHALL contain `"Paste the string exported from another game"` (case-insensitive). `Import` SHALL attempt to decode `import-input` value (trim whitespace), `atob` → `JSON.parse`, validate as `Course` (same validation as load), check for duplicate `id`: if a course with same `id` already exists, **generate a new UUID** for the imported course (and optionally suffix name with `" (Import)"`) to avoid collision, then push, `saveCourses()`, re-render list, hide import area, and optionally show toast `"Course imported"`. On invalid base64/JSON/validation failure, show `import-error` text `"Invalid course data"` and do **not** add a course or crash. `Cancel` SHALL hide the import area.

4. **Export Course — Base64 + Clipboard + Toast (Pause Menu Only)** in `src/courses.js` / `src/main.js` / `index.html` / `style.css`:
   - **Encoding**: `exportCourse(course)` SHALL be `btoa(JSON.stringify(course))` where `course` is the full `Course` object (including `id`, `name`, `holes`, `seed`, `createdAt`, `bestTotal` — though `bestTotal` MAY be excluded and reset to `null` on import; either is acceptable if documented, but holes/field data MUST be preserved). No compression beyond base64. ASCII-safe, no line breaks, decodable via `atob` + `JSON.parse`.
   - **Clipboard**: clicking the **pause-menu export button** SHALL execute `navigator.clipboard.writeText(base64)` if available, else fallback to `document.execCommand('copy')` via temporary `<textarea>` (wrapped in `try/catch`, no throw). On success, show a toast; on failure, still show toast but with text `"Copy failed"` or `"copied to clipboard"` if fallback succeeded — do not throw.
   - **Toast**: a transient DOM element `#toast` (or `.toast`) SHALL appear near bottom-center of `#game-container` or viewport, with text **exactly** `"copied to clipboard"` (case-insensitive), `background:rgba(0,0,0,0.75)`, `color:white`, `padding:8px 14px`, `border-radius:6px`, `position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:20`, auto-hide after `1800-2500ms` via `setTimeout` + `classList.add('hidden')` or removal. The toast SHALL be shown for pause-menu export (per-course export in course list no longer exists, so only pause export triggers it).
   - **Pause menu export**: inside `#pause-overlay .pause-content`, beside/below `Resume`/`End Run`, add `<button id="pause-export-button" class="course-export-button">⎙ Export Course</button>` (or `Export` / icon `⎙`/`⧉`/`📋` acceptable, opaque or semi-opaque is acceptable but must be visible). It SHALL export the **active course** (`activeCourse` or `courseId` → lookup in `courses`), not `HIGH_SCORE_KEY`. If no active course (should not happen when pause is visible), the button SHALL be hidden/disabled and do nothing. Clicking it SHALL copy base64 and show the same toast, without closing the pause menu or ending the run.

5. **High Score Per Course (Replaces Global HIGH_SCORE_KEY)**:
   - The legacy `HIGH_SCORE_KEY = "golfVectorField.highScore.v1"` MAY be kept for migration (on first load, if it exists and no course has a `bestTotal`, optionally assign its value to the default course's `bestTotal`), but **new records SHALL be per-course** in the `courses` collection, not in `HIGH_SCORE_KEY`. The course button's record text SHALL reflect `course.bestTotal`, not the global key.
   - `maybeUpdateHighScore()` SHALL be replaced or extended to `maybeUpdateCourseRecord()` that updates `activeCourse.bestTotal` as described in §2, then `saveCourses()`, called on final-hole `WIN`.

## Acceptance Criteria

- [ ] On first load after clearing `localStorage` (both `COURSES_KEY` and `STORAGE_KEY`), `localStorage.getItem("golfVectorField.courses.v1")` is auto-created with `version:1` and `courses.length === 1` where `courses[0].holes.length === 18`, `courses[0].id` is a UUID string matching `/^[0-9a-f-]{36}$/i` or similar length ≥24, and `courses[0].name` matches `/^[A-Z][a-z]+ [A-Z][a-z]+$/` (adjective + noun, e.g., `"Breezy Fairway"`). The course's `name` is shown in the course submenu's first row **after clicking "New Game"** in the main menu root (course list is not in root, but behind New Game).
- [ ] Main menu root shows three buttons (Continue conditional, New Game, Help). Clicking **"New Game"** hides root and shows **course submenu** (`#course-menu` visible, `#main-menu-root` hidden) still over the splash with **no dimming backdrop** (transparent overlay). The course submenu contains a **scrollable `#course-list`** (`overflow-y:auto`, `max-height` constrained) with **one row per course** where the course button is **two rows**: upper `span.course-name` contains the course `name` `700 13px`, lower `span.course-meta` contains **hole count + record** (e.g., `"9 holes  Record: —"` when `bestTotal===null` or `"18 holes  Record: 42"`) in **smaller font** (`500 11px`, `getComputedStyle(meta).fontSize < getComputedStyle(name).fontSize`). The course button is **opaque** (`getComputedStyle(...).backgroundColor` is `rgb(46, 204, 113)` / `#2ecc71` opaque, not `rgba(...,0.28)` — same opaque style as root buttons). The row also contains an adjacent **delete button** (`course-delete-button`) whose visible **text is exactly "🗑"** (no word "Delete"), `background:#e74c3c` opaque `border:1px solid #c0392b`, and **no per-row Export button exists** (`document.querySelector('#course-list .course-export-button') === null`). The list container has `overflow-y:auto` and `max-height` constrained so it scrolls when many courses exist (verified by adding 10 courses and checking `scrollHeight > clientHeight`). Footer shows **"New Course"** and **"Import"** (text exactly "Import") opaque buttons, not overflowing canvas.
- [ ] Clicking a course's **play button** (not delete) starts a new game on that course: `mainMenuVisible false`, `currentHoleIndex 0`, `holeAttempts 0`, `totalAttempts 0`, `activeCourse.id === clicked course.id`, `LEVELS` length matches `holeCount` (3/9/18), `loadLevel(0)` uses that course's tee/hole, bottom canvas shows grass, no initial reward menu, and `STORAGE_KEY` now contains `courseId` equal to the clicked course's `id`. Reloading shows main menu root with Continue visible (not auto-resume) and resumes via Continue.
- [ ] **Per-course record**: complete a course with `3` holes (via New Game → New Course → 3 holes, then select course and play through, `totalAttempts` e.g., 12). After final-hole WIN, the course's `bestTotal` becomes `12` in `COURSES_KEY` (`JSON.parse(localStorage.getItem(...)).courses.find(c=>c.id===courseId).bestTotal === 12`). Return to main menu via `End Run`, then New Game → course submenu, the course's row now shows `Record: 12`. Complete same course again with `Total 15` → record stays `12`. Complete again with `Total 10` → record updates to `10`.
- [ ] **Delete (course submenu)**: each course row has a delete button (`course-delete-button` `🗑` icon only) to the right of the course button; clicking it shows `confirm("Delete course \"<name>\"?")` and if confirmed removes the course from `courses`, `saveCourses()`, re-renders list (one fewer row). **Deleting all courses is allowed** (`courses` empty `[]` persisted as `{"version":1,"courses":[]}`); course submenu then shows empty scrollable list with New Course / Import still visible, and no auto-create until next reload with no key (first ever load still auto-creates one). Cancel does nothing. Delete button is opaque red `background:#e74c3c` `border:#c0392b` and does NOT start a game. Export button per row does NOT exist.
- [ ] **Export (pause menu only)**: start a game on any course, press `Escape` to open pause, the pause overlay shows `Resume`, `End Run`, and an additional `Export Course` button (`#pause-export-button`). Clicking it copies the **active course** (same base64 as before) and shows toast `copied to clipboard` (case-insensitive) near bottom-center, then hides after ~2s, without closing pause or ending run. No per-row export in course submenu.
- [ ] **New Course**: in course submenu footer, button `New Course` (`#new-course-button`) is visible. Clicking it shows a choice UI with three buttons for `3`, `9`, `18` holes (e.g., `#new-course-choices` with `data-holes="3"` etc.) and a `Cancel`. Selecting `9` creates a new course with `holes.length===9`, random `id`/`name` (adjective+noun, different from existing), pushes to `courses`, persists, and the list now has `length+1` rows (new row visible, scrollable). `Cancel` hides the choice UI without creating a course.
- [ ] **Import**: in course submenu footer, button `Import` (`#import-course-button` text exactly `"Import"`) is visible. Clicking it shows an input area (`#import-area` with `#import-input` and help text containing `Paste the string exported from another game`). Pasting a valid export string (previously exported base64 from pause export) and clicking `Import` adds the course to the collection (with new UUID if duplicate `id` exists), saves, and the list grows by one with the imported course's `name` visible. Pasting invalid base64 (`"not-base64"`) shows error text `Invalid course data` and does not add a course or crash.
- [ ] **Name generation**: each new course (via `New Course` 3/9/18) has a `name` matching `/^[A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+$/` where first word is from the wind/weather adjective list and second from the golf noun list (both lists ≥10 items, documented in `src/courses.js`). Two consecutive `New Course` calls produce different names (random, not hard-coded `"Course 1"`).
- [ ] **Persistence**: after creating a new `9`-hole course and reloading the page, `loadCourses()` restores the same number of courses with same `id`/`name`/`holes`/`bestTotal`. The `COURSES_KEY` payload is versioned and wrapped in `try/catch` (corrupt JSON → fallback to default course without throwing).
- [ ] **Storage keys**: `localStorage` contains `COURSES_KEY` (`golfVectorField.courses.v1`) with `version:1` and `courses` array, and `STORAGE_KEY` with `courseId` when a run is active. `HIGH_SCORE_KEY` may still exist for migration but is not the source of per-course records (course button record comes from `courses[].bestTotal`).
- [ ] No canvas-drawn main menu; main menu remains HTML overlay bounded to 16:9 per REQ-029, now with scrollable `course-list` behind New Game. All buttons opaque, over transparent splash. No elements outside `#game-container` except `#loading-screen` during load. No external libraries beyond `three` for wind.

## Dependencies

- REQ-010 (level generation, now wrapped in `Course.holes`)
- REQ-027 (localStorage, extended for courses collection + `courseId` in progress)
- REQ-029 (main menu root → course submenu navigation)
- REQ-028 (pause menu, now with export)
- REQ-014 (attempts, now per-course `bestTotal`)

## Notes

- Implementation sketch `src/courses.js`:
  ```js
  export const COURSES_KEY = "golfVectorField.courses.v1";
  const ADJECTIVES = ["Breezy","Gusty","Stormy","Misty","Blustery","Whispering","Howling","Calm","Sunny","Zephyr","Tempest","Windy","Gentle","Brisk","Hazy"];
  const NOUNS = ["Fairway","Greens","Links","Meadow","Dunes","Valley","Hollow","Pines","Ridge","Course","Haven","Glen","Heights","Acres","Trail"];
  export function randomName(rand=Math.random){ const a=ADJECTIVES[Math.floor(rand()*ADJECTIVES.length)]; const n=NOUNS[Math.floor(rand()*NOUNS.length)]; return `${a} ${n}`; }
  export function generateCourse(holeCount=18, seed=Date.now()){
    const id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});
    const name = randomName();
    const holes = generateLevels(seed, holeCount);
    return { id, name, holes, holeCount, seed, createdAt:Date.now(), bestTotal: null };
  }
  export function loadCourses(){ try{ const raw=localStorage.getItem(COURSES_KEY); if(!raw) throw 0; const d=JSON.parse(raw); if(d.version!==1||!Array.isArray(d.courses)) throw 0; return d.courses; }catch{ const def=generateCourse(18); saveCourses([def]); return [def]; } }
  export function saveCourses(courses){ localStorage.setItem(COURSES_KEY, JSON.stringify({version:1, courses})); }
  export function exportCourse(course){ return btoa(JSON.stringify(course)); }
  export function importCourse(b64){
    const json=atob(b64.trim()); const c=JSON.parse(json);
    if(!c.id||!c.name||!Array.isArray(c.holes)||![3,9,18].includes(c.holes.length)) throw new Error("Invalid course data");
    return c;
  }
  ```
- `src/main.js` changes: on `init()` call `loadCourses()` to populate `courses` global, render `#course-list` only when course submenu is shown, handle `course-play-button` click → `activeCourse=course; LEVELS=course.holes; loadLevel(0);` ; `maybeUpdateCourseRecord()` on final WIN updates `activeCourse.bestTotal` and `saveCourses()`. The course submenu's Import/New Course logic is the same as before but now lives under `#course-menu`, not in the root.
- Toast helper: `function showToast(msg){ let t=document.getElementById('toast'); if(!t){ t=document.createElement('div'); t.id='toast'; document.getElementById('game-container').appendChild(t); } t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'), 2000); }`
- Delete buttons: `course-delete-button` text is `"🗑"` only (set `button.textContent="🗑"`; `button.title="Delete course"` for a11y). `course-delete-button` click stops propagation and confirms.
- Course submenu Back button: `<button id="course-menu-back">Back</button>` hides `#course-menu` and shows `#main-menu-root`.

## File Paths

- `src/courses.js:1` (Course type, COURSES_KEY, generateCourse, randomName, loadCourses, saveCourses, exportCourse, importCourse)
- `src/levels.js:1` (generateLevels now supports variable count, used by generateCourse)
- `src/main.js:1` (courses collection, activeCourse, courseId in saveProgress/loadProgress, maybeUpdateCourseRecord, course submenu rendering behind New Game, New/Import/Delete handlers, toast, Back navigation)
- `index.html:1` (#main-menu-overlay now contains #main-menu-root (Continue/New Game/Help) + #course-menu scrollable submenu (course-list, delete icon only, New Course / Import) + #help-overlay, toast container; no h1, no instructions)
- `style.css:1` (#course-list scrollable, course-row, course-play-button opaque, course-delete-button icon-only red, toast, new/import choice UI, no backdrop)
- `docs/requirements/REQ-031-course-collection.md:1` (this file)
