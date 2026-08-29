// Tunable constants at top per REQ-005
export const BALL_RADIUS = 6;
export const FRICTION = 1.0;
export const STOP_THRESHOLD = 5; // px/s
export const STOP_TIME = 0.4; // seconds
export const BOUNCE_DAMPING = 0.7;

export const MAX_CHARGE_TIME = 1.5; // seconds
export const MAX_POWER = 600; // px/s
export const MIN_POWER = 50;

export let ball = {
  pos: { x: 80, y: 300 },
  vel: { x: 0, y: 0 },
  radius: BALL_RADIUS,
  isMoving: false
};

let stopTimer = 0;

export function createBall(tee) {
  ball = {
    pos: { x: tee.x, y: tee.y },
    vel: { x: 0, y: 0 },
    radius: BALL_RADIUS,
    isMoving: false
  };
  stopTimer = 0;
  return ball;
}

export function launchBall(angle, power) {
  ball.vel.x = Math.cos(angle) * power;
  ball.vel.y = Math.sin(angle) * power;
  ball.isMoving = true;
  stopTimer = 0;
}

export function resetBall(tee) {
  ball.pos.x = tee.x;
  ball.pos.y = tee.y;
  ball.vel.x = 0;
  ball.vel.y = 0;
  ball.isMoving = false;
  stopTimer = 0;
}

export function updateBall(dt, getWindAt, windStrength, canvasW, canvasH) {
  if (!ball.isMoving) return { status: "idle" };

  // Apply wind
  const wind = getWindAt(ball.pos.x, ball.pos.y);
  ball.vel.x += wind.x * windStrength * dt;
  ball.vel.y += wind.y * windStrength * dt;

  // Friction
  const frictionFactor = 1 - FRICTION * dt;
  ball.vel.x *= frictionFactor;
  ball.vel.y *= frictionFactor;

  // Extra damping when slow to guarantee stop
  const speedPre = Math.hypot(ball.vel.x, ball.vel.y);
  if (speedPre < 10 && speedPre > 0) {
    const extraDamping = 1 - 0.8 * dt; // stronger damping at low speed
    ball.vel.x *= extraDamping;
    ball.vel.y *= extraDamping;
  }

  // Integrate
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;

  // Wall bounce (elastic)
  if (ball.pos.x - ball.radius < 0) {
    ball.pos.x = ball.radius;
    ball.vel.x *= -BOUNCE_DAMPING;
  } else if (ball.pos.x + ball.radius > canvasW) {
    ball.pos.x = canvasW - ball.radius;
    ball.vel.x *= -BOUNCE_DAMPING;
  }
  if (ball.pos.y - ball.radius < 0) {
    ball.pos.y = ball.radius;
    ball.vel.y *= -BOUNCE_DAMPING;
  } else if (ball.pos.y + ball.radius > canvasH) {
    ball.pos.y = canvasH - ball.radius;
    ball.vel.y *= -BOUNCE_DAMPING;
  }

  // Stop detection
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  if (speed < STOP_THRESHOLD) {
    stopTimer += dt;
    if (stopTimer >= STOP_TIME) {
      ball.isMoving = false;
      ball.vel.x = 0;
      ball.vel.y = 0;
      return { status: "stopped", pos: { ...ball.pos } };
    }
  } else {
    stopTimer = 0;
  }

  return { status: "moving" };
}

export function getSpeed() {
  return Math.hypot(ball.vel.x, ball.vel.y);
}
