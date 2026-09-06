# 10 — Persistence, Courses & Menus

- **ID:** 10-persistence-and-menus
- **Supersedes:** REQ-027, REQ-028, REQ-029, REQ-031, REQ-032, REQ-030 (menu parts), REQ-011 (reset/clear part)
- **Type:** Functional + UI + Persistence
- **References:** `01-infrastructure.md` (no build), `02-canvas-system.md` (layout/overlay bounds), `08-level-generation.md` (levels), `09-rewards-and-progression.md` (win/progression), `07-modifiers.md` (supply), `05-input-and-states.md` (states/counters)

## 1. Storage Keys & Payload

- **Active-run**: `STORAGE_KEY="golfVectorField.progress.v1"` JSON `version:1` payload:
  ```js
  { version:1, courseId:string, currentHoleIndex:number, holeAttempts:number, totalAttempts:number,
    supply:{amplify, nullify, flip, freeShot}, maxAttempts:number, holeAttempts:number, attemptsLeft:number, areaUpgradeCount:number,
    isFreeShotActive:boolean, // whether next launch is free (armed via 4, golden glow)
    treasure:{x,y,radius,isCollected} | null, // current hole treasure state (one per hole near tree, see 08 §4 & 09 §3)
    // freeShots/bouncyBallCount/maxAttempts+5 legacy removed (kept for compat, always 0, trees always bounce per 04)
    sharpshooterCount?:number, rewardPending:boolean, rewardOffered:string[]|null,
    rewardRerolled:boolean, rewardMenuVisible:boolean, gameState:string, // may be 'GAME_OVER'
    modifiers:Array<{type,x,y,radius}>, aimAngle:number, savedAt:number }
  ```
  Transient `ball.pos/vel/isMoving/z/vz`, `gameState==="FLYING"` (resume always `AIMING` at tee unless `GAME_OVER` — see §7), `charging/charge`, `mousePos`, field grid not persisted; on resume ball at tee `vel=0` unless loading `GAME_OVER` (then show Game Over screen). Treasure `isCollected` restored for current hole; other holes' treasures are re-generated via `level.treasure` from `COURSES_KEY` and `isCollected` for future holes is `false`. All numbers clamped `≥0` on load; `maxAttempts` defaults `10` if missing (legacy `maxAttempts>10` kept but no reward increases); `supply.freeShot` defaults `0` if missing (new games start `{1,1,1,0}`); `isFreeShotActive` defaults `false`; `treasure` missing → regenerate via `generateTreasureForHole` (see `08` §4) as uncollected; `holeAttempts` defaults `0`; `attemptsLeft = max(0, maxAttempts - holeAttempts)` recomputed. Missing fields default `0/false/[]`; corrupt/`version!==1`/`courseId` missing in courses → treat as no save. Wrap in `try/catch`; quota/error fallback to new game.

- **Courses collection**: `COURSES_KEY="golfVectorField.courses.v1"` JSON `version:1` with `Course[]` per §2. Two keys only (plus legacy `HIGH_SCORE_KEY` for migration). Do not scatter others.

### Save triggers

- `handleLaunch` (free launches do **not** decrement `attemptsLeft` but still call `saveProgress()` after consuming `supply.freeShot` per `07` §5.2; counted launches decrement `attemptsLeft`) calls `saveProgress()`; also after `claimReward` (`Free Shot Supply +5` increases `supply.freeShot`), `rerollReward` (costs 1 counted attempt toward `maxAttempts`, never free), `placeModifier`/removal/drag, `toggleFreeShot` (`isFreeShotActive` via `4`), `collectTreasure` (`treasure.isCollected=true` + `rewardPending` per `09` §3, see `04` §6), `advanceHole`/`handleNextHole`/`loadLevel` (including hole-start `rewardPending` for holes >0 and fresh `treasure` uncollected), `maybeShowRewardMenu` when creating fresh `rewardOffered`, and on `GAME_OVER` trigger.

### Load & Resume — Auto-resume, no **Continue** button — Game Over handling

