# 11 — Cheat Mode (Hashimoto Protocol, Testing Only)

- **ID:** 11-cheat-mode
- **Supersedes:** 14-cheat-mode (unchanged behavior; cross-refs updated)
- **Type:** Testing / debug (non-normative for balance)
- **References:** `01-foundation.md` (`getCanvasMousePos`); `03-physics.md` (ball); `06-run-rules.md` (states/attempts)

## 1. Purpose

Hidden manual testing aid: Konami code toggles session-scoped ball drag & drop. Never persisted, never advertised in menus/help/HUD.

## 2. Activation (Konami toggle)

- Sequence by `KeyboardEvent.code`: `ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,KeyB,KeyA`. Passive observer (never consumes keys). Skipped while typing in `INPUT`/`TEXTAREA`/editable, while `Ctrl`/`Alt`/`Meta` held, or on `e.repeat`. Wrong key resets (with prefix-overlap restart).
- Off → on: toast exactly `Hashimoto Protocol Activated`, `cheatMode=true`. On → off: same `#toast` mechanism with exactly `Hashimoto Protocol Disabled`, `cheatMode=false` (a held ball drops in place `vel=0` first).

## 3. Drag & drop (while `cheatMode`)

- Grab: left `mousedown` within `BALL_RADIUS+10` of the ball, no blocking modal (menus, pause, reward, banners, summary, starting overlay, cutscene, banter), `gameState ∈ {AIMING,CHARGING,FLYING}` (never `WIN`/`GAME_OVER`); ball wins over modifier circles. From `AIMING`/`CHARGING` counts exactly as a launch (same attempt/free-shot accounting per `06-run-rules.md`; `isMoving=true`, `vel=0`, `z=0`, `FLYING`, charge cancelled, per-shot/softlock reset) except the ball sticks to the cursor. Held: follows clamped cursor, `vel=0`, ignores wind/friction/win/treasure/collision/softlock (`updateWindUniforms` still runs). Drop (`window mouseup`, clamped to `[R,LOGICAL-R]`): stays, softlock reset, save; next tick normal physics (hole wins, water/OB resets when low; high drop flies over). Post-drop `click` swallowed (no accidental placement, even if a reset returned to `AIMING`). `resetBall`/`loadLevel`/teardown cancel drags; `R`/pause `Next Attempt` work mid-drag. Cursor `grab`/`grabbing`. No `prompt`/`alert`/`confirm`. Hooks: `window.__isCheatMode/__activateCheatMode/__deactivateCheatMode/__toggleCheatMode/__isCheatDraggingBall`.

## 4. Constraints

Runtime-only (never `STORAGE_KEY`, never `bestTotal`/points/rewards/generation). No UI except the two toasts (~2s).

## Acceptance

- [ ] Full sequence → `Activated` toast then auto-hide; `up,up,up…` does not; seed input typing does not.
- [ ] Repeat → `Disabled` popup, grab disabled, held ball dropped `vel=0`; third entry re-activates.
- [ ] Grab in `AIMING` → `FLYING`, follows mouse `vel=0`, no wind/win/treasure while held; drop resumes physics (hole wins, water resets, counted attempt).
- [ ] Post-drop click never places; modals block grabbing; `R` mid-drag resets; reload clears; saves contain no cheat state.

## File paths

- `src/main.js:1`, `index.html:1` (`#toast`), `style.css:1`
