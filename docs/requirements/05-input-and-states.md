# 05 — Input, Game States, Attempts & Banners

- **ID: 05-input-and-states
- **Supersedes: REQ-006, REQ-007, REQ-011, REQ-014, REQ-019, 11-banners
- **Type:** Functional + UI
- **References:** `02-canvas-system.md` (loop dt, container), `04-physics-and-collision.md` (ball), `06-wind-system.md` (modifiers block), `08-rewards-and-progression.md` (reward blocking)

## 1. Input Module `src/input.js`

- Exports `initInput()`, `getAimAngle()`, `setAimAngle(v)`, `getCharge()`, `isCharging()`.
- Tracks `keys` via `window keydown/keyup`; `e.preventDefault()` for `ArrowLeft/Right`, `Space`, `KeyR`, `KeyH`, `Escape`/`KeyP` (see `08-rewards-and-progression.md` priority).
- `getCanvasMousePos(e, canvas)` uses `game.getBoundingClientRect()` scaled to `LOGICAL_W/H` (see `02-canvas-system.md`).

## 2. Aiming — Orbit Around Ball

- Active only when `gameState ∈ {'AIMING','CHARGING'}`; ignored when `FLYING`/`WIN`/`rewardMenuVisible`/`mainMenuVisible`/`bannerVisible`.
- `ArrowLeft`/`ArrowRight` (or `A`/`D` optional) rotate `aimAngle` time-based: `angle += dir * 1.6 rad/s * dt` (equivalently `≈90-150°/s` at 60fps), wrapping `[0,2π)`, smooth on hold (`e.repeat` via key state).
- Visuals `src/render.js:drawAim`: dashed orbit `r≈28-32` `rgba(0,0,0,0.2)`, aim line `30px` (`30+charge*50` when charging), indicator dot at `pos + (cos angle, sin angle)*orbitRadius`.
- **Persistence:** `aimAngle` preserved across death resets. Only `loadLevel(index)` initializes `aimAngle = atan2(hole.y-tee.y, hole.x-tee.x)`. `resetBall()` shall NOT call `setAimAngle`.

## 3. Power Charging & Force Bar

- While `state==='AIMING'` and first `Space keydown` (`!e.repeat`), set `charging=true, charge=0, holdTime=0` and enter `CHARGING`.
- Each `update(dt)` while `charging`: `holdTime+=dt; charge=min(holdTime/MAX_CHARGE_TIME,1)` where `MAX_CHARGE_TIME=1.5`, linear.
- On `Space keyup` while `charging`: `power = MIN_POWER + charge*(MAX_POWER-MIN_POWER)` (`MIN_POWER=50, MAX_POWER=600`), `launchBall(angle,power)`, `charging=false`. Tap `<0.1s` yields 5-10% power; hold ≥1.5s clamps at 100%.
- Force bar `drawForceBar` under ball (see `03-rendering.md`) only while `CHARGING`; hidden otherwise. Aim line length scales `30+charge*50`.
- Launch ignored if ball moving.

## 4. Attempts Counters — Canonical Definition

This section is the **single source of truth** for attempts. All other files (`03-rendering.md`, `06-wind-system.md`, `08-rewards-and-progression.md`) shall reference this section instead of re-defining.

