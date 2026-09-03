import * as THREE from 'three';

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const PARTICLE_COUNT = 68;
const PARTICLE_LIFE = 6.5;
const PARTICLE_SPEED = 48;
const TRAIL_LENGTH = 14;

let renderer = null;
let scene = null;
let camera = null;
let windMesh = null;
let windMaterial = null;
let fadeMesh = null;
let particlePoints = null;
let trailPoints = null;
let particleGeometry = null;
let trailGeometry = null;
let uniforms = null;

let particleData = []; // {x,y,life,maxLife, trail:[{x,y}]}
let currentModifiers = [];
let showWind = true;
let containerEl = null;
let canvasEl = null;

const MAX_SOURCES = 4;
const MAX_SINKS = 4;
const MAX_VORTICES = 4;
const MAX_DOUBLETS = 4;
const MAX_MODIFIERS = 12;

function createWindShader() {
  const vertexShader = `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    precision highp float;
    precision highp int;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uLogicalSize;
    uniform float uShowWind;
    uniform float uWindStrength;
    uniform float uSoftening;
    uniform int uSourceCount;
    uniform vec2 uSourcePos[4];
    uniform float uSourceStr[4];
    uniform int uSinkCount;
    uniform vec2 uSinkPos[4];
    uniform float uSinkStr[4];
    uniform int uVortexCount;
    uniform vec2 uVortexPos[4];
    uniform float uVortexStr[4];
    uniform int uDoubletCount;
    uniform vec2 uDoubletPos[4];
    uniform float uDoubletMu[4];
    uniform float uDoubletTheta[4];
    uniform int uModifierCount;
    uniform vec2 uModifierPos[12];
    uniform float uModifierRadius[12];
    uniform float uModifierType[12];
    vec2 sampleWind(vec2 world){
      vec2 v = vec2(0.0);
      float eps = uSoftening * uSoftening;
      for(int i=0; i<4; ++i){
        if(i >= uSourceCount) continue;
        vec2 sPos = uSourcePos[i];
        float sStr = uSourceStr[i];
        vec2 d = world - sPos;
        float r2 = dot(d,d) + eps;
        if(r2 > 0.001) v += sStr * d / r2;
      }
      for(int i=0; i<4; ++i){
        if(i >= uSinkCount) continue;
        vec2 sPos = uSinkPos[i];
        float sStr = uSinkStr[i];
        vec2 d = world - sPos;
        float r2 = dot(d,d) + eps;
        if(r2 > 0.001) v += -sStr * d / r2;
      }
      for(int i=0; i<4; ++i){
        if(i >= uVortexCount) continue;
        vec2 vPos = uVortexPos[i];
        float g = uVortexStr[i];
        vec2 d = world - vPos;
        float r2 = dot(d,d) + eps;
        if(r2 > 0.001) v += g * vec2(-d.y, d.x) / r2;
      }
      for(int i=0; i<4; ++i){
        if(i >= uDoubletCount) continue;
        vec2 dPos = uDoubletPos[i];
        float mu = uDoubletMu[i];
        float th = uDoubletTheta[i];
        if(abs(mu) < 0.001) continue;
        vec2 d = world - dPos;
        float ct = cos(th);
        float st = sin(th);
        float dpx = ct * d.x + st * d.y;
        float dpy = -st * d.x + ct * d.y;
        float r2 = dpx*dpx + dpy*dpy + eps;
        float r4 = r2 * r2;
        if(r4 < 0.001) continue;
        vec2 local;
        local.x = mu * (dpx*dpx - dpy*dpy) / r4;
        local.y = mu * (2.0 * dpx * dpy) / r4;
        vec2 contrib;
        contrib.x = ct * local.x - st * local.y;
        contrib.y = st * local.x + ct * local.y;
        v += contrib;
      }
      for(int i=0; i<12; ++i){
        if(i >= uModifierCount) continue;
        vec2 mPos = uModifierPos[i];
        float mRad = uModifierRadius[i];
        float mType = uModifierType[i];
        vec2 md = world - mPos;
        if(dot(md,md) < mRad * mRad){
          if(mType < 0.5) v *= 5.0;
          else if(mType < 1.5) v = vec2(0.0);
          else v *= -1.0;
        }
      }
      return v * (uWindStrength * 2.0 + 20.0);
    }
    void main(){
      // Streaks removed per user request - keep transparent
      gl_FragColor = vec4(0.0);
    }
  `;
  uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(LOGICAL_W, LOGICAL_H) },
    uLogicalSize: { value: new THREE.Vector2(LOGICAL_W, LOGICAL_H) },
    uShowWind: { value: 1 },
    uWindStrength: { value: 180 },
    uSoftening: { value: 28 },
    uSourceCount: { value: 0 },
    uSourcePos: { value: Array(4).fill(0).map(() => new THREE.Vector2(0, 0)) },
    uSourceStr: { value: [0, 0, 0, 0] },
    uSinkCount: { value: 0 },
    uSinkPos: { value: Array(4).fill(0).map(() => new THREE.Vector2(0, 0)) },
    uSinkStr: { value: [0, 0, 0, 0] },
    uVortexCount: { value: 0 },
    uVortexPos: { value: Array(4).fill(0).map(() => new THREE.Vector2(0, 0)) },
    uVortexStr: { value: [0, 0, 0, 0] },
    uDoubletCount: { value: 0 },
    uDoubletPos: { value: Array(4).fill(0).map(() => new THREE.Vector2(0, 0)) },
    uDoubletMu: { value: [0, 0, 0, 0] },
    uDoubletTheta: { value: [0, 0, 0, 0] },
    uModifierCount: { value: 0 },
    uModifierPos: { value: Array(12).fill(0).map(() => new THREE.Vector2(0, 0)) },
    uModifierRadius: { value: Array(12).fill(0) },
    uModifierType: { value: Array(12).fill(0) },
  };
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });
  return { mat, uniforms, geo };
}

