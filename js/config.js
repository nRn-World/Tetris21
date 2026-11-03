// Spelplan och känsla
export const COLS = 10;
export const ROWS = 20;

export const LOCK_DELAY = 0.5; // sekunder innan pjäsen låses
export const MAX_LOCK_RESETS = 15;
export const DAS = 135; // ms innan sidledes autoupprepning
export const ARR = 38; // ms mellan steg vid autoupprepning
export const SOFT_DROP_INTERVAL = 45; // ms
export const CLEAR_DELAY = 0.16; // sekunder innan nästa pjäs spawnar

export const PIECES = ["I", "J", "L", "O", "S", "T", "Z"];

// Dämpade, högkontrastfärger med neonkänsla
export const COLORS = {
  I: "#2fe3ff",
  J: "#3f6bff",
  L: "#ff9838",
  O: "#ffd12e",
  S: "#2eea7d",
  T: "#a678ff",
  Z: "#ff4d73",
};

export const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

// SRS-kickar, konverterade till skärmkoordinater (y växer nedåt).
export const KICKS_JLSTZ = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

export const KICKS_I = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const TSPIN_SCORES = [400, 800, 1200, 1600];

// Bonus för "Perfect Clear" (hela planen töms), index = antal rensade rader
export const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000];

// Hur många rader som måste vara fyllda (från toppen) innan faravarn går igång
export const DANGER_ROWS = 6;
