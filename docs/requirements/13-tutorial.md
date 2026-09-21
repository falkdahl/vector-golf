# 13 — Tutorial Course (3-hole Trial)

- **ID:** 13-tutorial
- **Supersedes:** 07-level-generation.md (3-hole generation), 09-persistence-and-campaign.md (course naming, stage generation), 10-progression.md (starting overlay), 11-cutscenes.md (intro chain), 12-banter.md (run-start sequence) — only for `holeCount===3`
- **Type:** Functional / Content

## 1. Course Identity

- The `3`-hole course is a **fixed tutorial** named exactly `3-hole Trial` (`course.name === "3-hole Trial"`). It is not generated from `campaignSeed`; its holes are deterministic and identical for all playthroughs and campaign seeds.
- In `COURSES_KEY`, the staged entry for `holeCount===3` always has `name:"3-hole Trial"` and `holes` from `generateTutorialLevels()` (see §2). Regeneration of campaign still produces the same `3-hole Trial` (not name-randomized). Other stages (6/9/18) remain deterministic from `campaignSeed` as before.
- `generateCampaignCourse(3, ...)` and `generateCourse(3, ...)` must return the fixed tutorial when `holeCount===3` regardless of seed/options.

## 2. Level Definitions

### Hole 1 — Unary Headwind Straight (Heavy Wind, Shorter Hole)

- **Treasure:** none (`level.treasure === null` or absent). No chest rendered or hittable.
- **Terrain:** straight fairway (`shape:"I"`) without obstacles (`obstacles:[]`, `waterHazards:[]`). Spine is straight tee→hole. `widthFairway`/`widthRough` per Easy tier but no hazards to block corridor.
- **Positions:** `tee` left side (`x 80-120, y 340-380` centered), `hole` **shorter** right side (`x 680-720, y same y ±15`) so distance ≈ 590-630 (shortened to compensate for heavy wind). Uses same `LOGICAL_W/H` (1280×720).
- **Wind field:** **unary operator only, heavy headwind**. `field.unaryFlow` is a constant vector opposing the tee→hole direction (headwind, `x negative, y ~0` with magnitude ≈ `1.0` field units → `≈ -180 px/s` effective, much stronger than normal), `field.sources=0, sinks=0, doublets=0, vortexes=0`. No source/sink/vortex/doublet. `WIND_STRENGTH=180` applies. Tuned (heavy wind + shorter hole) so a full-power shot (`power=600`, 100% charge) **just fails to reach the hole** (short by ~30-60px, feels like being pushed back by gale), while placing a **liquifier** bubble covering any part of the fairway lets the same shot reach and win (shielded segment preserves momentum). `vectorField.createField` must support `unaryFlow` and allow zero components when it is present.
- **Difficulty:** `tier:"easy"` `shape:"I"` `treesOnFairway:0` `waterOnFairway:0`.

### Holes 2-3 — Deterministic Easy

- Both generated **once** with Easy tier rules (`07-level-generation.md` §5) using a **fixed seed** (e.g. `424242` for hole2, `424243` for hole3 or a single tutorial seed `0xC0FFEE + holeIndex`) so they are identical for every player and every campaign.
- **Hole 2:** `treasure: null` (no chest), no reward before it (see §3).
- **Hole 3:** contains a chest (`treasure` per `07` §4, one near a tree) and shows a reward after clearing via normal difficulty (but banter before it, see §3).

## 3. Run Flow & UI Changes (only for 3-hole Trial)

### Start of Run
- **No Starting Items overlay** (`#starting-items-overlay` shall remain `.hidden` for `3-hole Trial`; `isStartingItemsVisible()===false`). Player skips the “Choose 2 starting items” screen.
- **Starting bag:** player starts with exactly **one `liquifier`** (`golfbag = [{type:"liquifier"}, null, null, null]`, `supply.liquifier===1`, others 0). No other modifiers, no passive stacks at start.
- **Opening banter:** immediately after `handleCoursePlay` loads hole 1 preview (before `showHoleBanner(0)`), play `controls-first` banter (`May/Caddy`) over the loaded hole. This replaces the generic `playRunStartBanter` shuffle for the tutorial. On **replay** the same `controls-first` banter replays (banter still shown, cutscenes skipped — see §3.4).

### Hole 1 Reminder
- If the hole is **not cleared within 5 attempts** (`holeAttempts >=5 && currentHoleIndex===0 && gameState==="AIMING" && activeCourse.holeCount===3`), play a **one-sentence banter** where **Caddy** reminds the player to use the liquifier. Banter id `tutorial-liquifier-reminder` (single line, `speaker:"caddy"`, text contains `liquifier`/`Liquifier` and reminds to place it). Trigger once per hole-1 run (do not repeat after it has shown; reset on new run/hole advance). While this banter is active all game input is blocked like any banter.

