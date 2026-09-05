# REQ-035: Modifier Supply Consumption on Level Win

- **ID:** REQ-035
- **Title:** Field Modifiers Consumed From Supply When Level Is Beaten
- **Priority:** Must Have
- **Type:** Functional + Persistence
- **Status:** Draft
- **Related Plan Section:** Inventory / Progression / Hole Completion (REQ-009/015/020 Extension)

## Description
When a level (hole) is **beaten** — the ball enters the hole and the win condition triggers (`gameState === 'WIN'`, Victory overlay shown) — **any field modifiers currently placed on the playing field** (`modifiers` array length `>0` at win time) SHALL be **permanently removed from the player's supply**. For each placed modifier, the corresponding supply counter `supply[type]` SHALL be decremented by one (`supply[type] = max(0, supply[type]-1)`). The placed modifiers SHALL then be cleared from the field as before (RE-015). The supply reduction is permanent for the remainder of the run and SHALL persist across hole advances and via `saveProgress()`.

## Rationale
Previously modifiers were cleared on hole advance but supply remained unchanged, making modifiers essentially free rentals. Consuming the modifier from supply on win introduces meaningful strategic cost: placing a modifier helps beat the current hole but reduces future capacity, forcing the player to earn replacements via the reward menu (REQ-021). This ties the puzzle-shaping mechanic to long-term resource management without punishing experimentation that is undone before winning (mods removed via right-click before win are refunded and not consumed).

## Requirements

1. **Consumption Trigger in `src/main.js` (`handleNextHole()` / `advanceHole()` / `onHoleWin` / `loadLevel` transition):**
   - When a win is detected (`checkWin()` returns true, `gameState` becomes `WIN`, ball frozen, Victory overlay shown) **and** the player proceeds to the next hole (`Next` button click, `handleNextHole()`, or `advanceHole()` or `loadLevel(currentHoleIndex+1)`), the game SHALL **before clearing `modifiers`** iterate the current `modifiers` array snapshot and for each modifier `m` execute:
     ```js
     supply[m.type] = Math.max(0, supply[m.type] - 1);
     // m.type is 'amplify' | 'nullify' | 'flip'
     ```
     - Counting is per placed instance, not per type once. If `modifiers = [{type:'amplify'}, {type:'amplify'}, {type:'flip'}]` and `supply` was `{amplify:2, nullify:1, flip:1}`, then after win `supply` becomes `{amplify:0, nullify:1, flip:0}`.
     - The decrement SHALL be clamped at `0` (never negative). If supply is already `0` (should not happen due to placement guard, but handle), it stays `0`.
     - The operation SHALL be executed **exactly once per hole win**, even if `handleNextHole()` is called multiple times rapidly (guard with a `consumedForThisWin` flag or by clearing `modifiers` after consumption).
   - After the loop, `modifiers` SHALL be cleared (`modifiers = []`, `syncModifiersToField()`, `clearModifiers()`), as per REQ-015. The supply change SHALL then be reflected via `updateHotbarUI()` and `saveProgress()` (REQ-027) so the next hole's hotbar shows the reduced counts.
   - If the win is on the **final hole** (`currentHoleIndex === LEVELS.length-1`, `Game Complete!`), the consumption SHALL still occur before `clearProgress()`-related final reset? Clarification: On final hole, `handleNextHole()` routes to main menu via `clearProgress()` and `mainMenuVisible=true` per REQ-009/028, which resets supply to `{1,1,1}` for a new game. Consumption before that clear is moot. For final hole, either consume then immediately reset to `{1,1,1}` is acceptable; alternatively consume and then let `resetGameAfterWin`/`endRun` reset to `{1,1,1}`. Document that final-hole consumption is not observable because a new game resets supply. The normative behavior for non-final holes SHALL be consume then keep reduced supply for next hole.

