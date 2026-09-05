import { LEVEL, LEVELS, generateLevels } from "./levels.js";
import { createField, getWindAt, WIND_STRENGTH, field, cols, rows, cellW, cellH, MODIFIER_RADIUS, modifiers as fieldModifiers, setModifiers, clearModifiers } from "./vectorField.js";
import { ball, createBall, launchBall, resetBall as physicsResetBall, updateBall, BALL_RADIUS, BOUNCE_DAMPING } from "./physics.js";
import { checkObstacleCollision, isOutOfBounds, checkWaterCollision, checkTerrainCollision } from "./obstacles.js";
import { terrainZoneAt } from "./terrain.js";
import { initInput, updateInput, getAimAngle, setAimAngle, charge, charging, resetCharge, keys } from "./input.js";
import {
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
  getRewardRerollButtonLayout,
  drawPauseMenu,
  getPauseButtonsLayout,
  drawArrowsInModifiers,
  setCanvasSize,
  drawTerrainZones,
  drawBackground,
} from "./render.js";
import {
  initWindOverlay,
  updateWindUniforms,
  setWindUniformsFromField,
  setWindVisible,
  toggleWind as toggleWindThree,
  isWindVisible as isWindThreeVisible,
  renderWind,
  resizeWindOverlay,
  getWindUniforms,
} from "./windThree.js";
import { getFieldComponents, getSourcePositions, getSinkPositions, getVortexPositions, getDoubletPositions, SOFTENING_A } from "./vectorField.js";
import { COURSES_KEY, generateCourse, loadCourses as loadCoursesFromStorage, saveCourses as saveCoursesToStorage, exportCourse, importCourse, validateCourse } from "./courses.js";

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const FIXED_DT = 1 / 60;

let canvas;
let ctx;
let bgCanvas;
let bgCtx;
// Background images for REQ-030: tiled grass (level) vs splash (main menu)
const grassImg = new Image();
grassImg.src = './img/grass_seamless.webp';
const splashImg = new Image();
splashImg.src = './img/gfg-splash.png';
splashImg.onerror = () => {
  // Fallback typo file in repo is gfg-spash.png
  if (splashImg.src.includes('gfg-splash.png')) {
    splashImg.src = './img/gfg-spash.png';
  }
};
const GRASS_SCALE = 0.38; // scale down grass so strands appear smaller (1024 -> ~389)
let grassPattern = null;
let grassPatternScaledCanvas = null;
function ensureGrassPattern() {
  try {
    if (grassImg.complete && grassImg.naturalWidth && bgCtx) {
      const sw = Math.max(1, Math.round(grassImg.naturalWidth * GRASS_SCALE));
      const sh = Math.max(1, Math.round(grassImg.naturalHeight * GRASS_SCALE));
      const off = document.createElement('canvas');
      off.width = sw;
      off.height = sh;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(grassImg, 0, 0, sw, sh);
      grassPatternScaledCanvas = off;
      grassPattern = bgCtx.createPattern(off, 'repeat');
    }
  } catch {}
}
function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
}
function maybeHideLoadingAfterSplash() {
  // Hide once splash is decoded/complete; grass not required
  try {
    if (splashImg.complete && splashImg.naturalWidth) {
      hideLoadingScreen();
      return true;
    }
    // Try decode promise
    if (splashImg.decode) {
      splashImg.decode().then(hideLoadingScreen).catch(hideLoadingScreen);
      return false;
    }
  } catch {}
  return false;
}
if (typeof window !== 'undefined') {
  grassImg.onload = () => { ensureGrassPattern(); redrawBottom(); };
  splashImg.onload = () => { redrawBottom(); maybeHideLoadingAfterSplash(); };
  splashImg.onerror = () => { /* try fallback already */ setTimeout(() => { redrawBottom(); hideLoadingScreen(); }, 50); };
  // Also attempt hide after short timeout to avoid stuck Loading... if image cached
  setTimeout(() => { if (splashImg.complete && splashImg.naturalWidth) hideLoadingScreen(); }, 500);
  // Ensure fallback hide even if image fails completely
  setTimeout(() => hideLoadingScreen(), 3000);
}
function redrawBottom() {
  if (!bgCanvas || !bgCtx) return;
  // Ensure pattern exists
  if (!grassPattern) ensureGrassPattern();
  const dpr = window.devicePixelRatio || 1;
  // Use helper from render if available, else fallback
  try {
    // drawBackground is imported from render.js — but to avoid circular deps we handle inline
    // Use logical W/H with DPR transform already set in setupCanvases
    bgCtx.save();
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mainMenuVisible && !isInLevelPause) {
      // splash cover only for entry menu (no active run or after End Run); in-level pause keeps grass
      bgCtx.fillStyle = '#1a1a1a';
      bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      if (splashImg.complete && splashImg.naturalWidth) {
        const scale = Math.max(LOGICAL_W / splashImg.naturalWidth, LOGICAL_H / splashImg.naturalHeight);
        const w = splashImg.naturalWidth * scale;
        const h = splashImg.naturalHeight * scale;
        const x = (LOGICAL_W - w) / 2;
        const y = (LOGICAL_H - h) / 2;
        bgCtx.drawImage(splashImg, x, y, w, h);
      } else {
        bgCtx.fillStyle = '#2c3e50';
        bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }
    } else if (level && level.terrain && level.terrain.fairwayPath) {
      // New pipeline: zoned terrain with fixed palette per REQ-010/033
      try {
        drawTerrainZones(bgCtx, level, LOGICAL_W, LOGICAL_H);
      } catch (e) {
        console.warn('drawTerrainZones failed', e);
        bgCtx.fillStyle = '#3a9d23';
        bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }
    } else {
      // grass tiled scaled down so strands appear smaller (legacy fallback)
      if (!grassPattern) ensureGrassPattern();
      if (grassPattern) {
        bgCtx.fillStyle = grassPattern;
        bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      } else if (grassImg.complete && grassImg.naturalWidth) {
        // fallback manual tiled scaled
        try {
          const iw = Math.round(grassImg.naturalWidth * GRASS_SCALE);
          const ih = Math.round(grassImg.naturalHeight * GRASS_SCALE);
          bgCtx.fillStyle = '#3a9d23';
          bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
          for (let y = 0; y < LOGICAL_H; y += ih) {
            for (let x = 0; x < LOGICAL_W; x += iw) {
              bgCtx.drawImage(grassImg, x, y, iw, ih);
            }
          }
        } catch {
          bgCtx.fillStyle = '#3a9d23';
          bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        }
      } else {
        bgCtx.fillStyle = '#3a9d23';
        bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }
    }
    bgCtx.restore();
  } catch {}
}
let gameState = "AIMING"; // AIMING, CHARGING, FLYING, WIN
let accumulator = 0;
let lastTime = 0;
let level = LEVEL;
let windStrength = level.field.strength ?? WIND_STRENGTH;
let currentHoleIndex = 0;
let holeAttempts = 0;
let totalAttempts = 0;
let attempts = 0; // alias for totalAttempts for backward compat

// Course collection per REQ-031
let courses = [];
let activeCourse = null;
let activeCourseId = null;

function getActiveCourse() { return activeCourse; }
function setActiveCourse(course) {
  activeCourse = course;
  activeCourseId = course ? course.id : null;
  if (course && Array.isArray(course.holes)) {
    // Sync global LEVELS to active course holes for backward compat
    try {
      LEVELS.length = 0;
      for (const h of course.holes) LEVELS.push(h);
      // Also update LEVEL alias to first hole
      Object.assign(LEVEL, LEVELS[0] || {});
      if (LEVELS[0]) {
        LEVEL.canvas = LEVELS[0].canvas;
        LEVEL.tee = LEVELS[0].tee;
        LEVEL.hole = LEVELS[0].hole;
        LEVEL.obstacles = LEVELS[0].obstacles;
        LEVEL.field = LEVELS[0].field;
      }
    } catch {}
  }
}
function loadCourses() {
  try {
    courses = loadCoursesFromStorage();
  } catch (e) {
    courses = loadCoursesFromStorage();
  }
  // Ensure activeCourse is set if we have a saved courseId later via loadProgress
  return courses;
}
function saveCourses() {
  try { saveCoursesToStorage(courses); } catch {}
}
function findCourseById(id) { return courses.find(c => c.id === id) || null; }

// Modifier system per REQ-015 + REQ-020 (supply-limited) + transparent/collapsible per REQ-012/015/020
let modifiers = [];
let selectedModifier = null;
let mousePos = null;
let hotbarEl = null;
let hotbarToggleEl = null;
let draggingIdx = -1;
let isDragging = false;
let isHotbarCollapsed = false;
function isHotbarCollapsedState() { return isHotbarCollapsed; }
function syncHotbarCollapsedUI() {
  if (!hotbarEl) return;
  hotbarEl.classList.toggle("collapsed", isHotbarCollapsed);
  if (hotbarToggleEl) {
    hotbarToggleEl.textContent = isHotbarCollapsed ? "▴" : "▾";
    const label = isHotbarCollapsed ? "Expand modifiers" : "Collapse modifiers";
    hotbarToggleEl.setAttribute("aria-label", label);
    hotbarToggleEl.title = label;
  }
}
function toggleHotbar() {
  // Only meaningful during AIMING/CHARGING and when not hidden by FLYING/WIN/reward/pause/mainMenu
  // Still allow toggle even if hidden — will be visible on next AIMING entry as collapsed state is ephemeral
  isHotbarCollapsed = !isHotbarCollapsed;
  // Do NOT deselect active modifier when collapsing — selection persists per updated REQ-015
  syncHotbarCollapsedUI();
  updateHotbarUI();
  return isHotbarCollapsed;
}
function resetHotbarCollapsed() {
  isHotbarCollapsed = false;
  syncHotbarCollapsedUI();
}

// Supply per REQ-020: per-type inventory, starts with one of each on new game
let supply = { amplify: 1, nullify: 1, flip: 1 };

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
  supply = { amplify: 1, nullify: 1, flip: 1 };
  updateHotbarUI();
}

function consumePlacedModifiersFromSupply() {
  if (!modifiers || !modifiers.length) return;
  // REQ-035: each placed modifier consumed from supply on level win, clamped >=0, exactly once per win
  const snapshot = [...modifiers];
  for (const m of snapshot) {
    if (m.type && m.type in supply) {
      supply[m.type] = Math.max(0, supply[m.type] - 1);
    }
  }
  updateHotbarUI();
}

// Free shots hidden counter per REQ-022 - conditional attempt counting
let freeShots = 0;
function getFreeShots() { return freeShots; }
function setFreeShots(v) { freeShots = Math.max(0, Math.floor(v)); }
function addFreeShots(n = 1) { freeShots = Math.max(0, freeShots + Math.floor(n)); }

// Modifier Area +20% per REQ-023 - additive stacking, hidden bonus
const BASE_MODIFIER_RADIUS = MODIFIER_RADIUS; // 54 base per REQ-015 (reduced 40% from 90 = 90*0.6)
let areaUpgradeCount = 0;
function getAreaUpgradeCount() { return areaUpgradeCount; }
function getAreaMultiplier() { return (5 + areaUpgradeCount) / 5; }
function getEffectiveModifierRadius() { return (BASE_MODIFIER_RADIUS * (10 + 2 * areaUpgradeCount)) / 10; }
function addAreaUpgrade(n = 1) {
  areaUpgradeCount = Math.max(0, areaUpgradeCount + Math.floor(n));
  // Retroactively grow existing modifiers per REQ-023 (if called via helper or reward)
  const newR = getEffectiveModifierRadius();
  for (const m of modifiers) m.radius = newR;
  syncModifiersToField();
}

// Bouncy Ball +1 per REQ-024 - additive stacking, hidden per-attempt tracker
let bouncyBallCount = 0;
let bouncyRemaining = 0;
function getBouncyBallCount() { return bouncyBallCount; }
function getBouncyRemaining() { return bouncyRemaining; }
function getBouncyCount() { return bouncyBallCount; } // alias
function addBouncyBall(n = 1) {
  bouncyBallCount = Math.max(0, bouncyBallCount + Math.floor(n));
  // REQ-024: update remaining for next attempt (if in AIMING/CHARGING, reflect immediately for test)
  bouncyRemaining = bouncyBallCount;
}
function setBouncyBallCount(v) { bouncyBallCount = Math.max(0, Math.floor(v)); bouncyRemaining = bouncyBallCount; }
function initBouncyForAttempt() { bouncyRemaining = bouncyBallCount; }

