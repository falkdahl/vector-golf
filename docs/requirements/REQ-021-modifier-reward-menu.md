# REQ-021: Modifier Reward Menu Every 5 Total Attempts

- **ID:** REQ-021
- **Title:** Modifier Reward Menu Every 5 Total Attempts (Inside Canvas)
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** New Feature - Reward / Inventory Acquisition

## Description
At the start of any total attempt whose number ends with `0` or `5` (i.e., `totalAttempts % 5 === 0`), the player SHALL be presented with a menu **inside the canvas** to select one of three options, each option being one distinct modifier type. The three options SHALL be `Amplify`, `Nullify`, and `Flip` (one of each, in that order). When a modifier option is selected, the supply of that modifier type (per REQ-020 `supply = {amplify, nullify, flip}`) SHALL increase by one and the menu SHALL close, returning the game to normal `AIMING` input.

## Rationale
Supply starts empty per REQ-020, so without acquisition the player can never place. A periodic reward every 5 total attempts gives a deterministic, performance-tied acquisition loop: the more attempts the player needs, the more tools they earn, smoothing difficulty and rewarding persistence. Triggering on `0` or `5` (every 5th attempt: 0, 5, 10, 15…) is trivial to compute (`%5`), easy to communicate, and aligns with the existing `totalAttempts` counter from REQ-014. Presenting inside the canvas (not DOM overlay) preserves the static-hosting, canvas-centric HUD style from REQ-012/REQ-014 and keeps the menu visible without separate DOM layout.

## Requirements

1. **Trigger Condition** in `src/main.js`:
   - The reward menu SHALL trigger at the **start** of an attempt where `totalAttempts % 5 === 0`.
   - `totalAttempts` is the global counter from REQ-014 (sum across all holes, incremented exactly once per `handleLaunch()`).
   - Trigger moments:
     - On **new game** (`totalAttempts === 0`) immediately after `initLevel()` / `loadLevel(0)` and before first aiming input — player starts with empty supply and must choose first modifier.
     - After any launch that causes `totalAttempts` to become `5, 10, 15, 20…` — at the next entry into `AIMING` (either after `resetBall()` on death/OOB or after ball comes to rest and is reset, or after advancing hole if the winning launch was the 5th/10th). The menu SHALL appear **before** the player can aim/charge/place the next shot.
   - The menu SHALL NOT trigger mid-flight (`FLYING`) or while `WIN` overlay is shown. It SHALL be evaluated whenever `gameState` transitions to `AIMING` with `totalAttempts % 5 === 0` and no reward is already pending/claimed for that `totalAttempts` value.
   - For each qualifying `totalAttempts` value, the reward SHALL be offered **exactly once**. Re-entering `AIMING` without incrementing `totalAttempts` (e.g., pressing `R` during play which does NOT increment) SHALL NOT re-trigger if reward already claimed for that value. After selection, the value is marked claimed; the next trigger is at `+5`.

2. **Menu State & Blocking** in `src/main.js`:
   - State SHALL be `rewardMenuVisible: boolean` and `rewardClaimedFor: number|null` (or `Set` of claimed attempt numbers) to enforce one claim per `5`.
   - While `rewardMenuVisible === true`, the game SHALL be in a blocking state:
     - `gameState` MAY remain `AIMING` but input for aiming (`ArrowLeft`/`ArrowRight`/`KeyA`/`KeyD`), charging (`Space`), launching, and modifier placement/dragging (`click`, `1`/`2`/`3`, `Escape`) SHALL be ignored. Alternatively a dedicated `REWARD` state may be introduced; either is acceptable if aiming/launch is blocked.
     - `update()` SHALL still advance particles/animations but SHALL NOT advance ball physics or allow `handleLaunch()`.
   - The hotbar (`#hotbar`) and canvas HUD (`drawHUD`) SHALL remain visible underneath the menu but hotbar selection SHALL be disabled while menu is open.

