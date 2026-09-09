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

- State in `src/main.js`: `currentHoleIndex` (0-based, displayed 1-based), `holeAttempts` (0..maxAttempts), `totalAttempts` (alias `attempts`, total across run), `maxAttempts` (static `10`, never increased; legacy `>10` clamped on load), `totalHoles = LEVELS.length`. Derived `attemptsLeft = max(0, maxAttempts - holeAttempts)`.
- Free Shot: `supply.freeShot` + `isFreeShotActive` (see `06-wind-system.md` §5.2). `supply.rotate` starts `1`, `supply.freeShot` starts `0` (see `06-wind-system.md` §6).
- **Launch branching:**
  - Auto-arm before branching: if `!isFreeShotActive && supply.freeShot>0 && getAttemptsLeft()<=1` then `isFreeShotActive=true` and `syncFreeShotGlow()`. No manual hotkey; `4` is `rotate`.
  - If `isFreeShotActive && supply.freeShot>0`: free launch — do NOT increment `holeAttempts`/`totalAttempts`; `supply.freeShot--`; keep `isFreeShotActive` while `supply.freeShot>0` else `false`; `updateHotbarUI(); saveProgress();` HUD `(+Y)` updates; `attemptsLeft` unchanged; no Game Over check.
  - Else (normal): `holeAttempts++; totalAttempts++; attemptsLeft = maxAttempts - holeAttempts; updateAttemptsUI(); saveProgress();` Do NOT check Game Over immediately — last flight is allowed to finish (see §5). Reward menu is triggered by hole-start/treasure only (see `08-rewards-and-progression.md` §3).
- **HUD:** canvas-drawn `drawHUD` (see `03-rendering.md`) shows `Hole: N/M` left, `Attempts Left: X (+Y)` centered (only `(+Y)` when `Y>0`, never `(+0)`), `Total: Y` right.
- **Lifecycle:** death/`resetBall` and `R` do not reset counters nor `isFreeShotActive` nor `treasure`; hole advance resets `holeAttempts=0` but keeps `totalAttempts`/`maxAttempts`/`supply`; `WIN`/`GAME_OVER` → `R`/`Continue` resets all to `0` with `supply={1,1,1,1,0}` (see `08-rewards-and-progression.md`).

## 5. Game States & Transitions — including GAME_OVER

States: `AIMING`, `CHARGING`, `FLYING` (covers drifting), `WIN`, `GAME_OVER`. Transient banner states `holeBannerVisible`/`attemptsBannerVisible` (see §7) block input like `rewardMenuVisible`.

**GAME_OVER** (immediate on last-attempt failure): when last counted attempt fails (`attemptsLeft<=0` without winning) after allowing flight to finish, trigger `gameState='GAME_OVER'` as soon as `terrainHit`/`waterHit`/`edgeOut` detected while `FLYING`, without `resetBall()`. Hide `rewardMenuVisible`/`rewardPending`. Show `Game Over` dim `rgba(0,0,0,0.55)` + big title `Game Over` + green `Continue` `#gameover-return-button` with `Press R to continue`. Free launches never trigger Game Over; auto-arm can prevent `attemptsLeft` reaching `0`. Fallback: `handleLaunch` while `attemptsLeft<=0` also shows Game Over. While `GAME_OVER`, only `Continue`/`R` (also `Escape`/`Enter`) accepted → `clearProgress()` and return to entry menu.

- `AIMING`: ball at tee `vel=0`, accept aim+Space→`CHARGING`, modifier placement allowed, hotbar visible.
- `CHARGING`: `Space` held, update force bar, release → `launch()` → `FLYING`.
- `FLYING`: physics updates, wind always applied, collision/edge/hole checked each tick; no aiming/charging/modifier input; persists while drifting.
- `WIN`: ball entered **final** hole per `08-rewards-and-progression.md` §1; `WIN` state frozen, Victory overlay per `03-rendering.md` §4. Non-final holes auto-advance without `WIN`.

`resetBall()` (idempotent): `ball.pos={...tee}; vel={0,0}; isMoving=false; charge=0; charging=false; state='AIMING';` clear overlays if not `WIN`/`GAME_OVER`; do NOT touch `aimAngle`, `holeAttempts`/`totalAttempts`/`maxAttempts`, `supply`/`isFreeShotActive`/`areaUpgradeCount`, `modifiers`, `treasure`.

`R` key:
- In `AIMING`/`FLYING` → `resetBall()` except on last attempt flight (`attemptsLeft===0` while `FLYING`, `R` disabled, ball must play out).
- In `WIN`/`GAME_OVER` → `R` or green `Continue` → `clearProgress()` → entry menu.
- When `rewardMenuVisible` → `R` = **re-roll** (see `08-rewards-and-progression.md` §6), not reset.
- When `mainMenuVisible` → `R` blocked.

