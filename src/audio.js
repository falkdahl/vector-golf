// Chiptune audio — Famicom-style 4-channel synth (2x pulse, triangle, noise).
// Zero-asset WebAudio: all SFX synthesized with square/triangle/noise only.
// Autoplay-safe: context is created lazily and resumed on first user gesture.

let ctx = null;
let master = null;
let noiseBuf = null;
let windNodes = null; // { src, filter, gain, lfo, lfoGain }
let windActive = false;
let lastTypeTickAt = 0;

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
      master.gain.value = 0.22;
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
    if (!ctx) ensureAudio();
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
    const t = ctx.currentTime;
    const g = windNodes.gain.gain;
    try { g.cancelScheduledValues(t); } catch {}
    g.setTargetAtTime(windActive ? 0.055 : 0.0, t, windActive ? 1.2 : 0.25);
  } catch {}
}

export function isWindActive() { return windActive; }

// --- Stage theme music (./audio/main-theme.wav, low-volume loop) ---
// Streams via <audio> (no 23MB decode), independent of the SFX master gain so
// SFX stay clearly audible above it. Gesture-safe: play() rejections are
// swallowed and retried on the next pointer/key gesture.
const MUSIC_SRC = './audio/main-theme.wav';
const MUSIC_VOL = 0.15;
const MUSIC_DUCK_VOL = 0.05;
let musicEl = null;
let musicWanted = false;
let duckToken = 0;

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

function musicPlay() {
  try {
    const el = ensureMusic();
    if (!el) return;
    try { el.volume = MUSIC_VOL; } catch {}
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

function musicPause() {
  try { if (musicEl) musicEl.pause(); } catch {}
}

export function setMusicActive(on) {
  try {
    musicWanted = !!on;
    if (musicWanted) {
      ensureAudio();
      musicPlay();
    } else {
      musicPause();
    }
  } catch {}
}

export function isMusicActive() { return musicWanted; }

// Briefly dip the theme under a prominent SFX (hole win), then restore.
export function duckMusic(ms = 800) {
  try {
    const el = ensureMusic();
    if (!el || !musicWanted || el.paused) return;
    const my = ++duckToken;
    try { el.volume = MUSIC_DUCK_VOL; } catch {}
    setTimeout(() => {
      try {
        if (my !== duckToken) return;
        if (musicWanted && musicEl === el) el.volume = MUSIC_VOL;
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
    };
  } catch {}
}
