import { sampleBezier, generateWaterClusters, generateTreesPoisson, generateRoughBorderTrees, isHoleSolvable, attachNoiseToTerrain, classifyFairwayShape, warpedDist } from "./terrain.js";

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateObstacles(count, tee, hole, rand, width = 1280, height = 720) {
  const obstacles = [];
  let attempts = 0;
  while (obstacles.length < count && attempts < 800) {
    attempts++;
    const rectsPlaced = obstacles.filter(o => o.type === 'rect').length;
    let type;
    if (rectsPlaced >= 6) {
      type = 'circle';
    } else {
      const placed = obstacles.length;
      if (placed < 2) type = 'vertical';
      else if (placed < 4) type = 'circle';
      else if (placed < 6) type = 'horizontal';
      else if (placed < 8) type = 'vertical';
      else type = 'circle';
    }
    let obs;
    if (type === 'vertical') {
      const w = 20;
      const h = 80 + Math.floor(rand() * 140);
      const x = Math.floor(rand() * (width - w - 40)) + 20;
      const y = Math.floor(rand() * (height - h - 40)) + 20;
      obs = { type: 'rect', x, y, w, h };
    } else if (type === 'horizontal') {
      const w = 80 + Math.floor(rand() * 140);
      const h = 20;
      const x = Math.floor(rand() * (width - w - 40)) + 20;
      const y = Math.floor(rand() * (height - h - 40)) + 20;
      obs = { type: 'rect', x, y, w, h };
    } else {
      const r = 25 + Math.floor(rand() * 20);
      const x = Math.floor(rand() * (width - 2 * r - 40)) + 20 + r;
      const y = Math.floor(rand() * (height - 2 * r - 40)) + 20 + r;
      obs = { type: 'circle', x, y, r };
    }
    let tooClose = false;
    if (obs.type === 'rect') {
      const teeInside = tee.x >= obs.x - 60 && tee.x <= obs.x + obs.w + 60 && tee.y >= obs.y - 60 && tee.y <= obs.y + obs.h + 60;
      const holeInside = hole.x >= obs.x - 60 && hole.x <= obs.x + obs.w + 60 && hole.y >= obs.y - 60 && hole.y <= obs.y + obs.h + 60;
      if (teeInside || holeInside) tooClose = true;
      if (obs.x < 0 || obs.y < 0 || obs.x + obs.w > width || obs.y + obs.h > height) tooClose = true;
    } else {
      const dTee = Math.hypot(tee.x - obs.x, tee.y - obs.y);
      const dHole = Math.hypot(hole.x - obs.x, hole.y - obs.y);
      if (dTee < 30 + obs.r || dHole < 30 + obs.r) tooClose = true;
      if (obs.x - obs.r < 0 || obs.x + obs.r > width || obs.y - obs.r < 0 || obs.y + obs.r > height) tooClose = true;
    }
    if (tooClose) continue;
    let overlap = false;
    for (const other of obstacles) {
      if (other.type === 'rect' && obs.type === 'rect') {
        const overlapX = !(obs.x + obs.w < other.x || obs.x > other.x + other.w);
        const overlapY = !(obs.y + obs.h < other.y || obs.y > other.y + other.h);
        if (overlapX && overlapY) { overlap = true; break; }
        const dx = Math.max(0, Math.max(other.x - (obs.x + obs.w), obs.x - (other.x + other.w)));
        const dy = Math.max(0, Math.max(other.y - (obs.y + obs.h), obs.y - (other.y + other.h)));
        const dist = Math.hypot(dx, dy);
        if (dist < 40) { overlap = true; break; }
      } else if (other.type === 'circle' && obs.type === 'circle') {
        if (Math.hypot(obs.x - other.x, obs.y - other.y) < obs.r + other.r + 10) { overlap = true; break; }
      } else {
        const rect = obs.type === 'rect' ? obs : other;
        const circ = obs.type === 'circle' ? obs : other;
        const closestX = Math.max(rect.x, Math.min(circ.x, rect.x + rect.w));
        const closestY = Math.max(rect.y, Math.min(circ.y, rect.y + rect.h));
        if (Math.hypot(closestX - circ.x, closestY - circ.y) < circ.r + 10) { overlap = true; break; }
      }
    }
    if (overlap) continue;
    obstacles.push(obs);
  }
  if (count >= 2 && obstacles.length >= 1) {
    const blocked = isLineBlocked(tee, hole, obstacles);
    if (!blocked) {
      const mx = (tee.x + hole.x) / 2;
      const my = (tee.y + hole.y) / 2;
      const first = obstacles[0];
      if (first.type === 'rect') {
        first.x = Math.max(20, Math.min(width - first.w - 20, Math.floor(mx - first.w / 2)));
        first.y = Math.max(20, Math.min(height - first.h - 20, Math.floor(my - first.h / 2)));
      } else {
        first.x = Math.max(first.r + 20, Math.min(width - first.r - 20, Math.floor(mx)));
        first.y = Math.max(first.r + 20, Math.min(height - first.r - 20, Math.floor(my)));
      }
    }
  }
  return obstacles;
}

function isLineBlocked(tee, hole, obstacles) {
  for (const obs of obstacles) {
    if (obs.type === 'rect') {
      if (segmentIntersectsRect(tee, hole, obs)) return true;
    } else {
      if (segmentIntersectsCircle(tee, hole, obs)) return true;
    }
  }
  return false;
}

