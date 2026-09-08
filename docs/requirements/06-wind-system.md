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
- At least one source **and** one sink **slightly outside** (`ex<0||ex>width||ey<0||ey>height` with sources `OUTSIDE∈[20,60]` and sinks `OUTSIDE_SINK∈[60,100]` (increased distance, e.g. `60+rand()*40` for sink); no placement exactly on edge `ex==0` within `1px`, none strictly inside).

**Seeded randomness**: deterministic `mulberry32(seed)` drives all positions/strengths/orientations; mandatory placements also derive from it.

**Placement:**
- Sources/sinks: random side `left x=-OUTSIDE / right x=width+OUTSIDE / top y=-OUTSIDE / bottom y=height+OUTSIDE` via `rand()`, other coordinate uniform along side in `[0,width]`/`[0,height]`, outside offset `20-60` for sources and **`60-100` for sinks (increased sink distance)**. No inside, no edge.
- Vortexes/doublets: uniformly inside `[20,width-20]×[20,height-20]`.

**Strengths (very fast wind, tunable but documented at `vectorField.js:5`):**
- Sources `sigma∈[1.2,2.2]`, sinks same as negative source, doublets `mu∈[1.2,2.2]` + `theta∈[0,2π)`, vortex `Gamma∈[1.4,2.6]` random sign. Tunables at top: `WIND_STRENGTH=180, SOFTENING_A=28, MIN_WIND_FORCE=80`.

**Element fields** (`a≈28`, `eps=a²`):
- Source outside `(sx,sy)`: `dx=x-sx, dy=y-sy, r2=dx²+dy²+eps, contrib = S*(dx,dy)/r2`
- Sink outside: same with `S=-sigma`
- Vortex inside: `r2=..., contrib = Gamma*(-dy,dx)/r2`
- Doublet inside: rotate into frame with `theta`, `r2, r4=r2², local=mu*((dx'²-dy'²)/r4, 2*dx'*dy'/r4)`, rotate back.

**Superposition**: `Vraw = Σsources(edge-outside)+Σsinks(edge-outside)+Σdoublets(inside)+Σvortexes(inside)` per cell centre. No unary flow.

### 1.3 Per-Difficulty Field Placement (normative, see `08-level-generation.md` §5)

- **Source outside `20-60` / sink outside `60-100` (increased distance)** — sources use `OUTSIDE=20-60` (`30+rand*20`), sinks use `OUTSIDE_SINK=60-100` (`60+rand*41`) for increased gap to canvas edge; none strictly inside or exactly on edge.
- **Sink — every level has at least one sink** (`sinks ≥1`, actually `sinks=1` for all tiers) placed **slightly above the canvas upper edge** (`y=-OUTSIDE_SINK`) **or slightly below the lower edge** (`y=H+OUTSIDE_SINK`) **on the right third of the canvas** (`x ∈ [2*W/3, W]`, `OUTSIDE_SINK 60-100`), `rand()<0.5` chooses top vs bottom. Guarantees `sink.x > 2*W/3` (`x ∈ [853,1280]` at `W=1280`) and `sink.y <0` or `sink.y >H` with **increased distance 60-100** from edge (was 20-60). Applies to **all tiers** (easy/medium/hard).
- **Easy — no head wind (tail wind left→right)**:
  - Source **always slightly outside left edge** (`x=-OUTSIDE`, `OUTSIDE 20-60`, `y` uniform `20..H-20`) — left third of map (`x < W/3`).
  - Sink as above (right third top/bottom, **60-100** outside). Guarantees `source.x < W/3` and `sink.x > 2*W/3`; no head wind. `1,1,1,0` total 3.
- **Medium — extra source, single sink on right-third top/bottom (increased distance)**:
  - Source slightly **outside edge closest to `tee`** (`dist≤180+OUTSIDE` outside, deterministic `edgePointClosestTo(tee)`, `OUTSIDE 20-60`) **plus an extra source placed randomly outside any canvas edge `OUTSIDE 20-60` but not too close to the existing source and sink (`hypot(newSource - existingSource) >180` and `hypot(newSource - sink) >180`, sampled with seeded `rand` and up to 30 retries, deterministic)**.
  - Sink **single** as above (right third top/bottom, **60-100** outside) — always `sinks=1`. `2,1,2,1` total 6.