- On load `init()` checks `hasRestorableSave()` (valid JSON `version:1` + `courseId` exists in `courses`): if true it **auto-restores immediately** without showing main menu and without a Continue button; if false it shows main menu (splash) with staged courses list and Help, no Continue. There is **never** a `#continue-button` on the main menu (`document.getElementById('continue-button')===null`). Main menu never shows Continue under any circumstances; ongoing games are resumed automatically on page load/reload.
- Auto-restore: resolve `activeCourse = courses.find(c=>c.id===data.courseId)`, `LEVELS=activeCourse.holes`, restore all persisted fields (`maxAttempts`, `holeAttempts`, `attemptsLeft` recomputed, `supply` with `freeShot`, `isFreeShotActive`, `treasure.isCollected` for current hole), recompute `areaMultiplier` (no `bouncyRemaining` — trees always bounce), recreate field `createField(cols,rows,strength,seed,W,H)` then `setModifiers(modifiers)`, restore `level.treasure.isCollected` from saved `treasure` (or regenerate if missing) and hidden/visible accordingly, restore golden glow if `isFreeShotActive`, ball at tee `AIMING` (never `FLYING`/`WIN`) **unless** saved `gameState==='GAME_OVER'` — then set `gameState='GAME_OVER'`, show Game Over overlay (see §7) instead of `AIMING`, still hide main-menu overlay but bottom shows grass dimmed. If saved `rewardMenuVisible` and not Game Over, show reward menu. If saved `rewardPending` was true due to hole-start or treasure hit, `maybeShowRewardMenu` will show it after restore when `AIMING` (or immediately even in `FLYING` for treasure). If no save/corrupt, stay on main menu. `loadProgress()`/`hasRestorableSave()` handle validation; `maxAttempts` missing → `10`; `supply.freeShot` missing → `0`; `isFreeShotActive` missing → `false`; `treasure` missing → regenerated uncollected.

### Clear on abandon / new course start / Game Over

- `clearProgress() => localStorage.removeItem(STORAGE_KEY)` and reset run state to `currentHoleIndex=0, holeAttempts=0, totalAttempts=0, maxAttempts=10, supply={1,1,1,0}, isFreeShotActive=false, treasure uncollected for hole 1 (regenerated via `generateTreasureForHole`), areaUpgradeCount=0, rewardPending=false, rewardOffered=[], modifiers=[]…` and clear gold glow + hide treasure collected flag, without touching `COURSES_KEY`. Called on `resetGameAfterWin` (`R` in `WIN`/`GAME_COMPLETE`), `startNewGameFromMain` (course play), `endRun` (see §6) **and on `Game Over → Return to Main Menu`** (see §7). Only **full completion** updates `bestTotal` (see §5), `End Run` and `Game Over` do not. New games start with `0` `freeShot` (see `07` §6) and fresh uncollected treasure per hole.

## 2. Course Model `src/courses.js` — Staged Unlocking (3 → 6 → 9 → 18)

