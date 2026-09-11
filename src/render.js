import { modifiers as vfModifiers, isInsideNullify as vfIsInsideNullify } from "./vectorField.js";
import { terrainZoneAt, TERRAIN_COLORS, attachNoiseToTerrain } from "./terrain.js";

let canvasW = 1280;
let canvasH = 720;

export function setCanvasSize(w, h) {
  canvasW = w;
  canvasH = h;
}

// Background image for splash (main menu)
const splashImg = new Image();
splashImg.src = './img/gfg-splash.png';
export function getSplashImage() { return splashImg; }
export function isSplashLoaded() { return splashImg.complete && splashImg.naturalWidth > 0; }

// Reward menu icons - use ./img icons for hotbar/reward, keep field canvas text icons
const rewardIconPaths = {
  amplify: './img/amplify-icon.png',
  nullify: './img/nullify-icon.png',
  flip: './img/flip-icon.png',
  rotate: './img/rotate-icon.png',
  fieldExtender: './img/field-extender-icon.png',
  areaUp: './img/field-extender-icon.png',
  powerCell: './img/power-cell-icon.png'
};
const rewardIconImgs = {};
for (const [k, src] of Object.entries(rewardIconPaths)) {
  const img = new Image();
  img.src = src;
  rewardIconImgs[k] = img;
}
export function getRewardIconImg(type) { return rewardIconImgs[type] || null; }

export function isWindVisible() {
  return showWind;
}

export function toggleWind() {
  showWind = !showWind;
}

function isInsideNullify(x, y) {
  try { return vfIsInsideNullify(x, y); } catch { return false; }
}
function isInsideAnyModifier(x, y) {
  try {
    for (const m of vfModifiers) {
      if (Math.hypot(x - m.x, y - m.y) < (m.radius ?? 54)) return true;
    }
  } catch {}
  return false;
}
function isInsideFlip(x, y) {
  try {
    for (const m of vfModifiers) {
      if (m.type !== 'flip') continue;
      if (Math.hypot(x - m.x, y - m.y) < (m.radius ?? 54)) return true;
    }
  } catch {}
  return false;
}

export function drawBackground(ctx, width, height, mode = 'terrain', level = null) {
  // Bottom canvas — mode 'splash' gfg-splash.png cover, otherwise draws zoned terrain with fixed palette
  if (mode === 'splash') {
    ctx.save();
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
  // If level has terrain (new pipeline), draw zoned terrain with fixed colors per REQ-010 §2
  if (level && level.terrain && level.terrain.fairwayPath) {
    drawTerrainZones(ctx, level, width, height);
    return;
  }
  ctx.fillStyle = "#3a9d23";
  ctx.fillRect(0, 0, width, height);
}

export function drawTerrainZones(ctx, level, width, height) {
  if (!level || !level.terrain) {
    ctx.fillStyle = "#3a9d23";
    ctx.fillRect(0, 0, width, height);
    return;
  }
  // Ensure noise attached for warped lookup
  try { attachNoiseToTerrain(level.terrain); } catch {}
  // Render zoned terrain per REQ-010 §2 with fixed palette: OB gray → Rough → Fairway → Green → Water blue
  // For performance, render in 4x4 blocks (still accurate for zone checks at tested points which are on 1px centers)
  const block = 4;
  // First fill OB as base
  ctx.fillStyle = TERRAIN_COLORS.ob;
  ctx.fillRect(0, 0, width, height);
  // Draw by blocks: for each block, sample center and fill block with zone color
  // This gives organic wavy edges via warped SDF while keeping performance (~80k checks vs 900k)
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      const cx = x + block / 2;
      const cy = y + block / 2;
      const zone = terrainZoneAt(cx, cy, level);
      let color;
      if (zone === 'green') color = TERRAIN_COLORS.green;
      else if (zone === 'fairway') color = TERRAIN_COLORS.fairway;
      else if (zone === 'rough') color = TERRAIN_COLORS.rough;
      else if (zone === 'water') color = TERRAIN_COLORS.water;
      else color = TERRAIN_COLORS.ob;
      // Only draw if not OB (already filled) to reduce overdraw, but water needs overdraw
      if (zone !== 'ob') {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, block, block);
      }
    }
  }
}
// Backward compat: old calls
export function drawBackgroundTiled(ctx, width, height) { return drawBackground(ctx, width, height, 'terrain'); }
export function drawSplashCover(ctx, width, height) { return drawBackground(ctx, width, height, 'splash'); }

