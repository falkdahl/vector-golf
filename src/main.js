import { LEVEL, LEVELS } from "./levels.js";
import { createField, getWindAt, WIND_STRENGTH, field, cols, rows, cellW, cellH, MODIFIER_RADIUS, modifiers as fieldModifiers, setModifiers, clearModifiers } from "./vectorField.js";
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
  drawHUD,
  drawForceBar,
  drawModifiers,
  drawModifierPreview,
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
let currentHoleIndex = 0;
let holeAttempts = 0;
let totalAttempts = 0;
let attempts = 0; // alias for totalAttempts for backward compat

// Modifier system per REQ-015 - unlimited modifiers per updated requirement
let modifiers = [];
let selectedModifier = null;
let mousePos = null;
let hotbarEl = null;
let draggingIdx = -1;
let isDragging = false;

let winOverlay;
let winAttemptsValue;
let winHoleValue;
let winHoleTotal;
let winTotalValue;
let winTitle;
let nextHoleButton;

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

function loadLevel(index) {
  currentHoleIndex = index;
  level = LEVELS[currentHoleIndex];
  windStrength = level.field.strength ?? WIND_STRENGTH;
  createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H);
  // Clear modifiers for new hole per REQ-015 (persist through death, cleared on hole advance)
  modifiers = [];
  syncModifiersToField();
  // Keep canvas size consistent per REQ-010 (all levels 900x600); if varying, would re-setup canvas
  initParticles(80, LOGICAL_W, LOGICAL_H);
  createBall(level.tee);
  const dx = level.hole.x - level.tee.x;
  const dy = level.hole.y - level.tee.y;
  setAimAngle(Math.atan2(dy, dx));
  updateHotbarUI();
}

function initLevel() {
  loadLevel(currentHoleIndex);
  updateAttemptsUI();
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
  attempts = totalAttempts; // keep alias synced
  if (winHoleValue) winHoleValue.textContent = String(currentHoleIndex + 1);
  if (winHoleTotal) winHoleTotal.textContent = String(LEVELS.length);
  if (winAttemptsValue) winAttemptsValue.textContent = String(holeAttempts);
  if (winTotalValue) winTotalValue.textContent = String(totalAttempts);
  if (winTitle) {
    // Victory menu per new requirement - always Victory, with Game Complete on final hole
    if (gameState === "WIN") {
      if (currentHoleIndex === LEVELS.length - 1) {
        winTitle.textContent = "Victory";
      } else {
        winTitle.textContent = "Victory";
      }
    } else {
      winTitle.textContent = "Victory";
    }
  }
  if (nextHoleButton) {
    const hasMoreHoles = currentHoleIndex < LEVELS.length - 1;
    if (gameState === "WIN" && hasMoreHoles) {
      nextHoleButton.classList.remove("hidden");
      nextHoleButton.textContent = "Next";
    } else if (gameState === "WIN" && !hasMoreHoles) {
      nextHoleButton.classList.add("hidden");
    } else {
      nextHoleButton.classList.add("hidden");
    }
  }
}

function updateHotbarUI() {
  if (!hotbarEl) return;
  const isAiming = gameState === "AIMING" || gameState === "CHARGING";
  hotbarEl.classList.toggle("hidden", !isAiming);
  for (const slot of hotbarEl.querySelectorAll(".hotbar-slot")) {
    slot.classList.toggle("selected", slot.dataset.type === selectedModifier);
  }
}

function syncModifiersToField() {
  setModifiers(modifiers);
}

function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Use logical coordinates (900x600)
  const scaleX = LOGICAL_W / rect.width;
  const scaleY = LOGICAL_H / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { x, y };
}

function placeModifier(x, y) {
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (!selectedModifier) return;
  modifiers.push({ id: Date.now() + Math.random(), type: selectedModifier, x, y, radius: MODIFIER_RADIUS });
  syncModifiersToField();
  // Deselect after placement per requirement
  selectedModifier = null;
  updateHotbarUI();
  mousePos = null;
}

function removeModifierAt(x, y) {
  const idx = modifiers.findIndex(m => Math.hypot(m.x - x, m.y - y) < m.radius);
  if (idx !== -1) {
    modifiers.splice(idx, 1);
    syncModifiersToField();
    return true;
  }
  return false;
}

function resetBall() {
  physicsResetBall(level.tee);
  resetCharge();
  // Keep aimAngle between attempts per REQ-019 - do NOT reset to tee->hole
  gameState = "AIMING";
  winOverlay.classList.add("hidden");
  updateForceBar();
}

