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
  - `x/y` is initial placement in logical coordinates (anchor point).
  - `scale` is uniform scale (0.2–3.0), applied as above (with or without `frame`).
  - `visible` default true.
  - `keyframes` optionally script movement/appearance: each keyframe has `t` (ms), target `x/y/scale`, optional `sprite` (sprite id like `may-right` from `src/character-sprites.json` or `character` group sprite) and/or `frame`/`src` override, `easing`. Interpolated between keyframes for `x/y/scale`; `sprite` snaps discretely to last keyframe `≤ t` (no interpolation). When no keyframe active, uses base `x/y/scale`/`sprite`.
  - `character` optional grouping id `^[a-z0-9][a-z0-9-_]{1,40}$` referencing `src/character-sprites.json` `characters` (e.g. `may` groups `may-front` etc.). If `character` is set, `sprite` dropdown in editor is filtered to that character's sprites, and per-keyframe `sprite` can be chosen from that filtered list to change image per keyframe (e.g. up vs right).
  - `zIndex` orders draw on top canvas (lower drawn first).

Movement is drawn on top canvas only; physics not applied. Frame cropping is not expensive and is handled per-character in the same draw call (9-arg). Selecting a keyframe row in editor jumps scrubber to that keyframe's `t` for precise positioning.

## 5. Dialog System — Timed Overlays with Typewriter + Speaker Portrait

- `dialogs: Array<{id?:string, t?:number, auto?:boolean, speaker?:string, text:string, cps?:number, duration?:number, portrait?:string, portraitSide?:'left'|'right'}>`
  - `t` is start time in ms from cutscene start when dialog should appear. **Optional**: if `t` is `null`/`undefined` or `auto:true`, dialog starts **right after previous has finished** (previous `effectiveT + reveal + duration`), so you don't have to set a start time — it runs as soon as previous one has finished. First dialog with `auto` starts at `0`.
  - `auto` optional boolean: when `true` or `t == null`, dialog is auto-started after previous. Editor shows checkbox “Start right after previous (auto)” that disables `t` input.
  - `speaker` optional name shown above text.
  - `text` is dialog string (supports `\n` for line breaks, max ~200 chars).
  - `cps` is chars per second for typewriter (default 30, range 10–60).
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

File: `src/cutscenes/<id>.json` or `src/cutscenes.json` (array) or `src/cutscene-data.json`. All are allowed; loader shall try `src/cutscenes.json` then `src/cutscenes/<id>.json` via fetch. Exported JSON from editor is single-scene object.

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
- `camera.keyframes` optional; each `t≥0`, `zoom 0.5–3.0`, `easing` default `linear`.
- `characters[*].id` required per character, unique within scene; `src` required unless `sprite` is set (then resolved via `src/character-sprites.json`); when `frame` present: `frame.x/y ≥0`, `frame.w/h >0` and `frame.w/h ≤ 2048`; `x/y` 0–LOGICAL_W/H; `scale` 0.2–3.0; `anchor` `center|bottom` default `center`. `sprite` optional id `^[a-z0-9][a-z0-9-_]{1,40}$` referencing `src/character-sprites.json`.
- `characters[*].keyframes` optional; each `t≥0` sorted ascending; `x/y/scale` same ranges as base; optional `sprite` sprite id `^[a-z0-9][a-z0-9-_]{1,40}$` (must exist in `src/character-sprites.json` when used, allows per-keyframe image change, e.g. up vs right), optional `frame`/`src` override, `easing` `linear|easeIn|easeOut|easeInOut`. Keyframe row in editor is clickable to jump scrubber to `t`.
- `dialogs[*].t` optional `≥0` (if `null`/`undefined` or `auto:true` → auto after previous); `text` 1–500 chars; `cps` default 30; `speaker` optional; `portrait` optional `./img/...` path or sprite id, `portraitSide` `left|right` default `left`; `duration` optional `0-60000` auto-hide (empty = stay forever); `auto` optional boolean. Sorted by effective `t` (auto = previous `effectiveT + reveal + duration`).
- `duration` optional ms; if omitted, duration is last dialog `t` + text length/cps*1000 + 1000.
- Unknown fields ignored for forward compat.

