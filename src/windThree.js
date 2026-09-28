import * as THREE from 'three';
import { getBaseWindAt } from './vectorField.js';

// Wind visualization — Wind Waker style streaks.
//
// Long, bold, cartoony streaks covering the whole map, advected by the BASE
// vector field (sources, sinks, vortices, doublets — placed modifier bubbles
// never bend them, and no ribbon is drawn inside bubble areas).
// Each streak is a camera-facing ribbon whose head is integrated through the
// field every frame, so streaks bend and curve exactly with the wind. A custom
// shader gives a bright core with soft hand-drawn edges and fades both ends.
// CPU cost is tiny (90 streaks x 1 field sample each per frame); GPU cost is
// ~4k triangles.

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

// Streak tuning — calm readable drift: thin elegant lines, moderate density.
const STREAK_COUNT = 48;
const STREAK_NODES = 24; // head + history points per streak
const STREAK_SPEED = 260; // px/s per unit of wind magnitude (|wind| ~0.44..1.5+ -> ~115..390 px/s)
const STREAK_MIN_SPEED = 70; // never stall completely
const STREAK_MAX_SPEED = 550; // bounded: gusts move, singularities don't teleport
const STREAK_KNOT_DIST = 24; // respawn when the head nets less than this over its whole trail (kills sink-knots, keeps real orbits)
const STREAK_KNOT_MIN_AGE = 1.2; // only after the trail had time to stretch
const STREAK_MIN_AGE = 2.5;
const STREAK_MAX_AGE = 4.5;
const STREAK_MIN_WIDTH = 4;
const STREAK_MAX_WIDTH = 7;
const STREAK_ALPHA = 0.7;
const STREAK_SPAWN_MARGIN = 40; // respawn when head leaves canvas + margin

let renderer = null;
let scene = null;
let camera = null;
let streakMesh = null;
let streakGeometry = null;
let uniforms = null;

let streakData = []; // {hx,hy,dx,dy,nodes:Float32Array,age,maxAge,jitter,width}
let gustTime = 0;
let currentModifiers = [];
let showWind = true;

function isInsideAnyModifier(x, y) {
  for (const m of currentModifiers) {
    const r = m.radius ?? 54;
    if (Math.hypot(x - m.x, y - m.y) < r) return true;
  }
  return false;
}
let containerEl = null;
let canvasEl = null;
let freeShotGlow = null;
let freeShotActive = false;
let freeShotBallActive = false;
let freeShotEdgeActive = false;
let freeShotTime = 0;
let freeShotEdgeEl = null;

function getRespawnPositionPreferInside() {
  // Spread control: respawn into the emptiest map region so streaks stay
  // evenly distributed instead of flooding sinks / starving sources. The flow
  // constantly re-clumps streaks (convergence), so every respawn re-balances.
  // Never spawn inside a placed modifier bubble (no lines are drawn there).
  for (let attempt = 0; attempt < 30; attempt++) {
    const p = posInCell(pickSpreadCell());
    if (!isInsideAnyModifier(p.x, p.y)) return p;
  }
  return posInCell(pickSpreadCell());
}

