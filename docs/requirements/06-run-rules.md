# 06 — Run Rules (Input, Attempts, States, Banners, Softlock)

- **ID:** 06-run-rules
- **Supersedes:** 05-input-and-states
- **Type:** Functional + UI
- **References:** `01-foundation.md` (loop/input mapping); `03-physics.md` (win/death); `05-modifiers-and-bag.md` (placement blocking); `07-rewards-and-economy.md` (reward blocking)

> Attempts and state transitions are canonical here. Rendering of HUD/banners lives in `02-rendering.md`.

## 1. Input (`src/input.js`)

- Exports `initInput()`, `getAimAngle()`, `setAimAngle(v)`, `getCharge()`, `isCharging()`. Tracks keys; `preventDefault()` for `ArrowLeft/Right`, `Space`, `KeyR`, `KeyH`, `Escape`/`KeyP`. `getCanvasMousePos` scales via container rect (see `01-foundation.md`).
- While seed/journal inputs focused, game keys are suppressed (see `08-campaign-and-menus.md`, `11-cheat-mode.md` for cheat exception).

## 2. Aim & charge

- Aim only in `AIMING`/`CHARGING` and no blocking overlay (reward/summary/cutscene/banter/banners/pause/menus/`WIN`/`GAME_OVER`). `ArrowLeft/Right` (or `A`/`D`) rotate `1.6 rad/s`, wrap `[0,2π)`. `aimAngle` persists across death; only `loadLevel` aims at the hole. `resetBall()` never touches `aimAngle`.
- `Space` first `keydown` in `AIMING` → `CHARGING` (`charge=0,holdTime=0`); `charge=min(holdTime/1.5,1)`; `keyup` → `power=50+charge*550`, `launchBall`, back to `FLYING`. Tap ≈5–10%, 1.5s = 100%. Launch ignored while moving/blocked.

## 3. Attempts (canonical)

- `currentHoleIndex` (0-based), `holeAttempts` (0..), `totalAttempts` (run total), `maxAttempts=10` static (legacy `>10` clamped), `attemptsLeft=max(0,maxAttempts-holeAttempts)`. **Attempts are consumed on launch only.** `holeAttempts` increments once per normal `handleLaunch`; failure resets (OB/water/edge, `R`/`Next Attempt` in `FLYING`) are free; `R` in `AIMING` costs nothing.
- Free launch (see `05-modifiers-and-bag.md` §5): armed + stock>0 → no increment, consume one charge, set `freeShotFlightActive`; reset after that flight only clears the flag. HUD `#hud-attempts` = `Attempts Left: X (+Y)` (`(+Y)` only when `Y>0`).
- Launch branching: check pre-launch `attemptsLeft`; free if armed+stock, else counted (`holeAttempts++`, `totalAttempts++`, UI+save). Never show Game Over/banners at launch — triggers are post-reset so the last flight can win (below).
- Post-reset evaluation (after a free reset): `attemptsLeft===0 && stock===0` → `showGameOver()` immediately; `attemptsLeft===1 && stock>0` → `Free Shot!` banner + auto-arm; `attemptsLeft===1 && stock===0` → Last Attempt state (banner once per hole via `lastAttemptsBannerValue`, hide pause `Next Attempt`, last-attempt softlock text, `R` disabled only during the actual last flight `FLYING && left===0 && stock===0 && !freeShotFlightActive`).
- Lifecycle: hole advance resets `holeAttempts=0` (keeps `totalAttempts`); `WIN`/`GAME_OVER → R/Continue` resets all + bag (see `07-rewards-and-economy.md`).

## 4. States & `R`

- `AIMING` (at tee, aim/charge/place), `CHARGING` (force bar), `FLYING` (physics+wind+collision each tick; no aim/place), `WIN` (final-hole win frozen + Victory overlay), `GAME_OVER` (last-flight failure → `clearProgress()` path + overlay; free launches never trigger it; fallback `handleLaunch` at `≤0` also shows it). Transient `holeBannerVisible/attemptsBannerVisible/freeShotBannerVisible` block like reward.
- `resetBall()` (idempotent): tee, `vel=0`, `AIMING`, clear charge/overlays (unless `WIN`/`GAME_OVER`); never touches `aimAngle`, counters, bag/passives, modifiers, treasure.
- `R`: `AIMING` → `resetBall()` (free); `FLYING` → `resetBall()` (free) except actual last flight (must play out / End Run); `rewardMenuVisible` → re-roll (see `07-rewards-and-economy.md`); `WIN`/`GAME_OVER` → `clearProgress()` → menu; main menu → blocked; pause open → `R` blocked (use `Next Attempt` button, which closes pause then runs `R` logic).
- Pause `Next Attempt` (`#pause-next-attempt-button`, legacy `#pause-reset-attempt-button`) sits `Continue → Next Attempt → Help → End Run`; hidden during Last Attempt state; same effect as `R`.
- Hole progression: non-final win → auto-advance (clear board, `currentHoleIndex++`, `holeAttempts=0`, fresh treasure, `loadLevel`, `AIMING`); final win → `WIN` overlay → `R`/Continue → summary → menu (see `07-rewards-and-economy.md`).

## 5. Banners (transient, `1000ms ±100ms`, block input, wind animates)

- `Hole N` on every `loadLevel` before any reward menu; then auto-`maybeShowRewardMenu()` if pending (hole 1: no pending).
- `Last Attempt` when post-reset `left===1 && stock===0` (once per hole); `Free Shot!` when post-reset `left===1 && stock>0` (once per hole + auto-arm). Style per `02-rendering.md`; `hole > attempts/freeShot > reward` precedence.

## 6. Softlock detection (non-blocking)

- Active only in `FLYING` with no menus/overlays/`WIN`/`GAME_OVER`. Track `softlockFlightTime` since launch; sample every `0.5s`, keep `6s` (12 samples). After `≥8s` and `≥10` samples, if `maxDist(history+current) < 75px` → `softlockBannerVisible=true` (text per `02-rendering.md`, switching via `isLastAttemptForSoftlock()`). Reset on launch/reset/load/advance/menu/Game Over/win. Persists until reset/win; may hide if confinement breaks. Exports plus `window.__*`; canvas-only, no DOM.

## Acceptance

- [ ] Orbit 90–150°/s; `aimAngle` persists on death, resets per hole; tap/hold show 0%/50%/100%.
- [ ] Counted launch decrements at launch; failures free; free launch consumes charge; HUD `X` vs `X (+Y)` correct.
- [ ] Last flight can win (no immediate Game Over at launch); failure then shows `GAME_OVER`; `R`/Continue clears.
- [ ] Hole banner then reward; Last Attempt/Free Shot once per hole post-reset; `Next Attempt` hidden + `R` disabled only on actual last flight.
- [ ] Softlock `<75px`/`6s` after `8s` shows correct variant, never blocks physics, clears on reset/win.

## File paths

- `src/input.js:1`, `src/main.js:1`, `src/render.js:1` (`drawAim`, `drawForceBar`, `drawCenterBanner`, `drawSoftlockBanner`)
