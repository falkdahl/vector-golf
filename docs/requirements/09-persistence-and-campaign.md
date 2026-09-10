# 10 — Persistence, Courses, Menus & Campaign

- **ID:** 09-persistence-and-campaign
- **Supersedes: REQ-027, REQ-028, REQ-029, REQ-031, REQ-032, REQ-030 (menu parts), REQ-011, 12-campaign
- **Type:** Functional + UI + Persistence
- **References:** `01-infrastructure.md`, `02-canvas-system.md` (layout/overlay bounds), `07-level-generation.md` (levels), `08-rewards-and-progression.md` (win/progression), `06-wind-system.md` (supply), `05-input-and-states.md` (states/counters)

## 1. Storage Keys & Payload

- **Active-run:** `STORAGE_KEY="golfVectorField.progress.v1"` JSON `version:1` payload:
  ```js
  { version:1, courseId:string, currentHoleIndex:number, holeAttempts:number, totalAttempts:number,
    supply:{amplify, nullify, flip, rotate, freeShot}, maxAttempts:number, areaUpgradeCount:number,
    isFreeShotActive:boolean, // auto-armed when attemptsLeft<=1 && supply.freeShot>0, see 05 §4
    treasure:{x,y,radius,isCollected}|null, // current hole treasure state, see 07 §4 & 09 §3
    sharpshooterCount?:number, rewardPending:boolean, rewardOffered:string[]|null,
    rewardRerolled:boolean, rewardMenuVisible:boolean, rewardSeedCounter:number, // campaign deterministic, see §9
    campaignSeed:string|number, // see §8, persisted with courses but also in progress for determinism
    gameState:string, modifiers:Array<{type,x,y,radius}>, aimAngle:number, savedAt:number }
  ```
  Transient `ball.pos/vel`, `FLYING` (resume always `AIMING` unless `GAME_OVER`), `charging/charge`, `mousePos`, field grid not persisted; on resume ball at tee `vel=0` unless `GAME_OVER` then show Game Over screen. Treasure `isCollected` restored for current hole. All numbers clamped `≥0` on load; `maxAttempts` defaults `10` (legacy `>10` kept but never increased); `supply.freeShot` defaults `0`, `supply.rotate` defaults `1`; `isFreeShotActive` defaults `false`; `treasure` missing → regenerate uncollected; `holeAttempts` defaults `0`; `attemptsLeft = max(0, maxAttempts - holeAttempts)` recomputed, HUD `Attempts Left: X (+Y)`. Missing fields default `0/false/[]`; corrupt/`version!==1`/`courseId` missing in courses → treat as no save. Wrap in `try/catch`.

- **Campaign + Courses:** `COURSES_KEY="golfVectorField.courses.v1"` JSON `version:1` with `{version:1, campaignSeed:string|number, courses:Course[]}` (extends old `Course[]` only). Two keys only (plus legacy `HIGH_SCORE_KEY` for migration). `campaignSeed` is single deterministic seed for whole campaign (see §8); `loadCourses()` reads it if present else generates random (`crypto.randomUUID` or `Date.now()+rand`) and persists. `saveCourses(courses)` persists both. Retrievable via `getCampaignSeed()` exported from `src/courses.js`.

### Save triggers

- `handleLaunch` (free launches via auto-arm do not decrement `attemptsLeft` but still `saveProgress()` after consuming `freeShot`), `claimReward` (`Free Shot +5` or `Rotate +1` or `Area +20%`), `rerollReward` (costs 1 counted attempt, never free), `placeModifier`/removal/drag (including `rotate` via `4`), `collectTreasure`, `advanceHole`/`loadLevel` (including hole-start `rewardPending` and fresh `treasure`), `maybeShowRewardMenu` when creating fresh `rewardOffered`, and on `GAME_OVER`. `toggleFreeShot` via `4` removed (`4` is `rotate`).

### Load & Resume — Auto-resume, no Continue button

- On load `init()` checks `hasRestorableSave()` (valid JSON `version:1` + `courseId` exists in `courses`): if true auto-restores immediately without showing main menu and without Continue button; if false shows main menu (splash) with staged list and Help, no Continue. There is **never** a `#continue-button` on main menu. Main menu never shows Continue; ongoing games auto-resume on reload.
- Auto-restore: resolve `activeCourse`, `LEVELS=activeCourse.holes`, restore all persisted fields (`maxAttempts`, `holeAttempts`, `supply` with `rotate`/`freeShot`, `isFreeShotActive` via auto-arm only, `treasure.isCollected`, `areaMultiplier`, field `createField` then `setModifiers`, golden glow if `isFreeShotActive`), ball at tee `AIMING` (never `FLYING`/`WIN`) unless saved `GAME_OVER` then `GAME_OVER` overlay (still hide main-menu but bottom shows terrain dimmed). If saved `rewardPending`/`rewardMenuVisible` then show reward menu after restore. Missing fields defaults as above.
- `clearProgress() => localStorage.removeItem(STORAGE_KEY)` and reset run state to `currentHoleIndex=0, holeAttempts=0, totalAttempts=0, maxAttempts=10, supply={1,1,1,1,0}`, `isFreeShotActive=false`, treasure uncollected for hole 1, `areaUpgradeCount=0`, `rewardPending=false`, `rewardOffered=[]`, `modifiers=[]`, clear glow, without touching `COURSES_KEY`. Called on `resetGameAfterWin` (`R` in `WIN`), `startNewGameFromMain` (course play), `endRun` (see §6) and on `Game Over → Return to Main Menu` (see §6). Only full completion updates `bestTotal` (§5), `End Run`/`Game Over` do not. New games start with `1` `rotate` and `0` `freeShot` (HUD `Attempts Left: 10`) and fresh uncollected treasure.

