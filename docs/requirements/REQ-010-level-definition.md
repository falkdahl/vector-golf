# REQ-010: Level Definition (Multi-Hole) — Procedural 18 Levels with Increasing Difficulty

- **ID:** REQ-010
- **Title:** Level Definition — Procedural 18 Holes, Tee Left / Hole Right, Random Height, Increasing Difficulty
- **Priority:** Must Have
- **Type:** Data / Functional
- **Status:** Draft
- **Related Plan Section:** levels.js, Architecture File Structure

## Description
On start of a **new game**, the game SHALL **procedurally generate exactly 18 levels (holes)** with **monotonically increasing difficulty**. Generation is deterministic via a seed and SHALL be performed in `src/levels.js` (e.g., `generateLevels(seed, count=18)` or `createProceduralLevels()` called from `src/main.js` on new game). Each generated level SHALL have `tee` on the **left side** of the map and `hole` on the **right side** with **random height** placement, and SHALL define `field` and `obstacles` per the progression below. The static `LEVELS` array, if kept for backwards compat, SHALL be replaced or overwritten by the generated 18 at runtime; `LEVELS.length` SHALL be `18` after generation.

## Rationale
18 holes gives a full round with clear progression. Tee left / hole right guarantees the primary shot is left-to-right and requires wind-aware routing. Random height per hole prevents memorization and forces re-aiming. Starting with a single source (left edge) + sink (right edge) teaches the wind mechanic; adding obstacles then vortex introduces complexity stepwise; thereafter adding obstacles and field components steadily raises challenge without sudden spikes. Procedural generation from a seed keeps every new game fresh but reproducible.

## Requirements

1. **Generation entry point in `src/levels.js`**:
   - SHALL export `LEVELS: Level[]` (length `18` after generation) and a function `generateLevels(seed?: number, count?: number): Level[]` (or `createLevels`, `generateProceduralLevels`) that (re)creates the 18 levels. `src/main.js` SHALL call this on **new game start** (`startNewGame()`, `startNewGameFromMain()`, `resetGameAfterWin()`, and initial load with no save) before `loadLevel(0)`. The seed MAY be `Date.now()` or `Math.floor(Math.random()*1e9)` for fresh games, or a fixed debug seed if `?seed=` is present; generation MUST be deterministic for a given seed (same PRNG sequence yields same 18).
   - `LEVELS` after generation SHALL have `length === 18`, each element as:
      ```js
      {
        id: "hole-1" … "hole-18",
        name: `Hole ${i+1}`,
        canvas: {width:LOGICAL_W, height:LOGICAL_H}, // 16:9 e.g., 1280×720 per REQ-002/REQ-030, not 900×600
        tee: {x:number, y:number},
        hole: {x:number, y:number, radius:14},
        obstacles: Array<{type:'rect',x,y,w,h} | {type:'circle',x,y,r}>,
        field: {cols:32, rows:18, strength:number, seed:number, sources:number, sinks:number, doublets:number, vortexes:number} // 32×18 for 1280×720 square cells; 20×15 legacy tolerated if scaled to 16:9
      }
      ```
      `LOGICAL_W×LOGICAL_H` SHALL be 16:9 (`1280×720` default per REQ-002/REQ-030, `width/height=1.777`). All `tee.x/hole.x/y` ranges SHALL be scaled to this logical size (see §2).

2. **Tee left / hole right, random height** (scaled to 16:9 logical per REQ-002/REQ-030, e.g., `LOGICAL_W=1280, LOGICAL_H=720`):
    - For every level `i`, `tee.x ∈ [40, 180]` scaled to `LOGICAL_W` (e.g., `≈3-14%` of W, default `≈80` at 1280) on left side and `hole.x ∈ [LOGICAL_W-180, LOGICAL_W-40]` on right side, guaranteeing `hole.x - tee.x ≥ LOGICAL_W*0.6` (e.g., `≥ 768` at `1280`). Legacy `40,140 / 760,860` for `900×600` SHALL be mapped proportionally to new `W`.
    - `tee.y` and `hole.y` SHALL be sampled **randomly** per hole via the seeded PRNG (`rand()*(LOGICAL_H-160)+80`, i.e., `y∈[80, LOGICAL_H-80]` with `20px` margin from top/bottom), **deterministically** from the generation seed (so same seed → same heights). The two heights MAY be independent (different `rand()` calls) to create varied up/down shots.
    - No hard-coded `y` (e.g., `300`) for all holes; heights MUST vary across the 18 (verify at least `≥10` distinct `tee.y` and `≥10` distinct `hole.y` values).

