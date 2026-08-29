import { isInsideNullify } from "./vectorField.js";

// Tunable constants at top per REQ-005 - tuned for high wind acceleration
export const BALL_RADIUS = 6;
export const FRICTION = 0.7;
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

  // Nullify: keep same direction and speed as when entered - no wind, no friction per REQ-017
  if (isInsideNullify(ball.pos.x, ball.pos.y)) {
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
    return { status: "moving" };
  }

  // Apply wind - high acceleration per updated REQ-003/005, always drifts and re-accelerates quickly after turn
  const wind = getWindAt(ball.pos.x, ball.pos.y);
  ball.vel.x += wind.x * windStrength * dt;
  ball.vel.y += wind.y * windStrength * dt;

  // Friction - lower to allow fast wind response (0.7) per updated requirement
  const frictionFactor = 1 - FRICTION * dt;
  ball.vel.x *= frictionFactor;
  ball.vel.y *= frictionFactor;

  // Integrate
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;

  // Edge is fatal per REQ-005/REQ-008 - no bounce, let main.js handle OOB death
  // Keep position as is, no clamping

  // No stop detection per REQ-005: ball never considered stopped, continues drifting
  // Keep isMoving true until death or win

  return { status: "moving" };
}

export function getSpeed() {
  return Math.hypot(ball.vel.x, ball.vel.y);
}