3. **Inside-Canvas Rendering** in `src/render.js`:
   - The menu SHALL be drawn **inside the canvas** via a function `drawRewardMenu(ctx, width, height)` called from `render()` when `rewardMenuVisible === true`, similar to `drawHUD` per REQ-012/REQ-014. It SHALL NOT be a DOM overlay (`#win-overlay` style) — it is a canvas overlay.
   - Visual spec (consistent with existing HUD `#3a9d23` fairway contrast):
     - Full-canvas dim `rgba(0,0,0,0.55)` behind menu.
     - Centered card `340×220` (or `360×200`) with `fill #fff`, `stroke #222 2px`, `borderRadius 12px`, `shadow 0 8px 30px rgba(0,0,0,0.4)`.
     - Title text `Choose a Reward` 18px `600 system-ui` `#222` centered at `cardY+28`.
     - Subtitle `Total Attempts: N` 12px `#666` below title, and hint `Every 5 attempts` 11px.
     - Three option buttons inside card, laid out horizontally with `gap 12px`, each `90×110`:
       - Button 1: `Amplify` border `rgba(230,126,34,0.9)` 2px, fill `rgba(230,126,34,0.12)`, icon `»` 22px `#e67e22`, label `Amplify` 13px `#222`, supply hint `+1 to supply`.
       - Button 2: `Nullify` border `rgba(52,152,219,0.9)`, fill `rgba(52,152,219,0.12)`, icon `∅` 22px `#3498db`, label `Nullify`.
       - Button 3: `Flip` border `rgba(155,89,182,0.9)`, fill `rgba(155,89,182,0.12)`, icon `⇄` 22px `#9b59b6`, label `Flip`.
     - Buttons SHALL show hover feedback when mouse is over: brightened fill (`0.22`), `scale 1.02`, `cursor pointer`.
   - Font hierarchy SHALL use `system-ui` only, no external assets, consistent with REQ-012.

4. **Selection & Supply Mutation** in `src/main.js` + `src/render.js` hit-testing:
   - The three options SHALL be selectable by **left-click inside canvas** on the button rectangles. Hit-testing SHALL be done in logical canvas coordinates (`900×600`) via `getCanvasMousePos()` same as modifier placement.
   - Optionally, keyboard `1` → Amplify, `2` → Nullify, `3` → Flip SHALL also select while menu is open (matches hotbar hotkeys per REQ-015).
   - On selection of type `t in {'amplify','nullify','flip'}`:
     - `supply[t]++` (exactly `+1`, via `addToSupply(t,1)` or direct `supply[t]+=1`) SHALL be executed once.
     - `updateHotbarUI()` SHALL be called so the hotbar badge reflects new supply (`0/1` → `1/1` etc.) as soon as menu closes.
     - `rewardClaimedFor = totalAttempts` (or add to `Set`) and `rewardMenuVisible = false`.
     - Menu SHALL close immediately; mouse cursor returns to `default`; normal `AIMING` input resumes. No additional placement is performed — player must then explicitly select from hotbar to place the newly acquired modifier.
   - Selection SHALL be idempotent: rapid double-click SHALL only grant `+1` once per trigger.

5. **Lifecycle & Persistence** per REQ-014/REQ-020:
   - `rewardMenuVisible` SHALL be `false` and `rewardClaimedFor` cleared on **new game** (`resetGameAfterWin()` or `currentHoleIndex=0, totalAttempts=0, holeAttempts=0` reset, and page reload). This causes the initial `0` reward to appear again on fresh start.
   - Death resets (`resetBall()`), `R` during play, and hole advances (`advanceHole()`/`handleNextHole()`/`loadLevel(n>0)`) SHALL NOT reset supply and SHALL NOT clear `rewardClaimedFor` except when advancing coincides with a new qualifying `totalAttempts` value. If advancing to a new hole leaves `totalAttempts %5===0` and that value was already claimed, no second menu SHALL appear for same value.
   - `FLYING` → `AIMING` transition via `resetBall()` after OOB/obstacle SHALL evaluate trigger before next launch.

6. **Determinism & No External Storage**:
   - Logic SHALL be `if (totalAttempts % 5 === 0 && rewardClaimedFor !== totalAttempts) showMenu()` evaluated on entry to `AIMING`. Deterministic per run, no `localStorage` required.

## Acceptance Criteria

