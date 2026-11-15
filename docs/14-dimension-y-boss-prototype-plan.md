# Dimension-Y Boss Prototype Plan

Status: Stage 1 prototype implemented (`?boss=1`). See "Prototype status" at the end.

## Goal

Build a focused Stage 1 prototype of the Dimension-Y boss battle to validate the turn structure, boss action countdowns, minion pressure, chest economy, 3-life attrition, Free Shot usage, and the debug entry that skips the campaign.

Boss: Slicer.

## In scope

- Stage 1 only.
- One hand-authored arena: crescent platform over a void, tee at one end, boss at the other.
- Player aim, charge, shoot loop using the existing ball/wind/modifier systems.
- Minions that advance toward the tee after the player's shot is over.
- Boss action queue with visible countdowns.
- Four boss actions:
  - Projectile barrage.
  - Spawn minions.
  - Destroy all placed items and chests with a pulse.
  - Rare laser that removes one life.
- Boss with 3 lives and repositioning after each hit.
- Player with 3 lives.
- Health is shown on the entities in the arena, not in the top HUD bar.
- A floating asteroid barrier in front of the boss blocks straight tee-to-boss shots; curved shots can use the top/bottom gaps.
- Regular game over screen that returns to the main menu.
- Free Shot item remains in the reward pool and is usable before the enemy turn.
- Chests respawn a fixed number of rounds after the previous chest is collected or destroyed.
- No tee flag; the tee is a plain launch ring so the ball and its health read clearly.
- Debug entry: `?boss=1` starts Stage 1 directly, with no campaign, menus, cutscenes, or campaign save dependency.

## Not in this prototype

- Stages 2 and 3.
- Tally, Gaze, gravity lens, wrapping edges, moving portals, core shield.
- Extra Life modifier.
- Full trajectory preview, endpoint prediction, or target-hit glow.
- Story, cutscenes, menu unlock flow, mobile tuning, final art/audio.
- Portals. Keep the first prototype to the core turn/attack loop.

## Turn structure

### Player phase

1. Player aims and shoots.
2. The shot resolves until it is over:
   - Ball hits the boss and is consumed.
   - Ball leaves the arena and is consumed.
   - Shot timeout/recall is reached.
3. If the player has Free Shot charges, the player may take another shot before the enemy turn.
   - A Free Shot is consumed per extra shot.
   - The enemy turn does not begin until the player has no Free Shots left or chooses to end the player phase.
4. When the player phase ends, run the enemy phase.

Minion hits do not have to end the shot. The ball can continue and chain kills unless it hits the boss, leaves the arena, or times out.

### Enemy phase

Enemies act one by one, with visible sequential feedback.

1. **Minions act, one at a time.**
   - Each minion advances one step toward the tee.
   - If a minion reaches the tee, the player loses 1 life and that minion is destroyed.
   - Continue resolving the remaining minions.
2. **Boss acts.**
   - If the boss has no active action, it chooses the next action and starts its countdown.
   - If the boss already has an active action, advance the countdown.
   - When the countdown reaches 0, the action takes effect.
   - A newly chosen action does not advance on the same enemy turn.
3. Check lives. At 0 lives, show the regular game over screen and return to the main menu.
4. Return to the player phase.

### Boss action countdown

- Each action has a `rounds` value: the number of enemy turns until it takes effect.
- On selection: set the countdown, show the telegraph, do not advance it that turn.
- On each later enemy turn: decrement the countdown.
- At 0: execute the action, clear it, and choose again on a later enemy turn.
- A boss hit does not cancel an ongoing action. The boss repositions and the countdown continues.

## Boss actions

### 1. Projectile barrage

- Countdown telegraph shows the number of projectiles and their initial directions.
- On execution, launch multiple projectiles at different directions.
- Projectiles do not collide with or damage enemy minions.
- Projectiles are wind-affected and can be deflected by placed modifiers.
- A projectile reaching the tee costs 1 life and is destroyed.
- No full path preview. Only initial directions are visible during the countdown.

### 2. Spawn minions

