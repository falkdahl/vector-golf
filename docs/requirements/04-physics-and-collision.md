# 04 — Ball Physics, Obstacles & Hole

- **ID:** 04-physics-and-collision
- **Supersedes:** REQ-005, REQ-008, REQ-009
- **Type:** Functional
- **References:** `02-canvas-system.md` (logical size, loop dt), `06-wind-system.md` (wind field, modifiers), `07-level-generation.md` (terrain zones, trees/water generation)

## 1. Ball State & Constants

- State `ball = { pos:{x,y}, vel:{x,y}, radius:6, mass:1, isMoving:boolean }` in `src/physics.js`; start at `tee` per `LEVELS[currentHoleIndex].tee`.
- Constants at top of `src/physics.js:5`: `BALL_RADIUS=6`, `FRICTION=0.35` (low so wind dominates), `MAX_POWER=600`, `MIN_POWER=50`, `MAX_CHARGE_TIME=1.5` (see `05-input-and-states.md`), `BOUNCE_DAMPING=0.7` (or `0.8`; document), `GRAVITY=0`.

## 2. Per-Tick Update `updateBall(dt)` (dt in seconds, fixed `1/60`)

Order per tick:

1. **Sample wind** `wind = getWindAt(pos)` (includes live modifiers, see `06-wind-system.md` §7). Wind is scaled with `WIND_STRENGTH=180` (normative, per `06-wind-system.md` §1.4). Effective force `|wind|*WIND_STRENGTH` is very high so a ball slowed to `20 px/s` re-accelerates to `>80 px/s` within `0.3s`.
2. **Nullify exception**: if inside a `nullify` modifier (`isInsideNullify`), **skip** both wind and friction for this tick; just `pos += vel*dt` preserving entry `vel` (see `06-wind-system.md` §7).
3. Otherwise **apply wind**: `vel += wind * WIND_STRENGTH * dt`.
4. Otherwise **apply friction**: `vel *= (1 - FRICTION * dt)`.
5. **Integrate**: `pos += vel * dt`.
6. **Check win** before death: `dist = hypot(pos.x-hole.x, pos.y-hole.y) < hole.radius + BALL_RADIUS` (edge grazing counts). On win: `vel=0; isMoving=false;` freeze; set `gameState='WIN'` (see `05-input-and-states.md` §5 and `08-rewards-and-progression.md` §1). Win is terminal until `R`/`Continue`.
7. **Check collision / water / OB / edge** every tick (including slow drift), not only when `isMoving`. See §3-§4. On tree hit **always bounce** (see §5); on water/OB/edge instant death via `resetBall()` (water not fatal while airborne).

- **No stop-reset**: speed `<5` does not trigger reset; ball keeps drifting under wind until obstacle/edge/hole. No gravity (vertical air arc is separate visual, see `src/physics.js` `GRAVITY`).

## 3. Obstacles

- **Trees**: `type:'circle'`, `r∈[18,36]`, placed per `07-level-generation.md` (see Step 4 for `treesOnFairway` ≥ `dist/3` and rough-border `W_rough-25..-4` rules). Rendered as tree texture on top canvas (see `03-rendering.md`).
- **Water hazards**: either `{x,y,w,h}` or `{x,y,r}`, blue per `03-rendering.md`, generated per `07-level-generation.md`; entering water is fatal like a tree.
- **Terrain OB** (`terrainZoneAt(pos)==='ob'`) is fatal; hitting gray OB zone triggers same reset as canvas edge unless bounced via §5 (see `07-level-generation.md`).