// Persistent Progress via Local Storage per REQ-027 — save on each attempt, resume on revisit
const STORAGE_KEY = "golfVectorField.progress.v1";
function getSavePayload() {
  // sharpshooterCount may not exist (REQ-026 optional) — fallback 0
  let sharpshooterVal = 0;
  try { if (typeof sharpshooterCount !== 'undefined') sharpshooterVal = sharpshooterCount; } catch {}
  return {
    version: 1,
    courseId: activeCourseId || (activeCourse ? activeCourse.id : null),
    currentHoleIndex,
    holeAttempts,
    totalAttempts,
    supply: { ...supply },
    freeShots,
    areaUpgradeCount,
    bouncyBallCount,
    sharpshooterCount: sharpshooterVal,
    secretRewardCounter,
    rewardPending,
    firstRewardClaimed,
    rewardOffered: [...rewardOffered],
    rewardRerolled,
    rewardMenuVisible,
    modifiers: modifiers.map(m => ({ type: m.type, x: m.x, y: m.y, radius: m.radius })),
    aimAngle: getAimAngle(),
    rewardChosenCounts: { ...rewardChosenCounts },
    paused: pauseMenuVisible,
    savedAt: Date.now()
  };
}
function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavePayload()));
  } catch (e) {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return null;
    // REQ-031: course binding - verify courseId exists
    if (d.courseId) {
      const found = findCourseById(d.courseId);
      if (!found) return null;
      setActiveCourse(found);
    } else if (courses.length > 0) {
      // Legacy save without courseId - bind to first course
      setActiveCourse(courses[0]);
    }
    const maxHole = activeCourse ? activeCourse.holes.length : LEVELS.length;
    // clamp & validate — missing fields default to 0/false/[]
    currentHoleIndex = Math.max(0, Math.min(maxHole - 1, Math.floor(d.currentHoleIndex || 0)));
    activeCourseId = d.courseId || (activeCourse ? activeCourse.id : null);
    holeAttempts = Math.max(0, Math.floor(d.holeAttempts || 0));
    totalAttempts = Math.max(0, Math.floor(d.totalAttempts || 0));
    attempts = totalAttempts;
    supply = {
      amplify: Math.max(0, Math.floor(d.supply?.amplify || 0)),
      nullify: Math.max(0, Math.floor(d.supply?.nullify || 0)),
      flip: Math.max(0, Math.floor(d.supply?.flip || 0))
    };
    freeShots = Math.max(0, Math.floor(d.freeShots || 0));
    areaUpgradeCount = Math.max(0, Math.floor(d.areaUpgradeCount || 0));
    bouncyBallCount = Math.max(0, Math.floor(d.bouncyBallCount || 0));
    bouncyRemaining = bouncyBallCount;
    try { if (typeof sharpshooterCount !== 'undefined' && typeof d.sharpshooterCount === 'number') sharpshooterCount = Math.max(0, Math.floor(d.sharpshooterCount || 0)); } catch {}
    secretRewardCounter = Math.max(0, Math.min(4, Math.floor(d.secretRewardCounter || 0)));
    rewardPending = !!d.rewardPending;
    firstRewardClaimed = !!d.firstRewardClaimed;
    rewardOffered = Array.isArray(d.rewardOffered) && d.rewardOffered.length === 3 ? [...d.rewardOffered] : [];
    rewardRerolled = !!d.rewardRerolled;
    rewardMenuVisible = !!d.rewardMenuVisible && rewardOffered.length === 3;
    if (Array.isArray(d.modifiers)) {
      const effR = getEffectiveModifierRadius();
      modifiers = d.modifiers.filter(m => m && typeof m.x === 'number' && typeof m.y === 'number' && typeof m.type === 'string').map(m => ({
        id: m.id ?? (Date.now() + Math.random()),
        type: m.type,
        x: Math.max(0, Math.min(LOGICAL_W, Number(m.x))),
        y: Math.max(0, Math.min(LOGICAL_H, Number(m.y))),
        radius: effR
      }));
    } else {
      modifiers = [];
    }
    if (typeof d.aimAngle === 'number' && Number.isFinite(d.aimAngle)) {
      try { setAimAngle(d.aimAngle); } catch {}
    }
    if (d.rewardChosenCounts && typeof d.rewardChosenCounts === 'object') {
      for (const k of Object.keys(rewardChosenCounts)) {
        if (k in d.rewardChosenCounts) rewardChosenCounts[k] = Math.max(0, Math.floor(d.rewardChosenCounts[k] || 0));
      }
    } else if (d.version === 1) {
      // Derive from existing counters for old saves
      rewardChosenCounts.amplify = Math.max(0, Math.floor(d.supply?.amplify || supply.amplify || 0));
      rewardChosenCounts.nullify = Math.max(0, Math.floor(d.supply?.nullify || supply.nullify || 0));
      rewardChosenCounts.flip = Math.max(0, Math.floor(d.supply?.flip || supply.flip || 0));
      rewardChosenCounts.areaUp = Math.max(0, Math.floor(d.areaUpgradeCount || areaUpgradeCount || 0));
      rewardChosenCounts.bouncyBall = Math.max(0, Math.floor(d.bouncyBallCount || bouncyBallCount || 0));
      // freeShots times chosen cannot be derived, stays 0 if missing
    }
    // Do not restore paused state as visible on load — resume as AIMING
    pauseMenuVisible = false; pauseMenuHover = null;
    return d;
  } catch {
    return null;
  }
}
function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// Pause Menu per REQ-028 — Escape, Resume/New Game, reward stats xN
let pauseMenuVisible = false;
let pauseMenuHover = null;
let rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
function getRewardChosenCounts() { return { ...rewardChosenCounts }; }
function getRewardChosenCount(type) { return Math.max(0, Math.floor(rewardChosenCounts[type] || 0)); }
function setRewardChosenCounts(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(rewardChosenCounts)) {
    if (k in obj) rewardChosenCounts[k] = Math.max(0, Math.floor(obj[k] || 0));
  }
}
function resumeGame() {
  if (!pauseMenuVisible) return false;
  pauseMenuVisible = false;
  pauseMenuHover = null;
  if (canvas) canvas.style.cursor = "default";
  syncPauseOverlay();
  return true;
}
function startNewGame() {
  clearProgress();
  // Generate fresh 18 levels with increasing difficulty per REQ-010
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {}
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { amplify: 1, nullify: 1, flip: 1 };
  freeShots = 0; areaUpgradeCount = 0; bouncyBallCount = 0; bouncyRemaining = 0;
  try { if (typeof sharpshooterCount !== 'undefined') sharpshooterCount = 0; } catch {}
  secretRewardCounter = 0; rewardPending = false; firstRewardClaimed = false;
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  pauseMenuVisible = false; pauseMenuHover = null;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  loadLevel(0);
  gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden");
  syncPauseOverlay();
  updateAttemptsUI(); updateHotbarUI();
  maybeShowRewardMenu();
  return true;
}
function isPauseMenuVisible() { return pauseMenuVisible; }

// Main Menu per REQ-029 — Continue (conditional) / New Game / Help / End Run, no backdrop over splash, backdrop over paused field (REQ-028)
let mainMenuVisible = false;
let mainMenuHover = null;
let courseMenuVisible = false;
let helpVisible = false;
let isInLevelPause = false;
function hasRestorableSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1 || !d.courseId) return false;
    return !!findCourseById(d.courseId);
  } catch { return false; }
}
function renderMainMenuRootVisibility() {
  const contBtn = document.getElementById('continue-button');
  const endBtn = document.getElementById('end-run-button');
  const newGameBtn = document.getElementById('new-game-button');
  const showSave = hasRestorableSave();
  const isPause = !!isInLevelPause;
  if (contBtn) contBtn.classList.toggle('hidden', !showSave);
  // Splash never shows End Run, even if save exists; pause shows End Run only if save exists
  if (endBtn) endBtn.classList.toggle('hidden', !isPause || !showSave);
  // Pause never shows New Game, entry always shows New Game
  if (newGameBtn) newGameBtn.classList.toggle('hidden', !!isPause);
}
function showMainMenuRoot() {
  courseMenuVisible = false;
  helpVisible = false;
  const root = document.getElementById('main-menu-root');
  const cm = document.getElementById('course-menu');
  const hm = document.getElementById('help-overlay');
  const mmc = document.querySelector('.main-menu-content');
  if (mmc) mmc.classList.remove('hidden');
  if (root) root.classList.remove('hidden');
  if (cm) cm.classList.add('hidden');
  if (hm) hm.classList.add('hidden');
  // Reset course submenu inner states when returning to root
  const ncc = document.getElementById('new-course-choices');
  const nccDiff = document.getElementById('new-course-choices-difficulty');
  const ia = document.getElementById('import-area');
  const cmf = document.getElementById('course-menu-footer');
  const ie = document.getElementById('import-error');
  if (ncc) ncc.classList.add('hidden');
  if (nccDiff) nccDiff.classList.add('hidden');
  if (ia) ia.classList.add('hidden');
  if (cmf) cmf.classList.remove('hidden');
  if (ie) { ie.textContent = ''; ie.classList.add('hidden'); }
  renderMainMenuRootVisibility();
}
function showCourseMenu() {
  // Pause never shows New Game / course list — guard
  if (isInLevelPause) return;
  courseMenuVisible = true;
  helpVisible = false;
  const root = document.getElementById('main-menu-root');
  const cm = document.getElementById('course-menu');
  const hm = document.getElementById('help-overlay');
  const mmc = document.querySelector('.main-menu-content');
  if (mmc) mmc.classList.remove('hidden');
  if (root) root.classList.add('hidden');
  if (cm) cm.classList.remove('hidden');
  if (hm) hm.classList.add('hidden');
  // Ensure inner choices hidden and footer visible when entering course menu
  const ncc = document.getElementById('new-course-choices');
  const nccDiff = document.getElementById('new-course-choices-difficulty');
  const ia = document.getElementById('import-area');
  const cmf = document.getElementById('course-menu-footer');
  const ie = document.getElementById('import-error');
  if (ncc) ncc.classList.add('hidden');
  if (nccDiff) nccDiff.classList.add('hidden');
  if (ia) ia.classList.add('hidden');
  if (cmf) cmf.classList.remove('hidden');
  if (ie) { ie.textContent = ''; ie.classList.add('hidden'); }
  try { renderCourseList(); } catch {}
}
function showHelpOverlay() {
  helpVisible = true;
  courseMenuVisible = false;
  const hm = document.getElementById('help-overlay');
  const mmc = document.querySelector('.main-menu-content');
  if (mmc) mmc.classList.add('hidden');
  if (hm) hm.classList.remove('hidden');
}
function handleContinue() {
  // In-level pause (Escape during active run): simply hide overlay and resume preserving ball
  if (isInLevelPause && mainMenuVisible) {
    mainMenuVisible = false;
    courseMenuVisible = false;
    helpVisible = false;
    isInLevelPause = false;
    syncMainMenu();
    syncPauseOverlay();
    return true;
  }
  // Entry resume (after reload, no in-memory run): load from storage
  if (!hasRestorableSave()) return false;
  const data = loadProgress();
  if (!data) return false;
  // loadProgress already restored state via side-effects
  mainMenuVisible = false;
  courseMenuVisible = false;
  helpVisible = false;
  isInLevelPause = false;
  // loadProgress put us in correct course/level but we need to set up field/ball
  try {
    level = LEVELS[currentHoleIndex];
    windStrength = level.field.strength ?? WIND_STRENGTH;
    createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
    syncModifiersToField();
    createBall(level.tee);
    bouncyRemaining = bouncyBallCount;
    gameState = "AIMING";
    if (winOverlay) winOverlay.classList.add("hidden");
    resetHotbarCollapsed();
    updateAttemptsUI();
    updateHotbarUI();
    syncMainMenu();
    syncPauseOverlay();
    // draw grass now
    redrawBottom();
  } catch (e) { console.warn('continue resume failed', e); return false; }
  return true;
}
function openInLevelPause() {
  // Show main menu with backdrop shadowing field, works even in FLYING
  if (rewardMenuVisible || gameState === "WIN") return false;
  // Only if a run is active (has course and not already showing menu)
  if (mainMenuVisible) return false;
  if (!activeCourse && !hasRestorableSave()) return false;
  // If no activeCourse but hasRestorableSave, set activeCourse from storage courseId for display purposes? Keep current level's course
  // Show overlay with backdrop
  isInLevelPause = true;
  mainMenuVisible = true;
  courseMenuVisible = false;
  helpVisible = false;
  syncMainMenu();
  return true;
}
const HIGH_SCORE_KEY = "golfVectorField.highScore.v1";
function getHighScore() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && typeof d.bestTotal === 'number' && Number.isFinite(d.bestTotal)) return Math.max(0, Math.floor(d.bestTotal));
    if (typeof d === 'number' && Number.isFinite(d)) return Math.max(0, Math.floor(d));
    return null;
  } catch { return null; }
}
function setHighScore(n) {
  try { localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({ version: 1, bestTotal: Math.max(0, Math.floor(n)) })); } catch {}
}
function clearHighScore() { try { localStorage.removeItem(HIGH_SCORE_KEY); } catch {} }
function maybeUpdateHighScore() {
  if (!activeCourse) return;
  if (currentHoleIndex !== activeCourse.holes.length - 1 || gameState !== "WIN") return;
  // Legacy global high score (migration)
  const prev = getHighScore();
  if (prev == null || totalAttempts < prev) setHighScore(totalAttempts);
  // Per-course bestTotal per REQ-031
  if (activeCourse.bestTotal == null || totalAttempts < activeCourse.bestTotal) {
    activeCourse.bestTotal = totalAttempts;
    try { saveCourses(); } catch {}
    // Re-render course list to show new record
    try { renderCourseList(); } catch {}
  }
}
function maybeUpdateCourseRecord() { return maybeUpdateHighScore(); }
function getCourseRecord(courseId) {
  const c = findCourseById(courseId);
  return c ? c.bestTotal : null;
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    const container = document.getElementById('game-container');
    if (container) container.appendChild(t); else document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

function renderCourseList() {
  const list = document.getElementById('course-list');
  if (!list) return;
  list.innerHTML = '';
  for (const course of courses) {
    const row = document.createElement('div');
    row.className = 'course-row';
    row.dataset.courseId = course.id;
    const playBtn = document.createElement('button');
    playBtn.className = 'course-play-button';
    const record = course.bestTotal == null ? '—' : String(course.bestTotal);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'course-name';
    nameSpan.textContent = course.name;
    const metaSpan = document.createElement('span');
    metaSpan.className = 'course-meta';
    metaSpan.textContent = `${course.holeCount} holes \u2003 Record: ${record}`;
    playBtn.appendChild(nameSpan);
    playBtn.appendChild(metaSpan);
    playBtn.title = `Play ${course.name} (${course.holeCount} holes)`;
    playBtn.addEventListener('click', () => handleCoursePlay(course.id));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'course-delete-button';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Delete course';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`Delete course "${course.name}"?`)) return;
      const idx = courses.findIndex(c => c.id === course.id);
      if (idx !== -1) {
        const wasActive = activeCourseId === course.id || (activeCourse && activeCourse.id === course.id);
        courses.splice(idx, 1);
        if (wasActive) {
          clearProgress();
          if (courses.length) {
            setActiveCourse(courses[0]);
          } else {
            activeCourse = null;
            activeCourseId = null;
            // Keep LEVELS as is until next course creation/play; no auto-create default here per updated REQ-031
            try { LEVELS.length = 0; } catch {}
          }
        }
        // Allow empty collection per updated REQ-031 — persist [] and show empty list
        saveCourses();
        renderCourseList();
        try { renderMainMenuRootVisibility(); } catch {}
      }
    });
    row.appendChild(playBtn);
    row.appendChild(deleteBtn);
    list.appendChild(row);
  }
  // After rendering, ensure Continue visibility is up to date (in case active course deleted)
  try { renderMainMenuRootVisibility(); } catch {}
}

