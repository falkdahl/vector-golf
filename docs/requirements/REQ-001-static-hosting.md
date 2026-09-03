# REQ-001: Static Hosting & Project Scaffold

- **ID:** REQ-001
- **Title:** Static Hosting & Project Scaffold
- **Priority:** Must Have (MVP)
- **Type:** Infrastructure
- **Status:** Draft
- **Related Plan Section:** Phase 1 - Scaffold

## Description
The game must be hostable as a static site with no server-side runtime, no build step, and no third-party downloads. The repository shall contain only HTML5, CSS, and pure vanilla JavaScript (ES modules) runnable by opening `index.html` or via any static file server (e.g., `python -m http.server`, GitHub Pages, Netlify).

## Rationale
User requirement: "only use html5 canvas and pure javascript without any 3rd party download and hostable as a static site". A zero-dependency, no-bundler setup minimizes hosting complexity and guarantees offline/local use.

## Requirements

1. The project SHALL include an `index.html` at the repository root that loads all assets via relative paths.
2. The project SHALL use only HTML5, CSS, and vanilla JavaScript (ECMAScript modules via `<script type="module">`). No npm packages, CDN imports, or bundled third-party libraries SHALL be used.
3. The project SHALL NOT require a build tool (webpack, vite, etc.) to run.
4. All JavaScript SHALL be organized under `src/` (e.g., `src/main.js`, `src/physics.js`, etc.) and imported via relative ESM imports.
5. The site SHALL run when served as static files (`python3 -m http.server 8000` from repo root serves `index.html` correctly).
6. The repository SHALL include a `README.md` with run and deploy instructions.
7. The project MAY include static image assets under `img/` (specifically `img/grass_seamless.webp` and `img/gfg-splash.png` per REQ-030). These SHALL be referenced via relative paths (`./img/...`) and served as static files with no external CDN. No other third-party downloads SHALL be required.

## Acceptance Criteria

- [ ] `index.html` exists at repo root, references `style.css` and `src/main.js` with relative paths.
- [ ] Opening the site via `npx serve .` or `python3 -m http.server` loads the game without 404s in browser console.
- [ ] No `<script src="https://...">` or `import ... from "https://...">` or `node_modules/` present.
- [ ] `npm install` is NOT required to run.
- [ ] Deploying the repo contents to GitHub Pages (branch `main` / `docs` or root) renders the game.

## Dependencies
None (foundational).

## Notes
- Verify `file://` vs `http://` CORS for ESM: recommend serving via http, document this.
- Future `src/` files defined in REQ-002 to REQ-012 must follow this constraint.

## File Paths (proposed)
- `index.html:1`
- `style.css:1`
- `src/main.js:1`
- `README.md:1`
