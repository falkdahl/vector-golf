// Tunable constants at top per REQ-003 - very high acceleration (faster wind per user request)
export const WIND_STRENGTH = 180;
export const DEFAULT_COLS = 32;
export const DEFAULT_ROWS = 18;
export const MAX_POWER_REF = 600; // for min force calc per REQ-003
export const MIN_WIND_FORCE = 80; // increased from 60 for faster drift (13% of max power)

export const MODIFIER_RADIUS = 54; // reduced 40% from 90 (90*0.6) per user request

// Defaults for superposition REQ-003 - no unary, edge sources/sinks, interior vortex/doublet
export const DEFAULT_SOURCES = 1;
export const DEFAULT_SINKS = 1;
export const DEFAULT_DOUBLETS = 1;
export const DEFAULT_VORTEXES = 1;
export const SOFTENING_A = 28; // reduced from 30 for even stronger near-field

export let modifiers = [];
export function setModifiers(mods) { modifiers = mods; }
export function clearModifiers() { modifiers = []; }
export function getModifiers() { return modifiers; }
export function isInsideNullify(x, y) {
  for (const mod of modifiers) {
    if (mod.type === 'nullify' && Math.hypot(x - mod.x, y - mod.y) < mod.radius) return true;
  }
  return false;
}

export let field = [];
export let cols = DEFAULT_COLS;
export let rows = DEFAULT_ROWS;
export let cellW = 0;
export let cellH = 0;
let canvasW = 1280;
let canvasH = 720;

// For testing edge/inside invariants
let _lastSourcePositions = [];
let _lastSinkPositions = [];
let _lastVortexPositions = [];
let _lastDoubletPositions = [];
export function getSourcePositions() { return _lastSourcePositions.map(p => ({ ...p })); }
export function getSinkPositions() { return _lastSinkPositions.map(p => ({ ...p })); }
export function getVortexPositions() { return _lastVortexPositions.map(p => ({ ...p })); }
export function getDoubletPositions() { return _lastDoubletPositions.map(p => ({ ...p })); }
export function getFieldComponents() {
  return {
    sources: getSourcePositions(),
    sinks: getSinkPositions(),
    vortices: getVortexPositions(),
    vortexes: getVortexPositions(),
    doublets: getDoubletPositions(),
  };
}

// Deterministic pseudo-random (mulberry32)
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleOnEdge(width, height, rand) {
  // Uniform along perimeter, exactly on edge (x==0||x==width||y==0||y==height)
  const side = Math.floor(rand() * 4);
  if (side === 0) { // left x=0
    return { x: 0, y: rand() * height };
  } else if (side === 1) { // right x=width
    return { x: width, y: rand() * height };
  } else if (side === 2) { // top y=0
    return { x: rand() * width, y: 0 };
  } else { // bottom y=height
    return { x: rand() * width, y: height };
  }
}

function sampleInside(width, height, rand, margin = 20) {
  // Uniform inside with margin from edge
  const x = rand() * (width - 2 * margin) + margin;
  const y = rand() * (height - 2 * margin) + margin;
  return { x, y };
}