function createParticles() {
  const totalTrailPoints = PARTICLE_COUNT * TRAIL_LENGTH;
  const positions = new Float32Array(totalTrailPoints * 3);
  const alphas = new Float32Array(totalTrailPoints);
  const sizes = new Float32Array(totalTrailPoints);
  particleData = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = Math.random() * LOGICAL_W;
    const y = Math.random() * LOGICAL_H;
    const life = Math.random() * PARTICLE_LIFE;
    const trail = [];
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      trail.push({ x, y });
    }
    particleData.push({ x, y, life, maxLife: PARTICLE_LIFE, trail });
  }
  // Fill initial buffers
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = particleData[i];
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      const idx = i * TRAIL_LENGTH + t;
      const tp = p.trail[t];
      const ndcX = (tp.x / LOGICAL_W) * 2 - 1;
      const ndcY = 1 - (tp.y / LOGICAL_H) * 2;
      positions[idx * 3 + 0] = ndcX;
      positions[idx * 3 + 1] = ndcY;
      positions[idx * 3 + 2] = 0;
      const lifeAlpha = Math.max(0, p.life / p.maxLife);
      const trailFade = 1.0 - (t / TRAIL_LENGTH) * 0.85;
      alphas[idx] = lifeAlpha * trailFade * 0.9;
      sizes[idx] = 9.0 * (1.0 - t / TRAIL_LENGTH * 0.5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const vert = `
    attribute float alpha;
    attribute float size;
    varying float vAlpha;
    void main(){
      vAlpha = alpha;
      gl_Position = vec4(position, 1.0);
      gl_PointSize = size;
    }
  `;
  const frag = `
    varying float vAlpha;
    void main(){
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if(d > 0.5) discard;
      // Broad soft dot - no hard black border, just soft white with gentle falloff
      float soft = 1.0 - smoothstep(0.0, 0.5, d);
      // Slight inner core bright
      float core = 1.0 - smoothstep(0.0, 0.28, d);
      float a = vAlpha * soft * 0.95;
      // Blend core highlight
      vec3 col = vec3(1.0);
      // Add very subtle blue tint for wind feel
      col = mix(col, vec3(0.85, 0.92, 1.0), 0.15);
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
  });
  const points = new THREE.Points(geo, mat);
  return { geo, mat, points };
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
  console.log('Wind Three.js initialized (particles with ghost trails, no streaks)', canvasEl.id, 'renderer:', !!renderer);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const { mat, geo } = createWindShader();
  windMaterial = mat;
  uniforms = mat.uniforms;
  windMesh = new THREE.Mesh(geo, mat);
  windMesh.visible = false;
  // Do not add streak mesh - streaks removed
  // scene.add(windMesh);
  const p = createParticles();
  particleGeometry = p.geo;
  particlePoints = p.points;
  scene.add(particlePoints);
  // Keep trailPoints alias for compatibility
  trailPoints = particlePoints;
  trailGeometry = particleGeometry;
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

export function updateWindUniforms(dt, getWindAt) {
  if (!uniforms) {
    // Still need to update particles even if uniforms not ready? Particles don't need uniforms now
  } else {
    uniforms.uTime.value += dt;
    uniforms.uShowWind.value = showWind ? 1 : 0;
  }
  if (!particleData.length || !particleGeometry) return;
  const posAttr = particleGeometry.getAttribute('position');
  const alphaAttr = particleGeometry.getAttribute('alpha');
  const sizeAttr = particleGeometry.getAttribute('size');
  for (let i = 0; i < particleData.length; i++) {
    const p = particleData[i];
    const prevX = p.x, prevY = p.y;
    let wind = { x: 0, y: 0 };
    try {
      if (typeof getWindAt === 'function') wind = getWindAt(p.x, p.y);
    } catch {}
    const windSpeed = Math.hypot(wind.x, wind.y);
    const speedNorm = Math.max(0, Math.min(1, (windSpeed - 0.35) / 1.9));
    p.x += wind.x * PARTICLE_SPEED * dt;
    p.y += wind.y * PARTICLE_SPEED * dt;
    // Keep tail alive longer when moving faster: life decays slower for fast wind
    p.life -= dt * (1.0 - speedNorm * 0.50);
    let respawned = false;
    if (p.life <= 0) {
      p.x = Math.random() * LOGICAL_W;
      p.y = Math.random() * LOGICAL_H;
      p.life = PARTICLE_LIFE;
      respawned = true;
      // Reset trail on respawn
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        p.trail[t].x = p.x;
        p.trail[t].y = p.y;
      }
    }
    if (!respawned && (p.x < 0 || p.x > LOGICAL_W || p.y < 0 || p.y > LOGICAL_H)) {
      p.x = Math.random() * LOGICAL_W;
      p.y = Math.random() * LOGICAL_H;
      p.life = PARTICLE_LIFE;
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        p.trail[t].x = p.x;
        p.trail[t].y = p.y;
      }
    }
    // Despawn if stuck on flip modifier edge - prevents oscillation at discontinuity
    if (!respawned && currentModifiers.length) {
      for (const m of currentModifiers) {
        if (m.type !== 'flip') continue;
        const rad = m.radius ?? 54;
        const dist = Math.hypot(p.x - m.x, p.y - m.y);
        const prevDist = Math.hypot(prevX - m.x, prevY - m.y);
        const edgeDist = Math.abs(dist - rad);
        const crossed = (prevDist < rad && dist >= rad) || (prevDist >= rad && dist < rad);
        if (edgeDist < 7 || crossed) {
          // Despawn instead of getting stuck
          p.x = Math.random() * LOGICAL_W;
          p.y = Math.random() * LOGICAL_H;
          p.life = PARTICLE_LIFE;
          for (let t = 0; t < TRAIL_LENGTH; t++) {
            p.trail[t].x = p.x;
            p.trail[t].y = p.y;
          }
          respawned = true;
          break;
        }
      }
    }
    // Shift trail: move history back, insert current head
    if (!respawned) {
      for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
        p.trail[t].x = p.trail[t-1].x;
        p.trail[t].y = p.trail[t-1].y;
      }
      p.trail[0].x = p.x;
      p.trail[0].y = p.y;
    }
    const lifeAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    // Speed-dependent tail: fast wind keeps tail alive longer and thicker
    const windSpeedForTrail = Math.hypot(wind.x, wind.y);
    const speedNormTrail = Math.max(0, Math.min(1, (windSpeedForTrail - 0.35) / 1.9));
    const fadeFactor = 0.78 - speedNormTrail * 0.42; // fast -> 0.36 (long), slow ->0.78 (short)
    const sizeFadeFactor = 0.38 - speedNormTrail * 0.12; // fast tails stay thicker
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      const idx = i * TRAIL_LENGTH + t;
      const tp = p.trail[t];
      const ndcX = (tp.x / LOGICAL_W) * 2 - 1;
      const ndcY = 1 - (tp.y / LOGICAL_H) * 2;
      posAttr.array[idx * 3 + 0] = ndcX;
      posAttr.array[idx * 3 + 1] = ndcY;
      const trailFade = 1.0 - (t / TRAIL_LENGTH) * fadeFactor;
      alphaAttr.array[idx] = lifeAlpha * trailFade * 0.92;
      sizeAttr.array[idx] = 9.0 * (1.0 - t / TRAIL_LENGTH * sizeFadeFactor);
    }
  }
  posAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
}

export function setWindUniformsFromField(components, modifiers, windStrength) {
  // Keep JS copy for particle edge despawn checks (flip)
  currentModifiers = (modifiers || []).map(m => ({ ...m }));
  if (!uniforms) return;
  try {
    if (windStrength != null) uniforms.uWindStrength.value = windStrength;
    const src = components?.sources || [];
    uniforms.uSourceCount.value = Math.min(src.length, MAX_SOURCES);
    for (let i = 0; i < MAX_SOURCES; i++) {
      if (i < src.length) {
        uniforms.uSourcePos.value[i].set(src[i].x, src[i].y);
        uniforms.uSourceStr.value[i] = src[i].s ?? src[i].strength ?? 1;
      } else {
        uniforms.uSourcePos.value[i].set(0, 0);
        uniforms.uSourceStr.value[i] = 0;
      }
    }
    const sink = components?.sinks || [];
    uniforms.uSinkCount.value = Math.min(sink.length, MAX_SINKS);
    for (let i = 0; i < MAX_SINKS; i++) {
      if (i < sink.length) {
        uniforms.uSinkPos.value[i].set(sink[i].x, sink[i].y);
        uniforms.uSinkStr.value[i] = sink[i].s ?? sink[i].strength ?? 1;
      } else {
        uniforms.uSinkPos.value[i].set(0, 0);
        uniforms.uSinkStr.value[i] = 0;
      }
    }
    const vort = components?.vortices || components?.vortexes || [];
    uniforms.uVortexCount.value = Math.min(vort.length, MAX_VORTICES);
    for (let i = 0; i < MAX_VORTICES; i++) {
      if (i < vort.length) {
        uniforms.uVortexPos.value[i].set(vort[i].x, vort[i].y);
        uniforms.uVortexStr.value[i] = vort[i].g ?? vort[i].strength ?? 0;
      } else {
        uniforms.uVortexPos.value[i].set(0, 0);
        uniforms.uVortexStr.value[i] = 0;
      }
    }
    const doub = components?.doublets || [];
    uniforms.uDoubletCount.value = Math.min(doub.length, MAX_DOUBLETS);
    for (let i = 0; i < MAX_DOUBLETS; i++) {
      if (i < doub.length) {
        uniforms.uDoubletPos.value[i].set(doub[i].x, doub[i].y);
        uniforms.uDoubletMu.value[i] = doub[i].mu ?? 1;
        uniforms.uDoubletTheta.value[i] = doub[i].theta ?? 0;
      } else {
        uniforms.uDoubletPos.value[i].set(0, 0);
        uniforms.uDoubletMu.value[i] = 0;
        uniforms.uDoubletTheta.value[i] = 0;
      }
    }
    const mods = modifiers || [];
    uniforms.uModifierCount.value = Math.min(mods.length, MAX_MODIFIERS);
    for (let i = 0; i < MAX_MODIFIERS; i++) {
      if (i < mods.length) {
        const m = mods[i];
        uniforms.uModifierPos.value[i].set(m.x, m.y);
        uniforms.uModifierRadius.value[i] = m.radius ?? 54;
        let t = 0;
        if (m.type === 'nullify') t = 1;
        else if (m.type === 'flip') t = 2;
        else t = 0;
        uniforms.uModifierType.value[i] = t;
      } else {
        uniforms.uModifierPos.value[i].set(0, 0);
        uniforms.uModifierRadius.value[i] = 0;
        uniforms.uModifierType.value[i] = 0;
      }
    }
  } catch (e) {}
}

export function setWindVisible(v) {
  showWind = !!v;
  if (uniforms) uniforms.uShowWind.value = showWind ? 1 : 0;
  if (canvasEl) canvasEl.style.display = showWind ? 'block' : 'none';
  if (particlePoints) particlePoints.visible = showWind;
  if (windMesh) windMesh.visible = false;
}

export function isWindVisible() { return showWind; }
export function toggleWind() { setWindVisible(!showWind); return showWind; }

export function renderWind() {
  if (!renderer || !scene || !camera) return;
  if (!showWind) return;
  renderer.render(scene, camera);
}

export function getWindUniforms() { return uniforms; }
export function getWindRenderer() { return renderer; }
export function getWindCanvas() { return canvasEl; }

if (typeof window !== 'undefined') {
  window.__windUniforms = () => uniforms;
  window.__windRenderer = () => renderer;
}