- Collision helpers in `src/obstacles.js` / `src/physics.js`: `checkObstacleCollision(ballPos, ballRadius, obstacles)` (circle-vs-circle, circle-vs-AABB), `isInWater(ballPos, waterHazards)`, `isOutOfBoundsTerrain(terrainZoneAt)` (or `isOutOfBounds(pos,radius,W,H)` for canvas edge), `checkTreasureHit(ballPos, ballRadius, treasure)` and `collectTreasure(level)` (`hypot(ball-treasure) < BALL_RADIUS + treasure.radius && !treasure.isCollected`).
- Tunneling guard: max step `~10px` at `600 px/s`; ensure obstacles ≥16px thick; optional swept test.
- **Treasure** (`level.treasure`, one per hole near tree, see `07-level-generation.md` §4 and `08-rewards-and-progression.md` §3): hit is **non-fatal, non-bouncing**; does not affect `vel`/`pos`; on hit set `isCollected=true`, hide, set `rewardPending=true` and call `maybeShowRewardMenu()`. Checked every tick like win, before bounce, after win check; does not count as attempt.

## 4. Out-of-Bounds & Edge

- Canvas edge contact is fatal (trees bounce, edge/water/OB do not): `pos.x - radius < 0` or `pos.x + radius > LOGICAL_W` or same for `y` → death (no bounce). Trees always bounce per §5.
- Terrain `d > W_rough` (OB gray) is fatal (`d > W_rough` behind `isOutOfBoundsTerrain`), even while airborne.
- Water blue zone is fatal **only while on ground** (`ball.z ≤ 5`); when airborne (`z>5`) water is ignored (fly over).

## 5. Tree Bounce (always, no limit — bouncy reward removed)

- Trees **always bounce**, no `bouncyBallCount`/`bouncyRemaining` limit. Bouncy Ball reward has been removed.
- **Bounce vs die** branching (in `src/main.js` collision branch while `FLYING`):
  ```
  if (hit) { // tree
    bounceBall(hit, false); // always bounce, remain FLYING
  } else if (terrainHit || waterHit || edgeOut) {
    resetBall(); // water/OB/edge fatal (water ignored if airborne)
  }
  ```
- `bounceBall` ( `src/main.js:bounceBall` with `BOUNCE_DAMPING=0.7` ):
  - **Circle tree** (only type now): `n=normalize(pos - center)`, `vel = vel - 2*dot(vel,n)*n * BOUNCE_DAMPING`, reposition to `hit.r + radius+0.5`.
  - After bounce `isMoving` stays `true`, `gameState` stays `FLYING`, wind continues. Win check still precedes bounce; hole entry never bounces.

## 6. Treasure & Rendering

- Ball as filled white circle `r=6`, black stroke, subtle shadow in `src/render.js:drawBall`.
- Treasure as gold chest/star `r 10-14` (see `03-rendering.md` §5): `drawTreasure(ctx, treasure)` draws when `!isCollected`; hit test `checkTreasureHit` is circle-vs-circle, checked every tick (including slow drift) like win, does not bounce/kill, only collects.

## Acceptance Criteria

- [ ] Ball at rest is drifted by wind within 0.2s and reaches >80 px/s within 0.3s (very fast wind with `180/0.35/28`).
- [ ] No reset on rest; only tree bounce vs water/OB/edge death or hole win terminates. Treasure hit does **not** terminate (no bounce, no reset).
- [ ] Edge grazing (`dist==radius+0.1`) no false positive; `+1px` overlap triggers bounce (tree) or reset (water/OB/edge); treasure edge `dist==BALL_RADIUS+treasure.radius+0.1` no hit, `+1px` collects.
- [ ] `nullify` preserves entry velocity (±5% over 0.5s inside, see `06-wind-system.md` §7).
- [ ] Tree hit always bounces (position re-clamped to `hit.r+radius+0.5`, velocity reflected with `BOUNCE_DAMPING=0.7`, remains `FLYING`); no limit. Water hit while airborne (`z>5`) does not trigger death; same spot with `z=0` does.
- [ ] Treasure: one per hole near tree, `hypot(ball-treasure) < BALL_RADIUS+12` collects, sets `isCollected=true` and queues reward menu; second hit no-op; does not affect `holeAttempts`.

## File Paths

- `src/physics.js:1`, `src/obstacles.js:1` (`checkTreasureHit`, `collectTreasure`), `src/render.js:80` (`drawBall`/`drawObstacles`/`drawHole`/`drawTreasure`), `src/levels.js:1` (`treasure` per hole)
