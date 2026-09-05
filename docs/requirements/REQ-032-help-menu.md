# REQ-032: Help Overlay — Rules & Control Scheme

- **ID:** REQ-032
- **Title:** Help Overlay — Short Rules Explanation and Control Scheme, Scrollable, No Overflow, Opaque Card Over Transparent Splash
- **Priority:** Must Have
- **Type:** Functional + UI
- **Status:** Draft
- **Related Plan Section:** UI / Main Menu (REQ-029/012 Extension)

## Description
When the user presses the **"Help"** button in the main menu root (REQ-029), the game SHALL present a **help overlay** (`#help-overlay` inside `#main-menu-overlay`) that explains the **rules of the game** and the **control scheme**. The help content SHALL be **scrollable** if it would otherwise overflow the canvas, and SHALL **never overflow** the 16:9 `#game-container`. The help overlay SHALL be shown over the **unobscured splash** (the main-menu overlay has `background: transparent`, no dimming backdrop — REQ-029/030); the help text itself MAY be inside an **opaque card** for legibility, but the full-screen overlay background SHALL remain transparent so the splash remains visible around the card. All help buttons/cards SHALL be opaque.

## Rationale
Players need a brief, always-accessible summary of the golf-with-wind concept and the non-obvious controls (modifier placement, wind toggle, etc.) without leaving the game or scrolling the page. Keeping Help as a sub-view of the main menu over the splash avoids a separate route and keeps the 16:9 maximization intact.

## Requirements

1. **Trigger & Navigation** in `src/main.js` / `index.html` / `style.css`:
   - The main menu root (REQ-029) SHALL contain `<button id="help-button" class="main-menu-button">Help</button>` (text exactly `"Help"`, opaque `background:#2ecc71` or similar opaque, not `rgba(...,0.28)`).
   - Clicking `Help` SHALL hide `#main-menu-root` and `#course-menu` and show `#help-overlay` (`helpVisible=true`) **while keeping `mainMenuVisible===true`** (still on splash, still paused, bottom canvas still splash). No game is started.
   - `#help-overlay` SHALL contain a **"Back"** button (`<button id="help-back-button">Back</button>`, text exactly `"Back"`, opaque) that hides the help overlay and returns to the main menu root (`#main-menu-root` visible, `#help-overlay` hidden). No other navigation SHALL be triggered.
   - Structure SHALL be inside `#main-menu-overlay .main-menu-content`:
     ```html
     <div id="help-overlay" class="hidden">
       <div class="help-card">
         <h3>How to Play</h3>
         <p class="help-rules">...</p>
         <h4>Controls</h4>
         <ul class="help-controls">
           <li>Arrow keys — Aim</li>
           <li>Space — Hold to charge, release to shoot</li>
           <li>Click — Place selected modifier</li>
           <li>Right-click — Remove modifier</li>
           <li>1/2/3 — Select Amplify / Nullify / Flip</li>
           <li>H — Toggle wind visualization</li>
           <li>R — Reset ball</li>
           <li>Escape — Pause</li>
         </ul>
         <button id="help-back-button">Back</button>
       </div>
     </div>
     ```
     Exact wording MAY vary but the **semantic coverage** in §2 is normative.