function segmentIntersectsRect(p1, p2, rect) {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
  if (x1 >= rx && x1 <= rx + rw && y1 >= ry && y1 <= ry + rh) return true;
  if (x2 >= rx && x2 <= rx + rw && y2 >= ry && y2 <= ry + rh) return true;
  const edges = [
    [{ x: rx, y: ry }, { x: rx + rw, y: ry }],
    [{ x: rx + rw, y: ry }, { x: rx + rw, y: ry + rh }],
    [{ x: rx + rw, y: ry + rh }, { x: rx, y: ry + rh }],
    [{ x: rx, y: ry + rh }, { x: rx, y: ry }],
  ];
  for (const [a, b] of edges) {
    if (segmentsIntersect(p1, p2, a, b)) return true;
  }
  return false;
}

function segmentIntersectsCircle(p1, p2, circle) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const fx = p1.x - circle.x, fy = p1.y - circle.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - circle.r * circle.r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function segmentsIntersect(a, b, c, d) {
  function ccw(p1, p2, p3) {
    return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  }
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

// Helpers for REQ-034: tier distribution and shape generation
function getTierForHole(levelNum, count, difficulty) {
  // For 3-hole courses: uniform difficulty selected by player
  if (count === 3 && difficulty && ['easy','medium','hard'].includes(difficulty)) {
    return difficulty;
  }
  // Linear scaling for 6,9,18 (hole 1 easy -> last hard): tierIdx = floor((levelNum-1)/count *3)
  // 18: 1-6 easy,7-12 medium,13-18 hard; 9:1-3/4-6/7-9; 6:1-2/3-4/5-6; fallback for other counts
  const tierIdx = Math.floor((levelNum - 1) / count * 3);
  if (tierIdx <= 0) return 'easy';
  if (tierIdx === 1) return 'medium';
  return 'hard';
}

function generateFairwayShape(tier, tee, hole, rand) {
  const mx = (tee.x + hole.x) / 2;
  const my = (tee.y + hole.y) / 2;
  const perpAng = Math.atan2(hole.y - tee.y, hole.x - tee.x) + Math.PI / 2;
  let p1 = null, p2 = null;
  let shape = 'I';
  if (tier === 'easy') {
    // I-shaped: horizontal/vertical straight, no control point or tiny offset <15px
    // Keep straight line (no p1/p2) for true I, or with tiny jitter <10px for horizontal/vertical variation
    const tinyOffset = (rand() - 0.5) * 20; // ±10px
    if (Math.abs(tinyOffset) > 5) {
      p1 = { x: mx + Math.cos(perpAng) * tinyOffset, y: my + Math.sin(perpAng) * tinyOffset };
      // This will still be classified as I because maxDev <30 and totalTurn <15 per terrain.js
      shape = 'I';
    } else {
      shape = 'I';
    }
  } else if (tier === 'medium') {
    // More L shapes with harder edges — biased to L (50% L, 25% V, 25% U)
    const rPick = rand();
    let choice;
    if (rPick < 0.50) choice = 0; // L 50%
    else if (rPick < 0.75) choice = 1; // V 25%
    else choice = 2; // U 25%
    if (choice === 0) {
      // L: hard 90° edge — larger than original but toned down from 140-200
      const useCorner = rand() < 0.6;
      if (useCorner) {
        // Hard L corner at (hole.x, tee.y) or (tee.x, hole.y) — creates true hard edge
        const cornerX = rand() < 0.5 ? hole.x : tee.x;
        const cornerY = cornerX === hole.x ? tee.y : hole.y;
        const offset = (rand() - 0.5) * 40; // small jitter ±20
        p1 = {
          x: cornerX + Math.cos(perpAng) * offset,
          y: cornerY + Math.sin(perpAng) * offset
        };
        // Clamp to stay inside bounds
        p1.x = Math.max(30, Math.min(1250, p1.x));
        p1.y = Math.max(30, Math.min(690, p1.y));
      } else {
        const offset = (rand() > 0.5 ? 1 : -1) * (125 + rand() * 50); // 125-175 — toned down from 140-200
        p1 = { x: mx + Math.cos(perpAng) * offset, y: my + Math.sin(perpAng) * offset };
      }
      shape = 'L';
    } else if (choice === 1) {
      // V: acute — larger but toned down from 120-170
      const offset = (rand() > 0.5 ? 1 : -1) * (105 + rand() * 45); // 105-150
      p1 = { x: mx + Math.cos(perpAng) * offset, y: my + Math.sin(perpAng) * offset };
      shape = 'V';
    } else {
      // U: two same-side — larger but toned down from 150-210
      const offset = (rand() > 0.5 ? 1 : -1) * (135 + rand() * 50); // 135-185
      p1 = { x: mx - (hole.x - tee.x) * 0.15 + Math.cos(perpAng) * offset, y: my - (hole.y - tee.y) * 0.15 + Math.sin(perpAng) * offset };
      p2 = { x: mx + (hole.x - tee.x) * 0.15 + Math.cos(perpAng) * offset, y: my + (hole.y - tee.y) * 0.15 + Math.sin(perpAng) * offset };
      shape = 'U';
    }
  } else if (tier === 'hard') {
    // S/Z with larger bends but NOT bending back over itself — toned down from loopback
    const isZ = rand() < 0.5;
    const offset1 = (rand() > 0.5 ? 1 : -1) * (155 + rand() * 65); // 155-220 — larger than original 115-170 but toned down from 320-430 loopback
    const offset2 = -offset1 * (0.88 + rand() * 0.28); // opposite, 0.88-1.16×
    const longFactor = 0.24 + rand() * 0.08; // 0.24-0.32 — keeps p1/p2 between tee/hole, no backtrack
    p1 = { x: mx - (hole.x - tee.x) * longFactor + Math.cos(perpAng) * offset1, y: my - (hole.y - tee.y) * longFactor + Math.sin(perpAng) * offset1 };
    p2 = { x: mx + (hole.x - tee.x) * longFactor + Math.cos(perpAng) * offset2, y: my + (hole.y - tee.y) * longFactor + Math.sin(perpAng) * offset2 };
    // Clamp to stay inside canvas
    p1.x = Math.max(30, Math.min(1250, p1.x));
    p1.y = Math.max(30, Math.min(690, p1.y));
    p2.x = Math.max(30, Math.min(1250, p2.x));
    p2.y = Math.max(30, Math.min(690, p2.y));
    shape = isZ ? 'Z' : 'S';
  }
  // Clamp controls to stay inside playable area so fairway doesn't go off-canvas with extreme bends
  if (p1) {
    p1.x = Math.max(30, Math.min(1250, p1.x));
    p1.y = Math.max(30, Math.min(690, p1.y));
  }
  if (p2) {
    p2.x = Math.max(30, Math.min(1250, p2.x));
    p2.y = Math.max(30, Math.min(690, p2.y));
  }
  const spine = sampleBezier(tee, p1, p2, hole, 50);
  // For easy I, ensure not too much deviation: if tier easy but p1 caused >30 deviation, correct to straight
  // We keep as is for medium/hard; the classification in terrain.js will verify
  return { spine, p1, p2, shape };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function edgePointClosestTo(target, width, height, rand) {
  // Find the point slightly outside the canvas closest to target (20-60px outside, not on edge)
  const outside = rand ? Math.floor(rand() * 41) + 20 : 35; // 20-60, default 35 if no rand
  const candidates = [
    { x: -outside, y: clamp(target.y, 0, height) },
    { x: width + outside, y: clamp(target.y, 0, height) },
    { x: clamp(target.x, 0, width), y: -outside },
    { x: clamp(target.x, 0, width), y: height + outside },
  ];
  let best = candidates[0];
  let bestDist = Math.hypot(best.x - target.x, best.y - target.y);
  for (const c of candidates.slice(1)) {
    const d = Math.hypot(c.x - target.x, c.y - target.y);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function sampleOnEdgeForFree(edge, rand, width, height) {
  const outside = Math.floor(rand() * 41) + 20; // 20-60 outside
  if (edge === 'left') return { x: -outside, y: Math.floor(rand() * (height - 40)) + 20 };
  if (edge === 'right') return { x: width + outside, y: Math.floor(rand() * (height - 40)) + 20 };
  if (edge === 'top') return { x: Math.floor(rand() * (width - 40)) + 20, y: -outside };
  return { x: Math.floor(rand() * (width - 40)) + 20, y: height + outside };
}

function getClosestEdgeName(target, width, height) {
  const distLeft = target.x;
  const distRight = width - target.x;
  const distTop = target.y;
  const distBottom = height - target.y;
  let edge = 'left';
  let min = distLeft;
  if (distRight < min) { min = distRight; edge = 'right'; }
  if (distTop < min) { min = distTop; edge = 'top'; }
  if (distBottom < min) { min = distBottom; edge = 'bottom'; }
  return edge;
}

function getEdgeName(pos, width, height) {
  if (pos.x < 0) return 'left';
  if (pos.x > width) return 'right';
  if (pos.y < 0) return 'top';
  if (pos.y > height) return 'bottom';
  // fallback for exact edge (should not happen now, but keep)
  if (pos.x === 0) return 'left';
  if (pos.x === width) return 'right';
  if (pos.y === 0) return 'top';
  return 'bottom';
}

function _generateLevelsInternal(seed = 42, count = 18, options = {}) {
  // Handle overload: generateLevels(seed, {difficulty:'easy'}) or count as options
  let difficulty = null;
  if (typeof count === 'object' && count !== null && !Array.isArray(count)) {
    options = count;
    count = 18;
  }
  if (typeof options === 'string' && ['easy','medium','hard'].includes(options)) {
    difficulty = options;
  } else if (options && typeof options === 'object' && options.difficulty && ['easy','medium','hard'].includes(options.difficulty)) {
    difficulty = options.difficulty;
  }
  // Validate count
  if (![3,6,9,18].includes(count)) count = 18;
  // For 3-hole courses with difficulty, ensure difficulty is respected (already extracted)
  const rand = mulberry32(seed);
  const levels = [];
  for (let i = 0; i < count; i++) {
    const levelNum = i + 1;
    const tier = getTierForHole(levelNum, count, difficulty);
    // Tee left / Hole right with random height
    const teeX = Math.floor(rand() * 100) + 40;
    const teeY = Math.floor(rand() * (LOGICAL_H - 160)) + 80;
    const tee = { x: Math.max(40, Math.min(180, teeX)), y: teeY };
    const holeX = Math.floor(rand() * 100) + (LOGICAL_W - 140);
    const holeY = Math.floor(rand() * (LOGICAL_H - 160)) + 80;
    const hole = { x: Math.max(LOGICAL_W - 180, Math.min(LOGICAL_W - 40, holeX)), y: holeY, radius: 14 };

    // Step 1: Generate fairway shape per tier
    const { spine, p1, p2, shape } = generateFairwayShape(tier, tee, hole, rand);

    // Step 2: SDF thresholds with tighter fairway on hard
    const baseWf = 90 + Math.floor(rand() * 50); // 90-140
    let Wf = Math.min(140, baseWf + Math.floor(levelNum / 3) * 5);
    // Make hard fairway a bit tighter (15-25px smaller)
    if (tier === 'hard') {
      const tighten = 15 + Math.floor(rand() * 11); // 15-25
      Wf = Math.max(70, Wf - tighten);
    }
    const Wr = Wf + 60 + Math.floor(rand() * 40);
    const noiseSeed = seed + i * 7919 + levelNum * 101;
    const warpScale = 0.006 + rand() * 0.006;
    const warpStrength = 12 + Math.floor(rand() * 12);

    const terrain = {
      green: { x: hole.x, y: hole.y, r: 65 + Math.floor(rand() * 25) },
      teeBox: { x: tee.x, y: tee.y, r: 70 + Math.floor(rand() * 20) },
      fairwayPath: spine,
      widthFairway: Wf,
      widthRough: Wr,
      noiseSeed,
      warpScale,
      warpStrength,
      _p1: p1,
      _p2: p2,
      shape, // for debugging / classification
    };
    attachNoiseToTerrain(terrain);

    // Step 4: Generate treesOnFairway and waterOnFairway per tier (REQ-034 §2)
    // First, determine required counts
    let treesOnFairwayNeeded, waterOnFairwayNeeded;
    if (tier === 'easy') {
      treesOnFairwayNeeded = 1 + Math.floor(rand() * 2); // 1-2
      waterOnFairwayNeeded = 0;
    } else if (tier === 'medium') {
      treesOnFairwayNeeded = 2 + Math.floor(rand() * 2); // 2-3
      waterOnFairwayNeeded = 1;
    } else { // hard
      treesOnFairwayNeeded = 3 + Math.floor(rand() * 3); // 3-5
      waterOnFairwayNeeded = 1 + Math.floor(rand() * 3); // 1-3
    }

    // Generate fairway trees via sampling points where terrainZoneAt === 'fairway'
    const fairwayTrees = [];
    let attemptsTrees = 0;
    while (fairwayTrees.length < treesOnFairwayNeeded && attemptsTrees < treesOnFairwayNeeded * 80) {
      attemptsTrees++;
      // Sample a point along the spine with small perpendicular jitter inside fairway
      const tIdx = Math.floor(rand() * (spine.length - 1));
      const a = spine[tIdx];
      const b = spine[Math.min(spine.length - 1, tIdx + 1)];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const offset = (rand() - 0.5) * (Wf * 0.6); // inside fairway, not near edge
      const x = midX + nx * offset;
      const y = midY + ny * offset;
      // Check is inside fairway (warped)
      // Check is inside fairway (warped distance < Wf-8) — simplified check

      // Simpler: check distance to spine
      let minD = Infinity;
      for (let s = 0; s < spine.length - 1; s++) {
        const ax = spine[s].x, ay = spine[s].y, bx = spine[s+1].x, by = spine[s+1].y;
        const segDx = bx - ax, segDy = by - ay;
        const segLen2 = segDx*segDx+segDy*segDy;
        let t = ((x-ax)*segDx + (y-ay)*segDy)/segLen2;
        t = Math.max(0, Math.min(1,t));
        const projX = ax + t*segDx, projY = ay + t*segDy;
        const d = Math.hypot(x-projX, y-projY);
        if (d < minD) minD = d;
      }
      // Use warped check would be more accurate, but unwarped with margin should be safe
      if (minD > Wf - 8) continue;
      // Warped distance check for true fairway (with domain warping) — must be inside fairway
      const dWarped = warpedDist(x, y, spine, terrain._noise2D, terrain.warpScale, terrain.warpStrength);
      if (dWarped > Wf - 4) continue;
      // Check not in green/tee masks (use actual mask radii)
      const greenR = terrain.green.r;
      const teeR = terrain.teeBox.r;
      if (Math.hypot(x - hole.x, y - hole.y) < greenR + 10 || Math.hypot(x - tee.x, y - tee.y) < teeR + 10) continue;
      // REQ 04/08: fairway trees at least 1/3 distance from tee toward green
      const distTeeHole = Math.hypot(hole.x - tee.x, hole.y - tee.y);
      if (Math.hypot(x - tee.x, y - tee.y) < distTeeHole / 3) continue;
      const r = 18 + Math.floor(rand() * 18);
      // Check overlap with existing fairway trees
      let overlap = false;
      for (const t of fairwayTrees) {
        if (Math.hypot(x - t.x, y - t.y) < r + t.r + 6) { overlap = true; break; }
      }
      if (overlap) continue;
      // Check clearance from tee/hole masks (40 + r beyond mask edge)
      if (Math.hypot(x - tee.x, y - tee.y) < teeR + 40 + r || Math.hypot(x - hole.x, y - hole.y) < greenR + 40 + r) continue;
      // Also ensure warped is not inside green/tee after warping (redundant with above)
      fairwayTrees.push({ type: 'circle', x: Math.round(x), y: Math.round(y), r });
    }
    // Ensure we have required count, if not, force placement at spine points (must respect ≥1/3 rule)
    let fallbackAttempts = 0;
    while (fairwayTrees.length < treesOnFairwayNeeded && fallbackAttempts < 200) {
      fallbackAttempts++;
      // Bias toward latter 2/3 of spine to satisfy ≥1/3 distance
      const idx = Math.floor((0.35 + rand() * 0.65) * (spine.length - 1));
      const pt = spine[idx];
      const r = 20 + Math.floor(rand() * 10);
      // Small offset inside fairway
      const offX = (rand() - 0.5) * 20;
      const offY = (rand() - 0.5) * 20;
      const x = Math.round(pt.x + offX);
      const y = Math.round(pt.y + offY);
      const greenR2 = terrain.green.r;
      const teeR2 = terrain.teeBox.r;
      if (Math.hypot(x - hole.x, y - hole.y) < greenR2 + 10 || Math.hypot(x - tee.x, y - tee.y) < teeR2 + 10) continue;
      const distTeeHoleFB = Math.hypot(hole.x - tee.x, hole.y - tee.y);
      if (Math.hypot(x - tee.x, y - tee.y) < distTeeHoleFB / 3) continue;
      if (Math.hypot(x - tee.x, y - tee.y) < teeR2 + 40 + r || Math.hypot(x - hole.x, y - hole.y) < greenR2 + 40 + r) continue;
      // Ensure warped is still inside fairway
      const dW = warpedDist(x, y, spine, terrain._noise2D, terrain.warpScale, terrain.warpStrength);
      if (dW > Wf - 4) continue;
      fairwayTrees.push({ type: 'circle', x, y, r });
      if (fairwayTrees.length >= treesOnFairwayNeeded) break;
    }

    // Generate water on fairway per tier
    const fairwayWater = [];
    for (let w = 0; w < waterOnFairwayNeeded; w++) {
      let attemptsW = 0;
      while (attemptsW < 60) {
        attemptsW++;
        const tIdx = Math.floor(rand() * (spine.length - 1));
        const a = spine[tIdx];
        const b = spine[Math.min(spine.length - 1, tIdx + 1)];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const offset = (rand() - 0.5) * (Wf * 0.5); // inside fairway
        const x = midX + nx * offset;
        const y = midY + ny * offset;
        // Check is inside fairway (unwarped distance < Wf-10)
        let minD = Infinity;
        for (let s = 0; s < spine.length - 1; s++) {
          const ax = spine[s].x, ay = spine[s].y, bx = spine[s+1].x, by = spine[s+1].y;
          const segDx = bx - ax, segDy = by - ay;
          const segLen2 = segDx*segDx+segDy*segDy;
          let t = ((x-ax)*segDx + (y-ay)*segDy)/segLen2;
          t = Math.max(0, Math.min(1,t));
          const projX = ax + t*segDx, projY = ay + t*segDy;
          const d = Math.hypot(x-projX, y-projY);
          if (d < minD) minD = d;
        }
        if (minD > Wf - 12) continue;
        // Do not overlap tee/green masks — keep water entirely outside masks (green/tee + water radius + buffer)
        // Early coarse check before r known
        if (Math.hypot(x - hole.x, y - hole.y) < 80 || Math.hypot(x - tee.x, y - tee.y) < 80) continue;
        const area = 2000 + Math.floor(rand() * 4000); // bigger water (was 800-3000)
        let r = Math.sqrt(area / Math.PI);
        r = Math.max(28, Math.min(48, r)); // bigger (was 18-32)
        // Strict mask overlap: water circle must not intersect green/tee circles
        if (Math.hypot(x - hole.x, y - hole.y) < terrain.green.r + r + 10) continue;
        if (Math.hypot(x - tee.x, y - tee.y) < terrain.teeBox.r + r + 10) continue;
        // Check not overlapping existing water or fairway trees too much
        let overlap = false;
        for (const ex of fairwayWater) {
          if (Math.hypot(x - ex.x, y - ex.y) < r + ex.r + 20) { overlap = true; break; }
        }
        for (const tr of fairwayTrees) {
          if (Math.hypot(x - tr.x, y - tr.y) < r + tr.r + 10) { overlap = true; break; }
        }
        if (overlap) continue;
        fairwayWater.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), w: Math.round(r*2), h: Math.round(r*2) });
        break;
      }
    }

    // Additional water/trees for aesthetics near fairway edges (optional, not counted for difficulty)
    // For fairway water, we already have required; for extra water near edges, we could add but not needed for difficulty
    // For now, extra water is none; extra trees in rough/OB will be added after

    // Generate extra trees on rough border between rough and OB for bounce (not counted toward difficulty)
    const extraCount = Math.max(0, 8 - fairwayTrees.length + Math.floor(rand() * 4)); // ensure at least 8 total if fairwayTrees is 1-2; extras are rough-border only
    // Use rough-border generator per updated 08 Step 4: trees on rough at W_rough border, spread around perimeter
    const roughBorderTrees = generateRoughBorderTrees(extraCount, spine, Wf, Wr, tee, hole, fairwayWater.concat(fairwayTrees), rand, terrain, LOGICAL_W, LOGICAL_H);
    // Combine: fairway trees (difficulty, ≥1/3 from tee) + rough-border trees (bounce, on rough at OB border)
    let obstacles = [...fairwayTrees, ...roughBorderTrees];
    // Also add any fairway water already in fairwayWater
    let waterHazards = [...fairwayWater];
    // For medium/hard, fairwayWater already has required 1 or 1-3; for easy, none
    // For extra water near edges (aesthetic) we could add via generateWaterClusters, but per difficulty we already satisfied required; extra near-edge water is optional and not counted
    // To keep validation simple, we will not add extra near-edge water beyond the on-fairway required, unless we want to add 0-1 extra near edge for variety
    // For now, keep as is

    // Field components per difficulty (REQ-034 §3) with flipped/extra sources/sinks and tighter fairway
    let sources = 1, sinks = 1, doublets = 0, vortexes = 0;
    let flippedHard = false;
    let extraMediumSink = false;
    if (tier === 'easy') {
      doublets = 1;
      vortexes = 0;
      // No extra sources/sinks for easy
    } else if (tier === 'medium') {
      doublets = 2 + Math.floor(rand() * 2); // 2-3
      vortexes = 1;
      // Medium MAY add an extra sink on a free edge (60% chance)
      extraMediumSink = rand() < 0.6;
      if (extraMediumSink) sinks = 2;
    } else { // hard
      doublets = 3 + Math.floor(rand() * 2); // 3-4
      vortexes = 1 + Math.floor(rand() * 2); // 1-2
      // Hard MAY flip sink/source (50% chance) and always add extra source/sink on free edges
      flippedHard = rand() < 0.5;
      sources = 2;
      sinks = 2;
    }
    // Strength per old progression
    let strength;
    if (levelNum <= 6) strength = 80 + (levelNum - 1) * 5;
    else {
      strength = 105 + Math.floor((levelNum - 6) / 2) * 2 + (levelNum % 2 === 1 && levelNum > 6 ? 2 : 0);
      if (strength > 125) strength = 125;
    }

    // Create explicit field positions: source near tee, sink near green, doublets in trees
    // We will generate these positions and pass to createField via options
    // For now, we store them as arrays to be used when creating field; but createField is called in loadLevel, not here
    // So we need to store the positions in the level's field meta for later use
    // Source/sink placement with flipped and extra per tier (REQ-034)
    let sourcePositions = [];
    let sinkPositions = [];
    if (tier === 'hard' && flippedHard) {
      // Flipped: sink near tee, source near green
      const sinkNearTee = edgePointClosestTo(tee, LOGICAL_W, LOGICAL_H, rand);
      const sourceNearGreen = edgePointClosestTo(hole, LOGICAL_W, LOGICAL_H, rand);
      // Find free edges (the two edges not containing these points)
      const getEdge = (pos) => {
        if (pos.x === 0) return 'left';
        if (pos.x === LOGICAL_W) return 'right';
        if (pos.y === 0) return 'top';
        return 'bottom';
      };
      const usedEdges = new Set([getEdge(sinkNearTee), getEdge(sourceNearGreen)]);
      const allEdges = ['left','right','top','bottom'];
      const freeEdges = allEdges.filter(e => !usedEdges.has(e));
      // If only one free edge due to same edge (unlikely), pick remaining two
      let free1 = freeEdges[0] || 'top';
      let free2 = freeEdges[1] || 'bottom';
      if (freeEdges.length < 2) {
        // Pick any two not used
        const remaining = allEdges.filter(e => e !== getEdge(sinkNearTee) && e !== getEdge(sourceNearGreen));
        free1 = remaining[0] || 'top';
        free2 = remaining[1] || 'bottom';
      }
      const extraSource = sampleOnEdgeForFree(free1, rand, LOGICAL_W, LOGICAL_H);
      const extraSink = sampleOnEdgeForFree(free2, rand, LOGICAL_W, LOGICAL_H);
      // Ensure extra source/sink are on free edges (not near tee/hole)
      sourcePositions = [sourceNearGreen, extraSource];
      sinkPositions = [sinkNearTee, extraSink];
    } else if (tier === 'hard') {
      // Hard not flipped: source near tee, sink near green, plus extra source/sink on free edges
      const sourceNearTee = edgePointClosestTo(tee, LOGICAL_W, LOGICAL_H, rand);
      const sinkNearGreen = edgePointClosestTo(hole, LOGICAL_W, LOGICAL_H, rand);
      const getEdge = (pos) => {
        if (pos.x === 0) return 'left';
        if (pos.x === LOGICAL_W) return 'right';
        if (pos.y === 0) return 'top';
        return 'bottom';
      };
      const usedEdges = new Set([getEdge(sourceNearTee), getEdge(sinkNearGreen)]);
      const allEdges = ['left','right','top','bottom'];
      const freeEdges = allEdges.filter(e => !usedEdges.has(e));
      let free1 = freeEdges[0] || 'top';
      let free2 = freeEdges[1] || 'bottom';
      if (freeEdges.length < 2) {
        const remaining = allEdges.filter(e => e !== getEdge(sourceNearTee) && e !== getEdge(sinkNearGreen));
        free1 = remaining[0] || 'top';
        free2 = remaining[1] || 'bottom';
      }
      // Randomly assign which free edge gets source vs sink
      const extraSourceEdge = rand() < 0.5 ? free1 : free2;
      const extraSinkEdge = extraSourceEdge === free1 ? free2 : free1;
      const extraSource = sampleOnEdgeForFree(extraSourceEdge, rand, LOGICAL_W, LOGICAL_H);
      const extraSink = sampleOnEdgeForFree(extraSinkEdge, rand, LOGICAL_W, LOGICAL_H);
      sourcePositions = [sourceNearTee, extraSource];
      sinkPositions = [sinkNearGreen, extraSink];
    } else if (tier === 'medium' && extraMediumSink) {
      // Medium with extra sink: both sinks on free edges NOT closest to green (REQ-034/REQ-003 updated)
      const sourceNearTee = edgePointClosestTo(tee, LOGICAL_W, LOGICAL_H, rand);
      const greenClosestEdge = getClosestEdgeName(hole, LOGICAL_W, LOGICAL_H);
      const sourceEdge = getEdgeName(sourceNearTee, LOGICAL_W, LOGICAL_H);
      const allEdges = ['left','right','top','bottom'];
      const freeEdges = allEdges.filter(e => e !== greenClosestEdge && e !== sourceEdge);
      // Need 2 distinct sinks on free edges not near green
      let sinkEdges;
      if (freeEdges.length >= 2) {
        // shuffle freeEdges and take first 2
        const shuffled = [...freeEdges];
        for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
        sinkEdges = shuffled.slice(0, 2);
      } else if (freeEdges.length === 1) {
        sinkEdges = [freeEdges[0], freeEdges[0]];
      } else {
        sinkEdges = ['top','bottom'];
      }
      const sink1 = sampleOnEdgeForFree(sinkEdges[0], rand, LOGICAL_W, LOGICAL_H);
      const sink2 = sampleOnEdgeForFree(sinkEdges[1], rand, LOGICAL_W, LOGICAL_H);
      sourcePositions = [sourceNearTee];
      sinkPositions = [sink1, sink2];
    } else {
      // Easy or medium without extra: single sink on free edge NOT closest to green (REQ-034/REQ-003/REQ-010)
      const sourceNearTee = edgePointClosestTo(tee, LOGICAL_W, LOGICAL_H, rand);
      const greenClosestEdge = getClosestEdgeName(hole, LOGICAL_W, LOGICAL_H);
      const sourceEdge = getEdgeName(sourceNearTee, LOGICAL_W, LOGICAL_H);
      const allEdges = ['left','right','top','bottom'];
      const freeEdges = allEdges.filter(e => e !== greenClosestEdge && e !== sourceEdge);
      const sinkEdge = freeEdges.length ? freeEdges[Math.floor(rand() * freeEdges.length)] : (greenClosestEdge === 'right' ? 'top' : 'left');
      const sinkOnFree = sampleOnEdgeForFree(sinkEdge, rand, LOGICAL_W, LOGICAL_H);
      sourcePositions = [sourceNearTee];
      sinkPositions = [sinkOnFree];
    }
    // Generate doublet positions: first doublet(s) in middle of fairway trees
    const doubletPositions = [];
    // Sort fairway trees by distance to center for picking most central
    const sortedTrees = [...fairwayTrees].sort((a,b) => {
      const da = Math.hypot(a.x - (tee.x+hole.x)/2, a.y - (tee.y+hole.y)/2);
      const db = Math.hypot(b.x - (tee.x+hole.x)/2, b.y - (tee.y+hole.y)/2);
      return da - db;
    });
    for (let d = 0; d < doublets; d++) {
      if (d < sortedTrees.length && sortedTrees[d]) {
        // Place doublet in middle of tree (applies to all difficulties per spec)
        doubletPositions.push({ x: sortedTrees[d].x, y: sortedTrees[d].y, mu: 1.2 + rand() * 1.0, theta: rand() * Math.PI * 2 });
      } else {
        // Place doublet somewhere in fairway (random fairway point)
        let placed = false;
        for (let att = 0; att < 40; att++) {
          const tIdx = Math.floor(rand() * (spine.length - 1));
          const a = spine[tIdx];
          const b = spine[Math.min(spine.length - 1, tIdx + 1)];
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const offset = (rand() - 0.5) * (Wf * 0.5);
          const x = midX + nx * offset;
          const y = midY + ny * offset;
          // Check is fairway
          let minD = Infinity;
          for (let s = 0; s < spine.length - 1; s++) {
            const ax = spine[s].x, ay = spine[s].y, bx = spine[s+1].x, by = spine[s+1].y;
            const segDx = bx - ax, segDy = by - ay;
            const segLen2 = segDx*segDx+segDy*segDy;
            let t = ((x-ax)*segDx + (y-ay)*segDy)/segLen2;
            t = Math.max(0, Math.min(1,t));
            const projX = ax + t*segDx, projY = ay + t*segDy;
            const d = Math.hypot(x-projX, y-projY);
            if (d < minD) minD = d;
          }
          if (minD <= Wf - 8 && Math.hypot(x - hole.x, y - hole.y) > 70 && Math.hypot(x - tee.x, y - tee.y) > 70) {
            doubletPositions.push({ x: Math.round(x), y: Math.round(y), mu: 1.2 + rand() * 1.0, theta: rand() * Math.PI * 2 });
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Fallback to random interior fairway point near center
          const mid = spine[Math.floor(spine.length/2)];
          doubletPositions.push({ x: mid.x + (rand()-0.5)*20, y: mid.y + (rand()-0.5)*20, mu: 1.5, theta: rand()*Math.PI*2 });
        }
      }
    }
    const vortexPositions = [];
    for (let v = 0; v < vortexes; v++) {
      // Place vortex inside fairway or rough (d <= W_rough)
      let placed = false;
      for (let att = 0; att < 40; att++) {
        const tIdx = Math.floor(rand() * (spine.length - 1));
        const a = spine[tIdx];
        const b = spine[Math.min(spine.length - 1, tIdx + 1)];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const offset = (rand() - 0.5) * (Wr * 0.8);
        const x = midX + nx * offset;
        const y = midY + ny * offset;
        let minD = Infinity;
        for (let s = 0; s < spine.length - 1; s++) {
          const ax = spine[s].x, ay = spine[s].y, bx = spine[s+1].x, by = spine[s+1].y;
          const segDx = bx - ax, segDy = by - ay;
          const segLen2 = segDx*segDx+segDy*segDy;
          let t = ((x-ax)*segDx + (y-ay)*segDy)/segLen2;
          t = Math.max(0, Math.min(1,t));
          const projX = ax + t*segDx, projY = ay + t*segDy;
          const d = Math.hypot(x-projX, y-projY);
          if (d < minD) minD = d;
        }
        if (minD <= Wr - 10 && minD >= 20 && x >= 20 && x <= LOGICAL_W-20 && y >= 20 && y <= LOGICAL_H-20) {
          let gamma = 1.4 + rand() * 1.2;
          if (rand() < 0.5) gamma = -gamma;
          vortexPositions.push({ x: Math.round(x), y: Math.round(y), g: gamma });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const mid = spine[Math.floor(spine.length/2)];
        let gamma = 1.4 + rand() * 1.2;
        if (rand() < 0.5) gamma = -gamma;
        vortexPositions.push({ x: mid.x + (rand()-0.5)*30, y: mid.y + (rand()-0.5)*30, g: gamma });
      }
    }

    const fieldSeed = seed + i * 9973 + levelNum * 101;
    // Store explicit positions for vectorField creation
    const fieldMeta = {
      cols: 32, rows: 18, strength, seed: fieldSeed,
      sources, sinks, doublets, vortexes,
      _sourcePositions: sourcePositions,
      _sinkPositions: sinkPositions,
      _doubletPositions: doubletPositions,
      _vortexPositions: vortexPositions,
    };

    // Validation with isHoleSolvable
    let attempts = 0;
    let solvable = isHoleSolvable(tee, hole, spine, Wf, waterHazards, obstacles, Wr);
    let currentWf = Wf;
    let currentWr = Wr;
    while (!solvable && attempts < 15) {
      attempts++;
      if (waterHazards.length > 0) {
        waterHazards.pop();
      } else {
        currentWf += 15;
        currentWr += 15;
        terrain.widthFairway = currentWf;
        terrain.widthRough = currentWr;
        obstacles = generateTreesPoisson(0, spine, currentWf, currentWr, tee, hole, waterHazards, rand, LOGICAL_W, LOGICAL_H);
        // Regenerate fairway trees? Keep original fairwayTrees
        obstacles = [...fairwayTrees, ...obstacles];
      }
      solvable = isHoleSolvable(tee, hole, spine, currentWf, waterHazards, obstacles, currentWr);
    }
    terrain.widthFairway = currentWf;
    terrain.widthRough = currentWr;

    // Calculate difficulty per REQ-034
    const shapeTierMap = { I: 0, L: 1, V: 1, U: 1, S: 2, Z: 2 };
    const shapeTier = shapeTierMap[shape] ?? 0;
    const fieldComponents = sources + sinks + doubletPositions.length + vortexPositions.length;
    // Field tier based on doublets+vortexes to avoid extra source/sink pushing medium to hard
    const interiorCount = doubletPositions.length + vortexPositions.length;
    let fieldTier = 0;
    if (interiorCount <= 1) fieldTier = 0; // easy: 1 doublet
    else if (interiorCount <= 4) fieldTier = 1; // medium: 2-3 doublets+1 vortex =3-4
    else fieldTier = 2; // hard: 3-4 doublets+1-2 vortex =4-6
    const treesOnFairway = fairwayTrees.length; // normative per tier
    const waterOnFairway = fairwayWater.length;
    let treeTier = 0;
    if (treesOnFairway <= 2 && waterOnFairway === 0) treeTier = 0;
    else if (treesOnFairway <= 3) treeTier = 1;
    else treeTier = 2;
    let waterTier = 0;
    if (waterOnFairway === 0) waterTier = 0;
    else if (waterOnFairway === 1) waterTier = 1;
    else waterTier = 2;
    const calculatedTier = (shapeTier === 2 || fieldTier === 2 || treeTier === 2 || waterTier === 2) ? 'hard' : (shapeTier === 1 || fieldTier === 1 || treeTier === 1 || waterTier === 1) ? 'medium' : 'easy';
    // But per generation we already picked tier, so ensure it matches; if not, force tier to picked tier
    const finalTier = calculatedTier; // could also be the picked tier (tier), but use calculated for validation
    const score = shapeTier + fieldTier + treeTier + waterTier;

    const levelDifficulty = {
      shape,
      shapeTier,
      fieldComponents,
      treesOnFairway,
      waterOnFairway,
      tier: calculatedTier, // should equal picked tier (tier); for 1-6 easy etc, it will
      score,
      _pickedTier: tier, // keep picked tier for debugging
    };

    levels.push({
      id: `hole-${levelNum}`,
      name: `Hole ${levelNum}`,
      canvas: { width: LOGICAL_W, height: LOGICAL_H },
      tee,
      hole,
      obstacles, // circular trees (fairway + rough/OB)
      waterHazards,
      terrain,
      field: fieldMeta,
      difficulty: levelDifficulty,
      treesOnFairwayCount: treesOnFairway,
      waterOnFairwayCount: waterOnFairway,
    });
  }
  return levels;
}

export function generateLevels(seed = 42, count = 18, options = {}) {
  const lvls = _generateLevelsInternal(seed, count, options);
  LEVELS.length = 0;
  for (const l of lvls) LEVELS.push(l);
  Object.assign(LEVEL, LEVELS[0]);
  LEVEL.canvas = LEVELS[0].canvas;
  LEVEL.tee = LEVELS[0].tee;
  LEVEL.hole = LEVELS[0].hole;
  LEVEL.obstacles = LEVELS[0].obstacles;
  LEVEL.waterHazards = LEVELS[0].waterHazards;
  LEVEL.terrain = LEVELS[0].terrain;
  LEVEL.field = LEVELS[0].field;
  LEVEL.difficulty = LEVELS[0].difficulty;
  LEVEL.treesOnFairwayCount = LEVELS[0].treesOnFairwayCount;
  LEVEL.waterOnFairwayCount = LEVELS[0].waterOnFairwayCount;
  LEVEL.id = LEVELS[0].id;
  LEVEL.name = LEVELS[0].name;
  return LEVELS;
}

export let LEVELS = _generateLevelsInternal(42, 18);
export let LEVEL = LEVELS[0];
