import { LEVEL, LEVELS } from "./levels.js";
import { createField, getWindAt, WIND_STRENGTH, field, cols, rows, cellW, cellH } from "./vectorField.js";
import { ball, createBall, launchBall, resetBall as physicsResetBall, updateBall, BALL_RADIUS } from "./physics.js";
import { checkObstacleCollision, isOutOfBounds } from "./obstacles.js";
import { initInput, updateInput, getAimAngle, setAimAngle, charge, charging, resetCharge, keys } from "./input.js";
import {
  initParticles,
  updateParticles,
  drawBackground,
  drawArrows,
  drawParticles,
  drawObstacles,
  drawHole,
  drawBall,
  drawAim,
  setCanvasSize,
  toggleWind as toggleWindRender,
  isWindVisible
} from "./render.js";

const LOGICAL_W = LEVEL.canvas.width;
const LOGICAL_H = LEVEL.canvas.height;
const FIXED_DT = 1 / 60;

let canvas;
let ctx;
let gameState = "AIMING"; // AIMING, CHARGING, FLYING, WIN
let accumulator = 0;
let lastTime = 0;
let level = LEVEL;
let windStrength = level.field.strength ?? WIND_STRENGTH;
let attempts = 0;

let forceFill;
let forceLabel;
let winOverlay;
let attemptsValue;
let winAttemptsValue;

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_W * dpr;
  canvas.height = LOGICAL_H * dpr;
  canvas.style.width = LOGICAL_W + "px";
  canvas.style.height = LOGICAL_H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  setCanvasSize(LOGICAL_W, LOGICAL_H);
}

function initLevel() {
  level = LEVELS[0];
  windStrength = level.field.strength;
  createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H);
  initParticles(80, LOGICAL_W, LOGICAL_H);
  createBall(level.tee);
  const dx = level.hole.x - level.tee.x;
  const dy = level.hole.y - level.tee.y;
  setAimAngle(Math.atan2(dy, dx));
  // validate obstacles not overlapping tee/hole
  for (const obs of level.obstacles) {
    if (obs.type === "rect") {
      const teeInside = level.tee.x >= obs.x && level.tee.x <= obs.x + obs.w && level.tee.y >= obs.y && level.tee.y <= obs.y + obs.h;
      const holeInside = level.hole.x >= obs.x && level.hole.x <= obs.x + obs.w && level.hole.y >= obs.y && level.hole.y <= obs.y + obs.h;
      if (teeInside || holeInside) console.warn("Obstacle overlaps tee/hole", obs);
    } else if (obs.type === "circle") {
      const dTee = Math.hypot(level.tee.x - obs.x, level.tee.y - obs.y);
      const dHole = Math.hypot(level.hole.x - obs.x, level.hole.y - obs.y);
      if (dTee < 30 + BALL_RADIUS || dHole < 30 + obs.r) console.warn("Obstacle too close to tee/hole", obs);
    }
  }
}

function updateAttemptsUI() {
  if (attemptsValue) attemptsValue.textContent = String(attempts);
  if (winAttemptsValue) winAttemptsValue.textContent = String(attempts);
}

function resetBall() {
  physicsResetBall(level.tee);
  resetCharge();
  const dx = level.hole.x - level.tee.x;
  const dy = level.hole.y - level.tee.y;
  setAimAngle(Math.atan2(dy, dx));
  gameState = "AIMING";
  winOverlay.classList.add("hidden");
  updateForceBar();
}

function resetGameAfterWin() {
  attempts = 0;
  updateAttemptsUI();
  resetBall();
}

function handleLaunch(angle, power) {
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  launchBall(angle, power);
  attempts += 1;
  updateAttemptsUI();
  gameState = "FLYING";
  resetCharge();
  updateForceBar();
}

function checkWin() {
  const dist = Math.hypot(ball.pos.x - level.hole.x, ball.pos.y - level.hole.y);
  if (dist < level.hole.radius - 2) {
    gameState = "WIN";
    updateAttemptsUI();
    winOverlay.classList.remove("hidden");
    return true;
  }
  return false;
}