## 2. Campaign Model — Deterministic Seed for All Generation

A **Campaign** is the collection of staged courses `STAGES=[3,6,9,18]` where each holeCount has exactly one course. A single `campaignSeed` (string/number) deterministically controls **all** generation:

1. `generateLevels` seed for each course's terrain/wind/trees/water/treasure (`seed = deriveCourseSeed(campaignSeed, holeCount)` via `hash(campaignSeed) ^ (holeCount * 0x9e3779b9)` or equivalent `mulberry32` derivation)
2. Course `name` (`Adjective Noun` via seeded RNG derived from `campaignSeed+holeCount`, not `Math.random`)
3. **All reward offers including re-rolls:** via seeded `mulberry32(hash(campaignSeed + rewardCounter))` where `rewardCounter` persisted as `rewardSeedCounter` in `STORAGE_KEY` and incremented once per `maybeShowRewardMenu` and once per `rerollReward`. `Math.random` shall NOT be used for rewards. Same `campaignSeed` + same play order → bit-identical holes + identical reward triples in identical order.

- **Fresh campaign** (no `COURSES_KEY` or corrupt): generate random `campaignSeed`, then `courses = [generateCourse(3, derive(Seed,3))]` only (3-easy unlocked); 6/9/18 not yet in array but generated deterministically on unlock using same `campaignSeed`. If implementation generates all 4 upfront, they may be stored but locked (`isStageUnlocked` gates play).
- **Determinism across reloads:** `loadCourses()` + `deriveCourseSeed` must be pure; loading same `campaignSeed` via manual input produces bit-identical `holes` and identical reward sequence (given `rewardSeedCounter` reset).

## 3. Course Model — Staged Unlocking (3 → 6 → 9 → 18)

- `Course = { id:string (UUID v4 via crypto.randomUUID fallback), name:string ("Adjective Noun"), holes:Level[], holeCount:3|6|9|18, seed:number, createdAt:number, bestTotal:number|null, stage:number }`.
- `name` via `ADJECTIVES` (≥10 wind/weather e.g. `Breezy,Gusty,Stormy,Misty`) + `NOUNS` (≥10 golf e.g. `Fairway,Greens,Links`) random `"Adjective Noun"` via seeded RNG (see §2, not `Math.random` after campaign). **Two courses in the same campaign shall not have the same name; if the deterministic name for a holeCount collides with an existing course name in that campaign, the next deterministic candidate shall be tried (incrementing the derivation attempt) and repeated until unique; this ensures all course names within a single `campaignSeed` are distinct and deterministic/reproducible.**
- `holes` via `generateCourse(holeCount, seed, options?)` wrapping `generateLevels(seed,holeCount,{difficulty})` per `07-level-generation.md` (for `3` uniform `easy`; for `6`/`9`/`18` linear `easy→hard`).
- **Stages & Unlocking:** fixed ordered `STAGES = [3,6,9,18]`. Fresh player starts with only one course `3-hole easy`. Next stage locked until previous stage cleared (`bestTotal !== null`). When cleared, next stage auto-generates if not exists via `generateCourse(nextHoleCount)` using `deriveCourseSeed(campaignSeed, nextHoleCount)` (not `Date.now()`, deterministic) and `saveCourses()`. `isStageUnlocked(holeCount)` returns `true` if `holeCount===3` or previous stage's course `bestTotal !== null`.
- **Collection persistence:** `loadCourses()` at `init()` parses `COURSES_KEY`; on corrupt/missing/wrong version auto-create only the `3-hole easy` stage and `saveCourses()`. Migrates old saves with arbitrary courses: normalize to staged order, keep first per `holeCount` in `STAGES` order, discard extras, fill missing unlocked stages up to unlock point. Validate each course; discard invalid with `console.warn`. Never empty for fresh player — at least `3` exists. `saveCourses(courses)` on every mutation: stage unlock/generation, `bestTotal` improve, campaign regeneration, and `ensureNextStageUnlocked`. Stage delete not allowed.
- **Active-run binding:** `STORAGE_KEY` `courseId` ties to `Course.id`; on load verify exists and stage unlocked else no save.

