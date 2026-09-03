# REQ-004: Wind Visualization — Three.js Particles with Ghost Trails (Transparent Overlay)

- **ID:** REQ-004
- **Title:** Wind Visualization — Three.js Particles with Ghost Trails on Transparent Overlay
- **Priority:** Must Have
- **Type:** UI / Functional
- **Status:** Draft
- **Related Plan Section:** Vector Field Visualization — Three.js Particles

## Description
The vector field wind SHALL be visualized **on top of the game canvas in a separate transparent element using Three.js** that spawns lightweight particles drifting with the wind and leaving **ghost trails** that fade slowly. There SHALL be **no static opaque streaks/lines** — the previous streak shader is removed. Particles SHALL be advected by the wind, drift along field lines, and fade out after a longer lifetime, with their trails making the flow including twirls and vortices clearly visible as broad, soft ribbons. The overlay SHALL derive from the same logical field that drives physics (`getWindAt` / field components per REQ-003) and SHALL update when the field changes. **Field components (sources, sinks, doublets, vortices, etc.) SHALL be fed from JavaScript into the Three.js system each frame via uniforms/buffers** as they might change (level load, procedural generation, and potentially modifier-driven overrides).

## Rationale
Broad ghost trails from drifting particles make vortices/twirls instantly readable (a swirl leaves a visible spiral trail) while staying low-cost on GPU. Removing hard streaks avoids the “noisy lines” look that was judged not good, and longer-lived, slightly fewer particles reduce clutter while keeping trails continuous. Feeding field components each frame keeps visualization and physics in sync and allows dynamic changes to appear instantly. Particles remain the sole wind cue (no arrow grid, no streak shader).

## Requirements

1. **Transparent Overlay Element (Three.js, on top of game canvas)** in `index.html` / `style.css` / `src/windThree.js`:
   - The DOM SHALL contain a **separate transparent element** for wind visualization stacked **on top of `#game`** inside `#game-container`:
     ```html
     <div id="game-container">
       <canvas id="bg-canvas"></canvas> <!-- z-index:1 opaque -->
       <canvas id="game"></canvas>      <!-- z-index:2 transparent, handles input -->
       <canvas id="wind-canvas"></canvas> <!-- z-index:3 transparent Three.js output, pointer-events:none -->
     </div>
     ```
     Variant `id="wind-overlay"` / `wind-container` is acceptable if it hosts the Three.js `canvas` and has the same stacking/behavior.
   - The element SHALL be `position:absolute; inset:0; width:100%; height:100%; pointer-events:none; background:transparent; z-index:3` (below UI overlays `z-index:5-12` but above `#game` for maximum visibility of broad trails; alternatively `z-index:2` behind game is acceptable if trails remain clearly visible through transparent game, but on-top `z-index:3` with low alpha is recommended for broad strokes). It SHALL **not** intercept mouse/click/hover; all input stays on `#game`.
   - It SHALL share the **same logical 16:9 size** (`LOGICAL_W×LOGICAL_H` e.g., `1280×720`) and the same responsive/DPR handling as the other two canvases (REQ-002/REQ-013). Its Three.js renderer SHALL be `THREE.WebGLRenderer` with `alpha:true`, `antialias:true`, `premultipliedAlpha:false`, `clearColor(0x000000,0)` and **ghost-trail fading** (see §3). Resizing the container SHALL resize the Three.js renderer and update `uResolution`.
   - Three.js SHALL be loaded as the **only allowed third-party import** per REQ-001 via import map (`https://unpkg.com/three@0.160.0/build/three.module.js` or local `vendor/three.module.js` copy). `import * as THREE from 'three'` SHALL be used in `src/windThree.js`.

2. **No Streak Shader — Particles Only**:
   - There SHALL be **no fragment-shader streak/lines layer** covering the map. If a full-screen plane/ShaderMaterial remains for technical reasons (e.g., fade quad for trails), its fragment shader SHALL output **fully transparent** (`alpha=0`) except for the fade quad itself (see §3); it SHALL NOT draw opaque or semi-opaque streaks, dashes, or grid lines. The previous streak requirements (oriented dashes advected along `vWind`, `sampleWind` per-pixel streak generation) are **removed**.
   - The wind overlay’s visual content SHALL be **solely particles with ghost trails** as defined in §3. No arrow grid, no streak shader, no opaque background.

