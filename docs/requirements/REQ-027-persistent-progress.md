# REQ-027: Persistent Progress via Local Storage (Resume on Revisit)

- **ID:** REQ-027
- **Title:** Persistent Progress via Local Storage — Save on Each Attempt and Resume on Revisit
- **Priority:** Should Have
- **Type:** Functional + Non-Functional
- **Status:** Draft
- **Related Plan Section:** Persistence / Game States (REQ-011/REQ-014 Extension)

## Description
The game SHALL persist run progress to `localStorage` **on each attempt** (every `handleLaunch` that counts as a shot) so that when the site is revisited (page reload, tab closed/reopened, browser restart) the game **resumes as it was from the last saved state** instead of starting a new game. Progress SHALL be restored automatically on load before the first frame, without requiring user interaction.

## Rationale
As a static site (`python -m http.server`, GitHub Pages) there is no backend. `localStorage` is the only zero-dependency, synchronous, origin-scoped persistence available in pure vanilla JS. Saving on each attempt (the primary scoring and progression event per REQ-014) guarantees that the most recent counters, hole, inventory, and field shaping are not lost on accidental reload/close. Resuming exactly where the player left off preserves the multi-hole risk/reward loop (supply, `freeShots`, `areaUpgradeCount`, `bouncyBallCount`, secret reward counter) and prevents frustration on long runs. The HUD stays simple (`Hole/Attempts/Total`) while persistence is invisible. Starting supply is `{1,1,1}` per REQ-020 and no initial reward is pending before first attempt on the first hole per REQ-021; subsequent holes have a pending reward before first attempt and secret counter reset to 0 on each hole advance.

## Requirements

1. **Storage Keys, Format & Versioning** in `src/main.js` / `src/courses.js` (and optionally `src/storage.js`):
   - **Active-run key**: `STORAGE_KEY = "golfVectorField.progress.v1"` (or `"golf.save.v1"`). Value SHALL be JSON string `JSON.stringify(payload)` with `version: 1`. `localStorage.setItem(STORAGE_KEY, json)` SHALL be the write path for active run.
   - **Courses collection key** per REQ-031: `COURSES_KEY = "golfVectorField.courses.v1"` with payload `{version:1, courses: Course[]}` where each `Course` is per REQ-031 (`id`, `name`, `holes`, `holeCount`, `seed`, `createdAt`, `bestTotal`). This is a second namespaced key, so the game now uses **two** keys: one for active run, one for course collection (plus legacy `HIGH_SCORE_KEY` for migration). Do not scatter other keys.
   - Payload for `STORAGE_KEY` SHALL include at minimum the **restorable run state** plus **`courseId`** linking to the active course:
     ```js
     {
       version: 1,
       courseId: string,                  // UUID of active Course per REQ-031
       currentHoleIndex: number,          // 0..course.holes.length-1
       holeAttempts: number,              // >=0 int
       totalAttempts: number,             // >=0 int, alias attempts
       supply: {amplify:number, nullify:number, flip:number},
       freeShots: number,                 // REQ-022
       areaUpgradeCount: number,          // REQ-023
       bouncyBallCount: number,           // REQ-024
       // optional but SHOULD persist if feature exists:
       sharpshooterCount: number,         // REQ-026 if present else 0
       secretRewardCounter: number,       // 0..4 REQ-021
       rewardPending: boolean,
       rewardOffered: string[]|null,      // length 0 or 3 subset of POOL when menu pending
       rewardRerolled: boolean,           // REQ-025
       rewardMenuVisible: boolean,        // if true, resume with menu open (only after 5 counted shots)
       modifiers: Array<{type:'amplify'|'nullify'|'flip', x:number, y:number, radius:number}>, // placed field modifiers per REQ-015
       aimAngle: number,                  // radians 0..2π, persisted per REQ-019 launch-angle persistence
       savedAt: number                    // Date.now() ms for debug/expiry
     }
     ```
   - Fields that SHALL **NOT** be persisted (transient): `ball.pos/vel/isMoving`, `gameState==="FLYING"` (resume always as `AIMING` at tee), `charging/charge/holdTime`, `mousePos/selectedModifier`, `particles`/`field` grid (field is re-created deterministically per hole via `createField`/`LEVELS[h].field`). On resume, ball SHALL be placed at current hole's tee with `vel=0`.
   - All numbers SHALL be clamped to `>=0` and integer where required on load (same clamping as setters `setSupply`, `setFreeShots`, etc.). Missing fields from older saves SHALL default to `0/false/[]` without throwing. `supply` missing or `0` values from old saves should be migrated to `{1,1,1}` only if `totalAttempts===0` and no save is considered new game; otherwise preserve stored values.
   - `localStorage` access SHALL be wrapped in `try{}`/`catch` (private mode / quota / disabled storage SHALL NOT crash the game). On `QuotaExceededError` or `JSON` error, silently fallback to new game.

