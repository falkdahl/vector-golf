# 12 — Campaign Seed (Deterministic Campaign, Seed Display & Regeneration)

- **ID:** 12-campaign
- **Supersedes:** REQ-031 staged generation seed parts (10-persistence-and-menus.md §2/§4 refresh per stage), 09-rewards random parts for determinism
- **Type:** Functional / UI / Persistence
- **References:** `08-level-generation.md` (level gen), `09-rewards-and-progression.md` (rewards), `10-persistence-and-menus.md` (courses, menus), `06-wind-system.md` (field determinism), `02-canvas-system.md` (layout)

## 1. Campaign Model

- A **Campaign** is the collection of staged courses `STAGES=[3,6,9,18]` where each holeCount has exactly one course. A single **campaignSeed** (string or 32-bit integer, stored as string/number) deterministically controls **all** generation in the campaign:
  1. `generateLevels` seed for each course's terrain/wind/trees/water/treasure (`seed = deriveCourseSeed(campaignSeed, holeCount)` via `hash(campaignSeed) ^ (holeCount * 0x9e3779b9)` or equivalent deterministic `mulberry32` derivation)
  2. Course `name` (`Adjective Noun` via seeded RNG derived from `campaignSeed+holeCount`, not `Math.random`)
  3. **All reward offers including re-rolls**: `maybeShowRewardMenu` and `rerollReward` pick `3 distinct from POOL` via deterministic `shuffle` using a seeded PRNG derived from `campaignSeed + rewardCounter` (global sequential counter persisted in `STORAGE_KEY` as `rewardSeedCounter` or `campaignSeed + holeIndex/trigger` derivation). `Math.random` shall **not** be used for reward offers; reroll is the next deterministic permutation from the same sequence. Same `campaignSeed` + same play order → bit-identical holes + identical reward triples in identical order (including re-roll replacements), enabling iterative best-path search.

- **Storage**: `COURSES_KEY="golfVectorField.courses.v1"` payload becomes `{version:1, campaignSeed:string|number, courses:Course[]}` (extends 10 §1). `loadCourses()` reads `campaignSeed` if present else generates a new random `campaignSeed` (`crypto.randomUUID` or `Date.now()+rand`, string) and persists it with the courses. `saveCourses(courses)` persists both. A separate `CAMPAIGN_SEED_KEY` is also acceptable if documented, but the seed shall be retrievable via `getCampaignSeed()` exported from `src/courses.js`.

- **Fresh campaign** (no `COURSES_KEY` or corrupt): generate random `campaignSeed`, then `courses = [generateCourse(3, derive(Seed,3))]` only (3-easy unlocked); 6/9/18 not yet in array but will be generated deterministically on unlock using same `campaignSeed`. If implementation generates all 4 upfront, they may be stored but locked (`isStageUnlocked` gates play).

- **Determinism across reloads**: `loadCourses()` + `deriveCourseSeed` must be pure; loading same `campaignSeed` (via manual input) produces bit-identical `holes` (tee/hole/obstacles/water/treasure/field seed/positions) and identical reward sequence (given `rewardSeedCounter` reset).

## 2. Seed Display with Edit Button

- Main menu (`#main-menu-overlay`, entry, `mainMenuVisible===true`) shall show the current `campaignSeed` in the **lower right corner** bounded to container:
  - Wrapper `#campaign-seed-wrapper` (`position:absolute; bottom:8px; right:10px; display:flex; gap:6px; z-index:13; max-width:50%`) containing `#campaign-seed-display` (`font:600 11px system-ui; color:rgba(255,255,255,0.92); background:rgba(0,0,0,0.35); padding:4px 8px; border-radius:6px; white-space:nowrap`) with text exactly `Seed: ${campaignSeed}` (case-sensitive `Seed:` prefix) plus an **edit button** `#campaign-seed-edit-button` (`width:26px; height:26px; font:700 14px; title="Edit seed"` text `✎` or `Edit` acceptable) immediately to the right of the display inside the same wrapper. The wrapper is visible **only** when `mainMenuVisible===true` (hidden during `FLYING`/`WIN`/`pause`), managed via `syncMainMenu()`/`syncCampaignSeedDisplay()`. The seed input boxes shall **not** be visible in the main menu itself (`#campaign-seed-input` hidden when popup not open). `getCampaignSeed()` exported for tests/`window.__getCampaignSeed`.

## 3. Regeneration — Whole Campaign Only via Edit Popup

- **Per-course regenerate is removed**: The per-row `↻` `.course-refresh-button` (10 §4) shall **not exist** (`document.querySelector('.course-refresh-button')===null` and `getElementById` per row absent). No `confirm("Generate new ${holeCount}-hole course?")` per stage. Only campaign-level regeneration is allowed.

