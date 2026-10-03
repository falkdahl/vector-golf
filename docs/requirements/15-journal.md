# 15 — Run Journal (Best Run per Course)

- **ID:** 15-journal
- **Type:** Functional + UI + Persistence
- **References:** `01-infrastructure.md` (static hosting), `02-canvas-system.md` (container bounds), `05-input-and-states.md` (attempts), `06-wind-system.md` (modifiers/passives), `08-rewards-and-progression.md` (rewards/points), `09-persistence-and-campaign.md` (courses, help), `10-progression.md` (starting items, points)

## 1. Purpose

The journal tracks the player's best run for each course and shows, per hole,
what happened on that run: starting picks, hole-start rewards, chest pickups
and their rewards, and which modifiers were activated to clear the hole.

## 2. Best-Run Definition

- One journal state per course, keyed by `holeCount` (`"3"`, `"4"`, `"6"`, `"9"`, `"18"`)
  in local storage key `JOURNAL_KEY = "golfVectorField.journal.v1"`
  (`{ version:1, best: { [holeCount]: entry } }`).
- If the course has never been cleared, the best run is the run that reached
  the highest-numbered hole (`holesReached`).
- If the course has been cleared, the best run is the cleared run with the
  highest score (`totalPoints`).
- Ties keep the existing best. A cleared best is never overwritten by an
  uncleared run. An uncleared best is replaced by any cleared run.
- Best entry shape:
  ```js
  { version:1, holeCount:number, courseName:string, cleared:boolean,
    holesReached:number, totalPoints:number, startingItems:string[],
    holes:[{ n, cleared, points, attempts,
      startReward:null|string|'skipped',
      chest:null|{reward:null|string|'skipped'},
      clearing:string[] }], savedAt:number }
  ```

## 3. Recording (current run)

- `journalStartRun(startingItems)` begins recording: from the starting overlay
  picks (`handleStartingOk`), empty otherwise (tutorial/legacy starts, guarded
  so direct `startCourseWithStartingItems` calls never wipe picks). The
  in-progress journal is persisted in `STORAGE_KEY` (`runJournal`,
  `runJournalActive`) so reload-resume keeps recording.
- `loadLevel` bumps `maxHole` while recording (highest hole reached).
- Reward source is tracked per menu: chest collects set `journalChestPending`,
  menu open reads it into `rewardSource` (`'chest'` vs `'hole-start'`,
  including the tutorial hole-4 passive menu). `claimReward` /
  `discardBagSlotAndClaimReward` record the granted type into the current
  hole's `startReward` or `chest.reward`; `closeRewardMenuWithoutReward`
  records `'skipped'`.
- On hole clear (`advanceHole`, final-hole `checkWin`, tutorial included),
  `journalRecordHoleClear` stores `clearing = journalClearingTypes()` — the
  types from `modifiersTraversedThisShot` mapped back to `modifiers` — i.e.
  only modifiers the ball was inside on the clearing shot. Placed but never
  entered modifiers are excluded. Points/attempts use the same formulas as
  the per-hole summary.
- Committed via `commitRunJournal(cleared)` at run end: final-hole `checkWin`
  (cleared, tutorial included), `endRun` and `handleGameOverReturn`
  (uncleared). `finishReturnToMainMenu` stops recording as a safety net.

## 4. Journal Icon & Panel (top-left, golfbag-themed)

- DOM inside `#game-container` (bounded, no scroll impact):
  ```html
  <div id="journal-wrapper">
    <div id="journal-container" role="button" tabindex="0">
      <div id="journal-icon">📖</div>
      <span class="journal-hotkey">J</span>
    </div>
  </div>
  <div id="journal-panel" class="hidden">
    <div class="journal-card">
      <h3 id="journal-title">Journal</h3>
      <div id="journal-starting"></div>
      <div id="journal-rows"></div>
    </div>
  </div>
  ```
- `#journal-wrapper` is `position:absolute; bottom:12px; left:12px; 79×79`
  (left edge, same `bottom` inset as `#bottom-bar`, so the journal center
  aligns vertically with the open golf bag center — both are `79px` boxes.
  `z-index:6`, same theme as the golf bag: `79px` circle,
  `rgba(0,0,0,0.35)`, `blur(4px)`, `border-radius:50%`). The book emoji
  (`#journal-icon`, `44px`) is a placeholder until real art lands.
- Collapsed (default, "out of the way"): `#journal-container.collapsed`
  uses `transform:translateX(-51px)` (`0.22s`), leaving the right-hand
  28px strip of the icon visible (clipped by the container edge, like the golf bag). Opening
  slides it fully in.