- State in `src/main.js`: `currentHoleIndex` (0-based, displayed 1-based), `holeAttempts` (0..maxAttempts), `totalAttempts` (alias `attempts`, total across run), `maxAttempts` (static `10`, never increased; legacy `>10` clamped on load), `totalHoles = LEVELS.length`. Derived `attemptsLeft = max(0, maxAttempts - holeAttempts)`. **Attempts are consumed on attempt reset (failure), not on launch.** `holeAttempts` increments only when a non-free attempt is reset (ball dies via OB/water/edge or `R`/`Next Attempt` while `FLYING`), never on `handleLaunch`. This ensures counter decreases after reset, not at launch.
- Free Shot: `supply.freeShot` + `isFreeShotActive` + `freeShotFlightActive` (see `06-wind-system.md` §5.2). `supply.rotate` starts `1`, `supply.freeShot` starts `0` (see `06-wind-system.md` §6).
- **Launch branching (no counter decrement):**
  - Before branching, check `getAttemptsLeft()` (current left, not yet decremented for this attempt).
  - If `!isFreeShotActive && supply.freeShot>0 && getAttemptsLeft()<=1` (legacy auto-arm kept for safety, but primary Free Shot arming now also occurs via banner logic after counter decreases to 1) then `isFreeShotActive=true` and `syncFreeShotGlow()`. No manual hotkey; `4` is `rotate`.
  - If `isFreeShotActive && supply.freeShot>0`: free launch — do NOT increment `holeAttempts`/`totalAttempts` now or on reset; `supply.freeShot--`; set `freeShotFlightActive=true` (marks this flight as free), keep `isFreeShotActive` while `supply.freeShot>0` else `false` (isFreeShotActive stays armed for next free if supply remains); `updateHotbarUI(); saveProgress();` HUD `(+Y)` updates; `attemptsLeft` unchanged; no Game Over check. On reset after this flight, `freeShotFlightActive` prevents decrement.
  - Else (normal): launch normally — do NOT increment `holeAttempts`/`totalAttempts` at launch; `holeAttempts` will increment only on subsequent reset if this flight fails (see §5). Reward menu is triggered by hole-start/treasure only (see `08-rewards-and-progression.md` §3).
- **Attempt reset / failure handling (counter decrement):**
  - When ball was `FLYING` and fails (OB/water/edge) or player presses `R`/`Next Attempt` while `FLYING`, handle reset:
    - If `freeShotFlightActive===true`: free attempt — do NOT increment `holeAttempts`/`totalAttempts`; clear `freeShotFlightActive=false`; `syncFreeShotGlow()`; `attemptsLeft` unchanged.
    - Else: `holeAttempts++; totalAttempts++; attempts=totalAttempts; attemptsLeft = maxAttempts - holeAttempts; updateAttemptsUI(); saveProgress();`
    - After decrement, check `attemptsLeft`:
      - If `attemptsLeft===0 && supply.freeShot===0`: no attempts remaining → `showGameOver()` immediately (do not return to `AIMING`).
      - Else if `attemptsLeft===1`:
        - If `supply.freeShot>0`: show `Free Shot!` banner (similar to Last Attempt, `drawCenterBanner` text `Free Shot!` `700 22px`) for `1000ms`, block input, and turn on free shot modifier: `isFreeShotActive=true; syncFreeShotGlow(); updateHotbarUI(); saveProgress();` (Free Shot banner has same blocking as Last Attempt, deduped via `lastFreeShotBannerValue`).
        - Else (`freeShot===0`): enter **Last Attempt state** (`isLastAttemptForReset()` / `isLastAttemptForSoftlock()` true when `attemptsLeft===1 && freeShot===0`): show `Last Attempt` banner, hide `Next Attempt` button in pause menu, update softlock banner to last-attempt text, and disable `R` hotkey after ball is launched (see §5). Last Attempt banner shown once per hole via `lastAttemptsBannerValue`.
  - `R` or `Next Attempt` while `AIMING` (ball at tee, not yet launched) does NOT decrement counter (no attempt consumed).
- **HUD:** canvas-drawn `drawHUD` (see `03-rendering.md`) shows `Hole: N/M` left, `Attempts Left: X (+Y)` centered (only `(+Y)` when `Y>0`, never `(+0)`), `Total: Y` right. HUD updates after decrement (on reset), not on launch.
- **Lifecycle:** death/`resetBall` failure path now decrements counters (unless free flight); `R` in `AIMING` does not decrement; `R`/`Next Attempt` in `FLYING` decrements unless free or last attempt (where `R` is disabled); hole advance resets `holeAttempts=0` but keeps `totalAttempts`/`maxAttempts`/`supply`; `WIN`/`GAME_OVER` → `R`/`Continue` resets all to `0` with `supply={1,1,1,1,0}` (see `08-rewards-and-progression.md`). Last attempt state is checked **after** counter is decreased (post-reset).

## 5. Game States & Transitions — including GAME_OVER

