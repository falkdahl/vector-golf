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

3. Display - Next to Power Bar (REQ-012):
   - DOM elements SHALL be placed inline next to the power bar in `index.html`, e.g., inside `#force-bar-container` or adjacent flex row:
     ```html
     <div id="force-bar-container">
       <label>Power: <span id="force-label">0%</span></label><div id="force-bar">...</div>
       <div id="hole-counter">Hole: <span id="hole-value">1</span>/<span id="hole-total">3</span></div>
       <div id="attempts-counter">Attempts: <span id="attempts-value">0</span></div>
       <div id="total-attempts-counter">Total: <span id="total-attempts-value">0</span></div>
     </div>
     ```
   - `hole-counter` SHALL show `currentHoleIndex+1 / totalHoles`.
   - `attempts-counter` SHALL show `holeAttempts` (current hole attempts).
   - `total-attempts-counter` SHALL show `totalAttempts` (across all holes).
   - All three SHALL be visible during `AIMING`/`CHARGING`/`FLYING` without scrolling, adjacent to the power bar.
   - Win overlay SHALL show `You Win! Hole N/M - Attempts this hole: X, Total: Y` and on final hole `Game Complete! Total Attempts: Y`.

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

- [ ] On load, Hole shows `1/3` (or `1/1` if single hole), Attempts `0`, Total `0`, all visible inline next to power bar.
- [ ] After 1st launch, Hole still `1/3`, Attempts `1`, Total `1` even if ball is still flying/drifting.
- [ ] After ball hits obstacle and resets to tee, Hole `1/3`, Attempts `1`, Total `1` (not incremented again).
- [ ] After 2nd launch, Attempts `2`, Total `2`.
- [ ] After 3rd launch hits hole 1 and wins (non-final), game advances to Hole `2/3`, Attempts resets to `0` for new hole, Total remains `3`, ball at new tee, no win overlay yet (or "Hole Cleared!" briefly).
- [ ] After clearing final hole, overlay shows `Game Complete! Total Attempts: N` (or `You Win! Hole 3/3 - Attempts this hole: X, Total: Y`).
- [ ] Counters are inline next to power bar (flex row), visible without scrolling on 900px viewport, no layout shift when power bar charges, and update immediately on launch.
- [ ] Pressing `R` in win/game-complete overlay resets all counters to `0` and returns to Hole `1/3` with ball at tee.

## Dependencies
- REQ-011 (states, launch, reset)
- REQ-012 (UI)
- REQ-009 (win)

## Notes
- Implementation: increment in `handleLaunch()` before/after `launchBall()`, then call `updateAttemptsUI()`.
- Edge: rapid Space tap still counts as 1 attempt if it launches.

## File Paths
- `src/main.js:1` (currentHoleIndex, holeAttempts, totalAttempts, handleLaunch, resetBall, update UI)
- `src/levels.js:1` (LEVELS array length = totalHoles)
- `index.html:15` (hole-counter, attempts-counter, total-attempts-counter DOM next to power bar)
- `style.css:30` (counter styling inline next to power bar)