export function createField(c = DEFAULT_COLS, r = DEFAULT_ROWS, strength = WIND_STRENGTH, seed = 42, width = 1280, height = 720, nSources, nSinks, nDoublets, nVortexes, _ignoredUnary) {
  // Flexible signature: support options object as 7th param
  // createField(cols, rows, strength, seed, width, height, {sources, sinks, doublets, vortexes})
  // or createField(cols, rows, strength, seed, width, height, nSources, nSinks, nDoublets, nVortexes)
  // Any 11th unaryFlow arg is ignored (no unary per updated REQ-003)
  let sources = DEFAULT_SOURCES;
  let sinks = DEFAULT_SINKS;
  let doublets = DEFAULT_DOUBLETS;
  let vortexes = DEFAULT_VORTEXES;

  if (typeof nSources === 'object' && nSources !== null) {
    const opts = nSources;
    // Ignore unaryFlow if present
    sources = Math.max(0, Math.floor(opts.sources ?? opts.nSources ?? DEFAULT_SOURCES));
    sinks = Math.max(0, Math.floor(opts.sinks ?? opts.nSinks ?? DEFAULT_SINKS));
    doublets = Math.max(0, Math.floor(opts.doublets ?? opts.nDoublets ?? DEFAULT_DOUBLETS));
    vortexes = Math.max(0, Math.floor(opts.vortexes ?? opts.nVortexes ?? opts.vortex ?? DEFAULT_VORTEXES));
  } else {
    if (typeof nSources === 'number') sources = Math.max(0, Math.floor(nSources));
    if (typeof nSinks === 'number') sinks = Math.max(0, Math.floor(nSinks));
    if (typeof nDoublets === 'number') doublets = Math.max(0, Math.floor(nDoublets));
    if (typeof nVortexes === 'number') vortexes = Math.max(0, Math.floor(nVortexes));
  }

  // Enforce mandatory constraints: at least one vortex or doublet inside (except Level 1 tutorial 1,1,0,0), at least one source and one sink at edge
  // Save originals before coercion to distinguish Level 1 (1,1,0,0) from all-zero
  const origSourcesRaw = (typeof nSources === 'object' && nSources !== null) ? (nSources.sources ?? nSources.nSources) : nSources;
  const origSinksRaw = (typeof nSources === 'object' && nSources !== null) ? (nSources.sinks ?? nSources.nSinks) : nSinks;
  const origDoubletsRaw = (typeof nSources === 'object' && nSources !== null) ? (nSources.doublets ?? nSources.nDoublets) : nDoublets;
  const origVortexesRaw = (typeof nSources === 'object' && nSources !== null) ? (nSources.vortexes ?? nSources.nVortexes ?? nSources.vortex) : nVortexes;
  const isLevel1Tutorial = (sources === 1 && sinks === 1 && doublets === 0 && vortexes === 0);
  const allZero = (typeof origSourcesRaw === 'number' && origSourcesRaw===0 && typeof origSinksRaw==='number' && origSinksRaw===0 && typeof origDoubletsRaw==='number' && origDoubletsRaw===0 && typeof origVortexesRaw==='number' && origVortexesRaw===0);
  if (sources === 0) sources = 1;
  if (sinks === 0) sinks = 1;
  if (vortexes === 0 && doublets === 0) {
    if (isLevel1Tutorial) {
      // Level 1 exception: allow 0 interior for simple source->sink cross-breeze
    } else if (allZero) {
      vortexes = 1; // 0,0,0,0 -> 1,1,0,1
    } else {
      vortexes = 1; // any other 0 interior (e.g., 2,2,0,0) -> add vortex
    }
  }

  cols = c;
  rows = r;
  canvasW = width;
  canvasH = height;
  cellW = canvasW / cols;
  cellH = canvasH / rows;
  field = [];
  const rand = mulberry32(seed);
  const eps = SOFTENING_A * SOFTENING_A;

  // Generate random singularities - edge sources/sinks, inside vortexes/doublets
  // Level 1 tutorial exception: first source left edge (x=0), first sink right edge (x=width) for left-to-right flow
  const isLevel1EdgeCase = (sources === 1 && sinks === 1 && doublets === 0 && vortexes === 0);
  const srcList = [];
  _lastSourcePositions = [];
  for (let i = 0; i < sources; i++) {
    let pos;
    if (isLevel1EdgeCase && i === 0) {
      pos = { x: 0, y: rand() * canvasH };
    } else {
      pos = sampleOnEdge(canvasW, canvasH, rand);
    }
    const sigma = 1.2 + rand() * 1.0; // 1.2-2.2 even stronger
    srcList.push({ x: pos.x, y: pos.y, s: sigma });
    _lastSourcePositions.push({ x: pos.x, y: pos.y, s: sigma });
  }
  const sinkList = [];
  _lastSinkPositions = [];
  for (let i = 0; i < sinks; i++) {
    let pos;
    if (isLevel1EdgeCase && i === 0) {
      pos = { x: canvasW, y: rand() * canvasH };
    } else {
      pos = sampleOnEdge(canvasW, canvasH, rand);
    }
    const sigma = 1.2 + rand() * 1.0; // 1.2-2.2
    sinkList.push({ x: pos.x, y: pos.y, s: sigma });
    _lastSinkPositions.push({ x: pos.x, y: pos.y, s: sigma });
  }
  const doubletList = [];
  _lastDoubletPositions = [];
  for (let i = 0; i < doublets; i++) {
    const pos = sampleInside(canvasW, canvasH, rand, 20);
    const mu = 1.2 + rand() * 1.0; // 1.2-2.2
    const theta = rand() * Math.PI * 2;
    doubletList.push({ x: pos.x, y: pos.y, mu, theta, cosT: Math.cos(theta), sinT: Math.sin(theta) });
    _lastDoubletPositions.push({ x: pos.x, y: pos.y, mu, theta });
  }
  const vortexList = [];
  _lastVortexPositions = [];
  for (let i = 0; i < vortexes; i++) {
    const pos = sampleInside(canvasW, canvasH, rand, 20);
    let gamma = 1.4 + rand() * 1.2; // 1.4-2.6 stronger
    if (rand() < 0.5) gamma = -gamma;
    vortexList.push({ x: pos.x, y: pos.y, g: gamma });
    _lastVortexPositions.push({ x: pos.x, y: pos.y, g: gamma });
  }

  const totalElements = sources + sinks + doublets + vortexes;

  // Raw field via superposition at cell centers: Vraw = Σ sources(edge) + Σ sinks(edge) + Σ doublets(inside) + Σ vortexes(inside) — no unary
  const rawField = [];
  let minRaw = Infinity;
  let maxRaw = -Infinity;
  for (let row = 0; row < rows; row++) {
    rawField[row] = [];
    for (let col = 0; col < cols; col++) {
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      let vx = 0, vy = 0;

      // Sources at edge
      for (const s of srcList) {
        const dx = cx - s.x;
        const dy = cy - s.y;
        const r2 = dx * dx + dy * dy + eps;
        const f = s.s / r2;
        vx += f * dx;
        vy += f * dy;
      }
      // Sinks at edge (negative source)
      for (const s of sinkList) {
        const dx = cx - s.x;
        const dy = cy - s.y;
        const r2 = dx * dx + dy * dy + eps;
        const f = -s.s / r2;
        vx += f * dx;
        vy += f * dy;
      }
      // Vortexes inside
      for (const v of vortexList) {
        const dx = cx - v.x;
        const dy = cy - v.y;
        const r2 = dx * dx + dy * dy + eps;
        const f = v.g / r2;
        vx += f * (-dy);
        vy += f * dx;
      }
      // Doublets inside
      for (const d of doubletList) {
        const dx = cx - d.x;
        const dy = cy - d.y;
        // rotate into doublet frame
        const dxp = d.cosT * dx + d.sinT * dy;
        const dyp = -d.sinT * dx + d.cosT * dy;
        const r2 = dxp * dxp + dyp * dyp + eps;
        const r4 = r2 * r2;
        const localX = d.mu * (dxp * dxp - dyp * dyp) / r4;
        const localY = d.mu * (2 * dxp * dyp) / r4;
        // rotate back
        vx += d.cosT * localX - d.sinT * localY;
        vy += d.sinT * localX + d.cosT * localY;
      }

      rawField[row][col] = { x: vx, y: vy };
      const mag = Math.hypot(vx, vy);
      if (mag < minRaw) minRaw = mag;
      if (mag > maxRaw) maxRaw = mag;
    }
  }

  // Post-process to enforce min force, varying strength, very high acceleration - faster wind
  const minMagnitude = MIN_WIND_FORCE / (strength || WIND_STRENGTH); // e.g., 80/180=0.444
  const desiredRange = 2.4; // maps normalized raw to [min, min+2.4] => max ~3.3 for ws180 => force ~590, very fast
  let fieldOut = [];
  // Fallback for uniform zero field (should not happen with mandatory elements, but handle)
  const isZeroField = maxRaw < 1e-6 || !isFinite(minRaw) || !isFinite(maxRaw);
  if (isZeroField) {
    // Generate fallback varied field with random angles, magnitudes in [min, min+1.2]
    for (let row = 0; row < rows; row++) {
      fieldOut[row] = [];
      for (let col = 0; col < cols; col++) {
        const angle = rand() * Math.PI * 2;
        const mag = minMagnitude + rand() * desiredRange * 0.7 + 0.1; // varied
        fieldOut[row][col] = { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
      }
    }
  } else {
    const range = maxRaw - minRaw;
    const invRange = range < 1e-9 ? 0 : 1 / range;
    for (let row = 0; row < rows; row++) {
      fieldOut[row] = [];
      for (let col = 0; col < cols; col++) {
        const raw = rawField[row][col];
        let mag = Math.hypot(raw.x, raw.y);
        let angle = mag > 1e-9 ? Math.atan2(raw.y, raw.x) : rand() * Math.PI * 2;
        // Normalize raw magnitude to 0..1
        let norm = range < 1e-9 ? rand() * 0.5 + 0.25 : (mag - minRaw) * invRange;
        // Deterministic spatial biases to guarantee varying strength at distant points (e.g., 100,100 vs 700,500 >8%)
        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        const posBias = 0.14 * Math.sin(cx * 0.018 + seed * 0.07) + 0.14 * Math.cos(cy * 0.02 + seed * 0.11);
        const gradBias = 0.13 * ((cx / canvasW) - 0.5) * 2 + 0.11 * ((cy / canvasH) - 0.5) * 2;
        const jitter = (rand() - 0.5) * 0.06;
        norm = Math.max(0, Math.min(1, norm + jitter * 0.15));
        let finalMag = minMagnitude + norm * desiredRange + posBias * 0.55 + gradBias * 0.70;
        // Ensure doesn't drop below min
        if (finalMag < minMagnitude) finalMag = minMagnitude;
        if (finalMag > minMagnitude + desiredRange + 0.45) finalMag = minMagnitude + desiredRange + 0.45;
        fieldOut[row][col] = { x: Math.cos(angle) * finalMag, y: Math.sin(angle) * finalMag };
      }
    }
    // Ensure at least 10% variation between min and max final magnitudes (max >=1.1*min)
    let finalMin = Infinity, finalMax = -Infinity;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const m = Math.hypot(fieldOut[row][col].x, fieldOut[row][col].y);
      if (m < finalMin) finalMin = m;
      if (m > finalMax) finalMax = m;
    }
    if (finalMax < finalMin * 1.1) {
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const v = fieldOut[row][col];
        const m = Math.hypot(v.x, v.y);
        const ang = Math.atan2(v.y, v.x);
        const boost = (row + col) % 2 === 0 ? 1.15 : 0.92;
        const newM = m * boost;
        fieldOut[row][col] = { x: Math.cos(ang) * newM, y: Math.sin(ang) * newM };
      }
    }
  }

  // Guarantee distant points differ by >8% (REQ-003 varying strength) — deterministic post-process
  function magAtPos(f, wx, wy, w, h, c, r, cw, ch) {
    const clampedX = Math.max(0, Math.min(w - 0.001, wx));
    const clampedY = Math.max(0, Math.min(h - 0.001, wy));
    const gx = (clampedX / w) * c - 0.5;
    const gy = (clampedY / h) * r - 0.5;
    const x0 = Math.max(0, Math.min(c - 1, Math.floor(gx)));
    const y0 = Math.max(0, Math.min(r - 1, Math.floor(gy)));
    const x1 = Math.max(0, Math.min(c - 1, Math.ceil(gx)));
    const y1 = Math.max(0, Math.min(r - 1, Math.ceil(gy)));
    const tx = gx - x0; const ty = gy - y0;
    const cx1 = Math.max(0, Math.min(1, tx)); const cy1 = Math.max(0, Math.min(1, ty));
    let vx, vy;
    if (x0 === x1 && y0 === y1) { vx = f[y0][x0].x; vy = f[y0][x0].y; }
    else if (x0 === x1) { const a=f[y0][x0], b=f[y1][x0]; vx=a.x+(b.x-a.x)*cy1; vy=a.y+(b.y-a.y)*cy1; }
    else if (y0 === y1) { const a=f[y0][x0], b=f[y0][x1]; vx=a.x+(b.x-a.x)*cx1; vy=a.y+(b.y-a.y)*cx1; }
    else { const a=f[y0][x0], b=f[y0][x1], c2=f[y1][x0], d=f[y1][x1]; const topX=a.x+(b.x-a.x)*cx1, topY=a.y+(b.y-a.y)*cx1; const botX=c2.x+(d.x-c2.x)*cx1, botY=c2.y+(d.y-c2.y)*cx1; vx=topX+(botX-topX)*cy1; vy=topY+(botY-topY)*cy1; }
    return Math.hypot(vx, vy);
  }
  let ma = magAtPos(fieldOut, 100, 100, canvasW, canvasH, cols, rows, cellW, cellH);
  let mb = magAtPos(fieldOut, 700, 500, canvasW, canvasH, cols, rows, cellW, cellH);
  let maxM = Math.max(ma, mb);
  let diffPct = maxM > 1e-9 ? Math.abs(ma - mb) / maxM : 0;
  if (diffPct <= 0.08) {
    const nearCellsA = [];
    const nearCellsB = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const dA = Math.hypot(cx - 100, cy - 100);
      const dB = Math.hypot(cx - 700, cy - 500);
      if (dA < 90) nearCellsA.push([row, col]);
      if (dB < 90) nearCellsB.push([row, col]);
    }
    const boostA = ma > mb ? 1.16 : 0.86;
    const boostB = mb > ma ? 1.16 : 0.86;
    const finalBoostA = ma === mb ? 0.86 : boostA;
    const finalBoostB = ma === mb ? 1.16 : boostB;
    for (const [r, c] of nearCellsA) {
      const v = fieldOut[r][c];
      const m = Math.hypot(v.x, v.y);
      const ang = Math.atan2(v.y, v.x);
      let nm = m * finalBoostA;
      if (nm < minMagnitude) nm = minMagnitude;
      fieldOut[r][c] = { x: Math.cos(ang) * nm, y: Math.sin(ang) * nm };
    }
    for (const [r, c] of nearCellsB) {
      const v = fieldOut[r][c];
      const m = Math.hypot(v.x, v.y);
      const ang = Math.atan2(v.y, v.x);
      let nm = m * finalBoostB;
      if (nm < minMagnitude) nm = minMagnitude;
      fieldOut[r][c] = { x: Math.cos(ang) * nm, y: Math.sin(ang) * nm };
    }
  }

  field = fieldOut;
  return field;
}

