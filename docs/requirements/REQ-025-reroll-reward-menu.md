# REQ-025: Re-roll Reward Menu (Costs 1 Attempt, No Secret Counter Progress)

- **ID:** REQ-025
- **Title:** Re-roll Reward Menu Once per Menu for 1 Attempt Cost (No Free Shot, No Secret Counter)
- **Priority:** Should Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Reward / Inventory Acquisition (REQ-021 Extension)

## Description
When the reward menu is visible (triggered via the secret counter per REQ-021 — every 5 counted shots during a hole, plus reward before first attempt on each hole after the first with counter reset to `0` on hole advance), the player SHALL be able to **re-roll** the three offered upgrades **exactly once** per menu appearance at the cost of **one attempt**. Pressing the re-roll control SHALL immediately increment both `holeAttempts` and `totalAttempts` (and the `attempts` alias) by `+1`, update the HUD and win-overlay counters, **but SHALL NOT increment the secret reward counter** `secretRewardCounter` (so it does NOT advance towards the next reward), and **SHALL NOT consume a free shot** even if `freeShots > 0`. The re-rolled menu SHALL show a new set of three distinct random options from the same 6-pool `['amplify','nullify','flip','freeShots','areaUp','bouncyBall']`, replacing the previous offer. The re-roll SHALL be allowed only once per menu; after it is used the control becomes disabled/hidden until the next time the reward menu is triggered (new secret cycle or new game).

## Rationale
The 3-of-6 random offer can present undesired options (e.g., no `Amplify` when a corridor is blocked). Allowing a single paid re-roll gives agency at a meaningful cost: one attempt is the primary score metric (REQ-014), so the player trades score for choice. Excluding free shots guarantees the cost is always real - free shots are meant to *save* attempts, not to pay for re-rolls. Excluding the secret counter keeps the reward cadence predictable (every 5 *counted* shots) and prevents re-rolls from accelerating or stalling the next reward. Limiting to once per menu avoids infinite re-roll loops and keeps the decision tense.

## Requirements

1. **Re-roll State & Cost Logic** in `src/main.js`:
   - State SHALL include `rewardRerolled: boolean` (per-menu flag, `false` when menu is freshly shown, `true` after re-rolling once). It SHALL be reset to `false` whenever a new reward menu is triggered (`maybeShowRewardMenu` when creating a fresh `rewardOffered`), and also cleared on **new game** (`resetGameAfterWin`, `startNewGameFromMain` (REQ-029), `endRun` (REQ-029), `clearProgress` (REQ-027), `initLevel` with `currentHoleIndex===0`, page reload) alongside `secretRewardCounter`, `rewardPending`, `rewardMenuVisible`, `rewardOffered`.
   - While `rewardMenuVisible === true` and `rewardRerolled === false`, a re-roll SHALL be executable exactly once:
     ```js
     function rerollReward() {
       if (!rewardMenuVisible || rewardRerolled) return false;
       // Cost is always an attempt, never a free shot - per spec
       holeAttempts += 1;
       totalAttempts += 1;
       attempts = totalAttempts;
       // Do NOT touch secretRewardCounter, do NOT touch freeShots
       updateAttemptsUI();
       // Mark as used before generating new offer so second call fails
       rewardRerolled = true;
       // Generate new distinct 3-set from same POOL (uniform without replacement)
       // It MAY randomly be identical to the previous set - this is allowed, but implementation
       // SHOULD attempt to produce a different set if possible (e.g., re-shuffle until at least one element differs), not required for MVP.
       rewardOffered = shuffle([...POOL]).slice(0, 3);
       // Keep rewardMenuVisible true, rewardPending already false
       // Optionally keep hover state cleared
       rewardMenuHover = null;
       return true;
     }
     ```
   - The cost SHALL be `holeAttempts++` and `totalAttempts++` (and `attempts = totalAttempts`) **exactly once** per re-roll. It SHALL **NOT** increment `secretRewardCounter`, `freeShots` SHALL **NOT** be decremented even if `freeShots > 0`, and `holeAttempts`/`totalAttempts` SHALL still increment. Example: `freeShots=2, secretRewardCounter=3, holeAttempts=5, totalAttempts=5` → re-roll → `freeShots` stays `2`, `secretRewardCounter` stays `3`, `holeAttempts=6, totalAttempts=6`, HUD updates to `Attempts:6 Total:6`, menu shows new 3 options, re-roll control becomes disabled.
   - `rerollReward()` SHALL return `false` and do nothing if `!rewardMenuVisible` or `rewardRerolled === true` (already used) or game is `WIN`/`FLYING`. Rapid double invocation SHALL only charge once.
   - After re-roll, the player SHALL still be required to pick one of the (new) three options via `claimReward(type)` (`1`/`2`/`3` or click). `claimReward` SHALL work unchanged on the new `rewardOffered`. The secret counter SHALL remain at its pre-reroll value after claim; it will only advance on subsequent *counted* shots.

