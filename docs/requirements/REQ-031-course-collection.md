# REQ-031: Course Collection — Multiple Courses, Per-Course Records, Import/Export, Random Names

- **ID:** REQ-031
- **Title:** Multiple Golf Courses — Collection, Records, Import/Export, Random Names
- **Priority:** Must Have
- **Type:** Functional + Persistence + UI
- **Status:** Draft
- **Related Plan Section:** Course Management / Persistence / Main Menu (REQ-010/REQ-027/REQ-029 Extension)

## Description
The game SHALL support **multiple golf courses**, each a collection of `3`, `9` or `18` levels (holes) generated procedurally. All courses SHALL be persisted as a **collection in `localStorage`**. For each course the game SHALL track the **lowest total attempts** (best score) achieved on a completed run of that course. The **main menu** SHALL show a **scrollable list of one button per course** displaying its name and record, with an adjacent **Export** button per course; the **pause menu** SHALL also contain an **Export** button for the active course. Export SHALL copy a **base64-encoded JSON** representation of the whole course to the clipboard and show a **toast “copied to clipboard”**. The main menu SHALL offer **New Course** (choice of 3/9/18 holes, generates and saves) and **Import Course** (input box + explanatory text, paste base64 string). Each course SHALL contain a **random UUID** and a **random human-readable name** formed as `<Wind/Weather Adjective> + <Golf Noun>` shown in main-menu buttons.

## Rationale
A single 18-hole set limits replayability and sharing. A collection lets players build a library, keep personal bests per layout, and share creations via a single copy-paste string without a server. Random names give identity without manual input, and UUIDs prevent collisions on import. Base64 keeps the payload URL/clipboard-safe for static hosting.

## Requirements

1. **Course Data Model** in `src/courses.js` or `src/levels.js`:
   - A `Course` SHALL be:
     ```js
     {
       id: string,          // UUID v4, e.g. crypto.randomUUID() or fallback
       name: string,        // e.g. "Breezy Fairway"
       holes: Level[],      // 3, 9 or 18 items, each as per REQ-010 Level shape
       holeCount: 3|9|18,   // holes.length
       seed: number,        // base seed used to generate holes (for reproducibility/debug)
       createdAt: number,   // Date.now()
       bestTotal: number|null // lowest totalAttempts on full completion, null = no record yet
     }
     ```
   - `Level` remains as in REQ-010 (`id`, `name`, `canvas`, `tee`, `hole`, `obstacles`, `field`).
   - **UUID**: `id` SHALL be generated via `crypto.randomUUID()` when available, else fallback `Math.random`-based v4 (`xxxxxxxx-xxxx-4xxx-...`) and SHALL be unique across the collection (if collision, regenerate). Stored as string, never reused.
   - **Name**: `name` SHALL be generated via a **random adjective + noun** combination:
     - Adjectives (wind/weather, ≥10): e.g. `["Breezy","Gusty","Stormy","Misty","Blustery","Whispering","Howling","Calm","Sunny","Zephyr","Tempest","Windy","Gentle","Brisk","Hazy"]`
     - Nouns (golf-related, ≥10): e.g. `["Fairway","Greens","Links","Meadow","Dunes","Valley","Hollow","Pines","Ridge","Course","Haven","Glen","Heights","Acres","Trail"]`
     - Selection SHALL use the course’s base `seed` or `Math.random` + `crypto.getRandomValues` and produce `"Adjective Noun"` (e.g., `"Gentle Dunes"`). No user input for name on creation; name SHALL be shown in main-menu buttons.
   - `holes` SHALL be generated via `generateLevels(seed, holeCount)` (updated to accept variable count, see REQ-010). `holeCount` MUST be `3`, `9` or `18`; any other value SHALL be rejected.

