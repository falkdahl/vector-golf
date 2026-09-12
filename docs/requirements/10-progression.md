# 10 — Persistent Progression, Loadout & Coin Economy

- **ID:** 10-progression
- **Supersedes:** 06-wind-system.md §8 (initial supply), 08-rewards-and-progression.md §3 (on new game supply), 09-persistence-and-campaign.md §1 (storage keys)
- **Type:** Functional + Persistence + UI
- **References:** `02-canvas-system.md` (overlay bounds), `06-wind-system.md` (modifiers/supply), `07-level-generation.md` (holes), `08-rewards-and-progression.md` (rewards), `09-persistence-and-campaign.md` (campaign/courses)

## 1. Currency & Persistent Storage

### 1.1 Storage Keys

- **Key:** `PROGRESSION_KEY = "golfVectorField.progression.v1"`
- JSON `version:1` payload:
```js
{
  version:1,
  coins:number, // integer >=0, persistent currency
  personalSupply:{
    magnifier:number, liquifier:number, deflector:number, rotator:number,
    fieldExtender:number, powerCell:number, freeShot:number
  },
  savedAt:number
}
```
Legacy `personalSupply` keys `amplify/nullify/flip/rotate/areaUp` map to new names (magnifier/liquifier/deflector/rotator/fieldExtender).
Wrap in try/catch; corrupt/missing/version!==1 defaults to `coins:0, personalSupply: {magnifier:0, liquifier:1, deflector:0, rotator:0, fieldExtender:0, powerCell:0, freeShot:0}` (see §1.2). No other keys in this payload.

- **Loadout Key:** `LOADOUT_KEY = "golfVectorField.loadout.v1"`
- JSON `version:1` payload:
```js
{
  version:1,
  slots: Array<type|null> // length 4, each null or one of 7 types
  savedAt:number
}
```
`slots` is the last loadout confirmed via `Start Course` (`loadoutSlots` length 4, locked slots always `null`). `type` ∈ `['magnifier','liquifier','deflector','rotator','fieldExtender','powerCell','freeShot']` (legacy `amplify/nullify/flip/rotate/areaUp` normalized). Corrupt/missing/version!==1 or `slots` not length 4 → treat as no saved loadout (`getLastLoadout()===null`, `hasLastLoadout()===false`). Persisted via `setLastLoadout(slots)` / `getLastLoadout()` / `clearLastLoadout()` in `src/progression.js`; survives `clearProgress()` and campaign regeneration (loadout is personal, not per-campaign). Exposed as `window.__LOADOUT_KEY`, `window.__getLastLoadout`, `window.__setLastLoadout` for tests.

### 1.2 Starting Values

- Fresh install (no `PROGRESSION_KEY`): `coins=0`, `personalSupply = {magnifier:0, liquifier:1, deflector:0, rotator:0, fieldExtender:0, powerCell:0, freeShot:0}`.
- Player starts with **just a Liquifier** (`liquifier:1` only, others `0`) and `0` for passives (`fieldExtender:0, powerCell:0, freeShot:0`). This supersedes `06-wind-system.md §8` `supply={1,1,1,1,0}` for **persistent** storage; run supply is now derived from loadout (see §2), not this default. Previous spec that started with one of each spatial is now superseded by Liquifier-only.
- **Course completion bonus:** `COURSE_COMPLETE_BONUS = 50` coins awarded once per full course clear (final hole WIN), in addition to `COINS_PER_HOLE` per hole. On full course completion, `runCoinsEarned` gains `+50` before persisting (e.g. 3 holes + course = `3×10+50=80`). This is the only bonus beyond per-hole.
- Loadout slots are **progressively unlocked**: initially only **1 slot** unlocked. Second slot unlocks when the **3-hole course is cleared** (`courses.find(c=>c.holeCount===3).bestTotal !== null`), third when **6-hole cleared**, fourth when **9-hole cleared**. Check `isStageUnlocked`-style but for slots: `getUnlockedLoadoutSlots()` returns `1 + (cleared3?1:0) + (cleared6?1:0) + (cleared9?1:0)` clamped `1..4`. Locked slots are visible as `🔒` with `opacity 0.45`, `cursor not-allowed`, cannot be filled.
- Personal storage **never depletes on use**: picking loadout items does NOT decrement `personalSupply`; shop purchases increment `personalSupply[type]++` forever (once acquired, owned forever). `supply` (run inventory) is separate ephemeral copy derived from loadout + in-run pickups (rewards, placement).

### 1.3 Earning — 10 Coins Per Hole Cleared

- `COINS_PER_HOLE = 10` (normative).
- When a hole is cleared (ball enters hole), the **run-earned coins** increase by 10. Non-final advance and final win both count. `runCoinsEarned = holesClearedInRun * 10`, `holesClearedInRun = number of holes successfully entered before run end`.
- Coins are **not added to persistent `coins` immediately per-hole**; they are **accrued as pending** in `runCoinsEarned` until run ends (see §1.4). This keeps persistent coins deterministic on crash.
- Treasure or rewards do not give coins.

### 1.4 Spending & Persisting on Run End

