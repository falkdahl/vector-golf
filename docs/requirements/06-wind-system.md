# 06 — Wind System (Field Generation & Visualization)

- **ID:** 06-wind-system
- **Supersedes:** REQ-003, REQ-004
- **Type:** Functional / UI
- **References:** `02-canvas-system.md` (logical size, loop), `05-input-and-states.md` (dt), `07-modifiers.md` (modifiers affect `getWindAt`), `03-rendering.md` (layer order), `08-level-generation.md` (field placement per difficulty)

## 1. Field Model `src/vectorField.js`

### 1.1 Grid & Sampling

- Regular grid over `LOGICAL_W×H` (default `cols=32, rows=18` for `1280×720`, cell ~40×40; alternatively `20×15` scaled to new logical, keep `cols/rows≈16/9`). Each cell `{x,y}`.
- Data structure `field[row][col]={x,y}`.
- `getWindAt(worldX,worldY)` exports bilinear interpolation of 4 nearest cells (clamped to bounds) in world units (pixels/sec influence). Also exports `WIND_STRENGTH` (normative `180`), plus debug `getSourcePositions()` etc.

### 1.2 Generation — Random Superposition (no unary flow)

Signature (minimum):
```js
createField(cols, rows, strength, seed, width, height, nSources, nSinks, nDoublets, nVortexes)
// or options object {sources,sinks,doublets,vortexes}
```
Requires `seed` and four counts `>=0`; if a count is `0` that type is omitted except mandatory constraints are still enforced (coerced), except Level 1 tutorial (`hole-1` per `08-level-generation.md`) may have `0,0,0,0` without coercion.

Defaults (when counts omitted): `seed=42, nSources=1, nSinks=1, nDoublets=1, nVortexes=1` (already satisfies minors). If any `unaryFlow` arg is passed, ignore it (or warn) — no uniform flow.

**Mandatory minima (coerced if violated, except hole-1 tutorial `sources:1,sinks:1,doublets:0,vortexes:0` bypasses vortex/doublet coercion; all-zero also coerces to `1,1,0,1` or `1,1,1,1`):**
- At least one vortex **or** doublet strictly **inside** (`0<ex<width && 0<ey<height`, margin `≥20` → `20≤ex≤width-20`) for all levels except `hole-1`. If caller passes `0,0` for both with `nSources+sinks>0` on non-tutorial, implicitly create one vortex inside.
- At least one source **and** one sink **slightly outside** (`ex<0||ex>width||ey<0||ey>height` with `OUTSIDE∈[20,60]`, e.g. `30+rand()*20`; no placement exactly on edge `ex==0` within `1px`, none strictly inside).

**Seeded randomness**: deterministic `mulberry32(seed)` drives all positions/strengths/orientations; mandatory placements also derive from it.

**Placement:**
- Sources/sinks: random side `left x=-OUTSIDE / right x=width+OUTSIDE / top y=-OUTSIDE / bottom y=height+OUTSIDE` via `rand()`, other coordinate uniform along side in `[0,width]`/`[0,height]`, outside offset `20-60`. No inside, no edge.
- Vortexes/doublets: uniformly inside `[20,width-20]×[20,height-20]`.

**Strengths (very fast wind, tunable but documented at `vectorField.js:5`):**
- Sources `sigma∈[1.2,2.2]`, sinks same as negative source, doublets `mu∈[1.2,2.2]` + `theta∈[0,2π)`, vortex `Gamma∈[1.4,2.6]` random sign. Tunables at top: `WIND_STRENGTH=180, SOFTENING_A=28, MIN_WIND_FORCE=80`.

**Element fields** (`a≈28`, `eps=a²`):
- Source outside `(sx,sy)`: `dx=x-sx, dy=y-sy, r2=dx²+dy²+eps, contrib = S*(dx,dy)/r2`
- Sink outside: same with `S=-sigma`
- Vortex inside: `r2=..., contrib = Gamma*(-dy,dx)/r2`
- Doublet inside: rotate into frame with `theta`, `r2, r4=r2², local=mu*((dx'²-dy'²)/r4, 2*dx'*dy'/r4)`, rotate back.

**Superposition**: `Vraw = Σsources(edge-outside)+Σsinks(edge-outside)+Σdoublets(inside)+Σvortexes(inside)` per cell centre. No unary flow.

### 1.3 Per-Difficulty Field Placement (normative, see `08-level-generation.md` §3)

- Mandatory source slightly **outside edge closest to `tee`** (`dist≤180+OUTSIDE` outside).
- Sink placement is **tier-dependent**:
  - **Easy & Medium**: sink slightly **outside a free canvas edge that is NOT the edge closest to `hole`/`green` and NOT the source edge**, sampled uniformly along that free edge outside.
  - **Hard non-flipped**: sink slightly **outside edge closest to `hole`** (`≤180+OUTSIDE` outside).
  - **Hard flipped** (≥50% of hard when sampling 100 hard): sink slightly outside tee side + source slightly outside green side, **plus** extra source **and** sink slightly outside the two free edges (each gets one, `20-60` outside), resulting `sources=2,sinks=2`.
  - **Medium extra sink** (60% of medium, ≥30% observed): additional sink slightly outside another remaining free edge also not closest to green (`sources=1,sinks=2` both outside on free edges not near green, `20-60` outside).
