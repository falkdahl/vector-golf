# 12 — Banter System (In-Place May/Caddy Dialog)

- **ID:** 12-banter
- **Type:** Functional + UI
- **References:** `11-cutscenes.md` (dialog box style/input), `10-progression.md` §2 (loadout), `05-input-and-states.md` §6 (Hole 1 banner), `02-canvas-system.md` (loop dt), `01-infrastructure.md` (static hosting)

## 1. Purpose

Short in-place conversations between May and Caddy that play at the start of a
run, after the loadout overlay closes and before the `Hole 1` banner shows.
Banter stays on the loaded hole (terrain, ball, wind visible behind); it never
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
- Validation: `validateBanter(data)` returns `{valid, errors}`; invalid files or
  entries are ignored (banter skipped, run continues to the Hole 1 banner).

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

## 4. Trigger — After Loadout Closes, Before Hole 1 Banner

- `startCourseWithLoadout(courseId, slots)` (the loadout `OK` path) shall:
  1. perform the normal run setup and `loadLevel(0)` with the `Hole 1` banner
     **suppressed** (`holeBannerVisible=false`),
  2. play the next run-start banter in place,
  3. show the `Hole 1` banner (`showHoleBanner(0)`) only after the banter
     completes (or immediately if the banter file is missing/invalid/empty).
- Selection: the first three banters are fixed onboarding — `banters[0]`
  (`controls-first`: aim/shoot/place/remove/reset) plays on the first run,
  `banters[1]` (`rewards-second`: chests/hole-clear rewards, owned-only offers,
  placed modifiers lost on clear, right-click pickup) on the second run, and
  `banters[2]` (`stacking-third`: stacking field modifiers, deflector/rotator
  direction twists, magnifying a Rotator or Deflector for the needed
  trajectory) on the third run. After those three have played, each run start
  picks randomly (`Math.random`) among the rest (`banters[3:]`). A persisted
  counter (`BANTER_STATE_KEY =
  "golfVectorField.banter.v1"`, `{version:1, count}`) tracks progress: `count`
  `0` → first scene, `1` → second scene, `2` → third scene, `≥3` → random
  among the rest, and increments after each played banter.
  `localStorage.clear()` / campaign regeneration resets the sequence.
- `showLoadout(courseId)` preloads `src/banter.json` in the background
  (`preloadBanterFile()`, fire-and-forget) so no fetch gap appears when the
  loadout closes.
- Reloading mid-banter is not persisted: the run itself was already saved by
  `startCourseWithLoadout`, so a reload auto-resumes at hole 1 without
  replaying the banter.

## 5. Blocking & Loop Integration (`src/main.js` + `src/banter.js`)

- Runtime API (`src/banter.js`): `loadBanterFile()`, `preloadBanterFile()`,
  `getBanter(id)`, `listBanterIds()`, `validateBanter(data)`,
  `isBanterActive()`, `getActiveBanterId()`, `playBanter(idOrEntry,
  {onComplete})`, `playRunStartBanter({onComplete})` (async, first-three-fixed
  then random among the rest),
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
- Banter never overlaps a cutscene: it only starts from `startCourseWithLoadout`,
  which runs after any cutscene chain has completed; the cutscene branch in
  `update()`/input handlers keeps priority.

## Acceptance Criteria

- [ ] `src/banter.json` is a single file with `version:1` and `banters[]`; each
      entry has a unique `id` and 1–12 `lines` of `{speaker: may|caddy, text:
      1–500 chars}`; `validateBanter` accepts it.
- [ ] `May` boxes show speaker `May` + `./img/cutscenes/portrait-may.png`,
      `Caddy` boxes show `Caddy` + `./img/cutscenes/portrait-caddy.png`, in the
      existing `#cutscene-dialog` `.cutscene-dialog-box` JRPG style.
- [ ] Typewriter reveals at 20 cps; each box lingers 1000ms; next dialog starts
      at the end of the previous one (±150ms tolerance).
- [ ] First press of `Space`/`R`/click while revealing fast-forwards to full
      text; next press advances; last box closes the banter.
- [ ] Closing the loadout (`OK`) suppresses the `Hole 1` banner, plays a
      banter in place over hole 1 (terrain/wind visible, no cutscene
      background takeover), then shows `Hole 1` `1000ms`; missing/invalid file
      falls back to the banner immediately.
- [ ] Consecutive run starts play the fixed onboarding first (`controls-first`,
      then `rewards-second`, then `stacking-third`) and afterwards pick
      randomly among the remaining banters; counter persists in
      `BANTER_STATE_KEY`.
- [ ] While banter is active: no launch, charge, aim drift, placement, drag,
      `R`, `H`, or pause; ball stays at tee `AIMING`; wind keeps animating.

## File Paths

- `src/banter.json:1` (single data file, banters with id + lines)
- `src/banter.js:1` (loader, validator, player, `BANTER_CPS=20`,
  `BANTER_LINGER_MS=1000`, onboarding-then-random selection state)
- `src/main.js:1` (`startCourseWithLoadout` defers Hole 1 banner for banter,
  `showLoadout` preloads, `update`/input guards via `banterIsActive`)
- `index.html:1` (existing `#cutscene-dialog` overlay, reused as-is)
- `style.css:1` (existing `.cutscene-dialog-box` JRPG styles, reused as-is)
- `docs/requirements/12-banter.md:1` (this file)