3. **Field progression — sources/sinks/doublets/vortexes per REQ-003** (edge sources/sinks, interior vortex/doublet, no unary):
   - **Level 1 (hole-1)**: `field = {cols:20, rows:15, strength:80-90, seed, sources:1, sinks:1, doublets:0, vortexes:0}` with the single source **exactly on the left edge** (`x==0`, `y∈[0,height]` sampled uniformly along left side) and the single sink **exactly on the right edge** (`x==width`, `y∈[0,height]`). This satisfies REQ-003 mandatory edge + no interior vortex/doublet is coerced, but for level 1 the coercion SHALL be **overridden** to allow `0` vortex/doublet so the first field is just source→sink cross-breeze for tutorial. If the generic `createField` would coerce a vortex, level 1 SHALL explicitly pass `0,0` and the generator SHALL bypass the coercion for this level (or the field SHALL be documented as the single exception with `0` interior).
   - **Level 2 (hole-2)**: Same field as level 1 (`1` source left edge, `1` sink right edge, `0` vortex/doublet) **plus exactly 2 obstacles** (see §4). Field unchanged to isolate obstacle introduction.
   - **Level 3 (hole-3)**: Add **one vortex inside** (strictly interior, `20≤x≤width-20, 20≤y≤height-20`) to the level 2 field: `sources:1, sinks:1, doublets:0, vortexes:1`. Obstacles remain `2` (or carry over). This introduces rotation.
   - **Levels 4-18**: Difficulty SHALL **monotonically increase** by adding **more obstacles and/or more field components** each level, never decreasing. At least one of the two SHALL increase strictly every level, and over any 3-level window the sum `obstacles.length + (sources+sinks+doublets+vortexes)` SHALL increase by `≥2`. Suggested progression (tunable but MUST be documented and enforced in tests):
      ```
      L1: 0 obs, 2 comps (1+1+0+0)
      L2: 2 obs, 2 comps
      L3: 2 obs, 3 comps (add vortex)
      L4: 4 obs, 3 comps
      L5: 4 obs, 4 comps (add doublet)
      L6: 6 obs, 4 comps
      L7: 6 obs, 5 comps (add source)
      L8: 8 obs, 6 comps (add sink)
      L9: 8 obs, 7 comps (add vortex)
      L10:10 obs, 7 comps
      L11:10 obs, 8 comps (add doublet)
      L12:12 obs, 8 comps
      ... up to L18: 12 obs, 9-11 comps (capped at 12)
      ```
      Concrete rule: `obstacles.length = min(12, 2 * Math.floor((level-1)/2))` for `level≥2` (0,2,2,4,4,6,6,8,8,10,10,12,12…) capped at **12**, and `field components` increase by `1` every 2 levels starting at `L3`, alternating `vortex, doublet, source, sink, vortex...` until `≤10` total. `strength` MAY increase slightly (`80→125` over 18) to reflect stronger winds later, but MUST stay `80-125`.
   - Every generated field SHALL still satisfy REQ-003: at least one source at edge, one sink at edge, and (except level 1-2) at least one vortex/doublet inside; edge sources/sinks exactly on edge (`x==0||x==width||y==0||y==height`), interior vortex/doublet strictly inside with `20px` margin. `createField` coercion SHALL guarantee this even if counts would otherwise be zero.

