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
   - Arrow direction = field vector angle. Arrows SHALL NOT be too long: use short uniform length or tightly capped length (e.g., `base 8-10px + normalized magnitude * 4-6px`, max ≤16px) so the grid remains readable and does not clutter the fairway. Do not scale length directly by raw magnitude (which can be ≥4).
   - Use normalized direction for length; encode strength via opacity (`0.35 + normalizedMag * 0.45`) and/or head size, not length.
   - Style: 1px stroke `rgba(100,160,255,alpha)`, head triangle filled.
   - Arrows SHALL be drawn each frame (or cached to offscreen canvas for performance - decision left to implementation, but must reflect current field if field ever animates).

2. **Particle Flow**:
   - Spawn ~60-100 lightweight particles with `{x, y, life, maxLife}` in `src/render.js` or `src/vectorField.js`.
   - **Spawn distribution**: Initial spawn SHALL be uniformly random across the whole map (`x in [0, canvasW]`, `y in [0, canvasH]`), not clustered in center or half-screen. Respawn after fade-death SHALL also be uniformly random across the whole map to maintain even coverage.
   - **Lifetime & Fade**: Each particle SHALL live for 2 seconds (`life = 2.0`, `maxLife = 2.0`) then fade-die. Opacity SHALL be `1.0` at birth and linearly fade to `0` over the 2s (`alpha = life / maxLife`). On `life <= 0`, particle SHALL die and respawn uniformly random across the whole map with fresh `life = 2.0`. No particle SHALL persist longer than 2 seconds without respawning.
   - Each frame: `pos += getWindAt(pos) * particleSpeed * dt` (particleSpeed ~40-60); `life -= dt`; alpha derived from remaining life. Wrap around edges (if `x<0` => `x=canvasW`, etc.) may still apply, but primary respawn is fade-death after 2s uniformly across map.
   - Render as 2px dots/ticks `rgba(180,220,255, alpha*0.65)` with alpha from fade, optionally with short trail whose opacity also fades.
   - Particle count SHALL be capped to maintain 60fps; tunable constant `PARTICLE_COUNT`.

3. Both layers SHALL be drawn behind ball/obstacles but above background (z-order: background -> arrows -> particles -> obstacles -> hole -> ball -> aim line).
4. A toggle key `H` SHALL hide/show wind visualization for performance/clarity (optional but recommended).
5. Visualization SHALL be pure canvas drawing, no images.

## Acceptance Criteria

- [ ] At game start, canvas shows arrows covering the whole play area with varying angles (non-uniform) but short consistent length (all arrows ≤16px, no overly long arrows cluttering).
- [ ] Arrow length does NOT scale linearly with raw magnitude (max-min length difference ≤6px); strength is shown via opacity/head, not length.
- [ ] Particles at start are distributed across the whole map (visible in all quadrants top-left, top-right, bottom-left, bottom-right), not clustered.
- [ ] Particles visibly flow along arrows, curving where field curls, and visibly fade out over 2 seconds.
- [ ] Each particle fades from opaque to transparent over 2s (`alpha = life/2.0`) and dies exactly at 2s, then respawns uniformly random across the whole map (not at edge cluster). No particle is visible longer than 2s without fading.
- [ ] Particle wrapping/respawn maintains even whole-map coverage: no accumulation at edges, continuous flow over 10 seconds observation with particles always visible across entire screen, with constant fading cycle.
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