2. **Courses Collection Persistence** in `src/storage.js` / `src/courses.js` / `src/main.js`:
   - Key SHALL be `COURSES_KEY = "golfVectorField.courses.v1"` (tunable but documented, distinct from `STORAGE_KEY` for active run and `HIGH_SCORE_KEY` legacy). Value SHALL be JSON string `JSON.stringify({version:1, courses: Course[]})`.
   - On **first ever load** (no `COURSES_KEY` in storage), the game SHALL **auto-create one default course** with `18` holes (using `Date.now()` or fixed seed) and immediately save it, so the main menu is never empty. This satisfies the “at least one course” invariant.
   - **Save** (`saveCourses()`): `localStorage.setItem(COURSES_KEY, JSON.stringify({version:1, courses}))` on every mutation: New Course, Import Course (if valid), course deletion (if offered), and when a course’s `bestTotal` improves.
   - **Load** (`loadCourses()`): on `init()` before rendering main menu, attempt `localStorage.getItem(COURSES_KEY)` → `JSON.parse` → validate `version===1` and `Array.isArray(courses)`. On corrupt/missing/wrong version, fallback to auto-created default course and overwrite. Each loaded course SHALL be validated: `id` string, `name` string, `holes` array with length `3|9|18`, each hole with `tee/hole/obstacles/field` per REQ-010; invalid courses SHALL be discarded (with console.warn) and not crash.
   - **Best score per course**: `bestTotal` SHALL be `null` initially. On completing a **full run of the active course** (clearing its final hole, `currentHoleIndex === course.holes.length-1` and `gameState==="WIN"`), compare `totalAttempts` to `course.bestTotal`; if `bestTotal===null` or `totalAttempts < bestTotal`, set `course.bestTotal = totalAttempts` and `saveCourses()`. Lower is better (golf). Ties keep existing. No update on incomplete runs, `End Run`, or mid-course quits.
   - **Active run binding**: the existing `STORAGE_KEY = "golfVectorField.progress.v1"` payload SHALL be extended with `courseId: string` (the `id` of the `Course` currently being played). On `loadProgress()` the game SHALL verify that `courseId` exists in the loaded courses collection; if missing (course deleted or corrupted), treat as no saved run (show main menu, not auto-resume). On `saveProgress()` the active `courseId` SHALL be included. `clearProgress()` continues to remove only the active run, not the courses collection.

