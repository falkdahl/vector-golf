import { isInsideNullify as vfIsInsideNullify } from "./vectorField.js";

export const PARTICLE_COUNT = 80;

let particles = [];
let showWind = true;
let canvasW = 1280;
let canvasH = 720;

export function setCanvasSize(w, h) {
  canvasW = w;
  canvasH = h;
}

// Background images for REQ-030 — tiled grass (level) vs splash (main menu)
const grassImg = new Image();
grassImg.src = './img/grass_seamless.webp';
const splashImg = new Image();
splashImg.src = './img/gfg-splash.png';
splashImg.onerror = () => {
  if (splashImg.src.includes('gfg-splash.png')) {
    splashImg.src = './img/gfg-spash.png';
  }
};
const GRASS_SCALE = 0.38; // scale down grass texture so strands appear smaller (1024 -> ~389)
let grassPattern = null;
let grassPatternCtx = null;
let grassPatternScaledCanvas = null;
function ensureGrassPattern(ctx) {
  try {
    if (grassImg.complete && grassImg.naturalWidth && ctx) {
      // Rebuild if ctx changed (canvas resized resets context) or no pattern yet
      if (grassPattern && grassPatternCtx !== ctx) {
        grassPattern = null;
        grassPatternScaledCanvas = null;
      }
      if (grassPattern) return;
      // Create a scaled-down offscreen tile so grass strands appear smaller
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
      grassPattern = ctx.createPattern(off, 'repeat');
      grassPatternCtx = ctx;
    }
  } catch {}
}
export function getGrassImage() { return grassImg; }
export function getSplashImage() { return splashImg; }
export function isGrassLoaded() { return grassImg.complete && grassImg.naturalWidth > 0; }
export function isSplashLoaded() { return splashImg.complete && splashImg.naturalWidth > 0; }

export function isWindVisible() {
  return showWind;
}

export function toggleWind() {
  showWind = !showWind;
}

function isInsideNullify(x, y) {
  try { return vfIsInsideNullify(x, y); } catch { return false; }
}

function randomSpawnOutsideNullify() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = Math.random() * canvasW;
    const y = Math.random() * canvasH;
    if (!isInsideNullify(x, y)) return { x, y };
  }
  // Fallback if map is mostly covered — return last attempt even if inside (avoid infinite loop)
  return { x: Math.random() * canvasW, y: Math.random() * canvasH };
}

export function initParticles(count = PARTICLE_COUNT, width = 1280, height = 720) {
  canvasW = width;
  canvasH = height;
  particles = [];
  for (let i = 0; i < count; i++) {
    const pos = randomSpawnOutsideNullify();
    particles.push({
      x: pos.x,
      y: pos.y,
      life: Math.random() * 2,
      maxLife: 2
    });
  }
}

export function updateParticles(dt, getWindAt) {
  if (!showWind) return;
  for (const p of particles) {
    const wind = getWindAt(p.x, p.y);
    const speed = 50; // particleSpeed
    p.x += wind.x * speed * dt;
    p.y += wind.y * speed * dt;
    // Wrap
    if (p.x < 0) p.x = canvasW;
    if (p.x > canvasW) p.x = 0;
    if (p.y < 0) p.y = canvasH;
    if (p.y > canvasH) p.y = 0;
    // Do not stay inside nullify per new requirement — immediately respawn outside
    if (isInsideNullify(p.x, p.y)) {
      const pos = randomSpawnOutsideNullify();
      p.x = pos.x;
      p.y = pos.y;
      p.life = 2;
      p.maxLife = 2;
      continue;
    }
    p.life -= dt;
    if (p.life <= 0) {
      // Fade-die after 2s per REQ-004, respawn uniformly random across whole map but outside nullify
      const pos = randomSpawnOutsideNullify();
      p.x = pos.x;
      p.y = pos.y;
      p.life = 2;
      p.maxLife = 2;
    }
  }
}

