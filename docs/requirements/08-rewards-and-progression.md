# 09 — Rewards & Progression (Hole Advance, Treasure Rewards, Upgrades, Reroll)

- **ID:** 08-rewards-and-progression
- **Supersedes:** REQ-009 (win), REQ-014 (hole progression), REQ-021, REQ-022, REQ-023, REQ-025
- **Type:** Functional + UI
- **References:** `05-input-and-states.md` (attempts, GAME_OVER, banners), `06-wind-system.md` (supply), `04-physics-and-collision.md` (win check, treasure hit), `07-level-generation.md` (treasure placement), `03-rendering.md` (treasure rendering)

## 1. Hole & Win Definition

- Hole `hole={x,y,radius:14}` (12-16 tunable). Position per `07-level-generation.md`.
- **Win check every tick:** `hypot(ball.pos-hole) < hole.radius + BALL_RADIUS` (edge grazing counts).
  - On **non-final hole** win: auto-advance immediately — `vel=0`, `isMoving=false`, `modifiers` cleared **without extra supply decrement** (already consumed on placement per `06-wind-system.md` §8), `currentHoleIndex++`, `holeAttempts=0` (keep `totalAttempts`), `isFreeShotActive=false`, regenerate `treasure` uncollected, `loadLevel(next)`, `gameState='AIMING'`, `saveProgress()`. No `WIN` overlay, no `Next` button. HUD `Hole: N/M` updates.
  - On **final hole** win: `vel=0`, `isMoving=false`, `gameState='WIN'`, Victory overlay per `03-rendering.md` §4 (`★★★` + `Course Completed!` + `Total: Y` + green `Continue`) → `clearProgress()` → entry menu. Victory only for last hole.

## 2. Hole Advancement

- **Non-final:** auto-advance on hole entry → `modifiers` cleared **without refund** (supply already decremented on placement, so no extra `supply--`), `freeShot` not consumed on win, then `currentHoleIndex++`, `holeAttempts=0` (keep `totalAttempts`), `isFreeShotActive=false`, regenerate `treasure` uncollected, `loadLevel(next)`, `AIMING`. Legacy `Next` not used for intermediate holes.
- **Final:** same clearing without extra consumption (then moot — `clearProgress()` resets supply to `{1,1,1,1,0}`), `clearProgress()` + `mainMenuVisible=true` keep `COURSES_KEY`/`bestTotal` intact; `bestTotal` updated only here (see `09-persistence-and-campaign.md` §5).

## 3. Reward Triggers — Hole-Start (except hole 1) + Treasure Hit

- **State:** `rewardPending`, `rewardOffered[3]`, `rewardRerolled`, `rewardMenuVisible`, `treasure` per hole (see `07-level-generation.md` §4).
- **On new game:** `rewardPending=false`, `rewardMenuVisible=false`, `rewardOffered=[]`, `rewardRerolled=false`, `maxAttempts=10`, `holeAttempts=0`, `supply={1,1,1,1,0}`, `isFreeShotActive=false`, `treasure` uncollected for hole 1, no reward menu before first attempt. Player starts with one `rotate`.
- **On each subsequent hole** (`currentHoleIndex>0`): `rewardPending=true`, `holeAttempts=0`, `treasure` regenerated uncollected → `showHoleBanner()` `1000ms` (see `05-input-and-states.md` §6) then auto `maybeShowRewardMenu()` shows `Choose an Upgrade` before first attempt. `rewardRerolled` reset to `false`. Hole 1 shows `Hole 1` banner `1000ms` then `AIMING` (no reward).
- **Treasure trigger:** each hole exactly one `treasure` near a tree (see `07-level-generation.md` §4). When `hypot(ball.pos-treasure) < BALL_RADIUS + treasure.radius` and `!isCollected`, collect: `isCollected=true`, `rewardPending=true`, `maybeShowRewardMenu()` shows **immediately** even in `FLYING` (freezes physics). If `rewardMenuVisible`/`WIN`/`GAME_OVER`/`pause`/`mainMenuVisible` active, pending waits until cleared. Collecting does not cost attempt, once per hole, does not block/bounce.
- **Attempts reference:** launch branching is canonical in `05-input-and-states.md` §4 (auto-arm free shot, counted vs free). This file does not re-define it; reward triggers are hole-start and treasure hit only — never shot count. See `05-input-and-states.md` §4 for `attemptsLeft`/`freeShot` persistence and `§5` for `GAME_OVER` immediate on last-attempt failure.

