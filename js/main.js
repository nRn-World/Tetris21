import { TetrisEngine } from "./engine.js";
import { Renderer } from "./renderer.js";
import { Sound } from "./audio.js";
import { COLS, ROWS, DAS, ARR, SOFT_DROP_INTERVAL, DANGER_ROWS } from "./config.js";

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
const infoBtn = $("#infoBtn");
const startInfoBtn = $("#startInfoBtn");
const infoModal = $("#infoModal");
const infoCloseBtn = $("#infoCloseBtn");
const infoCloseTopBtn = $("#infoCloseTopBtn");
const holdPanel = $(".panel--hold");
const stage = $(".stage");
const arena = $(".arena");
const arenaHead = $(".arena-head");

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
let infoOpen = false;
let pausedByInfo = false;

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
  if (engine.state !== "playing") cancelGesture();

  startScreen.hidden = engine.state !== "idle";
  pauseScreen.hidden = engine.state !== "paused" || infoOpen;
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
  cancelGesture();
}

function openInfo() {
  if (infoOpen) return;
  infoOpen = true;
  if (engine.state === "playing") {
    pausedByInfo = true;
    engine.pause();
    resetInput();
  } else {
    pausedByInfo = false;
  }
  if (infoModal) infoModal.hidden = false;
  if (pauseScreen) pauseScreen.hidden = true;
  infoBtn?.setAttribute("aria-expanded", "true");
}

function closeInfo() {
  if (!infoOpen) return;
  infoOpen = false;
  if (infoModal) infoModal.hidden = true;
  infoBtn?.setAttribute("aria-expanded", "false");
  if (pausedByInfo && engine.state === "paused") {
    pausedByInfo = false;
    engine.resume();
  } else {
    pausedByInfo = false;
    syncState();
  }
}

function toggleInfo() {
  if (infoOpen) closeInfo();
  else openInfo();
}

function startGame() {
  if (infoOpen) {
    infoOpen = false;
    pausedByInfo = false;
    if (infoModal) infoModal.hidden = true;
    infoBtn?.setAttribute("aria-expanded", "false");
  }
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
  scheduleFit();
}

function togglePause() {
  if (infoOpen) {
    closeInfo();
    return;
  }
  if (engine.state === "playing") {
    engine.pause();
    resetInput();
  } else if (engine.state === "paused") {
    engine.resume();
  }
}

/* ---------- mobil: spelplan som passar synlig skärmhöjd ---------- */

const mobileMedia = window.matchMedia("(max-width: 900px)");

function fitMobileBoard() {
  if (!mobileMedia.matches) {
    app.style.removeProperty("--app-h");
    app.style.removeProperty("--board-h");
    return;
  }
  if (!stage || !arena || !arenaHead || !boardFrame) return;

  const vh = window.visualViewport?.height || window.innerHeight;
  if (vh > 0) {
    app.style.setProperty("--app-h", `${Math.round(vh)}px`);
  }

  // Nollställ tillfälligt så spelplanen inte låser höjden vid krympande vy.
  app.style.setProperty("--board-h", "150px");

  const arenaRect = arena.getBoundingClientRect();
  const headRect = arenaHead.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const gap = parseFloat(window.getComputedStyle(arena).rowGap) || 0;
  const framePad =
    parseFloat(window.getComputedStyle(boardFrame).getPropertyValue("--frame-pad")) || 9;

  const availableHeight = arenaRect.height - headRect.height - gap - 6;
  const availableWidth = stageRect.width - 2;
  if (availableHeight < 80 || availableWidth < 80) return;

  // Spelplanen är 1:2, så max höjd styrs även av bredden.
  const maxByWidth = (availableWidth - framePad * 2) * 2;
  const height = Math.max(150, Math.min(availableHeight, maxByWidth));
  app.style.setProperty("--board-h", `${Math.round(height)}px`);
}

function scheduleFit() {
  window.requestAnimationFrame(fitMobileBoard);
}

mobileMedia.addEventListener?.("change", scheduleFit);
window.addEventListener("resize", scheduleFit);
window.addEventListener("orientationchange", () => window.setTimeout(scheduleFit, 160));
window.visualViewport?.addEventListener("resize", scheduleFit);

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

  if (infoOpen) {
    if (key === "Escape" || key === "Enter" || key === "i" || key === "I") {
      event.preventDefault();
      closeInfo();
    }
    return;
  }

  if (gameKeys.includes(key)) event.preventDefault();

  if (key === "i" || key === "I") {
    if (!event.repeat) {
      event.preventDefault();
      openInfo();
    }
    return;
  }

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
infoBtn?.addEventListener("click", toggleInfo);
startInfoBtn?.addEventListener("click", openInfo);
infoCloseBtn?.addEventListener("click", closeInfo);
infoCloseTopBtn?.addEventListener("click", closeInfo);
infoModal?.addEventListener("click", (event) => {
  if (event.target === infoModal) closeInfo();
});

if (holdPanel) {
  holdPanel.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (engine.state !== "playing" || infoOpen) return;
    event.preventDefault();
    sound.ensure();
    tryHold();
  });
}

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