## 4. Seed Display with Edit Button

- Main menu (`#main-menu-overlay`, entry, `mainMenuVisible===true`) shall show current `campaignSeed` in lower right corner bounded to container:
  - Wrapper `#campaign-seed-wrapper` (`position:absolute; bottom:8px; right:10px; display:flex; gap:6px; z-index:13; max-width:50%`) containing `#campaign-seed-display` (`font:600 11px; color:rgba(255,255,255,0.92); background:rgba(0,0,0,0.35); padding:4px 8px; border-radius:6px; white-space:nowrap`) with text exactly `Seed: ${campaignSeed}` plus edit button `#campaign-seed-edit-button` (`26×26`, `font:700 14px; title="Edit seed"` text `✎` or `Edit`) immediately to right. Wrapper visible only when `mainMenuVisible===true` (hidden during `FLYING`/`WIN`/`pause`), managed via `syncCampaignSeedDisplay()`. Seed input boxes not visible in main menu itself (`#campaign-seed-input` hidden when popup not open). `getCampaignSeed()` exported for tests/`window.__getCampaignSeed`.

## 5. Regeneration — Whole Campaign Only via Edit Popup (Per-Course Refresh Removed)

- **Per-course `↻` `.course-refresh-button` shall NOT exist** (`document.querySelector('.course-refresh-button')===null`). No `confirm("Generate new ${holeCount}-hole course?")` per stage. Only campaign-level regeneration allowed (see §4 popup). This supersedes old `09-persistence-and-campaign.md` §4 per-course refresh which preserved `bestTotal`; campaign regeneration does NOT preserve `bestTotal` (resets to `null` for all) and resets `rewardSeedCounter`.
- **Seed input not in main menu:** `#campaign-seed-input` and `#campaign-seed-refresh` / `#campaign-seed-ok` shall NOT be visible as direct children of `#main-menu-root` / `#campaign-controls` in main menu; instead they live inside popup with backdrop.

**Edit popup with backdrop:**
- Clicking `#campaign-seed-edit-button` shows `#campaign-edit-overlay` (`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55); border-radius:8px; z-index:14`) with centered card `.campaign-edit-card` (`background:rgba(0,0,0,0.85); padding:18px 20px; border-radius:10px; width:min(360px,90%)`). Popup `hidden` by default; `Escape` or clicking backdrop or `Cancel` hides it. While popup visible, `campaignEditVisible===true`.
- Card contains **exactly**: title `Campaign Seed` (`h3` text `Campaign Seed`), row `#campaign-edit-row` with `<input id="campaign-seed-input" type="text" placeholder="Enter seed" maxlength="8" pattern="[0-9a-f]*" autocomplete="off" spellcheck="false" autocapitalize="off">` **pre-populated with current `campaignSeed`** when popup opens ( `input.value = getCampaignSeed()` on `showCampaignEditOverlay()` ), plus `<button id="campaign-seed-refresh" title="Refresh seed">↻</button>` **immediately to the right of the input** (icon-only, text `↻` or `⟳` or `↺`, no label), and below/next row `<button id="campaign-seed-ok">OK</button>` and `<button id="campaign-seed-cancel">Cancel</button>` (also aliased as `#campaign-seed-apply` → OK and `#campaign-edit-close` → Cancel for backward compat). Input `placeholder` contains `seed` case-insensitive. **Seed input box shall only accept characters `[0-9a-f]`** — typing `0-9` and `a-f` (lowercase hex) when `#campaign-seed-input` is focused must insert the character into the input value and must not be intercepted by game input handling (`ArrowLeft`/`KeyA`, `ArrowRight`/`KeyD`, `Space`, `KeyR`, `KeyH` etc. shall be ignored while the seed input has focus); characters outside `[0-9a-f]` (e.g. `g-z`, `G-Z`, symbols) shall be rejected/filtered and not appear in `input.value`. `maxlength="8"` enforces expected length, `pattern="[0-9a-f]*"` documents valid charset. IDs normative: `#campaign-seed-edit-button`, `#campaign-edit-overlay`, `#campaign-seed-input`, `#campaign-seed-refresh`, `#campaign-seed-ok`, `#campaign-seed-cancel`. Legacy aliases kept hidden but functional: `#campaign-seed-apply` (maps to OK), `#campaign-regenerate-button` (maps to refresh), `#campaign-edit-close` (maps to Cancel), `#campaign-edit-current-seed` (hidden, kept for compat, shows current seed if present). Backdrop `rgba(0,0,0,0.55)` distinguishes it.