### Hole 1 → Hole 2 Transition
- **No reward screen** before hole 2 (`rewardPending` cleared, `rewardOffered=[]`, `rewardMenuVisible===false` on `loadLevel(1)` for tutorial). Skip the generic `Choose an Upgrade` that would appear on holes>1.
- **Cutscene:** instead, immediately after hole 1 win (before `loadLevel(1)` or before `showHoleBanner(1)`), play `src/cutscenes/first-restock.json` (`id:"first-restock"`) **only on the first play of the tutorial**. On **replay** (`hasSeenCutscene("first-restock")===true`) **skip the cutscene**.
- **After cutscene (or immediately if skipped):** grant the player **one of each placeable modifier** for hole 2 start (`golfbag = [{magnifier},{liquifier},{deflector},{rotator}]` in any order but containing one of each; `supply` accordingly, `selectedModifier===null`). This is the inventory for hole 2.
- **Banter after cutscene:** play `stacking-third` banter over hole 2 preview before its `Hole 2` banner. On replay this banter still replays (like other tutorial banters). Order is: `first-restock` cutscene (if not seen, else skip) → `stacking-third` banter → `Hole 2` banner (1000ms) → gameplay.
- **Banter vs cutscene replay rule:** cutscenes are skipped when already seen (`CUTSCENE_SEEN_KEY` contains id), banters are **always replayed** on each tutorial run (no seen gating for these three tutorial banters).

### Hole 2 → Hole 3 Transition
- Hole 3 follows normal progression but **before** its reward menu would appear (i.e. after `Hole 3` banner's 1000ms and when `rewardPending===true` for `currentHoleIndex===2`), **first** play `rewards-second` banter over hole 3. After that banter completes, show the reward overlay (`Choose an Upgrade`). This banter also replays on every tutorial replay.
- Hole 3 treasure chest is present and collectable mid-flight as usual; collecting it also triggers the normal reward flow (which for hole 3 is after the hole-start reward, so chest is additional).

### Summary
- Sequence for `3-hole Trial` fresh play (not seen):
  1. Click `3-hole Trial` → `controls-first` banter over hole1 → `Hole 1` banner → play hole1 (headwind, liquifier in bag, no treasure, no Starting Items)
  2. On 5th failure on hole1 (if not cleared): `tutorial-liquifier-reminder` banter (once)
  3. Win hole1 → (no reward) → `first-restock` cutscene (first time only) → grant 4 modifiers → `stacking-third` banter → `Hole 2` banner → play hole2 (no treasure, no reward screen)
  4. Win hole2 → `Hole 3` banner (with `rewardPending` but deferred) → `rewards-second` banter → reward menu → play hole3 (with chest)

- On **replay** of `3-hole Trial` (seen flags for `first-restock` already true): same as above but `first-restock` cutscene is skipped (step 3 goes straight to grant + `stacking-third` banter). Opening `controls-first`, the 5-attempt reminder, `stacking-third`, and `rewards-second` **still play** each run.

## 4. Persistence

- `CUTSCENE_SEEN_KEY` gating applies to `first-restock` (and any re-used cutscene). Once seen, subsequent `handleCoursePlay` for `3-hole Trial` does not play it; banner/banter still plays. `localStorage.clear()` / `regenerateCampaign()` clears seen, so next fresh run shows cutscene again.
- No `isTutorialRun` flag required beyond detecting `activeCourse.holeCount===3 && activeCourse.name==="3-hole Trial"`; tutorial banters are not subject to the generic `BANTER_STATE_KEY` shuffle — they are fixed ids per step.

## 5. Acceptance

- [ ] `loadCourses()` fresh yields one course with `holeCount===3`, `name==="3-hole Trial"`, `holes.length===3`, `holes[0].treasure===null` and `holes[1].treasure===null` and `holes[2].treasure` present with `isCollected===false`, `holes[0].field.sources===0` `sinks===0` `doublets===0` `vortexes===0` and `unaryFlow` headwind, `holes[0].obstacles.length===0`; calling `generateCampaignCourse(3, "any-seed")` twice yields bit-identical `holes[0].tee/hole/field.unaryFlow` and `holes[1].tee/hole` (fixed tutorial, not seed-dependent).
- [ ] Clicking `3-hole Trial` with no save shows `controls-first` banter (`#cutscene-dialog` visible, `speaker May/Caddy`, `BANTER_CPS` typewriter) over the loaded hole before `Hole 1` banner; `#starting-items-overlay` stays `hidden` and `golfbag` contains exactly one `liquifier` (`supply.liquifier===1`). `R`/`Space` advances banter.
- [ ] Hole1 100% shot without modifiers falls short of hole (distance to hole `>14+BALL_RADIUS` after flight ends or goes OOB/out-of-energy before hole), while same shot with a `liquifier` placed covering the launch point reaches hole (`dist < hole.radius+BALL_RADIUS`) — verified by simulation or manual test.
- [ ] After 5 failed attempts on hole1 (`holeAttempts===5`), a one-line `caddy` banter mentioning `liquifier` appears once (and can be dismissed) before next attempt; it does not fire before 5 or after already shown.
- [ ] Winning hole1 on `3-hole Trial` does **not** show `Choose an Upgrade`; instead `first-restock.json` cutscene plays (first time) then bag becomes 4 modifiers and `stacking-third` banter shows before `Hole 2` banner; second time playing the course the cutscene is skipped but bag grant + `stacking-third` banter still occur. Hole2 has no treasure.
- [ ] Before the reward menu on hole3 (`currentHoleIndex===2`, `rewardPending===true`), `rewards-second` banter plays and only after it closes does `#reward-overlay` become visible. Hole3 has a gold chest that can be collected for an extra reward, while still respecting the hole-start reward after the banter.
- [ ] On replay (`hasSeenCutscene("first-restock")===true`) the cutscene is skipped (`cutsceneIsActive()===false` immediately after win) but banters (`controls-first`, `stacking-third` after hole1 win, `rewards-second` before hole3 reward) still replay each run.
