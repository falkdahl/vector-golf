# Dimension-Y Boss Prototype Plan

Status: The single Dimension-Y boss level is implemented (main-menu entry + `?boss=1` debug jump). See "Prototype status" at the end.

## Goal

Build the single Dimension-Y boss battle to validate the turn structure, boss action countdowns, minion pressure, chest economy, 3-life attrition, and Free Shot usage. Dimension-Y has one boss level and no additional stages or bosses.

Boss: Slicer.

## In scope

- One Dimension-Y boss level (Slicer). No additional levels or bosses.
- One hand-authored arena: crescent platform over a void, tee at one end, boss at the other.
- Player aim, charge, shoot loop using the existing ball/wind/modifier systems.
- Minions that advance toward the tee after the player's shot is over, easing between steps instead of teleporting.
- Boss action queue with visible countdowns.
- Four boss actions:
  - Projectile barrage.
  - Spawn minions.
  - Destroy all placed items with a pulse (chests are unaffected).
  - Rare laser that removes one life.
- Boss with 6 lives. The boss relocates every enemy turn (eased motion), not on hit.
- Player with 3 lives.
- Health and action countdowns are drawn on the entities in the arena. There is no top HUD bar and no boss name label.
- A floating asteroid barrier in front of the boss blocks straight tee-to-boss shots; curved shots can use the top/bottom gaps.
- Asteroids advance one short step per enemy turn at different speeds. They spawn just outside the canvas and keep moving in one direction until they leave, then despawn; replacements keep spawning so asteroids are always present between the player and the boss.
- The wind field is static during the fight. Sources, sinks, doublets, and vortexes keep their initial positions; only placed modifiers move.
- A boss hit cancels any boss action that is still counting down (not just the laser) and always triggers the instant pulse.
- Regular game over screen that returns to the main menu.
- Free Shot item is excluded from the boss reward pool and is not offered by chest rewards in this fight.
- Chests respawn a fixed number of rounds after the previous chest is collected.
- No tee flag; the tee is a plain launch ring so the ball and its health read clearly.
- Main-menu entry: after `end-18-hole` has been seen, the Dimension-Y row starts the boss level through the same "Choose 2 starting items" overlay used by courses.
- Debug entry: `?boss=1` starts the boss level directly, with no campaign, menus, cutscenes, or campaign save dependency. The Hashimoto Protocol cheat (ball drag & drop) also works in boss mode.

## Not in this prototype

- Additional Dimension-Y levels or bosses.
- Tally, Gaze, gravity lens, wrapping edges, moving portals, core shield.
- Extra Life modifier.
- Full trajectory preview, endpoint prediction, or target-hit glow.
- Story, cutscenes, mobile tuning, final art/audio.
- Portals. Keep the first prototype to the core turn/attack loop.

## Turn structure

### Player phase

1. Player aims and shoots.
2. The shot resolves until it is over:
   - Ball hits the boss and is consumed.
   - Ball lands outside the arena and is consumed.
   - Airborne balls may fly over the void or past the canvas edge, matching campaign flight rules; the ball is never recalled mid-flight.
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
   - Asteroids advance one short eased step (see "Asteroid motion").
4. Check lives. At 0 lives, show the regular game over screen and return to the main menu.
5. Return to the player phase.

### Boss action countdown

- Each action has a `rounds` value: the number of enemy turns until it takes effect.
- On selection: set the countdown, show the telegraph, do not advance it that turn.
- On each later enemy turn: decrement the countdown.
- At 0: execute the action, clear it, and choose again on a later enemy turn.
- A boss hit cancels any active countdown (barrage, spawn, pulse, or laser) and does not move the boss. The hit also triggers an instant pulse. Poise changes only during the post-enemy shift.

## Boss actions

### 1. Projectile barrage

- Countdown telegraph samples the spiral's launch directions around the boss.
- On execution, launch 128 projectiles one after another at ~18ms intervals. The launch angle rotates continuously over 2.5 turns, producing a spiral stream rather than a single full-circle burst. The enemy turn waits until the whole stream has launched.
- Projectile speed is 375 (50% faster than the previous 250).
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
- The pulse destroys all placed modifiers. It does not destroy chests.
- Hitting the boss also triggers an instant pulse (it destroys placed modifiers immediately, without waiting for a boss action).
- It does not destroy bag items, minions, projectiles, the boss, or the player.
- Placed modifiers are lost; bag contents are unaffected.

