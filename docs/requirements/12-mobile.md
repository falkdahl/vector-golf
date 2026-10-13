# 12 — Mobile Support (Phone Landscape, Touch Controls)

- **ID:** 12-mobile
- **Type:** Functional + UI
- **References:** `01-foundation.md` (logical space, DOM, resize); `02-rendering.md` (HUD/overlays); `05-modifiers-and-bag.md` (placement/drag/stacking); `06-run-rules.md` (input/Escape/aim/charge)

> Mobile phone adaptations. Desktop mouse/keyboard behavior unchanged. All touch equivalents must produce identical game-state effects as their keyboard/mouse counterparts.

## 1. Detection & fullscreen

- `isMobilePhone()`: true on phone clients — phone UA (`Android.*Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobile`) OR (`navigator.maxTouchPoints>0` + `matchMedia('(pointer:coarse)')`) + `?mobile=1` force flag for testing (also `window.__isMobilePhone`, `window.__isMobileMode` hooks).
- On mobile: game launches in landscape fullscreen. `requestMobileFullscreen()` requests fullscreen on `#game-container` (fallback `document.documentElement`, `webkitRequestFullscreen` on iOS) from the first user gesture (boot-gate continue, Play), then tries `screen.orientation.lock('landscape')` (catch failures — iOS unsupported).
- Exiting fullscreen must be recoverable: `#mobile-fullscreen-button` (`⛶`, top-right below HUD) visible on mobile iff `document.fullscreenElement==null`; click re-requests landscape fullscreen. `fullscreenchange` re-syncs UI. Never auto-forces fullscreen on desktop.
- Fullscreen CSS: `#game-container:fullscreen` fills the viewport with a black backdrop, but the three playfield canvases stay letterboxed 16:9 (centered, `min(100vw, 100vh*16/9)`), so proportions never stretch. The menu splash (`#parallax-scene`) intentionally stays full-bleed behind them. `fullscreenchange` re-runs `setupCanvas()` + `resizeWindOverlay()` + `syncMobileUI()` so DPR/input mapping stay correct (canvas rect is the letterboxed box). `touch-action:none` on container + canvases to prevent scroll/pinch-zoom; viewport meta includes `maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.

## 1b. Mobile performance budgets (phone only; desktop unchanged)

- Backing-store DPR capped via `effectiveDPR()`: `min(devicePixelRatio, 1.5)` on mobile (uncapped desktop). Sustained `<45fps` over 120 frames auto-degrades once to cap `1.0` + `setupCanvas()`/`resizeWindOverlay()`. Physics stays logical; only backing resolution changes.
- Wind overlay on mobile: 24 streaks × 12 nodes (desktop 48×24), `antialias:false`, pixel ratio capped 1.5 (all in `src/windThree.js`; quality chosen once at `initWindOverlay`).
- Wind visuals tick once per rAF (`tickWindVisual(frameDt)` in `loop()`); `update(dt)` fixed steps never tick wind or touch hotbar DOM (banner timers/physics unchanged). Blocked-state branches set `needHotbarSync`, flushed once per frame.
- Modifier wind arrows (`src/render.js`): per-modifier bounding-box precheck skips most of the 32×18 cell scan without `hypot`; visuals identical.
- Compositor: parallax splash is static on mobile (no per-frame `translate3d`, no touch-follow); `#golfbag-container`/`#journal-container` drop `backdrop-filter: blur` under `.mobile-mode` (flat `rgba(0,0,0,0.55)`).

## 2. Touch overlay controls (lower-right)

- `#mobile-controls` (`absolute; bottom:12px; right:12px; flex; gap:8px; z-index:7`): three `56×56` round buttons — `#mobile-aim-left` (`◀`), `#mobile-launch` (`●` + `LAUNCH` label), `#mobile-aim-right` (`▶`). `touch-action:none`, `user-select:none`, semi-transparent dark with white glyphs.
- Equivalence (identical state effects, same blocking as keyboard):
  - Hold left/right = `ArrowLeft`/`ArrowRight` held (`1.6 rad/s` rotate, wrap `[0,2π)`, blocked in `FLYING`/menus/banners — same as `06-run-rules.md` §2).
  - Press-and-hold launch = `Space` held (`charge=min(holdTime/1.5,1)`), release = `Space` keyup (`power=50+charge*550`, `launchBall`, counted/free-shot accounting per `06-run-rules.md` §3).