- `Course = { id:string (UUID v4 via crypto.randomUUID fallback), name:string ("Adjective Noun"), holes:Level[], holeCount:3|6|9|18, seed:number, createdAt:number, bestTotal:number|null, stage:number }`.
- `name` via two lists `ADJECTIVES` (≥10 wind/weather e.g. `Breezy,Gusty,Stormy,Misty,Blustery,Whispering,Howling,Calm,Sunny,Zephyr`) + `NOUNS` (≥10 golf e.g. `Fairway,Greens,Links,Meadow,Dunes,Valley,Hollow,Pines`) random `"Adjective Noun"` via `Math.random`.
- `holes` via `generateCourse(holeCount, seed, options?)` wrapping `generateLevels(seed,holeCount,{difficulty})` per `08-level-generation.md` (for `3` uniform `easy`; for `6`/`9`/`18` linear `easy→hard`).
- **Stages & Unlocking**: Stages are fixed ordered `STAGES = [3,6,9,18]`. Fresh player (no `COURSES_KEY`) starts with **only one course**: `3-hole easy` (`holeCount=3, difficulty='easy'`, unlocked). Next stage is **locked** until previous stage is **cleared** (`bestTotal !== null`, i.e. completed at least once). When a stage is cleared, the **next stage auto-generates** (if not already exists) via `generateCourse(nextHoleCount)` and `saveCourses()`. Example: clear `3` → auto-generates `6`; clear `6` → auto-generates `9`; clear `9` → auto-generates `18`. No manual “New Course” for new stage; auto-generation only. `isStageUnlocked(holeCount)` returns `true` if `holeCount===3` or previous stage's course `bestTotal !== null`.
- **Collection persistence**: `loadCourses()` at `init()` parses `COURSES_KEY`; on corrupt/missing/wrong version auto-create **only the 3-hole easy stage** (not 18) and `saveCourses()`. Migrates old saves that have arbitrary courses: if `COURSES_KEY` contains courses not matching staged model (e.g. multiple 18s, missing 3), it normalizes to staged order: keep first course per `holeCount` in `STAGES` order, discard extras, and fill missing unlocked stages up to current unlock point. Validate each course (`id` string, `name` string, `holes.length` `3|6|9|18`, each hole with `tee/hole/obstacles/field`); discard invalid with `console.warn`. Never allow empty array for fresh player — at least `3` exists. `saveCourses(courses)` on every mutation: stage unlock/generation, `bestTotal` improve, edit regenerate/replace via import, and stage delete is **not allowed** (delete removed; use Edit → Regenerate to replace).
- **Active-run binding**: `STORAGE_KEY` payload's `courseId` ties to a `Course.id`; on load verify it still exists and its stage is unlocked else treat as no saved run. `play` on a locked stage is disabled.

## 3. Main Menu and Pause Menu — Logically Separate Overlays

State `mainMenuVisible:boolean` for **Main Menu** (`#main-menu-overlay`) and `pauseMenuVisible:boolean` for **Pause Menu** (`#pause-overlay`) — **logically separate**, not two modes of one overlay. `isInLevelPause` is deprecated (kept for compat, mirrors `pauseMenuVisible`).

- **Main Menu** (`#main-menu-overlay`, over splash, no backdrop `background:transparent`): shown on fresh load **only when no restorable save exists**, after `End Run`/`Game Over` return, or when no run active; shows **staged courses list** (`#staged-course-list` with 3/6/9/18 rows) and **Help** as round `?` top-left (`#help-button.help-corner-button` `72×72` `border-radius:50%` `?`, double size), **never a Continue button** (`#continue-button` must not exist, `getElementById('continue-button')===null` under all circumstances). **Never `End Run`**, `New Game` hidden (staged auto-generate). Pressing `Help` shows help overlay (see §8). Ongoing games auto-resume (see §1) without Continue.

- **Pause Menu** (`#pause-overlay`, over playing field, with backdrop `background:rgba(0,0,0,0.55)`): **logically separate** from Main Menu, triggered **while in a level** (`activeCourse!==null`, regardless of `AIMING`/`CHARGING`/`FLYING`) by **`Escape` or `P` (`KeyP`)** — both work identically even in `FLYING` (freeze ball `pos`/`vel`). Pauses `updateBall` but `updateWindUniforms` still runs and field stays rendered dimmed behind backdrop. **Pause shows only `Continue` and `End Run` plus `Help` corner `?`** — **never the levels list** (no `#staged-course-list` inside pause). `Help` in pause is a separate button `#pause-help-button.help-corner-button` (also `?` top-left, `72×72` double size) that shows same help overlay. Pressing `Escape`/`P` again or clicking **Continue** simply hides `pauseOverlay`, and **resumes at exact paused state** (ball continues flight, no `loadProgress` re-parse).

