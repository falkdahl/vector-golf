# REQ-006: Aiming Controls - Orbit Around Ball

- **ID:** REQ-006
- **Title:** Aiming Controls - Arrow Keys Orbit
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Input (user decision)

## Description
While the ball is at rest at the tee (or after reset), the player SHALL aim by moving an aim indicator along a circle around the ball using arrow keys. This sets the launch angle.

## Rationale
User specified: "Use arrow keys to move along a circle around the ball". This replaces drag-to-aim and must be precise, responsive, and disabled during flight.

## Requirements

1. Input handling SHALL be in `src/input.js` exporting `initInput()`, `getAimAngle()`, `isCharging()`, etc., and tracking `keys` state via `keydown`/`keyup` listeners on `window`.
2. Left Arrow / Right Arrow SHALL rotate `aimAngle` around the ball:
   - Increment `ROTATION_SPEED = 2.5° per frame` (~150°/sec at 60fps) or `~90°/sec` time-based. Choose time-based: `angle += dir * 1.6 rad/s * dt`.
   - Wrap `angle` in `[0, 2π)` (or `0-360°`).
   - Continuous hold SHALL rotate smoothly (handle `e.repeat` correctly, use key state not single events).
   - Optional: Up/Down arrows unused (or adjust speed - document).
3. Visual feedback in `src/render.js`:
   - Draw orbit circle (radius ~28-32px, dashed, `rgba(0,0,0,0.2)`).
   - Draw aim line from `ball.pos` outward length `30px` (or `30 + charge*40` when charging) in direction `aimAngle`.
   - Draw small indicator dot at orbit circumference at `ball.pos + (cos angle, sin angle)*orbitRadius`.
4. Aiming SHALL only be active when `gameState === 'AIMING'` or `'CHARGING'`; ignored when `ball.isMoving`.
5. Initial `aimAngle` SHALL point toward hole (tee->hole vector) on reset for usability.
6. No mouse/touch aiming required for MVP.

## Acceptance Criteria

- [ ] With ball at rest, holding Right Arrow for 1 second rotates aim ~90-150° clockwise; Left Arrow opposite.
- [ ] Releasing keys stops rotation immediately; no drift.
- [ ] Holding both arrows cancels (or last pressed wins - documented).
- [ ] Orbit dot and aim line update in real-time at 60fps without jitter.
- [ ] Aiming input is ignored during `FLYING` state (ball in motion).
- [ ] After instant reset, aim angle resets to tee->hole direction.

## Dependencies
- REQ-002 (loop dt), REQ-005 (ball pos), REQ-011 (states)

## Notes
- Avoid default scroll on arrow keys: `e.preventDefault()` for ArrowLeft/Right/Space.
- Accessibility: also support `A`/`D` as alternatives optionally.

## File Paths
- `src/input.js:1`
- `src/render.js:100` (drawAim)
- `src/main.js:40` (state gating)
