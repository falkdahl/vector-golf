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
  drawRewardMenu,
  getRewardButtonsLayout,
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

// Modifier system per REQ-015 + REQ-020 (supply-limited)
let modifiers = [];
let selectedModifier = null;
let mousePos = null;
let hotbarEl = null;
let draggingIdx = -1;
let isDragging = false;

// Supply per REQ-020: per-type inventory, starts empty on new game
let supply = { amplify: 0, nullify: 0, flip: 0 };

function canPlace(type) {
  if (!type || !(type in supply)) return false;
  const activeCount = modifiers.filter(m => m.type === type).length;
  return activeCount < supply[type];
}

function getSupply() {
  return { ...supply };
}

function addToSupply(type, n = 1) {
  if (!(type in supply)) return;
  supply[type] = Math.max(0, supply[type] + n);
  updateHotbarUI();
}

function resetSupply() {
  supply = { amplify: 0, nullify: 0, flip: 0 };
  updateHotbarUI();
}

// Free shots hidden counter per REQ-022 - conditional attempt counting
let freeShots = 0;
function getFreeShots() { return freeShots; }
function setFreeShots(v) { freeShots = Math.max(0, Math.floor(v)); }
function addFreeShots(n = 1) { freeShots = Math.max(0, freeShots + Math.floor(n)); }

// Reward menu per REQ-021: every 5 totalAttempts inside canvas - 3 random of 4 pool
const REWARD_POOL = ['amplify', 'nullify', 'flip', 'freeShots'];
let rewardMenuVisible = false;
let rewardClaimedFor = null; // last totalAttempts value claimed, null initially
let rewardMenuHover = null; // hovered type for visual feedback
let rewardOffered = []; // 3 distinct types randomly chosen from REWARD_POOL per trigger

function shuffleArray(a) {
  // Fisher-Yates with Math.random, uniform
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function maybeShowRewardMenu() {
  if (gameState === "WIN") return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (rewardMenuVisible) return;
  if (totalAttempts % 5 !== 0) return;
  if (rewardClaimedFor === totalAttempts) return;
  // REQ-021: randomly select 3 distinct upgrades from 4 pool
  rewardOffered = shuffleArray([...REWARD_POOL]).slice(0, 3);
  rewardMenuVisible = true;
  rewardMenuHover = null;
  // Ensure hotbar reflects blocked state
  updateHotbarUI();
}

function claimReward(type) {
  if (!rewardMenuVisible) return false;
  if (!rewardOffered.includes(type)) return false;
  // Idempotent: only once per trigger
  if (rewardClaimedFor === totalAttempts) return false;
  if (type === 'freeShots') {
    addFreeShots(3); // REQ-022: Free Shots +3
  } else {
    if (!(type in supply)) return false;
    addToSupply(type, 1);
  }
  rewardClaimedFor = totalAttempts;
  rewardMenuVisible = false;
  rewardMenuHover = null;
  rewardOffered = [];
  updateHotbarUI();
  if (canvas) canvas.style.cursor = "default";
  return true;
}

function getRewardOffered() { return [...rewardOffered]; }

function isRewardMenuVisible() {
  return rewardMenuVisible;
}

function getRewardClaimedFor() {
  return rewardClaimedFor;
}

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
  // REQ-020: supply persists across hole advances, do NOT reset supply here
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
  // REQ-020/REQ-022: new game starts with empty supply and freeShots
  if (currentHoleIndex === 0) {
    supply = { amplify: 0, nullify: 0, flip: 0 };
    freeShots = 0;
    rewardOffered = [];
  }
  loadLevel(currentHoleIndex);
  updateAttemptsUI();
  // REQ-021: show reward menu at start if totalAttempts %5==0 (initial 0) - random 3
  maybeShowRewardMenu();
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
    const type = slot.dataset.type;
    const activeCount = modifiers.filter(m => m.type === type).length;
    const supplyCount = supply[type] ?? 0;
    const canPlaceThis = activeCount < supplyCount;
    slot.classList.toggle("selected", slot.dataset.type === selectedModifier);
    slot.classList.toggle("disabled", !canPlaceThis);
    // Update count badge
    const countEl = slot.querySelector(".hotbar-count");
    if (countEl) {
      // Show  active/supply  or just supply remaining
      countEl.textContent = `${activeCount}/${supplyCount}`;
    }
    // Update label fallback if no countEl (legacy)
    // Accessibility title
    if (!canPlaceThis) {
      if (supplyCount === 0) {
        slot.title = `${type} - No supply (0)`;
      } else {
        slot.title = `${type} - Limit reached (${activeCount}/${supplyCount} placed)`;
      }
    } else {
      slot.title = `${type} - ${activeCount}/${supplyCount} placed (press ${type === 'amplify' ? '1' : type === 'nullify' ? '2' : '3'})`;
    }
    // For testing: expose supply via dataset
    slot.dataset.supply = String(supplyCount);
    slot.dataset.active = String(activeCount);
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
  if (!canPlace(selectedModifier)) {
    // REQ-020: reject placement if supply insufficient; keep selection for retry, update UI
    updateHotbarUI();
    return;
  }
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
    updateHotbarUI();
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
  // REQ-021: check reward menu on re-entering AIMING (death/OOB/R during play)
  maybeShowRewardMenu();
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
    // REQ-021: check reward menu when entering next hole in AIMING
    maybeShowRewardMenu();
  } else {
    // Final hole already, will show WIN
  }
}

