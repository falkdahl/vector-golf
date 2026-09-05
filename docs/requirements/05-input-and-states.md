# 05 — Input, Game States & Attempts

- **ID:** 05-input-and-states
- **Supersedes:** REQ-006, REQ-007, REQ-011, REQ-014, REQ-019
- **Type:** Functional + UI
- **References:** `02-canvas-system.md` (loop dt, container), `04-physics-and-collision.md` (ball), `07-modifiers.md` (modifiers block), `09-rewards-and-progression.md` (reward blocking)

## 1. Input Module `src/input.js`

- Exports `initInput()`, `getAimAngle()`, `setAimAngle(v)`, `getCharge()`, `isCharging()`.
- Tracks `keys` via `window keydown/keyup`; `e.preventDefault()` for `ArrowLeft/Right`, `Space`, `KeyR`, `KeyH`, `Escape`/`KeyP` (see `10-persistence-and-menus.md` priority).
- `getCanvasMousePos(e, canvas)` uses `game.getBoundingClientRect()` scaled to `LOGICAL_W/H` (see `02-canvas-system.md`).

## 2. Aiming — Orbit Around Ball

- Active only when `gameState ∈ {'AIMING','CHARGING'}`; ignored when `FLYING`/`WIN`/`rewardMenuVisible`/`mainMenuVisible`.
- `ArrowLeft`/`ArrowRight` (or `A`/`D` optional) rotate `aimAngle` time-based: `angle += dir * 1.6 rad/s * dt` (equivalently `ROTATION_SPEED≈2.5°/frame ≈90-150°/s` at 60fps), wrapping `[0,2π)`, smooth on hold (`e.repeat` handled via key state).
- Visuals `src/render.js:drawAim`: dashed orbit `r≈28-32` `rgba(0,0,0,0.2)`, aim line `30px` (`30+charge*50` when charging), indicator dot at `pos + (cos angle, sin angle)*orbitRadius`.
- **Persistence (REQ-019)**: `aimAngle` is preserved across death resets. Only `loadLevel(index)` (new hole) initializes `aimAngle = atan2(hole.y-tee.y, hole.x-tee.x)`. `resetBall()` shall NOT call `setAimAngle`.

## 3. Power Charging & Force Bar

- While `state==='AIMING'` and first `Space keydown` (`!e.repeat`), set `charging=true, charge=0, holdTime=0` and enter `CHARGING`.
- Each `update(dt)` while `charging`: `holdTime+=dt; charge=min(holdTime/MAX_CHARGE_TIME,1)` where `MAX_CHARGE_TIME=1.5`, linear (or `1-pow(1-t,1.5)` ease-out — document).
- On `Space keyup` while `charging`: `power = MIN_POWER + charge*(MAX_POWER-MIN_POWER)` (`MIN_POWER=50, MAX_POWER=600`), `launchBall(angle,power)`, `charging=false`. Tap `<0.1s` yields 5-10% power; hold ≥1.5s clamps at 100% (optional pulsate).
- Force bar `drawForceBar` under ball (see `03-rendering.md`) only while `CHARGING`; hidden otherwise. Aim line length scales `30+charge*50`.
- Launch is ignored if ball moving.

## 4. Attempts Counters — Max Attempts + Attempts Left (replaces Free Shots)

- State in `src/main.js`: `currentHoleIndex` (0-based, displayed 1-based), `holeAttempts` (attempts used this hole, `0..maxAttempts`), `totalAttempts` (=`attempts` alias, total across run), `maxAttempts` (hidden per-run max, starts `10`, increased by `+5` via `Max Attempts +5` reward, see `09`), `totalHoles = LEVELS.length` (see `08-level-generation.md`). Derived `attemptsLeft = max(0, maxAttempts - holeAttempts)` — **hidden max, shown left**.
- **Increment exactly once per launch** (`handleLaunch` always counted, no `freeShots` gating — `freeShots` removed per `09`): on each `launchBall` do `holeAttempts++; totalAttempts++; attempts=totalAttempts; attemptsLeft = maxAttempts - holeAttempts; secretRewardCounter++` (see `09`); `R` without launch does not increment. After increment, check **Game Over** (see §5): if `attemptsLeft <= 0` and `gameState !== 'WIN'` (hole not completed within `maxAttempts` attempts), set `gameState='GAME_OVER'`, show **Game Over** screen (see below), block all input except return to menu.
- **HUD** is canvas-drawn `drawHUD` (see `03-rendering.md`) with strip behind text, visible in `AIMING`/`CHARGING`/`FLYING`. Now shows **`Attempts Left: X`** (where `X = max(0, maxAttempts - holeAttempts)`) **instead of `Attempts: X`**, centered; left still `Hole: N/M`, right `Total: Y`. Win overlay (DOM) shows `You Win! Hole N/M - Attempts this hole: X, Total: Y` (still `holeAttempts`/`totalAttempts`); final hole shows `Game Complete! Total Attempts: Y`. Game Over overlay shows `Game Over` (see §5).
- **Lifecycle**: death (`resetBall`, tree bounce) does not reset counters; `R` during play does not reset; hole advance (`handleNextHole`, see `09-rewards-and-progression.md`) resets `holeAttempts=0` (so `attemptsLeft` resets to `maxAttempts`) but keeps `totalAttempts` and **keeps `maxAttempts`** (increased max persists across holes); `WIN`/`GAME_COMPLETE` → `R`/`resetGameAfterWin`/`startNewGameFromMain`/`endRun` resets all to `0` with `maxAttempts=10` (see `10-persistence-and-menus.md`) and also resets `supply`/`areaUpgradeCount` etc. **Game Over** → `Return to Main Menu` does `clearProgress()` (see `10`) and returns to entry main menu.
- **Max Attempts reward** (`Max Attempts +5`, see `09`): `maxAttempts = max(10, maxAttempts + 5)` (exactly `+5` per grant), persists for remainder of run, retroactively increases `attemptsLeft` (`max - holeAttempts`) immediately. No Free Shots.