export function drawArrowsInModifiers(ctx, getWindAt, modifiers, cols, rows, cellW, cellH) {
  if (!modifiers || !modifiers.length) return;
  if (typeof getWindAt !== 'function') return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const MIN_MAG = 0.66;
  const MAX_MAG_RANGE = 1.5;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      // Only draw inside any modifier per new requirement — find which modifier to color accordingly
      let insideMod = null;
      for (const m of modifiers) {
        if (Math.hypot(cx - m.x, cy - m.y) < (m.radius ?? 54)) { insideMod = m; break; }
      }
      if (!insideMod) continue;
      const vec = getWindAt(cx, cy);
      const mag = Math.hypot(vec.x, vec.y);
      const angle = Math.atan2(vec.y, vec.x);
      const normalizedMag = Math.max(0, Math.min(1, (mag - MIN_MAG) / MAX_MAG_RANGE));
      const len = 10 + normalizedMag * 4;
      const alpha = 0.55 + normalizedMag * 0.40;
      const headSize = 4.5 + normalizedMag * 2;
      // Do not draw any arrows for nullify per new requirement
      if (insideMod.type === 'nullify') continue;
      // White arrows for amplify/flip per latest request (good contrast on tinted modifier)
      const arrowColor = `rgba(255,255,245,${alpha})`;
      const outlineColor = `rgba(0,0,0,0.55)`;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * len * 0.4, cy - Math.sin(angle) * len * 0.4);
      ctx.lineTo(cx + Math.cos(angle) * len * 0.6, cy + Math.sin(angle) * len * 0.6);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = arrowColor;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * len * 0.4, cy - Math.sin(angle) * len * 0.4);
      ctx.lineTo(cx + Math.cos(angle) * len * 0.6, cy + Math.sin(angle) * len * 0.6);
      ctx.stroke();
      const hx = cx + Math.cos(angle) * len * 0.6;
      const hy = cy + Math.sin(angle) * len * 0.6;
      ctx.fillStyle = outlineColor;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(angle - 0.45) * (headSize + 1.2), hy - Math.sin(angle - 0.45) * (headSize + 1.2));
      ctx.lineTo(hx - Math.cos(angle + 0.45) * (headSize + 1.2), hy - Math.sin(angle + 0.45) * (headSize + 1.2));
      ctx.closePath();
      ctx.fill();
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

