# Golf Vector Field

Simple browser-based 2D golf game using HTML5 Canvas and pure vanilla JavaScript. No third-party dependencies, no build step, hostable as a static site.

## Features
- Wind vector field (20x15 grid) with bilinear interpolation influences ball each tick
- Arrow grid + particle flow visualization (toggle with `H`)
- Orbit aiming with Left/Right Arrows, power charging with Hold Space, force bar
- Static obstacles (rect + circle) instant reset on touch
- Single-hole MVP, deterministic level

## Run Locally

Serve via any static file server (ES modules require http, not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or:

```bash
npx serve .
```

## Deploy

Copy repo contents to any static host (GitHub Pages, Netlify). No build needed. Set publish directory to repo root.

## Progressive Web App

The game is installable and runs fullscreen landscape when installed.

- **Android:** open the site over HTTPS (or `localhost`) and use the browser's automatic "Install app" prompt. This requires the `manifest.webmanifest` and the registered service worker (`sw.js`).
- **iOS:** the Fullscreen API is unavailable in iOS browsers. Tap **Share → Add to Home Screen** to install it; launching from the Home Screen runs fullscreen. Tapping the in-game fullscreen button shows a reminder with these steps.

`sw.js` caches the app shell and static assets for offline play. Bump `CACHE_VERSION` in `sw.js` when deploying changes to invalidate old caches.

## Controls

- **Left / Right Arrow** (or A/D): rotate aim around ball
- **Hold Space**: charge power (force bar green→red), release to launch
- **R**: instant reset to tee (during aiming, flying, or win)
- **H**: toggle wind visualization

## Project Structure

```
index.html
style.css
src/
  main.js        # game loop, state machine, HiDPI
  physics.js     # ball physics, constants
  vectorField.js # field generation + getWindAt
  obstacles.js   # collision helpers
  levels.js      # level data
  input.js       # keyboard handling
  render.js      # canvas drawing
```
