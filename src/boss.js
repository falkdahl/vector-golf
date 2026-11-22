import { createDimensionYBossLevel } from "./bossLevels.js";
import {
  ball,
  launchBall,
  resetBall as physicsResetBall,
  updateBall,
  BALL_RADIUS,
  isBallAirborne,
  isBallOverTreasure
} from "./physics.js";
import {
  getWindAt,
  getBaseWindAt,
  getFieldComponents,
  cols as fieldCols,
  rows as fieldRows,
  cellW as fieldCellW,
  cellH as fieldCellH
} from "./vectorField.js";
import {
  updateInput,
  getAimAngle,
  charge,
  charging,
  resetCharge
} from "./input.js";
import {
  drawModifiers,
  drawArrowsInModifiers,
  drawBall,
  drawAim,
  drawForceBar,
  drawTreasure,
  drawFreeShotEdgeGlow
} from "./render.js";
import {
  playBossMissileLaunch,
  playBossBarrageShot,
  playVoidBombLaunch,
  playVoidBombImpact,
  playBossExplosion,
  playBossCharge,
  playBossLaser,
  playBossPulse,
  playBossMissileMove,
  playBossMove,
  playBossBallDestroy,
  playBossHit,
  playPlayerHit,
  playBossMissileDestroy,
  playModifierActivated
} from "./audio.js";

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

let bridge = null;
let stage = null;
let state = null;
let active = false;
let nextId = 1;
let ballInsideModifierIds = new Set();
let hud = null;
let keyBound = false;
let arenaCache = null;
let arenaCacheKey = "";
let bossSprite = null;
let bossSpriteBroken = false;
let rocketSprite = null;
let rocketSpriteBroken = false;

function getBossSprite() {
  if (bossSpriteBroken || typeof Image === "undefined") return null;
  if (!bossSprite) {
    try {
      bossSprite = new Image();
      bossSprite.decoding = "async";
      bossSprite.src = new URL("../img/hover-cab.webp", import.meta.url).href;
    } catch {
      bossSpriteBroken = true;
      return null;
    }
  }
  return bossSprite;
}

