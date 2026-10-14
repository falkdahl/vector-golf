# 08 — Campaign, Persistence & Menus

- **ID:** 08-campaign-and-menus
- **Supersedes:** 09-persistence-and-campaign; 10-progression §5 (persistence bits)
- **Type:** Functional + UI + persistence
- **References:** `04-levels-and-wind.md` (generation); `07-rewards-and-economy.md` (best/points); `09-tutorial.md` (Proving Grounds); `10-story.md` (cutscene/banter gating)

> Removed: `PROGRESSION_KEY`/`LOADOUT_KEY`, shop/coins, per-course refresh, Continue button, `New Game`/`#course-menu`/delete buttons. `STAGES=[4,6,9,18]`; legacy `holeCount 3` maps to the 4-hole tutorial.

## 1. Storage keys & payload

- Active run `STORAGE_KEY="golfVectorField.progress.v1"` (`version:1`): `{courseId, currentHoleIndex, holeAttempts, holeRerolls, totalAttempts, totalPoints, supply(derived), fieldExtenderCount, powerCellCount, passiveCounts, passiveEnabled, isFreeShotActive, treasure state, rewardPending/rewardOffered/rewardRerolled/rewardMenuVisible, rewardSeedCounter, campaignSeed, runJournal/runJournalActive, gameState('AIMING' resume; `GAME_OVER` resumes to overlay), modifiers, aimAngle, savedAt}`. Transient ball/charge/mouse/field grid not persisted (resume at tee, never `FLYING`/`WIN`). Clamp numbers `≥0` (except points); `maxAttempts=10`; `freeShot` default `0`; missing treasure regenerates uncollected; corrupt/`version!==1`/unknown `courseId` → no save. `try/catch` everywhere.
- Journal `JOURNAL_KEY` — see `07-rewards-and-economy.md` §6. Seen cutscenes `CUTSCENE_SEEN_KEY`, banter bag `BANTER_STATE_KEY` — see `10-story.md`.
- Campaign `COURSES_KEY="golfVectorField.courses.v1"` (`{version:1, campaignSeed, courses[]}`), plus legacy `HIGH_SCORE_KEY` migration-only. `getCampaignSeed()` exported.
- Save triggers: launch, claim/reroll, place/pickup/drag, treasure collect, advance/`loadLevel`, fresh `rewardOffered`, Game Over, passive toggle, journal bumps.

## 2. Campaign & deterministic generation

- A campaign = staged courses `STAGES=[4,6,9,18]`, one course per holeCount, all derived from a single `campaignSeed` (8-char lowercase hex): course terrain/wind/trees/water/treasure via `deriveCourseSeed(campaignSeed,holeCount)` (`hash ^ holeCount*0x9e3779b9` or equivalent); course names `Adjective Noun` (≥10 adjectives + ≥10 nouns) via seeded RNG, unique within the campaign (collisions re-rolled deterministically; `loadCourses()` repairs duplicates); reward offers via `sampleRewardTriple` seeded `mulberry32(hash(campaignSeed:rewardSeedCounter))` (counter persisted, `++` per fresh offer and per reroll; never `Math.random`/`Date.now` for rewards). Same seed + same play order → bit-identical holes + reward sequence.
- Fresh campaign: random `campaignSeed`, `courses=[4-hole tutorial only]`; 6/9/18 generate deterministically on unlock (same seed). `loadCourses()` on corrupt/missing creates tutorial-only + new seed; migrates old saves (normalize to stage order, keep first per holeCount, discard extras/invalid with `console.warn`, migrate `3-hole Trial` → `The Proving Grounds` holeCount 4); never empty.
- `Course={id(UUID), name, holes, holeCount:4|6|9|18, seed, createdAt, bestTotal:number|null (points, higher wins; legacy attempts treated stale), stage}`. `STORAGE_KEY.courseId` must exist + be unlocked or the save is unrestorable.

## 3. Stages & unlocking

- Only the tutorial (`4`) unlocked at fresh start. `isStageUnlocked(n)` = `n===4` or previous stage `bestTotal!==null`. Clearing a stage auto-generates the next via `deriveCourseSeed` + `saveCourses()`. Stage delete forbidden. `bestTotal` updates only on full clear (higher points wins, lower keeps on tie; see `07-rewards-and-economy.md`); `End Run`/`Game Over` never touch it, but journal may still record a holes-reached best when no record exists.

## 4. Load & resume (auto-resume, no Continue)