3. **Particles — Spawn, Blow in Wind, Leave Ghost Trails, Live Longer, Slightly Fewer** (rendered in same transparent overlay):
   - The overlay SHALL render **~60-80 lightweight particles** (slightly fewer than the old 80-120; tunable `PARTICLE_COUNT = 60-80`, default `70`) that spawn uniformly at random across the whole map (`x in [0, LOGICAL_W]`, `y in [0, LOGICAL_H]`), are advected by the wind, and leave **ghost trails** that slowly fade, making broad flow including twirls clearly visible.
   - **Lifetime & Fade (longer)**: Each particle SHALL have `maxLife = 3.5-5.0` seconds (default `4.5`, up from `2.0`), with `life in [0, maxLife]` randomized on spawn (`life = rand()*maxLife` or `maxLife` for even distribution). Fade is `alpha = life / maxLife` (1.0→0 linear) and `life -= dt` each frame. On `life <= 0` the particle SHALL respawn uniformly at random across the whole map (`x = rand()*W`, `y = rand()*H`, `life = maxLife`). No particle SHALL persist longer than `maxLife` without fading, but `maxLife` is now longer so trails are longer and more continuous.
   - **Ghost Trails**: Instead of clearing to fully transparent each frame, the overlay SHALL leave **fading trails** behind each particle. Implementation SHALL be either:
     - (A) **Fade quad**: `renderer.autoClear = false` and each frame before rendering particles, render a full-screen plane with `MeshBasicMaterial` `color=0x000000, opacity=0.06-0.12` (`transparent:true, depthWrite:false`) covering clip space `[-1,1]` to gently fade previous frame’s trails (so old positions linger as ghosts), then render particles on top with `AdditiveBlending`/`NormalBlending` without clearing. The fade opacity SHALL be `0.08-0.12` so trails persist ~8-12 frames and then vanish.
     - OR (B) **Trail geometry**: each particle keeps a short history (e.g., last `6-10` positions) and is rendered as a `Line`/`LineSegments` with per-vertex alpha fading `head 0.9 → tail 0.0`, updated each frame by shifting history and pushing new `pos`. The line width SHALL be `2-4px` and color `rgba(255,255,255,0.9)` / `rgba(180,220,255,0.85)` with additive blending, giving broad soft ribbons.
     Either approach is acceptable if the resulting trails are **broad, soft, clearly visible over grass**, and smoothly follow the field’s curvature (vortex shows as spiral trail). The canvas SHALL remain transparent where no particle/trail exists (no opaque fill).
   - **Advection**: Each frame `pos += windAt(pos) * particleSpeed * dt` where `windAt` is sampled from the **same field components** (including live modifiers) that drive physics, so trails visibly follow the field and curl where the field curls. `particleSpeed` ~ `40-60` (tunable) or derived from `length(vWind)*k` so speed reflects local wind strength. Particles SHALL NOT be advected when `showWind` is false (paused/hidden).
   - **Distribution & Respawn**: Initial spawn uniformly random, not clustered. Respawn on `life<=0` is uniform random across whole map. OOB (`x<0` or `x>W` or `y<0` or `y>H`) SHALL also trigger uniform-random respawn (not wrap) to keep even coverage, though primary respawn is fade-death after `maxLife`. Over 10 s, particles remain evenly distributed, no edge accumulation.
   - **Appearance**: Particles + trails SHALL be **broad and soft** (not tiny 2px dots with hard black border). Recommended: particle head `6-9px` white `1.0,1.0,1.0` with soft radial falloff, trail width `4-8px` semi-transparent `rgba(255,255,255,0.55-0.85)` / `rgba(180,220,255,0.75)` with additive blending so overlapping trails brighten. The black border (`0.15,0.20,0.35`) is removed or made very subtle (≤0.2) to avoid hard dots; trails should be the main cue. Colors must be clearly visible on grass (`#3a9d23` tiled, scaled `GRASS_SCALE 0.38`).
   - **Ownership**: Implemented as `THREE.Points` + trail lines/ fade quad in the same `wind-canvas` overlay. JS SHALL update `BufferGeometry` attributes (`position`, `alpha`, plus `trailPositions` if using lines) each `update(dt)` before `renderer.render()`. Count stays `60-80`, `maxLife` `3.5-5.0`.

