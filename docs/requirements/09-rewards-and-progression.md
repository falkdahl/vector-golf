# 09 — Rewards & Progression (Hole Advance, Secret Counter, Random Upgrades, Reroll)

- **ID:** 09-rewards-and-progression
- **Supersedes:** REQ-009 (win section), REQ-014 (hole progression part), REQ-021, REQ-022, REQ-023, REQ-025, plus `05-input-and-states.md` shared counters — **bouncy removed, trees always bounce**
- **Type:** Functional + UI
- **References:** `05-input-and-states.md` (attempts/counters), `07-modifiers.md` (supply), `04-physics-and-collision.md` (win check, trees always bounce), `10-persistence-and-menus.md` (course complete vs abandon)

## 1. Hole & Win Definition (extends `04-physics-and-collision.md`)

- Hole `hole={x,y,radius:14}` (12-16 tunable, black `fill #111` rim `2px #333`, optional flag). Position per `08-level-generation.md` (right side).
- **Win check every tick** (continuous, not at rest): `hypot(ball.pos-hole) < hole.radius + BALL_RADIUS` (any edge grazing counts, `dist < …` not `≤`). On win: `vel=0`, `isMoving=false`, freeze over hole, `gameState='WIN'`, show **Victory** overlay centered in canvas (DOM): title `Victory`, text `Attempts this hole: X, Total: Y` (per `05-input-and-states.md`), button `Next` if more holes remain, else `Game Complete!` / `Continue`/`Back to Menu` on final hole.

## 2. Hole Advancement

- **Non-final hole**: `Next` (click or `R` fallback) → **before clearing modifiers** consume supply per `07-modifiers.md` §7 (`supply[type]=max(0,supply[type]-1)` per placed modifier, `updateHotbarUI`+`saveProgress`), then `modifiers=[]` via `syncModifiersToField()`, `currentHoleIndex++`, `holeAttempts=0` (but `totalAttempts` kept), `secretRewardCounter` reset to `0` (see §3), `loadLevel(next)`, `gameState='AIMING'`, hide win overlay. HUD `Hole: N/M` updates (`M=LEVELS.length`).
- **Final hole**: same supply consumption (then moot — `clearProgress()` resets supply to `{1,1,1}` for next new game), **do NOT reset to hole 1**; instead `clearProgress()` + `mainMenuVisible=true` (entry main menu, splash, no backdrop) keep `COURSES_KEY`/`bestTotal` intact; `bestTotal` for the course is updated **only here** (see §7 & `10-persistence-and-menus.md`).

## 3. Counters (single source; `05-input-and-states.md` defines HUD, this file defines trigger)

- Hidden counters: `secretRewardCounter:0..4` (never in HUD) and `rewardPending:boolean`, `rewardOffered:string[]` (length 3), `rewardRerolled:boolean`, `rewardMenuVisible:boolean`, plus `maxAttempts`/`holeAttempts`/`attemptsLeft` (see §4).
- **On new game** (`resetGameAfterWin`, `startNewGameFromMain`, `endRun`, `clearProgress`, `initLevel(0)` with no save, page reload with no save): `secretRewardCounter=0`, `rewardPending=false`, `rewardMenuVisible=false`, `rewardOffered=[]`, `rewardRerolled=false`, `maxAttempts=10`, `holeAttempts=0`, `attemptsLeft=10`, **no menu before first attempt on hole 1**. On each **subsequent hole** (`currentHoleIndex>0`, `advanceHole`/`loadLevel(n>0)`): `secretRewardCounter=0`, `rewardPending=true`, `holeAttempts=0` (so `attemptsLeft = maxAttempts`) → menu shown **before first attempt** on that hole before aim/charge/place; `maxAttempts` persists (increased max carries over).
- **Increment**: on each launch (always counted, `freeShots` removed): do `holeAttempts++; totalAttempts++; attemptsLeft = max(0, maxAttempts - holeAttempts); secretRewardCounter++; if (secret>=5){ secretRewardCounter=0; rewardPending=true; }`. After increment, if `attemptsLeft <=0` and not `WIN`, trigger **Game Over** (`gameState='GAME_OVER'`, see `05` §5). Menu is queued to be shown at **next entry into `AIMING`** (after `resetBall` re-entering `AIMING`) before next launch, unless Game Over intervenes; `maybeShowRewardMenu()` shows it as blocking canvas overlay only in `AIMING`/`CHARGING` (see §5).

## 4. Max Attempts Hidden Counter `maxAttempts` + `attemptsLeft` (replaces Free Shots)