States: `AIMING`, `CHARGING`, `FLYING` (covers drifting), `WIN`, `GAME_OVER`. Transient banner states `holeBannerVisible`/`attemptsBannerVisible` (see §7) block input like `rewardMenuVisible`.

**GAME_OVER** (immediate on last-attempt failure): when last counted attempt fails (`attemptsLeft<=0` without winning) after allowing flight to finish, trigger `gameState='GAME_OVER'` as soon as `terrainHit`/`waterHit`/`edgeOut` detected while `FLYING`, without `resetBall()`. Hide `rewardMenuVisible`/`rewardPending`. Show `Game Over` dim `rgba(0,0,0,0.55)` + big title `Game Over` + green `Continue` `#gameover-return-button` with `Press R to continue`. Free launches never trigger Game Over; auto-arm can prevent `attemptsLeft` reaching `0`. Fallback: `handleLaunch` while `attemptsLeft<=0` also shows Game Over. While `GAME_OVER`, only `Continue`/`R` (also `Escape`/`Enter`) accepted → `clearProgress()` and return to entry menu.

- `AIMING`: ball at tee `vel=0`, accept aim+Space→`CHARGING`, modifier placement allowed, hotbar visible.
- `CHARGING`: `Space` held, update force bar, release → `launch()` → `FLYING`.
- `FLYING`: physics updates, wind always applied, collision/edge/hole checked each tick; no aiming/charging/modifier input; persists while drifting.
- `WIN`: ball entered **final** hole per `08-rewards-and-progression.md` §1; `WIN` state frozen, Victory overlay per `03-rendering.md` §4. Non-final holes auto-advance without `WIN`.

`resetBall()` (idempotent): `ball.pos={...tee}; vel={0,0}; isMoving=false; charge=0; charging=false; state='AIMING';` clear overlays if not `WIN`/`GAME_OVER`; do NOT touch `aimAngle`, `holeAttempts`/`totalAttempts`/`maxAttempts`, `supply`/`isFreeShotActive`/`fieldExtenderCount` (alias `areaUpgradeCount`)/`powerCellCount`, `modifiers`, `treasure`.

`R` key:
- In `AIMING` → `resetBall()` (always, does not consume attempt if ball not yet launched).
- In `FLYING` → `resetBall()` except on last attempt (`isLastAttemptForReset()` i.e. `getAttemptsLeft()===1 && supply.freeShot===0` after counter decreased on previous reset, `R` disabled after ball is launched on last attempt, ball must play out / End Run). You can not reset on last attempt once ball is launched.
- In `WIN`/`GAME_OVER` → `R` or green `Continue` → `clearProgress()` → entry menu.
- When `rewardMenuVisible` → `R` = **re-roll** (see `08-rewards-and-progression.md` §6), not reset.
- When `mainMenuVisible` → `R` blocked.
- **Pause `Next Attempt` button (`#pause-next-attempt-button`, legacy `#pause-reset-attempt-button`)** between `Continue` and `End Run` in `#pause-overlay` → same effect as `R` (see `09-persistence-and-campaign.md` §6): implemented as closing pause then performing `R` logic above, so visible result is `resetBall()` (or re-roll/`clearProgress` branching if applicable, though pause cannot be open during `rewardMenuVisible`/`WIN`/`GAME_OVER`). **When Last Attempt state is active (`getAttemptsLeft()===1 && supply.freeShot===0` after counter decreased), the button shall be hidden (`display:none` / `.hidden` / `classList.toggle("hidden", true)`, `getElementById('pause-next-attempt-button')` and legacy `getElementById('pause-reset-attempt-button')` hidden) — pause shows only `Continue`/`End Run` and `R` has no effect after launch.**

Hole progression: non-final win → auto-advance → consume supply, clear modifiers, `currentHoleIndex++`, `holeAttempts=0`, `loadLevel(next)`, `AIMING`; final win → Victory → `R`/`Continue` → `clearProgress()` → main menu (see `08-rewards-and-progression.md`).

## 6. Banners — Merged from 05-input-and-states (Transient Center Overlays)

