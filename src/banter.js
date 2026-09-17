// Banter system — 12-banter.md
// In-place May/Caddy dialog reusing the cutscene dialog box (#cutscene-dialog).
// Played after the loadout overlay closes, before the Hole 1 banner shows.
// Timing: typewriter at 20 cps, each box lingers 1000ms, next dialog starts at
// the end of the previous one (auto chain). Space/KeyR/Click fast-forwards a
// revealing box, pressing again advances immediately.

export const BANTER_CPS = 20;
export const BANTER_LINGER_MS = 1000;
export const BANTER_FILE = './src/banter.json';
export const BANTER_STATE_KEY = 'golfVectorField.banter.v1';

export const SPEAKERS = {
  may: { name: 'May', portrait: './img/cutscenes/portrait-may.png' },
  caddy: { name: 'Caddy', portrait: './img/cutscenes/portrait-caddy.png' },
};

export function resolveSpeaker(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const key = ref.trim().toLowerCase();
  return SPEAKERS[key] || null;
}

export function validateBanter(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('banter file must be object');
    return { valid: false, errors };
  }
  if (data.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(data.banters) || !data.banters.length) {
    errors.push('banters must be non-empty array');
    return { valid: false, errors };
  }
  const seen = new Set();
  const idRe = /^[a-z0-9][a-z0-9-_]{1,40}$/;
  for (let i = 0; i < data.banters.length; i++) {
    const b = data.banters[i];
    if (!b || typeof b !== 'object') { errors.push(`banters[${i}] must be object`); continue; }
    if (typeof b.id !== 'string' || !idRe.test(b.id)) errors.push(`banters[${i}].id must match ^[a-z0-9][a-z0-9-_]{1,40}$`);
    else if (seen.has(b.id)) errors.push(`duplicate banter id ${b.id}`);
    else seen.add(b.id);
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 12) {
      errors.push(`banters[${i}].lines must be 1-12 entries`);
      continue;
    }
    for (let j = 0; j < b.lines.length; j++) {
      const ln = b.lines[j];
      if (!ln || typeof ln !== 'object') { errors.push(`banters[${i}].lines[${j}] must be object`); continue; }
      if (!resolveSpeaker(ln.speaker)) errors.push(`banters[${i}].lines[${j}].speaker must be may|caddy`);
      if (typeof ln.text !== 'string' || !ln.text.length || ln.text.length > 500) {
        errors.push(`banters[${i}].lines[${j}].text must be 1-500 chars`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// --- File loading (single JSON file) ---
let banterCache = null;
let banterPromise = null;

export async function loadBanterFile() {
  if (banterCache) return banterCache;
  if (banterPromise) return banterPromise;
  banterPromise = (async () => {
    try {
      const res = await fetch(BANTER_FILE, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const v = validateBanter(data);
      if (!v.valid) { console.warn('[banter] invalid banter.json', v.errors); return null; }
      banterCache = data;
      return data;
    } catch (e) {
      console.warn('[banter] load failed', e);
      return null;
    }
  })();
  return banterPromise;
}

export function preloadBanterFile() {
  try { loadBanterFile().catch(() => {}); } catch {}
}

export function getBanter(id) {
  if (!banterCache || !id) return null;
  return (banterCache.banters || []).find((b) => b.id === String(id)) || null;
}

export function listBanterIds() {
  if (!banterCache) return [];
  return (banterCache.banters || []).map((b) => b.id);
}

// --- Round-robin state: which banter plays on the next run start ---
function loadBanterCount() {
  try {
    const raw = localStorage.getItem(BANTER_STATE_KEY);
    if (!raw) return 0;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return 0;
    return Math.max(0, Math.floor(d.count || 0));
  } catch { return 0; }
}

function bumpBanterCount() {
  try {
    const n = loadBanterCount() + 1;
    localStorage.setItem(BANTER_STATE_KEY, JSON.stringify({ version: 1, count: n }));
    return n;
  } catch { return 0; }
}

// --- Playback state (in-place dialog, no cutscene takeover) ---
let active = null; // { entry, dialogs:[{speaker,text,portrait,start,reveal}], idx, elapsed, revealedOverride, onComplete }
let dlgEls = null;
let dlgClickBound = false;

function ensureDialogEls() {
  if (dlgEls) return dlgEls;
  const root = document.getElementById('cutscene-dialog');
  if (!root) return null;
  dlgEls = {
    root,
    box: root.querySelector('.cutscene-dialog-box'),
    portrait: root.querySelector('.cutscene-portrait'),
    speaker: root.querySelector('.cutscene-speaker'),
    text: root.querySelector('.cutscene-text'),
    hint: root.querySelector('.cutscene-hint'),
  };
  if (!dlgEls.box || !dlgEls.text) { dlgEls = null; return null; }
  return dlgEls;
}

function ensureDialogClickBinding() {
  const els = ensureDialogEls();
  if (!els || dlgClickBound) return;
  dlgClickBound = true;
  // Clicks land on the HTML overlay (above the canvas), so advance here.
  // No-op unless a banter is active; mutually exclusive with cutscene input.
  const advance = (e) => {
    try { if (isBanterActive()) handleBanterInput({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} }); } catch {}
  };
  try {
    els.box.addEventListener('click', (e) => { advance(e); e.stopPropagation(); });
    els.root.addEventListener('click', (e) => { if (e.target === els.root) advance(e); });
  } catch {}
}

function buildDialogs(entry) {
  const dialogs = [];
  let t = 0;
  for (const ln of entry.lines) {
    const sp = resolveSpeaker(ln.speaker);
    const text = String(ln.text);
    const reveal = (text.length / BANTER_CPS) * 1000;
    dialogs.push({
      speaker: sp.name,
      portrait: sp.portrait,
      text,
      start: t,
      reveal,
      end: t + reveal + BANTER_LINGER_MS,
    });
    t += reveal + BANTER_LINGER_MS;
  }
  return dialogs;
}

function renderActive() {
  const els = ensureDialogEls();
  if (!els || !active) return;
  const d = active.dialogs[active.idx];
  if (!d) { els.root.classList.add('hidden'); return; }
  const fullLen = d.text.length;
  const autoRevealed = Math.max(0, Math.min(fullLen, Math.floor(((active.elapsed - d.start) * BANTER_CPS) / 1000)));
  const revealed = active.revealedOverride != null ? active.revealedOverride : autoRevealed;
  const clamped = Math.max(0, Math.min(fullLen, revealed));
  const isRevealing = clamped < fullLen;
  els.root.classList.remove('hidden');
  if (els.box) {
    els.box.classList.remove('no-portrait');
    els.box.classList.add('portrait-left');
    els.box.classList.remove('portrait-right');
  }
  if (els.portrait) {
    const src = d.portrait;
    if (src) {
      if (els.portrait.getAttribute('src') !== src) els.portrait.setAttribute('src', src);
      els.portrait.alt = d.speaker || '';
      els.portrait.classList.remove('hidden');
    } else {
      els.portrait.classList.add('hidden');
      els.portrait.removeAttribute('src');
    }
  }
  if (els.speaker) {
    els.speaker.textContent = d.speaker || '';
    els.speaker.style.display = d.speaker ? '' : 'none';
  }
  if (els.text) els.text.textContent = d.text.slice(0, clamped) + (isRevealing ? '▌' : '');
  if (els.hint) {
    els.hint.textContent = isRevealing ? '▸ fast-forward (Space/R/Click)' : '▼ next (Space/R/Click)';
    els.hint.style.opacity = isRevealing ? '0.7' : '1';
  }
}

function finishActive(completed) {
  if (!active) return;
  const cb = active.onComplete;
  active = null;
  try {
    const els = ensureDialogEls();
    if (els) els.root.classList.add('hidden');
  } catch {}
  try { window.dispatchEvent(new CustomEvent('banter:end', { detail: { completed } })); } catch {}
  if (cb) try { cb(completed); } catch {}
}

export function isBanterActive() { return !!active; }

export function getActiveBanterId() { return active ? active.entry.id : null; }

export function playBanter(idOrEntry, options = {}) {
  const els = ensureDialogEls();
  if (!els) return false;
  ensureDialogClickBinding();
  let entry = null;
  if (idOrEntry && typeof idOrEntry === 'object' && Array.isArray(idOrEntry.lines)) {
    entry = idOrEntry;
    const v = validateBanter({ version: 1, banters: [entry] });
    if (!v.valid) { console.warn('[banter] invalid entry', v.errors); return false; }
  } else if (typeof idOrEntry === 'string') {
    entry = getBanter(idOrEntry);
    if (!entry) { console.warn(`[banter] unknown id ${idOrEntry}`); return false; }
  } else {
    return false;
  }
  if (active && active.onComplete) try { active.onComplete(false); } catch {}
  active = {
    entry,
    dialogs: buildDialogs(entry),
    idx: 0,
    elapsed: 0,
    revealedOverride: null,
    onComplete: options.onComplete || null,
  };
  // Preload portraits so the first box shows its image immediately.
  try {
    for (const d of active.dialogs) {
      if (d.portrait) { const im = new Image(); im.src = d.portrait; }
    }
  } catch {}
  renderActive();
  try { window.dispatchEvent(new CustomEvent('banter:start', { detail: { id: entry.id } })); } catch {}
  return true;
}

export async function playRunStartBanter(options = {}) {
  const data = await loadBanterFile();
  if (!data || !Array.isArray(data.banters) || !data.banters.length) return false;
  const banters = data.banters;
  const count = loadBanterCount();
  // 12-banter: the first four scenes are fixed onboarding (controls, rewards,
  // stacking, attempts); afterwards pick randomly among the rest.
  let entry = null;
  if (count === 0) {
    entry = banters[0];
  } else if (count === 1) {
    entry = banters.length > 1 ? banters[1] : banters[0];
  } else if (count === 2) {
    entry = banters.length > 2 ? banters[2] : banters[0];
  } else if (count === 3) {
    entry = banters.length > 3 ? banters[3] : banters[0];
  } else {
    const rest = banters.slice(4);
    entry = rest.length ? rest[Math.floor(Math.random() * rest.length)] : banters[0];
  }
  if (!entry) return false;
  const ok = playBanter(entry, {
    onComplete: (completed) => {
      try { bumpBanterCount(); } catch {}
      if (options.onComplete) try { options.onComplete(completed); } catch {}
    },
  });
  return ok;
}

export function updateBanter(dtSeconds) {
  if (!active) return;
  const dt = Number(dtSeconds) * 1000;
  if (!Number.isFinite(dt) || dt < 0) return;
  active.elapsed += dt;
  const d = active.dialogs[active.idx];
  if (!d) { finishActive(true); return; }
  // Auto-advance once this box has been fully revealed and lingered.
  if (active.elapsed >= d.end) {
    if (active.idx + 1 < active.dialogs.length) {
      active.idx += 1;
      active.revealedOverride = null;
    } else {
      finishActive(true);
      return;
    }
  }
  renderActive();
}

export function handleBanterInput(e) {
  if (!active) return false;
  const isKey = e && e.type === 'keydown';
  const isClick = e && (e.type === 'click' || e.type === 'mousedown');
  const okKey =
    isKey &&
    (e.code === 'Space' || e.key === ' ' || e.code === 'KeyR' || e.key === 'r' || e.key === 'R' || e.code === 'Escape' || e.code === 'Enter');
  if (!(okKey || isClick)) return false;
  if (e.preventDefault) try { e.preventDefault(); } catch {}
  if (e.stopPropagation) try { e.stopPropagation(); } catch {}
  const d = active.dialogs[active.idx];
  if (!d) { finishActive(true); return true; }
  const fullLen = d.text.length;
  const autoRevealed = Math.max(0, Math.min(fullLen, Math.floor(((active.elapsed - d.start) * BANTER_CPS) / 1000)));
  const revealed = active.revealedOverride != null ? active.revealedOverride : autoRevealed;
  if (revealed < fullLen) {
    // First press fast-forwards the typewriter.
    active.revealedOverride = fullLen;
    renderActive();
    return true;
  }
  // Fully revealed: advance immediately (skip remaining linger).
  if (active.idx + 1 < active.dialogs.length) {
    active.idx += 1;
    const nd = active.dialogs[active.idx];
    // Re-anchor the next dialog to now so chaining stays gapless.
    const shift = active.elapsed - nd.start;
    if (shift !== 0) {
      for (let i = active.idx; i < active.dialogs.length; i++) {
        active.dialogs[i].start += shift;
        active.dialogs[i].end += shift;
      }
    }
    active.revealedOverride = null;
    renderActive();
    return true;
  }
  finishActive(true);
  return true;
}

export function skipBanter() {
  if (!active) return false;
  finishActive(false);
  return true;
}

if (typeof window !== 'undefined') {
  window.__banter = {
    isBanterActive,
    getActiveBanterId,
    playBanter,
    playRunStartBanter,
    updateBanter,
    handleBanterInput,
    skipBanter,
    loadBanterFile,
    preloadBanterFile,
    validateBanter,
    listBanterIds,
    getBanter,
    SPEAKERS,
    BANTER_CPS,
    BANTER_LINGER_MS,
  };
  window.__isBanterActive = isBanterActive;
  window.isBanterActive = isBanterActive;
}
