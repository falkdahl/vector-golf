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
  treasure:{x:number,y:number,radius:12, isCollected:boolean, nearTreeId:number}, // exactly one per hole near a tree, see §4
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

- **Treasure (one per hole, near a tree)**: each hole SHALL have exactly one `treasure = {x:number,y:number,radius:12, isCollected:false, nearTreeId:number}` (radius `10-14`, default `12`, gold chest/star, see `03-rendering.md` & `09` §3). Placement is deterministic via seeded `mulberry32(baseSeed + i*7919 + 977)` per hole: pick a random tree from `obstacles` (prefer `treesOnFairway` if available, else any tree; use `rand()` to pick index), then sample position at polar offset `dist = tree.r + treasure.radius + 8 + rand()*18` (`18-42px` from tree edge, i.e. `12-45px` from tree center edge) and `angle = rand()*2π`. The candidate must satisfy: `!overlaps any tree` (`hypot(cand - t) >= t.r + treasure.radius + 4` for all trees), `!in water` (not inside any `waterHazards` rect/circle inflated by `4px`), `!in green/tee` (`dist(hole,cand) >= green.r + treasure.radius + 20` and `dist(tee,cand) >= teeBox.r + treasure.radius + 20`), zone is `fairway` or `rough` (`terrainZoneAt(cand)==='fairway' || 'rough'`), not `ob`/`water`, and at least `30px` inside canvas (`12 ≤ x ≤ LOGICAL_W-12`). If candidate fails any check, resample up to `60` attempts (new angle/dist or new tree); if still fails, fallback to point `30px` from same tree along direction to hole center clamped to `fairway`. Treasure is stored on the level and rendered via `drawTreasure` (see `03-rendering.md`); it does not block movement or affect `isHoleSolvable` (collision ignored for validation). `isCollected` starts `false` and flips to `true` on first ball hit (see `04` §6 & `09` §3). Deterministic for same seed; different seed gives different tree/angle for ≥50% holes.

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

See also `06-wind-system.md` §1.3 for per-difficulty field placement with outside `20-60px`.

| Tier    | Shape                | `treesOnFairway` | `waterOnFairway` | Field `sources,sinks,doublets,vortexes` (incl. mandatory outside) |
|---------|----------------------|------------------|------------------|-------------------------------------------------------------------------|
| **Easy**   | `I` (straight, `<15` off) | `2-4`            | `0`              | `1,1,1,0` (total 3) — **source slightly outside left third** (`x = -OUTSIDE`, `OUTSIDE 20-60`, left edge) and **sink slightly above top edge (`y=-OUTSIDE_SINK`) or below bottom edge (`y=H+OUTSIDE_SINK`) on right third (`x∈[2*W/3,W]`, `OUTSIDE_SINK 60-100` increased distance)** — no head wind (tail wind left→right), one doublet on fairway and **in a fairway tree ≤2px** if trees≥1. **Wind strength constant** (not scaling with difficulty, see `06` §1.4) |
| **Medium** | `L/V/U` bigger `>45`      | `2-3`            | `1-2`            | `2,1,2,1` (total 6) — `sources=2` (one near tee outside `OUTSIDE 20-60` + **one extra source randomly outside canvas edge `OUTSIDE 20-60` but not too close to existing source and sink (`dist>180`)**) + sink 1 slightly above top or below bottom on right third (`x∈[2*W/3,W]`, `y=-OUTSIDE_SINK` or `H+OUTSIDE_SINK`, `OUTSIDE_SINK 60-100` increased, `rand()<0.5` top/bottom) — **extra source added**, `doublets=2` fixed + `vortexes 1` — ≥1 doublet in fairway tree. **Wind strength constant** same as easy/hard |
| **Hard**   | `S/Z` even bigger `>55`, tighter `W_fairway` `-15-25` | `3-5`            | `1-2`            | `1,1,3,1` (total 6) — `sources=1` near tee outside (`OUTSIDE 20-60`) + **sink 1 slightly above top or below bottom on right third (`x∈[2*W/3,W]`, `y=-OUTSIDE_SINK` or `H+OUTSIDE_SINK`, `OUTSIDE_SINK 60-100`)** — **no extra sink/source** (removed, always `1,1` not `2,2`), `doublets=3` fixed + `vortexes 1` — ≥1 doublet in tree (up to 2 if ≥3 trees). **Wind strength constant** same as easy/medium |

