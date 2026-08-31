function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateObstacles(count, tee, hole, rand, width = 900, height = 600) {
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
    // Stricter clearance for squares: 60px from tee/hole, 40px gap between rects
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
        const gapX = Math.max(0, Math.max(other.x - (obs.x + obs.w), obs.x - (other.x + other.w)));
        const gapY = Math.max(0, Math.max(other.y - (obs.y + obs.h), obs.y - (other.y + other.h)));
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

function _generateLevelsInternal(seed = 42, count = 18) {
  const rand = mulberry32(seed);
  const levels = [];
  for (let i = 0; i < count; i++) {
    const levelNum = i + 1;
    const teeX = Math.floor(rand() * 80) + 40;
    const teeY = Math.floor(rand() * 440) + 80;
    const tee = { x: Math.max(40, Math.min(140, teeX)), y: teeY };
    const holeX = Math.floor(rand() * 80) + 760;
    const holeY = Math.floor(rand() * 440) + 80;
    const hole = { x: Math.max(760, Math.min(860, holeX)), y: holeY, radius: 14 };

    let sources = 1, sinks = 1, doublets = 0, vortexes = 0;
    let obsCount = 0;
    let strength;
    strength = 125;
    if (levelNum === 1) {
      sources = 1; sinks = 1; doublets = 0; vortexes = 0; obsCount = 0;
    } else if (levelNum === 2) {
      sources = 1; sinks = 1; doublets = 0; vortexes = 1; obsCount = 1;
    } else if (levelNum === 3) {
      sources = 1; sinks = 1; doublets = 0; vortexes = 1; obsCount = 2;
    } else if (levelNum === 4) {
      sources = 1; sinks = 1; doublets = 0; vortexes = 1; obsCount = 4;
    } else if (levelNum === 5) {
      sources = 1; sinks = 1; doublets = 1; vortexes = 1; obsCount = 4;
    } else if (levelNum === 6) {
      sources = 1; sinks = 1; doublets = 1; vortexes = 1; obsCount = 6;
    } else if (levelNum === 7) {
      sources = 2; sinks = 1; doublets = 1; vortexes = 1; obsCount = 6;
    } else if (levelNum === 8) {
      sources = 2; sinks = 2; doublets = 1; vortexes = 1; obsCount = 8;
    } else if (levelNum === 9) {
      sources = 2; sinks = 2; doublets = 1; vortexes = 2; obsCount = 8;
    } else if (levelNum === 10) {
      sources = 2; sinks = 2; doublets = 1; vortexes = 2; obsCount = 10;
    } else if (levelNum === 11) {
      sources = 2; sinks = 2; doublets = 2; vortexes = 2; obsCount = 10;
    } else if (levelNum === 12) {
      sources = 2; sinks = 2; doublets = 2; vortexes = 2; obsCount = 12;
    } else if (levelNum === 13) {
      sources = 3; sinks = 2; doublets = 2; vortexes = 2; obsCount = 12;
    } else if (levelNum === 14) {
      sources = 3; sinks = 3; doublets = 2; vortexes = 2; obsCount = 12;
    } else if (levelNum === 15) {
      sources = 3; sinks = 3; doublets = 2; vortexes = 3; obsCount = 12;
    } else if (levelNum === 16) {
      sources = 3; sinks = 3; doublets = 3; vortexes = 3; obsCount = 12;
    } else if (levelNum === 17) {
      sources = 4; sinks = 3; doublets = 3; vortexes = 3; obsCount = 12;
    } else if (levelNum >= 18) {
      sources = 4; sinks = 4; doublets = 3; vortexes = 3; obsCount = 12;
    }
    obsCount = Math.min(12, obsCount);
    const fieldSeed = seed + i * 9973 + levelNum * 101;
    const obstacles = generateObstacles(obsCount, tee, hole, rand, 900, 600);
    levels.push({
      id: `hole-${levelNum}`,
      name: `Hole ${levelNum}`,
      canvas: { width: 900, height: 600 },
      tee,
      hole,
      obstacles,
      field: { cols: 20, rows: 15, strength, seed: fieldSeed, sources, sinks, doublets, vortexes }
    });
  }
  return levels;
}

export function generateLevels(seed = 42, count = 18) {
  const lvls = _generateLevelsInternal(seed, count);
  LEVELS.length = 0;
  for (const l of lvls) LEVELS.push(l);
  Object.assign(LEVEL, LEVELS[0]);
  LEVEL.canvas = LEVELS[0].canvas;
  LEVEL.tee = LEVELS[0].tee;
  LEVEL.hole = LEVELS[0].hole;
  LEVEL.obstacles = LEVELS[0].obstacles;
  LEVEL.field = LEVELS[0].field;
  LEVEL.id = LEVELS[0].id;
  LEVEL.name = LEVELS[0].name;
  return LEVELS;
}

export let LEVELS = _generateLevelsInternal(42, 18);
export let LEVEL = LEVELS[0];
