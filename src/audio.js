// Chiptune audio — Famicom-style 4-channel synth (2x pulse, triangle, noise).
// Zero-asset WebAudio: all SFX synthesized with square/triangle/noise only.
// Autoplay-safe: context is created lazily and resumed on first user gesture.

let ctx = null;
let master = null;
let noiseBuf = null;
let windNodes = null; // { src, filter, gain, lfo, lfoGain }
let windActive = false;
let lastTypeTickAt = 0;

// --- User audio prefs (persisted): background music on/off, sound effects on/off ---
// Separate localStorage key so run progress / campaign resets never wipe them
// (only a full storage clear, e.g. campaign reseed, resets to defaults).
export const AUDIO_PREFS_KEY = 'golfVectorField.audioPrefs.v1';
const MASTER_VOL = 0.22;
let musicEnabled = true;
let sfxEnabled = true;
function loadAudioPrefs() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    if (typeof p.music === 'boolean') musicEnabled = p.music;
    if (typeof p.sfx === 'boolean') sfxEnabled = p.sfx;
  } catch {}
}
function saveAudioPrefs() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify({ version: 1, music: !!musicEnabled, sfx: !!sfxEnabled }));
  } catch {}
}
try { loadAudioPrefs(); } catch {}

export function isMusicEnabled() { return !!musicEnabled; }

export function setMusicEnabled(on) {
  try {
    musicEnabled = !!on;
    saveAudioPrefs();
    if (!musicEnabled) {
      // Silence immediately (same path as tab-hide: fades cancelled).
      try { pauseAllMusicForHidden(); } catch {}
    } else {
      try { resumeWantedMusic(); } catch {}
    }
  } catch {}
  return musicEnabled;
}

export function isSfxEnabled() { return !!sfxEnabled; }

export function setSfxEnabled(on) {
  try {
    sfxEnabled = !!on;
    saveAudioPrefs();
    // Mute the synth master immediately so in-flight SFX stop too; future
    // SFX no-op via ac(). Wind intent is kept and re-applied on re-enable.
    try { if (master) master.gain.value = sfxEnabled ? MASTER_VOL : 0.0; } catch {}
    try { setWindActive(windActive); } catch {}
  } catch {}
  return sfxEnabled;
}

function now() {
  try { return ctx ? ctx.currentTime : 0; } catch { return 0; }
}

export function ensureAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = sfxEnabled ? MASTER_VOL : 0.0;
      master.connect(ctx.destination);
      // Shared 1s white-noise buffer (noise channel).
      const len = Math.floor(ctx.sampleRate * 1);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Wind loop nodes (created once, gain gated by setWindActive).
      startWindNodes();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function ac() {
  try {
    if (!isSfxEnabled()) return null;
    if (!ctx) ensureAudio();
    if (!isSfxEnabled()) return null;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

// --- Pulse (square) blip with optional pitch sweep ---
function pulse(freqFrom, freqTo, dur, vol = 0.2, delay = 0, type = 'square') {
  const c = ac();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + Math.max(0, delay);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freqFrom), t0);
    if (freqTo && freqTo !== freqFrom) o.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch {}
}

function triangle(freqFrom, freqTo, dur, vol = 0.18, delay = 0) {
  pulse(freqFrom, freqTo, dur, vol, delay, 'triangle');
}

function noiseBurst(dur, vol = 0.2, delay = 0, filterFrom = 3000, filterTo = 500) {
  const c = ac();
  if (!c || !master || !noiseBuf) return;
  try {
    const t0 = c.currentTime + Math.max(0, delay);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFrom, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch {}
}

function noteSeq(notes, noteDur = 0.09, vol = 0.2, wave = 'square') {
  notes.forEach((f, i) => pulse(f, f, noteDur, vol, i * noteDur, wave));
}

// --- Public SFX ---

// 1. Ball launch: rising chirp + click.
export function playLaunch() {
  try {
    ensureAudio();
    pulse(200, 720, 0.14, 0.22);
    triangle(120, 360, 0.12, 0.12, 0.01);
    noiseBurst(0.04, 0.10, 0, 5000, 2000);
  } catch {}
}

// 2. Background wind loop (noise channel + slow swell). Plays on levels.
function startWindNodes() {
  try {
    if (!ctx || !master || !noiseBuf || windNodes) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    lfo.start();
    windNodes = { src, filter, gain, lfo, lfoGain };
  } catch {}
}

export function setWindActive(on) {
  try {
    windActive = !!on;
    ensureAudio();
    if (!ctx || !windNodes) return;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
    if (!isSfxEnabled()) {
      // Stay silent while SFX are off, but keep the intent for re-enable.
      try { windNodes.gain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.25); } catch {}
      return;
    }
    const t = ctx.currentTime;
    const g = windNodes.gain.gain;
    try { g.cancelScheduledValues(t); } catch {}
    g.setTargetAtTime(windActive ? 0.055 : 0.0, t, windActive ? 1.2 : 0.25);
  } catch {}
}

