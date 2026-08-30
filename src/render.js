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
  // Base grass fill
  ctx.fillStyle = "#3a9d23";
  ctx.fillRect(0, 0, width, height);

  // Grass texture - subtle mottling with darker patches (deterministic)
  ctx.save();
  for (let i = 0; i < 180; i++) {
    const x = (i * 137.508) % width;
    const y = (i * 73.273) % height;
    const w = 18 + ((i * 31) % 24);
    const h = 14 + ((i * 17) % 18);
    // deterministic green variation
    const v = (i * 29) % 3;
    ctx.fillStyle = v === 0 ? "rgba(0,0,0,0.05)" : v === 1 ? "rgba(255,255,255,0.04)" : "rgba(20,80,20,0.06)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  // Grass blades - small vertical strokes (deterministic, no random per frame)
  ctx.save();
  ctx.strokeStyle = "rgba(45,140,35,0.28)";
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  for (let x = 6; x < width; x += 13) {
    for (let y = 8; y < height; y += 13) {
      const offX = Math.sin(x * 0.08 + y * 0.03) * 3.5;
      const offY = Math.cos(y * 0.06 + x * 0.04) * 2.5;
      const bx = x + offX;
      const by = y + offY;
      const len = 3.5 + ((Math.sin(x * 0.11) * Math.cos(y * 0.13) + 1) * 2.5); // 3.5-8.5
      const lean = Math.sin(y * 0.09) * 0.8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + lean, by - len);
      ctx.stroke();
    }
  }
  // Lighter highlight blades
  ctx.strokeStyle = "rgba(90,200,70,0.18)";
  ctx.lineWidth = 0.7;
  for (let x = 11; x < width; x += 26) {
    for (let y = 12; y < height; y += 26) {
      const bx = x + Math.sin(y * 0.07) * 2;
      const by = y + Math.cos(x * 0.05) * 2;
      const len = 4 + ((x + y) % 5);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 0.6, by - len);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Keep subtle grid dots for depth
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  for (let x = 20; x < width; x += 40) {
    for (let y = 20; y < height; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

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
      // Randomly water or sand texture per square obstacle (deterministic per obstacle)
      const isWater = ((obs.x * 374761393 + obs.y * 668265261 + obs.w * 127 + obs.h * 31 + idx * 91138233) & 1) === 0;
      if (isWater) {
        // Water texture - blue base
        ctx.fillStyle = "#2A7BD5";
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // inner darker border
        ctx.fillStyle = "rgba(0,40,120,0.18)";
        ctx.fillRect(obs.x, obs.y, obs.w, Math.min(4, obs.h));
        // wave lines - horizontal wavy pattern clipped to rect
        ctx.save();
        ctx.beginPath();
        ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.clip();
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        // horizontal waves
        for (let wy = obs.y + 8; wy < obs.y + obs.h - 4; wy += 10) {
          const amp = 3 + ((obs.x + wy) % 7) * 0.3;
          ctx.beginPath();
          const startX = obs.x + 4;
          const endX = obs.x + obs.w - 4;
          const midX1 = obs.x + obs.w * 0.33;
          const midX2 = obs.x + obs.w * 0.66;
          ctx.moveTo(startX, wy);
          // wavy bezier
          ctx.bezierCurveTo(midX1, wy - amp, midX2, wy + amp, endX, wy);
          ctx.stroke();
        }
        // vertical subtle ripples for larger waters
        if (obs.w > 30 && obs.h > 30) {
          ctx.strokeStyle = "rgba(180,220,255,0.18)";
          ctx.lineWidth = 1;
          for (let wx = obs.x + 8; wx < obs.x + obs.w -4; wx += 14) {
            ctx.beginPath();
            ctx.moveTo(wx, obs.y + 6);
            ctx.bezierCurveTo(wx - 2, obs.y + obs.h * 0.4, wx + 2, obs.y + obs.h * 0.6, wx, obs.y + obs.h - 6);
            ctx.stroke();
          }
        }
        ctx.restore();
        // specular highlight top edge
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(obs.x, obs.y, obs.w, 3);
        // outline
        ctx.strokeStyle = "#143A6B";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        // inner highlight stroke
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(obs.x + 1.5, obs.y + 1.5, obs.w - 3, obs.h - 3);
      } else {
        // Sand texture - more yellow, heavily dotted
        ctx.fillStyle = "#E9C96A"; // warm sandy yellow
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // subtle gradient highlight top
        ctx.fillStyle = "rgba(255,235,160,0.22)";
        ctx.fillRect(obs.x, obs.y, obs.w, Math.min(6, obs.h * 0.35));
        // sand grain - dense dotted pattern deterministic
        ctx.save();
        ctx.beginPath();
        ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.clip();
        // dense grains - step 5 for highly dotted
        for (let sx = obs.x + 2; sx < obs.x + obs.w - 1; sx += 5) {
          for (let sy = obs.y + 2; sy < obs.y + obs.h - 1; sy += 5) {
            const h = (sx * 13 + sy * 17 + idx * 23) % 13;
            if (h < 7) { // ~54% density - very dotted
              if (h < 2) ctx.fillStyle = "rgba(160,120,30,0.32)"; // dark golden grain
              else if (h < 4) ctx.fillStyle = "rgba(210,180,70,0.38)"; // mid yellow grain
              else if (h < 6) ctx.fillStyle = "rgba(255,240,150,0.42)"; // light yellow highlight grain
              else ctx.fillStyle = "rgba(110,80,20,0.22)"; // deep shadow grain
              const r = h % 3 === 0 ? 1.4 : h % 3 === 1 ? 1.0 : 0.7;
              ctx.beginPath();
              // deterministic jitter for natural look
              const jx = ((sx * 7 + sy * 13 + idx * 5) % 5) - 2;
              const jy = ((sy * 11 + sx * 17 + idx * 7) % 5) - 2;
              ctx.arc(sx + jx * 0.6, sy + jy * 0.6, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        // larger pebbles sparsely
        for (let px = obs.x + 6; px < obs.x + obs.w - 6; px += 18) {
          for (let py = obs.y + 6; py < obs.y + obs.h - 6; py += 18) {
            const v = (px * 29 + py * 31 + idx * 37) % 7;
            if (v === 0) {
              ctx.fillStyle = "rgba(140,110,30,0.20)";
              ctx.beginPath();
              ctx.arc(px + ((py * 3) % 3) - 1, py + ((px * 5) % 3) - 1, 2.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "rgba(255,248,180,0.35)";
              ctx.beginPath();
              ctx.arc(px - 1, py - 1, 0.9, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        // subtle wind-blown streaks
        ctx.strokeStyle = "rgba(180,150,50,0.14)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const yline = obs.y + 5 + ((idx * 19 + i * 23) % (obs.h - 10));
          ctx.beginPath();
          ctx.moveTo(obs.x + 3, yline);
          // wavy streak
          ctx.bezierCurveTo(obs.x + obs.w * 0.35, yline - 1, obs.x + obs.w * 0.65, yline + 1, obs.x + obs.w - 3, yline);
          ctx.stroke();
        }
        ctx.restore();
        // outline - deeper sand border
        ctx.strokeStyle = "#B89A3B";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = "rgba(255,240,160,0.28)";
        ctx.lineWidth = 1;
        ctx.strokeRect(obs.x + 1.5, obs.y + 1.5, obs.w - 3, obs.h - 3);
      }
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

export function drawRewardMenu(ctx, width, height, offeredOrTotal, hoveredType = null) {
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

  ctx.restore();
}

export function drawWinOverlay(ctx, width, height) {
  // Canvas overlay not needed; DOM overlay used. Keep for completeness if desired.
}
