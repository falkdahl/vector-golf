# REQ-004: Wind Visualization (Arrows + Particles)

- **ID:** REQ-004
- **Title:** Wind Visualization - Arrow Grid & Particle Flow
- **Priority:** Must Have
- **Type:** UI / Functional
- **Status:** Draft
- **Related Plan Section:** Vector Field Visualization (user choice: Both)

## Description
The vector field wind SHALL be visualized both as a static arrow grid and as animated flowing particles, so the player can anticipate ball deflection. Both layers SHALL derive from the same `getWindAt` field.

## Rationale
User explicitly selected "Both" (arrows + particles) when asked how wind should be shown. Combined visualization gives precise direction (arrows) and intuitive flow (particles) without external assets.

## Requirements

1. **Arrow Grid** (in `src/render.js`):
   - Draw one arrow per field cell (or decimated every cell for 20x15 grid = 300 arrows) at cell center `cellX, cellY`.
   - Arrow direction = normalized field vector angle, length = `baseLength (12px) + magnitude * 10px`, opacity = `0.3 + magnitude*0.4`.
   - Style: 1px stroke `rgba(100,160,255,alpha)`, head triangle filled.
   - Arrows SHALL be drawn each frame (or cached to offscreen canvas for performance - decision left to implementation, but must reflect current field if field ever animates).

2. **Particle Flow**:
   - Spawn ~60-100 lightweight particles with `{x, y, life}` in `src/render.js` or `src/vectorField.js`.
   - Each frame: `pos += getWindAt(pos) * particleSpeed * dt` (particleSpeed ~40-60). Wrap around edges (if `x<0` => `x=canvasW`, etc.) or respawn randomly when lifetime expires (3-5s).
   - Render as 2px dots/ticks `rgba(180,220,255,0.6)` with short trail (optional 2px line indicating direction).
   - Particle count SHALL be capped to maintain 60fps; tunable constant `PARTICLE_COUNT`.

3. Both layers SHALL be drawn behind ball/obstacles but above background (z-order: background -> arrows -> particles -> obstacles -> hole -> ball -> aim line).
4. A toggle key `H` SHALL hide/show wind visualization for performance/clarity (optional but recommended).
5. Visualization SHALL be pure canvas drawing, no images.

## Acceptance Criteria

- [ ] At game start, canvas shows arrows covering the play area with varying angles/lengths (non-uniform).
- [ ] Particles visibly flow along arrows, curving where field curls.
- [ ] Particle wrapping works: no accumulation at edges, continuous flow over 10 seconds observation.
- [ ] Toggling `H` hides/shows both layers without affecting physics.
- [ ] FPS stays >=55 on Chrome with 80 particles + 300 arrows on 900x600 canvas (measured via DevTools).

## Dependencies
- REQ-003 (field must exist)
- REQ-002 (render loop)

## Notes
- Arrow culling: if performance issues, render every 2nd cell (10x8 = 80 arrows) and keep particles.
- Color choices must have sufficient contrast against green fairway background.

## File Paths
- `src/render.js:40` (drawArrows, drawParticles, updateParticles)
- `src/vectorField.js:50` (field data source)