function handleCoursePlay(courseId) {
  const course = findCourseById(courseId);
  if (!course) return;
  setActiveCourse(course);
  clearProgress();
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { amplify: 1, nullify: 1, flip: 1 }; freeShots = 0; areaUpgradeCount = 0; bouncyBallCount = 0; bouncyRemaining = 0;
  try { if (typeof sharpshooterCount !== 'undefined') sharpshooterCount = 0; } catch {}
  secretRewardCounter = 0; rewardPending = false; firstRewardClaimed = false;
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  pauseMenuVisible = false; pauseMenuHover = null; mainMenuVisible = false; mainMenuHover = null; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  loadLevel(0); gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden");
  syncPauseOverlay(); syncMainMenu();
  updateAttemptsUI(); updateHotbarUI();
  maybeShowRewardMenu();
  saveProgress();
}

function exportCourseById(courseId) {
  const course = findCourseById(courseId) || activeCourse;
  if (!course) return;
  try {
    const b64 = exportCourse(course);
    // Try clipboard
    let done = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(b64).then(() => {
        showToast('copied to clipboard');
      }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = b64;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
        showToast('copied to clipboard');
      });
      done = true;
      // Also expose for tests
      window.__lastExported = b64;
      if (!done) showToast('copied to clipboard');
      return b64;
    } else {
      const ta = document.createElement('textarea');
      ta.value = b64;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      window.__lastExported = b64;
      showToast('copied to clipboard');
      return b64;
    }
  } catch (e) {
    console.warn('export failed', e);
    showToast('Copy failed');
  }
}

function createNewCourseWithHoles(holeCount, difficulty) {
  try {
    const opts = difficulty && ['easy','medium','hard'].includes(difficulty) ? { difficulty } : {};
    const c = (holeCount === 3 && difficulty) ? generateCourse(holeCount, Date.now(), opts) : generateCourse(holeCount, Date.now(), opts);
    courses.push(c);
    saveCourses();
    renderCourseList();
    showToast('Course created');
    return c;
  } catch (e) {
    console.error(e);
  }
}

function syncMainMenu() {
  const el = document.getElementById("main-menu-overlay");
  if (el) {
    if (mainMenuVisible) {
      el.classList.remove("hidden");
      // Backdrop: transparent over splash (entry), dim over paused field (Escape in level)
      el.classList.toggle("with-backdrop", !!isInLevelPause);
      el.dataset.mode = isInLevelPause ? "pause" : "entry";
      // Sync sub-views (help-overlay is sibling of .main-menu-content)
      const mmc = document.querySelector('.main-menu-content');
      const root = document.getElementById('main-menu-root');
      const cm = document.getElementById('course-menu');
      const hm = document.getElementById('help-overlay');
      if (helpVisible) {
        if (mmc) mmc.classList.add('hidden');
        if (hm) hm.classList.remove('hidden');
      } else {
        if (mmc) mmc.classList.remove('hidden');
        if (hm) hm.classList.add('hidden');
        if (courseMenuVisible) {
          if (root) root.classList.add('hidden');
          if (cm) cm.classList.remove('hidden');
          // Ensure inner choices hidden when showing course menu via direct flag
          const ncc2 = document.getElementById('new-course-choices');
          const nccDiff2 = document.getElementById('new-course-choices-difficulty');
          const ia2 = document.getElementById('import-area');
          const cmf2 = document.getElementById('course-menu-footer');
          if (ncc2) ncc2.classList.add('hidden');
          if (nccDiff2) nccDiff2.classList.add('hidden');
          if (ia2) ia2.classList.add('hidden');
          if (cmf2) cmf2.classList.remove('hidden');
          try { renderCourseList(); } catch {}
        } else {
          if (root) root.classList.remove('hidden');
          if (cm) cm.classList.add('hidden');
          renderMainMenuRootVisibility();
        }
      }
    } else {
      el.classList.add("hidden");
      el.classList.remove("with-backdrop");
      el.dataset.mode = "";
    }
  }
  // Ensure bottom background reflects mode (splash vs grass, entry vs pause) per REQ-030
  redrawBottom();
  // Wind overlay: hidden on entry splash, visible on level and also while paused with backdrop (field dimmed but wind still animates)
  try { const showWind = !mainMenuVisible || isInLevelPause; setWindVisible(showWind); } catch {}
  updateHotbarUI();
}
function isMainMenuVisible() { return mainMenuVisible; }
function startNewGameFromMain() {
  clearProgress();
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {}
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { amplify: 1, nullify: 1, flip: 1 }; freeShots = 0; areaUpgradeCount = 0; bouncyBallCount = 0; bouncyRemaining = 0;
  try { if (typeof sharpshooterCount !== 'undefined') sharpshooterCount = 0; } catch {}
  secretRewardCounter = 0; rewardPending = false; firstRewardClaimed = false;
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  pauseMenuVisible = false; pauseMenuHover = null; mainMenuVisible = false; mainMenuHover = null; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  loadLevel(0); gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden");
  syncPauseOverlay(); syncMainMenu();
  updateAttemptsUI(); updateHotbarUI();
  maybeShowRewardMenu();
  return true;
}
function endRun() {
  // Allow End Run from either legacy pause or new in-level pause (main menu with backdrop)
  if (!pauseMenuVisible && !(mainMenuVisible && isInLevelPause)) return false;
  clearProgress();
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { amplify: 1, nullify: 1, flip: 1 }; freeShots = 0; areaUpgradeCount = 0; bouncyBallCount = 0; bouncyRemaining = 0;
  try { if (typeof sharpshooterCount !== 'undefined') sharpshooterCount = 0; } catch {}
  secretRewardCounter = 0; rewardPending = false; firstRewardClaimed = false;
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  pauseMenuVisible = false; pauseMenuHover = null; mainMenuVisible = true; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  loadLevel(0); gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden");
  syncPauseOverlay(); syncMainMenu();
  updateAttemptsUI(); updateHotbarUI();
  // Do NOT call maybeShowRewardMenu and do NOT update bestTotal — abandoned run shall not count toward record
  return true;
}

function selectHole(n) {
  // Secret: 1-indexed hole number (1..LEVELS.length)
  const idx = Math.floor(Number(n)) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= LEVELS.length) return false;
  currentHoleIndex = idx;
  holeAttempts = 0;
  loadLevel(currentHoleIndex);
  gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden");
  // Hide any win state
  updateAttemptsUI();
  updateForceBar();
  // Re-init bouncy for new hole (loadLevel already does)
  bouncyRemaining = bouncyBallCount;
  // Check reward menu if needed for current totalAttempts
  maybeShowRewardMenu();
  saveProgress();
  // Update URL hash for sharing without reload (secret but visible)
  try { history.replaceState(null, "", `#hole-${idx+1}`); } catch {}
  return true;
}

function getSecretHoleFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    let h = params.get("hole") || params.get("level") || params.get("lvl");
    if (h) return parseInt(h,10);
    const hash = window.location.hash || "";
    const m = hash.match(/hole[-_]?(\d+)/i) || hash.match(/#(\d+)$/);
    if (m) return parseInt(m[1],10);
  } catch {}
  return null;
}

function bounceBall(hit, isEdge) {
  if (isEdge) {
    // Edge: reflect velocity component and clamp inside
    if (ball.pos.x - BALL_RADIUS < 0 || ball.pos.x + BALL_RADIUS > LOGICAL_W) {
      ball.vel.x *= -BOUNCE_DAMPING;
      ball.pos.x = Math.max(BALL_RADIUS, Math.min(LOGICAL_W - BALL_RADIUS, ball.pos.x));
    }
    if (ball.pos.y - BALL_RADIUS < 0 || ball.pos.y + BALL_RADIUS > LOGICAL_H) {
      ball.vel.y *= -BOUNCE_DAMPING;
      ball.pos.y = Math.max(BALL_RADIUS, Math.min(LOGICAL_H - BALL_RADIUS, ball.pos.y));
    }
    // Corner: both inverted above
  } else if (hit) {
    if (hit.type === 'rect') {
      const cx = Math.max(hit.x, Math.min(ball.pos.x, hit.x + hit.w));
      const cy = Math.max(hit.y, Math.min(ball.pos.y, hit.y + hit.h));
      let nx = ball.pos.x - cx, ny = ball.pos.y - cy;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const dot = ball.vel.x * nx + ball.vel.y * ny;
      ball.vel.x = (ball.vel.x - 2 * dot * nx) * BOUNCE_DAMPING;
      ball.vel.y = (ball.vel.y - 2 * dot * ny) * BOUNCE_DAMPING;
      ball.pos.x = cx + nx * (BALL_RADIUS + 0.5);
      ball.pos.y = cy + ny * (BALL_RADIUS + 0.5);
    } else if (hit.type === 'circle') {
      let nx = ball.pos.x - hit.x, ny = ball.pos.y - hit.y;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const dot = ball.vel.x * nx + ball.vel.y * ny;
      ball.vel.x = (ball.vel.x - 2 * dot * nx) * BOUNCE_DAMPING;
      ball.vel.y = (ball.vel.y - 2 * dot * ny) * BOUNCE_DAMPING;
      ball.pos.x = hit.x + nx * (hit.r + BALL_RADIUS + 0.5);
      ball.pos.y = hit.y + ny * (hit.r + BALL_RADIUS + 0.5);
    }
  }
  ball.isMoving = true;
}

