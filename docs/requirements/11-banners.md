# 11 — Hole & Attempts Banners (Transient Center Overlays)

- **ID:** 11-banners
- **Supersedes:** —
- **Type:** UI / Functional
- **References:** `03-rendering.md` (backdrop, canvas split), `05-input-and-states.md` (attemptsLeft, gameState), `09-rewards-and-progression.md` (hole-start reward)

## 1. Purpose

Two transient center banners share the reward menu backdrop/style. Hole banner auto-hides after 2 seconds, attempts banner after 1 second. They provide orientation at hole start and urgency before the last attempt.

## 2. Shared Visual Style (normative, reuses reward backdrop)

- **Backdrop:** full-canvas dim `rgba(0,0,0,0.55)` identical to reward menu (`drawRewardMenu` backdrop), covering `0,0,LOGICAL_W,LOGICAL_H` on `fgCtx` (top canvas, `z-index:2`, above ball/aim but below wind/HTML overlays). No white card.
- **Text style:** centered, `font: 700 22px system-ui, sans-serif` (or `700 26px` on large canvas, both acceptable if stroke kept), `fill: white`, `stroke: rgba(0,0,0,0.75) 5px` (`lineJoin: round, paint-order stroke fill`), `textAlign: center, textBaseline: middle`. Optional subtle shadow `rgba(0,0,0,0.35) blur 6`.
- **Position:** center `width/2, height/2` (vertical `height/2 - 6` to match reward title). Single line. Bounded to container, no scroll.
- **Duration:** hole banner `2000ms ±100ms`, attempts banner `1000ms ±100ms` visible, then auto-hide (`setTimeout` or `dt` accumulator). No manual dismiss required; `Space`/`R`/`Escape` during banner are ignored (like reward blocking). While banner visible, `handleLaunch`, modifier placement, aim input are blocked (same blocking as `rewardMenuVisible`).

Both banners are rendered on `fgCtx` via `drawCenterBanner(ctx,W,H,text)` or `drawHoleBanner` / `drawAttemptsBanner` wrappers, called from `render()` when corresponding `*Visible` flag true. Draw order on `fgCtx` after `drawHUD` / `drawForceBar` but before `drawRewardMenu`? Actually hole/attempts banners share same layer as reward (full-dim). When hole banner is visible, reward menu is **not** visible yet; hole banner transitions to reward menu automatically after timeout. Attempts banner and reward menu are mutually exclusive (attempts banner never shown when `rewardMenuVisible` true; `holeBannerVisible` takes precedence over `attemptsBannerVisible`).

## 3. Hole Banner — At Start of Each Hole

- **Trigger:** `loadLevel(index)` / `handleCoursePlay` / `advanceHole` / `initLevel` for every hole (`currentHoleIndex 0..M-1`), immediately after `level` assignment and `createField`/`createBall`/`resetHotbar`, before `maybeShowRewardMenu()`. Call `showHoleBanner(currentHoleIndex, totalHoles)`.
- **Text:** `Hole ${currentHoleIndex+1}` (alternatives `Hole ${N}/${M}` e.g. `Hole 2/6` or `Hole 2 — 6 Holes` acceptable, but must contain `Hole` and the 1-based number). Must be deterministic and match `Hole: N/M` HUD. Example: `Hole 1`, `Hole 2`. For 6-hole course, hole 2 → `Hole 2`.
- **Behavior:**
  - Set `holeBannerVisible=true`, `holeBannerText=text`, `holeBannerStart=performance.now()` (or `Date.now()`), `holeBannerTimer=2000`.
  - Block `maybeShowRewardMenu`, `handleLaunch`, `placeModifier`, `updateBall` (freeze `AIMING` physics like reward menu) while visible — `update(dt)` decrements timer but still advances wind (`updateWindUniforms`).
  - After exactly `2000ms`, auto-hide: `holeBannerVisible=false`, then **automatically** call `maybeShowRewardMenu()` if `rewardPending` (holes >0 will then show `Choose an Upgrade`; hole 1 has no pending so just enters `AIMING`). Transition uses same dim so no flash. No `clearTimeout` leak on early level change — new `loadLevel` resets timer.
  - Persisted? Not persisted via `STORAGE_KEY`; on reload/resume, no hole banner shown (directly `AIMING` or `GAME_OVER`).

## 4. Attempts Banner — Before Last Attempt Only

