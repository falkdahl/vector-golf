# 13 — PWA (Installable, Fullscreen Landscape, Offline)

- **ID:** 13-pwa
- **Type:** Infrastructure / hosting
- **References:** `01-foundation.md` (static hosting, DOM, head); `12-mobile.md` (fullscreen, rotate guard, iOS)

> Adds Progressive Web App support: installable on Android + iOS, launches fullscreen landscape, works offline. No build step, no new runtime dependencies. The app shell is still a zero-dependency static site.

## 1. Manifest (`manifest.webmanifest`, repo root)

- `manifest.webmanifest` served from the repo root (relative `./`), linked from `index.html` head via `<link rel="manifest" href="./manifest.webmanifest">`. JSON only, no build step.
- Normative fields:
  - `id:"./"`, `name`/`short_name` = `Gale Force Golf`, `lang:"en"`, `start_url:"./"`, `scope:"./"`.
  - `display:"fullscreen"` + `display_override:["fullscreen","standalone"]` — installed app runs with no browser chrome.
  - `orientation:"landscape"` — installed app is landscape-only (Android honors it; iOS relies on the `11-mobile` rotate guard).
  - `background_color:"#000000"`, `theme_color:"#000000"` (matches body/title chrome).
  - `icons`: `./img/icon-192.png` (`192x192`) and `./img/icon-512.png` (`512x512`), `type:"image/png"`, `purpose:"any"`. Both sizes are required for the Android install prompt; no `maskable` entry (the supplied art has no safe-zone padding, so masking would crop it).

## 2. `index.html` head (iOS parity + theme)

- In addition to the manifest link: `<meta name="theme-color" content="#000000">`, `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, `<meta name="apple-mobile-web-app-title" content="Gale Force Golf">`.
- Icons: `<link rel="icon">` for `192`/`512` and `<link rel="apple-touch-icon" sizes="192x192"|"512x512">` pointing at `./img/icon-192.png` / `./img/icon-512.png` (iOS uses the apple-touch-icon when added to the Home Screen).
- Head order unchanged otherwise; no body/DOM additions (see `01-foundation.md` §3).

## 3. Service worker (`sw.js`, repo root)

- `sw.js` registered from `src/main.js` (`registerServiceWorker()` at the start of `init()`): `navigator.serviceWorker.register('./sw.js', { scope: './' })`, guarded by `'serviceWorker' in navigator` and `http(s)` protocol; best-effort (`catch`), never blocks boot, no-op on `file://`/insecure contexts.
- `CACHE_VERSION` string is the cache key; bump it on deploy to invalidate. `install` precaches the app shell (HTML/CSS/entry JS/manifest/icons + menu splash layers), ignoring per-file misses; `skipWaiting()`. `activate` deletes every non-current cache and `clients.claim()`.
- `fetch`: only same-origin `GET` (cross-origin, non-GET untouched). Navigations are network-first with the cached shell as offline fallback (a deploy is picked up immediately) and refresh the cached `./index.html`. Other same-origin requests are stale-while-revalidate (cached copy returned instantly, refreshed in the background), network-first when uncached; failed uncached requests fall back to the cached shell.
- The worker makes the site installable on Android (a registered worker with a `fetch` handler satisfies the Chromium install criteria) and enables offline play; it does not participate in gameplay logic.

## 4. Fullscreen landscape & iOS

- Installed PWA detection: `isStandalonePWA()` — true when `matchMedia('(display-mode: standalone|fullscreen|minimal-ui)')` matches or `navigator.standalone===true` (iOS). The `#mobile-fullscreen-button` is hidden in standalone PWA mode (already chrome-less); `syncMobileUI()` uses this in addition to `isFullscreenActive()`.
- iOS browsers do not implement the element Fullscreen API (video only), so `#mobile-fullscreen-button` cannot enter fullscreen there. Tapping it on iOS (`isIOS()`, which also detects iPadOS-as-Mac via `MacIntel` + `maxTouchPoints>1`) shows `#toast` with exactly: `Fullscreen isn't supported in iOS browsers. Tap Share → Add to Home Screen to play fullscreen.` The tap does not call the fullscreen API and does not throw. `#toast` wraps (`max-width:min(90%,460px)`, centered, `white-space:normal`) so the message fits narrow phones.
- Android: no custom install UI. Chromium shows its automatic install prompt once the manifest + worker + HTTPS requirements are met; this requirement adds only the manifest/worker (done here).
- Installed app runs fullscreen landscape via the manifest; the `12-mobile` portrait rotate guard remains the hard guarantee on iOS (which ignores manifest orientation). `requestMobileFullscreen()`/`lockLandscapeOrientation()` behavior for browser-mode mobile is unchanged.

## Acceptance

- [ ] `manifest.webmanifest` at repo root; valid JSON; linked from `index.html`; `display:"fullscreen"`, `orientation:"landscape"`, icons `192x192`/`512x512` under `./img/`.
- [ ] iOS meta tags + `apple-touch-icon` (192/512) present; head otherwise unchanged; no new body children.
- [ ] `sw.js` registered from `init()` at scope `./`; precache + activate cleanup + fetch handler; same-origin GET only; navigations network-first; offline reload still serves the game.
- [ ] Android: manifest + registered worker satisfy the Chromium install criteria (automatic install prompt); installed app launches fullscreen landscape.
- [ ] iOS: fullscreen button tap shows the exact toast (no fullscreen attempt); adding via Share → Add to Home Screen launches standalone; rotate guard still enforces landscape.
- [ ] `isStandalonePWA()` hides `#mobile-fullscreen-button` when installed; `isIOS()`/`isStandalonePWA()` exposed as `window.__isIOS`/`window.__isStandalonePWA`.

## File paths

- `manifest.webmanifest:1`, `sw.js:1`, `index.html:1` (head meta/links), `src/main.js:1` (`isIOS`, `isStandalonePWA`, `registerServiceWorker`, `syncMobileUI`, fullscreen-button toast), `style.css:1` (`#toast` wrapping), `README.md:1`