Three transient center banners share reward menu backdrop/style (Hole, Last Attempt, Free Shot). All block `handleLaunch`/placement/aim for `1000ms ±100ms`; wind still animates; auto-hide; `WIN`/`GAME_OVER` hides immediately; not persisted. **Attempts now decrement on reset, so banners are triggered after counter decreased (post-reset) when `attemptsLeft===1`, not before launch.**

- **Shared style:** full-canvas dim `rgba(0,0,0,0.55)` on `fgCtx`, `700 22px white stroke 5px` centered `width/2,height/2`, via `drawCenterBanner`/`drawHoleBanner`/`drawAttemptsBanner`/`drawFreeShotBanner`.
- **Hole Banner** — at start of every hole (`loadLevel`/`handleCoursePlay`/`advanceHole` immediately after level assignment, before `maybeShowRewardMenu()`): text `Hole ${currentHoleIndex+1}` (alternatives `Hole N/M` acceptable, must contain `Hole` + 1-based number). Set `holeBannerVisible=true` for `1000ms`, block `maybeShowRewardMenu`/`handleLaunch`/`updateBall`; after timeout `holeBannerVisible=false` then auto-call `maybeShowRewardMenu()` if `rewardPending` (holes >0 show `Choose an Upgrade`; hole 1 has no pending).
- **Attempts Banner — Last Attempt** — after counter decreased to `attemptsLeft===1 && supply.freeShot===0` (last attempt state, checked post-reset) and `gameState ∈ {'AIMING','CHARGING'}` and `!holeBannerVisible && !rewardMenuVisible && !freeShotBannerVisible && lastAttemptsBannerValue!==1`: text `Last Attempt` (must contain `Last`+`Attempt`). Same blocking; show at most once per hole cycle (dedupe via `lastAttemptsBannerValue`); reset on hole advance/new game/Game Over. Suppressed while `supply.freeShot>0` (shows Free Shot instead). Triggered by `handleAttemptFailure` post-decrement, not by `handleLaunch`.
- **Free Shot Banner** — after counter decreased to `attemptsLeft===1 && supply.freeShot>0` (still has free shots) and `gameState ∈ {'AIMING','CHARGING'}` and `!holeBannerVisible && !rewardMenuVisible && lastFreeShotBannerValue!==1`: text `Free Shot!` (must contain `Free Shot`, case-insensitive, exact `Free Shot!`). Same blocking, same style as Last Attempt (dim, 22px, 1000ms), show at most once per hole cycle when `lastFreeShotBannerValue` deduped; reset on hole advance/new game/Game Over. When shown, free shot modifier is turned on: `isFreeShotActive=true; syncFreeShotGlow(); updateHotbarUI(); saveProgress();` (auto-arm for next launch). Suppressed when `freeShot===0`.
- **State & API:** `holeBannerVisible`, `holeBannerText`, `holeBannerTimer`, `attemptsBannerVisible`, `attemptsBannerText`, `attemptsBannerTimer`, `lastAttemptsBannerValue`, `freeShotBannerVisible`, `freeShotBannerText`, `freeShotBannerTimer`, `lastFreeShotBannerValue`; exports `isHoleBannerVisible()`, `showHoleBanner()`, `isAttemptsBannerVisible()`, `showAttemptsBanner()`, `isFreeShotBannerVisible()`, `showFreeShotBanner()` plus `window.__*`.
- **Rendering:** `drawCenterBanner(ctx,W,H,text)` / `drawFreeShotBanner` called from `render()` after `drawHUD`/`drawForceBar` but before `drawRewardMenu`; `holeBannerVisible` takes precedence over `attemptsBannerVisible`/`freeShotBannerVisible` over `rewardMenuVisible`. Free Shot banner uses same `drawCenterBanner` helper with text `Free Shot!`.

## 7. Softlock Detection Banner (Non-Blocking)

Softlock occurs when ball is in `FLYING` (including wind drift) but makes no progress toward hole or death for an extended duration (oscillating, equilibrium, or confined drift).