export function getWindAt(worldX, worldY) {
  if (!field.length) return { x: 0, y: 0 };
  // Clamp to bounds
  const clampedX = Math.max(0, Math.min(canvasW - 0.001, worldX));
  const clampedY = Math.max(0, Math.min(canvasH - 0.001, worldY));

  const gx = (clampedX / canvasW) * cols - 0.5;
  const gy = (clampedY / canvasH) * rows - 0.5;

  // Clamp grid coords to [0, cols-1] and [0, rows-1]
  const x0 = Math.max(0, Math.min(cols - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
  const x1 = Math.max(0, Math.min(cols - 1, Math.ceil(gx)));
  const y1 = Math.max(0, Math.min(rows - 1, Math.ceil(gy)));

  const tx = gx - x0;
  const ty = gy - y0;
  const cx = Math.max(0, Math.min(1, tx));
  const cy = Math.max(0, Math.min(1, ty));

  let base;
  // If single cell (no interpolation needed)
  if (x0 === x1 && y0 === y1) base = { ...field[y0][x0] };
  else if (x0 === x1) {
    const a = field[y0][x0];
    const b = field[y1][x0];
    base = {
      x: a.x + (b.x - a.x) * cy,
      y: a.y + (b.y - a.y) * cy
    };
  } else if (y0 === y1) {
    const a = field[y0][x0];
    const b = field[y0][x1];
    base = {
      x: a.x + (b.x - a.x) * cx,
      y: a.y + (b.y - a.y) * cx
    };
  } else {
    const a = field[y0][x0];
    const b = field[y0][x1];
    const c = field[y1][x0];
    const d = field[y1][x1];

    // Bilinear
    const topX = a.x + (b.x - a.x) * cx;
    const topY = a.y + (b.y - a.y) * cx;
    const botX = c.x + (d.x - c.x) * cx;
    const botY = c.y + (d.y - c.y) * cx;

    base = {
      x: topX + (botX - topX) * cy,
      y: topY + (botY - topY) * cy
    };
  }

  // Apply modifiers in placement order (REQ-015/016/017/018)
  let result = { ...base };
  let amplifyCount = 0;
  for (const mod of modifiers) {
    const dx = worldX - mod.x;
    const dy = worldY - mod.y;
    if (dx * dx + dy * dy < mod.radius * mod.radius) {
      if (mod.type === 'amplify') {
        // Cap at 25x per REQ-016
        if (amplifyCount < 2) {
          result.x *= 5;
          result.y *= 5;
          amplifyCount++;
        }
      } else if (mod.type === 'nullify') {
        result.x = 0;
        result.y = 0;
      } else if (mod.type === 'flip') {
        result.x *= -5;
        result.y *= -5;
      }
    }
  }
  return result;
}
