# 08 — Level Generation (Levels, Terrain Pipeline & Difficulty)

- **ID:** 08-level-generation
- **Supersedes:** REQ-010, REQ-033, REQ-034
- **Type:** Procedural Generation / Balancing
- **References:** `02-canvas-system.md` (logical size), `03-rendering.md` (palette), `04-physics-and-collision.md` (obstacles/water fatal), `06-wind-system.md` (field placement per difficulty)

## 1. Entry Point `src/levels.js` / `src/terrain.js`

- Export `LEVELS: Level[]` and `generateLevels(seed?:number, count?:3|6|9|18, options?:{difficulty?:'easy'|'medium'|'hard'}): Level[]` (aliases `createLevels`/`generateProceduralLevels` allowed). `src/main.js` calls it via `generateCourse` on every new-game start (`startNewGameFromMain`, `resetGameAfterWin`, initial load with no save) **before** `loadLevel(0)`.
- `count` must be `3`, `6`, `9` or `18` (see `10-persistence-and-menus.md` for course holeCount). Seed is `Date.now()` / `Math.random()*1e9` for fresh games or `?seed=` for debug; generation is deterministic for same seed+count(+difficulty).
- After generation `LEVELS.length === count` and `LEVELS[i].id === "hole-1"…"hole-count"`:

```js
{
  id:"hole-1"…, name:"Hole N",
  canvas:{width:LOGICAL_W,height:LOGICAL_H}, // 16:9 per 02
  tee:{x:number,y:number}, hole:{x,y,radius:14},
  obstacles:Array<{type:'circle',x,y,r}>, // trees, r 18-36, see §4
  waterHazards:Array<{x,y,w,h}|{x,y,r}>,   // blue clusters, see §4
  terrain:{ green:{x,y,r}, teeBox:{x,y,r}, fairwayPath:Array<{x,y}>, widthFairway:number, widthRough:number, noiseSeed:number },
  field:{ cols:32,rows:18,strength:number,seed:number,sources,sinks,doublets,vortexes }, // per §5
  difficulty:{ shape:'I'|'L'|'V'|'U'|'S'|'Z', shapeTier:0|1|2, fieldComponents:number, treesOnFairway:number, waterOnFairway:number, tier:'easy'|'medium'|'hard', score:number }
}
```
Legacy `rect` obstacles are deprecated for newly generated levels (all trees are `type:'circle'`). No hand-written `LEVELS` fallback as source of truth; any `STATIC_LEVELS` is for tests only and overwritten.

## 2. Tee / Hole Placement

- `tee.x∈[40,180]` (left side), `hole.x∈[LOGICAL_W-180, LOGICAL_W-40]` (right side), guarantee `hole.x - tee.x ≥ LOGICAL_W*0.6` (≥768 at 1280).
- `tee.y`/`hole.y` sampled independently via seeded PRNG `rand()*(LOGICAL_H-160)+80` → `y∈[80,LOGICAL_H-80]`; ≥10 distinct values across 18 holes; deterministic for same seed.

## 3. Five-Step Pipeline (normative)

### Step 1 — Layout & Pathing (Bézier or directed A*)

For each hole: pick `tee`/`hole` per §2, place 1-2 control points between them with **tier-dependent larger bends — toned down from loopback**:

- **Easy `I`**: no control point or offset `<15px` (straight), max deviation from `tee→hole` `<30` and total angular change `<15°`, axis-aligned `±15°` of horizontal/vertical. `W_fairway` is baseline `90-140` (see Step 2), not tightened.
- **Medium `L/V/U` with larger bends and more hard L**: `L` **50% of medium** with hard 90° edge — `125-175` single offset (toned down from `140-200`), often placed at L-corner `(hole.x,tee.y)` or `(tee.x,hole.y)` for sharp edge; `V` `105-150`; `U` `135-185` same-side. Still ~1.8× legacy (`60-100`), giving harder edges but not extreme.
- **Hard `S/Z` larger but NOT bending back over itself**: `S/Z` two opposite-side offsets `155-220` with `longFactor 0.24-0.32` (was `115-170` legacy, now larger but toned down from `320-430` loopback). Both controls stay **between** tee/hole (`mx ± dx*longFactor` inside, clamped `30-1250/30-690`), so centerline is continuous without backtrack, still with strong inflection (`maxDev 60-90`).