3. **Main Menu — Scrollable Course List + Per-Course Actions** in `index.html` / `style.css` / `src/main.js`:
   - The main menu (`#main-menu-overlay` inside `#game-container`, bounded to 16:9 per REQ-029) SHALL be **reworked** from single `New Game` to a **course roster**:
     - **Header**: title `Golf Vector Field` (keep) and optionally subtitle `Choose a Course`.
     - **Scrollable list**: container `#course-list` (e.g., `<div id="course-list" class="course-list"></div>`) with `max-height: min(42vh, 320px)` or `max-height: 45%` of overlay, `overflow-y:auto`, `display:flex; flex-direction:column; gap:8px; padding:4px;` and `scrollbar-width:thin`. If too many courses (e.g., >6-8), the list SHALL scroll vertically while header and footer buttons remain visible (sticky footer). No horizontal overflow; each row fits within `90%` of overlay width per REQ-029.
      - **Per-course row**: for each `course` in `courses` (order: creation order or most-recent-first, documented), render a row `<div class="course-row" data-course-id="...">` containing:
        - **Play button** `<button class="course-play-button">` as **two rows**: **upper row** ` <span class="course-name">` with the **name** (e.g., `"Gentle Dunes"`), **lower row** `<span class="course-meta">` with **hole count + record** in smaller font (e.g., `"9 holes\u2003Record: 42"` or `"18 holes\u2003Record: —"` with long space `\u2003` between holes and record). The upper name SHALL be `700 13px` white with stroke, the lower meta SHALL be `500 11px` (smaller) white `opacity:0.95` with stroke `1px`. The button SHALL be `display:flex; flex-direction:column; align-items:flex-start; gap:2px;` `flex:1`, `min-width:0`, `text-overflow:ellipsis` on the name span, **not transparent** — `background:#2ecc71` (opaque) `border:2px solid #27ae60`, white with stroke, `hover #27ae60`; transparency `rgba(...,0.28)` SHALL NOT be used. No single-line ` — ` dash format SHALL be used; the button is two rows as described.
        - **Export button** `<button class="course-export-button" title="Export course">⎙ Export</button>` (icon `⎙`/`⧉`/`📋`/`⤴` acceptable) beside the play button (`gap:8px`, `flex:0 0 auto`, `padding:6px 10px`, `font:600 11px`, `background:rgba(255,255,255,0.10)`, `border:1px solid rgba(255,255,255,0.25)`, white with stroke). Clicking SHALL trigger export (see §4) **without starting a game**.
        - **Delete button** `<button class="course-delete-button" title="Delete course">🗑 Delete</button>` (icon `🗑`/`✕`/`🗑️` acceptable, label `Delete` must be present) beside the export button (`gap:8px`, `flex:0 0 auto`, `padding:6px 10px`, `font:600 11px`, `background:#e74c3c` opaque `border:1px solid #c0392b`, white with stroke, hover `#c0392b`). Clicking SHALL prompt `confirm("Delete course \"<name>\"?")` and if confirmed, remove the course from `courses`, `saveCourses()`, re-render list, and if the deleted course was the active run’s course, `clearProgress()` and clear `activeCourse` (fall back to first remaining course if any, otherwise leave `activeCourse null`). **The user SHALL be allowed to delete all courses**, leaving `courses` empty (`[]`) and persisted as `{"version":1,"courses":[]}`; main menu then shows an empty scrollable list (no rows) with `New Course`/`Import Course` still visible, and no auto-creation of a default course until user creates/imports one or reloads with no key (first ever load still auto-creates one). The delete button SHALL be visible for every row and SHALL NOT start a game.
     - Clicking the **play button** (not the export button) SHALL start a **new game on that course**: set `activeCourse = course`, `currentHoleIndex=0`, `holeAttempts=0`, `totalAttempts=0`, `supply={1,1,1}`, etc. (same reset as `startNewGameFromMain` but using `course.holes` as `LEVELS`), `loadLevel(0)` using that course’s first hole, `gameState="AIMING"`, hide main menu (`mainMenuVisible=false`), hide win overlay, and `saveProgress()` with `courseId`. No initial reward menu.
     - The list SHALL be **scrollable** when content overflows: CSS `overflow-y:auto` + `overscroll-behavior:contain`, and programmatic test `course-list.scrollHeight > course-list.clientHeight` SHALL be true when many courses exist. No page-level scroll; only list scrolls.
   - **Footer actions** (below the scrollable list, inside `.main-menu-content` but outside `#course-list`):
     - **New Course** `<button id="new-course-button">+ New Course</button>` (green, same as old `New Game` but label `New Course`).
     - **Import Course** `<button id="import-course-button">⤵ Import Course</button>` (neutral white `rgba(255,255,255,0.12)` border `rgba(255,255,255,0.85)`).
     Both SHALL be `width:100%` or centered, `gap:10px` between them.
   - **New Course flow**: clicking `New Course` SHALL show a **choice UI** for hole count: e.g., replace footer with `<div id="new-course-choices"><button data-holes="3">3 Holes</button><button data-holes="9">9 Holes</button><button data-holes="18">18 Holes</button><button id="new-course-cancel">Cancel</button></div>` or a `prompt` is **not** acceptable — it must be HTML buttons inside the overlay (for testability). Selecting `3`/`9`/`18` SHALL generate a new course via `createCourse(holeCount)` (see §3), push to `courses` array, `saveCourses()`, re-render the list (now includes new course at end/top), and keep main menu visible (not auto-starting the course). The user must then click the new course’s play button to start. `Cancel` SHALL hide the choice UI and restore footer.
   - **Import Course flow**: clicking `Import Course` SHALL show an **input area** inside the main menu: `<div id="import-area"><p class="import-help">Paste the string exported from another game</p><textarea id="import-input" placeholder="Paste base64 string here"></textarea><button id="import-confirm">Import</button><button id="import-cancel">Cancel</button><p id="import-error" class="hidden"></p></div>` (or `<input>` instead of `<textarea>` — either is acceptable if documented). The help text SHALL be exactly or containing `"Paste the string exported from another game"` (case-insensitive). `Import` SHALL attempt to decode `import-input` value (trim whitespace), `atob` → `JSON.parse`, validate as `Course` (same validation as load), check for duplicate `id`: if a course with same `id` already exists, **generate a new UUID** for the imported course (and optionally suffix name with `" (Import)"`) to avoid collision, then push, `saveCourses()`, re-render list, hide import area, and optionally show toast `"Course imported"` (optional). On invalid base64/JSON/validation failure, show `import-error` text `"Invalid course data"` (or similar) and do **not** add a course or crash. `Cancel` SHALL hide the import area.

