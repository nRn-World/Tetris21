import {
  COLS,
  ROWS,
  PIECES,
  SHAPES,
  KICKS_JLSTZ,
  KICKS_I,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  LINE_SCORES,
  TSPIN_SCORES,
  PERFECT_CLEAR_SCORES,
  CLEAR_DELAY,
} from "./config.js";

const TSPIN_LABELS = ["T-SPIN", "T-SPIN SINGLE", "T-SPIN DOUBLE", "T-SPIN TRIPLE"];

function rotateMatrix(matrix, dir) {
  const n = matrix.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!matrix[y][x]) continue;
      if (dir > 0) out[x][n - 1 - y] = matrix[y][x];
      else out[n - 1 - x][y] = matrix[y][x];
    }
  }
  return out;
}

export class TetrisEngine {
  constructor() {
    this.callbacks = {};
    this.reset();
  }

  on(type, fn) {
    this.callbacks[type] = fn;
    return this;
  }

  emit(type, payload) {
    this.callbacks[type]?.(payload);
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.active = null;
    this.holdType = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.b2b = false;
    this.state = "idle";
    this.dropAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.spawnDelay = 0;
    this.rotatedLast = false;

    // Rundstatistik
    this.elapsed = 0;
    this.pieces = 0;
    this.tspins = 0;
    this.tetrises = 0;
    this.maxCombo = 0;
    this.maxClear = 0;
    this.perfectClears = 0;

    this.fillQueue();
  }

  start() {
    this.reset();
    this.state = "playing";
    this.emit("state", this.state);
    this.spawnNext();
    this.emit("stats", this.stats());
  }

  stats() {
    return {
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: Math.max(0, this.combo),
      b2b: this.b2b,
      state: this.state,
      pieces: this.pieces,
      tspins: this.tspins,
      tetrises: this.tetrises,
      maxCombo: this.maxCombo,
      maxClear: this.maxClear,
      perfectClears: this.perfectClears,
      elapsed: this.elapsed,
      pps: this.elapsed > 0.5 ? this.pieces / this.elapsed : 0,
    };
  }

