# 11 — Cutscene System (Canvas + Dialog + Editor)

- **ID:** 11-cutscenes
- **Supersedes:** (new)
- **Type:** Functional / UI / Tooling
- **References:** `02-canvas-system.md` (logical 1280×720, layers, DPR), `03-rendering.md` (bg vs fg split), `05-input-and-states.md` (input blocking), `01-infrastructure.md` (static hosting, no bundler)

## 1. Purpose

Cutscenes are scripted, non-interactive sequences drawn **inside the canvas** for world-building. They use the existing canvas stack: static background on `#bg-canvas` (z1 opaque) and dynamic characters on `#game` (z2 transparent), with dialog as HTML overlay above both canvases. They support synchronized pan/zoom across both canvases, keyframed character placement/scaling/movement, and timed dialog with typewriter animation.

Each cutscene has a unique `id` for later triggering (e.g. course start, first clear).

## 2. Rendering Layers (reuse existing stack)

- **Background canvas** (`#bg-canvas`, `z-index:1`): draws cutscene background image aspect-covered or solid color, with active camera transform (pan+zoom) applied. **During cutscene `redrawBottom` shall not draw splash/parallax — `cutsceneRender` owns `bgCanvas`.**
- **Top canvas** (`#game`, `z-index:2`): draws characters (images) with same camera transform, cleared each frame.
- **Wind canvas** (`#wind-canvas`, `z-index:3`): hidden during cutscene (`display:none` or `opacity:0`, `setWindVisible(false)`).
- **Parallax splash** (`#parallax-scene`): hidden during cutscene (`syncParallaxVisibility` shall require `!cutsceneIsActive()` so `shouldShow = mainMenuVisible && !isInLevelPause && !isCut`).
- **HUD/menus**: hidden during cutscene (`#hud`, `#bottom-bar`, `#reward-overlay`, `#pause-overlay` all hidden). **Main menu overlay** (`#main-menu-overlay`) and its chrome (`#parallax-scene`, `#menu-title`, `#campaign-seed-wrapper`, `#help-button`) are also hidden during cutscene (`syncMainMenu` shall check `cutsceneIsActive()` and hide `main-menu-overlay`/`parallax` when `isCut` true, so cutscene background is visible; `redrawBottom` early-returns when `isCut`).

During cutscene, `gameState` is paused (physics frozen) and a new `cutsceneActive` flag blocks normal input/placement/aim. Main loop still runs `requestAnimationFrame` with `updateCutscene(dt)` and `renderCutscene(bgCtx, fgCtx)`.

## 3. Camera — Synchronized Pan & Zoom

Both canvases share a single camera state applied via `ctx.save(); ctx.translate(-cam.x, -cam.y); ctx.scale(cam.zoom, cam.zoom)` before drawing content, then `restore()`. Camera is interpolated over time.

- Camera keyframes: `camera.keyframes: Array<{t:number, x:number, y:number, zoom:number, easing:string}>` where `t` in ms from cutscene start, `x/y` in logical pixels, `zoom` 0.5–3.0.
- Interpolation uses `easing` ∈ `linear|easeIn|easeOut|easeInOut` (all required, implemented via cubic).
- Between keyframes linearly/eased interpolates `x/y/zoom`. Before first keyframe uses first value; after last uses last value.
- If no camera keyframes, defaults to `{x:0,y:0,zoom:1}` (no pan/zoom).

## 4. Characters — Placement, Scaling, Movement Keyframes + Sprite Frame Cropping

- `characters: Array<{id:string, src:string, frame?:{x:number,y:number,w:number,h:number}, sprite?:string, x:number, y:number, scale:number, anchor:string, visible:boolean, keyframes?:Array<{t:number,x:number,y:number,scale:number,easing:string}>, zIndex:number}>`
  - `src` is relative path `./img/...` (e.g. `./img/splash/may-gfg-splash.png`, `./img/logo.png`, or character sprite sheet `./img/characters/may-sheet.png`). Image is loaded via `new Image()` with same relative resolution as splash. When a sprite sheet contains multiple characters, use `frame` to crop.
  - `frame` optional source rectangle inside `src` image, in source pixels `{x,y,w,h}` (`w/h >0`). If present, rendering uses 9-arg `drawImage(img, frame.x, frame.y, frame.w, frame.h, dx,dy,dw,dh)` where `dw = frame.w*scale`, `dh = frame.h*scale`. If omitted, whole image is drawn (`dw = naturalWidth*scale`). Not expensive: same one blit per character, hardware-accelerated.
  - `sprite` optional reference to named sprite mapping in `src/character-sprites.json` (see §7.1). If `sprite` is set and `frame`/`src` are omitted, they are resolved from the mapping at load/render time. `sprite` id must match `^[a-z0-9][a-z0-9-_]{1,40}$` (e.g. `may-right`, `may-front`). Allowed to set `sprite` together with `frame`/`src` — `frame`/`src` take precedence.
  - `x/y` is initial placement in logical coordinates (anchor point). **May start off-screen** for entrance (e.g. `x=-400` left of canvas, `x=1480` right, `y=-300` above), allowed range `-1000` to `LOGICAL_W+1000` / `LOGICAL_H+1000` (i.e. `-1000 … 2280` for `x`, `-1000 … 1720` for `y` at 1280×720). Values within `0…LOGICAL` are on-screen.
  - `scale` is uniform scale (0.2–3.0), applied as above (with or without `frame`).
  - `visible` default true.
  - `keyframes` optionally script movement/appearance: each keyframe has `t` (ms), target `x/y/scale` (same off-screen range `-1000…LOGICAL+1000` allowed for entrances/exits), optional `sprite` (sprite id like `may-right` from `src/character-sprites.json` or `character` group sprite) and/or `frame`/`src` override, `easing`. Interpolated between keyframes for `x/y/scale`; `sprite` snaps discretely to last keyframe `≤ t` (no interpolation). When no keyframe active, uses base `x/y/scale`/`sprite`.
  - `character` optional grouping id `^[a-z0-9][a-z0-9-_]{1,40}$` referencing `src/character-sprites.json` `characters` (e.g. `may` groups `may-front` etc.). If `character` is set, `sprite` dropdown in editor is filtered to that character's sprites, and per-keyframe `sprite` can be chosen from that filtered list to change image per keyframe (e.g. up vs right).
  - `zIndex` orders draw on top canvas (lower drawn first).

Movement is drawn on top canvas only; physics not applied. Frame cropping is not expensive and is handled per-character in the same draw call (9-arg). Selecting a keyframe row in editor jumps scrubber to that keyframe's `t` for precise positioning.

## 5. Dialog System — Timed Overlays with Typewriter + Speaker Portrait