- `init()` checks `hasRestorableSave()`: if true, auto-restores immediately (no menu, no Continue); else shows main menu (splash + staged list + Help). There is never a `#continue-button` on the main menu.
- Restore: `LEVELS=course.holes`, all persisted fields, `createField` + `setModifiers`, glow if armed, ball at tee `AIMING` (or `GAME_OVER` overlay), pending reward menu re-shown after restore.
- `clearProgress()` removes `STORAGE_KEY` only and resets run state (`holeAttempts/totalAttempts/totalPoints=0`, empty bag/passives, `modifiers=[]`, no glow/pending). Called on Victory/`Game Over` return, `endRun`, and new-course start. Preserves `COURSES_KEY`/journal/seen/banter.

## 5. Seed UI (edit popup only)

- Main menu shows `#campaign-seed-wrapper` (absolute `bottom:8 right:10`, `z13`, `≤50%` width) with `#campaign-seed-display` (`Seed: ${seed}`) + `#campaign-seed-edit-button` (`26×26 ✎`, `title="Edit seed"`). Visible only in main menu. No seed inputs directly in the menu.
- Edit popup `#campaign-edit-overlay` (absolute inset flex center `rgba(0,0,0,0.55)` z14, card `rgba(0,0,0,0.85)`): title `Campaign Seed`, row with `#campaign-seed-input` (`text`, `placeholder` contains `seed`, `maxlength=8`, `pattern=[0-9a-f]*`, pre-populated on open, accepts only `[0-9a-f]` — game keys suppressed while focused) + icon-only `#campaign-seed-refresh` (`↻` immediately right), plus `#campaign-seed-ok` (OK) and `#campaign-seed-cancel` (Cancel). Aliases `#campaign-seed-apply`→OK, `#campaign-edit-close`→Cancel, `#campaign-regenerate-button`→refresh (hidden compat). Hidden by default; `Escape`/backdrop/Cancel closes.
- Refresh/changed-OK shows warning `#campaign-confirm-overlay` (z15, contains `re-generate all levels` + `campaign progress will be lost`/`lose`+`progress`, Confirm/Cancel). Confirm → `localStorage.clear()` (all keys) + new/manual seed + tutorial-only courses + hide popups. Cancel → warning closes, edit stays, seed unchanged. OK validation: `^[0-9a-f]{8}$`; invalid → inline error, stays open; same-as-current → plain close.

## 6. Main menu vs pause (separate overlays)

- Main (`#main-menu-overlay`, transparent over splash): staged list `#staged-course-list` (column, `≤480px`, `max-height:min(65vh,520px)`, internal scroll only when overflowing) in `4,6,9,18` order. Unlocked row: `.course-row[data-course-id][data-holes]` + green `.course-play-button` (`#2ecc71`/`#27ae60`) with `course-name` + `course-meta` (`"<n> holes   Record: <best|—>"`) — except the tutorial row shows a blank meta (nbsp, same height, no `Record`/hole text; best still tracked for unlocks). Locked row: `.locked`, `🔒 N Holes — Locked`, hint `Finish tutorial to unlock` (first) else `Clear <prev> Holes to unlock`, `opacity .55`. Dimension-Y teaser (only after `end-18-hole` seen): extra locked row `[data-teaser="dimension-y"]` (no `data-course-id`/`data-holes`, disabled button, no click handler) with `🔒 Dimension-Y` + `Coming Soon` hint. Hamburger = round `☰` top-left (`#help-button.help-corner-button 72×72`, same icon as in-game) opening the Music/SFX/Help popup (see hamburger bullet below). No Continue, no End Run, no New Game, no per-course `↻` (absent), no delete. Play with no save → starting overlay (see `05-modifiers-and-bag.md` + `09-tutorial.md`); with save → auto-resume handles it (menu not shown).
- Pause (`#pause-overlay`, `rgba(0,0,0,0.55)` over field; `Escape`/`P` in any level state incl. `FLYING` freezes ball, wind visuals continue): vertical `Continue (#resume-button) → Music (#music-toggle-button) → SFX (#sfx-toggle-button) → Help (#pause-help-button, regular button above End Run, never corner) → End Run (#pause-end-run-button red #e74c3c)`, plus `Export Course (#pause-export-button)` → clipboard base64 + `#toast` (`copied to clipboard`, bottom-center, `1800–2500ms`). Music/SFX toggles share Continue's shape but are transparent (no background). No reset/Next Attempt button (removed; `R` stays blocked while pause is open — Continue first). Never the course list, never New Game. `Continue`/`Escape`/`P` resumes exactly. `End Run` → confirm overlay (`#end-run-confirm-overlay`) → `clearProgress()` → menu (deferred behind points summary when visible).
- Audio prefs (`src/audio.js`, `AUDIO_PREFS_KEY="golfVectorField.audioPrefs.v1"` `{version:1, music, sfx}`, both default on): toggles `.audio-toggle[data-pref=music|sfx]` in the pause menu (`#music-toggle-button`/`#sfx-toggle-button`) and in the main-menu hamburger popup (`#music-toggle-button-menu`/`#sfx-toggle-button-menu`), labels exactly `Music: ON|OFF` / `SFX: ON|OFF`, synced via `syncAudioToggleUI()` on menu sync + toggle (single delegated document click handler, no per-button listeners). `Music OFF` silences stage/menu/cutscene music immediately (intent flags kept; re-enable fades the wanted track back, still hidden-guarded). `SFX OFF` silences all synth SFX + wind loop + cutscene SFX/type ticks (new SFX no-op, master muted). Respected in-game, on menus and in cutscenes. Persisted across page visits; separate key so run/campaign clears never wipe it (only full `localStorage.clear()` on campaign reseed resets to defaults).
- Main-menu hamburger (`#help-button.help-corner-button` top-left, visually identical to the in-game hamburger: `44×44`, `20px ☰`, `rgba(0,0,0,0.55)` background, `1px rgba(255,255,255,0.35)` border, `8px` radius): opens the `#menu-hamburger-menu` popup (visually identical to the in-game pause menu: `rgba(0,0,0,0.55)` backdrop, buttons centered) with three pause-styled transparent buttons `Music → SFX → Help (#menu-hamburger-help-button)`. While open, the course buttons (`.main-menu-content`) are hidden and restored via `syncMainMenu()` on close. Closes on backdrop click (anywhere not on a menu button), `Escape`/`P`, Help (opens `#help-overlay`), or leaving the main menu (auto-reset, never reopens stale). Toggle clicks keep the popup open so both prefs can be flipped.
- Blocking: main menu freezes ball/input/placement/rewards and hides hotbar; pause blocks the same; `WIN`/reward take priority over pause.