2. **No Consumption on Non-Win Events:**
   - **Death resets** (`resetBall()` on obstacle/OOB, `R` during play) SHALL NOT consume supply — modifiers persist through death per REQ-015, supply unchanged.
   - **Manual removal** before win (right-click / `Delete` / `Backspace` on a modifier) SHALL NOT consume supply — it frees the slot (`activeCount` decreases) and the removed modifier is not counted at win time. `R` (ball reset) does not clear modifiers and does not consume.
   - **Drag** SHALL NOT consume.
   - **Abandon** via `End Run` (REQ-028) SHALL NOT consume; it clears `STORAGE_KEY` without supply changes beyond reset to `{1,1,1}`.

3. **Supply State & Persistence (extends REQ-020):**
   - `supply` remains `{amplify, nullify, flip}` integer `>=0`. After consumption, it MAY become `0` for a type. Placement remains guarded by `activeCount < supply[type]` (REQ-020 §2), so after consumption to `0` that type becomes unplaceable until a reward grants `+1`.
   - `saveProgress()` (REQ-027) SHALL be called after consumption (or `handleNextHole` already calls it) so reload via `Continue` preserves the reduced supply and the cleared modifiers. `loadProgress()` SHALL restore the reduced supply.

4. **Hotbar UI (extends REQ-020 §3 and REQ-015):**
   - After win consumption and before the next hole's `AIMING` state, `updateHotbarUI()` SHALL reflect the new supply. If a type was consumed to `0`, its slot SHALL appear disabled (`opacity 0.45`, `grayscale`, `cursor:not-allowed`, tooltip `No supply remaining`) until a future `Amplify`/`Nullify`/`Flip` reward re-adds supply.
   - `drawModifierPreview` and placement SHALL respect the new lower supply immediately on the next hole.

5. **Interaction with Existing Rules:**
   - REQ-015 §2.5 "modifiers cleared on advancing hole" remains, but now also clarifies **supply is decremented by the number of cleared modifiers**. REQ-020 §1 bullet "supply persists across hole advances" is superseded for the win case — it persists **minus consumed placed modifiers**.
   - REQ-009 §7 hole progression now includes supply consumption before `holeAttempts=0` and `loadLevel(next)`.

## Acceptance Criteria

- [ ] Start new game `supply={1,1,1}`, `modifiers=[]`. Place one `Amplify` (`1` → click at 300,300) so `modifiers.length===1` and `activeCount(amplify)===1`. Beat the hole (ball enters hole, `WIN`, click `Next`). After advancing, `getSupply().amplify === 0` (decremented by 1), `getSupply().nullify===1`, `getSupply().flip===1`, `modifiers.length===0`, hotbar `Amplify` now shows `0` or disabled (`1/1 placed` → now `0` remaining), and attempting to place Amplify on Hole 2 is rejected (`canPlace('amplify')===false`).
- [ ] With supply `{amplify:2, nullify:1, flip:1}`, place two Amplifies and one Flip (`modifiers` length 3: `amplify,amplify,flip`). Beat hole and advance. Supply becomes `{amplify:0, nullify:1, flip:0}` (2 amplify consumed, 1 flip consumed). `getSupply()` reflects this, `saveProgress()` persisted it, and reloading + `Continue` still shows `amplify 0` `flip 0`.
- [ ] Place one Amplify, then right-click it to remove it before winning (so `modifiers.length===0` at win). Beat hole. Supply remains `{1,1,1}` (removed modifier not consumed). Proves removal before win refunds and avoids consumption.
- [ ] Place one Amplify, die (hit obstacle, `resetBall()`), `modifiers` still length 1, `supply` still `{1,1,1}` (death does not consume). Beat hole afterward with that same Amplify still on field → supply becomes `{0,1,1}` only after the win, not after death.
- [ ] With `supply={1,1,1}`, place one of each type (3 mods: amplify, nullify, flip) and beat hole. After win `supply` becomes `{0,0,0}` all zero, next hole hotbar shows all disabled. Earning a reward menu after 5 counted shots on next hole and selecting `Amplify` grants `+1`, so `supply.amplify===1` and Amplify becomes placeable again.
- [ ] Advancing without any modifiers placed does not change supply: start `{1,1,1}`, beat hole with `modifiers=[]` → `supply` stays `{1,1,1}`.
- [ ] Final hole win: placed one `Nullify` with supply `{1,1,1}`, beat final hole, `Game Complete!` shown, clicking `Continue`/`Main Menu` resets to main menu and `clearProgress()` resets supply to `{1,1,1}` for next new game (consumption before reset is moot but not error). Starting a new course fresh shows `{1,1,1}` again.
- [ ] `saveProgress()` after win consumption: place one `Flip`, win Hole 1 `supply.flip 1→0`, `saveProgress()` called, reload page, main menu shows `Continue` visible, clicking `Continue` resumes Hole 2 with `supply.flip===0` and `modifiers=[]` (not lost).
- [ ] No negative supply: programmatically set `supply.amplify=0` and force a stale modifier array with one amplify (bypassing guard for test), beat hole → `supply.amplify` stays `0` (clamped, not `-1`).
- [ ] Rapid double `handleNextHole()` does not double-consume: beating Hole 1 with one `Amplify` and calling `handleNextHole()` twice quickly results in `supply.amplify===0` not `-1`, `modifiers=[]` after first call and second call no-ops.

