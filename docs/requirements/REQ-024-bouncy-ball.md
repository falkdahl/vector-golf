# REQ-024: Bouncy Ball +1 Upgrade Reward

- **ID:** REQ-024
- **Title:** Bouncy Ball +1 Upgrade Reward (Stackable Bounces)
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** New Feature - Reward / Ball Resilience (REQ-015/REQ-021 Extension)

## Description
The game SHALL provide an upgrade reward `Bouncy Ball +1` (type `bouncyBall` / `bouncy`) that allows the ball to bounce one additional time before dying on obstacle or edge contact. The reward SHALL be included in the list of random upgrade awards in the reward menu (REQ-021) alongside `Amplify`, `Nullify`, `Flip`, `Free Shots +3`, and `Area +20%`. If the same award is taken multiple times, the number of allowed bounces per attempt SHALL stack additively: taking it twice SHALL give 2 bounces per attempt, three SHALL give 3, etc. The bounce allowance SHALL be tracked with a hidden counter that is re-initialized each attempt to the total number of times the reward has been selected. When the ball hits an obstacle or canvas edge, it SHALL bounce (reflect velocity) and decrement the per-attempt counter if bounces remain; if the counter is `0` at the moment of impact, the ball SHALL die (instant reset per REQ-008/REQ-011).

## Rationale
Instant death on obstacle/edge (REQ-008) makes later holes punishing under wind. A bounce reward adds progression and forgiveness without removing challenge: players who invest in bounciness can survive glancing hits, trading off against new modifier supply, free shots, or area growth. Per-attempt re-initialization (same bounces each attempt) keeps the effect consistent across retries, while additive stacking (`+1` per acquisition) is predictable and balances against unlimited bounces. Including the reward in the random 3-of-N offer keeps the menu fresh and prevents guaranteed resilience, requiring strategic choice. A hidden tracker keeps HUD simple (similar to `freeShots` and `areaUpgradeCount`).

## Requirements

1. **Pool Inclusion** in `src/main.js` (REQ-021 Pool):
   - The random upgrade pool `POOL` per REQ-021 SHALL be extended from five to **six** distinct types: `['amplify','nullify','flip','freeShots','areaUp','bouncyBall']` (internal identifiers; `bouncyBall` MAY be alias `bouncy` or `bouncyBallPlus1`, but SHALL be documented consistently).
   - The reward menu SHALL still display **exactly three** distinct options per trigger, now randomly chosen as `shuffle([...POOL]).slice(0,3)` (3-of-6 uniform without replacement). The excluded three types SHALL not be shown that trigger. Over many triggers all six types SHALL remain possible to appear.
   - No change to trigger timing (`totalAttempts %5===0`) or blocking logic; only the pool size grows.

2. **Stacking State & Hidden Tracker** in `src/main.js`:
   - SHALL include `bouncyBallCount: number` (integer `>=0`, total times reward has been selected) and `bouncyRemaining: number` (integer `>=0`, per-attempt remaining bounces), initialized to `0` on **new game**: page load / `initLevel()` with `currentHoleIndex===0`, `resetGameAfterWin()` (press `R` in `WIN`/`GAME_COMPLETE`), and full page reload.
   - On each acquisition of the `Bouncy Ball +1` reward (`claimReward('bouncyBall')` when offered), `bouncyBallCount += 1` (exactly `+1` per selection, clamped `>=0`, integer) SHALL be executed once. No `supply`/`freeShots`/`areaUpgradeCount` change in this branch.
   - The per-attempt tracker SHALL be re-initialized at the start of **each attempt** to the current total: `bouncyRemaining = bouncyBallCount`. This SHALL occur on:
     - `handleLaunch(angle,power)` after launching (set before `gameState="FLYING"`),
     - `resetBall()` (death/OOB/`R` during play re-entering `AIMING`),
     - `loadLevel(n)` / `advanceHole()` / `handleNextHole()` when entering next hole in `AIMING`,
     - `resetGameAfterWin()` SHALL reset both to `0` (new game) and NOT re-initialize to old total.
   - `bouncyRemaining` SHALL be clamped `>=0`, integer, hidden (no HUD). `bouncyBallCount` MAY be exposed via helpers for tests but SHALL NOT be rendered in `drawHUD` or win overlay. Debug exposure via `window.__getBouncyBallCount`, `window.__getBouncyRemaining`, etc. is allowed.
   - Helpers SHALL be `getBouncyBallCount()`, `getBouncyRemaining()`, `getBouncyCount()` alias, `addBouncyBall(n=1)`, `setBouncyBallCount(v)` that clamp to `>=0` and update `bouncyRemaining` appropriately when setting total outside of attempt (for tests). For per-attempt semantics, `setBouncyBallCount` SHOULD also reset `bouncyRemaining = bouncyBallCount` if called while in `AIMING` (or leave to next `resetBall` for `FLYING`).

