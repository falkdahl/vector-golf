# REQ-007: Power Charging & Force Bar

- **ID:** REQ-007
- **Title:** Power Charging & Force Bar
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** Input - hold space

## Description
The player SHALL set launch force by holding Space. The longer Space is held (up to a max), the harder the ball is hit. A visible force bar SHALL provide real-time feedback of charge level. Release of Space SHALL launch the ball.

## Rationale
User specified: "hold space, the longer it is hold the harder it is hit. Include a force bar to feedback to player how hard they hit." This gives charge control without mouse.

## Requirements

1. Charging logic in `src/input.js` / `src/main.js`:
   - On `Space` `keydown` (when `state==='AIMING'` and `!e.repeat` and first press), set `charging=true`, `charge=0`, `holdTime=0`.
   - While `charging`, each `update(dt)` increments `holdTime += dt`, `charge = min(holdTime / MAX_CHARGE_TIME, 1.0)` where `MAX_CHARGE_TIME = 1.5s`.
   - Charging curve SHALL be linear (or ease-out `charge = 1 - pow(1 - t, 1.5)` - document choice) but monotonic.
   - On `Space` `keyup` while `charging`, compute `power = MIN_POWER + charge * (MAX_POWER - MIN_POWER)` or `charge * MAX_POWER` and call `launchBall(angle, power)`. Reset `charging=false`.
   - If `holdTime` reaches `MAX_CHARGE_TIME`, clamp at 100% (optionally pulsate bar).
   - Minimum charge: releasing within <0.1s still launches with small power (5-10% of max) to allow tap shots; alternatively ignore if <50ms (document).
2. Constants in `src/physics.js` or `src/input.js:5`: `MAX_CHARGE_TIME=1.5`, `MAX_POWER=600` (px/s), `MIN_POWER=50`.
3. Force Bar UI - **Inside Canvas Under Ball** (updated):
   - Canvas-drawn bar rendered in `src/render.js` (e.g., `drawForceBar(ctx, ball, charge)`) positioned **under the player ball inside the canvas** (e.g., centered at `ball.pos.x`, `ball.pos.y + 28px`) and visible **only while Space is held (`CHARGING`)**. No DOM `#force-bar` below canvas shall be used; the bar lives inside the canvas.
   - Dimensions: width ~60px, height 8-10px, border `1px #222`, background `rgba(0,0,0,0.35)`, fill width `charge*100%`, background color lerps green (`#2ecc71` at 0%) -> yellow -> red (`#e74c3c` at 100%).
   - Show percentage text just below bar as **only the percentage** (e.g., `78%`), **without the word "Power"**, with a **slightly larger font** (e.g., `13-14px` instead of `10px`, `600` weight) for readability, white with shadow/stroke.
   - Bar SHALL be hidden during `AIMING` (not charging), `FLYING`, and `WIN` (or reset to 0 and not drawn).
4. Aim line length SHALL scale with `charge` during charging (`base 30px + charge*50px`) as preview.
5. Launch SHALL be ignored if ball is moving.

## Acceptance Criteria

- [ ] Holding Space for 0s/0.75s/1.5s shows bar at 0%/50%/100% (±5%).
- [ ] Fill color transitions visibly from green to red as charge increases.
- [ ] Releasing Space launches ball; distance correlates with hold time (tap ~80px, half ~300px, full ~600px).
- [ ] Holding beyond 1.5s stays at 100% without overflow.
- [ ] `e.preventDefault()` on Space prevents page scroll.
- [ ] Force bar resets to 0% after launch and after instant reset.

## Dependencies
- REQ-002 (dt), REQ-005 (launch), REQ-006 (angle)

## Notes
- Handle key repeat: ignore `keydown` when `e.repeat && charging`.
- Consider adding subtle tick marks at 25/50/75% on bar.

## File Paths
- `src/input.js:30` (charge state)
- `src/main.js:50` (launch trigger, charge)
- `src/render.js:30` (drawForceBar inside canvas under ball)
- `src/physics.js:5` (MAX_POWER, MAX_CHARGE_TIME)