// Coarse spread grid (160px cells): heads are counted per cell, respawns go
// to the emptiest of several random candidates (randomized, cheap, no sync issues).
const SPREAD_COLS = 8;
const SPREAD_ROWS = 5;
function cellOf(x, y) {
  const cx = Math.max(0, Math.min(SPREAD_COLS - 1, Math.floor(x / LOGICAL_W * SPREAD_COLS)));
  const cy = Math.max(0, Math.min(SPREAD_ROWS - 1, Math.floor(y / LOGICAL_H * SPREAD_ROWS)));
  return cy * SPREAD_COLS + cx;
}
function pickSpreadCell() {
  const counts = new Array(SPREAD_COLS * SPREAD_ROWS).fill(0);
  for (const s of streakData) {
    if (typeof s.hx !== 'number' || typeof s.hy !== 'number') continue;
    counts[cellOf(s.hx, s.hy)]++;
  }
  let best = (Math.random() * counts.length) | 0;
  let bestN = Infinity;
  for (let k = 0; k < 6; k++) {
    const c = (Math.random() * counts.length) | 0;
    if (counts[c] < bestN) { bestN = counts[c]; best = c; }
  }
  return best;
}
function posInCell(c) {
  const cx = c % SPREAD_COLS, cy = (c / SPREAD_COLS) | 0;
  return {
    x: (cx + Math.random()) / SPREAD_COLS * LOGICAL_W,
    y: (cy + Math.random()) / SPREAD_ROWS * LOGICAL_H,
  };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function spawnStreak(s, getWindAt) {
  const p = getRespawnPositionPreferInside();
  s.hx = p.x; s.hy = p.y;
  s.age = 0;
  s.maxAge = STREAK_MIN_AGE + Math.random() * (STREAK_MAX_AGE - STREAK_MIN_AGE);
  s.jitter = 0.85 + Math.random() * 0.3;
  s.width = STREAK_MIN_WIDTH + Math.random() * (STREAK_MAX_WIDTH - STREAK_MIN_WIDTH);
  // Initial direction from the base field so fresh streaks un-collapse along the flow
  let dx = 1, dy = 0;
  try {
    const sampler = (typeof getBaseWindAt === 'function') ? getBaseWindAt : getWindAt;
    if (typeof sampler === 'function') {
      const w = sampler(p.x, p.y);
      const m = Math.hypot(w.x, w.y);
      if (m > 1e-4) { dx = w.x / m; dy = w.y / m; }
    }
  } catch {}
  s.dx = dx; s.dy = dy;
  for (let i = 0; i < STREAK_NODES; i++) {
    s.nodes[i * 2] = p.x;
    s.nodes[i * 2 + 1] = p.y;
  }
}

function createStreaks() {
  streakData = [];
  const totalCells = SPREAD_COLS * SPREAD_ROWS;
  for (let i = 0; i < STREAK_COUNT; i++) {
    const s = { hx: 0, hy: 0, dx: 1, dy: 0, nodes: new Float32Array(STREAK_NODES * 2), age: 0, maxAge: 3, jitter: 1, width: 9 };
    // Even start: round-robin across spread cells (~1-2 streaks per cell), jittered
    const p = posInCell(i % totalCells);
    s.hx = p.x; s.hy = p.y;
    // Stagger ages so the screen starts full of streaks at various lengths
    s.age = Math.random() * 2;
    s.maxAge = STREAK_MIN_AGE + Math.random() * (STREAK_MAX_AGE - STREAK_MIN_AGE);
    s.jitter = 0.85 + Math.random() * 0.3;
    s.width = STREAK_MIN_WIDTH + Math.random() * (STREAK_MAX_WIDTH - STREAK_MIN_WIDTH);
    for (let n = 0; n < STREAK_NODES; n++) {
      s.nodes[n * 2] = p.x;
      s.nodes[n * 2 + 1] = p.y;
    }
    streakData.push(s);
  }
  const vertsPerStreak = STREAK_NODES * 2;
  const totalVerts = STREAK_COUNT * vertsPerStreak;
  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const alphas = new Float32Array(totalVerts);
  const indices = [];
  for (let s = 0; s < STREAK_COUNT; s++) {
    const base = s * vertsPerStreak;
    for (let n = 0; n < STREAK_NODES; n++) {
      const vi = base + n * 2;
      const t = 1 - n / (STREAK_NODES - 1); // 1 = head, 0 = tail tip
      uvs[(vi) * 2] = 0; uvs[(vi) * 2 + 1] = t;
      uvs[(vi + 1) * 2] = 1; uvs[(vi + 1) * 2 + 1] = t;
      if (n < STREAK_NODES - 1) {
        const a = vi, b = vi + 1, c = vi + 2, d = vi + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(indices);

  const vert = `
    attribute float aAlpha;
    varying vec2 vUv;
    varying float vAlpha;
    void main(){
      vUv = uv;
      vAlpha = aAlpha;
      gl_Position = vec4(position, 1.0);
    }
  `;
  const frag = `
    varying vec2 vUv;
    varying float vAlpha;
    void main(){
      // Bold cartoon stroke: bright solid core with soft hand-drawn edge falloff
      float d = abs(vUv.x - 0.5) * 2.0;
      float edge = pow(max(1.0 - d * d, 0.0), 0.6);
      float core = pow(max(1.0 - d * d * 4.0, 0.0), 1.0);
      float a = vAlpha * edge;
      if (a < 0.004) discard;
      vec3 col = mix(vec3(1.0), vec3(0.82, 0.90, 1.0), 0.3) + core * 0.55;
      gl_FragColor = vec4(col, a);
    }
  `;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, // ribbons wind either way depending on flow direction; never cull
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { geo, mat, mesh };
}

function toNDC(x, y) {
  return [(x / LOGICAL_W) * 2 - 1, 1 - (y / LOGICAL_H) * 2];
}

function updateStreakGeometry() {
  const posAttr = streakGeometry.getAttribute('position');
  const alphaAttr = streakGeometry.getAttribute('aAlpha');
  const pos = posAttr.array;
  const alp = alphaAttr.array;
  const vertsPerStreak = STREAK_NODES * 2;
  for (let s = 0; s < streakData.length; s++) {
    const st = streakData[s];
    // Polyline length for stretch fade (freshly spawned streaks fade in as they stretch out)
    let length = 0;
    for (let n = 0; n < STREAK_NODES - 1; n++) {
      const dx = st.nodes[n * 2] - st.nodes[(n + 1) * 2];
      const dy = st.nodes[n * 2 + 1] - st.nodes[(n + 1) * 2 + 1];
      length += Math.hypot(dx, dy);
    }
    const stretchA = Math.min(1, length / 70);
    const ageA = Math.min(1, st.age / 0.35) * Math.min(1, (st.maxAge - st.age) / 0.6);
    const base = s * vertsPerStreak;
    for (let n = 0; n < STREAK_NODES; n++) {
      const t = 1 - n / (STREAK_NODES - 1); // 1 = head, 0 = tail
      const cx = st.nodes[n * 2];
      const cy = st.nodes[n * 2 + 1];
      // Tangent from neighbors (logical px)
      const pa = Math.max(0, n - 1), pb = Math.min(STREAK_NODES - 1, n + 1);
      let tx = st.nodes[pa * 2] - st.nodes[pb * 2];
      let ty = st.nodes[pa * 2 + 1] - st.nodes[pb * 2 + 1];
      let tl = Math.hypot(tx, ty);
      if (tl < 1e-4) { tx = st.dx; ty = st.dy; tl = Math.hypot(tx, ty) || 1; }
      const nx = -ty / tl, ny = tx / tl;
      // Tapering cartoon profile: pointed tail, full body, softly rounded head
      const wBody = 0.15 + 0.85 * smoothstep(0, 0.45, t);
      const wHead = 1 - 0.45 * smoothstep(0.9, 1, t);
      const w = st.width * wBody * wHead;
      const ox = nx * (w / 2) / (LOGICAL_W / 2);
      const oy = ny * (w / 2) / (LOGICAL_H / 2);
      const [ndcX, ndcY] = toNDC(cx, cy);
      const vi = (base + n * 2) * 3;
      pos[vi] = ndcX - ox; pos[vi + 1] = ndcY - oy; pos[vi + 2] = 0;
      pos[vi + 3] = ndcX + ox; pos[vi + 4] = ndcY + oy; pos[vi + 5] = 0;
      // Along-length fade: tail tip dissolves in, head stays strong with a slight cap fade
      const bodyA = smoothstep(0, 0.16, t) * (1 - 0.35 * smoothstep(0.88, 1, t));
      // No lines inside placed modifier bubbles (advection still uses the base
      // field — bubbles never bend the streaks, the ribbon just hides there)
      const modA = isInsideAnyModifier(cx, cy) ? 0 : 1;
      const a = STREAK_ALPHA * bodyA * ageA * stretchA * modA;
      const ai = base + n * 2;
      alp[ai] = a; alp[ai + 1] = a;
    }
  }
  posAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
}

export function initWindOverlay(container) {
  if (!container) container = document.getElementById('game-container');
  if (!container) return;
  canvasEl = document.getElementById('wind-canvas');
  if (!canvasEl) {
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'wind-canvas';
    container.appendChild(canvasEl);
  }
  Object.assign(canvasEl.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    background: 'transparent',
    zIndex: '4',
    border: 'none',
    boxShadow: 'none',
  });
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true, premultipliedAlpha: false });
  } catch(e){
    console.error('Wind Three.js WebGLRenderer failed', e);
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.autoClear = true;
  console.log('Wind Three.js initialized (Wind Waker streaks x' + STREAK_COUNT + ')', canvasEl.id, 'renderer:', !!renderer);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  // Lean uniforms stub (kept for compat: uTime drives gusts, uShowWind mirrors visibility)
  uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(LOGICAL_W, LOGICAL_H) },
    uLogicalSize: { value: new THREE.Vector2(LOGICAL_W, LOGICAL_H) },
    uShowWind: { value: 1 },
    uWindStrength: { value: 180 },
  };
  const st = createStreaks();
  streakGeometry = st.geo;
  streakMesh = st.mesh;
  scene.add(streakMesh);
  // Free Shot golden glow (REQ 07 §5.2 / REQ 06) — centered on ball when isFreeShotActive
  try {
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(241,196,15,1)');
    grad.addColorStop(0.22, 'rgba(241,196,15,0.85)');
    grad.addColorStop(0.42, 'rgba(241,196,15,0.45)');
    grad.addColorStop(0.65, 'rgba(241,196,15,0.12)');
    grad.addColorStop(1, 'rgba(241,196,15,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(glowCanvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      color: 0xf1c40f,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    freeShotGlow = new THREE.Sprite(spriteMat);
    freeShotGlow.visible = false;
    // scale: ~36px logical diameter -> NDC: 36/640 = 0.05625 * aspect? Use 0.08 for visibility
    freeShotGlow.scale.set(0.09, 0.09 * (LOGICAL_W / LOGICAL_H), 1);
    freeShotGlow.position.set(0, 0, 0.1);
    scene.add(freeShotGlow);
  } catch {}
  // Subtle edge glow for free shots (DOM overlay, subtle gold border)
  try {
    const existing = document.getElementById('free-shot-edge-glow');
    if (existing) freeShotEdgeEl = existing;
    else {
      freeShotEdgeEl = document.createElement('div');
      freeShotEdgeEl.id = 'free-shot-edge-glow';
      Object.assign(freeShotEdgeEl.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        borderRadius: '8px',
        border: '2px solid rgba(241,196,15,0.38)',
        boxShadow: 'inset 0 0 36px rgba(241,196,15,0.22), inset 0 0 70px rgba(241,196,15,0.12), 0 0 18px rgba(241,196,15,0.28)',
        opacity: '0',
        transition: 'opacity 260ms ease',
        zIndex: '4',
      });
      container.appendChild(freeShotEdgeEl);
    }
  } catch {}
  resizeWindOverlay();
  return { renderer, scene, camera, uniforms };
}