- **Seed input not in main menu**: `#campaign-seed-input` and `#campaign-regenerate-button` / `#campaign-seed-apply` shall **not** be visible as direct children of `#main-menu-root` / `#campaign-controls` in the main menu (`document.querySelector('#main-menu-root #campaign-seed-input')===null` or hidden). Instead they live inside a **popup with backdrop**.

- **Edit popup with backdrop**:
  - Clicking `#campaign-seed-edit-button` (next to seed in lower right) shows `#campaign-edit-overlay` (`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55); border-radius:8px; z-index:14`) with centered card `.campaign-edit-card` (`background:rgba(0,0,0,0.85); padding:18px 20px; border-radius:10px; width:min(360px,90%)`). The popup is `hidden` by default and `classList.remove('hidden')` when edit clicked; `Escape` or clicking the backdrop (`#campaign-edit-overlay` background) or `Close` button hides it. While popup visible, `campaignEditVisible===true`.
  - Card contains: title `Campaign Seed` (or `Edit Campaign Seed`), current seed line `Current seed: <span id="campaign-edit-current-seed">`, row `#campaign-edit-row` with `<input id="campaign-seed-input" type="text" placeholder="Enter seed">` + `<button id="campaign-seed-apply">Apply Seed</button>`, plus `<button id="campaign-regenerate-button">Re-generate Seed</button>` (label must contain `Seed` or `Re-generate`/`Regenerate`) and `<button id="campaign-edit-close">Close</button>`. Input placeholder contains `seed` case-insensitive. Apply button text contains `Apply` + `Seed`. Regenerate button is inside the popup, not in main menu.
  - IDs normative (must exist in DOM): `#campaign-seed-edit-button`, `#campaign-edit-overlay`, `#campaign-edit-current-seed`, `#campaign-seed-input`, `#campaign-seed-apply`, `#campaign-regenerate-button`, `#campaign-edit-close`. The popup backdrop (`#campaign-edit-overlay` background `rgba(0,0,0,0.55)`) distinguishes it.

- **Regenerate Seed (random)**:
  - Clicking `#campaign-regenerate-button` shall `confirm("Re-generating the seed will regenerate all levels and you will lose your progress. Continue?")` (must contain `lose`+`progress` and `regenerate`+`seed`|`campaign` case-insensitive, exact phrase recommended). If user cancels (`confirm` returns false) → no mutation.
  - If confirmed → `campaignSeed = generateCampaignSeed()` (new random), `courses = [generateCourse(3, derive(campaignSeed,3))]` (or full 4 but only 3 unlocked), `bestTotal` for all cleared (`null`), staged unlock reset so only `isStageUnlocked(3)===true`, `isStageUnlocked(6)===false` etc., `clearProgress()` (remove `STORAGE_KEY`), `saveCourses(courses)` with new `campaignSeed`, `renderCourseList()`, `renderSeedDisplay()`. The 3-hole course is the only unlocked row; 6/9/18 show `🔒 6 Holes — Locked (clear 3 Holes)` etc.

- **Manual Seed Input**:
  - User types seed string/number into `#campaign-seed-input` and clicks `#campaign-seed-apply` (or presses Enter) → same warning confirm as above (`confirm` with lose/progress text). If confirmed → `campaignSeed = inputValue.trim()` (non-empty, string preserved; normalized via `String(seed)`; numeric strings kept as string but hashed deterministically). Then same regeneration: whole campaign replaced using that exact seed, only 3 unlocked, progress cleared, saved. Two players entering identical seed string shall get bit-identical campaigns (course levels + reward sequence). Input is trimmed; empty input shall be rejected (no confirm, optional error toast). The seed display updates to new value immediately.

- **No per-course regen, no bestTotal preservation across regen**: Unlike 10 §4 which preserved `bestTotal` on per-course refresh, campaign regeneration **does not preserve** `bestTotal` (it resets to `null` for all) and resets `rewardSeedCounter`. This is intentional because the whole campaign is new.

## 4. Deterministic Rewards Including Re-rolls

- Replace `Math.random` in `shuffleArray` for `REWARD_POOL` with seeded `mulberry32(hash(campaignSeed + rewardCounter))` where `rewardCounter` is an integer persisted in `STORAGE_KEY` payload as `rewardSeedCounter` (or `rewardCounter`) and incremented **once** per `maybeShowRewardMenu` creation and once per `rerollReward` replacement. `loadProgress` restores it; new campaign resets to `0`. `saveProgress` persists it.

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
  Any deterministic derivation is acceptable if it is **pure** in `campaignSeed` and **sequential** and **reproducible** per seed and does **not** use `Math.random` or `Date.now` for rewards. Tests shall verify: two fresh campaigns with same manual seed yield identical first reward triple for hole 2 hole-start, and identical reroll triple.

## 5. Unlocking Still Staged But Deterministic

