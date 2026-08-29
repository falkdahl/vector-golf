# REQ-014: Attempts Counter

- **ID:** REQ-014
- **Title:** Attempts Counter Until Level Cleared
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** UI, Game States (new user requirement)

## Description
The game SHALL track the number of attempts (shots) per hole and across all holes. An attempt is counted each time the ball is launched (Space release). The counters SHALL be visible during play next to the power bar and on the win overlay, and SHALL include both the current hole number and total attempts across all holes. The game SHALL support multiple holes (sequential levels) and advance to the next hole upon clearing the current one.

## Rationale
User requirement: "Number of attempts until the level is cleared should also be tracked with a counter." This gives feedback on performance and persistence across deaths.

## Requirements

1. State in `src/main.js` SHALL include:
   - `currentHoleIndex: number` (0-based, displayed as 1-based)
   - `holeAttempts: number` (attempts on current hole)
   - `totalAttempts: number` (sum across all holes in the run)
   - `totalHoles: number` derived from `LEVELS.length`
   Initialized to `currentHoleIndex=0, holeAttempts=0, totalAttempts=0` on game start.

2. Increment: On each successful `launchBall(angle, power)` (Space release when `state` is `AIMING`/`CHARGING`), both `holeAttempts++` and `totalAttempts++` SHALL be executed exactly once. Pressing `R` to reset without launching SHALL NOT increment. Dying (obstacle/edge) SHALL NOT increment beyond the launch that caused it; only the launch counts.

3. Display - **Inside Canvas on Top** (REQ-012):
   - HUD SHALL be drawn **inside the canvas on top** in `src/render.js` (e.g., `drawHUD(ctx, currentHoleIndex, totalHoles, holeAttempts, totalAttempts)`) during every `render()` call, not as DOM next to power bar.
   - `drawHUD` SHALL render:
     - `Hole: N/M` at top-left (`x=12, y=22`)
     - `Attempts: X` (per-hole) at top-center (`x=canvasW/2, y=22`)
     - `Total: Y` (across all holes) at top-right (`x=canvasW-12, y=22`, right-aligned)
   - Font: 14px `system-ui` sans, fill `white`, stroke `rgba(0,0,0,0.7)` 3px lineWidth or shadow for contrast on `#3a9d23` fairway.
   - All three SHALL be visible during `AIMING`/`CHARGING`/`FLYING` without scrolling, inside the canvas top bar (e.g., semi-transparent dark strip `rgba(0,0,0,0.25)` full width 28px tall behind text).
   - Win overlay (DOM) SHALL still show `You Win! Hole N/M - Attempts this hole: X, Total: Y` and on final hole `Game Complete! Total Attempts: Y`.

4. Hole Progression:
   - Upon entering hole (REQ-009), if `currentHoleIndex < totalHoles-1`, the game SHALL advance to next hole: `currentHoleIndex++`, `holeAttempts=0` (reset per-hole), ball reset to next hole tee, state `AIMING`, field regenerated for next level. `totalAttempts` persists.
   - Upon clearing final hole, `WIN` / `GAME_COMPLETE` overlay SHALL be shown.
   - No external level selector required; sequential progression.

5. Reset:
   - Death (obstacle/edge) SHALL NOT reset any counter; all counters persist.
   - Pressing `R` during `FLYING`/`AIMING` SHALL reset ball to current hole tee but SHALL NOT reset `holeAttempts` or `totalAttempts` (optional: may reset holeAttempts if design decides; document choice; for this spec, `R` during play does NOT reset counters).
   - Pressing `R` in `WIN`/`GAME_COMPLETE` overlay SHALL reset entire run: `currentHoleIndex=0, holeAttempts=0, totalAttempts=0`, reload first hole.
   - Page reload resets all.

6. Persistence: Counters SHALL survive death resets; only win+`R` (game complete) or page reload resets total. `holeAttempts` resets on hole advance.

7. No external storage required (no localStorage) for MVP.

## Acceptance Criteria

- [ ] On load, canvas top shows `Hole: 1/3` left, `Attempts: 0` center, `Total: 0` right inside the canvas (not DOM next to power bar).
- [ ] Power bar is **not** visible as DOM below canvas; instead a 60×8px canvas bar appears **under the ball inside the canvas** only while `CHARGING` (Space held), at `ball.x -30, ball.y+28`, fill `charge*100%` green→yellow→red.
- [ ] After 1st launch, canvas top still `Hole 1/3`, `Attempts 1`, `Total 1` even if ball is still flying/drifting; power bar hidden.
- [ ] After ball hits obstacle and resets to tee, canvas top `Hole 1/3`, `Attempts 1`, `Total 1` (not incremented again).
- [ ] After 2nd launch, `Attempts 2`, `Total 2` inside canvas top.
- [ ] After 3rd launch hits hole 1 and wins (non-final), game advances to Hole `2/3`, `Attempts` resets to `0` for new hole, `Total` remains `3`, ball at new tee, canvas top updates immediately.
- [ ] After clearing final hole, overlay shows `Game Complete! Total Attempts: N` (or `You Win! Hole 3/3 - Attempts this hole: X, Total: Y`).
- [ ] No DOM `#force-bar-container` / `#hole-counter` counters remain; HUD is purely canvas-drawn. Counters visible without scrolling on 900px viewport and update immediately on launch.
- [ ] Pressing `R` in win/game-complete overlay resets all counters to `0` and returns to Hole `1/3` with ball at tee.

## Dependencies
- REQ-011 (states, launch, reset)
- REQ-012 (UI)
- REQ-009 (win)

## Notes
- Implementation: increment in `handleLaunch()` before/after `launchBall()`, then call `updateAttemptsUI()`.
- Edge: rapid Space tap still counts as 1 attempt if it launches.

## File Paths
- `src/main.js:1` (currentHoleIndex, holeAttempts, totalAttempts, handleLaunch, resetBall)
- `src/render.js:1` (drawHUD inside canvas top, drawForceBar under ball)
- `src/levels.js:1` (LEVELS array length = totalHoles)