3. **Bounce vs Death Logic** in `src/main.js` / `src/physics.js` / `src/obstacles.js`:
   - Collision detection SHALL remain `checkObstacleCollision(ball.pos, BALL_RADIUS, obstacles)` and `isOutOfBounds(pos, radius, canvasW, canvasH)` per REQ-008.
   - In the main update/collision branch (`update(dt)` when `gameState==="FLYING"`), instead of immediate `resetBall()` on `hit || outOfBounds`, the game SHALL check `bouncyRemaining`:
     ```js
     function handleHit(hitObj, isEdge){
       if (bouncyRemaining > 0) {
         bouncyRemaining = Math.max(0, bouncyRemaining -1);
         bounceBall(hitObj, isEdge); // reflect, reposition, keep FLYING
       } else {
         resetBall(); // death, also re-initializes bouncyRemaining to bouncyBallCount in resetBall()
       }
     }
     ```
   - **Bounce physics**:
     - **Edge** (`isOutOfBounds`): determine which wall was hit (`x-radius<0` → left, `x+radius>canvasW` → right, `y-radius<0` → top, `y+radius>canvasH` → bottom). Reflect the corresponding velocity component: `vel.x *= -BOUNCE_DAMPING` for vertical walls, `vel.y *= -BOUNCE_DAMPING` for horizontal walls. Clamp position inside bounds (`pos.x = radius` or `canvasW - radius`, etc.) to prevent sticking. If corner (both axes OOB), invert both. `BOUNCE_DAMPING` SHALL be `0.7-0.8` (reuse `BOUNCE_DAMPING` from `src/physics.js:8`) or `1.0` for perfectly elastic if documented; damping SHALL be applied to preserve wind influence after bounce.
     - **Obstacle - Rect**: compute closest point on AABB, normal `n = normalize(ball.pos - closestPoint)`, reflect `vel = vel - 2*dot(vel,n)*n * BOUNCE_DAMPING`, reposition ball outside obstacle by `radius + 0.5` along normal to avoid re-collision.
     - **Obstacle - Circle**: normal `n = normalize(ball.pos - obs.center)`, same reflect formula, reposition to `obs.r + radius + 0.5` along normal.
     - After bounce, `ball.isMoving` stays `true`, `gameState` stays `FLYING`, ball continues under wind/friction. No reset, no win check interruption.
   - **Die when out of bounces**: if `bouncyRemaining === 0` at moment of impact, SHALL call `resetBall()` (which also resets `bouncyRemaining = bouncyBallCount` for next attempt). Hitting obstacle and edge simultaneously SHALL consume only one bounce (or be treated as one hit).
   - Win condition (`checkWin()` per REQ-009) SHALL still be checked before bounce/death; entering hole always counts as win regardless of bounces remaining, and does NOT consume a bounce.
   - No bounce SHALL occur during `AIMING`/`CHARGING`/`WIN`; ball at tee is not colliding.

4. **Persistence & Lifecycle** per REQ-011/REQ-014/REQ-020/REQ-022/REQ-023:
   - `bouncyBallCount` SHALL **persist** through death resets (`resetBall()` on obstacle/OOB when out of bounces, or after a bounce) and through `R` during play — those SHALL re-initialize `bouncyRemaining` to current `bouncyBallCount` but SHALL NOT reset `bouncyBallCount` itself.
   - `bouncyBallCount` SHALL **persist** across hole advances (`advanceHole()` / `handleNextHole()` / `loadLevel(n>0)`) — advancing SHALL NOT reset it (similar to `supply`, `freeShots`, `areaUpgradeCount`). Only a new game reset SHALL zero it. `bouncyRemaining` SHALL be re-initialized to the persisted `bouncyBallCount` on entering the new hole.
   - Deterministic per run: bounces for a given count SHALL be same; randomness only affects *whether* the reward was offered (REQ-021), not bounce logic itself. No `localStorage` required.

