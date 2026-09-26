# 12 — Banter System (In-Place May/Caddy Dialog)

- **ID:** 12-banter
- **Type:** Functional + UI
- **References:** `11-cutscenes.md` (dialog box style/input), `10-progression.md` §2 (loadout), `05-input-and-states.md` §6 (Hole 1 banner), `02-canvas-system.md` (loop dt), `01-infrastructure.md` (static hosting), `13-tutorial.md` (tutorial banters)

## 1. Purpose

Short in-place conversations between May and Caddy that play at the start of a
run and between tutorial holes. Banter stays on the loaded hole (terrain, ball, wind visible behind); it never
takes over the background canvas like a full cutscene.

## 2. Data File — Single JSON (`src/banter.json`)

- **Single file only:** all banters live in `src/banter.json` (one file, not one
  file per banter).
- Schema:
  ```json
  {
    "version": 1,
    "banters": [
      {
        "id": "run-start-1",
        "lines": [
          { "speaker": "may", "text": "..." },
          { "speaker": "caddy", "text": "..." }
        ]
      }
    ]
  }
  ```
- Field constraints:
  - `version` must be `1`.
  - `banters` is a non-empty array; each `id` is required, unique, and matches
    `^[a-z0-9][a-z0-9-_]{1,40}$`.
  - Each banter has `lines` with 1–12 entries; each entry has `speaker` and
    `text` (`text` is 1–500 chars).
  - `speaker` (case-insensitive) is one of:
    - `may` → display name `May`, portrait `./img/cutscenes/portrait-may.png`
    - `caddy` → display name `Caddy`, portrait `./img/cutscenes/portrait-caddy.png`
- Includes tutorial banters (see §4c) and non-tutorial pool (see §4d). IDs for tutorial: `controls-first` (hole1 controls), `tutorial-field-modifiers` (hole2 field modifiers, alias `stacking-third` for compat), `tutorial-rewards` (hole3 rewards, alias `rewards-second`), `tutorial-passives` (hole4 passives), `tutorial-hole2-gadgets-reminder` (hole2 5-attempt reminder), `tutorial-liquifier-reminder` legacy kept but not used on hole1. Validation: `validateBanter(data)` returns `{valid, errors}`; invalid files or entries are ignored (banter skipped, run continues to the Hole 1 banner).

## 3. Dialog Presentation — Cutscene Dialog Box

- Banter renders in the existing cutscene dialog overlay `#cutscene-dialog`
  with `.cutscene-dialog-box` JRPG styling (see `11-cutscenes.md` §6) —
  `portrait-left` layout, `64–80px` portrait, gold speaker name, typewriter
  text. No new overlay, no new CSS.
- `May` dialogs show name `May` with `portrait-may.png`; `Caddy` dialogs show
  name `Caddy` with `portrait-caddy.png`.
- Timing (normative):
  - Typewriter animates at `BANTER_CPS = 20` chars per second.
  - Each text box lingers `BANTER_LINGER_MS = 1000ms` after full reveal.
  - The next dialog starts at the end of the previous one (auto chain, no
    manual timing per line).
- Input (same as cutscene dialog): pressing `Space`, `KeyR`, or mouse `click`
  while a box is revealing instantly reveals the full text; pressing again
  (fully revealed) advances immediately to the next dialog (skipping remaining
  linger). On the last box it closes the banter. `Escape`/`Enter` also advance.
  There is no Skip button; banter is 3–4 short boxes.

## 4. Triggers

### 4a. Tutorial Course — Fixed Per-Hole Banters (2026-09-25, supersedes previous tutorial trigger)

Tutorial banters **only play on `The Proving Grounds`** (`activeCourse.name==="The Proving Grounds"`). They are **not** shown on other courses.

- **Hole 1 start:** `controls-first` (tutorial-controls) — Caddy describes controls: aim with arrows, shoot with space, reset with r, pause with escape, place items with left-click, pick up items with right click, hotkeys to select an item in the bag. Plays immediately after `handleCoursePlay` loads hole 1 preview, before `Hole 1` banner. Always replays on each tutorial run (no seen gating, not part of `BANTER_STATE_KEY` shuffle).
- **Hole 2 start:** `tutorial-field-modifiers` (stacking-third) — Caddy tells player to use a liquifier when they have a good direction they want to keep, deflector and rotator if wind is not blowing the way they need and magnifier if they need more power. Also teaches that field modifiers can be placed on top of each other to combine their effects, that overlapping modifiers snap together into a stack with a split-color rim, and that right-clicking a stack splits it back apart (right-clicking a lone gadget picks it back up). Plays after `first-restock` cutscene (or immediately if cutscene skipped) over Hole 2 preview, before `Hole 2` banner. Always replays.
- **Hole 2 reminder (5 attempts):** `tutorial-hole2-gadgets-reminder` — one-sentence caddy reminder to try the new gadgets they got from the old man. Triggered when `holeAttempts>=5 && currentHoleIndex===1` while `isTutorialActive()` and `AIMING`/`CHARGING`, once per Hole 2 run. Contains `gadget` and `old man`.
- **Hole 3 start:** `tutorial-rewards` (rewards-second) — Caddy explains you can only hold 4 items in your golf bag and if you ever pick up an item when the bag is full you have to discard one. He also explains you get a reward by clearing a hole or picking up treasure chests. Chests are great if you are in need of more items but you have to balance how many attempts you spend trying to grab one. Plays over Hole 3 preview before `Hole 3` banner (reward menu at start is suppressed; treasure triggers special rotator/deflector reward after chest). Always replays.
- **Hole 4 start:** `tutorial-passives` — Caddy explains there are some passive items that you can always pick up even if your bag is full, they stack outside of your bag and you can carry how many you like. He explains effects of field extender, power cell and free shot (field extender +20% area, power cell +20% strength, free shot free attempt). Plays over Hole 4 preview before `Hole 4` banner. Always replays.