2. **Trigger & Lifecycle Interaction** with Secret Counter (REQ-021):
   - Re-roll SHALL NOT affect the secret counter flow: it does not increment it, does not reset it, and does not set `rewardPending`. The next reward after the current menu will still require 5 counted shots from the time the menu was first shown (secret counter continues from its current value `0..4`).
   - After 5 counted shots trigger (`secret 4→5 → reset to 0 + pending→menu`): re-roll in that menu costs `holeAttempts/totalAttempts +1` but keeps `secret 0`. Next reward needs 5 more counted shots (`secret 0→5`) within same hole (counter is per-hole). There is no initial reward before first attempt on hole 1 to re-roll; subsequent holes have a pre-attempt menu that can also be re-rolled once.
   - Re-roll state SHALL persist only for the current menu. New menu triggers (next secret cycle or new game) SHALL reset `rewardRerolled=false`. Death resets (`resetBall()`), `R` during play, or hole advances SHALL NOT occur while menu is visible (menu blocks), so they do not interfere. `resetGameAfterWin()` / `startNewGameFromMain()` / `endRun()` / `clearProgress()` or page reload SHALL clear `rewardRerolled` alongside secret counter.

3. **Menu Blocking & Input**:
   - While `rewardMenuVisible === true` (before and after re-roll), the game SHALL remain in blocking state per REQ-021: `AIMING`/`CHARGING` input (`ArrowLeft`/`Right`, `Space`, modifier placement) SHALL be ignored; `update()` advances particles only; `handleLaunch()` blocked.
   - Re-roll input SHALL be distinct from selection: e.g., click on a dedicated **Re-roll button** or press `KeyR` (lowercase `r`) while menu is visible and `rewardRerolled===false`. `R` during normal play (no menu) SHALL remain `resetBall`/`handleNextHole` per REQ-011; only when `rewardMenuVisible` SHALL `R` mean re-roll (and the normal `R` reset SHALL be blocked). Alternatively a dedicated `KeyX` or `KeyQ` may be used if `R` collision is undesired, but the behavior (once, costs attempt, no secret increment, no free shot) SHALL be identical. Document chosen key.
   - After re-roll, `1`/`2`/`3` SHALL select among the **new** offered options by position, not the old ones.

4. **Inside-Canvas Rendering** in `src/render.js`:
   - The reward menu `drawRewardMenu(ctx, width, height, offered, hovered)` SHALL be extended to also draw a **Re-roll control** when `rewardMenuVisible`:
     - Layout: centered below the three option buttons, e.g., button `110×28` at `(width/2 -55, cardY + 155)` (below `90×110` cards, above bottom of `340×220` card), or as a small text link. It SHALL be inside the `340×220` card area, below the three buttons, not overlapping them.
     - Visual when **available** (`rewardRerolled===false`): border `rgba(255,255,255,0.85)` `1.5px`, fill `rgba(255,255,255,0.12)` (hover `rgba(255,255,255,0.22)`), icon `↻` 14px white, label `Re-roll` 12px `700` white with `stroke rgba(0,0,0,0.65) 3px`, cost hint `(1 attempt)` 10px `rgba(255,255,255,0.85)` with stroke, key hint `[R]` 10px. Hover brightens fill and shows `cursor pointer`.
     - Visual when **used** (`rewardRerolled===true`): same button but disabled: fill `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.35)`, text `rgba(255,255,255,0.45)`, `cursor not-allowed`, no hover effect, or the button is hidden. Either disabled or hidden satisfies, but disabled with "Used" text is preferred for clarity.
     - The re-roll control SHALL be hit-tested in logical canvas coordinates via `getRewardRerollButtonLayout(width,height)` or as part of `getRewardButtonsLayout`, returning a `Rect {x,y,w,h}`. Click inside this rect when available SHALL trigger `rerollReward()`. Pressing `R`/`r` (`KeyR`) while menu visible and not yet rerolled SHALL also trigger it. Pressing `R` after already rerolled SHALL do nothing (no second cost).
   - `drawRewardMenu` signature MAY be extended to `drawRewardMenu(ctx, width, height, offered, hovered, rerolled, rerollHovered)` or the reroll state MAY be read via imported getter; either is acceptable if the button reflects `rewardRerolled` and hover.
   - No white card background; re-roll button SHALL use same high-contrast white/dark-stroke style as other buttons on `rgba(0,0,0,0.55)` dim over green.