function getRocketSprite() {
  if (rocketSpriteBroken || typeof Image === "undefined") return null;
  if (!rocketSprite) {
    try {
      rocketSprite = new Image();
      rocketSprite.decoding = "async";
      rocketSprite.src = new URL("../img/rocket.webp", import.meta.url).href;
    } catch {
      rocketSpriteBroken = true;
      return null;
    }
  }
  return rocketSprite;
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function hitDist(ax, ay, bx, by, r) {
  return Math.hypot(ax - bx, ay - by) < r;
}

function hearts(n, max) {
  const full = Math.max(0, Math.min(max, n));
  return "\u2665".repeat(full) + "\u2661".repeat(Math.max(0, max - full));
}

function bossPos() {
  if (!state || !state.boss) {
    if (!stage) return { x: 0, y: 0 };
    return { x: stage.boss.x, y: stage.boss.y };
  }
  return state.boss;
}

// The sprite keeps its full visual size; the collision box is smaller.
function bossHalf() {
  const size = Number(stage && stage.boss && stage.boss.size);
  if (Number.isFinite(size) && size > 0) return size / 2;
  const r = Number(stage && stage.boss && stage.boss.radius) || 30;
  return r;
}

function bossHitHalf() {
  const size = Number(stage && stage.boss && stage.boss.hitboxSize);
  if (Number.isFinite(size) && size > 0) return size / 2;
  return bossHalf() * 0.75;
}

function bossSquareHit(x, y, pad = 0) {
  const bp = bossPos();
  const h = bossHitHalf() + pad;
  return Math.abs(x - bp.x) <= h && Math.abs(y - bp.y) <= h;
}

function easeInOut(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  const from = Number.isFinite(a) ? a : 0;
  const to = Number.isFinite(b) ? b : 0;
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

function settledEntity(x, y) {
  return { x, y, fromX: x, fromY: y, toX: x, toY: y, t: 1, dur: 0.6 };
}

function stepEntity(e, dt) {
  if (!e || e.t >= 1) return;
  e.t = Math.min(1, e.t + dt / Math.max(0.0001, e.dur));
  const k = easeInOut(e.t);
  e.x = lerp(e.fromX, e.toX, k);
  e.y = lerp(e.fromY, e.toY, k);
}

function asteroidTargetCount() {
  const cfg = stage && stage.asteroidField;
  if (!cfg) return 0;
  const base = Math.max(0, Number(cfg.targetCount) || 0);
  const growth = Math.max(0, Number(cfg.growthPerRound) || 0);
  const max = Math.max(base, Number(cfg.maxCount) || base);
  const round = state ? Math.max(1, state.round) : 1;
  return Math.min(max, base + (round - 1) * growth);
}

function spawnAsteroidData(initial, initialY = null) {
  const cfg = stage.asteroidField;
  if (!cfg || !Array.isArray(cfg.lanes) || !cfg.lanes.length) return null;
  const lane = cfg.lanes[Math.floor(Math.random() * cfg.lanes.length)];
  const radius = Math.max(4, Number(lane.radius) || 28);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const stepMin = Math.max(1, Number(cfg.stepMin) || 22);
  const stepMax = Math.max(stepMin, Number(cfg.stepMax) || 64);
  const step = stepMin + Math.random() * (stepMax - stepMin);
  const jitter = Math.max(0, Number(cfg.xJitter) || 0);
  const margin = Math.max(0, Number(cfg.spawnMargin) || 80);
  const H = Number(stage.logicalH) || LOGICAL_H;
  let y;
  if (initial) {
    y = Number.isFinite(initialY) ? initialY : Math.random() * H;
  } else if (dir > 0) {
    y = -radius - Math.random() * margin;
  } else {
    y = H + radius + Math.random() * margin;
  }
  return {
    id: nextId++,
    x: lane.x + (Math.random() - 0.5) * 2 * jitter,
    y,
    radius,
    dir,
    step,
    fromY: y,
    toY: y,
    t: 1,
    dur: Math.max(0.1, Number(cfg.duration) || 0.5)
  };
}

function makeInitialAsteroids() {
  const cfg = stage.asteroidField;
  if (!cfg) return [];
  const count = asteroidTargetCount();
  const H = Number(stage.logicalH) || LOGICAL_H;
  const spacing = count > 0 ? H / count : H;
  const out = [];
  for (let i = 0; i < count; i++) {
    const jitter = (Math.random() - 0.5) * spacing * 0.45;
    const a = spawnAsteroidData(true, (i + 0.5) * spacing + jitter);
    if (a) out.push(a);
  }
  return out;
}

function insideArena(x, y) {
  const a = stage.arena;
  const dx = (x - a.cx) / a.rx;
  const dy = (y - a.cy) / a.ry;
  return dx * dx + dy * dy <= 1.02;
}

function pointOnPath(points, progress) {
  if (!points || !points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const t = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(t));
  const f = t - i;
  const a = points[i];
  const b = points[i + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function makeState(params) {
  const maxPlayer = clampInt(params.lives, 1, 99, 3);
  const maxBoss = clampInt(params.bossLives, 1, 99, stage.boss.lives);
  const start = stage.boss.positions[0] || { x: stage.boss.x, y: stage.boss.y };
  const boss = settledEntity(start.x, start.y);
  boss.angle = Math.atan2(stage.tee.y - start.y, stage.tee.x - start.x);
  return {
    maxPlayerLives: maxPlayer,
    maxBossLives: maxBoss,
    playerLives: maxPlayer,
    bossLives: maxBoss,
    round: 1,
    phase: params.preview ? "preview" : "player", // player | shot | between | bonus | enemy | shift | victory | gameover | preview
    preview: !!params.preview,
    bossPosIndex: 0,
    boss,
    asteroids: makeInitialAsteroids(),
    minions: [],
    projectiles: [],
    barrage: null,
    chests: [],
    blackHoles: [],
    voidBombs: [],
    activeAction: null,
    actionsSinceLaser: 0,
    lastExecutedAction: null,
    chestRespawnRound: 0,
    teePulse: 0,
    bossHitFlash: 0,
    shot: { active: false, elapsed: 0, isBonus: false },
    postShotPending: false,
    bonusAvailable: false,
    enemy: null,
    effects: [],
    death: null,
    playerDeath: null,
    message: "",
    messageTimer: 0,
    debug: !!params.debug,
    params
  };
}

export function initBoss(gameBridge, params = {}) {
  bridge = gameBridge;
  stage = createDimensionYBossLevel();
  state = makeState(params);
  nextId = 1;
  ballInsideModifierIds = new Set();
  active = true;

  const lvl = {
    name: stage.name,
    field: stage.field,
    tee: stage.tee,
    hole: { x: stage.boss.x, y: stage.boss.y, radius: bossHalf() },
    obstacles: [],
    treasures: [],
    canvas: { width: LOGICAL_W, height: LOGICAL_H }
  };

  try { bridge.setLevel(lvl); } catch (e) { bridge.log && bridge.log("setLevel failed", e); }
  try { if (bridge.setWindDPRCap) bridge.setWindDPRCap(1); } catch { }
  try { bridge.setAimAngle(Math.atan2(stage.boss.y - stage.tee.y, stage.boss.x - stage.tee.x)); } catch { }
  try { bridge.setGameState("AIMING"); } catch { }

  spawnMinions(stage.minions.initial, true);
  spawnChest();
  bindDom();
  updateHud();

  if (state.debug) {
    try { console.log("[boss] debug state", getBossState()); } catch { }
  }
  // Route the streak visualization through the base field plus live black-hole
  // sinks, so void bombs visibly bend the wind as soon as they land. The
  // black-hole interiors themselves are hidden from the streak renderer.
  try { if (bridge.setWindSampler) bridge.setWindSampler(getBossVisualWindAt); } catch { }
  syncWindHiddenZones();
  exposeDebug();
}

function bindDom() {
  cacheDom();
  if (hud && hud.root) hud.root.classList.remove("hidden");
  if (!keyBound && typeof window !== "undefined") {
    keyBound = true;
    window.addEventListener("keydown", (e) => {
      if (!active || !state) return;
      if (e.code === "Enter" && state.phase === "bonus") {
        e.preventDefault();
        bossEndPlayerPhase();
      }
    });
  }
}

function cacheDom() {
  if (hud) return;
  const byId = (id) => {
    try { return document.getElementById(id); } catch { return null; }
  };
  hud = {
    root: byId("boss-hud"),
    debug: byId("boss-hud-debug")
  };
}

function updateHud() {
  cacheDom();
  if (!hud || !hud.root || !state) return;
  const set = (el, text) => {
    if (el && el.textContent !== text) el.textContent = text;
  };

  if (hud.debug) {
    hud.debug.classList.toggle("hidden", !state.debug);
    if (state.debug) {
      const bp = bossPos();
      set(hud.debug, `round ${state.round} | ${state.phase} | ball (${ball.pos.x.toFixed(0)},${ball.pos.y.toFixed(0)}) z${ball.z.toFixed(1)} | boss (${Math.round(bp.x)},${Math.round(bp.y)}) | missiles ${state.minions.length}/${stage.minions.max} | projectiles ${state.projectiles.length} | black holes ${state.blackHoles.length} | chests ${state.chests.length} (next ${state.chestRespawnRound || "-"}) | laser ${state.actionsSinceLaser}/${stage.laser.minOtherActionsBetween}`);
    }
  }
}

function message(text, seconds = 2) {
  if (!state) return;
  state.message = text;
  state.messageTimer = seconds;
}

function updateEffects(dt) {
  if (!state.effects.length) return;
  for (const e of state.effects) {
    if (e.delay > 0) {
      e.delay -= dt;
      continue;
    }
    e.t -= dt;
  }
  state.effects = state.effects.filter((e) => (e.delay > 0) || e.t > 0);
}

function addEffect(type, x, y, seconds, extra = null) {
  const e = { type, x, y, t: seconds, max: seconds };
  if (extra) Object.assign(e, extra);
  state.effects.push(e);
}

function moveAsteroids() {
  const cfg = stage.asteroidField;
  if (!cfg) return;
  const H = Number(stage.logicalH) || LOGICAL_H;
  const edge = 24;

  // Rocks that have fully left the canvas despawn; replacements enter from
  // just outside it so the barrier never runs dry.
  state.asteroids = state.asteroids.filter((a) => (
    a.dir > 0 ? a.y - a.radius < H + edge : a.y + a.radius > -edge
  ));
  const target = asteroidTargetCount();
  while (state.asteroids.length < target) {
    const a = spawnAsteroidData(false);
    if (!a) break;
    state.asteroids.push(a);
  }

  // Each enemy turn the whole field advances one short, eased step.
  const dur = Math.max(0.1, Number(cfg.duration) || 0.5);
  for (const a of state.asteroids) {
    a.fromY = a.y;
    a.toY = a.y + a.dir * a.step;
    a.t = 0;
    a.dur = dur;
  }
}

function updateEntityAnimations(dt) {
  const boss = state.boss;
  if (boss) {
    stepEntity(boss, dt);
    // Front of the sprite points to the bottom of the image. While relocating
    // it faces the direction of travel; once settled it turns back toward the
    // player. Ease between the two so the turn never snaps.
    const moving = boss.t < 1;
    const desired = moving
      ? Math.atan2(boss.toY - boss.fromY, boss.toX - boss.fromX)
      : Math.atan2(stage.tee.y - boss.y, stage.tee.x - boss.x);
    if (Number.isFinite(desired)) {
      if (!Number.isFinite(boss.angle)) boss.angle = desired;
      boss.angle = lerpAngle(boss.angle, desired, 1 - Math.exp(-dt * 9));
    }
  }

  for (const a of state.asteroids) {
    if (a.t >= 1) continue;
    a.t = Math.min(1, a.t + dt / Math.max(0.0001, a.dur));
    a.y = lerp(a.fromY, a.toY, easeInOut(a.t));
  }

  for (const m of state.minions.slice()) {
    if (m.t < 1) {
      m.t = Math.min(1, m.t + dt / Math.max(0.0001, m.dur));
      const k = easeInOut(m.t);
      m.x = lerp(m.fromX, m.toX, k);
      m.y = lerp(m.fromY, m.toY, k);
    }
    if (m.emerge && m.t >= 1) {
      // The missile has reached its launch point: face the player from here on.
      m.emerge = false;
      m.angleFrom = Number.isFinite(m.angle) ? m.angle : 0;
      m.angleTo = Math.atan2(stage.tee.y - m.y, stage.tee.x - m.x);
      m.angleT = 0;
      m.angleDur = 0.24;
    }
    if (m.angleT < 1) {
      m.angleT = Math.min(1, m.angleT + dt / Math.max(0.0001, m.angleDur || 0.24));
      m.angle = lerpAngle(m.angleFrom, m.angleTo, easeInOut(m.angleT));
    }
    if (m.reachedTee && m.t >= 1) {
      state.minions = state.minions.filter((x) => x !== m);
      addEffect("explosion", stage.tee.x, stage.tee.y, 0.8, { maxRadius: 78, chunks: 10 });
      try { playBossExplosion(); } catch { }
      loseLife("homing missile");
    }
  }
}

export function updateBoss(dt) {
  if (!active || !state) return;
  const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
  if (step <= 0) return;

  updateEffects(step);
  state.teePulse = Math.max(0, state.teePulse - step);
  state.bossHitFlash = Math.max(0, state.bossHitFlash - step);
  if (state.messageTimer > 0) {
    state.messageTimer -= step;
    if (state.messageTimer <= 0) state.message = "";
  }

  if (state.phase === "victory" || state.phase === "gameover") {
    updateHud();
    return;
  }

  // The shared reward overlay freezes the turn just like campaign play.
  if (bridge && bridge.isRewardVisible && bridge.isRewardVisible()) {
    if (charging) {
      resetCharge();
      bridge.setGameState("AIMING");
    }
    updateHud();
    return;
  }

  if (state.phase === "dying") {
    updateDeath(step);
    updateHud();
    return;
  }

  if (state.phase === "dying-player") {
    updatePlayerDeath(step);
    updateHud();
    return;
  }

  if (state.phase === "preview") {
    updateEntityAnimations(step);
    updateHud();
    return;
  }

  updateEntityAnimations(step);
  if (state.phase === "victory" || state.phase === "gameover") {
    updateHud();
    return;
  }

  if (state.postShotPending) {
    advancePostShot();
    if (state.phase === "victory" || state.phase === "gameover") {
      updateHud();
      return;
    }
  }

  updateBarrage(step);
  updateProjectiles(step);
  updateVoidBombs(step);
  if (state.phase === "victory" || state.phase === "gameover") {
    updateHud();
    return;
  }

  if (state.phase === "enemy") {
    updateEnemy(step);
    updateHud();
    return;
  }

  if (state.phase === "shift") {
    updateShift(step);
    updateHud();
    return;
  }

  if (state.phase === "shot") {
    updateShot(step);
    updateHud();
    return;
  }

  if (state.phase === "player" || state.phase === "bonus") {
    updatePlayerInput(step);
  }

  updateHud();
}

function updatePlayerInput(dt) {
  if (!bridge) return;
  const gs = bridge.getGameState();
  if (gs === "WIN" || gs === "GAME_OVER") return;
  updateInput(dt, gs);
  const next = bridge.getGameState();
  if (charging && next === "AIMING") bridge.setGameState("CHARGING");
  else if (!charging && next === "CHARGING") bridge.setGameState("AIMING");
}

function resetBallToTee() {
  try { physicsResetBall(stage.tee); } catch { }
}

export function bossHandleLaunch(angle, power) {
  if (!active || !state || !bridge) return;
  if (state.phase !== "player" && state.phase !== "bonus") return;
  if (state.postShotPending || bridge.isRewardVisible()) return;

  const isBonus = state.phase === "bonus";
  if (isBonus) {
    if (bridge.getFreeShots() <= 0) {
      startEnemyPhase();
      return;
    }
    if (!bridge.consumeFreeShot()) {
      startEnemyPhase();
      return;
    }
  }

  resetCharge();
  state.shot = { active: true, isBonus };
  state.phase = "shot";
  state.bonusAvailable = false;
  ballInsideModifierIds = new Set();
  try { launchBall(angle, power); } catch { }
  bridge.setGameState("FLYING");
  message(isBonus ? "Free Shot away!" : "Shot away!", 1.1);
  updateHud();
}

export function bossCheatTryGrab(pos) {
  if (!active || !state || !bridge) return false;
  if (!pos || !ball || !ball.pos) return false;
  if (Math.hypot(ball.pos.x - pos.x, ball.pos.y - pos.y) > BALL_RADIUS + 10) return false;
  // Mid-flight re-grab is allowed; the shot keeps its phase and accounting.
  if (state.phase === "shot") return !!(state.shot && state.shot.active);
  if (state.phase !== "player" && state.phase !== "bonus") return false;
  if (state.postShotPending) return false;
  if (bridge.isRewardVisible && bridge.isRewardVisible()) return false;

  const isBonus = state.phase === "bonus";
  if (isBonus) {
    if (bridge.getFreeShots() <= 0) {
      startEnemyPhase();
      return false;
    }
    if (!bridge.consumeFreeShot()) {
      startEnemyPhase();
      return false;
    }
  }

  resetCharge();
  state.shot = { active: true, isBonus };
  state.phase = "shot";
  state.bonusAvailable = false;
  ballInsideModifierIds = new Set();
  ball.isMoving = true;
  ball.vel.x = 0;
  ball.vel.y = 0;
  ball.z = 0;
  ball.vz = 0;
  try { bridge.setGameState("FLYING"); } catch { }
  message("Hashimoto grab", 0.9);
  updateHud();
  return true;
}

function applyBlackHoleSink(x, y, wind) {
  let vx = wind && Number.isFinite(wind.x) ? wind.x : 0;
  let vy = wind && Number.isFinite(wind.y) ? wind.y : 0;
  const cfg = stage.blackHole || {};
  const strength = Math.max(0, Number(cfg.sinkStrength) || 0);
  const falloff = Math.max(1, Number(cfg.sinkFalloff) || 140);
  for (const hole of state.blackHoles) {
    const dx = hole.x - x;
    const dy = hole.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) continue;
    // Strong, short-range sink: the ball is pulled toward the event horizon.
    const mag = strength / (1 + (dist / falloff) ** 2);
    vx += (dx / dist) * mag;
    vy += (dy / dist) * mag;
  }
  return { x: vx, y: vy };
}

function getBossWindAt(x, y) {
  let wind = { x: 0, y: 0 };
  try { wind = getWindAt(x, y); } catch { }
  return applyBlackHoleSink(x, y, wind);
}

function modifierFlashKey(m) {
  try {
    return (m && m.id !== undefined) ? String(m.id) : (m.x + "," + m.y);
  } catch {
    return String(Math.random());
  }
}

function modifierNowMs() {
  try { return performance.now(); } catch { return Date.now(); }
}

// Match campaign behavior: when an entity newly enters a placed modifier
// bubble, flash it and play the activation sound. Each entity keeps its own
// inside-set so crossings retrigger independently.
function trackModifierEntry(x, y, insideIds) {
  if (!bridge || !bridge.getModifiers) return insideIds || new Set();
  let mods = [];
  try { mods = bridge.getModifiers() || []; } catch { return insideIds || new Set(); }
  const prev = insideIds instanceof Set ? insideIds : new Set();
  const nowMs = modifierNowMs();
  const newInside = new Set();
  for (const m of mods) {
    if (!m) continue;
    if (Math.hypot(x - m.x, y - m.y) < (m.radius || 54)) {
      const key = modifierFlashKey(m);
      newInside.add(key);
      if (!prev.has(key)) {
        try { m.flashAt = nowMs; } catch { }
        try { playModifierActivated(m.type); } catch { }
      }
    }
  }
  return newInside;
}

// Streak visualization: base field + live black-hole sinks. Placed modifiers
// stay local and never bend the visible field.
function getBossVisualWindAt(x, y) {
  let wind = { x: 0, y: 0 };
  try { wind = getBaseWindAt(x, y); } catch { }
  return applyBlackHoleSink(x, y, wind);
}

// Hide the vector-field streaks inside black-hole interiors.
function syncWindHiddenZones() {
  if (!bridge || !bridge.setWindHiddenZones) return;
  try {
    const zones = (state && state.blackHoles ? state.blackHoles : [])
      .map((h) => ({ x: h.x, y: h.y, radius: h.radius }));
    bridge.setWindHiddenZones(zones);
  } catch { }
}

function updateShot(dt) {
  // 14-cheat-mode: while the Hashimoto grab holds the ball, physics and
  // collisions are suspended; the ball resumes on release.
  if (bridge && bridge.isCheatDraggingBall && bridge.isCheatDraggingBall()) return;

  try {
    updateBall(dt, getBossWindAt, stage.field.strength, stage.logicalW, stage.logicalH);
  } catch { }

  ballInsideModifierIds = trackModifierEntry(ball.pos.x, ball.pos.y, ballInsideModifierIds);

  // Black holes consume the ball on contact.
  for (const hole of state.blackHoles) {
    if (hitDist(ball.pos.x, ball.pos.y, hole.x, hole.y, hole.radius + BALL_RADIUS)) {
      addEffect("void", ball.pos.x, ball.pos.y, 0.5);
      try { playBossBallDestroy(); } catch { }
      message("The black hole consumed the ball!", 1.6);
      finishShot();
      return;
    }
  }

  // Floating asteroids deflect the ball. They sit in front of the boss so a
  // straight tee->boss shot is always blocked.
  const rocks = state.asteroids || [];
  for (const a of rocks) {
    const dx = ball.pos.x - a.x;
    const dy = ball.pos.y - a.y;
    const minDist = a.radius + BALL_RADIUS;
    const dist = Math.hypot(dx, dy);
    if (dist >= minDist) continue;
    const nx = dist > 0.001 ? dx / dist : 1;
    const ny = dist > 0.001 ? dy / dist : 0;
    ball.pos.x = a.x + nx * (minDist + 0.5);
    ball.pos.y = a.y + ny * (minDist + 0.5);
    const vn = ball.vel.x * nx + ball.vel.y * ny;
    if (vn < 0) {
      const bounce = Number(stage.obstacleBounce) || 0.72;
      ball.vel.x -= (1 + bounce) * vn * nx;
      ball.vel.y -= (1 + bounce) * vn * ny;
    }
    addEffect("rock-hit", a.x + nx * a.radius, a.y + ny * a.radius, 0.35);
    message("Asteroid bounce", 0.8);
    break;
  }

  const bp = bossPos();

  // Boss hit consumes the ball and costs Slicer one life. The hitbox is a
  // square inset inside the larger sprite.
  if (bossSquareHit(ball.pos.x, ball.pos.y, BALL_RADIUS)) {
    state.bossLives = Math.max(0, state.bossLives - 1);
    state.bossHitFlash = 0.42;
    addEffect("boss-hit", bp.x, bp.y, 0.42);
    const disrupted = abortActiveCharge();
    triggerPulse(false);
    try { playBossHit(); } catch { }
    try { playBossBallDestroy(); } catch { }
    if (state.bossLives <= 0) {
      startBossDeath();
      return;
    }
    message(disrupted
      ? `Slicer hit! ${stage.actions[disrupted] ? stage.actions[disrupted].label : "Charge"} canceled! ${state.bossLives} lives left`
      : `Slicer hit! Pulse! ${state.bossLives} lives left`, 2.2);
    finishShot();
    return;
  }

  // Ball destroys minions it rolls through.
  for (const m of state.minions.slice()) {
    if (hitDist(ball.pos.x, ball.pos.y, m.x, m.y, stage.minions.radius + BALL_RADIUS)) {
      state.minions = state.minions.filter((x) => x !== m);
      addEffect("minion-hit", m.x, m.y, 0.32);
      try { playBossMissileDestroy(); } catch { }
      message("Missile destroyed", 1);
      break;
    }
  }

  // Chest pickup opens the existing reward overlay.
  for (const c of state.chests.slice()) {
    if (isBallOverTreasure(ball)) break;
    if (hitDist(ball.pos.x, ball.pos.y, c.x, c.y, c.radius + BALL_RADIUS)) {
      collectChest(c);
      break;
    }
  }

  // Match campaign flight rules: an airborne ball may leave the platform or
  // canvas, and only ends the shot once it lands outside the arena. The ball
  // is never recalled or reset while it is still in flight.
  if (!isBallAirborne(ball) && !insideArena(ball.pos.x, ball.pos.y)) {
    addEffect("void", ball.pos.x, ball.pos.y, 0.4);
    try { playBossBallDestroy(); } catch { }
    finishShot();
  }
}

function finishShot() {
  state.shot.active = false;
  state.phase = "between";
  resetBallToTee();
  resetCharge();
  if (bridge) bridge.setGameState("AIMING");
  state.postShotPending = true;
  advancePostShot();
}

function advancePostShot() {
  if (!state.postShotPending) return;
  if (bridge && bridge.isRewardVisible && bridge.isRewardVisible()) return;
  state.postShotPending = false;

  if (bridge && bridge.getFreeShots() > 0) {
    state.phase = "bonus";
    state.bonusAvailable = true;
    if (bridge) bridge.setGameState("AIMING");
    message("Free Shot available - shoot again or press Enter to end turn", 5);
  } else {
    startEnemyPhase();
  }
}

function startEnemyPhase() {
  if (!state || state.phase === "gameover" || state.phase === "victory") return;
  state.phase = "enemy";
  state.bonusAvailable = false;
  state.postShotPending = false;
  if (charging) resetCharge();
  if (bridge) bridge.setGameState("ENEMY");

  const events = [];
  for (const m of state.minions) {
    if (m) events.push({ type: "minion", id: m.id });
  }
  events.push({ type: "boss" });
  events.push({ type: "finish" });
  state.enemy = { events, index: 0, timer: 0.34 };
  message("Enemy turn", 1);
  updateHud();
}

function updateEnemy(dt) {
  const e = state.enemy;
  if (!e) {
    startPlayerPhase();
    return;
  }
  // A spiral barrage streams out over time; hold the rest of the enemy turn
  // until every projectile has launched. Void bombs must also land first.
  if (state.barrage || state.voidBombs.length) {
    e.timer = 0.1;
    updateHud();
    return;
  }
  e.timer -= dt;
  if (e.timer > 0) return;

  if (e.index >= e.events.length) {
    beginShiftPhase();
    return;
  }

  const ev = e.events[e.index++];
  if (ev.type === "minion") {
    advanceMinion(ev.id);
    e.timer = Math.max(0.2, Number(stage.minions.moveDuration) || 0.34);
  } else if (ev.type === "boss") {
    runBossStep();
    e.timer = 0.5;
  } else {
    beginShiftPhase();
    return;
  }

  if (state.phase === "gameover" || state.phase === "victory") {
    e.timer = Infinity;
  }
}

function beginShiftPhase() {
  if (!state || state.phase === "gameover" || state.phase === "victory") return;
  state.phase = "shift";
  state.enemy = null;
  state.bonusAvailable = false;
  state.postShotPending = false;

  // The boss relocates every turn (never on hit) so repeating the same shot is
  // not possible. It eases to the next preset position instead of snapping.
  const positions = stage.boss.positions;
  if (positions && positions.length) {
    state.bossPosIndex = (state.bossPosIndex + 1) % positions.length;
    const target = positions[state.bossPosIndex];
    const b = state.boss;
    b.fromX = b.x;
    b.fromY = b.y;
    b.toX = target.x;
    b.toY = target.y;
    b.t = 0;
    b.dur = 0.7;
    try { playBossMove(); } catch { }
  }

  moveAsteroids();
  tickBlackHoles();
  if (bridge) bridge.setGameState("ENEMY");
  message("Slicer relocates", 1.1);
  updateHud();
}

function updateShift() {
  if (!state) return;
  const bossMoving = state.boss && state.boss.t < 1;
  const asteroidMoving = state.asteroids.some((a) => a.t < 1);
  const minionMoving = state.minions.some((m) => m.t < 1 || (m.angleT != null && m.angleT < 1));
  if (bossMoving || asteroidMoving || minionMoving) return;
  startPlayerPhase();
}

function startPlayerPhase() {
  if (!state || state.phase === "gameover" || state.phase === "victory") return;
  state.phase = "player";
  state.enemy = null;
  state.bonusAvailable = false;
  state.postShotPending = false;
  state.round += 1;
  resetBallToTee();
  resetCharge();
  if (bridge) bridge.setGameState("AIMING");
  maybeSpawnChest();
  message(`Round ${state.round} - Player Turn`, 1.4);
  updateHud();
}

function chooseBossAction() {
  const pool = ["barrage", "missiles", "voidBombs"];
  if (state.actionsSinceLaser >= stage.laser.minOtherActionsBetween) pool.push("laser");
  let choices = pool.filter((t) => t !== state.lastExecutedAction);
  if (!choices.length) choices = pool;
  const type = choices[Math.floor(Math.random() * choices.length)];
  const cfg = stage.actions[type];
  const telegraph = makeTelegraph(type);
  state.activeAction = { type, label: cfg.label, roundsLeft: cfg.rounds, telegraph };
  message(`Slicer: ${cfg.label} in ${cfg.rounds}`, 2);
  try { playBossCharge(); } catch { }
}

function buildBarrageAngles(count = stage.projectiles.count) {
  const total = Math.max(1, Number(count) || 1);
  const offset = Math.random() * Math.PI * 2;
  const turns = Math.max(0.5, Number(stage.projectiles.spiralTurns) || 2.5);
  const angles = [];
  for (let i = 0; i < total; i++) {
    angles.push(offset + (i / total) * Math.PI * 2 * turns);
  }
  return angles;
}

function makeTelegraph(type) {
  if (type === "barrage") {
    return { angles: buildBarrageAngles() };
  }
  if (type === "missiles" || type === "spawn") {
    const pool = stage.minions.spawns.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    const count = (stage.actions.missiles && stage.actions.missiles.count) || 2;
    return { spawns: pool.slice(0, count) };
  }
  if (type === "voidBombs") {
    return { targets: makeVoidBombTargets() };
  }
  return {};
}

function runBossStep() {
  if (!state.activeAction) {
    chooseBossAction();
    return;
  }
  state.activeAction.roundsLeft -= 1;
  if (state.activeAction.roundsLeft > 0) {
    message(`Slicer: ${state.activeAction.label} in ${state.activeAction.roundsLeft}`, 1.6);
    return;
  }
  const type = state.activeAction.type;
  const telegraph = state.activeAction.telegraph;
  state.activeAction = null;
  executeBossAction(type, telegraph);
}

function executeBossAction(type, telegraph = null) {
  if (!state || state.phase === "gameover" || state.phase === "victory") return;
  state.lastExecutedAction = type;

  if (type === "laser") {
    state.actionsSinceLaser = 0;
    try { playBossLaser(); } catch { }
    addEffect("laser", bossPos().x, bossPos().y, 0.55, { tx: stage.tee.x, ty: stage.tee.y });
    message("Slicer fires a life-removing laser!", 2.4);
    loseLife("laser");
    return;
  }

  state.actionsSinceLaser += 1;

  if (type === "barrage") {
    startBarrage(telegraph);
    message("Projectile barrage!", 1.8);
  } else if (type === "missiles" || type === "spawn") {
    const spawns = telegraph && Array.isArray(telegraph.spawns) ? telegraph.spawns : null;
    const count = (stage.actions.missiles && stage.actions.missiles.count) || 2;
    spawnMinions(count, false, spawns);
    for (let i = 0; i < count; i++) {
      try { playBossMissileLaunch(i * 0.08); } catch { }
    }
    message("Slicer launches homing missiles!", 1.8);
  } else if (type === "voidBombs") {
    const targets = telegraph && Array.isArray(telegraph.targets) ? telegraph.targets : null;
    launchVoidBombs(targets);
    message("Void bombs incoming!", 1.8);
  } else if (type === "pulse") {
    triggerPulse();
    message("Pulse destroys placed items!", 2.2);
  }
}

function abortActiveCharge() {
  if (!state || !state.activeAction) return null;
  if (state.activeAction.roundsLeft <= 0) return null;
  const type = state.activeAction.type;
  state.activeAction = null;
  state.lastExecutedAction = type;
  return type;
}

function triggerPulse(playSound = true) {
  if (!state) return;
  if (bridge && bridge.clearModifiers) bridge.clearModifiers();
  const bp = bossPos();
  addEffect("pulse", bp.x, bp.y, 0.85);
  if (playSound) { try { playBossPulse(); } catch { } }
}

function spawnProjectile(angle) {
  const bp = bossPos();
  const jitter = Number(stage.projectiles.jitter) || 0;
  const speed = stage.projectiles.speed * (0.92 + Math.random() * 0.16);
  const a = angle + (Math.random() - 0.5) * jitter;
  state.projectiles.push({
    id: nextId++,
    x: bp.x + Math.cos(a) * (bossHalf() + 10),
    y: bp.y + Math.sin(a) * (bossHalf() + 10),
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    radius: stage.projectiles.radius,
    life: stage.projectiles.life
  });
  try { playBossBarrageShot(); } catch { }
}

function startBarrage(telegraph = null) {
  const count = Math.max(1, Number(stage.projectiles.count) || 1);
  let angles = telegraph && Array.isArray(telegraph.angles) ? telegraph.angles.slice() : null;
  if (!angles || !angles.length) angles = buildBarrageAngles(count);
  const interval = Math.max(0.001, Number(stage.projectiles.launchInterval) || 0.018);
  spawnProjectile(angles[0]);
  state.barrage = {
    angles,
    nextIndex: 1,
    fired: 1,
    total: angles.length,
    interval,
    timer: interval
  };
  if (state.barrage.nextIndex >= state.barrage.total) state.barrage = null;
}

function updateBarrage(dt) {
  const b = state && state.barrage;
  if (!b) return;
  b.timer -= dt;
  let guard = 0;
  while (b.timer <= 0 && b.nextIndex < b.total && guard++ < 64) {
    spawnProjectile(b.angles[b.nextIndex++]);
    b.fired += 1;
    b.timer += b.interval;
  }
  if (b.nextIndex >= b.total) state.barrage = null;
}

function updateProjectiles(dt) {
  if (!state.projectiles.length) return;
  const keep = [];
  for (const p of state.projectiles) {
    p.life -= dt;
    let wind = { x: 0, y: 0 };
    try { wind = getWindAt(p.x, p.y); } catch { }
    const scale = stage.field.strength * stage.projectiles.windScale;
    p.vx += wind.x * scale * dt;
    p.vy += wind.y * scale * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.insideModifiers = trackModifierEntry(p.x, p.y, p.insideModifiers);

    if (hitDist(p.x, p.y, stage.tee.x, stage.tee.y, 18 + p.radius)) {
      addEffect("tee-hit", stage.tee.x, stage.tee.y, 0.5);
      loseLife("projectile");
      continue;
    }
    if (p.life <= 0 || !insideArena(p.x, p.y)) continue;
    keep.push(p);
  }
  state.projectiles = keep;
  if (state.phase === "gameover" || state.phase === "victory") return;
}

function makeVoidBombTargets(count = null) {
  const cfg = stage.voidBombs || {};
  const total = Math.max(1, Number(count) || Number(cfg.count) || 2);
  const minX = Math.max(0, Number(cfg.targetMinX) || 430);
  const maxX = Math.max(minX, Number(cfg.targetMaxX) || 860);
  const minY = Math.max(0, Number(cfg.targetMinY) || 150);
  const maxY = Math.max(minY, Number(cfg.targetMaxY) || 570);
  const targets = [];
  for (let i = 0; i < total; i++) {
    targets.push({
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY)
    });
  }
  return targets;
}

function launchVoidBombs(targets = null) {
  const cfg = stage.voidBombs || {};
  const list = Array.isArray(targets) && targets.length ? targets : makeVoidBombTargets();
  const bp = bossPos();
  const flightTime = Math.max(0.2, Number(cfg.flightTime) || 1.1);
  const gravity = Math.max(1, Number(cfg.gravity) || 1100);
  const radius = Math.max(2, Number(cfg.radius) || 7);
  for (let i = 0; i < list.length; i++) {
    const target = list[i];
    const spread = (i - (list.length - 1) / 2) * 18;
    const sx = bp.x + spread * 0.4;
    const sy = bp.y + spread;
    state.voidBombs.push({
      id: nextId++,
      x: sx,
      y: sy,
      z: 0,
      vx: (target.x - sx) / flightTime,
      vy: (target.y - sy) / flightTime,
      vz: 0.5 * gravity * flightTime,
      gravity,
      radius,
      targetX: target.x,
      targetY: target.y
    });
    try { playVoidBombLaunch(i * 0.08); } catch { }
  }
}

function updateVoidBombs(dt) {
  const bombs = state.voidBombs;
  if (!bombs || !bombs.length) return;
  const keep = [];
  for (const b of bombs) {
    b.z += b.vz * dt;
    b.vz -= b.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.z <= 0) {
      try { playVoidBombImpact(); } catch { }
      spawnBlackHole(b.x, b.y);
      continue;
    }
    keep.push(b);
  }
  state.voidBombs = keep;
}

function spawnBlackHole(x, y) {
  if (!state) return;
  const cfg = stage.blackHole || {};
  const hole = {
    id: nextId++,
    x,
    y,
    radius: Math.max(8, Number(cfg.radius) || 34),
    roundsLeft: Math.max(1, Number(cfg.rounds) || 2),
    fresh: true
  };
  state.blackHoles.push(hole);
  syncWindHiddenZones();
  addEffect("black-hole-spawn", x, y, 0.6);
  message("A black hole opens!", 1.4);
}

function tickBlackHoles() {
  if (!state || !state.blackHoles.length) return;
  const keep = [];
  for (const hole of state.blackHoles) {
    if (hole.fresh) {
      // The shift immediately after it opens does not count as a round.
      hole.fresh = false;
      keep.push(hole);
      continue;
    }
    hole.roundsLeft -= 1;
    if (hole.roundsLeft > 0) {
      keep.push(hole);
    } else {
      addEffect("black-hole-close", hole.x, hole.y, 0.5);
    }
  }
  state.blackHoles = keep;
  syncWindHiddenZones();
}

function spawnMinions(n, initial, spawnsOverride = null) {
  if (!state || !stage.tee) return;
  const count = clampInt(n, 0, stage.minions.max, 0);
  const bp = bossPos();
  for (let i = 0; i < count; i++) {
    if (state.minions.length >= stage.minions.max) break;
    const spawn = spawnsOverride && spawnsOverride.length
      ? spawnsOverride[i % spawnsOverride.length]
      : stage.minions.spawns[Math.floor(Math.random() * stage.minions.spawns.length)];

    const points = [
      { x: spawn.x, y: spawn.y },
      { x: stage.tee.x, y: stage.tee.y }
    ];

    const minSteps = Math.max(1, Number(stage.minions.minSteps) || 3);
    const maxSteps = Math.max(minSteps, Number(stage.minions.maxSteps) || 5);
    const randomSteps = minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));

    state.minions.push({
      id: nextId++,
      points,
      progress: 0,
      x: bp.x,
      y: bp.y,
      fromX: bp.x,
      fromY: bp.y,
      toX: spawn.x,
      toY: spawn.y,
      t: 0,
      dur: Math.max(0.05, Number(stage.minions.emergeDuration) || 0.7),
      emerge: true,
      angle: Math.atan2(spawn.y - bp.y, spawn.x - bp.x),
      angleFrom: 0,
      angleTo: 0,
      angleT: 1,
      angleDur: 0.24,
      radius: stage.minions.radius,
      steps: randomSteps, // Store unique step count per minion
      reachedTee: false,
      initial: !!initial
    });
  }
}