4. **Uniform Feeding — Field Components from JavaScript Each Frame** in `src/windThree.js` / `src/vectorField.js`:
   - The particle updater (and any remaining fade shader) SHALL receive **live field components** each frame, because they may change.
   - **What to feed**: For every call to `createField` / `generateLevels` and for every modifier change (`placeModifier`, `removeModifierAt`, drag, `syncModifiersToField`), JS SHALL update the wind system with:
     ```js
     // For particle advection via getWindAt (preferred) — no shader uniforms needed beyond optional debug:
     // Just ensure getWindAt reflects latest field+modifiers via setModifiers(modifiers) and createField(...)
     // If keeping a minimal shader for fade, no field uniforms are required.
     // If keeping field uniforms for debug, feed as before:
     uniforms.uSources, uSinks, uVortices, uDoublets, uModifiers (+ counts)
     ```
     If the streak shader is removed, the only required feeding is that `getWindAt(pos)` used for particle advection reflects the latest field (which it already does via `setModifiers` and `createField`). Optionally, still feed `getFieldComponents()` into uniforms for future use, but not required for particle-only mode. The key is that adding/removing a modifier or loading a new level **by the next frame** changes particle drift (verified by placing `amplify` and seeing nearby particle trails accelerate on next frame).
   - **Source of truth**: `getSourcePositions()` etc. and `modifiers` array. `updateWind(dt, getWindAt)` SHALL be called from main `update(dt)` before render.

5. **Performance, Responsiveness & Toggle**:
   - The wind overlay SHALL maintain **≥55 fps** on Chrome with `60-80` particles + ghost trails + `≤9` field components + `≤12` modifiers at `1280×720` (no full-screen streak shader, so cheaper). Shader (if any) compiled once.
   - On `window resize` / DPR change, update `renderer.setSize` / `setPixelRatio` and camera.
   - Pressing `H` SHALL hide/show **particles + trails** without affecting physics: `windCanvas.style.display` or `visible` toggle. When hidden, overlay is `display:none` and particles stop advecting (optional) or keep updating but not rendered.

6. **Styling & Transparency**:
   - The overlay SHALL be fully transparent where no particle/trail exists so grass and game remain visible. No opaque quad or `#3a9d23` fill in the wind overlay. Fade quad (if used) is `rgba(0,0,0,0.08)` and only fades, not opaque.
   - Colors: trails/particles near-white `rgba(255,255,255,0.85)` / `rgba(180,220,255,0.75)` with soft glow, clearly visible on grass, no hard black border.

## Acceptance Criteria

- [ ] DOM contains **three** layers inside `#game-container`: `#bg-canvas` (`z-index:1` opaque), `#game` (`z-index:2` transparent, handles input) **plus a separate transparent wind element** (`#wind-canvas` Three.js `WebGLRenderer` `alpha:true`) at `z-index:3` with `position:absolute; inset:0; width:100%; height:100%; pointer-events:none; background:transparent`. `windCanvas.getContext('webgl2')` exists.
- [ ] `src/windThree.js` imports `* as THREE from 'three'` via import map and creates `Scene`/`OrthographicCamera`/`WebGLRenderer(alpha:true)` and `THREE.Points`/`LineSegments` for particles. Searching for `ShaderMaterial` with streak `sampleWind`/`fract(along)` SHALL now **fail** (streaks removed) or show `alpha=0` transparent shader; searching for `Points` + `ghost`/`trail`/`fade` SHALL succeed.
- [ ] **No streaks**: the wind overlay shows **no static opaque streaks/lines** covering the map. Inspecting `wind-canvas` frame `getImageData` outside particle trails shows `alpha≈0` (transparent), not `alpha>0` grid. Old `drawArrows` as sole visualization SHALL remain not primary.
- [ ] At game start with default field (`sources:1, sinks:1, doublets:1, vortices:1`), the overlay shows **broad ghost trails** (soft white ribbons `4-8px` wide) left by particles, clearly following the field. In a vortex area, trails visibly **twirl into spirals** and are broad enough to be seen at a glance (≥10px trail length visible before fading). Trails are soft, not hard 1px lines with gaps.
- [ ] **Particles**: `60-80` particles (not 100-120) visible uniformly across map, each `6-9px` white soft dot, drifting `~40-60*|wind|` along field, **leaving fading ghost trails** that persist `~0.5-1.0s` behind the head and slowly fade. Each particle **lives `3.5-5.0` sec** (`maxLife` default `4.5`) then respawns uniform random; `alpha = life/maxLife`. Over 10 s even coverage, no edge clumping.
- [ ] **Field components fed each frame**: `getWindAt(pos)` used for particle advection reflects latest `getSourcePositions()` etc. and `modifiers`. Changing field (new seed or `placeModifier` amplify at center) changes nearby particle trail speed/curvature by next frame (verified by sampling `getWindAt` inside trails vs outside and observing trail acceleration).
- [ ] **Modifier-aware trails**: inside `amplify` trails move ~5× faster/longer, inside `nullify` trails stall (particles linger, trails fade to nothing, `alpha≈0`), inside `flip` trails reverse direction. Verified via `modifiers` array length and trail direction change.
- [ ] FPS ≥55 on Chrome with 70 particles + trails + 32×18 field + 12 modifiers at 1280×720. `uTime` driven by `requestAnimationFrame` `dt`, no `setInterval`.
- [ ] Toggling `H` hides/shows **particles + trails** (`display:none` or `visible=false`) without affecting ball physics. When hidden, overlay is fully `display:none` and trails vanish.
- [ ] No opaque background in wind overlay: outside trails `getImageData` alpha is 0, grass remains visible. Fade quad (if used) is `rgba(0,0,0,0.08)` not opaque.