4. **Export Course — Base64 + Clipboard + Toast** in `src/courses.js` / `src/main.js` / `index.html` / `style.css`:
   - **Encoding**: `exportCourse(course)` SHALL be `btoa(JSON.stringify(course))` where `course` is the full `Course` object (including `id`, `name`, `holes`, `seed`, `createdAt`, `bestTotal` — though `bestTotal` MAY be excluded and reset to `null` on import to avoid carrying over record; either is acceptable if documented, but the holes/field data MUST be preserved). No compression beyond base64 is required. The string SHALL be ASCII-safe, no line breaks, and decodable via `atob` + `JSON.parse` on any browser.
   - **Clipboard**: clicking **any** export button (per-course in main menu **or** in pause menu) SHALL execute `navigator.clipboard.writeText(base64)` if available, else fallback to `prompt`-less `document.execCommand('copy')` via temporary `<textarea>` (both attempts wrapped in `try/catch`, no throw). On success, show a **toast**; on failure (e.g., insecure context), still show toast but with text `"Copy failed"` or still `"copied to clipboard"` if fallback succeeded — do not throw.
   - **Toast**: a transient DOM element `#toast` (or `.toast`) SHALL appear near bottom-center of `#game-container` or viewport, with text **exactly** `"copied to clipboard"` (case-insensitive, but spec says lower-case `copied to clipboard`), `background:rgba(0,0,0,0.75)`, `color:white`, `padding:8px 14px`, `border-radius:6px`, `position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:20`, auto-hide after `1800-2500ms` via `setTimeout` + `classList.add('hidden')` or removal. The toast SHALL be shown for **both** main-menu per-course export and pause-menu export.
   - **Pause menu export**: inside `#pause-overlay .pause-content`, beside/below `Resume`/`End Run`, add `<button id="pause-export-button" class="course-export-button">⎙ Export Course</button>` (same style as per-course export). It SHALL export the **active course** (`activeCourse` or `courseId` → lookup in `courses`), not the `HIGH_SCORE_KEY`. If no active course (should not happen when pause is visible, as pause is only during a run), the button SHALL be hidden/disabled and do nothing. Clicking it SHALL copy base64 and show the same toast, without closing the pause menu or ending the run.

5. **High Score Per Course (Replaces Global HIGH_SCORE_KEY)**:
   - The legacy `HIGH_SCORE_KEY = "golfVectorField.highScore.v1"` MAY be kept for migration (on first load, if it exists and no course has a `bestTotal`, optionally assign its value to the default course’s `bestTotal`), but **new records SHALL be per-course** in the `courses` collection, not in `HIGH_SCORE_KEY`. The main-menu per-course button’s record text SHALL reflect `course.bestTotal`, not the global key.
   - `maybeUpdateHighScore()` SHALL be replaced or extended to `maybeUpdateCourseRecord()` that updates `activeCourse.bestTotal` as described in §2, then `saveCourses()`. It SHALL still be called on final-hole `WIN`.

## Acceptance Criteria

