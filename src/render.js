export const PARTICLE_COUNT = 80;

let particles = [];
let showWind = true;
let canvasW = 900;
let canvasH = 600;

export function setCanvasSize(w, h) {
  canvasW = w;
  canvasH = h;
}

export function isWindVisible() {
  return showWind;
}

export function toggleWind() {
  showWind = !showWind;
}

export function initParticles(count = PARTICLE_COUNT, width = 900, height = 600) {
  canvasW = width;
  canvasH = height;
  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
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
    p.life -= dt;
    if (p.life <= 0) {
      // Fade-die after 2s per REQ-004, respawn uniformly random across whole map
      p.x = Math.random() * canvasW;
      p.y = Math.random() * canvasH;
      p.life = 2;
      p.maxLife = 2;
    }
  }
}

export function drawBackground(ctx, width, height) {
  // Fairway base
  ctx.fillStyle = "#3a9d23";
  ctx.fillRect(0, 0, width, height);
  // Subtle grid dots
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (let x = 20; x < width; x += 40) {
    for (let y = 20; y < height; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawArrows(ctx, field, cols, rows, cellW, cellH) {
  if (!showWind) return;
  ctx.save();
  ctx.lineCap = "round";
  // Short arrows per REQ-004: max ≤16px, small variation, strength via opacity/head
  const MIN_MAG = 4; // for WIND_STRENGTH 30, min force 120
  const MAX_MAG_RANGE = 0.75; // variation from field generation (0.5*1.5)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const vec = field[row][col];
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const mag = Math.hypot(vec.x, vec.y);
      const angle = Math.atan2(vec.y, vec.x);
      // Normalize magnitude to 0-1 for visual encoding, do not scale length linearly with raw mag
      const normalizedMag = Math.max(0, Math.min(1, (mag - MIN_MAG) / MAX_MAG_RANGE));
      const len = 10 + normalizedMag * 4; // 10-14px, max ≤16, variation ≤4px
      const alpha = 0.35 + normalizedMag * 0.45; // 0.35-0.80
      const headSize = 4 + normalizedMag * 2; // 4-6px
      // arrow line - short
      ctx.strokeStyle = `rgba(100,160,255,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * len * 0.4, cy - Math.sin(angle) * len * 0.4);
      ctx.lineTo(cx + Math.cos(angle) * len * 0.6, cy + Math.sin(angle) * len * 0.6);
      ctx.stroke();
      // head
      const hx = cx + Math.cos(angle) * len * 0.6;
      const hy = cy + Math.sin(angle) * len * 0.6;
      ctx.fillStyle = `rgba(100,160,255,${alpha})`;
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
  for (const obs of obstacles) {
    ctx.fillStyle = "#2c3e50";
    ctx.strokeStyle = "#1a252f";
    ctx.lineWidth = 2;
    if (obs.type === "rect") {
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    } else if (obs.type === "circle") {
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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

export function drawWinOverlay(ctx, width, height) {
  // Canvas overlay not needed; DOM overlay used. Keep for completeness if desired.
}