// Reward menu per REQ-021/023/024: secret counter per-hole (reset to 0 on each hole advance, reward before first attempt on holes >0) - 3 random of 6 pool
const REWARD_POOL = ['amplify', 'nullify', 'flip', 'freeShots', 'areaUp', 'bouncyBall'];
let rewardMenuVisible = false;
let rewardClaimedFor = null; // last totalAttempts value claimed, kept for backward compat/debug
let rewardMenuHover = null; // hovered type for visual feedback
let rewardOffered = []; // 3 distinct types randomly chosen from REWARD_POOL per trigger
// Secret hidden counter per-hole per updated REQ-021: increments only on counted (non-free) shots, first reward on hole 1 after 5, subsequent holes reward before first attempt with counter 0 at entry
let secretRewardCounter = 0; // hidden 0..4 per-hole
let rewardPending = false;
let firstRewardClaimed = false; // kept for backward compat but no longer triggers initial menu
let rewardRerolled = false; // per-menu flag per REQ-025, false when menu freshly shown
let rewardRerollHover = false; // hover for re-roll button

function getSecretRewardCounter() { return secretRewardCounter; }
function setSecretRewardCounter(v) { secretRewardCounter = Math.max(0, Math.floor(v)); }
function addSecretRewardCounter(n = 1) { secretRewardCounter = Math.max(0, secretRewardCounter + Math.floor(n)); }
function getRewardRerolled() { return rewardRerolled; }
function rerollReward() {
  if (!rewardMenuVisible || rewardRerolled) return false;
  // Cost is always 1 attempt, never free shot, never secret counter per REQ-025
  holeAttempts += 1;
  totalAttempts += 1;
  attempts = totalAttempts;
  updateAttemptsUI();
  rewardRerolled = true;
  // New random 3-set from same 6-pool, keep menu visible
  rewardOffered = shuffleArray([...REWARD_POOL]).slice(0, 3);
  rewardMenuHover = null;
  rewardRerollHover = false;
  saveProgress();
  return true;
}

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
  if (pauseMenuVisible) return;
  if (mainMenuVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (rewardMenuVisible) return;
  // REQ-021 per-hole: no reward before first attempt on hole 1, reward before first attempt on holes >0 via rewardPending set on hole entry
  if (rewardPending) {
    rewardOffered = shuffleArray([...REWARD_POOL]).slice(0, 3);
    rewardMenuVisible = true;
    rewardMenuHover = null;
    rewardPending = false;
    rewardRerolled = false;
    rewardRerollHover = false;
    updateHotbarUI();
    saveProgress();
    return;
  }
}

function claimReward(type) {
  if (!rewardMenuVisible) return false;
  if (!rewardOffered.includes(type)) return false;
  // Idempotent: only once per trigger (rewardMenuVisible guards double-click)
  if (type === 'freeShots') {
    addFreeShots(3); // REQ-022: Free Shots +3
    rewardChosenCounts.freeShots = Math.max(0, (rewardChosenCounts.freeShots || 0) + 1);
  } else if (type === 'areaUp') {
    addAreaUpgrade(1); // REQ-023: Area +20% additive (addAreaUpgrade handles retroactive grow + sync)
    rewardChosenCounts.areaUp = Math.max(0, (rewardChosenCounts.areaUp || 0) + 1);
  } else if (type === 'bouncyBall') {
    addBouncyBall(1); // REQ-024: Bouncy Ball +1
    rewardChosenCounts.bouncyBall = Math.max(0, (rewardChosenCounts.bouncyBall || 0) + 1);
  } else {
    if (!(type in supply)) return false;
    addToSupply(type, 1);
    if (type in rewardChosenCounts) rewardChosenCounts[type] = Math.max(0, (rewardChosenCounts[type] || 0) + 1);
  }
  // Mark first and general claimed for backward compat
  firstRewardClaimed = true;
  rewardClaimedFor = totalAttempts;
  // secretRewardCounter already 0 after the 5th counted shot; keep at 0 for next cycle
  rewardMenuVisible = false;
  rewardMenuHover = null;
  rewardRerollHover = false;
  rewardOffered = [];
  rewardPending = false;
  updateHotbarUI();
  if (canvas) canvas.style.cursor = "default";
  saveProgress();
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
let continueButton;

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  // Both canvases share same logical 16:9 and same backing store DPR
  for (const c of [bgCanvas, canvas].filter(Boolean)) {
    c.width = LOGICAL_W * dpr;
    c.height = LOGICAL_H * dpr;
    // CSS size is 100% of the 16:9 container (style.css handles width/height via 100%)
    c.style.width = '100%';
    c.style.height = '100%';
    const cctx = c.getContext('2d');
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.imageSmoothingEnabled = true;
  }
  if (ctx) ctx.imageSmoothingEnabled = true;
  if (bgCtx) bgCtx.imageSmoothingEnabled = true;
  setCanvasSize(LOGICAL_W, LOGICAL_H);
  // Invalidate grass pattern so it is recreated for new DPR/context (scaled)
  grassPattern = null;
  grassPatternScaledCanvas = null;
  // Redraw bottom layer for current mode after DPR change
  redrawBottom();
}
function setupCanvases() { return setupCanvas(); }

function loadLevel(index) {
  currentHoleIndex = index;
  level = LEVELS[currentHoleIndex];
  windStrength = level.field.strength ?? WIND_STRENGTH;
  createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
  // Clear modifiers for new hole per REQ-015 (persist through death, cleared on hole advance)
  // REQ-020: supply persists across hole advances, do NOT reset supply here
  modifiers = [];
  syncModifiersToField();
  // Keep canvas size consistent per REQ-010 16:9 (1280×720); if varying, would re-setup canvas
  // Wind particles now handled by Three.js overlay (REQ-004), not canvas initParticles
  createBall(level.tee);
  const dx = level.hole.x - level.tee.x;
  const dy = level.hole.y - level.tee.y;
  setAimAngle(Math.atan2(dy, dx));
  // REQ-024: re-init bouncy bounces for new hole attempt
  bouncyRemaining = bouncyBallCount;
  // REQ-021 per-hole: reset secret counter and queue reward before first attempt on holes >0
  if (index > 0) {
    secretRewardCounter = 0;
    rewardPending = true;
    rewardMenuVisible = false;
    rewardOffered = [];
    rewardRerolled = false;
    rewardMenuHover = null;
    rewardRerollHover = false;
  } else {
    // Hole 1: no pre-attempt reward, ensure counter 0 and no pending
    secretRewardCounter = 0;
    rewardPending = false;
    rewardMenuVisible = false;
    rewardOffered = [];
    rewardRerolled = false;
    rewardMenuHover = null;
    rewardRerollHover = false;
  }
  // REQ-015 collapsible: reset to expanded on new hole
  resetHotbarCollapsed();
  updateHotbarUI();
  // Redraw terrain for new hole (zoned background per REQ-010/033)
  try { redrawBottom(); } catch {}
}

function initLevel() {
  // REQ-020/022/023/024 + REQ-021 per-hole secret counter + REQ-025 reroll + REQ-028 pause stats: hole 1 no award before first attempt, holes >0 reward before first attempt with counter reset
  if (currentHoleIndex === 0) {
    supply = { amplify: 1, nullify: 1, flip: 1 };
    freeShots = 0;
    areaUpgradeCount = 0;
    bouncyBallCount = 0;
    bouncyRemaining = 0;
    secretRewardCounter = 0;
    rewardPending = false;
    firstRewardClaimed = false;
    rewardMenuVisible = false;
    rewardClaimedFor = null;
    rewardOffered = [];
    rewardRerolled = false;
    rewardRerollHover = false;
    pauseMenuVisible = false;
    pauseMenuHover = null;
    rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
    const pauseOverlay = document.getElementById("pause-overlay");
    if (pauseOverlay) pauseOverlay.classList.add("hidden");
  } else {
    // For non-zero start (hole advance per-hole), counter will be reset in loadLevel and reward queued before first attempt
    bouncyRemaining = bouncyBallCount;
  }
  loadLevel(currentHoleIndex);
  updateAttemptsUI();
  // REQ-021 per-hole: hole 1 after 5 counted, holes >0 before first attempt + every 5 within hole
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
    if (gameState === "WIN" && currentHoleIndex === LEVELS.length - 1) {
      winTitle.textContent = "Game Complete!";
    } else {
      winTitle.textContent = "Victory";
    }
  }
  if (nextHoleButton) {
    const hasMoreHoles = currentHoleIndex < LEVELS.length - 1;
    if (gameState === "WIN" && hasMoreHoles) {
      nextHoleButton.classList.remove("hidden");
      nextHoleButton.textContent = "Next";
    } else {
      nextHoleButton.classList.add("hidden");
    }
  }
  if (continueButton) {
    const isFinalWin = gameState === "WIN" && currentHoleIndex === LEVELS.length - 1;
    if (isFinalWin) {
      continueButton.classList.remove("hidden");
      continueButton.textContent = "Continue";
    } else {
      continueButton.classList.add("hidden");
    }
  }
}

function updateHotbarUI() {
  if (!hotbarEl) return;
  const isAiming = gameState === "AIMING" || gameState === "CHARGING";
  const hideForPause = pauseMenuVisible || rewardMenuVisible || mainMenuVisible;
  hotbarEl.classList.toggle("hidden", !isAiming || hideForPause);
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
  syncWindFieldToShader();
}
function syncWindFieldToShader() {
  try {
    const comps = getFieldComponents();
    setWindUniformsFromField(comps, modifiers, windStrength);
  } catch {}
}

function syncPauseOverlay() {
  const po = document.getElementById("pause-overlay");
  if (!po) return;
  if (pauseMenuVisible) {
    po.classList.remove("hidden");
    for (const el of po.querySelectorAll(".reward-stats [data-type]")) {
      const t = el.dataset.type;
      const cnt = rewardChosenCounts[t] ?? 0;
      const countEl = el.querySelector(".count");
      if (countEl) countEl.textContent = `x${cnt}`;
    }
  } else {
    po.classList.add("hidden");
  }
}

function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Use logical coordinates (1280×720 16:9)
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
  modifiers.push({ id: Date.now() + Math.random(), type: selectedModifier, x, y, radius: getEffectiveModifierRadius() });
  syncModifiersToField();
  // Deselect after placement per requirement
  selectedModifier = null;
  updateHotbarUI();
  mousePos = null;
  saveProgress();
}

