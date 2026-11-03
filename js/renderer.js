import { COLS, ROWS, SHAPES, COLORS } from "./config.js";

const FONT = '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif';
const rgbCache = new Map();

function rgb(hex) {
  if (rgbCache.has(hex)) return rgbCache.get(hex);
  const value = parseInt(hex.replace("#", ""), 16);
  const out = {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
  rgbCache.set(hex, out);
  return out;
}

function rgba(hex, alphaValue) {
  const { r, g, b } = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alphaValue})`;
}

function mix(hex, target, amount) {
  const a = rgb(hex);
  const b = rgb(target);
  const r = Math.round(a.r + (b.r - a.r) * amount);
  const g = Math.round(a.g + (b.g - a.g) * amount);
  const bl = Math.round(a.b + (b.b - a.b) * amount);
  return `rgb(${r}, ${g}, ${bl})`;
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Renderer {
  constructor({ boardCanvas, holdCanvas, nextCanvases }) {
    this.canvas = boardCanvas;
    this.ctx = boardCanvas.getContext("2d");
    this.holdCanvas = holdCanvas;
    this.nextCanvases = nextCanvases;

    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.cell = 30;
    this.ox = 0;
    this.oy = 0;
    this.time = 0;

    this.particles = [];
    this.flashes = [];
    this.trails = [];
    this.lockFlashes = [];
    this.waves = [];
    this.shakeAmount = 0;
    this.bannerState = null;

    const observer = new ResizeObserver(() => this.resize());
    observer.observe(boardCanvas.parentElement);
    this.resize();

    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = rect.width;
    this.h = rect.height;
    this.dpr = dpr;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  reset() {
    this.particles = [];
    this.flashes = [];
    this.trails = [];
    this.lockFlashes = [];
    this.waves = [];
    this.shakeAmount = 0;
    this.bannerState = null;
  }

  shake(amount = 4) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  burst(rows, rowColors) {
    const cell = this.cell || 30;
    const ox = this.ox || 0;
    const oy = this.oy || 0;

    for (let i = 0; i < rows.length; i += 1) {
      const colors = rowColors[i] || [];
      for (let c = 0; c < COLS; c += 1) {
        const type = colors[c];
        if (!type) continue;
        const color = COLORS[type] || "#ffffff";
        const cx = ox + (c + 0.5) * cell;
        const cy = oy + (rows[i] + 0.5) * cell;

        for (let k = 0; k < 3; k += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 30 + Math.random() * 180;
          const life = 0.4 + Math.random() * 0.5;
          this.particles.push({
            x: cx + (Math.random() - 0.5) * cell * 0.55,
            y: cy + (Math.random() - 0.5) * cell * 0.55,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 100,
            life,
            maxLife: life,
            size: Math.max(1.6, cell * (0.06 + Math.random() * 0.1)),
            color,
            rot: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 9,
          });
        }
      }
    }
  }

  flashRows(rows) {
    for (const row of rows) {
      this.flashes.push({ row, life: 0.36, maxLife: 0.36 });
    }
  }

  // Avtecknat spår efter ett hård drop
  dropTrail(snapshot, distance) {
    if (!distance) return;
    const cell = this.cell || 30;
    const ox = this.ox || 0;
    const oy = this.oy || 0;
    const color = COLORS[snapshot.type] || "#ffffff";
    const { matrix, x, y } = snapshot;

    // Toppar ockuperad rad per kolumn – spåret ritas ovanför den
    const topRow = new Map();
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix.length; c += 1) {
        if (!matrix[r][c]) continue;
        const current = topRow.get(c);
        if (current === undefined || r < current) topRow.set(c, r);
      }
    }

    for (const [c, r] of topRow) {
      const col = x + c;
      const bottomY = y + r; // raden där spåret slutar (där pjäsen nu börjar)
      const topY = bottomY - distance;
      const px = ox + col * cell + cell * 0.3;
      const width = cell * 0.4;
      const pxpy = oy + Math.max(-1, topY) * cell;
      const height = distance * cell;
      if (height <= 0) continue;

      this.trails.push({
        x: px,
        y: pxpy,
        w: width,
        h: height,
        color,
        life: 0.24,
        maxLife: 0.24,
      });
    }
  }

  // Kort vitt blänk över cellerna där en pjäs låser sig
  lockFlash(cells) {
    const cell = this.cell || 30;
    const ox = this.ox || 0;
    const oy = this.oy || 0;
    for (const { x, y } of cells) {
      this.lockFlashes.push({
        x: ox + x * cell,
        y: oy + y * cell,
        life: 0.16,
        maxLife: 0.16,
      });
    }
  }

  // Expanderande gyllene ring + böljande skimra när planen töms helt
  perfectWave() {
    this.waves.push({ life: 0.85, maxLife: 0.85 });
  }

  banner(text, sub = "", color = "#d9ff46") {
    this.bannerState = { text, sub, color, life: 1.2, maxLife: 1.2 };
  }

  updateEffects(dt) {
    this.time += dt;

    for (const flash of this.flashes) flash.life -= dt;
    this.flashes = this.flashes.filter((flash) => flash.life > 0);

    for (const trail of this.trails) trail.life -= dt;
    this.trails = this.trails.filter((trail) => trail.life > 0);

    for (const flash of this.lockFlashes) flash.life -= dt;
    this.lockFlashes = this.lockFlashes.filter((flash) => flash.life > 0);

    for (const wave of this.waves) wave.life -= dt;
    this.waves = this.waves.filter((wave) => wave.life > 0);

    for (const particle of this.particles) {
      particle.life -= dt;
      particle.vy += 880 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rot += particle.spin * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);

    if (this.bannerState) {
      this.bannerState.life -= dt;
      if (this.bannerState.life <= 0) this.bannerState = null;
    }

    if (this.shakeAmount > 0.1) {
      this.shakeAmount *= Math.pow(0.0008, dt);
      if (this.shakeAmount < 0.15) this.shakeAmount = 0;
    }
  }

  draw(engine, dt) {
    const ctx = this.ctx;
    if (!this.w || !this.h) this.resize();
    if (!this.w || !this.h) return;

    this.updateEffects(dt);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    const cell = Math.min(this.w / COLS, this.h / ROWS);
    const ox = (this.w - cell * COLS) / 2;
    const oy = (this.h - cell * ROWS) / 2;
    this.cell = cell;
    this.ox = ox;
    this.oy = oy;

    this.drawField(ctx);
    this.drawGrid(ctx, cell, ox, oy);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeAmount > 0) {
      shakeX = (Math.random() * 2 - 1) * this.shakeAmount;
      shakeY = (Math.random() * 2 - 1) * this.shakeAmount;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawTrails(ctx);
    this.drawLandingColumns(ctx, engine, cell, ox, oy);
    this.drawStack(ctx, engine, cell, ox, oy);
    this.drawGhost(ctx, engine, cell, ox, oy);
    this.drawActive(ctx, engine, cell, ox, oy);
    this.drawLockFlashes(ctx);
    this.drawFlashes(ctx, cell, ox, oy);
    this.drawWaves(ctx, cell, ox, oy);
    this.drawParticles(ctx);

    ctx.restore();

    this.drawBanner(ctx, cell, ox, oy);
    this.drawPreviews(engine);
  }

  drawField(ctx) {
    const { w, h } = this;

    ctx.fillStyle = "#06080f";
    ctx.fillRect(0, 0, w, h);

    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#0b1020");
    base.addColorStop(0.45, "#070a14");
    base.addColorStop(1, "#05070c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.5, h * 0.08, 0, w * 0.5, h * 0.08, h * 0.55);
    glow.addColorStop(0, "rgba(94, 234, 212, 0.09)");
    glow.addColorStop(1, "rgba(94, 234, 212, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const bottom = ctx.createRadialGradient(w * 0.5, h * 1.02, 0, w * 0.5, h * 1.02, h * 0.42);
    bottom.addColorStop(0, "rgba(139, 123, 255, 0.08)");
    bottom.addColorStop(1, "rgba(139, 123, 255, 0)");
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.08, w / 2, h * 0.5, h * 0.72);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.38)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  drawGrid(ctx, cell, ox, oy) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.033)";
    ctx.lineWidth = 1;

    for (let x = 1; x < COLS; x += 1) {
      const px = Math.round(ox + x * cell) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, oy);
      ctx.lineTo(px, oy + ROWS * cell);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y += 1) {
      const py = Math.round(oy + y * cell) + 0.5;
      ctx.beginPath();
      ctx.moveTo(ox, py);
      ctx.lineTo(ox + COLS * cell, py);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
    roundRectPath(ctx, ox + 0.5, oy + 0.5, COLS * cell - 1, ROWS * cell - 1, 10);
    ctx.stroke();
    ctx.restore();
  }

  drawBlock(ctx, x, y, size, color, options = {}) {
    const { ghost = false, glow = false, dim = false } = options;
    const pad = Math.max(1.2, size * 0.055);
    const bx = x + pad;
    const by = y + pad;
    const s = size - pad * 2;
    const radius = Math.max(2.5, s * 0.19);

    if (ghost) {
      ctx.save();
      roundRectPath(ctx, bx, by, s, s, radius);
      ctx.fillStyle = rgba(color, 0.065);
      ctx.fill();
      ctx.strokeStyle = rgba(color, 0.48);
      ctx.lineWidth = Math.max(1.3, size * 0.042);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    if (dim) ctx.globalAlpha = 0.4;

    if (glow) {
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = size * 0.45 + Math.sin(this.time * 4) * 2;
    }

    const gradient = ctx.createLinearGradient(bx, by, bx + s * 0.3, by + s);
    gradient.addColorStop(0, mix(color, "#ffffff", 0.3));
    gradient.addColorStop(0.3, color);
    gradient.addColorStop(0.78, mix(color, "#02030a", 0.12));
    gradient.addColorStop(1, mix(color, "#02030a", 0.36));

    roundRectPath(ctx, bx, by, s, s, radius);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mjuk glans över övre halvan
    ctx.save();
    ctx.clip();
    const gloss = ctx.createLinearGradient(0, by, 0, by + s * 0.55);
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.23)");
    gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(bx, by, s, s * 0.55);

    const shade = ctx.createLinearGradient(0, by + s * 0.66, 0, by + s);
    shade.addColorStop(0, "rgba(0, 0, 0, 0)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0.24)");
    ctx.fillStyle = shade;
    ctx.fillRect(bx, by + s * 0.66, s, s * 0.34);
    ctx.restore();

    roundRectPath(ctx, bx + 0.5, by + 0.5, s - 1, s - 1, Math.max(2, radius - 0.5));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  drawTrails(ctx) {
    for (const trail of this.trails) {
      const progress = Math.max(0, trail.life / trail.maxLife);
      ctx.save();
      const gradient = ctx.createLinearGradient(0, trail.y + trail.h, 0, trail.y);
      gradient.addColorStop(0, rgba(trail.color, 0.3 * progress));
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      roundRectPath(ctx, trail.x, Math.max(0, trail.y), trail.w, trail.y + trail.h - Math.max(0, trail.y), 3);
      ctx.fill();
      ctx.restore();
    }
  }

  drawLockFlashes(ctx) {
    for (const flash of this.lockFlashes) {
      const progress = Math.max(0, flash.life / flash.maxLife);
      ctx.save();
      ctx.globalAlpha = 0.65 * progress;
      ctx.fillStyle = "#ffffff";
      const pad = Math.max(1.2, this.cell * 0.055);
      roundRectPath(ctx, flash.x + pad, flash.y + pad, this.cell - pad * 2, this.cell - pad * 2, 4);
      ctx.fill();
      ctx.restore();
    }
  }

  drawWaves(ctx, cell, ox, oy) {
    for (const wave of this.waves) {
      const progress = Math.max(0, wave.life / wave.maxLife);
      const k = 1 - progress; // 0 → 1
      const expand = k * cell * 2.2;

      // Gyllene skimra över planen
      const glowAlpha = 0.26 * progress;
      const glow = ctx.createLinearGradient(ox, oy, ox, oy + ROWS * cell);
      glow.addColorStop(0, `rgba(217, 255, 70, ${glowAlpha})`);
      glow.addColorStop(0.5, `rgba(255, 234, 130, ${glowAlpha * 0.55})`);
      glow.addColorStop(1, `rgba(94, 234, 212, ${glowAlpha * 0.4})`);
      ctx.fillStyle = glow;
      roundRectPath(ctx, ox, oy, COLS * cell, ROWS * cell, 10);
      ctx.fill();

      // Ring som växer utåt
      ctx.save();
      ctx.strokeStyle = `rgba(217, 255, 70, ${0.5 * progress})`;
      ctx.lineWidth = Math.max(1.5, 5 * progress);
      ctx.shadowColor = "rgba(217, 255, 70, 0.6)";
      ctx.shadowBlur = 18 * progress;
      roundRectPath(
        ctx,
        ox - expand * 0.6,
        oy - expand * 0.35,
        COLS * cell + expand * 1.2,
        ROWS * cell + expand * 0.7,
        12 + expand * 0.4
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  drawLandingColumns(ctx, engine, cell, ox, oy) {
    if (!engine.active) return;
    const columns = new Set();
    const { matrix, x } = engine.active;
    for (let y = 0; y < matrix.length; y += 1) {
      for (let cx = 0; cx < matrix.length; cx += 1) {
        if (matrix[y][cx]) columns.add(x + cx);
      }
    }
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.018)";
    for (const col of columns) {
      ctx.fillRect(ox + col * cell, oy, cell, ROWS * cell);
    }
    ctx.restore();
  }

  drawStack(ctx, engine, cell, ox, oy) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const type = engine.board[row][col];
        if (!type) continue;
        this.drawBlock(ctx, ox + col * cell, oy + row * cell, cell, COLORS[type]);
      }
    }

    // Varningsskimmer när stapeln närmar sig taket
    let highest = ROWS;
    for (let row = 0; row < ROWS; row += 1) {
      if (engine.board[row].some(Boolean)) {
        highest = row;
        break;
      }
    }
    if (highest < 4) {
      const alphaValue = (4 - highest) * 0.035;
      const danger = ctx.createLinearGradient(0, oy, 0, oy + cell * 5);
      danger.addColorStop(0, `rgba(255, 95, 131, ${alphaValue * 2.2})`);
      danger.addColorStop(1, "rgba(255, 95, 131, 0)");
      ctx.fillStyle = danger;
      ctx.fillRect(ox, oy, cell * COLS, cell * 5);
    }
  }

  drawGhost(ctx, engine, cell, ox, oy) {
    if (!engine.active) return;
    const ghostY = engine.ghostY();
    if (ghostY === engine.active.y) return;

    const { matrix, x, type } = engine.active;
    const color = COLORS[type];
    for (let y = 0; y < matrix.length; y += 1) {
      for (let cx = 0; cx < matrix.length; cx += 1) {
        if (!matrix[y][cx]) continue;
        const by = ghostY + y;
        if (by < 0) continue;
        this.drawBlock(ctx, ox + (x + cx) * cell, oy + by * cell, cell, color, { ghost: true });
      }
    }
  }

  drawActive(ctx, engine, cell, ox, oy) {
    if (!engine.active) return;
    const { matrix, x, y, type } = engine.active;
    const color = COLORS[type];
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix.length; col += 1) {
        if (!matrix[row][col]) continue;
        const by = y + row;
        if (by < 0) continue;
        this.drawBlock(ctx, ox + (x + col) * cell, oy + by * cell, cell, color, { glow: true });
      }
    }
  }

  drawFlashes(ctx, cell, ox, oy) {
    for (const flash of this.flashes) {
      const progress = Math.max(0, flash.life / flash.maxLife);
      const y = oy + flash.row * cell;
      const gradient = ctx.createLinearGradient(ox, 0, ox + cell * COLS, 0);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.55 * progress})`);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(ox, y, cell * COLS, cell);

      ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * progress})`;
      ctx.fillRect(ox, y + cell * 0.46, cell * COLS, Math.max(1, cell * 0.055));
    }
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      const alphaValue = Math.max(0, particle.life / particle.maxLife);
      ctx.save();
      ctx.globalAlpha = alphaValue;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rot);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      ctx.restore();
    }
  }

  drawBanner(ctx, cell, ox, oy) {
    const banner = this.bannerState;
    if (!banner) return;

    const elapsed = 1 - banner.life / banner.maxLife;
    const fadeIn = Math.min(1, elapsed * 10);
    const fadeOut = Math.min(1, banner.life / 0.32);
    const alphaValue = Math.min(fadeIn, fadeOut);
    const pop = 1 + Math.max(0, 0.16 - elapsed) * 1.1;
    const centerX = ox + (COLS * cell) / 2;
    const centerY = oy + ROWS * cell * 0.34;
    const mainSize = Math.max(18, cell * 0.92);
    const subSize = Math.max(8, cell * 0.24);

    ctx.save();
    ctx.globalAlpha = alphaValue;
    ctx.translate(centerX, centerY);
    ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `700 ${mainSize}px ${FONT}`;
    const mainWidth = ctx.measureText(banner.text).width;
    ctx.font = `600 ${subSize}px ${FONT}`;
    const subWidth = banner.sub ? ctx.measureText(banner.sub).width : 0;

    const padX = Math.max(16, cell * 0.8);
    const boxW = Math.min(COLS * cell - 20, Math.max(mainWidth, subWidth) + padX * 2);
    const boxH = mainSize + (banner.sub ? subSize + 8 : 0) + 22;
    const top = -boxH / 2;

    roundRectPath(ctx, -boxW / 2, top, boxW, boxH, Math.min(16, cell * 0.55));
    ctx.fillStyle = "rgba(4, 7, 13, 0.66)";
    ctx.fill();
    ctx.strokeStyle = rgba(banner.color, 0.2);
    ctx.lineWidth = 1;
    ctx.stroke();

    const mainCenterY = top + 11 + mainSize / 2;
    ctx.font = `700 ${mainSize}px ${FONT}`;
    ctx.fillStyle = banner.color;
    ctx.shadowColor = rgba(banner.color, 0.55);
    ctx.shadowBlur = 24;
    ctx.fillText(banner.text, 0, mainCenterY);

    if (banner.sub) {
      ctx.shadowBlur = 0;
      ctx.font = `600 ${subSize}px ${FONT}`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
      ctx.fillText(banner.sub, 0, mainCenterY + mainSize / 2 + 6 + subSize / 2);
    }
    ctx.restore();
  }

  drawPreview(canvas, type, dim = false) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!type) return;

    const matrix = SHAPES[type];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix.length; x += 1) {
        if (!matrix[y][x]) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    const pieceW = maxX - minX + 1;
    const pieceH = maxY - minY + 1;
    const size = Math.min((rect.width - 14) / pieceW, (rect.height - 10) / pieceH, 28);
    const startX = (rect.width - pieceW * size) / 2;
    const startY = (rect.height - pieceH * size) / 2;

    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix.length; x += 1) {
        if (!matrix[y][x]) continue;
        this.drawBlock(
          ctx,
          startX + (x - minX) * size,
          startY + (y - minY) * size,
          size,
          COLORS[type],
          { dim }
        );
      }
    }
  }

  drawPreviews(engine) {
    this.drawPreview(this.holdCanvas, engine.holdType, engine.state === "playing" && !engine.canHold);
    for (let i = 0; i < this.nextCanvases.length; i += 1) {
      this.drawPreview(this.nextCanvases[i], engine.queue[i]);
    }
  }
}
