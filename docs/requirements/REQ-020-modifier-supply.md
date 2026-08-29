# REQ-020: Modifier Supply & Inventory Limits

- **ID:** REQ-020
- **Title:** Modifier Supply & Inventory Limits
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Field Manipulation / Inventory

## Description
The player SHALL have a supply (inventory) of modifiers at his disposal. Each modifier type (`amplify`, `nullify`, `flip`) SHALL have its own independent counter in the supply. The number of active modifiers of a given type currently placed on the field SHALL NOT be allowed to exceed the current supply count for that type at time of placement. The supply SHALL start empty (all counters `0`) on a new game.

## Rationale
Unlimited placement (REQ-015 §2.5) removes strategic scarcity. An inventory model turns modifiers into a resource to be managed: the player must decide where to spend limited modifiers. Per-type counters give distinct scarcity per effect (e.g., many Amplify but few Flip). Starting empty ensures a clean baseline for a new run and allows future acquisition mechanics (pickups, rewards, level config) without legacy count leakage; until acquisition exists, the player simply cannot place.

## Requirements

1. **Supply State** in `src/main.js` (or `src/supply.js` / `src/vectorField.js` if extracted):
   - State SHALL be `supply = { amplify: number, nullify: number, flip: number }` with keys exactly `'amplify'|'nullify'|'flip'`.
   - Initialized to `{ amplify: 0, nullify: 0, flip: 0 }` on **new game**: page load / `initLevel()` for `currentHoleIndex=0`, `resetGameAfterWin()` (press `R` in `WIN` / `GAME_COMPLETE`), and full page reload.
   - Supply SHALL persist through death resets (`resetBall()` on obstacle/OOB) and through `R` during play (ball reset without scoring) — those SHALL NOT reset supply.
   - Supply SHALL persist across hole advances (`advanceHole()` / `handleNextHole() / loadLevel(n>0)` for sequential holes) — advancing SHALL NOT reset supply. Only a new game reset SHALL zero all counters. Placed modifiers (`modifiers` array) are still cleared on hole advance per REQ-015, but supply counters remain. If design later ties supply to per-hole grants, that SHALL be a separate REQ; for this REQ supply is global per run.
   - Future acquisition (e.g., `addToSupply(type, n)`, level config `supply:{amplify:2}`) SHALL increment the corresponding counter; this REQ only defines the container and limit, not the acquisition source.

2. **Placement Limit Enforcement** in `src/main.js:placeModifier()` and `src/input.js` / canvas handlers:
   - Before placing, the game SHALL count active modifiers of the selected type: `activeCount = modifiers.filter(m => m.type === selectedModifier).length`.
   - Placement SHALL be allowed **iff** `activeCount < supply[selectedModifier]`. If `supply[selectedModifier] === 0` or `activeCount >= supply[selectedModifier]`, placement SHALL be rejected: no modifier added to `modifiers`, no `syncModifiersToField()`, selection MAY remain (or optionally clear) but no placement occurs.
   - Dragging an existing modifier SHALL NOT consume or check supply (it only moves `x,y`). Removing a modifier (right-click / `Delete`/`Backspace` per REQ-015) SHALL free one slot, so a subsequent placement of that type SHALL again be allowed (`activeCount` drops by one). If supply is implemented as consumable pool (`remaining = supply - activeCount`), removal effectively refunds the slot; if implemented as decrement-on-place / increment-on-remove, behavior SHALL be equivalent.
   - Hotbar selection MAY still be allowed when supply is `0`, but placement preview SHALL indicate insufficiency (e.g., preview not shown, or shown in red/gray, slot visually disabled with opacity `0.45` and `cursor: not-allowed`). Alternatively selection SHALL be blocked/disabled when `supply[type] === 0` or `activeCount >= supply[type]`. Either approach satisfies the limit, but UI MUST communicate why placement does not occur.

3. **Hotbar UI** in `index.html` / `style.css` and `src/main.js:updateHotbarUI()` / `src/render.js`:
   - Each hotbar slot SHALL display its current supply count and active usage, e.g., `Amplify x2 (1/2 placed)` or simply remaining `Amplify: 0`, `Nullify: 1`, `Flip: 0`. At minimum, the slot label SHALL show the supply counter value (`supply[type]`) and be `0` on new game.
   - When `supply[type] === 0` or `activeCount >= supply[type]`, the slot SHALL appear disabled (e.g., `opacity 0.45`, `filter: grayscale(0.6)`, no highlight on click) and tooltip/title SHALL explain "No supply remaining" or "Limit reached (supply: N)".
   - When supply > activeCount, slot SHALL appear enabled with normal colors (`#e67e22` amplify, `#3498db` nullify, `#9b59b6` flip) and selection highlight per REQ-015 still applies.
   - Preview circle (`drawModifierPreview`) SHALL NOT be shown if supply insufficient for the selected type (or SHALL be shown in desaturated/red dashed variant to signal blocked placement).