Validation: `validateCutscene(json)` returns `{valid:boolean, errors:string[]}`; `playCutscene` shall reject invalid with `console.warn` and not start.

## 8. Runtime API (src/cutscene.js)

Exports:
- `loadCutscene(id): Promise<object|null>` — fetch from `src/cutscenes/<id>.json` or `src/cutscenes.json`, cache.
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
  2. Background chooser: dropdown of allowed `./img/...` assets (`background-gfg-splash.png`, `middleground-gfg-splash.png`, `foreground-gfg-splash.png`, `may-gfg-splash.png`, `gfg-splash.png`, `logo.png`, `golfbag.png` plus color picker) with preview.
   3. Character list: **collapsable** items (header `▼` toggles `collapsedChars` Set, `.item-body` hidden) with `Duplicate` (clones `id-copy` + offset) + `Remove`; choose `src` from `./img/...` or **pick from sprite library** (`src/character-sprites.json` dropdown, e.g. `may-right`), optional `frame` `x/y/w/h` inputs or auto-filled from sprite; place via **click on preview canvas** to set `x/y`, **drag to reposition**, slider for `scale` 0.2–3.0, anchor selector, visible toggle. When `frame` is set, preview/canvas shows only the cropped region (9-arg `drawImage`), not expensive. Left panel widened to `420px` to avoid clipping; canvas scaled to `960×540` (`PREVIEW_W 960`) to take more space.
  4. Movement keyframes: per character, timeline; add keyframe at current time; table `t | x | y | scale | sprite | easing` editable (`sprite` dropdown filtered to character's group sprites, allows changing image per keyframe e.g. up vs right, snapping not interpolated); **clicking a keyframe row jumps scrubber to that `t`** for positioning; drag character with `Shift` to add keyframe; scrub timeline slider 0–duration; preview interpolates `x/y/scale` and snaps `sprite`.
  5. Camera keyframes: add at time `t`, edit `x/y/zoom/easing`, timeline scrub; preview pans/zooms both canvases synchronously (or preview canvas).
   6. Dialog editor: list of **collapsable** items (header `▼` toggles `collapsed`, `.item-body` hidden, `collapsedDialogs` Set not persisted) each with `t`/`auto` (checkbox “Start right after previous (auto)” disables `t` and sets `t:null, auto:true`, so dialog runs as soon as previous has finished without manual time), `speaker`, `text` (textarea), `cps`, `duration` (ms, `0-60000`, empty = stay until next dialog/manual, otherwise auto-hide after `reveal + duration`), `portrait` (dropdown or sprite id) and `portraitSide`; buttons `Preview @ this dialog`, `Duplicate` (clones with `t+500`), `Remove`; preview shows JRPG box with portrait left/right and typewriter at scrub time, respecting `duration` and `auto` effective times. Portrait `frame` is resolved via sprite library if `portrait` matches a sprite id.
  7. Load existing: panel **Load Existing Cutscene** with dropdown `#load-cutscene-select` populated from `src/cutscenes.json` (fetch on load, shows available `id`s from repo, e.g. `intro-mt-aeolus`) and button `#load-cutscene-btn` to load selected, plus input `#load-cutscene-id` + `#load-cutscene-id-btn` to load by id via `GET ./src/cutscenes/<id>.json` and `Refresh List` button `#refresh-cutscene-list`; loading validates via `validateCutscene` and populates editor (scene, characters, camera, dialogs) for preview — allows previewing things saved previously via export.
  8. JSON preview: live `textarea` showing current scene JSON; **Export button** `#cutscene-export-button` text `Export` or `Copy JSON` copies **whole scene as JSON** to clipboard via `navigator.clipboard.writeText(JSON.stringify(scene, null, 2))` plus `textarea` select fallback; also shows toast `copied to clipboard`. User manually saves file to `src/cutscenes/<id>.json`.
  9. Import: paste JSON textarea + `Load` button to restore editor state.
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

## Acceptance Criteria

- [ ] `cutscene-editor.html` is served at repo root and NOT referenced from `index.html` (hidden endpoint); `GET /cutscene-editor.html` 200 via `python3 -m http.server 8000`, contains `#cutscene-export-button` that copies scene JSON (`navigator.clipboard.writeText` + fallback) and shows toast, editors for background / **collapsable** character placement/scale/movement (including `frame` cropping and sprite library quick-pick, `Duplicate` per character, `collapsedChars` Set, header `▼` toggle) + keyframe timings (`sprite` per keyframe, click-to-jump) + **collapsable/duplicatable** dialog (header toggle, `Duplicate`, `duration` auto-hide, `collapsedDialogs` Set) + camera pan/zoom, **and Load Existing panel** with `#load-cutscene-select` + `#load-cutscene-btn` + `#load-cutscene-id`/`#load-cutscene-id-btn`, left panel `420px` (no scrollbar), canvas `960×540` (`PREVIEW_W 960`) takes more space, timestamp `Math.round` limits decimals.
- [ ] `sprite-editor.html` is served at repo root and NOT referenced from `index.html` (hidden endpoint); `GET /sprite-editor.html` 200, contains `#sprite-export-button` that copies `src/character-sprites.json` library as JSON and shows toast, and mapping UI (id, sheet `src`, `frame x/y/w/h` with visual draggable rectangle selector, live cropped preview, add/remove).
- [ ] `src/character-sprites.json` contains `version/sprites` or flat object with named sprites (e.g. `may-right`, `may-front`, `may-back` each `{src, frame{x,y,w,h}}`); `validate` checks `id` regex, `src` `./img/...`, `frame` positive. Editor export produces valid JSON that can be saved in repo and subsequently fetched by `cutscene-editor` and `src/cutscene.js`.
- [ ] JSON format `src/cutscenes/*.json` validated per §7 schema, each has unique `id`; `validateCutscene` enforces `id` regex and ranges including optional `frame`/`sprite`; loader tries `src/cutscenes.json` then `src/cutscenes/<id>.json`. Characters with `frame` use 9-arg `drawImage` cropping (not expensive, same one blit per character).
- [ ] `playCutscene(idOrData)` draws static background on `#bg-canvas` (opaque, aspect-covered) and characters on `#game` (transparent) with synchronized camera pan/zoom `translate(-x,-y) scale(zoom)`; `camera.keyframes` interpolation uses `easing`. Characters with `frame` or `sprite` resolve to cropped sprite sheet rendering (9-arg), not expensive.
- [ ] Character placement/scaling/movement via `x/y/scale` + optional `frame`/`character` group + `sprite` reference to `src/character-sprites.json` + `keyframes` (`x/y/scale/sprite` per keyframe, `sprite` snaps, e.g. up vs right) interpolated per §4, rendered on top canvas cropped via `frame` (9-arg) when needed, ordered by `zIndex`; grouping `characters` in sprite library (e.g. `may` = `may-front`+`may-right`...) is selectable in cutscene editor as character, and per-keyframe `sprite` dropdown is filtered to that character's sprites; clicking a keyframe row jumps scrubber to its `t` for precise positioning.
- [ ] Dialog overlays are HTML `#cutscene-dialog` above canvases (not canvas text), timed by `dialogs[*].t`/`auto` + optional `duration` `0-60000` ms, typewriter at `cps` reveals, JRPG blue `#1a3a8a` + white pixelated monospace styling per §6, fast-forward on `Space`/`R`/`click` reveals instantly first press, second press advances to next dialog or closes if last; while revealing, camera/character interp continues. Each dialog can have `t` **or** `auto:true` (`t:null`) to **start right after previous has finished** without manual time (first auto starts at `0`, subsequent `effectiveT = previous effectiveT + reveal + duration`); each dialog has associated `portrait` image (relative `./img/...` or sprite id) shown on `portraitSide` `left`/`right` (`64-80px`); when no portrait, box shows text only. Portrait with `frame` is also cropped (9-arg) if mapped. **Duration** auto-hides dialog after `reveal + duration` (empty = stay until next/manual, prevents forever); editor shows `duration` input and `auto` checkbox, dialogs are **collapsable** (header `▼` toggle) and **duplicatable** (`Duplicate` clones `t+500`). Preview timestamp decimals limited via `Math.round`.
- [ ] While `cutsceneActive`, main game input/pause/reward/hotbar blocked, physics frozen, `#hud` hidden, `requestAnimationFrame` still runs cutscene update/render.
- [ ] Exported JSON from cutscene editor is `JSON.stringify(scene,null,2)` with all §7 fields including optional `frame`/`sprite` and can be saved as `src/cutscenes/<id>.json` and subsequently `playCutscene(id)` loads it bit-identically; exported sprite library from sprite editor is similarly bit-identical when saved to `src/character-sprites.json` and referenced later via sprite `id`.

## 11. Prologue Trigger — First 3-Hole Play

- The cutscene `src/cutscenes/prologue.json` (`id: "prologue"`) shall be presented exactly once, the first time the player clicks the 3-hole course (from `#staged-course-list` / `handleCoursePlay(courseId)` where `course.holeCount===3`) while on the main menu and with no restorable save (`hasRestorableSave()===false`).
- The next game state after the click is the loadout (`showLoadout(courseId)`). When the prologue is due, the cutscene shall be played **before** that transition: `handleCoursePlay` shall intercept the 3-hole click, check persistent seen flag, and if not seen, call `playCutscene("prologue", {onComplete: ...})` and only after `onComplete`/`skip` proceed to `showLoadout(courseId)`. Direct `startCourseWithLoadout` without going through `handleCoursePlay` shall not trigger the prologue.
- Persistence: seen flag stored in `localStorage` key `CUTSCENE_SEEN_KEY = "golfVectorField.cutscenes.seen.v1"` as JSON `{version:1, seen: string[]}` (array of cutscene ids). Helpers `hasSeenCutscene(id)` / `markCutsceneSeen(id)` / `loadSeenCutscenes()` in `src/cutscene.js` (also exposed on `window` for tests). `markCutsceneSeen("prologue")` is called on `onComplete` (completed or skipped) and persists immediately. Once `seen` contains `"prologue"`, subsequent clicks on the 3-hole course shall go directly to `showLoadout` without cutscene, even after reload (persisted). `localStorage.clear()` / `regenerateCampaign()` clears the key, so a new campaign will show the prologue again — this is expected.
- The cutscene shall not be shown if `cutsceneIsActive()` already true, if `hasRestorableSave()` is true (auto-resume), or if `course.holeCount !== 3`. Non-3-hole courses shall never trigger the prologue.
- While the prologue (or any cutscene) is active, `syncMainMenu`/`syncParallaxVisibility`/`redrawBottom` shall hide `#main-menu-overlay`/`#parallax-scene` and suppress splash drawing so the cutscene's `bgCanvas` background (aspect-covered `img/cutscenes/bg-club-house.png` etc.) is visible; `update`/`render` already hide wind/HUD/hotbar and freeze physics during `cutsceneIsActive()`.
- Implementation shall be resilient: if `prologue.json` fails to load/validate, `handleCoursePlay` shall fall back to `showLoadout` without blocking.

## File Paths

- `docs/requirements/11-cutscenes.md:1` (this file)
- `src/cutscene.js:1` (engine, validation, pan/zoom, typewriter, frame/sprite resolve, seen persistence `CUTSCENE_SEEN_KEY`)
- `src/character-sprites.json` (sprite sheet mappings: `may-right` etc. `{src, frame{x,y,w,h}}`)
- `src/spriteLibrary.js` or inline in `src/cutscene.js` (loader `loadSpriteLibrary`, `getSprite`)
- `src/cutscenes.json` or `src/cutscenes/<id>.json` (data, unique IDs; characters may contain `frame`/`sprite`)
- `src/cutscenes/prologue.json:1` (prologue cutscene, id `prologue`, shown once before first 3-hole course)
- `cutscene-editor.html:1` (hidden endpoint, not linked)
- `src/cutscene-editor.js:1` (editor logic, preview, export; loads sprite library)
- `sprite-editor.html:1` (hidden endpoint for mapping)
- `src/sprite-editor.js:1` (sprite mapping editor, visual rect selector, export `#sprite-export-button`)
- `index.html:1` (`#cutscene-dialog` overlay with `.cutscene-portrait`)
- `style.css:1` (JRPG dialog box + portrait, editor styles if shared)