- Unlocking logic unchanged (`isStageUnlocked( holeCount) === courses.find(c=>c.holeCount===3).bestTotal!==null` etc.) except `ensureNextStageUnlocked(courses)` shall generate the next stage's course using `deriveCourseSeed(campaignSeed, nextHoleCount)` (not `Date.now()`), so the 6-hole course after clearing 3 is deterministic for that seed. If initial `courses` already contains all 4, unlocking requires no generation.

## 6. Acceptance Criteria

- [ ] Fresh load with no storage: `localStorage[COURSES_KEY]` has `campaignSeed` (string/number) and `courses.length===1` with `holeCount 3`; seed display `#campaign-seed-display` exists inside `#game-container`, visible in main menu at lower right (`getBoundingClientRect().right` within `40px` of container right, `bottom` within `30px` of container bottom), text `Seed: ${campaignSeed}` matches `getCampaignSeed()` / `window.__getCampaignSeed()` and persists on reload. Next to it `#campaign-seed-edit-button` (`title="Edit seed"`, text `✎`) is visible at lower right within same wrapper (`right` within `50px`, `bottom` within `30px`), `getElementById('campaign-seed-edit-button')!==null`.
- [ ] Per-course `↻` `.course-refresh-button` does **not** exist in DOM on main menu (`querySelector('.course-refresh-button')===null`); no per-course confirm. **Seed input not in main menu**: `#main-menu-root #campaign-seed-input` is `null` or hidden when popup not open (`document.querySelector('#main-menu-root #campaign-seed-input')===null` or `.hidden`/`display:none`); `#campaign-controls` in main menu does not exist or is hidden.
- [ ] Edit popup: clicking `#campaign-seed-edit-button` shows `#campaign-edit-overlay` (`display:flex`, `background:rgba(0,0,0,0.55)` backdrop) with card `.campaign-edit-card` containing `#campaign-edit-current-seed`, `#campaign-seed-input` (`type="text" placeholder` contains `seed`), `#campaign-seed-apply` (`Apply Seed`), `#campaign-regenerate-button` (`Re-generate Seed`/`Regenerate`), `#campaign-edit-close` (`Close`). `Escape` or clicking backdrop (`#campaign-edit-overlay` background) or `Close` hides popup (adds `hidden`). While popup hidden, overlay has `hidden`.
- [ ] Clicking `#campaign-regenerate-button` **inside popup** shows `confirm` with `lose progress` warning; cancel keeps old `campaignSeed`; confirm generates new `campaignSeed !== old`, `courses` now has `3` only (or 3 unlocked and 6/9/18 locked), `isStageUnlocked(6)===false`, `STORAGE_KEY` cleared, seed display updates and popup hides.
- [ ] Entering identical seed via popup `#campaign-seed-input` + `#campaign-seed-apply` (after confirm) on two separate fresh storages yields bit-identical `courses[0].holes[0].tee`/`hole`/`field.seed` and identical reward offer for hole 2 (capture `rewardOffered` after advancing to hole 2). Manual seed `hello123` works; trimming handled.
- [ ] Rewards determinism: with manual seed `test-seed-1`, play hole 1 → advance to hole 2 triggers `maybeShowRewardMenu` with triple `A`; reload fresh with same seed and same path yields identical triple `A`; calling `rerollReward()` yields deterministic triple `B` identical across both runs; `Math.random` not used.
- [ ] After campaign regeneration only `3` unlocked: `courses.find(c=>c.holeCount===3).bestTotal===null` and `isStageUnlocked(6)===false` immediately after regenerate+confirm; advancing and winning 3 unlocks 6 deterministically (6 course seed equals `deriveCourseSeed(newSeed,6)`).
- [ ] Old saves without `campaignSeed` migrate: load shows seed display with generated seed, `courses` preserved (no data loss), and next unlock uses new seed deterministically; or fresh regeneration works.

## 7. File Paths

- `src/courses.js:1` (`campaignSeed`, `getCampaignSeed`, `setCampaignSeed`, `generateCampaignSeed`, `deriveCourseSeed`, `generateCampaign`, `loadCourses` with `campaignSeed` persistence)
- `src/main.js:1` (`campaignSeed`, `rewardSeedCounter`, `seededShuffle`, `maybeShowRewardMenu`/`rerollReward` deterministic, `hasRestorableSave` with seed, `syncCampaignSeedDisplay`, `campaignEditVisible`, `syncCampaignEditOverlay`)
- `index.html:1` (`#campaign-seed-wrapper` + `#campaign-seed-display` + `#campaign-seed-edit-button` lower right, `#campaign-edit-overlay` backdrop with `#campaign-seed-input`/`#campaign-seed-apply`/`#campaign-regenerate-button`/`#campaign-edit-close` inside)
- `style.css:1` (`#campaign-seed-wrapper` lower right, `#campaign-edit-overlay` backdrop `rgba(0,0,0,0.55)`, `.campaign-edit-card`)
- `docs/requirements/12-campaign.md:1` (this file)
