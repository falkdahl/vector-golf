# 09 — Rewards & Progression (Hole Advance, Secret Counter, Random Upgrades, Reroll)

- **ID:** 09-rewards-and-progression
- **Supersedes:** REQ-009 (win section), REQ-014 (hole progression part), REQ-021, REQ-022, REQ-023, REQ-024, REQ-025, plus `05-input-and-states.md` shared counters
- **Type:** Functional + UI
- **References:** `05-input-and-states.md` (attempts/counters), `07-modifiers.md` (supply), `04-physics-and-collision.md` (win check), `10-persistence-and-menus.md` (course complete vs abandon)

## 1. Hole & Win Definition (extends `04-physics-and-collision.md`)

- Hole `hole={x,y,radius:14}` (12-16 tunable, black `fill #111` rim `2px #333`, optional flag). Position per `08-level-generation.md` (right side).
- **Win check every tick** (continuous, not at rest): `hypot(ball.pos-hole) < hole.radius + BALL_RADIUS` (any edge grazing counts, `dist < …` not `≤`). On win: `vel=0`, `isMoving=false`, freeze over hole, `gameState='WIN'`, show **Victory** overlay centered in canvas (DOM): title `Victory`, text `Attempts this hole: X, Total: Y` (per `05-input-and-states.md`), button `Next` if more holes remain, else `Game Complete!` / `Continue`/`Back to Menu` on final hole.

## 2. Hole Advancement

- **Non-final hole**: `Next` (click or `R` fallback) → **before clearing modifiers** consume supply per `07-modifiers.md` §7 (`supply[type]=max(0,supply[type]-1)` per placed modifier, `updateHotbarUI`+`saveProgress`), then `modifiers=[]` via `syncModifiersToField()`, `currentHoleIndex++`, `holeAttempts=0` (but `totalAttempts` kept), `secretRewardCounter` reset to `0` (see §3), `loadLevel(next)`, `gameState='AIMING'`, hide win overlay. HUD `Hole: N/M` updates (`M=LEVELS.length`).
- **Final hole**: same supply consumption (then moot — `clearProgress()` resets supply to `{1,1,1}` for next new game), **do NOT reset to hole 1**; instead `clearProgress()` + `mainMenuVisible=true` (entry main menu, splash, no backdrop) keep `COURSES_KEY`/`bestTotal` intact; `bestTotal` for the course is updated **only here** (see §7 & `10-persistence-and-menus.md`).

## 3. Counters (single source; `05-input-and-states.md` defines HUD, this file defines trigger)

- Hidden counters: `secretRewardCounter:0..4` (never in HUD) and `rewardPending:boolean`, `rewardOffered:string[]` (length 3), `rewardRerolled:boolean`, `rewardMenuVisible:boolean`.
- **On new game** (`resetGameAfterWin`, `startNewGameFromMain`, `endRun`, `clearProgress`, `initLevel(0)` with no save, page reload with no save): `secretRewardCounter=0`, `rewardPending=false`, `rewardMenuVisible=false`, `rewardOffered=[]`, `rewardRerolled=false`, **no menu before first attempt on hole 1**. On each **subsequent hole** (`currentHoleIndex>0`, `advanceHole`/`loadLevel(n>0)`): `secretRewardCounter=0`, `rewardPending=true` → menu shown **before first attempt** on that hole before aim/charge/place.
- **Increment**: on each **counted** launch (see §4 free-shots gating: `freeShots===0` at `handleLaunch` → counted), do `holeAttempts++; totalAttempts++; secretRewardCounter++; if (secret>=5){ secretRewardCounter=0; rewardPending=true; }`. Free-shot launches do NOT increment any of these.
- Menu is queued to be shown at **next entry into `AIMING`** (after `resetBall` re-entering `AIMING`) before next launch; `maybeShowRewardMenu()` shows it as blocking canvas overlay only in `AIMING`/`CHARGING` (see §5).

