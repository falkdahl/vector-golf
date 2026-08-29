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

export function drawArrows(ctx, fieldOrGetWindAt, cols, rows, cellW, cellH) {
  if (!showWind) return;
  ctx.save();
  ctx.lineCap = "round";
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
  freeShots: { icon: '★', label: 'Free Shots', color: '#2ecc71', border: 'rgba(46,204,113,0.9)', fill: 'rgba(46,204,113,0.28)', fillHover: 'rgba(46,204,113,0.38)', hint: '+3 free shots' }
};

export function getRewardButtonsLayout(width, height, offered = null) {
  // REQ-021: 3 random of 4 pool; if offered null, fallback to default 3 (amplify/nullify/flip) for backward compat
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
    ctx.font = "700 13px system-ui, sans-serif";
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
