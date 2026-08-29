# REQ-017: Nullify Modifier

- **ID:** REQ-017
- **Title:** Nullify Modifier - Zero Field in Circle
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** New Feature - Modifiers (2/3)

## Description
The Nullify modifier SHALL create a calm zone where the ball is **not braked**: the ball SHALL keep moving in the same direction and with the same speed as it had when it entered, unaffected by wind or friction while inside. It does not bring the ball to a stop.

## Rationale
User requested nullify to not brake the ball. Instead of zeroing wind and letting friction stop the ball, the nullify circle shall preserve momentum, allowing the ball to glide through the calm zone at entry speed, useful for crossing a strong headwind without losing speed.

## Requirements

1. **Effect Definition** in `src/physics.js` and `src/vectorField.js`:
   - Type identifier `type: 'nullify'`, `factor: 0`.
   - When `getWindAt(x,y)` finds point inside nullify circle, the wind vector SHALL still be `{x:0, y:0}` for visualization (arrows faint), but **physics SHALL NOT brake the ball**: while inside nullify, **both wind and friction SHALL be disabled**, so the ball keeps the exact velocity vector it had upon entry (same direction and speed) until it exits the circle.
   - Implementation in `src/physics.js:updateBall`: detect `isInsideNullify = modifiers.some(m=>type==='nullify' && dist<radius)`. If true, skip `vel += wind*...` and `vel *= frictionFactor` for that tick; just `pos += vel*dt` with preserved `vel`.
   - If nullify overlaps amplify/flip, nullify's "no brake" behavior dominates for physics, while `getWindAt` still returns zero for arrow visualization.
   - Minimum force per REQ-003 is intentionally violated inside nullify for physics (ball not wind-driven there), but arrow visualization still shows zero as calm.

2. **Area**: Circle radius `MODIFIER_RADIUS = 90` (same as others). Center at placement.

3. **Visuals** in `src/render.js`:
   - Circle fill `rgba(52,152,219,0.18)` blue, stroke `rgba(52,152,219,0.9)` 2px dashed (`[6,4]`), icon `∅` or `○` 14px white.
   - Arrow grid inside circle SHALL show no arrows or very faint dots (since magnitude zero, arrows length minimal 10px but opacity low 0.15), visually indicating calm.

4. **Placement** per REQ-015: hotbar slot 2 or key `2`.

## Acceptance Criteria

- [ ] Selecting slot 2 highlights blue and shows blue dashed preview circle.
- [ ] Placing nullify at (300,300) and sampling `getWindAt(300,300)` returns `{0,0}` (within 0.01) for visualization.
- [ ] Sampling just outside (400,300) returns non-zero base vector.
- [ ] Ball entering nullify circle at speed `V` (e.g., 80 px/s) keeps moving at ~`V` (±5%) in same direction while inside; it does NOT decelerate due to friction, verified by measuring speed 0.5s after entry vs entry speed (difference <5%).
- [ ] Ball inside nullify for >2s does NOT come to stop; it continues at entry speed until exiting circle.
- [ ] Placing amplify then nullify overlapping at same point still results in preserved velocity (nullify dominates physics).
- [ ] Circle drawn with blue dashed tint and `∅` icon.
- [ ] Arrows inside circle are faint/absent, reflecting zero wind for visualization.

## Dependencies
- REQ-015 (placement, circular area)
- REQ-003 (base field; nullify is exception to min force)
- REQ-004 (visualization)

## Notes
- Implementation: in `getWindAt`, if `type==='nullify'` and inside, `result = {x:0, y:0}` (or break stack).

## File Paths
- `src/vectorField.js:50` (apply nullify)
- `src/render.js:70` (draw nullify circle)
- `src/main.js:1` (hotbar slot 2)

