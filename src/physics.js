import { isInsideLiquifier } from "./vectorField.js";

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

// Height above which the ball is considered airborne: it flies over water.
// Trees and chests use higher gates (see below): the ball arc (z) is visual,
// physics stays 2D on the ground shadow (ball.pos). High balls fly over.
export const AIRBORNE_Z = 5;
export function isBallAirborne(ballOrZ) {
  const z = (ballOrZ !== null && typeof ballOrZ === 'object') ? (ballOrZ.z ?? 0) : ballOrZ;
  return (z ?? 0) > AIRBORNE_Z;
}

// Height above which the ball flies over the whole tree (canopy + trunk).
// Tuned so ~60%+ power lobs clear (apex ~22px tap .. ~92px full at vz 220-450,
// GRAVITY 1100) while taps/rolls bounce.
export const TREE_CLEAR_Z = 32;
// Height above which the ball passes over treasure chests without pickup.
export const TREASURE_CLEAR_Z = 28;
export function isBallOverTree(ballOrZ) {
  const z = (ballOrZ !== null && typeof ballOrZ === 'object') ? (ballOrZ.z ?? 0) : ballOrZ;
  return (z ?? 0) > TREE_CLEAR_Z;
}
export function isBallOverTreasure(ballOrZ) {
  const z = (ballOrZ !== null && typeof ballOrZ === 'object') ? (ballOrZ.z ?? 0) : ballOrZ;
  return (z ?? 0) > TREASURE_CLEAR_Z;
}

// Drawn-ball geometry — RENDER ONLY (fake arc visualization).
// Physics collides on the ground shadow (ball.pos); see obstacles.js ground
// helpers and TREE_CLEAR_Z / TREASURE_CLEAR_Z gates above.
export const BALL_LIFT_FACTOR = 0.55; // drawn y offset per z
export const BALL_GROWTH_FACTOR = 0.025; // drawn radius growth per z
export function drawnBallCircle(b) {
  const z = b?.z ?? 0;
  const r = b?.radius ?? BALL_RADIUS;
  const pos = b?.pos ?? { x: 0, y: 0 };
  return { x: pos.x, y: pos.y - z * BALL_LIFT_FACTOR, r: r + z * BALL_GROWTH_FACTOR };
}
// Convert a drawn-space position back to the ground projection (shadow).
export function groundPosFromDrawn(drawnX, drawnY, z) {
  return { x: drawnX, y: drawnY + (z ?? 0) * BALL_LIFT_FACTOR };
}

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

  // --- Vertical air arc (independent of wind/liquifier) ---
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

  // Liquifier: keep same direction and speed as when entered - no wind, no friction per REQ-017 (horizontal only, legacy Nullify)
  if (isInsideLiquifier(ball.pos.x, ball.pos.y)) {
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
    return { status: "moving", z: ball.z, vz: ball.vz, isAirborne: isBallAirborne(ball) };
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

  return { status: "moving", z: ball.z, vz: ball.vz, isAirborne: isBallAirborne(ball) };
}

export function getSpeed() {
  return Math.hypot(ball.vel.x, ball.vel.y);
}
