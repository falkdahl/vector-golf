# 01 — Infrastructure & Static Hosting

- **ID:** 01-infrastructure
- **Supersedes:** REQ-001
- **Type:** Infrastructure (normative for project setup)

## Description
The game is a zero-dependency static site: only HTML5, CSS and vanilla JavaScript ES modules, plus exactly one allowed third-party library (Three.js for wind visualization, see `06-wind-system.md`). No build step, no bundler, runnable via any static file server or GitHub Pages.

## Requirements

1. **Files**
   - `index.html` at repo root shall load all assets via relative paths.
   - All JavaScript shall live under `src/` (e.g., `src/main.js`) and be imported via relative ESM imports (`<script type="module">`).
   - Static image assets, if any, shall live under `img/` and be referenced via `./img/...` relative paths. Only `img/grass_seamless.webp` and `img/gfg-splash.png` (fallback `img/gfg-spash.png` typo) are allowed.
   - `README.md` shall document run/deploy instructions.

2. **Dependencies**
   - No npm packages, no `node_modules/`, no bundler (`webpack`/`vite`/`etc.`) required to run.
   - No `<script src="https://...">` or CDN imports except a single import-map entry for `three` → `https://unpkg.com/three@0.160.0/build/three.module.js` (or `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`) or a local `vendor/three.module.js` copy. `import * as THREE from 'three'` is the only third-party import.
   - No other third-party downloads.

3. **Serving**
   - `python3 -m http.server 8000` (or `npx serve .`, or GitHub Pages) from repo root shall serve `index.html` with no 404s.
   - `file://` CORS for ESM is not supported; documentation shall recommend http serving.

4. **Constraints inheritance**
   - Every file defined in `02-canvas-system.md` through `10-persistence-and-menus.md` shall obey this file's constraints.

## Acceptance Criteria

- [ ] `index.html` references `style.css` and `src/main.js` with relative paths; no other CDN imports except `three`.
- [ ] `npm install` is not required; site loads via static server with no console 404s.
- [ ] No `node_modules/` in repo.

## File Paths

- `index.html:1`, `style.css:1`, `src/main.js:1`, `README.md:1`