## 4. Max Attempts — Canonical in `05-input-and-states.md`

- `maxAttempts: integer ≥10`, static `10` (no reward increases). Stored for compat, `window.__getMaxAttempts` returns `10`. If legacy saves contain `>10`, clamped but never increased in-game. See `05-input-and-states.md` §4 for `attemptsLeft` derivation and `GAME_OVER` logic.

## 5. Reward Menu — Random 3-of-7 Inside Canvas (Field Extender / Power Cell)

- Pool `POOL=['amplify','nullify','flip','rotate','freeShot','fieldExtender','powerCell']` (7 types; `rotate` red `↻` `#e74c3c`, `freeShot` gold `★` `#f1c40f` `Supply +3`, `fieldExtender` amber `◯` `#f39c12` `+10% area` (renamed from `areaUp` `+20%`, reduced), `powerCell` violet `⚡` `#8e44ad` `+10% strength` (new), legacy `areaUp` alias kept for compat `areaUp` ≡ `fieldExtender`). Per trigger pick **3 distinct** without replacement via seeded `mulberry32` using `campaignSeed+rewardSeedCounter` per `09-persistence-and-campaign.md` §4, not `Math.random`, same pool for reroll, but **`fieldExtender` (alias `areaUp`) appears 25% less frequently** than uniform: selection is weighted so `fieldExtender` inclusion probability is `0.75×` uniform (`≈32%` vs `≈43%` for 7). Implementation: uniform 3-of-7 shuffle then if `fieldExtender`/`areaUp` in offer, with deterministic `25%` chance (seeded from `campaignSeed+counter`) replace it with a random non-`fieldExtender` type not already in offer; alternatively equivalent weighted sampling `w(fieldExtender)=0.75` vs `1` for others. `powerCell` is uniform weight `1`.
- State per menu `rewardOffered` (current 3), `rewardRerolled=false` when freshly shown, `rewardMenuVisible` blocks input. Triggers are hole-start and treasure hit; 3-of-7 selection identical.
- **Inside-canvas overlay** `drawRewardMenu(ctx,W,H,offered,hovered,rerolled,rerollHovered)` when `rewardMenuVisible`: dim `rgba(0,0,0,0.55)`, title `Choose an Upgrade` 22px `700` white `stroke 5px` centered, three `150×195` buttons centered (`520×360` gap 18, enlarged even more to leave gap between icon and text):
  - `amplify` orange `#e67e22` (icon `img/amplify-icon.png` `88×88` centered, `drawImage` increased even more from `72×72` with gap to text), `nullify` blue `#3498db` (`nullify-icon.png` `88×88`), `flip` purple `#9b59b6` (`flip-icon.png` `88×88`), `rotate` red `#e74c3c` (`rotate-icon.png` `88×88`) hint `+1 to supply`, `freeShot` gold `★` `#f1c40f` hint `Supply +3` (text ★ kept, `36px` fallback at `btn.y+64` with same gradient), `fieldExtender` amber `#f39c12` (`field-extender-icon.png` `88×88`) hint `+10% area` (was `+20%`), `powerCell` violet `#8e44ad` (`power-cell-icon.png` `88×88`) hint `+10% strength`. Each icon has blueish gray gradient background `linear-gradient #6b7c99 → #8a9ab5 → #b8c4d6` `106×106` rounded `12px` (`icon 88 +18 padding`) at `bgX=btn.x+btn.w/2-53, bgY=iy-9` with `shadowBlur 6` and `stroke rgba(255,255,255,0.22)`. Gap between icon bottom (`iy+88` ≈ `btn.y+108`) and label at `btn.y+128` is `20px`. Button background `fill`/`border` keeps color identity (`rgba(230,126,34,0.28)` etc.). Reward menu icons are `Image` drawn via `ctx.drawImage` `88×88` at `btn.x+btn.w/2-44, btn.y+20` with fallback to text `»/∅/⇄/↻/◯/⚡` if image not yet loaded (`!complete || !naturalWidth`); field circles (`drawModifiers`) keep text icons (see `06-wind-system.md` §7) — reward/hotbar use images, field keeps text; hotbar icons stay `28×28`. All labels white with stroke `4px`; no `Total Attempts: N` subtitle. Legacy `areaUp` label `Area +20%` still renders as `Field Extender +10%` if legacy offer contains `areaUp`.
