# REQ-009: Hole & Win/Lose Conditions

- **ID:** REQ-009
- **Title:** Hole & Win/Lose Conditions
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Hole & Rules (Phase 4)

## Description
The map SHALL contain a hole. If the ball comes to rest inside the hole, the player wins. If the ball comes to rest outside the hole (or is destroyed by obstacle/OOB), the player SHALL instantly restart from the beginning to choose a new angle/power.

## Rationale
User requirement: "If the ball does not land in the hole player restarts from the beginning, choosing an angle and force to launch the ball with." This defines the core fail-forward loop.

## Requirements

1. Hole definition in `src/levels.js`: `hole = {x, y, radius:14}` (radius tunable 12-16). Position e.g., `~820, 300` near right edge, not overlapping obstacles.
2. Win condition checked in `src/physics.js` or `src/main.js` when ball is at rest (REQ-005 stop detection):
   - `distance = hypot(ball.pos.x - hole.x, ball.pos.y - hole.y)`
   - If `distance < hole.radius - 2` (ball mostly inside) AND `speed < STOP_THRESHOLD` (5px/s) => WIN.
   - Visual: ball must be fully inside hole rim; allow 2px tolerance.
3. Lose/Reset condition:
   - If ball is at rest AND `distance >= hole.radius` => LOSE -> trigger instant reset (REQ-011).
   - No partial credit; ball stopping on lip (>=radius) is a miss.
4. Rendering in `src/render.js`:
   - Hole as dark circle `radius` filled `#111` with inner shadow, outer rim `2px #333`, optionally small flag pole/marker offset.
   - When win, show overlay: "You Win!" + "Press R to Play Again" centered.
5. Win state SHALL be terminal until player presses `R` (or clicks) to reset; during win, physics/input paused.
6. No stroke counter for MVP (optional future: display attempts).

## Acceptance Criteria

- [ ] Hole is visible near opposite side from tee, radius 14px.
- [ ] Ball stopping with center 5px from hole center => win overlay appears.
- [ ] Ball stopping with center 20px from hole center => instant reset to tee (no overlay, no delay).
- [ ] Ball rolling over hole at high speed (>10px/s) does NOT count as win; must settle.
- [ ] Ball destroyed by obstacle mid-flight never triggers win, even if obstacle overlaps hole (obstacles must not overlap hole).
- [ ] Pressing `R` in win screen resets to `AIMING` at tee.

## Dependencies
- REQ-005 (stop detection), REQ-008 (obstacle reset), REQ-011 (state)

## Notes
- Edge: ball stopping exactly at `distance == radius` is a miss (use `< radius` for win).
- Consider adding subtle "sink" animation on win (ball scales down) before overlay, but keep <300ms to respect instant-reset spirit for loses.

## File Paths
- `src/levels.js:5` (hole data)
- `src/physics.js:70` (win check)
- `src/render.js:90` (drawHole, drawWinOverlay)
- `src/main.js:70` (win/lose branching)