Tutorial banters are not persisted in `BANTER_STATE_KEY`; they do not consume the non-tutorial shuffle bag.

### 4b. Non-Tutorial Courses — Random Shuffle-Bag (2026-09-25, supersedes previous onboarding fixed order)

When playing **any course other than `The Proving Grounds`**, the first hole start shows a **random non-tutorial banter** from a **shuffle bag** over the remaining banters (all banters whose `id` is not one of the tutorial ids `controls-first`, `tutorial-field-modifiers`, `stacking-third`, `tutorial-rewards`, `rewards-second`, `tutorial-passives`, `tutorial-hole2-gadgets-reminder`, `tutorial-liquifier-reminder`). The bag holds each non-tutorial id exactly once in `Math.random` shuffled order, one id is popped per run start, and the bag is only rebuilt and reshuffled once fully empty — so every non-tutorial banter plays exactly once per cycle with no repeats until the whole cycle completes. A persisted state `BANTER_STATE_KEY = "golfVectorField.banter.v1"` `{version:1, count, lastId, bag:string[]}` tracks progress (count increments per played non-tutorial banter, lastId/bag persisted). Tutorial banters do not affect this state. `loadBanterFile` preload still happens, but tutorial course bypasses this bag entirely.

- `handleCoursePlay` for non-tutorial courses shall load hole 1 preview, then call `playRunStartBanter` (which now draws from the non-tutorial shuffle bag) → `Hole 1` banner.
- Reloading mid-banter is not persisted: the run itself was already saved, so reload auto-resumes at hole 1 without replaying the banter.
- `showLoadout` / `showStartingItems` preloading still fire-and-forget `preloadBanterFile()`.

### 4c. Legacy Trigger — After Loadout Closes, Before Hole 1 Banner (deprecated, kept for reference)
- Previous fixed onboarding `controls-first, attempts-fourth, stacking-third, rewards-second` in order then shuffle bag is superseded by §4a/§4b.

## 5. Blocking & Loop Integration (`src/main.js` + `src/banter.js`)

- Runtime API (`src/banter.js`): `loadBanterFile()`, `preloadBanterFile()`,
  `getBanter(id)`, `listBanterIds()`, `validateBanter(data)`,
  `isBanterActive()`, `getActiveBanterId()`, `playBanter(idOrEntry,
  {onComplete})`,   `playRunStartBanter({onComplete})` (now non-tutorial shuffle bag only, tutorial handled separately via `playBanter('controls-first')` etc.),
  `updateBanter(dtSeconds)`, `handleBanterInput(e): boolean`, `skipBanter()`.
- While `isBanterActive()`:
  - `update(dt)` ticks wind + `updateBanter(dt)` and returns early (physics
    frozen, charge cancelled) — same pattern as the Hole 1 banner branch.
  - `keydown`/`click`/`mousedown` on canvas route to `handleBanterInput`
    first; all game input (aim, charge, launch, `1-4` selection, placement,
    drag, `R` reset, `H` wind toggle, `Escape`/`P` pause) is blocked.
  - `input.js` guards: `gameStateGetter` returns `"BANTER"` while active (so
    `Space` never starts charging), `onReset`/`onToggleWind` no-op.
  - `handleLaunch`/`placeModifier`/hotbar clicks no-op.
- Banter never overlaps a cutscene: tutorial cutscenes play before banter; the cutscene branch in `update()`/input handlers keeps priority.

## 6. Skip Button — Same Design as Cutscene Skip