export function drawTreasure(ctx, treasure) {
  if (!treasure || treasure.isCollected) return;
  const x = treasure.x, y = treasure.y, r = treasure.radius || 12;
  ctx.save();
  // shadow under treasure
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x + 1, y + r + 3, r * 0.6, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // chest base - gold
  ctx.fillStyle = "#D4AF37";
  ctx.strokeStyle = "#8B6914";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  // simple chest: rect with rounded top
  const w = r * 1.8, h = r * 1.4;
  const rx = x - w/2, ry = y - h/2;
  // chest body
  ctx.fillRect(rx, ry + h*0.35, w, h*0.65);
  ctx.strokeRect(rx, ry + h*0.35, w, h*0.65);
  // chest lid (half circle)
  ctx.beginPath();
  ctx.arc(x, ry + h*0.35, w/2, Math.PI, 0);
  ctx.lineTo(rx + w, ry + h*0.35);
  ctx.closePath();
  ctx.fillStyle = "#FFD700";
  ctx.fill();
  ctx.stroke();
  // highlight stripe
  ctx.fillStyle = "#8B6914";
  ctx.fillRect(rx + w*0.42, ry, w*0.16, h + 1);
  // lock
  ctx.fillStyle = "#FFD700";
  ctx.strokeStyle = "#8B6914";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y + 2, 3.5, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  // sparkle star
  ctx.fillStyle = "#FFF8DC";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✦", x + w*0.32, y - h*0.22);
  ctx.fillText("✦", x - w*0.30, y - h*0.18);
  // outline glow subtle
  ctx.strokeStyle = "rgba(255,215,0,0.25)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

export function drawBall(ctx, ball) {
  ctx.save();
  const z = ball.z ?? 0;
  const isAirborne = z > 0.5;
  // --- Shadow on ground ---
  // Shadow stays at ground projection (ball.pos), shrinks/fades with height
  const shadowScale = Math.max(0.35, 1 - z * 0.011);
  const shadowAlpha = Math.max(0.07, 0.32 - z * 0.0035);
  const shadowW = ball.radius * 0.95 * shadowScale;
  const shadowH = ball.radius * 0.65 * shadowScale;
  // Sow shadow slightly below ground pos, and squash when bouncing
  const squash = isAirborne ? 1 : (ball.vz !== undefined && Math.abs(ball.vz) > 5 ? 0.85 : 1);
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(ball.pos.x + 2, ball.pos.y + 4, shadowW, shadowH * squash, 0, 0, Math.PI * 2);
  ctx.fill();
  // subtle second shadow blur for depth
  if (shadowAlpha > 0.12) {
    ctx.fillStyle = `rgba(0,0,0,${(shadowAlpha * 0.5).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(ball.pos.x + 2, ball.pos.y + 4, shadowW * 1.35, shadowH * 1.35 * squash, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // --- Ball in air ---
  // Visual lift: ball appears above ground. Offset y by -z*0.55 for pseudo-3D.
  const lift = z * 0.55;
  const ballX = ball.pos.x;
  const ballY = ball.pos.y - lift;
  const visualR = ball.radius + z * 0.025; // grows when high
  // squash/stretch on bounce: when just hit ground (z==0 && |vz| ~ bouncing), stretch
  let scaleY = 1, scaleX = 1;
  if (!isAirborne && ball.vz !== undefined) {
    const avz = Math.abs(ball.vz);
    if (avz > 30 && avz < 180) {
      // compress on impact
      scaleY = 0.85;
      scaleX = 1.12;
    }
  } else if (isAirborne) {
    // slight stretch when fast falling
    if ((ball.vz ?? 0) < -120) {
      scaleY = 1.08;
      scaleX = 0.96;
    }
  }
  ctx.translate(ballX, ballY);
  ctx.scale(scaleX, scaleY);
  // ball body
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, visualR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // top highlight for 3D
  const grad = ctx.createRadialGradient(-visualR * 0.35, -visualR * 0.45, visualR * 0.2, 0, 0, visualR);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, visualR, 0, Math.PI * 2);
  ctx.fill();
  // dimple
  ctx.fillStyle = "rgba(0,0,0,0.09)";
  ctx.beginPath();
  ctx.arc(-visualR * 0.22, -visualR * 0.25, Math.max(1, visualR * 0.14), 0, Math.PI * 2);
  ctx.fill();
  // small specular
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(-visualR * 0.28, -visualR * 0.35, Math.max(0.9, visualR * 0.11), 0, Math.PI * 2);
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

export function drawHUD(ctx, width, currentHoleIndex, totalHoles, holeAttempts, totalAttempts, maxAttempts = 10, freeShotSupply = 0) {
  // Top bar inside canvas per REQ-012/014/05 — Hole left, Attempts Left (+freeShot) center, Total right
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
  const attemptsLeft = Math.max(0, (maxAttempts ?? 10) - holeAttempts);
  const freeShot = Math.max(0, Math.floor(freeShotSupply ?? 0));
  const attemptsText = freeShot > 0 ? `Attempts Left: ${attemptsLeft} (+${freeShot})` : `Attempts Left: ${attemptsLeft}`;
  // Only show (+Y) when Y>0 per updated requirement; when 0 show just "Attempts Left: X"
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
    } else if (mod.type === 'rotate') {
      ctx.fillStyle = "rgba(231,76,60,0.20)";
      ctx.strokeStyle = "rgba(231,76,60,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(mod.x, mod.y, mod.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // icon - rotate red, others white (per updated requirement)
    const icon = mod.type === 'amplify' ? "»" : mod.type === 'nullify' ? "∅" : mod.type === 'flip' ? "⇄" : mod.type === 'rotate' ? "↻" : "•";
    const isRotate = mod.type === 'rotate';
    ctx.fillStyle = isRotate ? "#e74c3c" : "white";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
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
  } else if (type === 'rotate') {
    ctx.fillStyle = "rgba(231,76,60,0.25)";
    ctx.strokeStyle = "rgba(231,76,60,0.9)";
  }
  ctx.lineWidth = blocked ? 2 : 2;
  ctx.setLineDash(blocked ? [4, 6] : [6, 4]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  const isRotatePreview = !blocked && type === 'rotate';
  ctx.fillStyle = blocked ? "rgba(255,80,80,0.95)" : isRotatePreview ? "#e74c3c" : "white";
  // Add subtle stroke for red icon to ensure contrast on light fill
  if (isRotatePreview) {
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2.5;
    ctx.strokeText(type === 'rotate' ? "↻" : "•", x, y);
  }
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const icon = blocked ? "✕" : type === 'amplify' ? "»" : type === 'nullify' ? "∅" : type === 'flip' ? "⇄" : type === 'rotate' ? "↻" : "•";
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
  rotate: { icon: '↻', label: 'Rotate', color: '#e74c3c', border: 'rgba(231,76,60,0.9)', fill: 'rgba(231,76,60,0.28)', fillHover: 'rgba(231,76,60,0.38)', hint: '+1 to supply' },
  freeShot: { icon: '★', label: 'Free Shoot', color: '#f1c40f', border: 'rgba(241,196,15,0.9)', fill: 'rgba(241,196,15,0.28)', fillHover: 'rgba(241,196,15,0.38)', hint: 'Supply +3' },
  areaUp: { icon: '◯', label: 'Field Extender', color: '#808080', border: 'rgba(128,128,128,0.9)', fill: 'rgba(128,128,128,0.28)', fillHover: 'rgba(128,128,128,0.38)', hint: '+15% area' },
  fieldExtender: { icon: '◯', label: 'Field Extender', color: '#808080', border: 'rgba(128,128,128,0.9)', fill: 'rgba(128,128,128,0.28)', fillHover: 'rgba(128,128,128,0.38)', hint: '+15% area' },
  powerCell: { icon: '⚡', label: 'Power Cell', color: '#808080', border: 'rgba(128,128,128,0.9)', fill: 'rgba(128,128,128,0.28)', fillHover: 'rgba(128,128,128,0.38)', hint: '+15% strength' }
};

export function getRewardButtonsLayout(width, height, offered = null) {
  // REQ-021/023: 3 random of 5 pool (bouncy removed); if offered null, fallback to default 3 (amplify/nullify/flip) for backward compat
  const types = Array.isArray(offered) && offered.length === 3 ? offered : ['amplify', 'nullify', 'flip'];
  const cardW = 520;
  const cardH = 360;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;
  const btnW = 150;
  const btnH = 195;
  const gap = 18;
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
  // REQ-025: re-roll centered below 3 cards, below options (options occupy cardY+75 to cardY+270) - widened to cover full text, moved down further per user request
  const cardW = 520;
  const cardH = 360;
  const cardY = (height - cardH) / 2;
  const btnW = 190; // was 110 - widened to fully cover "↻ Re-roll (1 attempt) [0]" text
  const btnH = 30; // was 28 - slightly taller for padding
  const x = width / 2 - btnW / 2;
  const y = cardY + 295; // buttons occupy cardY+75 to cardY+270, reroll 25 below
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
  const cardW = 520;
  const cardH = 360;
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

    // Icon - use ./img icons for reward/hotbar, keep color identity background; field circles keep text icons (reward icons even bigger with gap to text)
    const iconImg = rewardIconImgs[btn.type];
    if (iconImg && iconImg.complete && iconImg.naturalWidth) {
      const size = 88;
      const ix = btn.x + btn.w / 2 - size / 2;
      const iy = btn.y + 18;
      // Icon directly without background per new spec (removed gradient)
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 4;
      ctx.drawImage(iconImg, ix, iy, size, size);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    } else {
      // No background for fallback icon per new spec
      ctx.font = "700 36px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 4;
      // Center fallback text where 88px icon would be (btn.y+20 +44) with gap to text
      ctx.strokeText(btn.icon, btn.x + btn.w / 2, btn.y + 64);
      ctx.fillStyle = btn.color;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 6;
      ctx.fillText(btn.icon, btn.x + btn.w / 2, btn.y + 64);
      ctx.shadowColor = "transparent";
    }

    // Label - white with dark stroke for good contrast against green/dim (buttons enlarged to 150×195, icons 88 with gap to text)
    const labelFont = "700 13px system-ui, sans-serif";
    ctx.font = labelFont;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    // Gap between icon (iy+88) and text: icon bottom ~ btn.y+106, label at 128 leaves ~22px gap
    ctx.strokeText(btn.label, btn.x + btn.w / 2, btn.y + 128);
    ctx.fillStyle = "white";
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + 128);

    // Supply hint - uses per-type hint (+1 to supply or +3 free shots) with high contrast
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeText(btn.hint, btn.x + btn.w / 2, btn.y + 146);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(btn.hint, btn.x + btn.w / 2, btn.y + 146);

    // Key hint - positional 1/2/3 for random offered order (buttons enlarged to 150×195)
    const key = String(idx + 1);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeText(`[${key}]`, btn.x + btn.w / 2, btn.y + 166);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`[${key}]`, btn.x + btn.w / 2, btn.y + 166);

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
  const rerollText = isDisabled ? "Re-rolled" : "↻ Re-roll (1 attempt) [R]";
  ctx.strokeText(rerollText, rerollRect.x + rerollRect.w / 2, rerollRect.y + rerollRect.h / 2);
  ctx.fillStyle = isDisabled ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.95)";
  ctx.fillText(rerollText, rerollRect.x + rerollRect.w / 2, rerollRect.y + rerollRect.h / 2);
  ctx.restore();

  ctx.restore();
}

export function drawCenterBanner(ctx, width, height, text) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 5;
  ctx.fillStyle = "white";
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillText(text, width / 2, height / 2);
  ctx.restore();
}
export function drawHoleBanner(ctx, width, height, text) {
  return drawCenterBanner(ctx, width, height, text);
}
export function drawAttemptsBanner(ctx, width, height, attemptsLeft) {
  const n = Math.max(0, Math.floor(attemptsLeft));
  const txt = n === 1 ? "1 Attempt Left" : `${n} Attempts Left`;
  return drawCenterBanner(ctx, width, height, txt);
}

export function drawSoftlockBanner(ctx, width, height, text) {
  const msg = text || "Stuck? Press R to reset — or use Reset Attempt in pause menu";
  ctx.save();
  // Middle of screen, a bit higher than center: centered banner (not top HUD)
  const barH = 28;
  const barY = Math.floor(height / 2 - 60 - barH / 2); // middle - ~60px higher
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, barY, width, barH);
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 4;
  ctx.fillStyle = "white";
  ctx.strokeText(msg, width / 2, barY + barH / 2);
  ctx.fillText(msg, width / 2, barY + barH / 2);
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
