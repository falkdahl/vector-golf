export let aimAngle = 0;
export let charging = false;
export let charge = 0;
export let holdTime = 0;

export const ROTATION_SPEED = 1.6; // rad/s (~91 deg/s)

export const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  KeyA: false,
  KeyD: false,
  Space: false
};

let lastSpaceDown = 0;

export function setAimAngle(angle) {
  aimAngle = angle;
  // normalize to [0, 2pi)
  aimAngle = ((aimAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export function getAimAngle() {
  return aimAngle;
}

export function initInput(gameStateGetter, callbacks) {
  // callbacks: { onLaunch(angle, power), onReset(), onToggleWind() }
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.ArrowLeft = true;
      keys.KeyA = true;
      e.preventDefault();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.ArrowRight = true;
      keys.KeyD = true;
      e.preventDefault();
    } else if (e.code === "Space") {
      e.preventDefault();
      const state = gameStateGetter();
      if ((state === "AIMING" || state === "CHARGING") && !charging && !e.repeat) {
        charging = true;
        holdTime = 0;
        charge = 0;
      }
      keys.Space = true;
    } else if (e.code === "KeyR") {
      callbacks.onReset();
    } else if (e.code === "KeyH") {
      callbacks.onToggleWind();
    }
    // Prevent scroll for arrows
    if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.ArrowLeft = false;
      keys.KeyA = false;
      e.preventDefault();
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.ArrowRight = false;
      keys.KeyD = false;
      e.preventDefault();
    } else if (e.code === "Space") {
      e.preventDefault();
      keys.Space = false;
      if (charging) {
        const state = gameStateGetter();
        if (state === "CHARGING" || state === "AIMING") {
          // compute power and launch
          // Import constants lazily via callbacks? Use fixed values here matching physics.js
          const MAX_POWER = 600;
          const MIN_POWER = 50;
          const power = MIN_POWER + charge * (MAX_POWER - MIN_POWER);
          charging = false;
          // reset charge after launch handled by main
          callbacks.onLaunch(aimAngle, power);
        } else {
          charging = false;
        }
      }
    }
  });
}

export function updateInput(dt, gameState) {
  if (gameState !== "AIMING" && gameState !== "CHARGING") {
    // No aiming during flight/win, but charging handled via holdTime
    if (gameState === "CHARGING" || charging) {
      // still update charge
      holdTime += dt;
      const MAX_CHARGE_TIME = 1.5;
      charge = Math.min(holdTime / MAX_CHARGE_TIME, 1.0);
    }
    return;
  }

  // Update charge if charging
  if (charging) {
    holdTime += dt;
    const MAX_CHARGE_TIME = 1.5;
    charge = Math.min(holdTime / MAX_CHARGE_TIME, 1.0);
  }

  // Rotation - allow during AIMING and CHARGING? spec says lock during charging for MVP.
  // We'll lock during charging to simplify, but allow very slight? We'll lock.
  if (charging) return;

  let dir = 0;
  if (keys.ArrowLeft || keys.KeyA) dir -= 1;
  if (keys.ArrowRight || keys.KeyD) dir += 1;
  // If both held, cancel (dir 0)
  if (dir !== 0) {
    aimAngle += dir * ROTATION_SPEED * dt;
    aimAngle = ((aimAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }
}

export function resetCharge() {
  charging = false;
  charge = 0;
  holdTime = 0;
}

export function cancelCharging() {
  charging = false;
  charge = 0;
  holdTime = 0;
}
