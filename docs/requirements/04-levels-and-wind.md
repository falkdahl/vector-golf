# 04 — Levels, Terrain & Wind Field

- **ID:** 04-levels-and-wind
- **Supersedes:** 07-level-generation; 06-wind-system §1–§2 (field model + visualization)
- **Type:** Procedural generation / balancing
- **References:** `01-foundation.md`; `02-rendering.md` (palette); `03-physics.md` (fatal zones)

> Field counts per tier live only in §5 here. `05-modifiers-and-bag.md` consumes `getWindAt`; it must not restate generation.

## 1. Level entry (`src/levels.js`, `src/terrain.js`)

- `generateLevels(seed?, count?:4|6|9|18, options?:{difficulty?}): Level[]` (aliases `createLevels`/`generateProceduralLevels` allowed). Called via `generateCourse` on every new-game start before `loadLevel(0)`. `count` must be `4|6|9|18` (see `08-campaign-and-menus.md`). Fresh seeds use `Date.now()`/`Math.random()*1e9` or `?seed=` debug; deterministic for same seed+count.
- After generation `LEVELS.length===count`, `LEVELS[i].id==="hole-1"…`:
```js
{ id, name:"Hole N", canvas:{width:LOGICAL_W,height:LOGICAL_H},
  tee:{x,y}, hole:{x,y,radius:14}, obstacles:[{type:'circle',x,y,r}],
  waterHazards:[{x,y,w,h}|{x,y,r}], treasure:{x,y,radius:12,isCollected,nearTreeId}|null,
  treasures?:[...], // tutorial hole 3/4 only
  terrain:{ green:{x,y,r}, teeBox:{x,y,r}, fairwayPath:[{x,y}], widthFairway, widthRough, noiseSeed },
  field:{ cols:32,rows:18,strength,seed,sources,sinks,doublets,vortexes,unaryFlow? },
  difficulty:{ shape:'I'|'L'|'V'|'U'|'S'|'Z', shapeTier:0|1|2, treesOnFairway, waterOnFairway, tier:'easy'|'medium'|'hard', score } }
```
- Legacy `rect` obstacles deprecated (new levels use `type:'circle'`). No hand-written `LEVELS` fallback (static data is tests-only).

## 2. Tee / hole

- `tee.x∈[40,180]`, `hole.x∈[LOGICAL_W-180,LOGICAL_W-40]`, `hole.x-tee.x ≥ LOGICAL_W*0.6`. `tee.y`/`hole.y` via seeded PRNG `rand()*(LOGICAL_H-160)+80`; ≥10 distinct values across 18 holes.
- Easy `I` holes: `|atan2(Δy,Δx)| ≤ 10°`; clamp `hole.y` to `tee.y ± Δx*tan(10°)` deterministically.

## 3. Pipeline

**Step 1 — Layout.** Bézier (or directed A*) spine `terrain.fairwayPath` (~50 pts, continuous, non-self-intersecting, endpoints ≤60 from tee/hole). Easy `I`: offset <15px, deviation <30, angle <15°. Medium `L(125–175)/V(105–150)/U(135–185)`. Hard `S/Z`: two opposite offsets `155–220`, `longFactor 0.24–0.32`, controls clamped inside, inflection `maxDev 60–90`.

**Step 2 — SDF.** `d` = min `distToSegment` to spine; tee/green masks `r 70–90`/`60–90`. `W_fairway∈[80,140]` (base `110±rand*30`), `W_rough=W_fairway+[60,100]`; hard fairway `clamp(baseline-(15+rand*10),70,140)` (hard avg ≥12 smaller than easy). Non-I shapes thin mid-course: `Wf_eff(t)=Wf_base*(1-0.28*sin(πt))`, `Wr_eff=Wf_eff+(Wr_base-Wf_base)`; I-shapes constant. Vertical shift pass guarantees the whole rough envelope + tee/green inside canvas with ≥8px margin. Export `terrainZoneAt`, `getSpineTForPoint`, `getEffectiveFairwayWidthAt(T)`, `getEffectiveRoughWidthAt`.

**Step 3 — Warp.** Domain-warped noise (`warpScale 0.006–0.012` base `0.008`, `warpStrength 12–24` base `18`, `noiseSeed=baseSeed+i*7919`); boundaries deviate `≥8 RMS ≤35 max` (100 samples).

**Step 4 — Hazards/trees/treasure.**
- Water (CA or Perlin `>0.6`): partly on fairway per §5 (`d ≤ W_fairway-10`, area `2000–6000px²`, `r 28–48` or rect), never overlapping tee/green (`dist ≥ r_mask+r+10`), never fully blocking fairway.
- Trees (`r 18–36`, Poisson `minDist 45±15 k=30`): `treesOnFairway` strictly on fairway (`d ≤ W_fairway-4`, outside masks) with `≥dist(tee,hole)/3` from tee and `≥40` from masks, `≥r1+r2+6` apart. Non-fairway extras are rough-border only: `terrainZoneAt==='rough'` and `d∈[W_rough-25,W_rough-4]`, spread around the perimeter (angular stddev >60° over 100 samples), never strictly OB. Total typically 5–15.
- Treasure (standard holes): exactly one `{x,y,radius:12(10–14),isCollected:false,nearTreeId}`, polar offset `tree.r+radius+8+rand*18` from a random tree, resampled ≤60 tries; must not overlap trees/water/tee/green, zone `fairway`/`rough`, ≥30px inside canvas; deterministic per seed. Tutorial holes 1–2 have none; hole 3 has three; hole 4 has one (see `09-tutorial.md`; multi-chest is tutorial-only).