- Every banter shows a **Skip button** in the **top-right corner** of the canvas while it is active: `<button id="banter-skip-button">Skip »</button>` as a direct child of `#game-container` (bounded, `position:absolute; top:10px; right:12px; z-index:14` above the dialog `z-index:12`), `hidden` otherwise (`classList` contains `hidden` iff `!isBanterActive()`; `display:none` when hidden).
- Styling is identical to `#cutscene-skip-button` (small unobtrusive pill: `font:700 11px system-ui`, white on `rgba(0,0,0,0.55)`, `1px solid rgba(255,255,255,0.35)`, `border-radius:8px`, `padding:6px 12px`, `cursor:pointer`; hover `background:rgba(0,0,0,0.75)`).
- Clicking it calls `skipBanter()` (ends immediately via `finishActive`, invoking `onComplete` so the `Hole 1` banner shows and the banter counter still bumps for non-tutorial; tutorial banters do not bump the counter). The click is `preventDefault()`-ed and `stopPropagation()`-ed so it never also advances dialog via the dialog/canvas click handlers.
- Visibility is synced from `syncBanterSkipButton()` in `src/main.js`, called on banter start, on `onComplete`, and every frame in the `update()` banter branch, so the button is visible throughout the banter and never leaks into gameplay, menus, loadout, cutscenes, or reward overlays. Wired once in `init()` (`#banter-skip-button` click → `banterSkip()` when `isBanterActive()`), exposed as `window.__syncBanterSkipButton` for tests. The cutscene skip button stays hidden during banter (`cutsceneIsActive()===false`).

## Acceptance Criteria

- [ ] `src/banter.json` is a single file with `version:1` and `banters[]`; each entry has a unique `id` and 1–12 `lines` of `{speaker: may|caddy, text: 1–500 chars}`; `validateBanter` accepts it. Must contain tutorial ids `controls-first`, `tutorial-field-modifiers` (or `stacking-third`), `tutorial-rewards` (or `rewards-second`), `tutorial-passives`, `tutorial-hole2-gadgets-reminder` and at least 8 `run-start-*` non-tutorial ids.
- [ ] `May` boxes show speaker `May` + `./img/cutscenes/portrait-may.png`, `Caddy` boxes show `Caddy` + `./img/cutscenes/portrait-caddy.png`, in the existing `#cutscene-dialog` `.cutscene-dialog-box` JRPG style.
- [ ] Typewriter reveals at 20 cps; each box lingers 1000ms; next dialog starts at the end of the previous one (±150ms tolerance).
- [ ] First press of `Space`/`R`/click while revealing fast-forwards to full text; next press advances; last box closes the banter.
- [ ] Tutorial course `The Proving Grounds` shows `controls-first` over hole1 before `Hole 1` banner, `tutorial-field-modifiers` over hole2 before `Hole 2` banner, `tutorial-rewards` over hole3 before `Hole 3` banner, `tutorial-passives` over hole4 before `Hole 4` banner, each with required keywords (controls: `arrow`+`space`+`r`+`escape`+`left-click`+`right`+`hotkey`; field modifiers: `liquifier`+`good direction`+`deflector`+`rotator`+`magnifier`+`power`+`combine`/`stack`+`snap`+`right-click`/`split`; rewards: `4`+`bag`+`discard`+`treasure`/`reward`+`balance`/`attempt`; passives: `passive`+`stack`+`bag`+`field extender`+`power cell`+`free shot`+`20% area`+`20% strength`). Missing/invalid file falls back to banner immediately. Tutorial banters replay every run, not gated by `BANTER_STATE_KEY`.
- [ ] Non-tutorial course first hole shows a random banter from the non-tutorial pool (excluding tutorial ids) via shuffle bag: each remaining id plays exactly once per cycle with no repeats until the bag is empty, then reshuffled; `count` + `lastId` + `bag` persist in `BANTER_STATE_KEY`. Consecutive runs on non-tutorial courses cycle without repeats; tutorial runs do not consume the bag.
- [ ] While banter is active: no launch, charge, aim drift, placement, drag, `R`, `H`, or pause; ball stays at tee `AIMING`; wind keeps animating.
- [ ] Skip button: `#banter-skip-button` (`Skip »`) is visible in the top-right corner (`top` within `20px`, `right` within `20px` of `#game-container`, `z-index:14` above dialog) while banter is active and hidden (`display:none`) otherwise; clicking it ends the banter at once (Hole banner still shows) without also advancing dialog; same pill design as `#cutscene-skip-button`.

## File Paths

- `src/banter.json:1` (single data file, banters with id + lines)
- `src/banter.js:1` (loader, validator, player, `BANTER_CPS=20`, `BANTER_LINGER_MS=1000`, `TUTORIAL_BANTER_IDS` + non-tutorial shuffle bag)
- `src/main.js:1` (tutorial per-hole banter sequencing via `isTutorialActive()`, non-tutorial `playRunStartBanter` via shuffle bag)
- `index.html:1` (existing `#cutscene-dialog` overlay, reused as-is)
- `style.css:1` (existing `.cutscene-dialog-box` JRPG styles, reused as-is)
- `docs/requirements/12-banter.md:1` (this file)
