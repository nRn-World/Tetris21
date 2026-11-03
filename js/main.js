import { TetrisEngine } from "./engine.js";
import { Renderer } from "./renderer.js";
import { Sound } from "./audio.js";
import { ROWS, DAS, ARR, SOFT_DROP_INTERVAL, DANGER_ROWS } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const app = $("#app");
const boardCanvas = $("#board");
const holdCanvas = $("#holdCanvas");
const nextCanvases = $$(".next-canvas");
const boardFrame = $(".board-frame");

const startScreen = $("#startScreen");
const pauseScreen = $("#pauseScreen");
const overScreen = $("#overScreen");

const startBtn = $("#startBtn");
const resumeBtn = $("#resumeBtn");
const againBtn = $("#againBtn");
const pauseBtn = $("#pauseBtn");
const pauseTopBtn = $("#pauseTopBtn");
const restartBtn = $("#restartBtn");
const soundBtn = $("#soundBtn");

const finalScore = $("[data-final-score]");
const finalLines = $("[data-final-lines]");
const finalLevel = $("[data-final-level]");
const finalTime = $("[data-final-time]");
const finalPps = $("[data-final-pps]");
const finalTspins = $("[data-final-tspins]");
const bestLine = $("#bestLine");

const scoreNodes = $$("[data-score]");
const bestNodes = $$("[data-best]");
const levelNodes = $$("[data-level]");
const linesNodes = $$("[data-lines]");
const pieceNodes = $$("[data-pieces]");
const tspinNodes = $$("[data-tspins]");
const maxComboNodes = $$("[data-max-combo]");
const ppsNodes = $$("[data-pps]");
const timeNodes = $$("[data-time]");
const scorePanel = $(".score");

const formatter = new Intl.NumberFormat("sv-SE");
const format = (value) => formatter.format(value);

let best = 0;
try {
  best = Number.parseInt(localStorage.getItem("tetris2d.best") || "0", 10) || 0;
} catch {
  best = 0;
}

const engine = new TetrisEngine();
const renderer = new Renderer({
  boardCanvas,
  holdCanvas,
  nextCanvases,
});
const sound = new Sound();

const held = { left: false, right: false, down: false };
let dasDir = 0;
let dasTimer = 0;
let arrTimer = 0;
let softTimer = 0;

let dangerActive = false;
let dangerTimer = 1200;

const hudCache = {
  score: null,
  best: null,
  level: null,
  lines: null,
  pieces: null,
  tspins: null,
  maxCombo: null,
  pps: null,
  time: null,
};