  refillBag() {
    this.bag = [...PIECES];
    // Fisher–Yates
    for (let i = this.bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }

  fillQueue() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) this.refillBag();
      this.queue.push(this.bag.pop());
    }
  }

  spawnNext(typeOverride = null, allowHold = true) {
    this.fillQueue();
    const type = typeOverride ?? this.queue.shift();
    if (typeOverride === null) this.fillQueue();

    const matrix = SHAPES[type].map((row) => [...row]);
    const topRow = matrix.findIndex((row) => row.some(Boolean));
    const x = Math.floor((COLS - matrix.length) / 2);
    const y = -topRow;

    this.active = { type, matrix, x, y, rotation: 0 };
    this.rotatedLast = false;
    this.dropAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.canHold = allowHold;

    if (this.collides(matrix, x, y)) {
      this.active = null;
      this.state = "gameover";
      this.emit("gameover", this.stats());
      this.emit("state", this.state);
      return false;
    }

    this.emit("spawn", {
      type,
      queue: [...this.queue],
      holdType: this.holdType,
      canHold: this.canHold,
    });
    return true;
  }

  collides(matrix, px, py) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix.length; x += 1) {
        if (!matrix[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && this.board[by][bx]) return true;
      }
    }
    return false;
  }

  dropInterval() {
    // Klassisk kurva: snabbare för varje nivå, med golv
    const base = 0.8 - (this.level - 1) * 0.007;
    return Math.max(0.055, Math.pow(base, this.level - 1));
  }

  update(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;

    if (!this.active) {
      if (this.spawnDelay > 0) {
        this.spawnDelay -= dt;
        if (this.spawnDelay <= 0) {
          this.spawnDelay = 0;
          this.spawnNext();
        }
      }
      return;
    }

    const interval = this.dropInterval();
    this.dropAcc += dt;

    const steps = Math.min(24, Math.floor(this.dropAcc / interval));
    if (steps > 0) {
      this.dropAcc -= steps * interval;
      for (let i = 0; i < steps; i += 1) {
        if (!this.moveDown()) break;
      }
    }

    if (!this.canMove(0, 1)) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY) this.lockPiece();
    } else {
      this.lockAcc = 0;
    }
  }

  canMove(dx, dy) {
    if (!this.active) return false;
    return !this.collides(this.active.matrix, this.active.x + dx, this.active.y + dy);
  }

  moveDown() {
    if (!this.active) return false;
    if (this.collides(this.active.matrix, this.active.x, this.active.y + 1)) return false;
    this.active.y += 1;
    this.lockAcc = 0;
    this.lockResets = 0;
    return true;
  }

  move(dir) {
    if (this.state !== "playing" || !this.active) return false;
    if (this.collides(this.active.matrix, this.active.x + dir, this.active.y)) return false;
    this.active.x += dir;
    this.rotatedLast = false;
    this.resetLock();
    return true;
  }

  softDrop() {
    if (this.state !== "playing" || !this.active) return false;
    if (!this.moveDown()) return false;
    this.score += 1;
    return true;
  }

  hardDrop() {
    if (this.state !== "playing" || !this.active) return 0;
    let distance = 0;
    while (!this.collides(this.active.matrix, this.active.x, this.active.y + 1)) {
      this.active.y += 1;
      distance += 1;
    }
    this.score += distance * 2;
    this.lockPiece();
    return distance;
  }

  rotate(dir = 1) {
    if (this.state !== "playing" || !this.active) return false;
    const piece = this.active;
    if (piece.type === "O") return false;

    const nextMatrix = rotateMatrix(piece.matrix, dir);
    const from = piece.rotation;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    const table = piece.type === "I" ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[`${from}>${to}`] || [[0, 0]];

    for (const [dx, dy] of kicks) {
      if (!this.collides(nextMatrix, piece.x + dx, piece.y + dy)) {
        piece.matrix = nextMatrix;
        piece.x += dx;
        piece.y += dy;
        piece.rotation = to;
        this.rotatedLast = true;
        this.resetLock();
        return true;
      }
    }
    return false;
  }

  resetLock() {
    if (!this.active) return;
    if (this.collides(this.active.matrix, this.active.x, this.active.y + 1)) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockAcc = 0;
        this.lockResets += 1;
      }
    }
  }

  hold() {
    if (this.state !== "playing" || !this.active || !this.canHold) return false;
    const current = this.active.type;

    if (this.holdType) {
      const swap = this.holdType;
      this.holdType = current;
      this.rotatedLast = false;
      this.spawnNext(swap, false);
    } else {
      this.holdType = current;
      this.spawnNext(null, false);
    }

    this.emit("hold", { holdType: this.holdType });
    return true;
  }

  isTSpin() {
    if (!this.active || this.active.type !== "T" || !this.rotatedLast) return false;
    const { x, y } = this.active;
    const corners = [
      [x, y],
      [x + 2, y],
      [x, y + 2],
      [x + 2, y + 2],
    ];
    let filled = 0;
    for (const [cx, cy] of corners) {
      if (cx < 0 || cx >= COLS || cy >= ROWS) filled += 1;
      else if (cy >= 0 && this.board[cy][cx]) filled += 1;
    }
    return filled >= 3;
  }

  ghostY() {
    if (!this.active) return 0;
    let y = this.active.y;
    while (!this.collides(this.active.matrix, this.active.x, y + 1)) y += 1;
    return y;
  }

  stackHeight() {
    for (let row = 0; row < ROWS; row += 1) {
      if (this.board[row].some(Boolean)) return ROWS - row;
    }
    return 0;
  }

  lockPiece() {
    if (!this.active) return;
    const piece = this.active;
    const tspin = this.isTSpin();

    let lockedOut = true;
    const cells = [];
    for (let y = 0; y < piece.matrix.length; y += 1) {
      for (let x = 0; x < piece.matrix.length; x += 1) {
        if (!piece.matrix[y][x]) continue;
        const by = piece.y + y;
        const bx = piece.x + x;
        if (by < 0) continue;
        this.board[by][bx] = piece.type;
        cells.push({ x: bx, y: by });
        lockedOut = false;
      }
    }

    const fullRows = [];
    for (let r = 0; r < ROWS; r += 1) {
      if (this.board[r].every(Boolean)) fullRows.push(r);
    }

    const count = fullRows.length;
    const rowColors = fullRows.map((r) => [...this.board[r]]);
    this.combo = count > 0 ? this.combo + 1 : -1;

    this.pieces += 1;
    if (tspin) this.tspins += 1;
    if (count === 4) this.tetrises += 1;
    if (count > 0) {
      this.maxClear = Math.max(this.maxClear, count);
      if (this.combo > 0) this.maxCombo = Math.max(this.maxCombo, this.combo);
    }

    let points = 0;
    let label = null;
    let b2bBonus = false;

    if (count > 0) {
      const base = tspin
        ? TSPIN_SCORES[Math.min(count, 3)]
        : LINE_SCORES[Math.min(count, 4)];
      const difficult = count === 4 || tspin;
      b2bBonus = difficult && this.b2b;
      points = Math.round(base * this.level * (b2bBonus ? 1.5 : 1));
      if (this.combo > 0) points += 50 * this.combo * this.level;

      this.score += points;
      this.lines += count;
      this.b2b = difficult;

      if (tspin) label = TSPIN_LABELS[Math.min(count, 3)];
      else if (count === 4) label = "TETRIS";
      else if (count === 3) label = "TRIPLE";
    } else if (tspin) {
      // T-spin utan rad — ges poäng och egen banner
      points = TSPIN_SCORES[0] * this.level;
      this.score += points;
      this.lines += count;
      label = TSPIN_LABELS[0];
    }

    if (count > 0) {
      this.board = this.board.filter((_, i) => !fullRows.includes(i));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
    }

    const perfect = count > 0 && this.board.every((row) => row.every((cell) => !cell));
    let perfectBonus = 0;
    if (perfect) {
      perfectBonus = PERFECT_CLEAR_SCORES[Math.min(count, 4)] * this.level;
      this.score += perfectBonus;
      this.perfectClears += 1;
    }

    this.active = null;
    this.rotatedLast = false;
    this.emit("lock", { type: piece.type, tspin, cells });

    if (count > 0) {
      this.emit("clear", {
        rows: fullRows,
        rowColors,
        count,
        points,
        perfect,
        perfectBonus,
        label,
        tspin,
        b2b: b2bBonus,
        combo: this.combo,
      });
      this.spawnDelay = CLEAR_DELAY;
    } else {
      if (tspin) {
        this.emit("tspin", { points, label: TSPIN_LABELS[0] });
      }
      this.spawnDelay = 0;
    }

    const nextLevel = Math.min(20, Math.floor(this.lines / 10) + 1);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.emit("levelup", { level: this.level });
    }

    this.emit("stats", this.stats());

    if (lockedOut) {
      this.state = "gameover";
      this.emit("gameover", this.stats());
      this.emit("state", this.state);
      return;
    }

    if (count === 0) this.spawnNext();
  }

  pause() {
    if (this.state !== "playing") return false;
    this.state = "paused";
    this.emit("state", this.state);
    return true;
  }

  resume() {
    if (this.state !== "paused") return false;
    this.state = "playing";
    this.emit("state", this.state);
    return true;
  }
}