function resetGameAfterWin() {
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  // REQ-020/REQ-022: reset supply and freeShots to empty on new game
  supply = { amplify: 0, nullify: 0, flip: 0 };
  freeShots = 0;
  // REQ-021: reset reward state for new game (random offer cleared)
  rewardMenuVisible = false;
  rewardClaimedFor = null;
  rewardMenuHover = null;
  rewardOffered = [];
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
  // REQ-021: on new game reset, show reward at 0
  maybeShowRewardMenu();
}

function handleLaunch(angle, power) {
  // REQ-021: block launch while reward menu visible
  if (rewardMenuVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  launchBall(angle, power);
  // REQ-022: free shots consumed first, hidden, mutually exclusive with counting
  if (freeShots > 0) {
    freeShots = Math.max(0, freeShots - 1);
  } else {
    holeAttempts += 1;
    totalAttempts += 1;
    attempts = totalAttempts;
  }
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
    // REQ-021: check reward menu when entering next hole in AIMING (e.g., total 5 after win)
    maybeShowRewardMenu();
  } else {
    // Final hole - Next should not be visible, but if pressed, do nothing or reset game
    resetGameAfterWin();
  }
}

function update(dt) {
  // REQ-021: when reward menu visible, block aiming/charging but still update particles
  if (rewardMenuVisible) {
    // Still allow particles animation, but block ball physics and charging transition
    updateParticles(dt, getWindAt);
    updateHotbarUI();
    // Ensure we stay in AIMING and not charging, and don't process input drift
    if (charging) {
      // cancel stray charging while menu open
      resetCharge();
      gameState = "AIMING";
    }
    return;
  }

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
  if (!rewardMenuVisible) {
    drawAim(ctx, ball, getAimAngle(), charge, gameState);
  }
  // Preview circle follows mouse when selecting modifier before shooting
  // REQ-020: only show preview if supply allows placement; REQ-021: not during reward menu
  if (!rewardMenuVisible && (gameState === "AIMING" || gameState === "CHARGING") && mousePos && selectedModifier && canPlace(selectedModifier)) {
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, MODIFIER_RADIUS);
  } else if (!rewardMenuVisible && (gameState === "AIMING" || gameState === "CHARGING") && mousePos && selectedModifier && !canPlace(selectedModifier)) {
    // Insufficient supply: show blocked preview (gray/red) to signal insufficiency
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, MODIFIER_RADIUS, true);
  }
  // HUD inside canvas on top per REQ-012/014
  drawHUD(ctx, LOGICAL_W, currentHoleIndex, LEVELS.length, holeAttempts, totalAttempts);
  // Power bar under ball when charging per REQ-007
  if (gameState === "CHARGING" && charging && !rewardMenuVisible) {
    drawForceBar(ctx, ball, charge);
  }
  // REQ-021: reward menu inside canvas (on top of HUD) - 3 random of 4
  if (rewardMenuVisible) {
    drawRewardMenu(ctx, LOGICAL_W, LOGICAL_H, rewardOffered, rewardMenuHover);
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
    () => rewardMenuVisible ? "REWARD" : gameState,
    {
      onLaunch: handleLaunch,
      onReset: () => {
        // REQ-021: block R while reward menu visible
        if (rewardMenuVisible) return;
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
      onToggleWind: () => {
        if (rewardMenuVisible) return;
        toggleWindRender();
      }
    }
  );

  // Hotbar selection per REQ-015 - updated for deselection via escape / same hotkey / same button
  if (hotbarEl) {
    hotbarEl.querySelectorAll(".hotbar-slot").forEach(slot => {
      slot.addEventListener("click", () => {
        // REQ-021: block hotbar selection while reward menu visible
        if (rewardMenuVisible) return;
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
    // REQ-021: when reward menu visible, 1/2/3 selects random offered reward by position, other inputs blocked
    if (rewardMenuVisible) {
      if (e.code === "Digit1" && rewardOffered[0]) {
        claimReward(rewardOffered[0]);
        e.preventDefault();
      } else if (e.code === "Digit2" && rewardOffered[1]) {
        claimReward(rewardOffered[1]);
        e.preventDefault();
      } else if (e.code === "Digit3" && rewardOffered[2]) {
        claimReward(rewardOffered[2]);
        e.preventDefault();
      } else if (e.code === "Escape" || e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyA" || e.code === "KeyD" || e.code === "Digit4") {
        // Block aiming/charging while menu open (including Digit4 which is not used - only 3 options)
        e.preventDefault();
      }
      return;
    }
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
        updateHotbarUI();
      }
    }
  });
  // Canvas mouse for modifier placement & dragging per updated REQ-015 + REQ-020 + REQ-021
  canvas.addEventListener("mousemove", (e) => {
    // REQ-021: handle hover for reward menu (random 3 offered)
    if (rewardMenuVisible) {
      const pos = getCanvasMousePos(e);
      mousePos = pos;
      const layout = getRewardButtonsLayout(LOGICAL_W, LOGICAL_H, rewardOffered);
      let hovered = null;
      for (const btn of layout) {
        if (pos.x >= btn.x && pos.x <= btn.x + btn.w && pos.y >= btn.y && pos.y <= btn.y + btn.h) {
          hovered = btn.type;
          break;
        }
      }
      rewardMenuHover = hovered;
      canvas.style.cursor = hovered ? "pointer" : "default";
      return;
    }
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
        // REQ-020: show not-allowed if cannot place due to supply
        if (!canPlace(selectedModifier)) {
          canvas.style.cursor = "not-allowed";
        } else {
          canvas.style.cursor = "crosshair";
        }
      } else {
        canvas.style.cursor = "default";
      }
    }
  });
  canvas.addEventListener("mouseleave", () => { mousePos = null; rewardMenuHover = null; canvas.style.cursor = "default"; });
  canvas.addEventListener("mousedown", (e) => {
    if (rewardMenuVisible) {
      // Block dragging while reward menu open
      e.preventDefault();
      return;
    }
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
    // REQ-021: handle reward menu selection first (random 3 offered)
    if (rewardMenuVisible) {
      const pos = getCanvasMousePos(e);
      const layout = getRewardButtonsLayout(LOGICAL_W, LOGICAL_H, rewardOffered);
      for (const btn of layout) {
        if (pos.x >= btn.x && pos.x <= btn.x + btn.w && pos.y >= btn.y && pos.y <= btn.y + btn.h) {
          claimReward(btn.type);
          e.preventDefault();
          return;
        }
      }
      // Click outside buttons while menu open = ignore (block placement)
      e.preventDefault();
      return;
    }
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
    // REQ-021: block removal while reward menu visible
    if (rewardMenuVisible) return;
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

// Helpers for REQ-020 testing / external acquisition
function setSupply(newSupply) {
  supply = {
    amplify: Math.max(0, newSupply.amplify ?? 0),
    nullify: Math.max(0, newSupply.nullify ?? 0),
    flip: Math.max(0, newSupply.flip ?? 0),
  };
  updateHotbarUI();
}
function getModifiers() { return [...modifiers]; }
function getSelectedModifier() { return selectedModifier; }

// Helpers for REQ-021 testing
function getRewardMenuState() {
  return { visible: rewardMenuVisible, claimedFor: rewardClaimedFor, hover: rewardMenuHover, offered: [...rewardOffered] };
}
function setRewardClaimedFor(v) { rewardClaimedFor = v; }
function setRewardMenuVisible(v) { rewardMenuVisible = v; }
function setRewardOffered(v) { if (Array.isArray(v)) rewardOffered = [...v]; }

// Expose for manual/browser testing and for acceptance checks without import
if (typeof window !== 'undefined') {
  window.__getSupply = getSupply;
  window.__setSupply = setSupply;
  window.__addToSupply = addToSupply;
  window.__canPlace = canPlace;
  window.__getModifiers = getModifiers;
  Object.defineProperty(window, 'supply', {
    get: () => supply,
    set: (v) => setSupply(v)
  });
  Object.defineProperty(window, '__supply', {
    get: () => supply,
    set: (v) => setSupply(v)
  });
  window.__getSelectedModifier = getSelectedModifier;
  window.__maybeShowRewardMenu = maybeShowRewardMenu;
  window.__claimReward = claimReward;
  window.__isRewardMenuVisible = isRewardMenuVisible;
  window.__getRewardClaimedFor = getRewardClaimedFor;
  window.__getRewardMenuState = getRewardMenuState;
  window.__setRewardClaimedFor = setRewardClaimedFor;
  window.__setRewardMenuVisible = setRewardMenuVisible;
  window.__getRewardOffered = getRewardOffered;
  window.__setRewardOffered = setRewardOffered;
  window.__getFreeShots = getFreeShots;
  window.__setFreeShots = setFreeShots;
  window.__addFreeShots = addFreeShots;
  Object.defineProperty(window, 'freeShots', {
    get: () => freeShots,
    set: (v) => setFreeShots(v)
  });
  Object.defineProperty(window, 'rewardOffered', {
    get: () => [...rewardOffered],
    set: (v) => setRewardOffered(v)
  });
  Object.defineProperty(window, 'rewardMenuVisible', {
    get: () => rewardMenuVisible,
    set: (v) => { rewardMenuVisible = v; }
  });
  Object.defineProperty(window, 'rewardClaimedFor', {
    get: () => rewardClaimedFor,
    set: (v) => { rewardClaimedFor = v; }
  });
}

// Auto-init when loaded as module via script tag
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init, resetBall, gameState, attempts, supply, getSupply, setSupply, addToSupply, canPlace, resetSupply, getModifiers, getSelectedModifier, modifiers, selectedModifier, rewardMenuVisible, rewardClaimedFor, rewardMenuHover, rewardOffered, REWARD_POOL, maybeShowRewardMenu, claimReward, isRewardMenuVisible, getRewardClaimedFor, getRewardMenuState, setRewardClaimedFor, setRewardMenuVisible, getRewardOffered, setRewardOffered, freeShots, getFreeShots, setFreeShots, addFreeShots, totalAttempts, holeAttempts, currentHoleIndex };