2. **Save Trigger — On Each Attempt** in `src/main.js:handleLaunch(angle,power)`:
   - Immediately after the existing launch deduction logic per REQ-022/REQ-014:
     ```js
     if (freeShots > 0) {
       freeShots = Math.max(0, freeShots-1);
       // no holeAttempts/totalAttempts increment
     } else {
       holeAttempts += 1;
       totalAttempts += 1;
       attempts = totalAttempts;
       secretRewardCounter = Math.min(4, secretRewardCounter+1) // or cycle 0..4 then reset to 0+pending per REQ-021
       if (secretRewardCounter===5){ secretRewardCounter=0; rewardPending=true; }
     }
     launchBall(angle,power); gameState="FLYING";
     saveProgress(); // <-- SHALL be called exactly once per successful launch
     ```
     `saveProgress()` SHALL be called **exactly once per attempt**, regardless of whether it was a free shot or counted shot. Pressing `R` to reset without launching SHALL NOT call `saveProgress` for an attempt (but MAY save other state if it mutates modifiers/hole).
   - To keep resume faithful, `saveProgress()` SHALL ALSO be called after other run-mutating events (same serialization, same key, overwrite):
     - `claimReward(type)` after `supply`/`freeShots`/`areaUpgradeCount`/`bouncyBallCount`/`sharpshooterCount` mutation and `rewardMenuVisible=false`
     - `rerollReward()` after `holeAttempts/totalAttempts` cost and new `rewardOffered`
     - `placeModifier(x,y)` and modifier removal/drag (`Delete`/`Backspace`/right-click) after `modifiers` changes
     - `advanceHole()`/`handleNextHole()`/`loadLevel(n)` after `currentHoleIndex`/`holeAttempts` reset
     - `maybeShowRewardMenu()` when a new `rewardOffered`+`rewardRerolled=false` is created (so pending menu is resumed)
   - Debouncing is not required; payload is <5KB, synchronous write is negligible. Each call SHALL overwrite the previous value atomically.

