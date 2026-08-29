# REQ-005: Ball Physics & Movement

- **ID:** REQ-005
- **Title:** Ball Physics & Movement
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Physics (Phase 3)

## Description
The ball SHALL be a circular physics body with position and velocity, influenced by wind, friction, and wall boundaries. It must come to rest naturally so the win/lose check can trigger.

## Rationale
Believable golf physics without over-engineering; must integrate wind per-frame and support instant reset semantics.

## Requirements

1. Ball state in `src/physics.js` SHALL be `{pos:{x,y}, vel:{x,y}, radius:6, mass:1, isMoving:boolean}` with start position from `levels.js` tee (e.g., `80,300`).
2. Update per fixed tick `updateBall(dt)` SHALL:
   - Apply wind: `vel.x += wind.x * WIND_STRENGTH * dt`, `vel.y += wind.y * WIND_STRENGTH * dt` (wind from `getWindAt(pos)`).
   - Apply linear friction/damping: `vel *= (1 - FRICTION * dt)` where `FRICTION` = 0.02-0.05 (tunable). Additional strong damping when `speed < 10` to guarantee stop.
   - Integrate: `pos += vel * dt`.
   - Handle canvas bounds: either bounce with `vel *= -0.7` (elasticity 0.7) OR clamp and reset if OOB. For MVP, walls bounce; only bottom-less void if ball leaves canvas by >radius*2 counts as OOB -> reset. Document choice.
3. Stop detection: if `speed = hypot(vel.x, vel.y) < 5 px/s` continuously for `STOP_TIME = 0.4s`, set `isMoving=false` and trigger rest check (REQ-009 / REQ-011).
4. Ball SHALL be rendered as filled white circle with `radius` 6px, thin black stroke, and subtle shadow in `src/render.js`.
5. Constants SHALL be exposed at top of `src/physics.js:5`: `BALL_RADIUS`, `FRICTION`, `STOP_THRESHOLD`, `STOP_TIME`, `BOUNCE_DAMPING`.
6. No gravity for top-down view (or `GRAVITY=0`). If gravity added, it must be documented and small.

## Acceptance Criteria

- [ ] Ball launched at max power travels ~500-700px before stopping (tuned).
- [ ] With zero wind, ball travels straight along launch angle; with wind field, path curves visibly (>15px lateral deviation over flight).
- [ ] Ball naturally stops within 4-6 seconds after launch without obstacles.
- [ ] Stop detection does not fire while ball is still visibly moving (>5px/s).
- [ ] Wall bounce: ball hitting canvas edge reverses with reduced speed; or OOB triggers instant reset (either behavior consistently applied).

## Dependencies
- REQ-002 (dt), REQ-003 (wind)

## Notes
- Avoid per-frame `Math.random` in physics; deterministic.
- Use `Math.hypot` for speed.

## File Paths
- `src/physics.js:1`
- `src/render.js:80` (drawBall)