4. **Interaction with Existing Modifier Rules** (REQ-015/016/017/018):
   - Supersedes REQ-015 §2.5 "any number of modifiers" and slot text "Amplify x5 infinite": the effective maximum per type is now `supply[type]`, and global maximum is `sum(supply)`. If `supply` is `{0,0,0}`, no modifiers can be placed at all.
   - All other REQ-015 behaviors remain: selection via `1`/`2`/`3` or click, deselection via `Escape`/same key/same button, `selectedModifier = null` after successful placement, draggable, right-click/`Delete` removal, hidden during `FLYING`/`WIN`, deterministic `getWindAt` stacking.

5. **Determinism & Persistence**:
   - Supply state SHALL be deterministic for the current run; reloading the hole SHALL NOT replenish supply (only `loadLevel` on hole advance keeps supply). `clearModifiers()` on hole advance SHALL NOT affect supply.

## Acceptance Criteria

- [ ] On fresh page load (new game) hotbar shows `Amplify 0`, `Nullify 0`, `Flip 0` (or `x0` badges) for all three slots, all disabled/grayed.
- [ ] With supply `{amplify:0, nullify:0, flip:0}`, selecting `Amplify` (`1`) and left-clicking canvas does NOT place a modifier: `modifiers.length` stays `0`, `getWindAt` unchanged, no orange circle added.
- [ ] After programmatically setting `supply = { amplify:1, nullify:0, flip:0 }` (or via future acquisition), hotbar shows `Amplify 1` enabled, others `0` disabled. Selecting Amplify shows orange preview; left-click places one amplify circle; `activeCount(amplify) === 1` and placement succeeds.
- [ ] With `supply.amplify === 1` and one amplify already placed, attempting to place a second amplify (re-select `1` and click) is rejected: `modifiers.filter(m=>type==='amplify').length` stays `1`, second circle not added. Hotbar Amplify now shows disabled/limit-reached (or `1/1 placed`).
- [ ] Supply `{amplify:2, nullify:1, flip:1}` allows 2 amplifies, 1 nullify, 1 flip simultaneously; placing a 3rd amplify is blocked, but placing the allowed nullify and flip each once succeeds (4 total modifiers on field).
- [ ] Right-clicking an existing amplify to remove it reduces `activeCount` to `1` (if supply 2) or `0` (if supply 1); re-selecting Amplify and clicking again now succeeds, proving removal frees the slot (refund).
- [ ] Dragging an existing modifier does NOT consume supply: dragging the single allowed amplify to a new position keeps `activeCount === 1` and does NOT block or require extra supply.
- [ ] Dying (obstacle/OOB) and `resetBall()` does NOT reset supply: supply stays `{amplify:1,...}` and active modifiers persist per REQ-015; counters not zeroed.
- [ ] Advancing to next hole (`handleNextHole`) clears `modifiers` (no circles visible) but supply remains `{amplify:1,...}` (not zeroed). Hotbar still shows `Amplify 1` enabled for next hole; player can place one amplify on new hole.
- [ ] Pressing `R` in `WIN` / `GAME_COMPLETE` (`resetGameAfterWin`) or reloading page resets supply to `{amplify:0, nullify:0, flip:0}` and hotbar shows all `0` again, no modifiers on field, no selection.
- [ ] `getWindAt` inside amplify still `5×`, nullify `0`, flip `-1×` as per REQ-016/017/018; supply limit does not alter effect math, only whether placement is allowed.
- [ ] No 3rd-party libraries; pure vanilla JS `supply` object and `modifiers` array length check.

## Dependencies

- REQ-015 (hotbar & placement system, circular area, `modifiers` array, `MODIFIER_RADIUS`)
- REQ-016/017/018 (per-type effects; supply is per-type)
- REQ-011 (reset / hole advance lifecycle)
- REQ-012 (UI / hotbar rendering)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let supply = { amplify: 0, nullify: 0, flip: 0 };
  function canPlace(type){ return modifiers.filter(m=>m.type===type).length < supply[type]; }
  function placeModifier(x,y){
    if(!selectedModifier || !canPlace(selectedModifier)) return;
    modifiers.push({ id: Date.now()+Math.random(), type:selectedModifier, x,y, radius:MODIFIER_RADIUS });
    syncModifiersToField();
    selectedModifier=null; updateHotbarUI();
  }
  function addToSupply(type, n=1){ supply[type]+=n; updateHotbarUI(); }
  // init/reset: supply = {amplify:0,nullify:0,flip:0}
  // advanceHole/loadLevel: do NOT reset supply
  // resetGameAfterWin: reset supply to 0
  ```
- If acquisition is not yet implemented, tests should set `supply` directly to verify limit logic. Future REQ may define pickups, level grants, or shop to increment supply.
- Hotbar badge example: `<span class="count">Amplify ×<em data-count="amplify">0</em></span>` updated in `updateHotbarUI()`.

## File Paths

- `src/main.js:1` (supply state, canPlace, placeModifier guard, addToSupply, resetGameAfterWin, loadLevel/advanceHole persistence)
- `src/vectorField.js:1` (unchanged; optional `getSupply` export if supply moved there)
- `src/render.js:1` (drawHotbar badge, disabled styling, preview blocked state)
- `src/input.js:1` (selection blocked feedback when supply insufficient, optional)
- `index.html:30` (hotbar slot count badges)
- `style.css:1` (disabled slot opacity/grayscale, count badge)

