# REQ-019: Launch Angle Persistence Between Attempts

- **ID:** REQ-019
- **Title:** Launch Angle Persistence Between Attempts
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Input, Game States

## Description
The player's chosen launch angle (orbit aiming via Left/Right arrows) SHALL be kept between attempts on the same hole. When the ball dies (hits obstacle or screen edge) and is reset to the tee, the aim angle SHALL NOT be reset to the tee->hole direction. The player SHALL resume aiming from the angle they had before the previous shot, allowing fine-tuning without re-aiming from scratch. Only when a new hole is loaded (hole advance or game reset) SHALL the angle be initialized to point toward the new hole.

## Rationale
User requested angle persistence to reduce repetitive re-aiming and make the game feel more fluid. Keeping the angle between retries respects the player's intent and speeds up iteration, while still resetting on new hole to give a sensible initial direction.

## Requirements

1. **State**: `aimAngle` SHALL be stored as persistent state in `src/input.js` / `src/main.js` and SHALL NOT be reset by `resetBall()` (death, OOB, `R` during play). Only `loadLevel()` (new hole) SHALL initialize `aimAngle` to `atan2(hole.y - tee.y, hole.x - tee.x)`.

2. **`resetBall()` in `src/main.js`** SHALL:
   - Reset `ball.pos`, `ball.vel`, `isMoving`, `charge`, `charging`, `gameState = 'AIMING'`, hide win overlay, clear `ball` physics.
   - **NOT** call `setAimAngle()` to reset toward hole. The current `aimAngle` value SHALL be preserved verbatim.

3. **`loadLevel(index)` in `src/main.js`** SHALL initialize `aimAngle` to point toward the new hole's tee->hole vector. This is the only place where `setAimAngle` is called on (re)load, not on death.

4. Visual feedback in `src/render.js:drawAim` SHALL continue to show the orbit indicator at the persisted angle immediately after reset, so the player sees the same aim line.

5. Input SHALL remain disabled during `FLYING`/`WIN` as per REQ-006; angle changes only during `AIMING`/`CHARGING`.

## Acceptance Criteria

- [ ] On game start (Hole 1), initial `aimAngle` points toward Hole 1 (tee->hole).
- [ ] Player rotates aim 90° clockwise (e.g., Right Arrow for ~1s), launches, hits obstacle and dies. After instant reset to tee, aim line still points 90° off original, not reset to toward-hole.
- [ ] Player can immediately launch again with same angle without re-aiming, or fine-tune by ± a few degrees.
- [ ] Pressing `R` during play (reset without scoring) also keeps current `aimAngle` (not reset).
- [ ] Completing Hole 1 and advancing to Hole 2: new `aimAngle` now points toward Hole 2's tee->hole (reset on hole advance).
- [ ] Resetting entire game after win (`R` in WIN) loads Hole 1 with angle toward Hole 1.
- [ ] `resetBall()` does not call `setAimAngle`; only `loadLevel()` does.

## Dependencies
- REQ-006 (aiming controls)
- REQ-011 (reset logic)
- REQ-005 (ball physics)

## Notes
- Implementation: remove `setAimAngle(...)` from `resetBall()` in `src/main.js:172`; keep it in `loadLevel()`.
- If `aimAngle` is `null` on first load, initialize; otherwise preserve.

## File Paths
- `src/main.js:172` (resetBall - remove angle reset)
- `src/main.js:68` (loadLevel - keep angle init)
- `src/input.js:1` (aimAngle persistence)
- `docs/requirements/REQ-006-aiming-controls.md:39` (update AC)
- `docs/requirements/REQ-011-game-states-reset.md:24` (update resetBall spec)