export function resizeWindOverlay() {
  if (!renderer || !canvasEl || !containerEl) {
    containerEl = document.getElementById('game-container');
  }
  const dpr = window.devicePixelRatio || 1;
  const container = containerEl || document.getElementById('game-container');
  if (!container || !renderer) return;
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  renderer.setPixelRatio(dpr);
  if (uniforms) {
    uniforms.uResolution.value.set(rect.width * dpr, rect.height * dpr);
  }
}

export function setFreeShotActive(active) {
  // For backward compat: single arg sets both ball and edge (armed case)
  freeShotEdgeActive = !!active;
  freeShotBallActive = !!active;
  freeShotActive = !!active; // keep for canvas visibility check
  if (freeShotGlow) {
    freeShotGlow.visible = freeShotBallActive;
    if (freeShotBallActive) freeShotTime = 0;
  }
  if (freeShotEdgeEl) {
    freeShotEdgeEl.style.opacity = freeShotEdgeActive ? '1' : '0';
  }
  // keep canvas visible if edge glow active even when wind hidden (edge must remain)
  if (canvasEl) canvasEl.style.display = (showWind || freeShotEdgeActive || freeShotBallActive) ? 'block' : 'none';
  // also keep renderer rendering (handled in renderWind)
}
export function setFreeShotBallActive(active) {
  freeShotBallActive = !!active;
  if (freeShotGlow) {
    freeShotGlow.visible = freeShotBallActive;
    if (freeShotBallActive) freeShotTime = 0;
  }
  // keep canvas visible if ball glow active even when wind hidden
  if (canvasEl) canvasEl.style.display = (showWind || freeShotEdgeActive || freeShotBallActive) ? 'block' : 'none';
}
export function setFreeShotEdgeActive(active) {
  freeShotEdgeActive = !!active;
  freeShotActive = !!active; // for backward compat canvas check
  if (freeShotEdgeEl) {
    freeShotEdgeEl.style.opacity = freeShotEdgeActive ? '1' : '0';
  }
  if (canvasEl) canvasEl.style.display = (showWind || freeShotEdgeActive || freeShotBallActive) ? 'block' : 'none';
}
export function updateFreeShotGlow(ballPos, dt) {
  if (!freeShotGlow) return;
  freeShotTime += dt || 0.016;
  if (freeShotBallActive && ballPos) {
    const ndcX = (ballPos.x / LOGICAL_W) * 2 - 1;
    const ndcY = 1 - (ballPos.y / LOGICAL_H) * 2;
    freeShotGlow.position.set(ndcX, ndcY, 0.1);
    // pulsation scale 1.0 + 0.15*sin(time*3), opacity 0.55-0.85
    const pulse = 1.0 + 0.15 * Math.sin(freeShotTime * 3);
    const base = 0.09;
    const aspect = LOGICAL_W / LOGICAL_H;
    freeShotGlow.scale.set(base * pulse, base * pulse * aspect, 1);
    freeShotGlow.material.opacity = 0.65 + 0.15 * Math.sin(freeShotTime * 4);
    freeShotGlow.visible = true;
  } else {
    freeShotGlow.visible = false;
  }
}
export function isFreeShotGlowVisible() { return !!freeShotActive && !!freeShotGlow && freeShotGlow.visible; }
export function updateWindUniforms(dt, getWindAt) {
  // update free shot glow position each tick if ball exists globally (fallback) — ball glow only when armed
  try {
    let bp = null;
    if (typeof window !== 'undefined' && window.ball && window.ball.pos) bp = window.ball.pos;
    // otherwise expect caller to call updateFreeShotGlow explicitly
    if (freeShotBallActive && bp) updateFreeShotGlow(bp, dt);
    else if (freeShotBallActive) { freeShotTime += dt; const pulse = 1.0 + 0.15 * Math.sin(freeShotTime * 3); if (freeShotGlow) { freeShotGlow.scale.set(0.09*pulse, 0.09*pulse*(LOGICAL_W/LOGICAL_H),1); } }
    // edge glow does not need per-frame ball update
  } catch {}
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  gustTime += step;
  if (uniforms) {
    uniforms.uTime.value = gustTime;
    uniforms.uShowWind.value = showWind ? 1 : 0;
  }
  if (!streakData.length || !streakGeometry) return;
  // Global gust swell: heavy gusts tear through, lulls breathe — always fast
  const gust = Math.max(0.55, 0.9 + 0.28 * Math.sin(gustTime * 1.9) + 0.12 * Math.sin(gustTime * 4.7 + 1.3));
  // Base field only: the visualization is unaffected by placed modifier bubbles.
  // Prefer the dedicated base sampler; fall back to the passed getWindAt.
  const sampler = (typeof getBaseWindAt === 'function') ? getBaseWindAt : getWindAt;
  const hasField = typeof sampler === 'function';
  let speedSum = 0;
  for (let i = 0; i < streakData.length; i++) {
    const s = streakData[i];
    let wind = { x: 0, y: 0 };
    try {
      if (hasField) wind = sampler(s.hx, s.hy);
    } catch {}
    const mag = Math.hypot(wind.x, wind.y);
    if (mag > 1e-4) { s.dx = wind.x / mag; s.dy = wind.y / mag; }
    const speed = Math.min(STREAK_MAX_SPEED, Math.max(STREAK_MIN_SPEED, mag * STREAK_SPEED)) * gust * s.jitter;
    speedSum += speed;
    s.hx += s.dx * speed * step;
    s.hy += s.dy * speed * step;
    s.age += step;
    const out = s.hx < -STREAK_SPAWN_MARGIN || s.hx > LOGICAL_W + STREAK_SPAWN_MARGIN ||
      s.hy < -STREAK_SPAWN_MARGIN || s.hy > LOGICAL_H + STREAK_SPAWN_MARGIN;
    if (s.age >= s.maxAge || out) {
      spawnStreak(s, getWindAt);
      continue;
    }
    // Shift history back, head at nodes[0]
    for (let n = STREAK_NODES - 1; n > 0; n--) {
      s.nodes[n * 2] = s.nodes[(n - 1) * 2];
      s.nodes[n * 2 + 1] = s.nodes[(n - 1) * 2 + 1];
    }
    s.nodes[0] = s.hx;
    s.nodes[1] = s.hy;
    // Anti-knot: a streak whose head nets almost no ground over its whole
    // trail is writhing in a sink — respawn it elsewhere instead of flooding.
    // Real orbits/swirls travel far more than this and are unaffected.
    if (s.age > STREAK_KNOT_MIN_AGE) {
      const tx = s.nodes[(STREAK_NODES - 1) * 2] - s.hx;
      const ty = s.nodes[(STREAK_NODES - 1) * 2 + 1] - s.hy;
      if (tx * tx + ty * ty < STREAK_KNOT_DIST * STREAK_KNOT_DIST) {
        spawnStreak(s, getWindAt);
        continue;
      }
    }
  }
  updateStreakGeometry();
  try { lastAvgSpeed = streakData.length ? speedSum / streakData.length : 0; } catch {}
}