- Countdown telegraph shows how many minions will spawn.
- On execution, spawn that many minions.
- Spawned minions do not act on the same enemy turn they spawn.
- They begin advancing on the next enemy turn.
- Spawn locations: boss side or arena edge. Tune in the prototype.

### 3. Destroy placed items

- Countdown telegraph shows the incoming pulse.
- On execution, a large pulse travels across the field.
- The pulse destroys all placed modifiers and all uncollected chests.
- It does not destroy bag items, minions, projectiles, the boss, or the player.
- Placed modifiers are lost; bag contents are unaffected.

### 4. Laser

- Countdown telegraph shows a straight line from the boss to the tee.
- On execution, the player instantly loses 1 life.
- The laser is rare and requires multiple other boss actions between two laser shots.
- Proposed rule: at least 2 other boss actions must resolve before the laser is eligible again.
- The laser cannot be blocked by modifiers. The player's counterplay is to kill the boss before it fires.

## Boss lives and repositioning

- Boss has 3 lives.
- A ball hit removes 1 boss life.
- After each hit, the boss moves to a different preset position so the player cannot repeat the exact same shot.
- Ongoing boss actions continue through a hit.
- At 0 boss lives, Stage 1 is cleared.

## Player lives and game over

- Player has 3 lives total for the battle.
- Any minion or projectile reaching the tee costs 1 life and destroys that attacker.
- The game continues in place after a hit.
- Add a short post-hit grace window (~1 second) so a multi-projectile volley cannot drain multiple lives at once.
- At 0 lives, show the regular game over screen.
- The regular game over screen returns the player to the main menu.
- No boss-specific retry screen.

## Free Shot

- Free Shot remains as it exists in the main game.
- It is not replaced by an Extra Life modifier.
- The player may use Free Shot charges before the enemy turn.
- Each extra shot consumes one charge.
- Enemy actions only begin after the player stops using Free Shots or runs out.

## Chests

- Chests spawn periodically during the battle.
- Spawn interval, cap, and locations are tuning values.
- The player collects a chest by hitting it with the ball.
- Chest rewards use the existing reward flow and can include Free Shot.
- The boss pulse destroys uncollected chests.
- No Extra Life reward in this prototype.

## Debug entry

Required: `?boss=1` skips the entire campaign and starts Stage 1 directly.

Requirements:

- Works with no save and no campaign progress.
- Does not require cutscenes or menus.
- Does not overwrite campaign save data.
- Optional overrides:
  - `?boss=1&items=deflector,rotator`
  - `?boss=1&lives=3`
  - `?boss=1&debug=1` for hitboxes/entity readout.
- Reserve `?boss=2` and `?boss=3` for later stages.
- Expose `window.__boss` for testing: state, lives, boss lives, spawn/kill helpers, action controls.

## Prototype tuning values

These are the values to tune during the prototype, not final design:

- Initial minion count.
- Minions spawned per spawn action.
- Minion movement speed and turns-to-tee.
- Maximum minions on the field.
- Chest spawn interval.
- Maximum chests on the field.
- Countdown rounds for each boss action.
- Number of other boss actions required between lasers.
- Projectile count, speed, and spread for the barrage.
- Post-hit grace duration.
- Free Shot charge count and availability.

## Technical plan

### New files

- `src/bossLevels.js`
  - Stage 1 arena data: tee, boss positions, minion paths, chest spawn points, boss action tuning.
- `src/boss.js`
  - Boss run state, player phase/enemy phase state machine, minions, projectiles, chests, boss actions, lives, HUD sync, rendering, debug helpers.

### Main integration

- `src/main.js`
  - Parse `?boss=` early and initialize boss mode before campaign load.
  - Branch `loadLevel`, `update`, `render`, `handleLaunch`, and `resetBall` while boss mode is active.
  - Hide campaign HUD; show boss HUD.
  - Reuse the existing game over overlay and return-to-main-menu flow.
  - Keep campaign save untouched.
- `index.html` / `style.css`
  - Boss HUD: player lives, boss lives, active boss action + countdown, minion count, chest count.
  - Optional debug readout.