4. **Obstacles progression — vertical first, then circular/horizontal, two at a time, max 6 squares**:
   - Obstacles SHALL be `rect` (`x,y,w,h`) — sub-typed as **vertical** (`w==20, h∈[80,220]`) or **horizontal** (`w∈[80,220], h==20`) — collectively called **square obstacles** (brick walls) — or `circle` (`x,y,r` with `r∈[25,45]`) called **trees**. `rect` SHALL be reddish brick (`src/render.js:204`), `circle` as tree. **At most 6 square obstacles (rects) SHALL be present in any level**; any remaining obstacle budget SHALL be filled with **trees (circles)**.
   - **Algorithm SHALL add two obstacles at a time** in this order:
     1. **First two (L2)**: **two vertical rectangular obstacles** (`type:'rect', w:20, h:80-220`) — no circular/horizontal yet.
     2. **Next two (to reach 4 at L4)**: **two circular obstacles** (`type:'circle'`) — still only 2 squares total.
     3. **Next two (to reach 6 at L6)**: **two horizontal rectangular obstacles** (`w:80-220, h:20`) — now 4 squares (2 vertical + 2 horizontal), 2 trees.
      4. **Remaining to reach 6 squares (L8)**: **two vertical** again to reach the cap of `6` squares (4 vertical + 2 horizontal). Thereafter (`L10` onward) **all additional obstacles SHALL be trees** (`circle`) to respect the `max 6 squares` cap and **12 total cap**. So counts: `L1:0` (0 squares), `L2:2` (2 vertical), `L4:4` (2 vertical +2 circular), `L6:6` (2V+2C+2H = 4 squares +2 trees), `L8:8` (6 squares +2 trees), `L10:10` (6+4 trees), `L12:12` (6+6 trees, cap), `L14:12` (6+6), `L16:12` (6+6), `L18:12` (6+6). No level SHALL have `>6` rects and **no level SHALL have `>12` total obstacles**.
    - **Square spread & clearance**: Square obstacles (rects) SHALL be **spread so there is always a gap between them** and they **cannot be too close to the player (tee) or the hole**. Required: `≥40px` gap between any two rects (edge-to-edge, not just `> -10` overlap), and `≥60px` clearance from `tee` and from `hole` (distance from rect edge to point, or `≥60px` from rect centre to tee/hole minus half-size). Trees (circles) need only `≥30px` from tee/hole and `≥10px` from each other per previous rule, but rects have stricter spread. Placement SHALL be deterministic via PRNG and re-sample (up to `100` attempts per rect) until the gap/clearance constraints are met; if still not met, skip that rect and fill with a tree instead to keep total count.
   - Counts per level as in §3 (0,2,2,4,4,6,6,8,8,10,10,12,12,12,12,12,12,12) — **always even, adding two at a time**, never `1` or `3`, **capped at 12**. Placement per type SHALL be random but with a **block-direct-line** check for `≥2` obstacles: `tee→hole` segment SHALL intersect at least one obstacle; if not, re-sample deterministically (up to 20 attempts) or move first obstacle to midpoint.
   - **Field strength increase on early levels**: `field.strength` SHALL increase more quickly in early levels to make wind matter early, then plateau. Required: `L1:80, L2:85, L3:90, L4:95, L5:100, L6:105` ( `+5` per level for 1-6), thereafter `+2` per two levels (`L7:105, L8:107, L9:109, L10:111, L11:113, L12:115, L13:117, L14:119, L15:121, L16:123, L17:125, L18:125` capped at `125`). Overall `80→125` monotonic, with early jump `80→105` in first 6 levels. Any monotonic early-strong progression that satisfies `L6≥105` and `L18≥115` and never decreases is also acceptable if documented.
   - Difficulty increase via obstacles SHALL be monotonic: `obstacles.length` for `n+1` `≥` that for `n`, and strictly `>` every other level (exactly `+2` when it increases).

5. **No hard-coded levels**: `src/levels.js` SHALL NOT contain 18 hand-written objects as the source of truth; instead it SHALL contain the generator and optionally a `STATIC_LEVELS` fallback for tests. `src/main.js` SHALL use the generated `LEVELS` for `currentHoleIndex`, `Hole: N/M` HUD, and `createField` calls.

6. **Validation & seed**: On generation, each level SHALL be validated: `tee`/`hole` clamped inside canvas, obstacles inside bounds, `field` counts non-negative integers, `seed` distinct per hole (e.g., `baseSeed + level* 9973` or sequential `rand()`), `strength` in `80-125`. Log warning if clearance violated.

