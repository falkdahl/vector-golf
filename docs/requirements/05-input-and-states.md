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

## 4. Attempts Counters

- State in `src/main.js`: `currentHoleIndex` (0-based, displayed 1-based), `holeAttempts`, `totalAttempts` (=`attempts` alias), `totalHoles = LEVELS.length` (see `08-level-generation.md`).
- **Increment exactly once per counted launch** (see `09-rewards-and-progression.md` for free-shots gating): when `freeShots===0` at `handleLaunch`, do `holeAttempts++; totalAttempts++; attempts=totalAttempts; secretRewardCounter++ (see §9)`; when `freeShots>0`, do `freeShots--` instead. `R` without launch does not increment.
- **HUD** is canvas-drawn `drawHUD` (see `03-rendering.md`) with strip behind text, visible in `AIMING`/`CHARGING`/`FLYING`. Win overlay (DOM) shows `You Win! Hole N/M - Attempts this hole: X, Total: Y`; final hole shows `Game Complete! Total Attempts: Y`.
- **Lifecycle**: death (`resetBall`) does not reset counters; `R` during play does not reset; hole advance (`handleNextHole`, see `09-rewards-and-progression.md`) resets `holeAttempts=0` but keeps `totalAttempts`; `WIN`/`GAME_COMPLETE` → `R`/`resetGameAfterWin`/`startNewGameFromMain`/`endRun` resets all to `0` (see `10-persistence-and-menus.md`) and also resets supply/freeShots etc.

## 5. Game States & Transitions

States (string enum in `src/main.js`): `AIMING`, `CHARGING`, `FLYING` (covers drifting), `WIN` (no `REST_CHECK`).

- `AIMING`: ball at tee `vel=0`, accept aim+Space→`CHARGING`, modifier placement allowed (see `07-modifiers.md`), hotbar visible (see `07-modifiers.md`).
- `CHARGING`: `Space` held, update force bar, angle may be locked (document), release → `launch()` → `FLYING`.
- `FLYING`: physics updates, wind always applied (even when slow), collision/edge/hole checked each tick; no aiming/charging/modifier input; persists while drifting (no auto-rest).
- `WIN`: ball entered hole (see `04-physics-and-collision.md`), `vel=0` frozen, overlay shown, physics paused, input blocked except `Next`/`R` (or final-hole `Continue`→main menu per `09/10`).

`resetBall()` (idempotent, synchronous, callable from collision/OOB/`R`):

- `ball.pos={...tee}; ball.vel={0,0}; ball.isMoving=false; charge=0; charging=false; state='AIMING';` clear win overlay; **do NOT touch** `aimAngle` (per §2), `holeAttempts`/`totalAttempts`, `supply`/`freeShots`/`areaUpgradeCount`/`bouncyBallCount`, `modifiers` (they persist through death), `secretRewardCounter` (see `09-rewards-and-progression.md`). Re-initialize `bouncyRemaining=bouncyBallCount` (if bouncy feature present, see `04-physics-and-collision.md` §5).

`R` key:
- In `AIMING`/`FLYING` → `resetBall()` (keeps aim angle, no counter increment).
- In `WIN` (via `handleNextHole` / `resetGameAfterWin`, see `09/10`) → hole advance or full reset (see `09-rewards-and-progression.md` §7 and `10-persistence-and-menus.md`).
- When `rewardMenuVisible` → `R` means **re-roll** (see `09-rewards-and-progression.md` §6), not reset.
- When `mainMenuVisible` (pause/entry) → `R` is blocked (pause uses `Continue`/`Escape`/`P`).

Attempts/hole progression (see `09-rewards-and-progression.md` for full trigger including supply consumption): non-final win → `Next` → consume modifiers from supply (see `07-modifiers.md`), clear modifiers, `currentHoleIndex++`, `holeAttempts=0`, `loadLevel(currentHoleIndex)`, `state='AIMING'`, hide win overlay; final win → `Continue`→`clearProgress()`→main menu (see `10-persistence-and-menus.md`).

## Acceptance Criteria

- [ ] Orbit and aim line update at 60fps, `ArrowRight` 1s ≈90-150°; `aimAngle` persists after death but re-initializes on new hole.
- [ ] Space tap/hold 0s/0.75s/1.5s shows 0%/50%/100% bar; bar only under ball while `CHARGING`; color green→red.
- [ ] `holeAttempts`/`totalAttempts` increment exactly once per counted launch; free-shot launches do not increment (see `09-rewards-and-progression.md`).
- [ ] `resetBall` reappears at tee within 1 frame on hit/edge/`R` and does not interrupt HUD counts.
- [ ] No launch when `FLYING`; no aiming while `WIN`/`rewardMenuVisible`/`mainMenuVisible`.

## File Paths

- `src/input.js:1`, `src/main.js:1` (`state`, `resetBall`, `loadLevel`, `handleLaunch`, `handleNextHole`), `src/render.js:1` (`drawAim`, `drawHUD`, `drawForceBar`)