- See `08-level-generation.md` for exact counts per tier and mandatory doublet-in-tree rule.

### 1.4 Scaling & Minimum Force (final canonical values)

- `WIND_STRENGTH=180` scales sampled vector at apply time: `vel += wind * WIND_STRENGTH * dt`. Effective force is very high so wind dominates friction (`FRICTION=0.35` per `04-physics-and-collision.md`).
- **Minimum effective force** `|wind|*WIND_STRENGTH ≥ 0.1*MAX_POWER = 60` (with `MAX_POWER=600`) for every cell and interpolated sample. Generation scales magnitudes so `magnitude ≥ 0.1*MAX_POWER/WIND_STRENGTH` (e.g. `>=0.33` at `180`). Field has **varying strength at different locations** (max ≥1.1× min, two distant samples differ >8%).
- **High acceleration**: ball slowed to `<20` re-accelerates to `>60-80` within `0.3-0.5s`; ball never stationary >0.4s.

### 1.5 Determinism

- Bit-identical for same `seed+counts+cols+rows+width+height` on refresh. Different seed/counts yield distinct fields (`>15%` vector diff). No third-party noise library; inline PRNG.

## 2. Wind Visualization — Three.js Particles with Ghost Trails

- **Overlay element** `#wind-canvas` transparent `THREE.WebGLRenderer` with `alpha:true, antialias:true, premultipliedAlpha:false, setClearColor(0x000000,0)`, `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3` below HTML overlays (`hotbar` z5, `win`/`main-menu` z10-12). Import map `three@0.160.0` via `src/windThree.js`.

- **No streak shader**: no semi-opaque streak/lines shader; if a full-screen plane remains for fade, shader is `alpha=0` except fade quad.

- **Particles only**: `PARTICLE_COUNT=60-80` (default `70`), spawned uniformly in `[0,W]×[0,H]`, advected by `getWindAt(pos)` of the **same field components including live modifiers** (so trails visibly follow modifiers), `particleSpeed ~40-60` or `length(vWind)*k`. Distribution stays even; OOB or life expiration triggers uniform-random respawn (no wrap, no edge clumping).
  - **Lifetime** `maxLife=3.5-5.0` (default `4.5`), `life-=dt`, `alpha=life/maxLife`, respawn when `<=0`.
  - **Ghost trails**: fade quad `renderer.autoClear=false` + full-screen `MeshBasicMaterial(0x000000, opacity 0.06-0.12, transparent, depthWrite:false)` rendered before particles without clearing, or trail geometry `Line` with last `6-10` positions per-vertex `head 0.9→tail 0.0`, width `2-4px`. Trails are broad soft ribbons `4-8px` `rgba(255,255,255,0.55-0.85)`/`rgba(180,220,255,0.75)` additive; particle head `6-9px` white with soft falloff; no hard black border. Outside trails alpha≈0; overlay otherwise transparent.
  - **Modifier-aware**: inside `amplify` trails ~5× faster/longer, inside `nullify` stall, inside `flip` reverse.

- **Feeding**: `getWindAt` is source of truth; JS `updateWind(dt, getWindAt)` before `render()`; fields updated on level load and `syncModifiersToField()` so next-frame modifier changes affect trails. Optional `uSources`/`uSinks` uniforms for debug only.

- **Performance & toggle**: ≥55fps at `1280×720` with 70 particles+trails+≤9 components+≤12 modifiers. `H` toggles particles+trails visibility (`display:none`/`.visible=false`, no physics impact). Resize updates `renderer.setSize`/`setPixelRatio`/`uResolution`/camera.

## Acceptance Criteria

- [ ] `createField` signature requires `seed`+four counts (no unary); coerced outside/inside placement verified for 100 random seeds (all sources/sinks `20-60` outside, all vortexes/doublets `≥20` inside, ≥1 vortex|doublet inside except hole-1).
- [ ] `getWindAt` bilinear at cell centre equals cell, midpoint equals average ±0.01; min force `≥60` effective everywhere; varying strength max≥1.1×min.
- [ ] DOM has three layers stacked with wind transparent; `windThree.js` uses `Points`/trails, not streak shader; broad ghost trails visible and swirl at vortex.
- [ ] `60-80` particles uniformly distributed, `life 3.5-5.0`, trails `0.5-1.0s`, modifier-aware speed/behavior.
- [ ] Deterministic for same seed; distinct for different seed/counts; `getWindAt` <0.05ms avg, `createField` <5ms.

## File Paths

- `src/vectorField.js:1` (`createField`, `getWindAt`, `WIND_STRENGTH`, `getFieldComponents`)
- `src/windThree.js:1` (`initWindOverlay`, `updateWind`, `renderWind`, `setWindVisible`)
- `index.html:8` (import map, `#wind-canvas`), `style.css:15` (`#wind-canvas` stacking)