- **Refresh button (icon only):** clicking `#campaign-seed-refresh` (or legacy `#campaign-regenerate-button`) shall **not** directly regenerate; instead it shows a **second warning popup** `#campaign-confirm-overlay` (also `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55); z-index:15`) with card `.campaign-confirm-card` containing warning text that includes `re-generate all levels` and `campaign progress will be lost` and `lose`+`progress`, plus `Confirm`/`Cancel` buttons (`#campaign-confirm-ok` and `#campaign-confirm-cancel` or generic). If user confirms → `campaignSeed = generateCampaignSeed()` new random, `courses = [generateCourse(3, derive(campaignSeed,3))]` (only 3 unlocked), `clearProgress()`, `saveCourses()`, hide both popups, seed display updates. If cancel → close warning only, seed unchanged, edit popup remains open. Legacy `confirm("Re-generating the seed will regenerate all levels and you will lose your progress. Continue?")` may still be called as fallback but warning overlay is primary.

- **Cancel button:** clicking `#campaign-seed-cancel` (or `#campaign-edit-close` or backdrop or `Escape`) shall **close the seed popup without any mutation**, no validation, no confirm, no regeneration. Warning overlay if open shall close as well only if Cancel on seed popup closes both.

- **OK button — validation and conditional warning:** clicking `#campaign-seed-ok` (or `#campaign-seed-apply` or pressing `Enter` in input) shall:
  1. Read `val = input.value.trim()`.
  2. Validate `val` matches `^[0-9a-f]+$` (only `0-9` and `a-f` hex, lower-case; uppercase is invalid, `g-z` is invalid) **and** length equals expected seed length (`8` characters, since `generateCampaignSeed()` returns `8` hex via `crypto.randomUUID().slice(0,8)`; `8` is normative; both lower-case 8-char hex). If invalid → **do not close**, show inline error (`#campaign-seed-error` or `toast` `Invalid seed`) and keep popup open; no `confirm`/warning, no regeneration.
  3. If valid and `val === currentCampaignSeed` → **simply close** the popup with no warning and no regeneration.
  4. If valid and `val !== currentCampaignSeed` → show the **same warning popup** as Refresh (`#campaign-confirm-overlay` with `re-generate all levels` + `campaign progress will be lost` / `lose`+`progress`). On confirm → `applyManualSeed(val)` (`campaignSeed = val`, `courses = [generateCourse(3, derive(val,3))]` only 3 unlocked, `clearProgress()`, `saveCourses()`, hide both popups). On cancel → close warning only, edit popup remains open with input preserved. Empty input rejected same as invalid (no confirm).

- Legacy direct `#campaign-regenerate-button`/`#campaign-seed-apply` flows still trigger same validation/warning via aliases so old tests using those IDs still pass.

## 6. Main Menu and Pause Menu — Logically Separate Overlays

State `mainMenuVisible:boolean` for **Main Menu** (`#main-menu-overlay`) and `pauseMenuVisible:boolean` for **Pause Menu** (`#pause-overlay`) — logically separate, not two modes of one overlay. `isInLevelPause` is deprecated (mirrors `pauseMenuVisible`).

- **Main Menu** (`#main-menu-overlay`, over splash, no backdrop `background:transparent`): shown on fresh load only when no restorable save exists, after `End Run`/`Game Over` return, or when no run active; shows **staged courses list** (`#staged-course-list` with 3/6/9/18 rows) and **Help** as round `?` top-left (`#help-button.help-corner-button` `72×72` `border-radius:50%` `?`), **never a Continue button** (`getElementById('continue-button')===null`). **Never `End Run`**, `New Game` hidden (staged auto-generate). Pressing `Help` shows help overlay (see §7). Ongoing games auto-resume without Continue.
- **Pause Menu** (`#pause-overlay`, over playing field, with backdrop `background:rgba(0,0,0,0.55)`): logically separate, triggered while in a level (`activeCourse!==null`, regardless of `AIMING`/`CHARGING`/`FLYING`) by **`Escape` or `P` (`KeyP`)** — both work identically even in `FLYING` (freeze `pos`/`vel`). Pauses `updateBall` but `updateWindUniforms` still runs and field stays rendered dimmed behind backdrop. **Pause shows `Continue`, `Reset Attempt` and `End Run` plus `Help` corner `?`** — never the levels list. `Help` in pause is `#pause-help-button`. Pressing `Escape`/`P` again or clicking `Continue` hides `pauseOverlay` and resumes at exact paused state (no `loadProgress` re-parse). **`Reset Attempt` button (`#pause-reset-attempt-button`) is placed between `Continue` and `End Run` (order: `Continue` → `Reset Attempt` → `End Run` vertically in `.pause-content`) and when clicked has the same effect as hitting the `R` hotkey (see `05-input-and-states.md` §5: `AIMING`/`FLYING` → `resetBall()` except on last attempt flight where `R` disabled and must play out; `WIN`/`GAME_OVER` → `clearProgress()` → entry menu; `rewardMenuVisible` → `R` is re-roll, not reset — pause never shows `Reset Attempt` while `rewardMenuVisible`/`WIN`/`GAME_OVER` as pause cannot be opened in those states; while pause is open `R` handling is blocked, the button replicates the `R` effect by first closing the pause overlay then performing the `R` logic, so the visible result is ball at tee `AIMING` and `pauseOverlay` hidden).**

