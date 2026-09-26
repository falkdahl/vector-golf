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
import { COURSES_KEY, STAGES, generateCampaignCourse, loadCourses as loadCoursesFromStorage, saveCourses as saveCoursesToStorage, exportCourse, importCourse, validateCourse, isStageUnlocked, getUnlockedStages, ensureNextStageUnlocked, getCampaignSeed, setCampaignSeed, generateCampaignSeed, deriveCourseSeed, regenerateCampaign, applyManualSeed, invalidateCoursesCache } from "./courses.js";
import { PROGRESSION_KEY, LOADOUT_KEY, COINS_PER_HOLE, COINS_PER_ATTEMPT, COURSE_COMPLETE_BONUS, SHOP_PRICE_SPATIAL, SHOP_PRICE_PASSIVE, MAX_LOADOUT_SLOTS, SHOP_INITIAL_STOCK, LOADOUT_SLOT_COSTS, DEFAULT_UNLOCKED_SLOTS, costFor, getProgression, getCoins, getPersonalSupply, getPersonalSupplyCount, getShopStock, getShopStockCount, addShopStock, purchase as progressionPurchase, addCoins, saveProgression, loadProgression, clearProgression, getLastLoadout, setLastLoadout, clearLastLoadout, hasLastLoadout, getUnlockedLoadoutSlots as getProgressionUnlockedSlots, getNextLoadoutSlotCost, canUnlockNextLoadoutSlot, unlockNextLoadoutSlot, setUnlockedLoadoutSlots, getRunsStarted, incrementRunsStarted } from "./progression.js";
import { playCutscene as cutscenePlay, loadCutscene as cutsceneLoad, validateCutscene as cutsceneValidate, isCutsceneActive as cutsceneIsActive, getActiveCutsceneId as cutsceneGetId, updateCutscene as cutsceneUpdate, renderCutscene as cutsceneRender, handleCutsceneInput as cutsceneHandleInput, skipCutscene as cutsceneSkip, preloadCutscene as cutscenePreload, hasSeenCutscene as cutsceneHasSeen, markCutsceneSeen as cutsceneMarkSeen, CUTSCENE_SEEN_KEY as cutsceneSeenKey } from "./cutscene.js";
import { isBanterActive as banterIsActive, playRunStartBanter as banterPlayRunStart, updateBanter as banterUpdate, handleBanterInput as banterHandleInput, preloadBanterFile as banterPreload, skipBanter as banterSkip, playBanter as banterPlay, loadBanterFile as banterLoadFile } from "./banter.js";

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
  // Normalize X only to [-1, 1] (subtle: limit to [-1,1] with clamp) — Y disabled per requirement (x-plane only)
  const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
  // Small dampening: keep target in subtle range (-1 to 1 will be scaled by depth)
  parallaxTargetX = nx;
  parallaxTargetY = 0;
}

function handleParallaxMouseLeave() {
  parallaxTargetX = 0;
  parallaxTargetY = 0;
}

function applyParallaxTransforms() {
  if (!parallaxLayers.length) return;
  // Lerp current toward target for smooth subtle motion — X only (Y locked to 0)
  const lerp = 0.08;
  parallaxCurrentX += (parallaxTargetX - parallaxCurrentX) * lerp;
  parallaxCurrentY = 0;
  parallaxTargetY = 0;
  // Clamp very small values to zero to avoid jitter
  if (Math.abs(parallaxCurrentX) < 0.001) parallaxCurrentX = 0;
  for (const layer of parallaxLayers) {
    const depth = layer.dataset.depth;
    const d = PARALLAX_DEPTHS[depth] ?? 10;
    // Parallax: x-plane only — closer layers move more horizontally, no vertical motion
    // Use translate3d for GPU compositing (y locked to 0)
    const x = parallaxCurrentX * d;
    const y = 0;
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
  let isCut = false; try { isCut = cutsceneIsActive(); } catch {}
  const shouldShow = !!(mainMenuVisible && !isInLevelPause && !isCut);
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
    let isCut2 = false; try { isCut2 = cutsceneIsActive(); } catch {}
    // During cutscene, do not draw splash/parallax — cutsceneRender handles bgCanvas
    if (isCut2) {
      bgCtx.restore();
      return;
    }
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
        if (clone) {
          if (Array.isArray(clone.treasures)) clone.treasures.forEach(t=>{ if(t) t.isCollected=false; });
          if (clone.treasure) clone.treasure.isCollected = false;
          // keep single treasure in sync with first of array for backward compat
          if (Array.isArray(clone.treasures) && clone.treasures.length && clone.treasure) {
            clone.treasure.isCollected = !!clone.treasures[0].isCollected;
          }
        }
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
function isTutorialCourse(course) { return !!(course && (course.name === "The Proving Grounds" || course.name === "The 3-Hole Trial" || course.name === "3-hole Trial")); }
function isTutorialActive() { return isTutorialCourse(activeCourse); }
function getLevelTreasures(lvl){
  if(!lvl) return [];
  if(Array.isArray(lvl.treasures) && lvl.treasures.length) return lvl.treasures;
  if(lvl.treasure) return [lvl.treasure];
  return [];
}
function getUncollectedTreasures(lvl){
  return getLevelTreasures(lvl).filter(t=>t && !t.isCollected);
}
// Tutorial reminder state
let tutorialLiquifierReminderShown = false;
let tutorialHole3RewardBanterShown = false;

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
// 14-cheat-mode (Hashimoto Protocol, testing only): Konami code arms ball drag & drop.
// Session-scoped, never persisted.
let cheatMode = false;
let cheatDraggingBall = false;
let cheatSuppressClick = false;
let cheatMousePos = null;
const KONAMI_SEQUENCE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
const CHEAT_GRAB_RADIUS_PAD = 10;
function isCheatMode() { return !!cheatMode; }
function isCheatDraggingBall() { return !!cheatDraggingBall; }
function activateCheatMode() {
  cheatMode = true;
  try { showToast('Hashimoto Protocol Activated'); } catch {}
  return true;
}
function deactivateCheatMode() {
  // Drop a held ball in place first so it never sticks to the cursor.
  try { if (cheatDraggingBall) dropCheatBall(null); } catch {}
  cheatDraggingBall = false;
  cheatMousePos = null;
  cheatSuppressClick = false;
  cheatMode = false;
  try { showToast('Hashimoto Protocol Disabled'); } catch {}
  return true;
}
function toggleCheatMode() {
  if (cheatMode) return deactivateCheatMode();
  return activateCheatMode();
}
function cheatClampPos(pos) {
  return {
    x: Math.max(BALL_RADIUS, Math.min(LOGICAL_W - BALL_RADIUS, pos.x)),
    y: Math.max(BALL_RADIUS, Math.min(LOGICAL_H - BALL_RADIUS, pos.y)),
  };
}
function cheatGrabBlocked() {
  if (mainMenuVisible) return true;
  if (pauseMenuVisible) return true;
  if (rewardMenuVisible) return true;
  if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return true;
  if (coinSummaryVisible) return true;
  if (startingItemsVisible || loadoutVisible) return true;
  try { if (cutsceneIsActive()) return true; } catch {}
  try { if (banterIsActive()) return true; } catch {}
  if (gameState !== 'AIMING' && gameState !== 'CHARGING' && gameState !== 'FLYING') return true;
  return false;
}
function tryCheatGrabBall(pos) {
  if (!cheatMode || cheatDraggingBall) return false;
  if (cheatGrabBlocked()) return false;
  if (!pos || !ball || !ball.pos) return false;
  if (Math.hypot(ball.pos.x - pos.x, ball.pos.y - pos.y) > BALL_RADIUS + CHEAT_GRAB_RADIUS_PAD) return false;
  const clamped = cheatClampPos(pos);
  cheatMousePos = clamped;
  cheatSuppressClick = false;
  if (gameState === 'AIMING' || gameState === 'CHARGING') {
    // Counts as launched (see 14-cheat-mode §3): enter FLYING without initial velocity.
    ball.isMoving = true;
    ball.vel = { x: 0, y: 0 };
    ball.z = 0; ball.vz = 0;
    gameState = 'FLYING';
    modifiersTraversedThisShot = new Set();
    resetCharge();
    resetSoftlockDetection();
    updateForceBar();
    saveProgress();
  }
  ball.pos.x = clamped.x; ball.pos.y = clamped.y;
  ball.vel = { x: 0, y: 0 };
  cheatDraggingBall = true;
  return true;
}
function dropCheatBall(pos) {
  if (!cheatDraggingBall) return false;
  const clamped = pos ? cheatClampPos(pos) : { x: ball.pos.x, y: ball.pos.y };
  ball.pos.x = clamped.x; ball.pos.y = clamped.y;
  ball.vel = { x: 0, y: 0 };
  cheatDraggingBall = false;
  cheatMousePos = null;
  cheatSuppressClick = true;
  resetSoftlockDetection();
  saveProgress();
  return true;
}
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

// Supply per tactical rework: 4-slot golfbag is source of truth (one item per slot, no stacking).
// Run supply starts empty and is filled via loadout selection (4 slots) — default kept for backward compat tests that check resetSupply
let supply = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0 };
const GOLFBAG_SIZE = 4;
const FREE_SHOT_CHARGES_PER_ITEM = 3;
// Each entry: null | {type:string, charges?:number} (freeShot carries charges, others single-use)
let golfbag = [null, null, null, null];
let selectedBagIndex = -1; // slot-based selection (hotkeys 1-4)
let pendingRewardType = null; // reward chosen while bag full, awaiting discard/skip
// Pickup-discard mode: right-clicking a field modifier while the bag is full arms
// this instead of toasting. Clicking a bag slot discards it and completes the
// pickup; clicking the map or Escape cancels. Same .discard-target highlight.
let pendingPickup = null; // null | { type:string, modifierId:number|string|null, modifierIndex:number }
// Starting items overlay (replaces loadout) — Choose 2 starting items on first hole of each run
let startingItemsVisible = false;
let startingCourseId = null;
let startingRemaining = 0;
let startingChoices = []; // remaining types to pick from
let loadoutVisible = false; // kept for compat, always false now
let loadoutCourseId = null;
let loadoutSlots = [null,null,null,null];
let loadoutOpenedAt = 0;
const LOADOUT_OPEN_GRACE_MS = 500;
function isLoadoutDismissGraceActive(){ try{ if(!startingItemsVisible) return false; return (Date.now()-loadoutOpenedAt)<LOADOUT_OPEN_GRACE_MS;}catch{return false;}}
let loadoutHideShopDueToIntro = false;
let isTutorialRun = false;
function isTutorialRunActive(){ return !!isTutorialRun; }
function isStartingItemsVisible(){ return !!startingItemsVisible; }
function getStartingRemaining(){ return startingRemaining; }
// Points tracking (replaces coins): -1 per attempt, +10 per modifier traversed, +50 first attempt bonus
let totalPoints = 0;
let runHolesCleared = 0;
let runPointsEarned = 0;
let runCoinsEarned = 0; // alias for runPointsEarned for compat
let coinSummaryVisible = false;
let coinSummaryHoles = 0;
let coinSummaryAttempts = 0;
let coinSummaryCoins = 0;
let coinSummaryAnimDone = false;
let coinSummaryAnimTimers = [];
let coinSummaryPendingUnlock = false;
let loadoutUnlockedAtRunStart = 4;
let deferredMenuReturn = false;
let runShopRestocked = false;
let runFirstCourseClear = false;
let runUnlockedNewCourse = false;
function isMenuReturnDeferred(){ return !!deferredMenuReturn; }
function isShopRestockedThisRun(){ return !!runShopRestocked; }
function isCourseFirstClearThisRun(){ return !!runFirstCourseClear; }
function isNewCourseUnlockedThisRun(){ return !!runUnlockedNewCourse; }
// Passive stackable counts (re-added bag slots for passives)
let passiveCounts = { fieldExtender:0, powerCell:0, freeShot:0 };
let modifiersTraversedThisHole = new Set();
let modifiersTraversedThisShot = new Set();
let pendingHoleAdvance = false;
let pendingCourseComplete = false; // ids of modifiers ball has been inside
let holeStartAttempts = 0;
function normalizeSupplyType(type) {
  if (type === 'amplify') return 'magnifier';
  if (type === 'nullify') return 'liquifier';
  if (type === 'flip') return 'deflector';
  if (type === 'rotate') return 'rotator';
  if (type === 'rangeModifier') return 'powerCell';
  return type;
}
function denormalizeSupplyType(type) { return type; } // kept for alias checks
// --- Tactical 4-slot golfbag (source of truth) ---
function bagEntryType(entry) { return entry && entry.type ? normalizeSupplyType(entry.type) : null; }
function getGolfbag() { return golfbag.map(e => (e ? { ...e } : null)); }
function getEffectiveGolfbagSize() { return GOLFBAG_SIZE; }
function golfbagUsedCount() { let n = 0; for (let i = 0; i < GOLFBAG_SIZE; i++) if (golfbag[i]) n++; return n; }
function golfbagHasEmpty() { for (let i = 0; i < GOLFBAG_SIZE; i++) if (!golfbag[i]) return true; return false; }
function golfbagFirstEmpty() { for (let i = 0; i < GOLFBAG_SIZE; i++) if (!golfbag[i]) return i; return -1; }
function golfbagTotalFreeShots() { return Math.max(0, Math.floor(passiveCounts.freeShot||0)); }
function golfbagCountOf(type) { const t = normalizeSupplyType(type); let n = 0; for (const e of golfbag) if (e && bagEntryType(e) === t && t !== 'freeShot') n++; return n; }
function syncDerivedFromBag() {
  const counts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0 };
  for (const e of golfbag) {
    if (!e) continue;
    const t = bagEntryType(e);
    if (t === 'magnifier' || t === 'liquifier' || t === 'deflector' || t === 'rotator') counts[t]++;
  }
  let fe = passiveCounts.fieldExtender || 0;
  let pc = passiveCounts.powerCell || 0;
  let fs = passiveCounts.freeShot || 0;
  supply = { magnifier: counts.magnifier, liquifier: counts.liquifier, deflector: counts.deflector, rotator: counts.rotator, freeShot: fs };
  fieldExtenderCount = fe; areaUpgradeCount = fe;
  powerCellCount = pc;
  try { setFieldPowerCellCount(pc); } catch {}
  // Keep slot selection consistent (Free Shot is display-only, never a selection)
  if (selectedBagIndex < 0 || selectedBagIndex >= getEffectiveGolfbagSize() || !golfbag[selectedBagIndex]) {
    if (selectedModifier && !(supply[normalizeSupplyType(selectedModifier)] > 0)) { selectedModifier = null; selectedBagIndex = -1; }
    if (selectedModifier === 'freeShot') { selectedModifier = null; selectedBagIndex = -1; }
  } else if (bagEntryType(golfbag[selectedBagIndex]) === 'freeShot') {
    selectedBagIndex = -1; selectedModifier = null;
  } else {
    selectedModifier = bagEntryType(golfbag[selectedBagIndex]);
  }
}
function setBagFromTypeList(types) {
  golfbag = [null, null, null, null];
  passiveCounts = { fieldExtender:0, powerCell:0, freeShot:0 };
  const list = Array.isArray(types) ? types : [];
  let idx = 0;
  for (const raw of list) {
    if (!raw) continue;
    const t = normalizeSupplyType(typeof raw === 'string' ? raw : raw.type);
    if (!t) continue;
    if (t === 'freeShot') {
      const ch = (typeof raw === 'object' && raw.charges != null) ? Math.max(1, Math.floor(raw.charges)) : FREE_SHOT_CHARGES_PER_ITEM;
      passiveCounts.freeShot += ch;
    } else if (t === 'fieldExtender') passiveCounts.fieldExtender++;
    else if (t === 'powerCell' || t === 'rangeModifier') passiveCounts.powerCell++;
    else if (['magnifier','liquifier','deflector','rotator'].includes(t)) {
      if (idx >= GOLFBAG_SIZE) continue;
      golfbag[idx++] = { type: t };
    }
  }
  selectedBagIndex = -1; selectedModifier = null; pendingRewardType = null;
  syncDerivedFromBag();
}
function addItemToBag(type, charges) {
  const t = normalizeSupplyType(type);
  if (!t) return false;
  if (t === 'freeShot') {
    const ch = charges != null ? Math.max(1, Math.floor(charges)) : FREE_SHOT_CHARGES_PER_ITEM;
    passiveCounts.freeShot += ch;
    syncDerivedFromBag();
    return true;
  }
  if (t === 'fieldExtender') { passiveCounts.fieldExtender++; syncDerivedFromBag(); return true; }
  if (t === 'powerCell' || t === 'rangeModifier') { passiveCounts.powerCell++; syncDerivedFromBag(); return true; }
  const empty = golfbagFirstEmpty();
  if (empty === -1) return false;
  if (['magnifier','liquifier','deflector','rotator'].includes(t)) {
    golfbag[empty] = { type: t };
  } else return false;
  syncDerivedFromBag();
  return true;
}
function removeBagSlot(idx) {
  if (idx < 0 || idx >= getEffectiveGolfbagSize() || !golfbag[idx]) return false;
  golfbag[idx] = null;
  if (selectedBagIndex === idx) { selectedBagIndex = -1; selectedModifier = null; }
  // If the removed item was the armed freeShot and no shots remain, disarm
  if (golfbagTotalFreeShots() <= 0 && isFreeShotActive) { isFreeShotActive = false; syncFreeShotGlow(); }
  syncDerivedFromBag();
  return true;
}
function consumeFreeShotCharge() {
  if ((passiveCounts.freeShot||0) <=0) { syncDerivedFromBag(); return false; }
  passiveCounts.freeShot = Math.max(0, passiveCounts.freeShot -1);
  syncDerivedFromBag();
  return true;
}
function selectBagSlot(idx) {
  if (idx < 0 || idx >= getEffectiveGolfbagSize()) return false;
  const e = golfbag[idx];
  if (!e) { selectedBagIndex = -1; selectedModifier = null; updateHotbarUI(); return true; }
  const t = bagEntryType(e);
  // Free Shot is fully passive/display-only: never selectable, never placeable.
  if (t === 'freeShot') { selectedBagIndex = -1; selectedModifier = null; updateHotbarUI(); return true; }
  if (selectedBagIndex === idx) { selectedBagIndex = -1; selectedModifier = null; }
  else { selectedBagIndex = idx; selectedModifier = t; }
  updateHotbarUI();
  return true;
}
// --- Pickup-discard mode (bag full + right-click pickup) ---
function isPickupDiscardActive() { return !!pendingPickup; }
function getPendingPickup() { return pendingPickup ? { ...pendingPickup } : null; }
function enterPickupDiscard(modifierRef) {
  if (!modifierRef || !modifierRef.type) return false;
  if (rewardMenuVisible || banterIsActive()) return false;
  pendingPickup = {
    type: normalizeSupplyType(modifierRef.type),
    modifierId: modifierRef.id ?? null,
    modifierIndex: Number.isInteger(modifierRef.index) ? modifierRef.index : -1,
  };
  // Clear any armed placement while choosing what to discard
  selectedBagIndex = -1; selectedModifier = null;
  updateHotbarUI();
  try { showToast('Bag full — click a bag item to discard, or click map / Esc to cancel'); } catch {}
  return true;
}
function cancelPickupDiscard() {
  if (!pendingPickup) return false;
  pendingPickup = null;
  updateHotbarUI();
  return true;
}
function discardBagSlotForPickup(slotIdx) {
  if (!pendingPickup) return false;
  if (slotIdx < 0 || slotIdx >= getEffectiveGolfbagSize() || !golfbag[slotIdx]) return false;
  const wanted = pendingPickup;
  // Find the targeted modifier on the board (by id first, then index, then type fallback)
  let midx = -1;
  if (wanted.modifierId !== null && wanted.modifierId !== undefined) {
    midx = modifiers.findIndex(m => m.id === wanted.modifierId);
  }
  if (midx === -1 && wanted.modifierIndex >= 0 && wanted.modifierIndex < modifiers.length) {
    const cand = modifiers[wanted.modifierIndex];
    if (cand && normalizeSupplyType(cand.type) === wanted.type) midx = wanted.modifierIndex;
  }
  if (midx === -1) {
    midx = modifiers.findIndex(m => normalizeSupplyType(m.type) === wanted.type);
  }
  if (midx === -1) { pendingPickup = null; updateHotbarUI(); return false; }
  // Discard the chosen bag item, then complete the pickup into the freed slot
  golfbag[slotIdx] = null;
  syncDerivedFromBag();
  const [removed] = modifiers.splice(midx, 1);
  if (removed && removed.type) addItemToBag(normalizeSupplyType(removed.type));
  else syncDerivedFromBag();
  pendingPickup = null;
  selectedBagIndex = -1; selectedModifier = null;
  syncModifiersToField();
  updateHotbarUI();
  saveProgress();
  return true;
}
let isFreeShotActive = false;
let freeShotFlightActive = false;
function isFreeShotActiveState() { return isFreeShotActive; }
function isFreeShotFlightActiveState() { return freeShotFlightActive; }
function canActivateFreeShot() { return golfbagTotalFreeShots() > 0; }
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
  // slot selection cleared when arming free shot (spatial mutually exclusive)
  selectedModifier = null; selectedBagIndex = -1;
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
  selectedModifier = null; selectedBagIndex = -1;
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
  if (!t) return false;
  // Passives can never be placed (stackable, no hotkey)
  if (t === 'freeShot' || t === 'fieldExtender' || t === 'powerCell' || t === 'areaUp' || t === 'rangeModifier') return false;
  if (!(t in supply)) return false;
  return (supply[t] ?? 0) > 0;
}

function getSupply() {
  // Return with legacy aliases for backward compat tests that check old keys
  return { ...supply, amplify: supply.magnifier, nullify: supply.liquifier, flip: supply.deflector, rotate: supply.rotator };
}

function addToSupply(type, n = 1) {
  // Tactical model: adding goes to the golfbag (one slot per item). n>1 fills multiple slots.
  const t = normalizeSupplyType(type);
  if (!t) return;
  const count = Math.max(1, Math.floor(n || 1));
  if (t === 'freeShot') {
    // Free Shot is special: one bag slot holds a counted item (default 3 charges).
    // addToSupply('freeShot', 3) legacy means one item with 3 charges.
    const charges = count === 1 ? FREE_SHOT_CHARGES_PER_ITEM : count;
    addItemToBag('freeShot', charges);
    updateHotbarUI();
    return;
  }
  if (t === 'fieldExtender' || t === 'areaUp' || t === 'powerCell') {
    for (let i = 0; i < count; i++) { if (!addItemToBag(t === 'areaUp' ? 'fieldExtender' : t)) break; }
    updateHotbarUI();
    return;
  }
  if (!(t in supply)) return;
  for (let i = 0; i < count; i++) { if (!addItemToBag(t)) break; }
  updateHotbarUI();
}

function resetSupply() {
  // No default item – bag should be empty until starting overlay picks (2026-09-21)
  setBagFromTypeList([]);
  clearFreeShotGlow();
  updateHotbarUI();
}

function consumePlacedModifiersFromSupply() {
  // Inventory model: supply already decremented on placement, win just clears modifiers without extra decrement or refund.
  // Kept for backward compat; no supply change.
  if (!modifiers || !modifiers.length) return;
  updateHotbarUI();
}

// --- Starting Items & Points helpers (10-progression.md 2026-09-21) ---
function syncProgressionDisplay(){
  try{
    const el=document.getElementById('progression-coins-display');
    if(el) el.classList.add('hidden');
  }catch{}
}
function isLoadoutVisible(){ return false; }
function getLoadoutSlots(){ return [...golfbag]; }
function getRunCoinsEarned(){ return runPointsEarned; }
function getRunHolesCleared(){ return runHolesCleared; }
function isCoinSummaryVisible(){ return coinSummaryVisible; }
function getUnlockedLoadoutSlots(){ return 4; }
function getTotalPoints(){ return totalPoints; }
function getPassiveCounts(){ return {...passiveCounts}; }

