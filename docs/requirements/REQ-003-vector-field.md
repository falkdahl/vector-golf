# REQ-003: Vector Field Wind System

- **ID:** REQ-003
- **Title:** Vector Field Wind System
- **Priority:** Must Have
- **Type:** Functional
- **Status:** Draft
- **Related Plan Section:** Vector Field (core physics)

## Description
The map SHALL contain a 2D vector field that represents wind. The ball's velocity SHALL be continuously influenced by sampling the wind vector at the ball's current position each physics tick. The field must be more complex than a single direction (non-uniform, swirling/diverging).

## Rationale
User requirement: "wind should be more complex than just a single direction, the map should contain a vector field the ball has to navigate through". A grid-based field with bilinear interpolation satisfies complexity while remaining performant and pure-JS.

## Requirements

1. The field SHALL be defined as a regular grid over the canvas logical size (default `cols=20`, `rows=15` for 900x600 canvas, cell size ~45x40 px). Each cell stores `{x, y}` wind vector.
2. The field data structure SHALL be a 2D array `field[row][col] = {x, y}` in `src/vectorField.js`.
3. A function `getWindAt(worldX, worldY)` SHALL be exported from `src/vectorField.js` that:
   - Converts world coordinates to grid coordinates.
   - Performs bilinear interpolation of the 4 nearest cell vectors.
   - Clamps to field bounds.
   - Returns `{x, y}` in world units (pixels per second influence).
4. Generation: For MVP, `createField(cols, rows)` SHALL procedurally generate a non-uniform field using a combination of trigonometric swirl (e.g., `sin(x*0.02)`, `cos(y*0.02)`) plus pseudo-random offset to create curl/divergence. Values MUST NOT be uniform across the grid.
5. A constant `WIND_STRENGTH` (default 30-80, tunable) SHALL scale the sampled vector before applying to velocity: `vel += wind * WIND_STRENGTH * dt`.
6. **Minimum Force**: The effective wind force applied each tick SHALL never be less than 20% of max launch power. With `MAX_POWER=600`, the minimum effective force `|wind| * WIND_STRENGTH` SHALL be `>= 0.2 * MAX_POWER = 120` for every cell and every interpolated sample. Generation SHALL enforce this by scaling magnitudes so that `magnitude >= 0.2 * MAX_POWER / WIND_STRENGTH`. For `WIND_STRENGTH=30`, `magnitude >=4`; for `WIND_STRENGTH=60`, `magnitude >=2`. This ensures the ball never comes to rest and is continuously drifted by the field.
7. The field SHALL be deterministic per level load (seeded or fixed) so the challenge is consistent; random generation must be reproducible on refresh for the single-hole MVP.
8. No third-party noise libraries SHALL be used; implement inline math.

## Acceptance Criteria

- [ ] `src/vectorField.js:1` exports `createField`, `getWindAt`, and `WIND_STRENGTH`.
- [ ] `getWindAt(0,0)` and `getWindAt(890,590)` return distinct vectors (field is non-uniform).
- [ ] Bilinear interpolation verified: sampling at cell center equals cell value; sampling at midpoint between two cells equals average of neighbors within 0.01 tolerance.
- [ ] Ball launched with identical angle/power but at two different map regions experiences different lateral deflection (>10px difference after 1s flight) due to field variance.
- [ ] Performance: `getWindAt` completes <0.05ms avg (measured over 1000 calls).
- [ ] **Min Force**: For every grid cell and for 100 random interpolated samples, `hypot(wind.x, wind.y) * WIND_STRENGTH >= 0.2 * MAX_POWER` (120 when `MAX_POWER=600`). No zero or near-zero wind exists.
- [ ] Wind is strong enough that a ball with `vel=0` placed anywhere on the field begins moving within 1 tick and never remains stationary for >0.4s without drifting.

## Dependencies
- REQ-002 (game loop provides dt)
- REQ-005 (physics consumes wind)

## Notes
- Tunable: expose `cols`, `rows`, `WIND_STRENGTH` at top of `src/vectorField.js:5` for playtesting.
- Future multi-level support: `levels.js` may provide custom field arrays overriding procedural generation.

## File Paths
- `src/vectorField.js:1`
- `src/physics.js:30` (consumes wind)