- At **run end** (any transition back to main menu): `returnToMainMenu()` (final WIN continue), `handleGameOverReturn()` (Game Over → Continue), `endRun()` (Pause → End Run), the accrued `runCoinsEarned` is atomically added to `progression.coins` (`coins += runCoinsEarned`) and `saveProgression()` is called. `runCoinsEarned` then resets to 0 for next run.
- Run end triggers **Coin Summary Overlay** (§4) showing `You earned X coins: Y holes × 10` plus breakdown `holesCleared` and why. Overlay is shown after `mainMenuVisible` becomes true, on top of main menu. Dismiss via `OK`/`Continue` or `Escape`/click.
- If run ends with 0 holes cleared (immediate End Run / Game Over on hole 1 without clearing), summary still shows `0 coins: 0 holes ×10` (edge case allowed, but overlay still shown for 0+ holes; if 0 holes, may show `No holes cleared — 0 coins`).

### 1.5 Shop Prices

- Spatial field modifiers (Magnifier, Liquifier, Deflector, Rotator) — **50 coins each** (`SHOP_PRICE_SPATIAL = 50`).
- Passive upgrades (Field Extender, Power Cell, Free Shot) — **100 coins each** (`SHOP_PRICE_PASSIVE = 100`). Free Shot here is persistent supply count (+1 per purchase); in-run it shows as `Attempts Left: X (+Y)` supply, not a placed circle.
- `costFor(type)` helper: `['magnifier','liquifier','deflector','rotator'] → 50`, `['fieldExtender','powerCell','freeShot'] (aliases areaUp) → 100`.
- `canAfford(type)` checks `coins >= costFor(type)`. `purchase(type)` if affordable: `coins -= cost; personalSupply[type]++ ; saveProgression()` returns true else false. No decrement of personalSupply on use.

## 2. Loadout Screen — Before First Hole

### 2.1 Trigger

- When player clicks a **course play button** in `#staged-course-list` (any unlocked stage 3/6/9/18), instead of immediately `handleCoursePlay(courseId)` → `loadLevel(0)`, the game shall show **Loadout Overlay** `#loadout-overlay` (HTML, `position:absolute; inset:0; z-index:13` above main menu but below help) and remain in `mainMenuVisible=true` until loadout confirmed.
- Loadout is **blocked if `hasRestorableSave()` true** (ongoing run auto-resumes; no loadout while resuming). Only fresh-course start from main menu shows loadout.
- Loadout state: `loadoutVisible:boolean`, `loadoutCourseId:string|null`, `loadoutSlots: Array<type|null> length 4` (each slot `null` or one of 7 types), `pendingRunCoins` not shown.

### 2.2 Layout — Covers Whole Canvas, Two Columns (Loadout left, Shop right) + Item Picker Overlay

```html
<div id="loadout-overlay" class="hidden">
  <div class="loadout-card">
    <h2 class="loadout-title">Choose Your Loadout</h2>
    <div class="loadout-gap loadout-gap--title-loadout" aria-hidden="true"></div>
    <div class="loadout-layout">
      <div class="loadout-left">
        <div class="loadout-section">
          <div id="loadout-slots" class="loadout-slots"></div>
        </div>
      </div>
      <div class="loadout-gap loadout-gap--loadout-shop" aria-hidden="true"></div>
      <div class="loadout-right">
        <div class="loadout-shop-section">
          <div class="shop-header" style="display:flex; align-items:center; gap:8px; justify-content:center;">
            <h3>Shop</h3>
            <span id="loadout-coins">💰 0</span>
          </div>
          <div id="shop-grid" class="loadout-shop"></div>
        </div>
      </div>
    </div>
    <div class="loadout-actions">
      <button id="loadout-start-button">Start Course</button>
      <button id="loadout-cancel-button">Cancel</button>
    </div>
  </div>
</div>
<!-- Item picker overlay — shown when a loadout slot is clicked -->
<div id="loadout-item-picker-overlay" class="hidden">
  <div class="loadout-picker-card">
    <h3>Your Items</h3>
    <p class="loadout-picker-subtitle">Select an item for this slot — your items never deplete</p>
    <div id="loadout-picker-grid" class="loadout-picker-grid"></div>
  </div>
</div>
```