DOM `index.html` (two separate overlays inside `#game-container`):
```html
<div id="main-menu-overlay" class="hidden">
  <button id="help-button" class="help-corner-button" title="Help">?</button>
  <div class="main-menu-content">
    <div id="main-menu-root">
      <button id="continue-button" class="main-menu-button hidden">Continue</button>
      <button id="new-game-button" class="main-menu-button hidden">New Game</button>
      <div id="staged-course-list" class="course-list"></div>
    </div>
    <div id="course-menu" class="hidden">...</div>
  </div>
</div>
<div id="pause-overlay" class="hidden">
  <button id="pause-help-button" class="help-corner-button" title="Help">?</button>
  <div class="pause-content">
    <button id="resume-button" class="main-menu-button">Continue</button>
    <button id="pause-end-run-button" class="main-menu-button" style="background:#e74c3c">End Run</button>
  </div>
</div>
<div id="help-overlay" class="hidden"><div class="help-card">…<button id="help-back-button">Back</button></div></div>
<div id="toast" class="hidden">copied to clipboard</div>
```
No `<h2>Golf Vector Field</h2>` inside overlay required; outside `#game-container` no `h1`/`#instructions`. Main menu and pause are **separate** overlays with separate state.

- CSS: `#main-menu-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:transparent;border-radius:8px;z-index:12}` `.with-backdrop{background:rgba(0,0,0,0.55)}` `.hidden{display:none}` `.main-menu-content{max-width:90%;max-height:90%;overflow:hidden;flex-direction:column;gap:14px;background:transparent}` `.main-menu-button{min-width:180px;padding:12px 28px;font:700 14px system-ui;background:#2ecc71;border:2px solid #27ae60;border-radius:8px;color:white}` (opaque, not `rgba(...,0.28)`). End Run red `background:#e74c3c` `border:1px solid #c0392b`.

- **Continue visibility**: main menu **never** shows Continue (`#continue-button` must be absent/null). Auto-resume handles saves (see §1). In pause, `Continue` (`#resume-button`) is visible because run active (pause Continue is `#resume-button`, not main-menu `#continue-button`). Course lookup failures are no-op.

- **Blocking**: while `mainMenuVisible===true` (any sub-view) `updateBall` frozen, `handleLaunch`/placement/drag/hotkeys ignored, `maybeShowRewardMenu` blocked, hotbar hidden. Legacy `WIN`/`rewardMenuVisible` take priority over pause open.

## 4. Main Menu — Unlocked Courses List + Edit per Stage (replaces New Game → Course Submenu)

- **Main menu root** (entry, over splash, `background:transparent`) now directly shows the **unlocked courses list** (not hidden behind `New Game`). `New Game` button is **removed** (courses auto-generate on stage clear; manual New Course via footer is removed). Root still has `Continue` (conditional) and `Help`, plus the stages list.
- **Stages list** `#staged-course-list` (inside `#main-menu-root`) bounded to canvas (`max-height: min(42vh,320px)`, `overflow-y:auto`, `display:flex; gap:8px`, `flex-direction:column`, `max-width:480px` so that course name + record text is fully visible without truncation, `.course-play-button` `min-width:260px` `padding:10px 16px` `overflow:visible`, `.course-name`/`.course-meta` `white-space:nowrap` `overflow:visible` `text-overflow:clip`). For each `holeCount` in `STAGES=[3,6,9,18]` in order:
  - If **locked** (`!isStageUnlocked(holeCount)`): row `.course-row.locked[data-holes="6"]` shows `🔒 6 Holes — Locked (clear 3 Holes)` disabled, no play/edit, `opacity 0.55`, `cursor not-allowed`. `Expand` not needed; locked rows are not playable even via direct `handleCoursePlay`.
  - If **unlocked**: row `.course-row[data-course-id][data-holes="3"]` with:
     - **Course play button** `.course-play-button` (opaque `background:#2ecc71` `border:2px solid #27ae60`, `flex:1; flex-direction:column; gap:2px`) showing `span.course-name` (`700 13px` white, course `name`) and `span.course-meta` (`500 11px` smaller) `"<holeCount> holes   Record: <best|—>"` (e.g. `"3 holes   Record: 12"` or `"6 holes   Record: —"`).
     - **Refresh button** `.course-refresh-button` to the right `flex:0 0 auto; padding:6px 12px; font:700 18px system-ui; background:#3498db; border:1px solid #2980b9; color:white; title="Regenerate course"` with **visible text exactly `↻` and `title="Regenerate course"`**. Clicking refresh **directly regenerates** the course: `confirm("Generate new ${holeCount}-hole course? This replaces the current one.")` → `newCourse = generateCourse(holeCount)` (for `3` always `easy`, for `6`/`9`/`18` linear `easy→hard`), replace `courses[idx]` where `idx` matches `holeCount` (keep same stage order), **preserve `bestTotal` from old course so regenerating does not lock previously unlocked next stages** (`newCourse.bestTotal = old.bestTotal`), `saveCourses()`, re-render list, `clearProgress()` if `activeCourseId` was that stage. No separate Export/Import menu; edit menu is removed.
    - Clicking the **play button** (not refresh) starts new run on that stage's course: same as before `activeCourse=course; LEVELS=course.holes; currentHoleIndex=0; holeAttempts=0; totalAttempts=0; maxAttempts=10; supply={1,1,1,0}; isFreeShotActive=false; loadLevel(0); gameState="AIMING"; mainMenuVisible=false; saveProgress(courseId)`.
  - The list is always in stage order `3,6,9,18` (locked ones at bottom). Fresh save: only `3` row unlocked with generated `3-easy` course; `6/9/18` locked. After `3` `bestTotal` becomes not-null, `6` auto-generates and becomes unlocked on next menu render (see §5).