### 4. Laser

- Countdown telegraph shows a straight line from the boss to the tee.
- The laser charges for 2 rounds before it fires.
- On execution, the player instantly loses 1 life.
- Hitting the boss while the laser is charging aborts the attack; the countdown is canceled and no life is lost (the general cancel rule applies to every boss action).
- The laser is rare and requires multiple other boss actions between two laser shots.
- Proposed rule: at least 2 other boss actions must resolve before the laser is eligible again.
- The laser cannot be blocked by modifiers. The player's counterplay is to interrupt the charge by hitting the boss.

## Boss lives, movement and animation

- Boss has 6 lives.
- A ball hit removes 1 boss life, flashes the boss, cancels any active action countdown, triggers an instant pulse (clears placed modifiers), and does not move the boss.
- After every enemy turn (and before the next player turn), the boss eases to the next preset position (ease-in/ease-out over ~0.7s). This keeps the player from repeating the exact same shot while making the relocation readable.
- Boss uses the `img/hover-cab.webp` sprite at 108px. Its hitbox is an axis-aligned 81px square inset inside the sprite (25% smaller than the visual), with the old 30px circle radius retained only as a fallback value.
- Minion radius is 15px (up from 12) so minions are easier to hit; minion visuals scale with the radius.
- A boss hit cancels the ongoing action but does not interrupt the shift; the boss still relocates during the post-enemy shift.
- At 0 boss lives, the boss enters a death sequence: pixel explosions pop across the sprite for ~1.8s, then it bursts into small square particles that are pushed by the live wind field for ~3.1s. Dimension-Y is cleared after the particles finish.

## Asteroid motion

- The asteroid barrier is no longer part of the static arena image; asteroids are drawn dynamically.
- Asteroids are spawned just outside the canvas in barrier lanes between the tee and the boss. Each picks a random direction (up or down) and a random step size, then advances one short eased step in that direction per enemy turn.
- After an enemy turn, rocks that have fully left the canvas despawn and replacements spawn just outside it, keeping the active count at the target (12) so the space between the player and the boss is never empty.
- Collision uses the asteroids' live positions, including mid-step animation.

## Vector field

- The wind field is static for the whole boss fight.
- Sources, sinks, doublets, and vortexes keep their initial positions for the whole fight.
- Placed modifiers remain local and do not move the underlying field.

## Player lives and game over

- Player has 3 lives total for the battle.
- Player hearts are drawn on the tee and never follow the ball.
- Any minion or projectile reaching the tee costs 1 life and destroys that attacker.
- Simultaneous damage sources each cost 1 life; two minions arriving together remove 2 lives, as do multiple barrage projectiles.
- The game continues in place after a hit.
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
- Chest rewards use the existing reward flow and never include Free Shot in this fight.
- Pulses (boss action or boss-hit) do not destroy chests.
- No Extra Life reward in this prototype.

## Debug entry

Required: `?boss=1` skips the entire campaign and starts the single Dimension-Y boss level directly. The main-menu Dimension-Y row is the normal entry.

Requirements:

- Works with no save and no campaign progress.
- Does not require cutscenes or menus.
- Does not overwrite campaign save data.
- Optional overrides:
  - `?boss=1&items=deflector,rotator`
  - `?boss=1&lives=3`
  - `?boss=1&debug=1` for hitboxes/entity readout.
- Expose `window.__boss` for testing: state, lives, boss lives, spawn/kill helpers, action controls.

## Prototype tuning values

These are the values to tune during the prototype, not final design:

