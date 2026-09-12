import { LEVEL, LEVELS, generateLevels } from "./levels.js";
import { createField, getWindAt, WIND_STRENGTH, field, cols, rows, cellW, cellH, MODIFIER_RADIUS, modifiers as fieldModifiers, setModifiers, setPowerCellCount as setFieldPowerCellCount, getPowerCellCount as getFieldPowerCellCount, BASE_STRENGTH } from "./vectorField.js";
import { ball, createBall, launchBall, resetBall as physicsResetBall, updateBall, BALL_RADIUS, BOUNCE_DAMPING } from "./physics.js";
import { checkObstacleCollision, isOutOfBounds, checkWaterCollision, checkTerrainCollision, checkTreasureHit, collectTreasure } from "./obstacles.js";
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
  drawArrowsInModifiers,
  setCanvasSize,
  drawTerrainZones,
  drawBackground,
  drawTreasure,
  drawCenterBanner,
  drawHoleBanner,
  drawAttemptsBanner,
  drawSoftlockBanner,
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
  setFreeShotActive as setWindFreeShotActive,
  setFreeShotBallActive as setWindFreeShotBallActive,
  setFreeShotEdgeActive as setWindFreeShotEdgeActive,
  updateFreeShotGlow,
} from "./windThree.js";
import { getFieldComponents, getSourcePositions, getSinkPositions, getVortexPositions, getDoubletPositions, SOFTENING_A } from "./vectorField.js";
import { COURSES_KEY, STAGES, generateCampaignCourse, loadCourses as loadCoursesFromStorage, saveCourses as saveCoursesToStorage, exportCourse, importCourse, validateCourse, isStageUnlocked, getUnlockedStages, ensureNextStageUnlocked, getCampaignSeed, setCampaignSeed, generateCampaignSeed, deriveCourseSeed, regenerateCampaign, applyManualSeed } from "./courses.js";
import { PROGRESSION_KEY, COINS_PER_HOLE, COURSE_COMPLETE_BONUS, SHOP_PRICE_SPATIAL, SHOP_PRICE_PASSIVE, MAX_LOADOUT_SLOTS, costFor, getProgression, getCoins, getPersonalSupply, getPersonalSupplyCount, purchase as progressionPurchase, addCoins, saveProgression, loadProgression, clearProgression } from "./progression.js";

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const FIXED_DT = 1 / 60;

let canvas;
let ctx;
let bgCanvas;
let bgCtx;
// Background image for splash (main menu) - legacy fallback
const splashImg = new Image();
splashImg.src = './img/gfg-splash.png';

// Parallax layered splash scene - may is closest, foreground almost as close, middleground bit further, background far
let parallaxSceneEl = null;
let parallaxLayers = [];
let parallaxTargetX = 0;
let parallaxTargetY = 0;
let parallaxCurrentX = 0;
let parallaxCurrentY = 0;
let parallaxRafId = null;
let parallaxInitialized = false;
const PARALLAX_DEPTHS = {
  background: 7,
  middleground: 13,
  foreground: 20,
  may: 28
};

function isParallaxReady() {
  try {
    const imgs = document.querySelectorAll('#parallax-scene img');
    if (!imgs.length) return false;
    for (const img of imgs) {
      if (!img.complete || !img.naturalWidth) return false;
    }
    return true;
  } catch { return false; }
}
function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) ls.classList.add('hidden');
}
function maybeHideLoadingAfterSplash() {
  // Hide once parallax layers decoded/complete (or fallback splash)
  try {
    const parallaxOk = isParallaxReady();
    const splashOk = splashImg.complete && splashImg.naturalWidth;
    if (parallaxOk || splashOk) {
      hideLoadingScreen();
      return true;
    }
    // Try decode promises for parallax layers if available
    const imgs = document.querySelectorAll('#parallax-scene img');
    if (imgs.length) {
      const decodes = Array.from(imgs).map(img => img.decode ? img.decode().catch(()=>{}) : Promise.resolve());
      Promise.all(decodes).then(hideLoadingScreen).catch(hideLoadingScreen);
      return false;
    }
    if (splashImg.decode) {
      splashImg.decode().then(hideLoadingScreen).catch(hideLoadingScreen);
      return false;
    }
  } catch {};
  return false;
}
if (typeof window !== 'undefined') {
  splashImg.onload = () => { redrawBottom(); maybeHideLoadingAfterSplash(); };
  splashImg.onerror = () => { setTimeout(() => { redrawBottom(); hideLoadingScreen(); }, 50); };
  // Also attempt hide after short timeout to avoid stuck Loading... if image cached
  setTimeout(() => { if (splashImg.complete && splashImg.naturalWidth) hideLoadingScreen(); }, 500);
  // Ensure fallback hide even if image fails completely
  setTimeout(() => hideLoadingScreen(), 3000);
  // Attach parallax image load listeners once DOM is ready
  const attachParallaxLoad = () => {
    const imgs = document.querySelectorAll('#parallax-scene img');
    imgs.forEach(img => {
      img.addEventListener('load', () => { try { redrawBottom(); } catch {}; maybeHideLoadingAfterSplash(); });
      img.addEventListener('error', () => { setTimeout(hideLoadingScreen, 300); });
    });
    // also try after a tick in case cached
    setTimeout(() => { if (isParallaxReady()) { try { redrawBottom(); } catch {}; hideLoadingScreen(); } }, 600);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachParallaxLoad);
  } else {
    setTimeout(attachParallaxLoad, 0);
  }
}

function initParallax() {
  if (parallaxInitialized) return;
  parallaxSceneEl = document.getElementById('parallax-scene');
  if (!parallaxSceneEl) return;
  parallaxLayers = Array.from(parallaxSceneEl.querySelectorAll('.parallax-layer'));
  parallaxInitialized = true;
  // Mouse tracking on game-container only when main menu visible
  const container = document.getElementById('game-container');
  if (container) {
    container.addEventListener('mousemove', handleParallaxMouseMove);
    container.addEventListener('mouseleave', handleParallaxMouseLeave);
    // Touch support - subtle follow on touch move
    container.addEventListener('touchmove', (e) => {
      if (!mainMenuVisible || isInLevelPause) return;
      const t = e.touches[0];
      if (!t) return;
      handleParallaxMouseMove(t);
    }, { passive: true });
  }
  // Respect reduced motion
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const k in PARALLAX_DEPTHS) PARALLAX_DEPTHS[k] = 0;
    }
  } catch {}
  startParallaxLoop();
}

function handleParallaxMouseMove(e) {
  if (!mainMenuVisible || isInLevelPause) return;
  if (!parallaxSceneEl || parallaxSceneEl.classList.contains('hidden')) return;
  const container = document.getElementById('game-container');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // Normalize to [-1, 1] (subtle: limit to [-1,1] with clamp)
  const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
  const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
  // Small dampening: keep target in subtle range (-1 to 1 will be scaled by depth)
  parallaxTargetX = nx;
  parallaxTargetY = ny;
}

function handleParallaxMouseLeave() {
  parallaxTargetX = 0;
  parallaxTargetY = 0;
}

function applyParallaxTransforms() {
  if (!parallaxLayers.length) return;
  // Lerp current toward target for smooth subtle motion
  const lerp = 0.08;
  parallaxCurrentX += (parallaxTargetX - parallaxCurrentX) * lerp;
  parallaxCurrentY += (parallaxTargetY - parallaxCurrentY) * lerp;
  // Clamp very small values to zero to avoid jitter
  if (Math.abs(parallaxCurrentX) < 0.001) parallaxCurrentX = 0;
  if (Math.abs(parallaxCurrentY) < 0.001) parallaxCurrentY = 0;
  for (const layer of parallaxLayers) {
    const depth = layer.dataset.depth;
    const d = PARALLAX_DEPTHS[depth] ?? 10;
    // Parallax: closer layers move more, in direction of mouse (subtle, not inverted)
    // Use translate3d for GPU compositing
    const x = parallaxCurrentX * d;
    const y = parallaxCurrentY * d * 0.55; // vertical a bit less pronounced for subtlety
    layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
}

function startParallaxLoop() {
  if (parallaxRafId) return;
  const tick = () => {
    // Only animate when visible to save CPU
    if (parallaxSceneEl && !parallaxSceneEl.classList.contains('hidden') && mainMenuVisible && !isInLevelPause) {
      applyParallaxTransforms();
    } else if (parallaxCurrentX !== 0 || parallaxCurrentY !== 0) {
      // Ease back to center when hidden
      applyParallaxTransforms();
      if (Math.abs(parallaxCurrentX) < 0.005 && Math.abs(parallaxCurrentY) < 0.005) {
        parallaxCurrentX = 0; parallaxCurrentY = 0;
        parallaxTargetX = 0; parallaxTargetY = 0;
      }
    }
    parallaxRafId = requestAnimationFrame(tick);
  };
  parallaxRafId = requestAnimationFrame(tick);
}

function syncParallaxVisibility() {
  if (!parallaxSceneEl) parallaxSceneEl = document.getElementById('parallax-scene');
  if (!parallaxSceneEl) return;
  const shouldShow = !!(mainMenuVisible && !isInLevelPause);
  parallaxSceneEl.classList.toggle('hidden', !shouldShow);
  parallaxSceneEl.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  if (shouldShow) {
    // Ensure layers are positioned and start loop
    if (!parallaxInitialized) initParallax();
    // Kick one frame to avoid flash at 0
    applyParallaxTransforms();
  } else {
    // Reset to center when hidden
    parallaxTargetX = 0; parallaxTargetY = 0;
  }
}
// Expose for debug / testing subtle parallax
try {
  if (typeof window !== 'undefined') {
    window.__parallax = {
      getDepths: () => ({ ...PARALLAX_DEPTHS }),
      getTarget: () => ({ x: parallaxTargetX, y: parallaxTargetY }),
      getCurrent: () => ({ x: parallaxCurrentX, y: parallaxCurrentY }),
      isReady: isParallaxReady,
      isVisible: () => {
        const el = document.getElementById('parallax-scene');
        return el ? !el.classList.contains('hidden') : false;
      }
    };
    window.__getParallaxDepths = () => ({ ...PARALLAX_DEPTHS });
  }
} catch {}
function redrawBottom() {
  if (!bgCanvas || !bgCtx) return;
  const dpr = window.devicePixelRatio || 1;
  // Use helper from render if available, else fallback
  try {
    // Sync parallax scene visibility for main menu
    try { syncParallaxVisibility(); } catch {}
    // drawBackground is imported from render.js — but to avoid circular deps we handle inline
    // Use logical W/H with DPR transform already set in setupCanvases
    bgCtx.save();
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mainMenuVisible && !isInLevelPause) {
      // layered parallax scene handles splash visuals; bgCanvas is hidden via CSS when parallax visible
      const parallaxOk = isParallaxReady();
      if (parallaxOk) {
        // Keep bg transparent / clear so parallax layers show through
        bgCtx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
      } else {
        // fallback to legacy single splash while parallax loads/fails
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
      bgCtx.fillStyle = '#3a9d23';
      bgCtx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    }
    bgCtx.restore();
  } catch {};
}
let gameState = "AIMING"; // AIMING, CHARGING, FLYING, WIN, GAME_OVER
let accumulator = 0;
let lastTime = 0;
let lastLaunchTime = 0;
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
    // Deep clone to prevent treasure isCollected mutation from leaking back to stored course (fix treasure reappearing bug)
    try {
      LEVELS.length = 0;
      for (const h of course.holes) {
        const clone = JSON.parse(JSON.stringify(h));
        // Ensure fresh run starts with all treasures uncollected; runtime collect will set true on clone only
        if (clone && clone.treasure) clone.treasure.isCollected = false;
        LEVELS.push(clone);
      }
      // Also update LEVEL alias to first hole
      Object.assign(LEVEL, LEVELS[0] || {});
      if (LEVELS[0]) {
        LEVEL.canvas = LEVELS[0].canvas;
        LEVEL.tee = LEVELS[0].tee;
        LEVEL.hole = LEVELS[0].hole;
        LEVEL.obstacles = LEVELS[0].obstacles;
        LEVEL.field = LEVELS[0].field;
        LEVEL.treasure = LEVELS[0].treasure;
        LEVEL.terrain = LEVELS[0].terrain;
        LEVEL.difficulty = LEVELS[0].difficulty;
      }
    } catch {};
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
  try { saveCoursesToStorage(courses); } catch {};
}
function findCourseById(id) { return courses.find(c => c.id === id) || null; }

// Modifier system per REQ-015 + REQ-020 (supply-limited) + transparent/collapsible per REQ-012/015/020
let modifiers = [];
let selectedModifier = null;
let mousePos = null;
let hotbarEl = null;
let hotbarGridEl = null;
let golfbagContainerEl = null;
let golfbagIconEl = null;
let bottomBarEl = null;
let draggingIdx = -1;
let isDragging = false;
let isHotbarCollapsed = false;
function isHotbarCollapsedState() { return isHotbarCollapsed; }
function syncHotbarCollapsedUI() {
  if (hotbarEl) hotbarEl.classList.toggle("collapsed", isHotbarCollapsed);
  if (golfbagContainerEl) {
    golfbagContainerEl.classList.toggle("collapsed", isHotbarCollapsed);
    golfbagContainerEl.setAttribute("aria-expanded", String(!isHotbarCollapsed));
    golfbagContainerEl.title = isHotbarCollapsed ? "Golf bag — click to open" : "Golf bag — click to collapse";
  }
  // Close button removed per updated spec — only golfbag toggles
}
function toggleHotbar() {
  // Toggle via golfbag click or I/Tab; close button removed
  isHotbarCollapsed = !isHotbarCollapsed;
  // Do NOT deselect active modifier when collapsing — selection persists
  syncHotbarCollapsedUI();
  updateHotbarUI();
  return isHotbarCollapsed;
}
function resetHotbarCollapsed() {
  isHotbarCollapsed = false;
  syncHotbarCollapsedUI();
}

// Supply per REQ-020: per-type inventory, persistent personalSupply vs run supply (see 10-progression.md)
// Run supply starts empty and is filled via loadout selection (4 slots) — default kept for backward compat tests that check resetSupply
let supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
// Persistent progression (personal items never deplete) + loadout (10-progression.md)
let loadoutVisible = false;
let loadoutCourseId = null;
let loadoutSlots = [null, null, null, null]; // 4 slots, each null or type string
// Run coin tracking: 10 per hole cleared (COINS_PER_HOLE)
let runHolesCleared = 0;
let runCoinsEarned = 0;
let coinSummaryVisible = false;
let coinSummaryHoles = 0;
let coinSummaryCoins = 0;
let loadoutUnlockedAtRunStart = 1;
function normalizeSupplyType(type) {
  if (type === 'amplify') return 'magnifier';
  if (type === 'nullify') return 'liquifier';
  if (type === 'flip') return 'deflector';
  if (type === 'rotate') return 'rotator';
  return type;
}
function denormalizeSupplyType(type) { return type; } // kept for alias checks
let isFreeShotActive = false;
let freeShotFlightActive = false;
function isFreeShotActiveState() { return isFreeShotActive; }
function isFreeShotFlightActiveState() { return freeShotFlightActive; }
function canActivateFreeShot() { return (supply.freeShot ?? 0) > 0; }
function syncFreeShotGlow() {
  const edgeActive = isFreeShotActive || freeShotFlightActive;
  const ballActive = isFreeShotActive;
  try {
    setWindFreeShotActive(edgeActive);
    try { setWindFreeShotBallActive(ballActive); } catch {};
    try { setWindFreeShotEdgeActive(edgeActive); } catch {};
    if (ballActive && ball && ball.pos) updateFreeShotGlow(ball.pos, 0);
    else if (!ballActive) {
      // ensure ball glow hidden when not armed (edge may still be visible)
      try { setWindFreeShotBallActive(false); } catch {};
    }
  } catch {};
}
function setFreeShotActive(v) {
  if (!v) {
    isFreeShotActive = false;
    syncFreeShotGlow();
    updateHotbarUI();
    saveProgress();
    return true;
  }
  if (!canActivateFreeShot()) return false;
  isFreeShotActive = true;
  // spatial selection mutually exclusive with freeShot
  selectedModifier = null;
  syncFreeShotGlow();
  updateHotbarUI();
  saveProgress();
  return true;
}
function toggleFreeShot() {
  if (isFreeShotActive) {
    isFreeShotActive = false;
    syncFreeShotGlow();
    updateHotbarUI();
    saveProgress();
    return true;
  }
  if (!canActivateFreeShot()) {
    updateHotbarUI();
    return false;
  }
  isFreeShotActive = true;
  selectedModifier = null;
  syncFreeShotGlow();
  updateHotbarUI();
  saveProgress();
  return true;
}
function clearFreeShotGlow() {
  isFreeShotActive = false;
  freeShotFlightActive = false;
  try { setWindFreeShotActive(false); } catch {};
  try { setWindFreeShotBallActive(false); } catch {};
  try { setWindFreeShotEdgeActive(false); } catch {};
}
function clearFreeShotFlightGlow() {
  freeShotFlightActive = false;
  syncFreeShotGlow();
}

function canPlace(type) {
  const t = normalizeSupplyType(type);
  if (!t || !(t in supply)) return false;
  if (t === 'freeShot') return false;
  return (supply[t] ?? 0) > 0;
}

function getSupply() {
  // Return with legacy aliases for backward compat tests that check old keys
  return { ...supply, amplify: supply.magnifier, nullify: supply.liquifier, flip: supply.deflector, rotate: supply.rotator };
}

function addToSupply(type, n = 1) {
  const t = normalizeSupplyType(type);
  if (!(t in supply)) return;
  supply[t] = Math.max(0, supply[t] + n);
  updateHotbarUI();
}

function resetSupply() {
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
  clearFreeShotGlow();
  updateHotbarUI();
}

function consumePlacedModifiersFromSupply() {
  // Inventory model: supply already decremented on placement, win just clears modifiers without extra decrement or refund.
  // Kept for backward compat; no supply change.
  if (!modifiers || !modifiers.length) return;
  updateHotbarUI();
}

// --- Progression / Loadout / Coin Economy helpers (10-progression.md) ---
function syncProgressionDisplay() {
  try {
    const el = document.getElementById('progression-coins-display');
    const inline = document.getElementById('loadout-coins');
    const coins = getCoins();
    if (el) {
      el.textContent = '💰 ' + coins;
      const show = !!mainMenuVisible && !loadoutVisible && !coinSummaryVisible;
      el.classList.toggle('hidden', !show);
    }
    if (inline) inline.textContent = '💰 ' + getCoins();
  } catch {}
}
function isLoadoutVisible() { return loadoutVisible; }
function getLoadoutSlots() { return [...loadoutSlots]; }
function getRunCoinsEarned() { return runCoinsEarned; }
function getRunHolesCleared() { return runHolesCleared; }
function isCoinSummaryVisible() { return coinSummaryVisible; }
function getUnlockedLoadoutSlots() {
  let unlocked = 1;
  try {
    const c3 = courses.find(c=>c.holeCount===3);
    const c6 = courses.find(c=>c.holeCount===6);
    const c9 = courses.find(c=>c.holeCount===9);
    if (c3 && c3.bestTotal !== null && c3.bestTotal !== undefined) unlocked++;
    if (c6 && c6.bestTotal !== null && c6.bestTotal !== undefined) unlocked++;
    if (c9 && c9.bestTotal !== null && c9.bestTotal !== undefined) unlocked++;
  } catch {}
  return Math.min(4, Math.max(1, unlocked));
}

