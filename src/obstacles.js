import { terrainZoneAt, isInWater } from "./terrain.js";

// --- Ground-plane tree collision (gameplay truth) ---
// Physics stays 2D: test the ground shadow (ball.pos) against the tree base
// circle. Height gating happens at the call site (main.js skips this when
// ball.z > TREE_CLEAR_Z) so high balls fly over the whole tree.
// Returns { obs, nx, ny, sx, sy, sr } in GROUND space, or null.
export function checkGroundTreeCollision(ballPos, ballRadius, obstacles) {
  for (const obs of obstacles) {
    if (obs.type === "rect") {
      const qx = Math.max(obs.x, Math.min(ballPos.x, obs.x + obs.w));
      const qy = Math.max(obs.y, Math.min(ballPos.y, obs.y + obs.h));
      const dx = ballPos.x - qx, dy = ballPos.y - qy;
      if (dx * dx + dy * dy < ballRadius * ballRadius) {
        const n = rectContactNormal(ballPos.x, ballPos.y, obs);
        return { obs, ...n, sr: 0, kind: "rect" };
      }
    } else if (obs.type === "circle") {
      const dx = ballPos.x - obs.x, dy = ballPos.y - obs.y;
      const radSum = ballRadius + obs.r;
      if (dx * dx + dy * dy < radSum * radSum) {
        const len = Math.hypot(dx, dy) || 1;
        return { obs, nx: dx / len, ny: dy / len, sx: obs.x, sy: obs.y, sr: obs.r, kind: "canopy" };
      }
    }
  }
  return null;
}

// Ground-plane treasure pickup: shadow circle vs chest circle. Call site
// skips when ball.z > TREASURE_CLEAR_Z so high flight passes over.
export function checkGroundTreasureHit(ballPos, ballRadius, treasure) {
  if (!treasure || treasure.isCollected) return false;
  const dx = ballPos.x - treasure.x;
  const dy = ballPos.y - treasure.y;
  const rad = (treasure.radius || 12) + ballRadius;
  return dx * dx + dy * dy < rad * rad;
}

function rectContactNormal(cx, cy, rc) {
  const qx = Math.max(rc.x, Math.min(cx, rc.x + rc.w));
  const qy = Math.max(rc.y, Math.min(cy, rc.y + rc.h));
  let nx = cx - qx, ny = cy - qy;
  let len = Math.hypot(nx, ny);
  if (len === 0) { nx = 0; ny = -1; len = 1; }
  return { sx: qx, sy: qy, nx: nx / len, ny: ny / len };
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