- `#loadout-overlay` is `position:absolute; inset:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); border-radius:0; z-index:13` when visible, `hidden` otherwise. **Must cover whole canvas edge-to-edge** (`inset:0; width:100%; height:100%; border-radius:0; padding:0`) with no gap, no border radius, no inner margin, blocking all underlying content. The inner `.loadout-card` similarly shall be `width:100%; height:100%; max-width:100%; max-height:100%; border-radius:0; padding:14px;` to fill edge-to-edge (no visible game/container edge behind). Blocks `handleLaunch`/placement/pause. The loadout title is `h2.loadout-title` `Choose Your Loadout` only — no subtitle `p.loadout-subtitle` shall exist in `#loadout-overlay` (`document.querySelector('#loadout-overlay .loadout-subtitle')===null`); the subtitle lives only in picker overlay.
- **Layout zones**: `.loadout-layout { display:flex; flex-direction:column; gap:0; width:100%; flex:1 1 auto; overflow:hidden; min-height:0; align-items:center; }` — **stacked vertically**: **top** holds **only Loadout**, **bottom** holds **only Shop** (not side-by-side). Must be stacked even on wide canvas; no side-by-side columns. The loadout screen shall **only contain the Loadout and Shop panels** — Your Items is **not** in the main layout (no `#personal-items-grid` inside `.loadout-card`); instead Your Items is shown via **picker overlay** `#loadout-item-picker-overlay` when a slot is clicked. **Flexible gaps:** The card contains two flexible spacers `.loadout-gap { flex:1 1 0; min-height:12px; max-height:64px; width:100%; }` — `.loadout-gap--title-loadout` between title and `loadout-layout` and `.loadout-gap--loadout-shop` inside `loadout-layout` between loadout-left and loadout-right. Both gaps are `flex:1` and expand to fill remaining vertical space if shop cards don't need it, so cards stay compact and gaps grow; when no extra room they collapse to `12px`. This ensures shop cards are not stretched.
  - `.loadout-left` is `display:flex; flex-direction:column; gap:12px; overflow:visible; min-height:0; flex:0 0 auto; width:auto; max-width:100%;` containing:
    - Loadout section: **no title** (`document.querySelector('.loadout-section h3')===null`, no `Loadout` heading in panel). **The loadout panel shall just take up the space it needs for the slot cards to show with a little margin around it** (`flex:0 0 auto`, `height:auto`, `width:auto; max-width:100%;` not `flex:1` full height). Slots are styled **like the reward menu** (see below) and displayed **on a horizontal line** (`grid-template-columns:repeat(4,1fr)` or `display:flex; gap:6px;` with 4 slots in one row, not 2×2 stacked), `gap:6px;` so slots sit side-by-side horizontally and are **centered** (`justify-content:center; align-items:center;` on `.loadout-section`). **Loadout panel shall have no background and no border** (`background:transparent` or `none`, `border:none` or `transparent`, `getComputedStyle(.loadout-section).backgroundColor` is `transparent`/`rgba(0,0,0,0)` and `borderWidth === 0` or `borderColor transparent`), so Shop's background distinguishes it. **Loadout panel is compact** (`width:auto; max-width:100%;` not full width).
  - `.loadout-right` is `display:flex; flex-direction:column; overflow:visible; min-height:0; flex:0 0 auto; width:auto; max-width:100%;` containing:
    - Shop section: `flex:0 0 auto; overflow:visible; width:auto; max-width:100%; align-items:center;` title `Shop` (must equal text `Shop`) with coins badge `#loadout-coins` showing `💰 N`. Shop grid inside is compact (see below) and does **not** stretch to fill remaining height — remaining height is filled by the two flexible gaps. Section has distinct visual background `rgba(230,126,34,0.09)` border `rgba(230,126,34,0.18)` or course-themed tint. Loadout height is auto (`flex:0 0 auto`), Shop height is auto (`flex:0 0 auto`), gaps (`flex:1`) fill rest.