- `dialogs: Array<{id?:string, t?:number, auto?:boolean, speaker?:string, text:string, cps?:number, duration?:number, portrait?:string, portraitSide?:'left'|'right'}>`
  - `t` is start time in ms from cutscene start when dialog should appear. **Optional**: if `t` is `null`/`undefined` or `auto:true`, dialog starts **right after previous has finished** (previous `effectiveT + reveal + duration`), so you don't have to set a start time — it runs as soon as previous one has finished. First dialog with `auto` starts at `0`.
  - `auto` optional boolean: when `true` or `t == null`, dialog is auto-started after previous. Editor shows checkbox “Start right after previous (auto)” that disables `t` input.
  - `speaker` optional name shown above text.
  - `text` is dialog string (supports `\n` for line breaks, max ~200 chars).
  - `cps` is chars per second for typewriter (default 20, range 10–60).
  - `duration` optional auto-advance after full reveal (if omitted, dialog waits for input; if set, dialog auto-hides after `reveal + duration` so it doesn't stay forever). For auto chain, `duration` determines when next auto dialog starts.
  - `portrait` optional relative image path `./img/...` (e.g. `./img/splash/may-gfg-splash.png` or `./img/logo.png`) for who is talking; shown as 64–80px square inside/adjacent to dialog box. If omitted, dialog shows without portrait (centered text). Allowed empty string means no portrait.
  - `portraitSide` optional `'left'|'right'` default `'left'` — controls whether portrait appears on left or right side of the dialog box. Must be provided when `portrait` is set; editor defaults to `left` and allows switching to `right`.
- Dialog overlay is HTML, not canvas: `.cutscene-dialog-box` is JRPG style (see §6).
- Typewriter: `revealed = min(text.length, floor((now - dialogStart) * cps / 1000))`. Rendered as `text.slice(0, revealed)` plus blinking cursor `▌` while revealing.
- **Fast-forward**: pressing `Space`, `KeyR`, or mouse `click` while dialog is revealing → instantly reveal full text (`revealed = text.length`). Pressing again (when fully revealed) → advance to next dialog if `nextDialog.t <= now` or `duration` expired, else wait for `t` of next dialog. If dialog is last and fully revealed, clicking again closes cutscene.
- While any dialog is visible, camera/character interpolation continues (no freeze).
- Input blocked for game actions while `cutsceneActive`; only cutscene dialog input is processed. `Escape` also advances/skips (unless overridden).

## 6. Dialog Visual — JRPG Style

- `.cutscene-dialog-box` CSS normative:
  ```css
  #cutscene-dialog { position:absolute; inset:0; display:flex; align-items:flex-end; justify-content:center; padding:18px 14px; z-index:12; pointer-events:none; }
  #cutscene-dialog.hidden { display:none; }
  .cutscene-dialog-box {
    width:min(92%, 720px); min-height:110px; max-height:38%;
    background:#1a3a8a; /* deep JRPG blue */
    border:3px solid #fff; border-radius:8px;
    box-shadow:0 4px 16px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.15);
    padding:12px 16px; color:#fff;
    font-family:"Press Start 2P", "Courier New", monospace; /* pixelated fallback system monospace */
    font-size:13px; line-height:1.6; letter-spacing:0.02em;
    text-align:left; overflow-y:auto; overscroll-behavior:contain;
    image-rendering:pixelated;
    display:flex; gap:12px; align-items:flex-start;
  }
  .cutscene-portrait { width:72px; height:72px; min-width:72px; min-height:72px; object-fit:cover; image-rendering:pixelated; border:2px solid #fff; border-radius:6px; background:rgba(0,0,0,0.25); flex-shrink:0; }
  .cutscene-portrait.hidden { display:none; }
  .cutscene-dialog-box.portrait-left { flex-direction:row; }
  .cutscene-dialog-box.portrait-right { flex-direction:row-reverse; }
  .cutscene-dialog-content { flex:1; min-width:0; display:flex; flex-direction:column; }
  .cutscene-speaker { font:700 11px "Press Start 2P", monospace; color:#FFD700; margin-bottom:6px; letter-spacing:0.06em; }
  .cutscene-text { white-space:pre-wrap; word-break:break-word; }
  .cutscene-hint { margin-top:8px; font:600 9px system-ui; color:rgba(255,255,255,0.65); text-align:right; }
  ```
  Alternatives `background #0d2a6b`/`#163b8a` acceptable, border `2-4px #fff`, pixelated `monospace` required. Portrait `64-80px` square, `left` default, `right` via `portraitSide`.

## 7. JSON File Format — Normative Schema

File: `src/cutscenes/<id>.json` **only** (one file per cutscene, stored separately in folder `./src/cutscenes/`). `src/cutscenes.json` (array bundling) and `src/cutscene-data.json` are **deprecated and shall NOT be used** — they shall be ignored if present (file `src/cutscenes.json` contains `[]` or shall be removed) and the loader shall not fetch them. The runtime loader shall **only** fetch `src/cutscenes/<id>.json` for a given `id` (e.g. `GET ./src/cutscenes/prologue.json`); it shall not fetch or parse `src/cutscenes.json` or `src/cutscene-data.json`. If a legacy `src/cutscenes.json` exists on disk, it shall be ignored (optionally `console.warn` if unexpectedly fetched). Exported JSON from editor is single-scene object to be saved as `src/cutscenes/<id>.json`.

### 7.1 Character Sprite Mappings — Shared Sprite Sheet Library

File: `src/character-sprites.json` (also allowed `src/sprites.json` or `src/character-sprites/<id>.json` but canonical is `src/character-sprites.json`). This file stores reusable named sprites that reference a sheet image and a source rectangle, so a single PNG with transparent background containing multiple characters can be sliced. Cutscene characters and dialog portraits may reference these by id instead of duplicating `src`+`frame`.

Schema (single file, flat object or versioned):
```json
{
  "version": 2,
  "characters": {
    "may": { "name": "May", "sprites": ["may-front","may-right","may-back","may-left"], "defaultSprite": "may-front" },
    "cortex": { "name": "Cortex", "sprites": ["cortex-front","cortex-right"], "defaultSprite": "cortex-front" }
  },
  "sprites": {
    "may-front": { "src": "./img/characters/may-sheet.png", "frame": {"x":0,"y":0,"w":64,"h":96} },
    "may-right": { "src": "./img/characters/may-sheet.png", "frame": {"x":64,"y":0,"w":64,"h":96} },
    "may-back":  { "src": "./img/characters/may-sheet.png", "frame": {"x":128,"y":0,"w":64,"h":96} }
  }
}
```
Flat alternative allowed (no outer `sprites` key): `{"may-front": {"src":..., "frame":...}, ...}` where each key is sprite id.

Field constraints:
- Key `^[a-z0-9][a-z0-9-_]{1,40}$` (e.g. `may-right`), unique across file.
- `src` required, relative `./img/...`, same allow-list as cutscene `src` (transparent PNG sheets allowed).
- `frame` required, `{x:number≥0, y:number≥0, w:number>0, h:number>0}` in source pixels. `w/h` must be ≤ natural image dimensions (validated at draw-time, warn only).
- Unknown fields ignored for forward compat.

Loader `src/spriteLibrary.js` (or inside `src/cutscene.js`) exports `loadSpriteLibrary():Promise<object>` and `getSprite(id):{src,frame}|null`. Cutscene runtime resolves `character.sprite` → `{src,frame}` fallback if `character.frame`/`src` missing. Editor `cutscene-editor` loads the library to populate sprite dropdown.

Schema (JSON, single scene):
```json
{
  "id": "intro-mt-aeolus",
  "title": "The Windy Peak",
  "background": { "type": "image", "src": "./img/splash/background-gfg-splash.png", "color": "#1a1a1a" },
  "duration": 15000,
  "camera": {
    "keyframes": [
      { "t": 0, "x": 0, "y": 0, "zoom": 1, "easing": "easeInOut" },
      { "t": 8000, "x": 120, "y": 40, "zoom": 1.4, "easing": "easeInOut" }
    ]
  },
  "characters": [
    {
      "id": "may",
      "character": "may",
      "sprite": "may-front",
      "x": 320, "y": 520, "scale": 0.65, "anchor": "bottom", "zIndex": 0,
      "keyframes": [
        { "t": 0, "x": 320, "y": 520, "scale": 0.65, "sprite": "may-front", "easing": "easeOut" },
        { "t": 4000, "x": 640, "y": 520, "scale": 0.65, "sprite": "may-right", "easing": "linear" }
      ]
    }
  ],
  "dialogs": [
    { "t": 500, "speaker": "May", "text": "Welcome to Mt. Aeolus...", "cps": 32, "portrait": "./img/splash/may-gfg-splash.png", "portraitSide": "left", "duration": 2500 },
    { "t": null, "auto": true, "speaker": "Grand Marshal", "text": "Putting is for cowards!", "cps": 28, "portrait": "./img/logo.png", "portraitSide": "right", "duration": 2500 },
    { "t": 4500, "speaker": "May", "text": "Another fixed-time dialog", "cps": 28, "portrait": "./img/splash/may-gfg-splash.png", "portraitSide": "left" }
  ]
}
```

Field constraints:
- `id` **required**, `^[a-z0-9][a-z0-9-_]{2,40}$` (unique across project, referenced via `playCutscene(id)`), `title` optional.
- `background.type` ∈ `image|color`, `background.src` required if `image` (relative `./img/...`), `background.color` fallback hex.
- `camera.keyframes` optional; each `t` may be **negative** for intro animation (allowed `-10000…`), otherwise `t≥0` normally, `zoom 0.5–3.0`, `easing` default `linear`.
- `characters[*].id` required per character, unique within scene; `src` required unless `sprite` is set (then resolved via `src/character-sprites.json`); when `frame` present: `frame.x/y ≥0`, `frame.w/h >0` and `frame.w/h ≤ 2048`; `x/y` may be off-screen for entrance, allowed `-1000 … LOGICAL_W+1000` (`-1000…2280` at 1280) / `-1000 … LOGICAL_H+1000` (`-1000…1720` at 720), recommended `0…LOGICAL`; `scale` 0.2–3.0; `anchor` `center|bottom` default `center`. `sprite` optional id `^[a-z0-9][a-z0-9-_]{1,40}$` referencing `src/character-sprites.json`.
- `characters[*].keyframes` optional; each `t` may be **negative** for intro animation (allowed `-10000…`), sorted ascending; `x/y/scale` same off-screen ranges as base (`-1000…LOGICAL+1000`); optional `sprite` sprite id `^[a-z0-9][a-z0-9-_]{1,40}$` (must exist in `src/character-sprites.json` when used, allows per-keyframe image change, e.g. up vs right), optional `frame`/`src` override, `easing` `linear|easeIn|easeOut|easeInOut`. Keyframe row in editor is clickable to jump scrubber to `t` (including negative).
- `dialogs[*].t` optional `≥0` (if `null`/`undefined` or `auto:true` → auto after previous); `text` 1–500 chars; `cps` default 20; `speaker` optional; `portrait` optional `./img/...` path or sprite id, `portraitSide` `left|right` default `left`; `duration` optional `0-60000` auto-hide (empty = stay forever); `auto` optional boolean. Sorted by effective `t` (auto = previous `effectiveT + reveal + duration`).
- `duration` optional ms; if omitted, duration is last dialog `t` + text length/cps*1000 + 1000.
- Unknown fields ignored for forward compat.

Validation: `validateCutscene(json)` returns `{valid:boolean, errors:string[]}`; `playCutscene` shall reject invalid with `console.warn` and not start.

## 8. Runtime API (src/cutscene.js)

Exports:
- `loadCutscene(id): Promise<object|null>` — fetch from `src/cutscenes/<id>.json` **only** (folder `./src/cutscenes/`), cache. `src/cutscenes.json` shall not be fetched.
- `listCutscenes(): Promise<string[]>` — lists available ids by scanning folder `./src/cutscenes/` (directory listing parse of `*.json`), fallback to known `prologue` if listing blocked.
- `loadCutscenesFromFolder(): Promise<object[]>` — optional helper that loads all separate files.
- `playCutscene(idOrData, options?)` — starts cutscene; `options.onComplete?:()=>void`
- `isCutsceneActive(): boolean`, `getActiveCutsceneId(): string|null`, `getCutsceneTime(): number`
- `updateCutscene(dt:number): void` — called from main loop when active
- `renderCutscene(bgCtx, fgCtx, W, H): void` — draws bg image on bgCtx and characters on fgCtx with camera transform
- `handleCutsceneInput(e): boolean` — returns true if consumed (for Space/R/Click fast-forward/advance)
- `skipCutscene(): void` — immediately ends and calls onComplete
- `validateCutscene(data): {valid, errors}`

All use logical `LOGICAL_W/H` and DPR already set via `setupCanvas` transform; cutscene shall call `ctx.setTransform(dpr,0,0,dpr,0,0)` then apply camera.

## 9. Editors — Hidden HTTP Endpoints (Two Editors)

### 9.1 Cutscene Editor

- **Endpoint:** `cutscene-editor.html` at repo root (also accessible as `./cutscene-editor.html`). **Not linked** from `index.html` or main menu (hidden). Served as static file via `python3 -m http.server` same as game. No server code required.
- **Implementation:** `cutscene-editor.html` + `src/cutscene-editor.js` + styles inline or `style.css` extension. Editor uses same canvas rendering as game for preview (600×338 preview scaled to 1280×720 logical).
- **Features required:**
  1. Scene metadata: `id` (unique), `title`, `duration`.
   2. Background chooser: dropdown of allowed `./img/...` assets **including subfolder images** (e.g. `./img/splash/background-gfg-splash.png`, `./img/cutscenes/bg-club-house.png`, `./img/cutscenes/portrait-may.png`, `./img/splash/may-gfg-splash.png`, plus root `./img/gfg-splash.png`, `./img/logo.png`, `./img/golfbag.png` plus color picker), discovered by scanning `./img/` and subfolders like `./img/cutscenes/` and `./img/splash/` via directory listing (or a manifest that includes subfolder paths) — the dropdown shall list images **including subfolder images correctly**, showing the full relative path (`./img/cutscenes/...`) and rendering them in preview and runtime.
    3. Character list: **collapsable** items (header `▼` toggles `collapsedChars` Set, `.item-body` hidden) with `Duplicate` (clones `id-copy` + offset) + `Remove`; choose `src` from `./img/...` or **pick from sprite library** (`src/character-sprites.json` dropdown, e.g. `may-right`), optional `frame` `x/y/w/h` inputs or auto-filled from sprite; place via **click on preview canvas** to set `x/y`, **drag to reposition**, slider for `scale` 0.2–3.0, anchor selector, visible toggle. When `frame` is set, preview/canvas shows only the cropped region (9-arg `drawImage`), not expensive. Left panel widened to `560px` (`min 480px, max 640px`) to avoid clipping and horizontal scroll for keyframe controls; canvas scaled to `960×540` (`PREVIEW_W 960`) to take more space.
   4. Movement keyframes: per character, timeline; add keyframe at current time; table `t | x | y | scale | sprite | easing` editable (`t` may be **negative** for animation during title intro, e.g. `-800` when intro is `800` black, allowed `-10000…`); `sprite` dropdown filtered to character's group sprites, allows changing image per keyframe e.g. up vs right, snapping not interpolated); **clicking a keyframe row or its `⏱` jump button jumps scrubber directly to that `t` (content time, `scrubTime = introTotal + t`; preview timer `#scrub-label` shows content time and can be negative during intro)** for positioning; drag character with `Shift` to add keyframe; scrub timeline slider 0–duration (label shows content time); preview interpolates `x/y/scale` and snaps `sprite` (including during negative intro phase).
   5. Camera keyframes: add at time `t` (`t` may be **negative** for pan/zoom during title intro, allowed `-10000…`), edit `x/y/zoom/easing`, timeline scrub; **clicking a camera keyframe row or its `⏱` jump button jumps scrubber directly to that `t` (content time, `scrubTime = introTotal + t`; preview timer matches and can be negative during intro)**; preview pans/zooms both canvases synchronously (or preview canvas) including during negative intro phase.
   6. Dialog editor: list of **collapsable** items (header `▼` toggles `collapsed`, `.item-body` hidden, `collapsedDialogs` Set not persisted) each with `t`/`auto` (checkbox “Start right after previous (auto)” disables `t` and sets `t:null, auto:true`, so dialog runs as soon as previous has finished without manual time), `speaker`, `text` (textarea), `cps`, `duration` (ms, `0-60000`, empty = stay until next dialog/manual, otherwise auto-hide after `reveal + duration`), `portrait` (dropdown or sprite id) and `portraitSide`; buttons `Preview @ this dialog`, `Duplicate` (clones with `t+500`), `Remove`; preview shows JRPG box with portrait left/right and typewriter at scrub time, respecting `duration` and `auto` effective times. Portrait `frame` is resolved via sprite library if `portrait` matches a sprite id.
   7. Load existing: panel **Load Existing Cutscene** with dropdown `#load-cutscene-select` **populated by listing files in the folder `./src/cutscenes/`** (fetch `./src/cutscenes/` directory listing and parse `*.json` links; fallback to probing known ids like `prologue` if listing unavailable), shows available `id`s from separate files (e.g. `prologue`) — `src/cutscenes.json` shall **not** be queried — and button `#load-cutscene-btn` to load selected, plus input `#load-cutscene-id` + `#load-cutscene-id-btn` to load by id via `GET ./src/cutscenes/<id>.json` and `Refresh List` button `#refresh-cutscene-list`; loading validates via `validateCutscene` and populates editor (scene, characters, camera, dialogs) for preview — allows previewing things saved previously via export.
   8. **New Scene:** button `#new-scene-button` text `New Scene` (or `+ New Scene`) that clears the editor state to a blank template (new `id` e.g. `new-scene`, title empty, `duration` default `15000`, empty/cleared `characters`/`dialogs`/`camera` and no intro/outro) and resets `scrubTime` to `0`, clears `localStorage` draft `cutsceneEditorDraft.v1` and updates UI/preview, allowing the user to start building a new scene from scratch without manually deleting fields. It shall not require a reload.
   9. JSON preview: live `textarea` showing current scene JSON; **Export button** `#cutscene-export-button` text `Export` or `Copy JSON` copies **whole scene as JSON** to clipboard via `navigator.clipboard.writeText(JSON.stringify(scene, null, 2))` plus `textarea` select fallback; also shows toast `copied to clipboard`. User manually saves file to `src/cutscenes/<id>.json`.
   10. Import: paste JSON textarea + `Load` button to restore editor state.
- **Persistence:** editor state kept in memory + `localStorage` draft `cutsceneEditorDraft.v1` (optional) for reload.
- **No backend:** export does not write file; it copies to clipboard for manual save (as spec: "so I can manually save it in the project later").
- **Access control:** no auth; hidden by obscurity (not linked). Direct fetch `GET /cutscene-editor.html` returns 200.

### 9.2 Character Sprite Mapping Editor (Hidden — For Sprite Sheets)

- **Endpoint:** `sprite-editor.html` at repo root. **Not linked** from `index.html` (hidden). Served as static file via `python3 -m http.server` same as game.
- **Implementation:** `sprite-editor.html` + `src/sprite-editor.js`. Helps map multiple pixel characters inside a single PNG with transparent background to named ids (e.g. `may-right`, `may-front`, `may-back`).
- **Features required:**
  1. Library view: list of existing mappings from `src/character-sprites.json` (fetch on load, fallback to empty). Each entry shows `id`, sheet `src`, `frame x/y/w/h`, and cropped preview (`canvas` or `img` with 9-arg draw).
  2. Create/edit: input `id` (`^[a-z0-9][a-z0-9-_]{1,40}$`, e.g. `may-right`), dropdown `src` sheet (`./img/...` same allow-list, plus custom path), and frame rectangle `x/y/w/h` (number inputs) **plus visual rectangle selector**: show sheet image at natural size (or scaled) with draggable/resizable overlay rectangle; dragging/resizing updates `x/y/w/h` live, and preview cropped sprite updates. Selecting an existing entry loads it for editing.
  3. Add/remove: `+ Add sprite`, per-entry `Remove`, `Duplicate`.
  4. JSON live preview: `textarea` showing `{"version":1,"sprites":{...}}` or flat object; **Export button** `#sprite-export-button` text `Export` / `Copy JSON` copies **whole mapping file as JSON** to clipboard via `navigator.clipboard.writeText(JSON.stringify(library,null,2))` + fallback and toast `copied to clipboard`. User manually saves to `src/character-sprites.json` in repo.
  5. Import: paste JSON textarea + `Load` to restore editor state (validates `src` and `frame`).
  6. Referencing: saved `src/character-sprites.json` is fetched by `cutscene-editor` (dropdown) and by `src/cutscene.js` at runtime to resolve `character.sprite` or `dialog.portrait` ids. Cutscene editor shows sprite library count and allows quick-pick to fill character `src`+`frame` or dialog `portrait`.
- **Not expensive:** mapping editor does 2D canvas cropping with one `drawImage` 9-arg per preview; no extra cost in game beyond same single blit per character (already supports `frame`).
- **Access control:** hidden by obscurity, not linked. `GET /sprite-editor.html` 200.

## 10. Integration Points

- `index.html:1` — add `#cutscene-dialog` HTML overlay inside `#game-container` (bounded, `z-index:12`), no new canvases.
- `style.css:1` — add `#cutscene-dialog` and `.cutscene-dialog-box` JRPG styles, `@import` or fallback `Press Start 2P` via system monospace.
- `src/main.js:1` — import cutscene module, add `cutsceneActive` guard in `update`/`render`/`handleInput`, expose `window.__playCutscene` for manual trigger and future `when to play` hook.
- `src/render.js:1` — no change except optional `drawCutsceneBackground` helper used by `renderCutscene`.

## 10b. Skip Button — Top-Right Corner

- Every cutscene shows a **Skip button** in the **top-right corner** of the canvas while it is active: `<button id="cutscene-skip-button">Skip »</button>` as a direct child of `#game-container` (bounded, `position:absolute; top:10px; right:12px; z-index:14` above the dialog `z-index:12` and title overlay `z-index:13`), `hidden` otherwise (`document.getElementById('cutscene-skip-button').classList` contains `hidden` iff `!cutsceneIsActive()`; `getComputedStyle(...).display==='none'` when hidden).
- Clicking it calls `skipCutscene()` (ends immediately via `endCutscene`, invoking `onComplete` so seen flags persist and chains advance: skipping prologue lands directly in `intro-3-hole` with no screen between, skipping the last chained cutscene proceeds to `showLoadout`). The click is `preventDefault()`-ed and `stopPropagation()`-ed so it never also fast-forwards dialog via the dialog/canvas click handlers.
- Visibility is synced from `syncCutsceneSkipButton()` in `src/main.js`, called on cutscene start (`playCutsceneWrapped` when `ok`), on `onComplete`, and every frame in the `update()` cutscene branch, so the button is visible throughout intro/content/outro and never leaks into gameplay, menus, loadout, or reward overlays. Wired once in `init()` (`#cutscene-skip-button` click → `cutsceneSkip()` when `cutsceneIsActive()`), exposed as `window.__syncCutsceneSkipButton` for tests.
- Styling is a small unobtrusive pill (`font:700 11px system-ui`, white on `rgba(0,0,0,0.55)`, `1px solid rgba(255,255,255,0.35)`, `border-radius:8px`, `padding:6px 12px`, `cursor:pointer`), hover brightens (`background:rgba(0,0,0,0.75)`).

## Acceptance Criteria

- [ ] `cutscene-editor.html` is served at repo root and NOT referenced from `index.html` (hidden endpoint); `GET /cutscene-editor.html` 200 via `python3 -m http.server 8000`, contains `#cutscene-export-button` that copies scene JSON (`navigator.clipboard.writeText` + fallback) and shows toast, editors for background / **collapsable** character placement/scale/movement (including `frame` cropping and sprite library quick-pick, `Duplicate` per character, `collapsedChars` Set, header `▼` toggle) + keyframe timings (`sprite` per keyframe, **click-to-jump on character and camera keyframe rows (⏱ button) matching preview timer which can be negative during intro, `t` may be negative for animation during title fade**) + **collapsable/duplicatable** dialog (header toggle, `Duplicate`, `duration` auto-hide, `collapsedDialogs` Set) + camera pan/zoom (also **click-to-jump**, `t` may be negative), **and Load Existing panel** with `#load-cutscene-select` (populated by listing folder `./src/cutscenes/` — not `src/cutscenes.json`) + `#load-cutscene-btn` + `#load-cutscene-id`/`#load-cutscene-id-btn` + **`#new-scene-button` (New Scene) that clears to blank template**, left panel `560px` (`min 480, max 640`, no horizontal scroll for keyframe controls), canvas `960×540` (`PREVIEW_W 960`) takes more space, timestamp `Math.round` limits decimals, and **background / portrait / character `src` dropdowns include subfolder images** (`./img/cutscenes/...`, `./img/splash/...` correctly).
- [ ] `sprite-editor.html` is served at repo root and NOT referenced from `index.html` (hidden endpoint); `GET /sprite-editor.html` 200, contains `#sprite-export-button` that copies `src/character-sprites.json` library as JSON and shows toast, and mapping UI (id, sheet `src`, `frame x/y/w/h` with visual draggable rectangle selector, live cropped preview, add/remove).
- [ ] `src/character-sprites.json` contains `version/sprites` or flat object with named sprites (e.g. `may-right`, `may-front`, `may-back` each `{src, frame{x,y,w,h}}`); `validate` checks `id` regex, `src` `./img/...`, `frame` positive. Editor export produces valid JSON that can be saved in repo and subsequently fetched by `cutscene-editor` and `src/cutscene.js`.
- [ ] JSON format `src/cutscenes/*.json` validated per §7 schema, each has unique `id`; `validateCutscene` enforces `id` regex and ranges including optional `frame`/`sprite`; loader **only** fetches `src/cutscenes/<id>.json` (separate files in folder `./src/cutscenes/`, not `src/cutscenes.json`); `src/cutscenes.json` is **not used** and shall be absent or `[]` and ignored if present (loader does not fetch it). Characters with `frame` use 9-arg `drawImage` cropping (not expensive, same one blit per character).
- [ ] `playCutscene(idOrData)` draws static background on `#bg-canvas` (opaque, aspect-covered) and characters on `#game` (transparent) with synchronized camera pan/zoom `translate(-x,-y) scale(zoom)`; `camera.keyframes` interpolation uses `easing`. Characters with `frame` or `sprite` resolve to cropped sprite sheet rendering (9-arg), not expensive.
- [ ] Character placement/scaling/movement via `x/y/scale` + optional `frame`/`character` group + `sprite` reference to `src/character-sprites.json` + `keyframes` (`x/y/scale/sprite` per keyframe, `sprite` snaps, e.g. up vs right) interpolated per §4, rendered on top canvas cropped via `frame` (9-arg) when needed, ordered by `zIndex`; grouping `characters` in sprite library (e.g. `may` = `may-front`+`may-right`...) is selectable in cutscene editor as character, and per-keyframe `sprite` dropdown is filtered to that character's sprites; clicking a keyframe row jumps scrubber to its `t` for precise positioning.
- [ ] Dialog overlays are HTML `#cutscene-dialog` above canvases (not canvas text), timed by `dialogs[*].t`/`auto` + optional `duration` `0-60000` ms, typewriter at `cps` reveals, JRPG blue `#1a3a8a` + white pixelated monospace styling per §6, fast-forward on `Space`/`R`/`click` reveals instantly first press, second press advances to next dialog or closes if last; while revealing, camera/character interp continues. Each dialog can have `t` **or** `auto:true` (`t:null`) to **start right after previous has finished** without manual time (first auto starts at `0`, subsequent `effectiveT = previous effectiveT + reveal + duration`); each dialog has associated `portrait` image (relative `./img/...` or sprite id) shown on `portraitSide` `left`/`right` (`64-80px`); when no portrait, box shows text only. Portrait with `frame` is also cropped (9-arg) if mapped. **Duration** auto-hides dialog after `reveal + duration` (empty = stay until next/manual, prevents forever); editor shows `duration` input and `auto` checkbox, dialogs are **collapsable** (header `▼` toggle) and **duplicatable** (`Duplicate` clones `t+500`). Preview timestamp decimals limited via `Math.round`.
- [ ] While `cutsceneActive`, main game input/pause/reward/hotbar blocked, physics frozen, `#hud` hidden, `requestAnimationFrame` still runs cutscene update/render.
- [ ] Skip button: `#cutscene-skip-button` (`Skip »`) is visible in the top-right corner (`top` within `20px`, `right` within `20px` of `#game-container`, `z-index:14` above dialog/title overlays) while any cutscene is active — including title intro and fade-out — and hidden (`display:none`) otherwise; clicking it ends the cutscene at once (seen flags persist, prologue skip chains directly into `intro-3-hole`, last-cutscene skip proceeds to loadout) without also advancing dialog.
- [ ] Exported JSON from cutscene editor is `JSON.stringify(scene,null,2)` with all §7 fields including optional `frame`/`sprite` and can be saved as `src/cutscenes/<id>.json` and subsequently `playCutscene(id)` loads it bit-identically; exported sprite library from sprite editor is similarly bit-identical when saved to `src/character-sprites.json` and referenced later via sprite `id`.

## 11. Prologue Trigger — First 3-Hole Play

- The cutscene `src/cutscenes/prologue.json` (`id: "prologue"`) shall be presented exactly once, the first time the player clicks the 3-hole course (from `#staged-course-list` / `handleCoursePlay(courseId)` where `course.holeCount===3`) while on the main menu and with no restorable save (`hasRestorableSave()===false`).
- The next game state after the click is the loadout (`showLoadout(courseId)`). When the prologue is due, the cutscene shall be played **before** that transition: `handleCoursePlay` shall intercept the 3-hole click, check persistent seen flag, and if not seen, call `playCutscene("prologue", {onComplete: ...})` and only after `onComplete`/`skip` proceed to `showLoadout(courseId)`. Direct `startCourseWithLoadout` without going through `handleCoursePlay` shall not trigger the prologue.
- Persistence: seen flag stored in `localStorage` key `CUTSCENE_SEEN_KEY = "golfVectorField.cutscenes.seen.v1"` as JSON `{version:1, seen: string[]}` (array of cutscene ids). Helpers `hasSeenCutscene(id)` / `markCutsceneSeen(id)` / `loadSeenCutscenes()` in `src/cutscene.js` (also exposed on `window` for tests). `markCutsceneSeen("prologue")` is called on `onComplete` (completed or skipped) and persists immediately. Once `seen` contains `"prologue"`, subsequent clicks on the 3-hole course shall go directly to `showLoadout` without cutscene, even after reload (persisted). `localStorage.clear()` / `regenerateCampaign()` clears the key, so a new campaign will show the prologue again — this is expected.
- The cutscene shall not be shown if `cutsceneIsActive()` already true, if `hasRestorableSave()` is true (auto-resume), or if `course.holeCount !== 3`. Non-3-hole courses shall never trigger the prologue.
- While the prologue (or any cutscene) is active, `syncMainMenu`/`syncParallaxVisibility`/`redrawBottom` shall hide `#main-menu-overlay`/`#parallax-scene` and suppress splash drawing so the cutscene's `bgCanvas` background (aspect-covered `img/cutscenes/bg-club-house.png` etc.) is visible; `update`/`render` already hide wind/HUD/hotbar and freeze physics during `cutsceneIsActive()`.
- Implementation shall be resilient: if `prologue.json` fails to load/validate, `handleCoursePlay` shall fall back to `showLoadout` without blocking.

## 11b. Intro 3-Hole Cutscene — Directly After Prologue (Tutorial Chain)

- The cutscene `src/cutscenes/intro-3-hole.json` (`id: "intro-3-hole"`) shall be presented **directly after the prologue cutscene has been played**, before the loadout is shown, when the prologue chain is active for the 3-hole course.
- Trigger: `handleCoursePlay(courseId)` where `course.holeCount===3` and `!hasSeenCutscene('prologue')` (prologue due) shall chain: `playCutscene("prologue", {onComplete: ...})` → on complete `markCutsceneSeen("prologue")` → **immediately** `playCutscene("intro-3-hole", {onComplete: ...})` → on complete `markCutsceneSeen("intro-3-hole")` → then `showLoadout(courseId)` with shop hidden. If `prologue` has already been seen, `intro-3-hole` shall **not** be played as part of this chain (it is not independently triggered on later 3-hole clicks); direct `startCourseWithLoadout` bypasses both. If either cutscene fails to load/validate, the chain shall fall back to next step so player is never blocked.
- Persistence: `intro-3-hole` uses the same `CUTSCENE_SEEN_KEY` array as prologue. `hasSeenCutscene("intro-3-hole")` / `markCutsceneSeen("intro-3-hole")` same helpers. Once seen, subsequent 3-hole plays shall not chain again. `localStorage.clear()` / `regenerateCampaign()` clears seen, so new campaign will show prologue + intro-3-hole again.
- The chained cutscenes shall respect the same blocking as prologue: not shown if `cutsceneIsActive()` already true, if `hasRestorableSave()` true, or if `course.holeCount !== 3`. While either cutscene is active, `syncMainMenu`/`syncParallaxVisibility`/`redrawBottom` shall remain hidden.
- **Back-to-back chaining (no intermediate screen):** `handleCoursePlay` shall preload **both** `prologue.json` and `intro-3-hole.json` (`Promise.all([loadCutscene('prologue'), loadCutscene('intro-3-hole')])`) **before** playing the first, so the second can start **synchronously** inside the first's `onComplete` with no async fetch gap. Between the two there shall be no visible main menu, splash, parallax, HUD, loadout, coin indicator, or terrain — `cutsceneIsActive()` is effectively continuous (only the synchronous handoff where `endCutscene` clears `active` then `playCutscene` sets the next in the same call stack). `syncProgressionDisplay()` shall also require `!cutsceneIsActive()` so `#progression-coins-display` stays hidden during both cutscenes.
- **Loadout consequence:** The loadout shown immediately after `intro-3-hole` (i.e., the loadout triggered by the prologue → intro-3-hole chain for the 3-hole course) shall be shown **over the pre-loaded hole 1** (`mainMenuVisible=false`, terrain behind, see `10-progression.md` §2.1) and shall **not contain any shop panel** (see `10-progression.md` §2.2 shop hidden when intro-3-hole just played). The run started from it is the **tutorial run** (`isTutorialRun`, liquifier-only single-card rewards, no re-roll — see `08-rewards-and-progression.md` §5b). Subsequent loadouts (after `intro-3-hole` is already seen) shall show shop normally.

## 11c. First-Restock Cutscene — Before Loadout on First Restocked Run

- The cutscene `src/cutscenes/first-restock.json` (`id: "first-restock"`) shall be presented exactly once, on the start of the run where the shop is restocked for the first time — i.e. the first `handleCoursePlay(courseId)` (any unlocked course) after the first shop restock has occurred — before the loadout overlay is shown.
- **Restocked definition:** the shop counts as restocked when `getShopStock()` has any count `>0` (first milestone granted per `10-progression.md` §1.6) or, equivalently when the shop was already emptied by purchases, when the 3-hole course has been cleared (`courses.find(c=>c.holeCount===3).bestTotal !== null`, which is what grants the first restock: deflector + rotator + magnifier). Either condition means the first restock has happened. Helper `isShopRestockedFirstTime()` (or inline check) shall return true in either case.
- **Trigger:** `handleCoursePlay(courseId)` with `hasRestorableSave()===false` and `!cutsceneIsActive()` and `!hasSeenCutscene('first-restock')` and shop restocked per above shall intercept before `showLoadout(courseId)`: hide main menu/splash/parallax immediately (same as prologue §11), `loadCutscene('first-restock')`, then `playCutsceneWrapped(data, {onComplete})` → on complete `markCutsceneSeen('first-restock')` → then `showLoadout(courseId)` (shop visible normally). Direct `startCourseWithLoadout` without going through `handleCoursePlay` shall not trigger it. If the JSON fails to load/validate or play fails, fall back to `showLoadout` without blocking (marking seen to avoid loops on invalid data, same as prologue fallback).
- **Ordering:** prologue/intro-3-hole chain (§11/§11b) takes precedence when due (first 3-hole play, shop still empty so no conflict in practice). `first-restock` is checked after the prologue branch: if prologue was due it chains to loadout directly; otherwise if `first-restock` is due it plays before loadout. While active, `syncMainMenu`/`syncParallaxVisibility`/`redrawBottom`/`syncProgressionDisplay` shall stay hidden exactly as for prologue so the cutscene background is visible.
- **Persistence:** same `CUTSCENE_SEEN_KEY` array as prologue. Once `seen` contains `"first-restock"`, subsequent run starts go directly to `showLoadout`. `localStorage.clear()` / `regenerateCampaign()` clears seen, so a new campaign shows it again after its first restock.

## 11d. End-9-Hole Cutscene — After Victory, Before Summary on First 9-Hole Clear

- The cutscene `src/cutscenes/end-9-hole.json` (`id: "end-9-hole"`) shall be presented exactly once, the first time the player clears the 9-hole course — **after the `Course Completed!` victory screen is dismissed and before the coin end-run summary appears**.
- **Trigger:** `returnToMainMenu()` from the victory state (`gameState==="WIN"` on the final hole of a course with `holeCount===9`) where this run was the first clear (`runFirstCourseClear===true`, i.e. `bestTotal` just transitioned `null` → number in `maybeUpdateHighScore()`) and `!hasSeenCutscene('end-9-hole')` and `!cutsceneIsActive()` shall intercept before `finalizeRunCoinsAndShowSummary()`: hide the victory overlay (`#win-overlay`), `loadCutscene('end-9-hole')`, then `playCutsceneWrapped(data, {onComplete})` → on complete `markCutsceneSeen('end-9-hole')` → then the normal return path (`finalizeRunCoinsAndShowSummary()` → summary overlay with first-clear `+50` bonus, or deferred menu return). Both victory exits funnel here: green `Continue` (`#continue-button-win` click) and `R` (`resetGameAfterWin` → `returnToMainMenu()`). Skipping the cutscene (`Skip »`) lands directly at the summary. `End Run` / `Game Over` paths never trigger it (`gameState` is not `WIN` there).
- **Ordering:** victory overlay first (with `bestTotal`/shop/stage unlock already applied at WIN time), then `end-9-hole`, then the coin summary (which still shows first-clear bonus + `New Course Unlocked` for the 18-hole stage when applicable), then the main menu. Coins are finalized after the cutscene, not before. While active, the usual cutscene hiding applies (`syncMainMenu`/`syncParallaxVisibility`/`redrawBottom`/`syncProgressionDisplay` stay hidden, HUD/hotbar frozen).
- **Persistence:** same `CUTSCENE_SEEN_KEY` array as prologue. Once `seen` contains `"end-9-hole"`, subsequent 9-hole clears go victory → summary directly. `localStorage.clear()` / `regenerateCampaign()` clears seen. If the JSON fails to load/validate or play fails, fall back to the summary without blocking (marking seen to avoid loops, same as `first-restock` fallback).

## 12. Title Intro & Fade Transitions — Black Screen Title + Fade In/Out (Configurable)

Each cutscene may optionally show a **title intro on a black screen** before its content plays, with a **fade-in** into the scene, and a **fade-out to black** at the end. All timings are configurable per cutscene via JSON and the cutscene editor; when not configured the behavior is backward-compatible (no intro, no extra fade).

### 12.1 Purpose & Timeline

Intro sequence runs **before** camera/dialog content time starts (content frozen at `t=0` during black/title/hold, then runs during fade). Timeline from `t=0` of the cutscene:

1. **Black screen** for `X` ms (`intro.blackMs`): only black overlay visible, no title. `X` = `intro.blackMs` (alias `intro.blackDuration` / `blackDuration`).
2. **Title animate in** — scene title text fades (and slightly scales) from `opacity 0` to `1` over `titleFadeMs` ms (`intro.titleFadeMs` alias `intro.textFadeMs` / `intro.titleAnimateMs`). Title is `intro.title` if set else `scene.title` else `id`.
3. **Pause / hold** for `Y` ms (`intro.holdMs` alias `intro.pauseMs` / `intro.titleHoldMs`): title stays fully visible on black.
4. **Cutscene fade-in** over `Z` ms (`intro.fadeInMs` alias `intro.cutsceneFadeInMs` / `intro.sceneFadeMs` / `fadeInDuration`): black overlay fades `1→0` and title fades `1→0` while the cutscene background/characters underneath become visible and **already animating**. Camera/dialog interpolation uses **effective content time** `contentTime = max(0, elapsed - introBeforeFade)` where `introBeforeFade = blackMs + titleFadeMs + holdMs` and `introTotal = introBeforeFade + fadeInMs`; `contentTime` is `0` at fade start (time `0` of the scene), negative before that (preview timer shows negative), and `fadeInMs` at fade end. During black/title/hold, content is paused at `0`; during fade it runs from `0` to `fadeInMs` while fading.

All four values are **independently configurable from the cut-scene editor** (see §12.4). Any may be `0` to skip that phase. If the whole `intro` object is missing or all zeros and no title, there is no intro and content starts immediately (existing behavior).

**Fade-out to black**: optional `outro.fadeOutMs` (alias `outro.fadeOutDuration` / `fadeOutMs` flat, `X2`) — over that duration at the **end** of the cutscene the scene fades to black. If `fadeOutMs > 0`, total active duration is extended by `fadeOutMs` beyond `data.duration` (content). During `fadeOutMs` the black overlay fades `0→1`, dialog is hidden, and characters/background are frozen behind the fade. Click/skip during fade completes immediately. When `outro` missing or `0`, no fade-out (cutscene ends normally).

Total active time: `introBeforeFade + contentDuration + fadeOutMs` where `introBeforeFade = blackMs + titleFadeMs + holdMs` (`introTotal = introBeforeFade + fadeInMs` includes fade which overlaps content), `contentDuration = data.duration` (or auto-computed). `contentTime` is `0` at fade start.

### 12.2 DOM & Rendering

- **Overlay** `#cutscene-title-overlay` (also allowed `#cutscene-fade-overlay` / `#cutscene-overlay`) is `position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#000; z-index:13` inside `#game-container` (bounded, `border-radius:8px`, above canvases and dialog during intro/outro). Contains child `#cutscene-title-text` (or `.cutscene-title-text`) with scene title.
- **Title text style**: centered, `font:700 28-32px system-ui` (or `22-28px` on narrow) white ` -webkit-text-stroke` + `text-shadow`, `letter-spacing`, animated via `opacity` + `transform: scale/translateY`. During `titleFadeMs` it interpolates `opacity 0→1, scale 0.96→1, translateY 8→0` `easeOut`. During `holdMs` it stays `1`. During `fadeInMs` it fades `1→0` together with overlay.
- **Overlay opacity**: `1` during black + title phases, `1→0` linearly/eased over `fadeInMs` (intro) and `0→1` over `fadeOutMs` (outro). Overlay is `display:none` when not active and not fading, otherwise `display:flex`. It does not block dialog after intro (hidden).
- **Rendering**: during intro, `renderCutscene(bgCtx,fgCtx)` still renders background/characters at `contentTime=0` (frozen) behind the opaque overlay so fade-in reveals them smoothly. During fade-out, content frozen at last frame behind increasing opacity.

### 12.3 JSON Schema Extensions (backward-compatible, optional)

Added to the single-scene object (alongside `id/title/background/etc.`):

```json
{
  "id": "intro-mt-aeolus",
  "title": "The Windy Peak",
  "intro": {
    "blackMs": 800,
    "titleFadeMs": 600,
    "holdMs": 900,
    "fadeInMs": 800,
    "title": "The Windy Peak"
  },
  "outro": {
    "fadeOutMs": 700
  }
}
```

Field constraints (all optional):
- `intro` optional object. If missing treated as all zeros (no intro).
  - `intro.blackMs` / `intro.blackDuration` / `intro.initialBlackMs` — integer `0–10000` ms, default `0`.
  - `intro.titleFadeMs` / `intro.textFadeMs` / `intro.titleAnimateMs` / `intro.titleFadeDuration` — integer `0–5000` ms, default `0` (or `500` if title present but missing; both `0` acceptable).
  - `intro.holdMs` / `intro.pauseMs` / `intro.titleHoldMs` — integer `0–10000` ms, default `0`.
  - `intro.fadeInMs` / `intro.cutsceneFadeInMs` / `intro.sceneFadeMs` / `intro.fadeInDuration` — integer `0–10000` ms, default `0`.
  - `intro.title` optional string `1–80` chars override for overlay; defaults to `data.title` else `data.id`. Empty means no title (just black + fade).
  - `intro.enabled` optional boolean; if `false` intro disabled even if numbers set; if `true` or omitted and any intro timing >0 or title set, intro is enabled.
- `outro` optional object:
  - `outro.fadeOutMs` / `outro.fadeOutDuration` — integer `0–10000` ms, default `0`. Alias flat `fadeOutMs` / `fadeOutDuration` at top level also accepted for backward compat.
- Legacy flat aliases at top level `blackMs`/`blackDuration`/`titleFadeMs`/`holdMs`/`fadeInMs`/`fadeOutMs` are also accepted if `intro`/`outro` not present (coerced).
- Unknown fields ignored for forward compat.

`validateCutscene` shall accept the extended schema (intro/outro optional, ranges enforced, invalid out-of-range yields error; missing is valid). `validateCutscene` returns `{valid, errors}` and `playCutscene` shall reject only if strictly invalid, not if intro/outro present and valid.

### 12.4 Editor — Configurable Timings

Cutscene editor `cutscene-editor.html` + `src/cutscene-editor.js` shall expose controls for all intro/outro timings so they are **configurable without editing JSON by hand**:

- **Panel** `Title Intro & Fades` (or `Intro / Outro`) with:
  - Checkbox `Enable intro` (`#intro-enabled` / `input[data-k="introEnabled"]`) toggling intro visibility.
  - Four number inputs (all `type="number"` `min 0` `max 10000` `step 100`):
    - `Black screen (X ms) — blackMs` `#intro-black-ms`
    - `Title animate in — titleFadeMs` `#intro-title-fade-ms`
    - `Pause / hold (Y ms) — holdMs` `#intro-hold-ms`
    - `Cutscene fade-in (Z ms) — fadeInMs` `#intro-fadein-ms`
  - Optional text input `Title override` `#intro-title` (placeholder `scene title`, defaults to scene title).
  - One number input `Fade-out to black (X2 ms) — fadeOutMs` `#outro-fadeout-ms`
  - `Preview Intro` button to scrub/preview the intro timeline on the preview canvas.
- All values persist via `scene.intro` / `scene.outro` and are included in the live JSON preview and export (`JSON.stringify(scene,null,2)`). The preview canvas shows the black overlay + title according to scrub time: before `blackMs` only black, during `titleFadeMs` title opacity ramps, during `holdMs` title solid, during `fadeInMs` overlay fades revealing background/characters. Scrubber timeline covers `introTotal + duration` so intro is scrub-able. **Preview timer (`#scrub-label`) matches keyframe times** — it shows content time `scrubTime - introTotal` (i.e., keyframe `t`), which **can be negative** during the intro title phase (e.g., `-800 ms` at start if `blackMs=800`); add-keyframe and camera keyframe `t` values are also content-time.
- `validateCutscene` in editor reuses the same validation as runtime and shows errors inline.

### 12.5 Runtime Behavior & Input

- `isCutsceneActive()` is `true` throughout intro and fade-out as well as content.
- `getCutsceneTime()` returns total elapsed since cutscene start (including intro).
- `updateCutscene(dt)` drives intro progression and fade alphas; content time is offset as above.
- `handleCutsceneInput` fast-forward: while in intro, `Space`/`R`/`Click` skips the intro immediately to content start (total intro time jumped, overlay hidden, contentTime=0); while fading out, input completes cutscene immediately.
- `skipCutscene()` immediately ends and calls `onComplete` even mid-intro/outro.
- Input blocking and layer hiding (HUD/menus/parallax/wind) remain as before throughout intro/outro via `cutsceneIsActive()`.
- Exposure for tests: `window.__cutscene.getIntroConfig`, `window.__cutscene.getOutroConfig`, `window.__cutscene.getCutsceneOverlay` (or `getTitleOverlay`), `window.__cutscene.isIntroActive`.

### 12.6 Acceptance Criteria Extension

- [ ] JSON with `intro: {blackMs:500,titleFadeMs:400,holdMs:600,fadeInMs:700}` and `outro:{fadeOutMs:800}` validates; `playCutscene` shows overlay `#cutscene-title-overlay` (or `#cutscene-fade-overlay`) `background:#000` `inset:0` `display:flex` with `opacity 1` and title text (`#cutscene-title-text` contains scene title) for `X` ms (portrait not required); then text `opacity 0→1` over `titleFadeMs`; then holds `Y` ms at `opacity 1`; then overlay `opacity 1→0` over `Z` ms revealing cutscene (background/characters at `contentTime 0`); all configurable and visible in preview. When numbers `0`, that phase is skipped and intro still works. Missing intro/outro yields immediate content (no regression).
- [ ] Fade-out: when `outro.fadeOutMs` or flat `fadeOutMs` is `>0`, in the last `X2` ms the overlay fades `0→1` to black over that duration before `onComplete`; dialog is hidden during fade-out; input during fade completes; skip still ends.
- [ ] Editor `cutscene-editor.html` contains inputs for `blackMs / titleFadeMs / holdMs / fadeInMs / fadeOutMs` (number inputs bounded `0-10000`) that are wired to `scene.intro`/`scene.outro`, live JSON preview includes them, `Export` includes them bit-identically, and scrub preview shows intro overlay at scrub `0–introTotal`; **preview timer (`#scrub-label`) matches keyframe `t`** (content time `scrubTime - introTotal`, **can be negative** during intro, e.g., `-800 ms` at start).
- [ ] `validateCutscene({id:"test-intro", intro:{blackMs:500,titleFadeMs:600,holdMs:700,fadeInMs:800}, outro:{fadeOutMs:600}})` passes; out-of-range `blackMs:20000` fails.
- [ ] While intro/fade-out active, `cutsceneIsActive()===true`, `parallax`/`hud`/`bottom-bar` remain hidden as before; `renderCutscene` still draws background at contentTime `0` behind overlay.

## File Paths

- `docs/requirements/11-cutscenes.md:1` (this file)
- `src/cutscene.js:1` (engine, validation, pan/zoom, typewriter, frame/sprite resolve, seen persistence `CUTSCENE_SEEN_KEY`, now also intro/outro fade handling)
- `src/character-sprites.json` (sprite sheet mappings: `may-right` etc. `{src, frame{x,y,w,h}}`)
- `src/spriteLibrary.js` or inline in `src/cutscene.js` (loader `loadSpriteLibrary`, `getSprite`)
- `src/cutscenes/<id>.json` only (one file per cutscene in folder `./src/cutscenes/`; `src/cutscenes.json` deprecated — shall not be used, shall be absent or `[]`) (data, unique IDs; characters may contain `frame`/`sprite`, now also optional `intro`/`outro`)
- `src/cutscenes/prologue.json:1` (prologue cutscene, id `prologue`, shown once before first 3-hole course)
- `src/cutscenes/end-9-hole.json:1` (end-9-hole cutscene, id `end-9-hole`, shown once after victory before summary on first 9-hole clear)
- `cutscene-editor.html:1` (hidden endpoint, not linked)
- `src/cutscene-editor.js:1` (editor logic, preview, export; loads sprite library, now also intro/outro controls)
- `sprite-editor.html:1` (hidden endpoint for mapping)
- `src/sprite-editor.js:1` (sprite mapping editor, visual rect selector, export `#sprite-export-button`)
- `index.html:1` (`#cutscene-dialog` overlay with `.cutscene-portrait`, plus `#cutscene-title-overlay`/`#cutscene-fade-overlay` black + title, plus `#cutscene-skip-button` top-right)
- `style.css:1` (JRPG dialog box + portrait, editor styles if shared, plus `#cutscene-title-overlay` / `.cutscene-title-text` fade styles, plus `#cutscene-skip-button` top-right pill)
