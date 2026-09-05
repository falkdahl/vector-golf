# 04 — Ball Physics, Obstacles & Hole

- **ID:** 04-physics-and-collision
- **Supersedes:** REQ-005, REQ-008, REQ-009, REQ-024 (bouncy portion)
- **Type:** Functional
- **References:** `02-canvas-system.md` (logical size, loop dt), `06-wind-system.md` (wind field), `08-level-generation.md` (terrain zones, trees/water generation)

## 1. Ball State & Constants

- State `ball = { pos:{x,y}, vel:{x,y}, radius:6, mass:1, isMoving:boolean }` in `src/physics.js`; start at `tee` per `LEVELS[currentHoleIndex].tee`.
- Constants at top of `src/physics.js:5`: `BALL_RADIUS=6`, `FRICTION=0.35` (low so wind dominates), `MAX_POWER=600`, `MIN_POWER=50`, `MAX_CHARGE_TIME=1.5` (see `05-input-and-states.md`), `BOUNCE_DAMPING=0.7` (or `0.8`; document), `GRAVITY=0`.

## 2. Per-Tick Update `updateBall(dt)` (dt in seconds, fixed `1/60`)

Order per tick:

1. **Sample wind** `wind = getWindAt(pos)` (includes live modifiers, see `07-modifiers.md`). Wind is scaled in `getWindAt`/`createField` with `WIND_STRENGTH=180` (normative, per `06-wind-system.md`). Effective force `|wind|*WIND_STRENGTH` is very high (250-450 typical) so a ball slowed to `20 px/s` re-accelerates to `>80 px/s` within `0.3s` on a 90° wind turn.
2. **Nullify exception**: if inside a `nullify` modifier (`isInsideNullify` via `modifiers.some(m=>type==='nullify' && dist<radius)`), **skip** both wind and friction for this tick; just `pos += vel*dt` preserving entry `vel` (see `07-modifiers.md`).
3. Otherwise **apply wind**: `vel += wind * WIND_STRENGTH * dt`.
4. Otherwise **apply friction**: `vel *= (1 - FRICTION * dt)`.
5. **Integrate**: `pos += vel * dt`.
6. **Check win** before death: `dist = hypot(pos.x-hole.x, pos.y-hole.y) < hole.radius + BALL_RADIUS` (edge grazing counts). On win: `vel=0; isMoving=false;` freeze position over hole; set `gameState='WIN'` and show Victory overlay (see `09-rewards-and-progression.md` / `05-input-and-states.md`). Win is terminal until `Next`/`R`.
7. **Check collision / water / OB / edge** every tick (including slow drift), not only when `isMoving`. See §3-§4. On hit with `bouncyRemaining>0` bounce (see §5); else instant death via `resetBall()`.

- **No stop-reset**: speed `<5` does not trigger reset; ball keeps drifting under wind until obstacle/edge/hole. No gravity.

## 3. Obstacles

- **Trees**: `type:'circle'`, `r∈[18,36]`, placed per `08-level-generation.md`:
  - `treesOnFairway` per tier are **on fairway** and **≥ dist(tee,hole)/3 from the tee** (see `08-level-generation.md` Step 4).
  - Non-fairway trees (extras) are **on the rough, spread around the border between rough and out of bounds** (`warpedDist ∈ [W_rough-25, W_rough-4]`, `terrainZoneAt==='rough'`), intentionally placed so the player can bounce on them (see §5 and `08-level-generation.md` Step 4). No non-fairway tree is strictly in OB. Rendered as tree texture on top canvas (see `03-rendering.md`).
- **Water hazards**: either `{x,y,w,h}` or `{x,y,r}`, blue per `03-rendering.md`, generated per `08-level-generation.md` (on-fairway counts Easy 0, Medium 1, Hard 1-3); entering water is fatal like a tree.
- **Terrain OB** (`terrainZoneAt(pos)==='ob'`) is fatal; hitting gray OB zone triggers same reset as canvas edge unless bounced via §5 (see also `08-level-generation.md`). Rough-border trees near the OB edge give the bounce opportunity before OB death.

- Collision helpers in `src/obstacles.js` / `src/physics.js`: `checkObstacleCollision(ballPos, ballRadius, obstacles)` (circle-vs-circle, circle-vs-AABB), `isInWater(ballPos, waterHazards)`, `isOutOfBoundsTerrain(terrainZoneAt)` (or `isOutOfBounds(pos,radius,W,H)` for canvas edge).
- Tunneling guard: max step `~10px` at `600 px/s`; ensure obstacles ≥16px thick; optional swept test.

## 4. Out-of-Bounds & Edge

- Canvas edge contact is fatal (no bounce, except when bouncy bounces remain per §5): `pos.x - radius < 0` or `pos.x + radius > LOGICAL_W` or same for `y` → death/bounce.
- Terrain `d > W_rough` (OB gray) is fatal (`d > W_rough` behind `isOutOfBoundsTerrain`).
- Water blue zone is fatal.

## 5. Bouncy Ball (optional via rewards)

- Counters `bouncyBallCount` (total earned, `>=0`) and `bouncyRemaining` (per-attempt remaining) are defined in `09-rewards-and-progression.md` and `05-input-and-states.md` lifecycle. Default `0`.
- **Bounce vs die** branching (in `src/main.js` collision branch while `FLYING`):
  ```
  if (hit || outOfBounds) {
    if (bouncyRemaining > 0) { bouncyRemaining--; bounceBall(hit,isEdge); }
    else resetBall();
  }
  ```
- `bounceBall`:
  - **Edge**: reflect `vel.x *= -BOUNCE_DAMPING` (vertical walls) or `vel.y *= -BOUNCE_DAMPING` (horizontal); clamp `pos` inside `[radius, W-radius]`; corner inverts both.
  - **Rect obstacle**: closest point on AABB, normal `n=normalize(ball-pos - closest)`, `vel = vel - 2*dot(vel,n)*n * BOUNCE_DAMPING`, reposition to `radius+0.5` along `n`.
  - **Circle**: `n=normalize(pos - center)`, same reflect, reposition to `hit.r + radius+0.5`.
  - After bounce `isMoving` stays `true`, `gameState` stays `FLYING`, wind continues. Win check still precedes bounce; hole entry never consumes a bounce. Simultaneous edge+obstacle consumes one bounce.

## 6. Rendering

- Ball as filled white circle `r=6`, black stroke, subtle shadow in `src/render.js:drawBall`.

## Acceptance Criteria

- [ ] Ball at rest is drifted by wind within 0.2s and reaches >80 px/s within 0.3s (very fast wind with `180/0.35/28`).
- [ ] No reset on rest; only obstacle/water/OB/edge or hole terminates.
- [ ] Edge grazing (`dist==radius+0.1`) no false positive; `+1px` overlap triggers reset/bounce.
- [ ] `nullify` preserves entry velocity (±5% over 0.5s inside, see `07-modifiers.md`).
- [ ] With `bouncy=0` any hit dies; with `1` first hit bounces (position re-clamped, velocity reflected with damping) and second dies; `bouncyRemaining` re-initializes each attempt.

## File Paths

- `src/physics.js:1`, `src/obstacles.js:1`, `src/render.js:80` (`drawBall`/`drawObstacles`/`drawHole`)