- **Visual differentiation**: Shop has distinct background/border tint using course palette: Shop warm orange `rgba(230,126,34,0.09)` border orange — loadout panel is intentionally transparent/no border so contrast is via Shop's tint (still testable as Shop's background vs loadout's transparent). Padding `10px` border-radius `8px` for Shop; loadout panel has no background/border but same padding for alignment.
- **Loadout Slots** `#loadout-slots`: styled **like reward menu** — each slot `div.loadout-slot[data-slot]` is `~96×120` (or `108×138` responsive) with same background/border per type as reward buttons (`magnifier orange rgba(230,126,34,0.28) border #e67e22`, `liquifier blue`, `deflector purple`, `rotator red`, `fieldExtender/powerCell gray`, `freeShot gold`), rounded `10px`, centered icon `48×48`, label `700 11px` white. **Empty (unlocked) slots shall show a plus sign `+` to indicate clickability** (`div.loadout-slot.empty .ls-plus` text `+` `font:700 22-26px` `color:rgba(255,255,255,0.85)` centered, visible `getComputedStyle !== none`, alongside or above `Empty`), in addition to `Empty`. Locked slots have `opacity 0.45`, `cursor not-allowed`, `🔒` centered, no interaction, **and visible explanation when they will unlock** (`title` contains `clear 3 holes` / `clear 6 holes` / `clear 9 holes` **and** visible text `Clear 3 holes to unlock` / `Clear 6 holes to unlock` / `Clear 9 holes to unlock` inside or below the lock, with `opacity 0.85`, `font:600 9px`, not just title tooltip). Unlocked empty slots show `Empty` **and `+`**. **Grid is horizontal line, closer together and centered**: `display:flex; gap:4px; justify-content:center; width:auto; margin:0 auto;` with 4 slots in one row (`flex-direction:row`, not `wrap` to 2×2, `gap:4px` not `6px`, `width:auto` centered), not stacked vertically. On narrow width may wrap but on 1280×720 canvas they are in one row centered with little gap.
- **Item Picker Overlay** `#loadout-item-picker-overlay` — `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55); z-index:14; padding:0;` (above loadout, below help, centered). Card `.loadout-picker-card` `background:rgba(0,0,0,0.88); padding:16px; border-radius:10px; display:flex; flex-direction:column; gap:10px; align-items:center; width:100%; max-width:100%; max-height:100%; overflow:visible; box-sizing:border-box;` **covers whole canvas horizontally** (`width:100%; max-width:100%;` so single row does not clip, `getBoundingClientRect().width` within `8px` of container width, no scrollbar `overflow:visible` not `auto`, `scrollWidth <= clientWidth`); with title exactly `Your Items` (`h3` text `Your Items`), subtitle `Select an item for this slot — your items never deplete` and grid `#loadout-picker-grid.loadout-picker-grid` showing **larger cards so image and text both fit**: each cell `div.picker-item[data-type]` is **square larger `72-80px` (`min 70px`) with `width`/`height` `72-80px`**, `padding:8px 6px`, `gap:4px`, `border:2px solid`, background per type, icon `40-44px` (`width:40px;height:40px;`) larger than previous `32px`, name `600 10px`, `Owned: xN` `600 9px`, both visible inside card without clipping (`overflow:visible;` and `min-height` ensures text not cut). **Grid is on a single row, no wrap, no scrollbar, centered** (`display:flex; flex-wrap:nowrap; overflow:visible; gap:8px; justify-content:center;` not `wrap`/`auto` with scrollbar), `white-space:nowrap` behavior, `flex:0 0 auto` per item, centered in middle of canvas (`align-items:center; justify-content:center;` on overlay). **Only show owned items plus Clear Slot** (`personalSupply[type]>0` plus one `Clear slot` item last), same filtering (`querySelectorAll('.picker-item').length` equals owned count +1 for Clear), **no overlap**, `gap 8px`, centered. **Clear Slot button shall be last** in DOM order (`picker-grid.lastElementChild` is `.picker-clear` with text `Clear slot`, `dataset.type === ''` or `clear`). Clicking a picker item selects that type for the clicked slot (`loadoutSlots[slotIndex]=type`, respecting `countInLoadout<owned` and `unlocked` slots, toast if blocked), closes picker via backdrop/pick, updates loadout. Picker has **no Close button** (`document.getElementById('loadout-picker-close')===null`); closing is via picking an item, `Escape`, or clicking backdrop (which are sufficient). Subtitle `Select an item...` remains.
- **Shop Grid** `#shop-grid`: `display:grid; grid-template-columns: repeat(3, 88px); gap:8px; justify-content:center; width:auto; max-width:100%; flex:0 0 auto; overflow:visible;` each `div.shop-item[data-type]` is `width:88px; min-height:88px; height:auto; box-sizing:border-box; flex:0 0 auto; overflow:visible; display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 6px;` and shows **only name and cost** (no owned count line) — exactly two text nodes: name (e.g. `Magnifier`) and price `💰50` or `💰100` (updated prices) with moneybag emoji (must contain `💰` and number `50`/`100`, no word `coins` in that element's text per acceptance). Icon `32×32` top, name `600 9px` centered, price `600 10px`. **Buy button is inside the card via same flex layout**: `button` is child of `.shop-item` (`shopItem.querySelector('button')` parent is `.shop-item`, `shopItem.contains(button)` true, `button.getBoundingClientRect()` inside `shopItem.getBoundingClientRect()` with a small gap), laid out as `margin-top:4px; padding:4px 10px; font:700 9px;` in the flex column (`gap:4px`) so it sits below price with a clear gap and does not overlap, and the card `height:auto` takes only as much space as needed (icon+name+price+button) without expanding to fill extra grid space. Grid is centered and only takes as much space as cards need (`width:auto; justify-content:center;` not full width stretch); extra vertical room is filled by the two flexible gaps, not by stretching cards. **Shop shall only show items where `personalSupply[type] < MAX_LOADOUT_SLOTS (4)`** — if owned reaches max (4) the item is **removed from the shop** (`querySelector('.shop-item[data-type="magnifier"]')===null` when owned 4). Thus you cannot buy more than max slots.
- All icons use relative `./img/...` same as hotbar/reward: `magnifier-icon.png`, `liquifier-icon.png`, etc.
- Shop price text must be `💰 N` (e.g. `💰30`, `💰 30`, `30 💰` acceptable if contains `💰` and `30`/`50`, but not the word `coins`). Personal Items shows `Owned: xN` (`x1`/`x2` etc.) for visible items.
- **MAX_LOADOUT_SLOTS = 4** (normative). Purchase capped at 4 per type.

### 2.3 Interactions

- **Adding to loadout via picker overlay:** The main loadout screen **only shows Loadout and Shop** (no Your Items grid in main overlay; `document.getElementById('personal-items-grid')` shall be `null` or not inside `#loadout-overlay`'s visible layout, instead Your Items lives in picker overlay). Clicking an **unlocked** `loadout-slot` (empty or filled) opens the **Your Items picker overlay** `#loadout-item-picker-overlay` (not clearing immediately). The picker shows **larger cards** (`width 72-80px`, `img 40-44px`) for each owned type (`personalSupply[type]>0` only, filtering same as before, `querySelectorAll('.picker-item').length === ownedCount`), plus a `Clear slot` / `Empty` option to remove item. Clicking a `picker-item` with `owned>0` attempts to set `loadoutSlots[slotIndex]=type`, constrained by ownership count: if `countInLoadout >= owned` for that type, blocked (toast `Not enough owned` or no-op, picker stays open). Also blocked if slot is locked. On success, `loadoutSlots[slotIndex]=type`, close picker, `syncLoadoutOverlay()`. Does NOT decrement `personalSupply`. Clicking `Clear slot` clears that slot (`loadoutSlots[slotIndex]=null`, compact logic optional but keep slot null), close picker. Locked slots ignore clicks (do not open picker, cursor not-allowed). Shop purchase does not auto-fill slot; picker grid updates to show new owned count (only owned items shown in picker).
- **Your Items Filtering (picker):** `#loadout-picker-grid` **only renders types with `owned>0`**; types with `0` are not present in DOM (`document.querySelector('.picker-item[data-type="magnifier"]')` is `null` when owned 0). No overlap: picker items have distinct bounding rects, no intersecting, `gap 8px`, `justify-content:center`.
- **Shop Buy & Max Cap:** Clicking `Buy` on a `shop-item` if `coins >= price` and `owned < MAX_LOADOUT_SLOTS (4)` → `coins-=price; personalSupply[type]++ ; saveProgression(); syncLoadoutOverlay(); syncPickerIfOpen()`; if insufficient funds, button disabled. If `owned >=4` before buy, that `shop-item` is **not rendered at all** (removed from shop) so you cannot buy more than max slots. Price display is `💰50`/`💰100` (updated prices, moneybag emoji, no `coins` word, only name + price + Buy button).
- **Slot Unlock Visual & Hint:** Locked slots show `🔒` centered, `opacity 0.45`, `cursor not-allowed`, cannot be filled and **do not open picker**. Each locked slot must have a **visible explanation** of when it unlocks: `title` containing `clear 3 holes` / `clear 6 holes` / `clear 9 holes` **and** visible text `Clear 3 holes to unlock` (slot index 1→3 holes, 2→6 holes, 3→9 holes) either inside the slot (`div.loadout-slot.locked .ls-unlock`) or as small `8-9px` text below `🔒` (`opacity 0.85`), not just tooltip. Titles must be exactly `Loadout`, `Shop`, `Your Items` (case-sensitive) in `h3` headings (Your Items title lives in picker card, not main loadout; main loadout headings are `Loadout` and `Shop` only). No hint paragraph `Click an item...` exists (`document.querySelector('.loadout-hint')===null`).
- **Picker overlay interactions:** `#loadout-item-picker-overlay` is `position:absolute; inset:0; z-index:14; background:rgba(0,0,0,0.55);` hidden unless a slot was clicked (`pickerVisible`/`pickerSlotIndex`). Shows `Your Items` title (`h3` exactly `Your Items`), subtitle, grid of **larger** `picker-item` cards (`72-80px`, `img 40-44px`), Close button `#loadout-picker-close` and backdrop click close. `Escape` closes picker without changing slot (if picker open, Escape closes picker, not the whole loadout). `pickerItem` cards have same color/border per type, show name + `Owned: xN`.
- **Start Course:** `#loadout-start-button` → validates `loadoutSlots` has at least 0 filled (allow 0..unlockedCount). If valid, call internal `startCourseWithLoadout(loadoutCourseId, loadoutSlots.filter(Boolean))` which:
  1. `activeCourse = findCourseById(loadoutCourseId); LEVELS=activeCourse.holes;`
  2. Derive run `supply` from loadout: counts per type in slots. For spatial types (`magnifier/liquifier/deflector/rotator`) `supply[type] = countInSlots` (0..4). For passives: `fieldExtenderCount = count of 'fieldExtender' in slots`, `powerCellCount = count of 'powerCell' in slots`, `supply.freeShot = count of 'freeShot' in slots` (each slot contributes 1; not 3 — 3 is reward bonus). Legacy `areaUp` alias→fieldExtender. `isFreeShotActive=false` initially.
  3. `currentHoleIndex=0; holeAttempts=0; totalAttempts=0; runHolesCleared=0; runCoinsEarned=0;`
  4. `clearProgress()` then `loadLevel(0); gameState='AIMING'; mainMenuVisible=false; loadoutVisible=false; pickerVisible=false; saveProgress();`
- **Cancel:** `#loadout-cancel-button` or `Escape` or clicking backdrop (when picker not open) → `loadoutVisible=false; loadoutCourseId=null; pickerVisible=false;` returns to main menu, no state change. When picker open, `Escape`/backdrop closes picker only.

### 2.4 Persistence

- `personalSupply` and `coins` survive `clearProgress()` (run clear only removes `STORAGE_KEY`, not `PROGRESSION_KEY`). Campaign regeneration (`regenerateCampaign`/`applyManualSeed`) does NOT reset `coins`/`personalSupply` (keep across campaigns) unless explicitly cleared via new `clearProgression()` debug helper (not exposed).
- Shop prices are fixed; no discount.

### 2.5 Loadout Persistence — Last Loadout Pre-loaded, Random Fallback

- **Saved in persistent storage:** Every successful `Start Course` (`startCourseWithLoadout`) shall persist the confirmed `loadoutSlots` (length 4, copy `[...loadoutSlots]`) via `setLastLoadout(slots)` to `LOADOUT_KEY`. This is the **last loadout** and survives `clearProgress()`, `endRun`, `Game Over`, and campaign regeneration (loadout is personal, like `personalSupply`). `clearLastLoadout()` debug helper may clear it.
- **Pre-loaded on Loadout screen:** When the player opens the Loadout screen (clicking any unlocked course play button → `showLoadout(courseId)` / `handleCoursePlay(courseId)`), before rendering slots:
  1. If `hasLastLoadout()===true` (`getLastLoadout()!==null`): validate the saved `slots`: for each index `i` `0..3` if `i >= getUnlockedLoadoutSlots()` → force `null` (locked), else check `type` is in `VALID_LOADOUT_TYPES` and `personalSupply[type] > usedCount` (respect owned count, duplicates limited by owned), otherwise `null`. Used count tracks duplicates so `magnifier:1` cannot fill two slots. Validated array becomes `loadoutSlots` (even if all `null` — empty saved is respected, not re-randomized).
  2. Else (`hasLastLoadout()===false` / no saved loadout in storage): **pick a random item from the player's storage for each unlocked loadout slot**: for `i=0..unlocked-1` build `candidates = VALID_TYPES.filter(t => (personalSupply[t]??0) - used[t] > 0)` (owned>0 respecting remaining). If `candidates` empty → `null`, else pick `candidates[Math.floor(Math.random()*candidates.length)]` uniformly, decrement `available`. Locked slots remain `null`. This ensures fresh install with only `liquifier:1` gets `liquifier` in slot 0, and richer inventories get fully random distribution without exceeding owned.
- Random uses `Math.random()` (loadout is UX, not deterministic campaign seed). Validation ensures saved loadout never exceeds owned or unlocked; excess duplicates are dropped to `null` and not re-randomized (player can re-fill via picker).
- `showLoadout` is the single entry for course play; `handleCoursePlay` shall delegate to `showLoadout` so persistence logic is not bypassed.

## 3. Run Supply Derivation

- **Run `supply` is ephemeral** (`src/main.js:supply`) derived only at loadout confirm. It is persisted in `STORAGE_KEY` per existing save, but `personalSupply` is separate persistent key.
- In-run `addToSupply` (rewards) increments `supply` (run inventory) only, not `personalSupply`. `personalSupply` only grows via shop. Thus personal storage never depletes.
- Hotbar shows `supply` counts (run inventory) after loadout, not `personalSupply`.

## 4. Coin Summary Overlay (On Run End) — Reward-Like Full Screen with Black Card

- **Overlay** `#coin-summary-overlay` is a **full screen overlay with transparent black backdrop** (`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.55); border-radius:8px; z-index:14` above main menu but below help). Card structure:
```html
<div id="coin-summary-overlay" class="hidden">
  <div class="coin-summary-card">
    <h3>Run Complete</h3>
    <div class="coin-summary-big">
      <span id="coin-summary-amount">+50</span>
      <span class="coin-big-icon">💰</span>
    </div>
    <div id="coin-summary-details" class="coin-details-rows">
      <!-- e.g. <div class="coin-detail-row">Hole cleared - 10💰 (x3)</div> -->
    </div>
    <div id="coin-summary-unlock" class="coin-unlock-info">Loadout slot unlocked</div>
    <button id="coin-summary-ok">Continue</button>
  </div>
</div>
```
- **Card with slightly transparent black background** (`background:rgba(0,0,0,0.72)` to `0.78` e.g. `0.75`, `padding:20px 24px`, `border-radius:10px`, `box-shadow:0 4px 20px rgba(0,0,0,0.6)`) around the information, so it is readable over main menu but slightly see-through (`getComputedStyle(.coin-summary-card).backgroundColor` is `rgba(0,0,0,0.72-0.78)` not fully opaque `0.88` nor `transparent`, `opacity` between `0.70` and `0.85`). Card remains centered in overlay (`align-items:center; justify-content:center; gap:16-20px` a little bigger between big row and breakdown).
- **Title** must be exactly `Run Complete` (`h3` text `Run Complete`, matching reward title style `700 22px` white with `stroke 5px`, gap ~12px below title).
- **Big moneybag**: centered below title, number **before** moneybag icon with plus sign (`#coin-summary-amount` text `+50` before `.coin-big-icon` `💰`, `font:700 28-36px`, color `#FFD700`, e.g. `+50💰` visible as `+50` + `💰`). HTML order is amount then icon (`<span id="coin-summary-amount">+50</span><span class="coin-big-icon">💰</span>`) or equivalent flex order where amount precedes icon visually. Must contain `+` and numeric amount and `💰` (e.g. `+50` + `💰` in `.coin-summary-big`). **Money bag on this row is slightly smaller** (`font-size: 42-48px`, not `56px`, `getComputedStyle(.coin-big-icon).fontSize` `42-50px`).
- **Gap bigger**: the vertical gap between the `+X💰` row (`.coin-summary-big`) and the breakdown row (`.coin-detail-row`) is a little bigger than before (`gap:16-20px` on card or `margin-top:8-12px` on details, `getComputedStyle` gap `>=16px`).
- **Breakdown rows** below the moneybag: first row exactly `Hole cleared - 10💰 (x3)` format — must contain `Hole cleared`, `-`, `10💰` (number before 💰) and `(x3)` / `(xN)` count suffix. Example `Hole cleared - 10💰 (x3)` for 3 holes, `Hole cleared - 10💰 (x1)` for 1 hole. Normative: visible row inside `#coin-summary-details` must contain `Hole cleared` (case-insensitive), `-`, `10💰` and `(x` with the hole count (e.g. `(x3)`). **Second row when course was cleared (bonus awarded, `+50`): exactly `Course cleared, 50💰` (must contain `Course cleared`, `50`, `💰`, number before 💰, e.g. `Course cleared, 50💰` or `Course cleared, +50💰`) as second `.coin-detail-row` inside `#coin-summary-details` when `isCourseComplete` (`coins === holes*10+50`). When course not cleared, only the first row is shown.** Do **not** show text `0 hole clears × 10`, `You earned 30 coins: 3 holes × 10 coins per hole` or `3 holes cleared — 10 per hole` in the overlay (`#coin-summary-text` and `#coin-summary-breakdown` shall be hidden `display:none` or not visible, `getComputedStyle === none` or `hidden` attribute, and not containing that phrasing, and do not show `×` style). Only the big `+X💰` and the breakdown(s) remain.
- **Loadout slot unlock display**: Below the breakdown, card **conditionally** shows **bigger text just `Loadout slot unlocked`** (`#coin-summary-unlock.coin-unlock-info` text exactly `Loadout slot unlocked` case-insensitive, `font:700 14-16px` larger than before, `color:white` or `#A8E6A3`, centered) **only when a new loadout slot was actually unlocked in that run** (`getUnlockedLoadoutSlots() > loadoutUnlockedAtRunStart`, where `loadoutUnlockedAtRunStart` is captured at `startCourseWithLoadout` — e.g. start 1, after clearing 3-hole course current 2 → show; if no new slot (e.g. End Run with 0 holes or replaying already-unlocked stage) then hide `display:none`). This fixes the bug where it said unlocked when it didn’t. Must be inside `#coin-summary-overlay`; when hidden `getComputedStyle === none` or `hidden`.
- Background is **transparent black backdrop** exactly `rgba(0,0,0,0.55)` (not opaque `#000` or `0.85`), covering whole canvas (`inset:0`), like reward overlay, but card itself is opaque black for readability.
- Triggered only when money was gained (`coins > 0`): on run end that returns to main menu with at least 1 hole cleared (or course bonus). **Do not show the overlay if no money was gained** (`coins === 0`, e.g. End Run or Game Over with 0 holes cleared → overlay stays hidden, `coinSummaryVisible===false`, `getComputedStyle(#coin-summary-overlay).display==='none'`). Sources when `coins>0`:
  - `returnToMainMenu()` after final WIN
  - `handleGameOverReturn()` after Game Over
  - `endRun()` after End Run (only if `holes>0`)
- Do **not** show legacy texts `You earned` or `holes cleared — 10 per hole` or `0 hole clears × 10` / `×` style in the visible overlay (hide those elements). Only show big `+X💰` and `Hole cleared - 10💰 (xN)` plus unlock phrase.
- On confirm (`#coin-summary-ok` click or `Escape` or `Enter`), hide overlay (`classList.add('hidden')`) and remain on main menu. Coins already persisted.
- **Styling**: card black opaque, title white `stroke 5px`, big amount `+X` before `💰` prominent, rows smaller `500-600 12-13px` muted white, gap `12px`, overlay `inset:0` full screen, centered.

## 5. HUD & Main Menu Coins Display

- Main menu shows **Coins HUD** `#progression-coins-display` inside `#main-menu-overlay` or `#game-container` top-right near seed display: `Coins: N` with coin icon `🪙` or `¢`. Updates on `saveProgression()` and on shop purchase.
- Loadout Personal Items header also shows `Coins: N` (`#loadout-coins`).

## 6. Acceptance Criteria

- [ ] Fresh install `localStorage.getItem('golfVectorField.progression.v1')===null` then `loadProgression()` yields `coins 0` and `personalSupply {magnifier:0, liquifier:1, deflector:0, rotator:0, fieldExtender:0, powerCell:0, freeShot:0}` (just Liquifier, others 0); `personalSupply` never auto-decremented on loadout or placement. Course completion awards `+50` coins (see §1.2 bonus) in addition to per-hole: completing 3-hole course after 3 clears gives `80` total (`3×10+50`).
- [ ] Initially only 1 loadout slot unlocked: `getUnlockedLoadoutSlots()===1`. After clearing 3-hole course (`bestTotal` for 3 holes not null) `===2`; after 6-hole cleared `===3`; after 9-hole cleared `===4`. Locked slots show `🔒`, `opacity 0.45`, `cursor not-allowed`, cannot be filled, and have hint/title containing `clear 3 holes`/`clear 6 holes`/`clear 9 holes` (or `Clear 3 to unlock` etc.). Clicking personal item when all unlocked slots filled does nothing (`Loadout full`).
- [ ] Clicking unlocked course (e.g. 3 Holes) when no ongoing save shows `#loadout-overlay` **covering whole canvas edge-to-edge** (`getBoundingClientRect` of overlay is `inset:0` and its rect is `±1px` of `getBoundingClientRect` of `#game-container`, no visible gap, `border-radius:0`, `padding:0` on overlay, card fills `100%` with `border-radius:0`), with headings exactly `Loadout` and `Shop` (main overlay **only contains Loadout and Shop panels**, no Your Items grid in main overlay — `document.querySelector('#loadout-overlay #personal-items-grid')` shall be `null` or not visible, instead Your Items lives in picker overlay). Loadout is styled like reward menu (colored cards `rgba(230,126,34,0.28)` etc. for each type, same palette as reward buttons) and **slots are on a horizontal line** (`grid-template-columns:repeat(4,1fr)` single row, not 2×2). Shop panel on right half is visible with `Shop` heading.
- [ ] **Your Items picker overlay**: Main loadout screen has **no Your Items grid** (`#personal-items-grid` not inside `#loadout-overlay` when visible, or hidden). Clicking an **unlocked loadout slot** opens `#loadout-item-picker-overlay` (**Your Items picker**) — `position:absolute; inset:0; background:rgba(0,0,0,0.55); z-index:14;` with card `.loadout-picker-card` containing title exactly `Your Items` (`h3` text `Your Items`), grid `#loadout-picker-grid` with **larger cards `72-80px` with `img 40-44px`** (both image and text fit inside, `width:72-80px; height:72-80px;` `padding:8px` so text not clipped), `gap 8px`, centered. Picker only shows owned types (`personalSupply[type]>0` → `querySelectorAll('.picker-item').length === ownedCount`), no overlap, no hidden disabled cards. Each picker item has same color/border per type, shows name + `Owned: xN`. Also has `Clear` / `Empty` option to remove item. Clicking picker item sets slot to that type (respecting `countInLoadout<owned`), closes picker, updates loadout. Picker has `Close` button `#loadout-picker-close` and backdrop click closes. Locked slots do **not** open picker.
- [ ] Shop items show **only name and cost with moneybag emoji** and no hint paragraph: each `.shop-item` contains name (e.g. `Magnifier`) and price text containing `💰` and `50`/`100` (updated prices) but **not the word `coins`** (e.g. `💰50` ok, `30 coins` fail), plus `Buy` button, no `Owned:` line. **Max 4 per type**: when `personalSupply[type] >=4` that `.shop-item[data-type="type"]` is **removed from DOM** (not just disabled) — `querySelector('.shop-item[data-type="magnifier"]')===null` when owned 4. Spatial cost `50`, passives `100`. Hints like `Click an item...` do not exist (`querySelector('.loadout-hint')===null`).
- [ ] Locked slots show **visible explanation** when they unlock: each locked slot has `🔒` and text `Clear 3 holes to unlock` / `Clear 6 holes to unlock` / `Clear 9 holes to unlock` (visible `font:600 9px`, not just title tooltip, `getComputedStyle` of unlock text not `display:none`, `textContent` contains `clear` + `holes` + `unlock` + number). `title` also contains `clear 3 holes` etc. for hover. Initially 3 locked slots show those messages; as stages cleared, slots unlock progressively.
- [ ] Clicking unlocked course shows loadout with **only Loadout and Shop panels**; clicking an **unlocked slot** opens picker overlay; selecting a picker item with owned>0 sets that slot to the type (respecting `countInLoadout<owned`), closes picker, updates loadout; `Clear` removes. Start Course derives `supply` from slots: e.g. slots `[liquifier, magnifier, fieldExtender, freeShot]` → `supply.liquifier=1, magnifier=1, fieldExtenderCount=1, freeShot=1`. Sections have **visually distinct backgrounds** Loadout vs Shop (different `backgroundColor` tints using course palette — verify two sections have different `getComputedStyle(backgroundColor)`).
- [ ] Coin earning: `COINS_PER_HOLE=10` + `COURSE_COMPLETE_BONUS=50` on full course clear. Clearing 2 holes → `runCoinsEarned 20` (no course bonus, only one row `Hole cleared - 10💰 (x2)`); completing 3-hole course → `80` (`3×10+50`) and summary appears over main menu **as full screen transparent `rgba(0,0,0,0.55)` backdrop with black card `rgba(0,0,0,0.75)` slightly transparent around info** (`getComputedStyle(.coin-summary-card).backgroundColor` `rgba(0,0,0,0.75)` not opaque, `0.70-0.85`) with title `Run Complete`, **big `+80💰` with number before icon and plus** (`#coin-summary-amount` text `+80` before `.coin-big-icon` `💰` in `.coin-summary-big`, `font-size 44px` smaller), **first row `Hole cleared - 10💰 (x3)`** (`#coin-summary-details .coin-detail-row:first-child` contains `Hole cleared`, `-`, `10💰`, `(x` e.g. `Hole cleared - 10💰 (x3)` — must contain `Hole cleared`, `-`, `10💰`, `(x3)` ) and **when course cleared second row `Course cleared, 50💰`** (`#coin-summary-details .coin-detail-row:nth-child(2)` contains `Course cleared`, `50`, `💰`, number before 💰, e.g. `Course cleared, 50💰` — only when `isCourseComplete`/bonus awarded, otherwise only one row) **and conditionally bigger unlock `Loadout slot unlocked`** (`#coin-summary-unlock` text exactly `Loadout slot unlocked`, `font:700 15px`, **only visible when a new loadout slot was actually unlocked in that run** `getUnlockedLoadoutSlots() > loadoutUnlockedAtRunStart` — e.g. after first 3-hole clear shows, after End Run with 0 holes no overlay at all), **do not show** `0 hole clears × 10`, `You earned 30 coins: 3 holes × 10 coins per hole` nor `3 holes cleared — 10 per hole` (`#coin-summary-text`/`#coin-summary-breakdown` hidden `display:none`, and no `×` style). `runCoinsEarned` resets. **End Run 0 holes (coins 0) does not show overlay at all** (`#coin-summary-overlay` stays `hidden`, `isCoinSummaryVisible()===false`).
- [ ] Loadout Cancel (`Cancel`/`Escape`/backdrop) hides overlay without starting course, `mainMenuVisible` remains true, no `STORAGE_KEY` created.
- [ ] **Loadout persistence — last loadout pre-loaded, random fallback:** After `Start Course` with `slots=[magnifier,liquifier,null,null]` (or any), `localStorage.getItem('golfVectorField.loadout.v1')` contains `slots` JSON and `getLastLoadout()` returns that array. On next `handleCoursePlay` / `showLoadout` (no ongoing save), the loadout screen is **pre-loaded** with that saved array validated (same `slots` visible, same order; locked slots forced `null`). If `localStorage.getItem('golfVectorField.loadout.v1')===null` (no saved loadout, fresh install cleared), opening Loadout shows **random item from player's storage for each unlocked slot**: for `unlocked=1` with only `liquifier:1`, slot 0 is `liquifier`; for richer `personalSupply`, each unlocked slot is a random owned type with uniform `Math.random` among `candidates = types.filter(t=>owned-remaining>0)`, without exceeding owned count, without filling locked slots. `hasLastLoadout()` distinguishes no-key vs saved.

## File Paths

- `src/progression.js:1` (PROGRESSION_KEY, LOADOUT_KEY, load/save, coins, personalSupply, purchase, costFor, getLastLoadout/setLastLoadout/hasLastLoadout)
- `src/main.js:1` (loadoutVisible, loadoutSlots, showLoadout/hideLoadout, startCourseWithLoadout, runHolesCleared/runCoinsEarned, syncLoadoutOverlay, coin summary, loadout persistence + random fallback)
- `index.html:1` (`#loadout-overlay`, `#coin-summary-overlay`, `#progression-coins-display`)
- `style.css:1` (loadout/shop/coin-summary styles, overlay bounds)
- `docs/requirements/10-progression.md:1` (this file)
