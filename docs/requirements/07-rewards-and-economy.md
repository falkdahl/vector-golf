# 07 — Rewards, Points & Journal

- **ID:** 07-rewards-and-economy
- **Supersedes:** 08-rewards-and-progression; 10-progression §3–§5 (points/summary/persistence); 15-journal
- **Type:** Functional + UI + persistence
- **References:** `05-modifiers-and-bag.md` (grants/bag-full); `06-run-rules.md` (attempts/Game Over); `08-campaign-and-menus.md` (determinism, best); `09-tutorial.md` (fixed triples)

> Reward pool/card count are canonical here. Removed per decisions 2026-10-03: owned-only filter (`personalSupply`, `countOwnedKinds`, `ceil(unique/2)`), `PROGRESSION_KEY`/`LOADOUT_KEY`, shop/coins, short-course restricted pool, `{1,1,1,1,0}` fixed supply, `Total: Y`, attempt-based best.

## 1. Win & advance

- Hole `radius:14` (12–16 tunable). Win checked every tick (grazing counts).
- Non-final win: `vel=0`, clear board without refund, `currentHoleIndex++`, `holeAttempts=0` (keep `totalAttempts`/`totalPoints` run totals), disarm free shot, fresh uncollected treasure, `loadLevel(next)` → `AIMING` + per-hole summary (below) + save. No `WIN` overlay, no `Next` button.
- Final win: `vel=0`, `gameState='WIN'` + Victory overlay (see `02-rendering.md`) → `Continue`/`R` → points summary → `clearProgress()` → menu. Victory only for the last hole. Only full completion updates `bestTotal` (points, higher wins; see `08-campaign-and-menus.md`). `End Run`/`Game Over` never update best.

## 2. Reward triggers

- State: `rewardPending`, `rewardOffered[3]`, `rewardRerolled`, `rewardMenuVisible`, per-hole treasure(s).
- Hole 1: `Hole 1` banner → `AIMING`, no reward. Holes 2..N: `Hole N` banner → auto `maybeShowRewardMenu()` (`Choose an Upgrade`) before first attempt; `rewardRerolled=false`.
- Treasure: ground-shadow hit while low (see `03-physics.md`) → `isCollected=true`, `rewardPending=true`, `maybeShowRewardMenu()` immediately even mid-`FLYING` (freezes physics); once per chest; never costs an attempt; waits if reward/`WIN`/`GAME_OVER`/pause/menu active. Tutorial multi-chest and fixed triples: see `09-tutorial.md`.

## 3. Reward menu (always 3 cards)

- Effective pool of 6 (7 types, Field Extender + Power Cell share one slot, never together): `['magnifier','liquifier','deflector','rotator','freeShot','combined(FE/PC)']`. Per trigger pick 3 distinct via seeded `mulberry32(campaignSeed:rewardSeedCounter)` (see `08-campaign-and-menus.md`); if the combined slot is picked, resolve 50/50 seeded to `fieldExtender` or `powerCell`. Same pool for re-rolls.
- Overlay `#reward-overlay` (z10, dim `0.55`): title `Choose an Upgrade` (`700 22px` white stroke `5px`); three `150×195` buttons (`520×360` gap 18, icon `88×88` `img ./img/<type>-icon.png` with text fallback, `20px` icon-label gap, `0.28` tinted backgrounds, no icon gradient, white `4px`-stroke labels). Hints: spatial `+1 to bag`, `freeShot` `+3 Free Shots`, `fieldExtender` `+20% area`, `powerCell` `+20% strength`. Bag-full spatial claim: `pendingRewardType` + `Bag full — destroy one to take X`, no in-overlay bag cards (`#reward-bag-row` absent), spatial slots get `.discard-target`, `Skip (take nothing) [Esc]`; click/hotkey `1–4` discards then grants; passives never trigger bag-full.
- Blocking: aim/charge/launch/placement ignored; `1`/`2`/`3` (offered order) or click claims; hotbar visible but disabled; gold glow hidden.
- Claim (once): spatial → bag slot (`+1`); `freeShot` → `+3` charges; `fieldExtender` → `fieldExtenderCount+1`; `powerCell` → `powerCellCount+1` (both retroactive + toggle-aware); then `rewardPending=false`, `rewardMenuVisible=false`, `rewardOffered=[]`, UI+save. No `Max Attempts`, no bouncy.

## 4. Re-roll (once per menu, 1 counted attempt)

- Button `190×30` below cards: `↻ Re-roll (1 attempt) [R]` when available; disabled (`disabled`, `opacity 0.06/0.35`, `not-allowed`) when rerolled, on last attempt (`attemptsLeft<=1`), or on tutorial fixed-triple menus. `R`/click then no-ops (no cost, no Game Over).
- Otherwise `R`/click: `holeAttempts++`, `totalAttempts++`, UI+save; if `left<=0` → Game Over, else `rewardRerolled=true` + fresh seeded triple. Never free, never touches `maxAttempts`/free stock. Cleared on next fresh menu / run end. `Digit0` never rerolls.