- **Hard — single sink on right-third top/bottom (increased distance)**:
  - Source slightly **outside edge closest to `tee`** (same as medium without extra, `OUTSIDE 20-60`).
  - Sink **single** as above (right third top/bottom, **60-100** outside) — **no extra sink/source** (removed, always `1,1` not `2,2`; flipped logic removed). `1,1,3,1` total 6.
- See `08-level-generation.md` §5 for exact `sources,sinks,doublets,vortexes` per tier, `waterOnFairway` `0`/`1-2`/`1-2`, and mandatory doublet-in-tree rule (≥1 doublet `≤2px` in fairway tree). All tiers use **constant wind strength** (not scaling with difficulty, see §1.4).

### 1.4 Scaling & Minimum Force (final canonical values — constant, not scaling with difficulty)

- `WIND_STRENGTH=180` scales sampled vector at apply time: `vel += wind * WIND_STRENGTH * dt`. Effective force is very high so wind dominates friction (`FRICTION=0.35` per `04-physics-and-collision.md`). **Wind strength is constant for all levels** — `WIND_STRENGTH` and `MIN_WIND_FORCE` are identical for `easy`/`medium`/`hard` and `field.strength` passed to `createField` is a fixed constant (e.g. `90`) independent of `tier` or `levelNum` (no scaling `80→125` with hole index/difficulty). Earlier docs mentioning strength `80+(levelNum-1)*5` are superseded.
- **Minimum effective force** `|wind|*WIND_STRENGTH ≥ 0.1*MAX_POWER = 60` (with `MAX_POWER=600`) for every cell and interpolated sample. Generation scales magnitudes so `magnitude ≥ 0.1*MAX_POWER/WIND_STRENGTH` (e.g. `>=0.33` at `180`). Field has **varying strength at different locations** (max ≥1.1× min, two distant samples differ >8%).
- **High acceleration**: ball slowed to `<20` re-accelerates to `>60-80` within `0.3-0.5s`; ball never stationary >0.4s. Since strength is constant, medium/hard do not have stronger wind than easy — difficulty comes from shape/trees/water/doublets, not wind magnitude.

### 1.5 Determinism

- Bit-identical for same `seed+counts+cols+rows+width+height` on refresh. Different seed/counts yield distinct fields (`>15%` vector diff). No third-party noise library; inline PRNG.

## 2. Wind Visualization — Three.js Particles with Ghost Trails

- **Overlay element** `#wind-canvas` transparent `THREE.WebGLRenderer` with `alpha:true, antialias:true, premultipliedAlpha:false, setClearColor(0x000000,0)`, `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3` below HTML overlays (`hotbar` z5, `win`/`main-menu` z10-12). Import map `three@0.160.0` via `src/windThree.js`.

- **No streak shader**: no semi-opaque streak/lines shader; if a full-screen plane remains for fade, shader is `alpha=0` except fade quad.

- **Particles only**: `PARTICLE_COUNT=60-80` (default `70`), spawned uniformly in `[0,W]×[0,H]`, advected by `getWindAt(pos)` of the **same field components including live modifiers** (so trails visibly follow modifiers), `particleSpeed ~40-60` or `length(vWind)*k`. Distribution stays even; OOB or life expiration triggers uniform-random respawn (no wrap, no edge clumping).
  - **Lifetime** `maxLife=3.5-5.0` (default `4.5`), `life-=dt`, `alpha=life/maxLife`, respawn when `<=0`.
  - **Ghost trails**: fade quad `renderer.autoClear=false` + full-screen `MeshBasicMaterial(0x000000, opacity 0.06-0.12, transparent, depthWrite:false)` rendered before particles without clearing, or trail geometry `Line` with last `6-10` positions per-vertex `head 0.9→tail 0.0`, width `2-4px`. Trails are broad soft ribbons `4-8px` `rgba(255,255,255,0.55-0.85)`/`rgba(180,220,255,0.75)` additive; particle head `6-9px` white with soft falloff; no hard black border. Outside trails alpha≈0; overlay otherwise transparent.
  - **Modifier-aware**: inside `amplify` trails ~5× faster/longer, inside `nullify` stall, inside `flip` reverse and 5× faster (flip now `*-5`, same amplification as amplify), inside `rotate` 90° CW and 5× faster (rotate includes one amplify; stacked `rotate`/`flip` deduped to one 5×, further amplified by `amplify`).