3. **Load & Resume on Revisit** in `src/main.js:init()` / `src/main.js:setup`:
   - On page load, **before** `initLevel(0)` creates the first hole, `loadProgress()` SHALL attempt:
     ```js
     function loadProgress(){
       try{
         const raw = localStorage.getItem(STORAGE_KEY);
         if(!raw) return null;
         const data = JSON.parse(raw);
         if(!data || data.version !== 1) return null;
         // validate ranges, clamp, fallback to defaults if corrupt
         return data;
       } catch { return null; }
     }
     ```
   - If `loadProgress()` returns valid data and `data.courseId` exists in the courses collection (`loadCourses().find(c=>c.id===data.courseId)`) and `data.currentHoleIndex` is within `0..course.holes.length-1` (where `LEVELS` is now `course.holes` of the active course per REQ-031):
     - Resolve active course via `courseId`; set `LEVELS = course.holes` (or `activeCourse.holes`) before using `currentHoleIndex`.
     - Restore: `currentHoleIndex=data.currentHoleIndex`, `holeAttempts=data.holeAttempts`, `totalAttempts=data.totalAttempts`, `supply=data.supply`, `freeShots=data.freeShots`, `areaUpgradeCount=data.areaUpgradeCount`, `bouncyBallCount=data.bouncyBallCount`, `sharpshooterCount=data.sharpshooterCount||0`, `secretRewardCounter=data.secretRewardCounter`, `rewardPending`, `rewardOffered`, `rewardRerolled`, `modifiers = (data.modifiers||[]).slice()`, `aimAngle=data.aimAngle`, and `courseId` (kept as `activeCourseId` for `saveProgress`).
     - Recompute derived: `areaMultiplier=1+0.2*areaUpgradeCount`, effective radius via `getEffectiveModifierRadius()` (which now reflects restored count), `bouncyRemaining=bouncyBallCount` (per-attempt init), `attempts=totalAttempts`.
     - Re-initialize field for the restored hole: `createField(cols,rows, level.field.strength, seed, LOGICAL_W, LOGICAL_H)` then `setModifiers(modifiers)` and `syncModifiersToField()`, so wind arrows immediately reflect restored modifiers.
     - Place ball at tee of restored hole: `physicsResetBall(tee)` (or `ball.pos={...tee}` `vel={0,0}` `isMoving=false`), `gameState="AIMING"` (never resume as `FLYING`/`WIN` even if saved while flying – ball is always at tee on resume for determinism).
     - If `data.rewardMenuVisible && data.rewardOffered?.length===3`, set `rewardMenuVisible=true` `rewardOffered=data.rewardOffered` `rewardRerolled=!!data.rewardRerolled` so the reward menu appears immediately before the first aim (blocking input per REQ-021). This only occurs when a reward was pending after 5 counted shots, not on fresh new game where no menu is pending.
     - Call `updateAttemptsUI()`/`updateHotbarUI()`/`drawHUD` on next frame so restored HUD `Hole: N/M Attempts: X Total: Y` is visible without an extra launch.
   - If no saved data, corrupt JSON, wrong version, or out-of-range indices, silently start a new game (`currentHoleIndex=0`, all counters `0`, `supply={1,1,1}`, `secretRewardCounter=0`, no pending menu, no modifiers) and do NOT throw. An error in `loadProgress` SHALL NOT block rendering.
   - Resume SHALL respect the saved pending state; on fresh new game with no save, `rewardMenuVisible` is `false` and `supply` is `{1,1,1}` with no initial reward pending. `initLevel(0)` for new game SHALL set `supply={1,1,1}`, `secretRewardCounter=0`, `rewardPending=false`, `rewardMenuVisible=false` on hole 1 and SHALL NOT call `maybeShowRewardMenu()` to show an initial menu there; on subsequent holes `secretRewardCounter` is reset to `0` with `rewardPending=true` so a menu shows before first attempt.

4. **Clear on New Game** in `src/main.js:resetGameAfterWin()` / `clearProgress()` / `startNewGameFromMain()` / `endRun()`:
   - Pressing `R` in `WIN` / `GAME_COMPLETE` (reset entire run per REQ-011/REQ-014), `startNewGameFromMain` (REQ-029 main menu), or `endRun` (REQ-029 pause End Run → main menu) SHALL call `clearProgress()` which does `localStorage.removeItem(STORAGE_KEY)` and then re-initializes all run state to new-game defaults (`currentHoleIndex=0`, `holeAttempts=0`, `totalAttempts=0`, `supply={1,1,1}`, `freeShots=0`, `areaUpgradeCount=0`, `bouncyBallCount=0`, `sharpshooterCount=0`, `secretRewardCounter=0`, `rewardPending=false`, `rewardOffered=[]`, `modifiers=[]`, `rewardRerolled=false`). The next attempt SHALL then trigger a fresh save.
   - Optional: exposing `window.__clearProgress()` / `window.clearProgress()` for tests. Reloading the page SHALL NOT clear storage; only explicit new-game reset does.

5. **Lifecycle & Edge Cases**:
   - Death resets (`resetBall()` on obstacle/OOB) SHALL NOT clear storage; the next `saveProgress()` will persist the unchanged counters plus the ball now at tee in `AIMING`.
   - `R` during play (reset ball without scoring per REQ-011) SHALL NOT increment attempts but MAY call `saveProgress()` to persist `aimAngle`/modifiers if they were moved that attempt.
   - `WIN` state SHALL NOT be persisted as `WIN`; if the player closes the tab while the Victory overlay (`WIN`) is shown, revisiting SHALL restore the **next hole** already advanced if `advanceHole()` had been called; otherwise it SHALL restore the **won hole** in `AIMING` at its tee with `holeAttempts` for that hole already counted (victory is terminal until `Next`/`R`, so persisting `WIN` as `AIMING` at same hole is acceptable and deterministic). No ball-in-flight position needs to be saved.
   - Storage MAY be treated as having no expiry; `savedAt` is informational only.
   - No `sessionStorage` or cookies; only `localStorage` to satisfy “when the site is revisited” (survives tab close). No server, no IndexedDB.

## Acceptance Criteria