- **Detection — active only while `gameState==='FLYING'` and `!mainMenuVisible && !pauseMenuVisible && !rewardMenuVisible && !holeBannerVisible && !attemptsBannerVisible && gameState!=='WIN' && gameState!=='GAME_OVER'`:**
  - Track `softlockFlightTime` (seconds since last `handleLaunch`) accumulating `dt`.
  - Sample ball position every `SOFTLOCK_SAMPLE_INTERVAL=0.5s ±0.1s` into `softlockHistory` retaining last `SOFTLOCK_WINDOW=6s` (12 samples).
  - After `softlockFlightTime >= SOFTLOCK_MIN_TIME=8s ±1s` and history length `>=10` (≈5s of samples), compute confinement: `maxDist = max(hypot(currentPos - p)) for p in history` or bounding-box `max(dx,dy)` of history including current. If `maxDist < SOFTLOCK_THRESHOLD=75px ±20px` (alternatively boundingbox `<80px` in both axes), consider softlocked.
  - Additional guard: `distToHole` not decreasing significantly over window may also be used, but confinement alone is sufficient. Speed `<15 px/s` averaged over window may be secondary.
  - On detection set `softlockBannerVisible=true` with text:
    - Normal: `Stuck? Press R to reset — or use Next Attempt in pause menu` (must contain `Press R`/`R` and `pause`/`Pause menu` and `Next Attempt`/`Next`).
    - Last attempt (when `getAttemptsLeft()===1 && supply.freeShot===0` while `FLYING` or after counter decreased to 1, i.e. last attempt state): `Stuck on last attempt? End Run in pause menu (Escape)` (exact text, must contain `last attempt`/`last`, `End Run`/`End`, `pause menu`/`pause`, `Escape`/`Esc`, no `Press R`). Banner is **non-blocking**: `updateBall` and `updateWind` keep running, shot keeps moving if player ignores banner; does NOT block `handleLaunch`/placement (already blocked by `FLYING`). You can not reset on last attempt once ball is launched, so last-attempt banner just informs with that text. Last attempt state is set when `attemptsLeft===1 && freeShot===0` after counter decreased on reset.
  - Detection resets on every `handleLaunch`, `resetBall`, `loadLevel`, `advanceHole`, `returnToMainMenu`, `showGameOver`, `checkWin` (hole completed). `resetSoftlockDetection()` clears `softlockFlightTime=0`, `softlockHistory=[]`, `softlockBannerVisible=false`.
  - Once shown, banner persists until one of reset conditions above (especially hole completed → banner removed) or `R`/pause Reset/`End Run` clears it. It shall not auto-hide while still `FLYING` and confined; if ball escapes confinement (`maxDist >= threshold+10`) it may hide but is allowed to remain until next reset/win (both acceptable). Text dynamically switches between normal and last-attempt variants via `getSoftlockTextForCurrentState()` / `isLastAttemptForSoftlock()` based on `getAttemptsLeft()` and `supply.freeShot`; `showSoftlockBanner()` and `updateSoftlockDetection()` keep `softlockBannerText` in sync.
- **Banner rendering (non-blocking, distinct from center banners):** `drawSoftlockBanner(ctx,W,H,text)` draws a small non-fullscreen banner in middle of screen, a bit higher than center (e.g. `y=height/2-60,h=28` full-width `rgba(0,0,0,0.65)` or centered pill) with `700 13px` (last-attempt `700 13px` same) white `stroke 4px` text, called from `render()` after `drawHUD` when `softlockBannerVisible===true` and not obscured by `holeBanner/attemptsBanner/reward`. It is always bounded to container, above game but below HTML overlays, visible without scroll. Last-attempt variant is exactly `Stuck on last attempt? End Run in pause menu (Escape)`.
- **Exports & DOM:** `softlockBannerVisible`, `softlockBannerText`, constants `SOFTLOCK_TEXT_NORMAL`/`SOFTLOCK_TEXT_LAST` (`LAST` is exactly `Stuck on last attempt? End Run in pause menu (Escape)`), functions `isSoftlockBannerVisible()`, `showSoftlockBanner()`, `hideSoftlockBanner()`, `resetSoftlockDetection()`, `updateSoftlockDetection(dt)`, `isLastAttemptForSoftlock()`, `isLastAttemptForReset()`, `getSoftlockTextForCurrentState()` plus `window.__*` for tests. No DOM element (`#softlock-banner` not needed); canvas only.
- **Interaction:** banner informs that `R` (same `R` logic per §5) or `Pause → Next Attempt` (`#pause-next-attempt-button` / legacy `#pause-reset-attempt-button` per `09-persistence-and-campaign.md` §6) will reset ball to tee; on **last attempt** you can not reset (`R` disabled, `Next Attempt` hidden), banner just informs with `Stuck on last attempt? End Run in pause menu (Escape)` and `End Run` in pause menu (`#pause-end-run-button`, opened via `Escape` per `09-persistence-and-campaign.md` §6) is the way to abandon the run. Those resets keep working while banner visible (End Run always available via `Escape` → pause); Next Attempt is unavailable on last attempt.