export function isWindActive() { return windActive; }

// --- Stage + menu theme music (./audio/main-theme.ogg + ./audio/main-menu.ogg) ---
// Streams via <audio> (no big decode), independent of the SFX master gain so
// SFX stay clearly audible above it. Gesture-safe: play() rejections are
// swallowed and retried on the next pointer/key gesture.
// Both tracks share the same nominal level and crossfade (no hard cuts)
// when switching between menu and levels.
const MUSIC_SRC = './audio/main-theme.ogg';
const MENU_MUSIC_SRC = './audio/main-menu.ogg';
const MUSIC_VOL = 0.15;
const MENU_MUSIC_VOL = MUSIC_VOL;
const MUSIC_DUCK_VOL = 0.05;
const MUSIC_FADE_MS = 900;
let musicEl = null;
let menuMusicEl = null;
let musicWanted = false;
let menuMusicWanted = false;
let duckToken = 0;
const musicFade = { id: 0, timer: null };
const menuFade = { id: 0, timer: null };

// Linear fade of an <audio> element to targetVol. Fade-in auto-plays from 0;
// fade-out pauses on completion. Overlapping fades cancel via token.
function fadeAudioTo(el, targetVol, durationMs, fadeState) {
  try {
    if (!el) return;
    const dur = Math.max(50, Number(durationMs) || MUSIC_FADE_MS);
    const target = Math.max(0, Math.min(1, Number(targetVol) || 0));
    fadeState.id = (fadeState.id || 0) + 1;
    const my = fadeState.id;
    try { if (fadeState.timer) clearInterval(fadeState.timer); } catch {}
    fadeState.timer = null;
    let from = target;
    try { from = typeof el.volume === 'number' ? el.volume : target; } catch {}
    // Fading up a paused element: start silent then play so the ramp is heard.
    if (target > 0 && el.paused) {
      try { el.volume = 0; } catch {}
      from = 0;
      try {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    } else if (target > 0 && from !== from) {
      from = 0;
    }
    if (from === target) {
      if (target === 0) { try { el.pause(); } catch {} }
      else { try { if (el.paused) { const p = el.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); } } catch {} }
      return;
    }
    const steps = Math.max(1, Math.round(dur / 50));
    let i = 0;
    fadeState.timer = setInterval(() => {
      try {
        if (my !== fadeState.id) { try { clearInterval(fadeState.timer); } catch {} fadeState.timer = null; return; }
        i++;
        const t = Math.min(1, i / steps);
        const v = from + (target - from) * t;
        try { el.volume = Math.max(0, Math.min(1, v)); } catch {}
        if (t >= 1) {
          try { clearInterval(fadeState.timer); } catch {}
          fadeState.timer = null;
          if (target === 0) { try { el.pause(); } catch {} }
        }
      } catch {}
    }, 50);
  } catch {}
}

export function ensureMusic() {
  try {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!musicEl) {
      const el = new Audio();
      el.src = MUSIC_SRC;
      el.loop = true;
      el.preload = 'auto';
      el.volume = MUSIC_VOL;
      musicEl = el;
    }
    return musicEl;
  } catch { return null; }
}

export function ensureMenuMusic() {
  try {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!menuMusicEl) {
      const el = new Audio();
      el.src = MENU_MUSIC_SRC;
      el.loop = true;
      el.preload = 'auto';
      el.volume = MENU_MUSIC_VOL;
      menuMusicEl = el;
    }
    return menuMusicEl;
  } catch { return null; }
}

function musicPlay(fadeMs = MUSIC_FADE_MS) {
  try {
    if (!isMusicEnabled()) return; // user pref: music off
    if (isPageHidden()) return; // deferred: intent flag kept, resume on visible
    const el = ensureMusic();
    if (!el) return;
    fadeAudioTo(el, MUSIC_VOL, fadeMs, musicFade);
  } catch {}
}

function musicPause(fadeMs = MUSIC_FADE_MS) {
  try {
    const el = ensureMusic();
    if (!el) { try { if (musicEl) musicEl.pause(); } catch {} return; }
    fadeAudioTo(el, 0, fadeMs, musicFade);
  } catch {}
}