function removeModifierAt(x, y) {
  const idx = modifiers.findIndex(m => Math.hypot(m.x - x, m.y - y) < m.radius);
  if (idx !== -1) {
    modifiers.splice(idx, 1);
    syncModifiersToField();
    updateHotbarUI();
    saveProgress();
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
  // REQ-024: re-init bouncy bounces for next attempt
  bouncyRemaining = bouncyBallCount;
  updateForceBar();
  // REQ-021: check reward menu on re-entering AIMING (death/OOB/R during play)
  maybeShowRewardMenu();
  saveProgress();
}

function advanceHole() {
  if (currentHoleIndex < LEVELS.length - 1) {
    // REQ-035: consume any placed modifiers from supply on level win before clearing for next hole
    consumePlacedModifiersFromSupply();
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
    saveProgress();
  } else {
    // Final hole already, will show WIN
  }
}

function returnToMainMenu() {
  // REQ-009/011 final-hole: clear run, keep COURSES_KEY/bestTotal, show splash
  // Ensure per-course bestTotal already saved via maybeUpdateHighScore before calling
  clearProgress();
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  supply = { amplify: 1, nullify: 1, flip: 1 };
  freeShots = 0;
  areaUpgradeCount = 0;
  bouncyBallCount = 0;
  bouncyRemaining = 0;
  secretRewardCounter = 0;
  rewardPending = false;
  firstRewardClaimed = false;
  rewardMenuVisible = false;
  rewardClaimedFor = null;
  rewardMenuHover = null;
  rewardOffered = [];
  rewardRerolled = false;
  rewardRerollHover = false;
  pauseMenuVisible = false;
  pauseMenuHover = null;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  const pauseOverlay2 = document.getElementById("pause-overlay");
  if (pauseOverlay2) pauseOverlay2.classList.add("hidden");
  mainMenuVisible = true; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  gameState = "AIMING";
  // Load hole 1 layout behind splash for next run (not visible until course play)
  try {
    if (LEVELS.length) {
      level = LEVELS[0];
      windStrength = level.field.strength ?? WIND_STRENGTH;
      createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
      syncModifiersToField();
      createBall(level.tee);
      const dx = level.hole.x - level.tee.x;
      const dy = level.hole.y - level.tee.y;
      setAimAngle(Math.atan2(dy, dx));
    } else {
      // No courses — create dummy level to keep loop stable (hidden behind main menu splash)
      level = { field:{cols:32,rows:18,strength:80,seed:0,sources:1,sinks:1,doublets:0,vortexes:0}, tee:{x:80,y:360}, hole:{x:1200,y:360,radius:14}, obstacles:[], canvas:{width:LOGICAL_W,height:LOGICAL_H} };
      createField(level.field.cols, level.field.rows, level.field.strength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
      syncModifiersToField();
      createBall(level.tee);
    }
  } catch {}
  bouncyRemaining = bouncyBallCount;
  resetHotbarCollapsed();
  if (winOverlay) winOverlay.classList.add("hidden");
  syncPauseOverlay();
  syncMainMenu();
  updateAttemptsUI();
  updateHotbarUI();
  updateForceBar();
}

function resetGameAfterWin() {
  // REQ-009: on final hole, route to main menu instead of resetting to hole 1
  const isFinalWin = currentHoleIndex === LEVELS.length - 1 && gameState === "WIN";
  if (isFinalWin) {
    return returnToMainMenu();
  }
  clearProgress();
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {}
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  // REQ-020/022/023/024: reset supply to one of each on new game, no award before first attempt
  supply = { amplify: 1, nullify: 1, flip: 1 };
  freeShots = 0;
  areaUpgradeCount = 0;
  bouncyBallCount = 0;
  bouncyRemaining = 0;
  // REQ-021 + REQ-025 + REQ-028: reset secret counter + reward state + reroll + pause stats
  secretRewardCounter = 0;
  rewardPending = false;
  firstRewardClaimed = false;
  rewardMenuVisible = false;
  rewardClaimedFor = null;
  rewardMenuHover = null;
  rewardOffered = [];
  rewardRerolled = false;
  rewardRerollHover = false;
  pauseMenuVisible = false;
  pauseMenuHover = null;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  const pauseOverlay2 = document.getElementById("pause-overlay");
  if (pauseOverlay2) pauseOverlay2.classList.add("hidden");
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
  // No initial reward — first reward after 5 counted shots
}

function handleLaunch(angle, power) {
  // REQ-021: block launch while reward menu visible; REQ-028: block while pause visible; REQ-029: block while main menu visible
  if (rewardMenuVisible) return;
  if (pauseMenuVisible) return;
  if (mainMenuVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  launchBall(angle, power);
  // REQ-024: init bouncy bounces for this attempt
  bouncyRemaining = bouncyBallCount;
  // REQ-022 + REQ-021 secret counter: free shots consumed first, only counted shots increment secret counter
  if (freeShots > 0) {
    freeShots = Math.max(0, freeShots - 1);
    // secretRewardCounter NOT incremented - free shots delay reward per REQ-021/022
  } else {
    holeAttempts += 1;
    totalAttempts += 1;
    attempts = totalAttempts;
    secretRewardCounter++;
    if (secretRewardCounter >= 5) {
      secretRewardCounter = 0;
      rewardPending = true;
    }
  }
  updateAttemptsUI();
  gameState = "FLYING";
  resetCharge();
  updateForceBar();
  saveProgress();
}

function checkWin() {
  const dist = Math.hypot(ball.pos.x - level.hole.x, ball.pos.y - level.hole.y);
  // Victory when ball touches any part of black circle per new requirement (ground projection)
  if (dist < level.hole.radius + BALL_RADIUS) {
    // Ball stops in place per requirement — also settle height
    ball.vel.x = 0;
    ball.vel.y = 0;
    ball.isMoving = false;
    ball.z = 0;
    ball.vz = 0;
    gameState = "WIN";
    updateAttemptsUI();
    winOverlay.classList.remove("hidden");
    // Ensure buttons reflect if more holes remain: Next for non-final, Continue for final
    if (nextHoleButton) {
      if (currentHoleIndex < LEVELS.length - 1) {
        nextHoleButton.classList.remove("hidden");
      } else {
        nextHoleButton.classList.add("hidden");
      }
    }
    if (continueButton) {
      if (currentHoleIndex === LEVELS.length - 1) {
        continueButton.classList.remove("hidden");
      } else {
        continueButton.classList.add("hidden");
      }
    }
    // REQ-029: update high score on final hole win (per-course bestTotal)
    maybeUpdateHighScore();
    return true;
  }
  return false;
}

function handleNextHole() {
  if (currentHoleIndex < LEVELS.length - 1) {
    // REQ-035: consume any placed modifiers from supply on level win before clearing for next hole
    consumePlacedModifiersFromSupply();
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
    saveProgress();
  } else {
    // REQ-009/035 final hole: consume placed modifiers before returning to main menu (moot as clearProgress resets to {1,1,1}, but do for completeness)
    consumePlacedModifiersFromSupply();
    // REQ-009 final hole: return to main menu, not reset to hole 1 via generateLevels
    returnToMainMenu();
  }
}

function update(dt) {
  // REQ-004: wind shader + particles advance even when menu is blocking ball physics
  const tickWind = () => { try { updateWindUniforms(dt, getWindAt); } catch {} };
  // REQ-021: when reward menu visible, block aiming/charging but still animate wind
  if (rewardMenuVisible) {
    // Still allow wind animation, but block ball physics and charging transition
    tickWind();
    updateHotbarUI();
    // Ensure we stay in AIMING and not charging, and don't process input drift
    if (charging) {
      // cancel stray charging while menu open
      resetCharge();
      gameState = "AIMING";
    }
    return;
  }
  // REQ-028: when pause menu visible, pause physics like reward/win
  if (pauseMenuVisible) {
    tickWind();
    updateHotbarUI();
    if (charging) {
      resetCharge();
      gameState = "AIMING";
    }
    return;
  }
  // REQ-029: when main menu visible, pause like pause
  if (mainMenuVisible) {
    tickWind();
    updateHotbarUI();
    if (charging) {
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
    try { updateWindUniforms(dt, getWindAt); } catch {}
    updateBall(dt, getWindAt, windStrength, LOGICAL_W, LOGICAL_H);

    // Check win every tick - immediate, regardless of speed (REQ-009)
    if (checkWin()) {
      return;
    }

    // Check OOB / edge, terrain OB/water, and obstacle - bounce vs death per REQ-024/008/010
    // Water/OB terrain are fatal even with bouncy (hazard spec); trees respect bouncy
    // But water is not fatal while ball is in the air (flying over)
    const isAirborneOverWater = ball.z !== undefined && ball.z > 5;
    let terrainHit = checkTerrainCollision(ball.pos, BALL_RADIUS, level);
    let waterHit = checkWaterCollision(ball.pos, BALL_RADIUS, level.waterHazards);
    // Ignore water when airborne (ball flies over)
    if (isAirborneOverWater) {
      if (terrainHit && terrainHit.zone === 'water') terrainHit = null;
      if (terrainHit && terrainHit.type === 'water') terrainHit = null;
      if (waterHit) waterHit = null;
    }
    const edgeOut = isOutOfBounds(ball.pos, BALL_RADIUS, LOGICAL_W, LOGICAL_H);
    if (terrainHit || waterHit || edgeOut) {
      // Fatal terrain/water/edge — instant reset (no bouncy bounce for hazards)
      // (water already filtered for airborne, so this is ground water)
      resetBall();
      return;
    }
    const hit = checkObstacleCollision(ball.pos, BALL_RADIUS, level.obstacles);
    if (hit) {
      if (bouncyRemaining > 0) {
        bouncyRemaining = Math.max(0, bouncyRemaining - 1);
        bounceBall(hit, false);
        // remain FLYING, do not reset
      } else {
        resetBall();
        return;
      }
    }

    // No auto-reset on rest - ball continues drifting per REQ-005

  } else if (gameState === "WIN") {
    // paused physics, still animate wind
    try { updateWindUniforms(dt, getWindAt); } catch {}
  } else {
    // AIMING/CHARGING - animate wind anyway
    try { updateWindUniforms(dt, getWindAt); } catch {}
  }
}

function updateForceBar() {
  // Power bar now drawn inside canvas under ball when CHARGING per REQ-007 - no DOM
}

function render() {
  // Top canvas is transparent; clear every frame with DPR transform
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

  // Main menu: entry over splash (no field) vs in-level pause with backdrop (field visible behind dim)
  if (mainMenuVisible && !isInLevelPause) {
    // Entry mode: no game elements drawn (bottom shows splash)
    return;
  }
  // When isInLevelPause true, we fall through and draw the field so it is visible behind the backdrop

  // Draw order on TOP canvas (transparent): obstacles -> hole -> ball -> aim -> HUD/force bar/modifiers
  // Wind is rendered on separate transparent Three.js overlay (#wind-canvas) via fragment shader + particles, not here
  // Background is on BOTTOM canvas (tiled grass via redrawBottom), not drawn here
  drawModifiers(ctx, modifiers);
  // Per new requirement: show field direction and strength as arrows inside modifiers, no particles inside
  try { drawArrowsInModifiers(ctx, getWindAt, modifiers, cols, rows, cellW, cellH); } catch {}
  drawObstacles(ctx, level.obstacles);
  drawHole(ctx, level.hole);
  drawBall(ctx, ball);
  if (!rewardMenuVisible) {
    drawAim(ctx, ball, getAimAngle(), charge, gameState);
  }
  // Preview circle follows mouse when selecting modifier before shooting
  // REQ-020: only show preview if supply allows placement; REQ-021/023: not during reward menu
  if (!rewardMenuVisible && (gameState === "AIMING" || gameState === "CHARGING") && mousePos && selectedModifier && canPlace(selectedModifier)) {
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, getEffectiveModifierRadius());
  } else if (!rewardMenuVisible && (gameState === "AIMING" || gameState === "CHARGING") && mousePos && selectedModifier && !canPlace(selectedModifier)) {
    // Insufficient supply: show blocked preview (gray/red) to signal insufficiency
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, getEffectiveModifierRadius(), true);
  }
  // HUD inside canvas on top per REQ-012/014
  drawHUD(ctx, LOGICAL_W, currentHoleIndex, LEVELS.length, holeAttempts, totalAttempts);
  // Power bar under ball when charging per REQ-007
  if (gameState === "CHARGING" && charging && !rewardMenuVisible) {
    drawForceBar(ctx, ball, charge);
  }
  // REQ-021/023/024 + REQ-025: reward menu inside canvas (on top of HUD) - 3 random of 6 + re-roll
  if (rewardMenuVisible) {
    drawRewardMenu(ctx, LOGICAL_W, LOGICAL_H, rewardOffered, rewardMenuHover, rewardRerolled, rewardRerollHover);
  }
  // REQ-028: pause menu is DOM-only (#pause-overlay) to avoid duplicate rendering; canvas pause draw disabled
  // Render wind overlay (Three.js shader lines + particles) on top of game canvas, transparent
  try { renderWind(); } catch {}
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
  bgCanvas = document.getElementById("bg-canvas");
  canvas = document.getElementById("game");
  if (!canvas || !bgCanvas) {
    console.error("Canvas #game or #bg-canvas not found");
    return;
  }
  ctx = canvas.getContext("2d");
  bgCtx = bgCanvas.getContext("2d");
  winOverlay = document.getElementById("win-overlay");
  winAttemptsValue = document.getElementById("win-attempts-value");
  winHoleValue = document.getElementById("win-hole-value");
  winHoleTotal = document.getElementById("win-hole-total");
  winTotalValue = document.getElementById("win-total-value");
  winTitle = document.getElementById("win-title");
  nextHoleButton = document.getElementById("next-hole-button");
  continueButton = document.getElementById("continue-button-win") || document.getElementById("continue-button");
  hotbarEl = document.getElementById("hotbar");
  hotbarToggleEl = document.getElementById("hotbar-toggle");
  if (hotbarToggleEl) {
    hotbarToggleEl.addEventListener("click", (e) => {
      e.stopPropagation();
      // Don't toggle when hidden by FLYING/WIN/reward/pause/mainMenu — toggleHotbar still works but hotbar is hidden anyway
      toggleHotbar();
    });
    syncHotbarCollapsedUI();
  }

  // REQ-029 root menu handlers (Continue / New Game / Help) + course submenu + help
  const continueBtn = document.getElementById('continue-button');
  const newGameBtn = document.getElementById('new-game-button');
  const helpBtn = document.getElementById('help-button');
  const courseMenuBack = document.getElementById('course-menu-back');
  const helpBackBtn = document.getElementById('help-back-button');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => handleContinue());
  }
  if (newGameBtn) {
    newGameBtn.addEventListener('click', () => showCourseMenu());
  }
  if (helpBtn) {
    helpBtn.addEventListener('click', () => showHelpOverlay());
  }
  if (courseMenuBack) {
    courseMenuBack.addEventListener('click', () => showMainMenuRoot());
  }
  if (helpBackBtn) {
    helpBackBtn.addEventListener('click', () => showMainMenuRoot());
  }

  // REQ-031: course submenu UI handlers (inside #course-menu) - supports 3,6,9,18 and difficulty chooser for 3
  const newCourseBtn = document.getElementById('new-course-button');
  const newCourseChoices = document.getElementById('new-course-choices');
  const newCourseChoicesDifficulty = document.getElementById('new-course-choices-difficulty');
  const newCourseCancel = document.getElementById('new-course-cancel');
  const newCourseDifficultyCancel = document.getElementById('new-course-difficulty-cancel');
  const importCourseBtn = document.getElementById('import-course-button');
  const importArea = document.getElementById('import-area');
  const importInput = document.getElementById('import-input');
  const importConfirm = document.getElementById('import-confirm');
  const importCancel = document.getElementById('import-cancel');
  const importError = document.getElementById('import-error');
  const courseMenuFooter = document.getElementById('course-menu-footer');
  if (newCourseBtn && newCourseChoices) {
    newCourseBtn.addEventListener('click', () => {
      if (courseMenuFooter) courseMenuFooter.classList.add('hidden');
      newCourseChoices.classList.remove('hidden');
      if (newCourseChoicesDifficulty) newCourseChoicesDifficulty.classList.add('hidden');
      if (importArea) importArea.classList.add('hidden');
    });
  }
  if (newCourseCancel && newCourseChoices) {
    newCourseCancel.addEventListener('click', () => {
      newCourseChoices.classList.add('hidden');
      if (newCourseChoicesDifficulty) newCourseChoicesDifficulty.classList.add('hidden');
      if (courseMenuFooter) courseMenuFooter.classList.remove('hidden');
    });
  }
  if (newCourseDifficultyCancel && newCourseChoicesDifficulty) {
    newCourseDifficultyCancel.addEventListener('click', () => {
      newCourseChoicesDifficulty.classList.add('hidden');
      newCourseChoices.classList.remove('hidden');
    });
  }
  if (newCourseChoices) {
    newCourseChoices.querySelectorAll('button[data-holes]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hc = parseInt(btn.dataset.holes, 10);
        if ([3,6,9,18].includes(hc)) {
          if (hc === 3 && newCourseChoicesDifficulty) {
            // For 3-hole courses, show difficulty chooser per REQ-031/010/034
            newCourseChoices.classList.add('hidden');
            newCourseChoicesDifficulty.classList.remove('hidden');
            if (courseMenuFooter) courseMenuFooter.classList.add('hidden');
          } else {
            createNewCourseWithHoles(hc);
            newCourseChoices.classList.add('hidden');
            if (newCourseChoicesDifficulty) newCourseChoicesDifficulty.classList.add('hidden');
            if (courseMenuFooter) courseMenuFooter.classList.remove('hidden');
          }
        }
      });
    });
  }
  if (newCourseChoicesDifficulty) {
    newCourseChoicesDifficulty.querySelectorAll('button[data-difficulty]').forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.difficulty;
        if (['easy','medium','hard'].includes(diff)) {
          createNewCourseWithHoles(3, diff);
          newCourseChoicesDifficulty.classList.add('hidden');
          newCourseChoices.classList.add('hidden');
          if (courseMenuFooter) courseMenuFooter.classList.remove('hidden');
        }
      });
    });
  }
  if (importCourseBtn && importArea) {
    importCourseBtn.addEventListener('click', () => {
      importArea.classList.remove('hidden');
      if (newCourseChoices) newCourseChoices.classList.add('hidden');
      if (newCourseChoicesDifficulty) newCourseChoicesDifficulty.classList.add('hidden');
      if (courseMenuFooter) courseMenuFooter.classList.add('hidden');
      if (importError) { importError.textContent = ''; importError.classList.add('hidden'); }
      if (importInput) importInput.value = '';
    });
  }
  if (importCancel && importArea) {
    importCancel.addEventListener('click', () => {
      importArea.classList.add('hidden');
      if (courseMenuFooter) courseMenuFooter.classList.remove('hidden');
      if (importError) { importError.textContent = ''; importError.classList.add('hidden'); }
    });
  }
  if (importConfirm && importInput) {
    importConfirm.addEventListener('click', () => {
      const b64 = importInput.value.trim();
      if (!b64) {
        if (importError) { importError.textContent = 'Invalid course data'; importError.classList.remove('hidden'); }
        return;
      }
      try {
        const imported = importCourse(b64);
        imported.bestTotal = null;
        const existing = findCourseById(imported.id);
        if (existing) {
          try {
            imported.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);});
          } catch {}
          imported.name = imported.name + ' (Import)';
        }
        courses.push(imported);
        saveCourses();
        renderCourseList();
        importArea.classList.add('hidden');
        if (courseMenuFooter) courseMenuFooter.classList.remove('hidden');
        if (importError) { importError.textContent = ''; importError.classList.add('hidden'); }
        showToast('Course imported');
      } catch (e) {
        if (importError) { importError.textContent = 'Invalid course data'; importError.classList.remove('hidden'); }
      }
    });
  }
  const pauseExportBtn = document.getElementById('pause-export-button');
  if (pauseExportBtn) {
    pauseExportBtn.addEventListener('click', () => {
      const cid = activeCourseId || (activeCourse ? activeCourse.id : null);
      if (cid) exportCourseById(cid);
      else if (courses.length) exportCourseById(courses[0].id);
    });
  }

  setupCanvas();
  // REQ-031: load courses collection before progress (so courseId can be resolved)
  try { loadCourses(); } catch (e) { console.warn('loadCourses failed', e); }
  // No immediate auto-create if courses empty — allow empty per updated REQ-031 (persist [])
  // loadCourses already created default on first ever missing key; empty from delete stays empty
  // Ensure activeCourse defaults to first course if available
  if (!activeCourse && courses.length) {
    setActiveCourse(courses[0]);
  }
  // Migration: legacy HIGH_SCORE_KEY -> first course bestTotal
  try {
    const legacy = getHighScore();
    if (legacy != null && courses.length && courses[0].bestTotal == null) {
      courses[0].bestTotal = legacy;
      saveCourses();
    }
  } catch {}
  // REQ-004: init Three.js wind overlay (transparent shader + particles) on top of game canvas
  try {
    const container = document.getElementById('game-container');
    initWindOverlay(container);
    // Feed initial field (will be updated again after level load)
    syncWindFieldToShader();
    resizeWindOverlay();
  } catch (e) { console.warn('wind overlay init failed', e); }
  // REQ-027: Manual Continue — do NOT auto-resume. Show main menu with Continue conditional.
  // Secret: URL param ?hole=N or ?level=N or #hole-N allows direct hole select (hidden) — clear save and set hole behind menu
  const _secretHole = getSecretHoleFromURL();
  if (_secretHole && _secretHole >= 1 && _secretHole <= LEVELS.length) {
    try { clearProgress(); } catch {}
    currentHoleIndex = _secretHole - 1;
  } else {
    currentHoleIndex = 0;
  }
  // Always show main menu entry (REQ-029) — Continue visibility handled via hasRestorableSave()
  if (LEVELS.length) {
    level = LEVELS[0];
    windStrength = level.field.strength ?? WIND_STRENGTH;
    createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
    modifiers = []; syncModifiersToField();
    createBall(level.tee);
    const dx0 = level.hole.x - level.tee.x;
    const dy0 = level.hole.y - level.tee.y;
    setAimAngle(Math.atan2(dy0, dx0));
  } else {
    level = { field:{cols:32,rows:18,strength:80,seed:0,sources:1,sinks:1,doublets:0,vortexes:0}, tee:{x:80,y:360}, hole:{x:1200,y:360,radius:14}, obstacles:[], canvas:{width:LOGICAL_W,height:LOGICAL_H} };
    createField(level.field.cols, level.field.rows, level.field.strength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
    modifiers = []; syncModifiersToField();
    createBall(level.tee);
    setAimAngle(0);
  }
  bouncyRemaining = bouncyBallCount;
  gameState = "AIMING";
  mainMenuVisible = true;
  courseMenuVisible = false;
  helpVisible = false;
  pauseMenuVisible = false; rewardMenuVisible = false;
  if (winOverlay) winOverlay.classList.add("hidden");
  holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { amplify: 1, nullify: 1, flip: 1 };
  freeShots = 0; areaUpgradeCount = 0; bouncyBallCount = 0; bouncyRemaining = 0;
  rewardChosenCounts = { amplify: 0, nullify: 0, flip: 0, freeShots: 0, areaUp: 0, bouncyBall: 0 };
  secretRewardCounter = 0; rewardPending = false; firstRewardClaimed = false; rewardOffered = []; rewardRerolled = false;
  resetHotbarCollapsed();
  updateAttemptsUI(); updateHotbarUI(); updateForceBar();
  syncMainMenu(); syncPauseOverlay();
  // Hide loading after splash is ready (also handled via image onload)
  try { maybeHideLoadingAfterSplash(); setTimeout(hideLoadingScreen, 400); } catch {}
  // Secret: react to hash changes for direct hole jumps
  window.addEventListener("hashchange", () => {
    const h = getSecretHoleFromURL();
    if (h && h >= 1 && h <= LEVELS.length && h - 1 !== currentHoleIndex) {
      selectHole(h);
    }
  });

  initInput(
    () => rewardMenuVisible ? "REWARD" : gameState,
    {
      onLaunch: handleLaunch,
      onReset: () => {
        // REQ-021: block R while reward menu visible; REQ-028: block while pause visible; REQ-029: block while main menu visible
        if (rewardMenuVisible) return;
        if (pauseMenuVisible) return;
        if (mainMenuVisible) return;
        if (gameState === "WIN") {
          if (currentHoleIndex === LEVELS.length - 1) {
            returnToMainMenu();
          } else {
            handleNextHole();
          }
        } else {
          resetBall();
        }
      },
      onToggleWind: () => {
        if (rewardMenuVisible) return;
        if (pauseMenuVisible) return;
        if (mainMenuVisible) return;
        toggleWindThree();
      }
    }
  );

  // Hotbar selection per REQ-015 - updated for deselection via escape / same hotkey / same button + collapsible (clicks hidden when collapsed, but hotkeys still work)
  if (hotbarEl) {
    hotbarEl.querySelectorAll(".hotbar-slot").forEach(slot => {
      slot.addEventListener("click", () => {
        // REQ-021: block hotbar selection while reward menu visible; REQ-028: block while pause; REQ-029: block while main menu
        if (rewardMenuVisible) return;
        if (pauseMenuVisible) return;
        if (mainMenuVisible) return;
        // When collapsed slots are display:none so click won't fire; no extra block needed but keep functional if called programmatically
        if (selectedModifier === slot.dataset.type) {
          selectedModifier = null;
        } else {
          selectedModifier = slot.dataset.type;
        }
        updateHotbarUI();
      });
    });
    updateHotbarUI();
    syncHotbarCollapsedUI();
  }
  if (nextHoleButton) {
    nextHoleButton.addEventListener("click", handleNextHole);
  }
  if (continueButton) {
    continueButton.addEventListener("click", returnToMainMenu);
  }
  // REQ-028: pause overlay DOM wiring (legacy pause now hidden) + main menu End Run
  const pauseOverlayDom = document.getElementById("pause-overlay");
  const resumeBtnDom = document.getElementById("resume-button");
  const mainEndRunBtnDom = document.getElementById("end-run-button");
  const pauseEndRunBtnDom = document.getElementById("pause-end-run-button");
  if (resumeBtnDom) resumeBtnDom.addEventListener("click", () => resumeGame());
  if (mainEndRunBtnDom) mainEndRunBtnDom.addEventListener("click", () => endRun());
  if (pauseEndRunBtnDom) pauseEndRunBtnDom.addEventListener("click", () => endRun());
  // legacy alias
  const newGameBtnDom = document.getElementById("new-game-button");
  if (newGameBtnDom) newGameBtnDom.addEventListener("click", () => { /* New Game shows course list, not End Run */ });
  syncPauseOverlay();
  syncMainMenu();
  window.addEventListener("keydown", (e) => {
    // REQ-029/028: main menu / in-level pause blocks, but Escape to close when isInLevelPause
    if (mainMenuVisible) {
      // Allow browser shortcuts
      const isRefresh = e.key === "F5" || e.code === "F5" || e.keyCode === 116
        || ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === "r")
        || e.key === "F12" || e.code === "F12"
        || e.key === "F11" || e.code === "F11"
        || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "KeyI" || e.code === "KeyJ" || e.code === "KeyC"))
        || (e.ctrlKey && e.code === "KeyU");
      if (isRefresh) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        // In-level pause (Escape/P during level, with backdrop): Escape/P closes or goes back
        if (isInLevelPause) {
          if (helpVisible || courseMenuVisible) {
            showMainMenuRoot();
            syncMainMenu();
          } else {
            // Root pause: simply resume (like Continue)
            mainMenuVisible = false;
            isInLevelPause = false;
            courseMenuVisible = false;
            helpVisible = false;
            syncMainMenu();
          }
          e.preventDefault();
          return;
        }
        // Entry menu (no active run): Escape ignored
        e.preventDefault();
        return;
      }
      // For other keys while any main menu visible, block
      e.preventDefault();
      return;
    }
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
      } else if ((e.code === "Digit0" || e.code === "Numpad0") && !rewardRerolled) {
        rerollReward();
        e.preventDefault();
      } else if ((e.code === "Digit0" || e.code === "Numpad0") && rewardRerolled) {
        e.preventDefault();
      } else if (e.code === "KeyR") {
        // R no longer rerolls (now 0); block R during menu to prevent reset behind overlay
        e.preventDefault();
      } else if (e.code === "Escape" || e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyA" || e.code === "KeyD" || e.code === "Digit4") {
        // Block aiming/charging while menu open (including Digit4 which is not used - only 3 options)
        e.preventDefault();
      }
      return;
    }
    if (e.code === "Escape" || e.code === "KeyP") {
      // REQ-028/029 Escape/P in level shows main menu with backdrop, works even in FLYING
      if (gameState === "WIN" || rewardMenuVisible) {
        e.preventDefault();
        return;
      }
      // If already in in-level pause is handled above (mainMenuVisible block), but legacy pause
      if (pauseMenuVisible) {
        resumeGame();
        e.preventDefault();
        return;
      }
      // Open in-level pause if currently in a level (active run), regardless of AIMING/CHARGING/FLYING
      const inLevel = !!activeCourse || hasRestorableSave();
      if (inLevel && !rewardMenuVisible && gameState !== "WIN") {
        // Allow Escape to open main menu with backdrop even if modifier selected or ball in flight
        openInLevelPause();
        e.preventDefault();
        return;
      }
      // Not in level (entry menu hidden?): handle deselection
      if (selectedModifier !== null) {
        selectedModifier = null;
        updateHotbarUI();
        e.preventDefault();
        return;
      }
      e.preventDefault();
    }
    if (pauseMenuVisible) {
      e.preventDefault();
      return;
    }
    // REQ-015 collapsible: M / B toggles hotbar transparency/collapse, Escape stays deselect-only
    if ((e.code === "KeyM" || e.code === "KeyB") && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (!rewardMenuVisible && !pauseMenuVisible && !mainMenuVisible && (gameState === "AIMING" || gameState === "CHARGING")) {
        toggleHotbar();
        e.preventDefault();
        return;
      }
    }
    if (e.code === "Digit1") {
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
    } else if ((e.ctrlKey && e.shiftKey && (e.code === "KeyH" || e.code === "KeyG")) || (e.altKey && e.code === "KeyH")) {
      // Secret: Ctrl+Shift+H / Ctrl+Shift+G / Alt+H → prompt for exact hole (hidden)
      e.preventDefault();
      const input = prompt(`Select hole (1-${LEVELS.length}):`, String(currentHoleIndex + 1));
      if (input !== null) {
        const n = parseInt(input, 10);
        if (n >= 1 && n <= LEVELS.length) selectHole(n);
        else if (input.trim() !== "") alert(`Invalid hole. Enter 1-${LEVELS.length}`);
      }
    } else if (e.code === "Delete" || e.code === "Backspace") {
      // Remove last modifier
      if (modifiers.length > 0 && (gameState === "AIMING" || gameState === "CHARGING")) {
        modifiers.pop();
        syncModifiersToField();
        updateHotbarUI();
        saveProgress();
      }
    }
  });

  // Secret: hidden hole select via title triple-click (easter egg) and typing "hole"
  const _titleEl = document.querySelector("h1");
  if (_titleEl) {
    let _clickCount = 0, _lastClick = 0;
    _titleEl.title = "Golf Vector Field";
    _titleEl.style.cursor = "pointer";
    _titleEl.addEventListener("click", () => {
      const now = Date.now();
      if (now - _lastClick > 800) _clickCount = 0;
      _clickCount++; _lastClick = now;
      if (_clickCount >= 3) {
        _clickCount = 0;
        const input = prompt(`Select hole (1-${LEVELS.length}):`, String(currentHoleIndex + 1));
        if (input !== null) {
          const n = parseInt(input, 10);
          if (n >= 1 && n <= LEVELS.length) selectHole(n);
          else if (input.trim() !== "") alert(`Invalid hole. Enter 1-${LEVELS.length}`);
        }
      }
    });
  }
  // Secret: typing "hole" quickly opens hole selector (hidden)
  let _secretBuffer = "";
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || rewardMenuVisible) return;
    if (e.key.length === 1 && !e.repeat) {
      _secretBuffer = (_secretBuffer + e.key.toLowerCase()).slice(-10);
      if (_secretBuffer.endsWith("hole")) {
        _secretBuffer = "";
        // Allow during AIMING/CHARGING/WIN (block only FLYING to avoid accidental)
        if (gameState === "FLYING") return;
        const input = prompt(`Select hole (1-${LEVELS.length}):`, String(currentHoleIndex + 1));
        if (input !== null) {
          const n = parseInt(input, 10);
          if (n >= 1 && n <= LEVELS.length) selectHole(n);
          else if (input.trim() !== "") alert(`Invalid hole. Enter 1-${LEVELS.length}`);
        }
      }
    }
  });

  // Canvas mouse for modifier placement & dragging per updated REQ-015 + REQ-020 + REQ-021
  canvas.addEventListener("mousemove", (e) => {
    if (mainMenuVisible) {
      // Main menu is HTML overlay bounded to canvas (REQ-029/030) — no canvas hit-testing; cursor handled by HTML
      canvas.style.cursor = "default";
      return;
    }
    // REQ-028: handle hover for pause menu
    if (pauseMenuVisible) {
      const pos = getCanvasMousePos(e);
      mousePos = pos;
      try {
        const pl = getPauseButtonsLayout(LOGICAL_W, LOGICAL_H);
        const btnNew = pl.endRun || pl.newGame;
        const overResume = pos.x >= pl.resume.x && pos.x <= pl.resume.x + pl.resume.w && pos.y >= pl.resume.y && pos.y <= pl.resume.y + pl.resume.h;
        const overNew = pos.x >= btnNew.x && pos.x <= btnNew.x + btnNew.w && pos.y >= btnNew.y && pos.y <= btnNew.y + btnNew.h;
        if (overResume) pauseMenuHover = "resume";
        else if (overNew) pauseMenuHover = "endRun";
        else pauseMenuHover = null;
        canvas.style.cursor = (overResume || overNew) ? "pointer" : "default";
      } catch { pauseMenuHover = null; }
      return;
    }
    // REQ-021: handle hover for reward menu (random 3 offered) + REQ-025 re-roll
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
      // Re-roll button hover
      try {
        const rerollRect = getRewardRerollButtonLayout(LOGICAL_W, LOGICAL_H);
        const isRerollHover = pos.x >= rerollRect.x && pos.x <= rerollRect.x + rerollRect.w && pos.y >= rerollRect.y && pos.y <= rerollRect.y + rerollRect.h;
        rewardRerollHover = isRerollHover && !rewardRerolled;
      } catch { rewardRerollHover = false; }
      if (hovered) canvas.style.cursor = "pointer";
      else if (rewardRerollHover) canvas.style.cursor = "pointer";
      else canvas.style.cursor = "default";
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
  canvas.addEventListener("mouseleave", () => { mousePos = null; rewardMenuHover = null; rewardRerollHover = false; pauseMenuHover = null; mainMenuHover = null; canvas.style.cursor = "default"; });
  canvas.addEventListener("mousedown", (e) => {
    if (mainMenuVisible) {
      e.preventDefault();
      return;
    }
    if (pauseMenuVisible) {
      e.preventDefault();
      return;
    }
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
      saveProgress();
    }
  });
  canvas.addEventListener("click", (e) => {
    // REQ-029/030: main menu is HTML overlay bounded to canvas — canvas clicks while menu visible are ignored (HTML button handles New Game)
    if (mainMenuVisible) {
      e.preventDefault();
      return;
    }
    // REQ-028: handle pause menu first
    if (pauseMenuVisible) {
      const pos = getCanvasMousePos(e);
      try {
        const pl = getPauseButtonsLayout(LOGICAL_W, LOGICAL_H);
        const btnNew = pl.endRun || pl.newGame;
        const overResume = pos.x >= pl.resume.x && pos.x <= pl.resume.x + pl.resume.w && pos.y >= pl.resume.y && pos.y <= pl.resume.y + pl.resume.h;
        const overNew = pos.x >= btnNew.x && pos.x <= btnNew.x + btnNew.w && pos.y >= btnNew.y && pos.y <= btnNew.y + btnNew.h;
        if (overResume) { resumeGame(); e.preventDefault(); return; }
        if (overNew) { endRun(); e.preventDefault(); return; }
      } catch {}
      e.preventDefault();
      return;
    }
    // REQ-021: handle reward menu selection first (random 3 offered) + REQ-025 re-roll
    if (rewardMenuVisible) {
      const pos = getCanvasMousePos(e);
      // Check re-roll button first (REQ-025)
      try {
        const rerollRect = getRewardRerollButtonLayout(LOGICAL_W, LOGICAL_H);
        if (!rewardRerolled && pos.x >= rerollRect.x && pos.x <= rerollRect.x + rerollRect.w && pos.y >= rerollRect.y && pos.y <= rerollRect.y + rerollRect.h) {
          rerollReward();
          e.preventDefault();
          return;
        }
      } catch {}
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
    // REQ-021: block removal while reward menu visible; REQ-028: block while pause; REQ-029: block while main menu
    if (rewardMenuVisible) return;
    if (pauseMenuVisible) return;
    if (mainMenuVisible) return;
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    const pos = getCanvasMousePos(e);
    // If dragging, cancel drag and remove?
    if (isDragging) {
      isDragging = false;
      draggingIdx = -1;
    }
    removeModifierAt(pos.x, pos.y);
  });

  // Resize handling debounced (all three layers)
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setupCanvas();
      try { resizeWindOverlay(); } catch {}
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

// Helpers for REQ-021/023 testing (area upgrade)
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
  window.__getAreaUpgradeCount = getAreaUpgradeCount;
  window.__getAreaMultiplier = getAreaMultiplier;
  window.__getEffectiveModifierRadius = getEffectiveModifierRadius;
  window.__addAreaUpgrade = addAreaUpgrade;
  window.__getBouncyBallCount = getBouncyBallCount;
  window.__getBouncyRemaining = getBouncyRemaining;
  window.__getBouncyCount = getBouncyCount;
  window.__addBouncyBall = addBouncyBall;
  window.__setBouncyBallCount = setBouncyBallCount;
  window.__getBouncyBallRemaining = getBouncyRemaining;
  window.__getSecretRewardCounter = getSecretRewardCounter;
  window.__setSecretRewardCounter = setSecretRewardCounter;
  window.__addSecretRewardCounter = addSecretRewardCounter;
  window.getSecretRewardCounter = getSecretRewardCounter;
  window.__getRewardPending = () => rewardPending;
  window.__setRewardPending = (v) => { rewardPending = !!v; };
  window.__getFirstRewardClaimed = () => firstRewardClaimed;
  window.__setFirstRewardClaimed = (v) => { firstRewardClaimed = !!v; };
  window.__getRewardRerolled = getRewardRerolled;
  window.__setRewardRerolled = (v) => { rewardRerolled = !!v; };
  window.__rerollReward = rerollReward;
  window.rerollReward = rerollReward;
  window.getRewardRerolled = getRewardRerolled;
  // Secret: exact hole select (hidden)
  window.__selectHole = selectHole;
  window.__goToHole = selectHole;
  window.__setHole = selectHole;
  window.selectHole = selectHole;
  window.goToHole = selectHole;
  window.setHole = selectHole;
  window.__getCurrentHole = () => currentHoleIndex + 1;
  window.__getCurrentHoleIndex = () => currentHoleIndex;
  window.__getTotalHoles = () => LEVELS.length;
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
  Object.defineProperty(window, 'areaUpgradeCount', {
    get: () => areaUpgradeCount,
    set: (v) => {
      areaUpgradeCount = Math.max(0, Math.floor(v));
      const newR = getEffectiveModifierRadius();
      for (const m of modifiers) m.radius = newR;
      syncModifiersToField();
    }
  });
  Object.defineProperty(window, '__areaUpgradeCount', {
    get: () => areaUpgradeCount,
    set: (v) => {
      areaUpgradeCount = Math.max(0, Math.floor(v));
      const newR = getEffectiveModifierRadius();
      for (const m of modifiers) m.radius = newR;
      syncModifiersToField();
    }
  });
  Object.defineProperty(window, 'bouncyBallCount', {
    get: () => bouncyBallCount,
    set: (v) => { bouncyBallCount = Math.max(0, Math.floor(v)); bouncyRemaining = bouncyBallCount; }
  });
  Object.defineProperty(window, '__bouncyBallCount', {
    get: () => bouncyBallCount,
    set: (v) => { bouncyBallCount = Math.max(0, Math.floor(v)); bouncyRemaining = bouncyBallCount; }
  });
  Object.defineProperty(window, 'bouncyRemaining', {
    get: () => bouncyRemaining,
    set: (v) => { bouncyRemaining = Math.max(0, Math.floor(v)); }
  });
  Object.defineProperty(window, '__bouncyRemaining', {
    get: () => bouncyRemaining,
    set: (v) => { bouncyRemaining = Math.max(0, Math.floor(v)); }
  });
  Object.defineProperty(window, 'secretRewardCounter', {
    get: () => secretRewardCounter,
    set: (v) => { secretRewardCounter = Math.max(0, Math.floor(v)); }
  });
  Object.defineProperty(window, '__secretRewardCounter', {
    get: () => secretRewardCounter,
    set: (v) => { secretRewardCounter = Math.max(0, Math.floor(v)); }
  });
  Object.defineProperty(window, 'rewardPending', {
    get: () => rewardPending,
    set: (v) => { rewardPending = !!v; }
  });
  Object.defineProperty(window, '__rewardPending', {
    get: () => rewardPending,
    set: (v) => { rewardPending = !!v; }
  });
  Object.defineProperty(window, 'firstRewardClaimed', {
    get: () => firstRewardClaimed,
    set: (v) => { firstRewardClaimed = !!v; }
  });
  Object.defineProperty(window, 'rewardRerolled', {
    get: () => rewardRerolled,
    set: (v) => { rewardRerolled = !!v; }
  });
  Object.defineProperty(window, '__rewardRerolled', {
    get: () => rewardRerolled,
    set: (v) => { rewardRerolled = !!v; }
  });
  Object.defineProperty(window, 'rewardRerollHover', {
    get: () => rewardRerollHover,
    set: (v) => { rewardRerollHover = !!v; }
  });
  // REQ-027: expose storage helpers for tests
  window.__saveProgress = saveProgress;
  window.__loadProgress = loadProgress;
  window.__clearProgress = clearProgress;
  window.__getSavePayload = getSavePayload;
  window.__STORAGE_KEY = STORAGE_KEY;
  window.STORAGE_KEY = STORAGE_KEY;
  window.saveProgress = saveProgress;
  window.loadProgress = loadProgress;
  window.clearProgress = clearProgress;
  window.getSavePayload = getSavePayload;
  Object.defineProperty(window, 'STORAGE_KEY', { get: () => STORAGE_KEY });
  // REQ-028: expose pause + reward stats helpers
  window.__getRewardChosenCounts = getRewardChosenCounts;
  window.__getRewardChosenCount = getRewardChosenCount;
  window.__setRewardChosenCounts = setRewardChosenCounts;
  window.__isPauseMenuVisible = isPauseMenuVisible;
  window.__resumeGame = resumeGame;
  window.__startNewGame = startNewGame;
  window.getRewardChosenCounts = getRewardChosenCounts;
  window.getRewardChosenCount = getRewardChosenCount;
  window.resumeGame = resumeGame;
  window.startNewGame = startNewGame;
  window.isPauseMenuVisible = isPauseMenuVisible;
  Object.defineProperty(window, 'pauseMenuVisible', { get: () => pauseMenuVisible, set: (v) => { pauseMenuVisible = !!v; } });
  Object.defineProperty(window, '__pauseMenuVisible', { get: () => pauseMenuVisible, set: (v) => { pauseMenuVisible = !!v; } });
  Object.defineProperty(window, 'rewardChosenCounts', { get: () => ({...rewardChosenCounts}), set: (v) => setRewardChosenCounts(v) });
  Object.defineProperty(window, '__rewardChosenCounts', { get: () => ({...rewardChosenCounts}), set: (v) => setRewardChosenCounts(v) });
  // REQ-029: expose main menu + high score helpers + new menu helpers
  window.__getHighScore = getHighScore;
  window.__setHighScore = setHighScore;
  window.__clearHighScore = clearHighScore;
  window.__maybeUpdateHighScore = maybeUpdateHighScore;
  window.__isMainMenuVisible = isMainMenuVisible;
  window.__syncMainMenu = syncMainMenu;
  window.__startNewGameFromMain = startNewGameFromMain;
  window.__endRun = endRun;
  window.__hasRestorableSave = hasRestorableSave;
  window.__handleContinue = handleContinue;
  window.__showCourseMenu = showCourseMenu;
  window.__showHelpOverlay = showHelpOverlay;
  window.__showMainMenuRoot = showMainMenuRoot;
  window.__renderMainMenuRootVisibility = renderMainMenuRootVisibility;
  window.hasRestorableSave = hasRestorableSave;
  window.handleContinue = handleContinue;
  window.showCourseMenu = showCourseMenu;
  window.showHelpOverlay = showHelpOverlay;
  window.showMainMenuRoot = showMainMenuRoot;
  window.openInLevelPause = openInLevelPause;
  window.__openInLevelPause = openInLevelPause;
  window.getHighScore = getHighScore;
  window.isMainMenuVisible = isMainMenuVisible;
  window.startNewGameFromMain = startNewGameFromMain;
  window.endRun = endRun;
  window.HIGH_SCORE_KEY = HIGH_SCORE_KEY;
  window.__HIGH_SCORE_KEY = HIGH_SCORE_KEY;
  Object.defineProperty(window, 'mainMenuVisible', { get: () => mainMenuVisible, set: (v) => { mainMenuVisible = !!v; } });
  Object.defineProperty(window, '__mainMenuVisible', { get: () => mainMenuVisible, set: (v) => { mainMenuVisible = !!v; } });
  Object.defineProperty(window, 'HIGH_SCORE_KEY', { get: () => HIGH_SCORE_KEY });
  Object.defineProperty(window, 'courseMenuVisible', { get: () => courseMenuVisible, set: (v) => { courseMenuVisible = !!v; } });
  Object.defineProperty(window, '__courseMenuVisible', { get: () => courseMenuVisible, set: (v) => { courseMenuVisible = !!v; } });
  Object.defineProperty(window, 'helpVisible', { get: () => helpVisible, set: (v) => { helpVisible = !!v; } });
  Object.defineProperty(window, '__helpVisible', { get: () => helpVisible, set: (v) => { helpVisible = !!v; } });
  Object.defineProperty(window, 'isInLevelPause', { get: () => isInLevelPause, set: (v) => { isInLevelPause = !!v; } });
  Object.defineProperty(window, '__isInLevelPause', { get: () => isInLevelPause, set: (v) => { isInLevelPause = !!v; } });
  // REQ-015 collapsible hotbar helpers
  window.__isHotbarCollapsed = isHotbarCollapsedState;
  window.__toggleHotbar = toggleHotbar;
  window.__resetHotbarCollapsed = resetHotbarCollapsed;
  window.toggleHotbar = toggleHotbar;
  Object.defineProperty(window, 'isHotbarCollapsed', { get: () => isHotbarCollapsed, set: (v) => { isHotbarCollapsed = !!v; syncHotbarCollapsedUI(); updateHotbarUI(); } });
  Object.defineProperty(window, '__hotbarCollapsed', { get: () => isHotbarCollapsed, set: (v) => { isHotbarCollapsed = !!v; syncHotbarCollapsedUI(); updateHotbarUI(); } });
  // REQ-009/011 final win -> main menu
  window.returnToMainMenu = returnToMainMenu;
  window.__returnToMainMenu = returnToMainMenu;
  window.handleNextHole = handleNextHole;
  window.__handleNextHole = handleNextHole;
  window.resetGameAfterWin = resetGameAfterWin;
  window.__resetGameAfterWin = resetGameAfterWin;
  window.__hideLoadingScreen = hideLoadingScreen;
  window.hideLoadingScreen = hideLoadingScreen;
  window.__maybeHideLoadingAfterSplash = maybeHideLoadingAfterSplash;
}

// Auto-init when loaded as module via script tag
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { init, resetBall, gameState, attempts, supply, getSupply, setSupply, addToSupply, canPlace, resetSupply, getModifiers, getSelectedModifier, modifiers, selectedModifier, rewardMenuVisible, rewardClaimedFor, rewardMenuHover, rewardOffered, REWARD_POOL, maybeShowRewardMenu, claimReward, isRewardMenuVisible, getRewardClaimedFor, getRewardMenuState, setRewardClaimedFor, setRewardMenuVisible, getRewardOffered, setRewardOffered, freeShots, getFreeShots, setFreeShots, addFreeShots, areaUpgradeCount, getAreaUpgradeCount, getAreaMultiplier, getEffectiveModifierRadius, addAreaUpgrade, BASE_MODIFIER_RADIUS, bouncyBallCount, bouncyRemaining, getBouncyBallCount, getBouncyRemaining, getBouncyCount, addBouncyBall, setBouncyBallCount, initBouncyForAttempt, bounceBall, selectHole, getSecretHoleFromURL, secretRewardCounter, getSecretRewardCounter, setSecretRewardCounter, addSecretRewardCounter, rewardPending, firstRewardClaimed, rewardRerolled, rewardRerollHover, getRewardRerolled, rerollReward, totalAttempts, holeAttempts, currentHoleIndex, STORAGE_KEY, getSavePayload, saveProgress, loadProgress, clearProgress, pauseMenuVisible, pauseMenuHover, rewardChosenCounts, getRewardChosenCounts, getRewardChosenCount, setRewardChosenCounts, resumeGame, startNewGame, isPauseMenuVisible, mainMenuVisible, mainMenuHover, HIGH_SCORE_KEY, getHighScore, setHighScore, clearHighScore, maybeUpdateHighScore, syncMainMenu, isMainMenuVisible, startNewGameFromMain, endRun, isHotbarCollapsed, isHotbarCollapsedState, toggleHotbar, resetHotbarCollapsed, syncHotbarCollapsedUI, returnToMainMenu, handleNextHole, resetGameAfterWin };
