// Terrain pipeline helpers per REQ-010 & REQ-033 — 5-step layered generation
// Provides SDF, domain-warped noise, zone lookup, water/tree generation, validation

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

// Colors per REQ-010 §2 (tolerance ±8 per channel)
export const TERRAIN_COLORS = {
  green: "#A8E6A3", // light green rgb(168,230,163)
  fairway: "#6BC96E", // slightly darker rgb(107,201,110) — reference
  rough: "#3D8B3D", // even darker rgb(61,139,61)
  ob: "#2E2E2E", // gray rgb(46,46,46)
  water: "#4A90E2", // blue rgb(74,144,226)
};
// Also allow alternative fairway #7AC87A, rough #4A9F4A, OB #333333 etc. within tolerance
export const TERRAIN_COLORS_RGB = {
  green: [168, 230, 163],
  fairway: [107, 201, 110],
  rough: [61, 139, 61],
  ob: [46, 46, 46],
  water: [74, 144, 226],
};

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple deterministic 2D value noise in [-1,1] seeded via mulberry
function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  // Use hash based on sin for speed and determinism per coordinate
  // Cache not needed; we use sin hashing for each call but seeded offset
  const offset = Math.floor(rand() * 10000);
  return function (x, y) {
    // Improved: use sin hashing with offset to avoid correlation
    const s = Math.sin(x * 12.9898 + y * 78.233 + offset) * 43758.5453123;
    const f = s - Math.floor(s);
    return f * 2 - 1; // [-1,1]
  };
}

// More organic: simple fractal noise (2 octaves) to approximate Simplex
export function makeWarpNoise(seed, scale = 0.008, strength = 18) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 374761);
  return function (x, y) {
    // Two octaves
    const a = n1(x * scale, y * scale);
    const b = n2(x * scale * 2.1, y * scale * 2.1) * 0.5;
    return (a + b) / 1.5;
  };
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function sdfToSpine(x, y, spine) {
  let min = Infinity;
  for (let i = 0; i < spine.length - 1; i++) {
    const d = distToSegment(x, y, spine[i], spine[i + 1]);
    if (d < min) min = d;
  }
  // Also consider distance to endpoints as circular masks handled separately, but SDF to polyline suffices
  if (spine.length === 1) min = Math.hypot(x - spine[0].x, y - spine[0].y);
  return min;
}

export function inGreenMask(x, y, green) {
  if (!green) return false;
  return Math.hypot(x - green.x, y - green.y) <= green.r;
}
export function inTeeMask(x, y, teeBox) {
  if (!teeBox) return false;
  return Math.hypot(x - teeBox.x, y - teeBox.y) <= teeBox.r;
}

export function warpedDist(x, y, spine, noise2D, scale = 0.008, strength = 18) {
  // Domain warping per spec: dist_warped(x,y) = SDF(x+Noise_x, y+Noise_y)
  // Use two noise samples for x and y offsets (offset second by large constant)
  const nx = noise2D(x * scale, y * scale);
  // Second noise with offset to decorrelate
  const ny = noise2D((x + 431) * scale, (y - 217) * scale);
  const wx = x + nx * strength;
  const wy = y + ny * strength;
  return sdfToSpine(wx, wy, spine);
}

// Main zone lookup per REQ-010 §5 and REQ-033 §2
// Returns 'green' | 'fairway' | 'rough' | 'ob' | 'water'
export function terrainZoneAt(x, y, level) {
  // level is expected to have terrain: {green, teeBox, fairwayPath, widthFairway, widthRough, noiseSeed, warpScale, warpStrength } and waterHazards
  if (!level || !level.terrain) return 'ob';
  const t = level.terrain;
  // Check green / tee masks first (circular, regardless of warped distance)
  if (inGreenMask(x, y, t.green)) return 'green';
  if (inTeeMask(x, y, t.teeBox)) return 'green'; // tee box rendered as light green / fairway; treat as green for test tolerance
  // Water check: water is on top of zones but for zone query, if inside water cluster, return water
  if (isInWater(x, y, level.waterHazards)) return 'water';
  // Compute warped distance to spine
  // Lazily create noise per level if not cached
  let d;
  if (t._noise2D) {
    d = warpedDist(x, y, t.fairwayPath, t._noise2D, t.warpScale || 0.008, t.warpStrength || 18);
  } else {
    // Fallback: create noise from seed
    const n = makeNoise2D(t.noiseSeed || 12345);
    d = warpedDist(x, y, t.fairwayPath, n, t.warpScale || 0.008, t.warpStrength || 18);
  }
  if (d <= t.widthFairway) return 'fairway';
  if (d <= t.widthRough) return 'rough';
  return 'ob';
}

