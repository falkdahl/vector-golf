import { createBossStage1 } from "./bossLevels.js";
import {
  ball,
  launchBall,
  resetBall as physicsResetBall,
  updateBall,
  BALL_RADIUS,
  isBallOverTreasure
} from "./physics.js";
import {
  getWindAt,
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

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

let bridge = null;
let stage = null;
let state = null;
let active = false;
let nextId = 1;
let hud = null;
let keyBound = false;

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
  if (!stage || !state) return { x: 0, y: 0 };
  const list = stage.boss.positions;
  return list[state.bossPosIndex % list.length] || { x: stage.boss.x, y: stage.boss.y };
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
  return {
    maxPlayerLives: maxPlayer,
    maxBossLives: maxBoss,
    playerLives: maxPlayer,
    bossLives: maxBoss,
    round: 1,
    phase: "player", // player | shot | between | bonus | enemy | victory | gameover
    bossPosIndex: 0,
    minions: [],
    projectiles: [],
    chests: [],
    activeAction: null,
    actionsSinceLaser: 0,
    lastExecutedAction: null,
    graceTimer: 0,
    teePulse: 0,
    bossHitFlash: 0,
    shot: { active: false, elapsed: 0, isBonus: false },
    postShotPending: false,
    bonusAvailable: false,
    enemy: null,
    effects: [],
    message: "",
    messageTimer: 0,
    debug: !!params.debug,
    params
  };
}

export function initBoss(gameBridge, params = {}) {
  bridge = gameBridge;
  stage = createBossStage1();
  state = makeState(params);
  nextId = 1;
  active = true;

  const lvl = {
    name: stage.name,
    field: stage.field,
    tee: stage.tee,
    hole: { x: stage.boss.x, y: stage.boss.y, radius: stage.boss.radius },
    obstacles: [],
    treasures: [],
    canvas: { width: LOGICAL_W, height: LOGICAL_H }
  };

  try { bridge.setLevel(lvl); } catch (e) { bridge.log && bridge.log("setLevel failed", e); }
  try { bridge.setAimAngle(Math.atan2(stage.boss.y - stage.tee.y, stage.boss.x - stage.tee.x)); } catch { }
  try { bridge.setGameState("AIMING"); } catch { }

  spawnMinions(stage.minions.initial, true);
  spawnChest();
  bindDom();
  updateHud();

  if (state.debug) {
    try { console.log("[boss] debug state", getBossState()); } catch { }
  }
  exposeDebug();
}

function bindDom() {
  cacheDom();
  if (hud && hud.root) hud.root.classList.remove("hidden");
  if (hud && hud.endTurn && !hud.endTurn._bossBound) {
    hud.endTurn._bossBound = true;
    hud.endTurn.addEventListener("click", () => {
      try { bossEndPlayerPhase(); } catch { }
    });
  }
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
    player: byId("boss-hud-player"),
    boss: byId("boss-hud-boss"),
    action: byId("boss-hud-action"),
    minions: byId("boss-hud-minions"),
    chests: byId("boss-hud-chests"),
    phase: byId("boss-hud-phase"),
    free: byId("boss-hud-free"),
    message: byId("boss-hud-message"),
    debug: byId("boss-hud-debug"),
    endTurn: byId("boss-end-turn")
  };
}

function phaseLabel() {
  if (!state) return "";
  switch (state.phase) {
    case "player": return "Player Turn";
    case "bonus": return "Bonus Shot";
    case "shot": return "Ball in Flight";
    case "between": return "Resolving...";
    case "enemy": return "Enemy Turn";
    case "victory": return "Stage Cleared";
    case "gameover": return "Game Over";
    default: return state.phase;
  }
}