2. **Content — Rules + Controls** in `src/main.js` / `index.html`:
   - **Rules** (`p.help-rules` or equivalent, at least 2 sentences, visible without scrolling on desktop): MUST convey all of:
     - Goal is to get the **ball into the hole** in as **few attempts (strokes)** as possible.
     - **Wind vectors** push the ball while it flies; wind varies per hole via a vector field.
     - **Modifiers** (Amplify, Nullify, Flip) can be placed **before shooting** to alter wind locally (e.g., "Place modifiers to Amplify/Nullify/Flip wind in an area").
     - Each hole tracks **attempts**; **total across the course** is your score; the **lowest total (record) per course is saved**.
   - Tests SHALL verify the help text contains case-insensitive keywords: `"wind"`, `"hole"` (or `"course"`), and `"attempt"` or `"stroke"` or `"fewest"` (so any of those satisfies the rule description). The test MAY check `helpOverlay.textContent.toLowerCase().includes("wind") && helpOverlay.textContent.toLowerCase().includes("hole")`.
   - **Control scheme** (`ul.help-controls` or equivalent, each as a row or bullet): MUST list at least:
     - `Arrow` (or `ArrowLeft`/`ArrowRight` / `Arrow keys`) to **aim**.
     - `Space` to **charge / shoot** (hold to charge power, release to shoot — both concepts must appear: `Space` + `charge` or `Space` + `shoot`).
     - `Click` (or `Tap` + `Place`) to place a modifier.
     - `Right-click` (or `Right click` / `Remove`) to remove a modifier.
     - `1`/`2`/`3` or hotbar click to select modifier type (optional but recommended — if omitted, not a failure, but `Space` + `Arrow` + `Click` are mandatory).
     - `H` to toggle wind, `R` to reset, `Escape` to pause — if included, must be accurate; missing `H`/`R`/`Escape` is not a failure if core three (Arrow/Space/Click) are present, but they SHOULD be included for completeness.
   - Tests SHALL verify `helpOverlay.textContent` contains (case-insensitive): `"arrow"` (or `"aim"`), `"space"` (or `"charge"`/`"shoot"`), and `"click"` (or `"place"`). All three MUST be present.
   - The help text SHALL be **short** (≤ 250 words for rules + ≤ 150 words for controls, not a full manual) — brevity is a requirement.

3. **Styling & Overflow — No Overflow, Scrollable Card, Opaque, Transparent Backdrop** in `style.css`:
   - `#help-overlay` SHALL be inside `#game-container` with `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; width:100%; height:100%; background: transparent; z-index:12;` — **no dimming `rgba(0,0,0,0.35)` full-screen backdrop** (the splash is unobscured; per REQ-030 the overlay background is transparent).
   - `.help-card` inside it SHALL be the **scrollable, opaque card** for legibility:
     ```css
     #help-overlay { background: transparent; }
     .help-card {
       max-width: 90%; max-height: 85%;
       width: min(420px, 90%);
       overflow-y: auto; overscroll-behavior: contain;
       background: rgba(0,0,0,0.75); /* or #222 opaque; either is opaque/semi-opaque card, acceptable */
       /* opaque is required for the card itself; full-screen backdrop stays transparent */
       /* alternative acceptable: background:#222 or #2c3e50 opaque */
       color: white; padding: 16px 18px; border-radius: 10px;
       display:flex; flex-direction:column; gap:10px; text-align:left;
       scrollbar-width: thin;
     }
     /* If implementers prefer fully opaque card: background:#1a1a1a; border:2px solid #333; */
     ```
     - The **card itself** MAY be `rgba(0,0,0,0.75)` semi-opaque or fully opaque `#1a1a1a`, but it SHALL **not be transparent** (`background:transparent` on the card is forbidden). The card's computed `backgroundColor` SHALL be `rgb(...)` or `rgba(...,0.7-1)` with enough contrast to read text.
     - The **full-screen `#help-overlay`** background SHALL be `transparent` (`rgba(0,0,0,0)`), not `rgba(0,0,0,0.35)` — tests SHALL assert `getComputedStyle(helpOverlay).backgroundColor === "rgba(0, 0, 0, 0)"`.
     - The help content SHALL be **scrollable** (`overflow-y:auto`, `max-height:85%` or `max-height:70%` of overlay) so it never overflows the canvas. Verified by `helpCard.scrollHeight > helpCard.clientHeight` when content is long, and `helpOverlay.getBoundingClientRect()` is contained within `container.getBoundingClientRect()` at `375px` viewport (no `left < container.left`).
     - No page-level scroll: `body {overflow:hidden}` and help does not cause `document.documentElement.scrollHeight > innerHeight`.
   - **Back button** `#help-back-button` SHALL be opaque (`background:#2ecc71` or `#3498db` solid, `border:2px solid #27ae60`, white text, `padding:8px 16px; border-radius:6px;`), not transparent. It SHALL be inside the card and bounded to the canvas.