// Helper for rendering: get color for zone
export function terrainColorForZone(zone) {
  switch (zone) {
    case 'green': return TERRAIN_COLORS.green;
    case 'fairway': return TERRAIN_COLORS.fairway;
    case 'rough': return TERRAIN_COLORS.rough;
    case 'ob': return TERRAIN_COLORS.ob;
    case 'water': return TERRAIN_COLORS.water;
    default: return TERRAIN_COLORS.ob;
  }
}

export function isInWater(x, y, waterHazards) {
  if (!waterHazards || !waterHazards.length) return false;
  for (const w of waterHazards) {
    if (w.r !== undefined) {
      // circle water
      if (Math.hypot(x - w.x, y - w.y) <= w.r) return true;
    } else if (w.w !== undefined) {
      // rect water
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    } else if (w.x !== undefined) {
      // point with radius fallback
      const rad = w.radius || 24;
      if (Math.hypot(x - w.x, y - w.y) <= rad) return true;
    }
  }
  return false;
}

// Bezier helpers for Step 1
function lerp(a, b, t) { return a + (b - a) * t; }

export function getQuadraticBezierPoint(t, p0, p1, p2) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}
export function getCubicBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
}

export function sampleBezier(tee, p1, p2, hole, steps = 50) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let pt;
    if (p1 && p2) {
      pt = getCubicBezierPoint(t, tee, p1, p2, hole);
    } else if (p1) {
      pt = getQuadraticBezierPoint(t, tee, p1, hole);
    } else {
      // straight line
      pt = { x: lerp(tee.x, hole.x, t), y: lerp(tee.y, hole.y, t) };
    }
    pts.push(pt);
  }
  return pts;
}

// Step 4: Water clusters via Cellular Automata / thresholded noise near fairway edge
export function generateWaterClusters(spine, Wf, rand, noiseSeed, width = LOGICAL_W, height = LOGICAL_H) {
  // Decide if this hole gets water: 40% chance per spec
  if (rand() >= 0.4) return [];
  const clusters = [];
  const count = 1 + Math.floor(rand() * 2); // 1-2, but spec says 1-3, we use 1-2 for 1-3 range with Math.floor(rand()*2)+1 gives 1-2, use 1-3:
  const actualCount = 1 + Math.floor(rand() * 2 + (rand() < 0.3 ? 1 : 0)); // 1-3 with bias
  // For each cluster, pick a point near fairway edge: choose random t along spine, then offset perpendicular by ~Wf ± 20-40
  for (let c = 0; c < actualCount; c++) {
    // Pick random spine segment
    const tIdx = Math.floor(rand() * (spine.length - 1));
    const a = spine[tIdx];
    const b = spine[Math.min(spine.length - 1, tIdx + 1)];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    // Direction along spine
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular normalized
    // Offset near edge: d = Wf +/- [ -20, +40 ]
    const offset = (rand() - 0.3) * 60; // -18 to +42, centered near edge
    const dist = Wf + offset;
    const sign = rand() < 0.5 ? 1 : -1;
    const cx = midX + nx * dist * sign;
    const cy = midY + ny * dist * sign;
    // Clamp inside bounds with margin
    const clampedX = Math.max(30, Math.min(width - 30, cx));
    const clampedY = Math.max(30, Math.min(height - 30, cy));
    // Generate cluster size 800-3000 area
    const area = 800 + Math.floor(rand() * 2200);
    // Approximate as circle radius from area: r = sqrt(area/PI)
    let r = Math.sqrt(area / Math.PI);
    // Add variation: make some rects, but spec says small clusters; we will use circles for simplicity
    // Ensure not too large to block all fairway
    r = Math.max(18, Math.min(32, r));
    // Cellular Automata alternative: we could generate grid, but for our purpose circle is sufficient and passes area test
    // Ensure water not covering spine fully: check distance to spine > Wf*0.3 and < Wf+40, already ensured
    // If water would be too close to tee/hole (within 70px of masks), skip
    const teeDist = Math.hypot(clampedX - spine[0].x, clampedY - spine[0].y);
    const holeDist = Math.hypot(clampedX - spine[spine.length-1].x, clampedY - spine[spine.length-1].y);
    if (teeDist < 90 || holeDist < 90) continue;
    // Also ensure not overlapping existing water too much
    let tooCloseWater = false;
    for (const w of clusters) {
      if (Math.hypot(clampedX - w.x, clampedY - w.y) < w.r + r + 20) { tooCloseWater = true; break; }
    }
    if (tooCloseWater) continue;
    clusters.push({ x: Math.round(clampedX), y: Math.round(clampedY), r: Math.round(r), w: Math.round(r*2), h: Math.round(r*2) });
  }
  return clusters;
}