## Dependencies

- REQ-003 (field must exist, provides `getWindAt` and component lists)
- REQ-002 (render loop drives `updateWind`)
- REQ-013 (responsive/DPR for all three layers)
- REQ-015/016/017/018 (modifiers affect `getWindAt` for trails)
- REQ-001 (allows `three` import)

## Notes

- Example `src/windThree.js` particle-only skeleton (ghost trails via fade quad):
  ```js
  import * as THREE from 'three';
  const PARTICLE_COUNT = 70; const PARTICLE_LIFE = 4.5;
  export function initWindOverlay(container){
    const canvas=document.getElementById('wind-canvas');
    renderer=new THREE.WebGLRenderer({canvas, alpha:true}); renderer.setClearColor(0x000000,0); renderer.autoClear=false;
    scene=new THREE.Scene(); camera=new THREE.OrthographicCamera(-1,1,1,-1,-1,1);
    // fade quad
    const fadeGeo=new THREE.PlaneGeometry(2,2);
    const fadeMat=new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:0.08, depthWrite:false});
    fadeMesh=new THREE.Mesh(fadeGeo, fadeMat); scene.add(fadeMesh);
    // particles
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(PARTICLE_COUNT*3); const alpha=new Float32Array(PARTICLE_COUNT);
    // ... init uniform random ...
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha,1));
    const mat=new THREE.ShaderMaterial({vertexShader:`...PointSize 8...`, fragmentShader:`...white soft...`, transparent:true, blending:THREE.AdditiveBlending});
    points=new THREE.Points(geo, mat); scene.add(points);
  }
  export function updateWind(dt, getWindAt){
    // advect particles via getWindAt, life-=dt, respawn uniform, update alpha
    // ghost trails are automatic via fadeMesh rendered with low opacity before particles without clearing
  }
  export function renderWind(){ renderer.render(fadeScene, camera); renderer.render(scene,camera); }
  ```
- Keep `src/vectorField.js` as physics source of truth; visualization uses `getWindAt` for advection so they stay in sync. `getFieldComponents()` optionally still fed but not required for streaks (removed).

## File Paths

- `index.html:8` (import map for `three`, `#wind-canvas` inside `#game-container` at `z-index:3`)
- `style.css:15` (`#wind-canvas` stacked, transparent, `pointer-events:none`)
- `src/windThree.js:1` (Three.js `WebGLRenderer(alpha:true)`, `fadeMesh` + `Points`/`Line` ghost trails, `initWindOverlay`, `updateWind`, `setWindVisible`)
- `src/vectorField.js:1` (exports `getWindAt`, `getFieldComponents` used for particle advection)
- `src/main.js:1` (calls `initWindOverlay`, `updateWind(dt)` in `update(dt)`, `renderWind()` in `render()`, `H` toggle)
- `src/render.js:40` (no longer draws wind; wind is in overlay)