export function setWindUniformsFromField(components, modifiers, windStrength) {
  // Streaks sample the base field directly (getBaseWindAt): bubbles never bend
  // them. The copy below is only for hiding ribbon nodes inside bubble areas.
  // Signature kept for compat.
  currentModifiers = (modifiers || []).map(m => ({ ...m }));
  if (!uniforms) return;
  try {
    if (windStrength != null) uniforms.uWindStrength.value = windStrength;
  } catch (e) {}
}

export function setWindVisible(v) {
  showWind = !!v;
  if (uniforms) uniforms.uShowWind.value = showWind ? 1 : 0;
  // keep canvasEl displayed even when wind hidden if freeShot edge glow is active (edge must remain)
  if (canvasEl) canvasEl.style.display = (showWind || freeShotEdgeActive || freeShotBallActive) ? 'block' : 'none';
  if (streakMesh) streakMesh.visible = showWind;
  if (freeShotGlow) freeShotGlow.visible = !!freeShotBallActive;
  if (freeShotEdgeEl) freeShotEdgeEl.style.opacity = freeShotEdgeActive ? '1' : '0';
}

export function isWindVisible() { return showWind; }
export function toggleWind() { setWindVisible(!showWind); return showWind; }

export function renderWind() {
  if (!renderer || !scene || !camera) return;
  if (!showWind && !freeShotEdgeActive && !freeShotBallActive) return;
  renderer.render(scene, camera);
}