- Implemented via `src/input.js` touch API (`touchAimStart/End`, `touchChargeStart/End`) sharing the same `keys`/`charging`/`onLaunch` path as keyboard (not a parallel physics path). Pointer + touch + mouse events wired so hold works with finger; `preventDefault` on `touchstart` to avoid double-fire/emulated mouse. Visible only in mobile mode while gameplay chrome is visible (same visibility as `#bottom-bar`: `AIMING`/`CHARGING`/`FLYING` + reward open, hidden in pause/menus/banners/`WIN`/`GAME_OVER`/summaries/cutscene/banter/starting overlay).

## 3. Touch drag & drop + double-tap

- Canvas `touchstart/move/end` (`passive:false`) mirror mouse placement/drag:
  - `getCanvasTouchPos(touch)` maps via container rect to logical coords (same formula as `getCanvasMousePos`).
  - Armed + tap canvas = `placeModifier` (OOB-checked after snap, same as click).
  - Touch on placed bubble (nothing armed) + move = board drag (same `draggingIdx/draggingMates/dragOffset` stack snapshot, snap commits only on release, canvas→bag drop over spatial slot supported).
  - Bag→level drag: `touchstart` on occupied spatial hotbar slot arms after `>6px` move (`BAG_DRAG_THRESHOLD_PX`), `touchend` on canvas places, on spatial slot moves/swaps, elsewhere deselects — same as mouse bag-drag. Plain tap (no drag) explicitly calls `selectBagSlot()` (toggle arm/disarm, identical to click/`1–3`), because `touchstart preventDefault()` suppresses the emulated mouse click — taps never rely on click synthesis.
- Double-tap on a placed modifier's area-of-effect = right-click: two taps within `300ms` and `24px` call the shared `handleRightClickAt(x,y)` path (stack splits if stacked, else pickup to empty slot or `Golfbag is already full` toast, armed deselects first — identical to `contextmenu` per `05-modifiers-and-bag.md` §6). Single-tap behavior unchanged (tap without drag on unarmed modifier = no-op; tap with armed = place). Emulated mouse events suppressed via `preventDefault`.

## 4. Hamburger menu (Escape equivalent)

- `#mobile-menu-button` (`☰`, `44×44`, `absolute; top:36px; left:12px` — just below the 28px `#hud`; `z-index:7`): visible on all platforms (desktop + mobile) while gameplay chrome is visible (same rule as `#bottom-bar`: `AIMING`/`CHARGING`/`FLYING` + reward open, hidden in pause/menus/banners/`WIN`/`GAME_OVER`/summaries/cutscene/banter/boot gate/starting overlay).
- Click/tap dispatches the identical Escape path as keyboard (`Escape` keydown handling in `src/main.js`: deselect → close help/confirm/reward-skip → open in-level pause / resume — per `06-run-rules.md` §4 and `08-campaign-and-menus.md` §6). No separate pause logic; synthetic `Escape` keydown event reused so behavior can never diverge.

## 5. Reset button (R equivalent)

- `#mobile-reset-button` (`↻`, `44×44`, `absolute; top:36px; left:64px` — just right of the hamburger; `z-index:7`): visible on all platforms while gameplay chrome is visible (same rule as the hamburger).
- Click/tap dispatches the identical `R` path as keyboard (`KeyR` keydown handling: reward re-roll when a reward menu is open, `Game Over`/`WIN` continue, `resetBall()` otherwise with last-attempt blocking — per `06-run-rules.md` §§3–4 and `07-rewards-and-economy.md` §4). Synthetic `KeyR` keydown event reused so behavior can never diverge.

## Acceptance

- [ ] Phone UA (or `?mobile=1`) shows fullscreen + 3 touch buttons; desktop shows neither (hamburger + reset show on both).
- [ ] First tap on mobile requests fullscreen + landscape lock attempt; exiting fullscreen shows `⛶` which re-enters.
- [ ] Hold left/right rotates aim at keyboard rate; hold-launch charges force bar and releases with identical power/accounting; all blocked in same states as keyboard.
- [ ] Touch drag moves placed bubbles/stacks with snap-on-release; bag→canvas touch drag places; bag tap arms/disarms like click/`1–3`; double-tap inside bubble splits/picks up/deselects exactly like right-click; single-tap places like click.
- [ ] Fullscreen keeps the playfield 16:9 letterboxed (no stretch); menu splash stays full-bleed; exiting/re-entering fullscreen keeps DPR/input mapping correct.
- [ ] Hamburger opens/closes exactly like `Escape` in every state (deselect, pause open/resume, dialog dismiss).

## File paths

- `index.html:1` (`#mobile-menu-button`, `#mobile-reset-button`, `#mobile-fullscreen-button`, `#mobile-controls`), `style.css:1`, `src/input.js:1` (touch API), `src/main.js:1` (detection, fullscreen, touch wiring, `handleRightClickAt`, `dispatchResetKey`)