let startingItemsVisibleCache=false;
let selectedStartingItems=[];
function syncStartingItemsOverlay(){
  const overlay=document.getElementById('starting-items-overlay');
  if(!overlay) return;
  if(startingItemsVisible) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
  if(!startingItemsVisible) return;
  const grid=document.getElementById('starting-items-grid');
  if(!grid) return;
  grid.innerHTML='';
  const defs={magnifier:{label:'Magnifier',color:'#e67e22',icon:'./img/magnifier-icon.png',hint:'+1 to bag'},liquifier:{label:'Liquifier',color:'#3498db',icon:'./img/liquifier-icon.png',hint:'+1 to bag'},deflector:{label:'Deflector',color:'#9b59b6',icon:'./img/deflector-icon.png',hint:'+1 to bag'},rotator:{label:'Rotator',color:'#e74c3c',icon:'./img/rotator-icon.png',hint:'+1 to bag'}};
  startingChoices.forEach((type, idx)=>{
    const def=defs[type];
    if(!def) return;
    const btn=document.createElement('button');
    const isSelected = selectedStartingItems.includes(type);
    btn.className='reward-button' + (isSelected ? ' selected' : '');
    btn.dataset.type=type;
    btn.style.background=def.color===''+def.color ? `rgba(${def.color},0.28)` : def.color;
    if(def.icon){
      const img=document.createElement('img');
      img.className='reward-button-icon';
      img.src=def.icon; img.alt=type;
      btn.appendChild(img);
    }
    const lab=document.createElement('div'); lab.className='reward-button-label'; lab.textContent=def.label; btn.appendChild(lab);
    const hint=document.createElement('div'); hint.className='reward-button-hint'; hint.textContent=def.hint; btn.appendChild(hint);
    const key=document.createElement('div'); key.className='reward-button-key'; key.textContent='['+(idx+1)+']'; btn.appendChild(key);
    if(type==='magnifier') {btn.style.background='rgba(230,126,34,0.28)'; btn.style.borderColor='rgba(230,126,34,0.9)';}
    else if(type==='liquifier') {btn.style.background='rgba(52,152,219,0.28)'; btn.style.borderColor='rgba(52,152,219,0.9)';}
    else if(type==='deflector') {btn.style.background='rgba(155,89,182,0.28)'; btn.style.borderColor='rgba(155,89,182,0.9)';}
    else if(type==='rotator') {btn.style.background='rgba(231,76,60,0.28)'; btn.style.borderColor='rgba(231,76,60,0.9)';}
    if(isSelected){
      btn.style.outline='3px solid #fff';
      btn.style.outlineOffset='2px';
      btn.style.transform='scale(1.03)';
    }
    btn.addEventListener('click', ()=> handleStartingPick(type));
    grid.appendChild(btn);
  });
  const okBtn=document.getElementById('starting-ok-button');
  if(okBtn){
    const canOk = selectedStartingItems.length===2;
    okBtn.disabled = !canOk;
    okBtn.style.opacity = canOk ? '1' : '0.5';
    okBtn.style.cursor = canOk ? 'pointer' : 'not-allowed';
    if(!okBtn._startingOkBound){
      okBtn._startingOkBound=true;
      okBtn.addEventListener('click', (e)=>{ e.preventDefault(); handleStartingOk(); });
    }
  }
}
function showStartingItems(courseId, opts){
  if(hasRestorableSave()) return false;
  const course=findCourseById(courseId);
  if(!course) return false;
  // Start with empty bag – only the 2 picks should be present after OK
  golfbag = [null, null, null, null];
  passiveCounts = { fieldExtender:0, powerCell:0, freeShot:0 };
  try{ syncDerivedFromBag(); updateHotbarUI(); }catch{}
  startingCourseId=courseId;
  startingChoices=['magnifier','liquifier','deflector','rotator'];
  selectedStartingItems=[];
  startingRemaining=2;
  startingItemsVisible=true;
  // Load hole preview behind overlay
  try{
    setActiveCourse(course);
    currentHoleIndex=0;
    mainMenuVisible=false;
    mainMenuHover=null; courseMenuVisible=false; helpVisible=false; isInLevelPause=false;
    pauseMenuVisible=false; pauseMenuHover=null;
    gameState='AIMING';
    loadLevel(0);
    holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
    attemptsBannerVisible=false; attemptsBannerTimer=0;
    freeShotBannerVisible=false; freeShotBannerTimer=0;
    rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
    try{ syncRewardOverlay(); }catch{}
    try{ redrawBottom(); }catch{}
  }catch(e){ console.warn('showStartingItems preview failed',e); }
  syncStartingItemsOverlay();
  syncMainMenu();
  try{ loadoutOpenedAt=Date.now(); }catch{}
  try{ banterPreload(); }catch{}
  return true;
}
function hideStartingItems(){
  startingItemsVisible=false;
  startingCourseId=null;
  startingRemaining=0;
  startingChoices=[];
  selectedStartingItems=[];
  syncStartingItemsOverlay();
  // return to main menu without starting run
  try{
    mainMenuVisible=true;
    courseMenuVisible=false; helpVisible=false; isInLevelPause=false;
    pauseMenuVisible=false; pauseMenuHover=null;
    gameState='AIMING';
    holeBannerVisible=false; holeBannerTimer=0;
    attemptsBannerVisible=false; attemptsBannerTimer=0;
    freeShotBannerVisible=false; freeShotBannerTimer=0;
    rewardPending=false; rewardMenuVisible=false; rewardOffered=[];
    try{ syncRewardOverlay(); }catch{}
  }catch{}
  syncMainMenu();
  try{ redrawBottom(); }catch{}
}
function handleStartingPick(type){
  if(!startingItemsVisible) return false;
  const already = selectedStartingItems.indexOf(type);
  if(already!==-1){
    selectedStartingItems.splice(already,1);
    syncStartingItemsOverlay();
    return true;
  }
  if(selectedStartingItems.length>=2) return false;
  if(!startingChoices.includes(type)) return false;
  selectedStartingItems.push(type);
  syncStartingItemsOverlay();
  return true;
}
function handleStartingOk(){
  if(!startingItemsVisible) return false;
  if(selectedStartingItems.length!==2) return false;
  // Add selected items to bag
  for(const t of selectedStartingItems) addItemToBag(t);
  updateHotbarUI();
  const cid=startingCourseId;
  startingItemsVisible=false;
  selectedStartingItems=[];
  syncStartingItemsOverlay();
  startCourseWithStartingItems(cid);
  return true;
}

function playBanterThenShowStartingOverlay(courseId, opts){
  // Load level preview behind the scenes so banter plays over level (no HUD/menus)
  try{
    const course=findCourseById(courseId);
    if(course){
      golfbag = [null, null, null, null];
      passiveCounts = { fieldExtender:0, powerCell:0, freeShot:0 };
      try{ syncDerivedFromBag(); updateHotbarUI(); }catch{}
      setActiveCourse(course);
      currentHoleIndex=0;
      mainMenuVisible=false;
      mainMenuHover=null; courseMenuVisible=false; helpVisible=false; isInLevelPause=false;
      pauseMenuVisible=false; pauseMenuHover=null;
      gameState='AIMING';
      loadLevel(0);
      holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
      attemptsBannerVisible=false; attemptsBannerTimer=0;
      freeShotBannerVisible=false; freeShotBannerTimer=0;
      rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false;
      try{ syncRewardOverlay(); }catch{}
      try{ redrawBottom(); }catch{}
      syncMainMenu();
      try{ syncBanterSkipButton(); }catch{}
    }
  }catch(e){ console.warn('preview load before banter failed',e); }
  // Now play banter over the loaded level (HUD/hotbar hidden during banter)
  try{
    try{ banterPreload(); }catch{}
    banterPlayRunStart({ onComplete: () => { try{ syncBanterSkipButton(); }catch{} showStartingItems(courseId, opts); } }).then((ok)=>{
      try{ syncBanterSkipButton(); }catch{}
      if(!ok) showStartingItems(courseId, opts);
    }).catch(()=>{
      try{ syncBanterSkipButton(); }catch{}
      showStartingItems(courseId, opts);
    });
  }catch{
    showStartingItems(courseId, opts);
  }
}

function isStartingOverlayVisible(){ return !!startingItemsVisible; }
// Compat shims for old loadout names
let loadoutPickerVisible = false;
let loadoutPickerSlotIndex = -1;
function isLoadoutPickerVisible(){ return false; }
function getLoadoutPickerSlotIndex(){ return -1; }
function syncLoadoutPickerOverlay(){}
function showLoadoutPicker(){ return false; }
function hideLoadoutPicker(){}
function syncLoadoutOverlay(){ syncStartingItemsOverlay(); }
function addToLoadout(){}
function removeFromLoadout(){}
const VALID_LOADOUT_TYPES = ['magnifier','liquifier','deflector','rotator','fieldExtender','powerCell','freeShot'];
function showLoadout(courseId, opts){ return showStartingItems(courseId); }
function hideLoadout(){ return hideStartingItems(); }

function startCourseWithStartingItems(courseId){
  const course = findCourseById(courseId || startingCourseId);
  if (!course) return false;
  // golfbag already contains the 2 starting picks via handleStartingPick; keep it, just ensure at least those 2
  // If somehow empty (direct call), ensure at least 2 random? For now keep as is.
  setActiveCourse(course);
  try { incrementRunsStarted(); } catch {}
  clearProgress();
  // Tutorial run = loadout shown directly after the intro-3-hole chain for the 3-hole
  // course (shop hidden). Whole run gets liquifier-only single-card rewards, no re-roll.
  try {
    isTutorialRun = !!(loadoutHideShopDueToIntro && course && isTutorialCourse(course));
  } catch { isTutorialRun = !!loadoutHideShopDueToIntro; }
  currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
  totalPoints=0; runPointsEarned=0; runCoinsEarned=0;
  holeStartAttempts=0;
  modifiersTraversedThisHole = new Set();
  modifiersTraversedThisShot = new Set();
  // golfbag already set via handleStartingPick (2 spatial); keep it, just clear glow
  clearFreeShotGlow();
  maxAttempts=10;
  pendingRewardType=null;
  pendingPickup=null;
  rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false; rewardMenuHover=null; rewardRerollHover=false; rewardClaimedFor=null;
  rewardSeedCounter=0;
  holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
  attemptsBannerVisible=false; attemptsBannerTimer=0; attemptsBannerText=''; lastAttemptsBannerValue=null;
  freeShotBannerVisible=false; freeShotBannerTimer=0; freeShotBannerText='Free Shot!'; lastFreeShotBannerValue=null;
  pauseMenuVisible=false; pauseMenuHover=null; mainMenuVisible=false; mainMenuHover=null; courseMenuVisible=false; helpVisible=false; isInLevelPause=false;
  rewardChosenCounts={ magnifier:0, liquifier:0, deflector:0, rotator:0, freeShot:0, areaUp:0, fieldExtender:0, powerCell:0 };
  modifiers=[]; syncModifiersToField(); selectedModifier=null; selectedBagIndex=-1;
  runHolesCleared=0;
  try { loadoutUnlockedAtRunStart = getUnlockedLoadoutSlots(); } catch { loadoutUnlockedAtRunStart = 4; }
  runShopRestocked = false;
  runFirstCourseClear = false;
  runUnlockedNewCourse = false;
  deferredMenuReturn = false;
  startingItemsVisible=false; startingCourseId=null; startingRemaining=0; startingChoices=[];
  loadoutVisible=false; loadoutCourseId=null; loadoutSlots=[null,null,null,null];
  loadoutHideShopDueToIntro = false;
  coinSummaryVisible=false;
  loadLevel(0); gameState='AIMING';
  holeStartAttempts = 0;
  modifiersTraversedThisHole = new Set();
  // 12-banter: Hole 1 banner is deferred until the run-start banter has played.
  holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
  if (winOverlay) winOverlay.classList.add('hidden'); if (gameoverOverlay) gameoverOverlay.classList.add('hidden');
  syncPauseOverlay(); syncMainMenu(); syncLoadoutOverlay();
  updateAttemptsUI(); updateHotbarUI(); syncProgressionDisplay();
  saveProgress();
  // Start directly with Hole 1 banner (banter now plays before starting overlay, not here)
  try { showHoleBanner(currentHoleIndex, getTotalHoles()); } catch {}
  return true;
}
function startCourseWithLoadout(courseId, slots){ return startCourseWithStartingItems(courseId); }

function isTutorialCourseId(cid){ const c=findCourseById(cid); return isTutorialCourse(c); }

function startTutorialCourse(courseId){
  const course = findCourseById(courseId);
  if (!course || !isTutorialCourse(course)) return false;
  setActiveCourse(course);
  try { incrementRunsStarted(); } catch {}
  clearProgress();
  isTutorialRun = false;
  currentHoleIndex=0; holeAttempts=0; totalAttempts=0; attempts=0;
  totalPoints=0; runPointsEarned=0; runCoinsEarned=0;
  holeStartAttempts=0;
  modifiersTraversedThisHole = new Set();
  modifiersTraversedThisShot = new Set();
  // Start with exactly one liquifier
  setBagFromTypeList(['liquifier']);
  clearFreeShotGlow();
  maxAttempts=10;
  pendingRewardType=null; pendingPickup=null;
  rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; rewardRerolled=false; rewardMenuHover=null; rewardRerollHover=false; rewardClaimedFor=null;
  rewardSeedCounter=0;
  holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
  attemptsBannerVisible=false; attemptsBannerTimer=0; attemptsBannerText=''; lastAttemptsBannerValue=null;
  freeShotBannerVisible=false; freeShotBannerTimer=0; freeShotBannerText='Free Shot!'; lastFreeShotBannerValue=null;
  pauseMenuVisible=false; pauseMenuHover=null; mainMenuVisible=false; mainMenuHover=null; courseMenuVisible=false; helpVisible=false; isInLevelPause=false;
  rewardChosenCounts={ magnifier:0, liquifier:0, deflector:0, rotator:0, freeShot:0, areaUp:0, fieldExtender:0, powerCell:0 };
  modifiers=[]; syncModifiersToField(); selectedModifier=null; selectedBagIndex=-1;
  runHolesCleared=0;
  try { loadoutUnlockedAtRunStart = getUnlockedLoadoutSlots(); } catch { loadoutUnlockedAtRunStart = 4; }
  runShopRestocked = false; runFirstCourseClear = false; runUnlockedNewCourse = false;
  deferredMenuReturn = false;
  startingItemsVisible=false; startingCourseId=null; startingRemaining=0; startingChoices=[];
  loadoutVisible=false; loadoutCourseId=null; loadoutSlots=[null,null,null,null];
  loadoutHideShopDueToIntro = false;
  coinSummaryVisible=false;
  tutorialLiquifierReminderShown=false;
  tutorialHole1Liquifier3Shown=false;
  tutorialHole1Liquifier10Shown=false;
  tutorialHole3RotatorShown=false;
  tutorialHole2RotatorShown=false;
  tutorialHole2GadgetsReminderShown=false;
  tutorialHole3RewardBanterShown=false;
  loadLevel(0); gameState='AIMING';
  holeStartAttempts = 0;
  modifiersTraversedThisHole = new Set();
  holeBannerVisible=false; holeBannerTimer=0; holeBannerText='';
  if (winOverlay) winOverlay.classList.add('hidden'); if (gameoverOverlay) gameoverOverlay.classList.add('hidden');
  syncPauseOverlay(); syncMainMenu(); syncLoadoutOverlay();
  updateAttemptsUI(); updateHotbarUI(); syncProgressionDisplay();
  saveProgress();
  // Now play controls-first banter over the loaded hole, then show Hole 1 banner
  (async ()=>{
    try { await banterLoadFile(); } catch {}
    const ok = banterPlay('controls-first', { onComplete: ()=>{
      try{ syncBanterSkipButton(); }catch{}
      try{ showHoleBanner(currentHoleIndex, getTotalHoles()); }catch{}
    }});
    if(!ok){
      try{ showHoleBanner(currentHoleIndex, getTotalHoles()); }catch{}
    }
    try{ syncBanterSkipButton(); }catch{}
  })();
  return true;
}

function grantTutorialHole2Modifiers(){
  // Exactly deflector, rotator, magnifier regardless of previous bag
  setBagFromTypeList(['deflector','rotator','magnifier']);
  updateHotbarUI();
  saveProgress();
}
function grantTutorialHole3EmptyBag(){
  setBagFromTypeList([]);
  // ensure passives cleared? Keep passives 0 for hole3 (empty bag, no passive)
  passiveCounts = { fieldExtender:0, powerCell:0, freeShot:0 };
  try{ syncDerivedFromBag(); }catch{}
  updateHotbarUI();
  saveProgress();
}
function grantTutorialHole4Spatial(){
  // Start hole4 with one liquifier, one deflector, one rotator and one magnifier (4 spatial), no passives yet
  setBagFromTypeList(['liquifier','deflector','rotator','magnifier']);
  updateHotbarUI();
  saveProgress();
}
function grantTutorialHole4Passives(){
  // Legacy: One field extender + one power cell, spatial empty — kept for compat but hole4 now starts spatial
  golfbag = [null,null,null,null];
  passiveCounts = { fieldExtender:1, powerCell:1, freeShot:0 };
  try{ syncDerivedFromBag(); }catch{}
  updateHotbarUI();
  saveProgress();
}
function showTutorialHole4PassiveReward(){
  // Show reward menu with fieldExtender, powerCell, freeShot after hole4 banter
  tutorialHole4StartRewardPending = true;
  rewardOffered = ['fieldExtender','powerCell','freeShot'];
  pendingRewardType = null;
  pendingPickup = null;
  rewardMenuVisible = true;
  rewardMenuHover = null;
  rewardPending = false;
  rewardRerolled = false;
  rewardRerollHover = false;
  updateHotbarUI();
  syncRewardOverlay();
  saveProgress();
}

function maybeShowTutorialLiquifierReminder(){
  // Legacy single reminder deprecated — now split into 3 and 10 attempt triggers
  return false;
}
let tutorialHole1Liquifier3Shown = false;
let tutorialHole1Liquifier10Shown = false;
let tutorialHole3RotatorShown = false;
let tutorialHole2RotatorShown = false;
let tutorialHole2GadgetsReminderShown = false;
let tutorialHole4StartRewardPending = false;
function maybeShowTutorialHole1LiquifierReminder(){
  if(!isTutorialActive()) return false;
  if(currentHoleIndex!==0) return false;
  if(banterIsActive() || cutsceneIsActive() || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || pauseMenuVisible || mainMenuVisible || coinSummaryVisible) return false;
  if(gameState!=="AIMING" && gameState!=="CHARGING") return false;
  if(!tutorialHole1Liquifier3Shown && holeAttempts >=3){
    tutorialHole1Liquifier3Shown = true;
    try{ banterPlay('tutorial-hole1-liquifier-3', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} saveProgress(); } }); }catch{ return false; }
    try{ syncBanterSkipButton(); }catch{}
    return true;
  }
  if(!tutorialHole1Liquifier10Shown && holeAttempts >=10){
    tutorialHole1Liquifier10Shown = true;
    try{ banterPlay('tutorial-hole1-liquifier-10', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} saveProgress(); } }); }catch{ return false; }
    try{ syncBanterSkipButton(); }catch{}
    return true;
  }
  return false;
}
function maybeShowTutorialHole3RotatorReminder(){
  // Legacy hole3 rotator reminder moved to hole2 — keep for compat but never trigger on hole3
  return false;
}
function maybeShowTutorialHole2RotatorReminder(){
  if(!isTutorialActive()) return false;
  if(currentHoleIndex!==1) return false;
  if(holeAttempts <3) return false;
  if(tutorialHole2RotatorShown) return false;
  if(banterIsActive() || cutsceneIsActive() || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || pauseMenuVisible || mainMenuVisible || coinSummaryVisible) return false;
  if(gameState!=="AIMING" && gameState!=="CHARGING") return false;
  tutorialHole2RotatorShown = true;
  try{ banterPlay('tutorial-hole3-rotator-reminder', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} saveProgress(); } }); }catch{ return false; }
  try{ syncBanterSkipButton(); }catch{}
  return true;
}
function maybeShowTutorialHole2GadgetsReminder(){
  if(!isTutorialActive()) return false;
  if(currentHoleIndex!==1) return false;
  if(holeAttempts <5) return false;
  if(tutorialHole2GadgetsReminderShown) return false;
  if(banterIsActive() || cutsceneIsActive() || rewardMenuVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || pauseMenuVisible || mainMenuVisible || coinSummaryVisible) return false;
  if(gameState!=="AIMING" && gameState!=="CHARGING") return false;
  tutorialHole2GadgetsReminderShown=true;
  try{ banterPlay('tutorial-hole2-gadgets-reminder', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} saveProgress(); } }); }catch{ return false; }
  try{ syncBanterSkipButton(); }catch{}
  return true;
}