export function getWindUniforms() { return uniforms; }
export function getWindRenderer() { return renderer; }
export function getWindCanvas() { return canvasEl; }
let lastAvgSpeed = 0;
export function getWindStreakStats() {
  if (!streakData.length || !streakGeometry) return null;
  const alp = streakGeometry.getAttribute('aAlpha').array;
  let vis = 0, sum = 0;
  for (let i = 0; i < alp.length; i++) { sum += alp[i]; if (alp[i] > 0.05) vis++; }
  let fieldProbe = null;
  try {
    const pts = [[640, 360], [200, 600], [1100, 100]];
    fieldProbe = pts.map(([x, y]) => {
      const w = getBaseWindAt(x, y);
      return { x, y, wx: +w.x.toFixed(3), wy: +w.y.toFixed(3) };
    });
  } catch (e) { fieldProbe = 'probe-failed:' + String(e && e.message || e); }
  return { streaks: streakData.length, verts: alp.length, visibleVerts: vis, avgAlpha: sum / alp.length, avgSpeed: lastAvgSpeed, gustTime, showWind, meshVisible: !!(streakMesh && streakMesh.visible), canvasDisplay: canvasEl ? canvasEl.style.display : 'no-canvas', fieldProbe };
}

if (typeof window !== 'undefined') {
  window.__windUniforms = () => uniforms;
  window.__windRenderer = () => renderer;
  window.__windStreakStats = () => { try { return getWindStreakStats(); } catch { return null; } };
}