## 7. Help overlay

- Via Help in either menu: `#help-overlay` (transparent fullscreen z12) + opaque scrollable `.help-card` (`≤420px`, `≤85%`, `rgba(0,0,0,0.75)`). Pauses game; `Back (#help-back-button)` returns without side effects.
- Content: sacred-links lore verbatim (Mt. Aeolus, `putting is for cowards`, 10 attempts, pants/catapult, Pocket-Atmosphere Overrider) + controls (`Arrow keys — Aim`, `Space — Hold to charge, release to shoot`, `Click — Place modifier`, `Right-click — Remove`, `1/2/3 — Select item in golf bag (3 slots)`, `Attempts Left (+Y)`, `H`, `R`, `Escape/P` pause, `I` golfbag, `J` journal) + Items section (7 rows `div.help-item[data-type]` with `img.help-item-icon ./img/<type>-icon.png 32–36px` (freeShot `★ 36px #FFD700` allowed), exact names `Magnifier/Liquifier/Deflector/Rotator/Field Extender/Power Cell/Free Shot`, effect keywords: `5×`/magnif, `0`/liquif + velocity, `180`/reverse, `90`/rotate, `20%`+area, `20%`+strength, free+attempt + gold glow). Title `h4 Items` after controls, before Back.

## Acceptance

- [ ] Fresh: splash, seed wrapper lower-right, tutorial-only course (`Adjective Noun`, holeCount 4), 6/9/18 locked, no Continue/refresh/New Game/delete; clearing unlocks next deterministically; names unique.
- [ ] Refresh/OK flows validate `^[0-9a-f]{8}$`, warn (`re-generate all levels` + `lose progress`), `localStorage.clear()` on confirm, tutorial-only after.
- [ ] Seed input only `[0-9a-f]`, game keys suppressed while focused.
- [ ] Same manual seed on two storages → identical holes + hole-2 reward triple + reroll triple.
- [ ] Save → reload auto-resumes (no Continue); `Escape`/`P` pause with correct order/buttons; End Run confirms and returns; Export toasts.
- [ ] Pause order `Continue → Music → SFX → Help → End Run`, no reset button; hamburger popup with `Music → SFX → Help`, backdrop/`Escape` close; labels `Music: ON|OFF` / `SFX: ON|OFF` synced in both menus; prefs persist across reloads and gate music/SFX/wind/cutscene audio everywhere.
- [ ] Help has lore + controls + 7 Items rows with icons/names/keywords; scrollable; Back clean.

## File paths

- `src/main.js:1`, `src/courses.js:1` (`COURSES_KEY`, `deriveCourseSeed`, `generateCampaign`, `loadCourses`, `regenerateCampaign`, `applyManualSeed`), `src/storage.js:1`, `index.html:1`, `style.css:1`