DOM `index.html` (two separate overlays inside `#game-container`):
```html
<div id="main-menu-overlay" class="hidden">
  <button id="help-button" class="help-corner-button" title="Help">?</button>
  <div id="campaign-seed-wrapper" class="hidden">
    <div id="campaign-seed-display">Seed: -</div>
    <button id="campaign-seed-edit-button" title="Edit seed">✎</button>
  </div>
  <div class="main-menu-content">
    <div id="main-menu-root">
      <div id="staged-course-list" class="course-list"></div>
    </div>
  </div>
</div>
<div id="pause-overlay" class="hidden">
  <button id="pause-help-button" class="help-corner-button" title="Help">?</button>
  <div class="pause-content">
    <button id="resume-button" class="main-menu-button">Continue</button>
    <button id="pause-reset-attempt-button" class="main-menu-button">Reset Attempt</button>
    <button id="pause-end-run-button" class="main-menu-button" style="background:#e74c3c">End Run</button>
  </div>
</div>
<div id="help-overlay" class="hidden"><div class="help-card">…<button id="help-back-button">Back</button></div></div>
<div id="toast" class="hidden">copied to clipboard</div>
```

- CSS: `#main-menu-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:transparent;border-radius:8px;z-index:12}` `.with-backdrop{background:rgba(0,0,0,0.55)}` `.hidden{display:none}` etc. End Run red `background:#e74c3c`.
- **Continue visibility:** main menu never shows Continue (`#continue-button` absent/null). Auto-resume handles saves. In pause, `Continue` (`#resume-button`) visible because run active.
- **Blocking:** while `mainMenuVisible===true` `updateBall` frozen, `handleLaunch`/placement/drag/hotkeys ignored, `maybeShowRewardMenu` blocked, hotbar hidden. `WIN`/`rewardMenuVisible` take priority over pause open.

### Main Menu — Unlocked Courses List

- **Stages list** `#staged-course-list` (inside `#main-menu-root`) bounded to canvas (`max-height: min(42vh,320px)`, `overflow-y:auto`, `display:flex; gap:8px`, `flex-direction:column`, `max-width:480px`, `.course-play-button` `min-width:260px` `overflow:visible`, `.course-name`/`.course-meta` `white-space:nowrap` `overflow:visible`). For each `holeCount` in `STAGES=[3,6,9,18]` in order:
  - If **locked** (`!isStageUnlocked(holeCount)`): row `.course-row.locked[data-holes="6"]` shows `🔒 6 Holes — Locked (clear 3 Holes)` disabled, no play, `opacity 0.55`, `cursor not-allowed`.
  - If **unlocked**: row `.course-row[data-course-id][data-holes="3"]` with course play button `.course-play-button` (opaque `background:#2ecc71` `border:2px solid #27ae60`, `flex:1; flex-direction:column; gap:2px`) showing `span.course-name` (`700 13px` white) and `span.course-meta` (`500 11px`) `"<holeCount> holes   Record: <best|—>"`. Clicking play starts new run on that stage's course: `activeCourse=course; LEVELS=course.holes; currentHoleIndex=0; holeAttempts=0; totalAttempts=0; maxAttempts=10; supply={1,1,1,1,0}; isFreeShotActive=false; loadLevel(0); gameState="AIMING"; mainMenuVisible=false; saveProgress(courseId)`.
  - List always in stage order `3,6,9,18`. Fresh save: only `3` unlocked; 6/9/18 locked. After `3` `bestTotal` not-null, `6` auto-generates and becomes unlocked on next menu render.
- Legacy `#course-menu` behind `New Game` is removed/hidden; `New Game` button hidden; tests verify `getElementById('new-game-button')` hidden or not required, and `getElementById('course-menu')` hidden. Delete `🗑` removed.

## 5. Best Score Per Course

- `bestTotal` is `null` initially. On full course completion (`currentHoleIndex===course.holes.length-1 && WIN`), compare `totalAttempts` to `course.bestTotal`; if `null` or `<` then set and `saveCourses()`. Ties keep existing. No update on incomplete/`End Run`/quit. Legacy `HIGH_SCORE_KEY` kept for migration only.
- Auto-generate next stage if this stage was just cleared (or already cleared) using deterministic `deriveCourseSeed` (§3).

## 6. Export (Pause Menu Only) & Toast

