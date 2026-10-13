// Tiered asset preloading — menu shows fast, everything else streams by need.
// Tier 0 (blocks loading screen): menu-critical splash + menu theme only.
// Tier 1 (idle after menu): HUD/hotbar/help icons.
// Tier 2 (awaited before each cutscene plays): that cutscene's bg, character
//   sheets, portraits, music + SFX — cutscenes never start without audio.
// Tier 3 (on level entry): level theme + SFX + banter portraits.
// Never rejects: per-file failures resolve as misses and the game falls back
// to lazy loading. Timeouts guarantee the loading screen can never stick.
import { IMAGE_ASSETS, AUDIO_ASSETS } from "./asset-manifest.js";

const FETCH_TIMEOUT_MS = 30000;
const OVERALL_TIMEOUT_MS = 90000;
const CONCURRENCY = 6;

// Completed URLs are skipped on repeat calls (per-hole level loads etc.).
const doneUrls = new Set();

const MENU_CRITICAL_IMAGES = [
  "./img/splash/background-gfg-splash.webp",
  "./img/splash/middleground-gfg-splash.webp",
  "./img/splash/foreground-gfg-splash.webp",
  "./img/splash/may-gfg-splash.webp",
  "./img/gfg-splash.webp",
];
const MENU_CRITICAL_AUDIO = ["./audio/main-menu.ogg"];

const MENU_IDLE_IMAGES = [
  "./img/golfbag.png",
  "./img/journal.png",
  "./img/magnifier-icon.png",
  "./img/liquifier-icon.png",
  "./img/deflector-icon.png",
  "./img/rotator-icon.png",
  "./img/field-extender-icon.png",
  "./img/power-cell-icon.png",
];

const LEVEL_AUDIO = [
  "./audio/main-theme.ogg",
  "./audio/rushing-footsteps.wav",
  "./audio/surprised.wav",
  "./audio/caution.wav",
  "./audio/place-on-table.wav",
];
const LEVEL_IMAGES = [
  "./img/cutscenes/portrait-may.webp",
  "./img/cutscenes/portrait-caddy.webp",
];

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
    fetchFolderUrls("./img/", ["png", "jpg", "jpeg", "webp", "gif"], "./img/"),
    fetchFolderUrls("./img/cutscenes/", ["png", "jpg", "jpeg", "webp", "gif"], "./img/"),
    fetchFolderUrls("./img/splash/", ["png", "jpg", "jpeg", "webp", "gif"], "./img/"),
    fetchFolderUrls("./audio/", ["wav", "mp3", "ogg"], "./audio/"),
  ]);
  const found = lists.flat().filter(Boolean);
  const images = [...new Set([...IMAGE_ASSETS, ...found.filter((u) => u.startsWith("./img/"))])].sort();
  const audio = [...new Set([...AUDIO_ASSETS, ...found.filter((u) => u.startsWith("./audio/"))])].sort();
  return { images, audio };
}

async function preloadImage(url) {
  if (doneUrls.has(url)) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => { try { ctl.abort(); } catch {} }, FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res && res.ok) await res.blob();
    } catch {} finally {
      try { clearTimeout(timer); } catch {}
    }
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
    doneUrls.add(url);
  } catch {}
}