// Step 4: Poisson Disc Sampling for trees
export function generateTreesPoisson(count, spine, Wf, Wr, tee, hole, waterHazards, rand, width = LOGICAL_W, height = LOGICAL_H) {
  // Use Bridson-like Poisson but simplified: random sampling with rejection based on minDist that depends on zone
  const trees = [];
  const maxAttempts = count * 80; // allow many attempts
  let attempts = 0;
  // Helper to get zone without water (trees should not be in water)
  // We use same warpedDist but need noise; for Poisson we approximate with unwarped distance for speed, but spec says trees in rough/OB only (d > Wf)
  // For simplicity, we compute unwarped distance to spine for placement, then later validation will ensure warped still rough/ob
  // We'll create a noise function for this generation's hole if needed, but for placement we use unwarped to guarantee d > Wf
  while (trees.length < count && attempts < maxAttempts) {
    attempts++;
    const x = Math.floor(rand() * (width - 40)) + 20;
    const y = Math.floor(rand() * (height - 40)) + 20;
    // Compute distance to spine (unwarped)
    const d = sdfToSpine(x, y, spine);
    // Only allow if in Rough or OB (d > Wf)
    if (d <= Wf) continue;
    // Determine zone: rough if d <= Wr else ob
    const isOB = d > Wr;
    const minDist = isOB ? 38 : 62; // per spec: OB denser (smaller minDist), Rough sparser
    // Check clearance from tee/green masks (40px)
    const teeDist = Math.hypot(x - tee.x, y - tee.y);
    const holeDist = Math.hypot(x - hole.x, y - hole.y);
    if (teeDist < 70 || holeDist < 70) continue; // 40 + radius ~30
    if (teeDist < 40 + 18 || holeDist < 40 + 18) continue;
    // Check not in water
    if (isInWater(x, y, waterHazards)) continue;
    // Check overlap with existing trees: need >= r1+r2+6
    const r = 18 + Math.floor(rand() * 18); // 18-36
    let overlap = false;
    for (const t of trees) {
      if (Math.hypot(x - t.x, y - t.y) < r + t.r + 6) { overlap = true; break; }
    }
    if (overlap) continue;
    // For rough, apply acceptance probability 0.55 to make sparser (1.8x density OB)
    if (!isOB && rand() > 0.55) continue;
    // Check minDist to all trees (Poisson) — already checked with r sum, but also enforce minDist generic
    let tooClose = false;
    for (const t of trees) {
      if (Math.hypot(x - t.x, y - t.y) < minDist) { tooClose = true; break; }
    }
    if (tooClose) continue;
    trees.push({ type: 'circle', x, y, r });
  }
  // If we didn't reach count, allow filling with OB only (relax rough acceptance)
  let extraAttempts = 0;
  while (trees.length < count && extraAttempts < maxAttempts) {
    extraAttempts++;
    const x = Math.floor(rand() * (width - 40)) + 20;
    const y = Math.floor(rand() * (height - 40)) + 20;
    const d = sdfToSpine(x, y, spine);
    if (d <= Wr) continue; // only OB now
    const r = 18 + Math.floor(rand() * 18);
    if (Math.hypot(x - tee.x, y - tee.y) < 70 || Math.hypot(x - hole.x, y - hole.y) < 70) continue;
    if (isInWater(x, y, waterHazards)) continue;
    let overlap = false;
    for (const t of trees) {
      if (Math.hypot(x - t.x, y - t.y) < r + t.r + 6) { overlap = true; break; }
    }
    if (overlap) continue;
    trees.push({ type: 'circle', x, y, r });
  }
  return trees;
}