Hole progression: non-final win → auto-advance → consume supply, clear modifiers, `currentHoleIndex++`, `holeAttempts=0`, `loadLevel(next)`, `AIMING`; final win → Victory → `R`/`Continue` → `clearProgress()` → main menu (see `08-rewards-and-progression.md`).

## 6. Banners — Merged from 05-input-and-states (Transient Center Overlays)

Two transient center banners share reward menu backdrop/style. Both block `handleLaunch`/placement/aim for `1000ms ±100ms`; wind still animates; auto-hide; `WIN`/`GAME_OVER` hides immediately; not persisted.

- **Shared style:** full-canvas dim `rgba(0,0,0,0.55)` on `fgCtx`, `700 22px white stroke 5px` centered `width/2,height/2`, via `drawCenterBanner`/`drawHoleBanner`/`drawAttemptsBanner`.
- **Hole Banner** — at start of every hole (`loadLevel`/`handleCoursePlay`/`advanceHole` immediately after level assignment, before `maybeShowRewardMenu()`): text `Hole ${currentHoleIndex+1}` (alternatives `Hole N/M` acceptable, must contain `Hole` + 1-based number). Set `holeBannerVisible=true` for `1000ms`, block `maybeShowRewardMenu`/`handleLaunch`/`updateBall`; after timeout `holeBannerVisible=false` then auto-call `maybeShowRewardMenu()` if `rewardPending` (holes >0 show `Choose an Upgrade`; hole 1 has no pending).
- **Attempts Banner** — before last counted attempt only when `attemptsLeft===1 && supply.freeShot===0` and `gameState ∈ {'AIMING','CHARGING'}` and `!holeBannerVisible && !rewardMenuVisible && lastAttemptsBannerValue!==1`: text `Last Attempt` (must contain `Last`+`Attempt`). Same blocking; show at most once per hole cycle (dedupe via `lastAttemptsBannerValue`); reset on hole advance/new game/Game Over. Suppressed while `supply.freeShot>0` (last attempt will be free via auto-arm).
- **State & API:** `holeBannerVisible`, `holeBannerText`, `holeBannerTimer`, `attemptsBannerVisible`, `attemptsBannerText`, `attemptsBannerTimer`, `lastAttemptsBannerValue`; exports `isHoleBannerVisible()`, `showHoleBanner()`, `isAttemptsBannerVisible()`, `showAttemptsBanner()` plus `window.__*`.
- **Rendering:** `drawCenterBanner(ctx,W,H,text)` called from `render()` after `drawHUD`/`drawForceBar` but before `drawRewardMenu`; `holeBannerVisible` takes precedence over `attemptsBannerVisible` over `rewardMenuVisible`.

## Acceptance Criteria

- [ ] Orbit and aim line update at 60fps, `ArrowRight` 1s ≈90-150°; `aimAngle` persists after death but re-initializes on new hole.
- [ ] Space tap/hold 0s/0.75s/1.5s shows 0%/50%/100% bar; bar only under ball while `CHARGING`.
- [ ] Normal `holeAttempts`/`totalAttempts` increment once per counted launch; free launch via auto-arm does not increment and consumes `supply.freeShot` once, persisting while supply remains. HUD `Attempts Left: X` (no `(+0)`) vs `Attempts Left: X (+Y)` correct.
- [ ] `resetBall` reappears at tee within 1 frame except during last attempt flight where `R` disabled; does not clear `isFreeShotActive` nor `treasure`.
- [ ] No launch when `FLYING`; no aiming while `WIN`/`GAME_OVER`/`rewardMenuVisible`/`mainMenuVisible`/`bannerVisible`.
- [ ] After `holeAttempts==maxAttempts` launch, `Game Over` not shown immediately; ball finishes flight and can still win; failure then shows `GAME_OVER` without `resetBall()`; `R`/`Continue` clears progress.
- [ ] Hole banner `Hole 1*` `1000ms` then auto-hide (no reward on hole 1); `Hole 2*` `1s` then auto-transitions to reward menu when `rewardPending`. Attempts banner `Last Attempt` shown once when `attemptsLeft==1 && freeShot==0`, suppressed while `freeShot>0`; both block launch and auto-hide.

## File Paths

- `src/input.js:1`, `src/main.js:1` (`state`, `resetBall`, `loadLevel`, `handleLaunch`, `holeBannerVisible`, `attemptsBannerVisible`), `src/render.js:1` (`drawAim`, `drawHUD`, `drawForceBar`, `drawCenterBanner`)
