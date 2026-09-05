import { terrainZoneAt, isInWater } from "./terrain.js";

export function checkObstacleCollision(ballPos, ballRadius, obstacles) {
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