- Encode `exportCourse(course) = btoa(JSON.stringify(course))` (whole course including `holes/field`; `bestTotal` may be excluded/reset to `null` on import if documented).
- In pause overlay beside `Resume`/`End Run`, add `button#pause-export-button.course-export-button` (text `⎙ Export Course`/`Export` acceptable, visible). It exports `activeCourse` via `navigator.clipboard.writeText(base64)` or fallback `execCommand('copy')` via textarea. Show toast `#toast` near bottom-center `text:"copied to clipboard"` `background:rgba(0,0,0,0.75); color:white; padding:8px 14px; border-radius:6px; position:absolute; bottom:20px; left:50%; transform:translateX(-50%); z-index:20` auto-hide `1800-2500ms`. Does not close pause or end run.

## 7. End Run + Game Over

- `function endRun(){ clearProgress(); currentHoleIndex=0; holeAttempts=0; totalAttempts=0; maxAttempts=10; supply={1,1,1,1,0}; isFreeShotActive=false; areaUpgradeCount=0; modifiers=[]; syncModifiersToField(); clearFreeShotGlow(); mainMenuVisible=true; isInLevelPause=false; courseMenuVisible=false; helpVisible=false; }`
- Removes `STORAGE_KEY` only; preserves `COURSES_KEY`; `bestTotal` unchanged.
- **Game Over** — canonical state machine in `05-input-and-states.md` §5. This file defines only persistence consequence: `GAME_OVER` does `clearProgress()` and returns to entry main menu (`mainMenuVisible=true`, `isInLevelPause=false`, `gameState='AIMING'` after clear). No other button; reload after `GAME_OVER` shows entry with no active game. Not saved as win — `bestTotal` unchanged. `R` on `Course Completed!` Victory or `Game Over` both clear progress and return to main menu.

## 8. Help Overlay

- Shown via `Help` in either entry or pause → hide `#main-menu-root`/`#course-menu`, show `#help-overlay` (`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:transparent; z-index:12`) while `mainMenuVisible===true` still on splash or on dimmed field with `with-backdrop`. Card provides legibility.
- **Card** `.help-card` inside is opaque scrollable: `max-width:90%; max-height:85%; width:min(420px,90%); overflow-y:auto; overscroll-behavior:contain; background:rgba(0,0,0,0.75)` `color:white; padding:16px 18px; border-radius:10px`. Overlay `background:transparent`, card provides contrast.
- **Content:** sacred-links lore verbatim followed by control scheme. Lore normative:
  ```
  Welcome to the sacred links of Mt. Aeolus, the windiest peak on Earth, where the pompous Ancient Order of Golfing Purists holds its most ridiculous tradition.

  Legend says the club’s founding blowhard declared on his deathbed that "putting is for cowards," decreeing that every hole must be aced straight from the tee in gale-force winds to prove true mastery. If you fail to land the shot in 10 attempts, the Grand Marshal revokes your membership, confiscates your pants, and hurls you into the stormy abyss via giant catapult.

  To override the tempest, you rely on the Pocket-Atmosphere Overrider—a shady gadget you bought off a disgraced former caddie behind a dumpster.

  By tossing down micro-sized zone emitters anywhere on the course, you can instantly amplify, completely nullify, or violently flip the wind direction inside a tiny bubble. The Purists scoff at these pocket-sized weather crimes, but as long as you disguise the devices as mundane turf repair tees, the Grand Marshal just assumes you're calling upon the mystical gods of aerodynamics.
  ```
  Rules keywords: `wind`+`hole`/`course`+`attempt` (`wind` in lore, `hole`/`course` in “every hole…anywhere on the course”, `10 attempts`); controls must contain `arrow`/`aim` + `space`/`charge`/`shoot` + `click`/`place`; plus modifiers-before-shoot, `Rotate` (`4` `↻`) and `Free Shot` passive `Attempts Left: X (+Y)` gold glow (no hotkey) mentioned, per-course `bestTotal` saved via lore context. Controls list rows `Arrow keys — Aim`, `Space — Hold to charge, release to shoot`, `Click — Place modifier`, `Right-click — Remove`, `1 / 2 / 3 / 4 — Select Amplify / Nullify / Flip / Rotate`, `Attempts Left (+Y)` — free shots shown after attempts, `H`, `R`, `Escape/P` pause (core three `Arrow/Space/Click` mandatory) must follow lore in same `.help-card`.
- **Back** `#help-back-button` text `Back` opaque; returns to root without side effects. Bounded to canvas; while help visible game paused (same blocking as §6).

## 9. Deterministic Rewards Including Re-rolls

