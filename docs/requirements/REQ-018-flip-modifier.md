# REQ-018: Flip Modifier

- **ID:** REQ-018
- **Title:** Flip Modifier - Reverse Field Direction in Circle
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** New Feature - Modifiers (3/3)

## Description
The Flip modifier SHALL reverse the wind vector direction (multiply by -1) within a circular area. It allows the player to invert a problematic headwind into a tailwind or create a divergent zone to steer the ball.

## Rationale
User requested flip as third modifier. Reversing direction is distinct from amplifying or nullifying magnitude; combined with the other two, it gives full control over vector manipulation (scale, zero, invert).

## Requirements

1. **Effect Definition** in `src/vectorField.js`:
   - Type identifier `type: 'flip'`, `factor: -1`.
   - When `getWindAt(x,y)` finds point inside flip circle, the sampled wind vector SHALL be inverted: `wind.x *= -1; wind.y *= -1`.
   - Stacking: flip after amplify = amplified then flipped (`5 * -1 = -5×`), flip after nullify = stays zero (since zero flipped is zero), two flips = double inversion back to original (`-1 * -1 = 1×`).
   - Minimum force magnitude after flip is still `|wind|*WIND_STRENGTH >=60` (since magnitude absolute value unchanged, only direction flips), so min force still satisfied (unlike nullify).
   - Direction change is immediate at circle boundary; bilinear interpolation at edge will blend but flip is applied after interpolation.

2. **Area**: Circle radius `MODIFIER_RADIUS = 90` (same as others).

3. **Visuals** in `src/render.js`:
   - Circle fill `rgba(155,89,182,0.20)` purple, stroke `rgba(155,89,182,0.9)` 2px double-line or `↻` pattern, icon `↻` or `⇄` 14px white.
   - Arrow grid inside circle SHALL show reversed direction (arrows point opposite to base field), with same short length (10-14px) and opacity encoding magnitude (unchanged magnitude, so opacity same as outside but direction flipped), clearly visible.

4. **Placement** per REQ-015: hotbar slot 3 or key `3`.

## Acceptance Criteria

- [ ] Selecting slot 3 highlights purple and shows purple preview circle with `↻`.
- [ ] Placing flip at (300,300) and sampling `getWindAt(300,300)` returns vector approximately `-1 * baseVector` (x and y negated within 0.01, magnitude preserved).
- [ ] Sampling just outside circle returns base vector (not flipped).
- [ ] Ball drifting through flip circle visibly reverses lateral drift direction compared to same point without modifier (e.g., if base wind pushes right, inside flip pushes left).
- [ ] Amplify (5×) at same spot as flip results in -5× vector.
- [ ] Two overlapping flips at same point cancel to 1× (original direction).
- [ ] Circle drawn with purple tint and `↻` icon, arrows inside point opposite to outside.

## Dependencies
- REQ-015 (placement, circular area)
- REQ-003 (base field)
- REQ-004 (visualization, capped length)

## Notes
- Implementation: in `getWindAt`, if `type==='flip'` and inside, `result.x *= -1; result.y *= -1`.

## File Paths
- `src/vectorField.js:50` (apply flip)
- `src/render.js:70` (draw flip circle)
- `src/main.js:1` (hotbar slot 3)