- Initial minion count (currently 2).
- Minions spawned per spawn action (currently 2).
- Minion turns-to-tee: randomized whole number of steps per minion, currently 3–5.
- Minion movement duration (currently 0.34s per step) and radius (currently 15).
- Maximum minions on the field (currently 12).
- Boss lives (currently 6), visual sprite size (108px), square hitbox size (currently 81px), sprite source (`img/hover-cab.webp`), and relocation duration (currently 0.7s).
- Asteroid target count (12), step range (22–64px per enemy turn), step duration (0.5s), lane x-jitter, and off-canvas spawn margin.
- Chest spawn interval.
- Maximum chests on the field.
- Countdown rounds for each boss action (barrage 2; spawn 1; pulse 1; laser 2).
- Number of other boss actions required between lasers (currently 2).
- Projectile count (128), speed (375), radius (6), launch interval (~18ms), and spiral turns (2.5) for the barrage.
- Free Shot charge count and availability.

## Technical plan

### New files

- `src/bossLevels.js`
  - Dimension-Y arena data: tee, boss positions, minion paths, chest spawn points, boss action tuning.
- `src/boss.js`
  - Boss run state, player phase/enemy phase state machine, minions, projectiles, chests, boss actions, lives, rendering, debug helpers.

### Main integration

- `src/main.js`
  - Parse `?boss=` early and initialize boss mode before campaign load for the debug jump.
  - Start the boss level from the main-menu Dimension-Y row after the normal 2-item picker.
  - Branch `loadLevel`, `update`, `render`, `handleLaunch`, and `resetBall` while boss mode is active.
  - Hide campaign HUD; no boss topbar.
  - Reuse the existing game over overlay and return-to-main-menu flow.
  - Keep campaign save untouched.
- `index.html` / `style.css`
  - Boss overlay: optional debug readout only.

### Reuse

- `src/physics.js`: `createBall`, `launchBall`, `updateBall`, ball constants.
- `src/vectorField.js`: `createField`, `getWindAt`.
- `src/input.js`: existing aim/charge input.
- Existing wind rendering, ball rendering, modifier placement, and reward overlay where practical.

### Boss entities

- **Minions:** straight two-point spawn→tee path, randomized 3–5 steps each, advance one stepped/eased move per enemy turn, killed by ball, tee contact costs a life.
- **Barrage projectiles:** sequential spiral spawn, circular bodies, wind-affected, modifier-deflectable, ignore minions, tee contact costs a life.
- **Chests:** periodic spawn, ball pickup, immune to pulses.
- **Boss:** 6 lives, relocates every enemy turn with eased motion, action countdowns, instant pulse on hit.
- **Asteroids:** advance one short eased step per enemy turn, respawn off-canvas, and use live positions for collision.

### Shot resolution

- The shot ends when the ball hits the boss or lands outside the arena. The ball is not recalled or reset while it is still in flight.
- Minion hits do not have to end the shot.
- Free Shots can be used before the enemy phase.
- Only after the player phase ends do minions and the boss act.

## Acceptance checklist