- **Trigger:** before the **last counted attempt** on the current hole only, i.e. when `attemptsLeft` ( `maxAttempts - holeAttempts` ) `=== 1` and `holeAttempts < maxAttempts`, at the moment the player is in `AIMING` before that attempt. Implementation: after a counted launch that makes `attemptsLeft` become `1`, or on entering `AIMING` (via `resetBall` after failure, or via `loadLevel` if somehow already low), if `gameState ∈ {'AIMING','CHARGING'}` and `getAttemptsLeft() === 1` and `!holeBannerVisible && !rewardMenuVisible && !attemptsBannerVisible` and `lastAttemptsBannerValue !== 1`, then `showAttemptsBanner(1)`.
- **Text:** same style as hole banner, normative: `Last Attempt`. Must contain `Last` and `Attempt` (case-insensitive). No number required. Alternative `Last Attempt!` acceptable.
- **Behavior:**
  - `attemptsBannerVisible=true`, `attemptsBannerText="Last Attempt"`, `attemptsBannerTimer=1000`, `lastAttemptsBannerValue=1`.
  - Same backdrop/blocking as hole banner (dim, blocks launch/placement/aim while visible for **1s**, wind still animates). Does **not** block `WIN`/`GAME_OVER` — if win/Game Over occurs during banner, banner hides immediately.
  - After `1000ms`, auto-hide: `attemptsBannerVisible=false`, remain `AIMING` and allow launch. Show at most once per hole attempt cycle (track `lastAttemptsBannerValue` to avoid repeat on same `attemptsLeft`; reset on hole advance/new game/Game Over). Free-shot launches do **not** decrement `attemptsLeft` and thus do not trigger attempts banner; reroll cost that makes `attemptsLeft` become `1` also triggers (reroll is counted attempt).
  - If `holeBannerVisible` or `rewardMenuVisible` is true, attempts banner is queued: do not show until those hide (hole banner has priority). Hole banner and attempts banner never overlap.

## 5. State & API `src/main.js`

- State: `holeBannerVisible:boolean`, `holeBannerText:string`, `holeBannerTimer:number` (ms remaining), `attemptsBannerVisible:boolean`, `attemptsBannerText:string`, `attemptsBannerTimer:number`, `lastAttemptsBannerValue:number|null` (to dedupe).
- Exports (for tests): `isHoleBannerVisible()`, `getHoleBannerText()`, `showHoleBanner(index, total)`, `hideHoleBanner()`, `isAttemptsBannerVisible()`, `getAttemptsBannerText()`, `showAttemptsBanner(value)`, `hideAttemptsBanner()`, plus `window.__*` globals.
- Save/Load: banners are **transient** — not persisted in `STORAGE_KEY` (like `ball.pos`). On `saveProgress` they are omitted; on `loadProgress` they start hidden. `clearProgress`/`endRun`/Game Over hide both.

## 6. Rendering `src/render.js`

- Export `drawHoleBanner(ctx,W,H,text)` and `drawAttemptsBanner(ctx,W,H,attemptsLeft)` or generic `drawCenterBanner(ctx,W,H,text)` that implements §2 style (dim + centered stroke text). `render()` calls banner draw after `drawHUD`/`drawForceBar` and before or instead of `drawRewardMenu`:
  ```
  if (holeBannerVisible) drawCenterBanner(fgCtx, LOGICAL_W, LOGICAL_H, holeBannerText);
  else if (attemptsBannerVisible) drawCenterBanner(fgCtx, LOGICAL_W, LOGICAL_H, attemptsBannerText);
  else if (rewardMenuVisible) drawRewardMenu(...);
  ```

## 7. Interaction & Blocking

- While either banner visible: `update()` still calls `tickWind()` (wind animates), but `updateBall` is frozen when in `AIMING`/`CHARGING` (like reward menu), `handleLaunch`/`placeModifier`/`toggleFreeShot` are ignored, `maybeShowRewardMenu` is blocked until hole banner hides.
- `R`/`Space`/`Escape` during banner are ignored (no `resetBall`, no launch, no `rerollReward`). Banner hides only via timer or `WIN`/`GAME_OVER`.

## Acceptance Criteria

- [ ] At `loadLevel(0)` (Hole 1) banner `Hole 1*` appears with `rgba(0,0,0,0.55)` dim and `700 22px white stroke 5px` centered, stays `2000±100ms`, then auto-hides and does **not** show reward menu (con­sistent with 09 §3). At `loadLevel(1)` (Hole 2) banner `Hole 2*` appears `2s` then auto-transitions to `Choose an Upgrade` reward menu (same dim, no flash) — `maybeShowRewardMenu()` called after banner hide when `rewardPending`.
- [ ] When `holeAttempts` increments to make `attemptsLeft` become `1`, next `AIMING` entry shows `Last Attempt` banner `1s` with same dim/style, then auto-hides allowing launch; shown once per hole (free launches do not decrement and do not trigger). `Last Attempt` banner visible even when free-shot auto-arm would make next launch free — banner reflects counted `attemptsLeft`.
- [ ] While banner visible, `handleLaunch` is blocked (Space does not launch), hotbar hidden, wind still animates, and banner auto-hides after `2s` without manual input. `WIN`/`GAME_OVER` hides banner immediately.
- [ ] Banners not persisted: reload mid-banner resumes at `AIMING` without banner.

## File Paths

- `docs/requirements/11-banners.md:1` (this file)
- `src/main.js:1` (`holeBannerVisible`, `attemptsBannerVisible`, timers, `showHoleBanner`, `showAttemptsBanner`, `update` timer decrement, `loadLevel` trigger, `handleLaunch` blocking)
- `src/render.js:1` (`drawCenterBanner` / `drawHoleBanner` / `drawAttemptsBanner`)
- `index.html:1`, `style.css:1` (no extra DOM; canvas-only banners)