- **Doublet-in-tree rule**: if `treesOnFairway≥1` then at least one doublet satisfies `hypot(doublet-tree) ≤2`. Remaining doublets/vortexes interior `20` from edge (`≥15` for hard) and not `OB` (`fairway` or `rough`).
- **Source outside `20-60` / sink outside `60-100` (increased distance)** — sources use `OUTSIDE=20-60` (`30+rand*20`), sinks use `OUTSIDE_SINK=60-100` (`60+rand*41`) for increased gap to canvas edge. **Easy** source is always `x=-OUTSIDE` (left edge, left third). **Every level has at least one sink** (`sinks=1`) placed **slightly above upper edge (`y=-OUTSIDE_SINK`) or slightly below lower edge (`y=H+OUTSIDE_SINK`) on right third (`x∈[2*W/3,W]`)**, `rand()<0.5` top vs bottom, `OUTSIDE_SINK 60-100` — guarantees `sink.x>2*W/3` and `sink.y∈[-100,-60]` or `[780,820]` at `W=1280,H=720` (right-third top/bottom, increased distance).
- **Tier assignment — explicit pacing progression (supersedes linear)**:
  - `3`-hole course: **all easy** → `[E,E,E]` ( `options.difficulty` for `3` is ignored; `3` is always `easy` uniform `I` ).
  - `6`-hole course: `[E,E,M,M,E,M]` ( `2×Easy-2×Medium-1×Easy-1×Medium` ) → `levelNum 1:E,2:E,3:M,4:M,5:E,6:M`
  - `9`-hole course: `[E,M,M,E,M,M,M,E,H]` ( `1×Easy-2×Medium-1×Easy-3×Medium-1×Easy-1×Hard` ) → `1:E,2:M,3:M,4:E,5:M,6:M,7:M,8:E,9:H`
  - `18`-hole course: **two × 9-hole progression** → `[E,M,M,E,M,M,M,E,H, E,M,M,E,M,M,M,E,H]` (first 9 same as 9-hole, next 9 repeats)
  - `level.difficulty = {shape,shapeTier,fieldComponents,treesOnFairway,waterOnFairway,tier,score}` where `score = shapeTier+fieldTier+treeTier+waterTier` (0-8, monotonic). Field strength is **constant** (not scaling with `tier` or `levelNum`).

## 6. Hole Count & Course Wrapper

- Variable `count` via `10-persistence-and-menus.md` `generateCourse(holeCount)`. `LEVELS` after generation equals `activeCourse.holes`.

## Acceptance Criteria

