import { isInsideNullify } from "./vectorField.js";

// Tunable constants at top per REQ-005 - tuned for very high wind acceleration - fast
// Visual air arc: ball goes up, casts shadow, bounces on ground (radius kept small)
export const BALL_RADIUS = 6; // reverted to original small size
export const FRICTION = 0.35;
export const STOP_THRESHOLD = 5; // px/s
export const STOP_TIME = 0.4; // seconds
export const BOUNCE_DAMPING = 0.7;

// Air physics
export const GRAVITY = 1100; // px/s^2 vertical
export const VERTICAL_BOUNCE_DAMPING = 0.48; // ground bounce retains ~48% vertical speed
export const AIRBOUNCE_MIN_VZ = 32; // below this, settle to ground

export const MAX_CHARGE_TIME = 1.5; // seconds
export const MAX_POWER = 600; // px/s
export const MIN_POWER = 50;

export let ball = {
  pos: { x: 80, y: 300 },
  vel: { x: 0, y: 0 },
  radius: BALL_RADIUS,
  isMoving: false,
  z: 0, // height above ground
  vz: 0 // vertical velocity
};

let stopTimer = 0;

export function createBall(tee) {
  ball = {
    pos: { x: tee.x, y: tee.y },
    vel: { x: 0, y: 0 },
    radius: BALL_RADIUS,
    isMoving: false,
    z: 0,
    vz: 0
  };
  stopTimer = 0;
  return ball;
}

export function launchBall(angle, power) {
  ball.vel.x = Math.cos(angle) * power;
  ball.vel.y = Math.sin(angle) * power;
  ball.isMoving = true;
  stopTimer = 0;
  // Launch into air: height arc proportional to power
  ball.z = 0;
  const t = Math.max(0, Math.min(1, power / MAX_POWER));
  ball.vz = 220 + t * 230; // 220 .. 450 px/s upward
}

export function resetBall(tee) {
  ball.pos.x = tee.x;
  ball.pos.y = tee.y;
  ball.vel.x = 0;
  ball.vel.y = 0;
  ball.isMoving = false;
  ball.z = 0;
  ball.vz = 0;
  stopTimer = 0;
}

export function updateBall(dt, getWindAt, windStrength, canvasW, canvasH) {
  if (!ball.isMoving) return { status: "idle" };

  // --- Vertical air arc (independent of wind/nullify) ---
  ball.vz -= GRAVITY * dt;
  ball.z += ball.vz * dt;
  if (ball.z <= 0) {
    if (Math.abs(ball.vz) < AIRBOUNCE_MIN_VZ) {
      ball.z = 0;
      ball.vz = 0;
    } else {
      ball.z = 0;
      ball.vz = -ball.vz * VERTICAL_BOUNCE_DAMPING;
      // small horizontal damping on ground hit to feel physical
      ball.vel.x *= 0.92;
      ball.vel.y *= 0.92;
    }
  }
  // Clamp z
  if (ball.z < 0) ball.z = 0;

  // Nullify: keep same direction and speed as when entered - no wind, no friction per REQ-017 (horizontal only)
  if (isInsideNullify(ball.pos.x, ball.pos.y)) {
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
    return { status: "moving", z: ball.z, vz: ball.vz, isAirborne: ball.z > 0.5 };
  }

  // Apply wind - high acceleration per updated REQ-003/005, always drifts and re-accelerates quickly after turn
  const wind = getWindAt(ball.pos.x, ball.pos.y);
  ball.vel.x += wind.x * windStrength * dt;
  ball.vel.y += wind.y * windStrength * dt;

  // Friction - lower to allow fast wind response (0.7) per updated requirement
  const frictionFactor = 1 - FRICTION * dt;
  ball.vel.x *= frictionFactor;
  ball.vel.y *= frictionFactor;

  // Integrate (ground projection)
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;

  // Edge is fatal per REQ-005/REQ-008 - no bounce, let main.js handle OOB death
  // Keep position as is, no clamping

  // No stop detection per REQ-005: ball never considered stopped, continues drifting
  // Keep isMoving true until death or win

  return { status: "moving", z: ball.z, vz: ball.vz, isAirborne: ball.z > 0.5 };
}

export function getSpeed() {
  return Math.hypot(ball.vel.x, ball.vel.y);
}