5. **No External Storage & No HUD**:
   - No new HUD element is required outside the menu. The re-roll cost is immediately visible via `drawHUD` `Attempts`/`Total` increment and via the button disabling. No free-shot counter is involved. Debug exposure via `window.__getSecretRewardCounter()`, `window.__getRewardRerolled()`, `window.__rerollReward()` is allowed.

## Acceptance Criteria

- [ ] On fresh page load (new game, `secretRewardCounter=0`, `totalAttempts=0`, `supply={1,1,1}`) **no reward menu is visible**. After 5 counted shots, the reward menu shows **exactly three** upgrade buttons **plus** a **Re-roll button** centered below them (`↻ Re-roll (1 attempt) [R]`, `110×28`, white border, `rgba(255,255,255,0.12)` fill). The re-roll button is enabled (bright, `cursor pointer` on hover). `holeAttempts/totalAttempts` reflect the 5 counted shots, `secretRewardCounter=0`, `freeShots=0`.
- [ ] Clicking the Re-roll button (or pressing `R`/`r` while menu visible) **once** immediately increments `holeAttempts` and `totalAttempts` by `+1` (HUD updates, e.g., from `5/5 → 6/6` on first trigger), **does NOT** increment `secretRewardCounter` (stays `0`, verified via `getSecretRewardCounter()===0`), **does NOT** decrement `freeShots` (stays `0`), and replaces the three offered upgrades with a **new** random 3-set (three distinct, subset of 6-pool, may be different from previous; at least the `rewardOffered` array reference changes). The re-roll button becomes **disabled** (`rgba(255,255,255,0.06)` fill, `not-allowed` cursor, or hidden) and a second click/press of `R` does **not** cost another attempt (counters unchanged, `rewardOffered` unchanged on second attempt).
- [ ] After re-rolling on the first reward menu (after 5 counted shots, `Total 5→6` cost, secret `0`), selecting an offered upgrade (e.g., `Amplify` via `1` or click) closes the menu, `supply.amplify` increments by `1`, menu hides, `secretRewardCounter` still `0`, `holeAttempts`/`totalAttempts` remain `6` (the re-roll cost is retained). Next reward still requires 5 counted shots (`secret 0→5`), not 4.
- [ ] Re-roll with free shots present does **not** consume free shots: set `freeShots=2, secretRewardCounter=3, holeAttempts=5, totalAttempts=5`, trigger next reward (simulate `secret 4→5→0` menu: set `secretRewardCounter=0` pending, show menu). With menu visible and `freeShots=2`, click Re-roll → `freeShots` stays `2` (not `1`), `secretRewardCounter` stays `0`, `holeAttempts 5→6, totalAttempts 5→6`, HUD `6/6`, new offer, button disabled. Second `R` does nothing. Selecting `Nullify` after re-roll grants `+1` nullify, menu closes, counters stay `6/6`, `secret` remains `0`.
- [ ] Re-roll delay: after re-rolling on first menu (`Total 5→6` cost, secret `0`), launching 5 counted shots (`secret 0→5` → reset to `0` + pending) shows next menu before the 6th counted attempt, which will be `totalAttempts 6→11` (since one extra attempt was spent on re-roll). Without re-roll, the next menu would be at `totalAttempts 10`; with re-roll it is at `11` — proving the re-roll cost is an *extra* counted attempt that does not accelerate the secret counter. `secretRewardCounter` after the 5 counted shots is `0` again.
- [ ] Re-roll limited to once per menu: on a menu triggered after 5 counted shots (`secret 0` pending), `rewardRerolled` is `false` initially. Click Re-roll once → `true`, counters `+1`, new offer. Click Re-roll again (or press `R` again) → `rerollReward()` returns `false`, counters do **not** increment again, offer does not change. After claiming an upgrade and later triggering the next menu (after another 5 counted shots), the new menu's re-roll button is again enabled (`rewardRerolled` reset to `false`), and one more re-roll can be purchased for another `+1` attempt.
- [ ] Re-roll while `WIN` overlay is shown is blocked (no `R` re-roll, no attempt cost). Re-roll during `FLYING` is impossible because menu is not visible. Pressing `R` during normal `AIMING` with no menu still does `resetBall` per REQ-011, not re-roll.
- [ ] Hidden cost: canvas top HUD still shows only `Hole: N/M` `Attempts: X` `Total: Y` (now incremented by re-roll), win overlay shows `Attempts this hole: X, Total: Y` including the re-roll attempt. No `Free Shots` or `Secret` text is shown in HUD. `window.__getSecretRewardCounter()` and `window.__getRewardRerolled()`/`getRewardRerolled()` return correct hidden values.
- [ ] No 3rd-party libraries; pure vanilla JS `secretRewardCounter` unchanged on re-roll, `holeAttempts++`/`totalAttempts++`/`attempts=totalAttempts` once per re-roll, `freeShots` untouched, `rewardRerolled` boolean per-menu, `Math.random()` shuffle 3-of-6 for new offer, hidden cost logic.

