# REQ-033: Level Generation Pipeline — 5-Step Bézier+SDF+Domain-Warped Noise+Cellular/Poisson+Validation With Zoned Colors

- **ID:** REQ-033
- **Title:** 5-Step Layered Generation Pipeline: Bézier/A* Pathing → SDF Masking → Domain-Warped Simplex Noise → Cellular Automata (Water) / Poisson Disc (Trees) → Raycasting/A* Validation; Terrain Colors (Green/Fairway/Rough/OB/Water)
- **Priority:** Must Have
- **Type:** Procedural Generation / Rendering
- **Status:** Draft
- **Related Plan Section:** levels.js / terrain.js / render.js / obstacles.js (REQ-010, REQ-008, REQ-012 Extension)

## Description
Levels SHALL be generated using a **5-step layered generation pipeline** that overlays domain-specific constraints (Tees must lead to Greens, Hazards shouldn't completely block fairways) over standard procedural techniques, rather than relying on a single algorithm. The pipeline SHALL produce **zoned terrain** with **fixed colors** (Green light green, Fairway slightly darker green, Rough even darker green, Out of Bounds even darker gray, Water blue) and **circular tree obstacles**. The pipeline is the normative generation method for all 18 holes and SHALL be implemented in `src/terrain.js` (or `src/levels.js` with terrain helpers) and called from `generateLevels`.

## Rationale
A single noise or random placement cannot guarantee both natural looks and playability (fairways that actually connect tee to green, hazards that create risk-reward without impossible blocks). The 5-step pipeline separates concerns: the Bézier spine gives designer-controllable dog-legs, SDFs give crisp zone boundaries, domain warping gives organic wavy edges, Cellular Automata/Poisson give natural hazard/tree distributions, and validation guarantees solvability. Fixed zone colors give instant visual readability (putting green vs fairway vs rough vs OB vs water) without requiring texture memory.

## Requirements

1. **Step 1: Course Layout & Pathing — Best Algorithms: Quadratic/Cubic Bézier Curves or Directed A* Pathfinding (Bigger Bends on Medium/Hard)** in `src/terrain.js` / `src/levels.js`:
   - For each hole, pick **starting point Tee Box** (`tee` per REQ-010 §3: `x∈[40,180]`, `y∈[80,LOGICAL_H-80]`) and **end point Green/Hole** (`hole` per REQ-010 §3: `x∈[LOGICAL_W-180,LOGICAL_W-40]`).
   - Place **1–2 control points** between them to create the shot line (dogs-leg left/right, straight fairway) with **tier-dependent bigger bends**: **Easy (I)** no control point or offset `<15px` (straight); **Medium (L/V/U)** offset `45-80px` (L/V) or `70-110px` same-side for U; **Hard (S/Z)** offset `55-90px` opposite sides with even bigger bends (S/Z). For Cubic Bézier: `p1` at `t≈0.3`, `p2` at `t≈0.6` offset perpendicular to `tee→hole` by tier-dependent amount with random sign; for Quadratic: single `p1` at `t≈0.5`. For Directed A*: use a grid with heuristic favoring the hole and random lateral cost to create a dog-leg path; either method is acceptable if it yields a continuous spine with tier-appropriate bends (easy `I` straight, medium `L/V/U` with `>45px` offset, hard `S/Z` with `>55px` opposite offsets and tighter fairway per §2).
   - **Sample points along the spline** (e.g., `t∈[0,1]` step `0.02` → ~50 points via `getBezierPoint(t, p0, p1, p2[,p3])`) to form the **spine of the fairway** (`terrain.fairwayPath: Array<{x,y}>`). The spine SHALL be non-self-intersecting, continuous, and endpoints within `60px` of `tee`/`hole`.

2. **Step 2: Distance Field & Masking — Best Algorithms: Signed Distance Fields (SDFs) or Euclidean Distance Maps (Tighter Fairway on Hard)** in `src/terrain.js`:
   - Compute the **distance `d` of every cell/pixel** on the grid from the Bézier path centerline (and from tee/green circular masks) via **SDFs** (`sdfToSegment` min distance to spine segments) or Euclidean Distance Maps.
   - Apply a **width threshold** to define zone boundaries:
     ```
     0 ≤ d ≤ W_fairway → Fairway
     W_fairway < d ≤ W_rough → Rough
     d > W_rough → Out of Bounds (OB)
     ```
     Where `W_fairway ∈ [80,140]` (base `110` ± `rand()*30` per hole, widening later holes) and `W_rough = W_fairway + [60,100]` (base `+80`), **but for hard levels `W_fairway` SHALL be `15-25px` tighter (smaller) than the baseline for easy/medium at the same hole index** (e.g., `W_fairway_hard = clamp(W_fairway_baseline - (15 + rand()*10), 70, 140)`). Both SHALL be stored per level as `terrain.widthFairway` / `terrain.widthRough` and hard `W_fairway` is on average `≥12px` smaller than easy.
   - Expand **circular distance masks** around the path endpoints to form the **Tee Box** (start, radius `70-90`) and **Green** (end, radius `60-90`) — rendered as Green/light-green circles regardless of `d` (see §4 for colors). The SDF lookup SHALL first check these masks before thresholds.

3. **Step 3: Organic Shape & Contour Generation — Best Algorithms: Simplex Noise / Perlin Noise with Domain Warping** in `src/terrain.js`:
   - To make the fairway and rough look natural rather than perfect geometric capsules, **distort the coordinates used in the distance lookup** using **2D Simplex noise** (or Perlin) with **Domain Warping**:
     ```
     dist_warped(x, y) = SDF( x + Noise_x(x, y), y + Noise_y(x, y) )
     ```
     Concrete: 
     ```js
     function warpedDist(x,y, spine, warpScale=0.008, warpStrength=18){
       const nx = simplexNoise(x*warpScale, y*warpScale); // [-1,1]
       const ny = simplexNoise((x+431)*warpScale, (y-217)*warpScale);
       const wx = x + nx * warpStrength;
       const wy = y + ny * warpStrength;
       return sdfDistance(wx, wy, spine);
     }
     ```
     This creates organic, wavy fairway and rough edges while retaining structural playability (the spine still leads from tee to green).
   - Noise SHALL be **seeded per hole** (`terrain.noiseSeed = baseSeed + i*7919`), `warpScale ∈ [0.006,0.012]` (base `0.008`), `warpStrength ∈ [12,24]` (base `18`). Warping SHALL be applied **before** thresholding (so boundaries wobble by `≥8px` RMS, `≤35px` max vs unwarped capsule).

4. **Step 4: Placing Hazards & Obstacles — Best Algorithms: Cellular Automata (for water) & Poisson Disc Sampling (for trees)** in `src/terrain.js` / `src/obstacles.js`:
   - **Water Hazards & Sand Traps (blue):**
     - Generate **small clusters** using **Cellular Automata** (e.g., `8×8` grid, `fill 0.42`, 4 iterations `B3/S23` smoothing) **or thresholded Perlin Noise** (`noise > 0.6`) **near/on the fairway**. Per **REQ-034**, `waterOnFairway` counts are **Easy 0, Medium 1, Hard 1-3** (center `d ≤ W_fairway-10` strictly on fairway, not just near edge), while extra water for aesthetics near edges (`d ∈ [W_fairway-20, W_fairway+40]`) is optional but the **on-fairway count is normative** for difficulty. Each cluster area `800-3000px²` (as `w×h` rects or `r=18-32` circles), stored as `waterHazards`.
     - **Rule:** Ensure water hazards **intersect the fairway selectively (forced carries)** **or hug the edges as risk-reward elements**, but **shall NOT completely block fairways** (validation in Step 5 ensures at least one spine sample and one first-drive landing zone remain fairway not water).
     - Water SHALL be rendered **blue** (`#4A90E2` etc., see REQ-010 §2) and be **fatal** (ball entering water → instant reset).
   - **Tree Placement — Circular obstacles, partly on Fairway per difficulty (REQ-034) + optional Rough/OB:**
     - Use **Poisson Disc Sampling** (Bridson's algorithm, `minDist = 45±15`, `k=30`) to scatter **trees**. All trees SHALL be `type:'circle'`, `r∈[18,36]`.
     - **Per REQ-034, a subset `treesOnFairway` SHALL be placed *on the fairway* (`terrainZoneAt === 'fairway'` or `d ≤ W_fairway-4` not in Green/Tee masks) with counts Easy `1-2`, Medium `2-3`, Hard `3-5`. These fairway trees are difficulty-relevant and SHALL respect `≥40px` clearance from tee/green masks and `≥ r1+r2+6` between trees, and at least one `doublet` SHALL be co-located in a fairway tree (≤2px).**
     - **Additional trees for aesthetics MAY be placed in Rough & OB** (`d > W_fairway`) with density scaled `density_OB ≈ 1.8× density_Rough` (`minDist_OB=38`, `minDist_Rough=62` or `p=0.55` in rough). Total trees per hole MAY be `treesOnFairway + extraRoughOB` where total `8-22` is the old aesthetic total, but the **normative count for difficulty is `treesOnFairway` per REQ-034**; extra rough/OB trees are not counted toward difficulty and SHALL never be inside Fairway/Green beyond the `treesOnFairway` budget.
     - Trees SHALL respect `≥40px` clearance from tee/green masks and never overlap each other.

5. **Step 5: Playability Validation & Path Solvability — Best Algorithms: Physics Raycasting or A* Shot Simulation** in `src/terrain.js`:
   - Simulate **max-distance shots** from the Tee towards the Hole. Check if a **valid landing zone exists in the fairway for every shot**. A `maxDrive = LOGICAL_W*0.55` (`~700` at `1280`) or `600-750` SHALL be used as maximum drive range.
   - Procedure per hole (≤20 simulations, deterministic):
     - Sample `t=0,0.25,0.5,0.75,1.0` along spine; each point must be in `fairway`/`green` and **not inside water** and not `ob` (spine traversable).
     - Check first-drive annulus `tee` ring `r∈[0.7*maxDrive, maxDrive]` contains at least one `fairway` point not in water (ensures water doesn't block all first drives).
     - Check at least one `40px` corridor exists from tee to hole via fairway (no water/OB 100% block). This can be done via `A*` on a `fairway`/`rough` walkable grid or via raycasting sampled corridors.
   - **Ensure water/OB hazards do not create impossible shots** (e.g., a water hazard completely covering the player's maximum drive range). If validation fails, **regenerate** that hole (re-roll control points, noise seed, or hazard positions) up to `15` attempts until solvable; if still unsolvable, **remove the offending water cluster** or **widen `W_fairway` by `+15`** and re-validate. No generated hole SHALL be left unsolvable.
   - Validation SHALL be **deterministic** for a given seed.

6. **Terrain Colors — Fixed Palette (Normative)** in `src/render.js` / `src/terrain.js`:
   - **Green** (putting, around hole): light green `#A8E6A3` `rgb(168,230,163)` ±8 per channel.
   - **Fairway** (corridor, `0≤d≤W_fairway` warped): slightly darker green `#6BC96E` `rgb(107,201,110)` (or `#7AC87A`), darker than Green by `ΔL*>10`.
   - **Rough** (`W_fairway<d≤W_rough`): even darker green `#3D8B3D` `rgb(61,139,61)` (or `#4A9F4A`), darker than Fairway by `ΔL*>8`.
   - **Out of Bounds** (`d> W_rough`): even darker gray `#2E2E2E` `rgb(46,46,46)` (gray, saturation <20, luminance <35), darker than Rough.
   - **Water Hazards** (Cellular clusters): blue `#4A90E2` `rgb(74,144,226)` (hue `210±10`, sat >50).
   - **Trees**: circular obstacles `type:'circle'` `r=18-36`, trunk `#6B3A2A`, canopy `#1E7A34` (per REQ-008), on top of terrain zones (placed only in Rough/OB).
   - Rendering order on bottom canvas: `OB (gray) → Rough → Fairway → Green → Water (blue)` (bottom to top), then trees on top canvas. The bottom canvas MAY overlay `grass_seamless.webp` at `globalAlpha 0.12-0.18`, but zone colors SHALL remain dominant.

7. **Integration & Determinism:**
   - The pipeline SHALL be encapsulated as `generateTerrain(seed, tee, hole, spine, Wf, Wr)` (or inside `generateLevels`) and called per hole inside `generateLevels` (REQ-010). `generateLevels(seed, count)` SHALL remain the entry point; it SHALL internally run Steps 1-5 for each hole.
   - All steps SHALL be **seeded per hole** (`baseSeed + i*7919` etc.) so same `seed` → same 18 holes with same zones/hazards/trees/warping.
   - `src/levels.js` SHALL export `LEVELS` and `generateLevels` as before; `src/terrain.js` (new) SHALL export `terrainZoneAt(x,y, level)`, `warpedDist`, `sdfToSpine`, `isHoleSolvable`, `generateWaterClusters`, `generateTreesPoisson` for testability.

## Acceptance Criteria

- [ ] For any seed, calling `generateLevels(seed, 18)` produces 18 holes each with `terrain.fairwayPath.length ≥20` points, `terrain.widthFairway ∈ [80,140]`, `terrain.widthRough = W_fairway+[60,100]`, `terrain.noiseSeed` defined, and `terrain.green`/`teeBox` circular masks within `60px` of `hole`/`tee`. The spine is continuous and non-self-intersecting.
- [ ] **Zone colors rendered correctly:** Sampling bottom canvas `ImageData` or `terrainZoneAt` at `hole` center returns Green `rgb(168,230,163)±8`; at `tee+40px` toward hole along spine returns Fairway `rgb(107,201,110)±8`; at `d=W_fairway+30` returns Rough `rgb(61,139,61)±8`; at `d=W_rough+40` returns OB gray `rgb(46,46,46)±8` (gray, low sat); at any water cluster center returns Water blue `rgb(74,144,226)±8` (hue 210±10). No zone is rendered with wrong palette.
- [ ] **Trees are circular and in Rough/OB only:** `obstacles.every(o=>o.type==='circle' && o.r>=18 && o.r<=36)` for newly generated levels; `terrainZoneAt(tree.x,tree.y)` is `rough` or `ob`, never `fairway`/`green`; trees respect Poisson `minDist` (`≥ r1+r2+6`, `OB 38`/`Rough 62` or 1.8× density) and `≥40px` clearance from tee/green masks.
- [ ] **Water via Cellular Automata / Perlin:** Water clusters are `0-3` per hole on `40%` of holes, each area `800-3000px²`, placed where `d ∈ [W_fairway-20, W_fairway+40]` (near fairway edge), rendered blue, and **never completely blocks** the fairway spine (at least one spine sample point not in water) or the first-drive annulus (at least one fairway point in annulus not in water). Water never covers `>80%` of any `100px` segment of fairway.
- [ ] **Domain Warping creates organic edges:** For a fixed spine/thresholds, the warped boundary (strength `18`, scale `0.008`) deviates from unwarped capsule by `≥8px` RMS and `≤35px` max (sample 100 boundary points). Same seed → same warping; different seed → different warping for ≥50% of holes.
- [ ] **Validation ensures solvability:** For 100 random seeds, zero holes fail `isHoleSolvable` (spine traversable, first-drive annulus has fairway not water, at least one 40px corridor tee→hole via fairway). Holes that fail are regenerated or water removed/widened within `15` attempts; no unsolvable hole is left.
- [ ] **Determinism:** `generateLevels(seed)` called twice with same `seed` yields `JSON.stringify` equal output (including `terrain`, `obstacles`, `waterHazards`); different seeds yield different `fairwayPath`/`terrain`/`hazards` for ≥50% of holes.
- [ ] **No regressions:** `LEVELS.length===18` after generation, `tee` left / `hole` right with random heights (≥10 distinct y values), `field` progression per REQ-010 still holds, and `src/main.js` still uses `LEVELS[0].field` and `terrain` to draw.

## Dependencies

- REQ-010 (level count, tee/hole placement, field progression)
- REQ-008 (circular tree obstacles, collision)
- REQ-012 (rendering — terrain zones drawn with specified colors, trees on top)
- REQ-030 (bottom canvas terrain vs splash, HiDPI)
- REQ-003 (field wind sources/sinks, not terrain)

## Notes

- Implementation sketch `src/terrain.js:1` (see REQ-010 Notes for full `generateLevels` sketch that calls terrain helpers). Key helpers:
  ```js
  export function sdfToSpine(x,y, spine){ let min=Infinity; for(let i=0;i<spine.length-1;i++) min=Math.min(min, distToSegment(x,y, spine[i], spine[i+1])); return min; }
  export function warpedDist(x,y, spine, noise2D, scale=0.008, strength=18){
    const nx = noise2D(x*scale, y*scale);
    const ny = noise2D((x+431)*scale, (y-217)*scale);
    return sdfToSpine(x+nx*strength, y+ny*strength, spine);
  }
  export function terrainZoneAt(x,y, level){
    if (inGreenMask(x,y, level.terrain.green) || inTeeMask(x,y, level.terrain.teeBox)) return 'green';
    const d = warpedDist(x,y, level.terrain.fairwayPath, level.terrain.noise2D, level.terrain.warpScale, level.terrain.warpStrength);
    if (d <= level.terrain.widthFairway) return 'fairway';
    if (d <= level.terrain.widthRough) return 'rough';
    if (isInWater(x,y, level.waterHazards)) return 'water';
    return 'ob';
  }
  export function isHoleSolvable(tee,hole,spine,Wf,waterHazards,obstacles){ /* A* or raycast as per REQ-010 §8 */ }
  export function generateWaterClusters(spine,Wf,rand,noiseSeed){ /* Cellular Automata 8x8, fill 0.42, 4 iter, near edge */ }
  export function generateTreesPoisson(count,spine,Wf,Wr,tee,hole,waterHazards,rand){ /* Bridson Poisson in rough/OB */ }
  ```
- Colors tolerance: ±8 per channel for test stability; hue/saturation checks for water (210±10, sat>50) and gray (sat<20).
- Vendor `simplex-noise` MAY be vendored as `src/vendor/simplex-noise.js` per REQ-001 (no external download), or use inline `mulberry32` PRNG-based value noise.

## File Paths

- `src/terrain.js:1` (NEW: SDF, warpedDist, terrainZoneAt, isHoleSolvable, generateWaterClusters, generateTreesPoisson, noise helpers)
- `src/levels.js:1` (generateLevels now calls 5-step pipeline, creates terrain + waterHazards + circular trees, exports LEVELS)
- `src/render.js:1` (drawTerrainZones with fixed palette Green/Fairway/Rough/OB/Water, drawObstacles for circular trees)
- `src/obstacles.js:1` (checkObstacleCollision for circles, isInWater, isOutOfBoundsTerrain)
- `docs/requirements/REQ-033-level-terrain-pipeline.md:1` (this file)