## 4. Free Shots Hidden Counter `freeShots`

- `freeShots: integer ≥0`, hidden (no HUD, via `window.__getFreeShots` for tests), `0` on new game, persists through death/`R`/hole advance until consumed/reset.
- **Deduction** in `handleLaunch` (exactly once per launch, after `launchBall`): `if (freeShots>0) freeShots=max(0,freeShots-1)` **mutually exclusive** with the counted-shot increment above (never both). Does not increment `secretRewardCounter`, `holeAttempts`, `totalAttempts`; HUD unchanged.
- **Grant**: via random reward menu (see §5) only when `Free Shots +3` is among the offered 3 and chosen → `freeShots+=3` (exactly `+3`, `addFreeShots(3)`), clamped. Not consumed by re-roll (see §6).

## 5. Reward Menu — Random 3-of-6 Inside Canvas

- Pool `POOL=['amplify','nullify','flip','freeShots','areaUp','bouncyBall']` (6 types, later entries are authoritative; earlier 4-/5-pool mentions are legacy and superseded). Per trigger randomly pick **3 distinct** uniformly without replacement (`shuffle([...POOL]).slice(0,3)` via `Math.random`), same 6-pool for reroll. Excluded types not shown that trigger.
- State per menu `rewardOffered` (current 3), `rewardRerolled=false` when freshly shown (`maybeShowRewardMenu` resets it), `rewardMenuVisible` blocks input.
- **Inside-canvas canvas overlay** `drawRewardMenu(ctx,W,H,offered,hovered,rerolled,rerollHovered)` called from `render()` when `rewardMenuVisible`: full-canvas dim `rgba(0,0,0,0.55)` (no white card), title `Choose an Upgrade` 22px `700` white `stroke rgba(0,0,0,0.75) 5px` centered, three `90×110` buttons centered (`340×220` card) horizontally `gap 12`:
  - `amplify` border `rgba(230,126,34,0.9)` fill `rgba(230,126,34,0.28)` (hover `0.38`) icon `»` `#e67e22`; `nullify` `#3498db` `∅`; `flip` `#9b59b6` `⇄`; `freeShots` green `★` `#2ecc71` hint `+3 free shots`; `areaUp` amber `◯` `#f39c12` hint `+20% area`; `bouncyBall` teal `◎` `#1abc9c` hint `+1 bounce`. All labels white with `stroke rgba(0,0,0,0.75) 4px` for contrast on green/dim; no `Total Attempts: N` subtitle.
- **Blocking**: while visible, aim/charge/launch/modifier `1/2/3` placement is ignored; only menu `1`/`2`/`3` (by **offered order** left-to-right, not fixed) or click on button rects selects; `7-modifiers.md` hotbar is visible but disabled underneath.
- **Selection** (idempotent, once per menu): click or `1`/`2`/`3` for `rewardOffered[0..2]`:
  - `amplify`/`nullify`/`flip` → `supply[t]++` once,
  - `freeShots` → `freeShots+=3`,
  - `areaUp` → `areaUpgradeCount+=1` (`areaMultiplier=1+0.2*areaUpgradeCount`, retroactively grows all modifiers via `getEffectiveModifierRadius()`, see `07-modifiers.md` §4; base `BASE_MODIFIER_RADIUS` normative per `07-modifiers.md` — accept `54*` progression `64.8/75.6/...` if base `54`, or `108/126/...` if base `90`; additive not `1.2^n`),
  - `bouncyBall` → `bouncyBallCount+=1` (`bouncyRemaining` re-init per `05-input-and-states.md`),
  then `rewardPending=false; rewardMenuVisible=false; rewardOffered=[]` (secret already `0` after the 5th counted shot). Menu closes, normal `AIMING` resumes. Save via `saveProgress()`.

## 6. Re-roll — Once per Menu for 1 Attempt

