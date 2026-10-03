# 09 — Tutorial Course (The Proving Grounds)

- **ID:** 09-tutorial
- **Supersedes:** 13-tutorial
- **Type:** Functional / content (exceptions to standard rules; standard files apply unless stated)
- **References:** `04-levels-and-wind.md` (unary fields); `05-modifiers-and-bag.md` (bags); `06-run-rules.md` (infinite attempts); `07-rewards-and-economy.md` (fixed rewards/summary); `08-campaign-and-menus.md` (stages); `10-story.md` (banters/cutscene)

## 1. Identity

- Fixed 4-hole course named exactly `The Proving Grounds`, not from `campaignSeed`; bit-identical across seeds/playthroughs. `generateCampaignCourse(3,…)`/`generateCourse(3,…)` return it (legacy `3` maps to 4). Legacy `3-hole Trial`/`The 3-Hole Trial` migrate to this name + holeCount 4. Campaign regeneration reproduces it (not name-randomized). `isTutorialActive() = activeCourse.name==="The Proving Grounds"`.
- Menu: blank `course-meta` (see `08-campaign-and-menus.md`); `bestTotal` still tracked internally for unlocks.

## 2. Holes (all `LOGICAL 1280×720`, `shape I`, `tier easy`, no obstacles/water)

- Hole 1: no treasure; tee `(320,360)`, hole `(940,360)` (≈620px, centered); unary headwind `field={sources:0,sinks:0,doublets:0,vortexes:0,unaryFlow:{x:-1.95,y:~0}}` — full-power (600) just falls ~30–60px short, a liquifier anywhere on the fairway lets it win.
- Hole 2: no treasure; tee `(120,360)`, hole `(1080,360)` (≈960px); unary side wind bottom→top `{x:~0,y:-1.8..-2.2}` (≈320–400 px/s).
- Hole 3: same geometry/wind as hole 2 + **three** chests (`getLevelTreasures().length===3`; `level.treasure` = first for compat) at `t≈.25/.5/.75` (`x≈360/600/840,y≈360±14`, fairway, `r12`, outside tee/green masks, non-overlapping).
- Hole 4: same geometry/wind as hole 3 + one mid chest (`≈600,360,r12`).
- `createField` supports `unaryFlow` with zero components (tutorial-only; standard holes never use it).

## 3. Run flow (no starting overlay, infinite attempts, no points/summary)

- Start: no `#starting-items-overlay`; bag `[liquifier,null,null,null]`; `controls-first` banter over hole 1 → `Hole 1` banner → play. Infinite attempts (`attemptsLeft` effectively ∞, no Last Attempt/Game Over); `#hud-attempts`/`#hud-total` hidden throughout; no `#coin-summary-overlay`; `holeAttempts` still counts internally for help banters.
- Hole-1 help: at `holeAttempts>=3` (hole 1, `AIMING`/`CHARGING`) one-line caddy `tutorial-hole1-liquifier-3` (liquifier + head wind); at `>=10` one-line `tutorial-hole1-liquifier-10` (same keywords). Once each per run.
- Hole 1→2: no reward/summary. On first-ever play, `first-restock` cutscene plays **before** `loadLevel(1)` (no Hole-2 glimpse; `gameState` stays non-aiming so no orbit draws); on replay it is skipped. Then bag := `[deflector,rotator,magnifier]` (overwrite), `tutorial-field-modifiers` banter over hole 2 → `Hole 2` banner → play.
- Hole-2 help: at `>=3` one-line caddy `tutorial-hole3-rotator-reminder` (rotator + upwards→forward wind); at `>=5` one-line `tutorial-hole2-gadgets-reminder` (gadget + old man). Once each.
- Hole 2→3: no reward/summary. Bag emptied; load hole 3; `tutorial-rewards` banter → `Hole 3` banner → play. Each of the 3 chests → mandatory fixed reward `['deflector','rotator','magnifier']` (3 cards, no Skip: `closeRewardMenuWithoutReward` no-op, `Escape` ignored, `#reward-skip-button` hidden).
- Hole 3→4: no summary. Bag := `[liquifier,deflector,rotator,magnifier]` (passives 0); no reward at load; `tutorial-passives` banter → then fixed start reward `['fieldExtender','powerCell','freeShot']` (3 cards, Skip allowed; `tutorialHole4StartRewardPending` distinguishes it) → `Hole 4` banner → play. Hole-4 chest → same passive triple, no `Hole 4` banner after.
- Hole 4 win: no summary/points/`WIN` overlay → `tutorial-hole4-complete` congratulations banter (caddy 3 lines: congratulations + `Mt. Aeoulus`/`ready` + `10 attempts per hole` + modifiers `lost` + `Item management`/`key`) → menu. All tutorial banters replay every run (cutscene gated by seen, banters not).

## Acceptance

- [ ] Fresh courses contain the 4-hole Proving Grounds (hole data per §2; `getLevelTreasures(hole3)===3`); seed-independent.
- [ ] Start: no starting overlay, 1 liquifier, controls banter → `Hole 1`; HUD attempts/points hidden; no summary.
- [ ] Hole-1 win → (first-restock first time, before Hole-2 draw) → bag `[deflector,rotator,magnifier]` → field-modifiers banter → `Hole 2`; replay skips cutscene only.
- [ ] Help banters at 3/10 (hole 1) and 3/5 (hole 2) with required keywords, once each.
- [ ] Hole 3: empty bag start, rewards banter, 3 mandatory `deflector/rotator/magnifier` chest rewards, no Skip.
- [ ] Hole 4: 4-spatial start, passives banter, then `fieldExtender/powerCell/freeShot` start reward; chest same triple without banner; win → congratulations banter → menu (no summary/points/`WIN`).
- [ ] Infinite attempts: no Game Over; `R` resets to tee `AIMING`; no visible attempt decrease.