## Dependencies

- REQ-021 (upgrade reward menu via secret counter, 3-random-of-6, `POOL`, `maybeShowRewardMenu`, `claimReward`, `rewardPending`, `secretRewardCounter` — no initial menu)
- REQ-014 (attempts counter, `holeAttempts`, `totalAttempts`, `handleLaunch`, `resetGameAfterWin`, HUD `drawHUD`)
- REQ-022 (free shots hidden counter, `freeShots`, must *not* be consumed on re-roll)
- REQ-011 (game states `AIMING`/`FLYING`/`WIN`, `resetBall`, `loadLevel`; `R` key collides with re-roll only when menu visible)
- REQ-012 (rendering inside canvas, high-contrast buttons, no white card)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let rewardRerolled = false; // per-menu, hidden
  function getRewardRerolled(){ return rewardRerolled; }
  function rerollReward(){
    if(!rewardMenuVisible || rewardRerolled) return false;
    // Always costs an attempt, never a free shot, never secret counter
    holeAttempts += 1;
    totalAttempts += 1;
    attempts = totalAttempts;
    updateAttemptsUI();
    rewardRerolled = true;
    // New random offer, keep menu visible
    rewardOffered = shuffle([...POOL]).slice(0,3);
    rewardMenuHover = null;
    return true;
  }
  // maybeShowRewardMenu() for new menu: rewardRerolled = false; rewardOffered = shuffle...
  // After reaching 5 counted shots: secretRewardCounter=0; rewardPending=true; on next AIMING, maybeShow sets rewardRerolled=false and shows menu
  // claimReward(): after selection, rewardRerolled is irrelevant until next menu;
  // New game: rewardRerolled=false; secretRewardCounter=0; rewardPending=false; etc.
  // Reroll input: in window keydown when rewardMenuVisible, if (e.code==='KeyR' && !rewardRerolled) { rerollReward(); e.preventDefault(); } else if (e.code==='KeyR' && rewardRerolled) { e.preventDefault(); } // block second
  // Click: getRewardRerollButtonLayout(width,height) -> Rect 110x28 at (width/2-55, cardY+155); if inside and !rewardRerolled, rerollReward()
  ```
- Hit-testing: define `getRewardRerollButtonLayout(width,height)` returning `Rect {x,y,w,h}` for the re-roll button, same coords used in `drawRewardMenu` and click handler. Alternatively extend `getRewardButtonsLayout` to also return reroll rect.
- Visual: re-roll button `110×28`, `rgba(255,255,255,0.12)` fill, `1.5px white` border, `↻` 14px, `Re-roll` 12px `700` white, `(1 attempt)` 10px `rgba(255,255,255,0.85)`, `[R]` 10px; hover `rgba(255,255,255,0.22)`, disabled `0.06` fill. Centered at `width/2`, `cardY+155` (below 3 cards).
- Interaction with secret counter: re-roll cost is *outside* the counted-shot flow; it increments `totalAttempts` but the secret counter stays, so the next reward still needs 5 counted shots from its current value (e.g., `0→5` after re-roll still needs 5 more counted shots, not 4).
- A11y: re-roll button text white with `stroke rgba(0,0,0,0.65) 3px` for contrast on dim.

## File Paths

- `src/main.js:1` (rewardRerolled per-menu flag, rerollReward() costs 1 attempt no secret/freeShot, maybeShowRewardMenu resets flag, claimReward leaves flag until next menu, handleLaunch unchanged, resetGameAfterWin/startNewGameFromMain/endRun/clearProgress clears flag, window.__rerollReward/__getRewardRerolled, R key re-bound to re-roll when menu visible)
- `src/render.js:1` (drawRewardMenu draws Re-roll button `110×28` below 3 cards, getRewardRerollButtonLayout, hover/disabled states, high-contrast white text)
- `index.html:1` (no DOM for re-roll; canvas-only)
- `style.css:1` (no new CSS needed for canvas menu)
