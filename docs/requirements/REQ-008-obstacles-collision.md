# REQ-008: Obstacles & Collision - Circular Trees & Blue Water Hazards - Instant Reset

- **ID:** REQ-008
- **Title:** Static Obstacles — Circular Trees via Poisson Disc & Blue Water Hazards (Instant Destruction)
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Obstacles & Rules (Phase 4), Terrain Pipeline Step 4 (REQ-010)

## Description
The map SHALL contain static obstacles: **circular obstacles for trees** (placed via **Poisson Disc Sampling**, with a subset **on the fairway per difficulty (REQ-034)** and optional extra in Rough & Out of Bounds) and **blue water hazards** (generated via **Cellular Automata / thresholded Perlin Noise** near fairway edges). Touching any tree, water hazard, or OB boundary with the ball SHALL instantly destroy the ball and reset the player to the beginning (tee) to try again.

## Rationale
User requirement: "There should be static obstacles that when touched destroys the ball." + selected "Instant reset" + new spec: "Use circular obstacles for trees" and "Water hazards should be blue". Trees in rough/OB create routing challenge while Poisson disc gives natural non-overlapping spacing; water hazards near fairway edges create risk-reward forced carries. Blue water vs green/brown terrain gives immediate visual hazard recognition.

## Requirements

1. Obstacle definitions in `src/obstacles.js` and `src/levels.js` / `src/terrain.js`:
   - **Trees SHALL be `circle: {type:'circle', x, y, r}` only** for newly generated levels per 5-step pipeline (REQ-010/034). `r ∈ [18,36]` (trees). Per **REQ-034**, a difficulty-relevant subset `treesOnFairway` SHALL be placed **on the fairway** (`terrainZoneAt === 'fairway'` or `d ≤ W_fairway-4` not in Green/Tee mask) with counts **Easy 1-2, Medium 2-3, Hard 3-5**; any additional trees for aesthetics MAY be in Rough & OB (`terrainZoneAt === 'rough'/'ob'`). Legacy `rect` obstacles SHALL be considered deprecated; newly generated levels SHALL NOT use `rect` for trees. At least one `doublet` SHALL be co-located within `≤2px` of a fairway tree when `treesOnFairway≥1` (applies to all difficulties per REQ-034).
   - Level SHALL define `obstacles = [{type:'circle', x, y, r}, ...]` with **trees per difficulty on fairway** (Easy 1-2, Medium 2-3, Hard 3-5) plus optional extra in Rough/OB for aesthetics (total may be higher, but normative is `treesOnFairway` per REQ-034) plus `waterHazards = [{x,y,w,h} | {x,y,r}]` for blue water zones with **on-fairway counts Easy 0, Medium 1, Hard 1-3** (see REQ-034 §2, area `800-3000px²` each). Both arrays together block direct tee->hole line, forcing wind-aware routing.
   - Water hazards SHALL be rendered **blue** (`#4A90E2` / `#3A8DDE` / `#2E86C1` per REQ-010 §2, hue `210±10`, sat >50) on the bottom canvas above terrain zones, and SHALL be treated as **fatal** (entering water triggers same instant reset as tree/OB).
   - Obstacles are static (no movement) for MVP.
   - Generation methods per REQ-010 Step 4:
     - **Trees:** **Poisson Disc Sampling** (Bridson's algorithm, `minDist = 45±15`, `k=30`) across rough/OB with density scaled (`OB 1.8× Rough`: `minDist_OB=38`, `minDist_Rough=62` or `p=0.55` accept in rough). Ensures natural, non-overlapping spacing (`distance ≥ r1+r2+6`).
     - **Water:** **Cellular Automata** (8x8 grid, `fill 0.42`, 4 smoothing iterations) or thresholded Perlin (`noise > 0.6`) near fairway edges (`d ∈ [W_fairway-20, W_fairway+40]`), **never completely blocking fairway** (validation per REQ-010 Step 5).
2. Collision detection in `src/physics.js` or `src/obstacles.js` exported `checkObstacleCollision(ballPos, ballRadius, obstacles)` **and** `isInWater(ballPos, waterHazards)` / `isOutOfBoundsTerrain(terrainZoneAt)`:
   - Circle-vs-Circle (tree): distance between centers < sum radii => collision.
   - Circle-vs-AABB (water rect, if used): closest point on rect to circle center, distance < radius => collision (water). For `waterHazards` as circles, same as tree.
   - Circle-vs-Circle (water circle): same as tree.
   - Checked every physics tick while ball exists (including when drifting slowly), not only when `isMoving`. If `terrainZoneAt(ballPos) === 'ob'` or `isInWater(ballPos)` true, also trigger reset (OB gray and water blue are fatal terrain, not just obstacles).
3. On collision / water / OB:
   - Immediately call `resetBall()` (REQ-011) - ball position reset to tee, velocity zero, state -> `AIMING`, charge reset.
   - No explosion animation beyond optional 1-frame flash (must feel instant per spec).
   - No lives decrement; infinite retries.
4. Rendering in `src/render.js:204` and `src/terrain.js`:
   - **Trees (circular obstacles):** rendered as tree texture (shadow, trunk `#6B3A2A`, canopy `#1E7A34` etc.) on the top canvas (`z-index:2`) above terrain zones, as before. All trees are circles, `r=18-36`.
   - **Water Hazards:** rendered as **solid blue** fill (`#4A90E2` etc., see REQ-010) on the bottom canvas (`z-index:1`) above green/fairway/rough/OB zones but below trees, with optional subtle stroke `#2E6DA4` `1px`. No reddish brick texture for newly generated levels; `rect` brick rendering is deprecated for new levels.
   - **Terrain Zones (Green/Fairway/Rough/OB) per REQ-010 §2:** rendered on bottom canvas before water, with fixed colors: Green `#A8E6A3` light, Fairway `#6BC96E` slightly darker, Rough `#3D8B3D` even darker, OB `#2E2E2E` gray. Trees on top, water blue on top of zones.
5. Obstacles/Hazards SHALL NOT overlap tee or hole spawn areas (minimum `40px` clearance for trees, `≥40px` for water clusters from tee/green masks). Trees in Rough/OB only, never Fairway/Green.
6. Out-of-bounds / Edge: ball center touching or leaving canvas bounds (`pos.x - radius < 0` or `pos.x + radius > canvasW` or same for y) SHALL also trigger instant death/reset (treated as obstacle). Edge is fatal; no bounce. Additionally, entering OB gray terrain zone (`d > W_rough`) SHALL be considered OB and trigger reset (same as edge), per terrain SDF.

## Acceptance Criteria

- [ ] Level loads with >=4 obstacles visible, none covering tee/hole.
- [ ] Ball launched directly into a rect obstacle resets to tee within 1 frame (<16ms) of contact; no tunneling through thin obstacles at max speed (sweep or ensure obstacle thickness > maxStep ~10px).
- [ ] Circle obstacle collision triggers same instant reset.
- [ ] Grazing edge (distance == radius + 0.1px) does NOT trigger false positive; overlapping by 1px does trigger.
- [ ] After reset, force bar clears and aim angle resets (REQ-006/007).
- [ ] Obstacles remain in same positions across resets (deterministic).

## Dependencies
- REQ-005 (ball), REQ-010 (level), REQ-011 (reset)

## Notes
- Tunneling mitigation: since `dt` is fixed 1/60 and max speed 600px/s => max step 10px, ensure obstacles are at least 16px thick. Optional line-segment sweep for robustness.
- Future: polygon obstacles via SAT, but not for MVP.

## File Paths
- `src/obstacles.js:1`
- `src/levels.js:10` (obstacle data)
- `src/physics.js:50` (collision check)
- `src/render.js:60` (drawObstacles)
