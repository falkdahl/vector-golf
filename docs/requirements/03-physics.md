# 03 — Ball Physics, Obstacles & Hole

- **ID:** 03-physics
- **Supersedes:** 04-physics-and-collision
- **Type:** Functional
- **References:** `01-foundation.md` (logical space, dt); `02-rendering.md` (visuals); `04-levels-and-wind.md` (zones, trees/water gen); `05-modifiers-and-bag.md` (wind application)

## 1. Ball state & constants (`src/physics.js:5`)

- `ball = { pos:{x,y}, vel:{x,y}, radius:6, mass:1, isMoving }`; start at `LEVELS[i].tee`. `BALL_RADIUS=6`, `FRICTION=0.35`, `MAX_POWER=600`, `MIN_POWER=50`, `MAX_CHARGE_TIME=1.5`, `BOUNCE_DAMPING=0.7`, `GRAVITY=1100` (visual arc only; horizontal physics is 2D).
- Height gates: `AIRBORNE_Z=5` (`isBallAirborne`) — airborne balls fly over water/OB/edge (landing there is fatal). `TREE_CLEAR_Z=32` (`isBallOverTree`) — high balls pass over whole trees. `TREASURE_CLEAR_Z=28` — high balls skip chests. Low bounce arcs still collide/pick up.
- Fake-arc helpers `drawnBallCircle(ball)` (`BALL_LIFT_FACTOR=0.55`, `BALL_GROWTH_FACTOR=0.025`) and `groundPosFromDrawn()` are render-only. Physics collides on the ground shadow `ball.pos`.

## 2. Per-tick `updateBall(dt)` (fixed `1/60`)

1. Sample wind `getWindAt(pos)` (live modifiers included; `WIND_STRENGTH=180` canonical in `04-levels-and-wind.md`). A ball at `20 px/s` re-accelerates to `>80 px/s` within `0.3s`.
2. Liquifier exception: inside liquifier → skip wind + friction, `pos += vel*dt` (entry velocity preserved).
3. Else `vel += wind * WIND_STRENGTH * dt`; `vel *= (1 - FRICTION*dt)`; `pos += vel*dt`.
4. Win check before death: `hypot(pos-hole) < hole.radius + BALL_RADIUS` (grazing counts) → `vel=0`, freeze, `gameState='WIN'` path (see `06-run-rules.md`, `07-rewards-and-economy.md`).
5. Collision/water/OB/edge check every tick (even slow drift). Tree touch while low → bounce (§4); water/OB/edge while low → `resetBall()` (fatal; all ignored while airborne).
- No stop-reset: speed `<5` never resets; wind keeps drifting the ball.

## 3. Collision helpers (`src/obstacles.js`, `src/physics.js`)

- Gameplay: `checkGroundTreeCollision` (shadow vs tree base circle), `checkGroundTreasureHit` (shadow vs chest), `isInWater`, `isOutOfBoundsTerrain`/`isOutOfBounds` (edge), `collectTreasure(level)`. Height gating (`isBallAirborne` / `z>TREE_CLEAR_Z` / `z>TREASURE_CLEAR_Z`) at the call site in `src/main.js`. Legacy `checkObstacleCollision` kept for compat; `checkDrawn*` variants are deprecated for gameplay.
- Tunneling guard: max step `~10px` at `600 px/s`; obstacles ≥16px thick; optional swept test.
- Treasure hit is non-fatal, non-bouncing, no velocity change: on hit `isCollected=true`, hide, `rewardPending=true`, `maybeShowRewardMenu()` (may fire mid-`FLYING` and freeze physics). Checked every tick like win, after win check, before bounce. Multi-chest levels (tutorial hole 3/4) test each chest individually.

## 4. Tree bounce (ground-plane while low)

- Trees bounce while low (`z ≤ TREE_CLEAR_Z`): reflect `vel` about contact normal with `BOUNCE_DAMPING=0.7`, re-clamp so ground circles just touch, stay `FLYING`, wind continues. No bounce limit (bouncy-ball reward removed). High balls pass over with no bounce. Win precedes bounce; hole entry never bounces.
- Edge/water/OB never bounce — instant death when low. Airborne balls may travel past the edge/over water/OB; landing outside/OB while low resets.

## Acceptance

- [ ] Resting ball drifts within 0.2s, exceeds 80 px/s within 0.3s.
- [ ] No reset on rest; only tree bounce vs water/OB/edge death or win/treasure ends flight.
- [ ] Edge grazing `dist==radius+0.1` no trigger, `+1px` triggers when low; airborne no death; treasure edge `+0.1` no hit, `+1px` collects when low.
- [ ] Liquifier preserves entry velocity ±5% over 0.5s.
- [ ] Low tree touch bounces in ground space and stays `FLYING`; high flight passes over; water/OB/edge low resets, airborne flies over.

## File paths

- `src/physics.js:1`, `src/obstacles.js:1`, `src/render.js:80` (`drawBall`/`drawObstacles`/`drawHole`/`drawTreasure`), `src/levels.js:1` (treasure data)
