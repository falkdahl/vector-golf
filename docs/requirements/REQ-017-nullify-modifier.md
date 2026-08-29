# REQ-017: Nullify Modifier

- **ID:** REQ-017
- **Title:** Nullify Modifier - Zero Field in Circle
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** New Feature - Modifiers (2/3)

## Description
The Nullify modifier SHALL cancel the wind vector to zero within a circular area. It creates a calm zone where the ball drifts only by its existing momentum and friction, allowing the player to create a safe path or stop wind-induced drift.

## Rationale
User requested nullify as second modifier. A zero-wind circle provides strategic counterplay to the always-present minimum wind (10% of max power) and amplified zones, letting the player neutralize a dangerous vortex or create a parking spot before the hole.

## Requirements

1. **Effect Definition** in `src/vectorField.js`:
   - Type identifier `type: 'nullify'`, `factor: 0`.
   - When `getWindAt(x,y)` finds point inside nullify circle, the wind vector SHALL be set to `{x:0, y:0}`, regardless of base field or other modifiers before it in stack. If nullify is placed after an amplify in stack order, nullify overrides (result zero).
   - If flip is inside nullify, result remains zero (nullify dominates if later in stack).
   - Minimum force per REQ-003 is intentionally violated inside nullify (0 < 60) – nullify is the exception that creates a calm zone. Acceptance for min force SHALL exclude nullify circles (they are intentional zero zones).
   - No wind means ball will eventually stop due to friction if it stays inside long enough (friction will bring speed <5 and ball would normally drift, but with zero wind it will truly stop; per updated REQ-005, ball should then remain stationary until friction is overcome – but since nullify is zero, ball will stop; this is intended).

2. **Area**: Circle radius `MODIFIER_RADIUS = 90` (same as others). Center at placement.

3. **Visuals** in `src/render.js`:
   - Circle fill `rgba(52,152,219,0.18)` blue, stroke `rgba(52,152,219,0.9)` 2px dashed (`[6,4]`), icon `∅` or `○` 14px white.
   - Arrow grid inside circle SHALL show no arrows or very faint dots (since magnitude zero, arrows length minimal 10px but opacity low 0.15), visually indicating calm.

4. **Placement** per REQ-015: hotbar slot 2 or key `2`.

## Acceptance Criteria

- [ ] Selecting slot 2 highlights blue and shows blue dashed preview circle.
- [ ] Placing nullify at (300,300) and sampling `getWindAt(300,300)` returns `{0,0}` (within 0.01).
- [ ] Sampling just outside (400,300) returns non-zero base vector.
- [ ] Ball entering nullify circle with wind-driven speed visibly decelerates due to friction and no wind push; if ball stays inside >2s without momentum, it comes to near-stop (speed <5).
- [ ] Placing amplify then nullify overlapping at same point results in zero vector (nullify overrides).
- [ ] Circle drawn with blue dashed tint and `∅` icon.
- [ ] Arrows inside circle are faint/absent, clearly distinguishable from normal/amplified arrows.

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