function advanceMinion(id) {
  const m = state.minions.find((x) => x.id === id);
  if (!m) return;
  if (m.emerge) return;

  try { playBossMissileMove(); } catch { }

  m.progress = Math.min(1, m.progress + 1 / Math.max(1, m.steps));
  const pos = pointOnPath(m.points, m.progress);

  // Ease from the current visual position to the next path node. The final
  // step still animates into the tee before the minion is removed.
  m.fromX = m.x;
  m.fromY = m.y;
  m.toX = pos.x;
  m.toY = pos.y;
  m.t = 0;
  if (m.progress >= 1 - 1e-6) m.reachedTee = true;
}

function loseLife(reason) {
  if (!state || state.phase === "gameover" || state.phase === "victory" || state.phase === "dying-player") return false;
  state.playerLives = Math.max(0, state.playerLives - 1);
  state.teePulse = 0.75;
  try { playPlayerHit(); } catch { }
  if (state.playerLives <= 0) {
    startPlayerDeath();
    return true;
  }
  message(`Tee hit by ${reason}! ${state.playerLives} lives left`, 2);
  return true;
}

const PLAYER_DEATH_SECONDS = 1.7;

function startPlayerDeath() {
  if (!state || state.playerDeath) return;
  state.phase = "dying-player";
  state.enemy = null;
  state.activeAction = null;
  state.bonusAvailable = false;
  state.postShotPending = false;
  state.barrage = null;
  state.projectiles = [];
  state.voidBombs = [];
  state.minions = [];
  state.shot = { active: false, isBonus: false };
  state.playerDeath = { t: 0, shown: false };
  resetCharge();
  try { ball.isMoving = false; ball.vel.x = 0; ball.vel.y = 0; ball.z = 0; ball.vz = 0; } catch { }
  const bx = ball && ball.pos ? ball.pos.x : stage.tee.x;
  const by = ball && ball.pos ? ball.pos.y : stage.tee.y;
  const booms = [
    { x: stage.tee.x, y: stage.tee.y, r: 96, d: 0 },
    { x: bx, y: by, r: 74, d: 0.08 },
    { x: stage.tee.x - 42, y: stage.tee.y + 22, r: 56, d: 0.16 },
    { x: stage.tee.x + 48, y: stage.tee.y - 26, r: 60, d: 0.24 },
    { x: stage.tee.x + 10, y: stage.tee.y + 52, r: 48, d: 0.32 }
  ];
  for (const b of booms) {
    addEffect("explosion", b.x, b.y, 0.9, { delay: b.d, maxRadius: b.r, chunks: 12 });
  }
  try { playBossExplosion(); } catch { }
  message("Dimension Y consumes you...", 5);
  updateHud();
}