- Hotkey badge `span.journal-hotkey` (`J`) uses the same pill style and
  corner placement as `.golfbag-hotkey` (`18px`, `rgba(0,0,0,0.38)`, `10px`,
  `top:-3px; right:-3px` mirroring the bag's top-left badge), so it stays
  visible in the collapsed top-right corner, and moves with the container.
- The panel (`#journal-panel`, `bottom:100px; left:12px`,
  `max-height:calc(100% - 130px)`, `overflow-y:auto`) opens just above
  the icon and scrolls internally when the hole list is
  longer than the panel.
- Toggle via click, `Enter` (focused), or hotkey `J` (`toggleJournal()`).
  `J` is ignored while typing, with modifiers held, on repeat, and in
  menus/overlays (main menu, pause, reward menu handled explicitly,
  summaries, banners, `WIN`/`GAME_OVER`, cutscene, banter, starting
  overlay). Focus is blurred after click/`Enter` so `Space` still shoots.
- Icon visibility follows the same gameplay rule as `#bottom-bar` (visible
  in `AIMING`/`CHARGING`/`FLYING` including reward menus; hidden in
  menus/pause/banners/summaries/`WIN`/`GAME_OVER`/cutscene/banter/starting
  overlay), except the icon (and panel) are additionally always hidden on
  the tutorial course (`The Proving Grounds`, `J` disabled there too). The panel (`#journal-panel`, `z-index:9`, top-left below the
  icon, scrollable) shows only while the icon is visible and open; rows
  rebuild only when best data changes (signature guard, no per-frame DOM
  churn). Help lists `J — Toggle best-run journal` under Controls.

## 5. Panel Content (one row per hole)

- Header: `Best Run — {courseName}` (no cleared/points suffix); no
  separate starting line (starting picks live in hole 1's `Start:` row);
  `No best run yet — finish a run to record it.` when empty.
- Each hole row: `Hole N ✓ +pts` (or `Hole N — reached`); hole 1's `Start:`
  shows the run's starting picks, other holes' `Start:` shows the
  hole-start reward (`Skipped` when skipped, row omitted when neither);
  `Chest:` is always shown (chest reward, `Skipped` when skipped, empty
  content when no chest was taken); and — only for cleared holes —
  `Cleared with:` (activated modifier names with mini icons, empty content
  when no modifiers were used).
- Row layout (nested flex): each hole row holds a vertical
  `.journal-breakdown` flex with one `.journal-field` per entry; each field
  is a horizontal flex of a fixed-width `.journal-label` (`88px`) plus a
  `.journal-content` horizontal flex (`flex:1`, `wrap`) with one
  `.journal-item` per item, so values align in one column regardless of the
  row title text and content expands vertically when it cannot fit
  horizontally. Each `.journal-item` is itself a horizontal flex of a
  fixed-width `.journal-item-icon` slot (`24px`, icon centered) plus the
  `.journal-item-name`, so an icon and its name wrap to the next row
  together, never apart. All `.journal-field` rows share `min-height:24px`
  so `Start:`, `Chest:`, and `Cleared with:` rows are equally tall even
  when their content is empty.

## Acceptance Criteria

- [ ] `#journal-wrapper` left edge (`bottom:12px`, same inset as
  `#bottom-bar` so its center aligns with the open golf bag center,
  `left` within `20px`), `79×79` circle same theme as golf bag with `📖`
  `44px` icon; `.journal-hotkey` pill shows `J` in the top-right corner
  of the icon (visible in the collapsed strip);
  collapsed state slides it mostly out of view (`translate(-51px,-51px)`)
  with a corner still visible; `J`/click/`Enter` toggles with `0.22s`
  animation; `Space` after click still shoots (focus blur).
- [ ] `J` ignored while typing in inputs, with `Ctrl/Alt/Meta`, on repeat,
  and in all menus/overlays; works in `AIMING`/`CHARGING`/`FLYING` and
  while the reward menu is open.
- [ ] Clearing a course records `JOURNAL_KEY` best for that `holeCount`
  with `cleared:true`, per-hole `startReward`/`chest.reward`/`clearing`
  (only traversed modifiers)/`points`, and `startingItems`; ending a run
  early records `cleared:false` with `holesReached`.
- [ ] Best replacement: cleared beats uncleared; higher score wins among
  cleared; highest hole (points tiebreak) wins among uncleared; ties keep
  existing; reload mid-run resumes recording via `STORAGE_KEY`.
- [ ] Panel shows one row per hole with start/chest/clearing info and the
  header described above; empty state text when no best exists; no
  horizontal scroll; bounded to the container; the panel scrolls
  vertically (`overflow-y:auto`, `max-height:calc(100% - 130px)`) when rows exceed its
  height.

## File Paths

- `src/main.js:1` (journal module, recording hooks, `toggleJournal`,
  `syncJournalUI`, `renderJournalPanel`, `JOURNAL_KEY`, exports +
  `window.__*` hooks)
- `index.html:1` (`#journal-wrapper`, `#journal-panel`)
- `style.css:1` (journal icon/panel/row styles)
- `docs/requirements/15-journal.md:1` (this file)