- **Blocking:** while visible, aim/charge/launch/modifier `1-4` placement ignored; only `1`/`2`/`3` by offered order or click selects; hotbar visible but disabled; gold glow hidden.
- **Selection** (once per menu): click or `1`/`2`/`3` → `amplify`/`nullify`/`flip`/`rotate` `supply[t]++`, `freeShot` `supply.freeShot+=3` (passive `Attempts Left: X (+Y)`), `fieldExtender`/`areaUp` `fieldExtenderCount+=1` (`areaUpgradeCount` alias) (`areaMultiplier=1+0.1*fieldExtenderCount`, retroactively grows spatial via `getEffectiveModifierRadius()`, see `06-wind-system.md` §6; base `54` → `59.4/64.8/...`), `powerCell` `powerCellCount+=1` (`powerMultiplier=1+0.1*powerCellCount`, `BASE_STRENGTH=5` → `5.5/6/...` retroactively strengthens Amplify/Flip/Rotate per `06-wind-system.md` §7.1), then `rewardPending=false; rewardMenuVisible=false; rewardOffered=[]`. Save via `saveProgress()`. For treasure menus, `isCollected` remains `true`. `fieldExtender` and `powerCell` are **passive modifiers** — no placement, shown only in hotbar.

## 6. Re-roll — Once per Menu for 1 Counted Attempt (never free)

- While `rewardMenuVisible && !rewardRerolled`, Re-roll button `190×30` centered at `cardY+192` (below cards) shown: available `rgba(255,255,255,0.12)` border `1.5px` `↻ Re-roll (1 attempt) [R]`; when `rerolled` disabled `0.06/0.35` `not-allowed`. Hit-test via `getRewardRerollButtonLayout(W,H)`.
- Input: click or `R`/`r` while menu visible and not yet rerolled → `rerollReward()` exactly once (hotkey `R`, not `0`):
  ```
  holeAttempts+=1; totalAttempts+=1; attemptsLeft = max(0, maxAttempts - holeAttempts); updateAttemptsUI(); saveProgress();
  if (attemptsLeft <=0 && !WIN) { showGameOver(); } else { rewardRerolled=true; rewardOffered=shuffle([...POOL]).slice(0,3); }
  // do NOT touch maxAttempts, do NOT consume freeShot; isFreeShotActive forced false during menu
  ```
  Costs counted attempt (never free). If `attemptsLeft` becomes `0`, Game Over immediately (hide reward, no new offer). Counts toward `maxAttempts`. Second `R`/click no-ops. After reroll new `rewardOffered` selectable via `1`/`2`/`3` only if still have attempts. `Digit0` does not trigger reroll.
- Re-reroll cleared on next fresh menu trigger; `resetGameAfterWin`/`endRun`/`clearProgress` also clears `rewardRerolled`. Blocked when not `rewardMenuVisible` or when `WIN`/`GAME_OVER`.

## 7. Persistence Interactions & Course Records

