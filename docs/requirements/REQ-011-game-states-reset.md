# REQ-011: Game States & Instant Reset Logic

- **ID:** REQ-011
- **Title:** Game States & Instant Reset Logic
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Architecture - State Machine, Failure Behavior

## Description
The game SHALL implement a finite state machine managing aiming, charging, flying, win, and reset. Any failure (obstacle hit, OOB, rest outside hole) SHALL instantly reset the ball to the tee without delay or animation, returning to aiming state.

## Rationale
User selected "Instant reset" for failure. A clear state machine prevents input leaks (e.g., launching mid-flight) and ensures deterministic restart.

## Requirements

1. States in `src/main.js` (enum/string): `AIMING`, `CHARGING`, `FLYING`, `WIN` (optional `REST_CHECK` is sub-state of `FLYING`).
   - `AIMING`: ball at tee, `vel=0`, accept Left/Right aim input, Space to enter `CHARGING`.
   - `CHARGING`: Space held, update force bar, angle still adjustable? Decision: allow angle adjustment while charging? For MVP, lock angle during charging (document). Release Space -> `launch()` -> `FLYING`.
   - `FLYING`: ball moving, physics updates, wind applied, collision checked each tick. No aiming/charging input.
   - `WIN`: ball settled in hole, overlay shown, physics paused, wait for `R` -> `reset()`.
2. `resetBall()` function SHALL:
   - Set `ball.pos = {...tee}`, `ball.vel = {0,0}`, `ball.isMoving=false`.
   - Reset `aimAngle` to initial (tee->hole direction).
   - Reset `charge=0`, `charging=false`, force bar to 0%.
   - Set `state = 'AIMING'`.
   - Clear any win overlay.
   - Be idempotent and callable from collision, OOB, miss-at-rest, and `R` key.
3. Triggers for `resetBall()`:
   - Obstacle collision (REQ-008) -> immediate call within same physics tick.
   - OOB (ball outside canvas+bounds) -> immediate.
   - Rest outside hole (REQ-009) -> immediate upon stop detection.
4. `R` key SHALL always trigger `resetBall()` (except maybe during `CHARGING` - treat as cancel and reset).
5. No lives/attempts counter for MVP; infinite retries.

## Acceptance Criteria

- [ ] State transitions are logged (or debuggable) and never allow `launch()` when `state !== 'AIMING' && 'CHARGING'`.
- [ ] Hitting obstacle mid-flight resets within 1 frame; ball reappears at tee, not at obstacle.
- [ ] Ball coming to rest outside hole resets instantly (no 1-second pause).
- [ ] Pressing `R` at any time (AIMING/FLYING/WIN) resets to tee.
- [ ] Rapid Space tap during FLYING does not relaunch.
- [ ] After reset, first frame renders ball at tee with correct aim line.

## Dependencies
- REQ-005, REQ-006, REQ-007, REQ-008, REQ-009

## Notes
- Avoid async `setTimeout` for reset; keep synchronous.
- Consider debouncing `R` (200ms) to prevent double-reset.

## File Paths
- `src/main.js:1` (state enum, resetBall, launch)
- `src/input.js:1` (state gating)
