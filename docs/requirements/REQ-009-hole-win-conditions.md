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

1. Hole definition in `src/levels.js`: `hole = {x, y, radius:14}` (radius tunable 12-16, black circle). Position e.g., `~820, 300` near right edge, not overlapping obstacles.
2. Win condition checked in `src/physics.js` or `src/main.js` every tick (continuous, not only at rest):
   - `distance = hypot(ball.pos.x - hole.x, ball.pos.y - hole.y)`
   - If `distance < hole.radius + BALL_RADIUS` (ball touches **any part** of black circle, even edge grazing) => WIN, regardless of speed. Ball entering hole at high speed still counts. Touching any part triggers win.
   - Upon win, **ball SHALL stop in place** (`vel=0`, `isMoving=false`, position frozen at touch point) and remain visible over hole.
   - Visual: any overlap between ball circle and hole circle counts; no need for ball to be mostly inside.
3. Lose/Reset condition:
   - Ball touching obstacle (REQ-008) or screen edge/OOB => instant death/reset (REQ-011). Ball drifting slowly into obstacle still dies.
   - Ball drifting indefinitely without hitting obstacle/edge/hole does NOT auto-reset; it continues until one of those events.
4. Rendering in `src/render.js`:
   - Hole as dark circle `radius` filled `#111` with inner shadow, outer rim `2px #333`, optionally small flag pole/marker offset.
   - When win, show **Victory menu** centered in middle of canvas: overlay with title `Victory`, attempts used (`Attempts this hole: X, Total: Y`), and if more holes remain, a button `Next` to load next hole. On final hole, overlay shows `Game Complete!` with total and a button `Continue`/`Main Menu` (label `Continue` or `Back to Menu` acceptable) that returns to main menu.
5. Win state SHALL be terminal until player presses `Next` button (or `R` as fallback) to load next hole; on final hole, pressing `Continue`/`Main Menu` (or `R`/`Next` fallback) SHALL take the player back to the **main menu** (`mainMenuVisible=true`, active run cleared via `clearProgress()` but per-course `bestTotal` already saved per REQ-031, bottom canvas shows splash). During win, physics/input paused, ball frozen. Attempts counter SHALL be displayed on win overlay and during play (REQ-014).
6. Attempts counter (REQ-014) SHALL increment on each launch and be shown in UI. **Hole info SHALL be updated accordingly** when next hole is loaded (hole counter `N/M`, per-hole attempts reset to 0, total kept).
7. **Hole Progression via Next Button (with Supply Consumption per REQ-035)**: When `Next` is pressed and more holes remain, **any modifiers currently placed on the field SHALL first be consumed from supply** (`supply[type] = max(0, supply[type]-1)` per placed modifier, see REQ-035), `updateHotbarUI()` and `saveProgress()` called, then `modifiers` cleared via `syncModifiersToField()`, and next hole SHALL be loaded via `loadLevel(currentHoleIndex+1)`, `holeAttempts` reset to `0` but `totalAttempts` kept, hole counter updated (`2/3`, etc.), ball at new tee, and `gameState` set to `AIMING`. Victory menu hidden. **If no more holes (final hole), pressing `Continue`/`Main Menu` (or `Next`/`R` fallback) SHALL first consume placed modifiers from supply as above (then moot, as `clearProgress()` will reset supply to `{1,1,1}` for the next new game), and SHALL NOT reset to hole 1 via `resetGameAfterWin`; instead it SHALL `clearProgress()` and set `mainMenuVisible=true` (return to main menu per new requirement), keeping `COURSES_KEY` and per-course `bestTotal` intact. `handleNextHole()` / `resetGameAfterWin()` on final hole SHALL route to main menu.** Consumption SHALL occur exactly once per hole win, before clearing, clamped at `0`, and SHALL NOT occur on death resets.

## Acceptance Criteria

- [ ] Hole is visible near opposite side from tee, black circle radius 14px.
- [ ] Ball touching any part of black circle (even edge grazing, `dist < hole.radius + BALL_RADIUS` ~20) => ball **stops in place** (vel 0, frozen) and **Victory menu** pops up in middle of canvas saying `Victory` and showing `Attempts this hole: N, Total: M`.
- [ ] Ball with center 20px from hole center (outside hole+ball) does NOT trigger win and does NOT auto-reset; it continues drifting.
- [ ] Ball entering hole at high speed (>10px/s) DOES count as win and stops in place.
- [ ] Ball drifting slowly into hole still counts as win and stops.
- [ ] Ball destroyed by obstacle mid-flight never triggers win, even if obstacle overlaps hole (obstacles must not overlap hole).
- [ ] Hitting screen edge triggers instant reset, even when drifting slowly.
- [ ] Victory menu shows `Victory`, attempts used, and if more holes remain, a `Next` button. Pressing `Next` loads next hole, resets `Attempts this hole` to `0` but keeps `Total`, updates hole counter `N/M`, and hides menu. On final hole, overlay shows `Game Complete!` and a `Continue`/`Main Menu` button; pressing it (or `R`/`Next` fallback) takes you back to the **main menu** (`mainMenuVisible=true`, `STORAGE_KEY` cleared, `COURSES_KEY`/`bestTotal` kept, splash shown), not a reset to hole 1 via `resetGameAfterWin`.
- [ ] Hole info inside canvas top (REQ-012/014) updates correctly after `Next` (e.g., from `1/3` to `2/3`).

## Dependencies
- REQ-005 (stop detection), REQ-008 (obstacle reset), REQ-011 (state)
- REQ-020 (supply), REQ-035 (supply consumption on win)

## Notes
- Edge: ball stopping exactly at `distance == radius` is a miss (use `< radius` for win).
- Consider adding subtle "sink" animation on win (ball scales down) before overlay, but keep <300ms to respect instant-reset spirit for loses.

## File Paths
- `src/levels.js:5` (hole data)
- `src/physics.js:70` (win check)
- `src/render.js:90` (drawHole, drawWinOverlay)
- `src/main.js:70` (win/lose branching)
