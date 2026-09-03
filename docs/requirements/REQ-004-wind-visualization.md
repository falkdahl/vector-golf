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
   - Arrow direction = field vector angle; arrow **SHALL reflect strength at each point, not only direction**: stronger wind = longer/brighter arrow, weaker = shorter/fainter. Field SHALL have varying strength across points (per REQ-003 min 10% but varying above that).
   - Arrows SHALL NOT be too large and SHALL NOT touch each other: use tightly capped length (e.g., `base 8-10px + normalized magnitude * 4-6px`, **max ≤16px**, max-min length difference ≤6px) so with cell size 45x40 there remains ≥25px gap between neighboring arrow tips and grid stays readable. Do not scale length directly by raw magnitude (which can be ≥2).
   - Encode strength via **both** capped length **and** opacity (`0.35 + normalizedMag * 0.45`) and/or head size; normalized magnitude `normalizedMag = (mag - MIN_MAG)/range` (0-1).
   - Style: 1px stroke `rgba(100,160,255,alpha)`, head triangle filled.
   - Arrows SHALL be drawn each frame (or cached to offscreen canvas for performance - decision left to implementation, but must reflect current field if field ever animates).
   - **Modifier-Aware Arrows**: Arrows **inside each modifier circle SHALL be updated to reflect the resulting effect on the ball**: use the **modified** `getWindAt(cellCenter)` that includes active modifiers (amplify/nullify/flip) for arrow direction/magnitude, not the base field. Thus inside amplify arrows appear stronger, inside nullify faint/zero, inside flip reversed. This ensures visualization matches the actual physics the ball will experience.

2. **Particle Flow**:
   - Spawn ~60-100 lightweight particles with `{x, y, life, maxLife}` in `src/render.js` or `src/vectorField.js`.
   - **Spawn distribution**: Initial spawn SHALL be uniformly random across the whole map (`x in [0, canvasW]`, `y in [0, canvasH]`), not clustered in center or half-screen. Respawn after fade-death SHALL also be uniformly random across the whole map to maintain even coverage.
   - **Lifetime & Fade**: Each particle SHALL live for 2 seconds (`life = 2.0`, `maxLife = 2.0`) then fade-die. Opacity SHALL be `1.0` at birth and linearly fade to `0` over the 2s (`alpha = life / maxLife`). On `life <= 0`, particle SHALL die and respawn uniformly random across the whole map with fresh `life = 2.0`. No particle SHALL persist longer than 2 seconds without respawning.
   - Each frame: `pos += getWindAt(pos) * particleSpeed * dt` (particleSpeed ~40-60); `life -= dt`; alpha derived from remaining life. Wrap around edges (if `x<0` => `x=canvasW`, etc.) may still apply, but primary respawn is fade-death after 2s uniformly across map.
   - Render as 2px dots/ticks `rgba(180,220,255, alpha*0.65)` with alpha from fade, optionally with short trail whose opacity also fades.
   - Particle count SHALL be capped to maintain 60fps; tunable constant `PARTICLE_COUNT`.

3. Both layers SHALL be drawn **on the top transparent canvas** (`#game`) behind ball/obstacles but above the bottom background (z-order: bottom background image (grass/splash) -> [top canvas] arrows -> particles -> obstacles -> hole -> ball -> aim line). They SHALL be visible through the transparent top canvas over the bottom tiled grass (REQ-030).
4. A toggle key `H` SHALL hide/show wind visualization for performance/clarity (optional but recommended).
5. Visualization SHALL be pure canvas drawing, no images (background images per REQ-030 are excluded from this rule; they are rendered only on the bottom canvas).

## Acceptance Criteria

- [ ] At game start, canvas shows arrows covering the whole play area with varying angles (non-uniform) **and varying length/opacity reflecting strength** at each point (stronger points visibly longer/brighter, weaker shorter/fainter), but all arrows still short (≤16px) and **no arrows touch each other** (visibly separated by cell gap).
- [ ] Arrow length **does reflect strength** within capped range (max-min length difference 2-6px, stronger = longer), and opacity/head size also vary with strength; length is not raw `mag*10` but capped normalized `base + normalizedMag*4-6`.
- [ ] **Modifier-Aware**: Placing an amplify at center, arrows inside its 90px circle immediately become more opaque/longer reflecting 5× effect; inside nullify arrows become faint/zero; inside flip arrows reverse direction. Verified by placing each modifier and observing arrow change in real-time.
- [ ] Particles at start are distributed across the whole map (visible in all quadrants top-left, top-right, bottom-left, bottom-right), not clustered.
- [ ] Particles visibly flow along arrows, curving where field curls, and visibly fade out over 2 seconds.
- [ ] Each particle fades from opaque to transparent over 2s (`alpha = life/2.0`) and dies exactly at 2s, then respawns uniformly random across the whole map (not at edge cluster). No particle is visible longer than 2s without fading.
- [ ] Particle wrapping/respawn maintains even whole-map coverage: no accumulation at edges, continuous flow over 10 seconds observation with particles always visible across entire screen, with constant fading cycle.
- [ ] Toggling `H` hides/shows both layers without affecting physics.
- [ ] FPS stays >=55 on Chrome with 80 particles + 300 arrows on `1280×720` 16:9 canvas (or `32×18` grid) with stacked canvases (measured via DevTools). Legacy `900×600` reference is deprecated per REQ-002/REQ-030.

## Dependencies
- REQ-003 (field must exist)
- REQ-002 (render loop)

## Notes
- Arrow culling: if performance issues, render every 2nd cell (10x8 = 80 arrows) and keep particles.
- Color choices must have sufficient contrast against green fairway background.

## File Paths
- `src/render.js:40` (drawArrows, drawParticles, updateParticles)
- `src/vectorField.js:50` (field data source)