### Reuse

- `src/physics.js`: `createBall`, `launchBall`, `updateBall`, ball constants.
- `src/vectorField.js`: `createField`, `getWindAt`.
- `src/input.js`: existing aim/charge input.
- Existing wind rendering, ball rendering, modifier placement, and reward overlay where practical.

### Boss entities

- **Minions:** path nodes, advance one step per enemy turn, killed by ball, tee contact costs a life.
- **Barrage projectiles:** wind-affected, modifier-deflectable, ignore minions, tee contact costs a life.
- **Chests:** periodic spawn, ball pickup, destroyed by pulse.
- **Boss:** 3 lives, repositions after each hit, action countdowns.

### Shot resolution

- The shot ends when the ball hits the boss, leaves the arena, or reaches the shot timeout/recall.
- Minion hits do not have to end the shot.
- Free Shots can be used before the enemy phase.
- Only after the player phase ends do minions and the boss act.

## Acceptance checklist

- [ ] `?boss=1` starts Stage 1 with no campaign, menu, or cutscene flash.
- [ ] Works with a fresh browser profile and no save.
- [ ] Campaign save and `?hole=` behavior are untouched.
- [ ] Player can aim, charge, and shoot from the tee.
- [ ] Shot ends correctly and then enemies act.
- [ ] Minions advance one by one after the shot and before the next player shot.
- [ ] A minion reaching the tee costs 1 life and is destroyed.
- [ ] Boss chooses an action and shows its countdown.
- [ ] An ongoing boss action advances each enemy turn and executes at 0.
- [ ] Barrage shows directions during countdown and launches projectiles that do not hurt minions.
- [ ] Spawn action shows the number of minions and spawned minions wait one turn.
- [ ] Pulse destroys placed modifiers and uncollected chests.
- [ ] Laser removes 1 life and cannot occur again until the required number of other actions resolve.
- [ ] Boss takes 3 hits to kill and repositions after each hit.
- [ ] Player has 3 lives; hits destroy the attacker and the game continues.
- [ ] Post-hit grace prevents multi-hit life drain.
- [ ] Free Shot works before the enemy turn.
- [ ] At 0 player lives, the regular game over screen appears and returns to the main menu.
- [ ] Chests spawn periodically and can be collected.
- [ ] No full trajectory preview, endpoint prediction, or gold target-hit glow.
- [ ] No console errors; 60fps desktop in Chrome/Firefox.

## Open prototype questions

- Should the ball be able to parry barrage projectiles, or only modifiers deflect them?
- Should boss hits interrupt an ongoing action? Proposed: no.
- Should chests be collectible during the same shot that hits the boss?
- Should minions spawn at the boss or at arena edges?
- Should the pulse travel at a fixed speed or resolve instantly with an animation?

## Prototype status

Implemented in `src/boss.js` + `src/bossLevels.js`, with boss branches in `src/main.js` and HUD markup/styles in `index.html` + `style.css`.

Entry: `?boss=1` (optional `&items=deflector,rotator,freeShot`, `&lives=N`, `&bosslives=N`, `&debug=1`). `window.__boss` exposes state/entity/life/action helpers.

Verified in headless Chromium:

- Direct boot with no campaign/menu/cutscene flash; no page or console errors.
- Shot loop, boss hit + reposition, action countdown/execution, spawn-wait turn, minion advance + tee life loss, periodic chests, pulse cleanup, Free Shot bonus loop, reward claim (spatial + passives), game over and victory overlays returning to the menu.
- Campaign `STORAGE_KEY` preserved; `?hole=` behavior unchanged.

Known gaps / next steps:

- `?boss=2` and `?boss=3` still start Stage 1.
- No pause/menu exit during boss play (Escape is intentionally swallowed); use the game over/victory flow or reload.
- Mobile controls/layout are not tuned (out of scope).
- Laser gating and barrage/minion non-interaction are code-reviewed, not exhaustively exercised.
- Chest collection was exercised through the reward flow; full ball-path pickup uses the same shared hit test.
