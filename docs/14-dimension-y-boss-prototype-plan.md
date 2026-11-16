# Dimension-Y Boss Prototype Plan

Status: Stage 1 prototype implemented (`?boss=1`). See "Prototype status" at the end.

## Goal

Build a focused Stage 1 prototype of the Dimension-Y boss battle to validate the turn structure, boss action countdowns, minion pressure, chest economy, 3-life attrition, Free Shot usage, and the debug entry that skips the campaign.

Boss: Slicer.

## In scope

- Stage 1 only.
- One hand-authored arena: crescent platform over a void, tee at one end, boss at the other.
- Player aim, charge, shoot loop using the existing ball/wind/modifier systems.
- Minions that advance toward the tee after the player's shot is over, easing between steps instead of teleporting.
- Boss action queue with visible countdowns.
- Four boss actions:
  - Projectile barrage.
  - Spawn minions.
  - Destroy all placed items and chests with a pulse.
  - Rare laser that removes one life.
- Boss with 6 lives. The boss relocates every enemy turn (eased motion), not on hit.
- Player with 3 lives.
- Health is shown on the entities in the arena, not in the top HUD bar.
- A floating asteroid barrier in front of the boss blocks straight tee-to-boss shots; curved shots can use the top/bottom gaps.
- Asteroids drift up and down between the enemy and player phases (some up, some down per turn), animated with ease-in/ease-out.
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
   - Each minion advances one step toward the tee with an ease-in/ease-out animation.
   - If a minion reaches the tee, the player loses 1 life and that minion is destroyed after its final step animates in.
   - Continue resolving the remaining minions.
2. **Boss acts.**
   - If the boss has no active action, it chooses the next action and starts its countdown.
   - If the boss already has an active action, advance the countdown.
   - When the countdown reaches 0, the action takes effect.
   - A newly chosen action does not advance on the same enemy turn.
3. **Entities shift (after the enemy turn, before the player turn).**
   - The boss eases to its next preset position every turn. A boss hit never teleports it.
   - Asteroids ease up/down to their next drift positions. Asteroids alternate headings, so roughly half move up and half move down each shift.
4. Check lives. At 0 lives, show the regular game over screen and return to the main menu.
5. Return to the player phase.

### Boss action countdown

- Each action has a `rounds` value: the number of enemy turns until it takes effect.
- On selection: set the countdown, show the telegraph, do not advance it that turn.
- On each later enemy turn: decrement the countdown.
- At 0: execute the action, clear it, and choose again on a later enemy turn.
- A boss hit does not cancel an ongoing action and does not move the boss. Poise changes only during the post-enemy shift, so the countdown continues from the same position.

## Boss actions

### 1. Projectile barrage

- Countdown telegraph shows the projectiles' initial directions as a full ring around the boss.
- On execution, launch projectiles evenly around the full circle (not just toward the tee).
- Projectiles are rendered as simple circles with a subtle glow, no trailing streak, and a radius of 6px (down from 9).
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

## Boss lives, movement and animation

- Boss has 6 lives.
- A ball hit removes 1 boss life and flashes the boss, but does not move it.
- After every enemy turn (and before the next player turn), the boss eases to the next preset position (ease-in/ease-out over ~0.7s). This keeps the player from repeating the exact same shot while making the relocation readable.
- Boss radius is 30px (down from 36) so it is harder to hit.
- Minion radius is 15px (up from 12) so minions are easier to hit; minion visuals scale with the radius.
- Ongoing boss actions continue through a hit and through the shift.
- At 0 boss lives, Stage 1 is cleared.

## Asteroid motion

- The asteroid barrier is no longer part of the static arena image; asteroids are drawn dynamically.
- Each asteroid starts with an alternating up/down heading. During the shift phase after the enemy turn, every asteroid eases ±28px vertically (0.75s), reversing at the configured bounds (96–624) so some always move up and some down.
- Collision uses the asteroids' live positions.

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

