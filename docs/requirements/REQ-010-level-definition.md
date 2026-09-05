# REQ-010: Level Definition (Multi-Hole) — Procedural 18 Levels With 5-Step Terrain Pipeline & Zoned Colors

- **ID:** REQ-010
- **Title:** Level Definition — Procedural 18 Holes Via 5-Step Pipeline: Bézier Layout → SDF Masking → Domain-Warped Noise → Hazards/Trees → Validation; Zoned Terrain Colors
- **Priority:** Must Have
- **Type:** Data / Functional / Procedural Generation
- **Status:** Draft
- **Related Plan Section:** levels.js, Architecture File Structure, Terrain Pipeline (NEW)

## Description
On start of a **new game**, the game SHALL **procedurally generate exactly 18 levels (holes)** with **monotonically increasing difficulty** using a **5-step layered generation pipeline** that combines `Quadratic/Cubic Bézier Curves or Directed A* Pathfinding` for the fairway spine, `Signed Distance Fields (SDFs)` for zone masking, `Simplex/Perlin Noise with Domain Warping` for organic contours, `Cellular Automata (water) + Poisson Disc Sampling (trees)` for hazards/obstacles, and `Physics Raycasting / A* Shot Simulation` for playability validation. Generation is deterministic via a seed and SHALL be performed in `src/levels.js` (e.g., `generateLevels(seed, count=18)`). Each generated level SHALL have `tee` on the **left side** and `hole` on the **right side** with **random height**, SHALL define `field` and `obstacles` per progression, **and SHALL define `terrain` zones** (`Green`, `Fairway`, `Rough`, `Out of Bounds`, `Water`) **rendered with fixed colors**: `Green` light green, `Fairway` slightly darker green, `Rough` even darker green, `OB` even darker gray, `Water` blue, and **trees SHALL be circular obstacles**. The static `LEVELS` array, if kept, SHALL be overwritten by the generated 18 at runtime; `LEVELS.length` SHALL be `18` after generation.

