# REQ-009: Hole & Win/Lose Conditions

- **ID:** REQ-009
- **Title:** Hole & Win/Lose Conditions
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Hole & Rules (Phase 4)

## Description
The map SHALL contain a hole. If the ball's center enters the hole radius, the level is immediately completed (win), regardless of speed. The ball SHALL NOT need to come to rest. The ball only dies/resets when it hits an obstacle or the screen edge; otherwise it continues to drift under wind influence until it hits the hole or dies.

## Rationale
User requirement: "If the ball does not land in the hole player restarts from the beginning, choosing an angle and force to launch the ball with." This defines the core fail-forward loop.

## Requirements

1. Hole definition in `src/levels.js`: `hole = {x, y, radius:14}` (radius tunable 12-16). Position e.g., `~820, 300` near right edge, not overlapping obstacles.
2. Win condition checked in `src/physics.js` or `src/main.js` every tick (continuous, not only at rest):
   - `distance = hypot(ball.pos.x - hole.x, ball.pos.y - hole.y)`
   - If `distance < hole.radius - 2` (ball mostly inside) => WIN, regardless of speed. Ball entering hole at high speed still counts.
   - Visual: ball must be mostly inside hole rim; allow 2px tolerance.
3. Lose/Reset condition:
   - Ball touching obstacle (REQ-008) or screen edge/OOB => instant death/reset (REQ-011). Ball drifting slowly into obstacle still dies.
   - Ball drifting indefinitely without hitting obstacle/edge/hole does NOT auto-reset; it continues until one of those events.
4. Rendering in `src/render.js`:
   - Hole as dark circle `radius` filled `#111` with inner shadow, outer rim `2px #333`, optionally small flag pole/marker offset.
   - When win, show overlay: "You Win! Attempts: N" + "Press R to Play Again" centered.
5. Win state SHALL be terminal until player presses `R` (or clicks) to reset; during win, physics/input paused. Attempts counter SHALL be displayed on win overlay and during play (REQ-014).
6. Attempts counter (REQ-014) SHALL increment on each launch and be shown in UI.

## Acceptance Criteria

- [ ] Hole is visible near opposite side from tee, radius 14px.
- [ ] Ball entering with center 5px from hole center => win overlay appears immediately, even at high speed.
- [ ] Ball drifting with center 20px from hole center does NOT trigger win and does NOT auto-reset; it continues drifting.
- [ ] Ball entering hole at high speed (>10px/s) DOES count as win (no need to settle).
- [ ] Ball drifting slowly into hole still counts as win.
- [ ] Ball destroyed by obstacle mid-flight never triggers win, even if obstacle overlaps hole (obstacles must not overlap hole).
- [ ] Hitting screen edge triggers instant reset, even when drifting slowly.
- [ ] Pressing `R` in win screen resets to `AIMING` at tee and resets or continues attempts counter per REQ-014.

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
