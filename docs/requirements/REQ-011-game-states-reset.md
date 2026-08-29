# REQ-011: Game States & Instant Reset Logic

- **ID:** REQ-011
- **Title:** Game States & Instant Reset Logic
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Architecture - State Machine, Failure Behavior

## Description
The game SHALL implement a finite state machine managing aiming, charging, flying, win, and reset. Any failure (obstacle hit, edge/OOB) SHALL instantly reset the ball to the tee without delay or animation, returning to aiming state. Resting/drfiting outside the hole SHALL NOT trigger a reset; the ball continues drifting under wind.

## Rationale
User selected "Instant reset" for failure. A clear state machine prevents input leaks (e.g., launching mid-flight) and ensures deterministic restart.

## Requirements

1. States in `src/main.js` (enum/string): `AIMING`, `CHARGING`, `FLYING` (also covers drifting), `WIN` (optional `REST_CHECK` removed).
   - `AIMING`: ball at tee, `vel=0`, accept Left/Right aim input, Space to enter `CHARGING`.
   - `CHARGING`: Space held, update force bar, angle still adjustable? Decision: allow angle adjustment while charging? For MVP, lock angle during charging (document). Release Space -> `launch()` -> `FLYING`.
   - `FLYING`: ball moving/drifting, physics updates, wind applied always (even when slow), collision/edge/hole checked each tick. No aiming/charging input. This state persists while ball drifts; there is no automatic transition to rest.
   - `WIN`: ball entered hole (distance < radius-2), overlay shown, physics paused, wait for `R` -> `reset()` and increment attempts handling per REQ-014.
2. `resetBall()` function SHALL:
   - Set `ball.pos = {...tee}`, `ball.vel = {0,0}`, `ball.isMoving=false`.
   - **Keep `aimAngle` unchanged** (persisted between attempts per REQ-019); do NOT reset to tee->hole direction.
   - Reset `charge=0`, `charging=false`, force bar to 0%.
   - Set `state = 'AIMING'`.
   - Clear any win overlay.
   - Be idempotent and callable from collision, OOB/edge, and `R` key. SHALL NOT be called on rest.
3. Triggers for `resetBall()` (death):
   - Obstacle collision (REQ-008) -> immediate call within same physics tick (even when drifting slowly).
   - Edge/OOB (ball touching canvas edge or outside bounds) -> immediate.
   - `R` key always triggers reset. Rest outside hole does NOT trigger reset.
4. `R` key SHALL always trigger `resetBall()` (except maybe during `CHARGING` - treat as cancel and reset).
5. Attempts counter (REQ-014) SHALL be incremented on each `launch()` and optionally on `R` reset; displayed in UI and win overlay. Infinite retries, counter tracks until level cleared.

## Acceptance Criteria

- [ ] State transitions are logged (or debuggable) and never allow `launch()` when `state !== 'AIMING' && 'CHARGING'`.
- [ ] Hitting obstacle mid-flight or while drifting slowly resets within 1 frame; ball reappears at tee, not at obstacle.
- [ ] Ball coming to rest/drifting outside hole does NOT reset; it continues drifting under wind until obstacle/edge/hole.
- [ ] Ball drifting slowly into obstacle still dies.
- [ ] Ball touching edge while drifting triggers instant reset (no bounce).
- [ ] Pressing `R` at any time (AIMING/FLYING/WIN) resets to tee and updates attempts counter.
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