- **Free Shot golden glow + edge glow** (see `07-modifiers.md` §5.2): **Ball glow** is shown **only while `isFreeShotActive===true` (armed before launch)** and is **removed immediately after launch** (even though `freeShotFlightActive` remains true during flight, ball glow is hidden); **Edge glow** is shown **while `isFreeShotActive===true` OR while ball is in motion after a free launch** (`freeShotFlightActive`). `src/windThree.js` renders ball glow as **golden glowing effect centered on `ball.pos`** in the Three.js layer (`#wind-canvas`) and edge glow as **subtle gold edge glow around the canvas**. Implementation: `THREE.Sprite` or `THREE.Mesh` (`CircleGeometry`/`SphereGeometry`) with `MeshBasicMaterial`/`SpriteMaterial` `color 0xf1c40f` (`#f1c40f`/`0xFFD700`), `transparent:true`, `opacity 0.55-0.85`, `blending:THREE.AdditiveBlending`, `depthWrite:false`, `radius 14-22px` logical (DPR-scaled), soft radial falloff texture, pulsation `scale 1.0 + 0.15*sin(time*3)` and `opacity` flicker for ball, plus DOM `div#free-shot-edge-glow` `position:absolute; inset:0; border-radius:8px; border:2px solid rgba(241,196,15,0.38); box-shadow: inset 0 0 36px rgba(241,196,15,0.22), inset 0 0 70px rgba(241,196,15,0.12), 0 0 18px rgba(241,196,15,0.28); opacity 1 when edge active`. Export `setFreeShotActive(active:boolean)` / `setFreeShotBallActive` / `setFreeShotEdgeActive` / `updateFreeShotGlow(ballPos, dt)` called from `src/main.js` when toggling `isFreeShotActive`/`freeShotFlightActive` and each `updateWind`/`renderWind` frame (including `FLYING`). Ball glow hidden after launch, edge glow persists through flight; both hidden when neither armed nor in free flight (cleared after free launch lands, after hole advance, on `GAME_OVER`, or when `rewardMenuVisible`). `renderWind` must render even when `H` hides particles if edge glow active. Does not affect particle simulation; purely visual feedback that next attempt is/was free (ball pre-launch, edge during flight).

- **Feeding**: `getWindAt` is source of truth; JS `updateWind(dt, getWindAt)` before `render()`; fields updated on level load and `syncModifiersToField()` so next-frame modifier changes affect trails. Optional `uSources`/`uSinks` uniforms for debug only.

- **Performance & toggle**: ≥55fps at `1280×720` with 70 particles+trails+≤9 components+≤12 modifiers plus freeShot glow. `H` toggles particles+trails visibility (`display:none`/`.visible=false`, no physics impact) — `H` may also hide freeShot glow or glow may remain as `H` only affects wind trails; document choice (glow should remain visible even when wind particles hidden, since it is attempt feedback). Resize updates `renderer.setSize`/`setPixelRatio`/`uResolution`/camera and repositions gold glow.

## Acceptance Criteria

- [ ] `createField` signature requires `seed`+four counts (no unary); coerced outside/inside placement verified for 100 random seeds (all sources `20-60` outside, all sinks `60-100` outside on right-third top/bottom (increased distance), all vortexes/doublets `≥20` inside, ≥1 vortex|doublet inside except hole-1).
- [ ] `getWindAt` bilinear at cell centre equals cell, midpoint equals average ±0.01; min force `≥60` effective everywhere; varying strength max≥1.1×min.
- [ ] DOM has three layers stacked with wind transparent; `windThree.js` uses `Points`/trails, not streak shader; broad ghost trails visible and swirl at vortex.
- [ ] `60-80` particles uniformly distributed, `life 3.5-5.0`, trails `0.5-1.0s`, modifier-aware speed/behavior.
- [ ] Deterministic for same seed; distinct for different seed/counts; `getWindAt` <0.05ms avg, `createField` <5ms.

## File Paths

- `src/vectorField.js:1` (`createField`, `getWindAt`, `WIND_STRENGTH`, `getFieldComponents`)
- `src/windThree.js:1` (`initWindOverlay`, `updateWind`, `renderWind`, `setWindVisible`)
- `index.html:8` (import map, `#wind-canvas`), `style.css:15` (`#wind-canvas` stacking)