- [ ] On first load after clearing `localStorage` (both `COURSES_KEY` and `STORAGE_KEY`), `localStorage.getItem("golfVectorField.courses.v1")` is auto-created with `version:1` and `courses.length === 1` where `courses[0].holes.length === 18`, `courses[0].id` is a UUID string matching `/^[0-9a-f-]{36}$/i` or similar `xxxxxxxx-xxxx-xxxx...` length ≥24, and `courses[0].name` matches `/^[A-Z][a-z]+ [A-Z][a-z]+$/` (adjective + noun, e.g., `"Breezy Fairway"`). The course’s `name` is shown in the main menu’s first row.
- [ ] Main menu after first load shows **one button per course** inside `#course-list` (scrollable container). The first row’s play button is **two rows**: upper `span.course-name` contains the course `name` (e.g., `"Gentle Dunes"`) `700 13px`, lower `span.course-meta` contains **hole count + record** (e.g., `"9 holes\u2003Record: —"` when `bestTotal===null` or `"18 holes\u2003Record: 42"`) in smaller font `500 11px` `opacity:0.95`, with a **long space** (`\u2003`) between holes and `Record:` and **no dash ` — `** on the button. The play button is **not transparent** (`getComputedStyle(...).backgroundColor` is `rgb(46, 204, 113)` / `#2ecc71` opaque, not `rgba(...,0.28)`). The row also contains an adjacent export button (`⎙ Export` or `Export`) with `class="course-export-button"` **and** an adjacent delete button (`🗑 Delete` or `Delete`) with `class="course-delete-button"` (`background:#e74c3c` opaque). The list container has `overflow-y:auto` and `max-height` constrained so it scrolls when many courses exist (verified by adding 10 courses and checking `scrollHeight > clientHeight`).
- [ ] Clicking a course’s **play button** (not export) starts a new game on that course: `mainMenuVisible false`, `currentHoleIndex 0`, `holeAttempts 0`, `totalAttempts 0`, `activeCourse.id === clicked course.id`, `LEVELS` (or `activeCourse.holes`) length matches the course’s `holeCount` (3/9/18), `loadLevel(0)` uses that course’s tee/hole, bottom canvas shows grass, no initial reward menu, and `localStorage STORAGE_KEY` now contains `courseId` equal to the clicked course’s `id`. Reloading preserves `courseId` and resumes on same course’s hole.
- [ ] **Per-course record**: complete a course with `3` holes (via New Course → 3 holes, then play through, `totalAttempts` e.g., 12). After final-hole WIN, the course’s `bestTotal` becomes `12` in `COURSES_KEY` (`JSON.parse(localStorage.getItem(...)).courses.find(c=>c.id===courseId).bestTotal === 12`). Return to main menu via `End Run`, the course’s row now shows `Record: 12` (or `12` in text). Complete the same course again with `Total 15` → record stays `12` (not overwritten). Complete again with `Total 10` → record updates to `10`.
- [ ] **Export (main menu)**: click the export button beside a course → `navigator.clipboard.writeText` is called with a base64 string (verified via stub or by reading `await navigator.clipboard.readText()` in test, or by checking `window.__lastExported` if exposed). The base64 decodes via `atob` to JSON with `id`, `name`, `holes` (length 3/9/18), `seed`, `createdAt`. Simultaneously a toast element appears (`#toast` or `.toast`) with text `copied to clipboard` (case-insensitive) near bottom-center, then hides after ~2s.
- [ ] **Delete (main menu)**: each course row has a delete button (`course-delete-button` `🗑 Delete`) beside export; clicking it shows `confirm("Delete course \"<name>\"?")` and if confirmed removes the course from `courses`, `saveCourses()`, re-renders list (one fewer row, at least one course remains via auto-create if last deleted), and if the deleted course was the active run’s course, clears `STORAGE_KEY` progress. Cancel does nothing. The delete button is opaque red `background:#e74c3c` `border:#c0392b`.
- [ ] **Export (pause menu)**: start a game on any course, press `Escape` to open pause, the pause overlay shows `Resume`, `End Run`, and an additional `Export Course` button (`#pause-export-button`). Clicking it copies the **active course** (same base64 as main-menu export for that course) and shows the same toast, without closing pause or ending run.
- [ ] **New Course**: at bottom of main menu, button `New Course` (`#new-course-button`) is visible. Clicking it shows a choice UI with three buttons for `3`, `9`, `18` holes (e.g., `#new-course-choices` with `data-holes="3"` etc.) and a `Cancel`. Selecting `9` creates a new course with `holes.length===9`, random `id`/`name` (adjective+noun, different from existing), pushes to `courses`, persists, and the list now has `length+1` rows (new row visible, scrollable). `Cancel` hides the choice UI without creating a course.
- [ ] **Import Course**: at bottom of main menu, button `Import Course` (`#import-course-button`) is visible. Clicking it shows an input area (`#import-area` with `#import-input` and help text containing `Paste the string exported from another game`). Pasting a valid export string (previously exported base64) and clicking `Import` adds the course to the collection (with new UUID if duplicate `id` exists), saves, and the list grows by one with the imported course’s `name` visible. Pasting invalid base64 (`"not-base64"`) shows error text `Invalid course data` and does not add a course or crash.
- [ ] **Name generation**: each new course (via `New Course` 3/9/18) has a `name` matching `/^[A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+$/` where first word is from the wind/weather adjective list and second from the golf noun list (both lists ≥10 items, documented in `src/courses.js`). Two consecutive `New Course` calls produce different names (random, not hard-coded `"Course 1"`).
- [ ] **Persistence**: after creating a new `9`-hole course and reloading the page, `loadCourses()` restores the same number of courses with same `id`/`name`/`holes`/`bestTotal`. The `COURSES_KEY` payload is versioned and wrapped in `try/catch` (corrupt JSON → fallback to default course without throwing).
- [ ] **Storage keys**: `localStorage` contains `COURSES_KEY` (`golfVectorField.courses.v1`) with `version:1` and `courses` array, and `STORAGE_KEY` with `courseId` when a run is active. `HIGH_SCORE_KEY` may still exist for migration but is not the source of per-course records (main-menu record comes from `courses[].bestTotal`).
- [ ] No canvas-drawn main menu; main menu remains HTML overlay bounded to 16:9 per REQ-029, now with scrollable `course-list`. No external libraries beyond `three` for wind.

