import { terrainZoneAt, isInWater } from "./terrain.js";
import { drawnBallCircle } from "./physics.js";

export function checkObstacleCollision(ballPos, ballRadius, obstacles) {
  // Legacy ground-projection test (shadow space). Kept for compat; gameplay
  // tree bounce uses checkDrawnObstacleCollision() below (drawn-vs-drawn).
  for (const obs of obstacles) {
    if (obs.type === "rect") {
      // Closest point on AABB to circle center
      const closestX = Math.max(obs.x, Math.min(ballPos.x, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(ballPos.y, obs.y + obs.h));
      const dx = ballPos.x - closestX;
      const dy = ballPos.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < ballRadius * ballRadius) {
        return obs;
      }
    } else if (obs.type === "circle") {
      const dx = ballPos.x - obs.x;
      const dy = ballPos.y - obs.y;
      const distSq = dx * dx + dy * dy;
      const radSum = ballRadius + obs.r;
      if (distSq < radSum * radSum) {
        return obs;
      }
    }
  }
  return null;
}

// --- Drawn-vs-drawn tree collision (bounce when visuals touch, any height) ---
// Shape math mirrors render.js drawObstacles: canopy circle + trunk rect.
export function treeDrawnShapes(obs) {
  if (obs.type === "rect") {
    return { rect: { x: obs.x, y: obs.y, w: obs.w, h: obs.h } };
  }
  const x = obs.x, y = obs.y, r = obs.r;
  const trunkW = Math.max(8, Math.min(14, r * 0.38));
  const trunkH = Math.max(10, r * 0.55);
  return {
    canopy: { x, y: y - 1, r: Math.max(1, r - 1.5) },
    trunk: { x: x - trunkW / 2, y: y + r - trunkH + 2, w: trunkW, h: trunkH },
  };
}

function circleHitsRect(cx, cy, cr, rc) {
  const qx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
  const qy = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
  const dx = cx - qx, dy = cy - qy;
  return dx * dx + dy * dy < cr * cr;
}

function rectContactNormal(cx, cy, rc) {
  const qx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
  const qy = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
  let nx = cx - qx, ny = cy - qy;
  let len = Math.hypot(nx, ny);
  if (len === 0) { nx = 0; ny = -1; len = 1; }
  return { sx: qx, sy: qy, nx: nx / len, ny: ny / len };
}

// Bounce test in drawn space: the ball AS DRAWN (lifted by z, grown radius)
// against each tree AS DRAWN (canopy circle + trunk rect). At any height —
// no airborne gating, so the bounce always matches the visuals.
// Returns { obs, nx, ny, sx, sy, sr } (contact normal + shape anchor in drawn
// space; sr is the shape radius, 0 when the anchor is already the closest
// surface point) or null.
export function checkDrawnObstacleCollision(ball, obstacles) {
  const c = drawnBallCircle(ball);
  for (const obs of obstacles) {
    if (obs.type === "rect") {
      if (circleHitsRect(c.x, c.y, c.r, obs)) {
        const n = rectContactNormal(c.x, c.y, obs);
        return { obs, ...n, sr: 0, kind: "rect" };
      }
    } else if (obs.type === "circle") {
      const s = treeDrawnShapes(obs);
      const dx = c.x - s.canopy.x, dy = c.y - s.canopy.y;
      const radSum = c.r + s.canopy.r;
      if (dx * dx + dy * dy < radSum * radSum) {
        const len = Math.hypot(dx, dy) || 1;
        return { obs, nx: dx / len, ny: dy / len, sx: s.canopy.x, sy: s.canopy.y, sr: s.canopy.r, kind: "canopy" };
      }
      if (circleHitsRect(c.x, c.y, c.r, s.trunk)) {
        const n = rectContactNormal(c.x, c.y, s.trunk);
        return { obs, ...n, sr: 0, kind: "trunk" };
      }
    }
  }
  return null;
}

export function isOutOfBounds(pos, radius, canvasW, canvasH) {
  // Edge is fatal per REQ-005/REQ-008: touching edge counts as death
  return (
    pos.x - radius < 0 ||
    pos.x + radius > canvasW ||
    pos.y - radius < 0 ||
    pos.y + radius > canvasH
  );
}

// New helpers per REQ-008 & REQ-010 pipeline: water and OB terrain are fatal
export function isInWaterHazard(pos, waterHazards) {
  return isInWater(pos.x, pos.y, waterHazards);
}

export function isInOBTerrain(pos, level) {
  if (!level || !level.terrain) return false;
  const zone = terrainZoneAt(pos.x, pos.y, level);
  return zone === 'ob';
}

export function checkTerrainCollision(ballPos, ballRadius, level) {
  // Check if ball center is in OB or water (fatal terrain) — use ballPos center
  // For leniency, check center point; edge already handled by isOutOfBounds
  if (!level) return null;
  const zone = terrainZoneAt(ballPos.x, ballPos.y, level);
  if (zone === 'ob' || zone === 'water') {
    return { type: 'terrain', zone };
  }
  if (isInWater(ballPos.x, ballPos.y, level.waterHazards)) {
    return { type: 'water' };
  }
  return null;
}

export function checkTreasureHit(ballPos, ballRadius, treasure) {
  // Legacy ground-projection test (shadow space). Kept for compat; gameplay
  // pickup uses checkDrawnTreasureHit() below (drawn-vs-drawn).
  if (!treasure || treasure.isCollected) return false;
  const dx = ballPos.x - treasure.x;
  const dy = ballPos.y - treasure.y;
  const rad = (treasure.radius || 12) + ballRadius;
  return dx*dx + dy*dy < rad*rad;
}

// Pickup test in drawn space: the ball AS DRAWN (lifted by z, grown radius)
// against the chest AS DRAWN (circle at treasure.x/y with treasure.radius,
// covering the chest body + lid). Low bounce arcs still pick up; only high
// flight passes over.
export function checkDrawnTreasureHit(ball, treasure) {
  if (!treasure || treasure.isCollected) return false;
  const c = drawnBallCircle(ball);
  const dx = c.x - treasure.x;
  const dy = c.y - treasure.y;
  const rad = (treasure.radius || 12) + c.r;
  return dx*dx + dy*dy < rad*rad;
}
export function collectTreasure(treasure) {
  if (treasure && !treasure.isCollected) {
    treasure.isCollected = true;
    return true;
  }
  return false;
}

// Backward compat: expose helpers for physics tick
export function checkWaterCollision(ballPos, ballRadius, waterHazards) {
  // For water, check if ball center is inside water (or edge touches water rect/circle)
  if (!waterHazards || !waterHazards.length) return null;
  for (const w of waterHazards) {
    if (w.r !== undefined) {
      const dx = ballPos.x - w.x;
      const dy = ballPos.y - w.y;
      if (dx * dx + dy * dy < (w.r + ballRadius) * (w.r + ballRadius)) return w;
    } else if (w.w !== undefined) {
      const closestX = Math.max(w.x, Math.min(ballPos.x, w.x + w.w));
      const closestY = Math.max(w.y, Math.min(ballPos.y, w.y + w.h));
      const dx = ballPos.x - closestX;
      const dy = ballPos.y - closestY;
      if (dx * dx + dy * dy < ballRadius * ballRadius) return w;
    }
  }
  return null;
}