function advanceHole() {
  if (currentHoleIndex < LEVELS.length - 1) {
    currentHoleIndex++;
    holeAttempts = 0;
    loadLevel(currentHoleIndex);
    // validate next level
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
    gameState = "AIMING";
    winOverlay.classList.add("hidden");
    updateAttemptsUI();
    updateForceBar();
  } else {
    // Final hole already, will show WIN
  }
}

function resetGameAfterWin() {
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  loadLevel(currentHoleIndex);
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
  gameState = "AIMING";
  winOverlay.classList.add("hidden");
  updateAttemptsUI();
  updateForceBar();
}

function handleLaunch(angle, power) {
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  launchBall(angle, power);
  holeAttempts += 1;
  totalAttempts += 1;
  attempts = totalAttempts;
  updateAttemptsUI();
  gameState = "FLYING";
  resetCharge();
  updateForceBar();
}

function checkWin() {
  const dist = Math.hypot(ball.pos.x - level.hole.x, ball.pos.y - level.hole.y);
  // Victory when ball touches any part of black circle per new requirement
  if (dist < level.hole.radius + BALL_RADIUS) {
    // Ball stops in place per requirement
    ball.vel.x = 0;
    ball.vel.y = 0;
    ball.isMoving = false;
    gameState = "WIN";
    updateAttemptsUI();
    winOverlay.classList.remove("hidden");
    // Ensure Next button visibility reflects if more holes remain
    if (nextHoleButton) {
      if (currentHoleIndex < LEVELS.length - 1) {
        nextHoleButton.classList.remove("hidden");
      } else {
        nextHoleButton.classList.add("hidden");
      }
    }
    return true;
  }
  return false;
}

function handleNextHole() {
  if (currentHoleIndex < LEVELS.length - 1) {
    currentHoleIndex++;
    holeAttempts = 0; // reset per-hole attempts, keep total per requirement
    loadLevel(currentHoleIndex);
    // validate
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
    gameState = "AIMING";
    winOverlay.classList.add("hidden");
    updateAttemptsUI();
    updateForceBar();
  } else {
    // Final hole - Next should not be visible, but if pressed, do nothing or reset game
    resetGameAfterWin();
  }
}

function update(dt) {
  // Update input
  updateInput(dt, gameState);

  // Transition AIMING -> CHARGING when charging starts
  if (charging && gameState === "AIMING") {
    gameState = "CHARGING";
  }

  updateHotbarUI();

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
  // Power bar now drawn inside canvas under ball when CHARGING per REQ-007 - no DOM
}