function handleTutorialHole1To2Chain(){
  const needCutscene = (()=>{ try{ return !cutsceneHasSeen('first-restock'); }catch{ return true; }})();
  const prepareHole2ThenBanter = ()=>{
    try{
      // Load Hole 2 now (after cutscene, before banter, so no glimpse before cutscene)
      loadLevel(1);
      // suppress auto Hole banner — will show after banter
      holeBannerVisible=false; holeBannerTimer=0;
      // bag grant before banter (so banter sees correct bag)
      grantTutorialHole2Modifiers();
      holeBannerVisible=false; holeBannerTimer=0;
      gameState='AIMING';
      if(typeof winOverlay!=='undefined' && winOverlay) winOverlay.classList.add('hidden');
      updateAttemptsUI(); updateHotbarUI();
      saveProgress();
      try{ syncMainMenu(); }catch{}
      try{ redrawBottom(); }catch{}
    }catch(e){ console.warn('prepareHole2 failed',e); }
  };
  const startStackingBanter = ()=>{
    (async()=>{
      try{ await banterLoadFile(); }catch{}
      // Try new id first, fallback to legacy stacking-third
      let ok = banterPlay('tutorial-field-modifiers', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} try{ showHoleBanner(1, getTotalHoles()); }catch{} saveProgress(); }});
      if(!ok) ok = banterPlay('stacking-third', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} try{ showHoleBanner(1, getTotalHoles()); }catch{} saveProgress(); }});
      if(!ok) try{ showHoleBanner(1, getTotalHoles()); }catch{}
      try{ syncBanterSkipButton(); }catch{}
    })();
  };
  if (needCutscene && !cutsceneIsActive()) {
    // Keep aim hidden while the cutscene loads: ball is still sitting in
    // hole 1 and gameState must not be AIMING yet (drawAim only renders in
    // AIMING/CHARGING, so AIMING here would draw the orbit around the ball
    // inside the hole). prepareHole2ThenBanter sets AIMING after loadLevel(1).
    gameState = 'WIN';
    // Hide HUD etc for cutscene immediately
    try{
      const el=document.getElementById('main-menu-overlay');
      if(el) el.classList.add('hidden');
      const hud=document.getElementById('hud');
      if(hud) hud.classList.add('hidden');
    }catch{}
    try{ syncMainMenu(); }catch{}
    try{ redrawBottom(); }catch{}
    cutsceneLoad('first-restock').then(data=>{
      if(!data){
        try{ cutsceneMarkSeen('first-restock'); }catch{}
        prepareHole2ThenBanter();
        startStackingBanter();
        return;
      }
      const ok = playCutsceneWrapped(data, {onComplete:()=>{
         try{ cutsceneMarkSeen('first-restock'); }catch{}
         prepareHole2ThenBanter();
         startStackingBanter();
      }});
      if(!ok){
        try{ cutsceneMarkSeen('first-restock'); }catch{}
        prepareHole2ThenBanter();
        startStackingBanter();
      }
      try{ syncMainMenu(); }catch{}
      try{ redrawBottom(); }catch{}
    }).catch(()=>{
      prepareHole2ThenBanter();
      startStackingBanter();
    });
  } else {
    prepareHole2ThenBanter();
    startStackingBanter();
  }
}
function clearCoinSummaryAnimTimers() {
  for (const id of coinSummaryAnimTimers) try { clearTimeout(id); } catch {}
  coinSummaryAnimTimers = [];
}
function isCoinSummaryAnimating() {
  return coinSummaryVisible && !coinSummaryAnimDone;
}
function fastForwardCoinSummary() {
  if (!coinSummaryVisible) return false;
  clearCoinSummaryAnimTimers();
  // Per-hole points summary (pendingHoleAdvance) has priority - show p/points, not coins
  if (pendingHoleAdvance || (coinSummaryHoles >=0 && coinSummaryAttempts >=0 && document.getElementById('coin-summary-amount')?.textContent.includes('points'))){
    const amt=document.getElementById('coin-summary-amount');
    const details=document.getElementById('coin-summary-details');
    const traversed=coinSummaryHoles; const attemptsOnHole=coinSummaryAttempts; const holePoints=coinSummaryCoins;
    const firstBonus = (attemptsOnHole===0 && traversed>=0) ? 50 : 0; // approximate; for already computed holePoints we can infer: holePoints = traversed*10+firstBonus
    // But we stored holePoints without attempts, so firstBonus = holePoints - traversed*10
    const inferredFirst = Math.max(0, holePoints - traversed*10);
    const net = holePoints - attemptsOnHole;
    if(amt) amt.textContent='+'+net+' points';
    if(details){
      details.innerHTML='';
      const makeRow=(a,l)=>{ const r=document.createElement('div'); r.className='coin-detail-row'; r.textContent=a+' - '+l; return r; };
      details.appendChild(makeRow('10p','cleared hole'));
      details.appendChild(makeRow((traversed*10)+'p','Modifier Bonus (x'+traversed+')'));
      if(inferredFirst>0) details.appendChild(makeRow(inferredFirst+'p','First Try Bonus'));
      // Course bonus if present (infer from holePoints vs traversed/first)
      const inferredCourse = Math.max(0, holePoints - 10 - traversed*10 - inferredFirst);
      if(inferredCourse>0) details.appendChild(makeRow(inferredCourse+'p','course completed'));
      const attLabel = attemptsOnHole===3 ? 'three attempts' : (attemptsOnHole>0? `Attempts (x${attemptsOnHole})` : 'Attempts (x0)');
      details.appendChild(makeRow((attemptsOnHole>0? '-'+attemptsOnHole+'p':'0p'), attLabel));
    }
    const unlockEl=document.getElementById('coin-summary-unlock'); if(unlockEl){ unlockEl.classList.add('hidden'); unlockEl.textContent=''; unlockEl.style.display='none'; }
    const shopEl=document.getElementById('coin-summary-shop'); if(shopEl){ shopEl.classList.add('hidden'); shopEl.textContent=''; shopEl.style.display='none'; }
    const courseEl=document.getElementById('coin-summary-course'); if(courseEl){ courseEl.classList.add('hidden'); courseEl.textContent=''; courseEl.style.display='none'; }
    coinSummaryAnimDone=true;
    syncProgressionDisplay();
    try{ syncMainMenu(); }catch{}
    return true;
  }
  const isCourseBonus = coinSummaryHoles > 0 && coinSummaryCoins === coinSummaryHoles * COINS_PER_HOLE + coinSummaryAttempts * COINS_PER_ATTEMPT + COURSE_COMPLETE_BONUS;
  // Show final state instantly
  const el = document.getElementById('coin-summary-overlay');
  if (el) el.classList.remove('hidden');
  const amt = document.getElementById('coin-summary-amount');
  if (amt) amt.textContent = `+${coinSummaryCoins}`;
  const details = document.getElementById('coin-summary-details');
  if (details) {
    details.innerHTML = '';
    const makeRow = (amount, label) => {
      const r = document.createElement('div');
      r.className = 'coin-detail-row';
      r.style.animation = 'none';
      r.style.opacity = '1';
      r.style.transform = 'none';
      const a = document.createElement('span');
      a.className = 'coin-amount';
      a.textContent = String(amount);
      const ic = document.createElement('span');
      ic.className = 'coin-icon';
      ic.textContent = '💰';
      const lb = document.createElement('span');
      lb.className = 'coin-label';
      lb.textContent = ` - ${label}`;
      r.append(a, ic, lb);
      return r;
    };
    if (coinSummaryHoles > 0) details.appendChild(makeRow(coinSummaryHoles * COINS_PER_HOLE, `Hole Completed (x${coinSummaryHoles})`));
    else details.appendChild(makeRow(0, `Hole Completed (x0)`));
    if (coinSummaryAttempts > 0) details.appendChild(makeRow(coinSummaryAttempts * COINS_PER_ATTEMPT, `Attempt (x${coinSummaryAttempts})`));
    if (isCourseBonus) details.appendChild(makeRow(COURSE_COMPLETE_BONUS, `Course Completed`));
  }
  const unlockEl = document.getElementById('coin-summary-unlock');
  const shopEl = document.getElementById('coin-summary-shop');
  const courseEl = document.getElementById('coin-summary-course');
  syncCoinSummaryNotices(unlockEl, shopEl, courseEl, false);
  coinSummaryAnimDone = true;
  syncProgressionDisplay();
  try { syncMainMenu(); } catch {}
  return true;
}
function animateCoinSummaryAmount(from, to, duration = 320) {
  const amt = document.getElementById('coin-summary-amount');
  if (!amt) return;
  if (from === to) { amt.textContent = `+${to}`; return; }
  const start = performance.now();
  const step = (now) => {
    const elapsed = now - start;
    const p = Math.min(1, elapsed / duration);
    // easeOut
    const eased = 1 - Math.pow(1 - p, 3);
    const cur = Math.round(from + (to - from) * eased);
    amt.textContent = `+${cur}`;
    if (p < 1 && isCoinSummaryAnimating() && coinSummaryVisible) {
      requestAnimationFrame(step);
    } else {
      amt.textContent = `+${to}`;
    }
  };
  requestAnimationFrame(step);
}
// End-screen notice lines (10-progression.md §4): loadout-slot unlock, shop
// restock and new-course unlock. animate=true fades them in for the animated
// sequence; false shows final.
function isLoadoutSlotUnlockedThisRun() {
  try {
    return getUnlockedLoadoutSlots() > (loadoutUnlockedAtRunStart ?? 1);
  } catch { return false; }
}
function syncCoinSummaryNotices(unlockEl, shopEl, courseEl, animate) {
  const showUnlock = isLoadoutSlotUnlockedThisRun();
  const showShop = isShopRestockedThisRun();
  const showCourse = isNewCourseUnlockedThisRun();
  const showLine = (elm, text, show) => {
    if (!elm) return;
    elm.textContent = text;
    if (show) {
      elm.style.display = 'block';
      elm.classList.remove('hidden');
      if (animate) {
        elm.style.opacity = '0';
        elm.style.transition = 'opacity 0.24s ease';
        requestAnimationFrame(() => { elm.style.opacity = '1'; });
      } else {
        elm.style.opacity = '1';
      }
    } else {
      elm.style.display = 'none';
    }
  };
  showLine(unlockEl, 'Loadout slot unlocked', showUnlock);
  showLine(shopEl, 'New items in the shop', showShop);
  showLine(courseEl, 'New Course Unlocked', showCourse);
}
function syncCoinSummaryOverlay() {
  const el = document.getElementById('coin-summary-overlay');
  if (!el) return;
  if (coinSummaryVisible) {
    el.classList.remove('hidden');
    // Per-hole points overlay (pendingHoleAdvance) - keep existing DOM as built by showPerHoleSummary
    if (pendingHoleAdvance) { return; }
    const txt = document.getElementById('coin-summary-text');
    const br = document.getElementById('coin-summary-breakdown');
    const amt = document.getElementById('coin-summary-amount');
    const details = document.getElementById('coin-summary-details');
    const unlockEl = document.getElementById('coin-summary-unlock');
    const shopEl = document.getElementById('coin-summary-shop');
    const courseEl = document.getElementById('coin-summary-course');
    // Keep legacy elements hidden — do not show You earned / cleared texts per new spec
    if (txt) { txt.textContent = `You earned ${coinSummaryCoins} coins: ${coinSummaryHoles} holes × ${COINS_PER_HOLE} coins per hole`; txt.classList.add('hidden'); }
    if (br) { br.textContent = coinSummaryHoles>0 ? `${coinSummaryHoles} hole${coinSummaryHoles===1?'':'s'} cleared — ${COINS_PER_HOLE} per hole` : 'No holes cleared — 0 coins'; br.classList.add('hidden'); }
    // If animated, details/amount are managed by showCoinSummary animation; but if animDone or no animation, render final instantly
    if (coinSummaryAnimDone) {
      if (amt) amt.textContent = `+${coinSummaryCoins}`;
      if (details) {
        details.innerHTML = '';
        const makeRow = (amount, label) => {
          const r = document.createElement('div');
          r.className = 'coin-detail-row';
          const a = document.createElement('span');
          a.className = 'coin-amount';
          a.textContent = String(amount);
          const ic = document.createElement('span');
          ic.className = 'coin-icon';
          ic.textContent = '💰';
          const lb = document.createElement('span');
          lb.className = 'coin-label';
          lb.textContent = ` - ${label}`;
          r.append(a, ic, lb);
          return r;
        };
        if (coinSummaryHoles > 0) details.appendChild(makeRow(coinSummaryHoles * COINS_PER_HOLE, `Hole Completed (x${coinSummaryHoles})`));
        else details.appendChild(makeRow(0, `Hole Completed (x0)`));
        if (coinSummaryAttempts > 0) details.appendChild(makeRow(coinSummaryAttempts * COINS_PER_ATTEMPT, `Attempt (x${coinSummaryAttempts})`));
        const isCourseBonus = coinSummaryHoles > 0 && coinSummaryCoins === coinSummaryHoles * COINS_PER_HOLE + coinSummaryAttempts * COINS_PER_ATTEMPT + COURSE_COMPLETE_BONUS;
        if (isCourseBonus) details.appendChild(makeRow(COURSE_COMPLETE_BONUS, `Course Completed`));
      }
      syncCoinSummaryNotices(unlockEl, shopEl, document.getElementById('coin-summary-course'), false);
    } else if (!isCoinSummaryAnimating()) {
      // Initial render before animation starts: show final instantly if not animating path
      // This fallback keeps old behaviour for non-animated calls
      if (amt) amt.textContent = `+${coinSummaryCoins}`;
      if (details) {
        details.innerHTML = '';
        const makeRow = (amount, label) => {
          const r = document.createElement('div');
          r.className = 'coin-detail-row';
          const a = document.createElement('span');
          a.className = 'coin-amount';
          a.textContent = String(amount);
          const ic = document.createElement('span');
          ic.className = 'coin-icon';
          ic.textContent = '💰';
          const lb = document.createElement('span');
          lb.className = 'coin-label';
          lb.textContent = ` - ${label}`;
          r.append(a, ic, lb);
          return r;
        };
        if (coinSummaryHoles > 0) details.appendChild(makeRow(coinSummaryHoles * COINS_PER_HOLE, `Hole Completed (x${coinSummaryHoles})`));
        else details.appendChild(makeRow(0, `Hole Completed (x0)`));
        if (coinSummaryAttempts > 0) details.appendChild(makeRow(coinSummaryAttempts * COINS_PER_ATTEMPT, `Attempt (x${coinSummaryAttempts})`));
        const isCourseBonus = coinSummaryHoles > 0 && coinSummaryCoins === coinSummaryHoles * COINS_PER_HOLE + coinSummaryAttempts * COINS_PER_ATTEMPT + COURSE_COMPLETE_BONUS;
        if (isCourseBonus) details.appendChild(makeRow(COURSE_COMPLETE_BONUS, `Course Completed`));
      }
      syncCoinSummaryNotices(unlockEl, shopEl, document.getElementById('coin-summary-course'), false);
      coinSummaryAnimDone = true;
    }
  } else el.classList.add('hidden');
}
function showPerHoleSummary(traversed, attemptsOnHole, firstBonus, holePoints, courseBonus=0){
  if (isTutorialActive()) return;
  // New per-hole points summary (10-progression 2026-09-21)
  coinSummaryHoles = traversed;
  coinSummaryAttempts = attemptsOnHole;
  // reuse coinSummaryCoins to store holePoints for compat
  coinSummaryCoins = holePoints;
  coinSummaryVisible = true;
  coinSummaryAnimDone = false;
  clearCoinSummaryAnimTimers();
  const el=document.getElementById('coin-summary-overlay');
  if(el){ el.classList.remove('hidden'); const h3=el.querySelector('h3'); if(h3) h3.textContent='Hole Complete'; }
  const netHolePoints = holePoints;
  const amt=document.getElementById('coin-summary-amount');
  const details=document.getElementById('coin-summary-details');
  if(amt) amt.textContent='+'+netHolePoints+' points';
  if(details){
    details.innerHTML='';
    const makeRow=(amtStr,label)=>{
      const r=document.createElement('div'); r.className='coin-detail-row'; r.style.opacity='1';
      r.textContent=amtStr+' - '+label;
      return r;
    };
    // Base cleared hole bonus 10p
    details.appendChild(makeRow('10p','cleared hole'));
    if(traversed>0) details.appendChild(makeRow((traversed*10)+'p','Modifier Bonus (x'+traversed+')'));
    if(firstBonus>0) details.appendChild(makeRow(firstBonus+'p','First Try Bonus'));
    if(courseBonus>0) details.appendChild(makeRow(courseBonus+'p','course completed'));
    // Attempts row with -N p and three attempts wording
    if(attemptsOnHole>0) {
      const label = attemptsOnHole===3 ? 'three attempts' : (attemptsOnHole===1 ? 'one attempt' : `Attempts (x${attemptsOnHole})`);
      details.appendChild(makeRow('-'+attemptsOnHole+'p', label));
    } else {
      details.appendChild(makeRow('0p','Attempts (x0)'));
    }
  }
  // hide legacy notices
  const unlockEl=document.getElementById('coin-summary-unlock'); if(unlockEl){ unlockEl.classList.add('hidden'); unlockEl.textContent=''; unlockEl.style.display='none'; }
  const shopEl=document.getElementById('coin-summary-shop'); if(shopEl){ shopEl.classList.add('hidden'); shopEl.textContent=''; shopEl.style.display='none'; }
  const courseEl=document.getElementById('coin-summary-course'); if(courseEl){ courseEl.classList.add('hidden'); courseEl.textContent=''; courseEl.style.display='none'; }
  syncProgressionDisplay();
  try{ syncMainMenu(); }catch{}
  // auto fast-forward flag
  setTimeout(()=>{ coinSummaryAnimDone=true; }, 600);
}
function showCoinSummary(holes, attemptsOrCoins, coins) {
  // Supports both showCoinSummary(holes, coins) legacy and showCoinSummary(holes, attempts, coins)
  let attempts = 0;
  let totalCoins = 0;
  if (coins !== undefined) {
    // 3-arg form: holes, attempts, coins
    attempts = Math.max(0, Math.floor(attemptsOrCoins||0));
    totalCoins = Math.max(0, Math.floor(coins||0));
  } else {
    // legacy 2-arg: holes, coins — infer attempts from difference if possible
    totalCoins = Math.max(0, Math.floor(attemptsOrCoins||0));
    const inferred = totalCoins - Math.max(0, Math.floor(holes||0)) * COINS_PER_HOLE;
    // if inferred looks like course bonus, subtract it
    const hasBonus = holes > 0 && inferred >= COURSE_COMPLETE_BONUS && totalCoins === holes * COINS_PER_HOLE + COURSE_COMPLETE_BONUS;
    attempts = hasBonus ? 0 : Math.max(0, inferred >0 && inferred < 100 ? inferred : 0);
    if (hasBonus) attempts = 0;
  }
  coinSummaryHoles = Math.max(0, Math.floor(holes||0));
  coinSummaryAttempts = attempts;
  coinSummaryCoins = totalCoins;
  // Do not show overlay if no money was gained
  if (coinSummaryCoins <= 0) {
    coinSummaryVisible = false;
    coinSummaryAnimDone = false;
    clearCoinSummaryAnimTimers();
    syncCoinSummaryOverlay();
    syncProgressionDisplay();
    try { syncMainMenu(); } catch {}
    return;
  }
  coinSummaryVisible = true;
  coinSummaryAnimDone = false;
  clearCoinSummaryAnimTimers();
  const isCourseBonus = coinSummaryHoles > 0 && coinSummaryCoins === coinSummaryHoles * COINS_PER_HOLE + coinSummaryAttempts * COINS_PER_ATTEMPT + COURSE_COMPLETE_BONUS;
  const holeCoins = coinSummaryHoles * COINS_PER_HOLE;
  const attemptCoins = coinSummaryAttempts * COINS_PER_ATTEMPT;
  // Prepare overlay in initial animated state
  const el = document.getElementById('coin-summary-overlay');
  if (el) el.classList.remove('hidden');
  const txt = document.getElementById('coin-summary-text');
  const br = document.getElementById('coin-summary-breakdown');
  if (txt) { txt.textContent = `You earned ${coinSummaryCoins} coins: ${coinSummaryHoles} holes × ${COINS_PER_HOLE} coins per hole`; txt.classList.add('hidden'); }
  if (br) { br.textContent = coinSummaryHoles>0 ? `${coinSummaryHoles} hole${coinSummaryHoles===1?'':'s'} cleared — ${COINS_PER_HOLE} per hole` : 'No holes cleared — 0 coins'; br.classList.add('hidden'); }
  const amt = document.getElementById('coin-summary-amount');
  const details = document.getElementById('coin-summary-details');
  const unlockEl = document.getElementById('coin-summary-unlock');
  const shopEl = document.getElementById('coin-summary-shop');
  const courseEl = document.getElementById('coin-summary-course');
  if (amt) amt.textContent = `+0`;
  if (details) details.innerHTML = '';
  if (unlockEl) { unlockEl.textContent = `Loadout slot unlocked`; unlockEl.style.display = 'none'; unlockEl.style.opacity = '0'; }
  if (shopEl) { shopEl.textContent = `New items in the shop`; shopEl.style.display = 'none'; shopEl.style.opacity = '0'; }
  if (courseEl) { courseEl.textContent = `New Course Unlocked`; courseEl.style.display = 'none'; courseEl.style.opacity = '0'; }
  syncProgressionDisplay();
  try { syncMainMenu(); } catch {}

  // Schedule animated steps: hole row -> course row -> unlock
  const makeRow = (amount, label) => {
    const r = document.createElement('div');
    r.className = 'coin-detail-row';
    const a = document.createElement('span');
    a.className = 'coin-amount';
    a.textContent = String(amount);
    const ic = document.createElement('span');
    ic.className = 'coin-icon';
    ic.textContent = '💰';
    const lb = document.createElement('span');
    lb.className = 'coin-label';
    lb.textContent = ` - ${label}`;
    r.append(a, ic, lb);
    return r;
  };
  // Step 1: hole completed row + amount to holeCoins
  const t1 = setTimeout(() => {
    if (!coinSummaryVisible || coinSummaryAnimDone) return;
    if (details) {
      if (coinSummaryHoles > 0) details.appendChild(makeRow(coinSummaryHoles * COINS_PER_HOLE, `Hole Completed (x${coinSummaryHoles})`));
      else details.appendChild(makeRow(0, `Hole Completed (x0)`));
    }
    animateCoinSummaryAmount(0, holeCoins, 380);
  }, 420);
  coinSummaryAnimTimers.push(t1);
  const attemptDelay = 820;
  const hasAttempts = coinSummaryAttempts > 0;
  if (hasAttempts) {
    const t1b = setTimeout(() => {
      if (!coinSummaryVisible || coinSummaryAnimDone) return;
      if (details) details.appendChild(makeRow(attemptCoins, `Attempt (x${coinSummaryAttempts})`));
      animateCoinSummaryAmount(holeCoins, holeCoins + attemptCoins, 380);
    }, attemptDelay);
    coinSummaryAnimTimers.push(t1b);
  }
  if (isCourseBonus) {
    const courseDelay = hasAttempts ? 1220 : 920;
    const fromAmt = holeCoins + attemptCoins;
    const t2 = setTimeout(() => {
      if (!coinSummaryVisible || coinSummaryAnimDone) return;
      if (details) details.appendChild(makeRow(COURSE_COMPLETE_BONUS, `Course Completed`));
      animateCoinSummaryAmount(fromAmt, coinSummaryCoins, 380);
    }, courseDelay);
    coinSummaryAnimTimers.push(t2);
    const noticeDelayCourse = hasAttempts ? 1620 : 1320;
    const t3 = setTimeout(() => {
      if (!coinSummaryVisible || coinSummaryAnimDone) return;
      syncCoinSummaryNotices(unlockEl, shopEl, document.getElementById('coin-summary-course'), true);
      coinSummaryAnimDone = true;
    }, noticeDelayCourse);
    coinSummaryAnimTimers.push(t3);
  } else {
    const noticeDelay = hasAttempts ? 1120 : 780;
    const t2b = setTimeout(() => {
      if (!coinSummaryVisible || coinSummaryAnimDone) return;
      syncCoinSummaryNotices(unlockEl, shopEl, document.getElementById('coin-summary-course'), true);
      coinSummaryAnimDone = true;
    }, noticeDelay);
    coinSummaryAnimTimers.push(t2b);
  }
}
function hideCoinSummary() {
  clearCoinSummaryAnimTimers();
  coinSummaryAnimDone = false;
  coinSummaryVisible=false;
  syncCoinSummaryOverlay();
  syncProgressionDisplay();
  if (pendingCourseComplete) {
    pendingCourseComplete=false;
    pendingHoleAdvance=false;
    // Course completed – go to main menu (no Run Completed overlay, just Hole Completed already shown).
    // 11-cutscenes §11d: first 9-hole clear plays end-9-hole here, after the
    // Hole Complete summary is dismissed and before returning to the menu.
    // (This is the normal course-complete path — the Continue/R exits funnel
    // through returnToMainMenu(), but they are hidden on final holes, so the
    // cutscene check must also live here or it never fires.)
    if (isEnd9HoleCutsceneDue()) { try { playEnd9HoleThenReturn(); } catch { try { finishReturnToMainMenu(); } catch {} } return; }
    try{ finishReturnToMainMenu(); }catch{ try{ clearProgress(); mainMenuVisible=true; syncMainMenu(); }catch{} }
    return;
  }
  if (pendingHoleAdvance) {
    const wasTut = isTutorialActive();
    const prevIdx = currentHoleIndex;
    pendingHoleAdvance=false;
    if (wasTut && prevIdx === 0) {
      // 13-tutorial: hole1 -> hole2 — cutscene BEFORE Hole2 is drawn (no glimpse)
      try{
        try{ consumePlacedModifiersFromSupply(); }catch{}
        clearFreeShotGlow();
        currentHoleIndex = 1;
        holeAttempts=0;
        holeStartAttempts=0;
        modifiersTraversedThisHole = new Set();
        tutorialLiquifierReminderShown = true;
        tutorialHole1Liquifier3Shown = true;
        tutorialHole1Liquifier10Shown = true;
        tutorialHole2RotatorShown = false;
        tutorialHole2GadgetsReminderShown = false;
        tutorialHole3RotatorShown = false;
        // Do NOT loadLevel yet — handleTutorialHole1To2Chain will load after cutscene (or immediately if skipped)
        // Keep gameState as WIN (not AIMING) until hole 2 is loaded so the
        // aim orbit is not drawn around the ball sitting in hole 1 while the
        // first-restock cutscene starts.
        gameState='WIN';
        if(winOverlay) winOverlay.classList.add('hidden');
        updateAttemptsUI(); updateHotbarUI();
        saveProgress();
        try{ syncMainMenu(); }catch{}
        handleTutorialHole1To2Chain();
      }catch(e){ console.warn('tutorial pending advance failed',e); try{ loadLevel(1); showHoleBanner(1, getTotalHoles()); }catch{} }
      return;
    }
    if (wasTut && prevIdx === 1) {
      // hole2 -> hole3: empty bag, no reward at start, rewards banter before Hole3 banner
      try{
        try{ consumePlacedModifiersFromSupply(); }catch{}
        clearFreeShotGlow();
        currentHoleIndex = 2;
        holeAttempts=0;
        holeStartAttempts=0;
        modifiersTraversedThisHole = new Set();
        tutorialHole2RotatorShown = true;
        tutorialHole2GadgetsReminderShown = true;
        tutorialHole3RotatorShown = false;
        grantTutorialHole3EmptyBag();
        loadLevel(2);
        // suppress reward menu — will be handled via treasure, not at hole start
        rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; syncRewardOverlay();
        // banter before banner
        holeBannerVisible=false; holeBannerTimer=0;
        gameState='AIMING';
        if(winOverlay) winOverlay.classList.add('hidden');
        updateAttemptsUI(); updateHotbarUI();
        saveProgress();
        try{ syncMainMenu(); }catch{}
        // Play rewards banter then Hole 3 banner
        (async()=>{
          try{ await banterLoadFile(); }catch{}
          const ok = banterPlay('tutorial-rewards', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} try{ showHoleBanner(2, getTotalHoles()); }catch{} saveProgress(); }});
          // also alias rewards-second for compat
          if(!ok) { try{ banterPlay('rewards-second', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} try{ showHoleBanner(2, getTotalHoles()); }catch{} }}); }catch{} if(!banterIsActive()) try{ showHoleBanner(2, getTotalHoles()); }catch{} }
          try{ syncBanterSkipButton(); }catch{}
        })();
      }catch(e){ console.warn('tutorial hole2->3 failed',e); try{ showHoleBanner(2, getTotalHoles()); }catch{} }
      return;
    }
    if (wasTut && prevIdx === 2) {
      // hole3 -> hole4: start with 4 spatial (liquifier/deflector/rotator/magnifier), banter, then reward with passives
      try{
        try{ consumePlacedModifiersFromSupply(); }catch{}
        clearFreeShotGlow();
        currentHoleIndex = 3;
        holeAttempts=0;
        holeStartAttempts=0;
        modifiersTraversedThisHole = new Set();
        tutorialHole3RotatorShown = true;
        grantTutorialHole4Spatial();
        loadLevel(3);
        // Do not show reward yet — suppress at load, will show after banter
        rewardPending=false; rewardMenuVisible=false; rewardOffered=[]; syncRewardOverlay();
        holeBannerVisible=false; holeBannerTimer=0;
        gameState='AIMING';
        if(winOverlay) winOverlay.classList.add('hidden');
        updateAttemptsUI(); updateHotbarUI();
        saveProgress();
        try{ syncMainMenu(); }catch{}
        (async()=>{
          try{ await banterLoadFile(); }catch{}
          const ok = banterPlay('tutorial-passives', {onComplete: ()=>{
            try{ syncBanterSkipButton(); }catch{}
            // After banter, show hole4 passive reward (fieldExtender/powerCell/freeShot)
            try{ showTutorialHole4PassiveReward(); }catch{}
            saveProgress();
          }});
          if(!ok) try{ showTutorialHole4PassiveReward(); }catch{}
          try{ syncBanterSkipButton(); }catch{}
        })();
      }catch(e){ console.warn('tutorial hole3->4 failed',e); try{ showHoleBanner(3, getTotalHoles()); }catch{} }
      return;
    }
    // generic advance (including tutorial hole2->hole3)
    try{
      try{ consumePlacedModifiersFromSupply(); }catch{}
      clearFreeShotGlow();
      currentHoleIndex++;
      holeAttempts=0;
      holeStartAttempts=0;
      modifiersTraversedThisHole = new Set();
      loadLevel(currentHoleIndex);
      gameState='AIMING';
      if(winOverlay) winOverlay.classList.add('hidden');
      updateAttemptsUI(); updateHotbarUI();
      maybeShowRewardMenu();
      saveProgress();
      // show Hole banner for next hole
      try{ showHoleBanner(currentHoleIndex, getTotalHoles()); }catch{}
    }catch(e){ console.warn('pending advance failed',e); }
    try{ syncMainMenu(); }catch{}
    return;
  }
  if (deferredMenuReturn) {
    // End screen was over the level: now reset state and return to the menu.
    finishReturnToMainMenu();
  } else {
    try { syncMainMenu(); } catch {}
  }
}
function finalizeRunCoinsAndShowSummary() {
  // Points already tracked via totalPoints; just show final total if needed but per-hole summaries already shown.
  // For compatibility, if totalPoints !=0 show a final run summary with total points as "Run Complete"
  // Run Completed overlay removed – hole already showed detailed breakdown, just go to menu
  if (false && totalPoints !== 0) {
    coinSummaryHoles = runHolesCleared;
    coinSummaryCoins = totalPoints;
    coinSummaryAttempts = Math.max(0, Math.floor(totalAttempts));
    coinSummaryVisible = true;
    coinSummaryAnimDone = false;
    clearCoinSummaryAnimTimers();
    const el=document.getElementById('coin-summary-overlay');
    if(el){ el.classList.remove('hidden'); const h3=el.querySelector('h3'); if(h3) h3.textContent='Run Complete'; }
    const amt=document.getElementById('coin-summary-amount');
    if(amt) amt.textContent='+'+totalPoints+' points';
    const details=document.getElementById('coin-summary-details');
    if(details){
      details.innerHTML='';
      const makeRow=(a,l)=>{ const r=document.createElement('div'); r.className='coin-detail-row'; r.textContent=a+' - '+l; return r; };
      // Detailed breakdown: cleared holes, modifiers (approx), first try bonuses, attempts
      const holesPts = runHolesCleared * 10;
      details.appendChild(makeRow(holesPts+'p','cleared hole'+(runHolesCleared!==1?'s':'')));
      // Attempts
      const att = Math.max(0, Math.floor(totalAttempts));
      if(att>0){
        const label = att===3 ? 'three attempts' : att===1 ? 'one attempt' : `Attempts (x${att})`;
        details.appendChild(makeRow('-'+att+'p', label));
      } else {
        details.appendChild(makeRow('0p','Attempts (x0)'));
      }
      // If there were modifiers, show approx (totalPoints - holesPts + att) as modifier+first bonus
      const remaining = totalPoints - holesPts + att;
      if(remaining>0){
        details.appendChild(makeRow(remaining+'p','Modifier Bonus'));
      }
    }
    syncProgressionDisplay();
    try{ syncMainMenu(); }catch{}
  } else {
    coinSummaryVisible=false;
    syncCoinSummaryOverlay();
  }
  runHolesCleared=0; runCoinsEarned=0;
  syncProgressionDisplay();
}