- `maxAttempts: integer ≥10`, hidden max (via `window.__getMaxAttempts` for tests), starts `10` on new game (`newGame`, `initLevel(0)`), persists through death/`R`/hole advance until reset or increased. Derived `attemptsLeft = max(0, maxAttempts - holeAttempts)` is shown in HUD as `Attempts Left` (see `05`/`03`), not `freeShots`.
- **No deduction gating**: every `handleLaunch` is counted (no `freeShots` check). After each launch do `holeAttempts++; totalAttempts++; secretRewardCounter++` and recompute `attemptsLeft = maxAttempts - holeAttempts`. If `attemptsLeft <=0` and `gameState !== 'WIN'` (hole not won within `maxAttempts` attempts), trigger **Game Over** (see `05` §5): `gameState='GAME_OVER'`, show Game Over screen, block input except return to menu. `maxAttempts` itself is not decremented per attempt; only `holeAttempts` increments.
- **Grant `Max Attempts +5`**: via random reward menu (see §5) only when `Max Attempts +5` is among the offered 3 and chosen → `maxAttempts +=5` (exactly `+5`, `addMaxAttempts(5)` or `maxAttempts = max(10, maxAttempts+5)`), clamped `≥10`. Immediately increases `attemptsLeft` (`max - holeAttempts`) by `5`. Persists for remainder of run (like `areaUpgradeCount`). Not consumed by re-roll (see §6). Replaces `freeShots` (removed).

## 5. Reward Menu — Random 3-of-5 Inside Canvas (bouncy removed, freeShots replaced by Max Attempts +5)

- Pool `POOL=['amplify','nullify','flip','maxAttempts','areaUp']` (5 types, `freeShots` replaced by `maxAttempts` +5, bouncy removed; earlier 6-/5-pool mentions are legacy and superseded). Per trigger randomly pick **3 distinct** uniformly without replacement (`shuffle([...POOL]).slice(0,3)` via `Math.random`), same 5-pool for reroll. Excluded types not shown that trigger.
- State per menu `rewardOffered` (current 3), `rewardRerolled=false` when freshly shown (`maybeShowRewardMenu` resets it), `rewardMenuVisible` blocks input.
- **Inside-canvas canvas overlay** `drawRewardMenu(ctx,W,H,offered,hovered,rerolled,rerollHovered)` called from `render()` when `rewardMenuVisible`: full-canvas dim `rgba(0,0,0,0.55)` (no white card), title `Choose an Upgrade` 22px `700` white `stroke rgba(0,0,0,0.75) 5px` centered, three `90×110` buttons centered (`340×220` card) horizontally `gap 12`:
  - `amplify` border `rgba(230,126,34,0.9)` fill `rgba(230,126,34,0.28)` (hover `0.38`) icon `»` `#e67e22`; `nullify` `#3498db` `∅`; `flip` `#9b59b6` `⇄`; `maxAttempts` green `★` `#2ecc71` label `Max Attempts +5` hint `+5 max attempts` (replaces `freeShots`); `areaUp` amber `◯` `#f39c12` hint `+20% area`. All labels white with `stroke rgba(0,0,0,0.75) 4px` for contrast on green/dim; no `Total Attempts: N` subtitle.
- **Blocking**: while visible, aim/charge/launch/modifier `1/2/3` placement is ignored; only menu `1`/`2`/`3` (by **offered order** left-to-right, not fixed) or click on button rects selects; `7-modifiers.md` hotbar is visible but disabled underneath.
- **Selection** (idempotent, once per menu): click or `1`/`2`/`3` for `rewardOffered[0..2]`:
  - `amplify`/`nullify`/`flip` → `supply[t]++` once,
  - `maxAttempts` → `maxAttempts+=5` (exactly `+5`, see §4),
  - `areaUp` → `areaUpgradeCount+=1` (`areaMultiplier=1+0.2*areaUpgradeCount`, retroactively grows all modifiers via `getEffectiveModifierRadius()`, see `07-modifiers.md` §4; base `BASE_MODIFIER_RADIUS` normative per `07-modifiers.md` — accept `54*` progression `64.8/75.6/...` if base `54`, or `108/126/...` if base `90`; additive not `1.2^n`),
  then `rewardPending=false; rewardMenuVisible=false; rewardOffered=[]` (secret already `0` after the 5th counted shot). Menu closes, normal `AIMING` resumes. Save via `saveProgress()`. Trees always bounce per `04-physics-and-collision.md:5`, no `freeShots`.

## 6. Re-roll — Once per Menu for 1 Attempt (counts toward maxAttempts)