4. **Blocking & Lifecycle**:
   - While help is visible (`mainMenuVisible true` + `helpVisible true`), the game SHALL be paused (same blocking as REQ-029: `update` not advance ball, `handleLaunch` no-op, `Escape` ignored, hotbar hidden).
   - Help SHALL not start a game or modify `courses` / `STORAGE_KEY`. Closing via Back returns to root without side effects.

## Acceptance Criteria

- [ ] Main menu root contains a button with `id="help-button"` and text `Help` (opaque, `rgb(...)` alpha 1). Clicking it hides the root (`#main-menu-root.hidden` or `display:none`) and shows `#help-overlay` (not `hidden`, `display:flex` or `display:block`) still over the splash (bottom canvas still splash, not grass), `helpOverlay.getBoundingClientRect()` is contained within `container.getBoundingClientRect()` (no overflow). `#help-overlay` computed `backgroundColor` is `transparent` / `rgba(0,0,0,0)`, not dimming `rgba(0,0,0,0.35)`.
- [ ] Help overlay text contains (case-insensitive) **rules keywords**: `"wind"` + `"hole"` (or `"course"`) + (`"attempt"` or `"stroke"` or `"fewest"`), **and controls keywords**: `"arrow"` (or `"aim"`) + `"space"` (or `"charge"`/`"shoot"`) + `"click"` (or `"place"`). At least 5 of the 8 control items are listed, including Arrow/Space/Click. Text is short (rules ≤250 words, controls ≤150 words) — verified by `textContent.split(/\s+/).length < 400`.
- [ ] Help content is **scrollable not overflowing**: the help card (`.help-card` or `#help-overlay` content) has `overflow-y:auto` and `max-height` ≤ `90%` of overlay, so at `375px` viewport no horizontal scroll appears and the overlay does not exceed the container (`getBoundingClientRect()` inside container). When a long help text is forced (e.g., add 20 lines), `scrollHeight > clientHeight` becomes true and vertical scrolling works.
- [ ] A **"Back"** button (`#help-back-button`, text exactly `Back`, opaque `rgb(...)`) is inside the help overlay; clicking it hides help and shows the main menu root with three buttons again (Continue conditional, New Game, Help), without starting a game or changing `localStorage`.
- [ ] No `<h1>` or `#instructions` outside `#game-container` exists while help is shown (still `null` per REQ-002/012). Help does not create page-level scroll (`document.documentElement.scrollHeight <= window.innerHeight + 1`).
- [ ] While help is visible, game is paused: `ArrowRight` no aim change, `Space` no charge, `Escape` does not open pause menu.

## Dependencies
- REQ-029 (main menu root with Help button, transparent overlay, no backdrop)
- REQ-030 (splash background, black loading, 16:9 maximized centered, only canvases)
- REQ-002/REQ-012/REQ-013 (only canvases, 16:9, no outside elements, scrollable overlays)
- REQ-031 (course submenu is sibling sub-view; help is sibling)

## Notes
- The help card MAY be implemented as `div.help-card` inside `#help-overlay` or as `#help-overlay` itself with card styling — either is acceptable if the scrollable card is opaque and bounded to canvas and the full-screen backdrop is transparent.
- Keep the help text plain HTML (no markdown rendering) for static hosting.

## File Paths
- `index.html:1` (#main-menu-overlay contains #main-menu-root (Continue/New Game/Help) + #course-menu + #help-overlay with rules + controls + #help-back-button; NO h1, NO #instructions)
- `style.css:1` (#help-overlay transparent full-screen, .help-card opaque scrollable, Back button opaque, container 16:9, body black)
- `src/main.js:1` (helpVisible toggle, Help → help overlay, Back → root, blocking while visible)