- **Legacy `#course-menu` behind `New Game` is removed/hidden**: `New Game` button and `#course-menu` (including `#new-course-button`/`#import-course-button` footer) shall be `hidden` or removed; tests shall verify `document.getElementById('new-game-button')` is either hidden or not required, and `document.getElementById('course-menu')` is hidden. The unlocked list is now on root, not behind `New Game`.
- **Delete is removed**: per-row `🗑` delete is removed; only `Edit → Regenerate` replaces. `confirm("Delete course ...")` is no longer used for stages (edit regenerate handles replacement). `saveCourses` still handles `bestTotal` updates.

## 5. Best Score Per Course (replaces global `HIGH_SCORE_KEY`)

- `bestTotal` is `null` initially. On **full course completion** (`currentHoleIndex===course.holes.length-1 && WIN`), compare `totalAttempts` to `course.bestTotal`; if `null` or `<` then set and `saveCourses()`. Ties keep existing. No update on incomplete/`End Run`/quit. Legacy `HIGH_SCORE_KEY` may be kept for migration only (if `bestTotal===null` and legacy key exists, optionally assign to default course's `bestTotal`).

## 6. Export (Pause Menu Only) & Toast

- Encode `exportCourse(course) = btoa(JSON.stringify(course))` (whole course including `holes/field`; `bestTotal` may be excluded/reset to `null` on import if documented).
- In pause overlay (`#pause-overlay .pause-content` or inside `#main-menu-overlay.with-backdrop`) beside `Resume`/`End Run`, add `button#pause-export-button.course-export-button` (text `⎙ Export Course`/`Export` acceptable, visible). It exports `activeCourse` via `navigator.clipboard.writeText(base64)` or fallback `execCommand('copy')` via temporary textarea (`try/catch`). Show toast `#toast` near bottom-center of `#game-container` `text:"copied to clipboard"` (case-insensitive) `background:rgba(0,0,0,0.75); color:white; padding:8px 14px; border-radius:6px; position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:20` auto-hide `1800-2500ms`. Does not close pause or end run.

## 7. End Run + Game Over (max attempts)

- `function endRun(){ clearProgress(); currentHoleIndex=0; holeAttempts=0; totalAttempts=0; maxAttempts=10; supply={1,1,1,0}; isFreeShotActive=false; areaUpgradeCount=0; ...; modifiers=[]; syncModifiersToField(); clearFreeShotGlow(); mainMenuVisible=true; isInLevelPause=false; courseMenuVisible=false; helpVisible=false; /* no maybeUpdateHighScore */ }`
- Removes `STORAGE_KEY` only; preserves `COURSES_KEY`; `bestTotal` unchanged.
- **Game Over** (`gameState='GAME_OVER'` when `holeAttempts >= maxAttempts` counted attempts per `05`/`09`; free launches do not count): full-canvas dim `rgba(0,0,0,0.55)`, title `Game Over` `700 22px` white `stroke 5px` centered, subtitle `Hole N/M — Out of attempts` or `Attempts Left: 0`, single button `Return to Main Menu` (`#gameover-return-button` or `#continue-button` repurposed, opaque) centered. While `GAME_OVER`, `updateBall`/`handleLaunch`/modifiers (`1/2/3`/`4` toggle)/pause are blocked; only `Return to Main Menu` (click or `Escape`/`Enter`) is accepted. It does `clearProgress()` (same reset as `endRun` with `maxAttempts=10`, `supply {1,1,1,0}`, `isFreeShotActive=false`) and returns to entry main menu (`mainMenuVisible=true`, `isInLevelPause=false`, `gameState='AIMING'` after clear). No `Next`/`Continue` from Game Over; reload after Game Over shows entry with no `Continue` (run cleared). Also not saved as win — `bestTotal` unchanged.

## 8. Help Overlay (inside same main-menu overlay)

- Shown via `Help` in either entry or pause → hide `#main-menu-root`/`#course-menu`, show `#help-overlay` (`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:transparent; z-index:12`) while `mainMenuVisible===true` still on splash (entry) or on dimmed field with `with-backdrop` (pause). No `rgba(0,0,0,0.35)` full-screen dim; card provides legibility.
- **Card** `.help-card` inside is opaque scrollable: `max-width:90%; max-height:85%; width:min(420px,90%); overflow-y:auto; overscroll-behavior:contain; background:rgba(0,0,0,0.75)` (or `#222` opaque) `color:white; padding:16px 18px; border-radius:10px; flex-direction:column; gap:10px; scrollbar-width:thin`. Card background is opaque/semi-opaque (not `transparent`); `getComputedStyle(helpOverlay).backgroundColor==="rgba(0,0,0,0)"` (no backdrop), card itself provides contrast.
- **Content** (short, ≤400 words): Rules must contain `wind` + `hole`/`course` + `attempt`/`stroke`/`fewest`; controls must contain `arrow`/`aim` + `space`/`charge`/`shoot` + `click`/`place`; plus mention modifiers-before-shoot, `Free Shot` (`4` gold glow, next attempt free) + attempts tracking, per-course `bestTotal` saved. Controls list rows `Arrow keys — Aim`, `Space — Hold to charge, release to shoot`, `Click — Place modifier`, `Right-click — Remove`, `1/2/3/4` (including `4 Free Shot`), `H`, `R`, `Escape/P` pause (core three `Arrow/Space/Click` mandatory).
- **Back** `#help-back-button` text `Back` opaque; returns to root without side effects. Bounded to canvas; no page scroll. While help visible game is paused (same blocking as §3).

## Acceptance Criteria — Staged Unlocking (3→6→9→18)

- [ ] Fresh load: splash visible, `#loading-screen` black→hidden after decode, `localStorage` has `COURSES_KEY` with **only one `3`-hole easy course** (`id` UUID, `name` `"Adjective Noun"`, `holeCount 3, difficulty easy`), not `18`; when **no save** menu root **directly shows unlocked courses list** (`#staged-course-list` inside `#main-menu-root`): `3 Holes` row unlocked with play + `↻` refresh (not `✎`/`🗑`), `6/9/18` rows locked `🔒 6 Holes — Locked (clear 3 Holes)` etc., **no `#continue-button` exists** (`getElementById('continue-button')===null`), `End Run` never visible on entry; `New Game` button hidden/removed; buttons opaque and **wide enough that course name + `Record: —/N` text is fully visible without ellipsis** (`max-width 480px`, `course-play-button min-width 260px`, `overflow:visible`); help buttons `72×72` (double size); all bounding rects inside container. `loadCourses()` on corrupt/missing creates only `3-easy`.
- [ ] With `3` cleared (`bestTotal` not `null`): next load shows `3` and `6` unlocked ( `6` auto-generated `6` linear, `holeCount 6` ), `9/18` still locked. After clearing `6`, `9` unlocks auto-generated; after clearing `9`, `18` unlocks. `isStageUnlocked(6)` is `courses.find(c=>c.holeCount===3).bestTotal !== null`, etc. Clearing is via `maybeUpdateHighScore` on final hole `WIN`.
- [ ] Main menu unlocked list: scrollable `#course-list` shows `4` rows in order `3,6,9,18` with locked/unlocked states as above; unlocked rows have play button (two-row `course-name` + `course-meta` `X holes   Record: —/N`) + `↻` refresh button (`.course-refresh-button`, `title="Regenerate course"`, text `↻`); locked rows have no play/refresh, show `🔒`. Clicking play on unlocked stage starts new run on that stage's course (`activeCourse=course` per holeCount, `loadLevel(0)` etc., `saveProgress(courseId)`). `New Game`/`#course-menu` behind `New Game` is hidden/removed.
- [ ] Refresh per stage: clicking `↻` refresh on unlocked row directly regenerates: `confirm("Generate new 6-hole course? This replaces the current one.")` → `newCourse = generateCourse(holeCount)` (for `3` always `easy`, for `6/9/18` linear), replace `courses[idx]` where `holeCount` matches stage, **preserve `bestTotal` so previously unlocked next stages remain unlocked** (`newCourse.bestTotal = old.bestTotal`), `saveCourses()`, re-render list, `clearProgress()` if `activeCourseId` was that stage. Regenerating never locks a previously unlocked stage. No edit menu with Export/Import; only refresh.
- [ ] With save: **no Continue button**; page load **auto-resumes** directly into the ongoing game (main menu hidden, ball at tee `AIMING` or `GAME_OVER` screen if saved as such), no Continue click needed; reloading preserves `STORAGE_KEY` with `courseId` of that stage and auto-resumes again. Playing an unlocked stage still sets `STORAGE_KEY` correctly.
- [ ] `Escape`/`P` even in `FLYING` freezes ball, shows pause with backdrop and **only `Continue` + `End Run`** (plus `Help` round `?` top-left) — **never `New Game` and never the levels list** (`#staged-course-list` hidden when `isInLevelPause`); `Continue`/`Escape`/`P` unfreezes and ball continues; `End Run` clears `STORAGE_KEY`, restores entry menu over splash.
- [ ] Full course completion updates `bestTotal` for that stage's course (lower is better), ties keep, and **auto-generates next stage** if locked (e.g. clearing `3` with `bestTotal 12` creates `6` and `saveCourses()`; `isStageUnlocked(6)` becomes true). `End Run`/`Game Over` never updates `bestTotal` nor unlocks next stage. Help overlay still shows required keywords, is scrollable, card opaque, overlay transparent, Back returns to correct root.
- [ ] Reloading preserves `COURSES_KEY` staged courses per unlock order; `COURSES_KEY` always contains courses in `STAGES` order `[3,6,9,18]` for unlocked ones, locked stages not in array until unlocked.

## File Paths

- `src/main.js:1` (mainMenuVisible/isInLevelPause/courseMenuVisible/helpVisible, `hasRestorableSave`, `Continue`/`End Run`/`New Game`/`Help` handlers, `Escape`/`KeyP` even in `FLYING`, `clearProgress`, course play)
- `src/courses.js:1` (`COURSES_KEY`, `generateCourse`, `randomName`, `loadCourses`, `saveCourses`, `exportCourse`, `importCourse`)
- `src/storage.js:1` (optional helper for `STORAGE_KEY` save/load/clear)
- `index.html:1` (`#main-menu-overlay` + submenus + `#loading-screen` + `#toast`; no `h1`/`#instructions`/`#pause-overlay` legacy)
- `style.css:1` (overlay `transparent` vs `with-backdrop`, opaque buttons, scrollable `course-list`/`help-card`, toast, loading screen)