## Acceptance Criteria

- [ ] On fresh new game (clear `localStorage`, reload, or call `generateLevels(Date.now())`), `LEVELS.length === 18`, `generateLevels` returns 18, and `LEVELS[0].id === "hole-1"` … `LEVELS[17].id === "hole-18"`.
- [ ] Every level `tee.x ∈ [40,140]` (left side) and `hole.x ∈ [760,860]` (right side), `hole.x - tee.x ≥ 600`, and `tee.y`/`hole.y` vary randomly across the 18 (≥10 distinct `tee.y` and ≥10 distinct `hole.y`, not all `300`), deterministic for same seed (calling `generateLevels(12345)` twice yields identical `tee.y`/`hole.y` arrays).
- [ ] **Level 1**: `field` is exactly `sources:1, sinks:1, doublets:0, vortexes:0`, source `x==0` (left edge), sink `x==width` (right edge), `obstacles.length === 0`, `tee` left, `hole` right.
- [ ] **Level 2**: `field` same as L1 (`1,1,0,0`), `obstacles.length === 2`, **both obstacles are vertical rectangles** (`type:'rect', w==20, h∈[80,220]`), inside bounds and `≥60px` from tee/hole (stricter for squares), `≥40px` gap between the two rects, and `tee→hole` line is blocked.
- [ ] **Level 3**: `field` is `1,1,0,1` (adds one vortex inside, `20≤x≤width-20`), `obstacles.length === 2` (still 2 vertical from L2), source left edge, sink right edge retained.
- [ ] **Obstacle type order & max 6 squares, max 12 total**: For `L2` (2 obs) both vertical; for `L4` (4 obs) `2` vertical + `2` circular; for `L6` (6 obs) `2V+2C+2H` (`4` squares + `2` trees); for `L8` (8 obs) `6` squares + `2` trees (max squares reached); for `L10`+ all remaining added are **trees** (`type:'circle'`), so **no level has `>6` rects** and **no level has `>12` total** (verify `obstacles.filter(o=>o.type==='rect').length <=6` and `obstacles.length <=12` for all 18, and `L18` has `6` rects + `6` circles = `12` total). Verify vertical `o.w==20` counts and horizontal `o.h==20` counts per the order above.
- [ ] **Square spread**: For any level, the minimum edge-to-edge gap between any two rects is `≥40px` (not just `> -10` overlap), and the minimum distance from any rect edge to `tee`/`hole` is `≥60px` (vs `30px` for circles). For `100` random seeds, zero rects violate these gaps. Check via `Math.hypot` or rect distance functions.
- [ ] **Two-at-a-time**: Every level's `obstacles.length` is even (`0,2,4,6,8…16`), never odd, and increases by exactly `2` when it increases (never `+1`).
- [ ] **Monotonic difficulty**: For `i=1..17`, `obstacles.length[i+1] ≥ obstacles.length[i]` and `fieldComponents[i+1] = sources+sinks+doublets+vortexes` at `i+1` is `≥` that at `i`; over any 3-level window `obstacles+components` increases by `≥2`. At L18, `obstacles.length ==12` (cap) and `fieldComponents ≥7`. Verified by iterating `generateLevels` and checking monotonic arrays.
- [ ] Every level `≥1` has at least one source at edge (`x==0||x==width||y==0||y==height`) and at least one sink at edge; every level `≥3` has at least one vortex or doublet inside (`20≤x≤width-20`). For 100 random seeds, zero sources/sinks fall strictly inside and zero sinks fall outside, and every level `≥3` has interior vortex/doublet (checked via `getSourcePositions()`/`getSinkPositions()`/`getVortexPositions()`).
- [ ] **Field strength early increase**: `field.strength` is `80-125`, non-decreasing, and **increases on early levels**: `L1:80, L2:85, L3:90, L4:95, L5:100, L6:105` (`+5` per level for 1-6), thereafter `+2` per two levels to `125`. Verify `strength[0]==80 && strength[1]==85 && strength[2]==90 && strength[5]==105` and `strength[17]>=115` and never decreases.
- [ ] Calling `generateLevels(seed)` twice with same `seed` yields `JSON.stringify` equal 18 levels; different seed yields different `tee.y`/`hole.y`/`obstacle` positions for at least `≥50%` of levels.
- [ ] `src/main.js` on new game generates 18, sets `LEVELS = generateLevels(...)`, `currentHoleIndex=0`, `Hole: 1/18` HUD, and `loadLevel(0)` uses `LEVELS[0].field` to create field with correct edge source/sink.