function updatePlayerDeath(dt) {
  const d = state && state.playerDeath;
  if (!d) {
    gameOver();
    return;
  }
  d.t += dt;
  if (!d.shown && d.t >= PLAYER_DEATH_SECONDS) {
    d.shown = true;
    gameOver();
  }
}

function maybeSpawnChest() {
  if (!state) return;
  if (state.chestRespawnRound <= 0) return;
  if (state.round < state.chestRespawnRound) return;
  if (state.chests.length >= stage.chests.max) return;
  if (spawnChest()) state.chestRespawnRound = 0;
}

function scheduleChestRespawn() {
  if (!state) return;
  state.chestRespawnRound = state.round + Math.max(1, Math.round(Number(stage.chests.respawnRounds) || 3));
}

function spawnChest() {
  if (!state) return false;
  if (state.chests.length >= stage.chests.max) return false;
  // Chests always drop on the player's (left) half of the arena.
  const halfX = Number(stage.arena && stage.arena.cx) || LOGICAL_W / 2;
  const leftPoints = stage.chests.spawnPoints.filter((p) => p.x < halfX);
  const points = leftPoints.length ? leftPoints : stage.chests.spawnPoints;
  const occupied = new Set(state.chests.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`));
  const candidates = points.filter((p) => !occupied.has(`${p.x},${p.y}`));
  const pool = candidates.length ? candidates : points;
  const p = pool[Math.floor(Math.random() * pool.length)];
  state.chests.push({ id: nextId++, x: p.x, y: p.y, radius: stage.chests.radius, isCollected: false });
  return true;
}

function collectChest(chest) {
  state.chests = state.chests.filter((c) => c !== chest);
  scheduleChestRespawn();
  addEffect("chest", chest.x, chest.y, 0.6);
  message("Chest collected!", 1.4);
  if (bridge && bridge.openReward) bridge.openReward(rollChestOffer());
}

function rollChestOffer() {
  const spatials = ["magnifier", "liquifier", "deflector", "rotator"];
  const passives = ["freeShot", "fieldExtender", "powerCell"];
  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  };
  if (Math.random() < 0.5) {
    const passive = passives[Math.floor(Math.random() * passives.length)];
    return shuffle([passive, ...shuffle(spatials).slice(0, 2)]);
  }
  return shuffle(spatials).slice(0, 3);
}

function gameOver() {
  if (!state) return;
  state.phase = "gameover";
  state.enemy = null;
  state.bonusAvailable = false;
  state.postShotPending = false;
  try { ball.isMoving = false; ball.vel.x = 0; ball.vel.y = 0; ball.z = 0; ball.vz = 0; } catch { }
  updateHud();
  if (bridge && bridge.showGameOver) bridge.showGameOver();
}

function victory() {
  if (!state) return;
  state.phase = "victory";
  state.enemy = null;
  state.bonusAvailable = false;
  state.postShotPending = false;
  try { ball.isMoving = false; ball.vel.x = 0; ball.vel.y = 0; ball.z = 0; ball.vz = 0; } catch { }
  updateHud();
  if (bridge && bridge.showVictory) {
    bridge.showVictory({ rounds: state.round, playerLives: state.playerLives });
  }
}

const DEATH_BOOM_SECONDS = 1.8;
const DEATH_PARTICLE_SECONDS = 3.1;
const DEATH_COLORS = ["#ffffff", "#ffe066", "#ffb703", "#ff4d6d", "#5ee0a0", "#8ecae6"];

function makePixelBurst(x, y, scale = 1) {
  const blocks = [];
  const count = 5 + Math.floor(Math.random() * 7);
  for (let i = 0; i < count; i++) {
    blocks.push({
      dx: (Math.random() - 0.5) * 30 * scale,
      dy: (Math.random() - 0.5) * 30 * scale,
      size: 2 + Math.floor(Math.random() * 5),
      color: DEATH_COLORS[Math.floor(Math.random() * DEATH_COLORS.length)]
    });
  }
  return { x, y, t: 0, max: 0.22 + Math.random() * 0.32, blocks };
}

function startBossDeath() {
  if (!state || state.death) return;
  const bp = bossPos();
  state.phase = "dying";
  state.enemy = null;
  state.activeAction = null;
  state.bonusAvailable = false;
  state.postShotPending = false;
  state.projectiles = [];
  state.voidBombs = [];
  state.blackHoles = [];
  state.minions = [];
  state.shot = { active: false, isBonus: false };
  state.death = { t: 0, exploded: false, booms: [], particles: [], nextBoom: 0 };
  syncWindHiddenZones();
  resetCharge();
  try { ball.isMoving = false; ball.vel.x = 0; ball.vel.y = 0; ball.z = 0; ball.vz = 0; } catch { }
  addEffect("boss-hit", bp.x, bp.y, 0.6);
  message("Slicer destroyed!", 3);
  updateHud();
}

function spawnDeathParticles() {
  const d = state && state.death;
  if (!d) return;
  const bp = bossPos();
  const half = bossHalf();
  for (let i = 0; i < 96; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 240;
    const life = 1.7 + Math.random() * 1.3;
    d.particles.push({
      x: bp.x + (Math.random() * 2 - 1) * half * 0.8,
      y: bp.y + (Math.random() * 2 - 1) * half * 0.8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      size: 2 + Math.floor(Math.random() * 5),
      life,
      maxLife: life,
      color: DEATH_COLORS[Math.floor(Math.random() * DEATH_COLORS.length)]
    });
  }
}

function updateDeath(dt) {
  const d = state && state.death;
  if (!d) {
    victory();
    return;
  }
  d.t += dt;

  if (!d.exploded) {
    d.nextBoom -= dt;
    if (d.nextBoom <= 0) {
      const bp = bossPos();
      const half = bossHalf();
      const bursts = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < bursts; i++) {
        d.booms.push(makePixelBurst(
          bp.x + (Math.random() * 2 - 1) * half * 0.85,
          bp.y + (Math.random() * 2 - 1) * half * 0.85
        ));
      }
      d.nextBoom = 0.035 + Math.random() * 0.08;
    }
    for (const b of d.booms) b.t += dt;
    d.booms = d.booms.filter((b) => b.t < b.max);
    if (d.t >= DEATH_BOOM_SECONDS) {
      d.exploded = true;
      d.booms = [];
      spawnDeathParticles();
      addEffect("pulse", bossPos().x, bossPos().y, 0.8);
      message("Slicer breaks apart in the wind!", 3);
    }
    return;
  }

  const windScale = ((Number(stage.field.strength) || 0) * 1.6);
  for (const p of d.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    let wind = { x: 0, y: 0 };
    try { wind = getWindAt(p.x, p.y) || wind; } catch { }
    p.vx += wind.x * windScale * dt;
    p.vy += wind.y * windScale * dt;
    p.vx *= Math.max(0, 1 - 0.55 * dt);
    p.vy *= Math.max(0, 1 - 0.55 * dt);
  }
  d.particles = d.particles.filter((p) => p.life > 0);

  if (d.t >= DEATH_BOOM_SECONDS + DEATH_PARTICLE_SECONDS) victory();
}

export function bossEndPlayerPhase() {
  if (!active || !state) return;
  if (state.phase !== "bonus") return;
  startEnemyPhase();
}

export function bossHandleResetKey() {
  if (!active || !state) return;
  if (state.phase === "gameover" || state.phase === "victory") {
    if (bridge && bridge.returnToMenu) bridge.returnToMenu();
    return;
  }
  if (state.phase === "player" || state.phase === "bonus") {
    resetBallToTee();
    resetCharge();
    if (bridge) bridge.setGameState("AIMING");
    message("Ball reset", 0.9);
    updateHud();
    return;
  }
  if (state.phase === "shot") {
    // Resetting a live shot recalls the ball but still ends the player's
    // phase, so R cannot be used to dodge the enemy turn for free.
    message("Shot recalled", 1.1);
    finishShot();
    updateHud();
    return;
  }
  if (state.phase === "enemy") {
    message("Enemy turn in progress", 0.8);
  }
}

export function bossShutdown() {
  active = false;
  state = null;
  try { if (bridge && bridge.clearWindSampler) bridge.clearWindSampler(); } catch { }
  try { if (bridge && bridge.setWindHiddenZones) bridge.setWindHiddenZones([]); } catch { }
  if (hud && hud.root) hud.root.classList.add("hidden");
}

export function getBossState() {
  if (!state) return null;
  const bp = bossPos();
  return {
    phase: state.phase,
    round: state.round,
    playerLives: state.playerLives,
    bossLives: state.bossLives,
    maxPlayerLives: state.maxPlayerLives,
    maxBossLives: state.maxBossLives,
    freeShots: bridge ? bridge.getFreeShots() : 0,
    minions: state.minions.length,
    projectiles: state.projectiles.length,
    blackHoles: state.blackHoles.map((h) => ({
      id: h.id,
      x: h.x,
      y: h.y,
      radius: h.radius,
      roundsLeft: h.roundsLeft
    })),
    voidBombs: state.voidBombs.length,
    barrage: state.barrage ? {
      fired: state.barrage.fired,
      total: state.barrage.total,
      interval: state.barrage.interval
    } : null,
    chests: state.chests.length,
    bossPos: { x: bp.x, y: bp.y },
    bossSize: bossHitHalf() * 2,
    death: state.death ? {
      t: state.death.t,
      exploded: state.death.exploded,
      booms: state.death.booms.length,
      particles: state.death.particles.length
    } : null,
    activeAction: state.activeAction ? { type: state.activeAction.type, roundsLeft: state.activeAction.roundsLeft } : null,
    actionsSinceLaser: state.actionsSinceLaser,
    chestRespawnRound: state.chestRespawnRound,
    message: state.message,
    ball: { x: ball.pos.x, y: ball.pos.y, moving: ball.isMoving }
  };
}

function exposeDebug() {
  if (typeof window === "undefined") return;
  window.__boss = {
    active: () => !!active,
    getState: () => getBossState(),
    getStage: () => stage,
    windAt: (x, y) => {
      try { return getWindAt(Number(x) || 0, Number(y) || 0); } catch { return null; }
    },
    baseWindAt: (x, y) => {
      try { return getBaseWindAt(Number(x) || 0, Number(y) || 0); } catch { return null; }
    },
    bossWindAt: (x, y) => {
      try { return getBossWindAt(Number(x) || 0, Number(y) || 0); } catch { return null; }
    },
    visualWindAt: (x, y) => {
      try { return getBossVisualWindAt(Number(x) || 0, Number(y) || 0); } catch { return null; }
    },
    getEntities: () => {
      if (!state) return null;
      const bp = bossPos();
      return {
        boss: { x: bp.x, y: bp.y, radius: bossHitHalf(), size: bossHitHalf() * 2, visualSize: bossHalf() * 2, angle: Number.isFinite(state.boss.angle) ? state.boss.angle : null, moving: state.boss.t < 1 },
        minions: state.minions.map((m) => ({ id: m.id, x: m.x, y: m.y, progress: m.progress, emerge: !!m.emerge, angle: m.angle })),
        projectiles: state.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: p.radius })),
        blackHoles: state.blackHoles.map((h) => ({ id: h.id, x: h.x, y: h.y, radius: h.radius, roundsLeft: h.roundsLeft })),
        voidBombs: state.voidBombs.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, targetX: b.targetX, targetY: b.targetY })),
        chests: state.chests.map((c) => ({ id: c.id, x: c.x, y: c.y })),
        obstacles: (state.asteroids || []).map((a) => ({ id: a.id, x: a.x, y: a.y, radius: a.radius, step: a.step, dir: a.dir, fromY: a.fromY, toY: a.toY, t: a.t })),
        fieldComponents: (() => { try { return getFieldComponents(); } catch { return null; } })(),
        modifiers: (() => { try { return bridge && bridge.getModifiers ? bridge.getModifiers().map((m) => ({ type: m.type, x: m.x, y: m.y, radius: m.radius })) : []; } catch { return []; } })(),
        bag: (() => { try { return bridge && bridge.getBagInfo ? bridge.getBagInfo() : null; } catch { return null; } })(),
        ball: { x: ball.pos.x, y: ball.pos.y, z: ball.z, moving: ball.isMoving }
      };
    },
    setAim: (angle) => {
      const a = Number(angle);
      if (!Number.isFinite(a)) return false;
      try { bridge.setAimAngle(a); } catch { return false; }
      return true;
    },
    launch: (power) => {
      if (!state || (state.phase !== "player" && state.phase !== "bonus")) return false;
      const p = Math.max(50, Math.min(600, Number(power) || 600));
      try { bossHandleLaunch(getAimAngle(), p); } catch { return false; }
      return true;
    },
    setPlayerLives: (n) => {
      if (!state) return;
      state.playerLives = clampInt(n, 0, 99, state.playerLives);
      state.maxPlayerLives = Math.max(state.maxPlayerLives, state.playerLives);
      updateHud();
    },
    setBossLives: (n) => {
      if (!state) return;
      state.bossLives = clampInt(n, 0, 99, state.bossLives);
      state.maxBossLives = Math.max(state.maxBossLives, state.bossLives);
      updateHud();
    },
    damageBoss: (n = 1) => {
      if (!state) return;
      state.bossLives = Math.max(0, state.bossLives - clampInt(n, 1, 99, 1));
      try { playBossHit(); } catch { }
      const disrupted = abortActiveCharge();
      if (disrupted) message(`${stage.actions[disrupted] ? stage.actions[disrupted].label : "Charge"} canceled!`, 1.6);
      if (state.bossLives <= 0) startBossDeath();
      updateHud();
    },
    damagePlayer: (n = 1) => {
      if (!state) return;
      const hits = clampInt(n, 1, 99, 1);
      for (let i = 0; i < hits; i++) loseLife("debug hit");
      updateHud();
    },
    spawnMinions: (n = 1) => {
      spawnMinions(n, false);
      updateHud();
    },
    killMinions: () => {
      if (!state) return;
      state.minions = [];
      updateHud();
    },
    advanceMinions: (steps = 1) => {
      if (!state) return;
      const n = Math.max(1, Math.min(20, Math.floor(Number(steps) || 1)));
      const ids = state.minions.map((m) => m.id);
      for (let s = 0; s < n; s++) {
        for (const id of ids.slice()) advanceMinion(id);
      }
      updateHud();
    },
    spawnChest: () => {
      const ok = spawnChest();
      updateHud();
      return ok;
    },
    collectChest: () => {
      if (!state || !state.chests.length) return false;
      collectChest(state.chests[0]);
      updateHud();
      return true;
    },
    openChestReward: () => {
      if (!state || !bridge || !bridge.openReward) return false;
      bridge.openReward(rollChestOffer());
      return true;
    },
    clearChests: () => {
      if (!state) return;
      state.chests = [];
      updateHud();
    },
    clearProjectiles: () => {
      if (!state) return;
      state.projectiles = [];
    },
    spawnBlackHole: (x, y) => {
      if (!state) return false;
      spawnBlackHole(Number(x) || stage.arena.cx, Number(y) || stage.arena.cy);
      updateHud();
      return true;
    },
    clearBlackHoles: () => {
      if (!state) return;
      state.blackHoles = [];
      syncWindHiddenZones();
      updateHud();
    },
    clearModifiers: () => {
      if (bridge && bridge.clearModifiers) bridge.clearModifiers();
    },
    forceAction: (type, executeNow = false) => {
      const key = type === "spawn" ? "missiles" : type;
      if (!state || !stage.actions[key]) return false;
      const cfg = stage.actions[key];
      state.activeAction = {
        type: key,
        label: cfg.label,
        roundsLeft: executeNow ? 1 : cfg.rounds,
        telegraph: makeTelegraph(key)
      };
      try { playBossCharge(); } catch { }
      if (executeNow) runBossStep();
      updateHud();
      return true;
    },
    startEnemyPhase: () => startEnemyPhase(),
    endPlayerPhase: () => bossEndPlayerPhase(),
    skipToPlayerPhase: () => {
      if (!state) return;
      state.phase = "player";
      state.enemy = null;
      state.postShotPending = false;
      resetBallToTee();
      if (bridge) bridge.setGameState("AIMING");
      updateHud();
    }
  };
}

export function renderBoss(ctx, width = LOGICAL_W, height = LOGICAL_H, dpr = 1) {
  if (!active || !state || !ctx) return;
  const d = Number(dpr) || 1;
  ctx.setTransform(d, 0, 0, d, 0, 0);

  try {
    ctx.drawImage(ensureArenaCache(width, height, d), 0, 0, width, height);
  } catch {
    ctx.clearRect(0, 0, width, height);
    drawArena(ctx, width, height);
  }
  drawAsteroids(ctx);
  drawTelegraph(ctx);

  let mods = [];
  try { mods = bridge && bridge.getModifiers ? bridge.getModifiers() : []; } catch { }
  try { drawModifiers(ctx, mods, performance.now()); } catch { }
  try {
    drawArrowsInModifiers(ctx, getWindAt, mods, fieldCols, fieldRows, fieldCellW, fieldCellH);
  } catch { }

  const dying = state.phase === "dying";
  if (!dying) {
    drawBlackHoles(ctx);
    drawChests(ctx);
    drawMinions(ctx);
    drawBossEntity(ctx);
    drawVoidBombs(ctx);
    drawProjectiles(ctx);
  }
  drawEffects(ctx);
  drawTee(ctx);

  // Player health stays pinned to the tee, never follows the ball.
  try {
    drawHeartRow(ctx, stage.tee.x, stage.tee.y - 30, state.playerLives, state.maxPlayerLives, "#9dffc8");
  } catch { }

  if (dying) {
    drawDeathEffects(ctx);
    if (state.debug) {
      try { drawDebugHitboxes(ctx); } catch { }
    }
    return;
  }

  if (state.phase === "dying-player") {
    if (state.debug) {
      try { drawDebugHitboxes(ctx); } catch { }
    }
    return;
  }

  try { drawBall(ctx, ball); } catch { }
  try { drawAim(ctx, ball, getAimAngle(), charge, bridge ? bridge.getGameState() : "AIMING"); } catch { }
  try { if (bridge && bridge.drawPlacementPreview) bridge.drawPlacementPreview(ctx); } catch { }
  try { drawForceBar(ctx, ball, charge); } catch { }

  const freeShotAvailable = !!bridge && bridge.getFreeShots() > 0;
  const bonusFlight = !!(state.shot && state.shot.active && state.shot.isBonus);
  if (freeShotAvailable && (state.phase === "bonus" || bonusFlight)) {
    try { drawFreeShotEdgeGlow(ctx, width, height); } catch { }
  }
  if (state.debug) {
    try { drawDebugHitboxes(ctx); } catch { }
  }
}

function drawDebugHitboxes(ctx) {
  const bp = bossPos();
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.font = "10px " + uiFont();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.strokeStyle = "rgba(255, 120, 150, 0.85)";
  const bossBox = bossHitHalf() + BALL_RADIUS;
  ctx.strokeRect(bp.x - bossBox, bp.y - bossBox, bossBox * 2, bossBox * 2);

  ctx.strokeStyle = "rgba(255, 183, 3, 0.85)";
  for (const m of state.minions) {
    ctx.beginPath();
    ctx.arc(m.x, m.y, stage.minions.radius + BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 235, 200, 0.9)";
    ctx.fillText(`m${m.id} ${(m.progress * 100).toFixed(0)}%`, m.x, m.y - 18);
  }

  ctx.strokeStyle = "rgba(255, 140, 0, 0.9)";
  for (const p of state.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 215, 0, 0.85)";
  for (const c of state.chests) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius + BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(190, 214, 240, 0.7)";
  for (const a of state.asteroids || []) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.radius + BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(190, 120, 255, 0.9)";
  for (const hole of state.blackHoles || []) {
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius + BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(94, 224, 160, 0.85)";
  ctx.beginPath();
  ctx.arc(stage.tee.x, stage.tee.y, 18 + BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(ball.pos.x, ball.pos.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function ensureArenaCache(width, height, dpr) {
  const d = Math.max(1, Number(dpr) || 1);
  const key = `${width}x${height}@${d.toFixed(2)}`;
  if (arenaCache && arenaCacheKey === key) return arenaCache;
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(width * d));
  off.height = Math.max(1, Math.round(height * d));
  const offCtx = off.getContext("2d");
  offCtx.setTransform(d, 0, 0, d, 0, 0);
  drawArena(offCtx, width, height);
  arenaCache = off;
  arenaCacheKey = key;
  return off;
}

function drawArena(ctx, width, height) {
  const a = stage.arena;

  // Deep void backdrop.
  const bg = ctx.createRadialGradient(a.cx, a.cy, 80, a.cx, a.cy, Math.max(width, height) * 0.72);
  bg.addColorStop(0, "#141027");
  bg.addColorStop(0.55, "#090814");
  bg.addColorStop(1, "#030308");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Sparse deterministic stars.
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const x = (i * 173 + 41) % width;
    const y = (i * 97 + 29) % height;
    const tw = 0.25 + ((i * 7) % 10) / 18;
    ctx.fillStyle = `rgba(180, 205, 255, ${tw})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();

  // Platform body.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(a.cx, a.cy, a.rx, a.ry, 0, 0, Math.PI * 2);
  ctx.clip();

  const g = ctx.createLinearGradient(0, a.cy - a.ry, 0, a.cy + a.ry);
  g.addColorStop(0, "#243d36");
  g.addColorStop(0.48, "#172a27");
  g.addColorStop(1, "#0d1918");
  ctx.fillStyle = g;
  ctx.fillRect(a.cx - a.rx, a.cy - a.ry, a.rx * 2, a.ry * 2);

  // Subtle contour rings.
  ctx.strokeStyle = "rgba(94, 224, 160, 0.08)";
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.ellipse(a.cx, a.cy, a.rx * (i / 5), a.ry * (i / 5), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crescent void shadow on the lower-right edge.
  ctx.beginPath();
  ctx.ellipse(a.cx + 190, a.cy + a.ry + 120, a.rx * 0.92, a.ry * 1.02, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(3, 4, 10, 0.72)";
  ctx.fill();
  ctx.restore();

  // Rim.
  ctx.save();
  ctx.strokeStyle = "rgba(94, 224, 160, 0.85)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(94, 224, 160, 0.75)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(a.cx, a.cy, a.rx, a.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Inner rim accent.
  ctx.save();
  ctx.strokeStyle = "rgba(255, 77, 109, 0.16)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(a.cx, a.cy, a.rx - 14, a.ry - 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAsteroids(ctx) {
  const rocks = state.asteroids || [];
  for (let i = 0; i < rocks.length; i++) {
    const a = rocks[i];
    ctx.save();
    ctx.translate(a.x, a.y);

    const glow = ctx.createRadialGradient(0, 0, a.radius * 0.55, 0, 0, a.radius * 1.55);
    glow.addColorStop(0, "rgba(130, 158, 190, 0.14)");
    glow.addColorStop(1, "rgba(130, 158, 190, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, a.radius * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(5, 7, a.radius * 0.98, a.radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(-a.radius * 0.38, -a.radius * 0.42, a.radius * 0.12, 0, 0, a.radius);
    body.addColorStop(0, "#646c7c");
    body.addColorStop(0.52, "#3c4350");
    body.addColorStop(1, "#171a22");
    ctx.fillStyle = body;
    ctx.strokeStyle = "rgba(9, 11, 16, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sides = 9;
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const rr = a.radius * (0.88 + 0.12 * Math.sin(i * 7.3 + k * 2.1));
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(12, 14, 20, 0.55)";
    for (let k = 0; k < 3; k++) {
      const ang = i * 1.7 + k * 2.4;
      const rr = a.radius * (0.14 + 0.3 * ((k + 1) / 4));
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, a.radius * (0.09 + 0.05 * k), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(190, 214, 240, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, a.radius * 0.9, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTee(ctx) {
  const t = stage.tee;
  ctx.save();
  ctx.translate(t.x, t.y);

  if (state.teePulse > 0) {
    const p = 1 - state.teePulse / 0.75;
    ctx.strokeStyle = `rgba(255, 80, 100, ${0.7 * (1 - p)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + p * 46, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(8, 18, 16, 0.7)";
  ctx.strokeStyle = "#d9fff1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#5ee0a0";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossSprite(ctx, half, alpha = 1) {
  const img = getBossSprite();
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return false;
  const h = half * 2;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.globalAlpha *= alpha;
  try {
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } catch {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

function drawBossFallback(ctx, half, flashing) {
  const r = half * 0.62;
  ctx.fillStyle = flashing ? "#ffffff" : "#230913";
  ctx.strokeStyle = flashing ? "#ffffff" : "#ff4d6d";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff4d6d";
  ctx.shadowBlur = flashing ? 28 : 14;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = flashing ? "#ffffff" : "#ffd166";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBossEntity(ctx) {
  if (state.death) return;
  const bp = bossPos();
  const half = bossHalf();
  ctx.save();
  ctx.translate(bp.x, bp.y);

  // Threat glow.
  const glow = ctx.createRadialGradient(0, 0, half * 0.2, 0, 0, half * 1.7);
  glow.addColorStop(0, "rgba(255, 77, 109, 0.32)");
  glow.addColorStop(1, "rgba(255, 77, 109, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, half * 1.7, 0, Math.PI * 2);
  ctx.fill();

  const flashing = state.bossHitFlash > 0;
  const bossAngle = Number.isFinite(state.boss.angle)
    ? state.boss.angle
    : Math.atan2(stage.tee.y - bp.y, stage.tee.x - bp.x);
  const bossMoving = state.boss.t < 1;
  ctx.save();
  // The sprite's front points down in the art, so local +y is the facing axis.
  ctx.rotate(bossAngle - Math.PI / 2);
  if (bossMoving) drawBossThrusters(ctx, half, state.boss.id || 0);
  if (!drawBossSprite(ctx, half)) drawBossFallback(ctx, half, flashing);
  if (flashing) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(0.85, state.bossHitFlash * 2);
    drawBossSprite(ctx, half);
    ctx.restore();
  }
  ctx.restore();
  ctx.shadowBlur = 0;

  // Corner brackets mark the inset square hitbox.
  ctx.strokeStyle = flashing ? "rgba(255,255,255,0.95)" : "rgba(94, 224, 160, 0.6)";
  ctx.lineWidth = 2;
  const hitHalf = bossHitHalf();
  const hitSize = hitHalf * 2;
  const arm = Math.max(8, hitSize * 0.12);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * hitHalf - sx * arm, sy * hitHalf);
      ctx.lineTo(sx * hitHalf, sy * hitHalf);
      ctx.lineTo(sx * hitHalf, sy * hitHalf - sy * arm);
      ctx.stroke();
    }
  }

  // Health sits directly above the entity.
  drawHeartRow(ctx, 0, -half - 15, state.bossLives, state.maxBossLives, "#ff8fa8");

  ctx.restore();
}

function drawPixelBurst(ctx, b) {
  const fade = Math.max(0, 1 - b.t / b.max);
  const drift = b.t / b.max;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const block of b.blocks) {
    ctx.globalAlpha = fade;
    ctx.fillStyle = block.color;
    ctx.fillRect(
      b.x + block.dx * (1 + drift * 0.7),
      b.y + block.dy * (1 + drift * 0.7),
      block.size,
      block.size
    );
  }
  ctx.restore();
}

function drawDeathEffects(ctx) {
  const d = state && state.death;
  if (!d) return;
  const bp = bossPos();
  const half = bossHalf();

  if (!d.exploded) {
    const flicker = 0.82 + Math.sin(d.t * 37) * 0.18;
    ctx.save();
    ctx.translate(bp.x, bp.y);
    if (!drawBossSprite(ctx, half, flicker)) drawBossFallback(ctx, half, true);
    ctx.restore();
    for (const b of d.booms) drawPixelBurst(ctx, b);
    return;
  }

  const age = d.t - DEATH_BOOM_SECONDS;
  if (age >= 0 && age < 0.32) {
    const a = 1 - age / 0.32;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, half * (0.7 + age * 5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of d.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.restore();
}

function drawHeartRow(ctx, x, y, lives, max, color) {
  const text = hearts(lives, max);
  ctx.save();
  ctx.font = "700 14px " + uiFont();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(4, 6, 12, 0.82)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawBossThrusters(ctx, half, seed) {
  const now = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Two tightly-spaced exhaust plumes behind the sprite while it relocates.
  for (let i = 0; i < 2; i++) {
    const dir = i === 0 ? -1 : 1;
    const x = dir * half * 0.16;
    const flicker = 0.72 + Math.sin(now * 24 + seed * 1.7 + i * 2.1) * 0.28;
    const len = half * (0.5 + flicker * 0.55);
    const w = half * 0.13;
    const grad = ctx.createLinearGradient(x, -half * 0.34, x, -half * 0.34 - len);
    grad.addColorStop(0, "rgba(255, 240, 170, 0.95)");
    grad.addColorStop(0.4, "rgba(255, 150, 45, 0.85)");
    grad.addColorStop(1, "rgba(255, 70, 20, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w, -half * 0.34);
    ctx.quadraticCurveTo(x - w * 0.4, -half * 0.34 - len * 0.55, x, -half * 0.34 - len);
    ctx.quadraticCurveTo(x + w * 0.4, -half * 0.34 - len * 0.55, x + w, -half * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawRocketFlame(ctx, height, moving, seed) {
  if (!moving) return;
  const now = performance.now() / 1000;
  const flicker = 0.75 + Math.sin(now * 26 + seed) * 0.25;
  const len = height * (0.32 + flicker * 0.22);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const grad = ctx.createLinearGradient(0, -height * 0.42, 0, -height * 0.42 - len);
  grad.addColorStop(0, "rgba(255, 235, 150, 0.95)");
  grad.addColorStop(0.45, "rgba(255, 146, 40, 0.8)");
  grad.addColorStop(1, "rgba(255, 70, 20, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-height * 0.1, -height * 0.4);
  ctx.quadraticCurveTo(-height * 0.05, -height * 0.4 - len * 0.55, -height * 0.02 * flicker, -height * 0.4 - len);
  ctx.quadraticCurveTo(height * 0.05, -height * 0.4 - len * 0.55, height * 0.1, -height * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRocket(ctx, m, moving) {
  const radius = Number(m.radius) || Number(stage.minions.radius) || 15;
  const height = radius * 4;
  const img = getRocketSprite();
  drawRocketFlame(ctx, height, moving, m.id || 0);
  if (img && img.complete && img.naturalWidth && img.naturalHeight) {
    const width = height * (img.naturalWidth / img.naturalHeight);
    try {
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      return;
    } catch { }
  }
  // Fallback: simple triangle missile with the tip in the facing direction.
  ctx.fillStyle = "#9adf8f";
  ctx.strokeStyle = "#1c2a18";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.5);
  ctx.lineTo(-height * 0.18, -height * 0.32);
  ctx.lineTo(height * 0.18, -height * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawMinions(ctx) {
  const now = performance.now() / 1000;
  for (const m of state.minions) {
    let angle = Number.isFinite(m.angle) ? m.angle : Math.atan2(m.toY - m.fromY, m.toX - m.fromX);
    if (!Number.isFinite(angle)) angle = Math.PI;
    const moving = m.t < 1 || (m.angleT != null && m.angleT < 1);
    const wobble = moving ? 0 : Math.sin(now * 4 + m.id) * 0.05;
    ctx.save();
    ctx.translate(m.x, m.y);
    // The rocket art points down (tip at the bottom of the image), so rotate
    // its local +y axis onto the direction of travel.
    ctx.rotate(angle - Math.PI / 2 + wobble);
    ctx.shadowColor = "#ff9f1c";
    ctx.shadowBlur = moving ? 14 : 6;
    drawRocket(ctx, m, moving);
    ctx.restore();
  }
}

function drawVoidBombs(ctx) {
  for (const b of state.voidBombs) {
    const lift = Math.max(0, b.z) * 0.55;
    const size = b.radius * (1 + Math.min(1.4, b.z / 260) * 0.35);
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, size * 0.9, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(b.x, b.y - lift);
    const g = ctx.createRadialGradient(-size * 0.35, -size * 0.4, size * 0.15, 0, 0, size);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.65, "#e6e9ef");
    g.addColorStop(1, "#9aa2ad");
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(30, 34, 40, 0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(130, 138, 148, 0.55)";
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * size * 0.36, Math.sin(a) * size * 0.36, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBlackHoles(ctx) {
  const now = performance.now() / 1000;
  for (const hole of state.blackHoles) {
    ctx.save();
    ctx.translate(hole.x, hole.y);

    const glow = ctx.createRadialGradient(0, 0, hole.radius * 0.4, 0, 0, hole.radius * 2.3);
    glow.addColorStop(0, "rgba(150, 90, 255, 0.35)");
    glow.addColorStop(0.55, "rgba(90, 40, 180, 0.16)");
    glow.addColorStop(1, "rgba(60, 20, 120, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, hole.radius * 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#010104";
    ctx.beginPath();
    ctx.arc(0, 0, hole.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(now * 1.4);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(${170 - i * 25}, ${110 + i * 20}, 255, ${0.55 - i * 0.13})`;
      ctx.lineWidth = 2.5 - i * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, hole.radius + 5 + i * 5, i * 1.4, i * 1.4 + Math.PI * 1.15);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(200, 160, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, hole.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}


function drawProjectiles(ctx) {
  for (const p of state.projectiles) {
    ctx.save();
    ctx.shadowColor = "#ff7b00";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffb703";
    ctx.strokeStyle = "#7a2f00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.arc(p.x - p.radius * 0.25, p.y - p.radius * 0.25, p.radius * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawChests(ctx) {
  for (const c of state.chests) {
    try { drawTreasure(ctx, c); } catch { }
  }
}

function drawTelegraph(ctx) {
  const action = state.activeAction;
  if (!action) return;
  const bp = bossPos();
  const now = performance.now() / 1000;
  const alpha = 0.35 + Math.sin(now * 7) * 0.18;

  if (action.type === "barrage" && action.telegraph && action.telegraph.angles) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 183, 3, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    const angles = action.telegraph.angles;
    const stride = Math.max(1, Math.ceil(angles.length / 36));
    for (let i = 0; i < angles.length; i += stride) {
      const a = angles[i];
      ctx.beginPath();
      ctx.moveTo(bp.x + Math.cos(a) * (bossHalf() + 8), bp.y + Math.sin(a) * (bossHalf() + 8));
      ctx.lineTo(bp.x + Math.cos(a) * (bossHalf() + 120), bp.y + Math.sin(a) * (bossHalf() + 120));
      ctx.stroke();
    }
    ctx.restore();
  } else if ((action.type === "missiles" || action.type === "spawn") && action.telegraph && action.telegraph.spawns) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 77, 109, ${alpha + 0.15})`;
    ctx.lineWidth = 2;
    for (const s of action.telegraph.spawns) {
      const pulse = 16 + Math.sin(now * 8) * 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - 7, s.y);
      ctx.lineTo(s.x + 7, s.y);
      ctx.moveTo(s.x, s.y - 7);
      ctx.lineTo(s.x, s.y + 7);
      ctx.stroke();
    }
    ctx.restore();
  } else if (action.type === "voidBombs" && action.telegraph && action.telegraph.targets) {
    ctx.save();
    ctx.strokeStyle = `rgba(180, 120, 255, ${alpha + 0.2})`;
    ctx.fillStyle = `rgba(40, 10, 60, ${0.35 + alpha * 0.3})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    for (const t of action.telegraph.targets) {
      const pulse = 20 + Math.sin(now * 6) * 4;
      ctx.beginPath();
      ctx.moveTo(bp.x, bp.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.x, t.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  } else if (action.type === "pulse") {
    ctx.save();
    ctx.strokeStyle = `rgba(94, 224, 160, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bossHalf() + 24 + Math.sin(now * 5) * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (action.type === "laser") {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 50, 80, ${alpha + 0.25})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(bp.x, bp.y);
    ctx.lineTo(stage.tee.x, stage.tee.y);
    ctx.stroke();
    ctx.restore();
  }

  // Countdown over the boss.
  ctx.save();
  ctx.fillStyle = "rgba(255, 235, 240, 0.95)";
  ctx.font = "700 13px " + uiFont();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  ctx.fillText(`${action.label} in ${Math.max(0, action.roundsLeft)}`, bp.x, bp.y + bossHalf() + 26);
  ctx.restore();
}

function drawEffects(ctx) {
  for (const e of state.effects) {
    if (e.delay > 0) continue;
    const p = Math.max(0, Math.min(1, 1 - e.t / e.max));
    const alpha = Math.max(0, 1 - p);

    if (e.type === "explosion") {
      const maxRadius = Math.max(12, Number(e.maxRadius) || 64);
      const radius = maxRadius * (0.35 + p * 0.85);
      const chunks = Math.max(4, Number(e.chunks) || 9);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, radius);
      grad.addColorStop(0, `rgba(255,255,235, ${0.95 * alpha})`);
      grad.addColorStop(0.25, `rgba(255,214,90, ${0.8 * alpha})`);
      grad.addColorStop(0.65, `rgba(255,92,32, ${0.42 * alpha})`);
      grad.addColorStop(1, "rgba(60, 10, 0, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 235, 180, ${0.85 * alpha})`;
      ctx.lineWidth = 2 + 5 * alpha;
      ctx.beginPath();
      ctx.arc(e.x, e.y, radius * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < chunks; i++) {
        const a = (i / chunks) * Math.PI * 2 + p * 1.6;
        const r = radius * (0.35 + 0.75 * p);
        const s = (1.5 + (i % 4)) * (0.6 + alpha);
        ctx.fillStyle = i % 3 === 0 ? `rgba(255,245,200, ${alpha})` : `rgba(255,140,50, ${0.9 * alpha})`;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (e.type === "pulse") {
      ctx.save();
      ctx.strokeStyle = `rgba(94, 224, 160, ${0.65 * alpha})`;
      ctx.lineWidth = 6 * alpha + 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 30 + p * Math.max(stage.logicalW, stage.logicalH) * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "laser") {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 40, 70, ${0.85 * alpha})`;
      ctx.lineWidth = 4 + 8 * alpha;
      ctx.shadowColor = "#ff2846";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.tx, e.ty);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "boss-hit") {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 235, 160, ${0.9 * alpha})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, bossHalf() * 0.8 + p * 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "tee-hit") {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 60, 90, ${0.8 * alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20 + p * 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "black-hole-spawn" || e.type === "black-hole-close") {
      ctx.save();
      const spawn = e.type === "black-hole-spawn";
      ctx.strokeStyle = spawn
        ? `rgba(200, 150, 255, ${0.85 * alpha})`
        : `rgba(120, 90, 190, ${0.7 * alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, (spawn ? 8 + p * 56 : 60 - p * 40), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "minion-hit" || e.type === "chest" || e.type === "void" || e.type === "rock-hit") {
      ctx.save();
      const color = e.type === "chest" ? "255, 215, 0" : e.type === "void" ? "150, 160, 210" : e.type === "rock-hit" ? "180, 200, 225" : "255, 159, 28";
      ctx.fillStyle = `rgba(${color}, ${0.8 * alpha})`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rr = 8 + p * 34;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 2.4 * alpha + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function uiFont() {
  return '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", system-ui, -apple-system, sans-serif';
}