// Max Attempts per new req 03/05/09/10 - hidden max, attemptsLeft = max - holeAttempts, replaces Free Shots
let maxAttempts = 10;
function getMaxAttempts() { return maxAttempts; }
function setMaxAttempts(v) { maxAttempts = Math.max(10, Math.floor(v)); updateAttemptsUI(); }
function addMaxAttempts(n = 1) { maxAttempts = Math.max(10, maxAttempts + Math.floor(n)); updateAttemptsUI(); saveProgress(); }
function getAttemptsLeft() { if (isTutorialActive()) return 999; return Math.max(0, maxAttempts - holeAttempts); }

// Modifier Area +10% (Field Extender) and Power Cell +10% strength per REQ-023/06 — renamed from Area Up
const BASE_MODIFIER_RADIUS = MODIFIER_RADIUS; // 54 base per REQ-015 (reduced 40% from 90 = 90*0.6)
const BASE_MODIFIER_STRENGTH = 5;
let areaUpgradeCount = 0; // legacy alias — mirrors fieldExtenderCount
let fieldExtenderCount = 0; // new name, 0 on new game, +10% radius per stack
let powerCellCount = 0; // new — +10% wind strength per stack for magnifier/deflector/rotator (legacy amplify/flip/rotate)
function getAreaUpgradeCount() { return fieldExtenderCount; }
function getFieldExtenderCount() { return fieldExtenderCount; }
function getPowerCellCount() { return powerCellCount; }
function getAreaMultiplier() { return 1 + 0.20 * fieldExtenderCount; } // 1 + 0.20*n
function getEffectiveModifierRadius() { return BASE_MODIFIER_RADIUS * getAreaMultiplier(); }
function getPowerMultiplier() { return 1 + 0.20 * powerCellCount; } // 1 + 0.20*n
function getEffectiveModifierStrength() { return BASE_MODIFIER_STRENGTH * getPowerMultiplier(); }
function addAreaUpgrade(n = 1) { return addFieldExtender(n); }
function addFieldExtender(n = 1) {
  const count = Math.max(1, Math.floor(n || 1));
  for (let i = 0; i < count; i++) { if (!addItemToBag('fieldExtender')) break; }
  const newR = getEffectiveModifierRadius();
  for (const m of modifiers) m.radius = newR;
  syncModifiersToField();
  updateHotbarUI();
}
function addPowerCell(n = 1) {
  const count = Math.max(1, Math.floor(n || 1));
  for (let i = 0; i < count; i++) { if (!addItemToBag('powerCell')) break; }
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
    golfbag: golfbag.map(e => (e ? { ...e } : null)),
    passiveCounts: { ...passiveCounts },
    totalPoints,
    selectedBagIndex,
    isFreeShotActive,
    isTutorialRun,
    treasure: level && level.treasure ? { x: level.treasure.x, y: level.treasure.y, radius: level.treasure.radius, isCollected: !!level.treasure.isCollected } : null,
    treasures: getLevelTreasures(level).map(t=>({ x:t.x, y:t.y, radius:t.radius, isCollected:!!t.isCollected })),
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
    runFirstCourseClear: !!runFirstCourseClear,
    runUnlockedNewCourse: !!runUnlockedNewCourse,
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
      liquifier: Math.max(0, Math.floor(d.supply?.liquifier ?? d.supply?.nullify ?? 0)),
      deflector: Math.max(0, Math.floor(d.supply?.deflector ?? d.supply?.flip ?? 0)),
      rotator: Math.max(0, Math.floor(d.supply?.rotator ?? d.supply?.rotate ?? 0)),
      freeShot: Math.max(0, Math.floor(d.supply?.freeShot ?? d.passiveCounts?.freeShot ?? 0))
    };
    if(d.passiveCounts && typeof d.passiveCounts==='object'){
      passiveCounts.fieldExtender = Math.max(0, Math.floor(d.passiveCounts.fieldExtender ?? d.fieldExtenderCount ?? 0));
      passiveCounts.powerCell = Math.max(0, Math.floor(d.passiveCounts.powerCell ?? d.passiveCounts.rangeModifier ?? d.powerCellCount ?? 0));
      passiveCounts.freeShot = Math.max(0, Math.floor(d.passiveCounts.freeShot ?? d.supply?.freeShot ?? 0));
    } else {
      passiveCounts.fieldExtender = Math.max(0, Math.floor(d.fieldExtenderCount ?? d.areaUpgradeCount ?? 0));
      passiveCounts.powerCell = Math.max(0, Math.floor(d.powerCellCount ?? 0));
      passiveCounts.freeShot = Math.max(0, Math.floor(d.supply?.freeShot ?? 0));
    }
    if(typeof d.totalPoints==='number' && Number.isFinite(d.totalPoints)) totalPoints = Math.floor(d.totalPoints);
    else totalPoints = 0;
    // migrated: if missing freeShot/rotate, default 0/1
    if (d.supply && d.supply.freeShot === undefined) supply.freeShot = 0;
    if (d.supply && d.supply.rotator === undefined) supply.rotator = 1;
    // Tactical golfbag restore (new) with legacy fallback from supply counts
    try {
      if (Array.isArray(d.golfbag) && d.golfbag.length) {
        const gb = [null, null, null, null];
        for (let i = 0; i < GOLFBAG_SIZE; i++) {
          const raw = d.golfbag[i];
          if (!raw) { gb[i] = null; continue; }
          const t = normalizeSupplyType(typeof raw === 'string' ? raw : raw.type);
          if (!t) { gb[i] = null; continue; }
          if (t === 'freeShot') gb[i] = { type: 'freeShot', charges: Math.max(1, Math.floor(raw.charges ?? d.supply?.freeShot ?? FREE_SHOT_CHARGES_PER_ITEM)) };
          else if (['magnifier', 'liquifier', 'deflector', 'rotator', 'fieldExtender', 'powerCell'].includes(t)) gb[i] = { type: t };
          else gb[i] = null;
        }
        golfbag = gb;
        selectedBagIndex = Number.isInteger(d.selectedBagIndex) ? Math.max(-1, Math.min(GOLFBAG_SIZE - 1, d.selectedBagIndex)) : -1;
        if (selectedBagIndex >= 0 && !golfbag[selectedBagIndex]) selectedBagIndex = -1;
        // Free Shot is display-only: never restore it as a selection
        if (selectedBagIndex >= 0 && golfbag[selectedBagIndex] && bagEntryType(golfbag[selectedBagIndex]) === 'freeShot') selectedBagIndex = -1;
        selectedModifier = selectedBagIndex >= 0 ? bagEntryType(golfbag[selectedBagIndex]) : null;
        syncDerivedFromBag();
      } else {
        // Legacy: expand supply + FE/PC counts into bag slots (truncate to 4)
        const feLegacy = Math.max(0, Math.floor(d.fieldExtenderCount ?? d.areaUpgradeCount ?? 0));
        const pcLegacy = Math.max(0, Math.floor(d.powerCellCount ?? 0));
        const order = [];
        for (let i = 0; i < (supply.liquifier ?? 0); i++) order.push('liquifier');
        for (let i = 0; i < (supply.deflector ?? 0); i++) order.push('deflector');
        for (let i = 0; i < (supply.rotator ?? 0); i++) order.push('rotator');
        for (let i = 0; i < (supply.magnifier ?? 0); i++) order.push('magnifier');
        for (let i = 0; i < feLegacy; i++) order.push('fieldExtender');
        for (let i = 0; i < pcLegacy; i++) order.push('powerCell');
        const fsTotal = Math.max(0, Math.floor(supply.freeShot ?? 0));
        if (fsTotal > 0) order.push({ type: 'freeShot', charges: fsTotal });
        setBagFromTypeList(order.slice(0, GOLFBAG_SIZE));
        selectedBagIndex = -1; selectedModifier = null;
      }
    } catch { setBagFromTypeList(['liquifier']); }
    isFreeShotActive = !!d.isFreeShotActive && canActivateFreeShot();
    isTutorialRun = !!d.isTutorialRun;
    try { setWindFreeShotActive(isFreeShotActive); } catch {};
    // Field Extender / Power Cell: golfbag is source of truth when present; only use legacy
    // counts when no golfbag was stored (already handled above via setBagFromTypeList).
    if (!Array.isArray(d.golfbag) || !d.golfbag.length) {
      if (d.fieldExtenderCount !== undefined) fieldExtenderCount = Math.max(0, Math.floor(d.fieldExtenderCount));
      else if (d.areaUpgradeCount !== undefined) fieldExtenderCount = Math.max(0, Math.floor(d.areaUpgradeCount));
      else fieldExtenderCount = 0;
      areaUpgradeCount = fieldExtenderCount;
      powerCellCount = Math.max(0, Math.floor(d.powerCellCount ?? 0));
      try { setFieldPowerCellCount(powerCellCount); } catch {};
      syncDerivedFromBag();
    }
    rewardPending = !!d.rewardPending;
    rewardOffered = Array.isArray(d.rewardOffered) && d.rewardOffered.length >= 1 && d.rewardOffered.length <= 3 ? [...d.rewardOffered] : [];
    // migrate legacy /maxAttempts offers to freeShot and legacy modifier names to new names
    rewardOffered = rewardOffered.map(t => t === '' ? 'freeShot' : t === 'maxAttempts' ? 'freeShot' : t === 'amplify' ? 'magnifier' : t === 'nullify' ? 'liquifier' : t === 'flip' ? 'deflector' : t === 'rotate' ? 'rotator' : t);
    rewardRerolled = !!d.rewardRerolled;
    rewardMenuVisible = !!d.rewardMenuVisible && rewardOffered.length >= 1 && rewardOffered.length <= 3;
    pendingRewardType = null;
    rewardSeedCounter = Number.isFinite(d.rewardSeedCounter) ? Math.max(0, Math.floor(d.rewardSeedCounter)) : 0;
    runFirstCourseClear = !!d.runFirstCourseClear;
    runUnlockedNewCourse = !!d.runUnlockedNewCourse;
    if (d.campaignSeed && typeof setCampaignSeed === 'function') {
      try { setCampaignSeed(String(d.campaignSeed)); } catch {};
    }
    // Restore treasure collected state for current hole (supports 3 chests on hole3)
    // Only mutate runtime LEVELS/level, not the stored course definition (which stays false for future runs)
    try {
      if (Array.isArray(d.treasures) && d.treasures.length) {
        const curTreasures = getLevelTreasures(LEVELS[currentHoleIndex]);
        const curLevelTreasures = getLevelTreasures(level);
        for (let i=0;i<d.treasures.length;i++){
          const src = d.treasures[i];
          if (!src || typeof src.isCollected!=='boolean') continue;
          if (curTreasures[i]) curTreasures[i].isCollected = !!src.isCollected;
          if (curLevelTreasures[i]) curLevelTreasures[i].isCollected = !!src.isCollected;
        }
        // keep single pointer in sync (repoint only, never mutate array elements via shared ref)
        try {
          const L = LEVELS[currentHoleIndex];
          if (L && Array.isArray(L.treasures) && L.treasures.length) L.treasure = L.treasures.find(t=>!t.isCollected) || L.treasures[0];
          else if (L && L.treasure && curTreasures[0] && L.treasure !== curTreasures[0]) L.treasure.isCollected = !!curTreasures[0].isCollected;
        } catch {}
        try {
          if (level && Array.isArray(level.treasures) && level.treasures.length) level.treasure = level.treasures.find(t=>!t.isCollected) || level.treasures[0];
          else if (level && level.treasure && curLevelTreasures[0] && level.treasure !== curLevelTreasures[0]) level.treasure.isCollected = !!curLevelTreasures[0].isCollected;
        } catch {}
      } else if (d.treasure && typeof d.treasure.isCollected === 'boolean') {
        if (LEVELS[currentHoleIndex] && LEVELS[currentHoleIndex].treasure) LEVELS[currentHoleIndex].treasure.isCollected = !!d.treasure.isCollected;
        if (typeof level !== 'undefined' && level && level.treasure) level.treasure.isCollected = !!d.treasure.isCollected;
        // also sync array if present
        const curTreasures = getLevelTreasures(LEVELS[currentHoleIndex]);
        const curLevelTreasures = getLevelTreasures(level);
        if (curTreasures[0]) curTreasures[0].isCollected = !!d.treasure.isCollected;
        if (curLevelTreasures[0]) curLevelTreasures[0].isCollected = !!d.treasure.isCollected;
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
function clearAllStorageForSeedGeneration() {
  // Requirement: Generating a new seed shall remove all state from local storage
  try { localStorage.clear(); } catch {}
  try { clearProgression(); } catch {}
  try { clearLastLoadout(); } catch {}
  try { clearHighScore(); } catch {}
  try { clearProgress(); } catch {}
  // Also invalidate in-memory course cache
  try { invalidateCoursesCache(); } catch {}
  // Reset run-specific progress variables
  try { runHolesCleared = 0; runCoinsEarned = 0; } catch {}
  try { coinSummaryVisible = false; syncCoinSummaryOverlay(); } catch {}
}

// Pause Menu per REQ-028 — Escape, Resume/New Game, reward stats xN
let pauseMenuVisible = false;
let pauseMenuHover = null;
let endRunConfirmVisible = false;
function isEndRunConfirmVisible() { return endRunConfirmVisible; }
function showEndRunConfirm() {
  endRunConfirmVisible = true;
  syncEndRunConfirmOverlay();
}
function hideEndRunConfirm() {
  endRunConfirmVisible = false;
  syncEndRunConfirmOverlay();
}
function syncEndRunConfirmOverlay() {
  const el = document.getElementById('end-run-confirm-overlay');
  if (!el) return;
  if (endRunConfirmVisible) el.classList.remove('hidden');
  else el.classList.add('hidden');
}
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
  isTutorialRun = false;
  // Generate fresh 18 levels with increasing difficulty per REQ-010
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {};
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  setBagFromTypeList(['liquifier']);
  clearFreeShotGlow();
  hideSoftlockBanner();
  resetSoftlockDetection();
  maxAttempts = 10; areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {}; rewardPending = false; 
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardSeedCounter = 0;
  pauseMenuVisible = false; pauseMenuHover = null;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null; selectedBagIndex = -1;
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
  // Record is highest points, regardless of clear or not (2026-09-21)
  const prev = getHighScore();
  if (prev == null || totalPoints > prev) setHighScore(totalPoints);
  let updated = false;
  let firstClear = false;
  if (activeCourse.bestTotal == null || totalPoints > activeCourse.bestTotal) {
    firstClear = (activeCourse.bestTotal == null);
    activeCourse.bestTotal = totalPoints;
    updated = true;
    try { saveCourses(); } catch {};
    // Re-render course list to show new record
    try { renderCourseList(); } catch {};
  }
  // Shop stock milestones (10-progression.md §1.6): first clear of a course
  // unlocks stock. Replays never re-grant.
  if (firstClear) {
    try { grantShopMilestoneStock(activeCourse.holeCount); } catch {}
  }
  // First-clear + unlock tracking for this run (coin bonus, summary notices,
  // end-9-hole cutscene). Replays leave both flags false.
  if (firstClear) {
    runFirstCourseClear = true;
  }
  // Auto-generate next stage if this stage was just cleared (or already cleared)
  if (activeCourse.bestTotal !== null) {
    const next = ensureNextStageUnlocked(courses);
    if (next) {
      // A new staged course was generated by this run's clear.
      runUnlockedNewCourse = true;
      try { renderCourseList(); } catch {};
    } else if (updated) {
      // still re-render to show unlock
      try { renderCourseList(); } catch {};
    }
  }
}
function maybeUpdateCourseRecord() { return maybeUpdateHighScore(); }
// Shop stock milestones (10-progression.md §1.6). Called only on the FIRST clear
// of a course (bestTotal null → set); replays must not call this.
// announce=true (from a live run) flags the end screen's "New items in the shop"
// notice; init reconciliation passes announce=false.
function isFirstRestockStockPresent() {
  try {
    const ss = getShopStock();
    if (ss && (ss.deflector > 0 || ss.rotator > 0 || ss.magnifier > 0)) return true;
  } catch {}
  try {
    const ps = getPersonalSupply();
    if (ps && (ps.deflector > 0 || ps.rotator > 0 || ps.magnifier > 0)) return true;
  } catch {}
  return false;
}
function grantShopMilestoneStock(holeCount, announce = true) {
  const n = Math.floor(Number(holeCount));
  let granted = false;
  if (n === 3) {
    // First restock: a deflector, a rotator and a magnifier come into stock.
    // Guard double-grant: if stock for those 3 is already present (via second-run guarantee
    // or earlier clear), the 3-hole clear milestone is considered already satisfied.
    // NOTE: do NOT use isShopRestockedFirstTime() here because it also checks bestTotal
    // which was just set for this clear, causing the first 3-hole clear on first run to
    // incorrectly appear as already restocked and block its own grant.
    try { if (isFirstRestockStockPresent()) return granted; } catch {}
    granted = addShopStock('deflector', 1) || granted;
    granted = addShopStock('rotator', 1) || granted;
    granted = addShopStock('magnifier', 1) || granted;
  } else if (n === 6 || n === 9) {
    // First 6-hole / 9-hole clear: one more of each placeable field modifier
    // plus one field extender, one power cell and one free shot.
    granted = addShopStock('magnifier', 1) || granted;
    granted = addShopStock('liquifier', 1) || granted;
    granted = addShopStock('deflector', 1) || granted;
    granted = addShopStock('rotator', 1) || granted;
    granted = addShopStock('fieldExtender', 1) || granted;
    granted = addShopStock('powerCell', 1) || granted;
    granted = addShopStock('freeShot', 1) || granted;
  }
  // 18-hole clears grant no additional stock.
  if (announce && granted) runShopRestocked = true;
  try { syncLoadoutOverlay(); } catch {}
  try { syncProgressionDisplay(); } catch {}
}
// 11-cutscenes §11c: shop counts as restocked for the first time when any shop
// stock exists (first milestone granted) or — if already emptied by purchases —
// when the 3-hole course has been cleared (which is what grants the first
// restock: deflector + rotator + magnifier) or when the guaranteed second-run
// restock has fired (personalSupply for those 3 now >0 even if shop emptied).
function isShopRestockedFirstTime() {
  try {
    const ss = getShopStock();
    if (ss && typeof ss === 'object') {
      for (const k of Object.keys(ss)) {
        if (Math.floor(Number(ss[k] ?? 0)) > 0) return true;
      }
    }
  } catch {}
  try {
    const c3 = Array.isArray(courses) ? courses.find(x => x && x.holeCount === 3) : null;
    if (c3 && c3.bestTotal !== null && c3.bestTotal !== undefined) return true;
  } catch {}
  try {
    const ps = getPersonalSupply();
    if (ps && (ps.deflector > 0 || ps.rotator > 0 || ps.magnifier > 0)) return true;
  } catch {}
  return false;
}
function ensureFirstRestockOnSecondRun() {
  try {
    if (getRunsStarted() < 1) return false;
    if (isShopRestockedFirstTime()) return false;
    // Guarantee first restock: deflector+rotator+magnifier, same as 3-hole clear.
    // This is a start-of-run gift, not a clear-triggered restock, so it does NOT set
    // runShopRestocked (coin summary notice is for clear-triggered restocks only).
    let granted = false;
    granted = addShopStock('deflector', 1) || granted;
    granted = addShopStock('rotator', 1) || granted;
    granted = addShopStock('magnifier', 1) || granted;
    if (granted) {
      try { syncLoadoutOverlay(); } catch {}
      try { syncProgressionDisplay(); } catch {}
    }
    return granted;
  } catch { return false; }
}
function ensureFirstRestockStock() {
  try {
    if (isFirstRestockStockPresent()) return false;
    let granted = false;
    granted = addShopStock('deflector', 1) || granted;
    granted = addShopStock('rotator', 1) || granted;
    granted = addShopStock('magnifier', 1) || granted;
    if (granted) {
      try { syncLoadoutOverlay(); } catch {}
      try { syncProgressionDisplay(); } catch {}
    }
    return granted;
  } catch { return false; }
}
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
  // New flow: show loadout before first hole (10-progression.md §2) — pre-load last saved or random
  if (hasRestorableSave()) return;
  const _tutCourse = findCourseById(courseId);
  const _isTut = isTutorialCourse(_tutCourse);
  try { loadProgression(); } catch {}
  const _afterPrologue = (opts) => { if (_isTut) { startTutorialCourse(courseId); } else { playBanterThenShowStartingOverlay(courseId, opts); } };
  // 11-cutscenes §11: first time player clicks 3-hole course, show prologue.json before next state (loadout / tutorial)
  // For 3-hole Trial tutorial, prologue/intro still play when not yet seen, but after they complete we start the tutorial (controls-first banter), not the generic Starting Items overlay.
  try {
    const course = findCourseById(courseId);
    const isThreeHole = !!(course && isTutorialCourse(course));
    const notSeen = !cutsceneHasSeen('prologue');
    const canPlayPrologue = isThreeHole && notSeen && !cutsceneIsActive();
    if (canPlayPrologue) {
      // Immediately hide main menu/splash so cutscene bg is visible on first frame (avoid flash of menu over cutscene)
      try {
        const el = document.getElementById('main-menu-overlay');
        if (el) { el.classList.add('hidden'); el.classList.remove('with-backdrop'); }
        const parallaxEl = document.getElementById('parallax-scene');
        if (parallaxEl) { parallaxEl.classList.add('hidden'); parallaxEl.setAttribute('aria-hidden','true'); }
        const hud = document.getElementById('hud');
        if (hud) hud.classList.add('hidden');
      } catch {}
      try { syncMainMenu(); } catch {}
      try { redrawBottom(); } catch {}
      try { syncParallaxVisibility(); } catch {}
      // Preload both cutscenes up-front so prologue → intro-3-hole chain plays
      // back-to-back with no intermediate screen (11-cutscenes §11b): the second
      // starts synchronously inside the first's onComplete (same call stack as
      // endCutscene), so there is no async fetch gap where menus/splash could flash.
      // Use cutsceneLoad to handle async correctly (cutscenePlay with string id returns false on async load and retries, which would cause fallback race)
      Promise.all([cutsceneLoad('prologue'), cutsceneLoad('intro-3-hole')]).then(([data, preloadedIntro]) => {
        if (!data) {
          // Failed to load prologue.json — fallback to loadout so player isn't blocked
          console.warn('[prologue] failed to load prologue.json, skipping to loadout');
          _afterPrologue();
          syncProgressionDisplay();
          return;
        }
        // Helper to start intro-3-hole synchronously (already preloaded) or fall back.
        const playIntroSync = () => {
          const introNotSeen = (()=>{ try{ return !cutsceneHasSeen('intro-3-hole'); }catch{ return true; }})();
          if (!(introNotSeen && isThreeHole)) {
            _afterPrologue();
            syncProgressionDisplay();
            return;
          }
          const data2 = preloadedIntro || null;
          if (!data2) {
            console.warn('[intro-3-hole] failed to load, skipping to loadout');
            try { cutsceneMarkSeen('intro-3-hole'); } catch {}
            _afterPrologue({hideShop:true});
            syncProgressionDisplay();
            return;
          }
          const ok2 = playCutsceneWrapped(data2, {
            onComplete: (completed2) => {
              try { cutsceneMarkSeen('intro-3-hole'); } catch {}
              _afterPrologue({hideShop:true});
              syncProgressionDisplay();
            }
          });
          if (!ok2) {
            console.warn('[intro-3-hole] play failed, skipping to loadout');
            try { cutsceneMarkSeen('intro-3-hole'); } catch {}
            _afterPrologue({hideShop:true});
            syncProgressionDisplay();
          } else {
            try { syncMainMenu(); } catch {}
            try { redrawBottom(); } catch {}
            try { syncParallaxVisibility(); } catch {}
          }
        };
        // Use wrapped version so main menu/splash are hidden immediately and cutscene bg is visible
        const ok = playCutsceneWrapped(data, {
          onComplete: (completed) => {
            try { cutsceneMarkSeen('prologue'); } catch {}
            // Chain intro-3-hole directly after prologue before loadout (11b),
            // synchronously — no other screen between.
            if (!cutsceneIsActive()) playIntroSync();
            else {
              // Should not happen (previous cutscene just ended), but guard.
              playIntroSync();
            }
          }
        });
        if (!ok) {
          // Play failed (invalid data) — fallback to loadout and still mark seen to avoid loop?
          console.warn('[prologue] playCutscene failed, skipping to loadout');
          try { cutsceneMarkSeen('prologue'); } catch {}
          // still attempt intro chain before loadout?
          const introNotSeen2 = (()=>{ try{ return !cutsceneHasSeen('intro-3-hole'); }catch{ return true; }})();
          if (introNotSeen2 && isThreeHole) {
            try { cutsceneMarkSeen('intro-3-hole'); } catch {}
          }
          _afterPrologue({hideShop: introNotSeen2 && isThreeHole});
          syncProgressionDisplay();
        } else {
          // Ensure main menu is hidden immediately (playCutsceneWrapped already does, but force again for race where syncMainMenu hasn't run yet)
          try { syncMainMenu(); } catch {}
          try { redrawBottom(); } catch {}
          try { syncParallaxVisibility(); } catch {}
        }
      }).catch((e) => {
        console.warn('[prologue] load error', e);
        _afterPrologue();
        syncProgressionDisplay();
      });
      return; // Wait for cutscene onComplete to show loadout
    }
  } catch (e) {
    console.warn('[prologue] check failed', e);
    // Fall through to normal loadout
  }
  // Guarantee first restock on second run regardless of clear (10-progression §1.6)
  try { ensureFirstRestockOnSecondRun(); } catch {}
  // 11-cutscenes §11c: on the start of the run where the shop is restocked for
  // the first time, play "first-restock" before the loadout overlay is shown.
  try {
    const restockNotSeen = !cutsceneHasSeen('first-restock');
    const canPlayRestock = restockNotSeen && !cutsceneIsActive() && isShopRestockedFirstTime() && !_isTut;
    if (canPlayRestock) {
      // Hide main menu/splash immediately so cutscene bg is visible on first frame.
      try {
        const el = document.getElementById('main-menu-overlay');
        if (el) { el.classList.add('hidden'); el.classList.remove('with-backdrop'); }
        const parallaxEl = document.getElementById('parallax-scene');
        if (parallaxEl) { parallaxEl.classList.add('hidden'); parallaxEl.setAttribute('aria-hidden','true'); }
        const hud = document.getElementById('hud');
        if (hud) hud.classList.add('hidden');
      } catch {}
      try { syncMainMenu(); } catch {}
      try { redrawBottom(); } catch {}
      try { syncParallaxVisibility(); } catch {}
      cutsceneLoad('first-restock').then((data) => {
        if (!data) {
          console.warn('[first-restock] failed to load first-restock.json, skipping to loadout');
          try { ensureFirstRestockStock(); } catch {}
          _afterPrologue();
          syncProgressionDisplay();
          return;
        }
        const ok = playCutsceneWrapped(data, {
          onComplete: (completed) => {
            try { cutsceneMarkSeen('first-restock'); } catch {}
            try { ensureFirstRestockStock(); } catch {}
            _afterPrologue();
            syncProgressionDisplay();
          }
        });
        if (!ok) {
          console.warn('[first-restock] playCutscene failed, skipping to loadout');
          try { cutsceneMarkSeen('first-restock'); } catch {}
          try { ensureFirstRestockStock(); } catch {}
          _afterPrologue();
          syncProgressionDisplay();
        } else {
          try { syncMainMenu(); } catch {}
          try { redrawBottom(); } catch {}
          try { syncParallaxVisibility(); } catch {}
        }
      }).catch((e) => {
        console.warn('[first-restock] load error', e);
        try { ensureFirstRestockStock(); } catch {}
        _afterPrologue();
        syncProgressionDisplay();
      });
      return; // Wait for cutscene onComplete to show loadout
    }
  } catch (e) {
    console.warn('[first-restock] check failed', e);
    // Fall through to normal loadout
  }
  _afterPrologue();
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
  let isCut = false; try { isCut = cutsceneIsActive(); } catch {}
  // During cutscene, hide main menu and splash so cutscene background is visible
  if (isCut) {
    const cutEl = document.getElementById("main-menu-overlay");
    if (cutEl) {
      cutEl.classList.add("hidden");
      cutEl.classList.remove("with-backdrop");
    }
    try { if (parallaxSceneEl) { parallaxSceneEl.classList.add("hidden"); parallaxSceneEl.setAttribute('aria-hidden','true'); } } catch {}
  }
  const el = document.getElementById("main-menu-overlay");
  if (el) {
    if (mainMenuVisible && !isCut) {
      el.classList.remove("hidden");
      // Main menu is always transparent over splash, never with backdrop (pause has its own overlay)
      el.classList.remove("with-backdrop");
      el.dataset.mode = "entry";
      const mmc = el.querySelector('.main-menu-content');
      const root = document.getElementById('main-menu-root');
      const cm = document.getElementById('course-menu');
      const helpBtn = document.getElementById('help-button');
      const seedWrapper = document.getElementById('campaign-seed-wrapper');
      const menuTitle = document.getElementById('menu-title');
      // When loadout or coin summary is visible, hide main menu buttons but keep splash background (black transparent backdrop like loadout)
      if (startingItemsVisible || loadoutVisible || coinSummaryVisible) {
        if (mmc) mmc.classList.add('hidden');
        if (root) root.classList.add('hidden');
        if (cm) cm.classList.add('hidden');
        // hide chrome but keep overlay itself visible for splash backdrop
        // parallax sync will keep splash visible
      } else {
        // Sync sub-views — help is now global, not inside main-menu-overlay, so handle separately
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
        // restore chrome visibility when not in loadout
        if (helpBtn) helpBtn.classList.remove('hidden');
        if (menuTitle) menuTitle.classList.remove('hidden');
      }
      // Always hide chrome when loadout or coin summary is active — keep only splash image
      if (startingItemsVisible || loadoutVisible || coinSummaryVisible) {
        if (helpBtn) helpBtn.classList.add('hidden');
        if (seedWrapper) seedWrapper.classList.add('hidden');
        if (menuTitle) menuTitle.classList.add('hidden');
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
  // Wind overlay: hidden on entry splash, visible on level and also while paused (pause has backdrop) — hidden during cutscene
  let isCutW=false; try{ isCutW=cutsceneIsActive(); }catch{}
  try { const showWind = !mainMenuVisible && !pauseMenuVisible && !isCutW; setWindVisible(!showWind ? false : true); } catch {};
  // Actually wind should be visible on level and also while paused (dimmed), hidden only on main menu entry
  try { const showWind2 = !mainMenuVisible && !isCutW; setWindVisible(showWind2 || pauseMenuVisible); } catch {};
  updateHotbarUI();
  try { updateAttemptsUI(); } catch {}
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
    try {
      clearAllStorageForSeedGeneration();
      const res = regenerateCampaign();
      try { courses = res.courses || loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
      rewardSeedCounter = 0;
      rewardPending = false; rewardOffered = []; rewardMenuVisible = false; pendingRewardType = null; rewardRerolled = false;
      _lastCourseListSig = null;
      try { renderCourseList(); } catch {};
      syncCampaignSeedDisplay();
      syncProgressionDisplay();
      hideCampaignEditOverlay();
      updateHotbarUI();
    } catch (e) { console.warn('campaign regenerate failed', e); }
  } else if (act.type === 'apply') {
    const val = String(act.seed || '').trim();
    try {
      clearAllStorageForSeedGeneration();
      const res = applyManualSeed(val);
      try { courses = (res && res.courses) ? res.courses : loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
      rewardSeedCounter = 0;
      rewardPending = false; rewardOffered = []; rewardMenuVisible = false; pendingRewardType = null; rewardRerolled = false;
      _lastCourseListSig = null;
      try { renderCourseList(); } catch {};
      syncCampaignSeedDisplay();
      syncProgressionDisplay();
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
    let isCut = false; try { isCut = cutsceneIsActive(); } catch {}
    const show = !!mainMenuVisible && !startingItemsVisible && !loadoutVisible && !coinSummaryVisible && !isCut;
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
    clearAllStorageForSeedGeneration();
    const res = regenerateCampaign();
    try { courses = res.courses || loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
    rewardSeedCounter = 0;
    rewardPending = false; rewardOffered = []; rewardMenuVisible = false; pendingRewardType = null; rewardRerolled = false;
    _lastCourseListSig = null;
    try { renderCourseList(); } catch {};
    syncCampaignSeedDisplay();
    syncProgressionDisplay();
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
    clearAllStorageForSeedGeneration();
    const res = applyManualSeed(val);
    try { courses = (res && res.courses) ? res.courses : loadCoursesFromStorage(); } catch { courses = loadCoursesFromStorage(); }
    rewardSeedCounter = 0;
    rewardPending = false; rewardOffered = []; rewardMenuVisible = false; pendingRewardType = null; rewardRerolled = false;
    _lastCourseListSig = null;
    try { renderCourseList(); } catch {};
    syncCampaignSeedDisplay();
    syncProgressionDisplay();
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
  isTutorialRun = false;
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {};
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  setBagFromTypeList(['liquifier']); clearFreeShotGlow(); hideSoftlockBanner(); resetSoftlockDetection(); maxAttempts = 10; areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {}; rewardPending = false; 
  rewardMenuVisible = false; rewardOffered = []; rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardSeedCounter = 0;
  pauseMenuVisible = false; pauseMenuHover = null; mainMenuVisible = false; mainMenuHover = null; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null; selectedBagIndex = -1;
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
  if (coinSummaryVisible) {
    // End screen over the loaded level (10-progression.md §4): keep
    // mainMenuVisible=false and the level; menu return deferred to dismissal.
    deferredMenuReturn = true;
    clearProgress();
    pauseMenuVisible = false; pauseMenuHover = null;
    if (winOverlay) winOverlay.classList.add("hidden");
    if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
    syncPauseOverlay(); syncMainMenu();
    updateAttemptsUI(); updateHotbarUI();
    return true;
  }
  finishReturnToMainMenu();
  return true;
}

// Shared run-state reset + return to the main menu entry. Runs immediately when
// no coin summary is shown, otherwise deferred until hideCoinSummary().
function finishReturnToMainMenu() {
  clearProgress();
  isTutorialRun = false;
  deferredMenuReturn = false;
  currentHoleIndex = 0; holeAttempts = 0; totalAttempts = 0; attempts = 0;
  setBagFromTypeList(['liquifier']);
  clearFreeShotGlow();
  hideSoftlockBanner(); resetSoftlockDetection();
  maxAttempts = 10;
  areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0;
  try { setFieldPowerCellCount(0); } catch {};
  rewardPending = false; rewardMenuVisible = false; rewardOffered = [];
  rewardRerolled = false; rewardRerollHover = false; rewardMenuHover = null; rewardClaimedFor = null;
  rewardSeedCounter = 0;
  holeBannerVisible = false; holeBannerTimer = 0; holeBannerText = "";
  attemptsBannerVisible = false; attemptsBannerTimer = 0; attemptsBannerText = ""; lastAttemptsBannerValue = null;
  freeShotBannerVisible = false; freeShotBannerTimer = 0; freeShotBannerText = "Free Shot!"; lastFreeShotBannerValue = null;
  rewardChosenCounts = { magnifier: 0, liquifier: 0, deflector: 0, rotator: 0, freeShot: 0, areaUp: 0, fieldExtender: 0, powerCell: 0 };
  modifiers = []; syncModifiersToField(); selectedModifier = null; selectedBagIndex = -1;
  pauseMenuVisible = false; pauseMenuHover = null;
  mainMenuVisible = true; courseMenuVisible = false; helpVisible = false; isInLevelPause = false;
  gameState = "AIMING";
  // Avoid heavy field generation when entering main menu (splash) — courses are cached in localStorage, field will be created on next course play
  // Keep level as dummy behind splash to avoid blocking UI; no createField here
  if (LEVELS.length) {
    level = LEVELS[0];
  } else if (courses.length && courses[0] && courses[0].holes && courses[0].holes.length) {
    level = courses[0].holes[0];
  } else {
    level = { field:{cols:32,rows:18,strength:80,seed:0,sources:1,sinks:1,doublets:0,vortexes:0}, tee:{x:80,y:360}, hole:{x:1200,y:360,radius:14}, obstacles:[], canvas:{width:LOGICAL_W,height:LOGICAL_H} };
  }
  try { if (level && level.tee) createBall(level.tee); } catch {};
  _lastCourseListSig = null;
  resetHotbarCollapsed();
  if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
  syncPauseOverlay(); syncMainMenu();
  updateAttemptsUI(); updateHotbarUI(); updateForceBar();
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
// Owned-only rewards (08 §5c): number of distinct kinds in personal storage.
function countOwnedKinds() {
  try {
    const p = getPersonalSupply();
    let n = 0;
    for (const k of Object.keys(p)) if ((p[k] ?? 0) > 0) n++;
    return n;
  } catch { return 0; }
}
// Reward card count: ceil(uniqueKinds / 2), max 3 (08 §5c).
// 1 unique → 1 card, 2 uniques → 1 card, 3-4 → 2 cards, 5+ → 3 cards.
function getRewardCardCount() {
  const n = countOwnedKinds();
  if (n <= 0) return 1;
  return Math.min(3, Math.ceil(n / 2));
}
// Filter a seeded candidate order to owned kinds (preserving seeded order),
// taking up to maxN distinct. Backfills from the full shuffled order, not just
// the sliced head. Falls back to the unfiltered head when nothing is owned
// (defensive; defaults guarantee liquifier:1 so this should not happen).
function filterOfferToOwned(candidates, maxN) {
  const list = Array.isArray(candidates) ? candidates : [];
  const n = Math.max(1, maxN || 3);
  const head = list.slice(0, n);
  try {
    const p = getPersonalSupply();
    const owned = new Set(Object.keys(p).filter(k => (p[k] ?? 0) > 0));
    if (!owned.size) return head;
    const kept = [];
    for (const t of list) {
      if (kept.length >= n) break;
      if (owned.has(normalizeSupplyType(t)) && !kept.includes(t)) kept.push(t);
    }
    if (kept.length) return kept;
  } catch {}
  return head;
}
// Owned-only rewards: build the candidate pool from owned kinds FIRST, then shuffle.
// This fixes the bug where a 9-hole offer showed only 2 items while owning 3
// (the old COMBINED-slot resolution could exclude the owned passive entirely).
function ownedPoolForCourse() {
  let full;
  try {
    const hc = activeCourse ? activeCourse.holeCount : null;
    if (hc === 3 || hc === 6) full = ['magnifier', 'liquifier', 'deflector', 'rotator'];
    else full = ['magnifier', 'liquifier', 'deflector', 'rotator', 'freeShot', 'fieldExtender', 'powerCell'];
  } catch { full = ['magnifier', 'liquifier', 'deflector', 'rotator', 'freeShot', 'fieldExtender', 'powerCell']; }
  try {
    const p = getPersonalSupply();
    const owned = full.filter(t => (p[normalizeSupplyType(t)] ?? 0) > 0);
    if (owned.length) return owned;
  } catch {}
  return full.slice(0, 3);
}
function enforceNoFieldPowerTogether(picked, remainder) {
  // Field Extender and Power Cell never appear together in one offer
  if (picked.includes('fieldExtender') && picked.includes('powerCell')) {
    const idx = picked.indexOf('powerCell');
    const repl = (remainder || []).find(t => t !== 'fieldExtender' && t !== 'powerCell' && !picked.includes(t));
    if (repl) picked[idx] = repl;
    else picked.splice(idx, 1);
  }
  return picked;
}
function getSeededRewardOffer() {
  const cs = (typeof getCampaignSeed === 'function' && getCampaignSeed()) ? String(getCampaignSeed()) : 'default';
  const seedStr = cs + ':' + rewardSeedCounter;
  rewardSeedCounter++;
  const shuffled = seededShuffle([...REWARD_POOL], seedStr);
  return shuffled.slice(0, 3);
}
function getSeededRerollOffer() {
  const cs = (typeof getCampaignSeed === 'function' && getCampaignSeed()) ? String(getCampaignSeed()) : 'default';
  const seedStr = cs + ':reroll:' + rewardSeedCounter;
  rewardSeedCounter++;
  const shuffled = seededShuffle([...REWARD_POOL], seedStr);
  return shuffled.slice(0, 3);
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
function isTutorialHole3MandatoryReward() {
  try {
    if (!isTutorialActive() || currentHoleIndex !== 2) return false;
    if (!Array.isArray(rewardOffered)) return false;
    if (rewardOffered.length === 3 && rewardOffered.includes('deflector') && rewardOffered.includes('rotator') && rewardOffered.includes('magnifier')) return true;
    // Legacy 2-option variant for backward compat
    if (rewardOffered.length === 2 && rewardOffered.includes('rotator') && rewardOffered.includes('deflector')) return true;
    return false;
  } catch { return false; }
}
function isRerollDisabled() {
  if (rewardRerolled) return true;
  // Tutorial hole 3 chests (deflector/rotator/magnifier) are mandatory: no re-roll, must pick one.
  if (isTutorialHole3MandatoryReward()) return true;
  return false;
}
function rerollReward() {
  if (isRerollDisabled()) return false;
  if (!rewardMenuVisible) return false;
  // Cost is always 1 attempt, never free shot, never secret counter per REQ-025
  holeAttempts += 1;
  totalAttempts += 1;
  attempts = totalAttempts;
  updateAttemptsUI();
  saveProgress();
  // If this reroll exhausted attempts, Game Over immediately — do not show new reward
  // Note: disabled on last attempt above prevents this suicide path, but keep as fallback
  if (getAttemptsLeft() <= 0) {
    showGameOver();
    return true;
  }
  rewardRerolled = true;
  // New offer invalidates any pending discard choice
  pendingRewardType = null;
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
  // 13-tutorial: hole3 3 chests each give deflector/rotator/magnifier, hole4 chest gives passives (no banner after)
  // 12-campaign: deterministic reward via campaignSeed + counter
  if (rewardPending) {
    // Tutorial holes 1-4 have no start reward; hole3 (3 chests) and hole4 chest give rewards
    if (isTutorialActive() && (currentHoleIndex === 1 || currentHoleIndex === 2 || currentHoleIndex === 3)) {
      // For hole3 treasure trigger, check treasure collected — special 2-option, otherwise suppress
      if (currentHoleIndex === 2 && getLevelTreasures(level).some(t=>t && t.isCollected)) {
        // hole3: 3 chests each give deflector/rotator/magnifier (3 options)
        rewardOffered = ['deflector','rotator','magnifier'];
        pendingRewardType = null;
        pendingPickup = null;
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
      if (currentHoleIndex === 3 && getLevelTreasures(level).some(t=>t && t.isCollected)) {
        // hole4 chest: show passive triple as reward (no banner after)
        rewardOffered = ['fieldExtender','powerCell','freeShot'];
        pendingRewardType = null;
        pendingPickup = null;
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
      // For hole2/3/4 start (no treasure), suppress
      rewardPending=false; return;
    }
    rewardOffered = getSeededRewardOffer();
    pendingRewardType = null;
    pendingPickup = null;
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

// Reward discard UI: when the bag is full and a reward was chosen
// (pendingRewardType), discard happens via the golfbag hotbar underneath
// (occupied slots get .discard-target dotted highlight). No in-overlay bag
// cards are shown — #reward-bag-row shall not exist.
function syncRewardDiscardUI(overlay) {
  const card = overlay.querySelector('.reward-card');
  if (!card) return;
  const pretty = { magnifier: 'Magnifier', liquifier: 'Liquifier', deflector: 'Deflector', rotator: 'Rotator', freeShot: 'Free Shot', fieldExtender: 'Field Extender', areaUp: 'Field Extender', powerCell: 'Power Cell' };
  // Title reflects mode
  try {
    const titleEl = overlay.querySelector('.reward-title');
    if (titleEl) titleEl.textContent = pendingRewardType ? ('Bag full — destroy one to take ' + (pretty[pendingRewardType] || pendingRewardType)) : 'Pick an Item';
  } catch {}
  // Highlight the chosen reward button
  try {
    const btns = overlay.querySelectorAll('#reward-buttons .reward-button');
    btns.forEach(b => {
      const isPending = !!pendingRewardType && (b.dataset.type === pendingRewardType);
      b.classList.toggle('pending', isPending);
    });
  } catch {}
  // Skip button — always available while menu open, except special tutorial hole3 treasure (mandatory 3 chests)
  try {
    const isSpecialTut = !!(isTutorialActive() && currentHoleIndex===2 && Array.isArray(rewardOffered) && ((rewardOffered.length===3 && rewardOffered.includes('deflector') && rewardOffered.includes('rotator') && rewardOffered.includes('magnifier')) || (rewardOffered.length===2 && rewardOffered.includes('rotator') && rewardOffered.includes('deflector'))));
    let skipBtn = overlay.querySelector('#reward-skip-button');
    if (!skipBtn) {
      skipBtn = document.createElement('button');
      skipBtn.id = 'reward-skip-button';
      skipBtn.className = 'reward-skip-button';
      skipBtn.textContent = 'Skip (take nothing) [Esc]';
      skipBtn.addEventListener('click', () => { closeRewardMenuWithoutReward(); });
      card.appendChild(skipBtn);
    }
    if (isSpecialTut) {
      skipBtn.style.display = 'none';
      skipBtn.disabled = true;
    } else {
      skipBtn.style.display = '';
      skipBtn.disabled = false;
    }
  } catch {}
  // Discard hint (no in-overlay bag cards — discard via golfbag .discard-target)
  try {
    let discardEl = overlay.querySelector('#reward-discard-hint');
    const staleBagRow = overlay.querySelector('#reward-bag-row');
    if (staleBagRow) staleBagRow.remove();
    if (pendingRewardType) {
      if (!discardEl) {
        discardEl = document.createElement('div');
        discardEl.id = 'reward-discard-hint';
        discardEl.className = 'reward-discard-hint';
        card.appendChild(discardEl);
      }
      discardEl.style.display = '';
      discardEl.textContent = 'Your bag is full. Destroy one bag item to take ' + (pretty[pendingRewardType] || pendingRewardType) + ', or Skip.';
    } else {
      if (discardEl) { discardEl.style.display = 'none'; discardEl.textContent = ''; }
    }
  } catch {}
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
  // Offers hold 1–3 cards: single-card tutorial/owned-only offers up to full triples.
  const shouldBeVisible = !!(rewardMenuVisible && Array.isArray(rewardOffered) && rewardOffered.length >= 1 && rewardOffered.length <= 3);
  if (shouldBeVisible && isVisible && currentTypes === desiredTypes) {
    // Just update reroll/skip/discard state, no rebuild
    if (rerollBtn) {
      const shouldDisable = isRerollDisabled();
      if (rerollBtn.disabled !== shouldDisable) {
        rerollBtn.disabled = shouldDisable;
        rerollBtn.classList.toggle('disabled', shouldDisable);
        rerollBtn.textContent = shouldDisable && rewardRerolled ? 'Re-rolled' : '↻ Re-roll (1 attempt) [R]';
      } else if (shouldDisable) {
        rerollBtn.textContent = rewardRerolled ? 'Re-rolled' : '↻ Re-roll (1 attempt) [R]';
      }
    }
    try { syncRewardDiscardUI(overlay); } catch {}
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
      magnifier: '+1 to bag',
      liquifier: '+1 to bag',
      deflector: '+1 to bag',
      rotator: '+1 to bag',
      freeShot: '+1 item (3 shots)',
      fieldExtender: '+20% area',
      areaUp: '+20% area',
      powerCell: '+20% strength'
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
    // Reroll button state — disabled on last attempt to prevent suicide; always disabled in tutorial
    // and while owning fewer than four kinds (08 §6).
    if (rerollBtn) {
      const shouldDisable = isRerollDisabled();
      rerollBtn.disabled = shouldDisable;
      rerollBtn.classList.toggle('disabled', shouldDisable);
      rerollBtn.textContent = shouldDisable && rewardRerolled ? 'Re-rolled' : '↻ Re-roll (1 attempt) [R]';
      rerollBtn.onclick = () => { if (!isRerollDisabled()) rerollReward(); };
    }
    // Skip + in-modal discard UI (bag-full flow)
    try { syncRewardDiscardUI(overlay); } catch {}
  } else {
    overlay.classList.add('hidden');
    if (btnContainer) btnContainer.innerHTML = '';
    try {
      const skipBtn = overlay.querySelector('#reward-skip-button');
      if (skipBtn) skipBtn.style.display = 'none';
      const discardEl = overlay.querySelector('#reward-discard-hint');
      if (discardEl) { discardEl.style.display = 'none'; discardEl.textContent = ''; }
      const staleBagRow = overlay.querySelector('#reward-bag-row');
      if (staleBagRow) staleBagRow.remove();
      const titleEl = overlay.querySelector('.reward-title');
      if (titleEl) titleEl.textContent = 'Pick an Item';
    } catch {}
    pendingRewardType = null;
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
  if (isTutorialActive()) return false;
  const left = getAttemptsLeft();
  const free = supply.freeShot ?? 0;
  // Last attempt state is set when attempts left is one and no free shots (checked after counter decreased on reset)
  return left === 1 && free === 0;
}
function isLastAttemptForReset() {
  if (isTutorialActive()) return false;
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

function grantRewardToBag(normalized) {
  // Returns true if granted to an empty slot. Free Shot grants one bag item with 3 charges.
  if (normalized === 'freeShot' || normalized === 'maxAttempts') {
    const ok = addItemToBag('freeShot', FREE_SHOT_CHARGES_PER_ITEM);
    if (ok) rewardChosenCounts.freeShot = Math.max(0, (rewardChosenCounts.freeShot || 0) + 1);
    return ok;
  }
  if (normalized === 'areaUp' || normalized === 'fieldExtender') {
    const ok = addItemToBag('fieldExtender');
    if (ok) {
      rewardChosenCounts.fieldExtender = Math.max(0, (rewardChosenCounts.fieldExtender || 0) + 1);
      rewardChosenCounts.areaUp = Math.max(0, (rewardChosenCounts.areaUp || 0) + 1);
    }
    return ok;
  }
  if (normalized === 'powerCell' || normalized === 'rangeModifier') {
    const ok = addItemToBag('powerCell');
    if (ok) rewardChosenCounts.powerCell = Math.max(0, (rewardChosenCounts.powerCell || 0) + 1);
    return ok;
  }
  const t = normalized;
  if (!['magnifier', 'liquifier', 'deflector', 'rotator'].includes(t)) return false;
  const ok = addItemToBag(t, 1);
  if (ok && t in rewardChosenCounts) rewardChosenCounts[t] = Math.max(0, (rewardChosenCounts[t] || 0) + 1);
  return ok;
}
function closeRewardMenuWithoutReward() {
  // Tutorial hole3 (3 chests) reward is mandatory — cannot skip (deflector/rotator/magnifier)
  if (isTutorialActive() && currentHoleIndex===2 && Array.isArray(rewardOffered) && rewardOffered.length===3 && rewardOffered.includes('deflector') && rewardOffered.includes('rotator') && rewardOffered.includes('magnifier')) {
    return false;
  }
  // Legacy 2-option check for backward compat
  if (isTutorialActive() && currentHoleIndex===2 && Array.isArray(rewardOffered) && rewardOffered.length===2 && rewardOffered.includes('rotator') && rewardOffered.includes('deflector')) {
    return false;
  }
  pendingRewardType = null;
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
  // Tutorial hole4: after skipping start passive reward, still show hole banner (not for chest)
  if (isTutorialActive() && currentHoleIndex===3 && tutorialHole4StartRewardPending && !holeBannerVisible) {
    tutorialHole4StartRewardPending = false;
    try{ showHoleBanner(3, getTotalHoles()); }catch{}
  }
  return true;
}
function discardBagSlotAndClaimReward(slotIdx) {
  if (!rewardMenuVisible || !pendingRewardType) return false;
  if (slotIdx < 0 || slotIdx >= GOLFBAG_SIZE || !golfbag[slotIdx]) return false;
  const wanted = pendingRewardType;
  // Destroy the existing item (passives can be destroyed here even though never placeable)
  golfbag[slotIdx] = null;
  syncDerivedFromBag();
  const ok = grantRewardToBag(wanted);
  if (!ok) { updateHotbarUI(); syncRewardOverlay(); return false; }
  pendingRewardType = null;
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
  if (isTutorialActive() && currentHoleIndex===3 && tutorialHole4StartRewardPending && !holeBannerVisible) {
    tutorialHole4StartRewardPending = false;
    try{ showHoleBanner(3, getTotalHoles()); }catch{}
  }
  return true;
}
function getPendingRewardType() { return pendingRewardType; }
function claimReward(type) {
  if (!rewardMenuVisible) return false;
  // support legacy aliases (amplify→magnifier, nullify→liquifier, flip→deflector, rotate→rotator, areaUp→fieldExtender)
  const legacyNormalize = (t) => t === 'areaUp' ? 'fieldExtender' : (t === 'amplify' ? 'magnifier' : t === 'nullify' ? 'liquifier' : t === 'flip' ? 'deflector' : t === 'rotate' ? 'rotator' : t);
  const normalized = legacyNormalize(type);
  const normOffered = rewardOffered.map(legacyNormalize);
  if (!rewardOffered.includes(type) && !normOffered.includes(normalized)) return false;
  // Spatial rewards need empty slot; passives are stackable and never need discard
  const isPassive = normalized==='fieldExtender' || normalized==='areaUp' || normalized==='powerCell' || normalized==='rangeModifier' || normalized==='freeShot';
  if (!isPassive && !golfbagHasEmpty()) {
    pendingRewardType = normalized;
    updateHotbarUI();
    syncRewardOverlay();
    saveProgress();
    return false;
  }
  const ok = grantRewardToBag(normalized);
  if (!ok) {
    pendingRewardType = normalized;
    updateHotbarUI();
    syncRewardOverlay();
    return false;
  }
  // Mark first and general claimed for backward compat
  rewardClaimedFor = totalAttempts;
  pendingRewardType = null;
  rewardMenuVisible = false;
  rewardMenuHover = null;
  rewardRerollHover = false;
  rewardOffered = [];
  rewardPending = false;
  updateHotbarUI();
  syncRewardOverlay();
  if (canvas) canvas.style.cursor = "default";
  saveProgress();
  // Tutorial hole4: after claiming start passive reward (not chest), show hole banner to start play
  if (isTutorialActive() && currentHoleIndex===3 && tutorialHole4StartRewardPending && !holeBannerVisible) {
    tutorialHole4StartRewardPending = false;
    try{ showHoleBanner(3, getTotalHoles()); }catch{}
  }
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
let hudEl;
let hudHoleEl;
let hudAttemptsEl;
let hudTotalEl;

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
  // 14-cheat-mode: new hole cancels any ball drag.
  cheatDraggingBall = false;
  cheatMousePos = null;
  cheatSuppressClick = false;
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
  // 13-tutorial: hole2 (1) no reward, hole3 (2) no reward at start (treasure triggers special rotator/deflector), hole4 (3) no reward
  const isTut = isTutorialActive();
  if (index > 0) {
    clearFreeShotGlow();
    if (isTut && (index === 1 || index === 2 || index === 3)) {
      rewardPending = false;
      rewardMenuVisible = false;
      rewardOffered = [];
      pendingRewardType = null;
      rewardRerolled = false;
      rewardMenuHover = null;
      rewardRerollHover = false;
      syncRewardOverlay();
      if (index === 2) tutorialHole3RewardBanterShown = false;
    } else {
      rewardPending = true;
      rewardMenuVisible = false;
      rewardOffered = [];
      pendingRewardType = null;
      rewardRerolled = false;
      rewardMenuHover = null;
      rewardRerollHover = false;
    }
  } else {
    // Hole 1: no pre-attempt reward
    clearFreeShotGlow();
    rewardPending = false;
    rewardMenuVisible = false;
    rewardOffered = [];
    pendingRewardType = null;
    rewardRerolled = false;
    rewardMenuHover = null;
    rewardRerollHover = false;
    syncRewardOverlay();
    tutorialLiquifierReminderShown = false;
    tutorialHole3RewardBanterShown = false;
  }
  // REQ-015 collapsible: reset to expanded on new hole
  resetHotbarCollapsed();
  // Pickup-discard targets the previous hole's modifiers — always clear on hole load
  pendingPickup = null;
  // 11-banners: reset attempts banner dedupe for new hole, hide any previous banner
  lastAttemptsBannerValue = null;
  attemptsBannerVisible = false;
  attemptsBannerTimer = 0;
  holeBannerVisible = false;
  holeBannerTimer = 0;
  resetSoftlockDetection();
  modifiersTraversedThisHole = new Set();
  modifiersTraversedThisShot = new Set();
  holeStartAttempts = holeAttempts;
  updateHotbarUI();
  // Redraw terrain for new hole (zoned background per REQ-010/033)
  try { redrawBottom(); } catch {};
  // 11-banners: show Hole N banner for 2s before reward (same dim, auto-transition)
  try { showHoleBanner(currentHoleIndex, getTotalHoles()); } catch {};
}

function initLevel() {
  // Hole 1 no longer auto-sets bag; bag already has starting picks
  if (currentHoleIndex === 0) {
    // keep existing golfbag (starting picks), do not reset
    if (golfbagUsedCount()===0) setBagFromTypeList([]);
    clearFreeShotGlow();
    maxAttempts = 10; 
  areaUpgradeCount = 0; fieldExtenderCount = 0; powerCellCount = 0; try { setFieldPowerCellCount(0); } catch {};
    try { syncDerivedFromBag(); } catch {}
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
  // HTML HUD on top of canvas (replaces canvas drawHUD)
  try {
    if (hudHoleEl) hudHoleEl.textContent = `Hole: ${currentHoleIndex + 1}/${totalHoles}`;
    if (hudAttemptsEl) {
      if (isTutorialActive()) {
        hudAttemptsEl.classList.add('hidden');
        hudAttemptsEl.style.display = 'none';
      } else {
        hudAttemptsEl.classList.remove('hidden');
        hudAttemptsEl.style.display = '';
        const attemptsLeft = Math.max(0, maxAttempts - holeAttempts);
        const freeShot = Math.max(0, Math.floor(supply.freeShot ?? 0));
        hudAttemptsEl.textContent = freeShot > 0 ? `Attempts Left: ${attemptsLeft} (+${freeShot})` : `Attempts Left: ${attemptsLeft}`;
      }
    }
    if (hudTotalEl) {
      if (isTutorialActive()) {
        hudTotalEl.classList.add('hidden');
        hudTotalEl.style.display = 'none';
      } else {
        hudTotalEl.classList.remove('hidden');
        hudTotalEl.style.display = '';
        hudTotalEl.textContent = `Points: ${totalPoints}`;
      }
    }
    if (hudEl) {
      let isCut2=false; try{ isCut2=cutsceneIsActive(); }catch{}
      let isBanter=false; try{ isBanter=banterIsActive(); }catch{}
      const shouldHide = !!mainMenuVisible || isCut2 || isBanter || coinSummaryVisible || startingItemsVisible;
      hudEl.classList.toggle("hidden", shouldHide);
      if (gameState === "WIN" || gameState === "GAME_OVER") hudEl.style.opacity = "0.55";
      else hudEl.style.opacity = "";
    }
  } catch {}
}

function updateHotbarUI() {
  if (!hotbarEl && !golfbagContainerEl && !bottomBarEl) return;
  // Bag+hotbar are always visible during gameplay including FLYING and reward,
  // but hidden while the starting overlay is shown.
  let isCut = false; try { isCut = cutsceneIsActive(); } catch {}
  let isBanter=false; try{ isBanter=banterIsActive(); }catch{}
  const isOverlayHidden = pauseMenuVisible || mainMenuVisible || startingItemsVisible || coinSummaryVisible || holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible || gameState === "WIN" || gameState === "GAME_OVER" || isCut || isBanter;
  const hideHotbar = isOverlayHidden;
  const hideBag = isOverlayHidden;
  if (bottomBarEl) bottomBarEl.classList.toggle("hidden", isOverlayHidden);
  if (hotbarEl) {
    hotbarEl.classList.toggle("hidden", hideHotbar);
  }
  if (golfbagContainerEl) golfbagContainerEl.classList.toggle("hidden", hideBag);
  syncHotbarCollapsedUI();
  try { syncDerivedFromBag(); } catch {}
  // Rebuild golfbag hotbar from golfbag (one item per slot, no stacking) — only unlocked slots
  const grid = hotbarGridEl || (hotbarEl ? hotbarEl.querySelector('#hotbar-grid') : null);
  if (grid) {
    const eff = getEffectiveGolfbagSize();
    grid.style.gridTemplateColumns = `repeat(${eff}, 1fr)`;
    const icons = { liquifier: './img/liquifier-icon.png', deflector: './img/deflector-icon.png', rotator: './img/rotator-icon.png', magnifier: './img/magnifier-icon.png', fieldExtender: './img/field-extender-icon.png', powerCell: './img/power-cell-icon.png', freeShot: null };
    const names = { liquifier: 'Liquifier', deflector: 'Deflector', rotator: 'Rotator', magnifier: 'Magnifier', fieldExtender: 'Field Extender', powerCell: 'Power Cell', freeShot: 'Free Shot' };
    const borders = { liquifier: '#1a4a6b', deflector: '#4a235a', rotator: '#6e1a12', magnifier: '#7a3a0a', fieldExtender: '#7a7a7a', powerCell: '#7a7a7a', freeShot: '#7a3a0a' };
    const bgs = { liquifier: 'rgba(52,152,219,0.85)', deflector: 'rgba(155,89,182,0.85)', rotator: 'rgba(231,76,60,0.85)', magnifier: 'rgba(230,126,34,0.85)', fieldExtender: 'rgba(128,128,128,0.85)', powerCell: 'rgba(128,128,128,0.85)', freeShot: 'rgba(241,196,15,0.85)' };
    // Only rebuild when bag shape/selection/pending changes to avoid hover flicker
    const sig = eff + '|' + golfbag.slice(0, eff).map(e => (e ? bagEntryType(e) + ':' + (e.charges ?? 1) : '-')).join('|') + '#' + selectedBagIndex + '#' + (pendingRewardType || '') + '#' + (pendingPickup ? 'pickup:' + pendingPickup.type : '');
    if (grid.dataset.bagSig !== sig) {
      grid.dataset.bagSig = sig;
      grid.innerHTML = '';
      for (let i = 0; i < eff; i++) {
        const entry = golfbag[i];
        const t = entry ? bagEntryType(entry) : null;
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot' + (t ? '' : ' empty');
        slot.dataset.slotIndex = String(i);
        slot.dataset.type = t || '';
        if (t) {
          slot.style.background = bgs[t] || '';
          slot.style.borderColor = borders[t] || '';
          slot.dataset.supply = '1';
          slot.dataset.count = t === 'freeShot' ? String(entry.charges ?? 0) : '1';
          const ic = icons[t];
          if (ic) {
            const im = document.createElement('img');
            im.className = 'hotbar-icon-img';
            im.src = ic; im.alt = t;
            slot.appendChild(im);
          } else {
            const fb = document.createElement('div');
            fb.className = 'hotbar-icon-img hotbar-free-fallback';
            fb.textContent = '★';
            fb.style.font = '700 22px system-ui'; fb.style.color = '#FFD700';
            slot.appendChild(fb);
          }
          // Hotkey badge 1-4 on every occupied slot except Free Shot (display-only, not selectable)
          if (t !== 'freeShot') {
            const hk = document.createElement('span');
            hk.className = 'hotbar-hotkey';
            hk.textContent = String(i + 1);
            slot.appendChild(hk);
          }
          // Count badge: freeShot shows remaining charges xN; others show nothing (one per slot)
          const cnt = document.createElement('span');
          cnt.className = 'hotbar-count';
          if (t === 'freeShot') { cnt.textContent = 'x' + (entry.charges ?? 0); cnt.style.display = ''; }
          else { cnt.textContent = ''; cnt.style.display = 'none'; }
          slot.appendChild(cnt);
          const tip = document.createElement('span');
          tip.className = 'hotbar-tooltip';
          tip.textContent = names[t] || t;
          slot.appendChild(tip);
          if (i === selectedBagIndex && t !== 'freeShot') slot.classList.add('selected');
          // Discard mode: highlight bag slots as destroy targets (reward or pickup-discard)
          const inRewardDiscard = !!(pendingRewardType && rewardMenuVisible);
          const inPickupDiscard = !!pendingPickup;
          if (inRewardDiscard) {
            slot.classList.add('discard-target');
            slot.title = 'Click to destroy ' + (names[t] || t) + ' and take ' + pendingRewardType;
            slot.style.cursor = 'pointer';
          } else if (inPickupDiscard) {
            slot.classList.add('discard-target');
            slot.title = 'Click to discard ' + (names[t] || t) + ' and pick up ' + (names[pendingPickup.type] || pendingPickup.type);
            slot.style.cursor = 'pointer';
          } else {
            slot.style.cursor = (t === 'fieldExtender' || t === 'powerCell' || t === 'freeShot') ? 'default' : 'pointer';
          }
          slot.addEventListener('click', () => {
            if (rewardMenuVisible && pendingRewardType) {
              discardBagSlotAndClaimReward(i);
              return;
            }
            if (pendingPickup) {
              discardBagSlotForPickup(i);
              return;
            }
            if (rewardMenuVisible) return;
            if (banterIsActive()) return;
            if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return;
            if (pauseMenuVisible || mainMenuVisible) return;
            if (gameState !== 'AIMING' && gameState !== 'CHARGING') return;
            selectBagSlot(i);
          });
        } else {
          slot.style.background = 'rgba(128,128,128,0.28)';
          slot.style.borderColor = '#7a7a7a';
          slot.style.cursor = 'default';
          slot.dataset.supply = '0';
          slot.dataset.count = '0';
          slot.title = 'Empty slot (' + (i + 1) + ')';
          const hk = document.createElement('span');
          hk.className = 'hotbar-hotkey hotbar-hotkey-empty';
          hk.textContent = String(i + 1);
          hk.style.display = '';
          hk.style.opacity = '0.45';
          slot.appendChild(hk);
        }
        grid.appendChild(slot);
      }
    } else {
      // Update selection/discard classes without rebuild
      const slots = grid.querySelectorAll('.hotbar-slot');
      slots.forEach((slot, i) => {
        slot.classList.toggle('selected', i === selectedBagIndex && !!golfbag[i] && bagEntryType(golfbag[i]) !== 'freeShot');
        slot.classList.toggle('discard-target', !!((pendingRewardType && rewardMenuVisible && golfbag[i]) || (pendingPickup && golfbag[i])));
      });
    }
  }
  // Passive slots (3 stackable, no hotkey, not placeable, xN badge)
  try{
    const passiveGrid = document.getElementById('passive-hotbar-grid');
    if(passiveGrid){
      const passTypes=['fieldExtender','powerCell','freeShot'];
      const passIcons={fieldExtender:'./img/field-extender-icon.png',powerCell:'./img/power-cell-icon.png',freeShot:null};
      const passNames={fieldExtender:'Field Extender',powerCell:'Range Modifier',freeShot:'Free Shots'};
      // Ensure 3 slots exist; recreate if needed
      if(passiveGrid.children.length!==3){
        passiveGrid.innerHTML='';
        for(const t of passTypes){
          const slot=document.createElement('div');
          slot.className='hotbar-slot passive';
          slot.dataset.type=t;
          passiveGrid.appendChild(slot);
        }
      }
      for(const slot of passiveGrid.children){
        const t=slot.dataset.type;
        const cnt = t==='fieldExtender' ? (passiveCounts.fieldExtender||0) : t==='powerCell' ? (passiveCounts.powerCell||0) : (passiveCounts.freeShot||0);
        slot.classList.remove('empty');
        // clear and rebuild content
        slot.innerHTML='';
        if(cnt>0){
          slot.style.display='';
          slot.style.background='transparent';
          slot.style.border='none';
          slot.style.borderColor='transparent';
          if(passIcons[t]){
            const im=document.createElement('img'); im.className='hotbar-icon-img'; im.src=passIcons[t]; im.alt=t; slot.appendChild(im);
          } else {
            const fb=document.createElement('div'); fb.className='hotbar-icon'; fb.textContent='★'; fb.style.color='#FFD700'; fb.style.font='700 22px system-ui'; slot.appendChild(fb);
          }
          const badge=document.createElement('span'); badge.className='hotbar-count'; badge.textContent='x'+cnt; badge.style.display=''; slot.appendChild(badge);
          const tip=document.createElement('span'); tip.className='hotbar-tooltip'; tip.textContent=passNames[t]||t; slot.appendChild(tip);
        } else {
          slot.style.display='none';
          slot.style.background='transparent';
          slot.style.border='none';
          slot.style.borderColor='transparent';
          const badge=document.createElement('span'); badge.className='hotbar-count'; badge.textContent='x0'; badge.style.display='none'; badge.classList.add('hidden'); slot.appendChild(badge);
        }
        slot.title=(passNames[t]||t)+' x'+cnt;
      }
    }
  }catch(e){ console.warn('passive hotbar update failed',e); }
  // Also update HUD attempts left display to show (+freeShot charges)
  try { updateAttemptsUI(); } catch {}
}

function showGameOver() {
  if (gameState === "GAME_OVER") return;
  clearFreeShotFlightGlow();
  pendingPickup = null;
  hideSoftlockBanner();
  resetSoftlockDetection();
  // Hide and clear any pending reward — Game Over takes precedence over reward screen
  rewardMenuVisible = false;
  rewardPending = false;
  rewardOffered = [];
  pendingRewardType = null;
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
  if (coinSummaryVisible) {
    // End screen over the loaded level (10-progression.md §4); menu return deferred.
    deferredMenuReturn = true;
    clearProgress();
    isTutorialRun = false;
    pauseMenuVisible = false; pauseMenuHover = null;
    if (winOverlay) winOverlay.classList.add("hidden");
    if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
    syncMainMenu();
    syncPauseOverlay();
    updateAttemptsUI();
    updateHotbarUI();
    return;
  }
  finishReturnToMainMenu();
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
  if (banterIsActive()) return;
  if (pendingPickup) return;
  if (holeBannerVisible || attemptsBannerVisible || freeShotBannerVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (selectedBagIndex < 0 || !golfbag[selectedBagIndex]) return;
  const entry = golfbag[selectedBagIndex];
  const type = bagEntryType(entry);
  if (!type || !canPlace(type)) {
    updateHotbarUI();
    return;
  }
  // Tactical: item is removed from bag when placed (slot empties)
  golfbag[selectedBagIndex] = null;
  selectedBagIndex = -1; selectedModifier = null;
  syncDerivedFromBag();
  modifiers.push({ id: Date.now() + Math.random(), type, x, y, radius: getEffectiveModifierRadius() });
  syncModifiersToField();
  updateHotbarUI();
  mousePos = null;
  saveProgress();
}

function removeModifierAt(x, y) {
  const idx = modifiers.findIndex(m => Math.hypot(m.x - x, m.y - y) < m.radius);
  if (idx !== -1) {
    // Tactical: can only be picked up again if there is bag space;
    // when full, enter pickup-discard mode instead of just toasting.
    if (!golfbagHasEmpty()) {
      enterPickupDiscard({ type: modifiers[idx].type, id: modifiers[idx].id, index: idx });
      return false;
    }
    const [removed] = modifiers.splice(idx, 1);
    if (removed && removed.type) {
      const t = normalizeSupplyType(removed.type);
      addItemToBag(t);
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
  // 14-cheat-mode: a reset cancels any ball drag so the ball can't stick to the cursor.
  cheatDraggingBall = false;
  cheatMousePos = null;
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
      // Normal attempt: decrement attempts left by incrementing holeAttempts; Points only updated when hole is cleared (not live)
      holeAttempts++;
      totalAttempts++;
      attempts = totalAttempts;
      updateAttemptsUI();
      saveProgress();
      if (!isTutorialActive()) {
        const left = getAttemptsLeft();
        const free = supply.freeShot ?? 0;
        if (left === 0 && free === 0) {
          showGameOver();
          return;
        } else if (left === 1) {
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
          }
          try { syncPauseOverlay(); } catch {};
        }
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
  // 13-tutorial: reminders (hole1 3/10, hole2 rotator 3 + gadgets 5)
  try { maybeShowTutorialHole1LiquifierReminder(); } catch {}
  try { maybeShowTutorialHole2RotatorReminder(); } catch {}
  try { maybeShowTutorialHole2GadgetsReminder(); } catch {}
}

function advanceHole() {
  if (currentHoleIndex < getTotalHoles() - 1) {
    if (isTutorialActive()) {
      // No points or summary on tutorial
      const wasIdx = currentHoleIndex;
      // Defer via same pending mechanism but without showing overlay — hideCoinSummary will handle tutorial branching immediately
      // To avoid showing overlay, set pending and directly invoke hideCoinSummary path via timeout
      pendingHoleAdvance = true;
      // For tutorial, auto-advance without needing user to dismiss overlay
      setTimeout(()=>{ try{ hideCoinSummary(); }catch{} }, 50);
      return;
    }
    // Points per hole: -1 per attempt, +10 per modifier traversed, +50 first attempt — only applied on hole clear
    const traversed = modifiersTraversedThisShot ? modifiersTraversedThisShot.size : 0;
    const attemptsOnHole = holeAttempts; // failures before this win (0 means first try)
    const firstBonus = attemptsOnHole === 0 ? 50 : 0;
    const holePoints = 10 + traversed * 10 + firstBonus - attemptsOnHole;
    totalPoints += holePoints;
    runPointsEarned += holePoints;
    runCoinsEarned = runPointsEarned;
    runHolesCleared++;
    // show per-hole points summary before advancing
    try{ showPerHoleSummary(traversed, attemptsOnHole, firstBonus, holePoints); }catch{}
    // Defer actual level load until summary dismissed: pendingHoleAdvance handled in hideCoinSummary
    pendingHoleAdvance = true;
    return;
  } else {
    // Final hole already, will show WIN
  }
}

function isEnd9HoleCutsceneDue() {
  try {
    if (cutsceneIsActive()) return false;
    if (gameState !== "WIN") return false;
    if (!activeCourse || activeCourse.holeCount !== 9) return false;
    if (!runFirstCourseClear) return false;
    if (cutsceneHasSeen('end-9-hole')) return false;
    return true;
  } catch { return false; }
}
function returnToMainMenu() {
  // REQ-009/011 final-hole: clear run, keep COURSES_KEY/bestTotal, show splash
  // Ensure per-course bestTotal already saved via maybeUpdateHighScore before calling
  // 11-cutscenes §11d: first 9-hole clear plays end-9-hole after victory, before summary.
  if (isEnd9HoleCutsceneDue()) {
    playEnd9HoleThenReturn();
    return;
  }
  continueReturnToMainMenu();
}
function playEnd9HoleThenReturn() {
  // Hide the victory overlay so the cutscene background is visible; the summary
  // (and deferred menu return) runs on completion/skip. Never blocks on failure.
  try { if (winOverlay) winOverlay.classList.add("hidden"); } catch {}
  try { if (gameoverOverlay) gameoverOverlay.classList.add("hidden"); } catch {}
  const proceed = () => { try { cutsceneMarkSeen('end-9-hole'); } catch {} continueReturnToMainMenu(); };
  const fallback = () => { console.warn('[end-9-hole] failed to load, skipping to summary'); proceed(); };
  try {
    cutsceneLoad('end-9-hole').then((loaded) => {
      if (!loaded) { fallback(); return; }
      let ok = false;
      try { ok = playCutsceneWrapped(loaded, { onComplete: () => { proceed(); } }); } catch (e) { ok = false; }
      if (!ok) fallback();
    }).catch(() => { fallback(); });
  } catch (e) { fallback(); }
}
function continueReturnToMainMenu() {
  // Coin economy: add coins for holes cleared this run and show summary
  try { finalizeRunCoinsAndShowSummary(); } catch {}
  if (coinSummaryVisible) {
    // End screen over the loaded level (10-progression.md §4); menu return deferred.
    deferredMenuReturn = true;
    clearProgress();
    isTutorialRun = false;
    pauseMenuVisible = false;
    pauseMenuHover = null;
    const pauseOverlay2 = document.getElementById("pause-overlay");
    if (pauseOverlay2) pauseOverlay2.classList.add("hidden");
    if (winOverlay) winOverlay.classList.add("hidden"); if (gameoverOverlay) gameoverOverlay.classList.add("hidden");
    syncPauseOverlay();
    syncMainMenu();
    updateAttemptsUI();
    updateHotbarUI();
    return;
  }
  finishReturnToMainMenu();
}

function resetGameAfterWin() {
  // REQ-009: on final hole, route to main menu instead of resetting to hole 1
  const isFinalWin = currentHoleIndex === LEVELS.length - 1 && gameState === "WIN";
  if (isFinalWin) {
    return returnToMainMenu();
  }
  clearProgress();
  isTutorialRun = false;
  try { generateLevels(Date.now() & 0x7fffffff, 18); } catch {};
  currentHoleIndex = 0;
  holeAttempts = 0;
  totalAttempts = 0;
  attempts = 0;
  // REQ-020/022/023/024: reset supply to one of each on new game, no award before first attempt
  setBagFromTypeList(['liquifier']);
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
  if (banterIsActive()) return;
  if (rewardMenuVisible) return;
  if (holeBannerVisible) return;
  if (attemptsBannerVisible) return;
  if (freeShotBannerVisible) return;
  if (pauseMenuVisible) return;
  if (mainMenuVisible) return;
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  if (gameState === "GAME_OVER") return;
  // Deferred Game Over + Auto-arm: if this launch would be the last counted attempt and freeShot charges available, auto-arm it
  if (!isFreeShotActive && golfbagTotalFreeShots() > 0 && getAttemptsLeft() <= 1) {
    isFreeShotActive = true;
    syncFreeShotGlow();
    updateHotbarUI();
  }
  // If no attempts left and no free shot armed, Game Over instead of launching (deferred to next attempt start) — not on tutorial (infinite)
  if (!isTutorialActive() && getAttemptsLeft() <= 0 && !(isFreeShotActive && golfbagTotalFreeShots() > 0)) {
    showGameOver();
    return;
  }
  launchBall(angle, power);
  // Free Shot: if armed and charges available, this launch is free — consume one charge, mark flight as free
  // If the item's charges reach 0 it is automatically removed from the bag.
  if (isFreeShotActive && golfbagTotalFreeShots() > 0) {
    consumeFreeShotCharge();
    // Persist armed while charges remain, only clear when none left
    if (golfbagTotalFreeShots() > 0) {
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
  modifiersTraversedThisShot = new Set();
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
    // Final hole: points per hole + course completed bonus 50 — only added on clear, not live, subtract attempts — not on tutorial
    if (isTutorialActive()) {
      ball.vel.x = 0;
      ball.vel.y = 0;
      ball.isMoving = false;
      ball.z = 0;
      ball.vz = 0;
      clearFreeShotFlightGlow();
      hideSoftlockBanner();
      resetSoftlockDetection();
      // No points, no summary on tutorial final hole — play congratulations banter before returning
      try{ maybeUpdateHighScore(); }catch{}
      gameState = "WIN";
      updateAttemptsUI();
      if (winOverlay) winOverlay.classList.add("hidden");
      if (nextHoleButton) nextHoleButton.classList.add("hidden");
      if (continueButton) continueButton.classList.add("hidden");
      (async()=>{
        try{ await banterLoadFile(); }catch{}
        const ok = banterPlay('tutorial-hole4-complete', {onComplete: ()=>{ try{ syncBanterSkipButton(); }catch{} try{ finishReturnToMainMenu(); }catch{} }});
        if(!ok) setTimeout(()=>{ try{ finishReturnToMainMenu(); }catch{} }, 600);
        try{ syncBanterSkipButton(); }catch{}
      })();
      return true;
    }
    const traversedF = modifiersTraversedThisShot ? modifiersTraversedThisShot.size : 0;
    const attemptsF = holeAttempts;
    const firstBonusF = attemptsF === 0 ? 50 : 0;
    const courseBonusF = 50;
    const holePointsF = 10 + traversedF * 10 + firstBonusF + courseBonusF - attemptsF;
    totalPoints += holePointsF;
    runPointsEarned += holePointsF;
    runCoinsEarned = runPointsEarned;
    runHolesCleared++;
    ball.vel.x = 0;
    ball.vel.y = 0;
    ball.isMoving = false;
    ball.z = 0;
    ball.vz = 0;
    clearFreeShotFlightGlow();
    hideSoftlockBanner();
    resetSoftlockDetection();
    // No Victory screen – just Hole Completed with course bonus (per 09-21 spec)
    pendingCourseComplete = true;
    try{ showPerHoleSummary(traversedF, attemptsF, firstBonusF, holePointsF, courseBonusF); }catch{}
    // Update high score
    try{ maybeUpdateHighScore(); }catch{}
    // Stay in WIN-like paused state but without winOverlay
    gameState = "WIN";
    updateAttemptsUI();
    if (winOverlay) winOverlay.classList.add("hidden");
    if (nextHoleButton) nextHoleButton.classList.add("hidden");
    if (continueButton) continueButton.classList.add("hidden");
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
  // 11-cutscenes: when active, freeze game physics but advance cutscene & wind
  try { if (cutsceneIsActive()) { try { updateWindUniforms(dt, getWindAt); } catch {}; cutsceneUpdate(dt); try { syncCutsceneSkipButton(); } catch {} return; } } catch {}
  // 12-banter: in-place dialog freezes physics/input like the Hole 1 banner but keeps terrain+wind visible
  try { if (banterIsActive()) { try { updateWindUniforms(dt, getWindAt); } catch {}; banterUpdate(dt); try { updateHotbarUI(); } catch {} try { syncBanterSkipButton(); } catch {} if (charging) { resetCharge(); gameState = "AIMING"; } if (!banterIsActive()) { try { syncBanterSkipButton(); } catch {} } return; } } catch {}
  // Banter just ended on this tick (auto-advance inside banterUpdate above also
  // returns through the branch, but a banter that ended between frames needs a
  // sync so the skip button never leaks into gameplay).
  try { syncBanterSkipButton(); } catch {}
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
  // Starting items or coin summary visible, pause like main menu
  if (startingItemsVisible || loadoutVisible || coinSummaryVisible) {
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
  // 13-tutorial: hole1 liquifier reminders at 3 and 10, hole2 rotator at 3 + gadgets at 5
  if(isTutorialActive() && (gameState==="AIMING"||gameState==="CHARGING") && !holeBannerVisible && !rewardMenuVisible && !attemptsBannerVisible && !freeShotBannerVisible && !banterIsActive() && !cutsceneIsActive()){
    if(currentHoleIndex===0){
      if(!tutorialHole1Liquifier3Shown && holeAttempts>=3){ try{ maybeShowTutorialHole1LiquifierReminder(); }catch{} if(banterIsActive()) return; }
      if(!tutorialHole1Liquifier10Shown && holeAttempts>=10){ try{ maybeShowTutorialHole1LiquifierReminder(); }catch{} if(banterIsActive()) return; }
    } else if(currentHoleIndex===1){
      if(!tutorialHole2RotatorShown && holeAttempts>=3){ try{ maybeShowTutorialHole2RotatorReminder(); }catch{} if(banterIsActive()) return; }
      if(!tutorialHole2GadgetsReminderShown && holeAttempts>=5){ try{ maybeShowTutorialHole2GadgetsReminder(); }catch{} if(banterIsActive()) return; }
    }
  }
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
    // Treasure hit check also in AIMING/CHARGING (for drift or if treasure somehow at tee) — supports 3 chests on hole3
    if (level && !rewardMenuVisible) {
      try {
        for (const tr of getUncollectedTreasures(level)) {
          if (checkTreasureHit(ball.pos, BALL_RADIUS, tr)) {
            collectTreasure(tr);
            // Keep single treasure pointer in sync for backward compat (repoint only,
            // never mutate isCollected — mutating via level.treasure would un-collect
            // the just-collected 2nd/3rd chest on tutorial hole 3).
            if (Array.isArray(level.treasures) && level.treasures.length) level.treasure = level.treasures.find(t=>!t.isCollected) || level.treasures[0];
            rewardPending = true;
            saveProgress();
            maybeShowRewardMenu();
            break;
          }
        }
      } catch {};
    }
  }

  if (gameState === "FLYING") {
    // 14-cheat-mode: held ball sticks to the cursor — wind visuals keep
    // animating but the ball ignores wind/win/treasure/collision until dropped.
    if (cheatDraggingBall) {
      try { updateWindUniforms(dt, getWindAt); } catch {};
      try {
        if (cheatMousePos) {
          const c = cheatClampPos(cheatMousePos);
          ball.pos.x = c.x; ball.pos.y = c.y;
        }
        ball.vel = { x: 0, y: 0 };
      } catch {};
      return;
    }
    try { updateWindUniforms(dt, getWindAt); } catch {};
    updateBall(dt, getWindAt, windStrength, LOGICAL_W, LOGICAL_H);

    // Check win every tick - immediate, regardless of speed (REQ-009)
    if (checkWin()) {
      return;
    }

    // Deferred Game Over: last shot where attemptsLeft becomes 0 is allowed to finish (no immediate Game Over while FLYING)
    // Game Over will be checked only when starting the next attempt (handleLaunch entry) or on reroll

    // Treasure hit (supports 3 chests on hole3) - non-fatal, shows reward immediately (even mid-flight)
    if (level && !rewardMenuVisible) {
      try {
        for (const tr of getUncollectedTreasures(level)) {
          if (checkTreasureHit(ball.pos, BALL_RADIUS, tr)) {
            collectTreasure(tr);
            // Keep single treasure pointer in sync for backward compat (repoint only,
            // never mutate isCollected — see AIMING branch above).
            if (Array.isArray(level.treasures) && level.treasures.length) level.treasure = level.treasures.find(t=>!t.isCollected) || level.treasures[0];
            rewardPending = true;
            saveProgress();
            maybeShowRewardMenu();
            if (rewardMenuVisible) return;
            break;
          }
        }
      } catch {};
    }

    // Track modifiers traversed for points bonus (+10 per unique modifier) – per hole and per shot (bonus only for clearing shot)
    try{
      for(const m of modifiers){
        if(Math.hypot(ball.pos.x - m.x, ball.pos.y - m.y) < (m.radius||54)){
          const key = m.id!==undefined ? String(m.id) : m.x+','+m.y;
          modifiersTraversedThisHole.add(key);
          modifiersTraversedThisShot.add(key);
        }
      }
    }catch{}
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
  // 11-cutscenes: synchronized pan/zoom across both canvases, bg vs character split
  try { if (cutsceneIsActive()) { try { cutsceneRender(bgCtx, ctx, LOGICAL_W, LOGICAL_H); } catch (e) { console.warn('cutscene render failed', e); } try { renderWind(); } catch {} return; } } catch {}
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
  for (const tr of getLevelTreasures(level)) {
    if (tr && !tr.isCollected) { try { drawTreasure(ctx, tr); } catch {}; }
  }
  drawBall(ctx, ball);
  // During the end screen (over the level) no aim/preview/force-bar/softlock chrome.
  // Also suppress aim while a cutscene/banter is active or a hole transition is
  // pending: the ball may still sit in the cleared hole (e.g. tutorial hole 1
  // before the first-restock cutscene) and the orbit must never draw there.
  let _cutActive = false; try { _cutActive = cutsceneIsActive(); } catch {}
  let _banterActive = false; try { _banterActive = banterIsActive(); } catch {}
  if (!rewardMenuVisible && !coinSummaryVisible && !_cutActive && !_banterActive && !pendingHoleAdvance) {
    drawAim(ctx, ball, getAimAngle(), charge, gameState);
  }
  // Preview circle follows mouse when selecting modifier before shooting
  // REQ-020: only show preview if supply allows placement; REQ-021/023: not during reward menu
  if (!rewardMenuVisible && !coinSummaryVisible && !_cutActive && !_banterActive && !pendingHoleAdvance && (gameState === "AIMING" || gameState === "CHARGING") && mousePos && selectedModifier && canPlace(selectedModifier)) {
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, getEffectiveModifierRadius());
  } else if (!rewardMenuVisible && !coinSummaryVisible && !_cutActive && !_banterActive && !pendingHoleAdvance && (gameState === "AIMING" || gameState === "CHARGING") && mousePos && selectedModifier && !canPlace(selectedModifier)) {
    // Insufficient supply: show blocked preview (gray/red) to signal insufficiency
    drawModifierPreview(ctx, mousePos.x, mousePos.y, selectedModifier, getEffectiveModifierRadius(), true);
  }
  // HUD is now HTML #hud on top of canvas (see 03-rendering.md §4) — no canvas drawHUD
  // Power bar under ball when charging per REQ-007
  if (gameState === "CHARGING" && charging && !rewardMenuVisible && !coinSummaryVisible && !_cutActive && !_banterActive && !pendingHoleAdvance) {
    drawForceBar(ctx, ball, charge);
  }
  // Softlock banner (non-blocking) below HUD — informs player they can reset via R or pause menu
  if (softlockBannerVisible && !holeBannerVisible && !attemptsBannerVisible && !freeShotBannerVisible && !rewardMenuVisible && !pauseMenuVisible && !mainMenuVisible && !coinSummaryVisible && !helpVisible && gameState === "FLYING") {
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
    // Still render even when paused. Exception: overlays that play while WIN
    // need their updates ticked here, since update() is otherwise skipped:
    // - tutorial hole-4 congratulations banter (typewriter via banterUpdate,
    //   wind via updateWindUniforms),
    // - end-9-hole cutscene (camera/dialog via cutsceneUpdate, wind visuals).
    // Without these ticks both would be frozen (same root cause).
    try {
      if (cutsceneIsActive()) {
        const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
        try { updateWindUniforms(dt, getWindAt); } catch {}
        try { cutsceneUpdate(dt); } catch {}
        try { syncCutsceneSkipButton(); } catch {}
      } else if (banterIsActive()) {
        const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
        try { updateWindUniforms(dt, getWindAt); } catch {}
        try { banterUpdate(dt); } catch {}
        try { syncBanterSkipButton(); } catch {}
      }
    } catch {}
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
  hudEl = document.getElementById("hud");
  hudHoleEl = document.getElementById("hud-hole");
  hudAttemptsEl = document.getElementById("hud-attempts");
  hudTotalEl = document.getElementById("hud-total");
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
        else if (isLoadoutDismissGraceActive()) { e.preventDefault(); }
        else hideLoadout();
      }
    });
  }
  const pickerOverlay = document.getElementById('loadout-item-picker-overlay');
  const pickerClose = document.getElementById('loadout-picker-close');
  if (pickerClose) pickerClose.addEventListener('click', () => hideLoadoutPicker());
  if (pickerOverlay) pickerOverlay.addEventListener('click', (e) => { if (e.target === pickerOverlay) hideLoadoutPicker(); });
  if (coinSummaryOk) {
    coinSummaryOk.addEventListener('click', () => {
      if (isCoinSummaryAnimating()) fastForwardCoinSummary();
      else hideCoinSummary();
    });
  }
  if (coinSummaryOverlay) {
    coinSummaryOverlay.addEventListener('click', (e) => {
      if (e.target === coinSummaryOverlay) {
        if (isCoinSummaryAnimating()) fastForwardCoinSummary();
        else hideCoinSummary();
      }
    });
  }
  // 11-cutscenes §10b: Skip button top-right — ends the active cutscene at once.
  const cutsceneSkipBtn = document.getElementById('cutscene-skip-button');
  if (cutsceneSkipBtn && !cutsceneSkipBtn._cutBound) {
    cutsceneSkipBtn._cutBound = true;
    cutsceneSkipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); } catch {}
      try { if (cutsceneIsActive()) cutsceneSkip(); } catch {}
    });
  }
  // 12-banter §6: Skip button top-right, same pill design — ends the active banter at once.
  const banterSkipBtn = document.getElementById('banter-skip-button');
  if (banterSkipBtn && !banterSkipBtn._banterBound) {
    banterSkipBtn._banterBound = true;
    banterSkipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); } catch {}
      try { if (banterIsActive()) banterSkip(); } catch {}
      try { syncBanterSkipButton(); } catch {}
    });
  }

  // Parallax layered menu background - subtle mouse parallax with 4 splash layers
  try { initParallax(); } catch (e) { console.warn('parallax init failed', e); }

  setupCanvas();
  // REQ-031: load courses collection before progress (so courseId can be resolved)
  try { loadCourses(); } catch (e) { console.warn('loadCourses failed', e); }
  // Legacy migration (10-progression.md §1.6): detect saves persisted before
  // shopStock existed BEFORE loadProgression normalizes them.
  let legacyMissingShopStock = false;
  try {
    const raw0 = localStorage.getItem(PROGRESSION_KEY);
    if (raw0) {
      try {
        const d0 = JSON.parse(raw0);
        legacyMissingShopStock = !d0 || d0.version !== 1 || !d0.shopStock || typeof d0.shopStock !== 'object';
      } catch { legacyMissingShopStock = true; }
    }
  } catch {}
  try { loadProgression(); } catch (e) { console.warn('loadProgression failed', e); }
  if (legacyMissingShopStock) {
    // Baseline is the milestone-derived stock for already-cleared courses.
    for (const hc of [3, 6, 9]) {
      try {
        const cc = courses.find(x => x.holeCount === hc);
        if (cc && cc.bestTotal !== null && cc.bestTotal !== undefined) grantShopMilestoneStock(hc, false);
      } catch {}
    }
  }
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
          if (data.rewardMenuVisible && (rewardOffered.length >= 1 && rewardOffered.length <= 3)) {
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
  setBagFromTypeList(['liquifier']);
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
    () => rewardMenuVisible ? "REWARD" : banterIsActive() ? "BANTER" : gameState,
    {
      onLaunch: handleLaunch,
      onReset: () => {
        // REQ-021: block R while reward menu visible; REQ-028: block while pause visible; REQ-029: block while main menu visible; 11-banners: block on last attempt
        if (rewardMenuVisible) return;
        if (banterIsActive()) return;
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
        if (banterIsActive()) return;
        if (pauseMenuVisible) return;
        if (mainMenuVisible) return;
        toggleWindThree();
      }
    }
  );

  // Hotbar selection: slot-based (1-4). Slots wire their own click handlers in
  // updateHotbarUI when rebuilt (including discard-mode clicks during reward).
  // Legacy type-based wiring removed.
  if (hotbarEl) {
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
  if (mainEndRunBtnDom) mainEndRunBtnDom.addEventListener("click", () => showEndRunConfirm());
  if (pauseEndRunBtnDom) pauseEndRunBtnDom.addEventListener("click", () => showEndRunConfirm());
  // End Run confirmation overlay wiring
  const endRunConfirmOk = document.getElementById('end-run-confirm-ok');
  const endRunConfirmCancel = document.getElementById('end-run-confirm-cancel');
  const endRunConfirmOverlay = document.getElementById('end-run-confirm-overlay');
  if (endRunConfirmOk) endRunConfirmOk.addEventListener('click', () => { hideEndRunConfirm(); endRun(); });
  if (endRunConfirmCancel) endRunConfirmCancel.addEventListener('click', () => hideEndRunConfirm());
  if (endRunConfirmOverlay) endRunConfirmOverlay.addEventListener('click', (e) => {
    if (e.target === endRunConfirmOverlay) hideEndRunConfirm();
  });
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
    // 11-cutscenes has top priority — Space/R fast-forward and advance dialog, Escape skip
    try { if (cutsceneIsActive()) { if (cutsceneHandleInput(e)) { return; } const ae0=document.activeElement; const isIn0=ae0 && (ae0.tagName==='INPUT'||ae0.tagName==='TEXTAREA'||ae0.isContentEditable); if(!isIn0) e.preventDefault(); return; } } catch {}
    // 12-banter: in-place dialog — Space/R/Click fast-forward then advance, Escape advances (pause stays blocked)
    try { if (banterIsActive()) { banterHandleInput(e); e.preventDefault(); return; } } catch {}
    // Coin summary has top priority (above game over) — animated End Run overlay
    if (coinSummaryVisible) {
      const isDismissKey = e.code === "Escape" || e.code === "Enter" || e.code === "Space" || e.code === "KeyR" || e.key === "r" || e.key === "R";
      if (isDismissKey) {
        if (isCoinSummaryAnimating()) {
          fastForwardCoinSummary();
        } else {
          hideCoinSummary();
        }
        e.preventDefault();
      }
      return;
    }
    // Starting items overlay has next priority — Choose 2 starting items before run
    if (startingItemsVisible) {
      if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3" || e.code === "Digit4") {
        const idx = parseInt(e.code.slice(5),10)-1;
        const type = startingChoices[idx];
        if(type) handleStartingPick(type);
        e.preventDefault(); return;
      }
      if (e.code === "Escape") {
        if (!isLoadoutDismissGraceActive()) hideStartingItems();
        e.preventDefault();
      } else {
        e.preventDefault();
      }
      return;
    }
    if (loadoutVisible) {
      // legacy loadout now hidden - keep disabled
      e.preventDefault(); return;
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
    // End Run confirm has priority when visible
    if (endRunConfirmVisible) {
      if (e.code === "Escape") {
        hideEndRunConfirm();
        e.preventDefault();
        return;
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
    // Reward menu: 1/2/3 selects offered reward; 1-4 on bag discards when pending; S/Skip closes without reward
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
      // Discard mode: Digit1-4 destroys that bag slot to take the pending reward
      if (pendingRewardType && (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3" || e.code === "Digit4")) {
        const idx = Number(e.code.slice(5)) - 1;
        discardBagSlotAndClaimReward(idx);
        e.preventDefault();
        return;
      }
      // Escape skips without reward in all reward-menu modes (same as Skip/S button)
      if (e.code === "Escape") {
        closeRewardMenuWithoutReward();
        e.preventDefault();
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
      } else if (e.code === "KeyS") {
        closeRewardMenuWithoutReward();
        e.preventDefault();
      } else if (e.code === "KeyR" && !isRerollDisabled()) {
        rerollReward();
        e.preventDefault();
      } else if (e.code === "KeyR" && isRerollDisabled()) {
        // Disabled on last attempt — cannot kill yourself with reroll
        e.preventDefault();
      } else if (e.code === "Digit0" || e.code === "Numpad0") {
        // Digit0 no longer rerolls; blocked
        e.preventDefault();
      } else if (e.code === "Escape" || e.code === "Space" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyA" || e.code === "KeyD" || e.code === "Digit4" || e.code === "Digit5") {
        // Block aiming/charging while menu open (Digit4 reserved for bag discard when pending)
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
      // Pickup-discard mode: Escape (or P) leaves the mode without picking up
      if (pendingPickup && (gameState === "AIMING" || gameState === "CHARGING")) {
        cancelPickupDiscard();
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
      if ((gameState === "AIMING" || gameState === "CHARGING") && (selectedModifier !== null || selectedBagIndex !== -1 || isFreeShotActive)) {
        selectedModifier = null; selectedBagIndex = -1;
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
      if (selectedModifier !== null || selectedBagIndex !== -1 || isFreeShotActive) {
        selectedModifier = null; selectedBagIndex = -1;
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
    // Tactical 4-slot bag: Digit1-4 selects the bag slot.
    // Spatial slots arm placement; passive slots (Field Extender/Power Cell) select but never place;
    // Free Shot is display-only and never selectable. In pickup-discard mode 1-4 discards that slot.
    if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3" || e.code === "Digit4") {
      const idx = Number(e.code.slice(5)) - 1;
      if (pendingPickup) {
        discardBagSlotForPickup(idx);
      } else {
        selectBagSlot(idx);
      }
      e.preventDefault();
    } else if (e.code === "Digit5" || e.code === "Numpad5") {
      // No 5th slot — ignore (legacy 5-slot saves truncated to 4)
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
      // Remove last modifier and return to bag if space (tactical model);
      // when full, arm pickup-discard for the last modifier instead of only toasting.
      if (modifiers.length > 0 && (gameState === "AIMING" || gameState === "CHARGING")) {
        if (!golfbagHasEmpty()) {
          const last = modifiers[modifiers.length - 1];
          enterPickupDiscard({ type: last.type, id: last.id, index: modifiers.length - 1 });
        } else {
          const removed = modifiers.pop();
          if (removed && removed.type) {
            addItemToBag(normalizeSupplyType(removed.type));
          }
          syncModifiersToField();
          updateHotbarUI();
          saveProgress();
        }
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

  // 14-cheat-mode: Konami code arms ball drag & drop (Hashimoto Protocol, testing only).
  // Passive observer like the "hole" secret above — never consumes input.
  let _konamiProgress = 0;
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.repeat) return;
    try {
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
    } catch {}
    const code = e.code;
    if (typeof code !== "string" || !code) return;
    if (code === "ShiftLeft" || code === "ShiftRight" || code === "ControlLeft" || code === "ControlRight" || code === "AltLeft" || code === "AltRight" || code === "MetaLeft" || code === "MetaRight" || code === "CapsLock") return;
    if (code === KONAMI_SEQUENCE[_konamiProgress]) {
      _konamiProgress++;
      if (_konamiProgress >= KONAMI_SEQUENCE.length) {
        _konamiProgress = 0;
        try { toggleCheatMode(); } catch {}
      }
    } else {
      // Overlap restart (e.g. Up,Up,Up restarts at 1), otherwise reset.
      _konamiProgress = (code === KONAMI_SEQUENCE[0]) ? 1 : 0;
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
        rewardRerollHover = isRerollHover && !rewardRerolled && getAttemptsLeft() > 1;
      } catch { rewardRerollHover = false; }
      if (hovered) canvas.style.cursor = "pointer";
      else if (rewardRerollHover) canvas.style.cursor = "pointer";
      else canvas.style.cursor = "default";
      return;
    }
    if (gameState !== "AIMING" && gameState !== "CHARGING") {
      // 14-cheat-mode: held ball follows the cursor in FLYING; hovering the
      // ball in a grabbable state shows a grab cursor.
      if (cheatMode && !rewardMenuVisible) {
        const pos = getCanvasMousePos(e);
        if (cheatDraggingBall) {
          const c = cheatClampPos(pos);
          cheatMousePos = c;
          try {
            if (ball && ball.pos) { ball.pos.x = c.x; ball.pos.y = c.y; ball.vel = { x: 0, y: 0 }; }
          } catch {}
          canvas.style.cursor = "grabbing";
          return;
        }
        if (!pauseMenuVisible && !mainMenuVisible && (gameState === "FLYING") && ball && ball.pos &&
            Math.hypot(ball.pos.x - pos.x, ball.pos.y - pos.y) <= BALL_RADIUS + CHEAT_GRAB_RADIUS_PAD) {
          canvas.style.cursor = "grab";
          return;
        }
      }
      mousePos = null;
      return;
    }
    const pos = getCanvasMousePos(e);
    mousePos = pos;
    // 14-cheat-mode: held ball follows the cursor; hovering the ball shows grab.
    if (cheatMode && cheatDraggingBall) {
      const c = cheatClampPos(pos);
      cheatMousePos = c;
      try {
        if (ball && ball.pos) { ball.pos.x = c.x; ball.pos.y = c.y; ball.vel = { x: 0, y: 0 }; }
      } catch {}
      canvas.style.cursor = "grabbing";
      return;
    }
    if (isDragging && draggingIdx !== -1) {
      modifiers[draggingIdx].x = pos.x;
      modifiers[draggingIdx].y = pos.y;
      syncModifiersToField();
      canvas.style.cursor = "grabbing";
    } else {
      // 14-cheat-mode: hovering the ball shows grab (ball wins over modifiers).
      if (cheatMode && !cheatGrabBlocked() && ball && ball.pos &&
          Math.hypot(ball.pos.x - pos.x, ball.pos.y - pos.y) <= BALL_RADIUS + CHEAT_GRAB_RADIUS_PAD) {
        canvas.style.cursor = "grab";
        return;
      }
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
    // 12-banter: block drag-start while the in-place dialog is up
    try { if (banterIsActive()) { banterHandleInput(e); e.preventDefault(); return; } } catch {}
    if (pauseMenuVisible) {
      e.preventDefault();
      return;
    }
    if (rewardMenuVisible) {
      // Block dragging while reward menu open
      e.preventDefault();
      return;
    }
    // 14-cheat-mode: grabbing the ball takes precedence over modifier drag.
    // (Not while resolving a pickup-discard — that flow keeps the map click.)
    if (cheatMode && e.button === 0 && !cheatDraggingBall && !pendingPickup) {
      const pos = getCanvasMousePos(e);
      if (tryCheatGrabBall(pos)) {
        canvas.style.cursor = "grabbing";
        e.preventDefault();
        return;
      }
    }
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    if (e.button !== 0) return; // only left
    // Pickup-discard mode: any map press leaves the mode (click handler finalizes the cancel)
    if (pendingPickup) {
      cancelPickupDiscard();
      e.preventDefault();
      return;
    }
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
    // 14-cheat-mode: dropping the ball ends the drag; wind resumes next tick.
    if (cheatDraggingBall) {
      try {
        const pos = getCanvasMousePos(e);
        dropCheatBall(pos);
      } catch { try { dropCheatBall(null); } catch {} }
      canvas.style.cursor = "default";
    }
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
    // 11-cutscenes: Space/R/Click fast-forward while active
    try { if (cutsceneIsActive()) { cutsceneHandleInput(e); e.preventDefault(); return; } } catch {}
    // 12-banter: clicks advance the in-place dialog, never place modifiers
    try { if (banterIsActive()) { banterHandleInput(e); e.preventDefault(); return; } } catch {}
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
        if (!isRerollDisabled() && pos.x >= rerollRect.x && pos.x <= rerollRect.x + rerollRect.w && pos.y >= rerollRect.y && pos.y <= rerollRect.y + rerollRect.h) {
          rerollReward();
          e.preventDefault();
          return;
        } else if (isRerollDisabled() && pos.x >= rerollRect.x && pos.x <= rerollRect.x + rerollRect.w && pos.y >= rerollRect.y && pos.y <= rerollRect.y + rerollRect.h) {
          // Disabled (last attempt / tutorial / <4 owned kinds) — block click, no reroll
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
    // 14-cheat-mode: swallow the click that ends a ball drag so it can never
    // place a modifier (even if the drop caused an instant reset to AIMING).
    if (cheatSuppressClick) {
      cheatSuppressClick = false;
      e.preventDefault();
      return;
    }
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    if (isDragging) return; // was dragging, not a placement click
    const pos = getCanvasMousePos(e);
    // Pickup-discard mode: clicking anywhere on the map leaves the mode without picking up
    if (pendingPickup) {
      cancelPickupDiscard();
      e.preventDefault();
      return;
    }
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
    if (banterIsActive()) return;
    if (gameState !== "AIMING" && gameState !== "CHARGING") return;
    const pos = getCanvasMousePos(e);
    // If dragging, cancel drag and remove?
    if (isDragging) {
      isDragging = false;
      draggingIdx = -1;
    }
    const overIdx = modifiers.findIndex(m => Math.hypot(m.x - pos.x, m.y - pos.y) < m.radius);
    if (pendingPickup) {
      // Right-click another modifier switches the pickup target; empty map cancels.
      if (overIdx !== -1) {
        enterPickupDiscard({ type: modifiers[overIdx].type, id: modifiers[overIdx].id, index: overIdx });
      } else {
        cancelPickupDiscard();
      }
      return;
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
  // Compat: convert counts to bag slots (truncate to 4, freeShot total becomes one item when >0)
  try {
    const order = [];
    const mag = Math.max(0, Math.floor(newSupply.magnifier ?? newSupply.amplify ?? 0));
    const liq = Math.max(0, Math.floor(newSupply.liquifier ?? newSupply.nullify ?? 0));
    const def = Math.max(0, Math.floor(newSupply.deflector ?? newSupply.flip ?? 0));
    const rot = Math.max(0, Math.floor(newSupply.rotator ?? newSupply.rotate ?? 0));
    const fs = Math.max(0, Math.floor(newSupply.freeShot ?? 0));
    for (let i = 0; i < liq; i++) order.push('liquifier');
    for (let i = 0; i < def; i++) order.push('deflector');
    for (let i = 0; i < rot; i++) order.push('rotator');
    for (let i = 0; i < mag; i++) order.push('magnifier');
    if (fs > 0) order.push({ type: 'freeShot', charges: fs });
    setBagFromTypeList(order.slice(0, GOLFBAG_SIZE));
  } catch {
    supply = {
      magnifier: Math.max(0, newSupply.magnifier ?? newSupply.amplify ?? 0),
      liquifier: Math.max(0, newSupply.liquifier ?? newSupply.nullify ?? 0),
      deflector: Math.max(0, newSupply.deflector ?? newSupply.flip ?? 0),
      rotator: Math.max(0, newSupply.rotator ?? newSupply.rotate ?? 0),
      freeShot: Math.max(0, newSupply.freeShot ?? 0),
    };
  }
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
  window.__getFreeShotSupply = () => golfbagTotalFreeShots();
  window.__setFreeShotSupply = (v) => {
    const n = Math.max(0, Math.floor(v));
    // Compat: set total charges across a single freeShot bag item (or remove if 0)
    for (let i = 0; i < GOLFBAG_SIZE; i++) if (golfbag[i] && bagEntryType(golfbag[i]) === 'freeShot') golfbag[i] = null;
    if (n > 0) addItemToBag('freeShot', n);
    syncDerivedFromBag(); updateHotbarUI();
  };
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
  window.__grantShopMilestoneStock = grantShopMilestoneStock;
  window.__ensureFirstRestockOnSecondRun = ensureFirstRestockOnSecondRun;
  window.__ensureFirstRestockStock = ensureFirstRestockStock;
  window.__isFirstRestockStockPresent = isFirstRestockStockPresent;
  window.__isShopRestockedFirstTime = isShopRestockedFirstTime;
  window.isShopRestockedFirstTime = isShopRestockedFirstTime;
  window.__getRunsStarted = getRunsStarted;
  window.getRunsStarted = getRunsStarted;
  window.__incrementRunsStarted = incrementRunsStarted;
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
  window.__getGolfbag = getGolfbag;
  window.__golfbagUsedCount = golfbagUsedCount;
  window.__golfbagHasEmpty = golfbagHasEmpty;
  window.__golfbagTotalFreeShots = golfbagTotalFreeShots;
  window.__addItemToBag = addItemToBag;
  window.__removeBagSlot = removeBagSlot;
  window.__selectBagSlot = selectBagSlot;
  window.__getSelectedBagIndex = () => selectedBagIndex;
  window.__getPendingRewardType = getPendingRewardType;
  window.__closeRewardMenuWithoutReward = closeRewardMenuWithoutReward;
  window.__discardBagSlotAndClaimReward = discardBagSlotAndClaimReward;
  window.__getBagFromTypeList = setBagFromTypeList;
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
  window.__isLoadoutDismissGraceActive = isLoadoutDismissGraceActive;
  window.__getLoadoutOpenedAt = () => { try { return loadoutOpenedAt; } catch { return 0; } };
  window.__showLoadout = showLoadout;
  window.__hideLoadout = hideLoadout;
  window.__getLoadoutSlots = getLoadoutSlots;
  window.__getUnlockedLoadoutSlots = getUnlockedLoadoutSlots;
  window.getUnlockedLoadoutSlots = getUnlockedLoadoutSlots;
  window.__addToLoadout = addToLoadout;
  window.__removeFromLoadout = removeFromLoadout;
  window.__startCourseWithLoadout = startCourseWithLoadout;
  // 12-banter: in-place May/Caddy dialog between loadout close and Hole 1 banner
  window.__isBanterActive = banterIsActive;
  window.isBanterActive = banterIsActive;
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
  window.__coinSummaryAttempts = coinSummaryAttempts;
  Object.defineProperty(window, 'coinSummaryAttempts', { get: ()=>coinSummaryAttempts, set:(v)=>{coinSummaryAttempts=Math.max(0,Math.floor(v));} });
  Object.defineProperty(window, '__coinSummaryAttempts', { get: ()=>coinSummaryAttempts, set:(v)=>{coinSummaryAttempts=Math.max(0,Math.floor(v));} });
  window.__COINS_PER_ATTEMPT = COINS_PER_ATTEMPT;
  window.COINS_PER_ATTEMPT = COINS_PER_ATTEMPT;
  window.__isCoinSummaryVisible = isCoinSummaryVisible;
  window.__isCoinSummaryAnimating = isCoinSummaryAnimating;
  window.__isMenuReturnDeferred = isMenuReturnDeferred;
  window.__isShopRestockedThisRun = isShopRestockedThisRun;
  window.__isCourseFirstClearThisRun = isCourseFirstClearThisRun;
  window.__isNewCourseUnlockedThisRun = isNewCourseUnlockedThisRun;
  window.__isEnd9HoleCutsceneDue = isEnd9HoleCutsceneDue;
  window.__finishReturnToMainMenu = finishReturnToMainMenu;
  window.__fastForwardCoinSummary = fastForwardCoinSummary;
  window.__showCoinSummary = showCoinSummary;
  window.__hideCoinSummary = hideCoinSummary;
  window.__finalizeRunCoinsAndShowSummary = finalizeRunCoinsAndShowSummary;
  window.__syncCoinSummaryOverlay = syncCoinSummaryOverlay;
  window.__syncProgressionDisplay = syncProgressionDisplay;
  window.__PROGRESSION_KEY = PROGRESSION_KEY;
  window.__COINS_PER_HOLE = COINS_PER_HOLE;
  window.__COINS_PER_ATTEMPT = COINS_PER_ATTEMPT;
  window.__COURSE_COMPLETE_BONUS = COURSE_COMPLETE_BONUS;
  window.__SHOP_PRICE_SPATIAL = SHOP_PRICE_SPATIAL;
  window.__SHOP_PRICE_PASSIVE = SHOP_PRICE_PASSIVE;
  window.getCoins = getCoins;
  window.__getCoins = getCoins;
  window.__LOADOUT_SLOT_COSTS = LOADOUT_SLOT_COSTS;
  window.__DEFAULT_UNLOCKED_SLOTS = DEFAULT_UNLOCKED_SLOTS;
  window.__getUnlockedLoadoutSlots = getUnlockedLoadoutSlots;
  window.getUnlockedLoadoutSlots = getUnlockedLoadoutSlots;
  window.__getNextLoadoutSlotCost = getNextLoadoutSlotCost;
  window.__canUnlockNextLoadoutSlot = canUnlockNextLoadoutSlot;
  window.__unlockNextLoadoutSlot = unlockNextLoadoutSlot;
  window.__setUnlockedLoadoutSlots = setUnlockedLoadoutSlots;
  window.__costFor = costFor;
  window.__loadProgression = loadProgression;
  window.__saveProgression = saveProgression;
  window.__clearProgression = clearProgression;
  window.__progressionPurchase = progressionPurchase;
  window.__isTutorialRun = isTutorialRunActive;
  window.isTutorialRun = isTutorialRunActive;
  window.__isRerollDisabled = isRerollDisabled;
  // 14-cheat-mode test hooks (session-only, never persisted)
  window.__isCheatMode = isCheatMode;
  window.__activateCheatMode = activateCheatMode;
  window.__deactivateCheatMode = deactivateCheatMode;
  window.__toggleCheatMode = toggleCheatMode;
  window.__isCheatDraggingBall = isCheatDraggingBall;
  window.__tryCheatGrabBall = tryCheatGrabBall;
  window.__dropCheatBall = dropCheatBall;
  window.__countOwnedKinds = countOwnedKinds;
  window.__getRewardCardCount = getRewardCardCount;
  Object.defineProperty(window, 'loadoutVisible', { get: () => loadoutVisible, set: (v)=>{loadoutVisible=!!v; syncLoadoutOverlay();} });
  Object.defineProperty(window, '__loadoutVisible', { get: () => loadoutVisible, set: (v)=>{loadoutVisible=!!v; syncLoadoutOverlay();} });
  Object.defineProperty(window, 'loadoutSlots', { get: ()=>[...loadoutSlots], set:(v)=>{ if(Array.isArray(v)) { const p=[...v]; while(p.length<4) p.push(null); loadoutSlots=p.slice(0,4); } syncLoadoutOverlay();} });
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

// 11-cutscenes helpers
// Skip button (10b): visible in the top-right corner only while a cutscene is active.
function syncCutsceneSkipButton() {
  try {
    const btn = document.getElementById('cutscene-skip-button');
    if (!btn) return;
    let active = false;
    try { active = cutsceneIsActive(); } catch {}
    btn.classList.toggle('hidden', !active);
  } catch {}
}
// 12-banter §6: Skip button, same pill design, visible only while banter is active.
function syncBanterSkipButton() {
  try {
    const btn = document.getElementById('banter-skip-button');
    if (!btn) return;
    let active = false;
    try { active = banterIsActive(); } catch {}
    btn.classList.toggle('hidden', !active);
  } catch {}
}
function playCutsceneWrapped(idOrData, opts) {
  // hide wind, hud etc will be synced via isCut check; also pause any banners
  const ok = cutscenePlay(idOrData, {
    onComplete: (completed) => {
      try { updateHotbarUI(); } catch {}
      try { updateAttemptsUI(); } catch {}
      try { syncMainMenu(); } catch {}
      try { redrawBottom(); } catch {}
      try { syncParallaxVisibility(); } catch {}
      try { syncCutsceneSkipButton(); } catch {}
      if (opts && opts.onComplete) try { opts.onComplete(completed); } catch {}
    }
  });
  if (ok) {
    try { updateHotbarUI(); updateAttemptsUI(); } catch {}
    try { syncMainMenu(); } catch {}
    try { redrawBottom(); } catch {}
    try { syncParallaxVisibility(); } catch {}
    try { syncCutsceneSkipButton(); } catch {}
    // Force hide main menu overlay and parallax immediately so cutscene bg is visible (mainMenuVisible stays true until loadout)
    try {
      const el = document.getElementById('main-menu-overlay');
      if (el) { el.classList.add('hidden'); el.classList.remove('with-backdrop'); }
      const parallaxEl = document.getElementById('parallax-scene');
      if (parallaxEl) { parallaxEl.classList.add('hidden'); parallaxEl.setAttribute('aria-hidden','true'); }
      const hud = document.getElementById('hud');
      if (hud) hud.classList.add('hidden');
    } catch {}
    // bind dialog click to advance
    try {
      const dlg = document.getElementById('cutscene-dialog');
      const box = dlg && dlg.querySelector('.cutscene-dialog-box');
      if (box && !box._cutBound) {
        box._cutBound = true;
        box.addEventListener('click', (e)=>{ try{ cutsceneHandleInput({type:'click', preventDefault:()=>{}}); }catch{} e.stopPropagation(); });
      }
      if (dlg && !dlg._cutBound) {
        dlg._cutBound = true;
        dlg.addEventListener('click', (e)=>{ if(e.target===dlg) try{ cutsceneHandleInput({type:'click', preventDefault:()=>{}});}catch{} });
      }
    } catch {}
  }
  return ok;
}
try { if (typeof window !== 'undefined') { window.__playCutscene = playCutsceneWrapped; window.playCutscene = playCutsceneWrapped; window.__isCutsceneActive = cutsceneIsActive; window.isCutsceneActive = cutsceneIsActive; window.__getActiveCutsceneId = cutsceneGetId;   window.__cutsceneSkip = cutsceneSkip; window.__cutsceneLoad = cutsceneLoad; window.__syncCutsceneSkipButton = syncCutsceneSkipButton; window.__syncBanterSkipButton = syncBanterSkipButton; window.__banterSkip = banterSkip; window.__skipBanter = banterSkip; window.__isPickupDiscardActive = isPickupDiscardActive; window.__getPendingPickup = getPendingPickup; window.__enterPickupDiscard = enterPickupDiscard; window.__cancelPickupDiscard = cancelPickupDiscard; window.__discardBagSlotForPickup = discardBagSlotForPickup; window.__validateCutscene = cutsceneValidate; window.__hasSeenCutscene = cutsceneHasSeen; window.__markCutsceneSeen = cutsceneMarkSeen; window.__CUTSCENE_SEEN_KEY = cutsceneSeenKey; window.hasSeenCutscene = cutsceneHasSeen; window.markCutsceneSeen = cutsceneMarkSeen; } } catch {}

export { init, resetBall, gameState, attempts, supply, getSupply, setSupply, addToSupply, canPlace, resetSupply, golfbag, getGolfbag, golfbagUsedCount, golfbagHasEmpty, golfbagTotalFreeShots, addItemToBag, removeBagSlot, selectBagSlot, selectedBagIndex, pendingRewardType, getPendingRewardType, closeRewardMenuWithoutReward, discardBagSlotAndClaimReward, setBagFromTypeList, GOLFBAG_SIZE, FREE_SHOT_CHARGES_PER_ITEM, isPickupDiscardActive, getPendingPickup, enterPickupDiscard, cancelPickupDiscard, discardBagSlotForPickup, syncBanterSkipButton, getModifiers, getSelectedModifier, modifiers, selectedModifier, rewardMenuVisible, rewardClaimedFor, rewardMenuHover, rewardOffered, REWARD_POOL, maybeShowRewardMenu, claimReward, isRewardMenuVisible, getRewardClaimedFor, getRewardMenuState, setRewardClaimedFor, setRewardMenuVisible, getRewardOffered, setRewardOffered, maxAttempts, getMaxAttempts, setMaxAttempts, getAttemptsLeft, areaUpgradeCount, fieldExtenderCount, powerCellCount, getAreaUpgradeCount, getFieldExtenderCount, getPowerCellCount, getAreaMultiplier, getEffectiveModifierRadius, getPowerMultiplier, getEffectiveModifierStrength, addAreaUpgrade, addFieldExtender, addPowerCell, BASE_MODIFIER_RADIUS, BASE_MODIFIER_STRENGTH, bounceBall, rewardPending, rewardRerolled, rewardRerollHover, getRewardRerolled, rerollReward, totalAttempts, holeAttempts, currentHoleIndex, STORAGE_KEY, getSavePayload, saveProgress, loadProgress, clearProgress, pauseMenuVisible, pauseMenuHover, rewardChosenCounts, getRewardChosenCounts, getRewardChosenCount, setRewardChosenCounts, resumeGame, startNewGame, isPauseMenuVisible, mainMenuVisible, mainMenuHover, HIGH_SCORE_KEY, getHighScore, setHighScore, clearHighScore, maybeUpdateHighScore, syncMainMenu, isMainMenuVisible, startNewGameFromMain, endRun, isHotbarCollapsed, isHotbarCollapsedState, toggleHotbar, resetHotbarCollapsed, syncHotbarCollapsedUI, returnToMainMenu, resetGameAfterWin, showGameOver, hideGameOver, handleGameOverReturn, isFreeShotActive, isFreeShotActiveState, canActivateFreeShot, setFreeShotActive, toggleFreeShot, clearFreeShotGlow, holeBannerVisible, attemptsBannerVisible, freeShotBannerVisible, holeBannerText, attemptsBannerText, freeShotBannerText, isHoleBannerVisible, getHoleBannerText, showHoleBanner, hideHoleBanner, isAttemptsBannerVisible, getAttemptsBannerText, showAttemptsBanner, hideAttemptsBanner, maybeShowAttemptsBanner, isFreeShotBannerVisible, getFreeShotBannerText, showFreeShotBanner, hideFreeShotBanner, maybeShowFreeShotBanner, getRewardSeedCounter, setRewardSeedCounter, softlockBannerVisible, softlockBannerText, isSoftlockBannerVisible, getSoftlockBannerText, showSoftlockBanner, hideSoftlockBanner, resetSoftlockDetection, updateSoftlockDetection, isLastAttemptForSoftlock, isLastAttemptForReset, getSoftlockTextForCurrentState, SOFTLOCK_TEXT_NORMAL, SOFTLOCK_TEXT_LAST,
 totalPoints, getTotalPoints, passiveCounts, getPassiveCounts, isStartingItemsVisible, getStartingRemaining, showStartingItems, hideStartingItems, handleStartingPick, showPerHoleSummary, modifiersTraversedThisHole, pendingHoleAdvance, isCheatMode, isCheatDraggingBall, activateCheatMode, deactivateCheatMode, toggleCheatMode, tryCheatGrabBall, dropCheatBall };

// Auto-init when loaded as module via script tag
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