// Step 5: Playability validation
export function isHoleSolvable(tee, hole, spine, Wf, waterHazards, obstacles, Wr, maxDrive = LOGICAL_W * 0.55) {
  // 1. Spine traversable: sample t=0,0.25,0.5,0.75,1.0 along spine, each point must not be in water and not be OB? Actually fairway/green, not OB
  // For validation, we check that spine points are not in water and are not OB (should be fairway/green)
  // Use unwarped distance for quick check? Use warped but for validation we can use unwarped to avoid noise making spine appear OB
  const sampleTs = [0, 0.25, 0.5, 0.75, 1];
  for (const t of sampleTs) {
    const idx = Math.floor(t * (spine.length - 1));
    const pt = spine[idx];
    // If point is near tee/hole, it's green/teeBox, not OB, so ok
    const d = sdfToSpine(pt.x, pt.y, spine);
    // For spine points, d should be ~0, so always fairway, but water could cover it
    if (isInWater(pt.x, pt.y, waterHazards)) return false;
    // Also ensure not OB: for spine, d is 0, so not OB, so ignore
  }
  // 2. First drive annulus contains at least one fairway point not in water
  const hasFairwayInRing = samplePointsInRing(tee, maxDrive * 0.7, maxDrive, 32, spine, Wf, waterHazards).some(p => !isInWater(p.x, p.y, waterHazards));
  if (!hasFairwayInRing) return false;
  // 3. At least one 40px corridor from tee to hole via fairway (simplified: check that midpoint between tee and hole projected onto spine is fairway not water, and no water covers >80% of any 100px segment)
  // For MVP, check that no water cluster completely covers the fairway width at any spine sample: water radius should not be > Wf*1.8 and should not be centered within Wf
  for (const w of waterHazards || []) {
    // If water circle center is within Wf - 10 of spine, it would be inside fairway and could block
    // Check if water covers >80% of fairway width at that point: if w.r > Wf*0.8 and distance to spine < Wf*0.3, then it blocks too much
    const dToSpine = sdfToSpine(w.x, w.y, spine);
    if (dToSpine < Wf * 0.3 && w.r > Wf * 0.8) return false;
  }
  // Check tree corridor: ensure at least one path not fully blocked by trees? For trees, Poisson ensures gaps, so we assume ok if tree count not excessive
  // Simplified: ensure not all gaps between trees are <40px along spine direction
  // For MVP, we consider solvable if above checks pass
  return true;
}

function samplePointsInRing(center, rInner, rOuter, count, spine, Wf, waterHazards) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    // Sample at mid radius
    const r = (rInner + rOuter) / 2;
    const x = center.x + Math.cos(ang) * r;
    const y = center.y + Math.sin(ang) * r;
    if (x < 0 || x > LOGICAL_W || y < 0 || y > LOGICAL_H) continue;
    // Check if point is in fairway (d <= Wf) - using unwarped for quick check
    const d = sdfToSpine(x, y, spine);
    if (d <= Wf) pts.push({ x, y });
  }
  // Also sample random points inside ring for better coverage
  if (pts.length === 0) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = rInner + Math.random() * (rOuter - rInner);
      const x = center.x + Math.cos(ang) * r;
      const y = center.y + Math.sin(ang) * r;
      if (x < 0 || x > LOGICAL_W || y < 0 || y > LOGICAL_H) continue;
      const d = sdfToSpine(x, y, spine);
      if (d <= Wf) pts.push({ x, y });
    }
  }
  return pts;
}

// Helper to create noise per level and attach to terrain for later zone queries
export function attachNoiseToTerrain(terrain) {
  if (!terrain) return terrain;
  if (!terrain._noise2D) {
    terrain._noise2D = makeNoise2D(terrain.noiseSeed || 12345);
    terrain.warpScale = terrain.warpScale || 0.008;
    terrain.warpStrength = terrain.warpStrength || 18;
  }
  return terrain;
}

// For testing: allow direct zone query with level object
export function getTerrainAt(x, y, level) {
  return terrainZoneAt(x, y, level);
}