- Initial minion count (currently 2).
- Minions spawned per spawn action (currently 2).
- Minion turns-to-tee: randomized whole number of steps per minion, currently 3–5.
- Minion movement duration (currently 0.34s per step) and radius (currently 15).
- Maximum minions on the field (currently 12).
- Boss lives (currently 6), radius (currently 30), and relocation duration (currently 0.7s).
- Asteroid drift step (28px), duration (0.75s), and bounds (96–624).
- Chest spawn interval.
- Maximum chests on the field.
- Countdown rounds for each boss action (barrage 2; spawn 1; pulse 1; laser 3).
- Number of other boss actions required between lasers (currently 2).
- Projectile count (64), speed (250), radius (6), and full-circle distribution for the barrage.
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

- **Minions:** straight two-point spawn→tee path, randomized 3–5 steps each, advance one stepped/eased move per enemy turn, killed by ball, tee contact costs a life.
- **Barrage projectiles:** full-circle spawn, circular bodies, wind-affected, modifier-deflectable, ignore minions, tee contact costs a life.
- **Chests:** periodic spawn, ball pickup, destroyed by pulse.
- **Boss:** 6 lives, relocates every enemy turn with eased motion, action countdowns.
- **Asteroids:** live positions that drift up/down during the post-enemy shift.

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
- [ ] Minions advance one by one after the shot and before the next player shot, easing between steps instead of teleporting.
- [ ] A minion reaching the tee costs 1 life and is destroyed after its final step animates in.
- [ ] Boss chooses an action and shows its countdown.
- [ ] An ongoing boss action advances each enemy turn and executes at 0.
- [ ] Barrage shows a full-circle telegraph and launches circular projectiles evenly around the boss that do not hurt minions.
- [ ] Spawn action shows the number of minions and spawned minions wait one turn.
- [ ] Pulse destroys placed modifiers and uncollected chests.
- [ ] Laser removes 1 life and cannot occur again until the required number of other actions resolve.
- [ ] Boss takes 6 hits to kill. A hit does not move it; it eases to a new preset position every enemy turn.
- [ ] Asteroids drift up/down (some each way) with ease-in/ease-out after the enemy turn and before the player turn.
- [ ] Minions are larger (15px) and the boss is smaller (30px) than the original prototype.
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

Intervening commits (included here):

- `cb3efd1` increased difficulty: minions now path straight from spawn to the tee, max raised to 12, and the barrage became a dense 64-projectile spread at speed 250.
- `470c833` gave each minion a random 3–5 step lifetime so they do not all reach the tee together.
- `a9ebfdb` raised boss lives to 6 and shortened spawn/pulse countdowns to 1 round.

Current changes on top of those commits:

- Boss and minions no longer teleport; all movement uses ease-in/ease-out.
- Boss relocates every enemy turn instead of on hit; boss radius 30, minion radius 15.
- Asteroids are dynamic and drift up/down during a post-enemy shift phase.
- Barrage spawns projectiles evenly around a full circle; projectiles are circular with no trail and radius 6.

Verified in headless Firefox:

- Direct boot with no campaign/menu/cutscene flash; no page or console errors.
- Boss relocates only during the shift phase and stays put on damage; asteroids alternate up/down and animate.
- Minion steps interpolate between spawn and path nodes; tee arrival resolves after the final animation.
- Barrage spawns evenly around the full circle (spawn angles verified; projectiles thin out quickly at speed 250, radius 6).
- Campaign `STORAGE_KEY` preserved; `?hole=` behavior unchanged.

Known gaps / next steps:

- `?boss=2` and `?boss=3` still start Stage 1.
- No pause/menu exit during boss play (Escape is intentionally swallowed); use the game over/victory flow or reload.
- Mobile controls/layout are not tuned (out of scope).
- Laser gating and barrage/minion non-interaction are code-reviewed, not exhaustively exercised.
- Chest collection was exercised through the reward flow; full ball-path pickup uses the same shared hit test.