function setText(nodes, value) {
  for (const node of nodes) {
    if (node.textContent !== value) node.textContent = value;
  }
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatPps(value) {
  return `${value.toFixed(1).replace(".", ",")} /s`;
}

function renderHud(force = false) {
  if (force || hudCache.score !== engine.score) {
    setText(scoreNodes, format(engine.score));
    hudCache.score = engine.score;
  }

  const shownBest = Math.max(best, engine.score);
  if (force || hudCache.best !== shownBest) {
    setText(bestNodes, format(shownBest));
    hudCache.best = shownBest;
  }

  if (force || hudCache.level !== engine.level) {
    setText(levelNodes, String(engine.level));
    hudCache.level = engine.level;
  }

  if (force || hudCache.lines !== engine.lines) {
    setText(linesNodes, String(engine.lines));
    hudCache.lines = engine.lines;
  }

  if (force || hudCache.pieces !== engine.pieces) {
    setText(pieceNodes, format(engine.pieces));
    hudCache.pieces = engine.pieces;
  }

  if (force || hudCache.tspins !== engine.tspins) {
    setText(tspinNodes, String(engine.tspins));
    hudCache.tspins = engine.tspins;
  }

  if (force || hudCache.maxCombo !== engine.maxCombo) {
    const label = engine.maxCombo > 0 ? `×${engine.maxCombo + 1}` : "—";
    setText(maxComboNodes, label);
    hudCache.maxCombo = engine.maxCombo;
  }

  const pps = engine.elapsed > 0.5 ? engine.pieces / engine.elapsed : 0;
  const ppsLabel = formatPps(pps);
  if (force || hudCache.pps !== ppsLabel) {
    setText(ppsNodes, ppsLabel);
    hudCache.pps = ppsLabel;
  }

  const timeLabel = formatTime(engine.elapsed);
  if (force || hudCache.time !== timeLabel) {
    setText(timeNodes, timeLabel);
    hudCache.time = timeLabel;
  }
}

function bumpScore() {
  if (!scorePanel) return;
  scorePanel.classList.remove("is-bumping");
  void scorePanel.offsetWidth;
  scorePanel.classList.add("is-bumping");
}

function persistBest(value) {
  best = value;
  try {
    localStorage.setItem("tetris2d.best", String(value));
  } catch {
    /* localStorage kan vara otillgängligt */
  }
}

function renderSoundButton() {
  soundBtn.classList.toggle("is-muted", sound.muted);
  soundBtn.setAttribute("aria-pressed", String(!sound.muted));
  soundBtn.setAttribute("aria-label", sound.muted ? "Sätt på ljud" : "Stäng av ljud");
}

function updateDanger() {
  const danger = engine.state === "playing" && engine.stackHeight() >= ROWS - DANGER_ROWS + 1;

  if (danger !== dangerActive) {
    dangerActive = danger;
    if (boardFrame) boardFrame.dataset.danger = danger ? "1" : "";
    if (!danger) dangerTimer = 1200;
  }

  if (danger) {
    dangerTimer += LAST_DT_MS;
    if (dangerTimer >= 1500) {
      dangerTimer = 0;
      sound.danger();
    }
  }
}

function syncState() {
  app.dataset.state = engine.state;

  startScreen.hidden = engine.state !== "idle";
  pauseScreen.hidden = engine.state !== "paused";
  overScreen.hidden = engine.state !== "gameover";

  const paused = engine.state === "paused";
  const canPause = engine.state === "playing" || paused;

  pauseBtn.disabled = !canPause;
  pauseBtn.setAttribute("aria-pressed", String(paused));
  pauseBtn.querySelector("span").textContent = paused ? "Fortsätt" : "Pausa";
  pauseBtn.querySelector("svg").innerHTML = paused
    ? '<path d="M8 5v14l11-7Z" />'
    : '<rect x="7" y="5" width="3.6" height="14" rx="1.2" /><rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />';

  pauseTopBtn.disabled = !canPause;
  pauseTopBtn.setAttribute("aria-pressed", String(paused));
  pauseTopBtn.setAttribute("aria-label", paused ? "Fortsätt spelet" : "Pausa spelet");
  pauseTopBtn.title = paused ? "Fortsätt" : "Pausa";
  pauseTopBtn.querySelector("svg").innerHTML = paused
    ? '<path d="M8 5v14l11-7Z" />'
    : '<rect x="7" y="5" width="3.6" height="14" rx="1.2" /><rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />';

  if (engine.state === "gameover") {
    finalScore.textContent = format(engine.score);
    finalLines.textContent = String(engine.lines);
    finalLevel.textContent = String(engine.level);
    finalTime.textContent = formatTime(engine.elapsed);
    finalPps.textContent = formatPps(engine.elapsed > 0.5 ? engine.pieces / engine.elapsed : 0);
    finalTspins.textContent = String(engine.tspins);
  }

  if (engine.state !== "playing" && dangerActive) {
    dangerActive = false;
    if (boardFrame) boardFrame.dataset.danger = "";
  }

  renderHud(true);
}

function resetInput() {
  held.left = false;
  held.right = false;
  held.down = false;
  dasDir = 0;
  dasTimer = 0;
  arrTimer = 0;
  softTimer = 0;
}

function startGame() {
  sound.ensure();
  resetInput();
  renderer.reset();
  engine.start();
  sound.start();
  dangerActive = false;
  dangerTimer = 1200;
  if (boardFrame) boardFrame.dataset.danger = "";
  app.dataset.combo = "0";
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function togglePause() {
  if (engine.state === "playing") {
    engine.pause();
    resetInput();
  } else if (engine.state === "paused") {
    engine.resume();
  }
}

function tryMove(dir) {
  if (engine.state !== "playing") return false;
  if (!engine.move(dir)) return false;
  sound.move();
  return true;
}

function tryRotate(dir) {
  if (engine.state !== "playing") return false;
  if (!engine.rotate(dir)) return false;
  sound.rotate();
  return true;
}

function tryHardDrop() {
  if (engine.state !== "playing" || !engine.active) return;
  const snapshot = {
    matrix: engine.active.matrix.map((row) => [...row]),
    x: engine.active.x,
    y: engine.active.y,
    type: engine.active.type,
  };
  const distance = engine.hardDrop();
  sound.hardDrop(distance);
  renderer.shake(2 + Math.min(3, distance * 0.16));
  renderer.dropTrail(snapshot, distance);
}

function tryHold() {
  if (engine.state !== "playing") return;
  if (engine.hold()) sound.hold();
}

engine.on("state", syncState);

engine.on("stats", () => {
  renderHud();
  const comboLevel = Math.min(4, Math.max(0, engine.combo));
  const key = String(comboLevel);
  if (app.dataset.combo !== key) app.dataset.combo = key;
});

engine.on("clear", (data) => {
  renderer.burst(data.rows, data.rowColors);
  renderer.flashRows(data.rows);
  renderer.shake(data.count >= 4 ? 8 : data.count >= 3 ? 5 : 2.5);
  bumpScore();

  const subs = [];
  if (data.b2b) subs.push("BACK-TO-BACK ×1.5");
  if (data.combo > 0) subs.push(`COMBO ×${data.combo + 1}`);

  if (data.perfect) {
    renderer.perfectWave();
    sound.perfect();
    const detail = subs.join(" · ") || `+${format(data.points + data.perfectBonus)}`;
    renderer.banner("PERFECT CLEAR", detail, "#ffe66d");
  } else {
    sound.clear(data.count, data.combo, data.b2b);
    if (data.label) {
      renderer.banner(
        data.label,
        subs.join(" · ") || `+${format(data.points)}`,
        data.tspin ? "#b98cff" : data.count >= 4 ? "#d9ff46" : "#5eead4"
      );
    } else if (data.combo > 0) {
      renderer.banner(`COMBO ×${data.combo + 1}`, `+${format(data.points)}`, "#5eead4");
    }
  }
});

engine.on("tspin", ({ points, label }) => {
  renderer.banner(label, `+${format(points)}`, "#b98cff");
  sound.tspin();
});

engine.on("levelup", ({ level }) => {
  sound.levelUp();
  window.setTimeout(() => {
    if (engine.state === "playing") {
      renderer.banner(`NIVÅ ${level}`, "TEMPOT ÖKAR", "#5eead4");
    }
  }, 650);
});

engine.on("lock", ({ cells }) => {
  sound.lock();
  if (cells && cells.length) renderer.lockFlash(cells);
});

engine.on("gameover", () => {
  const isNewBest = engine.score > best;
  if (isNewBest) persistBest(engine.score);
  bestLine.textContent = isNewBest
    ? `Nytt personbästa: ${format(best)}`
    : `Rekord: ${format(best)}`;
  sound.gameOver();
  renderer.shake(9);
  if (isNewBest) {
    window.setTimeout(() => sound.best(), 550);
  }
  renderHud(true);
});

let LAST_DT_MS = 16.7;

function handleHeldInput(dtMs) {
  const dir = held.left && !held.right ? -1 : held.right && !held.left ? 1 : 0;

  if (dir !== dasDir) {
    dasDir = dir;
    dasTimer = 0;
    arrTimer = 0;
    if (dir !== 0) tryMove(dir);
  } else if (dir !== 0) {
    dasTimer += dtMs;
    if (dasTimer >= DAS) {
      arrTimer += dtMs;
      while (arrTimer >= ARR) {
        arrTimer -= ARR;
        if (!tryMove(dir)) break;
      }
    }
  }

  if (held.down) {
    softTimer += dtMs;
    while (softTimer >= SOFT_DROP_INTERVAL) {
      softTimer -= SOFT_DROP_INTERVAL;
      if (!engine.softDrop()) break;
    }
  } else {
    softTimer = 0;
  }
}

/* ---------- tangentbord ---------- */

window.addEventListener("keydown", (event) => {
  const key = event.key;
  const gameKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];

  if (gameKeys.includes(key)) event.preventDefault();

  if (key === "Enter") {
    const activeEl = document.activeElement;
    const focusedButton =
      activeEl instanceof HTMLElement &&
      activeEl.tagName === "BUTTON" &&
      !activeEl.closest("[hidden]");
    if (focusedButton) return;

    if (engine.state === "idle" || engine.state === "gameover") {
      event.preventDefault();
      startGame();
    } else if (engine.state === "paused") {
      event.preventDefault();
      engine.resume();
    }
    return;
  }

  if (key === "p" || key === "P" || key === "Escape") {
    if (event.repeat) return;
    if (engine.state === "playing" || engine.state === "paused") {
      event.preventDefault();
      togglePause();
    }
    return;
  }

  if (key === "r" || key === "R") {
    if (event.repeat) return;
    if (engine.state !== "idle") {
      event.preventDefault();
      startGame();
    }
    return;
  }

  if (engine.state !== "playing") return;

  switch (key) {
    case "ArrowLeft":
    case "a":
    case "A":
      held.left = true;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      held.right = true;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      if (!event.repeat) {
        held.down = true;
        softTimer = 0;
        engine.softDrop();
      }
      break;
    case "ArrowUp":
    case "x":
    case "X":
      if (!event.repeat) tryRotate(1);
      break;
    case "z":
    case "Z":
      if (!event.repeat) tryRotate(-1);
      break;
    case " ":
      if (!event.repeat) tryHardDrop();
      break;
    case "c":
    case "C":
    case "Shift":
      if (!event.repeat) tryHold();
      break;
    default:
      break;
  }
});

window.addEventListener("keyup", (event) => {
  switch (event.key) {
    case "ArrowLeft":
    case "a":
    case "A":
      held.left = false;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      held.right = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      held.down = false;
      break;
    default:
      break;
  }
});

window.addEventListener("blur", resetInput);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && engine.state === "playing") {
    engine.pause();
    resetInput();
  }
});