- [ ] `?boss=1` starts the single Dimension-Y boss level with no campaign, menu, or cutscene flash.
- [ ] The main-menu Dimension-Y row starts the boss level through the same "Choose 2 starting items" overlay as courses.
- [ ] The two chosen starting items are in the bag when the boss fight begins.
- [ ] Works with a fresh browser profile and no save.
- [ ] Campaign save and `?hole=` behavior are untouched.
- [ ] Player can aim, charge, and shoot from the tee.
- [ ] Shot ends correctly and then enemies act.
- [ ] An airborne ball is never recalled or reset mid-flight; it may fly past the arena/canvas and only ends the shot after landing out.
- [ ] No boss name label, topbar, or message toast is visible.
- [ ] Minions advance one by one after the shot and before the next player shot, easing between steps instead of teleporting.
- [ ] A minion reaching the tee costs 1 life and is destroyed after its final step animates in.
- [ ] Boss chooses an action and shows its countdown.
- [ ] An ongoing boss action advances each enemy turn and executes at 0.
- [ ] Any boss hit cancels the active countdown (barrage, spawn, pulse, or laser) with no action taken.
- [ ] Barrage telegraphs the spiral directions, then launches 128 circular projectiles one after another in a 2.5-turn spiral. Projectiles do not hurt minions.
- [ ] Spawn action shows the number of minions and spawned minions wait one turn.
- [ ] Pulse destroys placed modifiers but leaves chests intact.
- [ ] Hitting the boss triggers an instant pulse that clears placed modifiers.
- [ ] Laser charges for 2 rounds, removes 1 life, and cannot occur again until the required number of other actions resolve.
- [ ] Hitting the boss while the laser charges aborts it with no life lost.
- [ ] Boss takes 6 hits to kill. A hit does not move it; it eases to a new preset position every enemy turn. Its 81px hitbox is an inset square inside the larger hover-cab sprite.
- [ ] At 0 boss lives, pixel explosions play across the boss for ~1.8s; it then breaks into small particles scattered by the wind before the victory screen.
- [ ] Asteroids spawn off-canvas, advance one short eased step per enemy turn in a fixed direction at varied speeds, despawn off the far edge, and keep respawning so the player/boss gap is populated.
- [ ] Wind-field elements stay fixed for the whole boss fight; placed modifiers remain local and do not move the field.
- [ ] The Hashimoto Protocol cheat toggles and ball drag works in boss mode without touching campaign save or attempts.
- [ ] Minions are larger (15px); the boss uses the hover-cab sprite with a square hitbox.
- [ ] Player hearts stay on the tee regardless of the ball position.
- [ ] Player has 3 lives; hits destroy the attacker and the game continues.
- [ ] Simultaneous hits (multiple minions or projectiles) each remove 1 life.
- [ ] Free Shot works before the enemy turn.
- [ ] At 0 player lives, the regular game over screen appears and returns to the main menu.
- [ ] Chests spawn periodically and can be collected.
- [ ] No full trajectory preview, endpoint prediction, or gold target-hit glow.
- [ ] No console errors; 60fps desktop in Chrome/Firefox.

## Open prototype questions

- Should the ball be able to parry barrage projectiles, or only modifiers deflect them?
- Should boss hits interrupt an ongoing action? Decided: yes, any hit cancels the active countdown.
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
- Boss relocates every enemy turn instead of on hit; boss uses the hover-cab sprite with an 81px square hitbox inset inside the visual, minion radius 15.
- Asteroids advance one short eased step per enemy turn at varied speeds, spawn off-canvas, and despawn after leaving.
- Barrage launches projectiles sequentially in a 2.5-turn spiral; projectiles are circular with no trail and radius 6.
- Player hearts are pinned to the tee; pulses no longer destroy chests; boss hits trigger an instant pulse.
- Every simultaneous damage source now costs a life instead of being absorbed by a grace window.
- A boss hit cancels any active action countdown (laser included) and fires the instant pulse.
- Wind-field elements stay fixed for the whole boss fight; placed modifiers remain local and do not move the underlying field.
- Boss death plays pixel explosions, then a wind-scattered particle burst, before the victory screen.
- The Hashimoto Protocol cheat (Konami code + ball drag & drop) works in boss mode.
- Removed the boss name label, topbar, and message toast; only the optional debug readout remains.

Verified in headless Firefox:

- Direct boot with no campaign/menu/cutscene flash; no page or console errors.
- Boss relocates during the shift phase and stays put on damage; its hit clears placed modifiers via an instant pulse.
- Asteroids spawn off-canvas in barrier lanes, advance in one direction one step per enemy turn, despawn off the far edge, and replacements maintain the target count.
- Minion steps interpolate between spawn and path nodes; tee arrival resolves after the final animation.
- Barrage streams projectiles sequentially in a 2.5-turn spiral (128 total, speed 375, radius 6); the enemy turn waits for the stream to finish.
- Player hearts remain at the tee while the ball flies; chests survive pulse actions.
- Campaign `STORAGE_KEY` preserved; `?hole=` behavior unchanged.

Known gaps / next steps:

- No pause/menu exit during boss play (Escape is intentionally swallowed); use the game over/victory flow or reload.
- Mobile controls/layout are not tuned (out of scope).
- Laser gating and barrage/minion non-interaction are code-reviewed, not exhaustively exercised.
- Chest collection was exercised through the reward flow; full ball-path pickup uses the same shared hit test.