- While `rewardMenuVisible && rewardRerolled===false`, a **Re-roll button** `110×28` centered at `cardY+155` (below three cards) is shown: available fill `rgba(255,255,255,0.12)` (hover `0.22`) border `rgba(255,255,255,0.85) 1.5px` icon `↻`, label `Re-roll` `12px 700` white, `(1 attempt)` `10px` `rgba(255,255,255,0.85)`, `[R]` hint. When `rewardRerolled===true` button is disabled (`0.06` fill, `0.35` border, `not-allowed`) or hidden. Hit-test via `getRewardRerollButtonLayout(W,H)`.
- Input: click on reroll button **or** `R`/`r` (`KeyR`) while menu visible and not yet rerolled → `rerollReward()` exactly once:
  ```
  holeAttempts+=1; totalAttempts+=1; attempts=totalAttempts; updateAttemptsUI();
  rewardRerolled=true;
  rewardOffered=shuffle([...POOL]).slice(0,3);
  // do NOT touch secretRewardCounter, do NOT touch freeShots
  ```
  Never both secret+free; always costs an attempt even if `freeShots>0`. Second `R`/click returns `false` (no cost, no change). After reroll the new `rewardOffered` is selectable via `1`/`2`/`3`.
- Re-reroll state is cleared on next fresh menu trigger; `resetGameAfterWin`/`startNewGameFromMain`/`endRun`/`clearProgress` also clears `rewardRerolled`. Re-roll is blocked when not `rewardMenuVisible` (normal `R` stays `resetBall`); when `WIN` overlay visible re-roll is blocked. The re-roll attempt **delays** next reward (next reward still needs 5 counted shots, so with one re-roll second reward is at `Total 11` not `10`).

## 7. Persistence Interactions & Course Records

- Only **full course completion** (final-hole `WIN`) updates `bestTotal` per course (`10-persistence-and-menus.md`); `End Run` does not.
- Counters and `supply`/`freeShots`/`areaUpgradeCount`/`bouncyBallCount`/`secretRewardCounter`/`reward…`/`modifiers`/`aimAngle` are part of `STORAGE_KEY` payload and re-saved after every launch/claim/reroll/placement/advance (see `10-persistence-and-menus.md`).

## Acceptance Criteria

- [ ] New game hole 1 no menu; each subsequent hole has menu before first attempt with `secretRewardCounter===0` after hole-entry reset.
- [ ] After 5 counted shots `secret 0→5→0` queues menu at next `AIMING`; menu shows 3 distinct from 6-pool; excluded not clickable; `Space`/`Arrow` blocked; `1/2/3` selects by offered order.
- [ ] Grants: `amplify/nullify/flip` `+1 supply`, `freeShots +3`, `areaUp` `areaUpgradeCount+1` → `effectiveRadius` additive (`BASE*1.2/1.4/1.6`…), retroactively grows; `bouncyBall +1`.
- [ ] `freeShots` consumed first, not counted; does not increment secret or `Total`; delaying next reward until 5 counted shots.
- [ ] Re-roll button shown when `rerolled===false`; `R`/click once increments `holeAttempts`/`totalAttempts` by `+1` but keeps `freeShots` and `secret` unchanged, replaces offer, disables button; second `R` no-ops. `Total` at second reward is `11` if one reroll taken after `5` (proof of cost).
- [ ] No white card; dim `0.55` behind high-contrast white-with-stroke buttons; HUD still underneath.

## File Paths

- `src/main.js:1` (`POOL`, `secretRewardCounter`, `freeShots`, `areaUpgradeCount`, `bouncyBallCount`, `reward*` state, `handleLaunch` branching, `claimReward`, `rerollReward`, `maybeShowRewardMenu`, `advanceHole`/`handleNextHole` secret reset)
- `src/render.js:1` (`drawRewardMenu`, `getRewardButtonsLayout`, `getRewardRerollButtonLayout`, high-contrast styles)