function menuMusicPlay(fadeMs = MUSIC_FADE_MS) {
  try {
    if (!isMusicEnabled()) return; // user pref: music off
    if (isPageHidden()) return; // deferred: intent flag kept, resume on visible
    const el = ensureMenuMusic();
    if (!el) return;
    fadeAudioTo(el, MENU_MUSIC_VOL, fadeMs, menuFade);
  } catch {}
}

function menuMusicPause(fadeMs = MUSIC_FADE_MS) {
  try {
    const el = ensureMenuMusic();
    if (!el) { try { if (menuMusicEl) menuMusicEl.pause(); } catch {} return; }
    fadeAudioTo(el, 0, fadeMs, menuFade);
  } catch {}
}

export function setMusicActive(on, fadeMs = MUSIC_FADE_MS) {
  try {
    musicWanted = !!on;
    if (musicWanted) {
      ensureAudio();
      musicPlay(fadeMs);
    } else {
      musicPause(fadeMs);
    }
  } catch {}
}

export function isMusicActive() { return musicWanted; }

export function setMenuMusicActive(on, fadeMs = MUSIC_FADE_MS) {
  try {
    menuMusicWanted = !!on;
    if (menuMusicWanted) {
      ensureAudio();
      menuMusicPlay(fadeMs);
    } else {
      menuMusicPause(fadeMs);
    }
  } catch {}
}

export function isMenuMusicActive() { return menuMusicWanted; }

// --- Music auto-pause on tab hidden (Chrome/Firefox/Safari, desktop+mobile) ---
// Intent flags (musicWanted/menuMusicWanted) are preserved across hides; the
// <audio> elements pause immediately (fades cancelled — setInterval is
// throttled in background tabs) and fade back in on return.
// Visibility-only by design: window blur/focus is excluded so a desktop tab
// that is still visible (e.g. side-by-side chat) keeps playing.
export function isPageHidden() {
  try {
    if (typeof document !== 'undefined' && typeof document.hidden === 'boolean') return !!document.hidden;
  } catch {}
  return false;
}

function cancelFade(fadeState) {
  try { fadeState.id = (fadeState.id || 0) + 1; } catch {}
  try { if (fadeState.timer) clearInterval(fadeState.timer); } catch {}
  try { fadeState.timer = null; } catch {}
}

function pauseAllMusicForHidden() {
  try {
    cancelFade(musicFade);
    cancelFade(menuFade);
    try { duckToken++; } catch {}
    try { if (musicEl && !musicEl.paused) musicEl.pause(); } catch {}
    try { if (menuMusicEl && !menuMusicEl.paused) menuMusicEl.pause(); } catch {}
  } catch {}
}

function resumeWantedMusic() {
  try {
    if (isPageHidden()) return;
    try { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch {}
    if (musicWanted) { try { musicPlay(); } catch {} }
    if (menuMusicWanted) { try { menuMusicPlay(); } catch {} }
  } catch {}
}

function handleHiddenEvent() {
  try { pauseAllMusicForHidden(); } catch {}
}

function handleVisibleEvent() {
  try { resumeWantedMusic(); } catch {}
}

try {
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      try {
        if (isPageHidden()) handleHiddenEvent();
        else handleVisibleEvent();
      } catch {}
    });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    // pagehide/pageshow cover iOS Safari bfcache where visibilitychange is unreliable.
    window.addEventListener('pagehide', handleHiddenEvent, { passive: true });
    window.addEventListener('pageshow', handleVisibleEvent, { passive: true });
    // NOTE: no blur/focus listeners by design — window focus loss with the tab
    // still visible (e.g. side-by-side chat on desktop) keeps the music playing.
    // Mobile app-switch / lock / Home always reports document.hidden=true, so
    // visibilitychange (+ pagehide) already pauses there.
  }
} catch {}

// Briefly dip the theme under a prominent SFX (hole win), then restore.
export function duckMusic(ms = 800) {
  try {
    const el = ensureMusic();
    if (!el || !musicWanted || el.paused) return;
    // Cancel any in-progress level fade so the duck level sticks.
    try { musicFade.id = (musicFade.id || 0) + 1; } catch {}
    try { if (musicFade.timer) clearInterval(musicFade.timer); } catch {}
    musicFade.timer = null;
    const my = ++duckToken;
    try { el.volume = MUSIC_DUCK_VOL; } catch {}
    setTimeout(() => {
      try {
        if (my !== duckToken) return;
        if (musicWanted && musicEl === el && !el.paused) el.volume = MUSIC_VOL;
      } catch {}
    }, Math.max(200, ms || 800));
  } catch {}
}

