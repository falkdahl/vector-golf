# REQ-008: Obstacles & Collision - Instant Reset

- **ID:** REQ-008
- **Title:** Static Obstacles & Collision (Instant Destruction)
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Obstacles & Rules (Phase 4)

## Description
The map SHALL contain static obstacles. Touching any obstacle with the ball SHALL instantly destroy the ball and reset the player to the beginning (tee) to try again.

## Rationale
User requirement: "There should be static obstacles that when touched destroys the ball." + selected "Instant reset" for failure behavior. Obstacles create routing challenge around wind field.

## Requirements

1. Obstacle definitions in `src/obstacles.js` and `src/levels.js`:
   - Support at least two shapes: `rect: {x, y, w, h}` (AABB) and `circle: {x, y, r}`.
   - Level SHALL define array `obstacles = [{type:'rect', x:..., y:..., w:..., h:...}, {type:'circle', x:..., y:..., r:...}, ...]` with 4-6 obstacles for the single-hole MVP that block direct tee->hole line, forcing wind-aware routing.
   - Obstacles are static (no movement) for MVP.
2. Collision detection in `src/physics.js` or `src/obstacles.js` exported `checkObstacleCollision(ballPos, ballRadius, obstacles)`:
   - Circle-vs-AABB: find closest point on rect to circle center, distance < radius => collision.
   - Circle-vs-Circle: distance between centers < sum radii => collision.
   - Checked every physics tick while ball exists (including when drifting slowly), not only when `isMoving`.
3. On collision:
   - Immediately call `resetBall()` (REQ-011) - ball position reset to tee, velocity zero, state -> `AIMING`, charge reset.
   - No explosion animation beyond optional 1-frame flash (must feel instant per spec).
   - No lives decrement; infinite retries.
4. Rendering in `src/render.js:204`:
   - Rects: rendered as **reddish brick texture** (base `#A63A2A` with per-brick variation `#B04A32/#963925/#A8432E/#8D3526`, brick size `22×10` with `2px` light mortar `rgba(232,215,195,0.88)`, offset every other row, outer stroke `#5A1F14` `2px` + inner `rgba(255,230,210,0.18)` `1px`), drawn before ball — no water/sand distinction for rects.
   - Circles: tree texture (shadow, trunk `#6B3A2A`, canopy `#1E7A34` etc.) as before.
5. Obstacles SHALL NOT overlap tee or hole spawn areas (minimum 30px clearance).
6. Out-of-bounds / Edge: ball center touching or leaving canvas bounds (`pos.x - radius < 0` or `pos.x + radius > canvasW` or same for y, or `pos` outside `canvas + radius*2`) SHALL also trigger instant death/reset (treated as obstacle). Edge is fatal; no bounce.

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
