# REQ-016: Amplify Modifier (x5)

- **ID:** REQ-016
- **Title:** Amplify Modifier - x5 Field Strength in Circle
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** New Feature - Modifiers (1/3)

## Description
The Amplify modifier SHALL increase the wind vector strength by a factor of 5 (`×5`) within a circular area around its placement. It allows the player to create a strong wind corridor to accelerate the ball through difficult sections.

## Rationale
User requested three modifiers, first being amplification. A 5× multiplier creates a clearly noticeable effect (strong enough to overcome friction and redirect ball quickly) while keeping arrow visualization short per REQ-004 (arrows scaled via normalized opacity/size, not raw length, so amplified vectors still display as ≤16px).

## Requirements

1. **Effect Definition** in `src/vectorField.js`:
   - Type identifier `type: 'amplify'`, `factor: 5`.
   - When `getWindAt(x,y)` finds the point inside an amplify circle (`dist < radius`), the sampled base wind vector SHALL be multiplied: `wind.x *= 5; wind.y *= 5`.
   - If multiple amplifies overlap, factors SHALL stack multiplicatively (e.g., two amplifies = 25×). For MVP, stacking of same type is allowed but capped to prevent infinity (cap at `25×`).
   - Minimum force per REQ-003 still applies after amplification (amplified force will always be ≥5×60=300, well above 60, so guaranteed).
   - Nullify inside amplify or flip stacking order SHALL be applied in placement order (REQ-015).

2. **Area**: Circle radius `MODIFIER_RADIUS = 90` (tunable `AMPLIFY_RADIUS` same as others, 80-100). Center at placement `x,y`.

3. **Visuals** in `src/render.js`:
   - Circle fill `rgba(230,126,34,0.20)` orange, stroke `rgba(230,126,34,0.9)` 2px solid (or dashed for preview).
   - Icon centered `>>` or `↑↑` 14px white with shadow.
   - Arrow grid inside circle SHALL appear more opaque/brighter and slightly longer (still ≤16px) due to higher normalized magnitude, reflecting stronger wind.

4. **Placement** per REQ-015: selectable via hotbar slot 1 or key `1`, preview orange circle follows mouse, left-click places.

## Acceptance Criteria

- [ ] Selecting hotbar slot 1 highlights it orange and shows orange preview circle.
- [ ] Placing amplify at (300,300) and sampling `getWindAt(300,300)` returns vector ~5× the value at same point without modifier (within 10% tolerance, accounting for bilinear interpolation).
- [ ] Sampling just outside circle (e.g., 400,300 with radius 90) returns unmodified vector (1×).
- [ ] Ball drifting through amplify circle visibly accelerates (speed increase >30% within 0.5s) compared to outside.
- [ ] Two overlapping amplifies at same point give ~25× (5×5) vector.
- [ ] Circle drawn with orange tint and `>>` icon, not covering ball/hole.
- [ ] Arrows inside circle appear more opaque (higher alpha) than outside, but still ≤16px and not touching.

## Dependencies
- REQ-015 (placement system, hotbar, circular area)
- REQ-003 (base field, WIND_STRENGTH)
- REQ-004 (visualization capped length)

## Notes
- Implementation: in `getWindAt`, after base sampling, iterate `modifiers` and if `type==='amplify'` and `dist < radius`, `result.x *=5; result.y *=5`.

## File Paths
- `src/vectorField.js:50` (apply amplify)
- `src/render.js:70` (draw amplify circle)
- `src/main.js:1` (hotbar slot 1, placement)