## 5. Points (replace coins; HUD `Points: N`)

- `POINTS_PER_HOLE=10`, `POINTS_PER_MODIFIER=10` (distinct bubbles entered **on the clearing shot** only), `POINTS_FIRST_ATTEMPT_BONUS=50` (0 failures before win), `POINTS_PER_ATTEMPT=-1` applied as `-failuresBeforeWin` at clear. No course-completion bonus.
- Per cleared hole: `holePoints = 10 + traversedOnClearingShot*10 + (first?50:0) - failuresBeforeWin`. `totalPoints` changes only on clear (HUD `#hud-total = Points: N`, may be negative). Persisted for resume.
- End-of-hole summary (`#coin-summary-overlay` id kept, points content): after every win (non-final before `loadLevel`, final before `WIN` return; also on `End Run`/`Game Over` with current totals): overlay `absolute inset:0 flex center rgba(0,0,0,0.55) z14` over the level; transparent card; title `Hole Complete` (final: `Run Complete`); big row `+X points`; breakdown rows with `p` suffix (`10p - Cleared hole`, `20p - Modifier Bonus (x2)`, `50p - Hole-in-One`, `-3p - Failed Attempts (x3)`), no `💰`; no unlock texts. `Continue (#coin-summary-ok)` advances or returns. Two-phase dismiss (fast-forward then close) allowed.

## 6. Journal (best run per course)

- `JOURNAL_KEY="golfVectorField.journal.v1"` (`{version:1, best:{[holeCount]:entry}}`), never cleared except storage clear/regeneration. Entry: `{version:1, holeCount, courseName, cleared, holesReached, totalPoints, startingItems, holes:[{n, cleared, points, attempts, startReward:null|string|'skipped', chest:null|{reward}, clearing:string[]}], savedAt}`.
- Best: uncleared → highest `holesReached` (points tiebreak); cleared → highest `totalPoints` (cleared always beats uncleared; ties keep existing).
- Recording: `journalStartRun(startingItems)` (starting-overlay picks; empty otherwise, never wiping on direct starts); persisted in `STORAGE_KEY` (`runJournal`, `runJournalActive`) across reloads; `loadLevel` bumps `maxHole`; reward source tracked per menu (chest vs hole-start, incl. tutorial hole-4 passive menu); `claimReward`/`discardBagSlotAndClaimReward` record grants, `closeRewardMenuWithoutReward` records `skipped`; on clear store `clearing` (modifiers entered on the clearing shot only) + points/attempts per §5 formulas. Commit via `commitRunJournal(cleared)` on final win / `endRun` / Game Over return (`finishReturnToMainMenu` safety net).
- Icon & panel: `#journal-wrapper` bottom-left (`bottom:12px; left:12px`, 79px circle, golfbag theme, `📖 44px`, `J` badge top-right, collapsed `translateX(-51px)` default); `#journal-panel` above (`bottom:100px; left:12px`, `max-height:calc(100%-130px)`, internal scroll, z9). Toggle click/`Enter`/`J` (ignored typing/modifiers/repeat/menus; works in `AIMING`/`CHARGING`/`FLYING` + reward open; focus blurred so `Space` shoots; always hidden + disabled on tutorial). Visibility follows `#bottom-bar` rules. Panel header `Best Run — {courseName}` (or `No best run yet — finish a run to record it.`); one row per hole (`Hole N ✓ +pts` / `— reached`; hole 1 `Start:` = starting picks, others = hole-start reward; always `Chest:`; cleared holes `Cleared with:` with icons). Rows rebuild on data change only; no horizontal scroll. Help lists `J`.

## Acceptance

- [ ] Hole 1 no reward; holes 2+ show `Choose an Upgrade`; treasure collects mid-flight, once per chest.
- [ ] Every non-tutorial offer is 3 distinct from the effective 6-pool (FE/PC never together); claim grants `+1` / `+3` / `+20%` stacks; bag-full discard via hotbar + Skip; no `#reward-bag-row`.
- [ ] Re-roll once, costs 1 counted attempt, disabled on last attempt / rerolled / tutorial-fixed; `Total` 11 after one reroll off last attempt.
- [ ] Points `10 + traversed*10 + 50 first − failures`; HUD `Points:` only on clear; per-hole summary `+X points` with `p` rows, no `💰`, no unlock text.
- [ ] Journal records/commits/replaces per §6; panel rows correct; hidden on tutorial.

## File paths

- `src/main.js:1` (win/advance, `reward*`, `claimReward`, `rerollReward`, points, summary, journal), `src/render.js:1` (`drawTreasure`), `src/windThree.js:1` (glow), `src/levels.js:1`, `src/terrain.js:1`, `index.html:1`, `style.css:1`