- Replace `Math.random` in `shuffleArray` for `REWARD_POOL` with seeded `mulberry32(hash(campaignSeed + rewardCounter))` where `rewardCounter` is persisted as `rewardSeedCounter` in `STORAGE_KEY` and incremented once per `maybeShowRewardMenu` creation and once per `rerollReward` replacement. `loadProgress` restores it; new campaign resets to `0`. `saveProgress` persists it.
- Example deterministic shuffle:
  ```js
  function seededShuffle(array, seed) {
    const rand = mulberry32(hashSeed(seed));
    for (let i=array.length-1;i>0;i--) { const j=Math.floor(rand()*(i+1)); [array[i],array[j]]=[array[j],array[i]]; }
    return array;
  }
  // maybeShowRewardMenu: rewardOffered = seededShuffle([...POOL], campaignSeed + ':' + rewardCounter++).slice(0,3)
  // rerollReward:      rewardOffered = seededShuffle([...POOL], campaignSeed + ':reroll:' + rewardCounter++).slice(0,3)
  ```
  Any deterministic derivation is acceptable if pure in `campaignSeed` and sequential and reproducible per seed and does not use `Math.random` or `Date.now` for rewards. Tests verify: two fresh campaigns with same manual seed yield identical first reward triple for hole 2 hole-start, and identical reroll triple.

## Acceptance Criteria — Staged Unlocking (3→6→9→18) & Campaign