function updateHud() {
  cacheDom();
  if (!hud || !hud.root || !state) return;
  const set = (el, text) => {
    if (el && el.textContent !== text) el.textContent = text;
  };
  const free = bridge ? bridge.getFreeShots() : 0;
  set(hud.player, `Player: ${hearts(state.playerLives, state.maxPlayerLives)}`);
  set(hud.boss, `${stage.bossName}: ${hearts(state.bossLives, state.maxBossLives)}`);
  let actionText = "Action: \u2014";
  if (state.activeAction) {
    actionText = `Action: ${state.activeAction.label} in ${Math.max(0, state.activeAction.roundsLeft)}`;
  } else if (state.phase === "enemy") {
    actionText = "Action: choosing...";
  }
  set(hud.action, actionText);
  set(hud.minions, `Minions: ${state.minions.length}`);
  set(hud.chests, `Chests: ${state.chests.length}`);
  set(hud.phase, phaseLabel());
  set(hud.free, `Free Shots: ${free}`);
  set(hud.message, state.message || "");
  if (hud.endTurn) hud.endTurn.classList.toggle("hidden", state.phase !== "bonus");

  if (hud.debug) {
    hud.debug.classList.toggle("hidden", !state.debug);
    if (state.debug) {
      const bp = bossPos();
      set(hud.debug, `round ${state.round} | ${state.phase} | ball (${ball.pos.x.toFixed(0)},${ball.pos.y.toFixed(0)}) z${ball.z.toFixed(1)} | boss (${Math.round(bp.x)},${Math.round(bp.y)}) | minions ${state.minions.length}/${stage.minions.max} | projectiles ${state.projectiles.length} | chests ${state.chests.length} | grace ${state.graceTimer.toFixed(2)} | laser ${state.actionsSinceLaser}/${stage.laser.minOtherActionsBetween}`);
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
  for (const e of state.effects) e.t -= dt;
  state.effects = state.effects.filter((e) => e.t > 0);
}

function addEffect(type, x, y, seconds, extra = null) {
  const e = { type, x, y, t: seconds, max: seconds };
  if (extra) Object.assign(e, extra);
  state.effects.push(e);
}

export function updateBoss(dt) {
  if (!active || !state) return;
  const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
  if (step <= 0) return;

  updateEffects(step);
  state.graceTimer = Math.max(0, state.graceTimer - step);
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

  if (state.postShotPending) {
    advancePostShot();
    if (state.phase === "victory" || state.phase === "gameover") {
      updateHud();
      return;
    }
  }

  updateProjectiles(step);
  if (state.phase === "victory" || state.phase === "gameover") {
    updateHud();
    return;
  }

  if (state.phase === "enemy") {
    updateEnemy(step);
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
  state.shot = { active: true, elapsed: 0, isBonus };
  state.phase = "shot";
  state.bonusAvailable = false;
  try { launchBall(angle, power); } catch { }
  bridge.setGameState("FLYING");
  message(isBonus ? "Free Shot away!" : "Shot away!", 1.1);
  updateHud();
}

function updateShot(dt) {
  state.shot.elapsed += dt;

  try {
    updateBall(dt, getWindAt, stage.field.strength, stage.logicalW, stage.logicalH);
  } catch { }

  const bp = bossPos();

  // Boss hit consumes the ball and costs Slicer one life.
  if (hitDist(ball.pos.x, ball.pos.y, bp.x, bp.y, stage.boss.radius + BALL_RADIUS)) {
    state.bossLives = Math.max(0, state.bossLives - 1);
    state.bossHitFlash = 0.42;
    addEffect("boss-hit", bp.x, bp.y, 0.42);
    state.bossPosIndex = (state.bossPosIndex + 1) % stage.boss.positions.length;
    if (state.activeAction && state.activeAction.type === "barrage") {
      state.activeAction.telegraph = makeTelegraph("barrage");
    }
    if (state.bossLives <= 0) {
      message("Slicer destroyed!", 5);
      victory();
      return;
    }
    message(`Slicer hit! ${state.bossLives} lives left`, 2);
    finishShot();
    return;
  }

  // Ball destroys minions it rolls through.
  for (const m of state.minions.slice()) {
    if (hitDist(ball.pos.x, ball.pos.y, m.x, m.y, stage.minions.radius + BALL_RADIUS)) {
      state.minions = state.minions.filter((x) => x !== m);
      addEffect("minion-hit", m.x, m.y, 0.32);
      message("Minion destroyed", 1);
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

  if (!insideArena(ball.pos.x, ball.pos.y)) {
    addEffect("void", ball.pos.x, ball.pos.y, 0.4);
    finishShot();
    return;
  }
  if (state.shot.elapsed >= stage.shotTimeout) {
    message("Shot recalled", 1.1);
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
  e.timer -= dt;
  if (e.timer > 0) return;

  if (e.index >= e.events.length) {
    startPlayerPhase();
    return;
  }

  const ev = e.events[e.index++];
  if (ev.type === "minion") {
    advanceMinion(ev.id);
    e.timer = 0.24;
  } else if (ev.type === "boss") {
    runBossStep();
    e.timer = 0.5;
  } else {
    startPlayerPhase();
    return;
  }

  if (state.phase === "gameover" || state.phase === "victory") {
    e.timer = Infinity;
  }
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
  const pool = ["barrage", "spawn", "pulse"];
  if (state.actionsSinceLaser >= stage.laser.minOtherActionsBetween) pool.push("laser");
  let choices = pool.filter((t) => t !== state.lastExecutedAction);
  if (!choices.length) choices = pool;
  const type = choices[Math.floor(Math.random() * choices.length)];
  const cfg = stage.actions[type];
  const telegraph = makeTelegraph(type);
  state.activeAction = { type, label: cfg.label, roundsLeft: cfg.rounds, telegraph };
  message(`Slicer: ${cfg.label} in ${cfg.rounds}`, 2);
}

function makeTelegraph(type) {
  const bp = bossPos();
  if (type === "barrage") {
    const base = Math.atan2(stage.tee.y - bp.y, stage.tee.x - bp.x);
    const count = stage.projectiles.count;
    const angles = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
      angles.push(base + t * stage.projectiles.spread);
    }
    return { angles };
  }
  if (type === "spawn") {
    const pool = stage.minions.spawns.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }
    return { spawns: pool.slice(0, stage.actions.spawn.count) };
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
    addEffect("laser", bossPos().x, bossPos().y, 0.55, { tx: stage.tee.x, ty: stage.tee.y });
    message("Slicer fires a life-removing laser!", 2.4);
    loseLife("laser", true);
    return;
  }

  state.actionsSinceLaser += 1;

  if (type === "barrage") {
    spawnProjectiles();
    message("Projectile barrage!", 1.8);
  } else if (type === "spawn") {
    const spawns = telegraph && Array.isArray(telegraph.spawns) ? telegraph.spawns : null;
    spawnMinions(stage.actions.spawn.count, false, spawns);
    message("Slicer spawns minions!", 1.8);
  } else if (type === "pulse") {
    if (bridge && bridge.clearModifiers) bridge.clearModifiers();
    state.chests = [];
    addEffect("pulse", bossPos().x, bossPos().y, 0.85);
    message("Pulse destroys placed items and chests!", 2.2);
  }
}

function spawnProjectiles() {
  const bp = bossPos();
  const base = Math.atan2(stage.tee.y - bp.y, stage.tee.x - bp.x);
  const count = stage.projectiles.count;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
    const angle = base + t * stage.projectiles.spread + (Math.random() - 0.5) * 0.06;
    const speed = stage.projectiles.speed * (0.92 + Math.random() * 0.16);
    state.projectiles.push({
      id: nextId++,
      x: bp.x + Math.cos(angle) * (stage.boss.radius + 10),
      y: bp.y + Math.sin(angle) * (stage.boss.radius + 10),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: stage.projectiles.radius,
      life: stage.projectiles.life
    });
  }
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

function spawnMinions(n, initial, spawnsOverride = null) {
  if (!state) return;
  const count = clampInt(n, 0, stage.minions.max, 0);
  for (let i = 0; i < count; i++) {
    if (state.minions.length >= stage.minions.max) break;
    const spawn = spawnsOverride && spawnsOverride.length
      ? spawnsOverride[i % spawnsOverride.length]
      : stage.minions.spawns[Math.floor(Math.random() * stage.minions.spawns.length)];
    const points = [{ x: spawn.x, y: spawn.y }];
    for (const p of stage.minions.path) points.push({ x: p.x, y: p.y });
    state.minions.push({
      id: nextId++,
      points,
      progress: 0,
      x: spawn.x,
      y: spawn.y,
      radius: stage.minions.radius,
      initial: !!initial
    });
  }
}

function advanceMinion(id) {
  const m = state.minions.find((x) => x.id === id);
  if (!m) return;
  m.progress = Math.min(1, m.progress + 1 / Math.max(1, stage.minions.steps));
  const pos = pointOnPath(m.points, m.progress);
  m.x = pos.x;
  m.y = pos.y;
  if (m.progress >= 1 - 1e-6) {
    state.minions = state.minions.filter((x) => x !== m);
    addEffect("tee-hit", stage.tee.x, stage.tee.y, 0.5);
    loseLife("minion");
  }
}

function loseLife(reason, ignoreGrace = false) {
  if (!state || state.phase === "gameover" || state.phase === "victory") return false;
  if (!ignoreGrace && state.graceTimer > 0) {
    message("Grace window - no life lost", 0.8);
    return false;
  }
  state.playerLives = Math.max(0, state.playerLives - 1);
  state.graceTimer = stage.graceSeconds;
  state.teePulse = 0.75;
  if (state.playerLives <= 0) {
    message("Dimension Y consumes you...", 5);
    gameOver();
    return true;
  }
  message(`Tee hit by ${reason}! ${state.playerLives} lives left`, 2);
  return true;
}

function maybeSpawnChest() {
  if (!state) return;
  if (state.chests.length >= stage.chests.max) return;
  if (state.round % stage.chests.everyRounds !== 0) return;
  spawnChest();
}

function spawnChest() {
  if (!state) return false;
  if (state.chests.length >= stage.chests.max) return false;
  const occupied = new Set(state.chests.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`));
  const candidates = stage.chests.spawnPoints.filter((p) => !occupied.has(`${p.x},${p.y}`));
  const pool = candidates.length ? candidates : stage.chests.spawnPoints;
  const p = pool[Math.floor(Math.random() * pool.length)];
  state.chests.push({ id: nextId++, x: p.x, y: p.y, radius: stage.chests.radius, isCollected: false });
  return true;
}

function collectChest(chest) {
  state.chests = state.chests.filter((c) => c !== chest);
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
  if (hud && hud.root) hud.root.classList.add("hidden");
  if (hud && hud.endTurn) hud.endTurn.classList.add("hidden");
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
    chests: state.chests.length,
    bossPos: { x: bp.x, y: bp.y },
    activeAction: state.activeAction ? { type: state.activeAction.type, roundsLeft: state.activeAction.roundsLeft } : null,
    actionsSinceLaser: state.actionsSinceLaser,
    graceTimer: state.graceTimer,
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
    getEntities: () => {
      if (!state) return null;
      const bp = bossPos();
      return {
        boss: { x: bp.x, y: bp.y, radius: stage.boss.radius },
        minions: state.minions.map((m) => ({ id: m.id, x: m.x, y: m.y, progress: m.progress })),
        projectiles: state.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
        chests: state.chests.map((c) => ({ id: c.id, x: c.x, y: c.y })),
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
      if (state.bossLives <= 0) victory();
      updateHud();
    },
    damagePlayer: (n = 1) => {
      if (!state) return;
      state.playerLives = Math.max(0, state.playerLives - clampInt(n, 1, 99, 1));
      if (state.playerLives <= 0) gameOver();
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
    clearModifiers: () => {
      if (bridge && bridge.clearModifiers) bridge.clearModifiers();
    },
    forceAction: (type, executeNow = false) => {
      if (!state || !stage.actions[type]) return false;
      const cfg = stage.actions[type];
      state.activeAction = {
        type,
        label: cfg.label,
        roundsLeft: executeNow ? 1 : cfg.rounds,
        telegraph: makeTelegraph(type)
      };
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
  ctx.clearRect(0, 0, width, height);

  drawArena(ctx, width, height);
  drawTelegraph(ctx);

  let mods = [];
  try { mods = bridge && bridge.getModifiers ? bridge.getModifiers() : []; } catch { }
  try { drawModifiers(ctx, mods, performance.now()); } catch { }
  try {
    drawArrowsInModifiers(ctx, getWindAt, mods, fieldCols, fieldRows, fieldCellW, fieldCellH);
  } catch { }

  drawChests(ctx);
  drawMinions(ctx);
  drawBossEntity(ctx);
  drawProjectiles(ctx);
  drawEffects(ctx);
  drawTee(ctx);

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
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, stage.boss.radius + BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

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

function drawTee(ctx) {
  const t = stage.tee;
  const now = performance.now() / 1000;
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

  ctx.strokeStyle = "rgba(217, 255, 241, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(0, -42);
  ctx.stroke();
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(22 + Math.sin(now * 2) * 2, -36);
  ctx.lineTo(0, -30);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBossEntity(ctx) {
  const bp = bossPos();
  const now = performance.now() / 1000;
  const r = stage.boss.radius;
  ctx.save();
  ctx.translate(bp.x, bp.y);

  // Threat glow.
  const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, r * 2.2);
  glow.addColorStop(0, "rgba(255, 77, 109, 0.35)");
  glow.addColorStop(1, "rgba(255, 77, 109, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  const flashing = state.bossHitFlash > 0;

  // Outer saucer.
  ctx.fillStyle = flashing ? "#ffffff" : "#230913";
  ctx.strokeStyle = flashing ? "#ffffff" : "#ff4d6d";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ff4d6d";
  ctx.shadowBlur = flashing ? 28 : 14;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rotating blades.
  ctx.save();
  ctx.rotate(now * 0.85);
  ctx.fillStyle = flashing ? "rgba(255,255,255,0.9)" : "rgba(255, 77, 109, 0.72)";
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.2);
    ctx.lineTo(r * 1.15, -r * 0.04);
    ctx.lineTo(r * 0.34, r * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Core.
  ctx.shadowBlur = 18;
  ctx.fillStyle = flashing ? "#ffffff" : "#ffd166";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a0710";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
  ctx.fill();

  // Angle brackets.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(94, 224, 160, 0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - now * 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8));
    ctx.lineTo(Math.cos(a) * (r + 18), Math.sin(a) * (r + 18));
    ctx.stroke();
  }

  // Name plate.
  ctx.fillStyle = "rgba(255, 230, 240, 0.9)";
  ctx.font = "700 12px " + uiFont();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(stage.bossName, 0, -r - 24);

  ctx.restore();
}

function drawMinions(ctx) {
  const now = performance.now() / 1000;
  for (const m of state.minions) {
    const pos = pointOnPath(m.points, m.progress);
    const next = pointOnPath(m.points, Math.min(1, m.progress + 0.02));
    let angle = Math.atan2(next.y - pos.y, next.x - pos.x);
    if (!Number.isFinite(angle)) angle = Math.PI;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.shadowColor = "#ff9f1c";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ff9f1c";
    ctx.strokeStyle = "#2a0d02";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe8c2";
    ctx.beginPath();
    ctx.arc(2, 0, 2.4 + Math.sin(now * 5 + m.id) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawProjectiles(ctx) {
  for (const p of state.projectiles) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 159, 28, 0.45)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x - p.vx * 0.075, p.y - p.vy * 0.075);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    ctx.shadowColor = "#ff7b00";
    ctx.shadowBlur = 14;
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
    ctx.arc(p.x - 2, p.y - 2, p.radius * 0.36, 0, Math.PI * 2);
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
    for (const a of action.telegraph.angles) {
      ctx.beginPath();
      ctx.moveTo(bp.x + Math.cos(a) * (stage.boss.radius + 8), bp.y + Math.sin(a) * (stage.boss.radius + 8));
      ctx.lineTo(bp.x + Math.cos(a) * (stage.boss.radius + 120), bp.y + Math.sin(a) * (stage.boss.radius + 120));
      ctx.stroke();
    }
    ctx.restore();
  } else if (action.type === "spawn" && action.telegraph && action.telegraph.spawns) {
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
  } else if (action.type === "pulse") {
    ctx.save();
    ctx.strokeStyle = `rgba(94, 224, 160, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, stage.boss.radius + 24 + Math.sin(now * 5) * 8, 0, Math.PI * 2);
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
  ctx.fillText(`${action.label} in ${Math.max(0, action.roundsLeft)}`, bp.x, bp.y + stage.boss.radius + 26);
  ctx.restore();
}

function drawEffects(ctx) {
  for (const e of state.effects) {
    const p = Math.max(0, Math.min(1, 1 - e.t / e.max));
    const alpha = Math.max(0, 1 - p);

    if (e.type === "pulse") {
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
      ctx.arc(e.x, e.y, stage.boss.radius * 0.6 + p * 90, 0, Math.PI * 2);
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
    } else if (e.type === "minion-hit" || e.type === "chest" || e.type === "void") {
      ctx.save();
      const color = e.type === "chest" ? "255, 215, 0" : e.type === "void" ? "150, 160, 210" : "255, 159, 28";
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