- [ ] `generateLevels(seed,count)` length `count`; `tee` left/`hole` right with `≥10` distinct `y`; `fairwayPath≥20` pts, endpoints `≤60` from tee/hole.
- [ ] `terrainZoneAt` returns Green at hole, Fairway at `tee+40` along spine, Rough at `W_fairway+30`, OB at `W_rough+40` per `03-rendering.md` colors; water blue; no wrong palette.
- [ ] Warping deviates `≥8 RMS ≤35 max`; same seed identical, different seed differs for ≥50% holes.
- [ ] `treesOnFairway`/`waterOnFairway` per tier budgets enforced; **pacing progression enforced**: `3`-hole all `easy`, `6`-hole `E,E,M,M,E,M`, `9`-hole `E,M,M,E,M,M,M,E,H`, `18`-hole `9×2`; **easy `treesOnFairway` 2-4** (not 1-2), medium 2-3, hard 3-5; no hard has `0` water on fairway; `waterOnFairway` now `0` for easy, `1-2` for medium/hard (not `1` fixed / `1-3`); hard `W_fairway` avg ≥12 smaller than easy; shapes per progression with bigger bends per §3.
- [ ] **Fairway trees ≥1/3 from tee**: for every generated level, every `treesOnFairway` tree satisfies `hypot(tree.x-tee.x, tree.y-tee.y) ≥ dist(tee,hole)/3` (within `±1px` tolerance) and `terrainZoneAt==='fairway'` with `≥40` clearance from tee/green masks and not in Green/Tee mask. No fairway tree is within `dist/3` of the tee.
- [ ] **Rough-border trees**: every non-fairway tree (extras beyond `treesOnFairway`) satisfies `terrainZoneAt==='rough'` and `warpedDist ∈ [W_rough-25, W_rough-4]` (rough side of the rough/OB border, `±2px` tolerance), `≥40` clearance from tee/green masks, `≥ r1+r2+6` between trees, and is spread (over 100 samples `stddev` of angular position around spine center > 60° and not all within one quadrant). No non-fairway tree is in `fairway`/`green`/`teeBox` or strictly in `ob` (`d>W_rough`).
- [ ] **Treasure near tree**: every level has exactly one `treasure` (`x,y,radius 10-14, isCollected false` initially) with `12 ≤ x ≤ LOGICAL_W-12` and `12 ≤ y ≤ LOGICAL_H-12`, `hypot(treasure - nearestTree) ∈ [tree.r+8+treasure.r, tree.r+28+treasure.r]` (i.e. `18-42px` from tree edge, within `±2px`), nearest tree is a generated tree (`dist < 60`), `treasure` not overlapping any tree (`>= tree.r + treasure.r +4`), not in water/green/tee (`dist(hole) >= green.r+20`, `dist(tee)>= teeBox.r+20`), zone `fairway`/`rough` (not `ob`/`water`), and deterministic for same seed (same `x,y` within `1px` for same `seed+holeIndex`).
- [ ] **Every level has at least one sink on right-third top/bottom (increased distance) + medium extra source**: every level `sinks=1` at `x∈[2*W/3,W]` (`W=1280 → x∈[853,1280]`) and `y=-OUTSIDE_SINK` (`OUTSIDE_SINK 60-100`, `y∈[-100,-60]`) or `y=H+OUTSIDE_SINK` (`y∈[780,820]`), increased distance outside (never strictly inside, never exactly on edge `x==0` or `y==0` within `1px`); **easy `sources=1` at `x=-OUTSIDE` (`OUTSIDE 20-60`, `x<0`, left third) + `treesOnFairway` 2-4**; **medium `sources=2` (one near tee outside `OUTSIDE 20-60` + one extra randomly outside `OUTSIDE 20-60` with `dist>180` from existing source and sink)**; hard `sources=1` near tee outside (`OUTSIDE 20-60`, closest edge), `sinks` never `2` (medium now `2` sources), sources/sinks never exactly on edge; ≥1 doublet in fairway tree when `trees≥1` (doublet `≤2px` from a fairway tree that itself satisfies the ≥1/3 rule); **wind strength constant** across tiers (no scaling `80→125`, same `field.strength` for all).
- [ ] 100 random seeds → 0 unsolvable holes (`isHoleSolvable` spine + first-drive ring + corridor).

## File Paths

- `src/levels.js:1` (`LEVELS`, `generateLevels`, field per-tier logic)
- `src/terrain.js:1` (`sdfToSpine`, `warpedDist`, `terrainZoneAt`, `isHoleSolvable`, `generateWaterClusters`, `generateTreesPoisson`, noise)
- `src/vectorField.js:1` (field placement per difficulty, see `06-wind-system.md`)