- [ ] Fresh load: splash visible, `#loading-screen` black→hidden after decode, `localStorage` has `COURSES_KEY` with `campaignSeed` and only one `3-hole easy` course (`id` UUID, `name` `"Adjective Noun"`, `holeCount 3`), not `18`; when no save menu root directly shows unlocked courses list (`#staged-course-list` inside `#main-menu-root`): `3 Holes` row unlocked (no `✎`/`🗑`/refresh), `6/9/18` rows locked `🔒 6 Holes — Locked (clear 3 Holes)` etc., no `#continue-button` exists, `End Run` never visible on entry; `New Game` hidden; buttons opaque and wide enough that `Record: —/N` fully visible; help buttons `72×72`; all bounding rects inside container. `loadCourses()` on corrupt/missing creates only `3-easy` with new `campaignSeed`.
- [ ] With `3` cleared (`bestTotal` not `null`): next load shows `3` and `6` unlocked (`6` auto-generated deterministically via `deriveCourseSeed(campaignSeed,6)`), `9/18` still locked. After clearing `6`, `9` unlocks deterministically; after clearing `9`, `18` unlocks. `isStageUnlocked(6)` is `courses.find(c=>c.holeCount===3).bestTotal !== null`.
- [ ] Main menu unlocked list: scrollable shows `4` rows in order `3,6,9,18` with locked/unlocked as above; unlocked rows have play button (two-row `course-name` + `course-meta` `X holes   Record: —/N`); locked rows have no play, show `🔒`. Clicking play on unlocked stage starts new run on that stage's course (`loadLevel(0)` etc., `saveProgress(courseId)`). `New Game`/`#course-menu` behind `New Game` is hidden/removed.
- [ ] Per-course `↻` refresh does NOT exist (`querySelector('.course-refresh-button')===null`); no per-course confirm. Seed input not in main menu; `#campaign-seed-wrapper` lower right with `Seed: ${campaignSeed}` and edit button `✎` visible in main menu (`right` within `50px`, `bottom` within `30px`); edit popup with backdrop and card containing title `Campaign Seed`, `#campaign-seed-input` pre-populated with current seed (`input.value === getCampaignSeed()` on open), `#campaign-seed-refresh` icon-only `↻` immediately next to input, `#campaign-seed-ok` (`OK`) and `#campaign-seed-cancel` (`Cancel`) (aliases `#campaign-seed-apply`, `#campaign-regenerate-button`, `#campaign-edit-close` still functional hidden), shown on edit click, hidden on `Escape`/backdrop/`Cancel`.
- [ ] Clicking `#campaign-seed-refresh` (icon only) inside seed popup shows **second warning popup** `#campaign-confirm-overlay` with text containing `re-generate all levels` and `campaign progress will be lost` and `lose`+`progress`; cancel keeps old `campaignSeed` and leaves seed popup open; confirm via `#campaign-confirm-ok` generates new `campaignSeed !== old`, `courses` now has `3` only (or 3 unlocked and 6/9/18 locked), `isStageUnlocked(6)===false`, `STORAGE_KEY` cleared, seed display updates and both popups hide. Legacy `#campaign-regenerate-button` alias behaves identically.
- [ ] Pressing `Cancel` (`#campaign-seed-cancel`/`#campaign-edit-close`/backdrop/`Escape`) closes seed popup with **no mutation**, no validation, no warning, seed unchanged. Pressing `OK` (`#campaign-seed-ok`/`#campaign-seed-apply`/Enter) validates `^[0-9a-f]{8}$` (only `0-9`/`a-f` hex, length `8`): if invalid → popup stays open, error shown, no warning/no regeneration; if valid and same as current → simply closes with no warning; if valid and changed → shows same second warning popup as refresh (`re-generate all levels` + `lose`+`progress`); cancel keeps old seed, confirm regenerates with that seed. Entering identical valid 8-char hex seed via popup on two fresh storages yields bit-identical `courses[0].holes[0].tee`/`hole`/`field.seed` and identical reward offer for hole 2. Trimming handled.
- [ ] Seed input box `#campaign-seed-input` shall only accept characters `[0-9a-f]`: when the input is focused, typing `a`–`f` and `0`–`9` must insert the character into `input.value` (e.g. typing `a` then `f` then `0` then `9` results in `input.value` containing those chars), while typing `g`–`z`/`G`–`Z`/symbols must be rejected/filtered and not appear in `input.value`; game key handling for `KeyA`/`KeyD`/`KeyH`/`KeyR`/`ArrowLeft`/`ArrowRight`/`Space` must be suppressed while the seed input has focus for valid hex chars; the input shall have `maxlength="8"` and `pattern="[0-9a-f]*"` (and `autocomplete="off" spellcheck="false" autocapitalize="off"`), and must not block valid hex characters via `preventDefault`.
- [ ] Course names within a campaign are unique: for any `campaignSeed`, the staged courses `3,6,9,18` (when all unlocked) have distinct `name` values; if the primary deterministic name for a holeCount would collide with an existing course name in that campaign, the next deterministic candidate shall be tried (incrementing the derivation) and repeated until unique; this is deterministic and reproducible, and `loadCourses()` shall repair existing campaigns that contain duplicate names by re-rolling colliding names deterministically.
- [ ] Rewards determinism: with manual seed `test-seed-1`, play hole 1 → advance to hole 2 triggers `maybeShowRewardMenu` with triple `A`; reload fresh with same seed and same path yields identical triple `A`; calling `rerollReward()` yields deterministic triple `B` identical across both runs; `Math.random` not used.
- [ ] After campaign regeneration only `3` unlocked: `courses.find(c=>c.holeCount===3).bestTotal===null` and `isStageUnlocked(6)===false` immediately after regenerate; advancing and winning 3 unlocks 6 deterministically (seed equals `deriveCourseSeed(newSeed,6)`).
- [ ] Old saves without `campaignSeed` migrate: load shows seed display with generated seed, `courses` preserved (no data loss), and next unlock uses new seed deterministically; or fresh regeneration works.
- [ ] With save: no Continue button; page load auto-resumes directly into ongoing game (main menu hidden, ball at tee `AIMING` or `GAME_OVER`), no Continue click needed; reloading preserves `STORAGE_KEY` with `courseId` and auto-resumes again.
- [ ] `Escape`/`P` even in `FLYING` freezes ball, shows pause with backdrop and `Continue` + `Reset Attempt` + `End Run` (in that vertical order) plus `Help` round `?` top-left — never `New Game` and never the levels list; `Continue`/`Escape`/`P` unfreezes and ball continues; `Reset Attempt` (`#pause-reset-attempt-button` between Continue and End Run) has same effect as hitting `R` (resetBall except on last attempt flight where disabled, otherwise same branching including `WIN`/`GAME_OVER` handling via closing pause then performing `R` logic); `End Run` clears `STORAGE_KEY`, restores entry menu over splash. `document.getElementById('pause-reset-attempt-button')` exists and is between `resume-button` and `pause-end-run-button` in DOM order.
- [ ] Full course completion updates `bestTotal` for that stage's course (lower is better), ties keep, and auto-generates next stage if locked; `End Run`/`Game Over` never updates `bestTotal` nor unlocks next stage. Help overlay shows required keywords, is scrollable, card opaque, overlay transparent, Back returns to correct root.

## File Paths

- `src/main.js:1` (mainMenuVisible/isInLevelPause/courseMenuVisible/helpVisible, `hasRestorableSave`, `Continue`/`End Run`/`Help` handlers, `Escape`/`KeyP` even in `FLYING`, `clearProgress`, course play, `campaignEditVisible`, `syncCampaignSeedDisplay`)
- `src/courses.js:1` (`COURSES_KEY`, `CAMPAIGN_SEED`, `campaignSeed`, `getCampaignSeed`, `deriveCourseSeed`, `generateCampaign`, `loadCourses` with `campaignSeed` persistence, `regenerateCampaign`, `applyManualSeed`)
- `src/storage.js:1` (optional helper for `STORAGE_KEY` save/load/clear)
- `index.html:1` (`#main-menu-overlay` + `#campaign-seed-wrapper` + `#campaign-edit-overlay` with inputs, `#pause-overlay`, `#help-overlay`, `#loading-screen`, `#toast`; no `h1`/`#instructions`)
- `style.css:1` (overlay `transparent` vs `with-backdrop`, opaque buttons, scrollable `course-list`/`help-card`, toast, loading screen, `#campaign-seed-wrapper` lower right, `#campaign-edit-overlay` backdrop)