function update(dt) {
  // Update input
  updateInput(dt, gameState);

  // Transition AIMING -> CHARGING when charging starts
  if (charging && gameState === "AIMING") {
    gameState = "CHARGING";
  }

  if (gameState === "AIMING" || gameState === "CHARGING") {
    updateForceBar();
  }

  if (gameState === "FLYING") {
    updateParticles(dt, getWindAt);
    updateBall(dt, getWindAt, windStrength, LOGICAL_W, LOGICAL_H);

    // Check win every tick - immediate, regardless of speed (REQ-009)
    if (checkWin()) {
      return;
    }

    // Check OOB / edge - fatal per REQ-005/REQ-008
    if (isOutOfBounds(ball.pos, BALL_RADIUS, LOGICAL_W, LOGICAL_H)) {
      resetBall();
      return;
    }
    // Check obstacle collision - instant reset even when drifting slowly
    const hit = checkObstacleCollision(ball.pos, BALL_RADIUS, level.obstacles);
    if (hit) {
      resetBall();
      return;
    }

    // No auto-reset on rest - ball continues drifting per REQ-005

  } else if (gameState === "WIN") {
    // paused physics, still update particles for visual
    updateParticles(dt, getWindAt);
  } else {
    // AIMING/CHARGING - update particles anyway
    updateParticles(dt, getWindAt);
  }
}

function updateForceBar() {
  if (!forceFill) return;
  const pct = Math.round(charge * 100);
  forceFill.style.width = pct + "%";
  // lerps green -> yellow -> red
  // green #2ecc71 (46,204,113) -> yellow #f1c40f (241,196,15) -> red #e74c3c (231,60,60)
  let r, g, b;
  if (charge < 0.5) {
    const t = charge / 0.5;
    r = 46 + (241 - 46) * t;
    g = 204 + (196 - 204) * t;
    b = 113 + (15 - 113) * t;
  } else {
    const t = (charge - 0.5) / 0.5;
    r = 241 + (231 - 241) * t;
    g = 196 + (60 - 196) * t;
    b = 15 + (60 - 15) * t;
  }
  forceFill.style.background = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  if (forceLabel) forceLabel.textContent = pct + "%";
  // Hide dim when flying? Keep visible but at 0
  if (gameState === "FLYING" || gameState === "WIN") {
    forceFill.style.width = "0%";
    if (forceLabel) forceLabel.textContent = "0%";
  }
}

function render() {
  // clear (use logical coords due to transform)
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Draw order: background -> arrows -> particles -> obstacles -> hole -> ball -> aim
  drawBackground(ctx, LOGICAL_W, LOGICAL_H);
  drawArrows(ctx, field, cols, rows, cellW, cellH);
  drawParticles(ctx);
  drawObstacles(ctx, level.obstacles);
  drawHole(ctx, level.hole);
  drawBall(ctx, ball);
  drawAim(ctx, ball, getAimAngle(), charge, gameState);
}

function loop(now) {
  if (document.hidden) {
    lastTime = now;
    requestAnimationFrame(loop);
    return;
  }
  if (gameState === "WIN") {
    // Still render even when paused
    render();
    requestAnimationFrame(loop);
    lastTime = now;
    return;
  }
  const frameTime = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += frameTime;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  render();
  requestAnimationFrame(loop);
}

function init() {
  canvas = document.getElementById("game");
  if (!canvas) {
    console.error("Canvas #game not found");
    return;
  }
  ctx = canvas.getContext("2d");
  forceFill = document.getElementById("force-fill");
  forceLabel = document.getElementById("force-label");
  winOverlay = document.getElementById("win-overlay");
  attemptsValue = document.getElementById("attempts-value");
  winAttemptsValue = document.getElementById("win-attempts-value");

  setupCanvas();
  initLevel();
  updateForceBar();
  updateAttemptsUI();

  initInput(
    () => gameState,
    {
      onLaunch: handleLaunch,
      onReset: () => {
        if (gameState === "WIN") {
          resetGameAfterWin();
        } else {
          resetBall();
        }
      },
      onToggleWind: () => toggleWindRender()
    }
  );

  // Resize handling debounced
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setupCanvas();
    }, 200);
  });

  // visibility change
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) lastTime = performance.now();
  });

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// Auto-init when loaded as module via script tag
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init, resetBall, gameState, attempts };