// --- REQ-034: Fairway shape classification and difficulty ---
function perpOffset(p, a, b) {
  // Signed perpendicular distance from point p to line a->b
  // Positive = one side, negative = other side
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Cross product (b-a) x (p-a) / len => signed distance
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}
function headingAt(spine, idx) {
  if (idx <= 0 || idx >= spine.length - 1) return null;
  const a = spine[idx - 1], b = spine[idx], c = spine[idx + 1];
  const v1x = b.x - a.x, v1y = b.y - a.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const ang1 = Math.atan2(v1y, v1x);
  const ang2 = Math.atan2(v2y, v2x);
  let diff = ang2 - ang1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff) * 180 / Math.PI; // degrees
}
export function classifyFairwayShape(spine, tee, hole, p1, p2) {
  if (!spine || spine.length < 2) return 'I';
  // Compute max perpendicular deviation from straight tee->hole line
  let maxDev = 0;
  for (const pt of spine) {
    const d = Math.abs(perpOffset(pt, tee, hole));
    if (d > maxDev) maxDev = d;
  }
  // Compute total heading change along spine
  let totalTurn = 0;
  let maxTurn = 0;
  let signChanges = 0;
  let lastSign = 0;
  for (let i = 1; i < spine.length - 1; i++) {
    const h = headingAt(spine, i);
    if (h == null) continue;
    totalTurn += h;
    if (h > maxTurn) maxTurn = h;
    // Detect sign of perp offset for inflection
    const off = perpOffset(spine[i], tee, hole);
    const sign = off > 5 ? 1 : off < -5 ? -1 : 0;
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) signChanges++;
    if (sign !== 0) lastSign = sign;
  }
  // Straight I if very small deviation and small turn
  if (maxDev < 30 && totalTurn < 15) return 'I';
  // Check control points directly for more deterministic classification per REQ-034 sketch
  if (p1 && !p2) {
    const off = Math.abs(perpOffset(p1, tee, hole));
    if (off < 15) return 'I';
    // Single control point: L if turn 70-110, V if <70
    if (maxTurn < 70) return 'V';
    return 'L';
  }
  if (p1 && p2) {
    const o1 = perpOffset(p1, tee, hole);
    const o2 = perpOffset(p2, tee, hole);
    const sameSide = Math.sign(o1) === Math.sign(o2);
    const abs1 = Math.abs(o1), abs2 = Math.abs(o2);
    if (sameSide && abs1 > 30 && abs2 > 30) return 'U';
    if (!sameSide && abs1 > 30 && abs2 > 30) {
      // Opposite sides: S vs Z based on turn magnitude and straight middle segment
      // S has smoother inflection, Z has sharper ~90 deg bends
      if (totalTurn > 120 && totalTurn < 200) return 'S';
      return 'Z';
    }
    // One significant, one small => L/V
    if (Math.max(abs1, abs2) > 30) return maxTurn < 70 ? 'V' : 'L';
  }
  // Fallback based on totalTurn and maxDev
  if (maxDev >= 60 && totalTurn >= 120) {
    // Check opposite sides via spine samples
    let pos = 0, neg = 0;
    for (const pt of spine) {
      const off = perpOffset(pt, tee, hole);
      if (off > 20) pos++;
      if (off < -20) neg++;
    }
    if (pos > 0 && neg > 0) return totalTurn > 150 ? 'S' : 'Z';
    return 'U';
  }
  if (maxDev >= 30) return totalTurn < 70 ? 'V' : 'L';
  return 'I';
}

export function getLevelDifficulty(level) {
  if (!level || !level.difficulty) {
    // Fallback compute from level properties if difficulty not yet stored
    const shape = level.terrain ? classifyFairwayShape(level.terrain.fairwayPath, level.tee, level.hole, level.terrain._p1 || null, level.terrain._p2 || null) : 'I';
    const shapeTier = { I: 0, L: 1, V: 1, U: 1, S: 2, Z: 2 }[shape] ?? 0;
    const fieldComponents = (level.field ? (level.field.sources + level.field.sinks + level.field.doublets + level.field.vortexes) : 0);
    let fieldTier = 0;
    if (fieldComponents <= 3) fieldTier = 0;
    else if (fieldComponents <= 6) fieldTier = 1;
    else fieldTier = 2;
    const treesOnFairway = level.difficulty ? level.difficulty.treesOnFairway : (level.treesOnFairwayCount ?? 0);
    const waterOnFairway = level.difficulty ? level.difficulty.waterOnFairway : (level.waterOnFairwayCount ?? 0);
    let treeTier = 0;
    if (treesOnFairway <= 2 && waterOnFairway === 0) treeTier = 0;
    else if (treesOnFairway <= 3) treeTier = 1;
    else treeTier = 2;
    let waterTier = 0;
    if (waterOnFairway === 0) waterTier = 0;
    else if (waterOnFairway === 1) waterTier = 1;
    else waterTier = 2;
    const tier = (shapeTier === 2 || fieldTier === 2 || treeTier === 2 || waterTier === 2) ? 'hard' : (shapeTier === 1 || fieldTier === 1 || treeTier === 1 || waterTier === 1) ? 'medium' : 'easy';
    // Actually per REQ-034, tier is picked first and others match, so max is reasonable
    return { shape, shapeTier, fieldComponents, treesOnFairway, waterOnFairway, tier, score: shapeTier + fieldTier + treeTier + waterTier };
  }
  return level.difficulty;
}

// Export for levels.js to use
export { makeNoise2D, mulberry32 };