## Dependencies
- REQ-003 (field superposition, edge sources/sinks, interior vortex/doublet, no unary)
- REQ-008 (obstacles, brick rects, clearance)
- REQ-009 (hole)
- REQ-014 (attempts, Hole N/M)

## Notes
- Generator sketch `src/levels.js:1`:
  ```js
  export function generateLevels(seed = Date.now(), count=18){
    const rand = mulberry32(seed);
    const levels=[];
    for(let i=0;i<count;i++){
      const levelNum=i+1;
      const tee={x:40+Math.floor(rand()*100), y: Math.floor(rand()*440)+80}; // 40-140
      const hole={x:760+Math.floor(rand()*100), y: Math.floor(rand()*440)+80, radius:14}; // 760-860
      // field progression
      let sources=1, sinks=1, doublets=0, vortexes=0;
      if(levelNum>=3) vortexes=1;
      if(levelNum>=5) doublets=1;
      if(levelNum>=7) sources=2;
      if(levelNum>=8) sinks=2;
      if(levelNum>=9) vortexes=2;
      if(levelNum>=11) doublets=2;
      if(levelNum>=13) sources=3;
      // ... up to 4,4,3,3
      const obsCount = levelNum===1?0: Math.min(12, 2*Math.ceil(levelNum/2)); // 0,2,2,4,4,6... capped at 12
      // obsCount even, +2 at a time
      const obstacles = generateObstacles(obsCount, tee, hole, rand); // first 2 vertical, next 2 circular, next 2 horizontal, cycle
      // field strength early increase +5 per level for 1-6, then +2 per 2 levels
      let strength;
      if(levelNum<=6) strength = 80 + (levelNum-1)*5; // 80,85,90,95,100,105
      else strength = 105 + Math.floor((levelNum-6)/2)*2 + (levelNum>6 && levelNum%2===1 ? 2 : 0); // 105,107,109...
      if(strength>125) strength=125;
       levels.push({id:`hole-${levelNum}`, name:`Hole ${levelNum}`, canvas:{width:LOGICAL_W,height:LOGICAL_H}, tee, hole, obstacles, field:{cols:32,rows:18,strength, seed: seed + i*9973 + levelNum*101, sources, sinks, doublets, vortexes}}); // LOGICAL 16:9 e.g., 1280×720; cols/rows 32×18 keeps square cells
    }
    return levels;
  }
  export let LEVELS = generateLevels(42, 18); // default for tests, overwritten on new game
  ```
- `generateObstacles(count, tee, hole, rand)` SHALL add **two at a time** in order **vertical (2) → circular (2) → horizontal (2)** then **all remaining as trees** to respect **max 6 squares**: for `count=2` → 2 vertical (2 squares), `4` → 2V+2C (2 squares), `6` → 2V+2C+2H (4 squares), `8` → 6 squares (2V+2C+2H) +2 trees, `10` → 6+4 trees, `12` → 6+6, `14` → 6+8, `16` → 6+10. For `count>6`, only `circle` shall be used for the excess. Each placement uses `rand()` and re-samples if overlapping: **rects** require `≥40px` gap to other rects and `≥60px` to tee/hole, **circles** require `≥10px`/`≥30px`; if a rect cannot be placed after `100` attempts, fall back to a tree to keep total count. For `≥2` obstacles ensures `tee→hole` line is blocked (move first obstacle to midpoint if needed).
- Keep `LEVEL` alias as `LEVELS[0]` for backwards compat.

## File Paths
- `src/levels.js:1` (generateLevels, LEVELS 18, tee left/hole right random height, field progression, obstacles progression)
- `src/main.js:1` (calls generateLevels on new game, uses LEVELS.length 18)
- `src/vectorField.js:1` (field creation per level, edge/inside constraints)
```