- [ ] On fresh play (no key), `localStorage.getItem("golfVectorField.progress.v1")` is `null`; starting a new game shows **no reward menu** (`rewardMenuVisible===false`) and `supply={1,1,1}`; no save is created until an attempt is made (still `null` before first launch).
- [ ] After a counted launch (`freeShots=0` → `holeAttempts 0→1, totalAttempts 0→1, secretRewardCounter 0→1`), `localStorage` now contains a JSON string with `version:1`, `currentHoleIndex:0`, `holeAttempts:1`, `totalAttempts:1`, `supply` as at that moment (`{1,1,1}` plus any claimed), `savedAt` within 2s of now. Reloading the page (or `location.reload()`) restores HUD to `Hole:1/M Attempts:1 Total:1` (not `0/0`), and `getSecretRewardCounter()===1`.
- [ ] After a free-shot launch (`freeShots=2` → `1`, counters unchanged `Total 5→5`), `localStorage` is updated with `freeShots:1` while `totalAttempts` stays `5` and `secretRewardCounter` unchanged. Reloading restores `freeShots 1` and `Total 5`.
- [ ] After claiming a reward after 5 counted shots (`claimReward('amplify')` when offered → `supply.amplify 1→2`), storage is updated with the new supply even before the next attempt. Reloading restores the same supply and hotbar shows `2` capability.
- [ ] After placing an Amplify modifier with supply, `modifiers.length 0→1` is persisted. Reloading restores the modifier at the same `x,y,radius` (effective radius reflects `areaUpgradeCount`), and arrows inside the circle show amplified wind via `getWindAt`.
- [ ] Multi-hole: clearing hole 1 (`advanceHole()` → `currentHoleIndex 0→1, holeAttempts 0, totalAttempts preserved`) saves with `currentHoleIndex:1`, `secretRewardCounter` reset to `0` and `rewardPending=true` so reloading shows `Hole:2/M` with a reward menu pending before first attempt on hole 2 (`rewardMenuVisible` true after load if `rewardOffered` present). `Attempts:0` for that hole, `Total` as before, with previous `supply`/`freeShots`/`area`/`bouncy` all preserved.
- [ ] Reroll: with menu visible after 5 counted shots and `rewardRerolled=false`, triggering `rerollReward()` → `Total 5→6` cost, new `rewardOffered` 3-set, `rewardRerolled true`) persists `totalAttempts:6` and the new offer and `rewardRerolled:true`. Reloading still shows the **re-rolled** menu (same 3 new options) and the reroll button disabled, not the original offer.
- [ ] Corruption tolerance: if `localStorage.setItem(STORAGE_KEY, "not-json")` is manually set, reloading does not throw; game starts as new game `Hole:1/M Attempts:0 Total:0` with `supply={1,1,1}` and no menu, and next valid save overwrites the corrupt value.
- [ ] New-game clear: pressing `R` in `WIN`/`GAME_COMPLETE`, `startNewGameFromMain`, or `endRun` removes the key (`localStorage.getItem(...)===null`) and resets counters to `0` with `supply={1,1,1}` and `rewardMenuVisible=false`. The next launch creates a fresh save with `Hole:1/M` again.
- [ ] No 3rd-party libraries; pure vanilla JS `localStorage.getItem/setItem/removeItem`, `JSON.stringify/parse`, `try/catch`, `Math.max(0, ...)`, versioned payload.

## Dependencies