- While `rewardMenuVisible && rewardRerolled===false`, a **Re-roll button** `110×28` centered at `cardY+155` (below three cards) is shown: available fill `rgba(255,255,255,0.12)` (hover `0.22`) border `rgba(255,255,255,0.85) 1.5px` icon `↻`, label `Re-roll` `12px 700` white, `(1 attempt)` `10px` `rgba(255,255,255,0.85)`, `[R]` hint. When `rewardRerolled===true` button is disabled (`0.06` fill, `0.35` border, `not-allowed`) or hidden. Hit-test via `getRewardRerollButtonLayout(W,H)`.
- Input: click on reroll button **or** `R`/`r` (`KeyR`) while menu visible and not yet rerolled → `rerollReward()` exactly once:
  ```
  holeAttempts+=1; totalAttempts+=1; attempts=totalAttempts; attemptsLeft = max(0, maxAttempts - holeAttempts); updateAttemptsUI();
  if (attemptsLeft <=0 && !WIN) trigger GAME_OVER else {
    rewardRerolled=true;
    rewardOffered=shuffle([...POOL]).slice(0,3);
  }
  // do NOT touch secretRewardCounter, do NOT touch maxAttempts
  ```
  Always costs an attempt (counts toward `maxAttempts` and can trigger Game Over). Second `R`/click returns `false` (no cost, no change). After reroll the new `rewardOffered` is selectable via `1`/`2`/`3`.
- Re-reroll state is cleared on next fresh menu trigger; `resetGameAfterWin`/`startNewGameFromMain`/`endRun`/`clearProgress` also clears `rewardRerolled`. Re-roll is blocked when not `rewardMenuVisible` (normal `R` stays `resetBall`); when `WIN`/`GAME_OVER` overlay visible re-roll is blocked. The re-roll attempt **delays** next reward and counts toward `maxAttempts`.

## 7. Persistence Interactions & Course Records

- Only **full course completion** (final-hole `WIN`) updates `bestTotal` per course (`10-persistence-and-menus.md`); `End Run` and `Game Over` do not.
- Counters and `supply`/`maxAttempts`/`holeAttempts`/`attemptsLeft`/`areaUpgradeCount`/`secretRewardCounter`/`reward…`/`modifiers`/`aimAngle` are part of `STORAGE_KEY` payload and re-saved after every launch/claim/reroll/placement/advance (see `10-persistence-and-menus.md`). `freeShots`/`bouncyBallCount` are legacy removed (kept for compat, always `0`, trees always bounce).

## Acceptance Criteria

- [ ] New game hole 1 no menu; `maxAttempts=10`, `holeAttempts=0`, `attemptsLeft=10` shown as `Attempts Left: 10`; each subsequent hole has menu before first attempt with `secretRewardCounter===0`, `holeAttempts=0`, `attemptsLeft = maxAttempts` (increased max carries over).
- [ ] After 5 counted shots `secret 0→5→0` queues menu at next `AIMING`; menu shows 3 distinct from **5-pool** (`amplify/nullify/flip/maxAttempts/areaUp`); excluded not clickable; `Space`/`Arrow` blocked; `1/2/3` selects by offered order.
- [ ] Grants: `amplify/nullify/flip` `+1 supply`, `Max Attempts +5` → `maxAttempts+=5` (so `attemptsLeft` +5 immediately), `areaUp` `areaUpgradeCount+1` → `effectiveRadius` additive (`BASE*1.2/1.4/1.6`…), retroactively grows. No `freeShots`/`bouncy`.
- [ ] Every launch increments `holeAttempts`/`totalAttempts`; `attemptsLeft = maxAttempts - holeAttempts` shown; `Game Over` triggers when `attemptsLeft <=0` (i.e. `holeAttempts == maxAttempts`) without win → `GAME_OVER` screen with only `Return to Main Menu` which does `clearProgress()` and returns to entry (no `Continue`).
- [ ] Tree hit always bounces (unlimited), water `z>5` flies over.
- [ ] Re-roll button shown when `rerolled===false`; `R`/click once increments `holeAttempts`/`totalAttempts` (and decrements `attemptsLeft`) but keeps `maxAttempts` and `secret` unchanged (except reroll counts toward `maxAttempts` and can trigger Game Over), replaces offer (new 3 from 5-pool), disables button; second `R` no-ops. `Total` at second reward is `11` if one reroll taken after `5` (reroll costs one of the `maxAttempts`).
- [ ] No white card; dim `0.55` behind high-contrast white-with-stroke buttons; HUD still underneath shows `Attempts Left`.

## File Paths

- `src/main.js:1` (`POOL` 5 `maxAttempts`, `secretRewardCounter`, `maxAttempts`/`holeAttempts`/`attemptsLeft`, `areaUpgradeCount`, `reward*` state, `claimReward` 5-pool, `rerollReward` counts toward max, `maybeShowRewardMenu`, trees always bounce, `GAME_OVER`)
- `src/render.js:1` (`drawRewardMenu` 5-pool `Max Attempts +5` green `★`, `drawHUD` shows `Attempts Left`)
