# REQ-005: Ball Physics & Movement

- **ID:** REQ-005
- **Title:** Ball Physics & Movement
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Physics (Phase 3)

## Description
The ball SHALL be a circular physics body with position and velocity, influenced by wind, friction, and boundaries. The ball SHALL never be considered "at rest" to trigger a reset; instead it SHALL continue to be drifted by the vector field indefinitely until it hits an obstacle, the screen edge (OOB), or the hole. The win/lose check SHALL be continuous, not based on stop detection.

## Rationale
Believable golf physics without over-engineering; wind must continuously influence the ball (min 20% max power per REQ-003) so the ball is always drifting. Only obstacle/edge/goal terminate the shot, not friction-induced stopping.

## Requirements

1. Ball state in `src/physics.js` SHALL be `{pos:{x,y}, vel:{x,y}, radius:6, mass:1, isMoving:boolean}` with start position from `levels.js` tee (e.g., `80,300`).
2. Update per fixed tick `updateBall(dt)` SHALL:
   - Apply wind: `vel.x += wind.x * WIND_STRENGTH * dt`, `vel.y += wind.y * WIND_STRENGTH * dt` (wind from `getWindAt(pos)`). Wind force SHALL be at least 10% of `MAX_POWER` (REQ-003) and with **high acceleration** (effective force ≥120-180 when `WIND_STRENGTH` 80) so the ball re-accelerates quickly after wind-induced direction changes and does not crawl slowly.
   - Apply linear friction/damping: `vel *= (1 - FRICTION * dt)` where `FRICTION` is tunable (e.g., 0.7-0.9 so that wind can overcome friction but not overdamp; lower than 1.2 to allow faster wind response). Friction SHALL be low enough that wind acceleration dominates and ball reaches >60 px/s within 0.5s after being slowed to 20 px/s.
   - Integrate: `pos += vel * dt`.
   - Handle canvas bounds: touching the edge of the screen SHALL be treated as OOB/death and trigger instant reset (no bounce). The ball SHALL NOT bounce off walls; edge contact is fatal (REQ-008).
3. **No Stop-Reset**: The ball SHALL NOT be reset merely because it became stationary or slow. If `speed < 5`, the ball SHALL continue to be influenced by wind and will drift. There SHALL be no automatic reset on rest. The only terminal conditions are: obstacle collision, OOB/edge, or entering the hole.
4. Ball SHALL be rendered as filled white circle with `radius` 6px, thin black stroke, and subtle shadow in `src/render.js`.
5. Constants SHALL be exposed at top of `src/physics.js:5`: `BALL_RADIUS`, `FRICTION`, `STOP_THRESHOLD`, `STOP_TIME`, `BOUNCE_DAMPING` (BOUNCE_DAMPING may be unused if edge is fatal, but keep for documentation). `MAX_POWER` and `MIN_POWER` define launch power.
6. No gravity for top-down view (or `GRAVITY=0`).

## Acceptance Criteria

- [ ] Ball launched at max power travels ~500-700px before friction would stop it without wind; with wind (min 10% max power, high acceleration) it never fully stops but drifts.
- [ ] With zero wind, ball travels straight along launch angle; with wind field, path curves visibly (>15px lateral deviation over flight) and direction changes are sharp, not sluggish.
- [ ] **Drift & Acceleration**: Ball placed at rest (`vel=0`) anywhere on the field begins moving within 0.5s and reaches >50 px/s within 0.5s; a ball slowed to 15 px/s by friction and then hit by perpendicular wind accelerates to >60 px/s within 0.5s (verified by measuring speed 0.5s after 90° wind turn). Ball does NOT crawl at <20 px/s for >0.5s after direction change.
- [ ] Ball does NOT reset when it becomes slow/stops; it only resets on obstacle, edge, or hole.
- [ ] Edge contact: ball touching canvas edge (`pos +/- radius` outside bounds) triggers instant death/reset (no bounce), verified by launching ball toward edge.

## Dependencies
- REQ-002 (dt), REQ-003 (wind)

## Notes
- Avoid per-frame `Math.random` in physics; deterministic.
- Use `Math.hypot` for speed.

## File Paths
- `src/physics.js:1`
- `src/render.js:80` (drawBall)