Sample ~50 spine points along quadratic/cubic Bézier `t∈[0,1] step 0.02` via `getBezierPoint(t,p0,p1,p2[,p3])` (directed A* grid with lateral random cost is also allowed if comparable dog-leg). Result `terrain.fairwayPath` is continuous, non-self-intersecting, endpoints within `60` of `tee`/`hole`.

### Step 2 — Distance Field & Masking (SDF / Euclidean)

Compute `d` from any `(x,y)` to spine (min `distToSegment` over spine segments) and tee/green circular masks (`r 70-90` for TeeBox, `60-90` for Green):

```
if inGreenMask(x,y,hole)||inTeeMask(x,y,tee) → 'green'/'teeBox'
else if d ≤ W_fairway → 'fairway'
else if d ≤ W_rough → 'rough'
else → 'ob'
```

- `W_fairway ∈ [80,140]` (base `110±rand*30`, widening slightly with `levelNum`), `W_rough = W_fairway + [60,100]` (base `+80`), stored per level. **Hard tighter fairway**: `W_fairway_hard = clamp(W_fairway_baseline - (15+rand()*10), 70, 140)` (15-25 smaller than easy/medium at same index; hard avg ≥12 smaller than easy; `W_rough` scales proportionally).
- Export `terrainZoneAt(x,y, level)` (or `(x,y, spine, Wf, Wr, warpedDist)` per `03-rendering.md` palette mapping) for generation+validation+rendering.

### Step 3 — Domain-Warped Noise

Warp coordinates before SDF thresholding:

```js
warpedDist(x,y, spine, warpScale=0.008, warpStrength=18){
  const nx=simplexNoise(x*warpScale,y*warpScale); // [-1,1]
  const ny=simplexNoise((x+431)*warpScale,(y-217)*warpScale);
  return sdfDistance(x+nx*warpStrength, y+ny*warpStrength, spine);
}
```
`warpScale 0.006-0.012` (base `0.008`), `warpStrength 12-24` (base `18`), `noiseSeed = baseSeed + i*7919` per hole → deterministic. Boundaries wobble vs unwarped capsule by `≥8 RMS ≤35 max` (sample 100 boundary points).

### Step 4 — Hazards & Trees (Cellular Automata for water, Poisson Disc for trees)

- **Water blue clusters** (rendered per `03-rendering.md`, fatal per `04-physics-and-collision.md` — bigger, never overlap tee/green): small clusters via Cellular Automata (`8×8` grid, `fill 0.42`, 4 smoothing iters) or thresholded Perlin (`>0.6`), partly **on fairway per difficulty** (see §6) with centre `d ≤ W_fairway-10` strictly on fairway (see §6), area **`2000-6000px²` as rect `w×h` or `r 28-48`** (was `800-3000`/`18-32`, now bigger), stored `waterHazards`. **Water SHALL NOT overlap tee or green**: `dist(water,tee) ≥ teeBox.r + r +10` and `dist(water,hole) ≥ green.r + r +10` (early coarse `<80` plus strict `green.r+ r +10`). Never completely block fairway (see Step 5).
- **Trees** (`type:'circle' r 18-36`, trunk `#6B3A2A` canopy `#1E7A34`): partly **on fairway** per tier (see §6) with `treesOnFairway` strictly on fairway (`terrainZoneAt==='fairway'` and `d ≤ W_fairway-4` not in Green/Tee mask). **Fairway trees SHALL be placed at least one third of the distance between tee and green from the tee**: for each fairway tree `hypot(tree.x - tee.x, tree.y - tee.y) ≥ dist(tee,hole)/3` (Euclidean; `dist(tee,hole)=hypot(hole.x-tee.x, hole.y-tee.y)`). This applies to every counted `treesOnFairway`; sampling that fails the ≥1/3 rule is rejected and re-sampled. All fairway trees still respect `≥40` clearance from tee/green masks (`teeBox.r+40+r`, `green.r+40+r`) and `≥ r1+r2+6` between trees (Poisson Bridson `minDist 45±15 k=30`, controls clamped to `30-1250/30-690` to keep fairway inside canvas despite extreme S bends).
- **Non-fairway trees (rough-border trees)**: any trees **not** counted in `treesOnFairway` (extras for aesthetics/bounce) **SHALL be placed on the rough, spread around the border between rough and out of bounds** so the player can bounce on them (see `04-physics-and-collision.md` §5 bounce). Concretely they SHALL satisfy `terrainZoneAt==='rough'` **and** `d ∈ [W_rough - 25, W_rough - 4]` (i.e. within `~20px` inside the rough side of the `W_rough` transition; `d = warpedDist(x,y)` per Step 2, so `W_rough - 25 ≤ d ≤ W_rough - 4`). Placement is via rejection sampling constrained to that annulus around the warped fairway border; `≥40` clearance from tee/green masks and `≥ r1+r2+6` between trees still applies. The set is spread (Poisson `minDist 45±15`, `k=30`) around the entire perimeter of the rough/OB border, not clustered on one side, to give bounce opportunities against the OB wall from multiple approach angles. Trees SHALL NOT be placed strictly in OB (`d > W_rough`) — extras are **rough-border only** (`rough` zone, near OB edge), not deep OB or deep rough. Total extras may be `0-10` (overall total with `treesOnFairway` typically `5-15`) but normative counts remain `treesOnFairway` per tier; extras are optional for bounce strategy and shall not violate validation.

