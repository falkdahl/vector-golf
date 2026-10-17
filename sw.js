// Gale Force Golf — service worker.
// Makes the static site installable as a PWA and playable offline (a
// registered worker with a fetch handler satisfies the Chromium install
// criteria and gives offline support).
// No build step: bump CACHE_VERSION to invalidate old caches on deploy.
const CACHE_VERSION = "gale-force-golf-v1";

// App shell precached on install. Optional entries fail silently.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/asset-manifest.js",
  "./src/preload.js",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/gfg-splash.webp",
  "./img/splash/background-gfg-splash.webp",
  "./img/splash/middleground-gfg-splash.webp",
  "./img/splash/foreground-gfg-splash.webp",
  "./img/splash/may-gfg-splash.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            // Optional asset: ignore misses (offline still works for the rest).
          }
        }),
      );
      try {
        await self.skipWaiting();
      } catch {}
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
        );
      } catch {}
      try {
        await self.clients.claim();
      } catch {}
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Same-origin only; never touch cross-origin (three.js fallback CDN, etc.).
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so a deploy is picked up immediately, falling
  // back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok && fresh.type === "basic") {
            const cache = await caches.open(CACHE_VERSION);
            cache.put("./index.html", fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate (cache-first for speed, refresh in
  // the background), with a network-first fallback when uncached.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) {
        fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === "basic") {
              cache.put(req, res.clone()).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        return (await cache.match("./index.html")) || Response.error();
      }
    })(),
  );
});