**Step 5 — Validation.** `maxDrive=LOGICAL_W*0.55`: spine samples `t=0,.25,.5,.75,1` not water/OB; first-drive ring `[0.7,1.0]*maxDrive` has fairway non-water; ≥40px fairway/rough corridor tee→hole (A*/raycast). Regenerate ≤15 tries, else remove water or `W_fairway+=15`. 100 seeds → 0 unsolvable.

## 4. Wind field model (`src/vectorField.js`)

- Grid `cols=32,rows=18` (or `20×15` scaled to 16:9), `field[row][col]={x,y}`; `getWindAt(x,y)` bilinear clamped; `getBaseWindAt` modifier-free (visualization only). `WIND_STRENGTH=180`, `SOFTENING_A=28`, `MIN_WIND_FORCE=80`; effective min force `≥60`; max ≥1.1× min; never stationary >0.4s. `field.strength` constant across tiers. Deterministic for same seed+counts+dims.
- `createField(cols,rows,strength,seed,width,height,nSources,nSinks,nDoublets,nVortexes)` (+ optional `unaryFlow` — tutorial-only). Defaults `seed=42,1,1,1,1`; `unaryFlow` ignored for standard holes. Seeded `mulberry32`. Sources outside `20–60` (random side), sinks middle-third top/bottom `60–100`, vortexes/doublets inside `≥20` from edge. Strengths: sources/sinks `sigma∈[1.2,2.2]`, doublets `mu∈[1.2,2.2] θ∈[0,2π)`, vortex `Gamma∈[1.4,2.6]` random sign. Element formulas per legacy spec (source/sink `S*(dx,dy)/r2`, vortex `Gamma*(-dy,dx)/r2`, doublet rotated frame, `eps=a²`, `a≈28`); superposition, no unary flow on standard holes.
- Mandatory minima (coerced, except tutorial): ≥1 vortex or doublet strictly inside; ≥1 source and ≥1 sink outside (never exactly on edge, never inside). Tutorial unary holes (`0,0,0,0` + `unaryFlow`) are exempt.

## 5. Per-tier budgets (single source of truth)

| Tier | Shape | `treesOnFairway` | `waterOnFairway` | Field `sources,sinks,doublets,vortexes` |
|------|-------|------------------|------------------|------------------------------------------|
| Easy | `I` | `1–2` | `0` | `1,1,1,0` — source outside left, sink middle-third top/bottom, one doublet in a fairway tree `≤2px` |
| Medium | `L/V/U` | `2–3` | `1–2` | `2,1,2,1` — extra source `dist>180` from source/sink |
| Hard | `S/Z` | `3–5` | `1–2` | `1,1,3,1` |

- Doublet-in-tree: if `treesOnFairway≥1`, ≥1 doublet within `2px` of a fairway tree. Remaining doublets/vortexes interior, not OB. Every level has exactly one middle-third sink (`x∈[W/3,2W/3]`). Pacing: 4-hole = fixed tutorial (see `09-tutorial.md`); 6-hole `[E,E,M,M,E,M]`; 9-hole `[E,M,M,E,M,M,M,E,H]`; 18-hole `[E,M,M,E,M,M,M,E,H,M,M,M,H,M,M,H,M,H]`.

## 6. Wind visualization (Three.js Wind Waker streaks)

- `#wind-canvas` transparent (`alpha:true`, clear `0x000000,0`), `z-index:3`, `pointer-events:none`. `STREAK_COUNT=48` camera-facing ribbons (`STREAK_NODES=24`, ~2k tris), width `4–7px`, additive near-white shader with core boost + edge/end fades. Advected by **base field only** (`getBaseWindAt`; bubbles never bend streaks, no ribbons inside bubbles) at `~90–300 px/s` (`STREAK_SPEED=200 px/s` per unit, clamp `60–450`) with gust swell `0.55–1.3×` + jitter. Spread: round-robin `8×5` init, respawn to emptiest of 6 candidates; knot (net `<24px` after `1.2s`) / OOB / age `2.5–4.5s` respawns. `H` toggles streaks (physics unaffected; glow stays). ≥55fps at `1280×720`. Resize updates pixel ratio/`uResolution`/camera.

## Acceptance

- [ ] `generateLevels(seed,count)` length `count`; tee left/hole right; `fairwayPath≥20` pts, endpoints ≤60.
- [ ] `terrainZoneAt`: Green at hole, Fairway at tee+40, Rough at `Wf+30`, OB at `Wr+40`; warp `≥8 RMS ≤35`; same seed identical, different seed differs ≥50%.
- [ ] Tier budgets + pacing enforced; easy angle ≤10°; non-I middle 28% thinner (±3%), I constant (±2%); rough fully inside (≥8px margin, 100 seeds); fairway trees ≥dist/3 from tee; rough-border extras in annulus, spread; treasure placement rules; wind per-tier placement; 0 unsolvable over 100 seeds.
- [ ] Bilinear `getWindAt` correct, min force `≥60`, varying max≥1.1×min; 48 streaks base-field only; deterministic.

## File paths

- `src/levels.js:1`, `src/terrain.js:1`, `src/vectorField.js:1` (`createField`, `getWindAt`, `getBaseWindAt`, `WIND_STRENGTH`), `src/windThree.js:1`