async function preloadAudio(url) {
  if (doneUrls.has(url)) return;
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
    doneUrls.add(url);
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

async function preloadLists(images, audio) {
  try {
    await withTimeout((async () => {
      await runPool(images, preloadImage);
      await runPool(audio, preloadAudio);
    })(), OVERALL_TIMEOUT_MS);
  } catch {}
}

// Tier 0 — menu-critical. Awaited before the loading screen lifts.
export async function preloadMenuCritical() {
  await preloadLists(MENU_CRITICAL_IMAGES, MENU_CRITICAL_AUDIO);
}

// Tier 1 — menu chrome. Fire-and-forget after the menu shows.
export async function preloadMenuIdle() {
  await preloadLists(MENU_IDLE_IMAGES, []);
}

// Tier 3 — level assets. Called on level entry; cached after first run.
export async function preloadForLevel() {
  await preloadLists(LEVEL_IMAGES, LEVEL_AUDIO);
}

function looksLikePath(s) {
  return typeof s === "string" && !!s.trim() && (s.includes("/") || s.includes("."));
}

// Collect raw asset paths referenced by a cutscene data object: background,
// character/keyframe image srcs, dialog portraits, music + SFX cues.
export function collectCutsceneAssetUrls(data) {
  const images = new Set();
  const audio = new Set();
  try {
    if (!data || typeof data !== "object") return { images: [], audio: [] };
    const bg = data.background;
    if (bg && bg.type !== "color" && looksLikePath(bg.src)) images.add(bg.src.trim());
    if (Array.isArray(data.characters)) {
      for (const ch of data.characters) {
        if (ch && looksLikePath(ch.src)) images.add(ch.src.trim());
        if (ch && Array.isArray(ch.keyframes)) {
          for (const kf of ch.keyframes) {
            if (kf && looksLikePath(kf.src)) images.add(kf.src.trim());
          }
        }
      }
    }
    if (Array.isArray(data.dialogs)) {
      for (const d of data.dialogs) {
        if (d && looksLikePath(d.portrait)) images.add(String(d.portrait).trim());
      }
    }
    if (Array.isArray(data.music)) {
      for (const m of data.music) {
        if (m && looksLikePath(m.src)) {
          const s = String(m.src).trim();
          if (s.toLowerCase() !== "none") audio.add(s);
        }
      }
    }
    if (Array.isArray(data.sfx)) {
      for (const s of data.sfx) {
        if (s && looksLikePath(s.src)) {
          const t = String(s.src).trim();
          if (t.toLowerCase() !== "none") audio.add(t);
        }
      }
    }
  } catch {}
  return { images: [...images], audio: [...audio] };
}

// Tier 2 — await before playing a cutscene (id string or data object).
// Also preloads character-sprites.json so sprite-id portraits resolve.
export async function preloadForCutscene(idOrData) {
  try {
    let data = null;
    if (typeof idOrData === "string") {
      try {
        const res = await withTimeout(fetch(`./src/cutscenes/${idOrData}.json`), 10000);
        if (res && !res.__timeout && res.ok) data = await res.json();
      } catch {}
      if (!data) return;
    } else if (idOrData && typeof idOrData === "object") {
      data = idOrData;
    } else {
      return;
    }
    const { images, audio } = collectCutsceneAssetUrls(data);
    // Sprite sheets backing sprite-id portraits/characters.
    try {
      const res = await withTimeout(fetch("./src/character-sprites.json"), 10000);
      if (res && !res.__timeout && res.ok) {
        const lib = await res.json();
        const sprites = (lib && lib.sprites) || {};
        const wanted = new Set();
        const consider = (ref) => {
          if (typeof ref === "string" && sprites[ref] && sprites[ref].src) wanted.add(sprites[ref].src);
        };
        if (Array.isArray(data.characters)) {
          for (const ch of data.characters) {
            consider(ch && ch.sprite);
            if (ch && Array.isArray(ch.keyframes)) for (const kf of ch.keyframes) consider(kf && kf.sprite);
          }
        }
        if (Array.isArray(data.dialogs)) {
          for (const d of data.dialogs) consider(d && d.portrait);
        }
        for (const src of wanted) images.push(src);
      }
    } catch {}
    await preloadLists([...new Set(images)], [...new Set(audio)]);
  } catch {}
}

// Legacy: preload everything (kept for compat; prefer tiers above).
export async function preloadAllAssets() {
  try {
    const { images, audio } = await discoverAssetUrls();
    await preloadLists(images, audio);
  } catch {}
}

if (typeof window !== "undefined") {
  try {
    window.__preloadAllAssets = preloadAllAssets;
    window.__discoverAssetUrls = discoverAssetUrls;
    window.__preloadMenuCritical = preloadMenuCritical;
    window.__preloadMenuIdle = preloadMenuIdle;
    window.__preloadForCutscene = preloadForCutscene;
    window.__preloadForLevel = preloadForLevel;
  } catch {}
}
