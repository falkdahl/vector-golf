# REQ-010: Level Definition (Multi-Hole)

- **ID:** REQ-010
- **Title:** Level Definition - Multi-Hole
- **Priority:** Must Have
- **Type:** Data / Functional
- **Status:** Draft
- **Related Plan Section:** levels.js, Architecture File Structure

## Description
The game SHALL define multiple playable holes via a declarative `LEVELS` array. Each level object includes canvas size, tee, hole, obstacles, and wind field parameters. The format SHALL support sequential hole progression and display of current hole number and total holes (REQ-014).

## Rationale
User chose "Single hole MVP" scope. A data-driven level in `src/levels.js` isolates tuning and enables adding holes later.

## Requirements

1. File `src/levels.js` SHALL export `LEVELS` array (length >=2, ideally 3 for hole counter demo) where each level is:
    ```js
    {
      id: "hole-1",
      name: "Crosswind",
      canvas: {width:900, height:600},
      tee: {x:80, y:300},
      hole: {x:820, y:300, radius:14},
      obstacles: [
        {type:'rect', x:250, y:100, w:20, h:250},
        {type:'rect', x:400, y:350, w:220, h:20},
        {type:'circle', x:550, y:180, r:40},
        // ... 4-6 total
      ],
      field: {cols:20, rows:15, strength:30, seed:42}
    }
    ```
2. `src/main.js` SHALL track `currentHoleIndex` and load `LEVELS[currentHoleIndex]` on init and on hole advance; pass its data to `createField`, obstacle store, and ball/hole spawns. Total holes `LEVELS.length` drives hole counter `Hole: N/M`.
3. The level's obstacles SHALL create at least two distinct viable paths to the hole that require wind compensation; direct straight shot must be blocked or heavily wind-deflected.
4. Tee and hole SHALL be at least 600px apart horizontally to require meaningful power.
5. No hard-coded positions in `physics.js`/`render.js`; all positions come from level data.
6. Level data SHALL be validated on load: clamp tee/hole inside canvas, ensure obstacles inside bounds, log warning if clearance violated (REQ-008). Seed SHALL vary per hole to give distinct wind fields.

## Acceptance Criteria

- [ ] `src/levels.js:1` exists and exports `LEVELS` array with >=2 levels (e.g., 3 holes) each with all fields above and distinct `seed`.
- [ ] Changing `tee.x` in `levels.js` moves ball start on next reload without code edits.
- [ ] Changing `obstacles` array immediately reflects in game (add/remove rect appears).
- [ ] Level's `field.strength` alters wind influence visibly (set 10 vs 80).
- [ ] Direct line tee->hole is obstructed: firing angle 0° at mid-power hits an obstacle before reaching hole (verified manually).
- [ ] On clearing hole 1, game advances to hole 2: hole counter updates `2/3`, ball at new tee, field changes, total attempts persists, hole attempts reset to 0.
- [ ] After final hole, game shows Game Complete with total attempts across all holes.

## Dependencies
- REQ-003 (field), REQ-008 (obstacles), REQ-009 (hole)

## Notes
- Seed: for MVP, use fixed seed or hard-coded field array to ensure reproducibility; document if seed is unused and generation is deterministic via fixed math.
- Future: level selector UI, but out of scope - just `LEVELS[0]`.

## File Paths
- `src/levels.js:1`
- `src/main.js:15` (level loading)