## Dependencies

- REQ-010 (level generation, now wrapped in `Course.holes`)
- REQ-027 (localStorage, extended for courses collection + `courseId` in progress)
- REQ-029 (main menu, now multi-course)
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
- `src/main.js` changes: on `init()` call `loadCourses()` to populate `courses` global, render `#course-list`, handle `course-play-button` click → `activeCourse=course; LEVELS=course.holes; loadLevel(0);` ; `maybeUpdateCourseRecord()` on final WIN updates `activeCourse.bestTotal` and `saveCourses()`.
- Toast helper: `function showToast(msg){ let t=document.getElementById('toast'); if(!t){ t=document.createElement('div'); t.id='toast'; document.getElementById('game-container').appendChild(t); } t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'), 2000); }`
- Export buttons: `course-export-button` click → `const b64=exportCourse(course); navigator.clipboard.writeText(b64).catch(()=>{ /* fallback textarea */ }); showToast('copied to clipboard');`
- Import UI: keep hidden until `Import Course` click, then show `#import-area`.

## File Paths

- `src/courses.js:1` (Course type, COURSES_KEY, generateCourse, randomName, loadCourses, saveCourses, exportCourse, importCourse)
- `src/levels.js:1` (generateLevels now supports variable count, used by generateCourse)
- `src/main.js:1` (courses collection, activeCourse, courseId in saveProgress/loadProgress, maybeUpdateCourseRecord, main-menu rendering, New/Import/Export handlers, toast)
- `index.html:1` (#main-menu-overlay now contains #course-list scrollable, New Course / Import Course buttons and import area, toast container)
- `style.css:1` (#course-list scrollable, course-row, export button, toast, new/import choice UI)
- `docs/requirements/REQ-031-course-collection.md:1` (this file)