- Only full course completion (final-hole `WIN`) updates `bestTotal` per course (`09-persistence-and-campaign.md`); `End Run` and `Game Over` do not.
- Counters and `supply`/`maxAttempts`/`isFreeShotActive`/`fieldExtenderCount` (alias `areaUpgradeCount`) / `powerCellCount` /`reward…`/`treasure`/`modifiers`/`aimAngle` are part of `STORAGE_KEY` payload and re-saved after every launch/claim/reroll/placement/treasure-hit/advance (see `09-persistence-and-campaign.md`). Legacy `bouncyBallCount`/`areaUp` removed (kept for compat). `freeShot` starts `0`, `rotate` starts `1`; legacy saves default `0`/`1`. `fieldExtenderCount` and `powerCellCount` start `0`.

## Acceptance Criteria

- [ ] New game hole 1: no reward menu before first attempt, one uncollected treasure near tree, `maxAttempts=10` `Attempts Left: 10` (no `(+Y)` when `freeShot=0`) and `Attempts Left: 10 (+3)` when `freeShot=3`, `supply.rotate=1` red.
- [ ] Hole 2..N: `maybeShowRewardMenu()` shows `Choose an Upgrade` before first attempt; hole 1 never shows.
- [ ] Treasure: one per hole near tree, `hypot < BALL_RADIUS+radius` collects `isCollected=true`, `rewardPending=true`, shows immediately even in `FLYING`; second hit no-op.
 - [ ] Reward 3-of-7 grants: `amplify`/`nullify`/`flip`/`rotate` `+1`, `freeShot` `+3`, `fieldExtender` (alias `areaUp`) `+10% area` retroactively grows (`fieldExtender` 25% less frequent; `+10%` not `+20%`), `powerCell` `+10% strength` retroactively strengthens Amplify/Flip/Rotate (`BASE_STRENGTH=5` → `5.5` with 1); no `Max Attempts +5`/bouncy; hotbar shows 6 slots `amplify/nullify/flip/rotate` + passive `fieldExtender` amber `xN` + `powerCell` violet `xN` with no hotkey, no `title` tooltips, icons are `img.hotbar-icon-img` `28×28` `src="./img/amplify-icon.png"` etc. (reward menu uses `88×88` images `150×195` buttons `520×360` card gap `18` with blueish gray gradient `106×106` rounded `12px` `#6b7c99→#b8c4d6` behind icon and `20px` gap to label at `btn.y+128`, field keeps text icons `»/∅/⇄/↻`); `freeShot` keeps `★` text `36px`.
- [ ] Attempts: normal increments `holeAttempts`/`totalAttempts` on attempt reset (failure via OB/water/edge/`R` while `FLYING`, not on `handleLaunch`); free attempt reset does not increment and `supply.freeShot` consumed on launch, persists while supply remains; after counter decreases to `1` with `freeShot>0` show `Free Shot!` banner and turn on `isFreeShotActive`, else when `freeShot===0` show `Last Attempt` banner, hide `Next Attempt`, update softlock text and disable `R` after launch; last-attempt failure immediate `GAME_OVER` after decrement to `0` without returning to `AIMING`; fallback `handleLaunch` while `attemptsLeft<=0` also shows Game Over; treasure hit never increments.
- [ ] Re-roll button once `R`/click increments `holeAttempts`/`totalAttempts` counted (never free); if `attemptsLeft→0` shows Game Over, otherwise replaces offer and disables; second `R` no-ops. `Total` 11 after one reroll after hole-start.
- [ ] No white card; dim `0.55` high-contrast buttons; HUD underneath shows `Attempts Left`; treasure gold on `game` canvas.

## File Paths

- `src/main.js:1` (`POOL` 6 with `freeShot`, `reward*` state, `maybeShowRewardMenu`, `claimReward`, `rerollReward`, `handleLaunch` branching)
- `src/render.js:1` (`drawRewardMenu`, `drawTreasure`, `drawHUD`)
- `src/windThree.js:1` (golden glow for `isFreeShotActive`)
- `src/levels.js:1` (`treasure` generation), `src/terrain.js:1` (helpers)