- REQ-011 (game states, `handleLaunch`, `resetBall`, `loadLevel`, `resetGameAfterWin`)
- REQ-014 (attempts counters `holeAttempts`, `totalAttempts`, `currentHoleIndex`, `drawHUD`)
- REQ-015/REQ-020 (modifiers & supply — now `{1,1,1}` start)
- REQ-021 (secret reward counter, reward menu state — no initial pending)
- REQ-022 (freeShots)
- REQ-023 (areaUpgradeCount)
- REQ-024 (bouncyBallCount/bouncyRemaining)
- REQ-026 (sharpshooterCount if present)
- REQ-025 (reroll state)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  const STORAGE_KEY = "golfVectorField.progress.v1";
  function getSavePayload(){
    return {
      version:1,
      currentHoleIndex, holeAttempts, totalAttempts,
      supply:{...supply}, freeShots, areaUpgradeCount, bouncyBallCount,
      sharpshooterCount: typeof sharpshooterCount!=='undefined'? sharpshooterCount:0,
      secretRewardCounter, rewardPending,
      rewardOffered: [...rewardOffered], rewardRerolled, rewardMenuVisible,
      modifiers: modifiers.map(m=>({type:m.type,x:m.x,y:m.y,radius:m.radius})),
      aimAngle: getAimAngle(),
      savedAt: Date.now()
    };
  }
  function saveProgress(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavePayload())); } catch(e){}
  }
  function loadProgress(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const d = JSON.parse(raw);
      if(!d || d.version!==1) return null;
      // clamp & validate
      currentHoleIndex = Math.max(0, Math.min(LEVELS.length-1, Math.floor(d.currentHoleIndex||0)));
      holeAttempts = Math.max(0, Math.floor(d.holeAttempts||0));
      totalAttempts = Math.max(0, Math.floor(d.totalAttempts||0));
      attempts = totalAttempts;
      supply = { amplify: Math.max(0, Math.floor(d.supply?.amplify||0)), nullify: Math.max(0, Math.floor(d.supply?.nullify||0)), flip: Math.max(0, Math.floor(d.supply?.flip||0)) };
      // migrate old 0 saves to 1 if new game
      if(totalAttempts===0 && holeAttempts===0 && supply.amplify===0 && supply.nullify===0 && supply.flip===0) supply={amplify:1,nullify:1,flip:1};
      freeShots = Math.max(0, Math.floor(d.freeShots||0));
      areaUpgradeCount = Math.max(0, Math.floor(d.areaUpgradeCount||0));
      bouncyBallCount = Math.max(0, Math.floor(d.bouncyBallCount||0));
      if(typeof sharpshooterCount!=='undefined') sharpshooterCount = Math.max(0, Math.floor(d.sharpshooterCount||0));
      secretRewardCounter = Math.max(0, Math.min(4, Math.floor(d.secretRewardCounter||0)));
      rewardPending = !!d.rewardPending;
      rewardOffered = Array.isArray(d.rewardOffered) && d.rewardOffered.length===3 ? [...d.rewardOffered] : [];
      rewardRerolled = !!d.rewardRerolled;
      rewardMenuVisible = !!d.rewardMenuVisible && rewardOffered.length===3;
      modifiers = Array.isArray(d.modifiers) ? d.modifiers.filter(m=>m && typeof m.x==='number').map(m=>({type:m.type,x:m.x,y:m.y,radius: getEffectiveModifierRadius()})) : [];
      if(typeof d.aimAngle==='number') setAimAngle(d.aimAngle);
      return d;
    } catch { return null; }
  }
  function clearProgress(){ try{ localStorage.removeItem(STORAGE_KEY); } catch{} }
  // handleLaunch: after launch + counters, saveProgress();
  // claimReward/rerollReward/placeModifier/removeModifier/advanceHole: after mutation, saveProgress();
  // init(): const saved = loadProgress(); if(saved){ // restore field, setModifiers, ball at tee, AIMING, update UI } else { initLevel(0); } // initLevel(0) sets supply {1,1,1}, no pending menu
  // resetGameAfterWin/startNewGameFromMain/endRun: clearProgress(); currentHoleIndex=0; holeAttempts=0; totalAttempts=0; supply={1,1,1}; freeShots=0; areaUpgradeCount=0; bouncyBallCount=0; secretRewardCounter=0; modifiers=[]; rewardMenuVisible=false;
  ```
- Call `saveProgress()` **synchronously** after each `handleLaunch` so the very last attempt before a crash/reload is not lost. Additional saves after reward/modifier changes keep resume consistent; they do not contradict “on each attempt” – attempt save is the mandatory minimum.
- Expose for tests: `window.__saveProgress=saveProgress`, `window.__loadProgress=loadProgress`, `window.__clearProgress=clearProgress`, `window.__STORAGE_KEY=STORAGE_KEY`, `window.__getSavePayload=getSavePayload`.
- Security: no sensitive data; payload is <5KB well under 5MB quota; no expiry needed.

## File Paths

- `src/main.js:1` (STORAGE_KEY, getSavePayload, saveProgress, loadProgress, clearProgress, handleLaunch save on each attempt, claimReward/rerollReward/placeModifier/removeModifier/advanceHole saves, init resume, resetGameAfterWin/startNewGameFromMain/endRun clear)
- `src/storage.js:1` (optional helper module if extraction preferred; otherwise all in main.js)
- `index.html:1` (no DOM for progress; pure localStorage)
- `style.css:1` (no styling needed)