### Step 5 — Validation (Raycasting / A* Shot Simulation)

Use `maxDrive = LOGICAL_W*0.55` (~700 at 1280, range `600-750`):

1. Spine traversable: sample `t=0,0.25,0.5,0.75,1.0` along spine each not `water` nor `ob`.
2. First-drive annulus `tee` ring `[0.7*maxDrive, maxDrive]` contains at least one `fairway` not water.
3. At least one `40px` corridor tee→hole via fairway (A* on walkable `fairway`/`rough` grid or raycast corridors).

If fail, regenerate hole (new control points/noise/hazards) ≤15 attempts until solvable; else remove offending water cluster or widen `W_fairway+=15` and re-validate. Deterministic for same seed.

## 4. Integration & Determinism

- `generateLevels` runs Steps 1-5 per hole; `generateTerrain(seed,tee,hole,spine,Wf,Wr)` may be factored in `src/terrain.js` exporting `sdfToSpine`, `warpedDist`, `terrainZoneAt`, `isHoleSolvable`, `generateWaterClusters`, `generateTreesPoisson`, noise helpers.
- Vendor `simplex-noise` may be vendored in `src/vendor/` per `01-infrastructure.md`.

## 5. Difficulty & Field Budgets (normative per-tier)

See also `06-wind-system.md` §1.3 for per-difficulty field placement with outside `20-60px` and flipped/extra logic.

| Tier    | Shape                | `treesOnFairway` | `waterOnFairway` | Field `sources,sinks,doublets,vortexes` (incl. mandatory outside 20-60) |
|---------|----------------------|------------------|------------------|-------------------------------------------------------------------------|
| **Easy**   | `I` (straight, `<15` off) | `1-2`            | `0`              | `1,1,1,0` (total 3) — source slightly outside near tee (`≤180+OUTSIDE`), sink slightly outside a **free** edge **not** closest to green nor source edge (outside), one doublet on fairway and **in a fairway tree ≤2px** if trees≥1 |
| **Medium** | `L/V/U` bigger `>45`      | `2-3`            | `1`              | `sources=1` near tee outside + `sinks=1` free-edge outside (not green) **plus maybe extra sink free-edge outside also not green** (`rand<0.6`, ≥30% have `sinks=2` both free-edges not green, outside) + `doublets 2-3` + `vortexes 1` (total 5-6 or 6-7 with extra sink) — ≥1 doublet in fairway tree |
| **Hard**   | `S/Z` even bigger `>55`, tighter `W_fairway` `-15-25` | `3-5`            | `1-3`            | `sources=2,sinks=2` **slightly outside on two free edges plus primary**: **flipped** (≥50% of hard when sampling 100 hard) sink outside near tee + source outside near green plus extra pair on two free edges; **non-flipped** also has `2,2` all outside via extra pair on free edges. `doublets 3-4` + `vortexes 1-2` (total 7-10 with extra, 6-8 without) — ≥1 doublet in tree (up to 2 if ≥3 trees) |