5. **Rendering of Upgrade Button** in `src/render.js`:
   - When `bouncyBall` is among the three randomly offered upgrades, its button SHALL be rendered with distinct styling for recognizability and high contrast (similar to other buttons, no white card):
     - Label `Bouncy Ball +1` (or `Bouncy +1`), icon `◎` or `◉` or `⦿` or `🏀` (e.g., `◎` 22-24px), color `#1abc9c` (teal) or `#16a085` / `#2c3e50` distinct from existing five colors (`#e67e22` amplify orange, `#3498db` nullify blue, `#9b59b6` flip purple, `#2ecc71` freeShots green, `#f39c12` areaUp amber); document choice, but SHALL be distinct and pass contrast on dim `rgba(0,0,0,0.55)` over green.
     - Border `rgba(26,188,156,0.9)` 2px, fill `rgba(26,188,156,0.28)` (hover `0.38`), with dark outline on icon and white label with stroke per REQ-021 button spec.
     - Hint text `+1 bounce` 11px `rgba(255,255,255,0.95)` with stroke, key hint `[1]`/`[2]`/`[3]` positional.
   - When `bouncyBall` is not offered, no `Bouncy Ball +1` button SHALL be drawn that trigger.

6. **No External Storage & No HUD**:
   - No new HUD element is required to display `bouncyBallCount` or `bouncyRemaining` in MVP (hidden tracker, similar to `freeShots` and `areaUpgradeCount`). The remaining bounces MAY be visible via ball trail or debug overlay optionally, but not required. Debug exposure via `window` helpers is allowed.

## Acceptance Criteria

- [ ] On fresh page load (new game) hidden `bouncyBallCount===0`, `getBouncyRemaining()===0`, `getBouncyBallCount()===0`, HUD shows no bounce info, reward menu at `Total=0` draws **exactly three** buttons randomly chosen from **six** possible types `Amplify`, `Nullify`, `Flip`, `Free Shots +3`, `Area +20%`, `Bouncy Ball +1` (pool size 6). Never duplicate types in one menu, never 2/4/5/6 buttons, never shows excluded types. Over 12 reloads, all six pool types appear at least once statistically (3-of-6 random). Verified by `getRewardOffered().length===3` and `new Set(offered).size===3` subset of pool.
- [ ] When `Bouncy Ball +1` is among the three offered, its button shows label `Bouncy Ball +1`, icon `◎` (or `◉`/`⦿`) 22-24px teal `#1abc9c`, border `rgba(26,188,156,0.9)`, hint `+1 bounce`, key hint positional `[1]`/`[2]`/`[3]`.
- [ ] Selecting `Bouncy Ball +1` when offered (click or positional key `1`/`2`/`3`) closes the menu, increments `bouncyBallCount` from `0` to `1`, `bouncyRemaining` becomes `1` (initialized for next attempt), `supply`, `freeShots`, `areaUpgradeCount` unchanged, `Total` still `0`, no `Total Attempts: N` text drawn.
- [ ] Stacking: take `Bouncy Ball +1` a second time (next `Total=5` menu where it is again randomly offered and chosen). `bouncyBallCount` becomes `2`, `bouncyRemaining` for next attempt becomes `2`. Verified via `getBouncyBallCount()===2` and after `handleLaunch()` `getBouncyRemaining()===2`.
- [ ] With `bouncyBallCount===0` (no upgrades), ball hitting obstacle or edge dies immediately: `resetBall()` called, ball at tee, `gameState==="AIMING"`, `bouncyRemaining` stays `0`.
- [ ] With `bouncyBallCount===1` and `bouncyRemaining===1` at launch, ball hitting rect obstacle at speed does NOT die on first hit: `bouncyRemaining` decrements to `0`, velocity reflects (dot product with normal inverted, `BOUNCE_DAMPING` applied), position repositioned outside obstacle, ball remains `FLYING` and wind-controllable. Second hit on same obstacle (now `0` remaining) dies and resets to tee with `bouncyRemaining` re-initialized to `1` for next attempt.
- [ ] Edge bounce similarly: with `1` bounce, ball touching edge (`pos +/- radius` outside bounds) bounces (e.g., left wall `vel.x *= -BOUNCE_DAMPING`, clamped to `radius`), `bouncyRemaining 1→0`, remains `FLYING`; next edge hit with `0` dies.
- [ ] Obstacle and edge both count toward same tracker; mix: with `2` bounces, hitting obstacle then edge consumes `2→1→0`, remains alive; third hit dies.
- [ ] `bouncyRemaining` is re-initialized each attempt: with `bouncyBallCount===1`, launch → `remaining=1`; bounce → `0`; die → next launch → `remaining=1` again (not `0`). Verified by launching, bouncing, dying, and checking `getBouncyRemaining()===1` at start of new attempt.
- [ ] With `bouncyBallCount===1`, dying without bouncing (e.g., directly into hole win, or `R` reset) also re-initializes to `1` for next attempt.
- [ ] Advancing hole (`handleNextHole()` after win) does NOT reset `bouncyBallCount`; `bouncyRemaining` for next hole's first attempt is still `1` (or `2` if stacked). Modifiers cleared but bounce count persists.
- [ ] Pressing `R` in `WIN`/`GAME_COMPLETE` (`resetGameAfterWin()`) resets `bouncyBallCount` to `0`, `bouncyRemaining` to `0`, together with `holeAttempts=0, totalAttempts=0, supply={0,0,0}, freeShots=0, areaUpgradeCount=0`, and next `0` menu again offers new random 3-of-6.
- [ ] `Bouncy Ball +1` not offered scenario: if current random 3-set does not contain `bouncyBall`, it cannot be selected and counts stay unchanged that trigger.
- [ ] Hidden tracker: canvas top HUD still shows only `Hole: N/M` `Attempts: X` `Total: Y`, win overlay shows only hole/total, no `Bounces` text in DOM or HUD. `window.__getBouncyRemaining()` and `window.__getBouncyBallCount()` still return correct values.
- [ ] No 3rd-party libraries; pure vanilla JS `bouncyBallCount`, `bouncyRemaining = bouncyBallCount` per attempt, `Math.random()` shuffle 3-of-6, reflection math with `BOUNCE_DAMPING`.