let loadoutPickerVisible = false;
let loadoutPickerSlotIndex = -1;
function isLoadoutPickerVisible() { return loadoutPickerVisible; }
function getLoadoutPickerSlotIndex() { return loadoutPickerSlotIndex; }
function syncLoadoutPickerOverlay() {
  const overlay = document.getElementById('loadout-item-picker-overlay');
  const grid = document.getElementById('loadout-picker-grid');
  if (!overlay) return;
  if (!loadoutVisible || !loadoutPickerVisible || loadoutPickerSlotIndex < 0) {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  if (!grid) return;
  try {
    const personal = getPersonalSupply();
    const unlocked = getUnlockedLoadoutSlots();
    // guard if slot became locked after picker opened
    if (loadoutPickerSlotIndex >= unlocked) { hideLoadoutPicker(); return; }
    grid.innerHTML = '';
    const types = ['liquifier','deflector','rotator','magnifier','fieldExtender','powerCell','freeShot'];
    const names = {liquifier:'Liquifier',deflector:'Deflector',rotator:'Rotator',magnifier:'Magnifier',fieldExtender:'Field Extender',powerCell:'Power Cell',freeShot:'Free Shot'};
    const icons = {liquifier:'./img/liquifier-icon.png',deflector:'./img/deflector-icon.png',rotator:'./img/rotator-icon.png',magnifier:'./img/magnifier-icon.png',fieldExtender:'./img/field-extender-icon.png',powerCell:'./img/power-cell-icon.png',freeShot:null};
    let visibleCount = 0;
    for (const t of types) {
      const owned = personal[t] ?? 0;
      if (owned <=0) continue;
      visibleCount++;
      const div = document.createElement('div');
      div.className = 'picker-item';
      div.dataset.type = t;
      const img = icons[t];
      if (img) {
        const im = document.createElement('img');
        im.src = img; im.alt = t;
        div.appendChild(im);
      } else {
        const fb = document.createElement('div');
        fb.textContent = '★'; fb.style.font='700 22px system-ui'; fb.style.color='#FFD700'; fb.style.webkitTextStroke='2px rgba(0,0,0,0.6)'; fb.style.paintOrder='stroke fill';
        div.appendChild(fb);
      }
      const nm = document.createElement('div'); nm.className='pi-name'; nm.textContent = names[t] || t; div.appendChild(nm);
      const ow = document.createElement('div'); ow.className='pi-owned'; ow.textContent = 'Owned: ' + owned; div.appendChild(ow);
      // highlight if already in that slot
      if (loadoutSlots[loadoutPickerSlotIndex]===t) div.style.outline='2px solid rgba(255,255,255,0.9)';
      div.addEventListener('click', () => {
        // check ownership constraint for target slot
        const old = loadoutSlots[loadoutPickerSlotIndex];
        // count of this type in loadout excluding current slot's old value
        let count = 0;
        for (let i=0;i<4;i++) if (i!==loadoutPickerSlotIndex && loadoutSlots[i]===t) count++;
        if (count >= owned) { try{showToast('Not enough owned');}catch{} return; }
        loadoutSlots[loadoutPickerSlotIndex]=t;
        hideLoadoutPicker();
        syncLoadoutOverlay();
      });
      grid.appendChild(div);
    }
    if (visibleCount===0) {
      const empty = document.createElement('div');
      empty.style.font='500 11px system-ui';
      empty.style.color='rgba(255,255,255,0.6)';
      empty.textContent='No items yet — buy in Shop';
      empty.style.alignSelf='center';
      grid.appendChild(empty);
    }
    // Clear Slot button last in overlay
    {
      const div = document.createElement('div');
      div.className = 'picker-item picker-clear';
      div.dataset.type = '';
      const fb = document.createElement('div');
      fb.textContent = '✕'; fb.style.font='700 18px system-ui'; fb.style.color='rgba(255,255,255,0.85)';
      div.appendChild(fb);
      const nm = document.createElement('div'); nm.className='pi-name'; nm.textContent='Clear slot'; div.appendChild(nm);
      const ow = document.createElement('div'); ow.className='pi-owned'; ow.textContent='Empty'; div.appendChild(ow);
      div.addEventListener('click', () => {
        loadoutSlots[loadoutPickerSlotIndex]=null;
        const filled = loadoutSlots.slice(0, unlocked).filter(v=>v!==null);
        const empty = Array(unlocked - filled.length).fill(null);
        const lockedPart = loadoutSlots.slice(unlocked);
        loadoutSlots = [...filled, ...empty, ...lockedPart].slice(0,4);
        while(loadoutSlots.length<4) loadoutSlots.push(null);
        hideLoadoutPicker();
        syncLoadoutOverlay();
      });
      grid.appendChild(div);
    }
  } catch(e){ console.warn('syncLoadoutPicker failed',e); }
}
function showLoadoutPicker(slotIdx) {
  const unlocked = getUnlockedLoadoutSlots();
  if (slotIdx<0||slotIdx>=4) return false;
  if (slotIdx >= unlocked) return false;
  loadoutPickerSlotIndex = slotIdx;
  loadoutPickerVisible = true;
  syncLoadoutPickerOverlay();
  return true;
}
function hideLoadoutPicker() {
  loadoutPickerVisible = false;
  loadoutPickerSlotIndex = -1;
  const overlay = document.getElementById('loadout-item-picker-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function syncLoadoutOverlay() {
  const overlay = document.getElementById('loadout-overlay');
  if (!overlay) return;
  if (loadoutVisible) overlay.classList.remove('hidden');
  else { overlay.classList.add('hidden'); hideLoadoutPicker(); syncProgressionDisplay(); return; }
  try {
    const personal = getPersonalSupply();
    const coins = getCoins();
    const unlocked = getUnlockedLoadoutSlots();
    // Coins display with moneybag
    const coinsEl = document.getElementById('loadout-coins');
    if (coinsEl) coinsEl.textContent = '💰 ' + coins;
    syncProgressionDisplay();
    // Loadout slots — styled like reward menu, with unlock, horizontal line; click opens picker overlay
    const slotsEl = document.getElementById('loadout-slots');
    if (slotsEl) {
      slotsEl.innerHTML = '';
      const names2 = {liquifier:'Liquifier',deflector:'Deflector',rotator:'Rotator',magnifier:'Magnifier',fieldExtender:'Field Extender',powerCell:'Power Cell',freeShot:'Free Shot'};
      const icons2 = {liquifier:'./img/liquifier-icon.png',deflector:'./img/deflector-icon.png',rotator:'./img/rotator-icon.png',magnifier:'./img/magnifier-icon.png',fieldExtender:'./img/field-extender-icon.png',powerCell:'./img/power-cell-icon.png',freeShot:null};
      for (let i=0;i<4;i++) {
        const locked = i >= unlocked;
        const t = loadoutSlots[i];
        const div = document.createElement('div');
        div.dataset.slot = String(i);
        div.dataset.type = t || '';
        if (locked) {
          div.className = 'loadout-slot locked empty';
          const need = [3,6,9][i-1]||'?';
          div.title = 'Locked — clear ' + need + ' holes to unlock';
          // visible explanation inside locked slot
          const unlockEl = document.createElement('div');
          unlockEl.className = 'ls-unlock';
          unlockEl.textContent = 'Clear ' + need + ' holes to unlock';
          div.appendChild(unlockEl);
        } else if (t) {
          div.className = 'loadout-slot filled';
          div.dataset.type = t;
          const ic = icons2[t];
          if (ic) { const im=document.createElement('img'); im.src=ic; im.alt=t; div.appendChild(im); }
          else { const fb=document.createElement('div'); fb.textContent='★'; fb.style.font='700 22px system-ui'; fb.style.color='#FFD700'; fb.style.webkitTextStroke='2px rgba(0,0,0,0.6)'; fb.style.paintOrder='stroke fill'; div.appendChild(fb); }
          const nm2=document.createElement('div'); nm2.className='ls-name'; nm2.textContent=names2[t]||t; div.appendChild(nm2);
          const hint=document.createElement('div'); hint.className='ls-hint'; hint.textContent='Click to change'; div.appendChild(hint);
          div.addEventListener('click', () => showLoadoutPicker(i));
          div.title = 'Click to change';
        } else {
          div.className = 'loadout-slot empty';
          div.title = 'Empty slot — click to select item';
          const plus = document.createElement('div');
          plus.className = 'ls-plus';
          plus.textContent = '+';
          div.appendChild(plus);
          div.addEventListener('click', () => showLoadoutPicker(i));
        }
        slotsEl.appendChild(div);
      }
    }
    // Shop grid — only name and cost with moneybag, max 4 per item (removed when maxed)
    const shop = document.getElementById('shop-grid');
    if (shop) {
      shop.innerHTML='';
      const MAX_SLOTS = MAX_LOADOUT_SLOTS;
      const types = ['liquifier','deflector','rotator','magnifier','fieldExtender','powerCell','freeShot'];
      const names3 = {liquifier:'Liquifier',deflector:'Deflector',rotator:'Rotator',magnifier:'Magnifier',fieldExtender:'Field Extender',powerCell:'Power Cell',freeShot:'Free Shot'};
      const icons3 = {liquifier:'./img/liquifier-icon.png',deflector:'./img/deflector-icon.png',rotator:'./img/rotator-icon.png',magnifier:'./img/magnifier-icon.png',fieldExtender:'./img/field-extender-icon.png',powerCell:'./img/power-cell-icon.png',freeShot:null};
      for (const t of types) {
        const owned = personal[t] ?? 0;
        if (owned >= MAX_SLOTS) continue;
        const price = costFor(t);
        const can = coins >= price;
        const div = document.createElement('div');
        div.className='shop-item'; div.dataset.type=t;
        const ic = icons3[t];
        if (ic) { const im=document.createElement('img'); im.src=ic; im.alt=t; div.appendChild(im); }
        else { const fb=document.createElement('div'); fb.textContent='★'; fb.style.font='700 22px system-ui'; fb.style.color='#FFD700'; div.appendChild(fb); }
        const nm=document.createElement('div'); nm.className='si-name'; nm.textContent=names3[t]||t; div.appendChild(nm);
        const pr=document.createElement('div'); pr.className='si-price'; pr.textContent='💰' + price; div.appendChild(pr);
        const btn=document.createElement('button'); btn.textContent='Buy'; btn.disabled=!can; btn.addEventListener('click', () => { if (progressionPurchase(t)) { syncLoadoutOverlay(); syncLoadoutPickerOverlay(); syncProgressionDisplay(); } else { try{showToast('Not enough coins');}catch{}}});
        div.appendChild(btn);
        shop.appendChild(div);
      }
      if (!shop.children.length) {
        const empty=document.createElement('div');
        empty.style.gridColumn='1 / -1';
        empty.style.font='500 11px system-ui';
        empty.style.color='rgba(255,255,255,0.6)';
        empty.textContent='All items maxed (4)';
        shop.appendChild(empty);
      }
    }
    const startBtn = document.getElementById('loadout-start-button');
    if (startBtn) startBtn.disabled = false;
    // sync picker if visible
    syncLoadoutPickerOverlay();
  } catch(e){ console.warn('syncLoadoutOverlay failed',e); }
}
function addToLoadout(type) {
  // legacy: add to first unlocked empty slot (kept for backward compat tests that call addToLoadout directly)
  const personal = getPersonalSupply();
  const owned = personal[type] ?? 0;
  if (owned <=0) return;
  const unlocked = getUnlockedLoadoutSlots();
  const countInLoadout = loadoutSlots.filter(v=>v===type).length;
  if (countInLoadout >= owned) { try{showToast('Not enough owned');}catch{} return; }
  let idx = -1;
  for (let i=0;i<unlocked;i++) if (loadoutSlots[i]===null) { idx=i; break; }
  if (idx===-1) { try{showToast('Loadout full');}catch{} return; }
  loadoutSlots[idx]=type;
  syncLoadoutOverlay();
}
function removeFromLoadout(idx) {
  const unlocked = getUnlockedLoadoutSlots();
  if (idx<0||idx>=4) return;
  if (idx >= unlocked) return;
  loadoutSlots[idx]=null;
  const unlockedSlots = loadoutSlots.slice(0, unlocked);
  const filled = unlockedSlots.filter(v=>v!==null);
  const empty = Array(unlocked - filled.length).fill(null);
  const lockedPart = loadoutSlots.slice(unlocked);
  loadoutSlots = [...filled, ...empty, ...lockedPart];
  loadoutSlots = loadoutSlots.slice(0,4);
  while (loadoutSlots.length<4) loadoutSlots.push(null);
  syncLoadoutOverlay();
}
function showLoadout(courseId) {
  if (hasRestorableSave()) return false;
  const course = findCourseById(courseId);
  if (!course) return false;
  loadoutCourseId = courseId;
  loadoutSlots = [null,null,null,null];
  loadoutVisible = true;
  hideLoadoutPicker();
  syncLoadoutOverlay();
  syncMainMenu();
  return true;
}
function hideLoadout() {
  loadoutVisible=false;
  loadoutCourseId=null;
  hideLoadoutPicker();
  syncLoadoutOverlay();
  syncMainMenu();
}
function startCourseWithLoadout(courseId, slots) {
  const course = findCourseById(courseId || loadoutCourseId);
  if (!course) return false;
  const chosen = Array.isArray(slots) ? slots.filter(Boolean) : loadoutSlots.filter(Boolean);
  // Derive run supply from chosen slots
  const newSupply = { magnifier:0, liquifier:0, deflector:0, rotator:0, freeShot:0 };
  let fe = 0, pc = 0;
  for (const t of chosen) {
    const nt = normalizeSupplyType(t);
    if (nt==='magnifier') newSupply.magnifier++;
    else if (nt==='liquifier') newSupply.liquifier++;
    else if (nt==='deflector') newSupply.deflector++;
    else if (nt==='rotator') newSupply.rotator++;
    else if (nt==='fieldExtender' || nt==='areaUp') fe++;
    else if (nt==='powerCell') pc++;
    else if (nt==='freeShot') newSupply.freeShot++;
  }
  setActiveCourse(course);
  clearProgress();
  currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
  supply = newSupply;
  clearFreeShotGlow();
  maxAttempts=10;
  areaUpgradeCount=fe; fieldExtenderCount=fe; powerCellCount=pc;
  try{ setFieldPowerCellCount(pc);}catch{};
  rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false; rewardMenuHover=null; rewardRerollHover=false; rewardClaimedFor=null;
  rewardSeedCounter=0;
  holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
  attemptsBannerVisible=false; attemptsBannerTimer=0; attemptsBannerText=''; lastAttemptsBannerValue=null;
  freeShotBannerVisible=false; freeShotBannerTimer=0; freeShotBannerText='Free Shot!'; lastFreeShotBannerValue=null;
  pauseMenuVisible=false; pauseMenuHover=null; mainMenuVisible=false; mainMenuHover=null; courseMenuVisible=false; helpVisible=false; isInLevelPause=false;
  rewardChosenCounts={ magnifier:0, liquifier:0, deflector:0, rotator:0, freeShot:0, areaUp:0, fieldExtender:0, powerCell:0 };
  modifiers=[]; syncModifiersToField(); selectedModifier=null;
  runHolesCleared=0; runCoinsEarned=0;
  try { loadoutUnlockedAtRunStart = getUnlockedLoadoutSlots(); } catch { loadoutUnlockedAtRunStart = 1; }
  loadoutVisible=false; loadoutCourseId=null; loadoutSlots=[null,null,null,null];
  coinSummaryVisible=false;
  loadLevel(0); gameState='AIMING';
  if (winOverlay) winOverlay.classList.add('hidden'); if (gameoverOverlay) gameoverOverlay.classList.add('hidden');
  syncPauseOverlay(); syncMainMenu(); syncLoadoutOverlay();
  updateAttemptsUI(); updateHotbarUI(); syncProgressionDisplay();
  saveProgress();
  return true;
}
function syncCoinSummaryOverlay() {
  const el = document.getElementById('coin-summary-overlay');
  if (!el) return;
  if (coinSummaryVisible) {
    el.classList.remove('hidden');
    const txt = document.getElementById('coin-summary-text');
    const br = document.getElementById('coin-summary-breakdown');
    const amt = document.getElementById('coin-summary-amount');
    const details = document.getElementById('coin-summary-details');
    const unlockEl = document.getElementById('coin-summary-unlock');
    if (amt) amt.textContent = `+${coinSummaryCoins}`;
    // Keep legacy elements hidden — do not show You earned / cleared texts per new spec
    if (txt) { txt.textContent = `You earned ${coinSummaryCoins} coins: ${coinSummaryHoles} holes × ${COINS_PER_HOLE} coins per hole`; txt.classList.add('hidden'); }
    if (br) { br.textContent = coinSummaryHoles>0 ? `${coinSummaryHoles} hole${coinSummaryHoles===1?'':'s'} cleared — ${COINS_PER_HOLE} per hole` : 'No holes cleared — 0 coins'; br.classList.add('hidden'); }
    if (details) {
      details.innerHTML = '';
      const row = document.createElement('div');
      row.className = 'coin-detail-row';
      // number before moneybag, e.g. "3 hole clears × 10💰"
      if (coinSummaryHoles > 0) {
        row.textContent = `${coinSummaryHoles} hole clears × ${COINS_PER_HOLE}💰`;
      } else {
        row.textContent = `0 hole clears × ${COINS_PER_HOLE}💰`;
      }
      details.appendChild(row);
      // Second row when course was cleared (bonus awarded) — "Course cleared, 50💰"
      const isCourseBonus = coinSummaryHoles > 0 && coinSummaryCoins === coinSummaryHoles * COINS_PER_HOLE + COURSE_COMPLETE_BONUS;
      if (isCourseBonus) {
        const row2 = document.createElement('div');
        row2.className = 'coin-detail-row';
        row2.textContent = `Course cleared, ${COURSE_COMPLETE_BONUS}💰`;
        details.appendChild(row2);
      }
    }
    if (unlockEl) {
      try {
        const currentUnlocked = getUnlockedLoadoutSlots();
        const startUnlocked = loadoutUnlockedAtRunStart ?? 1;
        if (currentUnlocked > startUnlocked) {
          unlockEl.textContent = `Loadout slot unlocked`;
          unlockEl.style.display = 'block';
          unlockEl.classList.remove('hidden');
        } else {
          // No new slot was unlocked this run — hide the message to avoid false positive
          unlockEl.textContent = `Loadout slot unlocked`;
          unlockEl.style.display = 'none';
          // Keep hidden for tests that check visibility when not unlocked
        }
      } catch {
        try { unlockEl.style.display = 'none'; } catch {}
      }
    }
  } else el.classList.add('hidden');
}
function showCoinSummary(holes, coins) {
  coinSummaryHoles = Math.max(0, Math.floor(holes||0));
  coinSummaryCoins = Math.max(0, Math.floor(coins||0));
  coinSummaryVisible = true;
  syncCoinSummaryOverlay();
}
function hideCoinSummary() {
  coinSummaryVisible=false;
  syncCoinSummaryOverlay();
}
function finalizeRunCoinsAndShowSummary() {
  const holes = runHolesCleared;
  let coins = holes * COINS_PER_HOLE;
  // Course completion bonus +50 if final hole WIN (full course cleared)
  let isCourseComplete = false;
  try {
    if (gameState === "WIN") {
      const total = activeCourse ? activeCourse.holes.length : (typeof LEVELS !== 'undefined' ? LEVELS.length : 0);
      if (total && (currentHoleIndex === total - 1 || holes === total)) isCourseComplete = true;
      else if (!activeCourse && holes > 0) {
        // fallback: if holes equals total levels
        const t = (typeof getTotalHoles === 'function' ? getTotalHoles() : total);
        if (t && holes === t) isCourseComplete = true;
      }
    }
  } catch {}
  if (isCourseComplete) coins += COURSE_COMPLETE_BONUS;
  runCoinsEarned = coins;
  if (coins>0) addCoins(coins);
  else { // still ensure progression saved even if 0? no need
    try{ saveProgression(); }catch{}
  }
  // Persist and show summary if any holes or even 0? Show if at least run was started (holes>=0). Spec says when run ends show overlay showing how much earned and why. Show always (even 0) but tests may expect visible when holes>0.
  showCoinSummary(holes, coins);
  runHolesCleared=0; runCoinsEarned=0;
  syncProgressionDisplay();
}

// Max Attempts per new req 03/05/09/10 - hidden max, attemptsLeft = max - holeAttempts, replaces Free Shots
let maxAttempts = 10;
function getMaxAttempts() { return maxAttempts; }
function setMaxAttempts(v) { maxAttempts = Math.max(10, Math.floor(v)); updateAttemptsUI(); }
function addMaxAttempts(n = 1) { maxAttempts = Math.max(10, maxAttempts + Math.floor(n)); updateAttemptsUI(); saveProgress(); }
function getAttemptsLeft() { return Math.max(0, maxAttempts - holeAttempts); }

// Modifier Area +10% (Field Extender) and Power Cell +10% strength per REQ-023/06 — renamed from Area Up
const BASE_MODIFIER_RADIUS = MODIFIER_RADIUS; // 54 base per REQ-015 (reduced 40% from 90 = 90*0.6)
const BASE_MODIFIER_STRENGTH = 5;
let areaUpgradeCount = 0; // legacy alias — mirrors fieldExtenderCount
let fieldExtenderCount = 0; // new name, 0 on new game, +10% radius per stack
let powerCellCount = 0; // new — +10% wind strength per stack for magnifier/deflector/rotator (legacy amplify/flip/rotate)
function getAreaUpgradeCount() { return fieldExtenderCount; }
function getFieldExtenderCount() { return fieldExtenderCount; }
function getPowerCellCount() { return powerCellCount; }
function getAreaMultiplier() { return 1 + 0.15 * fieldExtenderCount; } // 1 + 0.15*n
function getEffectiveModifierRadius() { return BASE_MODIFIER_RADIUS * getAreaMultiplier(); }
function getPowerMultiplier() { return 1 + 0.15 * powerCellCount; } // 1 + 0.15*n
function getEffectiveModifierStrength() { return BASE_MODIFIER_STRENGTH * getPowerMultiplier(); }
function addAreaUpgrade(n = 1) { return addFieldExtender(n); }
function addFieldExtender(n = 1) {
  fieldExtenderCount = Math.max(0, fieldExtenderCount + Math.floor(n));
  areaUpgradeCount = fieldExtenderCount;
  const newR = getEffectiveModifierRadius();
  for (const m of modifiers) m.radius = newR;
  syncModifiersToField();
  updateHotbarUI();
}
function addPowerCell(n = 1) {
  powerCellCount = Math.max(0, powerCellCount + Math.floor(n));
  syncModifiersToField();
  updateHotbarUI();
}
// keep legacy aliases for save compat
function getFieldExtenderCountAlias() { return fieldExtenderCount; }

// Persistent Progress via Local Storage per REQ-027 — save on each attempt, resume on revisit
const STORAGE_KEY = "golfVectorField.progress.v1";
function getSavePayload() {
  return {
    version: 1,
    courseId: activeCourseId || (activeCourse ? activeCourse.id : null),
    currentHoleIndex,
    holeAttempts,
    totalAttempts,
    maxAttempts,
    supply: { ...supply },
    isFreeShotActive,
    treasure: level && level.treasure ? { x: level.treasure.x, y: level.treasure.y, radius: level.treasure.radius, isCollected: !!level.treasure.isCollected } : null,
    areaUpgradeCount: fieldExtenderCount,
    fieldExtenderCount,
    powerCellCount,
    rewardPending,
    rewardOffered: [...rewardOffered],
    rewardRerolled,
    rewardMenuVisible,
    rewardSeedCounter,
    campaignSeed: (typeof getCampaignSeed === 'function' ? getCampaignSeed() : null),
    gameState,
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
    maxAttempts = d.maxAttempts !== undefined ? Math.max(10, Math.floor(d.maxAttempts)) : 10;
    // legacy  -> migrate to maxAttempts if needed ( 3 ≈ +? not needed)
    if (d.maxAttempts && d.maxAttempts > 0 && maxAttempts === 10) {
      // ignore legacy 
    }
    supply = {
      magnifier: Math.max(0, Math.floor(d.supply?.magnifier ?? d.supply?.amplify ?? 0)),
      liquifier: Math.max(0, Math.floor(d.supply?.liquifier ?? d.supply?.nullify ?? 1)),
      deflector: Math.max(0, Math.floor(d.supply?.deflector ?? d.supply?.flip ?? 0)),
      rotator: Math.max(0, Math.floor(d.supply?.rotator ?? d.supply?.rotate ?? 0)),
      freeShot: Math.max(0, Math.floor(d.supply?.freeShot ?? 0))
    };
    // migrated: if missing freeShot/rotate, default 0/1
    if (d.supply && d.supply.freeShot === undefined) supply.freeShot = 0;
    if (d.supply && d.supply.rotator === undefined) supply.rotator = 1;
    isFreeShotActive = !!d.isFreeShotActive && canActivateFreeShot();
    try { setWindFreeShotActive(isFreeShotActive); } catch {};
    // Field Extender: support both legacy areaUpgradeCount and new fieldExtenderCount
    if (d.fieldExtenderCount !== undefined) fieldExtenderCount = Math.max(0, Math.floor(d.fieldExtenderCount));
    else if (d.areaUpgradeCount !== undefined) fieldExtenderCount = Math.max(0, Math.floor(d.areaUpgradeCount));
    else fieldExtenderCount = 0;
    areaUpgradeCount = fieldExtenderCount;
    powerCellCount = Math.max(0, Math.floor(d.powerCellCount ?? 0));
    try { setFieldPowerCellCount(powerCellCount); } catch {};
    rewardPending = !!d.rewardPending;
    rewardOffered = Array.isArray(d.rewardOffered) && d.rewardOffered.length === 3 ? [...d.rewardOffered] : [];
    // migrate legacy /maxAttempts offers to freeShot and legacy modifier names to new names
    rewardOffered = rewardOffered.map(t => t === '' ? 'freeShot' : t === 'maxAttempts' ? 'freeShot' : t === 'amplify' ? 'magnifier' : t === 'nullify' ? 'liquifier' : t === 'flip' ? 'deflector' : t === 'rotate' ? 'rotator' : t);
    rewardRerolled = !!d.rewardRerolled;
    rewardMenuVisible = !!d.rewardMenuVisible && rewardOffered.length === 3;
    rewardSeedCounter = Number.isFinite(d.rewardSeedCounter) ? Math.max(0, Math.floor(d.rewardSeedCounter)) : 0;
    if (d.campaignSeed && typeof setCampaignSeed === 'function') {
      try { setCampaignSeed(String(d.campaignSeed)); } catch {};
    }
    // Restore treasure collected state for current hole (one per hole near tree, see 08 §4)
    // Only mutate runtime LEVELS/level, not the stored course definition (which stays false for future runs)
    try {
      if (d.treasure && typeof d.treasure.isCollected === 'boolean') {
        if (LEVELS[currentHoleIndex] && LEVELS[currentHoleIndex].treasure) LEVELS[currentHoleIndex].treasure.isCollected = !!d.treasure.isCollected;
        if (typeof level !== 'undefined' && level && level.treasure) level.treasure.isCollected = !!d.treasure.isCollected;
      }
    } catch {};
    // Restore gameState, handle legacy saves
    if (d.gameState === 'GAME_OVER') {
      gameState = 'GAME_OVER';
    } else if (d.gameState) {
      // only restore GAME_OVER, otherwise AIMING (per 10 spec, never FLYING/WIN)
      gameState = 'AIMING';
    }
    if (Array.isArray(d.modifiers)) {
      const effR = getEffectiveModifierRadius();
      const normType = (t) => t === 'amplify' ? 'magnifier' : t === 'nullify' ? 'liquifier' : t === 'flip' ? 'deflector' : t === 'rotate' ? 'rotator' : t;
      modifiers = d.modifiers.filter(m => m && typeof m.x === 'number' && typeof m.y === 'number' && typeof m.type === 'string').map(m => ({
        id: m.id ?? (Date.now() + Math.random()),
        type: normType(m.type),
        x: Math.max(0, Math.min(LOGICAL_W, Number(m.x))),
        y: Math.max(0, Math.min(LOGICAL_H, Number(m.y))),
        radius: effR
      }));
    } else {
      modifiers = [];
    }
    if (typeof d.aimAngle === 'number' && Number.isFinite(d.aimAngle)) {
      try { setAimAngle(d.aimAngle); } catch {};
    }
    if (d.rewardChosenCounts && typeof d.rewardChosenCounts === 'object') {
      for (const k of Object.keys(rewardChosenCounts)) {
        if (k in d.rewardChosenCounts) rewardChosenCounts[k] = Math.max(0, Math.floor(d.rewardChosenCounts[k] || 0));
      }
      // legacy mapping for old modifier names
      if ('amplify' in d.rewardChosenCounts && !('magnifier' in d.rewardChosenCounts)) rewardChosenCounts.magnifier = Math.max(0, Math.floor(d.rewardChosenCounts.amplify || 0));
      if ('nullify' in d.rewardChosenCounts && !('liquifier' in d.rewardChosenCounts)) rewardChosenCounts.liquifier = Math.max(0, Math.floor(d.rewardChosenCounts.nullify || 0));
      if ('flip' in d.rewardChosenCounts && !('deflector' in d.rewardChosenCounts)) rewardChosenCounts.deflector = Math.max(0, Math.floor(d.rewardChosenCounts.flip || 0));
      if ('rotate' in d.rewardChosenCounts && !('rotator' in d.rewardChosenCounts)) rewardChosenCounts.rotator = Math.max(0, Math.floor(d.rewardChosenCounts.rotate || 0));
    } else if (d.version === 1) {
      // Derive from existing counters for old saves
      rewardChosenCounts.magnifier = Math.max(0, Math.floor(d.supply?.magnifier ?? d.supply?.amplify ?? supply.magnifier ?? 0));
      rewardChosenCounts.liquifier = Math.max(0, Math.floor(d.supply?.liquifier ?? d.supply?.nullify ?? supply.liquifier ?? 0));
      rewardChosenCounts.deflector = Math.max(0, Math.floor(d.supply?.deflector ?? d.supply?.flip ?? supply.deflector ?? 0));
      rewardChosenCounts.rotator = Math.max(0, Math.floor(d.supply?.rotator ?? d.supply?.rotate ?? supply.rotator ?? 0));
      const derivedField = Math.max(0, Math.floor((d.fieldExtenderCount ?? d.areaUpgradeCount) || fieldExtenderCount || areaUpgradeCount || 0));
      rewardChosenCounts.areaUp = derivedField;
      rewardChosenCounts.fieldExtender = derivedField;
      rewardChosenCounts.powerCell = Math.max(0, Math.floor(d.powerCellCount || powerCellCount || 0));
      //  times chosen cannot be derived, stays 0 if missing
    }
    // Ensure areaUp / fieldExtender stay synced for backward compat
    if (rewardChosenCounts.fieldExtender !== rewardChosenCounts.areaUp) {
      const v = Math.max(rewardChosenCounts.areaUp || 0, rewardChosenCounts.fieldExtender || 0);
      rewardChosenCounts.areaUp = v;
      rewardChosenCounts.fieldExtender = v;
    }
    // Do not restore paused state as visible on load — resume as AIMING
    pauseMenuVisible = false; pauseMenuHover = null;
    return d;
  } catch {
    return null;
  }
}
function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {};
}

// Pause Menu per REQ-028 — Escape, Resume/New Game, reward stats xN
let pauseMenuVisible = false;
let pauseMenuHover = null;
let rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
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
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {};
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
  clearFreeShotGlow();
  hideSoftlockBanner();
  resetSoftlockDetection();
  maxAttempts = 10; areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {}; rewardPending = false; 
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardSeedCounter = 0;
  pauseMenuVisible = false; pauseMenuHover = null;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  loadLevel(0);
  gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
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
let _lastCourseListSig = null;
function _courseListSignature() {
  try {
    // Cheap signature: length + each id/bestTotal
    return courses.map(c => `${c.id}:${c.holeCount}:${c.bestTotal}`).join('|');
  } catch { return null; }
}
function renderMainMenuRootVisibility() {
  const contBtn = document.getElementById('continue-button');
  const endBtn = document.getElementById('end-run-button');
  const newGameBtn = document.getElementById('new-game-button');
  const stagedList = document.getElementById('staged-course-list');
  const showSave = hasRestorableSave();
  const isPause = !!isInLevelPause;
  // Continue button removed — never shown on main menu (auto-resume instead)
  if (contBtn) contBtn.classList.add('hidden');
  // Splash never shows End Run, even if save exists; pause shows End Run only if save exists
  if (endBtn) endBtn.classList.toggle('hidden', !isPause || !showSave);
  // Staged unlocking: New Game is removed (courses auto-generate), always hidden
  if (newGameBtn) newGameBtn.classList.add('hidden');
  // Pause in game should show only Continue and End Run, not the levels
  if (stagedList) stagedList.classList.toggle('hidden', !!isPause);
  // Only re-render course list when staged courses actually changed (avoids lag on every help close / menu toggle)
  // Courses are generated once and cached in localStorage; read from cache without re-generation
  if (!isPause) {
    const sig = _courseListSignature();
    if (sig !== _lastCourseListSig) {
      _lastCourseListSig = sig;
      try { renderCourseList(); } catch {};
    }
  }
}
function showMainMenuRoot() {
  courseMenuVisible = false;
  helpVisible = false;
  const root = document.getElementById('main-menu-root');
  const cm = document.getElementById('course-menu');
  const hm = document.getElementById('help-overlay');
  const mmc = document.querySelector('#main-menu-overlay .main-menu-content');
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
  try { renderCourseList(); } catch {};
}
function showHelpOverlay() {
  helpVisible = true;
  courseMenuVisible = false;
  const hm = document.getElementById('help-overlay');
  if (hm) hm.classList.remove('hidden');
  // Hide main and pause contents but keep overlays for backdrop
  const mmc = document.querySelector('#main-menu-overlay .main-menu-content');
  const pc = document.querySelector('#pause-overlay .pause-content');
  if (mmc) mmc.classList.add('hidden');
  if (pc) pc.classList.add('hidden');
  syncHelpOverlay();
}
function handleContinue() {
  // In-level pause (Escape during active run): simply hide pause overlay and resume preserving ball
  if (pauseMenuVisible) {
    pauseMenuVisible = false;
    isInLevelPause = false;
    helpVisible = false;
    syncPauseOverlay();
    syncHelpOverlay();
    return true;
  }
  // Legacy isInLevelPause + mainMenuVisible compat
  if (isInLevelPause && mainMenuVisible) {
    mainMenuVisible = false;
    courseMenuVisible = false;
    helpVisible = false;
    isInLevelPause = false;
    syncMainMenu();
    syncPauseOverlay();
    syncHelpOverlay();
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
    // Restore freeShot glow after ball created
    try { setWindFreeShotActive(isFreeShotActive); if (isFreeShotActive && ball && ball.pos) updateFreeShotGlow(ball.pos, 0); } catch {};
    gameState = "AIMING";
    if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
    resetHotbarCollapsed();
    updateAttemptsUI();
    updateHotbarUI();
    syncMainMenu();
    syncPauseOverlay();
    // draw terrain now
    redrawBottom();
  } catch (e) { console.warn('continue resume failed', e); return false; }
  return true;
}
function openInLevelPause() {
  // Show pause menu (separate overlay) with backdrop, works even in FLYING
  if (rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || gameState === "WIN" || gameState === "GAME_OVER") return false;
  if (pauseMenuVisible) return false;
  if (mainMenuVisible) return false;
  if (!activeCourse && !hasRestorableSave()) return false;
  pauseMenuVisible = true;
  isInLevelPause = true;
  helpVisible = false;
  syncPauseOverlay();
  syncHelpOverlay();
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
  try { localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify({ version: 1, bestTotal: Math.max(0, Math.floor(n)) })); } catch {};
}
function clearHighScore() { try { localStorage.removeItem(HIGH_SCORE_KEY); } catch {}; }
function maybeUpdateHighScore() {
  if (!activeCourse) return;
  if (currentHoleIndex !== activeCourse.holes.length - 1 || gameState !== "WIN") return;
  // Legacy global high score (migration)
  const prev = getHighScore();
  if (prev == null || totalAttempts < prev) setHighScore(totalAttempts);
  // Per-course bestTotal per REQ-031 + staged unlocking 3→6→9→18
  let updated = false;
  if (activeCourse.bestTotal == null || totalAttempts < activeCourse.bestTotal) {
    activeCourse.bestTotal = totalAttempts;
    updated = true;
    try { saveCourses(); } catch {};
    // Re-render course list to show new record
    try { renderCourseList(); } catch {};
  }
  // Auto-generate next stage if this stage was just cleared (or already cleared)
  if (activeCourse.bestTotal !== null) {
    const next = ensureNextStageUnlocked(courses);
    if (next) {
      try { renderCourseList(); } catch {};
    } else if (updated) {
      // still re-render to show unlock
      try { renderCourseList(); } catch {};
    }
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
  // New staged unlocking: show 4 rows (3,6,9,18) with locked/unlocked + edit per stage
  // Render into #staged-course-list if exists (new main menu root), otherwise fallback to #course-list
  const stagedList = document.getElementById('staged-course-list');
  const legacyList = document.getElementById('course-list');
  const targets = [];
  if (stagedList) targets.push(stagedList);
  if (legacyList && legacyList !== stagedList) targets.push(legacyList);
  if (targets.length === 0) return;
  for (const list of targets) {
    list.innerHTML = '';
    for (const holeCount of STAGES) {
      const course = courses.find(c => c.holeCount === holeCount);
      const unlocked = isStageUnlocked(courses, holeCount);
      const row = document.createElement('div');
      row.className = 'course-row' + (unlocked ? '' : ' locked');
      row.dataset.holes = String(holeCount);
      if (course) row.dataset.courseId = course.id;
      if (!unlocked) {
        const lockedBtn = document.createElement('button');
        lockedBtn.className = 'course-play-button';
        lockedBtn.disabled = true;
        lockedBtn.innerHTML = `<span class="course-name">🔒 ${holeCount} Holes — Locked</span><span class="course-meta">Clear ${STAGES[STAGES.indexOf(holeCount)-1]} Holes to unlock</span>`;
        lockedBtn.title = `Locked — clear ${STAGES[STAGES.indexOf(holeCount)-1]} Holes`;
        row.appendChild(lockedBtn);
      } else if (course) {
        const record = course.bestTotal == null ? '—' : String(course.bestTotal);
        const playBtn = document.createElement('button');
        playBtn.className = 'course-play-button';
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
        row.appendChild(playBtn);
      } else {
        // Unlocked but no course yet (should not happen, but handle)
        row.innerHTML = `<span class="course-name">${holeCount} Holes — Ready</span>`;
      }
      list.appendChild(row);
    }
  }
  // Cache signature after render to avoid re-rendering on every help close / menu toggle
  try { _lastCourseListSig = _courseListSignature(); } catch {};
  // After rendering, ensure Continue remains hidden (removed) — auto-resume handles saves
  try {
    const contBtn = document.getElementById('continue-button');
    if (contBtn) contBtn.classList.add('hidden');
  } catch {};
}

function handleCoursePlay(courseId) {
  // New flow: show loadout before first hole (10-progression.md §2)
  if (hasRestorableSave()) {
    // Should not happen via button when save exists, but guard
    return;
  }
  const course = findCourseById(courseId);
  if (!course) return;
  // Ensure progression loaded
  try { loadProgression(); } catch {}
  loadoutCourseId = courseId;
  loadoutSlots = [null,null,null,null];
  loadoutVisible = true;
  syncLoadoutOverlay();
  syncMainMenu();
  syncProgressionDisplay();
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
        try { document.execCommand('copy'); } catch {};
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
      try { document.execCommand('copy'); } catch {};
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
      // Main menu is always transparent over splash, never with backdrop (pause has its own overlay)
      el.classList.remove("with-backdrop");
      el.dataset.mode = "entry";
      // Sync sub-views — help is now global, not inside main-menu-overlay, so handle separately
      const mmc = el.querySelector('.main-menu-content');
      const root = document.getElementById('main-menu-root');
      const cm = document.getElementById('course-menu');
      // Help is global, handled in syncHelpOverlay
      if (courseMenuVisible) {
        if (root) root.classList.add('hidden');
        if (cm) cm.classList.remove('hidden');
        const ncc2 = document.getElementById('new-course-choices');
        const nccDiff2 = document.getElementById('new-course-choices-difficulty');
        const ia2 = document.getElementById('import-area');
        const cmf2 = document.getElementById('course-menu-footer');
        if (ncc2) ncc2.classList.add('hidden');
        if (nccDiff2) nccDiff2.classList.add('hidden');
        if (ia2) ia2.classList.add('hidden');
        if (cmf2) cmf2.classList.remove('hidden');
        try { renderCourseList(); } catch {};
        if (mmc) mmc.classList.remove('hidden');
      } else {
        if (root) root.classList.remove('hidden');
        if (cm) cm.classList.add('hidden');
        if (mmc) mmc.classList.remove('hidden');
        renderMainMenuRootVisibility();
      }
    } else {
      el.classList.add("hidden");
      el.classList.remove("with-backdrop");
      el.dataset.mode = "";
    }
  }
  // Help overlay is global — sync separately
  syncHelpOverlay();
  syncCampaignSeedDisplay();
  syncProgressionDisplay();
  syncLoadoutOverlay();
  syncCoinSummaryOverlay();
  // If main menu hidden or help visible, hide campaign edit popup
  if (!mainMenuVisible || helpVisible) {
    if (campaignEditVisible || campaignConfirmVisible) {
      campaignEditVisible = false;
      campaignConfirmVisible = false;
      pendingCampaignAction = null;
      syncCampaignEditOverlay();
      syncCampaignConfirmOverlay();
    } else {
      // ensure overlay hidden even if flag already false (stale DOM)
      const ce = document.getElementById('campaign-edit-overlay');
      if (ce && !ce.classList.contains('hidden')) ce.classList.add('hidden');
      const cf = document.getElementById('campaign-confirm-overlay');
      if (cf && !cf.classList.contains('hidden')) cf.classList.add('hidden');
    }
  } else {
    syncCampaignEditOverlay();
    syncCampaignConfirmOverlay();
  }
  // Parallax layered background
  try { syncParallaxVisibility(); } catch {}
  // Ensure bottom background reflects mode (splash vs terrain)
  redrawBottom();
  // Wind overlay: hidden on entry splash, visible on level and also while paused (pause has backdrop)
  try { const showWind = !mainMenuVisible && !pauseMenuVisible; setWindVisible(!showWind ? false : true); } catch {};
  // Actually wind should be visible on level and also while paused (dimmed), hidden only on main menu entry
  try { const showWind2 = !mainMenuVisible; setWindVisible(showWind2 || pauseMenuVisible); } catch {};
  updateHotbarUI();
}