/* ---------- knappar ---------- */

startBtn.addEventListener("click", startGame);
againBtn.addEventListener("click", startGame);
resumeBtn.addEventListener("click", () => engine.resume());
pauseBtn.addEventListener("click", togglePause);
pauseTopBtn.addEventListener("click", togglePause);
restartBtn.addEventListener("click", startGame);
soundBtn.addEventListener("click", () => {
  sound.toggle();
  renderSoundButton();
});

/* ---------- touch ---------- */

const touchpad = $(".touchpad");

for (const button of $$(".touch-btn")) {
  const action = button.dataset.touch;
  const isDirection = action === "left" || action === "right" || action === "down";

  const press = (event) => {
    event.preventDefault();
    if (engine.state !== "playing") return;
    sound.ensure();

    if (isDirection) {
      held[action] = true;
      if (action === "down") {
        softTimer = 0;
        engine.softDrop();
      }
      return;
    }

    if (action === "rotate") tryRotate(1);
    else if (action === "drop") tryHardDrop();
    else if (action === "hold") tryHold();
  };

  const release = () => {
    if (isDirection) held[action] = false;
  };

  button.addEventListener("pointerdown", (event) => {
    button.setPointerCapture?.(event.pointerId);
    press(event);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

if (touchpad) {
  touchpad.addEventListener("contextmenu", (event) => event.preventDefault());
}

/* ---------- spelloop ---------- */

renderSoundButton();
renderHud(true);
syncState();

let lastTime = performance.now();

function frame(now) {
  const dtMs = Math.min(now - lastTime, 100);
  lastTime = now;
  const dt = dtMs / 1000;
  LAST_DT_MS = dtMs;

  if (engine.state === "playing") {
    handleHeldInput(dtMs);
    engine.update(dt);
    updateDanger();
  }

  renderer.draw(engine, dt);
  renderHud();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