export function drawBackground(ctx, width, height, mode = 'grass') {
  // REQ-030: bottom canvas only — mode 'grass' tiled grass_seamless.webp, 'splash' gfg-splash.png cover
  // Fallback to green mottling if images not yet loaded
  if (mode === 'splash') {
    // Splash cover
    ctx.save();
    // fallback fill first
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    if (splashImg.complete && splashImg.naturalWidth) {
      const scale = Math.max(width / splashImg.naturalWidth, height / splashImg.naturalHeight);
      const w = splashImg.naturalWidth * scale;
      const h = splashImg.naturalHeight * scale;
      const x = (width - w) / 2;
      const y = (height - h) / 2;
      ctx.drawImage(splashImg, x, y, w, h);
    } else {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
    return;
  }
  // mode 'grass' — tiled seamless texture scaled down so strands appear smaller
  if (isGrassLoaded()) {
    if (!grassPattern) ensureGrassPattern(ctx);
    if (grassPattern) {
      ctx.save();
      ctx.fillStyle = grassPattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return;
    }
    // fallback if pattern creation failed: drawImage tiled manually with scaled size
    ctx.save();
    ctx.fillStyle = '#3a9d23';
    ctx.fillRect(0, 0, width, height);
    try {
      const iw = Math.round(grassImg.naturalWidth * GRASS_SCALE);
      const ih = Math.round(grassImg.naturalHeight * GRASS_SCALE);
      if (iw && ih) {
        for (let y = 0; y < height; y += ih) {
          for (let x = 0; x < width; x += iw) {
            ctx.drawImage(grassImg, x, y, iw, ih);
          }
        }
      }
    } catch {}
    ctx.restore();
    return;
  }
  // Fallback while loading — old green mottling
  ctx.fillStyle = "#3a9d23";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  for (let i = 0; i < 180; i++) {
    const x = (i * 137.508) % width;
    const y = (i * 73.273) % height;
    const w = 18 + ((i * 31) % 24);
    const h = 14 + ((i * 17) % 18);
    const v = (i * 29) % 3;
    ctx.fillStyle = v === 0 ? "rgba(0,0,0,0.05)" : v === 1 ? "rgba(255,255,255,0.04)" : "rgba(20,80,20,0.06)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
// Backward compat: old call without mode still shows grass
export function drawBackgroundTiled(ctx, width, height) { return drawBackground(ctx, width, height, 'grass'); }
export function drawSplashCover(ctx, width, height) { return drawBackground(ctx, width, height, 'splash'); }

export function drawArrows(ctx, fieldOrGetWindAt, cols, rows, cellW, cellH) {
  if (!showWind) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Short arrows per REQ-004 & REQ-015: reflect modified field inside modifiers, varying strength per location
  const MIN_MAG = 0.66; // for WIND_STRENGTH 90, min force 60 (10% of 600)
  const MAX_MAG_RANGE = 1.5; // variation from field generation (1.0*1.5)
  // Support both old signature (field array) and new getWindAt function for modifier-aware arrows
  const isFunction = typeof fieldOrGetWindAt === 'function';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const vec = isFunction ? fieldOrGetWindAt(cx, cy) : fieldOrGetWindAt[row][col];
      const mag = Math.hypot(vec.x, vec.y);
      const angle = Math.atan2(vec.y, vec.x);
      // Normalize magnitude to 0-1 for visual encoding, do not scale length linearly with raw mag
      const normalizedMag = Math.max(0, Math.min(1, (mag - MIN_MAG) / MAX_MAG_RANGE));
      const len = 10 + normalizedMag * 4; // 10-14px, max ≤16, variation ≤4px
      const alpha = 0.55 + normalizedMag * 0.40; // 0.55-0.95 more visible
      const headSize = 4.5 + normalizedMag * 2; // 4.5-6.5px
      // More visible color: bright off-white / pale yellow with high contrast on grass
      // Use white-yellow that pops on green (#3a9d23) and still distinct from water/sand/tree
      const arrowColor = `rgba(255,255,245,${alpha})`;
      const outlineColor = `rgba(0,0,0,0.55)`;
      // Draw dark outline / shadow first for contrast
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * len * 0.4, cy - Math.sin(angle) * len * 0.4);
      ctx.lineTo(cx + Math.cos(angle) * len * 0.6, cy + Math.sin(angle) * len * 0.6);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // arrow line - bright
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * len * 0.4, cy - Math.sin(angle) * len * 0.4);
      ctx.lineTo(cx + Math.cos(angle) * len * 0.6, cy + Math.sin(angle) * len * 0.6);
      ctx.stroke();
      // head with outline
      const hx = cx + Math.cos(angle) * len * 0.6;
      const hy = cy + Math.sin(angle) * len * 0.6;
      // outline
      ctx.fillStyle = outlineColor;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(angle - 0.45) * (headSize + 1.2), hy - Math.sin(angle - 0.45) * (headSize + 1.2));
      ctx.lineTo(hx - Math.cos(angle + 0.45) * (headSize + 1.2), hy - Math.sin(angle + 0.45) * (headSize + 1.2));
      ctx.closePath();
      ctx.fill();
      // fill bright
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(angle - 0.45) * headSize, hy - Math.sin(angle - 0.45) * headSize);
      ctx.lineTo(hx - Math.cos(angle + 0.45) * headSize, hy - Math.sin(angle + 0.45) * headSize);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawParticles(ctx) {
  if (!showWind) return;
  ctx.save();
  for (const p of particles) {
    // Fade over 2s per REQ-004: alpha = life / maxLife
    const alpha = Math.max(0, Math.min(1, p.life / (p.maxLife || 2))) * 0.65;
    ctx.fillStyle = `rgba(180,220,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawObstacles(ctx, obstacles) {
  ctx.save();
  for (let idx = 0; idx < obstacles.length; idx++) {
    const obs = obstacles[idx];
    ctx.save();
    if (obs.type === "rect") {
      // Reddish brick texture - all rects share brick appearance per user request
      // Base brick fill with subtle variation per obstacle for identity without breaking theme
      const brickBase = "#A63A2A"; // primary reddish brick
      const brickDark = "#7F2E1F"; // mortar shadow / inner shade
      const mortarColor = "rgba(232,215,195,0.88)"; // light beige mortar
      const highlight = "rgba(255,230,210,0.12)";
      ctx.fillStyle = brickBase;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      // Slight vertical gradient for depth (top lighter)
      const topH = Math.min(10, obs.h * 0.22);
      const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x, obs.y + topH);
      grad.addColorStop(0, "rgba(255,255,255,0.10)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(obs.x, obs.y, obs.w, topH);
      // Brick pattern clipped to rect
      ctx.save();
      ctx.beginPath();
      ctx.rect(obs.x, obs.y, obs.w, obs.h);
      ctx.clip();
      // Brick dimensions - tuned to look good at typical obstacle sizes (20x~200)
      const brickH = 10;
      const brickW = 22;
      const mortar = 2;
      // Fill individual bricks with slight color jitter for realism (deterministic per obstacle)
      for (let row = 0; row * brickH < obs.h; row++) {
        const y0 = obs.y + row * brickH;
        const y1 = Math.min(y0 + brickH - mortar, obs.y + obs.h);
        const bh = y1 - y0;
        if (bh <= 0) continue;
        const offset = (row % 2) * (brickW / 2);
        for (let col = -1; col * brickW - offset < obs.w + brickW; col++) {
          const x0 = obs.x + col * brickW - offset + mortar / 2;
          const x1 = Math.min(x0 + brickW - mortar, obs.x + obs.w);
          const bw = x1 - x0;
          if (bw <= 2) continue;
          // deterministic shade variation per brick
          const seed = (obs.x * 17 + obs.y * 31 + row * 71 + col * 37 + idx * 19) % 7;
          if (seed === 0) ctx.fillStyle = "#B04A32"; // slightly lighter
          else if (seed === 1) ctx.fillStyle = "#963925";
          else if (seed === 2) ctx.fillStyle = "#A8432E";
          else if (seed === 3) ctx.fillStyle = "#8D3526";
          else ctx.fillStyle = brickBase;
          ctx.fillRect(x0, y0, bw, bh);
          // subtle highlight top edge of each brick
          ctx.fillStyle = highlight;
          ctx.fillRect(x0, y0, bw, 1.2);
        }
      }
      // Mortar lines - horizontal
      ctx.strokeStyle = mortarColor;
      ctx.lineWidth = mortar;
      ctx.lineCap = "square";
      for (let y = obs.y + brickH; y < obs.y + obs.h; y += brickH) {
        ctx.beginPath();
        ctx.moveTo(obs.x, y - mortar / 2);
        ctx.lineTo(obs.x + obs.w, y - mortar / 2);
        ctx.stroke();
      }
      // Mortar lines - vertical (offset every other row)
      for (let row = 0; row * brickH < obs.h; row++) {
        const y0 = obs.y + row * brickH;
        const y1 = Math.min(y0 + brickH, obs.y + obs.h);
        const offset = (row % 2) * (brickW / 2);
        for (let x = obs.x + brickW - offset; x < obs.x + obs.w; x += brickW) {
          ctx.beginPath();
          ctx.moveTo(x - mortar / 2, y0);
          ctx.lineTo(x - mortar / 2, y1);
          ctx.stroke();
        }
      }
      // Edge mortar - ensure border mortar visible
      ctx.strokeRect(obs.x + mortar / 2, obs.y + mortar / 2, obs.w - mortar, obs.h - mortar);
      ctx.restore();
      // Outer outline - dark brick shadow
      ctx.strokeStyle = "#5A1F14";
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeStyle = "rgba(255,230,210,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(obs.x + 1.5, obs.y + 1.5, obs.w - 3, obs.h - 3);
    } else if (obs.type === "circle") {
      // Tree texture for circular obstacles
      const x = obs.x, y = obs.y, r = obs.r;
      // Shadow under tree
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + r + 4, r * 0.7, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      // Trunk - deterministic size based on radius
      const trunkW = Math.max(8, Math.min(14, r * 0.38));
      const trunkH = Math.max(10, r * 0.55);
      const trunkX = x - trunkW / 2;
      const trunkY = y + r - trunkH + 2;
      // trunk bark
      ctx.fillStyle = "#6B3A2A";
      ctx.fillRect(trunkX, trunkY, trunkW, trunkH);
      ctx.fillStyle = "#8B4A33";
      ctx.fillRect(trunkX + 2, trunkY, trunkW - 4, trunkH);
      // bark lines
      ctx.strokeStyle = "rgba(40,20,10,0.35)";
      ctx.lineWidth = 1;
      for (let by = trunkY + 3; by < trunkY + trunkH - 2; by += 4) {
        ctx.beginPath();
        ctx.moveTo(trunkX + 2, by);
        ctx.lineTo(trunkX + trunkW - 2, by + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = "#4A2515";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(trunkX, trunkY, trunkW, trunkH);
      // Canopy - layered greens
      // base dark
      ctx.fillStyle = "#0F3D1E";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // main canopy
      ctx.fillStyle = "#1E7A34";
      ctx.beginPath();
      ctx.arc(x, y - 1, r - 1.5, 0, Math.PI * 2);
      ctx.fill();
      // highlight top
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
      grad.addColorStop(0, "rgba(90,200,90,0.85)");
      grad.addColorStop(0.35, "rgba(40,160,60,0.6)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // foliage texture - lighter blobs deterministic
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r - 1, 0, Math.PI * 2);
      ctx.clip();
      // small lighter leaf clusters
      for (let i = 0; i < 18; i++) {
        const ang = (i * 137.5) * Math.PI / 180 + (x * 0.01);
        const dist = (i % 4 === 0) ? r * 0.62 : (i % 3 === 0) ? r * 0.45 : r * 0.28;
        const lx = x + Math.cos(ang) * dist + Math.sin(i * 1.3) * 2;
        const ly = y + Math.sin(ang) * dist * 0.85 + Math.cos(i * 0.9) * 2;
        const rr = 2.2 + (i % 5) * 0.7;
        ctx.fillStyle = i % 2 === 0 ? "rgba(120,220,120,0.32)" : "rgba(0,60,20,0.18)";
        ctx.beginPath();
        ctx.arc(lx, ly, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      // tiny white sparkles for leaves
      ctx.fillStyle = "rgba(200,255,200,0.22)";
      for (let i = 0; i < 6; i++) {
        const lx = x + ((i * 41) % (r * 1.2)) - r * 0.6;
        const ly = y + ((i * 59) % (r * 1.2)) - r * 0.6;
        if ((lx - x) * (lx - x) + (ly - y) * (ly - y) < (r - 3) * (r - 3)) {
          ctx.beginPath();
          ctx.arc(lx, ly, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      // outline
      ctx.strokeStyle = "#0A2A12";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r - 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawHole(ctx, hole) {
  ctx.save();
  // outer rim
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius + 2, 0, Math.PI * 2);
  ctx.fill();
  // hole
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
  ctx.fill();
  // inner shadow highlight
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(hole.x - 3, hole.y - 3, hole.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // flag
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hole.x, hole.y - hole.radius - 18);
  ctx.lineTo(hole.x, hole.y - hole.radius + 6);
  ctx.stroke();
  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(hole.x, hole.y - hole.radius - 18, 14, 10);
  ctx.restore();
}

export function drawBall(ctx, ball) {
  ctx.save();
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(ball.pos.x + 2, ball.pos.y + 2, ball.radius * 0.9, ball.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // ball
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // dimple
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.beginPath();
  ctx.arc(ball.pos.x - 1.5, ball.pos.y - 1.5, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawAim(ctx, ball, aimAngle, charge, gameState) {
  if (gameState !== "AIMING" && gameState !== "CHARGING") return;
  const orbitRadius = 30;
  ctx.save();
  // orbit circle dashed
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ball.pos.x, ball.pos.y, orbitRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // aim line length scales with charge
  const base = 30;
  const extra = charge * 50;
  const len = base + extra;
  const endX = ball.pos.x + Math.cos(aimAngle) * len;
  const endY = ball.pos.y + Math.sin(aimAngle) * len;

  // line
  ctx.strokeStyle = charge > 0 ? "#ff4444" : "rgba(255,255,255,0.9)";
  ctx.lineWidth = charge > 0 ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(ball.pos.x, ball.pos.y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // dotted preview extension (predicted simple, no physics integration beyond wind hint optionally)
  // We'll draw a short dotted continuation
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  const extLen = 20;
  ctx.lineTo(endX + Math.cos(aimAngle) * extLen, endY + Math.sin(aimAngle) * extLen);
  ctx.stroke();
  ctx.setLineDash([]);

  // indicator dot at orbit circumference
  const dotX = ball.pos.x + Math.cos(aimAngle) * orbitRadius;
  const dotY = ball.pos.y + Math.sin(aimAngle) * orbitRadius;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // inner dot color based on charge
  ctx.fillStyle = charge > 0.5 ? "#e74c3c" : "#3498db";
  ctx.beginPath();
  ctx.arc(dotX, dotY, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawHUD(ctx, width, currentHoleIndex, totalHoles, holeAttempts, totalAttempts) {
  // Top bar inside canvas per REQ-012/014 - Hole left, Attempts center, Total right
  ctx.save();
  // semi-transparent strip
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, width, 28);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = "white";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  const holeText = `Hole: ${currentHoleIndex + 1}/${totalHoles}`;
  const attemptsText = `Attempts: ${holeAttempts}`;
  const totalText = `Total: ${totalAttempts}`;
  // Hole left
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.strokeText(holeText, 12, 16);
  ctx.fillText(holeText, 12, 16);
  // Attempts center
  ctx.textAlign = "center";
  ctx.strokeText(attemptsText, width / 2, 16);
  ctx.fillText(attemptsText, width / 2, 16);
  // Total right
  ctx.textAlign = "right";
  ctx.strokeText(totalText, width - 12, 16);
  ctx.fillText(totalText, width - 12, 16);
  ctx.restore();
}

export function drawForceBar(ctx, ball, charge) {
  // Under ball inside canvas when CHARGING per REQ-007
  if (charge <= 0) return;
  const barW = 60;
  const barH = 8;
  const x = ball.pos.x - barW / 2;
  const y = ball.pos.y + 28;
  const pct = Math.max(0, Math.min(1, charge));
  // background
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  ctx.beginPath();
  // rounded rect simple
  const r = 3;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + barW - r, y);
  ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
  ctx.lineTo(x + barW, y + barH - r);
  ctx.quadraticCurveTo(x + barW, y + barH, x + barW - r, y + barH);
  ctx.lineTo(x + r, y + barH);
  ctx.quadraticCurveTo(x, y + barH, x, y + barH - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // fill with lerp green->yellow->red
  let rr, gg, bb;
  if (pct < 0.5) {
    const t = pct / 0.5;
    rr = 46 + (241 - 46) * t;
    gg = 204 + (196 - 204) * t;
    bb = 113 + (15 - 113) * t;
  } else {
    const t = (pct - 0.5) / 0.5;
    rr = 241 + (231 - 241) * t;
    gg = 196 + (60 - 196) * t;
    bb = 15 + (60 - 15) * t;
  }
  ctx.fillStyle = `rgb(${Math.round(rr)},${Math.round(gg)},${Math.round(bb)})`;
  const fillW = (barW - 2) * pct;
  ctx.fillRect(x + 1, y + 1, fillW, barH - 2);
  // percentage text below bar - larger font, only percentage per updated requirement
  ctx.fillStyle = "white";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3;
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const label = `${Math.round(pct * 100)}%`;
  ctx.strokeText(label, ball.pos.x, y + barH + 4);
  ctx.fillText(label, ball.pos.x, y + barH + 4);
  ctx.restore();
}

export function drawModifiers(ctx, modifiers) {
  for (const mod of modifiers) {
    ctx.save();
    if (mod.type === 'amplify') {
      ctx.fillStyle = "rgba(230,126,34,0.20)";
      ctx.strokeStyle = "rgba(230,126,34,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else if (mod.type === 'nullify') {
      ctx.fillStyle = "rgba(52,152,219,0.18)";
      ctx.strokeStyle = "rgba(52,152,219,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
    } else if (mod.type === 'flip') {
      ctx.fillStyle = "rgba(155,89,182,0.20)";
      ctx.strokeStyle = "rgba(155,89,182,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(mod.x, mod.y, mod.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // icon - flip now two opposite arrows ⇄
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const icon = mod.type === 'amplify' ? "»" : mod.type === 'nullify' ? "∅" : "⇄";
    ctx.strokeText(icon, mod.x, mod.y);
    ctx.fillText(icon, mod.x, mod.y);
    ctx.restore();
  }
}

export function drawModifierPreview(ctx, x, y, type, radius, blocked = false) {
  if (!type) return;
  ctx.save();
  ctx.globalAlpha = blocked ? 0.35 : 0.5;
  if (blocked) {
    ctx.fillStyle = "rgba(120,120,120,0.20)";
    ctx.strokeStyle = "rgba(180,40,40,0.9)";
  } else if (type === 'amplify') {
    ctx.fillStyle = "rgba(230,126,34,0.25)";
    ctx.strokeStyle = "rgba(230,126,34,0.9)";
  } else if (type === 'nullify') {
    ctx.fillStyle = "rgba(52,152,219,0.25)";
    ctx.strokeStyle = "rgba(52,152,219,0.9)";
  } else if (type === 'flip') {
    ctx.fillStyle = "rgba(155,89,182,0.25)";
    ctx.strokeStyle = "rgba(155,89,182,0.9)";
  }
  ctx.lineWidth = blocked ? 2 : 2;
  ctx.setLineDash(blocked ? [4, 6] : [6, 4]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = blocked ? "rgba(255,80,80,0.95)" : "white";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const icon = blocked ? "✕" : type === 'amplify' ? "»" : type === 'nullify' ? "∅" : "⇄";
  ctx.fillText(icon, x, y);
  // blocked label
  if (blocked) {
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,80,80,0.9)";
    ctx.fillText("no supply", x, y + 16);
  }
  ctx.restore();
}

const REWARD_TYPE_DEFS = {
  amplify: { icon: '»', label: 'Amplify', color: '#e67e22', border: 'rgba(230,126,34,0.9)', fill: 'rgba(230,126,34,0.28)', fillHover: 'rgba(230,126,34,0.38)', hint: '+1 to supply' },
  nullify: { icon: '∅', label: 'Nullify', color: '#3498db', border: 'rgba(52,152,219,0.9)', fill: 'rgba(52,152,219,0.28)', fillHover: 'rgba(52,152,219,0.38)', hint: '+1 to supply' },
  flip: { icon: '⇄', label: 'Flip', color: '#9b59b6', border: 'rgba(155,89,182,0.9)', fill: 'rgba(155,89,182,0.28)', fillHover: 'rgba(155,89,182,0.38)', hint: '+1 to supply' },
  freeShots: { icon: '★', label: 'Free Shots', color: '#2ecc71', border: 'rgba(46,204,113,0.9)', fill: 'rgba(46,204,113,0.28)', fillHover: 'rgba(46,204,113,0.38)', hint: '+3 free shots' },
  areaUp: { icon: '◯', label: 'Area +20%', color: '#f39c12', border: 'rgba(243,156,18,0.9)', fill: 'rgba(243,156,18,0.28)', fillHover: 'rgba(243,156,18,0.38)', hint: '+20% area' },
  bouncyBall: { icon: '◎', label: 'Bouncy Ball +1', color: '#1abc9c', border: 'rgba(26,188,156,0.9)', fill: 'rgba(26,188,156,0.28)', fillHover: 'rgba(26,188,156,0.38)', hint: '+1 bounce' }
};

export function getRewardButtonsLayout(width, height, offered = null) {
  // REQ-021/023/024: 3 random of 6 pool; if offered null, fallback to default 3 (amplify/nullify/flip) for backward compat
  const types = Array.isArray(offered) && offered.length === 3 ? offered : ['amplify', 'nullify', 'flip'];
  const cardW = 340;
  const cardH = 220;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;
  const btnW = 90;
  const btnH = 110;
  const gap = 12;
  const totalBtnW = types.length * btnW + (types.length - 1) * gap;
  const startX = cardX + (cardW - totalBtnW) / 2;
  const btnY = cardY + 75;
  return types.map((type, i) => {
    const def = REWARD_TYPE_DEFS[type] || REWARD_TYPE_DEFS.amplify;
    return {
      x: startX + i * (btnW + gap),
      y: btnY,
      w: btnW,
      h: btnH,
      type,
      icon: def.icon,
      label: def.label,
      color: def.color,
      border: def.border,
      fill: def.fill,
      fillHover: def.fillHover,
      hint: def.hint
    };
  });
}

export function getRewardRerollButtonLayout(width, height) {
  // REQ-025: re-roll centered below 3 cards, below options (options occupy cardY+75 to cardY+185) - widened to cover full text, moved down further per user request
  const cardW = 340;
  const cardH = 220;
  const cardY = (height - cardH) / 2;
  const btnW = 190; // was 110 - widened to fully cover "↻ Re-roll (1 attempt) [0]" text
  const btnH = 30; // was 28 - slightly taller for padding
  const x = width / 2 - btnW / 2;
  const y = cardY + 192; // was 188, moved down ~4px further (now 7px below options bottom, was 3px)
  return { x, y, w: btnW, h: btnH };
}

export function drawRewardMenu(ctx, width, height, offeredOrTotal, hoveredType = null, rerolled = false, rerollHovered = false) {
  // Backward compat: if third arg is number (old totalAttempts), use default offered
  // New signature: (ctx, width, height, offeredArray, hovered)
  let offered;
  let hovered = hoveredType;
  if (Array.isArray(offeredOrTotal)) {
    offered = offeredOrTotal;
  } else if (typeof offeredOrTotal === 'number' && hoveredType === null) {
    // old call with totalAttempts number, no hovered
    offered = ['amplify', 'nullify', 'flip'];
  } else if (Array.isArray(hoveredType)) {
    // shouldn't happen
    offered = offeredOrTotal;
    hovered = null;
  } else {
    // offeredOrTotal is offered array, hoveredType is hover string
    offered = Array.isArray(offeredOrTotal) ? offeredOrTotal : ['amplify', 'nullify', 'flip'];
    // hoveredType already set
  }
  // Ensure 3 distinct
  if (!Array.isArray(offered) || offered.length !== 3) {
    offered = ['amplify', 'nullify', 'flip'];
  }
  ctx.save();
  // Dim background full canvas - preserves green context but ensures contrast
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, width, height);

  // No white card background per updated requirement - text/buttons drawn directly
  // with high-contrast colors for readability on green (#3a9d23) + dim
  const cardW = 340;
  const cardH = 220;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;

  // Title - white with strong dark stroke for contrast on green/dim
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 5;
  ctx.fillStyle = "white";
  ctx.strokeText("Choose an Upgrade", width / 2, cardY + 28);
  ctx.fillText("Choose an Upgrade", width / 2, cardY + 28);

  // Buttons - 3 random offered
  const buttons = getRewardButtonsLayout(width, height, offered);
  for (let idx = 0; idx < buttons.length; idx++) {
    const btn = buttons[idx];
    const isHover = hovered === btn.type;
    ctx.save();
    if (isHover) {
      // hover brighten
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 8;
    }
    // Button background
    ctx.fillStyle = isHover ? btn.fillHover : btn.fill;
    ctx.strokeStyle = btn.border;
    ctx.lineWidth = 2;
    const br = 10;
    ctx.beginPath();
    ctx.moveTo(btn.x + br, btn.y);
    ctx.lineTo(btn.x + btn.w - br, btn.y);
    ctx.quadraticCurveTo(btn.x + btn.w, btn.y, btn.x + btn.w, btn.y + br);
    ctx.lineTo(btn.x + btn.w, btn.y + btn.h - br);
    ctx.quadraticCurveTo(btn.x + btn.w, btn.y + btn.h, btn.x + btn.w - br, btn.y + btn.h);
    ctx.lineTo(btn.x + br, btn.y + btn.h);
    ctx.quadraticCurveTo(btn.x, btn.y + btn.h, btn.x, btn.y + btn.h - br);
    ctx.lineTo(btn.x, btn.y + br);
    ctx.quadraticCurveTo(btn.x, btn.y, btn.x + br, btn.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Icon - keep modifier color but add dark outline and shadow for contrast on green/dim
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 4;
    ctx.strokeText(btn.icon, btn.x + btn.w / 2, btn.y + 28);
    ctx.fillStyle = btn.color;
    // brighten icon slightly for contrast
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 6;
    ctx.fillText(btn.icon, btn.x + btn.w / 2, btn.y + 28);
    ctx.shadowColor = "transparent";

    // Label - white with dark stroke for good contrast against green/dim
    // Bouncy label longer, use slightly smaller font to fit 90px button
    const labelFont = btn.type === 'bouncyBall' ? "700 11px system-ui, sans-serif" : "700 13px system-ui, sans-serif";
    ctx.font = labelFont;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeText(btn.label, btn.x + btn.w / 2, btn.y + 55);
    ctx.fillStyle = "white";
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + 55);

    // Supply hint - uses per-type hint (+1 to supply or +3 free shots) with high contrast
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeText(btn.hint, btn.x + btn.w / 2, btn.y + 72);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(btn.hint, btn.x + btn.w / 2, btn.y + 72);

    // Key hint - positional 1/2/3 for random offered order
    const key = String(idx + 1);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeText(`[${key}]`, btn.x + btn.w / 2, btn.y + 88);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`[${key}]`, btn.x + btn.w / 2, btn.y + 88);

    ctx.restore();
  }

  // Re-roll button per REQ-025 - below 3 cards, once per menu, costs 1 attempt
  const rerollRect = getRewardRerollButtonLayout(width, height);
  const isDisabled = !!rerolled;
  const isRerollHover = !!rerollHovered && !isDisabled;
  ctx.save();
  if (isRerollHover) {
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 6;
  }
  ctx.fillStyle = isDisabled ? "rgba(255,255,255,0.06)" : isRerollHover ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)";
  ctx.strokeStyle = isDisabled ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  const rbr = 8;
  ctx.beginPath();
  ctx.moveTo(rerollRect.x + rbr, rerollRect.y);
  ctx.lineTo(rerollRect.x + rerollRect.w - rbr, rerollRect.y);
  ctx.quadraticCurveTo(rerollRect.x + rerollRect.w, rerollRect.y, rerollRect.x + rerollRect.w, rerollRect.y + rbr);
  ctx.lineTo(rerollRect.x + rerollRect.w, rerollRect.y + rerollRect.h - rbr);
  ctx.quadraticCurveTo(rerollRect.x + rerollRect.w, rerollRect.y + rerollRect.h, rerollRect.x + rerollRect.w - rbr, rerollRect.y + rerollRect.h);
  ctx.lineTo(rerollRect.x + rbr, rerollRect.y + rerollRect.h);
  ctx.quadraticCurveTo(rerollRect.x, rerollRect.y + rerollRect.h, rerollRect.x, rerollRect.y + rerollRect.h - rbr);
  ctx.lineTo(rerollRect.x, rerollRect.y + rbr);
  ctx.quadraticCurveTo(rerollRect.x, rerollRect.y, rerollRect.x + rbr, rerollRect.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = isDisabled ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.65)";
  ctx.lineWidth = 3;
  const rerollText = isDisabled ? "Re-rolled" : "↻ Re-roll (1 attempt) [0]";
  ctx.strokeText(rerollText, rerollRect.x + rerollRect.w / 2, rerollRect.y + rerollRect.h / 2);
  ctx.fillStyle = isDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.95)";
  ctx.fillText(rerollText, rerollRect.x + rerollRect.w / 2, rerollRect.y + rerollRect.h / 2);
  ctx.restore();

  ctx.restore();
}

export function drawWinOverlay(ctx, width, height, holeIndex = 0, totalHoles = 1, holeAttempts = 0, totalAttempts = 0) {
  // Victory screen - darken play field same as reward menu, Victory same font as "Choose an Upgrade", big yellow star
  ctx.save();
  // Darken play field like reward menu: rgba(0,0,0,0.55) full-canvas dim
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2 - 10;
  // Big yellow star
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 4;
  ctx.fillStyle = "#FFD700";
  // shadow for contrast
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.strokeText("★", centerX, centerY - 38);
  ctx.fillText("★", centerX, centerY - 38);
  ctx.shadowBlur = 0;
  // Victory title - same as "Choose an Upgrade": 700 22px system-ui white with dark stroke 5px
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 5;
  ctx.fillStyle = "white";
  ctx.strokeText("Victory", centerX, centerY + 22);
  ctx.fillText("Victory", centerX, centerY + 22);
  // Attempts info below - white with stroke for readability on transparent
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 3;
  ctx.fillStyle = "white";
  const info = `Hole ${holeIndex + 1}/${totalHoles} - Attempts this hole: ${holeAttempts}, Total: ${totalAttempts}`;
  ctx.strokeText(info, centerX, centerY + 48);
  ctx.fillText(info, centerX, centerY + 48);
  ctx.restore();
}

export function getPauseButtonsLayout(width, height) {
  const btnW = 140, btnH = 44;
  const cx = width / 2, cy = height / 2 - 10;
  const layout = {
    resume: { x: cx - btnW / 2, y: cy - 28, w: btnW, h: btnH },
    endRun: { x: cx - btnW / 2, y: cy + 28, w: btnW, h: btnH }
  };
  // alias for backward compat
  layout.newGame = layout.endRun;
  return layout;
}

export function drawPauseMenu(ctx, width, height, hovered = null, rewardCounts = {}) {
  ctx.save();
  // Dim like reward menu
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, width, height);
  // Title Paused same as Choose an Upgrade / Victory
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 5;
  ctx.fillStyle = "white";
  ctx.strokeText("Paused", width / 2, height / 2 - 80);
  ctx.fillText("Paused", width / 2, height / 2 - 80);
  const layout = getPauseButtonsLayout(width, height);
  // Resume button
  const isResumeHover = hovered === "resume";
  ctx.save();
  if (isResumeHover) { ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 6; }
  ctx.fillStyle = isResumeHover ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  const r1 = layout.resume;
  const br = 8;
  ctx.beginPath();
  ctx.moveTo(r1.x + br, r1.y); ctx.lineTo(r1.x + r1.w - br, r1.y);
  ctx.quadraticCurveTo(r1.x + r1.w, r1.y, r1.x + r1.w, r1.y + br);
  ctx.lineTo(r1.x + r1.w, r1.y + r1.h - br); ctx.quadraticCurveTo(r1.x + r1.w, r1.y + r1.h, r1.x + r1.w - br, r1.y + r1.h);
  ctx.lineTo(r1.x + br, r1.y + r1.h); ctx.quadraticCurveTo(r1.x, r1.y + r1.h, r1.x, r1.y + r1.h - br);
  ctx.lineTo(r1.x, r1.y + br); ctx.quadraticCurveTo(r1.x, r1.y, r1.x + br, r1.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
  ctx.strokeText("▶ Resume", r1.x + r1.w/2, r1.y + r1.h/2);
  ctx.fillStyle = "white"; ctx.fillText("▶ Resume", r1.x + r1.w/2, r1.y + r1.h/2);
  ctx.font = "600 10px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 2;
  ctx.strokeText("[Esc]", r1.x + r1.w/2, r1.y + r1.h/2 + 12);
  ctx.fillText("[Esc]", r1.x + r1.w/2, r1.y + r1.h/2 + 12);
  ctx.restore();
  // End Run button - red distinct (was New Game)
  const isNewHover = hovered === "endRun" || hovered === "newGame";
  ctx.save();
  if (isNewHover) { ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 6; }
  ctx.fillStyle = isNewHover ? "rgba(231,76,60,0.38)" : "rgba(231,76,60,0.28)";
  ctx.strokeStyle = "rgba(231,76,60,0.9)";
  ctx.lineWidth = 2;
  const r2 = layout.endRun || layout.newGame;
  ctx.beginPath();
  ctx.moveTo(r2.x + br, r2.y); ctx.lineTo(r2.x + r2.w - br, r2.y);
  ctx.quadraticCurveTo(r2.x + r2.w, r2.y, r2.x + r2.w, r2.y + br);
  ctx.lineTo(r2.x + r2.w, r2.y + r2.h - br); ctx.quadraticCurveTo(r2.x + r2.w, r2.y + r2.h, r2.x + r2.w - br, r2.y + r2.h);
  ctx.lineTo(r2.x + br, r2.y + r2.h); ctx.quadraticCurveTo(r2.x, r2.y + r2.h, r2.x, r2.y + r2.h - br);
  ctx.lineTo(r2.x, r2.y + br); ctx.quadraticCurveTo(r2.x, r2.y, r2.x + br, r2.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
  ctx.strokeText("✕ End Run", r2.x + r2.w/2, r2.y + r2.h/2);
  ctx.fillStyle = "white"; ctx.fillText("✕ End Run", r2.x + r2.w/2, r2.y + r2.h/2);
  ctx.restore();
  // Bottom reward list - all types with xN
  const types = ['amplify','nullify','flip','freeShots','areaUp','bouncyBall'];
  // include sharpshooter if defined in pool but keep 6 for now
  const listY = height / 2 + 100;
  const gap = 8;
  const entryW = 88, entryH = 34;
  const cols = 3;
  const totalW = cols * entryW + (cols - 1) * gap;
  const startX = (width - totalW) / 2;
  // title for list
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
  ctx.strokeText("Rewards this run", width/2, listY - 16);
  ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillText("Rewards this run", width/2, listY - 16);
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const def = REWARD_TYPE_DEFS[type] || { icon:'?', color:'#fff' };
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (entryW + gap);
    const y = listY + row * (entryH + 8);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    const br2 = 6;
    ctx.beginPath();
    ctx.moveTo(x + br2, y); ctx.lineTo(x + entryW - br2, y);
    ctx.quadraticCurveTo(x + entryW, y, x + entryW, y + br2);
    ctx.lineTo(x + entryW, y + entryH - br2); ctx.quadraticCurveTo(x + entryW, y + entryH, x + entryW - br2, y + entryH);
    ctx.lineTo(x + br2, y + entryH); ctx.quadraticCurveTo(x, y + entryH, x, y + entryH - br2);
    ctx.lineTo(x, y + br2); ctx.quadraticCurveTo(x, y, x + br2, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // icon
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
    ctx.strokeText(def.icon, x + 8, y + entryH/2);
    ctx.fillStyle = def.color; ctx.fillText(def.icon, x + 8, y + entryH/2);
    // label + count
    const cnt = Math.max(0, Math.floor(rewardCounts[type] || 0));
    const label = def.label;
    // label 11px, count 700 12px
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 2.5;
    ctx.strokeText(label, x + 26, y + 11);
    ctx.fillStyle = "white"; ctx.fillText(label, x + 26, y + 11);
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
    const countText = `x${cnt}`;
    // right align count inside entry
    ctx.textAlign = "right";
    ctx.strokeText(countText, x + entryW - 6, y + 11);
    ctx.fillStyle = "white"; ctx.fillText(countText, x + entryW - 6, y + 11);
    ctx.restore();
  }
  ctx.restore();
}

export function getMainMenuButtonsLayout(width, height) {
  const btnW = 160, btnH = 48;
  return { newGame: { x: width / 2 - btnW / 2, y: height / 2 - 10, w: btnW, h: btnH } };
}

export function drawMainMenuBackground(ctx, width, height) {
  // Removed per user request — no golf art on main menu
}

export function drawMainMenu(ctx, width, height, hovered = null, highScore = null) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, width, height);
  // Title
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineWidth = 5; ctx.fillStyle = "white";
  ctx.strokeText("Golf Vector Field", width / 2, height / 2 - 60);
  ctx.fillText("Golf Vector Field", width / 2, height / 2 - 60);
  const layout = getMainMenuButtonsLayout(width, height);
  const r = layout.newGame;
  const isHover = hovered === "newGame";
  ctx.save();
  if (isHover) { ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 6; }
  ctx.fillStyle = isHover ? "rgba(46,204,113,0.38)" : "rgba(46,204,113,0.28)";
  ctx.strokeStyle = "rgba(46,204,113,0.9)"; ctx.lineWidth = 2;
  const br = 8;
  ctx.beginPath();
  ctx.moveTo(r.x + br, r.y); ctx.lineTo(r.x + r.w - br, r.y);
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + br);
  ctx.lineTo(r.x + r.w, r.y + r.h - br); ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - br, r.y + r.h);
  ctx.lineTo(r.x + br, r.y + r.h); ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - br);
  ctx.lineTo(r.x, r.y + br); ctx.quadraticCurveTo(r.x, r.y, r.x + br, r.y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = "700 14px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
  ctx.strokeText("▶ New Game", r.x + r.w / 2, r.y + r.h / 2);
  ctx.fillStyle = "white"; ctx.fillText("▶ New Game", r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
  // High score below button
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
  const hsText = highScore == null ? "Current high score: —" : `Current high score: ${highScore}`;
  ctx.strokeText(hsText, width / 2, r.y + r.h + 18);
  ctx.fillStyle = highScore == null ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.95)";
  ctx.fillText(hsText, width / 2, r.y + r.h + 18);
  ctx.restore();
}