## Dependencies
- REQ-009 (hole win, `handleNextHole`, `loadLevel`, Victory overlay)
- REQ-011 (game states, `resetBall`, `advanceHole`, `resetGameAfterWin`)
- REQ-015 (modifiers array, placement, clearing on hole advance)
- REQ-020 (supply state, `canPlace`, `addToSupply`, `updateHotbarUI`, persistence)
- REQ-021 (reward menu `+1` supply acquisition, now needed to replenish after consumption)
- REQ-027 (persistence via `saveProgress`/`loadProgress` with `supply`)
- REQ-003/010/034 (field, not directly, but supply affects placement)

## Notes
- Implementation sketch in `src/main.js:handleNextHole()`:
  ```js
  function handleNextHole(){
    if(gameState !== 'WIN') return;
    // Consume placed modifiers from supply before clearing
    for(const m of modifiers){
      if(m.type in supply) supply[m.type] = Math.max(0, supply[m.type] - 1);
    }
    updateHotbarUI();
    // Now clear field as before
    modifiers = [];
    syncModifiersToField();
    clearModifiers(); // if wrapper
    saveProgress(); // persist reduced supply + cleared mods
    // then advance as before
    if(currentHoleIndex < LEVELS.length-1){
      currentHoleIndex++; holeAttempts=0;
      secretRewardCounter=0; rewardPending = currentHoleIndex>0;
      loadLevel(currentHoleIndex);
      gameState='AIMING'; maybeShowRewardMenu();
    } else {
      // final hole: maybeUpdateCourseRecord then clearProgress + mainMenu
    }
  }
  // Alternative: consume in win detection before Next button, but exactly once.
  ```
- If `supply` is implemented as capacity (`activeCount < supply` check) the consumption reduces capacity for future holes; if implemented as consumable pool (`remaining = supply - activeCount`) the same loop applies. Ensure `updateHotbarUI()` shows `supply` after consumption, not `remaining`.
- Edge: `modifiers` cleared on hole advance already calls `syncModifiersToField()` so wind field for next hole starts without old modifiers.
- Test helper: expose `window.__getSupply()`, `window.__getModifiers()` for verification.

## File Paths
- `docs/requirements/REQ-035-modifier-supply-consumption-on-win.md` (this file)
- `src/main.js:1` (supply consumption loop in `handleNextHole`/`advanceHole`, before `modifiers=[]`, `updateHotbarUI`, `saveProgress`)
- `src/vectorField.js:1` (no change, but `syncModifiersToField` after clear)
- `index.html:1` (no DOM change, hotbar reflects new supply)
- `style.css:1` (no change, disabled styling already covers `supply===0`)