## Rationale
18 holes gives a full round with clear progression. Tee left / hole right guarantees the primary shot is left-to-right and requires wind-aware routing. Random height per hole prevents memorization. A single algorithm cannot produce both structured playability (tee must lead to green without impossible blocks) and natural looks; the 5-step pipeline layers domain constraints (tees lead to greens, hazards don't completely block fairways) over standard procedural techniques, yielding organic, natural-looking top-down courses that remain solvable. Fixed terrain colors give immediate visual readability of lie/penalty zones while circular tree obstacles provide consistent collision.

## Requirements

1. **Generation entry point in `src/levels.js`**:
   - SHALL export `LEVELS: Level[]` (length `18` after generation) and a function `generateLevels(seed?: number, count?: number): Level[]` (or `createLevels`, `generateProceduralLevels`) that (re)creates the 18 levels. `src/main.js` SHALL call this on **new game start** (`startNewGame()`, `startNewGameFromMain()`, `resetGameAfterWin()`, and initial load with no save) before `loadLevel(0)`. The seed MAY be `Date.now()` or `Math.floor(Math.random()*1e9)` for fresh games, or a fixed debug seed if `?seed=` is present; generation MUST be deterministic for a given seed.
   - `LEVELS` after generation SHALL have `length === 18`, each element as:
     ```js
     {
       id: "hole-1" … "hole-18",
       name: `Hole ${i+1}`,
       canvas: {width:LOGICAL_W, height:LOGICAL_H}, // 16:9 e.g., 1280×720 per REQ-002/REQ-030, not 900×600
       tee: {x:number, y:number},
       hole: {x:number, y:number, radius:14},
       obstacles: Array<{type:'circle', x,y,r}>, // trees: circular obstacles only per new spec (see §7)
       waterHazards: Array<{x,y,w,h} | {x,y,r}>, // blue water zones (rendered as terrain, also fatal if entered)
       terrain: { // zoned SDF masks for rendering (see §3-5)
         green: {x,y,r}, // circular mask around hole
         teeBox: {x,y,r}, // circular mask around tee
         fairwayPath: Array<{x,y}>, // sampled Bézier spine points
         widthFairway: number, // SDF threshold W_fairway
         widthRough: number,   // SDF threshold W_rough
         noiseSeed: number
       },
       field: {cols:32, rows:18, strength:number, seed:number, sources:number, sinks:number, doublets:number, vortexes:number}
     }
     ```
     For backwards compat, `obstacles` MAY still contain `rect` types in legacy levels, but **newly generated levels per this spec SHALL use `type:'circle'` for trees**; any `rect` obstacles SHALL be considered deprecated and treated as water/tree zones. `LOGICAL_W×LOGICAL_H` SHALL be 16:9 (`1280×720` default).

2. **Terrain Zones & Colors — Fixed Palette** in `src/levels.js` / `src/render.js` / `src/terrain.js`:
   - Every level SHALL expose zoned terrain via SDF thresholds (see §4) rendered with these **exact or within-tolerance colors** (tolerance ± `0x08` per channel, or delta-E < 10):
     - **Golf Green** (putting surface, circular mask around hole, radius `~60-90px`): **light green** `fillStyle = "#A8E6A3"` (or `#B7E5B0` / `#A0E0A0` acceptable if light; reference `rgb(168,230,163)`). SHALL be drawn as a solid circle centered at `hole` before fairway.
     - **Fairway** (play corridor, `0 ≤ d ≤ W_fairway` from warped SDF): **slightly darker green** `fillStyle = "#6BC96E"` (or `#7AC87A` / `#68B86A` acceptable; reference `rgb(107,201,110)`), darker than Green by at least `ΔL* > 10`.
     - **Rough** (fringe, `W_fairway < d ≤ W_rough`): **even darker green** `fillStyle = "#3D8B3D"` (or `#4A9F4A` / `#36802F` acceptable; reference `rgb(61,139,61)`), darker than Fairway by at least `ΔL* > 8`.
     - **Out of Bounds (OB)** (`d > W_rough`): **even darker gray** `fillStyle = "#2E2E2E"` (or `#333333` / `#3A3A3A` / `#404040` acceptable; reference `rgb(46,46,46)`), gray (saturation < 20) and darker than Rough (luminance < 35).
     - **Water Hazards** (cellular-automata clusters, see §6): **blue** `fillStyle = "#4A90E2"` (or `#3A8DDE` / `#2E86C1` / `#5AA0E8` acceptable; reference `rgb(74,144,226)`), hue `210±10`, saturation > 50.
   - Rendering order on the bottom canvas (behind top transparent `game` canvas per REQ-012/REQ-030): `OB (gray) → Rough (darker green) → Fairway (lighter green) → Green (lightest) → Water (blue, on top of zones)` → then obstacles/trees (circular) on the top canvas per REQ-008. The bottom canvas MAY still tile `grass_seamless.webp` at low opacity as texture overlay, but the **zone colors SHALL be the dominant visible fill** (not hidden behind opaque grass).
   - **Trees SHALL be circular obstacles** (`type:'circle'`, `r∈[18,36]`), rendered with trunk `#6B3A2A` and canopy `#1E7A34` per REQ-008, on top of terrain zones (placed in Rough & OB per §6).

3. **Tee left / hole right, random height** (scaled to 16:9 logical per REQ-002/REQ-030, e.g., `LOGICAL_W=1280, LOGICAL_H=720`):
   - For every level `i`, `tee.x ∈ [40, 180]` on left side and `hole.x ∈ [LOGICAL_W-180, LOGICAL_W-40]` on right side, guaranteeing `hole.x - tee.x ≥ LOGICAL_W*0.6` (e.g., `≥ 768` at `1280`).
   - `tee.y` and `hole.y` SHALL be sampled **randomly** per hole via the seeded PRNG (`rand()*(LOGICAL_H-160)+80`, i.e., `y∈[80, LOGICAL_H-80]`), **deterministically** from the generation seed (so same seed → same heights). The two heights MAY be independent to create varied up/down shots.
   - No hard-coded `y` for all holes; heights MUST vary across the 18 (≥10 distinct `tee.y` and ≥10 distinct `hole.y` values).

4. **Step 1: Course Layout & Pathing — Bézier Curves or Directed A*** in `src/levels.js` / `src/terrain.js`:
   - For each hole, pick **starting point Tee Box** (`tee`) and **end point Green/Hole** (`hole`) per §3.
   - Place **1–2 control points** between them to create the shot line (dog-leg left/right, straight fairway). Control points SHALL be offset perpendicular to the `tee→hole` vector by `rand()* (LOGICAL_W*0.15)` with random sign, and along the line at `t≈0.3` and `t≈0.6` for cubic (or `t≈0.5` for quadratic).
   - Sample points along the **Quadratic/Cubic Bézier spline** (e.g., `getBezierPoint(t, p0,p1,p2[,p3])` with `t∈[0,1]` step `0.02` → ~50 spine points) to form the **spine of the fairway** (`terrain.fairwayPath`). Alternatively, a **Directed A* Pathfinding** grid may be used if it produces a comparable dog-leg spine; the choice SHALL be documented. The spine SHALL be stored as `terrain.fairwayPath`.
   - Requirement: The spine SHALL be continuous, non-self-intersecting, and its endpoints SHALL be within `r=60` of `tee`/`hole` (ensuring tee leads to green).

5. **Step 2: Distance Field & Masking — SDFs or Euclidean Distance Maps** in `src/terrain.js`:
   - Compute the distance `d` of every cell/pixel on the grid from the Bézier spine (and from tee/green circular masks) via **Signed Distance Fields (SDFs)** or Euclidean Distance Maps:
     ```js
     function terrainZoneAt(x,y, spine, tee, hole, Wf, Wr, warpedDist){
       const d = warpedDist(x,y); // or SDF(spine,x,y)
       if (inGreenMask(x,y,hole)) return 'green';
       if (inTeeMask(x,y,tee)) return 'teeBox'; // rendered as fairway or light green
       if (d <= Wf) return 'fairway';
       if (d <= Wr) return 'rough';
       return 'ob'; // out of bounds
     }
     ```
   - Apply **width thresholds** to define zone boundaries:
     - `0 ≤ d ≤ W_fairway → Fairway` where `W_fairway ∈ [80, 140]` (base `110` ± `rand()*30`, varied per hole, increasing slightly with hole index to widen later holes).
     - `W_fairway < d ≤ W_rough → Rough` where `W_rough = W_fairway + [60,100]` (base `+80`).
     - `d > W_rough → Out of Bounds (OB)` (gray).
   - Expand **circular distance masks** around the path endpoints to form the **Tee Box** (start, radius `70-90`) and **Green** (end, radius `60-90`) — these SHALL be rendered as Green/light-green circles regardless of `d`.
   - `W_fairway`/`W_rough` SHALL be stored per level in `terrain` for rendering and for §6 hazard placement and §7 validation.

6. **Step 3: Organic Shape & Contour Generation — Domain-Warped Simplex/Perlin Noise** in `src/terrain.js`:
   - To make the fairway and rough look natural rather than perfect geometric capsules, **distort the coordinates used in the distance lookup** using **2D Simplex noise** (or Perlin) with **Domain Warping**:
     ```js
     // pseudo
     function warpedDist(x,y, spine, warpScale=0.008, warpStrength=18){
       const nx = simplexNoise(x*warpScale, y*warpScale); // [-1,1]
       const ny = simplexNoise((x+431)*warpScale, (y-217)*warpScale);
       const wx = x + nx * warpStrength;
       const wy = y + ny * warpStrength;
       return sdfDistance(wx, wy, spine); // SDF of warped coord to spine
     }
     ```
     Formula: `dist_warped(x,y) = SDF( x + Noise_x(x,y), y + Noise_y(x,y) )` as per spec, creating organic, wavy fairway and rough edges while retaining structural playability.
   - Noise SHALL be **seeded per hole** (`terrain.noiseSeed = baseSeed + i*  7919`), so same seed → same warping. `warpStrength` SHALL be `12-24` (base `18`), `warpScale` `0.006-0.012` (base `0.008`). The warping SHALL be applied **before** thresholding (so zone boundaries wobble).
   - Requirement: For a fixed `spine` and `W_fairway`, the warped boundary SHALL deviate from the unwarped capsule by `≥ 8px` RMS and `≤ 35px` max (organic but not chaotic). This can be verified by sampling 100 points along the boundary.

7. **Step 4: Placing Hazards & Obstacles — Cellular Automata (Water) & Poisson Disc Sampling (Trees)** in `src/levels.js` / `src/terrain.js` / `src/obstacles.js`:
   - **Water Hazards & Sand Traps (blue zones) — partly on Fairway per difficulty (REQ-034):**
     - Generate **small clusters** using **Cellular Automata** (e.g., 8x8 grid, random fill `0.42`, 4 iterations of `B3/S23`-like smoothing) **or thresholded Perlin Noise** (`noise > 0.6`). Per **REQ-034**, `waterOnFairway` counts are **Easy 0, Medium 1, Hard 1-3** (center `d ≤ W_fairway-10` strictly on fairway, `terrainZoneAt === 'fairway'`), while extra clusters for aesthetics near edges (`d ∈ [W_fairway-20, W_fairway+40]`) are optional but the **on-fairway count is normative** for difficulty. Each cluster area `800-3000px²` (converted to `w×h` rects or `r=18-32` circles).
     - **Rule:** Ensure water hazards **intersect the fairway selectively** (forced carries) **or hug the edges as risk-reward elements**, but **shall NOT completely block fairways**. Validation: the fairway spine SHALL remain traversable (see §8). Water on fairway per tier SHALL be satisfied first.
     - Water zones SHALL be rendered **blue** (`#4A90E2` etc., see §2) on the bottom canvas **above** green/fairway/rough but **below** trees/obstacles on the top canvas. They SHALL be treated as **fatal hazards** (ball entering water → instant reset to tee, same as OB/tree collision per REQ-008, or as `isInWater()` check).
   - **Tree Placement — circular obstacles, partly on Fairway per REQ-034 difficulty + optional Rough/OB:**
     - Use **Poisson Disc Sampling** (e.g., Bridson's algorithm, `minDist = 45 + rand()*15`, `k=30`) to scatter **trees with natural, non-overlapping spacing**. All trees SHALL be `type:'circle'`, `r∈[18,36]` (trees), rendered per REQ-008.
     - **Per REQ-034, a subset `treesOnFairway` SHALL be placed *on the fairway* (`terrainZoneAt === 'fairway'` or `d ≤ W_fairway-4` and not in Green/Tee masks) with counts per tier: Easy `1-2`, Medium `2-3`, Hard `3-5`. These fairway trees are the difficulty-relevant trees and SHALL respect `≥40px` clearance from tee/green masks and `≥ r1+r2+6` between trees, and at least one doublet SHALL be co-located in a fairway tree (see REQ-034 §3).**
     - **Additional trees for aesthetics MAY be placed in Rough & OB** (`d > W_fairway`) with density scaled `density_OB ≈ 1.8× density_Rough` (`minDist_OB=38`, `minDist_Rough=62` or `p=0.55` in rough). Total trees per hole MAY be `treesOnFairway + extraRoughOB` where total `8-22` is the old aesthetic total, but the **normative count for difficulty is `treesOnFairway` per tier**; extra rough/OB trees are not counted toward difficulty and SHALL never be inside Fairway/Green beyond the `treesOnFairway` budget.

8. **Step 5: Playability Validation & Path Solvability — Physics Raycasting or A* Shot Simulation** in `src/levels.js` / `src/terrain.js`:
   - Simulate **max-distance shots** from the Tee towards the Hole. Check if a **valid landing zone exists in the fairway for every shot**. A `maxDrive = LOGICAL_W*0.55` (e.g., `~700` at `1280`) or `600-750` SHALL be used as the player's maximum drive range (derived from `MAX_POWER`/`BALL_RADIUS` physics per REQ-005/007).
   - Procedure per hole (deterministic, ≤ `20` simulations):
     ```js
     function isHoleSolvable(tee, hole, spine, Wf, waterZones, treeObstacles){
       // 1. Check fairway spine is traversable: sample t=0,0.25,0.5,0.75,1.0 along spine, each point must be in fairway/green and not inside water
       for (t of [0,0.25,0.5,0.75,1]) if (inWater(spine[t]) || terrainZoneAt(spine[t])==='ob') return false;
       // 2. Simulate A* or raycast: from tee, can we reach hole in ≤ ceil(dist/halfMaxDrive) shots staying in fairway/rough?
       // For MVP, check that no water/OB hazard completely covers the player's maximum drive range from tee:
       const firstLandingRing = annulus(center=tee, rInner=maxDrive*0.7, rOuter=maxDrive);
       const hasFairwayInRing = samplePointsInRing(firstLandingRing, 32).some(p=> terrainZoneAt(p)==='fairway' && !inWater(p));
       if (!hasFairwayInRing) return false; // water hazard blocks all first drives
       // 3. Ensure tree density doesn't block all gaps: at least one 40px corridor exists from tee to hole via fairway
       return hasFairwayCorridor(tee, hole, Wf, obstacles);
     }
     ```
   - **Ensure water/OB hazards do not create impossible shots** (e.g., a water hazard completely covering the player's maximum drive range). If validation fails, **regenerate** that hole (re-roll control points, noise seed, or hazard positions) up to `15` attempts until solvable; if still unsolvable, **remove the offending water cluster** or **widen `W_fairway` by `+15`** and re-validate. No generated hole SHALL be left unsolvable.
   - The validation SHALL be **deterministic** for a given seed (same PRNG sequence → same accept/reject).

9. **Field & Obstacle Progression With Terrain — Superseded By REQ-034 Difficulty Calculation (Including Flipped/Extra Sources/Sinks, Bigger Bends, Tighter Fairway):**
   - Level difficulty SHALL be calculated per **REQ-034** from four factors: fairway shape (I/L/V/U/S/Z **with bigger bends on medium/hard and tighter fairway on hard**), field components (with **flipped source/sink + extra source/sink on free edges for hard, extra sink on free edge for medium**), trees on fairway, water on fairway. The per-hole budgets per tier SHALL be:
     - **Easy:** shape `I` (horizontal/vertical, straight, tiny offset <15px, `W_fairway` baseline 90-140 not tightened), `waterOnFairway===0`, `treesOnFairway∈[1,2]`, `field: sources=1 near tee (edge ≤180px from tee) + sinks=1 near green (≤180px from hole) + doublets=1 in fairway (if tree on fairway, doublet in middle of tree ≤2px, applies to all difficulties)`, `vortexes=0` (total 3 components).
     - **Medium:** shape `L/V/U` with **even bigger bends** (`perp offset >45px` vs `>30px` before, `60-100` for L, `50-80` for V, `70-110` same-side for U, total heading 70-220°), `treesOnFairway∈[2,3]`, `waterOnFairway===1`, `field: sources=1 near tee + sinks=1 near green **plus MAYBE an extra sink on any free edge** (60% of medium holes have `sinks=2` on a free edge) + doublets∈[2,3] + vortexes=1` (total 5-6 or 6-7 with extra sink, at least one doublet in a fairway tree).
     - **Hard:** shape `S/Z` with **even bigger bends** (`perp offsets >55px` opposite sides, `70-110` each, `S/Z` inflection) and **tighter fairway** (`W_fairway` **15-25px smaller** than baseline for easy/medium, `W_fairway_hard = clamp(W_fairway_baseline - (15+rand()*10), 70, 140)`), `treesOnFairway∈[3,5]`, `waterOnFairway∈[1,3]`, `field: **MAY flip** so **sink on tee side + source on green side** (sink near tee ≤180px, source near hole ≤180px) **plus extra source and sink on the two free edges** (so `sources=2, sinks=2` when flipped+extra, at least 50% of hard holes SHALL be flipped when sampling 100 hard holes) or if not flipped still **add extra source and sink on free edges** (so hard always has `sources=2, sinks=2` via flipped or extra), `+ doublets∈[3,4] + vortexes∈[1,2]` (total 7-10 with extra source/sink, 6-8 without), at least one doublet in tree, remaining interior fairway/rough.
   - The previous monotonic progression table SHALL be considered **superseded** by the tier budgets above; the generator SHALL pick a tier first (e.g., `1-6 easy, 7-12 medium, 13-18 hard` or `≈30%/40%/30%` distribution) and then generate shape/field/trees/water matching that tier **with bigger bends for medium/hard and tighter fairway for hard**. The 18 holes SHALL contain at least `3` of each tier for variety. See REQ-034 for shape classification with bigger bends, source/sink placement with flipped/extra, and the exact placement rules.
   - Every generated field SHALL still satisfy REQ-003 with the new placement constraints (source near tee edge, sink near green edge, doublets interior fairway/rough, at least one doublet in tree when `treesOnFairway≥1`). `strength` still `80→125`.

10. **No hard-coded levels, Course Wrapper (REQ-031)**:
    - `src/levels.js` SHALL NOT contain 18 hand-written objects as the source of truth; instead it SHALL contain the generator and optionally a `STATIC_LEVELS` fallback for tests. `src/main.js` SHALL use the generated `LEVELS` for `currentHoleIndex`, `Hole: N/M` HUD, and `createField` calls. `generateLevels` SHALL support variable `count` `3|9|18` and `LEVELS` after generation SHALL equal `course.holes` for the active course.

## Acceptance Criteria

- [ ] On fresh new game (clear `localStorage`, reload, or call `generateLevels(Date.now())`), `LEVELS.length === 18`, `generateLevels` returns 18, and `LEVELS[0].id === "hole-1"` … `LEVELS[17].id === "hole-18"`.
- [ ] Every level `tee.x ∈ [40,180]` on left side and `hole.x ∈ [LOGICAL_W-180, LOGICAL_W-40]` on right side, `hole.x - tee.x ≥ LOGICAL_W*0.6`, and `tee.y`/`hole.y` vary randomly across the 18 (≥10 distinct values), deterministic for same seed.
- [ ] **Terrain zones & colors — visual regression:** For any level sampled at `hole` center, `getTerrainAt(hole.x,hole.y)` (or reading bottom canvas `ImageData` at that pixel after `redrawBottom`) returns **Green** `rgb(168,230,163) ±8` (light green); at `tee` + `40px` toward hole along spine returns **Fairway** `rgb(107,201,110) ±8` (slightly darker); at `d = W_fairway+30` returns **Rough** `rgb(61,139,61) ±8` (even darker green); at `d = W_rough+40` returns **OB** `rgb(46,46,46) ±8` (gray, saturation <20); at any water cluster center returns **Water** `rgb(74,144,226) ±8` (blue, hue 210±10). No zone uses the wrong palette (e.g., fairway not gray, OB not blue). The bottom canvas zone fills are the dominant visible fill (not hidden behind opaque grass).
- [ ] **Trees are circular obstacles with on-fairway subset per difficulty (REQ-034):** For every level, `obstacles.every(o=>o.type==='circle' && o.r>=18 && o.r<=36)` for newly generated levels; `level.difficulty.treesOnFairway` trees satisfy `terrainZoneAt(tree.x,tree.y) === 'fairway'` (or `d <= W_fairway-4` not in Green/Tee mask) with counts per tier `Easy 1-2, Medium 2-3, Hard 3-5`; any extra trees (if `obstacles.length > treesOnFairway`) are in `rough`/`ob` only, never `fairway`/`green` beyond the budgeted `treesOnFairway`. All trees respect Poisson `minDist` (`≥ r1+r2+6`, `OB 38`/`Rough 62` or 1.8× density for rough/OB extras) and `≥40px` clearance from tee/green masks, and at least one `doublet` is co-located within `≤2px` of a fairway tree when `treesOnFairway≥1`.

- [ ] **Step 1 Bézier Layout:** For each level, `terrain.fairwayPath.length ≥ 20` points, endpoints within `60px` of `tee`/`hole`, spine is non-self-intersecting, and at least one control point is offset perpendicular to `tee→hole` by `≥ LOGICAL_W*0.05` (dogs-leg) for `≥30%` of holes (randomly). Sampled spine points are stored and `W_fairway`/`W_rough` are defined.
- [ ] **Step 2 SDF Masking:** For any `(x,y)` on the spine, `terrainZoneAt` returns `fairway`; for any point `W_fairway+1` perpendicular offset returns `rough`, and `W_rough+1` returns `ob`. Tee and Green circular masks (`r=70-90`) return `green`/`teeBox` regardless of `d`. Thresholds `W_fairway ∈ [80,140]` and `W_rough = W_fairway + [60,100]` per level.
- [ ] **Step 3 Domain Warping:** For a fixed spine and thresholds, the warped boundary deviates from the unwarped capsule by `≥8px` RMS and `≤35px` max (organic wavy edges). Verified by sampling 100 boundary points along spine with `warpStrength=18` and `warpScale=0.008` vs `0` warp. Noise is seeded per hole (`terrain.noiseSeed`), so same seed → same warping.
- [ ] **Step 4 Hazards — Water/ Trees on Fairway per Difficulty (REQ-034):** Water clusters via Cellular Automata / thresholded Perlin and trees via Poisson are placed **on the fairway** for difficulty counting: `level.difficulty.waterOnFairway` with `Easy 0`, `Medium 1`, `Hard 1-3` (center `d ≤ W_fairway-10`, area `800-3000px²`, blue), and `treesOnFairway` as above; water never completely blocks the fairway spine (validation ensures at least one spine sample not in water) and at least one doublet is placed in a fairway tree. Extra water/trees for aesthetics may be in rough/OB but the on-fairway budgets are normative. Water rendered blue and treated as fatal.

- [ ] **Step 5 Playability Validation:** For 100 random seeds, **zero** holes are unsolvable per `isHoleSolvable`: the fairway spine is traversable (no water/OB covering all spine samples), the first drive annulus (`tee` ring `0.7*maxDrive` to `maxDrive`) contains at least one fairway point not in water, and at least one `40px` corridor exists from tee to hole via fairway. Holes that fail validation are regenerated or water removed/widened until solvable (≤15 attempts).
- [ ] **Level 1-3 field progression retained:** L1 `sources:1,sinks:1,doublets:0,vortexes:0` source left edge `x==0` sink right edge `x==width` obstacles `0`; L2 `1,1,0,0` with `8` trees; L3 `1,1,0,1` with vortex inside, etc., per old progression table but with trees/water instead of rects.
- [ ] Calling `generateLevels(seed)` twice with same `seed` yields `JSON.stringify` equal 18 levels (including `terrain` and `obstacles`/`waterHazards`); different seed yields different `tee.y`/`hole.y`/`spine`/`terrain` for at least `≥50%` of levels.
- [ ] `src/main.js` on new game generates 18, sets `LEVELS = generateLevels(...)`, `currentHoleIndex=0`, `Hole: 1/18` HUD, and `loadLevel(0)` uses `LEVELS[0].field` and `terrain` to create field and draw terrain zones with correct colors.

## Dependencies
- REQ-003 (field superposition, edge sources/sinks, interior vortex/doublet, no unary)
- REQ-008 (circular tree obstacles, collision, Poisson spacing)
- REQ-009 (hole)
- REQ-012 (rendering — terrain zones drawn with specified greens/gray/blue, trees on top)
- REQ-014 (attempts, Hole N/M)
- REQ-030 (bottom canvas terrain rendering)

## Notes
- Generator sketch `src/levels.js:1` + `src/terrain.js:1`:
  ```js
  // Simplex noise with domain warping
  import { createNoise2D } from 'simplex-noise'; // or inline mulberry32-based noise, no external download per REQ-001 (vendor copy allowed)
  function mulberry32(seed){ /* ... */ }
  function simplexWarp(x,y, scale=0.008, strength=18, noise2D){
    const nx = noise2D(x*scale, y*scale);
    const ny = noise2D((x+431)*scale, (y-217)*scale);
    return {x: x + nx*strength, y: y + ny*strength};
  }
  function sdfToSpine(x,y, spine){
    let min=Infinity; for(let i=0;i<spine.length-1;i++){ min=Math.min(min, distToSegment(x,y, spine[i], spine[i+1])); } return min;
  }
  export function generateLevels(seed = Date.now(), count=18){
    const rand = mulberry32(seed);
    const levels=[];
    for(let i=0;i<count;i++){
      const levelNum=i+1;
      const tee={x:40+Math.floor(rand()*100), y: Math.floor(rand()*(LOGICAL_H-160))+80};
      const hole={x:LOGICAL_W-180+Math.floor(rand()*140), y: Math.floor(rand()*(LOGICAL_H-160))+80, radius:14};
      // Step 1: Bézier control points
      const mx = (tee.x+hole.x)/2, my=(tee.y+hole.y)/2;
      const perpAng = Math.atan2(hole.y-tee.y, hole.x-tee.x)+Math.PI/2;
      const offset = (rand()-0.5)*LOGICAL_W*0.15;
      const p1 = (levelNum%3===0)? {x: mx+Math.cos(perpAng)*offset, y: my+Math.sin(perpAng)*offset} : null;
      const p2 = (levelNum%4===0)? {x: mx+Math.cos(perpAng)*offset*0.6, y: my+Math.sin(perpAng)*offset*0.6} : null;
      const spine = sampleBezier(tee, p1, p2, hole); // 50 points
      const Wf = 90 + Math.floor(rand()*50) + Math.floor(levelNum/3)*5; // 90-140, widen later
      const Wr = Wf + 60 + Math.floor(rand()*40);
      const noiseSeed = seed + i*7919;
      // Step 4: water clusters via Cellular Automata near fairway edge
      const waterHazards = (rand()<0.4)? generateWaterClusters(spine, Wf, rand, noiseSeed) : [];
      // Step 4: trees via Poisson in rough/OB
      const treeCount = Math.min(22, 8 + Math.floor((levelNum-1)/2)*2);
      const obstacles = generateTreesPoisson(treeCount, spine, Wf, Wr, tee, hole, waterHazards, rand);
      // Step 3 warping is applied at render/query time via simplexWarp, not baked into obstacles
      // Step 5 validation
      let attempts=0;
      while(attempts<15 && !isHoleSolvable(tee,hole,spine,Wf,waterHazards,obstacles)){
        // widen or remove water
        if(waterHazards.length) waterHazards.pop(); else Wf+=15;
        attempts++;
      }
      // field progression (old)
      let sources=1, sinks=1, doublets=0, vortexes=0;
      if(levelNum>=3) vortexes=1;
      if(levelNum>=5) doublets=1;
      // ... etc
      let strength = levelNum<=6? 80+(levelNum-1)*5 : 105+Math.floor((levelNum-6)/2)*2;
      if(strength>125) strength=125;
      levels.push({id:`hole-${levelNum}`, name:`Hole ${levelNum}`, canvas:{width:LOGICAL_W,height:LOGICAL_H}, tee, hole, obstacles, waterHazards, terrain:{green:{x:hole.x,y:hole.y,r:75}, teeBox:{x:tee.x,y:tee.y,r:80}, fairwayPath:spine, widthFairway:Wf, widthRough:Wr, noiseSeed}, field:{cols:32,rows:18,strength, seed: seed + i*9973 + levelNum*101, sources, sinks, doublets, vortexes}});
    }
    return levels;
  }
  ```
- Colors reference for tests (tolerance ±8 per channel):
  - Green light: `#A8E6A3` `rgb(168,230,163)`
  - Fairway: `#6BC96E` `rgb(107,201,110)` (or `#7AC87A`)
  - Rough: `#3D8B3D` `rgb(61,139,61)` (or `#4A9F4A`)
  - OB gray: `#2E2E2E` `rgb(46,46,46)` (gray, saturation <20, luminance <35)
  - Water blue: `#4A90E2` `rgb(74,144,226)` (hue 210±10, sat >50)
- Tree rendering: `type:'circle'` with `r=18-36`, trunk `#6B3A2A`, canopy `#1E7A34` per REQ-008, placed only where `terrainZoneAt` is `rough`/`ob`.

## File Paths
- `src/levels.js:1` (generateLevels, LEVELS 18, tee left/hole right random height, field progression, terrain via 5-step pipeline, obstacles as circular trees)
- `src/terrain.js:1` (NEW: SDF, domain-warped noise, terrainZoneAt, isHoleSolvable, water/terrain helpers)
- `src/main.js:1` (calls generateLevels on new game, uses LEVELS.length 18)
- `src/vectorField.js:1` (field creation per level, edge/inside constraints)
- `src/render.js:1` (drawTerrainZones with specified greens/gray/blue, drawObstacles for circular trees)