function render() {
  // clear (use logical coords due to transform)
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Draw order: background -> arrows -> particles -> obstacles -> hole -> ball -> aim -> HUD/force bar/modifiers (on top)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H);
  drawArrows(ctx, getWindAt, cols, rows, cellW, cellH);
  drawParticles(ctx);
  drawModifiers(ctx, modifiers);
  drawObstacles(ctx, level.obstacles);
  drawHole(ctx, level.hole);
  drawBall(ctx, ball);
  drawAim(ctx, ball, getAimAngle(), charge, gameState);
  // Preview circle follows mouse when selecting modifier before shooting
  if ((gameState === "AIMING" || gameState === "CHARGING") && mousePos) {
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, MODIFIER_RADIUS);
  }
  // HUD inside canvas on top per REQ-012/014
  drawHUD(ctx, LOGICAL_W, currentHoleIndex, LEVELS.length, holeAttempts, totalAttempts);
  // Power bar under ball when charging per REQ-007
  if (gameState === "CHARGING" && charging) {
    drawForceBar(ctx, ball, charge);
  }
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
  winOverlay = document.getElementById("win-overlay");
  winAttemptsValue = document.getElementById("win-attempts-value");
  winHoleValue = document.getElementById("win-hole-value");
  winHoleTotal = document.getElementById("win-hole-total");
  winTotalValue = document.getElementById("win-total-value");
  winTitle = document.getElementById("win-title");
  nextHoleButton = document.getElementById("next-hole-button");
  hotbarEl = document.getElementById("hotbar");

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
          if (currentHoleIndex === LEVELS.length - 1) {
            resetGameAfterWin();
          } else {
            handleNextHole();
          }
        } else {
          resetBall();
        }
      },
      onToggleWind: () => toggleWindRender()
    }
  );

  // Hotbar selection per REQ-015 - updated for deselection via escape / same hotkey / same button
  if (hotbarEl) {
    hotbarEl.querySelectorAll(".hotbar-slot").forEach(slot => {
      slot.addEventListener("click", () => {
        if (selectedModifier === slot.dataset.type) {
          selectedModifier = null;
        } else {
          selectedModifier = slot.dataset.type;
        }
        updateHotbarUI();
      });
    });
    updateHotbarUI();
  }
  if (nextHoleButton) {
    nextHoleButton.addEventListener("click", handleNextHole);
  }
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") {
      if (selectedModifier !== null) {
        selectedModifier = null;
        updateHotbarUI();
        e.preventDefault();
      }
    } else if (e.code === "Digit1") {
      if (selectedModifier === 'amplify') selectedModifier = null;
      else selectedModifier = 'amplify';
      updateHotbarUI();
      e.preventDefault();
    } else if (e.code === "Digit2") {
      if (selectedModifier === 'nullify') selectedModifier = null;
      else selectedModifier = 'nullify';
      updateHotbarUI();
      e.preventDefault();
    } else if (e.code === "Digit3") {
      if (selectedModifier === 'flip') selectedModifier = null;
      else selectedModifier = 'flip';
      updateHotbarUI();
      e.preventDefault();
    } else if (e.code === "Delete" || e.code === "Backspace") {
      // Remove last modifier
      if (modifiers.length > 0 && (gameState === "AIMING" || gameState === "CHARGING")) {
        modifiers.pop();
        syncModifiersToField();
      }
    }
  });
  // Canvas mouse for modifier placement & dragging per updated REQ-015
  canvas.addEventListener("mousemove", (e) => {
    if (gameState !== "AIMING" && gameState !== "CHARGING") {
      mousePos = null;
      return;
    }
    const pos = getCanvasMousePos(e);
    mousePos = pos;
    if (isDragging && draggingIdx !== -1) {
      modifiers[draggingIdx].x = pos.x;
      modifiers[draggingIdx].y = pos.y;
      syncModifiersToField();
      canvas.style.cursor = "grabbing";
    } else {
      // Update cursor based on hover over modifier
      const overIdx = modifiers.findIndex(m => Math.hypot(m.x - pos.x, m.y - pos.y) < m.radius);
      if (overIdx !== -1) {
        canvas.style.cursor = "grab";
      } else if (selectedModifier) {
        canvas.style.cursor = "crosshair";
      } else {
        canvas.style.cursor = "default";
      }
    }
  });
  canvas.addEventListener("mouseleave", () => { mousePos = null; canvas.style.cursor = "default"; });
  canvas.addEventListener("mousedown", (e) => {
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    if (e.button !== 0) return; // only left
    const pos = getCanvasMousePos(e);
    const idx = modifiers.findIndex(m => Math.hypot(m.x - pos.x, m.y - pos.y) < m.radius);
    if (idx !== -1) {
      // Start dragging existing modifier
      draggingIdx = idx;
      isDragging = true;
      canvas.style.cursor = "grabbing";
      e.preventDefault();
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (isDragging && draggingIdx !== -1) {
      const pos = getCanvasMousePos(e);
      // If mouse released outside canvas, pos may be out of bounds, but still update
      if (pos) {
        modifiers[draggingIdx].x = Math.max(0, Math.min(LOGICAL_W, pos.x));
        modifiers[draggingIdx].y = Math.max(0, Math.min(LOGICAL_H, pos.y));
        syncModifiersToField();
      }
      isDragging = false;
      draggingIdx = -1;
      canvas.style.cursor = "default";
    }
  });
  canvas.addEventListener("click", (e) => {
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    if (isDragging) return; // was dragging, not a placement click
    const pos = getCanvasMousePos(e);
    // If clicked on existing modifier and not dragging, do not place (drag handles move, click on existing previously removed - now we keep draggable, so click on existing should not place nor remove)
    const overIdx = modifiers.findIndex(m => Math.hypot(m.x - pos.x, m.y - pos.y) < m.radius);
    if (overIdx !== -1) {
      // Click on existing without drag - no action (drag to move, right-click to remove)
      return;
    }
    if (!selectedModifier) return; // no modifier selected after placement per new requirement
    placeModifier(pos.x, pos.y);
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    const pos = getCanvasMousePos(e);
    // If dragging, cancel drag and remove?
    if (isDragging) {
      isDragging = false;
      draggingIdx = -1;
    }
    removeModifierAt(pos.x, pos.y);
  });

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