## 5. Game States & Transitions — including GAME_OVER

States (string enum in `src/main.js`): `AIMING`, `CHARGING`, `FLYING` (covers drifting), `WIN`, `GAME_OVER` (no `REST_CHECK`).

**GAME_OVER** (new per max-attempts): when `holeAttempts >= maxAttempts` (i.e. `attemptsLeft <=0`) without winning the hole, `gameState='GAME_OVER'`, `ball.isMoving=false`, show **Game Over** screen (see below). While `GAME_OVER`, `updateBall`/`handleLaunch`/modifier placement/`maybeShowRewardMenu`/`pause` are blocked; only `Return to Main Menu` (click or `Escape`/`Enter`) is accepted. That action does `clearProgress()` (remove `STORAGE_KEY`, reset `currentHoleIndex=0, holeAttempts=0, totalAttempts=0, maxAttempts=10, supply={1,1,1}, areaUpgradeCount=0, modifiers=[]`, see `10`) and returns to entry main menu (`mainMenuVisible=true, isInLevelPause=false`). No `Next` or `Continue` from Game Over; the run is cleared from memory (reload shows entry with no `Continue`).

- `AIMING`: ball at tee `vel=0`, accept aim+Space→`CHARGING`, modifier placement allowed (see `07-modifiers.md`), hotbar visible (see `07-modifiers.md`).
- `CHARGING`: `Space` held, update force bar, angle may be locked (document), release → `launch()` → `FLYING`.
- `FLYING`: physics updates, wind always applied (even when slow), collision/edge/hole checked each tick; no aiming/charging/modifier input; persists while drifting (no auto-rest).
- `WIN`: ball entered hole (see `04-physics-and-collision.md`), `vel=0` frozen, overlay shown, physics paused, input blocked except `Next`/`R` (or final-hole `Continue`→main menu per `09/10`).

`resetBall()` (idempotent, synchronous, callable from collision/OOB/`R`):

- `ball.pos={...tee}; ball.vel={0,0}; ball.isMoving=false; charge=0; charging=false; state='AIMING';` clear win/Game Over overlay if not in those states; **do NOT touch** `aimAngle` (per §2), `holeAttempts`/`totalAttempts`/`maxAttempts`, `supply`/`areaUpgradeCount`, `modifiers` (they persist through death), `secretRewardCounter` (see `09-rewards-and-progression.md`). No `bouncy` (trees always bounce, see `04` §5).

`R` key:
- In `AIMING`/`FLYING` → `resetBall()` (keeps aim angle, no counter increment).
- In `WIN` (via `handleNextHole` / `resetGameAfterWin`, see `09/10`) → hole advance or full reset (see `09-rewards-and-progression.md` §7 and `10-persistence-and-menus.md`).
- When `rewardMenuVisible` → `R` means **re-roll** (see `09-rewards-and-progression.md` §6), not reset.
- When `mainMenuVisible` (pause/entry) → `R` is blocked (pause uses `Continue`/`Escape`/`P`).

Attempts/hole progression (see `09-rewards-and-progression.md` for full trigger including supply consumption): non-final win → `Next` → consume modifiers from supply (see `07-modifiers.md`), clear modifiers, `currentHoleIndex++`, `holeAttempts=0`, `loadLevel(currentHoleIndex)`, `state='AIMING'`, hide win overlay; final win → `Continue`→`clearProgress()`→main menu (see `10-persistence-and-menus.md`).

## Acceptance Criteria

- [ ] Orbit and aim line update at 60fps, `ArrowRight` 1s ≈90-150°; `aimAngle` persists after death but re-initializes on new hole.
- [ ] Space tap/hold 0s/0.75s/1.5s shows 0%/50%/100% bar; bar only under ball while `CHARGING`; color green→red.
- [ ] `holeAttempts`/`totalAttempts` increment exactly once per launch; `maxAttempts` starts `10`, `attemptsLeft = maxAttempts - holeAttempts` shown as `Attempts Left`; `Max Attempts +5` reward makes `maxAttempts+=5`. No `freeShots`.
- [ ] `resetBall` reappears at tee within 1 frame on hit/edge/`R` and does not interrupt HUD counts; `maxAttempts` persists, `holeAttempts` only reset on hole win/Game Over.
- [ ] No launch when `FLYING`; no aiming while `WIN`/`GAME_OVER`/`rewardMenuVisible`/`mainMenuVisible`.
- [ ] At `holeAttempts == maxAttempts` without win, `gameState='GAME_OVER'`, `Game Over` screen shown with only `Return to Main Menu`, which does `clearProgress()` and returns to entry (no `Continue` after).
- [ ] HUD shows `Attempts Left: X` (not `Attempts: X`), `X = maxAttempts - holeAttempts`, updates after each launch and after `Max Attempts +5`.

## File Paths

- `src/input.js:1`, `src/main.js:1` (`state`, `resetBall`, `loadLevel`, `handleLaunch`, `handleNextHole`), `src/render.js:1` (`drawAim`, `drawHUD`, `drawForceBar`)