- **Doublet-in-tree rule**: if `treesOnFairway≥1` then at least one doublet satisfies `hypot(doublet-tree) ≤2`. Remaining doublets/vortexes interior `20` from edge (`≥15` for hard) and not `OB` (`fairway` or `rough`).
- **Source/sink outside 20-60** for every tier (no edge-only `x==0`; no inside). `OUTSIDE=20-60` sampled per placement (`30+rand*20`).
- **Tier assignment**: for `count` `6`/`9`/`18` the generator picks tier **linearly** `tier = floor((levelNum-1)/count*3)` → `0 easy,1 medium,2 hard` so hole 1 is `easy`, last is `hard` (`18: 1-6 easy,7-12 medium,13-18 hard`; `9: 1-3 easy,4-6 medium,7-9 hard`; `6: 1-2 easy,3-4 medium,5-6 hard`). For `3` with `options.difficulty`, **all holes uniform** `tier===difficulty` (`I` respectively `L/V/U` respectively `S/Z`). `level.difficulty = {shape,shapeTier,fieldComponents,treesOnFairway,waterOnFairway,tier,score}` where `score = shapeTier+fieldTier+treeTier+waterTier` (0-8, monotonic).

## 6. Hole Count & Course Wrapper

- Variable `count` via `10-persistence-and-menus.md` `generateCourse(holeCount)`. `LEVELS` after generation equals `activeCourse.holes`.

## Acceptance Criteria

- [ ] `generateLevels(seed,count)` length `count`; `tee` left/`hole` right with `≥10` distinct `y`; `fairwayPath≥20` pts, endpoints `≤60` from tee/hole.
- [ ] `terrainZoneAt` returns Green at hole, Fairway at `tee+40` along spine, Rough at `W_fairway+30`, OB at `W_rough+40` per `03-rendering.md` colors; water blue; no wrong palette.
- [ ] Warping deviates `≥8 RMS ≤35 max`; same seed identical, different seed differs for ≥50% holes.
- [ ] `treesOnFairway`/`waterOnFairway` per tier budgets enforced; no hard has `0` water on fairway; hard `W_fairway` avg ≥12 smaller than easy; shapes: ≥15% each `I`/`L/V/U`/`S/Z` over 100 holes with bigger bends per §3.
- [ ] **Fairway trees ≥1/3 from tee**: for every generated level, every `treesOnFairway` tree satisfies `hypot(tree.x-tee.x, tree.y-tee.y) ≥ dist(tee,hole)/3` (within `±1px` tolerance) and `terrainZoneAt==='fairway'` with `≥40` clearance from tee/green masks and not in Green/Tee mask. No fairway tree is within `dist/3` of the tee.
- [ ] **Rough-border trees**: every non-fairway tree (extras beyond `treesOnFairway`) satisfies `terrainZoneAt==='rough'` and `warpedDist ∈ [W_rough-25, W_rough-4]` (rough side of the rough/OB border, `±2px` tolerance), `≥40` clearance from tee/green masks, `≥ r1+r2+6` between trees, and is spread (over 100 samples `stddev` of angular position around spine center > 60° and not all within one quadrant). No non-fairway tree is in `fairway`/`green`/`teeBox` or strictly in `ob` (`d>W_rough`).
- [ ] Every hard flipped has `sources=2,sinks=2` all `20-60` outside; medium never places sink on green-closest edge; sources/sinks never exactly on edge; ≥1 doublet in fairway tree when `trees≥1` (doublet `≤2px` from a fairway tree that itself satisfies the ≥1/3 rule).
- [ ] 100 random seeds → 0 unsolvable holes (`isHoleSolvable` spine + first-drive ring + corridor).

## File Paths

- `src/levels.js:1` (`LEVELS`, `generateLevels`, field per-tier logic)
- `src/terrain.js:1` (`sdfToSpine`, `warpedDist`, `terrainZoneAt`, `isHoleSolvable`, `generateWaterClusters`, `generateTreesPoisson`, noise)
- `src/vectorField.js:1` (field placement per difficulty, see `06-wind-system.md`)