// 3. Water hazard: splash — descending pitch + noise wash.
export function playWater() {
  try {
    ensureAudio();
    noiseBurst(0.35, 0.22, 0, 2500, 300);
    pulse(380, 90, 0.30, 0.18);
    triangle(220, 70, 0.32, 0.14, 0.02);
  } catch {}
}

// 4. Ball hits hole: happy 4-note jingle (plays before any points counting).
// Duck stage music underneath so the jingle is unmistakable.
export function playHoleWin() {
  try {
    ensureAudio();
    try { duckMusic(); } catch {}
    noteSeq([523.25, 659.25, 784.0, 1046.5], 0.12, 0.26);
    triangle(261.6, 261.6, 0.5, 0.14, 0);
    pulse(2093.0, 2093.0, 0.25, 0.10, 0.36); // sparkle tail
  } catch {}
}

// 5. Spatial modifier activated (ball enters bubble).
const MOD_BASE = { magnifier: 523.25, liquifier: 392.0, deflector: 587.33, rotator: 440.0 };
export function playModifierActivated(type) {
  try {
    ensureAudio();
    const base = MOD_BASE[String(type)] || 523.25;
    pulse(base, base * 1.5, 0.08, 0.18);
    pulse(base * 2, base * 2, 0.06, 0.14, 0.08);
  } catch {}
}

// 6. Cutscene/banter typewriter tick (tiny pulse blip, throttled).
export function playTypeTick() {
  try {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (t - lastTypeTickAt < 45) return;
    lastTypeTickAt = t;
    ensureAudio();
    pulse(1350, 1350, 0.018, 0.07);
  } catch {}
}

// 7. "New Record" fanfare on Course Cleared.
export function playNewRecord() {
  try {
    ensureAudio();
    noteSeq([523.25, 659.25, 784.0, 1046.5], 0.12, 0.20);
    pulse(1046.5, 1046.5, 0.38, 0.20, 0.48);
    triangle(523.25, 523.25, 0.5, 0.10, 0.48);
  } catch {}
}

// 8. Points counting on Hole Complete: tick per row / count step.
export function playPointsTick() {
  try {
    ensureAudio();
    pulse(880, 880, 0.05, 0.14);
  } catch {}
}

export function playPointsCount(n = 3, delaySec = 0) {
  try {
    ensureAudio();
    const count = Math.max(1, Math.min(8, Math.floor(n) || 1));
    const base = Math.max(0, Number(delaySec) || 0);
    for (let i = 0; i < count; i++) pulse(660 + i * 110, 660 + i * 110, 0.06, 0.14, base + i * 0.13);
  } catch {}
}

// 9. Chest pickup: coin-like two-note ding.
export function playChest() {
  try {
    ensureAudio();
    pulse(987.77, 987.77, 0.07, 0.18); // B5
    pulse(1318.5, 1318.5, 0.22, 0.18, 0.07); // E6
  } catch {}
}

// 10. Reward chosen: warm confirm arpeggio (lower register than hole-win).
export function playReward() {
  try {
    ensureAudio();
    noteSeq([329.63, 415.3, 554.37], 0.09, 0.19); // E4 G#4 C#5
    triangle(164.81, 164.81, 0.3, 0.11, 0);
  } catch {}
}

// 11. Out of bounds: harsh low buzz + noise thud (distinct from water splash).
export function playOB() {
  try {
    ensureAudio();
    pulse(160, 65, 0.28, 0.20);
    noiseBurst(0.18, 0.16, 0, 1200, 200);
  } catch {}
}

// 12. UI click (e.g. course button in main menu): short blip.
export function playUIClick() {
  try {
    ensureAudio();
    pulse(760, 760, 0.045, 0.13);
  } catch {}
}

// Auto-unlock on first gesture (autoplay policy).
try {
  if (typeof window !== 'undefined') {
    const unlock = () => {
      try { ensureAudio(); } catch {}
      try { if (musicWanted) musicPlay(); } catch {}
      try { if (menuMusicWanted) menuMusicPlay(); } catch {}
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }
} catch {}

if (typeof window !== 'undefined') {
  try {
    window.__audio = {
      ensureAudio, playLaunch, setWindActive, isWindActive,
      playWater, playHoleWin, playModifierActivated, playTypeTick,
      playNewRecord, playPointsTick, playPointsCount,
      playChest, playReward, playOB, playUIClick,
      ensureMusic, setMusicActive, isMusicActive, duckMusic,
      ensureMenuMusic, setMenuMusicActive, isMenuMusicActive,
      isPageHidden, AUDIO_PREFS_KEY,
      isMusicEnabled, setMusicEnabled, isSfxEnabled, setSfxEnabled,
    };
  } catch {}
}