## Acceptance Criteria

- [ ] Orbit and aim line update at 60fps, `ArrowRight` 1s ≈90-150°; `aimAngle` persists after death but re-initializes on new hole.
- [ ] Space tap/hold 0s/0.75s/1.5s shows 0%/50%/100% bar; bar only under ball while `CHARGING`.
- [ ] Normal `holeAttempts`/`totalAttempts` increment once per counted attempt reset (on OB/water/edge/`R` while `FLYING`, not on `handleLaunch`); free attempt reset does not increment and `supply.freeShot` consumed on launch, persisting while supply remains. HUD `Attempts Left: X` (no `(+0)`) vs `Attempts Left: X (+Y)` correct, updates after reset when `attemptsLeft` decreases.
- [ ] `resetBall` reappears at tee within 1 frame except on last attempt where `R` disabled and pause `Next Attempt` hidden; does not clear `isFreeShotActive` nor `treasure`.
- [ ] No launch when `FLYING`; no aiming while `WIN`/`GAME_OVER`/`rewardMenuVisible`/`mainMenuVisible`/`bannerVisible` (hole/attempts banners block; softlock does not block physics).
- [ ] After `holeAttempts==maxAttempts` launch, `Game Over` not shown immediately; ball finishes flight and can still win; failure then shows `GAME_OVER` without `resetBall()`; `R`/`Continue` clears progress.
- [ ] Hole banner `Hole 1*` `1000ms` then auto-hide (no reward on hole 1); `Hole 2*` `1s` then auto-transitions to reward menu when `rewardPending`. Attempts banner `Last Attempt` shown once when `attemptsLeft==1 && freeShot==0`, suppressed while `freeShot>0`; both block launch and auto-hide.
- [ ] Softlock: ball confined `<75px` over `6s` after `8s` flight while `FLYING` shows non-blocking banner `Stuck? Press R to reset — or use Next Attempt in pause menu` (contains `Press R` and `pause`/`Next Attempt`), shot keeps moving if ignored, banner removed on hole completed (`checkWin`/`advanceHole`/`loadLevel`) or `R`/pause `Next Attempt`/`End Run`, and hidden during `WIN`/`GAME_OVER`/reward/pause/main-menu.
- [ ] Softlock on last attempt: when softlocked and `getAttemptsLeft()===1 && supply.freeShot===0` (last attempt state after counter decreased), banner switches to exactly `Stuck on last attempt? End Run in pause menu (Escape)` (must equal that string, contains `last attempt`, `End Run`, `pause menu`, `Escape`), still non-blocking in middle `height/2-60`, removed on hole completed, informs that `Escape` opens pause menu. On last attempt after ball launched `R` has no effect and pause menu `Next Attempt` button is hidden (`getElementById('pause-next-attempt-button')` / legacy `pause-reset-attempt-button` is `null` or `hidden`/`display:none`), only `End Run` remains. If counter just decreased to `1` and `freeShot>0`, show `Free Shot!` banner (`Free Shot!` must appear) and turn on `isFreeShotActive`.

## File Paths

- `src/input.js:1`, `src/main.js:1` (`state`, `resetBall`, `loadLevel`, `handleLaunch`, `holeBannerVisible`, `attemptsBannerVisible`, `softlockBannerVisible`/`updateSoftlockDetection`/`isLastAttemptForReset`), `src/render.js:1` (`drawAim`, `drawHUD`, `drawForceBar`, `drawCenterBanner`, `drawSoftlockBanner`)