let campaignEditVisible = false;
let campaignConfirmVisible = false;
let pendingCampaignAction = null; // {type:'refresh'} or {type:'apply', seed:string}
const CAMPAIGN_SEED_REGEX = /^[0-9a-f]+$/;
const CAMPAIGN_SEED_LENGTH = 8;
function isValidCampaignSeed(s) {
  const t = String(s || '').trim();
  return t.length === CAMPAIGN_SEED_LENGTH && CAMPAIGN_SEED_REGEX.test(t);
}
function isCampaignEditVisible() { return campaignEditVisible; }
function isCampaignConfirmVisible() { return campaignConfirmVisible; }
function syncCampaignEditOverlay() {
  const el = document.getElementById('campaign-edit-overlay');
  if (!el) return;
  if (campaignEditVisible) {
    el.classList.remove('hidden');
    try {
      const cs = (typeof getCampaignSeed === 'function' ? getCampaignSeed() : null) || '';
      const cur = document.getElementById('campaign-edit-current-seed');
      if (cur) cur.textContent = String(cs);
      const inp = document.getElementById('campaign-seed-input');
      if (inp) {
        inp.value = String(cs);
        // clear previous error
        const err = document.getElementById('campaign-seed-error');
        if (err) { err.textContent = ''; err.classList.add('hidden'); }
        setTimeout(() => { try { inp.focus(); inp.select(); } catch {}; }, 0);
      }
    } catch {};
  } else {
    el.classList.add('hidden');
  }
}
function showCampaignEditOverlay() {
  if (!mainMenuVisible) return;
  campaignEditVisible = true;
  // ensure confirm hidden when opening edit
  campaignConfirmVisible = false;
  pendingCampaignAction = null;
  syncCampaignConfirmOverlay();
  syncCampaignEditOverlay();
}
function hideCampaignEditOverlay() {
  campaignEditVisible = false;
  campaignConfirmVisible = false;
  pendingCampaignAction = null;
  syncCampaignEditOverlay();
  syncCampaignConfirmOverlay();
  try {
    const err = document.getElementById('campaign-seed-error');
    if (err) { err.textContent = ''; err.classList.add('hidden'); }
  } catch {};
}
function syncCampaignConfirmOverlay() {
  const el = document.getElementById('campaign-confirm-overlay');
  if (!el) return;
  if (campaignConfirmVisible) el.classList.remove('hidden');
  else el.classList.add('hidden');
}
function showCampaignConfirm(action) {
  pendingCampaignAction = action;
  campaignConfirmVisible = true;
  syncCampaignConfirmOverlay();
}
function hideCampaignConfirm(keepEditOpen) {
  campaignConfirmVisible = false;
  pendingCampaignAction = null;
  syncCampaignConfirmOverlay();
  if (!keepEditOpen) hideCampaignEditOverlay();
}
function executePendingCampaignAction() {
  const act = pendingCampaignAction;
  if (!act) return;
  if (act.type === 'refresh') {
    // use native confirm as fallback for programmatic tests, but primary is custom overlay
    // native confirm check kept for backward compat if overlay bypassed
    try {
      const res = regenerateCampaign();
      try { courses = res.courses || loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
      clearProgress();
      rewardSeedCounter = 0;
      rewardPending = false; rewardOffered = []; rewardMenuVisible = false; rewardRerolled = false;
      _lastCourseListSig = null;
      try { renderCourseList(); } catch {};
      syncCampaignSeedDisplay();
      hideCampaignEditOverlay();
      updateHotbarUI();
    } catch (e) { console.warn('campaign regenerate failed', e); }
  } else if (act.type === 'apply') {
    const val = String(act.seed || '').trim();
    try {
      const res = applyManualSeed(val);
      try { courses = (res && res.courses) ? res.courses : loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
      clearProgress();
      rewardSeedCounter = 0;
      rewardPending = false; rewardOffered = []; rewardMenuVisible = false; rewardRerolled = false;
      _lastCourseListSig = null;
      try { renderCourseList(); } catch {};
      syncCampaignSeedDisplay();
      hideCampaignEditOverlay();
      updateHotbarUI();
    } catch (e) { console.warn('apply seed failed', e); try { showToast('Invalid seed'); } catch {}; }
  }
  pendingCampaignAction = null;
  campaignConfirmVisible = false;
  syncCampaignConfirmOverlay();
}

function syncCampaignSeedDisplay() {
  const wrapper = document.getElementById('campaign-seed-wrapper');
  const el = document.getElementById('campaign-seed-display');
  if (!el) return;
  try {
    const cs = (typeof getCampaignSeed === 'function' ? getCampaignSeed() : null) || '';
    el.textContent = 'Seed: ' + String(cs);
    const show = !!mainMenuVisible;
    if (wrapper) wrapper.classList.toggle('hidden', !show);
    else el.classList.toggle('hidden', !show);
    // also update popup current seed if visible
    const cur = document.getElementById('campaign-edit-current-seed');
    if (cur) cur.textContent = String(cs);
  } catch {};
}

function handleCampaignRegenerate() {
  // New spec: refresh button shows warning popup, not immediate confirm
  // Show second warning overlay; keep edit popup open underneath
  showCampaignConfirm({ type: 'refresh' });
}
function handleCampaignRefreshViaConfirm() {
  // Legacy path using native confirm for programmatic callers (tests that stub confirm)
  // If confirm returns false, abort; else execute refresh
  try {
    if (typeof confirm === 'function' && !confirm('Re-generating the seed will regenerate all levels and you will lose your progress. Continue?')) return;
  } catch {};
  try {
    const res = regenerateCampaign();
    try { courses = res.courses || loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
    clearProgress();
    rewardSeedCounter = 0;
    rewardPending = false; rewardOffered = []; rewardMenuVisible = false; rewardRerolled = false;
    _lastCourseListSig = null;
    try { renderCourseList(); } catch {};
    syncCampaignSeedDisplay();
    hideCampaignEditOverlay();
    updateHotbarUI();
  } catch (e) { console.warn('campaign regenerate failed', e); }
}
function handleManualSeedApply() {
  const input = document.getElementById('campaign-seed-input');
  const valRaw = input ? String(input.value || '').trim() : '';
  const val = valRaw;
  const errEl = document.getElementById('campaign-seed-error');
  // Validation: must be 0-9 a-f hex and expected length 8
  if (!val) {
    if (errEl) { errEl.textContent = 'Seed cannot be empty'; errEl.classList.remove('hidden'); }
    else try { showToast('Seed cannot be empty'); } catch {};
    return;
  }
  if (!isValidCampaignSeed(val)) {
    if (errEl) { errEl.textContent = 'Invalid seed: must be ' + CAMPAIGN_SEED_LENGTH + ' characters 0-9a-f'; errEl.classList.remove('hidden'); }
    else try { showToast('Invalid seed'); } catch {};
    return;
  }
  const current = (typeof getCampaignSeed === 'function' ? String(getCampaignSeed() || '') : '');
  if (val === current) {
    // Same as current → simply close, no warning, no regeneration
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    hideCampaignEditOverlay();
    return;
  }
  // Changed → show warning popup (same as refresh)
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  showCampaignConfirm({ type: 'apply', seed: val });
}
function handleManualSeedApplyLegacy() {
  // Legacy direct apply without validation (for tests using __applyManualSeed)
  const input = document.getElementById('campaign-seed-input');
  const val = input ? String(input.value || '').trim() : '';
  if (!val) {
    try { showToast('Seed cannot be empty'); } catch {};
    return;
  }
  try {
    if (typeof confirm === 'function' && !confirm('Re-generating the seed will regenerate all levels and you will lose your progress. Continue?')) return;
  } catch {};
  try {
    const res = applyManualSeed(val);
    try { courses = (res && res.courses) ? res.courses : loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
    clearProgress();
    rewardSeedCounter = 0;
    rewardPending = false; rewardOffered = []; rewardMenuVisible = false; rewardRerolled = false;
    _lastCourseListSig = null;
    try { renderCourseList(); } catch {};
    syncCampaignSeedDisplay();
    hideCampaignEditOverlay();
    updateHotbarUI();
  } catch (e) { console.warn('apply seed failed', e); try { showToast('Invalid seed'); } catch {}; }
}

function syncHelpOverlay() {
  const hm = document.getElementById('help-overlay');
  if (!hm) return;
  if (helpVisible) {
    hm.classList.remove('hidden');
    // Hide other menu contents when help is visible (but keep overlays themselves to preserve backdrop)
    const mmc = document.querySelector('#main-menu-overlay .main-menu-content');
    const pc = document.querySelector('#pause-overlay .pause-content');
    if (mmc) mmc.classList.add('hidden');
    if (pc) pc.classList.add('hidden');
  } else {
    hm.classList.add('hidden');
    const mmc = document.querySelector('#main-menu-overlay .main-menu-content');
    const pc = document.querySelector('#pause-overlay .pause-content');
    if (mmc && mainMenuVisible) mmc.classList.remove('hidden');
    if (pc && pauseMenuVisible) pc.classList.remove('hidden');
  }
}
function isMainMenuVisible() { return mainMenuVisible; }
function startNewGameFromMain() {
  clearProgress();
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {};
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 }; clearFreeShotGlow(); hideSoftlockBanner(); resetSoftlockDetection(); maxAttempts = 10; areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {}; rewardPending = false; 
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardSeedCounter = 0;
  pauseMenuVisible = false; pauseMenuHover = null; mainMenuVisible = false; mainMenuHover = null; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  loadLevel(0); gameState = "AIMING";
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
  syncPauseOverlay(); syncMainMenu();
  updateAttemptsUI(); updateHotbarUI();
  maybeShowRewardMenu();
  return true;
}
function endRun() {
  // Allow End Run from either legacy pause or new in-level pause (main menu with backdrop)
  if (!pauseMenuVisible && !(mainMenuVisible && isInLevelPause)) return false;
  // Coin economy: finalize coins before clearing run
  try { finalizeRunCoinsAndShowSummary(); } catch {}
  clearProgress();
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 }; clearFreeShotGlow(); hideSoftlockBanner(); resetSoftlockDetection(); maxAttempts = 10; areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {}; rewardPending = false; 
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardSeedCounter = 0;
  holeBannerVisible = false; holeBannerTimer = 0; holeBannerText = "";
  attemptsBannerVisible = false; attemptsBannerTimer = 0; attemptsBannerText = ""; lastAttemptsBannerValue = null;
  freeShotBannerVisible = false; freeShotBannerTimer = 0; freeShotBannerText = "Free Shot!"; lastFreeShotBannerValue = null;
  hideSoftlockBanner();
  resetSoftlockDetection();
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  pauseMenuVisible = false; pauseMenuHover = null; mainMenuVisible = true; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  gameState = "AIMING";
  // Avoid heavy field generation when entering main menu (splash) — courses are cached in localStorage, field will be created on next course play
  // Keep level as dummy behind splash to avoid blocking UI; no createField here
  if (LEVELS.length) {
    level = LEVELS[0];
  } else if (courses.length) {
    level = courses[0].holes[0];
  }
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
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
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
  // Hide any win state
  updateAttemptsUI();
  updateForceBar();
  // Check reward menu if needed for current totalAttempts
  maybeShowRewardMenu();
  saveProgress();
  // Update URL hash for sharing without reload (secret but visible)
  try { history.replaceState(null, "", `#hole-${idx+1}`); } catch {};
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
  } catch {};
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

// Reward menu per REQ-09 : hole-start (except hole 1) + treasure near tree - 3 random of 5 pool (bouncy removed, maxAttempts replaced by freeShot Supply +3, trees always bounce)
// Campaign deterministic rewards (12-campaign): single campaignSeed controls all offers including rerolls via seeded shuffle + counter
const REWARD_POOL = ['magnifier', 'liquifier', 'deflector', 'rotator', 'freeShot', 'fieldExtender', 'powerCell'];
// keep legacy alias for backward compat tests
const REWARD_POOL_LEGACY = ['magnifier', 'liquifier', 'deflector', 'rotator', 'freeShot', 'areaUp'];
let rewardMenuVisible = false;
let rewardClaimedFor = null; // last totalAttempts value claimed, kept for backward compat/debug
let rewardMenuHover = null; // hovered type for visual feedback
let rewardOffered = []; // 3 distinct types randomly chosen from REWARD_POOL per trigger
let rewardPending = false;
let rewardRerolled = false; // per-menu flag per REQ-025, false when menu freshly shown
let rewardRerollHover = false; // hover for re-roll button
let rewardSeedCounter = 0; // deterministic counter for campaign seed, persisted in STORAGE_KEY
function hashSeedString(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32Reward(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(a, seedStr) {
  const seed = hashSeedString(seedStr);
  const rand = mulberry32Reward(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getSeededRewardOffer() {
  const cs = (typeof getCampaignSeed === 'function' && getCampaignSeed()) ? String(getCampaignSeed()) : 'default';
  const seedStr = cs + ':' + rewardSeedCounter;
  rewardSeedCounter++;
  // Field Extender and Power Cell share one slot (combined) with same probability as other items, never together
  const basePool = ['magnifier','liquifier','deflector','rotator','freeShot'];
  const effectivePool = [...basePool, 'COMBINED'];
  seededShuffle(effectivePool, seedStr);
  let offer = effectivePool.slice(0, 3);
  if (offer.includes('COMBINED')) {
    const pickSeed = hashSeedString(seedStr + ':pick');
    const r = mulberry32Reward(pickSeed)();
    const resolved = r < 0.5 ? 'fieldExtender' : 'powerCell';
    offer = offer.map(t => t === 'COMBINED' ? resolved : t);
  }
  // Ensure never both fieldExtender and powerCell together (legacy guard)
  if (offer.includes('fieldExtender') && offer.includes('powerCell')) {
    const dupIdx = offer.indexOf('powerCell');
    const notInOffer = REWARD_POOL.filter(x => !offer.includes(x));
    if (notInOffer.length) {
      const pickSeed2 = hashSeedString(seedStr + ':dedup');
      const rr = mulberry32Reward(pickSeed2)();
      const pick = notInOffer[Math.floor(rr * notInOffer.length)];
      offer[dupIdx] = pick;
    } else {
      offer[dupIdx] = 'magnifier';
    }
  }
  return offer;
}
function getSeededRerollOffer() {
  const cs = (typeof getCampaignSeed === 'function' && getCampaignSeed()) ? String(getCampaignSeed()) : 'default';
  const seedStr = cs + ':reroll:' + rewardSeedCounter;
  rewardSeedCounter++;
  const basePool = ['magnifier','liquifier','deflector','rotator','freeShot'];
  const effectivePool = [...basePool, 'COMBINED'];
  seededShuffle(effectivePool, seedStr);
  let offer = effectivePool.slice(0, 3);
  if (offer.includes('COMBINED')) {
    const pickSeed = hashSeedString(seedStr + ':pick');
    const r = mulberry32Reward(pickSeed)();
    const resolved = r < 0.5 ? 'fieldExtender' : 'powerCell';
    offer = offer.map(t => t === 'COMBINED' ? resolved : t);
  }
  if (offer.includes('fieldExtender') && offer.includes('powerCell')) {
    const dupIdx = offer.indexOf('powerCell');
    const notInOffer = REWARD_POOL.filter(x => !offer.includes(x));
    if (notInOffer.length) {
      const pickSeed2 = hashSeedString(seedStr + ':dedup');
      const rr = mulberry32Reward(pickSeed2)();
      const pick = notInOffer[Math.floor(rr * notInOffer.length)];
      offer[dupIdx] = pick;
    } else {
      offer[dupIdx] = 'magnifier';
    }
  }
  return offer;
}
function maybeFilterAreaUp(offer, seedStr) {
  // Legacy: Field Extender + Power Cell now combined slot, never together. Keep guard for legacy saves.
  if (offer.includes('fieldExtender') && offer.includes('powerCell')) {
    const idx = offer.indexOf('powerCell');
    const notInOffer = REWARD_POOL.filter(t => !offer.includes(t));
    if (notInOffer.length) {
      const pickSeed = hashSeedString(seedStr + ':filter');
      const r = mulberry32Reward(pickSeed)();
      const replacement = notInOffer[Math.floor(r * notInOffer.length)];
      return offer.map((t,i) => i===idx ? replacement : t);
    }
  }
  return offer;
}
function maybeFilterFieldExtender(offer, seedStr) { return maybeFilterAreaUp(offer, seedStr); }
function getRewardSeedCounter() { return rewardSeedCounter; }
function setRewardSeedCounter(v) { rewardSeedCounter = Math.max(0, Math.floor(v || 0)); }

// 11-banners: hole banner 1s, attempts banner 1s (Last Attempt) — Last Attempt suppressed while freeShot supply >0, Free Shot banner similar
let holeBannerVisible = false;
let holeBannerText = "";
let holeBannerTimer = 0;
const holeBannerDuration = 1000;
let attemptsBannerVisible = false;
let attemptsBannerText = "";
let attemptsBannerTimer = 0;
const attemptsBannerDuration = 1000;
let lastAttemptsBannerValue = null;
let freeShotBannerVisible = false;
let freeShotBannerText = "Free Shot!";
let freeShotBannerTimer = 0;
const freeShotBannerDuration = 1000;
let lastFreeShotBannerValue = null;

function getRewardRerolled() { return rewardRerolled; }
function rerollReward() {
  if (!rewardMenuVisible || rewardRerolled) return false;
  // Cost is always 1 attempt, never free shot, never secret counter per REQ-025
  holeAttempts += 1;
  totalAttempts += 1;
  attempts = totalAttempts;
  updateAttemptsUI();
  saveProgress();
  // If this reroll exhausted attempts, Game Over immediately — do not show new reward
  if (getAttemptsLeft() <= 0) {
    showGameOver();
    return true;
  }
  rewardRerolled = true;
  // Deterministic reroll from campaign seed + counter (12-campaign)
  rewardOffered = getSeededRerollOffer();
  rewardMenuHover = null;
  rewardRerollHover = false;
  syncRewardOverlay();
  saveProgress();
  return true;
}

function shuffleArray(a) {
  // Legacy random shuffle (kept for non-reward uses); rewards now use seededShuffle
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function maybeShowRewardMenu() {
  if (gameState === "WIN" || gameState === "GAME_OVER") return;
  if (pauseMenuVisible) return;
  if (mainMenuVisible) return;
  if (rewardMenuVisible) return;
  if (holeBannerVisible) return;
  if (attemptsBannerVisible) return;
  if (freeShotBannerVisible) return;
  // Reward blocked when out of attempts at attempt-start — Game Over is deferred to next attempt start (handleLaunch)
  // Allow treasure reward during last flight (FLYING) even with attemptsLeft 0, since last shot is allowed to finish
  if (getAttemptsLeft() <= 0 && gameState !== "FLYING") {
    return;
  }
  // Allow reward menu in AIMING, CHARGING and FLYING — treasure pickup shows immediately even mid-flight
  if (gameState !== "AIMING" && gameState !== "CHARGING" && gameState !== "FLYING") return;
  // REQ-021 per-hole: no reward before first attempt on hole 1, reward before first attempt on holes >0 via rewardPending set on hole entry
  // 12-campaign: deterministic reward via campaignSeed + counter
  if (rewardPending) {
    rewardOffered = getSeededRewardOffer();
    rewardMenuVisible = true;
    rewardMenuHover = null;
    rewardPending = false;
    rewardRerolled = false;
    rewardRerollHover = false;
    updateHotbarUI();
    syncRewardOverlay();
    saveProgress();
    return;
  }
}

// HTML Reward Overlay (replaces canvas drawRewardMenu)
function syncRewardOverlay() {
  const overlay = document.getElementById('reward-overlay');
  const btnContainer = document.getElementById('reward-buttons');
  const rerollBtn = document.getElementById('reward-reroll-button');
  if (!overlay || !btnContainer) return;
  // Idempotent check: if overlay already visible with same offer, skip rebuild to avoid hover flicker
  const currentTypes = Array.from(btnContainer.children).map(b => b.dataset.type).join(',');
  const desiredTypes = Array.isArray(rewardOffered) ? rewardOffered.join(',') : '';
  const isVisible = !overlay.classList.contains('hidden');
  const shouldBeVisible = !!(rewardMenuVisible && Array.isArray(rewardOffered) && rewardOffered.length === 3);
  if (shouldBeVisible && isVisible && currentTypes === desiredTypes) {
    // Just update reroll state, no rebuild
    if (rerollBtn) {
      const shouldDisable = !!rewardRerolled;
      if (rerollBtn.disabled !== shouldDisable) {
        rerollBtn.disabled = shouldDisable;
        rerollBtn.classList.toggle('disabled', shouldDisable);
        rerollBtn.textContent = shouldDisable ? 'Re-rolled' : '\u21BB Re-roll (1 attempt) [R]';
      }
    }
    return;
  }
  if (shouldBeVisible) {
    overlay.classList.remove('hidden');
    // Build buttons
    btnContainer.innerHTML = '';
    const iconMap = {
      magnifier: './img/magnifier-icon.png',
      liquifier: './img/liquifier-icon.png',
      deflector: './img/deflector-icon.png',
      rotator: './img/rotator-icon.png',
      fieldExtender: './img/field-extender-icon.png',
      areaUp: './img/field-extender-icon.png',
      powerCell: './img/power-cell-icon.png'
    };
    const labelMap = {
      magnifier: 'Magnifier',
      liquifier: 'Liquifier',
      deflector: 'Deflector',
      rotator: 'Rotator',
      freeShot: 'Free Shot',
      fieldExtender: 'Field Extender',
      areaUp: 'Field Extender',
      powerCell: 'Power Cell'
    };
    const hintMap = {
      magnifier: '+1 to supply',
      liquifier: '+1 to supply',
      deflector: '+1 to supply',
      rotator: '+1 to supply',
      freeShot: 'Supply +3',
      fieldExtender: '+15% area',
      areaUp: '+15% area',
      powerCell: '+15% strength'
    };
    const colorMap = {
      magnifier: '#e67e22',
      liquifier: '#3498db',
      deflector: '#9b59b6',
      rotator: '#e74c3c',
      freeShot: '#f1c40f',
      fieldExtender: '#808080',
      areaUp: '#808080',
      powerCell: '#808080'
    };
    rewardOffered.forEach((type, idx) => {
      const btn = document.createElement('button');
      btn.className = 'reward-button';
      btn.dataset.type = type;
      // Apply color via inline style for border/background handled in CSS per type
      const isFree = type === 'freeShot';
      const iconSrc = iconMap[type];
      if (isFree) {
        const iconFallback = document.createElement('div');
        iconFallback.className = 'reward-button-icon fallback';
        iconFallback.textContent = '★';
        iconFallback.style.color = colorMap[type] || '#f1c40f';
        btn.appendChild(iconFallback);
      } else if (iconSrc) {
        const img = document.createElement('img');
        img.className = 'reward-button-icon';
        img.src = iconSrc;
        img.alt = type;
        // Fallback to text if image fails
        img.onerror = () => {
          img.style.display = 'none';
          const fb = document.createElement('div');
          fb.className = 'reward-button-icon fallback';
          const sym = type==='magnifier'?'\u00BB': type==='liquifier'?'\u2205': type==='deflector'?'\u21C4': type==='rotator'?'\u21BB': type==='fieldExtender'?'\u25EF': type==='powerCell'?'\u26A1': '•';
          fb.textContent = sym;
          btn.insertBefore(fb, img);
        };
        btn.appendChild(img);
      } else {
        const fb = document.createElement('div');
        fb.className = 'reward-button-icon fallback';
        fb.textContent = type;
        btn.appendChild(fb);
      }
      const label = document.createElement('div');
      label.className = 'reward-button-label';
      label.textContent = labelMap[type] || type;
      btn.appendChild(label);
      const hint = document.createElement('div');
      hint.className = 'reward-button-hint';
      hint.textContent = hintMap[type] || '';
      btn.appendChild(hint);
      const keyEl = document.createElement('div');
      keyEl.className = 'reward-button-key';
      keyEl.textContent = '[' + (idx+1) + ']';
      btn.appendChild(keyEl);
      // Hover state via CSS, but track for keyboard selection highlight
      btn.addEventListener('mouseenter', () => { rewardMenuHover = type; });
      btn.addEventListener('mouseleave', () => { if (rewardMenuHover===type) rewardMenuHover = null; });
      btn.addEventListener('click', () => { claimReward(type); });
      btnContainer.appendChild(btn);
    });
    // Reroll button state
    if (rerollBtn) {
      rerollBtn.disabled = !!rewardRerolled;
      rerollBtn.classList.toggle('disabled', !!rewardRerolled);
      rerollBtn.textContent = rewardRerolled ? 'Re-rolled' : '\u21BB Re-roll (1 attempt) [R]';
      rerollBtn.onclick = () => { if (!rewardRerolled) rerollReward(); };
    }
  } else {
    overlay.classList.add('hidden');
    if (btnContainer) btnContainer.innerHTML = '';
  }
  // Hotbar stays visible during reward per spec; sync already handles
}


// 11-banners API
function isHoleBannerVisible() { return holeBannerVisible; }
function getHoleBannerText() { return holeBannerText; }
function showHoleBanner(index, total) {
  if (pauseMenuVisible || mainMenuVisible || gameState === "WIN" || gameState === "GAME_OVER") return false;
  const n = Math.max(1, Math.floor(index) + 1);
  const m = Math.max(1, Math.floor(total) || getTotalHoles());
  holeBannerText = `Hole ${n}`;
  // alternative `Hole ${n}/${m}` also accepted; keep simple
  holeBannerVisible = true;
  holeBannerTimer = holeBannerDuration;
  attemptsBannerVisible = false;
  freeShotBannerVisible = false;
  attemptsBannerTimer = 0;
  freeShotBannerTimer = 0;
  rewardMenuVisible = false;
  updateHotbarUI();
  return true;
}
function hideHoleBanner() {
  if (!holeBannerVisible) return false;
  holeBannerVisible = false;
  holeBannerTimer = 0;
  // auto-transition to reward if pending (hole >0) — called from update timer expiry; also allow immediate maybeShowRewardMenu
  // Defer to next tick to keep dim continuous
  setTimeout(() => { try { maybeShowRewardMenu(); } catch {}; }, 0);
  return true;
}
function isAttemptsBannerVisible() { return attemptsBannerVisible; }
function getAttemptsBannerText() { return attemptsBannerText; }
function showAttemptsBanner(attemptsLeft) {
  if (pauseMenuVisible || mainMenuVisible || gameState === "WIN" || gameState === "GAME_OVER") return false;
  if (rewardMenuVisible || holeBannerVisible || freeShotBannerVisible) return false;
  if ((supply.freeShot ?? 0) > 0) return false;
  const v = Math.max(1, Math.min(3, Math.floor(attemptsLeft)));
  if (v !== 1) return false;
  attemptsBannerText = "Last Attempt";
  attemptsBannerVisible = true;
  attemptsBannerTimer = attemptsBannerDuration;
  lastAttemptsBannerValue = v;
  freeShotBannerVisible = false;
  freeShotBannerTimer = 0;
  updateHotbarUI();
  return true;
}
function hideAttemptsBanner() {
  if (!attemptsBannerVisible) return false;
  attemptsBannerVisible = false;
  attemptsBannerTimer = 0;
  return true;
}
function maybeShowAttemptsBanner() {
  if (gameState !== "AIMING" && gameState !== "CHARGING") return false;
  if (pauseMenuVisible || mainMenuVisible || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return false;
  if (gameState === "WIN" || gameState === "GAME_OVER") return false;
  const left = getAttemptsLeft();
  if (left !== 1) return false;
  if ((supply.freeShot ?? 0) > 0) return false;
  if (lastAttemptsBannerValue === left) return false;
  // Do not show if hole banner just finished and reward pending will show— attempts banner after reward? Attempts banner has lower priority than reward.
  if (rewardPending) return false;
  return showAttemptsBanner(left);
}
function isFreeShotBannerVisible() { return freeShotBannerVisible; }
function getFreeShotBannerText() { return freeShotBannerText; }
function showFreeShotBanner() {
  if (pauseMenuVisible || mainMenuVisible || gameState === "WIN" || gameState === "GAME_OVER") return false;
  if (rewardMenuVisible || holeBannerVisible || attemptsBannerVisible) return false;
  if ((supply.freeShot ?? 0) <= 0) return false;
  const left = getAttemptsLeft();
  if (left !== 1) return false;
  if (lastFreeShotBannerValue === left) return false;
  if (rewardPending) return false;
  freeShotBannerText = "Free Shot!";
  freeShotBannerVisible = true;
  freeShotBannerTimer = freeShotBannerDuration;
  lastFreeShotBannerValue = left;
  attemptsBannerVisible = false;
  attemptsBannerTimer = 0;
  // Turn on free shot modifier as required when counter decreased to 1 with free shots
  isFreeShotActive = true;
  syncFreeShotGlow();
  updateHotbarUI();
  saveProgress();
  return true;
}
function hideFreeShotBanner() {
  if (!freeShotBannerVisible) return false;
  freeShotBannerVisible = false;
  freeShotBannerTimer = 0;
  return true;
}
function maybeShowFreeShotBanner() {
  if (gameState !== "AIMING" && gameState !== "CHARGING") return false;
  if (pauseMenuVisible || mainMenuVisible || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return false;
  if (gameState === "WIN" || gameState === "GAME_OVER") return false;
  const left = getAttemptsLeft();
  if (left !== 1) return false;
  if ((supply.freeShot ?? 0) <= 0) return false;
  if (lastFreeShotBannerValue === left) return false;
  if (rewardPending) return false;
  return showFreeShotBanner();
}

// Softlock detection — non-blocking banner when ball stuck without progress
const SOFTLOCK_TEXT_NORMAL = "Stuck? Press R to reset — or use Next Attempt in pause menu";
const SOFTLOCK_TEXT_LAST = "Stuck on last attempt? End Run in pause menu (Escape)";
let softlockBannerVisible = false;
let softlockBannerText = SOFTLOCK_TEXT_NORMAL;
let softlockFlightTime = 0;
let softlockHistory = []; // {x,y}
let softlockSampleAccum = 0;
const SOFTLOCK_MIN_TIME = 8.0;
const SOFTLOCK_WINDOW = 6.0;
const SOFTLOCK_SAMPLE_INTERVAL = 0.5;
const SOFTLOCK_THRESHOLD = 75;
const SOFTLOCK_MAX_SAMPLES = Math.ceil(SOFTLOCK_WINDOW / SOFTLOCK_SAMPLE_INTERVAL);

function isLastAttemptForSoftlock() {
  const left = getAttemptsLeft();
  const free = supply.freeShot ?? 0;
  // Last attempt state is set when attempts left is one and no free shots (checked after counter decreased on reset)
  return left === 1 && free === 0;
}
function isLastAttemptForReset() {
  const left = getAttemptsLeft();
  const free = supply.freeShot ?? 0;
  // Last attempt state: attempts left is one and no free shots -> cannot reset on last attempt (R disabled after launch, pause Reset hidden)
  if (free > 0) return false;
  return left === 1;
}
function getSoftlockTextForCurrentState() {
  return isLastAttemptForSoftlock() ? SOFTLOCK_TEXT_LAST : SOFTLOCK_TEXT_NORMAL;
}
function isSoftlockBannerVisible() { return softlockBannerVisible; }
function getSoftlockBannerText() { return softlockBannerText; }
function showSoftlockBanner() {
  if (softlockBannerVisible) {
    // Update text if last-attempt state changed while banner visible
    const desired = getSoftlockTextForCurrentState();
    if (softlockBannerText !== desired) softlockBannerText = desired;
    return false;
  }
  if (gameState !== "FLYING") return false;
  if (pauseMenuVisible || mainMenuVisible || helpVisible || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || gameState === "WIN" || gameState === "GAME_OVER") return false;
  softlockBannerText = getSoftlockTextForCurrentState();
  softlockBannerVisible = true;
  return true;
}
function hideSoftlockBanner() {
  if (!softlockBannerVisible) return false;
  softlockBannerVisible = false;
  return true;
}
function resetSoftlockDetection() {
  softlockFlightTime = 0;
  softlockSampleAccum = 0;
  softlockHistory = [];
  softlockBannerVisible = false;
}
function updateSoftlockDetection(dt) {
  if (gameState !== "FLYING") return false;
  if (pauseMenuVisible || mainMenuVisible || helpVisible || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || gameState === "WIN" || gameState === "GAME_OVER") {
    // do not accumulate while blocked overlays, but keep flight time? Pause freezes physics already, but we still don't want to trigger while paused
    return false;
  }
  softlockFlightTime += dt;
  softlockSampleAccum += dt;
  if (softlockSampleAccum >= SOFTLOCK_SAMPLE_INTERVAL) {
    softlockSampleAccum -= SOFTLOCK_SAMPLE_INTERVAL;
    softlockHistory.push({ x: ball.pos.x, y: ball.pos.y });
    if (softlockHistory.length > SOFTLOCK_MAX_SAMPLES) softlockHistory.shift();
  }
  if (softlockBannerVisible) {
    // Keep text in sync with last-attempt state (e.g. after launch on last attempt)
    const desired = getSoftlockTextForCurrentState();
    if (softlockBannerText !== desired) softlockBannerText = desired;
    return true;
  }
  if (softlockFlightTime < SOFTLOCK_MIN_TIME) return false;
  if (softlockHistory.length < 10) return false;
  // compute confinement: max distance from current pos to any history point, and bounding box
  let maxDist = 0;
  let minX = ball.pos.x, maxX = ball.pos.x, minY = ball.pos.y, maxY = ball.pos.y;
  for (const p of softlockHistory) {
    const d = Math.hypot(ball.pos.x - p.x, ball.pos.y - p.y);
    if (d > maxDist) maxDist = d;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  // Consider softlocked if both bounding box small and max displacement small -> confined drift
  if (maxDist < SOFTLOCK_THRESHOLD && boxW < SOFTLOCK_THRESHOLD && boxH < SOFTLOCK_THRESHOLD) {
    showSoftlockBanner();
    return true;
  }
  return false;
}

function claimReward(type) {
  if (!rewardMenuVisible) return false;
  // support legacy aliases (amplify→magnifier, nullify→liquifier, flip→deflector, rotate→rotator, areaUp→fieldExtender)
  const legacyNormalize = (t) => t === 'areaUp' ? 'fieldExtender' : (t === 'amplify' ? 'magnifier' : t === 'nullify' ? 'liquifier' : t === 'flip' ? 'deflector' : t === 'rotate' ? 'rotator' : t);
  const normalized = legacyNormalize(type);
  const normOffered = rewardOffered.map(legacyNormalize);
  if (!rewardOffered.includes(type) && !normOffered.includes(normalized)) return false;
  // Idempotent: only once per trigger (rewardMenuVisible guards double-click)
  if (type === 'freeShot' || normalized === 'freeShot') {
    addToSupply('freeShot', 3); // Free Shoot Supply +3
    rewardChosenCounts.freeShot = Math.max(0, (rewardChosenCounts.freeShot || 0) + 1);
  } else if (type === 'maxAttempts') {
    // legacy: migrate old maxAttempts reward to freeShot
    addToSupply('freeShot', 3);
    rewardChosenCounts.freeShot = Math.max(0, (rewardChosenCounts.freeShot || 0) + 1);
  } else if (type === 'areaUp' || normalized === 'fieldExtender' || type === 'fieldExtender') {
    addFieldExtender(1); // Field Extender +15% (was +10% / +20%)
    rewardChosenCounts.fieldExtender = Math.max(0, (rewardChosenCounts.fieldExtender || 0) + 1);
    rewardChosenCounts.areaUp = Math.max(0, (rewardChosenCounts.areaUp || 0) + 1);
  } else if (normalized === 'powerCell' || type === 'powerCell') {
    addPowerCell(1); // Power Cell +15% strength
    rewardChosenCounts.powerCell = Math.max(0, (rewardChosenCounts.powerCell || 0) + 1);
  } else {
    if (!(type in supply) && !(normalized in supply)) return false;
    const t = (type in supply) ? type : normalized;
    addToSupply(t, 1);
    if (t in rewardChosenCounts) rewardChosenCounts[t] = Math.max(0, (rewardChosenCounts[t] || 0) + 1);
  }
  // Mark first and general claimed for backward compat
  rewardClaimedFor = totalAttempts;
  rewardMenuVisible = false;
  rewardMenuHover = null;
  rewardRerollHover = false;
  rewardOffered = [];
  rewardPending = false;
  updateHotbarUI();
  syncRewardOverlay();
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
let gameoverOverlay;
let gameoverHoleValue;
let gameoverHoleTotal;
let gameoverTotalValue;
let gameoverTitle;
let gameoverReturnButton;

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
  // REQ-09: queue reward before first attempt on holes >0 (except first hole of course), treasure handled separately
  // Free Shot: clear armed state on hole advance per 09 §3
  if (index > 0) {
    clearFreeShotGlow();
    rewardPending = true;
    rewardMenuVisible = false;
    rewardOffered = [];
    rewardRerolled = false;
    rewardMenuHover = null;
    rewardRerollHover = false;
  } else {
    // Hole 1: no pre-attempt reward
    clearFreeShotGlow();
    rewardPending = false;
    rewardMenuVisible = false;
    rewardOffered = [];
    rewardRerolled = false;
    rewardMenuHover = null;
    rewardRerollHover = false;
    syncRewardOverlay();
  }
  // REQ-015 collapsible: reset to expanded on new hole
  resetHotbarCollapsed();
  // 11-banners: reset attempts banner dedupe for new hole, hide any previous banner
  lastAttemptsBannerValue = null;
  attemptsBannerVisible = false;
  attemptsBannerTimer = 0;
  holeBannerVisible = false;
  holeBannerTimer = 0;
  resetSoftlockDetection();
  updateHotbarUI();
  // Redraw terrain for new hole (zoned background per REQ-010/033)
  try { redrawBottom(); } catch {};
  // 11-banners: show Hole N banner for 2s before reward (same dim, auto-transition)
  try { showHoleBanner(currentHoleIndex, getTotalHoles()); } catch {};
}

function initLevel() {
  // REQ-020/022/023/024 + REQ-09 hole-start + treasure + REQ-025 reroll + REQ-028 pause stats: hole 1 no award before first attempt, holes >0 reward before first attempt
  if (currentHoleIndex === 0) {
    supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
    clearFreeShotGlow();
    maxAttempts = 10; 
  areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {};
    rewardPending = false;
    rewardMenuVisible = false;
    rewardClaimedFor = null;
    rewardOffered = [];
    rewardRerolled = false;
    rewardRerollHover = false;
    pauseMenuVisible = false;
    pauseMenuHover = null;
    rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
    const pauseOverlay = document.getElementById("pause-overlay");
    if (pauseOverlay) pauseOverlay.classList.add("hidden");
  } else {
    // For non-zero start (hole advance per-hole), reward queued before first attempt in loadLevel
  }
  loadLevel(currentHoleIndex);
  updateAttemptsUI();
  // REQ-09: hole-start reward for holes >0, treasure handled separately
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

function getTotalHoles() {
  return activeCourse ? activeCourse.holes.length : LEVELS.length;
}
function updateAttemptsUI() {
  attempts = totalAttempts; // keep alias synced
  const totalHoles = getTotalHoles();
  if (winHoleValue) winHoleValue.textContent = String(currentHoleIndex + 1);
  if (winHoleTotal) winHoleTotal.textContent = String(totalHoles);
  if (winAttemptsValue) winAttemptsValue.textContent = String(holeAttempts);
  if (winTotalValue) winTotalValue.textContent = String(totalAttempts);
  if (winTitle) {
    winTitle.textContent = "Course Completed!";
  }
  if (nextHoleButton) {
    const hasMoreHoles = currentHoleIndex < totalHoles - 1;
    if (gameState === "WIN" && hasMoreHoles) {
      nextHoleButton.classList.remove("hidden");
      nextHoleButton.textContent = "Next";
    } else {
      nextHoleButton.classList.add("hidden");
    }
  }
  if (continueButton) {
    const isFinalWin = gameState === "WIN" && currentHoleIndex === totalHoles - 1;
    if (isFinalWin) {
      continueButton.classList.remove("hidden");
      continueButton.textContent = "Continue";
    } else {
      continueButton.classList.add("hidden");
    }
  }
}

function updateHotbarUI() {
  if (!hotbarEl && !golfbagContainerEl && !bottomBarEl) return;
  // Bag+hotbar are always visible during gameplay including FLYING and reward (per updated spec)
  // Only hide during overlays/menus/banners/WIN/GAME_OVER; collapsed is handled via CSS class
  // Bottom-bar wrapper is the centered bottom element (gap 12px to bottom)
  const isOverlayHidden = pauseMenuVisible || mainMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || gameState === "WIN" || gameState === "GAME_OVER";
  const hideHotbar = isOverlayHidden;
  const hideBag = isOverlayHidden;
  if (bottomBarEl) bottomBarEl.classList.toggle("hidden", isOverlayHidden);
  if (hotbarEl) {
    // Respect collapsed: when collapsed hotbar is hidden via .collapsed display:none, but still toggle hidden for overlay
    hotbarEl.classList.toggle("hidden", hideHotbar);
  }
  if (golfbagContainerEl) golfbagContainerEl.classList.toggle("hidden", hideBag);
  // Ensure collapsed UI stays synced (grid hidden via CSS collapsed, bag remains with no background)
  syncHotbarCollapsedUI();
  for (const slot of hotbarEl.querySelectorAll(".hotbar-slot")) {
    const type = slot.dataset.type;
    // Free Shot is no longer shown in hotbar; it is displayed in HUD as Attempts Left: X (+Y)
    if (type === 'freeShot') {
      // Hide legacy freeShot slot if it still exists in DOM (should have been replaced by rotate)
      slot.style.display = 'none';
      continue;
    }
    // Passive slots: Field Extender and Power Cell
    if (type === 'fieldExtender' || type === 'areaUp' || type === 'powerCell') {
      const isField = type === 'fieldExtender' || type === 'areaUp';
      const count = isField ? fieldExtenderCount : powerCellCount;
      const countEl = slot.querySelector(".hotbar-count");
      if (countEl) countEl.textContent = `x${count}`;
      slot.classList.remove("selected", "disabled", "active");
      slot.classList.add("passive");
      slot.style.cursor = "default";
      // hide hotkey badge if present (passive have no hotkey)
      const hotkeyEl = slot.querySelector(".hotbar-hotkey");
      if (hotkeyEl) hotkeyEl.style.display = "none";
      slot.removeAttribute('title');
      slot.dataset.supply = String(count);
      slot.dataset.count = String(count);
      continue;
    }
    // Active spatial slots
    const activeCount = modifiers.filter(m => m.type === type).length;
    const supplyCount = supply[type] ?? 0;
    const canPlaceThis = (supplyCount ?? 0) > 0;
    slot.classList.toggle("selected", slot.dataset.type === selectedModifier);
    slot.classList.remove("active");
    slot.classList.toggle("disabled", !canPlaceThis);
    slot.classList.remove("passive");
    slot.style.cursor = "";
    const hotkeyEl2 = slot.querySelector(".hotbar-hotkey");
    if (hotkeyEl2) hotkeyEl2.style.display = "";
    // Update count badge — lower-right xN per new spec (e.g. x2)
    const countEl = slot.querySelector(".hotbar-count");
    if (countEl) {
      countEl.textContent = `x${supplyCount}`;
    }
    slot.removeAttribute('title');
    // For testing: expose supply via dataset
    slot.dataset.supply = String(supplyCount);
    slot.dataset.active = String(activeCount);
  }
  // Also update HUD attempts left display to show (+freeShot)
  try { updateAttemptsUI(); } catch {};
}

function showGameOver() {
  if (gameState === "GAME_OVER") return;
  clearFreeShotFlightGlow();
  hideSoftlockBanner();
  resetSoftlockDetection();
  // Hide and clear any pending reward — Game Over takes precedence over reward screen
  rewardMenuVisible = false;
  rewardPending = false;
  rewardOffered = [];
  rewardRerolled = false;
  rewardMenuHover = null;
  rewardRerollHover = false;
  syncRewardOverlay();
  // 11-banners: hide banners on Game Over
  holeBannerVisible = false; holeBannerTimer = 0;
  attemptsBannerVisible = false; attemptsBannerTimer = 0;
  gameState = "GAME_OVER";
  ball.isMoving = false;
  ball.z = 0;
  ball.vz = 0;
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
  if (gameoverOverlay) {
    gameoverOverlay.classList.remove("hidden");
    if (gameoverTitle) gameoverTitle.textContent = "Game Over";
  }
  // hide pause and reward if any
  if (pauseMenuVisible) {
    pauseMenuVisible = false;
    syncPauseOverlay();
  }
  updateAttemptsUI();
  updateHotbarUI();
  saveProgress();
}

function hideGameOver() {
  if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
}

function handleGameOverReturn() {
  hideGameOver();
  try { finalizeRunCoinsAndShowSummary(); } catch {}
  clearProgress();
  gameState = "AIMING";
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  maxAttempts = 10;
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
  clearFreeShotGlow();
  areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {};
  rewardPending = false;
  rewardOffered = [];
  rewardMenuVisible = false;
  rewardRerolled = false;
  rewardMenuHover = null;
  rewardRerollHover = false;
  rewardSeedCounter = 0;
  holeBannerVisible = false; holeBannerTimer = 0; holeBannerText = "";
  attemptsBannerVisible = false; attemptsBannerTimer = 0; attemptsBannerText = ""; lastAttemptsBannerValue = null;
  freeShotBannerVisible = false; freeShotBannerTimer = 0; freeShotBannerText = "Free Shot!"; lastFreeShotBannerValue = null;
  hideSoftlockBanner();
  resetSoftlockDetection();
  modifiers = [];
  syncModifiersToField();
  selectedModifier = null;
  mainMenuVisible = true;
  isInLevelPause = false;
  courseMenuVisible = false;
  helpVisible = false;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  // Avoid heavy field generation when returning to main menu after Game Over — defer to next course play
  _lastCourseListSig = null;
  syncMainMenu();
  syncPauseOverlay();
  updateAttemptsUI();
  updateHotbarUI();
  if (LEVELS.length) {
    level = LEVELS[0];
    try { createBall(level.tee); } catch {};
  } else if (courses.length) {
    level = courses[0].holes[0];
    try { createBall(level.tee); } catch {};
  }
  // ensure win overlay hidden
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
}

function syncModifiersToField() {
  setModifiers(modifiers);
  try { setFieldPowerCellCount(powerCellCount); } catch {};
  syncWindFieldToShader();
}
function syncWindFieldToShader() {
  try {
    const comps = getFieldComponents();
    setWindUniformsFromField(comps, modifiers, windStrength);
  } catch {};
}

function syncPauseOverlay() {
  const po = document.getElementById("pause-overlay");
  if (!po) return;
  if (pauseMenuVisible) {
    po.classList.remove("hidden");
    po.classList.add("with-backdrop");
    // Help is global, handled by syncHelpOverlay
    const pc = po.querySelector('.pause-content');
    if (pc) {
      if (helpVisible) pc.classList.add('hidden');
      else pc.classList.remove('hidden');
    }
    // Hide Next Attempt button on last attempt (cannot reset on last attempt) — handle both old and new IDs for backward compat
    try {
      const isLast = isLastAttemptForReset();
      const btnNext = document.getElementById("pause-reset-attempt-button");
      const btnReset = document.getElementById("pause-reset-attempt-button");
      for (const btn of [btnNext, btnReset]) {
        if (btn) {
          btn.classList.toggle("hidden", isLast);
          btn.style.display = isLast ? "none" : "";
          // Ensure text is Next Attempt
          if (btn.textContent.trim() !== "Next Attempt") btn.textContent = "Next Attempt";
        }
      }
    } catch {};
  } else {
    po.classList.add("hidden");
    po.classList.remove("with-backdrop");
  }
  syncHelpOverlay();
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
  if (loadoutVisible || coinSummaryVisible) return;
  if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (!selectedModifier) return;
  if (!canPlace(selectedModifier)) {
    // REQ-020: reject placement if supply insufficient; keep selection for retry, update UI
    updateHotbarUI();
    return;
  }
  const type = normalizeSupplyType(selectedModifier);
  supply[type] = Math.max(0, (supply[type] ?? 0) - 1);
  modifiers.push({ id: Date.now() + Math.random(), type, x, y, radius: getEffectiveModifierRadius() });
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
    const [removed] = modifiers.splice(idx, 1);
    if (removed && removed.type) {
      const t = normalizeSupplyType(removed.type);
      if (t in supply) {
        supply[t] = Math.max(0, (supply[t] ?? 0) + 1);
      }
    }
    syncModifiersToField();
    updateHotbarUI();
    saveProgress();
    return true;
  }
  return false;
}

function resetBall() {
  const wasFlying = gameState === "FLYING" || ball.isMoving;
  const wasFreeFlight = freeShotFlightActive;
  physicsResetBall(level.tee);
  resetCharge();
  // Keep aimAngle between attempts per REQ-019 - do NOT reset to tee->hole
  // Clear flight glow but keep armed freeShot per REQ (armed survives death)
  clearFreeShotFlightGlow();
  hideSoftlockBanner();
  resetSoftlockDetection();
  // Handle attempt counter decrement on failure reset (not on launch)
  // Only count as attempt if we were flying (had launched). R in AIMING does not consume attempt.
  if (wasFlying) {
    if (wasFreeFlight) {
      // Free shot flight does not consume counted attempt
      freeShotFlightActive = false;
      syncFreeShotGlow();
      updateAttemptsUI();
      // After free flight failure, check if now on last attempt (left==1 with no free remaining -> Last Attempt)
      const left = getAttemptsLeft();
      const free = supply.freeShot ?? 0;
      if (left === 1) {
        if (free > 0) {
          try { showFreeShotBanner(); } catch {};
          if (!isFreeShotActive) {
            isFreeShotActive = true;
            syncFreeShotGlow();
            updateHotbarUI();
            saveProgress();
          }
        } else {
          try { showAttemptsBanner(1); } catch {};
          try { syncPauseOverlay(); } catch {};
        }
      }
    } else {
      // Normal attempt: decrement attempts left by incrementing holeAttempts
      holeAttempts++;
      totalAttempts++;
      attempts = totalAttempts;
      updateAttemptsUI();
      saveProgress();
      const left = getAttemptsLeft();
      const free = supply.freeShot ?? 0;
      if (left === 0 && free === 0) {
        // No attempts remaining -> Game Over (do not return to AIMING)
        // set state to GAME_OVER via showGameOver after resetting physics already done
        // Need to ensure we don't stay in AIMING
        showGameOver();
        return;
      } else if (left === 1) {
        if (free > 0) {
          // Free Shot! banner and turn on free shot modifier
          // showFreeShotBanner will also set isFreeShotActive true
          try { showFreeShotBanner(); } catch {};
          // If banner not shown due to dedup or other block, still ensure free shot armed
          if (!isFreeShotActive) {
            isFreeShotActive = true;
            syncFreeShotGlow();
            updateHotbarUI();
            saveProgress();
          }
        } else {
          // Last Attempt banner
          try { showAttemptsBanner(1); } catch {};
        }
        // Ensure pause overlay hide logic updated
        try { syncPauseOverlay(); } catch {};
      }
    }
  }
  gameState = "AIMING";
  winOverlay.classList.add("hidden");
  updateForceBar();
  // REQ-021: check reward menu on re-entering AIMING (death/OOB/R during play)
  maybeShowRewardMenu();
  saveProgress();
  try { syncPauseOverlay(); } catch {};
}

function advanceHole() {
  if (currentHoleIndex < getTotalHoles() - 1) {
    // Track holes cleared for coin economy (10 per hole)
    runHolesCleared++;
    runCoinsEarned = runHolesCleared * COINS_PER_HOLE;
    // REQ-035: consume any placed modifiers from supply on level win before clearing for next hole
    consumePlacedModifiersFromSupply();
    clearFreeShotGlow();
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
  // Coin economy: add coins for holes cleared this run and show summary
  try { finalizeRunCoinsAndShowSummary(); } catch {}
  clearProgress();
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
  clearFreeShotGlow();
  maxAttempts = 10; 
  areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {};
  rewardPending = false;
  rewardMenuVisible = false;
  rewardClaimedFor = null;
  rewardMenuHover = null;
  rewardOffered = [];
  rewardRerolled = false;
  rewardRerollHover = false;
  rewardSeedCounter = 0;
  holeBannerVisible = false; holeBannerTimer = 0; holeBannerText = "";
  attemptsBannerVisible = false; attemptsBannerTimer = 0; attemptsBannerText = ""; lastAttemptsBannerValue = null;
  freeShotBannerVisible = false; freeShotBannerTimer = 0; freeShotBannerText = "Free Shot!"; lastFreeShotBannerValue = null;
  hideSoftlockBanner();
  resetSoftlockDetection();
  pauseMenuVisible = false;
  pauseMenuHover = null;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null;
  const pauseOverlay2 = document.getElementById("pause-overlay");
  if (pauseOverlay2) pauseOverlay2.classList.add("hidden");
  mainMenuVisible = true; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  gameState = "AIMING";
  // Avoid heavy field generation when entering main menu (splash) — courses are cached in localStorage, field will be created on next course play via handleCoursePlay/loadLevel
  // Keep level as first hole reference behind splash without creating field to avoid blocking UI
  try {
    if (LEVELS.length) {
      level = LEVELS[0];
    } else if (courses.length && courses[0].holes.length) {
      level = courses[0].holes[0];
    } else {
      level = { field:{cols:32,rows:18,strength:80,seed:0,sources:1,sinks:1,doublets:0,vortexes:0}, tee:{x:80,y:360}, hole:{x:1200,y:360,radius:14}, obstacles:[], canvas:{width:LOGICAL_W,height:LOGICAL_H} };
    }
    // Defer ball/field creation — not needed while splash is visible; create minimal ball for HUD
    try { createBall(level.tee); } catch {};
    try {
      const dx = level.hole.x - level.tee.x;
      const dy = level.hole.y - level.tee.y;
      setAimAngle(Math.atan2(dy, dx));
    } catch {};
    // Invalidate course list signature so next menu open re-renders with updated bestTotal/unlock (courses are read from cache)
    _lastCourseListSig = null;
  } catch {};
  resetHotbarCollapsed();
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
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
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {};
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  // REQ-020/022/023/024: reset supply to one of each on new game, no award before first attempt
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
  clearFreeShotGlow();
  maxAttempts = 10; 
  areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {};
  // REQ-021 + REQ-025 + REQ-028: reset secret counter + reward state + reroll + pause stats
  rewardPending = false;
  rewardMenuVisible = false;
  rewardClaimedFor = null;
  rewardMenuHover = null;
  rewardOffered = [];
  rewardRerolled = false;
  rewardRerollHover = false;
  pauseMenuVisible = false;
  pauseMenuHover = null;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
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
  // REQ-021: block launch while reward menu visible; REQ-028: block while pause visible; REQ-029: block while main menu visible; 11-banners block
  if (loadoutVisible || coinSummaryVisible) return;
  if (rewardMenuVisible) return;
  if (holeBannerVisible) return;
  if (attemptsBannerVisible) return;
  if (freeShotBannerVisible) return;
  if (pauseMenuVisible) return;
  if (mainMenuVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (gameState === "GAME_OVER") return;
  // Deferred Game Over + Auto-arm: if this launch would be the last counted attempt and freeShot supply available, auto-arm it
  if (!isFreeShotActive && (supply.freeShot ?? 0) > 0 && getAttemptsLeft() <= 1) {
    isFreeShotActive = true;
    syncFreeShotGlow();
    updateHotbarUI();
  }
  // If no attempts left and no free shot armed, Game Over instead of launching (deferred to next attempt start)
  if (getAttemptsLeft() <= 0 && !(isFreeShotActive && (supply.freeShot ?? 0) > 0)) {
    showGameOver();
    return;
  }
  launchBall(angle, power);
  // Free Shot: if armed and supply available, this launch is free — consume supply, mark flight as free, does NOT decrement counter now nor on reset
  if (isFreeShotActive && (supply.freeShot ?? 0) > 0) {
    supply.freeShot = Math.max(0, supply.freeShot - 1);
    // Persist armed while supply remains, only clear when supply reaches 0
    if (supply.freeShot > 0) {
      // keep isFreeShotActive true for next free, but hide ball glow during current flight
      isFreeShotActive = true;
      freeShotFlightActive = true;
      try { setWindFreeShotBallActive(false); } catch {};
      try { setWindFreeShotEdgeActive(true); } catch {};
      try { setWindFreeShotActive(true); } catch {};
    } else {
      isFreeShotActive = false;
      freeShotFlightActive = true;
      syncFreeShotGlow();
    }
    updateHotbarUI();
    updateAttemptsUI();
  } else {
    // Normal launch — no counter decrement at launch (decrement happens on failure reset, see handleAttemptFailure)
    if (isFreeShotActive) {
      isFreeShotActive = false;
      syncFreeShotGlow();
    }
    if (freeShotFlightActive) {
      freeShotFlightActive = false;
      syncFreeShotGlow();
    }
    // Do NOT increment holeAttempts/totalAttempts here; handled on reset
    updateHotbarUI();
    updateAttemptsUI();
  }
  gameState = "FLYING";
  try { lastLaunchTime = performance.now(); } catch { lastLaunchTime = Date.now(); }
  resetCharge();
  resetSoftlockDetection();
  updateForceBar();
  saveProgress();
}

function checkWin() {
  const dist = Math.hypot(ball.pos.x - level.hole.x, ball.pos.y - level.hole.y);
  // Victory when ball touches any part of black circle per new requirement (ground projection)
  if (dist < level.hole.radius + BALL_RADIUS) {
    const isFinalHole = currentHoleIndex === getTotalHoles() - 1;
    if (!isFinalHole) {
      // Intermediate hole: do NOT show Victory screen — auto-advance to next hole
      ball.vel.x = 0;
      ball.vel.y = 0;
      ball.isMoving = false;
      ball.z = 0;
      ball.vz = 0;
      clearFreeShotFlightGlow();
      hideSoftlockBanner();
      resetSoftlockDetection();
      // Directly advance without entering WIN state
      advanceHole();
      return true;
    }
    // Final hole: show Victory/Game Complete — track hole cleared for coin economy
    runHolesCleared++;
    runCoinsEarned = runHolesCleared * COINS_PER_HOLE;
    ball.vel.x = 0;
    ball.vel.y = 0;
    ball.isMoving = false;
    ball.z = 0;
    ball.vz = 0;
    // Clear flight glow on win (glow was for motion; keep briefly then clear or keep until next hole? Clear to avoid edge glow persisting under WIN dim)
    clearFreeShotFlightGlow();
    hideSoftlockBanner();
    resetSoftlockDetection();
    gameState = "WIN";
    updateAttemptsUI();
    winOverlay.classList.remove("hidden");
    // Only final hole shows Continue (Victory); intermediate auto-advanced so Next is never shown
    if (nextHoleButton) {
      nextHoleButton.classList.add("hidden");
    }
    if (continueButton) {
      continueButton.classList.remove("hidden");
    }
    // REQ-029: update high score on final hole win (per-course bestTotal)
    maybeUpdateHighScore();
    return true;
  }
  return false;
}

function handleNextHole() {
  if (currentHoleIndex < LEVELS.length - 1) {
    // REQ-035: consume any placed modifiers from supply on level win before clearing for next hole (freeShot not consumed)
    consumePlacedModifiersFromSupply();
    clearFreeShotGlow();
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
  const tickWind = () => { try { updateWindUniforms(dt, getWindAt); } catch {}; try { if ((isFreeShotActive || freeShotFlightActive) && ball && ball.pos) updateFreeShotGlow(ball.pos, dt); } catch {}; };
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
  // Progression: when loadout or coin summary visible, pause like main menu
  if (loadoutVisible || coinSummaryVisible) {
    tickWind();
    updateHotbarUI();
    if (charging) { resetCharge(); gameState = "AIMING"; }
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
  // 11-banners: hole banner (2s, same dim as reward) blocks input and transitions to reward
  if (holeBannerVisible) {
    tickWind();
    updateHotbarUI();
    holeBannerTimer -= dt * 1000;
    if (holeBannerTimer <= 0) {
      holeBannerVisible = false;
      holeBannerTimer = 0;
      // auto-transition to reward menu if pending (holes >0)
      try { maybeShowRewardMenu(); } catch {};
      if (!rewardMenuVisible) try { maybeShowAttemptsBanner(); } catch {};
      if (!rewardMenuVisible && !attemptsBannerVisible) try { maybeShowFreeShotBanner(); } catch {};
    }
    if (charging) {
      resetCharge();
      gameState = "AIMING";
    }
    return;
  }
  if (attemptsBannerVisible) {
    tickWind();
    updateHotbarUI();
    attemptsBannerTimer -= dt * 1000;
    if (attemptsBannerTimer <= 0) {
      attemptsBannerVisible = false;
      attemptsBannerTimer = 0;
    }
    if (charging) {
      resetCharge();
      gameState = "AIMING";
    }
    return;
  }
  if (freeShotBannerVisible) {
    tickWind();
    updateHotbarUI();
    freeShotBannerTimer -= dt * 1000;
    if (freeShotBannerTimer <= 0) {
      freeShotBannerVisible = false;
      freeShotBannerTimer = 0;
    }
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
  // 11-banners: maybe show attempts/freeShot banner (triggered after counter decreased to 1)
  if ((gameState === "AIMING" || gameState === "CHARGING") && !holeBannerVisible && !rewardMenuVisible && !attemptsBannerVisible && !freeShotBannerVisible) {
    try { maybeShowAttemptsBanner(); } catch {};
    if (attemptsBannerVisible) {
      if (charging) { resetCharge(); gameState = "AIMING"; }
      return;
    }
    try { maybeShowFreeShotBanner(); } catch {};
    if (freeShotBannerVisible) {
      if (charging) { resetCharge(); gameState = "AIMING"; }
      return;
    }
  }

  if (gameState === "AIMING" || gameState === "CHARGING") {
    updateForceBar();
    // Treasure hit check also in AIMING/CHARGING (for drift or if treasure somehow at tee)
    if (level && level.treasure && !level.treasure.isCollected && !rewardMenuVisible) {
      try {
        if (checkTreasureHit(ball.pos, BALL_RADIUS, level.treasure)) {
          collectTreasure(level.treasure);
          rewardPending = true;
          saveProgress();
          maybeShowRewardMenu();
        }
      } catch {};
    }
  }

  if (gameState === "FLYING") {
    try { updateWindUniforms(dt, getWindAt); } catch {};
    updateBall(dt, getWindAt, windStrength, LOGICAL_W, LOGICAL_H);

    // Check win every tick - immediate, regardless of speed (REQ-009)
    if (checkWin()) {
      return;
    }

    // Deferred Game Over: last shot where attemptsLeft becomes 0 is allowed to finish (no immediate Game Over while FLYING)
    // Game Over will be checked only when starting the next attempt (handleLaunch entry) or on reroll

    // Treasure hit (one per hole near tree, see 09 §3) - non-fatal, shows reward immediately (even mid-flight)
    if (level && level.treasure && !level.treasure.isCollected && !rewardMenuVisible) {
      try {
        if (checkTreasureHit(ball.pos, BALL_RADIUS, level.treasure)) {
          collectTreasure(level.treasure);
          rewardPending = true;
          saveProgress();
          maybeShowRewardMenu();
          // If reward menu is now visible, freeze physics immediately (do not process OOB/bounce this tick)
          if (rewardMenuVisible) return;
        }
      } catch {};
    }

    // Check OOB / edge, terrain OB/water, and obstacle - bounce vs death per REQ-024/008/010
    // Water/OB terrain are fatal even with bouncy (hazard spec); trees always bounce
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
      // Fatal terrain/water/edge — handle attempt consumption on reset (not on launch)
      // resetBall will increment holeAttempts (unless free flight) and show Game Over if left becomes 0
      resetBall();
      return;
    }
    const hit = checkObstacleCollision(ball.pos, BALL_RADIUS, level.obstacles);
    if (hit) {
      // Trees always bounce (bouncyBall removed, no limit)
      bounceBall(hit, false);
      // remain FLYING, do not reset
    }

    // Softlock detection: show banner if ball confined without progress
    try { updateSoftlockDetection(dt); } catch {};

    // No auto-reset on rest - ball continues drifting per REQ-005

  } else if (gameState === "WIN") {
    // paused physics, still animate wind
    try { updateWindUniforms(dt, getWindAt); } catch {};
  } else if (gameState === "GAME_OVER") {
    // frozen, still animate wind dimmed
    try { updateWindUniforms(dt, getWindAt); } catch {};
  } else {
    // AIMING/CHARGING - animate wind anyway
    try { updateWindUniforms(dt, getWindAt); } catch {};
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
  // Background is on BOTTOM canvas (zoned terrain via redrawBottom), not drawn here
  drawModifiers(ctx, modifiers);
  // Per new requirement: show field direction and strength as arrows inside modifiers, no particles inside
  try { drawArrowsInModifiers(ctx, getWindAt, modifiers, cols, rows, cellW, cellH); } catch {};
  drawObstacles(ctx, level.obstacles);
  drawHole(ctx, level.hole);
  if (level.treasure) {
    try { drawTreasure(ctx, level.treasure); } catch {};
  }
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
  // HUD inside canvas on top per REQ-012/014/05 — Attempts Left (+freeShot)
  drawHUD(ctx, LOGICAL_W, currentHoleIndex, LEVELS.length, holeAttempts, totalAttempts, maxAttempts, supply.freeShot);
  // Power bar under ball when charging per REQ-007
  if (gameState === "CHARGING" && charging && !rewardMenuVisible) {
    drawForceBar(ctx, ball, charge);
  }
  // Softlock banner (non-blocking) below HUD — informs player they can reset via R or pause menu
  if (softlockBannerVisible && !holeBannerVisible && !attemptsBannerVisible && !freeShotBannerVisible && !rewardMenuVisible && !pauseMenuVisible && !mainMenuVisible && !helpVisible && gameState === "FLYING") {
    try { drawSoftlockBanner(ctx, LOGICAL_W, LOGICAL_H, softlockBannerText); } catch {};
  }
  // HTML reward overlay (sync handled on state change, not per-frame to avoid thrashing)
  // 11-banners: hole/attempts/freeShot banners share reward backdrop/style, auto-hide 1s; hole banner transitions to reward
  if (holeBannerVisible) {
    try { drawCenterBanner(ctx, LOGICAL_W, LOGICAL_H, holeBannerText); } catch {};
  } else if (attemptsBannerVisible) {
    try { drawCenterBanner(ctx, LOGICAL_W, LOGICAL_H, attemptsBannerText); } catch {};
  } else if (freeShotBannerVisible) {
    try { drawCenterBanner(ctx, LOGICAL_W, LOGICAL_H, freeShotBannerText); } catch {};
  } else if (rewardMenuVisible) {
    // Reward is HTML overlay #reward-overlay; no canvas draw (icon background removed)
  }
  // REQ-028: pause menu is DOM-only (#pause-overlay) to avoid duplicate rendering; canvas pause draw disabled
  // Render wind overlay (Three.js shader lines + particles) on top of game canvas, transparent
  try { renderWind(); } catch {};
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
  gameoverOverlay = document.getElementById("gameover-overlay");
  gameoverHoleValue = document.getElementById("gameover-hole-value");
  gameoverHoleTotal = document.getElementById("gameover-hole-total");
  gameoverTotalValue = document.getElementById("gameover-total-value");
  gameoverTitle = document.getElementById("gameover-title");
  gameoverReturnButton = document.getElementById("gameover-return-button");
  if (gameoverReturnButton) {
    gameoverReturnButton.addEventListener("click", handleGameOverReturn);
  }
  hotbarEl = document.getElementById("hotbar");
  hotbarGridEl = document.getElementById("hotbar-grid");
  golfbagContainerEl = document.getElementById("golfbag-container");
  golfbagIconEl = document.getElementById("golfbag-icon");
  bottomBarEl = document.getElementById("bottom-bar");
  syncHotbarCollapsedUI();
  if (golfbagContainerEl) {
    const handleGolfbagToggle = (e) => {
      e.stopPropagation();
      // When collapsed, click opens; when expanded, click also toggles (to collapsed) — but spec says golfbag opens again when collapsed
      // To avoid accidental collapse on expanded click, we toggle only when collapsed, otherwise collapse as well for I/Tab symmetry
      // Spec: golfbag grows on hover and collapses via cross, opens via golfbag click. Allow both.
      toggleHotbar();
    };
    golfbagContainerEl.addEventListener("click", handleGolfbagToggle);
    golfbagContainerEl.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        toggleHotbar();
      }
    });
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
  const pauseHelpBtn = document.getElementById('pause-help-button');
  if (pauseHelpBtn) {
    pauseHelpBtn.addEventListener('click', () => showHelpOverlay());
  }
  if (courseMenuBack) {
    courseMenuBack.addEventListener('click', () => showMainMenuRoot());
  }
  if (helpBackBtn) {
    helpBackBtn.addEventListener('click', () => {
      helpVisible = false;
      syncHelpOverlay();
      if (pauseMenuVisible) {
        syncPauseOverlay();
      } else if (mainMenuVisible) {
        showMainMenuRoot();
        syncMainMenu();
      } else {
        syncHelpOverlay();
      }
    });
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
          } catch {};
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

  // 12-campaign: campaign seed display + edit popup (seed input / refresh / OK/Cancel + confirm)
  const campaignEditBtn = document.getElementById('campaign-seed-edit-button');
  const campaignEditOverlay = document.getElementById('campaign-edit-overlay');
  const campaignEditClose = document.getElementById('campaign-edit-close');
  const campaignRegenBtn = document.getElementById('campaign-regenerate-button');
  const campaignApplyBtn = document.getElementById('campaign-seed-apply');
  const campaignRefreshBtn = document.getElementById('campaign-seed-refresh');
  const campaignOkBtn = document.getElementById('campaign-seed-ok');
  const campaignCancelBtn = document.getElementById('campaign-seed-cancel');
  const campaignInput = document.getElementById('campaign-seed-input');
  const campaignConfirmOverlay = document.getElementById('campaign-confirm-overlay');
  const campaignConfirmOk = document.getElementById('campaign-confirm-ok');
  const campaignConfirmCancel = document.getElementById('campaign-confirm-cancel');
  if (campaignEditBtn) {
    campaignEditBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCampaignEditOverlay();
    });
  }
  // Cancel / close aliases
  if (campaignEditClose) {
    campaignEditClose.addEventListener('click', () => hideCampaignEditOverlay());
  }
  if (campaignCancelBtn) {
    campaignCancelBtn.addEventListener('click', () => hideCampaignEditOverlay());
  }
  if (campaignEditOverlay) {
    campaignEditOverlay.addEventListener('click', (e) => {
      if (e.target === campaignEditOverlay) hideCampaignEditOverlay();
    });
  }
  // Refresh (icon only) -> warning popup
  if (campaignRefreshBtn) {
    campaignRefreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCampaignRegenerate();
    });
  }
  if (campaignRegenBtn) {
    campaignRegenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCampaignRegenerate();
    });
  }
  // OK -> validate then maybe warning
  if (campaignOkBtn) {
    campaignOkBtn.addEventListener('click', () => handleManualSeedApply());
  }
  if (campaignApplyBtn) {
    campaignApplyBtn.addEventListener('click', () => handleManualSeedApply());
  }
  if (campaignInput) {
    campaignInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Only accept [0-9a-f] — block g-z etc. at keydown level
      if (e.key.length === 1) {
        const k = e.key.toLowerCase();
        // If it's a letter/digit but not hex, block it
        if (/^[0-9a-z]$/.test(k) && !/^[0-9a-f]$/.test(k)) {
          e.preventDefault();
          return;
        }
        // Also block symbols that are single char but not hex? Allow control keys already handled
        // Let hex chars through
      }
      if (e.key === 'Enter') { e.preventDefault(); handleManualSeedApply(); }
      if (e.key === 'Escape') { e.preventDefault(); hideCampaignEditOverlay(); }
    });
    campaignInput.addEventListener('input', () => {
      // Enforce hex charset, lowercase, maxlength 8
      const start = campaignInput.selectionStart;
      const end = campaignInput.selectionEnd;
      let v = campaignInput.value.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 8);
      if (v !== campaignInput.value) {
        campaignInput.value = v;
        try { campaignInput.setSelectionRange(start, end); } catch {};
      }
      const err = document.getElementById('campaign-seed-error');
      if (err && !err.classList.contains('hidden')) { err.textContent = ''; err.classList.add('hidden'); }
    });
  }
  // Confirm overlay
  if (campaignConfirmOverlay) {
    campaignConfirmOverlay.addEventListener('click', (e) => {
      if (e.target === campaignConfirmOverlay) {
        // cancel only warning, keep edit open
        hideCampaignConfirm(true);
      }
    });
  }
  if (campaignConfirmOk) {
    campaignConfirmOk.addEventListener('click', () => executePendingCampaignAction());
  }
  if (campaignConfirmCancel) {
    campaignConfirmCancel.addEventListener('click', () => hideCampaignConfirm(true));
  }

  // Progression: loadout + coin summary wiring (10-progression.md)
  const loadoutOverlay = document.getElementById('loadout-overlay');
  const loadoutStartBtn = document.getElementById('loadout-start-button');
  const loadoutCancelBtn = document.getElementById('loadout-cancel-button');
  const coinSummaryOverlay = document.getElementById('coin-summary-overlay');
  const coinSummaryOk = document.getElementById('coin-summary-ok');
  if (loadoutStartBtn) {
    loadoutStartBtn.addEventListener('click', () => {
      if (!loadoutCourseId) return;
      startCourseWithLoadout(loadoutCourseId, loadoutSlots);
    });
  }
  if (loadoutCancelBtn) {
    loadoutCancelBtn.addEventListener('click', () => hideLoadout());
  }
  if (loadoutOverlay) {
    loadoutOverlay.addEventListener('click', (e) => {
      if (e.target === loadoutOverlay) {
        if (loadoutPickerVisible) hideLoadoutPicker();
        else hideLoadout();
      }
    });
  }
  const pickerOverlay = document.getElementById('loadout-item-picker-overlay');
  const pickerClose = document.getElementById('loadout-picker-close');
  if (pickerClose) pickerClose.addEventListener('click', () => hideLoadoutPicker());
  if (pickerOverlay) pickerOverlay.addEventListener('click', (e) => { if (e.target === pickerOverlay) hideLoadoutPicker(); });
  if (coinSummaryOk) {
    coinSummaryOk.addEventListener('click', () => hideCoinSummary());
  }
  if (coinSummaryOverlay) {
    coinSummaryOverlay.addEventListener('click', (e) => {
      if (e.target === coinSummaryOverlay) hideCoinSummary();
    });
  }

  // Parallax layered menu background - subtle mouse parallax with 4 splash layers
  try { initParallax(); } catch (e) { console.warn('parallax init failed', e); }

  setupCanvas();
  // REQ-031: load courses collection before progress (so courseId can be resolved)
  try { loadCourses(); } catch (e) { console.warn('loadCourses failed', e); }
  try { loadProgression(); } catch (e) { console.warn('loadProgression failed', e); }
  try { syncCampaignSeedDisplay(); } catch {};
  try { syncProgressionDisplay(); } catch {};
  try { syncLoadoutOverlay(); } catch {};
  try { syncCoinSummaryOverlay(); } catch {};
  try { loadoutUnlockedAtRunStart = getUnlockedLoadoutSlots(); } catch { loadoutUnlockedAtRunStart = 1; }
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
  } catch {};
  // REQ-004: init Three.js wind overlay (transparent shader + particles) on top of game canvas
  try {
    const container = document.getElementById('game-container');
    initWindOverlay(container);
    // Feed initial field (will be updated again after level load)
    syncWindFieldToShader();
    resizeWindOverlay();
  } catch (e) { console.warn('wind overlay init failed', e); }
  // Auto-resume: if valid save exists, load it directly — no Continue button (removed)
  if (hasRestorableSave()) {
    try {
      const _secretHole = getSecretHoleFromURL();
      if (_secretHole && _secretHole >= 1 && _secretHole <= LEVELS.length) {
        try { clearProgress(); } catch {};
        throw new Error('secret hole overrides save');
      }
      const data = loadProgress();
      if (data) {
        // loadProgress already restored currentHoleIndex, supply, etc. via side-effects
        level = LEVELS[currentHoleIndex];
        windStrength = level.field.strength ?? WIND_STRENGTH;
        createField(level.field.cols, level.field.rows, windStrength, level.field.seed, LOGICAL_W, LOGICAL_H, level.field);
        syncModifiersToField();
        createBall(level.tee);
        try { setWindFreeShotActive(isFreeShotActive); if (isFreeShotActive && ball && ball.pos) updateFreeShotGlow(ball.pos, 0); } catch {};
        // Handle GAME_OVER save: show Game Over screen directly
        if (data.gameState === 'GAME_OVER') {
          gameState = 'GAME_OVER';
          mainMenuVisible = false;
          courseMenuVisible = false;
          helpVisible = false;
          pauseMenuVisible = false; rewardMenuVisible = false;
          if (winOverlay) winOverlay.classList.add("hidden");
          // showGameOver will set overlay; but we need to display existing Game Over state
          // Use showGameOver path without resetting
          if (gameoverOverlay) {
            gameoverOverlay.classList.remove("hidden");
            if (gameoverTitle) gameoverTitle.textContent = "Game Over";
          }
        } else {
          gameState = "AIMING";
          if (data.gameState === 'WIN' && currentHoleIndex === LEVELS.length - 1) {
            // Restore final WIN if saved (rare)
            gameState = "WIN";
            if (winOverlay) winOverlay.classList.remove("hidden");
          } else {
            if (winOverlay) winOverlay.classList.add("hidden");
          }
          if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
          // If reward was pending/visible before save, restore it
          if (data.rewardMenuVisible && rewardOffered.length === 3) {
            rewardMenuVisible = true;
            try { syncRewardOverlay(); } catch {};
          } else if (rewardPending) {
            maybeShowRewardMenu();
          }
        }
        resetHotbarCollapsed();
        // Hide main menu — directly in game
        mainMenuVisible = false;
        courseMenuVisible = false;
        helpVisible = false;
        pauseMenuVisible = false;
        updateAttemptsUI(); updateHotbarUI(); updateForceBar();
        syncMainMenu(); syncPauseOverlay();
        redrawBottom();
        try { maybeHideLoadingAfterSplash(); setTimeout(hideLoadingScreen, 400); } catch {};
        // Mark that we auto-resumed so main-menu block below is skipped
        window.__autoResumed = true;
      } else {
        throw new Error('loadProgress returned null');
      }
    } catch (e) {
      // Fall through to main-menu branch on failure (except secret hole case already cleared)
      if (!window.__autoResumed) {
        // Ensure we don't have partial state — reset to main menu
        mainMenuVisible = true;
      }
    }
  }
  if (!window.__autoResumed) {
  // No save or failed — show main menu (no Continue button)
  // Secret: URL param ?hole=N or ?level=N or #hole-N allows direct hole select (hidden) — clear save and set hole behind menu
  const _secretHole = getSecretHoleFromURL();
  if (_secretHole && _secretHole >= 1 && _secretHole <= LEVELS.length) {
    try { clearProgress(); } catch {};
    currentHoleIndex = _secretHole - 1;
  } else {
    currentHoleIndex = 0;
  }
  // Always show main menu entry (REQ-029) — no Continue button, auto-resume handles saves
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
  gameState = "AIMING";
  mainMenuVisible = true;
  courseMenuVisible = false;
  helpVisible = false;
  pauseMenuVisible = false; rewardMenuVisible = false;
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
  holeAttempts = 0; totalAttempts = 0; attempts = 0;
  supply = { magnifier: 0, liquifier: 1, deflector: 0, rotator: 0, freeShot: 0 };
  maxAttempts = 10; areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {}; rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  rewardPending = false; rewardOffered = []; rewardRerolled = false;
  resetHotbarCollapsed();
  updateAttemptsUI(); updateHotbarUI(); updateForceBar();
  syncMainMenu(); syncPauseOverlay();
  // Hide loading after splash is ready (also handled via image onload)
  try { maybeHideLoadingAfterSplash(); setTimeout(hideLoadingScreen, 400); } catch {};
  }
  if (window.__autoResumed) {
    // Clean up flag after auto-resume
    delete window.__autoResumed;
  }
  // Secret: react to hash changes for direct hole jumps (single listener)
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
        // REQ-021: block R while reward menu visible; REQ-028: block while pause visible; REQ-029: block while main menu visible; 11-banners: block on last attempt
        if (rewardMenuVisible) return;
        if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return;
        if (pauseMenuVisible) return;
        if (mainMenuVisible) return;
        if (gameState === "GAME_OVER") {
          handleGameOverReturn();
          return;
        }
        if (gameState === "WIN") {
          if (currentHoleIndex === LEVELS.length - 1) {
            returnToMainMenu();
          } else {
            handleNextHole();
          }
        } else {
          // Last attempt: reset disabled after ball is launched on last attempt
          if (gameState === "FLYING" && isLastAttemptForReset()) {
            return;
          }
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
        // REQ-021: block hotbar selection while reward menu visible; REQ-028: block while pause; REQ-029: block while main menu; 11-banners block
        if (rewardMenuVisible) return;
        if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return;
        if (pauseMenuVisible) return;
        if (mainMenuVisible) return;
        if (gameState !== "AIMING" && gameState !== "CHARGING") return;
        const type = slot.dataset.type;
        // Free Shot is no longer in hotbar; treat all remaining types (magnifier/liquifier/deflector/rotator (legacy amplify/nullify/flip/rotate)) uniformly
        if (type === 'freeShot') {
          // Legacy freeShot slot should not exist; ignore
          return;
        }
        // Passive modifiers: Field Extender and Power Cell are not selectable, no hotkey, show tooltip only
        if (type === 'fieldExtender' || type === 'areaUp' || type === 'powerCell') {
          return;
        }
        // When collapsed slots are display:none so click won't fire; no extra block needed but keep functional if called programmatically
        if (selectedModifier === type) {
          selectedModifier = null;
        } else {
          selectedModifier = type;
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
  const pauseNextAttemptBtnDom = document.getElementById("pause-next-attempt-button");
  const pauseResetAttemptBtnDom = document.getElementById("pause-reset-attempt-button");
  // Single visible Next Attempt button (deleted duplicate green button). Ensure backward compat: both old and new IDs return same visible button.
  let pauseNextBtn = pauseNextAttemptBtnDom || pauseResetAttemptBtnDom;
  try {
    if (pauseNextBtn) {
      const origGetById = document.getElementById.bind(document);
      const origQS = document.querySelector.bind(document);
      const origQSA = document.querySelectorAll.bind(document);
      document.getElementById = function(id) {
        if (id === 'pause-next-attempt-button' || id === 'pause-reset-attempt-button') return pauseNextBtn;
        return origGetById(id);
      };
      document.querySelector = function(sel) {
        if (sel === '#pause-next-attempt-button' || sel === '#pause-reset-attempt-button') return pauseNextBtn;
        return origQS(sel);
      };
      document.querySelectorAll = function(sel) {
        if (sel === '#pause-next-attempt-button' || sel === '#pause-reset-attempt-button') return [pauseNextBtn];
        return origQSA(sel);
      };
    }
  } catch {};
  // Ensure text is Next Attempt
  for (const btn of [pauseNextAttemptBtnDom, pauseResetAttemptBtnDom].filter(Boolean)) {
    if (btn.textContent.trim() !== "Next Attempt") btn.textContent = "Next Attempt";
  }
  if (pauseNextBtn && pauseNextBtn.textContent.trim() !== "Next Attempt") pauseNextBtn.textContent = "Next Attempt";
  // Use single reference for event listeners
  const pauseNextAttemptBtnDomFinal = pauseNextBtn;
  if (resumeBtnDom) resumeBtnDom.addEventListener("click", () => resumeGame());
  if (mainEndRunBtnDom) mainEndRunBtnDom.addEventListener("click", () => endRun());
  if (pauseEndRunBtnDom) pauseEndRunBtnDom.addEventListener("click", () => endRun());
  // Next Attempt in pause (renamed from Next Attempt) — same effect as hitting R hotkey, placed between Continue and End Run
  function handlePauseResetAttempt() {
    // Replicate R hotkey logic (see initInput onReset) but allowed while pause is open:
    // close pause first, then perform R branching. Pause cannot be open during reward/WIN/GAME_OVER,
    // but handle those for completeness.
    if (rewardMenuVisible) {
      // R while reward = re-roll (see 08 §6)
      rerollReward();
      return;
    }
    if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return;
    // Close pause overlay before performing R effect so ball resets in resumed state
    const wasPaused = pauseMenuVisible || isInLevelPause;
    if (wasPaused) {
      pauseMenuVisible = false;
      isInLevelPause = false;
      helpVisible = false;
      syncPauseOverlay();
      syncHelpOverlay();
    }
    if (mainMenuVisible) return;
    if (gameState === "GAME_OVER") {
      handleGameOverReturn();
      return;
    }
    if (gameState === "WIN") {
      if (currentHoleIndex === LEVELS.length - 1) {
        returnToMainMenu();
      } else {
        handleNextHole();
      }
      return;
    }
    // Last attempt: reset disabled on last attempt (cannot reset on last attempt), ball must play out or End Run via pause (Escape)
    if (isLastAttemptForReset()) {
      return;
    }
    resetBall();
  }
  if (pauseResetAttemptBtnDom) pauseResetAttemptBtnDom.addEventListener("click", handlePauseResetAttempt);
  if (pauseNextAttemptBtnDom) pauseNextAttemptBtnDom.addEventListener("click", handlePauseResetAttempt);
  // expose for tests / external callers
  if (typeof window !== 'undefined') {
    window.__handlePauseResetAttempt = handlePauseResetAttempt;
    window.handlePauseResetAttempt = handlePauseResetAttempt;
  }
  // legacy alias
  const newGameBtnDom = document.getElementById("new-game-button");
  if (newGameBtnDom) newGameBtnDom.addEventListener("click", () => { /* New Game shows course list, not End Run */ });
  syncPauseOverlay();
  syncMainMenu();
  window.addEventListener("keydown", (e) => {
    // Coin summary has top priority (above game over)
    if (coinSummaryVisible) {
      if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") {
        hideCoinSummary();
        e.preventDefault();
      }
      return;
    }
    // Loadout has next priority — picker overlay inside loadout
    if (loadoutVisible) {
      if (loadoutPickerVisible) {
        if (e.code === "Escape") {
          hideLoadoutPicker();
          e.preventDefault();
        } else {
          e.preventDefault();
        }
        return;
      }
      if (e.code === "Escape") {
        hideLoadout();
        e.preventDefault();
      } else {
        // Block all other keys while loadout open except Escape/Enter which may start? Enter handled via button
        e.preventDefault();
      }
      return;
    }
    // Game Over has priority — only Return to Main Menu
    if (gameState === "GAME_OVER") {
      if (e.code === "Escape" || e.code === "Enter" || e.code === "Space" || e.code === "KeyR") {
        handleGameOverReturn();
        e.preventDefault();
      }
      return;
    }
    // Campaign edit/confirm popup priority inside main menu
    if (campaignConfirmVisible) {
      if (e.code === "Escape") {
        hideCampaignConfirm(true);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    if (campaignEditVisible) {
      if (e.code === "Escape") {
        hideCampaignEditOverlay();
        e.preventDefault();
        return;
      }
      const ae = document.activeElement;
      const isInput = ae && ae.id === 'campaign-seed-input';
      if (isInput) {
        // allow typing, Enter, Backspace, etc. in input
        if (e.code === "Enter" || e.key.length === 1 || e.code === "Backspace" || e.code === "Delete" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Home" || e.code === "End" || (e.ctrlKey || e.metaKey)) return;
      }
      e.preventDefault();
      return;
    }
    // Help has priority over main/pause
    if (helpVisible) {
      if (e.code === "Escape") {
        helpVisible = false;
        syncHelpOverlay();
        if (pauseMenuVisible) syncPauseOverlay();
        else if (mainMenuVisible) { showMainMenuRoot(); syncMainMenu(); }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
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
          if (helpVisible) {
            // Help is global — return to previous menu (main or pause)
            helpVisible = false;
            syncHelpOverlay();
            // Restore correct menu content
            if (pauseMenuVisible) {
              syncPauseOverlay();
            } else if (mainMenuVisible) {
              showMainMenuRoot();
              syncMainMenu();
            } else {
              syncHelpOverlay();
            }
          } else if (courseMenuVisible) {
            showMainMenuRoot();
            syncMainMenu();
          } else {
            // Root pause: simply resume (like Continue)
            pauseMenuVisible = false;
            isInLevelPause = false;
            helpVisible = false;
            syncPauseOverlay();
            syncHelpOverlay();
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
    // REQ-021: when reward menu visible, 1/2/3 selects random offered reward by position, other inputs blocked; 11-banners: R rerolls (not 0)
    // Bag remains openable while reward is showing, so allow I/Tab toggle even during reward
    if (rewardMenuVisible) {
      if (e.code === "KeyI" || e.code === "Tab") {
        const ae = document.activeElement;
        const isTyping = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
        if (!isTyping && !e.ctrlKey && !e.altKey && !e.metaKey) {
          toggleHotbar();
          e.preventDefault();
        }
        return;
      }
      if (e.code === "Digit1" && rewardOffered[0]) {
        claimReward(rewardOffered[0]);
        e.preventDefault();
      } else if (e.code === "Digit2" && rewardOffered[1]) {
        claimReward(rewardOffered[1]);
        e.preventDefault();
      } else if (e.code === "Digit3" && rewardOffered[2]) {
        claimReward(rewardOffered[2]);
        e.preventDefault();
      } else if (e.code === "KeyR" && !rewardRerolled) {
        rerollReward();
        e.preventDefault();
      } else if (e.code === "KeyR" && rewardRerolled) {
        e.preventDefault();
      } else if (e.code === "Digit0" || e.code === "Numpad0") {
        // Digit0 no longer rerolls; blocked
        e.preventDefault();
      } else if (e.code === "Escape" || e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyA" || e.code === "KeyD" || e.code === "Digit4") {
        // Block aiming/charging while menu open (including Digit4 which is not used - only 3 options)
        e.preventDefault();
      }
      return;
    }
    if (holeBannerVisible || attemptsBannerVisible) {
      e.preventDefault();
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
      // In AIMING/CHARGING handle deselection first per 07 spec (Escape clears selection/active) before opening pause
      if ((gameState === "AIMING" || gameState === "CHARGING") && (selectedModifier !== null || isFreeShotActive)) {
        selectedModifier = null;
        if (isFreeShotActive) clearFreeShotGlow();
        updateHotbarUI();
        e.preventDefault();
        return;
      }
      // Open in-level pause if currently in a level (active run), regardless of AIMING/CHARGING/FLYING
      const inLevel = !!activeCourse || hasRestorableSave();
      if (inLevel && !rewardMenuVisible && gameState !== "WIN") {
        // Allow Escape to open main menu with backdrop even if ball in flight (selection already cleared above)
        openInLevelPause();
        e.preventDefault();
        return;
      }
      // Not in level (entry menu hidden?): handle deselection fallback
      if (selectedModifier !== null || isFreeShotActive) {
        selectedModifier = null;
        if (isFreeShotActive) clearFreeShotGlow();
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
    // Hotbar collapsible: M / B legacy plus new I / Tab per updated spec; Escape stays deselect-only
    // Bag+hotbar are always visible during gameplay including FLYING and reward (per updated spec)
    const isHotbarToggleKey = (e.code === "KeyM" || e.code === "KeyB" || e.code === "KeyI" || e.code === "Tab");
    if (isHotbarToggleKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Ignore Tab/I while typing in input/textarea/contentEditable
      const ae = document.activeElement;
      const isTyping = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
      if (!isTyping) {
        const isOverlayHidden = pauseMenuVisible || mainMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || gameState === "WIN" || gameState === "GAME_OVER";
        const bagVisible = !isOverlayHidden;
        if (bagVisible) {
          toggleHotbar();
          e.preventDefault();
          return;
        } else if (isHotbarCollapsed && !pauseMenuVisible && !mainMenuVisible && !holeBannerVisible && !attemptsBannerVisible) {
          // Allow toggling even when hidden due to WIN/GAME_OVER to preserve state for next AIMING
          toggleHotbar();
          e.preventDefault();
          return;
        }
      }
    }
    if (e.code === "Digit1") {
      if (selectedModifier === 'liquifier') selectedModifier = null;
      else selectedModifier = 'liquifier';
      updateHotbarUI();
      e.preventDefault();
    } else if (e.code === "Digit2") {
      if (selectedModifier === 'deflector') selectedModifier = null;
      else selectedModifier = 'deflector';
      updateHotbarUI();
      e.preventDefault();
    } else if (e.code === "Digit3") {
      if (selectedModifier === 'rotator') selectedModifier = null;
      else selectedModifier = 'rotator';
      updateHotbarUI();
      e.preventDefault();
    } else if (e.code === "Digit4") {
      if (selectedModifier === 'magnifier') selectedModifier = null;
      else selectedModifier = 'magnifier';
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
      // Remove last modifier and refund supply (inventory model)
      if (modifiers.length > 0 && (gameState === "AIMING" || gameState === "CHARGING")) {
        const removed = modifiers.pop();
        if (removed && removed.type && removed.type in supply) {
          supply[removed.type] = Math.max(0, (supply[removed.type] ?? 0) + 1);
        }
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
      } catch {};
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
      try { resizeWindOverlay(); } catch {};
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
    magnifier: Math.max(0, newSupply.magnifier ?? newSupply.amplify ?? 0),
    liquifier: Math.max(0, newSupply.liquifier ?? newSupply.nullify ?? 0),
    deflector: Math.max(0, newSupply.deflector ?? newSupply.flip ?? 0),
    rotator: Math.max(0, newSupply.rotator ?? newSupply.rotate ?? 0),
    freeShot: Math.max(0, newSupply.freeShot ?? 0),
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
function setRewardMenuVisible(v) { rewardMenuVisible = !!v; try { syncRewardOverlay(); } catch {}; }
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
  window.__getFreeShotSupply = () => supply.freeShot ?? 0;
  window.__setFreeShotSupply = (v) => { supply.freeShot = Math.max(0, Math.floor(v)); updateHotbarUI(); };
  window.__isFreeShotActive = isFreeShotActiveState;
  window.__getIsFreeShotActive = isFreeShotActiveState;
  window.__isFreeShotFlightActive = isFreeShotFlightActiveState;
  window.__getIsFreeShotFlightActive = isFreeShotFlightActiveState;
  window.__setFreeShotActive = setFreeShotActive;
  window.__toggleFreeShot = toggleFreeShot;
  window.__clearFreeShotGlow = clearFreeShotGlow;
  window.__clearFreeShotFlightGlow = clearFreeShotFlightGlow;
  Object.defineProperty(window, 'isFreeShotActive', { get: () => isFreeShotActive, set: (v) => setFreeShotActive(!!v) });
  Object.defineProperty(window, '__isFreeShotActive', { get: () => isFreeShotActive, set: (v) => setFreeShotActive(!!v) });
  Object.defineProperty(window, 'freeShotFlightActive', { get: () => freeShotFlightActive, set: (v) => { freeShotFlightActive = !!v; syncFreeShotGlow(); } });
  Object.defineProperty(window, '__freeShotFlightActive', { get: () => freeShotFlightActive, set: (v) => { freeShotFlightActive = !!v; syncFreeShotGlow(); } });
  window.__getAreaUpgradeCount = getAreaUpgradeCount;
  window.__getFieldExtenderCount = getFieldExtenderCount;
  window.__getPowerCellCount = getPowerCellCount;
  window.__getAreaMultiplier = getAreaMultiplier;
  window.__getPowerMultiplier = getPowerMultiplier;
  window.__getEffectiveModifierRadius = getEffectiveModifierRadius;
  window.__getEffectiveModifierStrength = getEffectiveModifierStrength;
  window.__addAreaUpgrade = addAreaUpgrade;
  window.__addFieldExtender = addFieldExtender;
  window.__addPowerCell = addPowerCell;
  window.__getRewardPending = () => rewardPending;
  window.__setRewardPending = (v) => { rewardPending = !!v; };
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
  Object.defineProperty(window, 'maxAttempts', {
    get: () => maxAttempts,
    set: (v) => setMaxAttempts(v)
  });
  Object.defineProperty(window, '__maxAttempts', {
    get: () => maxAttempts,
    set: (v) => setMaxAttempts(v)
  });
  window.__getMaxAttempts = getMaxAttempts;
  window.__setMaxAttempts = setMaxAttempts;
  window.__addMaxAttempts = addMaxAttempts;
  window.__getAttemptsLeft = getAttemptsLeft;
  Object.defineProperty(window, 'rewardOffered', {
    get: () => [...rewardOffered],
    set: (v) => setRewardOffered(v)
  });
  Object.defineProperty(window, 'rewardMenuVisible', {
    get: () => rewardMenuVisible,
    set: (v) => { rewardMenuVisible = !!v; try { syncRewardOverlay(); } catch {}; }
  });
  Object.defineProperty(window, 'rewardClaimedFor', {
    get: () => rewardClaimedFor,
    set: (v) => { rewardClaimedFor = v; }
  });
  Object.defineProperty(window, 'areaUpgradeCount', {
    get: () => areaUpgradeCount,
    set: (v) => {
      areaUpgradeCount = Math.max(0, Math.floor(v));
      fieldExtenderCount = areaUpgradeCount;
      const newR = getEffectiveModifierRadius();
      for (const m of modifiers) m.radius = newR;
      syncModifiersToField();
    }
  });
  Object.defineProperty(window, '__areaUpgradeCount', {
    get: () => areaUpgradeCount,
    set: (v) => {
      areaUpgradeCount = Math.max(0, Math.floor(v));
      fieldExtenderCount = areaUpgradeCount;
      const newR = getEffectiveModifierRadius();
      for (const m of modifiers) m.radius = newR;
      syncModifiersToField();
    }
  });
  Object.defineProperty(window, 'fieldExtenderCount', {
    get: () => fieldExtenderCount,
    set: (v) => {
      fieldExtenderCount = Math.max(0, Math.floor(v));
      areaUpgradeCount = fieldExtenderCount;
      const newR = getEffectiveModifierRadius();
      for (const m of modifiers) m.radius = newR;
      syncModifiersToField();
      updateHotbarUI();
    }
  });
  Object.defineProperty(window, '__fieldExtenderCount', {
    get: () => fieldExtenderCount,
    set: (v) => {
      fieldExtenderCount = Math.max(0, Math.floor(v));
      areaUpgradeCount = fieldExtenderCount;
      const newR = getEffectiveModifierRadius();
      for (const m of modifiers) m.radius = newR;
      syncModifiersToField();
      updateHotbarUI();
    }
  });
  Object.defineProperty(window, 'powerCellCount', {
    get: () => powerCellCount,
    set: (v) => {
      powerCellCount = Math.max(0, Math.floor(v));
      try { setFieldPowerCellCount(powerCellCount); } catch {}
      updateHotbarUI();
    }
  });
  Object.defineProperty(window, '__powerCellCount', {
    get: () => powerCellCount,
    set: (v) => {
      powerCellCount = Math.max(0, Math.floor(v));
      try { setFieldPowerCellCount(powerCellCount); } catch {}
      updateHotbarUI();
    }
  });
  Object.defineProperty(window, 'rewardPending', {
    get: () => rewardPending,
    set: (v) => { rewardPending = !!v; }
  });
  Object.defineProperty(window, '__rewardPending', {
    get: () => rewardPending,
    set: (v) => { rewardPending = !!v; }
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
  // 11-banners
  window.__isHoleBannerVisible = isHoleBannerVisible;
  window.__getHoleBannerText = getHoleBannerText;
  window.__showHoleBanner = showHoleBanner;
  window.__hideHoleBanner = hideHoleBanner;
  window.__isAttemptsBannerVisible = isAttemptsBannerVisible;
  window.__getAttemptsBannerText = getAttemptsBannerText;
  window.__showAttemptsBanner = showAttemptsBanner;
  window.__hideAttemptsBanner = hideAttemptsBanner;
  window.__maybeShowAttemptsBanner = maybeShowAttemptsBanner;
  Object.defineProperty(window, 'holeBannerVisible', { get: () => holeBannerVisible, set: (v) => { holeBannerVisible = !!v; } });
  Object.defineProperty(window, '__holeBannerVisible', { get: () => holeBannerVisible, set: (v) => { holeBannerVisible = !!v; } });
  Object.defineProperty(window, 'attemptsBannerVisible', { get: () => attemptsBannerVisible, set: (v) => { attemptsBannerVisible = !!v; } });
  Object.defineProperty(window, '__attemptsBannerVisible', { get: () => attemptsBannerVisible, set: (v) => { attemptsBannerVisible = !!v; } });
  Object.defineProperty(window, 'freeShotBannerVisible', { get: () => freeShotBannerVisible, set: (v) => { freeShotBannerVisible = !!v; } });
  Object.defineProperty(window, '__freeShotBannerVisible', { get: () => freeShotBannerVisible, set: (v) => { freeShotBannerVisible = !!v; } });
  window.__isFreeShotBannerVisible = isFreeShotBannerVisible;
  window.__getFreeShotBannerText = getFreeShotBannerText;
  window.__showFreeShotBanner = showFreeShotBanner;
  window.__hideFreeShotBanner = hideFreeShotBanner;
  window.__maybeShowFreeShotBanner = maybeShowFreeShotBanner;
  window.isFreeShotBannerVisible = isFreeShotBannerVisible;
  window.showFreeShotBanner = showFreeShotBanner;
  window.hideFreeShotBanner = hideFreeShotBanner;
  // Softlock banner exports
  window.__isSoftlockBannerVisible = isSoftlockBannerVisible;
  window.__getSoftlockBannerText = getSoftlockBannerText;
  window.__showSoftlockBanner = showSoftlockBanner;
  window.__hideSoftlockBanner = hideSoftlockBanner;
  window.__resetSoftlockDetection = resetSoftlockDetection;
  window.__updateSoftlockDetection = updateSoftlockDetection;
  window.isSoftlockBannerVisible = isSoftlockBannerVisible;
  window.showSoftlockBanner = showSoftlockBanner;
  window.hideSoftlockBanner = hideSoftlockBanner;
  window.resetSoftlockDetection = resetSoftlockDetection;
  Object.defineProperty(window, 'softlockBannerVisible', { get: () => softlockBannerVisible, set: (v) => { softlockBannerVisible = !!v; } });
  Object.defineProperty(window, '__softlockBannerVisible', { get: () => softlockBannerVisible, set: (v) => { softlockBannerVisible = !!v; } });
  Object.defineProperty(window, 'softlockBannerText', { get: () => softlockBannerText, set: (v) => { softlockBannerText = String(v); } });
  window.__isLastAttemptForSoftlock = isLastAttemptForSoftlock;
  window.__isLastAttemptForReset = isLastAttemptForReset;
  window.__getSoftlockTextForCurrentState = getSoftlockTextForCurrentState;
  window.__SOFTLOCK_TEXT_NORMAL = SOFTLOCK_TEXT_NORMAL;
  window.__SOFTLOCK_TEXT_LAST = SOFTLOCK_TEXT_LAST;
  window.isLastAttemptForSoftlock = isLastAttemptForSoftlock;
  window.isLastAttemptForReset = isLastAttemptForReset;
  window.getSoftlockTextForCurrentState = getSoftlockTextForCurrentState;
  window.SOFTLOCK_TEXT_NORMAL = SOFTLOCK_TEXT_NORMAL;
  window.SOFTLOCK_TEXT_LAST = SOFTLOCK_TEXT_LAST;
  // 12-campaign
  window.__getCampaignSeed = () => (typeof getCampaignSeed === 'function' ? getCampaignSeed() : null);
  window.__setCampaignSeed = (s) => (typeof setCampaignSeed === 'function' ? setCampaignSeed(s) : null);
  window.__regenerateCampaign = () => handleCampaignRegenerate();
  window.__applyManualSeed = (s) => { const inp = document.getElementById('campaign-seed-input'); if (inp) inp.value = s; handleManualSeedApplyLegacy(); };
  window.__applyManualSeedValidated = (s) => { const inp = document.getElementById('campaign-seed-input'); if (inp) inp.value = s; handleManualSeedApply(); };
  window.__getRewardSeedCounter = getRewardSeedCounter;
  window.__setRewardSeedCounter = setRewardSeedCounter;
  window.__seededShuffle = seededShuffle;
  window.__getSeededRewardOffer = getSeededRewardOffer;
  window.__isCampaignEditVisible = isCampaignEditVisible;
  window.__isCampaignConfirmVisible = isCampaignConfirmVisible;
  window.__showCampaignEditOverlay = showCampaignEditOverlay;
  window.__hideCampaignEditOverlay = hideCampaignEditOverlay;
  window.__syncCampaignEditOverlay = syncCampaignEditOverlay;
  window.__syncCampaignSeedDisplay = syncCampaignSeedDisplay;
  window.__syncCampaignConfirmOverlay = syncCampaignConfirmOverlay;
  window.__showCampaignConfirm = showCampaignConfirm;
  window.__hideCampaignConfirm = hideCampaignConfirm;
  window.__executePendingCampaignAction = executePendingCampaignAction;
  window.__isValidCampaignSeed = isValidCampaignSeed;
  window.__handleCampaignRegenerate = handleCampaignRegenerate;
  window.__handleManualSeedApply = handleManualSeedApply;
  window.getCampaignSeed = getCampaignSeed;
  window.setCampaignSeed = setCampaignSeed;
  window.regenerateCampaign = regenerateCampaign;
  window.applyManualSeed = applyManualSeed;
  // 10-progression (persistent loadout + coins)
  window.__isLoadoutVisible = isLoadoutVisible;
  window.__showLoadout = showLoadout;
  window.__hideLoadout = hideLoadout;
  window.__getLoadoutSlots = getLoadoutSlots;
  window.__getUnlockedLoadoutSlots = getUnlockedLoadoutSlots;
  window.getUnlockedLoadoutSlots = getUnlockedLoadoutSlots;
  window.__addToLoadout = addToLoadout;
  window.__removeFromLoadout = removeFromLoadout;
  window.__startCourseWithLoadout = startCourseWithLoadout;
  window.__syncLoadoutOverlay = syncLoadoutOverlay;
  window.__showLoadoutPicker = showLoadoutPicker;
  window.__hideLoadoutPicker = hideLoadoutPicker;
  window.__isLoadoutPickerVisible = isLoadoutPickerVisible;
  window.__getLoadoutPickerSlotIndex = getLoadoutPickerSlotIndex;
  window.__syncLoadoutPickerOverlay = syncLoadoutPickerOverlay;
  window.__getCoins = getCoins;
  window.__getPersonalSupply = getPersonalSupply;
  window.__getRunCoinsEarned = getRunCoinsEarned;
  window.__getRunHolesCleared = getRunHolesCleared;
  window.__isCoinSummaryVisible = isCoinSummaryVisible;
  window.__showCoinSummary = showCoinSummary;
  window.__hideCoinSummary = hideCoinSummary;
  window.__finalizeRunCoinsAndShowSummary = finalizeRunCoinsAndShowSummary;
  window.__syncCoinSummaryOverlay = syncCoinSummaryOverlay;
  window.__syncProgressionDisplay = syncProgressionDisplay;
  window.__PROGRESSION_KEY = PROGRESSION_KEY;
  window.__COINS_PER_HOLE = COINS_PER_HOLE;
  window.__COURSE_COMPLETE_BONUS = COURSE_COMPLETE_BONUS;
  window.__SHOP_PRICE_SPATIAL = SHOP_PRICE_SPATIAL;
  window.__SHOP_PRICE_PASSIVE = SHOP_PRICE_PASSIVE;
  window.__costFor = costFor;
  window.__loadProgression = loadProgression;
  window.__saveProgression = saveProgression;
  window.__clearProgression = clearProgression;
  window.__progressionPurchase = progressionPurchase;
  Object.defineProperty(window, 'loadoutVisible', { get: () => loadoutVisible, set: (v)=>{loadoutVisible=!!v; syncLoadoutOverlay();} });
  Object.defineProperty(window, '__loadoutVisible', { get: () => loadoutVisible, set: (v)=>{loadoutVisible=!!v; syncLoadoutOverlay();} });
  Object.defineProperty(window, 'loadoutSlots', { get: ()=>[...loadoutSlots], set:(v)=>{ if(Array.isArray(v)) loadoutSlots=[...v].slice(0,4); syncLoadoutOverlay();} });
  Object.defineProperty(window, 'coinSummaryVisible', { get: ()=>coinSummaryVisible, set:(v)=>{coinSummaryVisible=!!v; syncCoinSummaryOverlay();} });
  Object.defineProperty(window, 'runHolesCleared', { get: ()=>runHolesCleared, set:(v)=>{runHolesCleared=Math.max(0,Math.floor(v));} });
  Object.defineProperty(window, 'runCoinsEarned', { get: ()=>runCoinsEarned, set:(v)=>{runCoinsEarned=Math.max(0,Math.floor(v));} });
  Object.defineProperty(window, 'loadoutUnlockedAtRunStart', { get: ()=>loadoutUnlockedAtRunStart, set:(v)=>{loadoutUnlockedAtRunStart=Math.max(1,Math.min(4,Math.floor(v)));} });
  window.__loadoutUnlockedAtRunStart = loadoutUnlockedAtRunStart;
  window.__getLoadoutUnlockedAtRunStart = () => loadoutUnlockedAtRunStart;
  Object.defineProperty(window, 'campaignEditVisible', { get: () => campaignEditVisible, set: (v) => { campaignEditVisible = !!v; syncCampaignEditOverlay(); } });
  Object.defineProperty(window, '__campaignEditVisible', { get: () => campaignEditVisible, set: (v) => { campaignEditVisible = !!v; syncCampaignEditOverlay(); } });
  Object.defineProperty(window, 'campaignSeed', { get: () => (typeof getCampaignSeed === 'function' ? getCampaignSeed() : null), set: (v) => { if (typeof setCampaignSeed === 'function') setCampaignSeed(v); syncCampaignSeedDisplay(); } });
  Object.defineProperty(window, 'rewardSeedCounter', { get: () => rewardSeedCounter, set: (v) => { rewardSeedCounter = Math.max(0, Math.floor(v||0)); } });
}

export { init, resetBall, gameState, attempts, supply, getSupply, setSupply, addToSupply, canPlace, resetSupply, getModifiers, getSelectedModifier, modifiers, selectedModifier, rewardMenuVisible, rewardClaimedFor, rewardMenuHover, rewardOffered, REWARD_POOL, maybeShowRewardMenu, claimReward, isRewardMenuVisible, getRewardClaimedFor, getRewardMenuState, setRewardClaimedFor, setRewardMenuVisible, getRewardOffered, setRewardOffered, maxAttempts, getMaxAttempts, setMaxAttempts, getAttemptsLeft, areaUpgradeCount, fieldExtenderCount, powerCellCount, getAreaUpgradeCount, getFieldExtenderCount, getPowerCellCount, getAreaMultiplier, getEffectiveModifierRadius, getPowerMultiplier, getEffectiveModifierStrength, addAreaUpgrade, addFieldExtender, addPowerCell, BASE_MODIFIER_RADIUS, BASE_MODIFIER_STRENGTH, bounceBall, rewardPending, rewardRerolled, rewardRerollHover, getRewardRerolled, rerollReward, totalAttempts, holeAttempts, currentHoleIndex, STORAGE_KEY, getSavePayload, saveProgress, loadProgress, clearProgress, pauseMenuVisible, pauseMenuHover, rewardChosenCounts, getRewardChosenCounts, getRewardChosenCount, setRewardChosenCounts, resumeGame, startNewGame, isPauseMenuVisible, mainMenuVisible, mainMenuHover, HIGH_SCORE_KEY, getHighScore, setHighScore, clearHighScore, maybeUpdateHighScore, syncMainMenu, isMainMenuVisible, startNewGameFromMain, endRun, isHotbarCollapsed, isHotbarCollapsedState, toggleHotbar, resetHotbarCollapsed, syncHotbarCollapsedUI, returnToMainMenu, resetGameAfterWin, showGameOver, hideGameOver, handleGameOverReturn, isFreeShotActive, isFreeShotActiveState, canActivateFreeShot, setFreeShotActive, toggleFreeShot, clearFreeShotGlow, holeBannerVisible, attemptsBannerVisible, freeShotBannerVisible, holeBannerText, attemptsBannerText, freeShotBannerText, isHoleBannerVisible, getHoleBannerText, showHoleBanner, hideHoleBanner, isAttemptsBannerVisible, getAttemptsBannerText, showAttemptsBanner, hideAttemptsBanner, maybeShowAttemptsBanner, isFreeShotBannerVisible, getFreeShotBannerText, showFreeShotBanner, hideFreeShotBanner, maybeShowFreeShotBanner, getRewardSeedCounter, setRewardSeedCounter, softlockBannerVisible, softlockBannerText, isSoftlockBannerVisible, getSoftlockBannerText, showSoftlockBanner, hideSoftlockBanner, resetSoftlockDetection, updateSoftlockDetection, isLastAttemptForSoftlock, isLastAttemptForReset, getSoftlockTextForCurrentState, SOFTLOCK_TEXT_NORMAL, SOFTLOCK_TEXT_LAST };

// Auto-init when loaded as module via script tag
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