- [ ] On fresh page load (`totalAttempts=0`, new game) the game shows a canvas-drawn reward menu centered **inside the canvas** (not DOM) before any aiming: dim background, white card titled `Choose a Reward`, subtitle `Total Attempts: 0`, three buttons `Amplify »` (orange), `Nullify ∅` (blue), `Flip ⇄` (purple) each with `+1 to supply`.
- [ ] While menu is open at `0`, pressing `Space` does NOT charge/launch, pressing `ArrowLeft`/`ArrowRight` does NOT rotate aim, clicking canvas outside buttons does NOT place a modifier, and hotbar `1`/`2`/`3` does NOT select a modifier for placement (only `1`/`2`/`3` to select reward if implemented) — input is blocked.
- [ ] Clicking the `Amplify` button (left third of card) closes the menu, `supply.amplify` becomes `1` (was `0`), `supply.nullify` and `supply.flip` remain `0`, hotbar badge updates to `Amplify 1/1` (or `1` enabled, others `0` disabled), and normal aiming resumes with `AIMING` state.
- [ ] Reload page again and instead select `Nullify` at `0`: `supply.nullify` becomes `1`, others `0`; similarly `Flip` grants `1` to flip only. Each option grants exactly `+1` of its type.
- [ ] After claiming at `0` and launching 5 times (totalAttempts increments `1→2→3→4→5`, with deaths/resets in between), at the moment `totalAttempts` becomes `5` and ball is reset to tee in `AIMING`, the reward menu appears again inside canvas showing `Total Attempts: 5` before the 6th attempt can be aimed.
- [ ] Claiming at `5` (e.g., choose `Flip`) makes `supply.flip` increment by `1` (if previously `1`, now `2` or if previously `0`, now `1`), menu closes, and no second menu appears for `5` on subsequent `R` resets without new launch.
- [ ] Launch 5 more times to `10`: menu appears again at start of `10`; each `5` interval grants exactly one `+1` and only once per value (rapid re-entry to `AIMING` without increment does not re-trigger).
- [ ] Hotbar placement still respects REQ-020 after reward: with `supply.amplify=1` can place one amplify; after placing it, active count `1/1` blocks second amplify until removal — reward grants supply, limit enforcement unchanged.
- [ ] Pressing `R` in `WIN`/`GAME_COMPLETE` (`resetGameAfterWin`) resets `totalAttempts=0`, `supply={0,0,0}`, clears `rewardClaimedFor`, and shows reward menu again at `0` on new run.
- [ ] Menu selection via keyboard `1`/`2`/`3` (if implemented) also works: at `0` pressing `1` grants Amplify `+1` and closes menu (optional but must not break hotbar `1` after menu closed).
- [ ] Rendering verification: `drawRewardMenu` is called inside canvas, arrows/HUD still drawn underneath dim, no DOM `#reward-overlay` is created; pure canvas + vanilla JS.
- [ ] No 3rd-party libraries; vanilla JS `totalAttempts %5`, `supply[t]++`, `rewardMenuVisible` boolean.

## Dependencies

- REQ-014 (attempts counter, `totalAttempts`, `handleLaunch`, `resetGameAfterWin`)
- REQ-020 (supply state, per-type counters, `supply[type]`, `addToSupply`, `canPlace`, `updateHotbarUI`)
- REQ-015 (modifier types and hotbar, but reward menu is separate acquisition UI)
- REQ-011 (game states `AIMING`/`FLYING`/`WIN`, `resetBall`, `loadLevel`, `advanceHole`)
- REQ-012 (rendering inside canvas, HUD style, `render()` draw order)

## Notes

- Implementation sketch in `src/main.js`:
  ```js
  let rewardMenuVisible = false;
  let rewardClaimedFor = null; // or Set
  function maybeShowRewardMenu() {
    if (totalAttempts % 5 === 0 && rewardClaimedFor !== totalAttempts && gameState === 'AIMING') {
      rewardMenuVisible = true;
    }
  }
  function claimReward(type){
    if(!rewardMenuVisible) return;
    addToSupply(type, 1); // supply[type]++
    rewardClaimedFor = totalAttempts;
    rewardMenuVisible = false;
  }
  // Call maybeShowRewardMenu() after initLevel(), after handleLaunch() increments totalAttempts and later resets to AIMING, after resetBall(), after loadLevel()/handleNextHole() if AIMING and %5.
  // In render(): if(rewardMenuVisible) drawRewardMenu(ctx, LOGICAL_W, LOGICAL_H, totalAttempts);
  // In input handlers: if(rewardMenuVisible){ handle 1/2/3 or click on buttons then return; block other input }
  ```
- Mouse hit-testing for buttons: define `getRewardButtonsLayout()` returning three `Rect {x,y,w,h,type}` centered at `(LOGICAL_W/2-108, cardY+60, 90,110)` etc., same coordinates used for `drawRewardMenu` and `click` detection via `getCanvasMousePos()`.
- If the game ever shows both `WIN` overlay (DOM) and reward menu (canvas), `WIN` takes precedence; reward for the winning attempt (if it was a `5`/`10`) SHALL appear after `Next`/`R` advances to next hole and enters `AIMING`.
- A11y: canvas text `Choose a Reward` must be 18px bold for readability on `#3a9d23` dim, same stroke strategy as HUD.

## File Paths

- `src/main.js:1` (rewardMenuVisible, rewardClaimedFor, maybeShowRewardMenu, claimReward, handleLaunch increment check, resetGameAfterWin clear, loadLevel/advanceHole/resetBall trigger, input blocking, click hit-test)
- `src/render.js:1` (drawRewardMenu, button layout, hover highlight, dim background)
- `src/vectorField.js:1` (unchanged)
- `index.html:1` (no DOM overlay for reward; canvas-only, hotbar remains)
- `style.css:1` (no new CSS needed for canvas menu; optionally cursor style)

