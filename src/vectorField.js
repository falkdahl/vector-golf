// Tunable constants at top per REQ-003 - high acceleration per updated requirement
export const WIND_STRENGTH = 90;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 15;
export const MAX_POWER_REF = 600; // for min force calc per REQ-003
export const MIN_WIND_FORCE = 0.1 * MAX_POWER_REF; // 60

export const MODIFIER_RADIUS = 90;
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
let canvasW = 900;
let canvasH = 600;

// Deterministic pseudo-random (mulberry32)
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createField(c = DEFAULT_COLS, r = DEFAULT_ROWS, strength = WIND_STRENGTH, seed = 42, width = 900, height = 600) {
  cols = c;
  rows = r;
  canvasW = width;
  canvasH = height;
  cellW = canvasW / cols;
  cellH = canvasH / rows;
  field = [];
  const rand = mulberry32(seed);
  for (let row = 0; row < rows; row++) {
    field[row] = [];
    for (let col = 0; col < cols; col++) {
      const nx = col / cols;
      const ny = row / rows;
      // Complex swirl + divergence, deterministic
      const angle =
        Math.sin(nx * 6.5 + seed * 0.07) * 1.5 +
        Math.cos(ny * 7.2) * 1.2 +
        Math.sin((nx + ny) * 4.3 + seed * 0.03) * 0.9 +
        Math.cos((nx - ny) * 5.1) * 0.7 +
        (rand() - 0.5) * 0.6;

      const magBase = 0.35 + 0.6 * Math.abs(Math.sin(nx * 8 + ny * 6 + seed * 0.02));
      const magRand = rand() * 0.35;
      let magnitude = Math.min(1.5, magBase + magRand);
      // Enforce minimum force 10% of max power per REQ-003 and varying strength per location - high acceleration
      const minMagnitude = MIN_WIND_FORCE / WIND_STRENGTH; // e.g., 60/80=0.75
      // Preserve angle variation but ensure magnitude varies by location (stronger/weaker regions) with high acceleration
      magnitude = minMagnitude + magnitude * 1.0; // range ~1.1-2.25 for ws80, force 88-180, strong enough for quick direction change

      field[row][col] = {
        x: Math.cos(angle) * magnitude,
        y: Math.sin(angle) * magnitude
      };
    }
  }
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
        result.x *= -1;
        result.y *= -1;
      }
    }
  }
  return result;
}
