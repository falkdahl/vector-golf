// Asset preloading — downloads every image + audio file during the loading
// screen so cutscenes (and everything else) start fully cached.
// Strategy: fetch() each URL to completion (bytes land in the HTTP cache),
// then decode images so they are render-ready. Never rejects: per-file
// failures resolve as misses and the game falls back to lazy loading.
// Overall + per-file timeouts guarantee the loading screen can never stick.
import { IMAGE_ASSETS, AUDIO_ASSETS } from "./asset-manifest.js";

const DISCOVER_FOLDERS = [
  { folder: "./img/", exts: ["png", "jpg", "jpeg", "webp", "gif"], prefix: "./img/" },
  { folder: "./img/cutscenes/", exts: ["png", "jpg", "jpeg", "webp", "gif"], prefix: "./img/" },
  { folder: "./img/splash/", exts: ["png", "jpg", "jpeg", "webp", "gif"], prefix: "./img/" },
  { folder: "./audio/", exts: ["wav", "mp3", "ogg"], prefix: "./audio/" },
];
const FETCH_TIMEOUT_MS = 30000;
const OVERALL_TIMEOUT_MS = 90000;
const CONCURRENCY = 6;

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __timeout: true }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    try { if (timer) clearTimeout(timer); } catch {}
  });
}

async function fetchFolderUrls(folder, exts, prefix) {
  try {
    const res = await withTimeout(fetch(folder, { cache: "no-store" }), 8000);
    if (!res || res.__timeout || !res.ok) return [];
    const text = await res.text();
    const extAlt = exts.join("|");
    const re = new RegExp(`href="([^"]+\\.(${extAlt}))"`, "gi");
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const href = m[1];
      if (/^https?:\/\//i.test(href) || href.startsWith("/") || href.includes("..")) continue;
      let full = href;
      if (!href.includes("/")) {
        full = folder.replace(/\/$/, "") + "/" + href;
      } else if (!href.startsWith("./")) {
        full = folder.replace(/\/$/, "") + "/" + href.split("/").pop();
      }
      if (!full.startsWith(prefix)) {
        if (full.startsWith("img/") || full.startsWith("audio/")) full = "./" + full;
        else full = prefix + full.split("/").pop();
      }
      out.push(full);
    }
    return out;
  } catch { return []; }
}

export async function discoverAssetUrls() {
  const lists = await Promise.all([
    ...DISCOVER_FOLDERS.map((d) => fetchFolderUrls(d.folder, d.exts, d.prefix)),
  ]);
  const found = lists.flat().filter(Boolean);
  const images = [...new Set([...IMAGE_ASSETS, ...found.filter((u) => u.startsWith("./img/"))])].sort();
  const audio = [...new Set([...AUDIO_ASSETS, ...found.filter((u) => u.startsWith("./audio/"))])].sort();
  return { images, audio };
}

async function preloadImage(url) {
  try {
    // Fetch bytes first so the file is fully downloaded even if decode is slow.
    const ctl = new AbortController();
    const timer = setTimeout(() => { try { ctl.abort(); } catch {} }, FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res && res.ok) await res.blob();
    } catch {} finally {
      try { clearTimeout(timer); } catch {}
    }
    // Then ensure it decodes (render-ready for cutscenes/canvases).
    const img = new Image();
    img.src = url;
    if (img.decode) {
      try { await withTimeout(img.decode(), 15000); } catch {}
    } else {
      await withTimeout(new Promise((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        if (img.complete) resolve(true);
      }), 15000);
    }
  } catch {}
}

async function preloadAudio(url) {
  // Fully download the file so later `new Audio(url)` serves from cache.
  // 90MB of audio: stream the body to completion without holding it all.
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => { try { ctl.abort(); } catch {} }, FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res && res.ok && res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
        try { reader.releaseLock(); } catch {}
      } else if (res && res.ok) {
        await res.arrayBuffer();
      }
    } catch {} finally {
      try { clearTimeout(timer); } catch {}
    }
  } catch {}
}

async function runPool(urls, worker) {
  const queue = [...urls];
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      if (!url) break;
      try { await worker(url); } catch {}
    }
  });
  await Promise.all(runners);
}

export async function preloadAllAssets() {
  try {
    const { images, audio } = await discoverAssetUrls();
    const jobs = withTimeout((async () => {
      await runPool(images, preloadImage);
      await runPool(audio, preloadAudio);
    })(), OVERALL_TIMEOUT_MS);
    try { await jobs; } catch {}
  } catch {}
}

if (typeof window !== "undefined") {
  try {
    window.__preloadAllAssets = preloadAllAssets;
    window.__discoverAssetUrls = discoverAssetUrls;
  } catch {}
}
