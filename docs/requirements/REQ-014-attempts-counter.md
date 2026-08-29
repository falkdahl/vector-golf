# REQ-014: Attempts Counter

- **ID:** REQ-014
- **Title:** Attempts Counter Until Level Cleared
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** UI, Game States (new user requirement)

## Description
The game SHALL track the number of attempts (shots) the player has taken until the level is cleared. An attempt is counted each time the ball is launched (Space release). The counter SHALL be visible during play and on the win overlay, and SHALL reset on `R` after win or on page reload.

## Rationale
User requirement: "Number of attempts until the level is cleared should also be tracked with a counter." This gives feedback on performance and persistence across deaths.

## Requirements

1. State in `src/main.js` (or `src/physics.js`) SHALL include `attempts: number`, initialized to `0` on level load.
2. Increment: `attempts++` SHALL be executed exactly once per successful `launchBall(angle, power)` (i.e., on Space release when `state` is `AIMING`/`CHARGING`). Pressing `R` to reset without launching SHALL NOT increment. Dying (obstacle/edge) SHALL NOT increment beyond the launch that caused it; only the launch counts.
3. Display:
   - DOM element `<div id="attempts-counter">Attempts: <span id="attempts-value">0</span></div>` in `index.html`, styled in `style.css`, visible above or near canvas during `AIMING`/`CHARGING`/`FLYING`.
   - Win overlay SHALL show `You Win! Attempts: N` where `N` is the current counter value at time of win.
4. Reset: When `resetBall()` is called via `R` in `WIN` state, the counter SHALL reset to `0` (new game) or optionally keep counting if the spec is "attempts until cleared" includes only the successful run; for MVP, reset to `0` on win+`R` is acceptable. Document choice. On death (obstacle/edge), counter SHALL persist (not reset) so player sees cumulative attempts until clear.
5. Persistence: Counter SHALL survive death resets; only win+`R` or page reload resets it.
6. No external storage required (no localStorage) for MVP.

## Acceptance Criteria

- [ ] On load, counter shows `0`.
- [ ] After 1st launch (Space hold + release), counter shows `1` even if ball is still flying/drifting.
- [ ] After ball hits obstacle and resets to tee, counter remains `1` (not incremented again).
- [ ] After 2nd launch, counter shows `2`.
- [ ] After 3rd launch hits hole and wins, overlay shows `You Win! Attempts: 3`.
- [ ] Pressing `R` in win overlay resets counter to `0` and hides overlay, returning to `AIMING` with ball at tee.
- [ ] Counter is visible without scrolling on 900px viewport and updates immediately on launch.

## Dependencies
- REQ-011 (states, launch, reset)
- REQ-012 (UI)
- REQ-009 (win)

## Notes
- Implementation: increment in `handleLaunch()` before/after `launchBall()`, then call `updateAttemptsUI()`.
- Edge: rapid Space tap still counts as 1 attempt if it launches.

## File Paths
- `src/main.js:1` (attempts variable, handleLaunch, resetBall, update UI)
- `index.html:15` (attempts-counter DOM)
- `style.css:30` (counter styling)
