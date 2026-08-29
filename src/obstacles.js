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