/* ---------- svepgester på spelplanen ---------- */

const TAP_MAX_DISTANCE = 22; // px – räknas fortfarande som ett enkelt klick/tryck
const TAP_MAX_MS = 450;
const HARD_DROP_SWIPE = 40; // px nedåt innan pjäsen släpps direkt
const SHORT_DROP_SWIPE = 26; // px för kort, snabbt svep nedåt
const SHORT_DROP_MAX_MS = 260;

let gesturePointer = null;
let gesture = null;

function buzz(pattern) {
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignorera */
  }
}

function boardCellSize() {
  const rect = boardCanvas.getBoundingClientRect();
  return {
    cellW: rect.width > 0 ? rect.width / COLS : 28,
    cellH: rect.height > 0 ? rect.height / ROWS : 28,
  };
}

function cancelGesture() {
  gesturePointer = null;
  gesture = null;
}

function onGestureStart(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (engine.state !== "playing" || infoOpen) return;
  if (gesturePointer !== null) return;
  if (!(event.target instanceof Element)) return;
  if (
    event.target.closest(
      ".info-modal, .screen, .topbar, .touchpad, .panel--hold, .panel--actions, .panel--controls, .footer, button, a"
    )
  ) {
    return;
  }

  sound.ensure();
  const { cellW } = boardCellSize();

  gesturePointer = event.pointerId;
  gesture = {
    startX: event.clientX,
    startY: event.clientY,
    anchorX: event.clientX,
    dropAnchorY: event.clientY,
    startedAt: performance.now(),
    stepW: Math.max(13, cellW * 0.6),
    moved: false,
    movedX: false,
    done: false,
  };

  try {
    app?.setPointerCapture?.(event.pointerId);
  } catch {
    /* ignorera – svepen fungerar även utan pointer capture */
  }
  if (event.pointerType !== "mouse" && event.cancelable) event.preventDefault();
}

function onGestureMove(event) {
  if (!gesture || event.pointerId !== gesturePointer) return;
  if (gesture.done) return;

  const totalDx = event.clientX - gesture.startX;
  const totalDy = event.clientY - gesture.startY;
  if (!gesture.moved && Math.hypot(totalDx, totalDy) > TAP_MAX_DISTANCE) {
    gesture.moved = true;
  }

  const dx = event.clientX - gesture.anchorX;
  const downward = event.clientY - gesture.dropAnchorY;

  // Svep nedåt = hårddrop.
  if (downward >= HARD_DROP_SWIPE && downward > Math.abs(dx) * 0.85) {
    gesture.done = true;
    tryHardDrop();
    buzz(14);
    return;
  }

  // Ignorera små sidoförskjutningar mitt i ett brant lodrätt svep.
  const verticalSwipe = Math.abs(downward) > 16 && Math.abs(downward) > Math.abs(dx) * 1.4;

  // Vågrät svepning: flytta pjäsen ett steg per cellbredd.
  if (!verticalSwipe) {
    const stepsX = Math.trunc(dx / gesture.stepW);
    if (stepsX !== 0) {
      const dir = stepsX > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(stepsX); i += 1) {
        if (!tryMove(dir)) break;
      }
      gesture.anchorX += stepsX * gesture.stepW;
      gesture.dropAnchorY = event.clientY;
      gesture.moved = true;
      gesture.movedX = true;
    }
  }

  if (event.pointerType !== "mouse" && event.cancelable) event.preventDefault();
}

function onGestureEnd(event) {
  if (event.pointerId !== gesturePointer) return;
  const finished = gesture;
  cancelGesture();
  if (!finished || finished.done) return;

  const duration = performance.now() - finished.startedAt;
  const totalDx = event.clientX - finished.startX;
  const totalDy = event.clientY - finished.startY;
  const distance = Math.hypot(totalDx, totalDy);

  // Kort, snabbt svep nedåt = hårddrop.
  if (
    !finished.movedX &&
    totalDy >= SHORT_DROP_SWIPE &&
    totalDy > Math.abs(totalDx) * 1.3 &&
    duration <= SHORT_DROP_MAX_MS
  ) {
    tryHardDrop();
    buzz(14);
    return;
  }

  if (finished.moved || finished.movedX || distance > TAP_MAX_DISTANCE || duration > TAP_MAX_MS) {
    return;
  }

  // Enkelt klick/tryck = rotera pjäsen.
  if (tryRotate(1)) buzz(9);
}

if (app) {
  app.addEventListener("pointerdown", onGestureStart);
  app.addEventListener("pointermove", onGestureMove);
  app.addEventListener("pointerup", onGestureEnd);
  app.addEventListener("pointercancel", cancelGesture);
}
if (arena) {
  arena.addEventListener("contextmenu", (event) => event.preventDefault());
}

/* ---------- spelloop ---------- */

renderSoundButton();
renderHud(true);
syncState();
scheduleFit();
window.setTimeout(scheduleFit, 260);
window.addEventListener("load", scheduleFit);

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