## Dependencies

- REQ-015 (modifier area, but bouncy is independent; same hotbar persistence model)
- REQ-021 (upgrade reward menu 3-random-of-N, trigger `totalAttempts%5`, `rewardOffered`, `claimReward` branching)
- REQ-020 (supply coexistence; bouncy does not affect supply)
- REQ-022 (free shots coexistence; bouncy does not affect freeShots, but both are hidden per-run counters)
- REQ-023 (modifier area coexistence; pool now 6, bouncy competes with area)
- REQ-008 (obstacle collision & edge death, now bounce vs die conditional)
- REQ-005 (ball physics, `updateBall`, `BOUNCE_DAMPING`, `BALL_RADIUS`)
- REQ-011 (game states, `resetBall`, `loadLevel`, `handleLaunch`, persistence)
- REQ-012 (rendering inside canvas, high-contrast buttons, no white card)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let bouncyBallCount = 0;
  let bouncyRemaining = 0;
  function getBouncyBallCount(){ return bouncyBallCount; }
  function getBouncyRemaining(){ return bouncyRemaining; }
  function addBouncyBall(n=1){ bouncyBallCount = Math.max(0, bouncyBallCount + Math.floor(n)); }
  function setBouncyBallCount(v){ bouncyBallCount = Math.max(0, Math.floor(v)); bouncyRemaining = bouncyBallCount; }

  const POOL = ['amplify','nullify','flip','freeShots','areaUp','bouncyBall']; // now 6
  // maybeShowRewardMenu: rewardOffered = shuffle([...POOL]).slice(0,3); // 3-of-6

  function initBouncyForAttempt(){ bouncyRemaining = bouncyBallCount; }

  function claimReward(type){
    if(!rewardMenuVisible || !rewardOffered.includes(type)) return;
    if(type==='freeShots') addFreeShots(3);
    else if(type==='areaUp') addAreaUpgrade(1);
    else if(type==='bouncyBall') addBouncyBall(1);
    else addToSupply(type,1);
    rewardClaimedFor = totalAttempts;
    rewardMenuVisible=false; rewardOffered=[];
  }
  // handleLaunch: after launch, initBouncyForAttempt() or set bouncyRemaining = bouncyBallCount
  // resetBall: after reset, bouncyRemaining = bouncyBallCount
  // loadLevel/handleNextHole: bouncyRemaining = bouncyBallCount
  // resetGameAfterWin: bouncyBallCount=0; bouncyRemaining=0;

  function bounceBall(hit, isEdge, canvasW, canvasH){
    if(isEdge){
      if(ball.pos.x - BALL_RADIUS < 0 || ball.pos.x + BALL_RADIUS > canvasW){
        ball.vel.x *= -BOUNCE_DAMPING;
        ball.pos.x = Math.max(BALL_RADIUS, Math.min(canvasW - BALL_RADIUS, ball.pos.x));
      }
      if(ball.pos.y - BALL_RADIUS < 0 || ball.pos.y + BALL_RADIUS > canvasH){
        ball.vel.y *= -BOUNCE_DAMPING;
        ball.pos.y = Math.max(BALL_RADIUS, Math.min(canvasH - BALL_RADIUS, ball.pos.y));
      }
    } else if(hit.type==='rect'){
      const cx = Math.max(hit.x, Math.min(ball.pos.x, hit.x+hit.w));
      const cy = Math.max(hit.y, Math.min(ball.pos.y, hit.y+hit.h));
      let nx = ball.pos.x - cx, ny = ball.pos.y - cy;
      const len = Math.hypot(nx,ny) || 1;
      nx/=len; ny/=len;
      const dot = ball.vel.x*nx + ball.vel.y*ny;
      ball.vel.x = (ball.vel.x - 2*dot*nx) * BOUNCE_DAMPING;
      ball.vel.y = (ball.vel.y - 2*dot*ny) * BOUNCE_DAMPING;
      ball.pos.x = cx + nx*(BALL_RADIUS+0.5);
      ball.pos.y = cy + ny*(BALL_RADIUS+0.5);
    } else if(hit.type==='circle'){
      let nx = ball.pos.x - hit.x, ny = ball.pos.y - hit.y;
      const len = Math.hypot(nx,ny) || 1;
      nx/=len; ny/=len;
      const dot = ball.vel.x*nx + ball.vel.y*ny;
      ball.vel.x = (ball.vel.x - 2*dot*nx) * BOUNCE_DAMPING;
      ball.vel.y = (ball.vel.y - 2*dot*ny) * BOUNCE_DAMPING;
      ball.pos.x = hit.x + nx*(hit.r + BALL_RADIUS+0.5);
      ball.pos.y = hit.y + ny*(hit.r + BALL_RADIUS+0.5);
    }
  }

  // In update FLYING:
  // if(hit = checkObstacleCollision(...)) { if(bouncyRemaining>0){ bouncyRemaining--; bounceBall(hit,false); } else resetBall(); return; }
  // if(isOutOfBounds(...)) { if(bouncyRemaining>0){ bouncyRemaining--; bounceBall(null,true); } else resetBall(); return; }
  // getBouncyRemaining() etc. exposed via window.__getBouncyRemaining
  ```
- Visual choice for Bouncy button: `◎` with teal `#1abc9c` ensures distinctness from Amplify orange `#e67e22`, Nullify blue `#3498db`, Flip purple `#9b59b6`, Free Shots green `#2ecc71`, AreaUp amber `#f39c12`.
- Bounce reposition `+0.5` prevents immediate re-collision next tick. Damping `0.7` keeps wind influence after bounce.
- If simultaneous edge+obstacle, consume only one bounce.

## File Paths

- `src/main.js:1` (POOL size 6 with bouncyBall, bouncyBallCount, bouncyRemaining, getBouncyBallCount/getBouncyRemaining/addBouncyBall/setBouncyBallCount, initBouncyForAttempt, claimReward bouncyBall branch +1, handleLaunch/resetBall/loadLevel/handleNextHole/resetGameAfterWin lifecycle, bounce vs die branching, bounceBall helper with BOUNCE_DAMPING)
- `src/physics.js:1` (BOUNCE_DAMPING export, optional bounce helper, updateBall unchanged but main handles bounce)
- `src/obstacles.js:1` (checkObstacleCollision / isOutOfBounds still used; optional getCollisionNormal helper)
- `src/render.js:1` (REWARD_TYPE_DEFS bouncyBall entry #1abc9c ◎, getRewardButtonsLayout now 3-of-6 random, drawRewardMenu draws Bouncy Ball +1 button when offered, no HUD for bounces)
- `index.html:1` (no DOM for bouncy)
- `style.css:1` (no styling needed; canvas-only)
